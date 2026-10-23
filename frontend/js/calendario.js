// ============================================================================
// CALENDÁRIO ACADÊMICO — FRONTEND (VERSÃO FINAL)
// ============================================================================

class CalendarioAcademico {
    constructor() {
        this.apiBase = '/api/calendario';
        this.eventos = [];
        this.dataAtual = new Date();
        this.mesAtual = this.dataAtual.getMonth();
        this.anoAtual = this.dataAtual.getFullYear();
        this.usuario = JSON.parse(localStorage.getItem('user_data') || '{}');
        this.filtros = { tipo: 'todos', professor: 'todos', turma: 'todas' };
        this.podeCriar = false;
        this.modoLeitura = true;
        this.professores = [];
        this.setoresDisponiveis = []; // 🔥 setores carregados do banco
        this.turmas = [];
        this.eventoEditando = null;

        this.rolesComFiltroTurma = ['admin', 'super_admin', 'professor'];
        this.rolesComFiltroProfessor = ['admin', 'super_admin'];
        this.rolesCriacaoGarantida = ['admin', 'super_admin', 'professor'];

        if (this.rolesCriacaoGarantida.includes(this.usuario.role)) {
            this.podeCriar = true;
            this.modoLeitura = false;
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        await this.verificarPermissaoEdicao();
        this.configurarInterfacePorRole();
        this.configurarBotaoVoltar();
        await this.carregarDadosIniciais();
        this.renderizarCalendario();
        this.configurarEventListeners();
        await this.processarParametrosUrl();
    }

    async processarParametrosUrl() {
        const params = new URLSearchParams(window.location.search);
        const eventoId = params.get('evento');

        if (!eventoId) return;

        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            const resp = await fetch(`${this.apiBase}/eventos/${eventoId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!resp.ok) return;

            const data = await resp.json();
            if (!data.success || !data.evento) return;

            const ev = data.evento;

            const dataEvento = new Date(ev.dataInicio);
            this.mesAtual = dataEvento.getMonth();
            this.anoAtual = dataEvento.getFullYear();

            await this.carregarEventos();
            this.renderizarCalendario();

            const criadoPor = ev.criadoPor || null;
            const idCriador = criadoPor?._id || criadoPor?.id;
            const isCriador = idCriador && idCriador.toString() === (this.usuario.id || this.usuario._id)?.toString();
            const isAdmin = ['admin', 'super_admin'].includes(this.usuario.role);
            const podeEditar = isCriador || isAdmin;

            const eventoParaModal = {
                id: ev.id,
                title: ev.titulo,
                start: ev.dataInicio,
                end: ev.dataFim || ev.dataInicio,
                allDay: ev.diaInteiro,
                tipo: ev.tipo,
                cor: ev.cor,
                descricao: ev.descricao,
                local: ev.local,
                horarioInicio: ev.horarioInicio,
                horarioFim: ev.horarioFim,
                turma: ev.turma
                    ? { id: ev.turma._id || ev.turma.id, nome: ev.turma.nome }
                    : null,
                prova: ev.prova
                    ? { id: ev.prova._id || ev.prova.id, titulo: ev.prova.titulo }
                    : null,
                criadoPor: criadoPor ? {
                    id: idCriador,
                    nome: criadoPor.nome,
                    email: criadoPor.email,
                    role: criadoPor.role
                } : null,
                notificacaoAtivada: ev.notificacaoAtivada,
                notificacoes: ev.notificacoes,
                permissoes: { podeEditar, podeExcluir: podeEditar }
            };

            const editavel = params.get('editavel') === 'true';

            if (editavel && podeEditar && this.podeCriar) {
                this.abrirCriadorEvento(null, eventoParaModal);
            } else {
                this.mostrarDetalhesEvento(eventoParaModal);
            }

            window.history.replaceState({}, '', window.location.pathname);

        } catch (error) {
            console.error('❌ Erro ao processar ?evento=:', error);
        }
    }

    async verificarPermissaoEdicao() {
        try {
            const token = localStorage.getItem('auth_token');
            const resp = await fetch(
                `/api/admin/permissoes-modulos/verificar/calendario_setor_pedagogico?email=${encodeURIComponent(this.usuario.email || '')}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const data = await resp.json();

            if (data.success && data.temPermissao) {
                this.podeCriar = true;
                this.modoLeitura = false;
            } else if (!this.rolesCriacaoGarantida.includes(this.usuario.role)) {
                this.podeCriar = false;
                this.modoLeitura = true;
            }
        } catch (error) {
            console.error('❌ Erro ao verificar permissão:', error);
        }
    }

    configurarInterfacePorRole() {
        const btnCriar = document.getElementById('btnCriarEvento');
        const filtroProfessorGroup = document.getElementById('filtroProfessorGroup')
            || document.getElementById('filtroProfessor')?.parentElement;
        const filtroTurmaGroup = document.getElementById('filtroTurmaGroup')
            || document.getElementById('filtroTurma')?.parentElement;

        if (filtroTurmaGroup) {
            filtroTurmaGroup.style.display =
                this.rolesComFiltroTurma.includes(this.usuario.role) ? '' : 'none';
        }

        if (filtroProfessorGroup) {
            filtroProfessorGroup.style.display =
                this.rolesComFiltroProfessor.includes(this.usuario.role) ? '' : 'none';
        }

        if (btnCriar) {
            btnCriar.style.display = this.podeCriar ? 'flex' : 'none';
        }

        if (this.modoLeitura) {
            const header = document.querySelector('.calendario-header');
            if (header && !header.querySelector('.badge-leitura')) {
                const badge = document.createElement('div');
                badge.className = 'badge-leitura';
                badge.style.cssText = 'position:absolute;top:10px;right:10px;background:rgba(0,0,0,.5);color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;';
                badge.innerHTML = '<i class="fas fa-eye"></i> Modo Leitura';
                header.style.position = 'relative';
                header.appendChild(badge);
            }
        }
    }

    configurarBotaoVoltar() {
        const btn = document.getElementById('btnVoltarCalendario');
        const txt = document.getElementById('textoBotaoVoltar');
        if (!btn) return;

        const novo = btn.cloneNode(true);
        btn.parentNode.replaceChild(novo, btn);

        const mapa = {
            admin: ['admin.html', 'Voltar ao Painel Admin'],
            super_admin: ['admin.html', 'Voltar ao Painel Admin'],
            professor: ['index.html', 'Voltar ao Painel Professor'],
            aluno: ['aluno.html', 'Voltar ao Painel do Aluno'],
            setor_pedagogico: ['setor-pedagogico.html', 'Voltar ao Setor Pedagógico'],
            gestao_geral: ['gestao-geral.html', 'Voltar à Gestão Geral'],
            supervisao: ['supervisao.html', 'Voltar à Supervisão'],
            coordenacao_patio: ['coordenacao-patio.html', 'Voltar'],
            cozinha: ['cozinha-dashboard.html', 'Voltar'],
            enfermaria: ['enfermaria.html', 'Voltar'],
            biblioteca: ['biblioteca.html', 'Voltar'],
            psicologia: ['psicologia.html', 'Voltar'],
            'assistente-social': ['assistente-social.html', 'Voltar'],
            protagonismo: ['protagonismo.html', 'Voltar'],
            secretaria: ['secretaria.html', 'Voltar'],
            recepcao: ['recepcao.html', 'Voltar']
        };
        const config = mapa[this.usuario.role] || ['admin.html', 'Voltar'];
        if (txt) txt.textContent = config[1];
        novo.addEventListener('click', () => window.location.href = config[0]);
    }

    async carregarDadosIniciais() {
        await Promise.all([
            this.carregarEventos(),
            this.carregarProfessores(),
            this.carregarSetores(), // 🔥 NOVO: vem do banco
            this.carregarTurmas()
        ]);
    }

    async carregarEventos() {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return;
            const resp = await fetch(
                `${this.apiBase}/eventos?mes=${this.mesAtual + 1}&ano=${this.anoAtual}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            const data = await resp.json();
            if (data.success) this.eventos = data.eventos || [];
        } catch (e) {
            console.error('❌ Erro ao carregar eventos:', e);
        }
    }

    async carregarProfessores() {
        if (!this.rolesComFiltroProfessor.includes(this.usuario.role)) return;
        try {
            const token = localStorage.getItem('auth_token');
            const resp = await fetch('/api/admin/usuarios?role=professor&limit=100',
                { headers: { Authorization: `Bearer ${token}` } });
            const data = await resp.json();
            if (data.success) {
                this.professores = data.usuarios || [];
                const sel = document.getElementById('filtroProfessor');
                if (sel) {
                    sel.innerHTML = '<option value="todos">Todos</option>';
                    this.professores.forEach(p => {
                        const o = document.createElement('option');
                        o.value = p._id || p.id;
                        o.textContent = p.nome || 'Sem nome';
                        sel.appendChild(o);
                    });
                }
            }
        } catch (e) {
            console.error('❌ Erro ao carregar professores:', e);
        }
    }

    // ============================================================================
    // 🔥 CARREGA SETORES DIRETO DO BANCO
    // Agrupa usuários por role, conta quantos ativos existem em cada setor.
    // Setores vazios NÃO aparecem no dropdown.
    // ============================================================================
    async carregarSetores() {
        const isAdmin = ['admin', 'super_admin'].includes(this.usuario.role);
        if (!isAdmin) return;

        try {
            const token = localStorage.getItem('auth_token');

            // 🔥 Busca todos os usuários ativos (é o banco que manda)
            const resp = await fetch('/api/admin/usuarios?limit=1000', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await resp.json();

            if (!data.success) {
                console.warn('⚠️ Não foi possível carregar usuários do banco');
                this.setoresDisponiveis = [];
                return;
            }

            const usuarios = data.usuarios || [];

            // Agrupa por role (contando apenas usuários ativos)
            const contagemPorRole = {};
            const nomesRepresentantes = {};

            usuarios.forEach(u => {
                if (!u.role) return;
                // Considera ativo quando ativo !== false
                if (u.ativo === false) return;

                contagemPorRole[u.role] = (contagemPorRole[u.role] || 0) + 1;
                if (!nomesRepresentantes[u.role]) {
                    nomesRepresentantes[u.role] = u.nome || '—';
                }
            });

            // Labels amigáveis — se vier role desconhecido do banco, humaniza
            const labelsConhecidos = {
                'admin': 'Administradores',
                'super_admin': 'Super Admins',
                'professor': 'Professores',
                'setor_pedagogico': 'Setor Pedagógico',
                'gestao_geral': 'Gestão Geral',
                'supervisao': 'Supervisão',
                'coordenacao_patio': 'Coordenação de Pátio',
                'secretaria': 'Secretaria',
                'recepcao': 'Recepção',
                'enfermaria': 'Enfermaria',
                'cozinha': 'Cozinha',
                'assistente-social': 'Assistente Social',
                'psicologia': 'Psicologia',
                'protagonismo': 'Protagonismo',
                'biblioteca': 'Biblioteca'
            };

            const iconesConhecidos = {
                'admin': 'fa-user-shield',
                'super_admin': 'fa-crown',
                'professor': 'fa-chalkboard-teacher',
                'setor_pedagogico': 'fa-graduation-cap',
                'gestao_geral': 'fa-user-tie',
                'supervisao': 'fa-clipboard-check',
                'coordenacao_patio': 'fa-users-cog',
                'secretaria': 'fa-folder-open',
                'recepcao': 'fa-concierge-bell',
                'enfermaria': 'fa-heartbeat',
                'cozinha': 'fa-utensils',
                'assistente-social': 'fa-hands-helping',
                'psicologia': 'fa-brain',
                'protagonismo': 'fa-star',
                'biblioteca': 'fa-book'
            };

            // Ordem de exibição preferida (o que não estiver aqui vai pro fim)
            const ordemPreferida = [
                'setor_pedagogico', 'gestao_geral', 'professor',
                'supervisao', 'coordenacao_patio',
                'secretaria', 'recepcao',
                'enfermaria', 'psicologia', 'assistente-social',
                'cozinha', 'biblioteca', 'protagonismo',
                'admin', 'super_admin'
            ];

            // 🔥 Monta a lista de setores a partir do BANCO (nada hardcoded)
            const setoresDoBanco = Object.keys(contagemPorRole).map(role => ({
                role,
                nome: labelsConhecidos[role] || this.humanizarRole(role),
                icone: iconesConhecidos[role] || 'fa-building',
                totalUsuarios: contagemPorRole[role],
                representante: nomesRepresentantes[role] || '—'
            }));

            // Ordena: primeiro os da ordem preferida, depois alfabético
            setoresDoBanco.sort((a, b) => {
                const ia = ordemPreferida.indexOf(a.role);
                const ib = ordemPreferida.indexOf(b.role);
                if (ia !== -1 && ib !== -1) return ia - ib;
                if (ia !== -1) return -1;
                if (ib !== -1) return 1;
                return a.nome.localeCompare(b.nome);
            });

            this.setoresDisponiveis = setoresDoBanco;

        } catch (e) {
            console.error('❌ Erro ao carregar setores do banco:', e);
            this.setoresDisponiveis = [];
        }
    }

    // Converte 'algum_role_novo' em 'Algum Role Novo'
    humanizarRole(role) {
        return role
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    async carregarTurmas() {
        if (!this.rolesComFiltroTurma.includes(this.usuario.role)) {
            this.turmas = [];
            return;
        }
        try {
            const token = localStorage.getItem('auth_token');
            const resp = await fetch('/api/turmas', { headers: { Authorization: `Bearer ${token}` } });
            const data = await resp.json();
            if (data.success) {
                this.turmas = data.turmas || [];
                const sel = document.getElementById('filtroTurma');
                if (sel) {
                    sel.innerHTML = '<option value="todas">Todas as turmas</option>';
                    this.turmas.forEach(t => {
                        const o = document.createElement('option');
                        o.value = t.id || t._id;
                        o.textContent = `${t.nome || 'Sem nome'} - ${t.disciplina || ''}`;
                        sel.appendChild(o);
                    });
                }
            }
        } catch (e) {
            console.error('❌ Erro ao carregar turmas:', e);
        }
    }

    renderizarCalendario() {
        const container = document.getElementById('calendarioGrid');
        if (!container) return;

        const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                       'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
        const titulo = document.getElementById('mesAtual');
        if (titulo) titulo.textContent = `${meses[this.mesAtual]} ${this.anoAtual}`;

        const primeiro = new Date(this.anoAtual, this.mesAtual, 1);
        const ultimo = new Date(this.anoAtual, this.mesAtual + 1, 0);
        let diaInicio = primeiro.getDay();
        if (diaInicio === 0) diaInicio = 7;
        const diasMes = ultimo.getDate();

        container.innerHTML = '';
        ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].forEach(d => {
            const el = document.createElement('div');
            el.className = 'calendario-dia-semana';
            el.textContent = d;
            container.appendChild(el);
        });

        for (let i = 1; i < diaInicio; i++) {
            const v = document.createElement('div');
            v.className = 'calendario-dia vazio';
            container.appendChild(v);
        }

        const todos = [];

        for (let dia = 1; dia <= diasMes; dia++) {
            const data = new Date(this.anoAtual, this.mesAtual, dia);
            const isHoje = data.toDateString() === new Date().toDateString();

            const eventosDia = this.eventos.filter(e => {
                if (!e || !e.start) return false;
                const d = new Date(e.start);
                return d.getDate() === dia &&
                       d.getMonth() === this.mesAtual &&
                       d.getFullYear() === this.anoAtual;
            });

            if (data >= new Date()) eventosDia.forEach(e => todos.push(e));

            const el = document.createElement('div');
            el.className = `calendario-dia ${isHoje ? 'hoje' : ''} ${eventosDia.length > 0 ? 'tem-evento' : ''}`;
            el.dataset.data = `${this.anoAtual}-${String(this.mesAtual + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

            const num = document.createElement('div');
            num.className = 'numero-dia';
            num.textContent = dia;
            el.appendChild(num);

            eventosDia.slice(0, 3).forEach(ev => {
                const mini = document.createElement('div');
                mini.className = `evento-mini tipo-${ev.tipo || 'evento'}`;
                mini.style.backgroundColor = ev.cor || '#667eea';
                mini.style.borderLeftColor = ev.cor || '#667eea';
                mini.textContent = (ev.title || 'Evento').substring(0, 12) +
                    ((ev.title || '').length > 12 ? '…' : '');
                mini.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.mostrarDetalhesEvento(ev);
                });
                el.appendChild(mini);
            });

            if (eventosDia.length > 3) {
                const mais = document.createElement('div');
                mais.className = 'evento-mais';
                mais.textContent = `+${eventosDia.length - 3}`;
                el.appendChild(mais);
            }

            if (this.podeCriar) {
                el.addEventListener('click', (e) => {
                    if (!e.target.classList.contains('evento-mini') &&
                        !e.target.classList.contains('evento-mais')) {
                        this.abrirCriadorEvento(el.dataset.data);
                    }
                });
            }

            container.appendChild(el);
        }

        this.renderizarProximosEventos(todos);
    }

    renderizarProximosEventos(todos) {
        const container = document.getElementById('proximosEventosLista');
        if (!container) return;

        const agora = new Date();
        const proximos = todos
            .filter(e => new Date(e.start) > agora)
            .sort((a, b) => new Date(a.start) - new Date(b.start))
            .slice(0, 5);

        if (proximos.length === 0) {
            container.innerHTML = '<p style="color:#6c757d;text-align:center;">Nenhum evento próximo</p>';
            return;
        }

        container.innerHTML = proximos.map(e => {
            const d = new Date(e.start);
            const json = JSON.stringify(e).replace(/"/g, '&quot;');
            return `<div class="evento-item-lista" onclick='calendario.mostrarDetalhesEvento(${json})'>
                <div class="cor" style="background:${e.cor || '#667eea'}"></div>
                <div class="info">
                    <div class="titulo">${e.title || 'Evento'}</div>
                    <div class="horario">${d.toLocaleDateString('pt-BR')} às ${e.horarioInicio || '--:--'}</div>
                </div>
            </div>`;
        }).join('');
    }

    configurarEventListeners() {
        const btnAnt = document.getElementById('btnMesAnterior');
        if (btnAnt) {
            btnAnt.addEventListener('click', () => {
                this.mesAtual--;
                if (this.mesAtual < 0) { this.mesAtual = 11; this.anoAtual--; }
                this.carregarEventos().then(() => this.renderizarCalendario());
            });
        }

        const btnProx = document.getElementById('btnProximoMes');
        if (btnProx) {
            btnProx.addEventListener('click', () => {
                this.mesAtual++;
                if (this.mesAtual > 11) { this.mesAtual = 0; this.anoAtual++; }
                this.carregarEventos().then(() => this.renderizarCalendario());
            });
        }

        const fTipo = document.getElementById('filtroTipo');
        if (fTipo) {
            fTipo.addEventListener('change', (e) => {
                this.filtros.tipo = e.target.value;
                this.renderizarCalendario();
            });
        }

        const fProf = document.getElementById('filtroProfessor');
        if (fProf && this.rolesComFiltroProfessor.includes(this.usuario.role)) {
            fProf.addEventListener('change', (e) => {
                this.filtros.professor = e.target.value;
                this.renderizarCalendario();
            });
        }

        const fTurma = document.getElementById('filtroTurma');
        if (fTurma && this.rolesComFiltroTurma.includes(this.usuario.role)) {
            fTurma.addEventListener('change', (e) => {
                this.filtros.turma = e.target.value;
                this.renderizarCalendario();
            });
        }

        const btnCriar = document.getElementById('btnCriarEvento');
        if (btnCriar && this.podeCriar) {
            btnCriar.addEventListener('click', () => this.abrirCriadorEvento());
        }
    }

    // ============================================================================
    // 🔥 MODAL DE CRIAR / EDITAR — COM BLOCO DE SETOR PROFISSIONAL
    // ============================================================================
    abrirCriadorEvento(dataStr = null, eventoExistente = null) {
        this.eventoEditando = eventoExistente;
        if (!this.podeCriar) {
            alert('Você não tem permissão para criar ou editar eventos.');
            return;
        }

        const isAdmin = ['admin', 'super_admin'].includes(this.usuario.role);
        const isCriador = eventoExistente &&
            (eventoExistente.criadoPor?.id === this.usuario.id ||
             eventoExistente.criadoPor?._id === this.usuario.id);

        if (!isAdmin && eventoExistente && !isCriador) {
            alert('❌ Você só pode editar seus próprios eventos');
            return;
        }

        const body = document.getElementById('modalBody');
        const title = document.getElementById('modalTitle');
        const footer = document.getElementById('modalFooter');
        if (!body || !title || !footer) return;

        const isEditando = !!eventoExistente;
        title.innerHTML = isEditando
            ? '<i class="fas fa-edit"></i> Editar Evento'
            : '<i class="fas fa-plus"></i> Criar Novo Evento';

        let dataInicio = dataStr || '';
        let dataFim = '';
        let horaInicio = '08:00';
        let horaFim = '09:00';
        let titulo = '';
        let descricao = '';
        let tipo = 'personalizado';
        let cor = '#3b82f6';
        let local = '';
        let turmaId = '';
        let notificar = true;
        let notifValue = '30';
        let diaInteiro = false;
        let destinatarioModo = 'eu'; // 'eu' | 'todos_adm' | 'setor'
        let setorDestino = '';       // role do setor

        if (isEditando && eventoExistente) {
            if (eventoExistente.start) {
                dataInicio = new Date(eventoExistente.start).toISOString().split('T')[0];
            }
            if (eventoExistente.end) {
                dataFim = new Date(eventoExistente.end).toISOString().split('T')[0];
            }
            horaInicio = eventoExistente.horarioInicio || '08:00';
            horaFim = eventoExistente.horarioFim || '09:00';
            titulo = eventoExistente.title || '';
            descricao = eventoExistente.descricao || '';
            tipo = eventoExistente.tipo || 'personalizado';
            cor = eventoExistente.cor || '#3b82f6';
            local = eventoExistente.local || '';
            turmaId = eventoExistente.turma?.id || '';
            notificar = eventoExistente.notificacaoAtivada !== false;
            if (eventoExistente.notificacoes && eventoExistente.notificacoes.length > 0) {
                const ativa = eventoExistente.notificacoes.find(n => !n.enviada);
                if (ativa) notifValue = ativa.minutosAntes.toString();
            }
            diaInteiro = eventoExistente.allDay || false;

            // Detecta o setor do criador original (para pré-selecionar)
            const roleCriador = eventoExistente.criadoPor?.role;
            if (roleCriador && this.setoresDisponiveis.some(s => s.role === roleCriador)) {
                destinatarioModo = 'setor';
                setorDestino = roleCriador;
            }
        }

        const turmasOpts = this.rolesComFiltroTurma.includes(this.usuario.role)
            ? (this.turmas || []).map(t =>
                `<option value="${t.id || t._id}" ${turmaId === (t.id || t._id) ? 'selected' : ''}>${t.nome || ''} - ${t.disciplina || ''}</option>`
            ).join('')
            : '';

        // 🔥 Bloco de destinatário — dropdown de SETORES (100% do banco)
        const setoresOpts = (this.setoresDisponiveis || []).map(s => {
            const selecionado = setorDestino === s.role ? 'selected' : '';
            const sufixoQtd = s.totalUsuarios
                ? ` — ${s.totalUsuarios} usuário${s.totalUsuarios > 1 ? 's' : ''}`
                : '';
            return `<option value="${s.role}" ${selecionado}>${s.nome}${sufixoQtd}</option>`;
        }).join('');

        const blocoDestinatario = isAdmin ? `
            <div class="form-section">
                <div class="form-section-title">
                    <i class="fas fa-bullseye"></i>
                    <span>Público-alvo do Evento</span>
                </div>
                <p class="form-section-hint">
                    Escolha para quem este evento será direcionado. As notificações serão enviadas conforme o público escolhido.
                </p>

                <div class="radio-group">
                    <label class="radio-card ${destinatarioModo === 'eu' ? 'selected' : ''}" data-modo="eu">
                        <input type="radio" name="destinatarioModo" value="eu" ${destinatarioModo === 'eu' ? 'checked' : ''}>
                        <div class="radio-card-icon" style="background:#dbeafe;color:#1e40af;">
                            <i class="fas fa-user"></i>
                        </div>
                        <div class="radio-card-content">
                            <strong>Eu mesmo</strong>
                            <small>Criar em meu nome. Notifica todos os setores administrativos.</small>
                        </div>
                    </label>

                    <label class="radio-card ${destinatarioModo === 'todos_adm' ? 'selected' : ''}" data-modo="todos_adm">
                        <input type="radio" name="destinatarioModo" value="todos_adm" ${destinatarioModo === 'todos_adm' ? 'checked' : ''}>
                        <div class="radio-card-icon" style="background:#d1fae5;color:#065f46;">
                            <i class="fas fa-users"></i>
                        </div>
                        <div class="radio-card-content">
                            <strong>Todos os setores administrativos</strong>
                            <small>Notifica todos os setores cadastrados no sistema.</small>
                        </div>
                    </label>

                    <label class="radio-card ${destinatarioModo === 'setor' ? 'selected' : ''}" data-modo="setor">
                        <input type="radio" name="destinatarioModo" value="setor" ${destinatarioModo === 'setor' ? 'checked' : ''}>
                        <div class="radio-card-icon" style="background:#fef3c7;color:#92400e;">
                            <i class="fas fa-building"></i>
                        </div>
                        <div class="radio-card-content">
                            <strong>Setor específico</strong>
                            <small>Escolha um setor cadastrado. A notificação seguirá a regra daquele setor.</small>
                        </div>
                    </label>
                </div>

                <div id="blocoSetorDestino" style="display: ${destinatarioModo === 'setor' ? 'block' : 'none'}; margin-top: 14px;">
                    <label class="form-label"><i class="fas fa-building"></i> Selecione o setor *</label>
                    <select id="eventoSetorDestino" class="form-control">
                        <option value="">Selecione o setor…</option>
                        ${setoresOpts}
                    </select>
                    <small class="text-muted">
                        ${this.setoresDisponiveis.length === 0
                            ? '⚠️ Nenhum setor com usuários ativos foi encontrado no banco.'
                            : 'O evento será associado a um usuário ativo do setor escolhido.'}
                    </small>
                </div>
            </div>
        ` : '';

        body.innerHTML = `
            <form id="formEvento">

                <div class="form-section">
                    <div class="form-section-title">
                        <i class="fas fa-info-circle"></i>
                        <span>Informações Básicas</span>
                    </div>

                    <div class="form-group">
                        <label><i class="fas fa-tag"></i> Título do Evento *</label>
                        <input type="text" id="eventoTitulo" class="form-control" value="${this.escapeHtml(titulo)}" placeholder="Ex.: Reunião de pais, Prova de Matemática…" required>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label><i class="fas fa-calendar"></i> Data Início *</label>
                            <input type="date" id="eventoDataInicio" class="form-control" value="${dataInicio}" required>
                        </div>
                        <div class="form-group">
                            <label><i class="fas fa-clock"></i> Horário Início</label>
                            <input type="time" id="eventoHorarioInicio" class="form-control" value="${horaInicio}">
                        </div>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label><i class="fas fa-calendar"></i> Data Fim</label>
                            <input type="date" id="eventoDataFim" class="form-control" value="${dataFim}">
                        </div>
                        <div class="form-group">
                            <label><i class="fas fa-clock"></i> Horário Fim</label>
                            <input type="time" id="eventoHorarioFim" class="form-control" value="${horaFim}">
                        </div>
                    </div>

                    <div class="form-check">
                        <input type="checkbox" id="eventoDiaInteiro" ${diaInteiro ? 'checked' : ''}>
                        <label for="eventoDiaInteiro">Dia inteiro (sem horário)</label>
                    </div>
                </div>

                ${blocoDestinatario}

                <div class="form-section">
                    <div class="form-section-title">
                        <i class="fas fa-align-left"></i>
                        <span>Detalhes do Evento</span>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label><i class="fas fa-tag"></i> Tipo</label>
                            <select id="eventoTipo" class="form-control">
                                <option value="prova" ${tipo === 'prova' ? 'selected' : ''}>📝 Prova</option>
                                <option value="lembrete" ${tipo === 'lembrete' ? 'selected' : ''}>🔔 Lembrete</option>
                                <option value="feriado" ${tipo === 'feriado' ? 'selected' : ''}>🎉 Feriado</option>
                                <option value="reuniao" ${tipo === 'reuniao' ? 'selected' : ''}>👥 Reunião</option>
                                <option value="prazo" ${tipo === 'prazo' ? 'selected' : ''}>⏰ Prazo</option>
                                <option value="personalizado" ${tipo === 'personalizado' ? 'selected' : ''}>📌 Personalizado</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label><i class="fas fa-palette"></i> Cor</label>
                            <input type="color" id="eventoCor" class="form-control" value="${cor}">
                        </div>
                    </div>

                    <div class="form-group">
                        <label><i class="fas fa-align-left"></i> Descrição</label>
                        <textarea id="eventoDescricao" class="form-control" rows="3" placeholder="Detalhes, pauta, observações…">${this.escapeHtml(descricao)}</textarea>
                    </div>

                    <div class="form-group">
                        <label><i class="fas fa-map-marker-alt"></i> Local</label>
                        <input type="text" id="eventoLocal" class="form-control" value="${this.escapeHtml(local)}" placeholder="Ex.: Auditório, Sala 12…">
                    </div>

                    ${this.rolesComFiltroTurma.includes(this.usuario.role) ? `
                    <div class="form-group">
                        <label><i class="fas fa-school"></i> Turma (opcional)</label>
                        <select id="eventoTurma" class="form-control">
                            <option value="">Todas as turmas</option>
                            ${turmasOpts}
                        </select>
                        <small class="text-muted">Se escolher uma turma, os alunos dela também serão notificados.</small>
                    </div>
                    ` : ''}
                </div>

                <div class="form-section">
                    <div class="form-section-title">
                        <i class="fas fa-bell"></i>
                        <span>Notificações</span>
                    </div>

                    <div class="form-check">
                        <input type="checkbox" id="eventoNotificar" ${notificar ? 'checked' : ''}>
                        <label for="eventoNotificar">Ativar notificações</label>
                    </div>

                    <div class="form-group">
                        <label><i class="fas fa-bell"></i> Notificar antes</label>
                        <select id="eventoNotificacao" class="form-control">
                            <option value="0" ${notifValue === '0' ? 'selected' : ''}>No momento</option>
                            <option value="5" ${notifValue === '5' ? 'selected' : ''}>5 minutos antes</option>
                            <option value="15" ${notifValue === '15' ? 'selected' : ''}>15 minutos antes</option>
                            <option value="30" ${notifValue === '30' ? 'selected' : ''}>30 minutos antes</option>
                            <option value="60" ${notifValue === '60' ? 'selected' : ''}>1 hora antes</option>
                            <option value="120" ${notifValue === '120' ? 'selected' : ''}>2 horas antes</option>
                            <option value="1440" ${notifValue === '1440' ? 'selected' : ''}>1 dia antes</option>
                        </select>
                    </div>
                </div>
            </form>
        `;

        if (isEditando) {
            footer.innerHTML = `
                <button class="btn-cancel" onclick="calendario.fecharModal()">Cancelar</button>
                <button class="btn-delete" onclick="calendario.excluirEvento('${eventoExistente.id}')">
                    <i class="fas fa-trash"></i> Excluir
                </button>
                <button class="btn-update" onclick="calendario.atualizarEvento('${eventoExistente.id}')">
                    <i class="fas fa-save"></i> Atualizar
                </button>
            `;
        } else {
            footer.innerHTML = `
                <button class="btn-cancel" onclick="calendario.fecharModal()">Cancelar</button>
                <button class="btn-save" onclick="calendario.salvarEvento()">
                    <i class="fas fa-check"></i> Criar Evento
                </button>
            `;
        }

        // 🔥 Listener dos radio-cards de destinatário
        if (isAdmin) {
            body.querySelectorAll('input[name="destinatarioModo"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const modo = e.target.value;
                    body.querySelectorAll('.radio-card').forEach(c => c.classList.remove('selected'));
                    e.target.closest('.radio-card').classList.add('selected');

                    const bloco = document.getElementById('blocoSetorDestino');
                    if (bloco) bloco.style.display = modo === 'setor' ? 'block' : 'none';
                });
            });
        }

        this.abrirModal();
    }

    // ============================================================================
    // Coleta o payload (criar e atualizar usam a mesma lógica)
    // ============================================================================
    coletarPayloadEvento() {
        const titulo = document.getElementById('eventoTitulo')?.value;
        const dataInicio = document.getElementById('eventoDataInicio')?.value;

        if (!titulo || titulo.trim().length < 3) {
            throw new Error('Título deve ter pelo menos 3 caracteres');
        }
        if (!dataInicio) {
            throw new Error('Preencha a data de início');
        }

        const evento = {
            titulo,
            dataInicio,
            descricao: document.getElementById('eventoDescricao')?.value || '',
            tipo: document.getElementById('eventoTipo')?.value || 'personalizado',
            cor: document.getElementById('eventoCor')?.value || '#3b82f6',
            dataFim: document.getElementById('eventoDataFim')?.value || null,
            horarioInicio: document.getElementById('eventoHorarioInicio')?.value,
            horarioFim: document.getElementById('eventoHorarioFim')?.value,
            diaInteiro: document.getElementById('eventoDiaInteiro')?.checked || false,
            local: document.getElementById('eventoLocal')?.value || '',
            turmaId: document.getElementById('eventoTurma')?.value || null,
            notificacaoAtivada: document.getElementById('eventoNotificar')?.checked || false,
            notificacoes: [{
                minutosAntes: parseInt(document.getElementById('eventoNotificacao')?.value || '30'),
                tipo: 'sistema'
            }]
        };

        // 🔥 Resolve o SETOR escolhido (apenas admin/super_admin)
        const isAdmin = ['admin', 'super_admin'].includes(this.usuario.role);
        if (isAdmin) {
            const modo = document.querySelector('input[name="destinatarioModo"]:checked')?.value || 'eu';

            if (modo === 'setor') {
                const roleSetor = document.getElementById('eventoSetorDestino')?.value;
                if (!roleSetor) {
                    throw new Error('Selecione o setor do evento');
                }
                evento.setorDestino = roleSetor;
            }
        }

        return evento;
    }

    async salvarEvento() {
        try {
            const token = localStorage.getItem('auth_token');
            const evento = this.coletarPayloadEvento();

            const resp = await fetch(`${this.apiBase}/eventos`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(evento)
            });

            const data = await resp.json();
            if (!data.success) throw new Error(data.error || 'Erro');

            const dataCriada = new Date(evento.dataInicio + 'T12:00:00');
            this.mesAtual = dataCriada.getMonth();
            this.anoAtual = dataCriada.getFullYear();

            alert('✅ Evento criado com sucesso!');
            this.fecharModal();
            await this.carregarEventos();
            this.renderizarCalendario();

        } catch (e) {
            console.error('❌ Erro:', e);
            alert('❌ ' + e.message);
        }
    }

    async atualizarEvento(id) {
        try {
            const token = localStorage.getItem('auth_token');
            const evento = this.coletarPayloadEvento();

            const resp = await fetch(`${this.apiBase}/eventos/${id}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(evento)
            });

            const data = await resp.json();
            if (!data.success) throw new Error(data.error || 'Erro');

            const dataAtualizada = new Date(evento.dataInicio + 'T12:00:00');
            this.mesAtual = dataAtualizada.getMonth();
            this.anoAtual = dataAtualizada.getFullYear();

            alert('✅ Evento atualizado!');
            this.fecharModal();
            await this.carregarEventos();
            this.renderizarCalendario();

        } catch (e) {
            console.error('❌ Erro:', e);
            alert('❌ ' + e.message);
        }
    }

    async excluirEvento(id) {
        const confirmar = await confirm('Tem certeza que deseja excluir este evento?');
        if (!confirmar) return;

        try {
            const token = localStorage.getItem('auth_token');
            const resp = await fetch(`${this.apiBase}/eventos/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });

            const contentType = resp.headers.get('content-type');
            let data;
            if (contentType && contentType.includes('application/json')) {
                data = await resp.json();
            } else {
                const text = await resp.text();
                throw new Error('Resposta inválida do servidor');
            }

            if (data.success) {
                alert('✅ Evento excluído!');
                this.fecharModal();
                await this.carregarEventos();
                this.renderizarCalendario();
            } else {
                throw new Error(data.error || 'Erro');
            }
        } catch (e) {
            console.error('❌ Erro:', e);
            alert('❌ ' + e.message);
        }
    }

    mostrarDetalhesEvento(evento) {
        const body = document.getElementById('modalBody');
        const title = document.getElementById('modalTitle');
        const footer = document.getElementById('modalFooter');
        if (!body || !title || !footer) return;

        title.innerHTML = `<i class="fas fa-calendar-check"></i> ${evento.title || 'Evento'}`;

        const dataFmt = evento.start
            ? new Date(evento.start).toLocaleDateString('pt-BR')
            : 'Data não disponível';
        const horaInicio = evento.horarioInicio || '--:--';
        const horaFim = evento.horarioFim || '--:--';

        const isAdmin = ['admin', 'super_admin'].includes(this.usuario.role);
        const isCriador = evento.criadoPor?.id === this.usuario.id ||
                          evento.criadoPor?._id === this.usuario.id;
        const podeEditar = isAdmin || isCriador;

        body.innerHTML = `
            <div class="evento-detalhes">
                <div class="evento-header" style="border-left:4px solid ${evento.cor || '#667eea'}; background:${(evento.cor || '#667eea')}20;">
                    <div class="evento-tipo tipo-${evento.tipo || 'evento'}">
                        ${this.getIconeTipo(evento.tipo)} ${this.getNomeTipo(evento.tipo)}
                    </div>
                </div>

                <div class="detalhes-grid">
                    <div class="detalhe-item">
                        <i class="fas fa-calendar"></i>
                        <div><strong>Data:</strong> ${dataFmt}</div>
                    </div>

                    ${!evento.allDay ? `
                    <div class="detalhe-item">
                        <i class="fas fa-clock"></i>
                        <div><strong>Horário:</strong> ${horaInicio} - ${horaFim}</div>
                    </div>
                    ` : ''}

                    ${evento.local ? `
                    <div class="detalhe-item">
                        <i class="fas fa-map-marker-alt"></i>
                        <div><strong>Local:</strong> ${evento.local}</div>
                    </div>
                    ` : ''}

                    <div class="detalhe-item">
                        <i class="fas fa-user"></i>
                        <div>
                            <strong>Criado por:</strong> ${evento.criadoPor?.nome || 'Desconhecido'}
                            ${isCriador ? ' (você)' : ''}
                        </div>
                    </div>

                    ${evento.turma ? `
                    <div class="detalhe-item">
                        <i class="fas fa-school"></i>
                        <div><strong>Turma:</strong> ${evento.turma.nome}</div>
                    </div>
                    ` : ''}

                    ${evento.prova ? `
                    <div class="detalhe-item">
                        <i class="fas fa-file-alt"></i>
                        <div><strong>Prova:</strong> ${evento.prova.titulo}</div>
                    </div>
                    ` : ''}
                </div>

                ${evento.descricao ? `
                <div class="descricao-box">
                    <strong><i class="fas fa-align-left"></i> Descrição:</strong>
                    <p>${evento.descricao}</p>
                </div>
                ` : ''}

                <div class="notificacao-info">
                    <i class="fas ${evento.notificacaoAtivada ? 'fa-bell text-success' : 'fa-bell-slash text-muted'}"></i>
                    ${evento.notificacaoAtivada ? 'Notificações ativadas' : 'Notificações desativadas'}
                </div>
            </div>
        `;

        footer.innerHTML = '';
        const btnFechar = document.createElement('button');
        btnFechar.className = 'btn-cancel';
        btnFechar.innerHTML = 'Fechar';
        btnFechar.onclick = () => this.fecharModal();
        footer.appendChild(btnFechar);

        if (podeEditar && this.podeCriar) {
            const btnEditar = document.createElement('button');
            btnEditar.className = 'btn-update';
            btnEditar.innerHTML = '<i class="fas fa-edit"></i> Editar';
            btnEditar.onclick = () => this.abrirCriadorEvento(null, evento);
            footer.appendChild(btnEditar);
        }

        this.abrirModal();
    }

    getIconeTipo(t) {
        return { prova: '📝', lembrete: '🔔', feriado: '🎉',
                 reuniao: '👥', prazo: '⏰', evento: '📅',
                 personalizado: '📌' }[t] || '📌';
    }

    getNomeTipo(t) {
        return { prova: 'Prova', lembrete: 'Lembrete', feriado: 'Feriado',
                 reuniao: 'Reunião', prazo: 'Prazo', evento: 'Evento',
                 personalizado: 'Personalizado' }[t] || 'Evento';
    }

    escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    abrirModal() {
        const modal = document.getElementById('modal');
        if (modal) modal.style.display = 'flex';
    }

    fecharModal() {
        const modal = document.getElementById('modal');
        if (modal) modal.style.display = 'none';
    }
}

const calendario = new CalendarioAcademico();
window.calendario = calendario;