// ============================================================================
// CARDÁPIO - FRONTEND (Página Pública de Consulta — SOMENTE LEITURA)
// ============================================================================

const HORARIOS_REFEICOES = {
    manha: '09:00',
    almoco: '12:00',
    tarde: '15:00'
};

class CardapioConsulta {
    constructor() {
        this.apiBase = '/api/cardapio';
        this.cardapios = [];
        this.cardapioSemana = [];
        this.periodoSemana = null;
        this.semanaDoMesAtual = true;
        this.dataAtual = new Date();
        this.mesAtual = this.dataAtual.getMonth();
        this.anoAtual = this.dataAtual.getFullYear();

        this.filtroData = null;

        this.calMes = this.dataAtual.getMonth();
        this.calAno = this.dataAtual.getFullYear();
        this.diasComCardapio = new Set();

        this.usuario = JSON.parse(localStorage.getItem('user_data') || '{}');

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

        this.preencherUsuario();
        this.iniciarRelogio();
        this.configurarEventListeners();

        await Promise.all([
            this.carregarSemana(),
            this.carregarMes()
        ]);
    }

    preencherUsuario() {
        const nome = this.usuario.nome || 'Usuário';
        const userEl = document.getElementById('userName');
        const roleEl = document.getElementById('userRole');
        const avatarEl = document.getElementById('userAvatar');
        const headerNome = document.getElementById('headerNomeUsuario');

        if (userEl) userEl.textContent = nome;

        if (roleEl) {
            const roles = {
                'gestao-adm': 'Gestão ADM',
                'admin': 'Administrador',
                'super_admin': 'Super Admin',
                'professor': 'Professor',
                'aluno': 'Aluno',
                'secretaria': 'Secretaria',
                'cozinha': 'Cozinha',
                'recepcao': 'Recepção'
            };
            roleEl.textContent = roles[this.usuario.role] || this.usuario.role || 'Consulta';
        }

        if (headerNome) headerNome.textContent = nome.split(' ')[0];

        if (avatarEl) {
            if (this.usuario.fotoPerfil) {
                avatarEl.innerHTML = `<img src="${this.usuario.fotoPerfil}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
            } else {
                const iniciais = nome.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                avatarEl.innerHTML = `<span>${iniciais}</span>`;
            }
        }
    }

    iniciarRelogio() {
        const tempo = document.getElementById('relogioTempoReal');
        const data = document.getElementById('relogioData');
        const dataAtual = document.getElementById('dataAtual');

        const atualizar = () => {
            const agora = new Date();
            if (tempo) {
                tempo.textContent = `${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}:${String(agora.getSeconds()).padStart(2,'0')}`;
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

    async carregarSemana() {
        try {
            const token = localStorage.getItem('auth_token');
            const url = `${this.apiBase}/semana?mes=${this.mesAtual + 1}&ano=${this.anoAtual}`;
            const resp = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!resp.ok) {
                this.cardapioSemana = [];
                this.periodoSemana = null;
                this.renderizarSemana();
                return;
            }

            const data = await resp.json();
            if (data.success) {
                this.cardapioSemana = data.cardapios || [];
                this.semanaDoMesAtual = data.semanaDoMesAtual === true;
                this.periodoSemana = data.periodo || null;
                this.renderizarSemana();
            } else {
                this.cardapioSemana = [];
                this.periodoSemana = null;
                this.renderizarSemana();
            }
        } catch (err) {
            console.error('❌ Erro ao carregar semana:', err);
            this.cardapioSemana = [];
            this.periodoSemana = null;
            this.renderizarSemana();
        }
    }

    async carregarMes() {
        try {
            const token = localStorage.getItem('auth_token');
            const url = `${this.apiBase}/lista?mes=${this.mesAtual + 1}&ano=${this.anoAtual}`;

            const resp = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!resp.ok) {
                this.cardapios = [];
                this.renderizarMesErro();
                return;
            }

            const data = await resp.json();
            if (data.success) {
                this.cardapios = data.cardapios || [];
                this.renderizarMes();
                this.renderizarSemana();
            } else {
                this.cardapios = [];
                this.renderizarMes();
            }
        } catch (err) {
            console.error('❌ Erro ao carregar mês:', err);
            this.renderizarMesErro();
        }
    }

    getCardapiosFiltrados() {
        if (!this.filtroData) return this.cardapios;
        const alvo = this.dataParaYMD(this.filtroData);
        return this.cardapios.filter(c => this.dataParaYMD(new Date(c.dataReferencia)) === alvo);
    }

    dataParaYMD(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dia}`;
    }

    aplicarFiltroData(data) {
        this.filtroData = data;

        const chip = document.getElementById('filtroAtivo');
        const label = document.getElementById('filtroDataLabel');

        if (data) {
            if (label) label.textContent = data.toLocaleDateString('pt-BR');
            if (chip) chip.style.display = 'block';
        } else {
            if (chip) chip.style.display = 'none';
        }

        this.renderizarSemana();
        this.renderizarMes();
        this.fecharModalCalendario();
    }

    limparFiltroData() {
        this.aplicarFiltroData(null);
        this.showToast('Filtro removido', 'info');
    }

    // ==================== SEMANA + DIA FILTRADO ====================
    renderizarSemana() {
        const semanaSection = document.getElementById('semanaSection');
        const diaSection = document.getElementById('diaSection');

        // Se há filtro de dia → esconde "Esta Semana" e mostra "Cardápio do Dia"
        if (this.filtroData) {
            if (semanaSection) semanaSection.style.display = 'none';
            if (diaSection) diaSection.style.display = 'block';
            this.renderizarDiaFiltrado();
            return;
        }

        // Sem filtro → mostra "Esta Semana"
        if (semanaSection) semanaSection.style.display = 'block';
        if (diaSection) diaSection.style.display = 'none';

        const grid = document.getElementById('semanaGrid');
        const titulo = document.getElementById('tituloSemana');

        if (titulo) {
            if (this.periodoSemana) {
                const ini = new Date(this.periodoSemana.inicio);
                const fim = new Date(this.periodoSemana.fim);
                const iniFmt = ini.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
                const fimFmt = fim.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
                const rotulo = this.semanaDoMesAtual ? 'Esta Semana' : 'Primeira Semana do Mês';
                titulo.innerHTML = `
                    <i class="fas fa-calendar-week"></i>
                    ${rotulo}
                    <span class="section-subtitle">${iniFmt} a ${fimFmt}</span>
                `;
            } else {
                titulo.innerHTML = `<i class="fas fa-calendar-week"></i> Semana`;
            }
        }

        if (!grid) return;

        if (this.cardapioSemana.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <i class="fas fa-utensils" style="font-size: 40px; color: #d1d5db; margin-bottom: 12px; display: block;"></i>
                    <p>Nenhum cardápio cadastrado para esta semana</p>
                    <small>Navegue para outro mês ou aguarde a gestão cadastrar.</small>
                </div>
            `;
            return;
        }

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        grid.innerHTML = this.cardapioSemana.map((c, index) => {
            const dataCardapio = new Date(c.dataReferencia);
            dataCardapio.setHours(0, 0, 0, 0);
            const isHoje = dataCardapio.getTime() === hoje.getTime();
            const diaSemana = dataCardapio.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' });
            const dataFmt = dataCardapio.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

            return `
                <div class="semana-card ${isHoje ? 'hoje' : ''}" data-index="${index}">
                    ${isHoje ? '<span class="hoje-badge">HOJE</span>' : ''}
                    <div class="semana-card-header">
                        <span class="dia-semana">${diaSemana}</span>
                        <span class="data">${dataFmt}</span>
                    </div>
                    <div class="semana-card-body">
                        <div class="refeicao-linha">
                            <i class="fas fa-coffee" style="color:#3b82f6;"></i>
                            <div class="refeicao-info">
                                <span class="refeicao-nome">Manhã · ${HORARIOS_REFEICOES.manha}</span>
                                <span class="refeicao-texto">${this.escapeHtml(c.lancamentoManha)}</span>
                            </div>
                        </div>
                        <div class="refeicao-linha">
                            <i class="fas fa-drumstick-bite" style="color:#10b981;"></i>
                            <div class="refeicao-info">
                                <span class="refeicao-nome">Almoço · ${HORARIOS_REFEICOES.almoco}</span>
                                <span class="refeicao-texto">${this.escapeHtml(c.almoco)}</span>
                            </div>
                        </div>
                        <div class="refeicao-linha">
                            <i class="fas fa-cookie" style="color:#f59e0b;"></i>
                            <div class="refeicao-info">
                                <span class="refeicao-nome">Tarde · ${HORARIOS_REFEICOES.tarde}</span>
                                <span class="refeicao-texto">${this.escapeHtml(c.lancamentoTarde)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="semana-card-footer">
                        <span class="semana-badge">${c.semanaLabel}</span>
                        <i class="fas fa-eye" style="color:#9ca3af;"></i>
                    </div>
                </div>
            `;
        }).join('');

        grid.querySelectorAll('.semana-card[data-index]').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.index, 10);
                this.verDetalhes(this.cardapioSemana[idx]);
            });
        });
    }

    renderizarDiaFiltrado() {
        const grid = document.getElementById('diaGrid');
        const subtitulo = document.getElementById('subtituloDia');
        if (!grid) return;

        const alvo = this.dataParaYMD(this.filtroData);
        const encontrados = this.cardapios.filter(c =>
            this.dataParaYMD(new Date(c.dataReferencia)) === alvo
        );

        if (subtitulo) {
            subtitulo.textContent = this.filtroData.toLocaleDateString('pt-BR', {
                weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
            });
        }

        if (encontrados.length === 0) {
            grid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <i class="fas fa-utensils" style="font-size: 40px; color: #d1d5db; margin-bottom: 12px; display: block;"></i>
                    <p>Nenhum cardápio cadastrado para este dia</p>
                    <small>Remova o filtro ou escolha outro dia no calendário.</small>
                </div>
            `;
            return;
        }

        grid.innerHTML = encontrados.map((c, index) => {
            const dataCardapio = new Date(c.dataReferencia);
            dataCardapio.setHours(0, 0, 0, 0);
            const diaSemana = dataCardapio.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' });
            const dataFmt = dataCardapio.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });

            return `
                <div class="semana-card hoje" data-dia-index="${index}">
                    <span class="hoje-badge">SELECIONADO</span>
                    <div class="semana-card-header">
                        <span class="dia-semana">${diaSemana}</span>
                        <span class="data">${dataFmt}</span>
                    </div>
                    <div class="semana-card-body">
                        <div class="refeicao-linha">
                            <i class="fas fa-coffee" style="color:#3b82f6;"></i>
                            <div class="refeicao-info">
                                <span class="refeicao-nome">Manhã · ${HORARIOS_REFEICOES.manha}</span>
                                <span class="refeicao-texto">${this.escapeHtml(c.lancamentoManha)}</span>
                            </div>
                        </div>
                        <div class="refeicao-linha">
                            <i class="fas fa-drumstick-bite" style="color:#10b981;"></i>
                            <div class="refeicao-info">
                                <span class="refeicao-nome">Almoço · ${HORARIOS_REFEICOES.almoco}</span>
                                <span class="refeicao-texto">${this.escapeHtml(c.almoco)}</span>
                            </div>
                        </div>
                        <div class="refeicao-linha">
                            <i class="fas fa-cookie" style="color:#f59e0b;"></i>
                            <div class="refeicao-info">
                                <span class="refeicao-nome">Tarde · ${HORARIOS_REFEICOES.tarde}</span>
                                <span class="refeicao-texto">${this.escapeHtml(c.lancamentoTarde)}</span>
                            </div>
                        </div>
                    </div>
                    <div class="semana-card-footer">
                        <span class="semana-badge">${c.semanaLabel}</span>
                        <i class="fas fa-eye" style="color:#9ca3af;"></i>
                    </div>
                </div>
            `;
        }).join('');

        grid.querySelectorAll('.semana-card[data-dia-index]').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.diaIndex, 10);
                this.verDetalhes(encontrados[idx]);
            });
        });
    }

    renderizarMes() {
        const lista = document.getElementById('listaMes');
        const badge = document.getElementById('badgeTotalMes');
        if (!lista) return;

        const exibidos = this.getCardapiosFiltrados();

        if (badge) badge.textContent = exibidos.length;

        if (exibidos.length === 0) {
            const msg = this.filtroData
                ? 'Nenhum cardápio cadastrado para este dia'
                : 'Nenhum cardápio cadastrado neste mês';
            lista.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-calendar-alt" style="font-size: 40px; color: #d1d5db; margin-bottom: 12px; display: block;"></i>
                    <p>${msg}</p>
                    <small>${this.filtroData ? 'Remova o filtro para ver o mês completo.' : 'Navegue para outro mês ou aguarde a gestão cadastrar.'}</small>
                </div>
            `;
            return;
        }

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        lista.innerHTML = exibidos.map((c, index) => {
            const dataCardapio = new Date(c.dataReferencia);
            dataCardapio.setHours(0, 0, 0, 0);
            const isHoje = dataCardapio.getTime() === hoje.getTime();
            const dataFmt = dataCardapio.toLocaleDateString('pt-BR', { timeZone: 'UTC' });

            return `
                <div class="cardapio-item ${isHoje ? 'hoje' : ''}" data-mes-index="${index}">
                    <div class="cardapio-item-data">
                        <strong>${dataFmt}</strong>
                        ${isHoje ? '<span class="hoje-badge">HOJE</span>' : ''}
                        <span class="semana-badge">${c.semanaLabel}</span>
                    </div>
                    <div class="cardapio-item-refeicoes">
                        <div>
                            <span class="refeicao-mini-label"><i class="fas fa-coffee" style="color:#3b82f6;"></i> Manhã · ${HORARIOS_REFEICOES.manha}</span>
                            <span class="refeicao-mini-texto">${this.escapeHtml(c.lancamentoManha)}</span>
                        </div>
                        <div>
                            <span class="refeicao-mini-label"><i class="fas fa-drumstick-bite" style="color:#10b981;"></i> Almoço · ${HORARIOS_REFEICOES.almoco}</span>
                            <span class="refeicao-mini-texto">${this.escapeHtml(c.almoco)}</span>
                        </div>
                        <div>
                            <span class="refeicao-mini-label"><i class="fas fa-cookie" style="color:#f59e0b;"></i> Tarde · ${HORARIOS_REFEICOES.tarde}</span>
                            <span class="refeicao-mini-texto">${this.escapeHtml(c.lancamentoTarde)}</span>
                        </div>
                    </div>
                    <div class="cardapio-item-acoes">
                        <button class="btn-icon view" title="Ver detalhes">
                            <i class="fas fa-eye"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        lista.querySelectorAll('.cardapio-item[data-mes-index]').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.mesIndex, 10);
                this.verDetalhes(exibidos[idx]);
            });
        });
    }

    renderizarMesErro() {
        const lista = document.getElementById('listaMes');
        if (lista) {
            lista.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle" style="font-size: 40px; color: #f59e0b; margin-bottom: 12px; display: block;"></i>
                    <p>Erro ao carregar. Tente novamente.</p>
                </div>
            `;
        }
    }

    // ==================== CALENDÁRIO SELETOR ====================
    async abrirModalCalendario() {
        this.calMes = this.mesAtual;
        this.calAno = this.anoAtual;

        await this.carregarDiasComCardapio(this.calMes, this.calAno);
        this.renderizarCalendario();

        const modal = document.getElementById('modalCalendario');
        if (modal) modal.style.display = 'flex';
    }

    fecharModalCalendario() {
        const modal = document.getElementById('modalCalendario');
        if (modal) modal.style.display = 'none';
    }

    async carregarDiasComCardapio(mes, ano) {
        try {
            const token = localStorage.getItem('auth_token');
            const resp = await fetch(
                `${this.apiBase}/lista?mes=${mes + 1}&ano=${ano}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const data = await resp.json();
            this.diasComCardapio = new Set();
            if (data.success && data.cardapios) {
                data.cardapios.forEach(c => {
                    const d = new Date(c.dataReferencia);
                    this.diasComCardapio.add(this.dataParaYMD(d));
                });
            }
        } catch (err) {
            console.error('❌ Erro ao carregar dias com cardápio:', err);
            this.diasComCardapio = new Set();
        }
    }

    renderizarCalendario() {
        const titulo = document.getElementById('calMesAtual');
        const grid = document.getElementById('calendarioGrid');
        if (!titulo || !grid) return;

        const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                       'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        titulo.textContent = `${meses[this.calMes]} ${this.calAno}`;

        const primeiro = new Date(this.calAno, this.calMes, 1);
        const ultimo = new Date(this.calAno, this.calMes + 1, 0);
        let diaInicio = primeiro.getDay();
        if (diaInicio === 0) diaInicio = 7;
        const diasMes = ultimo.getDate();

        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);

        grid.innerHTML = '';

        for (let i = 1; i < diaInicio; i++) {
            const v = document.createElement('div');
            v.className = 'calendario-dia vazio';
            grid.appendChild(v);
        }

        for (let dia = 1; dia <= diasMes; dia++) {
            const data = new Date(this.calAno, this.calMes, dia);
            data.setHours(0, 0, 0, 0);
            const ymd = this.dataParaYMD(data);

            const isHoje = data.getTime() === hoje.getTime();
            const temCardapio = this.diasComCardapio.has(ymd);
            const isSelecionado = this.filtroData &&
                this.dataParaYMD(this.filtroData) === ymd;

            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'calendario-dia';
            if (isHoje) el.classList.add('hoje');
            if (temCardapio) el.classList.add('com-cardapio');
            if (isSelecionado) el.classList.add('selecionado');

            el.innerHTML = `
                <span class="calendario-dia-num">${dia}</span>
                ${temCardapio ? '<span class="calendario-dia-dot"></span>' : ''}
            `;

            el.addEventListener('click', () => {
                const dataSelecionada = new Date(this.calAno, this.calMes, dia);
                if (this.calMes !== this.mesAtual || this.calAno !== this.anoAtual) {
                    this.mesAtual = this.calMes;
                    this.anoAtual = this.calAno;
                    this.atualizarTituloMes();
                    Promise.all([this.carregarSemana(), this.carregarMes()]);
                }
                this.aplicarFiltroData(dataSelecionada);
            });

            grid.appendChild(el);
        }
    }

    async irParaHoje() {
        const agora = new Date();
        this.calMes = agora.getMonth();
        this.calAno = agora.getFullYear();
        await this.carregarDiasComCardapio(this.calMes, this.calAno);
        this.renderizarCalendario();
    }

    // ==================== EVENTOS ====================
    configurarEventListeners() {
        const btnAnt = document.getElementById('btnMesAnterior');
        if (btnAnt) {
            btnAnt.addEventListener('click', () => {
                this.mesAtual--;
                if (this.mesAtual < 0) { this.mesAtual = 11; this.anoAtual--; }
                this.filtroData = null;
                this.atualizarFiltroVisual();
                this.atualizarTituloMes();
                Promise.all([this.carregarSemana(), this.carregarMes()]);
            });
        }

        const btnProx = document.getElementById('btnProximoMes');
        if (btnProx) {
            btnProx.addEventListener('click', () => {
                this.mesAtual++;
                if (this.mesAtual > 11) { this.mesAtual = 0; this.anoAtual++; }
                this.filtroData = null;
                this.atualizarFiltroVisual();
                this.atualizarTituloMes();
                Promise.all([this.carregarSemana(), this.carregarMes()]);
            });
        }

        const btnHoje = document.getElementById('btnIrHoje');
        if (btnHoje) {
            btnHoje.addEventListener('click', () => this.abrirModalCalendario());
        }

        const calAnt = document.getElementById('btnCalMesAnterior');
        if (calAnt) {
            calAnt.addEventListener('click', async () => {
                this.calMes--;
                if (this.calMes < 0) { this.calMes = 11; this.calAno--; }
                await this.carregarDiasComCardapio(this.calMes, this.calAno);
                this.renderizarCalendario();
            });
        }

        const calProx = document.getElementById('btnCalMesProximo');
        if (calProx) {
            calProx.addEventListener('click', async () => {
                this.calMes++;
                if (this.calMes > 11) { this.calMes = 0; this.calAno++; }
                await this.carregarDiasComCardapio(this.calMes, this.calAno);
                this.renderizarCalendario();
            });
        }

        document.addEventListener('click', (e) => {
            const container = document.getElementById('userMenuContainer');
            const dropdown = document.getElementById('userDropdown');
            if (container && dropdown && !container.contains(e.target)) {
                dropdown.classList.remove('active');
            }
        });

        this.atualizarTituloMes();
    }

    atualizarFiltroVisual() {
        const chip = document.getElementById('filtroAtivo');
        const label = document.getElementById('filtroDataLabel');
        if (this.filtroData) {
            if (label) label.textContent = this.filtroData.toLocaleDateString('pt-BR');
            if (chip) chip.style.display = 'block';
        } else {
            if (chip) chip.style.display = 'none';
        }
    }

    atualizarTituloMes() {
        const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                       'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        const titulo = document.getElementById('mesAtual');
        if (titulo) titulo.textContent = `${meses[this.mesAtual]} ${this.anoAtual}`;
    }

    // ==================== MODAL DE DETALHES ====================
    verDetalhes(cardapio) {
        if (!cardapio) return;

        const body = document.getElementById('modalBody');
        const title = document.getElementById('modalTitle');
        const footer = document.getElementById('modalFooter');
        if (!body || !title || !footer) return;

        const dataFmt = new Date(cardapio.dataReferencia).toLocaleDateString('pt-BR', {
            weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC'
        });

        title.innerHTML = `<i class="fas fa-utensils"></i> ${dataFmt}`;

        const info = cardapio.informacoesNutricionais || {};
        const temNutri = Object.values(info).some(v => v && String(v).trim() !== '');

        body.innerHTML = `
            <div class="cardapio-detalhes">
                <div class="detalhe-badge-semana">
                    <span class="semana-badge">${cardapio.semanaLabel}</span>
                </div>

                <div class="detalhe-refeicoes">
                    <div class="detalhe-refeicao manha">
                        <div class="detalhe-refeicao-icon"><i class="fas fa-coffee"></i></div>
                        <div class="detalhe-refeicao-content">
                            <div class="detalhe-refeicao-header">
                                <strong>Lanche da Manhã</strong>
                                <span class="detalhe-refeicao-horario"><i class="fas fa-clock"></i> ${HORARIOS_REFEICOES.manha}</span>
                            </div>
                            <p>${this.escapeHtml(cardapio.lancamentoManha)}</p>
                        </div>
                    </div>
                    <div class="detalhe-refeicao almoco">
                        <div class="detalhe-refeicao-icon"><i class="fas fa-drumstick-bite"></i></div>
                        <div class="detalhe-refeicao-content">
                            <div class="detalhe-refeicao-header">
                                <strong>Almoço</strong>
                                <span class="detalhe-refeicao-horario"><i class="fas fa-clock"></i> ${HORARIOS_REFEICOES.almoco}</span>
                            </div>
                            <p>${this.escapeHtml(cardapio.almoco)}</p>
                        </div>
                    </div>
                    <div class="detalhe-refeicao tarde">
                        <div class="detalhe-refeicao-icon"><i class="fas fa-cookie"></i></div>
                        <div class="detalhe-refeicao-content">
                            <div class="detalhe-refeicao-header">
                                <strong>Lanche da Tarde</strong>
                                <span class="detalhe-refeicao-horario"><i class="fas fa-clock"></i> ${HORARIOS_REFEICOES.tarde}</span>
                            </div>
                            <p>${this.escapeHtml(cardapio.lancamentoTarde)}</p>
                        </div>
                    </div>
                </div>

                ${temNutri ? `
                    <div class="detalhe-nutri">
                        <h5><i class="fas fa-chart-bar"></i> Informações Nutricionais</h5>
                        <div class="nutri-grid">
                            ${info.energia ? `<div class="nutri-item"><span>Energia</span><strong>${this.escapeHtml(info.energia)} kcal</strong></div>` : ''}
                            ${info.ptn ? `<div class="nutri-item"><span>PTN</span><strong>${this.escapeHtml(info.ptn)} g</strong></div>` : ''}
                            ${info.lpd ? `<div class="nutri-item"><span>LPD</span><strong>${this.escapeHtml(info.lpd)} g</strong></div>` : ''}
                            ${info.cho ? `<div class="nutri-item"><span>CHO</span><strong>${this.escapeHtml(info.cho)} g</strong></div>` : ''}
                            ${info.fibra ? `<div class="nutri-item"><span>Fibra</span><strong>${this.escapeHtml(info.fibra)} g</strong></div>` : ''}
                            ${info.ca ? `<div class="nutri-item"><span>Cálcio</span><strong>${this.escapeHtml(info.ca)} mg</strong></div>` : ''}
                            ${info.fe ? `<div class="nutri-item"><span>Ferro</span><strong>${this.escapeHtml(info.fe)} mg</strong></div>` : ''}
                            ${info.na ? `<div class="nutri-item"><span>Sódio</span><strong>${this.escapeHtml(info.na)} mg</strong></div>` : ''}
                        </div>
                    </div>
                ` : ''}

                ${cardapio.criadoPor?.nome ? `
                <div class="detalhe-footer-info">
                    <small><i class="fas fa-user"></i> Cadastrado por: ${this.escapeHtml(cardapio.criadoPor.nome)}</small>
                </div>
                ` : ''}
            </div>
        `;

        footer.innerHTML = `<button class="btn-cancel" onclick="cardapio.fecharModal()">Fechar</button>`;

        this.abrirModal();
    }

    // ==================== UTILITÁRIOS ====================
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    abrirModal() {
        const modal = document.getElementById('modal');
        if (modal) modal.style.display = 'flex';
    }

    fecharModal() {
        const modal = document.getElementById('modal');
        if (modal) modal.style.display = 'none';
    }

    showToast(mensagem, tipo = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const icones = {
            success: 'fa-check-circle',
            error: 'fa-times-circle',
            info: 'fa-info-circle',
            warning: 'fa-exclamation-triangle'
        };
        const toast = document.createElement('div');
        toast.className = `toast ${tipo}`;
        toast.innerHTML = `<i class="fas ${icones[tipo]}"></i><span>${mensagem}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }
}

// ==================== GLOBAIS ====================
function toggleUserMenu(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) dropdown.classList.toggle('active');
}

function logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    window.location.href = 'login.html';
}

const cardapio = new CardapioConsulta();
window.cardapio = cardapio;