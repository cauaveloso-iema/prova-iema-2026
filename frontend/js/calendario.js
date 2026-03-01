// ============================================================================
// CALENDÁRIO ACADÊMICO - FRONTEND (VERSÃO COMPLETA E FUNCIONAL)
// ============================================================================

class CalendarioAcademico {
    constructor() {
        this.apiBase = '/api/calendario';
        this.eventos = [];
        this.dataAtual = new Date();
        this.mesAtual = this.dataAtual.getMonth();
        this.anoAtual = this.dataAtual.getFullYear();
        this.usuario = JSON.parse(localStorage.getItem('user_data') || '{}');
        this.filtros = {
            tipo: 'todos',
            professor: 'todos',
            turma: 'todas'
        };
        this.professores = [];
        this.turmas = [];
        this.eventoEditando = null;
        
        console.log('📅 Inicializando Calendário Acadêmico...', this.usuario);
        console.log('👤 Role do usuário:', this.usuario.role);
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        console.log('🚀 Iniciando calendário...');
        await this.carregarDadosIniciais();
        this.renderizarCalendario();
        this.configurarEventListeners();
    }

    async carregarDadosIniciais() {
        await Promise.all([
            this.carregarEventos(),
            this.carregarProfessores(),
            this.carregarTurmas()
        ]);
    }

    async carregarEventos() {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) {
                console.error('❌ Token não encontrado');
                return;
            }
            
            console.log(`📡 Buscando eventos para ${this.mesAtual + 1}/${this.anoAtual}...`);
            
            const response = await fetch(
                `${this.apiBase}/eventos?mes=${this.mesAtual + 1}&ano=${this.anoAtual}`,
                {
                    headers: { 'Authorization': `Bearer ${token}` }
                }
            );
            
            const data = await response.json();
            
            if (data.success) {
                let eventosCarregados = data.eventos || [];
                
                // 🔥 FILTRAR BASEADO NO ROLE DO USUÁRIO
                if (this.usuario.role === 'professor') {
                    // Professor vê apenas eventos que ele CRIOU
                    this.eventos = eventosCarregados.filter(e => e.criadoPor?.id === this.usuario.id);
                    console.log(`👨‍🏫 Professor: filtrando apenas seus eventos (${this.eventos.length} encontrados)`);
                    
                    // Para professor, o filtro de professor deve ficar invisível ou desabilitado
                    const filtroProf = document.getElementById('filtroProfessor');
                    if (filtroProf) {
                        filtroProf.disabled = true;
                        filtroProf.style.opacity = '0.5';
                    }
                } else {
                    // Admin vê todos os eventos
                    this.eventos = eventosCarregados;
                    console.log(`👑 Admin: todos os eventos (${this.eventos.length} encontrados)`);
                }
            }
        } catch (error) {
            console.error('❌ Erro ao carregar eventos:', error);
        }
    }

    async carregarProfessores() {
        try {
            const token = localStorage.getItem('auth_token');
            
            // Só carregar professores se for admin
            if (this.usuario.role === 'admin' || this.usuario.role === 'super_admin') {
                const response = await fetch('/api/admin/usuarios?role=professor&limit=100', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    this.professores = data.usuarios || [];
                    console.log(`✅ ${this.professores.length} professores carregados`);
                    
                    const selectProf = document.getElementById('filtroProfessor');
                    if (selectProf) {
                        selectProf.innerHTML = '<option value="todos">Todos</option>';
                        this.professores.forEach(p => {
                            const option = document.createElement('option');
                            option.value = p._id || p.id;
                            option.textContent = `${p.nome || 'Sem nome'} - ${p.email || 'Sem email'}`;
                            selectProf.appendChild(option);
                        });
                    }
                }
            } else {
                // Para professor, esconder o filtro
                const filtroProf = document.getElementById('filtroProfessor');
                if (filtroProf && filtroProf.parentElement) {
                    filtroProf.parentElement.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('❌ Erro ao carregar professores:', error);
        }
    }

    // ============ CARREGAR TURMAS (CORRIGIDO PARA PROFESSOR) ============
    async carregarTurmas() {
        try {
            const token = localStorage.getItem('auth_token');
            
            // 🔥 Usar a rota /api/turmas que funciona para professor
            const response = await fetch('/api/turmas', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Para admin, usa todas as turmas; para professor, só as dele
                if (this.usuario.role === 'admin' || this.usuario.role === 'super_admin') {
                    this.turmas = data.turmas || [];
                    console.log(`👑 Admin: ${this.turmas.length} turmas carregadas`);
                } else {
                    // Professor vê apenas suas turmas
                    this.turmas = data.turmas || [];
                    console.log(`👨‍🏫 Professor: ${this.turmas.length} turmas carregadas`);
                }
                
                // Atualizar o select de turmas
                const selectTurma = document.getElementById('filtroTurma');
                if (selectTurma) {
                    selectTurma.innerHTML = '<option value="todas">Todas as turmas</option>';
                    this.turmas.forEach(t => {
                        const option = document.createElement('option');
                        option.value = t.id;
                        option.textContent = `${t.nome || 'Sem nome'} - ${t.disciplina || 'Sem disciplina'}`;
                        selectTurma.appendChild(option);
                    });
                }
                
                // Também atualizar o select no modal de criação
                const selectTurmaModal = document.getElementById('eventoTurma');
                if (selectTurmaModal) {
                    selectTurmaModal.innerHTML = '<option value="">Selecione uma turma...</option>';
                    this.turmas.forEach(t => {
                        const option = document.createElement('option');
                        option.value = t.id;
                        option.textContent = `${t.nome} - ${t.disciplina}`;
                        selectTurmaModal.appendChild(option);
                    });
                }
            }
        } catch (error) {
            console.error('❌ Erro ao carregar turmas:', error);
        }
    }

    renderizarCalendario() {
        const container = document.getElementById('calendarioGrid');
        
        if (!container) {
            console.error('❌ Container do calendário não encontrado!');
            return;
        }

        const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                       'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const mesTitulo = document.getElementById('mesAtual');
        if (mesTitulo) {
            mesTitulo.textContent = `${meses[this.mesAtual]} ${this.anoAtual}`;
        }

        const primeiroDia = new Date(this.anoAtual, this.mesAtual, 1);
        const ultimoDia = new Date(this.anoAtual, this.mesAtual + 1, 0);
        
        let diaSemanaInicio = primeiroDia.getDay();
        if (diaSemanaInicio === 0) diaSemanaInicio = 7;
        
        const diasNoMes = ultimoDia.getDate();
        
        container.innerHTML = '';
        
        const diasSemana = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
        diasSemana.forEach(dia => {
            const diaEl = document.createElement('div');
            diaEl.className = 'calendario-dia-semana';
            diaEl.textContent = dia;
            container.appendChild(diaEl);
        });
        
        for (let i = 1; i < diaSemanaInicio; i++) {
            const vazio = document.createElement('div');
            vazio.className = 'calendario-dia vazio';
            container.appendChild(vazio);
        }
        
        // Array para armazenar todos os eventos para próximos eventos
        const todosEventos = [];
        
        for (let dia = 1; dia <= diasNoMes; dia++) {
            const dataStr = `${this.anoAtual}-${String(this.mesAtual + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
            const data = new Date(this.anoAtual, this.mesAtual, dia);
            
            const hoje = new Date();
            const isHoje = data.toDateString() === hoje.toDateString();
            
            const eventosDoDia = this.eventos.filter(e => {
                if (!e || !e.start) return false;
                
                try {
                    const dataEvento = new Date(e.start);
                    return dataEvento.getDate() === dia && 
                           dataEvento.getMonth() === this.mesAtual &&
                           dataEvento.getFullYear() === this.anoAtual;
                } catch (err) {
                    return false;
                }
            });
            
            // Adicionar aos eventos futuros
            if (data >= hoje) {
                eventosDoDia.forEach(e => todosEventos.push(e));
            }
            
            const diaEl = document.createElement('div');
            diaEl.className = `calendario-dia ${isHoje ? 'hoje' : ''} ${eventosDoDia.length > 0 ? 'tem-evento' : ''}`;
            diaEl.dataset.data = dataStr;
            
            const numeroEl = document.createElement('div');
            numeroEl.className = 'numero-dia';
            numeroEl.textContent = dia;
            diaEl.appendChild(numeroEl);
            
            eventosDoDia.slice(0, 3).forEach(evento => {
                const eventoMini = document.createElement('div');
                eventoMini.className = `evento-mini tipo-${evento.tipo || 'evento'}`;
                eventoMini.style.backgroundColor = evento.cor || '#667eea';
                eventoMini.style.borderLeftColor = evento.cor || '#667eea';
                eventoMini.textContent = (evento.title || 'Evento').substring(0, 12) + 
                    ((evento.title || '').length > 12 ? '…' : '');
                
                eventoMini.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.mostrarDetalhesEvento(evento);
                });
                
                diaEl.appendChild(eventoMini);
            });
            
            if (eventosDoDia.length > 3) {
                const maisEl = document.createElement('div');
                maisEl.className = 'evento-mais';
                maisEl.textContent = `+${eventosDoDia.length - 3}`;
                diaEl.appendChild(maisEl);
            }
            
            // 🔥 Ao clicar no dia (não em um evento), abre para CRIAR novo evento
            diaEl.addEventListener('click', (e) => {
                // Verifica se clicou no dia e não em um evento
                if (!e.target.classList.contains('evento-mini') && !e.target.classList.contains('evento-mais')) {
                    this.abrirCriadorEvento(dataStr);
                }
            });
            
            container.appendChild(diaEl);
        }
        
        // Renderizar próximos eventos
        this.renderizarProximosEventos(todosEventos);
    }

    renderizarProximosEventos(todosEventos) {
        const container = document.getElementById('proximosEventosLista');
        if (!container) return;
        
        const agora = new Date();
        const proximos = todosEventos
            .filter(e => new Date(e.start) > agora)
            .sort((a, b) => new Date(a.start) - new Date(b.start))
            .slice(0, 5);
        
        if (proximos.length === 0) {
            container.innerHTML = '<p style="color: #6c757d; text-align: center;">Nenhum evento próximo</p>';
            return;
        }
        
        container.innerHTML = proximos.map(e => {
            const data = new Date(e.start);
            // Escapar aspas para JSON
            const eventoJson = JSON.stringify(e).replace(/"/g, '&quot;');
            return `
                <div class="evento-item-lista" onclick="calendario.mostrarDetalhesEvento(${eventoJson})">
                    <div class="cor" style="background: ${e.cor || '#667eea'}"></div>
                    <div class="info">
                        <div class="titulo">${e.title || 'Evento'}</div>
                        <div class="horario">${data.toLocaleDateString('pt-BR')} às ${e.horarioInicio || '--:--'}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    mostrarEventosDoDia(dataStr, eventos) {
        const container = document.getElementById('eventosDoDia');
        const lista = document.getElementById('listaEventosDoDia');
        
        if (!container || !lista) return;
        
        if (eventos.length === 0) {
            container.style.display = 'none';
            return;
        }
        
        const dataObj = new Date(dataStr + 'T12:00:00');
        const dataFormatada = dataObj.toLocaleDateString('pt-BR');
        
        lista.innerHTML = eventos.map(e => {
            const hora = e.horarioInicio ? ` às ${e.horarioInicio}` : '';
            // Escapar aspas para JSON
            const eventoJson = JSON.stringify(e).replace(/"/g, '&quot;');
            return `
                <div class="evento-item-lista" onclick="calendario.mostrarDetalhesEvento(${eventoJson})">
                    <div class="cor" style="background: ${e.cor || '#667eea'}"></div>
                    <div class="info">
                        <div class="titulo">${e.title || 'Evento'}</div>
                        <div class="horario">${dataFormatada}${hora}</div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.style.display = 'block';
    }

    aplicarFiltros(eventos) {
        return eventos.filter(e => {
            // Filtro por tipo
            if (this.filtros.tipo !== 'todos' && e.tipo !== this.filtros.tipo) {
                return false;
            }
            
            // Filtro por professor (só para admin)
            if (this.usuario.role === 'admin' || this.usuario.role === 'super_admin') {
                if (this.filtros.professor !== 'todos' && e.criadoPor?.id !== this.filtros.professor) {
                    return false;
                }
            }
            
            // Filtro por turma
            if (this.filtros.turma !== 'todas' && e.turma?.id !== this.filtros.turma) {
                return false;
            }
            
            return true;
        });
    }

    configurarEventListeners() {
        const btnAnterior = document.getElementById('btnMesAnterior');
        if (btnAnterior) {
            btnAnterior.addEventListener('click', () => {
                this.mesAtual--;
                if (this.mesAtual < 0) {
                    this.mesAtual = 11;
                    this.anoAtual--;
                }
                this.carregarEventos().then(() => this.renderizarCalendario());
            });
        }

        const btnProximo = document.getElementById('btnProximoMes');
        if (btnProximo) {
            btnProximo.addEventListener('click', () => {
                this.mesAtual++;
                if (this.mesAtual > 11) {
                    this.mesAtual = 0;
                    this.anoAtual++;
                }
                this.carregarEventos().then(() => this.renderizarCalendario());
            });
        }

        const filtroTipo = document.getElementById('filtroTipo');
        if (filtroTipo) {
            filtroTipo.addEventListener('change', (e) => {
                this.filtros.tipo = e.target.value;
                this.renderizarCalendario();
            });
        }

        const filtroProfessor = document.getElementById('filtroProfessor');
        if (filtroProfessor && (this.usuario.role === 'admin' || this.usuario.role === 'super_admin')) {
            filtroProfessor.addEventListener('change', (e) => {
                this.filtros.professor = e.target.value;
                this.renderizarCalendario();
            });
        }

        const filtroTurma = document.getElementById('filtroTurma');
        if (filtroTurma) {
            filtroTurma.addEventListener('change', (e) => {
                this.filtros.turma = e.target.value;
                this.renderizarCalendario();
            });
        }

        const btnCriar = document.getElementById('btnCriarEvento');
        if (btnCriar) {
            btnCriar.addEventListener('click', () => {
                this.abrirCriadorEvento();
            });
        }
    }

    // ============ ABRIR MODAL DE CRIAÇÃO/EDIÇÃO ============
    abrirCriadorEvento(dataStr = null, eventoExistente = null) {
        this.eventoEditando = eventoExistente;
        
        const podeCriar = this.usuario.role === 'admin' || 
                          this.usuario.role === 'super_admin' || 
                          this.usuario.role === 'professor';
        
        if (!podeCriar) {
            alert('Apenas administradores e professores podem criar eventos');
            return;
        }

        // Se for professor editando um evento, verificar se é dele
        if (this.usuario.role === 'professor' && eventoExistente && eventoExistente.criadoPor?.id !== this.usuario.id) {
            alert('❌ Você só pode editar seus próprios eventos');
            return;
        }

        const modalBody = document.getElementById('modalBody');
        const modalTitle = document.getElementById('modalTitle');
        const modalFooter = document.getElementById('modalFooter');
        
        if (!modalBody || !modalTitle || !modalFooter) {
            console.error('❌ Elementos do modal não encontrados');
            return;
        }
        
        const isEditando = !!eventoExistente;
        modalTitle.innerHTML = isEditando ? 
            '<i class="fas fa-edit"></i> Editar Evento' : 
            '<i class="fas fa-plus"></i> Criar Novo Evento';
        
        // Valores padrão
        let dataInicioValue = dataStr || '';
        let dataFimValue = '';
        let horarioInicioValue = '08:00';
        let horarioFimValue = '09:00';
        let tituloValue = '';
        let descricaoValue = '';
        let tipoValue = 'personalizado';
        let corValue = '#3b82f6';
        let localValue = '';
        let turmaIdValue = '';
        let notificarChecked = true;
        let notificacaoValue = '30';
        let diaInteiroChecked = false;
        
        // Se for edição, carregar os valores do evento existente
        if (isEditando && eventoExistente) {
            console.log('📝 Editando evento:', eventoExistente);
            
            // Data de início
            if (eventoExistente.start) {
                const dataInicio = new Date(eventoExistente.start);
                dataInicioValue = dataInicio.toISOString().split('T')[0];
            }
            
            // Data de fim
            if (eventoExistente.end) {
                const dataFim = new Date(eventoExistente.end);
                dataFimValue = dataFim.toISOString().split('T')[0];
            }
            
            // Horários
            horarioInicioValue = eventoExistente.horarioInicio || '08:00';
            horarioFimValue = eventoExistente.horarioFim || '09:00';
            
            // Título e descrição
            tituloValue = eventoExistente.title || '';
            descricaoValue = eventoExistente.descricao || '';
            
            // Tipo e cor
            tipoValue = eventoExistente.tipo || 'personalizado';
            corValue = eventoExistente.cor || '#3b82f6';
            
            // Local
            localValue = eventoExistente.local || '';
            
            // Turma
            turmaIdValue = eventoExistente.turma?.id || '';
            
            // Notificações
            notificarChecked = eventoExistente.notificacaoAtivada !== false;
            
            if (eventoExistente.notificacoes && eventoExistente.notificacoes.length > 0) {
                const notificacaoAtiva = eventoExistente.notificacoes.find(n => !n.enviada);
                if (notificacaoAtiva) {
                    notificacaoValue = notificacaoAtiva.minutosAntes.toString();
                }
            }
            
            // Dia inteiro
            diaInteiroChecked = eventoExistente.allDay || false;
        }
        
        // Montar opções de turma
        const turmasOptions = this.turmas.map(t => 
            `<option value="${t.id}" ${turmaIdValue === t.id ? 'selected' : ''}>${t.nome || 'Sem nome'} - ${t.disciplina || 'Sem disciplina'}</option>`
        ).join('');
        
        modalBody.innerHTML = `
            <form id="formEvento">
                <div class="form-group">
                    <label><i class="fas fa-tag"></i> Título do Evento *</label>
                    <input type="text" id="eventoTitulo" class="form-control" value="${tituloValue.replace(/'/g, "\\'")}" required>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label><i class="fas fa-calendar"></i> Data Início *</label>
                        <input type="date" id="eventoDataInicio" class="form-control" value="${dataInicioValue}" required>
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-clock"></i> Horário Início</label>
                        <input type="time" id="eventoHorarioInicio" class="form-control" value="${horarioInicioValue}">
                    </div>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label><i class="fas fa-calendar"></i> Data Fim (opcional)</label>
                        <input type="date" id="eventoDataFim" class="form-control" value="${dataFimValue}">
                    </div>
                    <div class="form-group">
                        <label><i class="fas fa-clock"></i> Horário Fim</label>
                        <input type="time" id="eventoHorarioFim" class="form-control" value="${horarioFimValue}">
                    </div>
                </div>
                
                <div class="form-check">
                    <input type="checkbox" id="eventoDiaInteiro" ${diaInteiroChecked ? 'checked' : ''}>
                    <label for="eventoDiaInteiro">Dia inteiro (sem horário)</label>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label><i class="fas fa-tag"></i> Tipo</label>
                        <select id="eventoTipo" class="form-control">
                            <option value="prova" ${tipoValue === 'prova' ? 'selected' : ''}>📝 Prova</option>
                            <option value="lembrete" ${tipoValue === 'lembrete' ? 'selected' : ''}>🔔 Lembrete</option>
                            <option value="feriado" ${tipoValue === 'feriado' ? 'selected' : ''}>🎉 Feriado</option>
                            <option value="reuniao" ${tipoValue === 'reuniao' ? 'selected' : ''}>👥 Reunião</option>
                            <option value="prazo" ${tipoValue === 'prazo' ? 'selected' : ''}>⏰ Prazo</option>
                            <option value="personalizado" ${tipoValue === 'personalizado' ? 'selected' : ''}>📌 Personalizado</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label><i class="fas fa-palette"></i> Cor</label>
                        <input type="color" id="eventoCor" class="form-control" value="${corValue}">
                    </div>
                </div>
                
                <div class="form-group">
                    <label><i class="fas fa-align-left"></i> Descrição (opcional)</label>
                    <textarea id="eventoDescricao" class="form-control" rows="3">${descricaoValue.replace(/'/g, "\\'")}</textarea>
                </div>
                
                <div class="form-group">
                    <label><i class="fas fa-map-marker-alt"></i> Local (opcional)</label>
                    <input type="text" id="eventoLocal" class="form-control" value="${localValue.replace(/'/g, "\\'")}">
                </div>
                
                ${(this.usuario.role === 'admin' || this.usuario.role === 'super_admin') ? `
                <div class="form-group">
                    <label><i class="fas fa-chalkboard-teacher"></i> Professor Responsável</label>
                    <select id="eventoProfessor" class="form-control">
                        <option value="">Selecione um professor...</option>
                        ${this.professores.map(p => 
                            `<option value="${p._id || p.id}" ${eventoExistente?.criadoPor?.id === (p._id || p.id) ? 'selected' : ''}>${(p.nome || 'Sem nome').replace(/'/g, "\\'")} - ${p.email || 'Sem email'}</option>`
                        ).join('')}
                    </select>
                    <small class="text-muted">Deixe em branco para criar em seu nome</small>
                </div>
                ` : ''}
                
                <div class="form-group">
                    <label><i class="fas fa-school"></i> Turma (opcional)</label>
                    <select id="eventoTurma" class="form-control">
                        <option value="">Todas as turmas</option>
                        ${turmasOptions}
                    </select>
                </div>
                
                <div class="form-check">
                    <input type="checkbox" id="eventoNotificar" ${notificarChecked ? 'checked' : ''}>
                    <label for="eventoNotificar">Ativar notificações</label>
                </div>
                
                <div class="form-group">
                    <label><i class="fas fa-bell"></i> Notificar antes</label>
                    <select id="eventoNotificacao" class="form-control">
                        <option value="0" ${notificacaoValue === '0' ? 'selected' : ''}>No momento do evento</option>
                        <option value="5" ${notificacaoValue === '5' ? 'selected' : ''}>5 minutos antes</option>
                        <option value="15" ${notificacaoValue === '15' ? 'selected' : ''}>15 minutos antes</option>
                        <option value="30" ${notificacaoValue === '30' ? 'selected' : ''}>30 minutos antes</option>
                        <option value="60" ${notificacaoValue === '60' ? 'selected' : ''}>1 hora antes</option>
                        <option value="120" ${notificacaoValue === '120' ? 'selected' : ''}>2 horas antes</option>
                        <option value="1440" ${notificacaoValue === '1440' ? 'selected' : ''}>1 dia antes</option>
                    </select>
                </div>
            </form>
        `;
        
        if (isEditando) {
            modalFooter.innerHTML = `
                <button class="btn-cancel" onclick="calendario.fecharModal()">Cancelar</button>
                <button class="btn-delete" onclick="calendario.excluirEvento('${eventoExistente.id}')">
                    <i class="fas fa-trash"></i> Excluir
                </button>
                <button class="btn-update" onclick="calendario.atualizarEvento('${eventoExistente.id}')">
                    <i class="fas fa-save"></i> Atualizar
                </button>
            `;
        } else {
            modalFooter.innerHTML = `
                <button class="btn-cancel" onclick="calendario.fecharModal()">Cancelar</button>
                <button class="btn-save" onclick="calendario.salvarEvento()">
                    <i class="fas fa-check"></i> Criar Evento
                </button>
            `;
        }
        
        this.abrirModal();
    }

    // ============ SALVAR NOVO EVENTO ============
    async salvarEvento() {
        try {
            const token = localStorage.getItem('auth_token');
            
            const dataInicio = document.getElementById('eventoDataInicio')?.value;
            const titulo = document.getElementById('eventoTitulo')?.value;
            
            if (!dataInicio || !titulo) {
                alert('❌ Preencha todos os campos obrigatórios');
                return;
            }
            
            if (titulo.trim().length < 3) {
                alert('❌ Título deve ter pelo menos 3 caracteres');
                return;
            }
            
            const evento = {
                titulo: titulo,
                descricao: document.getElementById('eventoDescricao')?.value || '',
                tipo: document.getElementById('eventoTipo')?.value || 'personalizado',
                cor: document.getElementById('eventoCor')?.value || '#3b82f6',
                dataInicio: dataInicio,
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
            
            // Se for admin e selecionou um professor
            if (this.usuario.role === 'admin' || this.usuario.role === 'super_admin') {
                const professorId = document.getElementById('eventoProfessor')?.value;
                if (professorId) {
                    evento.usuarioId = professorId;
                }
            }
            
            console.log('📤 Enviando evento:', evento);
            
            const response = await fetch(`${this.apiBase}/eventos`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(evento)
            });
            
            const data = await response.json();
            
            if (data.success) {
                alert('✅ Evento criado com sucesso!');
                this.fecharModal();
                await this.carregarEventos();
                this.renderizarCalendario();
            } else {
                throw new Error(data.error || 'Erro ao criar evento');
            }
            
        } catch (error) {
            console.error('❌ Erro:', error);
            alert('❌ ' + error.message);
        }
    }

    // ============ ATUALIZAR EVENTO ============
    async atualizarEvento(eventoId) {
        try {
            const token = localStorage.getItem('auth_token');
            
            const dataInicio = document.getElementById('eventoDataInicio')?.value;
            const titulo = document.getElementById('eventoTitulo')?.value;
            
            if (!dataInicio || !titulo) {
                alert('❌ Preencha todos os campos obrigatórios');
                return;
            }
            
            if (titulo.trim().length < 3) {
                alert('❌ Título deve ter pelo menos 3 caracteres');
                return;
            }
            
            const evento = {
                titulo: titulo,
                descricao: document.getElementById('eventoDescricao')?.value || '',
                tipo: document.getElementById('eventoTipo')?.value || 'personalizado',
                cor: document.getElementById('eventoCor')?.value || '#3b82f6',
                dataInicio: dataInicio,
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
            
            // Se for admin e selecionou um professor
            if (this.usuario.role === 'admin' || this.usuario.role === 'super_admin') {
                const professorId = document.getElementById('eventoProfessor')?.value;
                if (professorId) {
                    evento.usuarioId = professorId;
                }
            }
            
            console.log('📤 Atualizando evento:', evento);
            
            const response = await fetch(`${this.apiBase}/eventos/${eventoId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(evento)
            });
            
            const data = await response.json();
            
            if (data.success) {
                alert('✅ Evento atualizado com sucesso!');
                this.fecharModal();
                await this.carregarEventos();
                this.renderizarCalendario();
            } else {
                throw new Error(data.error || 'Erro ao atualizar evento');
            }
            
        } catch (error) {
            console.error('❌ Erro:', error);
            alert('❌ ' + error.message);
        }
    }

    // ============ EXCLUIR EVENTO ============
    async excluirEvento(eventoId) {
        if (!confirm('Tem certeza que deseja excluir este evento?')) {
            return;
        }
        
        try {
            const token = localStorage.getItem('auth_token');
            
            console.log('🗑️ Excluindo evento:', eventoId);
            
            const response = await fetch(`${this.apiBase}/eventos/${eventoId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const contentType = response.headers.get('content-type');
            let data;
            
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                const text = await response.text();
                console.error('❌ Resposta não-JSON:', text);
                throw new Error('Resposta inválida do servidor');
            }
            
            if (data.success) {
                alert('✅ Evento excluído com sucesso!');
                this.fecharModal();
                await this.carregarEventos();
                this.renderizarCalendario();
            } else {
                throw new Error(data.error || 'Erro ao excluir evento');
            }
            
        } catch (error) {
            console.error('❌ Erro:', error);
            alert('❌ ' + error.message);
        }
    }

    // ============ MOSTRAR DETALHES DO EVENTO ============
    mostrarDetalhesEvento(evento) {
        const modalBody = document.getElementById('modalBody');
        const modalTitle = document.getElementById('modalTitle');
        const modalFooter = document.getElementById('modalFooter');
        
        if (!modalBody || !modalTitle || !modalFooter) {
            console.error('❌ Elementos do modal não encontrados');
            return;
        }
        
        modalTitle.innerHTML = `<i class="fas fa-calendar-check"></i> ${evento.title || 'Evento'}`;
        
        const dataInicio = evento.start ? new Date(evento.start).toLocaleDateString('pt-BR') : 'Data não disponível';
        const horaInicio = evento.horarioInicio || '--:--';
        const horaFim = evento.horarioFim || '--:--';
        
        // 🔥 VERIFICAR PERMISSÃO DE EDIÇÃO
        const podeEditar = this.usuario.role === 'admin' || 
                          this.usuario.role === 'super_admin' || 
                          (this.usuario.role === 'professor' && this.usuario.id === evento.criadoPor?.id);
        
        modalBody.innerHTML = `
            <div class="evento-detalhes">
                <div class="evento-header" style="border-left: 4px solid ${evento.cor || '#667eea'}; background: ${(evento.cor || '#667eea')}20;">
                    <div class="evento-tipo tipo-${evento.tipo || 'evento'}">
                        ${this.getIconeTipo(evento.tipo)} ${this.getNomeTipo(evento.tipo)}
                    </div>
                </div>
                
                <div class="detalhes-grid">
                    <div class="detalhe-item">
                        <i class="fas fa-calendar"></i>
                        <div>
                            <strong>Data:</strong> ${dataInicio}
                        </div>
                    </div>
                    
                    ${!evento.allDay ? `
                    <div class="detalhe-item">
                        <i class="fas fa-clock"></i>
                        <div>
                            <strong>Horário:</strong> ${horaInicio} - ${horaFim}
                        </div>
                    </div>
                    ` : ''}
                    
                    ${evento.local ? `
                    <div class="detalhe-item">
                        <i class="fas fa-map-marker-alt"></i>
                        <div>
                            <strong>Local:</strong> ${evento.local}
                        </div>
                    </div>
                    ` : ''}
                    
                    <div class="detalhe-item">
                        <i class="fas fa-user"></i>
                        <div>
                            <strong>Criado por:</strong> ${evento.criadoPor?.nome || 'Desconhecido'}
                            ${evento.criadoPor?.id === this.usuario.id ? ' (você)' : ''}
                        </div>
                    </div>
                    
                    ${evento.turma ? `
                    <div class="detalhe-item">
                        <i class="fas fa-school"></i>
                        <div>
                            <strong>Turma:</strong> ${evento.turma.nome}
                        </div>
                    </div>
                    ` : ''}
                    
                    ${evento.prova ? `
                    <div class="detalhe-item">
                        <i class="fas fa-file-alt"></i>
                        <div>
                            <strong>Prova:</strong> ${evento.prova.titulo}
                        </div>
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
        
        // Limpar footer
        modalFooter.innerHTML = '';
        
        // Botão Fechar
        const btnFechar = document.createElement('button');
        btnFechar.className = 'btn-cancel';
        btnFechar.innerHTML = 'Fechar';
        btnFechar.onclick = () => this.fecharModal();
        modalFooter.appendChild(btnFechar);
        
        // Botão Editar (se tiver permissão)
        if (podeEditar) {
            const btnEditar = document.createElement('button');
            btnEditar.className = 'btn-update';
            btnEditar.innerHTML = '<i class="fas fa-edit"></i> Editar';
            btnEditar.onclick = () => {
                this.abrirCriadorEvento(null, evento);
            };
            modalFooter.appendChild(btnEditar);
        }
        
        this.abrirModal();
    }

    getIconeTipo(tipo) {
        const icones = {
            'prova': '📝',
            'lembrete': '🔔',
            'feriado': '🎉',
            'reuniao': '👥',
            'prazo': '⏰',
            'evento': '📅',
            'personalizado': '📌'
        };
        return icones[tipo] || '📌';
    }

    getNomeTipo(tipo) {
        const nomes = {
            'prova': 'Prova',
            'lembrete': 'Lembrete',
            'feriado': 'Feriado',
            'reuniao': 'Reunião',
            'prazo': 'Prazo',
            'evento': 'Evento',
            'personalizado': 'Personalizado'
        };
        return nomes[tipo] || 'Evento';
    }

    abrirModal() {
        const modal = document.getElementById('modal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    fecharModal() {
        const modal = document.getElementById('modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }
}

// Criar instância global
const calendario = new CalendarioAcademico();
window.calendario = calendario;