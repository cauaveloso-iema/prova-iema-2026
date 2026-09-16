// js/substituicao-professores-module.js
// Módulo de Substituição de Professores - Setor Pedagógico

window.SubstituicaoProfessoresModule = {
    
    // ============================================
    // ESTADO
    // ============================================
    professores: [],
    turmas: [],
    substituicoes: [],
    relatorioAtual: null,
    charts: { motivos: null, horarios: null, dias: null, turmas: null },
    
    formData: {
        professorAusente: null,
        professorSubstituto: null,
        turma: '',
        data: '',
        horario: null,
        motivo: '',
        motivoDetalhes: '',
        observacoes: ''
    },
    
    editandoId: null,
    substituicaoParaImprimir: null,
    
    // ============================================
    // CONSTANTES
    // ============================================
    MOTIVOS_LABELS: {
        'falta_professor': 'Falta do Professor',
        'licenca_medica': 'Licença Médica',
        'licenca_maternidade_paternidade': 'Licença Maternidade/Paternidade',
        'capacitacao_formacao': 'Capacitação/Formação',
        'reuniao_externa': 'Reunião Externa',
        'problema_pessoal': 'Problema Pessoal',
        'atestado': 'Atestado',
        'outros': 'Outros'
    },
    
    MOTIVOS_CORES: {
        'falta_professor': '#ef4444',
        'licenca_medica': '#f59e0b',
        'licenca_maternidade_paternidade': '#8b5cf6',
        'capacitacao_formacao': '#3b82f6',
        'reuniao_externa': '#10b981',
        'problema_pessoal': '#f97316',
        'atestado': '#6b7280',
        'outros': '#64748b'
    },
    
    // ============================================
    // UTILITÁRIOS
    // ============================================
    getToken() {
        return localStorage.getItem('auth_token');
    },
    
    safeGet(id) {
        return document.getElementById(id);
    },
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    formatarTelefone(telefone) {
        if (!telefone) return 'Não informado';
        const limpo = telefone.replace(/\D/g, '');
        if (limpo.length === 11) return limpo.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
        if (limpo.length === 10) return limpo.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
        return telefone;
    },
    
    mostrarToast(mensagem, tipo = 'info') {
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
        
        const toast = document.createElement('div');
        toast.className = `sp-toast ${tipo}`;
        toast.innerHTML = `
            <i class="fas ${icons[tipo]}"></i>
            <span>${mensagem}</span>
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    },
    
    atualizarHorarioPreenchimento() {
        const el = this.safeGet('horarioPreenchimentoSubstituicao');
        if (el) {
            el.textContent = new Date().toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
        }
    },
    
    // ============================================
    // CARREGAR PROFESSORES
    // ============================================
    async carregarProfessores() {
        try {
            const response = await fetch('/api/substituicao-professor/professores', {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();
            
            if (data.success) {
                this.professores = data.professores;
                this.renderizarListaProfessores(this.professores, 'listaProfessoresAusentes', 'ausente');
                this.renderizarListaProfessores(this.professores, 'listaProfessoresSubstitutos', 'substituto');
            }
        } catch (error) {
            console.error('Erro ao carregar professores:', error);
            this.mostrarToast('Erro ao carregar professores', 'error');
        }
    },
    
    renderizarListaProfessores(lista, containerId, tipo) {
        const container = this.safeGet(containerId);
        if (!container) return;
        
        if (lista.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-slash"></i>
                    <p>Nenhum professor encontrado</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = lista.map(p => `
            <div class="professor-item" data-id="${p.id}" data-tipo="${tipo}" 
                 onclick="SubstituicaoProfessoresModule.selecionarProfessor('${p.id}', '${tipo}')">
                <div class="professor-avatar">${(p.nome || '?').charAt(0).toUpperCase()}</div>
                <div class="professor-info">
                    <div class="professor-nome">${this.escapeHtml(p.nome)}</div>
                    <div class="professor-detalhes">
                        <span><i class="fas fa-envelope"></i> ${this.escapeHtml(p.email || 'Sem email')}</span>
                        <span><i class="fas fa-phone"></i> ${this.formatarTelefone(p.telefone)}</span>
                        <span><i class="fas fa-sitemap"></i> ${this.escapeHtml(p.eixo || 'Sem eixo')}</span>
                    </div>
                </div>
            </div>
        `).join('');
    },
    
    filtrarProfessores(termo, containerId, tipo) {
        const termoLower = (termo || '').toLowerCase();
        let filtrados = this.professores;
        
        if (termoLower) {
            filtrados = this.professores.filter(p =>
                (p.nome || '').toLowerCase().includes(termoLower) ||
                (p.email || '').toLowerCase().includes(termoLower) ||
                (p.matricula || '').toLowerCase().includes(termoLower)
            );
        }
        
        if (tipo === 'substituto' && this.formData.professorAusente) {
            filtrados = filtrados.filter(p => p.id !== this.formData.professorAusente.id);
        }
        
        this.renderizarListaProfessores(filtrados, containerId, tipo);
    },
    
    selecionarProfessor(id, tipo) {
        const professor = this.professores.find(p => p.id === id);
        if (!professor) return;
        
        if (tipo === 'ausente') {
            if (this.formData.professorSubstituto && this.formData.professorSubstituto.id === id) {
                this.formData.professorSubstituto = null;
            }
            this.formData.professorAusente = professor;
            
            document.querySelectorAll('#listaProfessoresAusentes .professor-item').forEach(el => {
                el.classList.toggle('selected', el.dataset.id === id);
            });
            
            this.safeGet('cardProfessorSubstituto').style.display = 'block';
            this.atualizarResumo();
            
            const busca = this.safeGet('buscaProfessorSubstituto')?.value || '';
            this.filtrarProfessores(busca, 'listaProfessoresSubstitutos', 'substituto');
            
            this.safeGet('cardProfessorSubstituto').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            if (this.formData.professorAusente && this.formData.professorAusente.id === id) {
                this.mostrarToast('O substituto deve ser diferente do ausente', 'warning');
                return;
            }
            
            this.formData.professorSubstituto = professor;
            
            document.querySelectorAll('#listaProfessoresSubstitutos .professor-item').forEach(el => {
                el.classList.toggle('selected', el.dataset.id === id);
            });
            
            this.safeGet('cardDetalhes').style.display = 'block';
            this.atualizarResumo();
            
            this.safeGet('cardDetalhes').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    },
    
    atualizarResumo() {
        const ausente = this.safeGet('resumoProfessorAusente');
        const substituto = this.safeGet('resumoProfessorSubstituto');
        if (ausente) ausente.textContent = this.formData.professorAusente?.nome || '-';
        if (substituto) substituto.textContent = this.formData.professorSubstituto?.nome || '-';
    },
    
    // ============================================
    // CARREGAR TURMAS
    // ============================================
    async carregarTurmas() {
        try {
            const response = await fetch('/api/substituicao-professor/turmas', {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();
            
            if (data.success) {
                this.turmas = data.turmas;
                const options = this.turmas.map(t => `<option value="${this.escapeHtml(t)}">${this.escapeHtml(t)}</option>`).join('');
                
                const selectTurma = this.safeGet('selectTurmaSubstituicao');
                if (selectTurma) selectTurma.innerHTML = '<option value="">Selecione a turma...</option>' + options;
                
                const filtroTurma = this.safeGet('filtroTurmaSubstituicao');
                if (filtroTurma) filtroTurma.innerHTML = '<option value="">Todas as turmas</option>' + options;
                
                const relTurma = this.safeGet('relatorioTurmaSubstituicao');
                if (relTurma) relTurma.innerHTML = '<option value="">Todas as turmas</option>' + options;
            }
        } catch (error) {
            console.error('Erro ao carregar turmas:', error);
        }
    },
    
    // ============================================
    // SELEÇÃO DE HORÁRIO
    // ============================================
    selecionarHorario(horario) {
        this.formData.horario = horario;
        const input = this.safeGet('inputHorarioSubstituicao');
        if (input) input.value = horario;
        
        document.querySelectorAll('.horario-card').forEach(card => {
            card.classList.toggle('selected', parseInt(card.dataset.horario) === horario);
        });
    },
    
    atualizarMotivoDetalhes() {
        const motivo = this.safeGet('selectMotivoSubstituicao')?.value;
        const grupo = this.safeGet('grupoMotivoDetalhesSubstituicao');
        
        if (motivo === 'outros') {
            grupo?.style.setProperty('display', 'block');
        } else {
            grupo?.style.setProperty('display', 'none');
            const input = this.safeGet('inputMotivoDetalhesSubstituicao');
            if (input) input.value = '';
        }
    },
    
    // ============================================
    // REGISTRAR SUBSTITUIÇÃO
    // ============================================
    async registrarSubstituicao() {
        if (!this.formData.professorAusente) { this.mostrarToast('Selecione o professor ausente', 'warning'); return; }
        if (!this.formData.professorSubstituto) { this.mostrarToast('Selecione o professor substituto', 'warning'); return; }
        if (!this.formData.turma) { this.mostrarToast('Selecione a turma', 'warning'); return; }
        if (!this.formData.data) { this.mostrarToast('Informe a data', 'warning'); return; }
        if (!this.formData.horario) { this.mostrarToast('Selecione o horário', 'warning'); return; }
        if (!this.formData.motivo) { this.mostrarToast('Selecione o motivo', 'warning'); return; }
        
        const btn = this.safeGet('btnRegistrarSubstituicao');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Registrando...';
        }
        
        try {
            const response = await fetch('/api/substituicao-professor/registrar', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    professorAusenteId: this.formData.professorAusente.id,
                    professorSubstitutoId: this.formData.professorSubstituto.id,
                    turma: this.formData.turma,
                    horario: this.formData.horario,
                    data: this.formData.data,
                    motivo: this.formData.motivo,
                    motivoDetalhes: this.formData.motivoDetalhes,
                    observacoes: this.formData.observacoes
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.mostrarToast('✅ Substituição registrada!', 'success');
                this.resetarFormulario();
                await this.carregarListaSubstituicoes();
                await this.carregarDashboard();
                
                // Trocar para tab lista
                const listaTab = this.safeGet('sp-lista-tab');
                if (listaTab) new bootstrap.Tab(listaTab).show();
            } else {
                throw new Error(data.error || 'Erro ao registrar');
            }
        } catch (error) {
            console.error('Erro:', error);
            this.mostrarToast(error.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save me-2"></i> Registrar Substituição';
            }
        }
    },
    
    resetarFormulario() {
        const hoje = new Date().toISOString().split('T')[0];
        this.formData = {
            professorAusente: null,
            professorSubstituto: null,
            turma: '',
            data: hoje,
            horario: null,
            motivo: '',
            motivoDetalhes: '',
            observacoes: ''
        };
        
        const inputData = this.safeGet('inputDataSubstituicao');
        if (inputData) inputData.value = hoje;
        
        const selectTurma = this.safeGet('selectTurmaSubstituicao');
        if (selectTurma) selectTurma.value = '';
        
        const selectMotivo = this.safeGet('selectMotivoSubstituicao');
        if (selectMotivo) selectMotivo.value = '';
        
        const inputDetalhes = this.safeGet('inputMotivoDetalhesSubstituicao');
        if (inputDetalhes) inputDetalhes.value = '';
        
        const inputObs = this.safeGet('inputObservacoesSubstituicao');
        if (inputObs) inputObs.value = '';
        
        const inputHorario = this.safeGet('inputHorarioSubstituicao');
        if (inputHorario) inputHorario.value = '';
        
        document.querySelectorAll('.professor-item').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.horario-card').forEach(el => el.classList.remove('selected'));
        
        this.safeGet('cardProfessorSubstituto').style.display = 'none';
        this.safeGet('cardDetalhes').style.display = 'none';
        this.safeGet('grupoMotivoDetalhesSubstituicao').style.display = 'none';
        
        const buscaAusente = this.safeGet('buscaProfessorAusente');
        if (buscaAusente) buscaAusente.value = '';
        
        const buscaSubstituto = this.safeGet('buscaProfessorSubstituto');
        if (buscaSubstituto) buscaSubstituto.value = '';
        
        this.renderizarListaProfessores(this.professores, 'listaProfessoresAusentes', 'ausente');
        this.renderizarListaProfessores(this.professores, 'listaProfessoresSubstitutos', 'substituto');
        
        this.atualizarResumo();
    },
    
    // ============================================
    // LISTAR SUBSTITUIÇÕES
    // ============================================
    async carregarListaSubstituicoes() {
        const container = this.safeGet('listaSubstituicoes');
        if (!container) return;
        
        container.innerHTML = '<div class="text-center py-3"><div class="loading"></div><p>Carregando...</p></div>';
        
        try {
            const params = new URLSearchParams();
            const mes = this.safeGet('filtroMesSubstituicao')?.value;
            const busca = this.safeGet('filtroBuscaSubstituicao')?.value;
            const turma = this.safeGet('filtroTurmaSubstituicao')?.value;
            const motivo = this.safeGet('filtroMotivoSubstituicao')?.value;
            
            if (mes) params.append('mes', mes);
            if (busca) params.append('busca', busca);
            if (turma) params.append('turma', turma);
            if (motivo) params.append('motivo', motivo);
            
            const response = await fetch(`/api/substituicao-professor/listar?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();
            
            if (data.success) {
                this.substituicoes = data.substituicoes;
                this.renderizarLista(data.substituicoes);
                
                const contador = this.safeGet('contadorListaSubstituicoes');
                if (contador) contador.textContent = `${data.total} registro${data.total !== 1 ? 's' : ''}`;
                
                const badge = this.safeGet('badgeTotalSubstituicoes');
                if (badge) badge.textContent = data.total;
            }
        } catch (error) {
            console.error('Erro:', error);
            container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar</p></div>';
        }
    },
    
    renderizarLista(lista) {
        const container = this.safeGet('listaSubstituicoes');
        if (!container) return;
        
        if (lista.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <h4>Nenhuma substituição encontrada</h4>
                    <p>Registre a primeira substituição ou ajuste os filtros.</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = `
            <div class="table-responsive">
                <table class="table-custom">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Horário</th>
                            <th>Professor Ausente</th>
                            <th>Professor Substituto</th>
                            <th>Turma</th>
                            <th>Motivo</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lista.map(s => `
                            <tr>
                                <td>
                                    <strong>${s.dataFormatada}</strong>
                                    <br><small style="color:#6b7280;">${s.diaSemana}</small>
                                </td>
                                <td><span class="badge-custom badge-primary">${s.horario}º</span></td>
                                <td>
                                    <strong>${this.escapeHtml(s.professorAusente.nome)}</strong>
                                    <br><small style="color:#6b7280;">${this.escapeHtml(s.professorAusente.eixo || '')}</small>
                                </td>
                                <td>
                                    <strong>${this.escapeHtml(s.professorSubstituto.nome)}</strong>
                                    <br><small style="color:#6b7280;">${this.escapeHtml(s.professorSubstituto.eixo || '')}</small>
                                </td>
                                <td><span class="badge-custom badge-gray">${this.escapeHtml(s.turma)}</span></td>
                                <td>
                                    <span class="badge-custom" style="background:${this.MOTIVOS_CORES[s.motivo]}20; color:${this.MOTIVOS_CORES[s.motivo]};">
                                        ${this.MOTIVOS_LABELS[s.motivo] || s.motivo}
                                    </span>
                                </td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn-action btn-view" onclick="SubstituicaoProfessoresModule.verDetalhes('${s.id}')" title="Ver">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn-action btn-edit" onclick="SubstituicaoProfessoresModule.abrirEdicao('${s.id}')" title="Editar">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn-action btn-print" onclick="SubstituicaoProfessoresModule.imprimirSubstituicao('${s.id}')" title="Imprimir">
                                            <i class="fas fa-print"></i>
                                        </button>
                                        <button class="btn-action btn-delete" onclick="SubstituicaoProfessoresModule.excluirSubstituicao('${s.id}')" title="Excluir">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },
    
    limparFiltros() {
        const mes = this.safeGet('filtroMesSubstituicao');
        if (mes) mes.value = new Date().toISOString().substring(0, 7);
        
        const busca = this.safeGet('filtroBuscaSubstituicao');
        if (busca) busca.value = '';
        
        const turma = this.safeGet('filtroTurmaSubstituicao');
        if (turma) turma.value = '';
        
        const motivo = this.safeGet('filtroMotivoSubstituicao');
        if (motivo) motivo.value = '';
        
        this.carregarListaSubstituicoes();
    },
    
    // ============================================
    // VER DETALHES
    // ============================================
    async verDetalhes(id) {
        try {
            const response = await fetch(`/api/substituicao-professor/${id}`, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();
            
            if (!data.success) { this.mostrarToast('Não encontrada', 'error'); return; }
            
            const s = data.substituicao;
            this.substituicaoParaImprimir = s;
            
            // Criar modal se não existir
            let modal = this.safeGet('modalSpDetalhes');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'modalSpDetalhes';
                modal.className = 'modal fade';
                modal.innerHTML = `
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header" style="background: linear-gradient(135deg, #1e3c72, #2a5298); color: white;">
                                <h5 class="modal-title"><i class="fas fa-eye me-2"></i> Detalhes da Substituição</h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body" id="modalSpDetalhesBody"></div>
                            <div class="modal-footer">
                                <button class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                                <button class="btn btn-primary" onclick="SubstituicaoProfessoresModule.imprimirSubstituicaoAtual()">
                                    <i class="fas fa-print me-2"></i> Imprimir
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
            }
            
            const body = this.safeGet('modalSpDetalhesBody');
            body.innerHTML = `
                <div class="detalhe-atendimento">
                    <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 15px; align-items: center; background: #f0f4ff; padding: 20px; border-radius: 12px;">
                        <div style="text-align: center;">
                            <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">AUSENTE</div>
                            <div style="font-weight: 700; font-size: 16px;">${this.escapeHtml(s.professorAusenteNome)}</div>
                            <div style="font-size: 12px; color: #6b7280; margin-top: 5px;">
                                ${this.escapeHtml(s.professorAusenteEmail || '')}<br>
                                ${this.escapeHtml(s.professorAusenteEixo || '')}
                            </div>
                        </div>
                        <div style="font-size: 24px; color: #1e3c72;"><i class="fas fa-arrow-right"></i></div>
                        <div style="text-align: center;">
                            <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">SUBSTITUTO</div>
                            <div style="font-weight: 700; font-size: 16px;">${this.escapeHtml(s.professorSubstitutoNome)}</div>
                            <div style="font-size: 12px; color: #6b7280; margin-top: 5px;">
                                ${this.escapeHtml(s.professorSubstitutoEmail || '')}<br>
                                ${this.escapeHtml(s.professorSubstitutoEixo || '')}
                            </div>
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 20px;">
                        <div class="info-row">
                            <div class="info-label">Turma:</div>
                            <div class="info-value">${this.escapeHtml(s.turma)}</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Horário:</div>
                            <div class="info-value">${s.horario}º Horário</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Data:</div>
                            <div class="info-value">${new Date(s.data + 'T12:00:00').toLocaleDateString('pt-BR')} (${s.diaSemana})</div>
                        </div>
                        <div class="info-row">
                            <div class="info-label">Motivo:</div>
                            <div class="info-value">${this.MOTIVOS_LABELS[s.motivo] || s.motivo}</div>
                        </div>
                    </div>
                    
                    ${s.motivoDetalhes ? `
                        <div class="info-row" style="margin-top: 15px;">
                            <div class="info-label">Detalhes:</div>
                            <div class="info-value">${this.escapeHtml(s.motivoDetalhes)}</div>
                        </div>
                    ` : ''}
                    
                    ${s.observacoes ? `
                        <div style="margin-top: 15px;">
                            <div class="info-label" style="margin-bottom: 5px;">Observações:</div>
                            <div style="background: #f9fafb; padding: 15px; border-radius: 10px;">
                                ${this.escapeHtml(s.observacoes).replace(/\n/g, '<br>')}
                            </div>
                        </div>
                    ` : ''}
                    
                    <div style="background: #f0fdf4; padding: 15px; border-radius: 10px; margin-top: 20px; font-size: 13px;">
                        <i class="fas fa-user-check" style="color: #10b981;"></i>
                        Registrado por <strong>${this.escapeHtml(s.registradoPorNome)}</strong>
                        em ${new Date(s.registradoEm).toLocaleString('pt-BR')}
                    </div>
                </div>
            `;
            
            const modalInstance = new bootstrap.Modal(modal);
            modalInstance.show();
        } catch (error) {
            console.error('Erro:', error);
            this.mostrarToast('Erro ao carregar detalhes', 'error');
        }
    },
    
    // ============================================
    // EDITAR
    // ============================================
    async abrirEdicao(id) {
        try {
            const response = await fetch(`/api/substituicao-professor/${id}`, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();
            
            if (!data.success) return;
            
            const s = data.substituicao;
            this.editandoId = id;
            
            let modal = this.safeGet('modalSpEditar');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'modalSpEditar';
                modal.className = 'modal fade';
                modal.innerHTML = `
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white;">
                                <h5 class="modal-title"><i class="fas fa-edit me-2"></i> Editar Substituição</h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body" id="modalSpEditarBody"></div>
                            <div class="modal-footer">
                                <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                                <button class="btn btn-primary" onclick="SubstituicaoProfessoresModule.salvarEdicao()">
                                    <i class="fas fa-save me-2"></i> Salvar
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
            }
            
            const turmasOptions = this.turmas.map(t => 
                `<option value="${this.escapeHtml(t)}" ${t === s.turma ? 'selected' : ''}>${this.escapeHtml(t)}</option>`
            ).join('');
            
            let horariosHTML = '';
            for (let i = 1; i <= 9; i++) {
                horariosHTML += `
                    <div class="horario-card ${s.horario === i ? 'selected' : ''}" 
                         data-horario="${i}" onclick="SubstituicaoProfessoresModule.selecionarHorarioEdicao(${i})">
                        <div class="horario-numero">${i}º</div>
                        <div class="horario-label">Horário</div>
                    </div>
                `;
            }
            
            const motivosOptions = Object.entries(this.MOTIVOS_LABELS).map(([key, label]) =>
                `<option value="${key}" ${s.motivo === key ? 'selected' : ''}>${label}</option>`
            ).join('');
            
            const body = this.safeGet('modalSpEditarBody');
            body.innerHTML = `
                <div class="row g-3">
                    <div class="col-md-6">
                        <label class="form-label">Turma</label>
                        <select id="editTurma" class="form-select">${turmasOptions}</select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Data</label>
                        <input type="date" id="editData" class="form-control" value="${s.data}">
                    </div>
                </div>
                
                <div class="mt-3">
                    <label class="form-label">Horário</label>
                    <div class="horarios-grid" id="editHorariosGrid">${horariosHTML}</div>
                    <input type="hidden" id="editHorario" value="${s.horario}">
                </div>
                
                <div class="row g-3 mt-3">
                    <div class="col-md-6">
                        <label class="form-label">Motivo</label>
                        <select id="editMotivo" class="form-select">${motivosOptions}</select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Detalhes do Motivo</label>
                        <input type="text" id="editMotivoDetalhes" class="form-control" 
                            value="${this.escapeHtml(s.motivoDetalhes || '')}">
                    </div>
                </div>
                
                <div class="mt-3">
                    <label class="form-label">Observações</label>
                    <textarea id="editObservacoes" class="form-control" rows="3">${this.escapeHtml(s.observacoes || '')}</textarea>
                </div>
            `;
            
            new bootstrap.Modal(modal).show();
        } catch (error) {
            console.error('Erro:', error);
        }
    },
    
    selecionarHorarioEdicao(horario) {
        this.safeGet('editHorario').value = horario;
        document.querySelectorAll('#editHorariosGrid .horario-card').forEach(card => {
            card.classList.toggle('selected', parseInt(card.dataset.horario) === horario);
        });
    },
    
    async salvarEdicao() {
        if (!this.editandoId) return;
        
        const dados = {
            turma: this.safeGet('editTurma').value,
            data: this.safeGet('editData').value,
            horario: parseInt(this.safeGet('editHorario').value),
            motivo: this.safeGet('editMotivo').value,
            motivoDetalhes: this.safeGet('editMotivoDetalhes').value,
            observacoes: this.safeGet('editObservacoes').value
        };
        
        if (!dados.turma || !dados.data || !dados.horario || !dados.motivo) {
            this.mostrarToast('Preencha os campos obrigatórios', 'warning');
            return;
        }
        
        try {
            const response = await fetch(`/api/substituicao-professor/${this.editandoId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dados)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.mostrarToast('✅ Atualizada!', 'success');
                bootstrap.Modal.getInstance(this.safeGet('modalSpEditar'))?.hide();
                await this.carregarListaSubstituicoes();
                await this.carregarDashboard();
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            this.mostrarToast(error.message, 'error');
        }
    },
    
    // ============================================
    // EXCLUIR
    // ============================================
    async excluirSubstituicao(id) {
        if (!confirm('⚠️ Tem certeza que deseja excluir?\n\nEsta ação não pode ser desfeita.')) return;
        
        try {
            const response = await fetch(`/api/substituicao-professor/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.mostrarToast('✅ Excluída!', 'success');
                await this.carregarListaSubstituicoes();
                await this.carregarDashboard();
            }
        } catch (error) {
            this.mostrarToast('Erro ao excluir', 'error');
        }
    },
    
    // ============================================
    // IMPRIMIR
    // ============================================
    async imprimirSubstituicao(id) {
        try {
            const response = await fetch(`/api/substituicao-professor/${id}`, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();
            if (data.success) this.gerarImpressao(data.substituicao);
        } catch (error) {
            this.mostrarToast('Erro ao imprimir', 'error');
        }
    },
    
    imprimirSubstituicaoAtual() {
        if (this.substituicaoParaImprimir) this.gerarImpressao(this.substituicaoParaImprimir);
    },
    
    gerarImpressao(s) {
        const dataExt = new Date(s.data + 'T12:00:00').toLocaleDateString('pt-BR', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        
        const html = `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>Substituição - ${s.professorAusenteNome}</title>
                <style>
                    @page { size: A4 portrait; margin: 15mm; }
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: 'Times New Roman', serif; font-size: 11pt; line-height: 1.5; }
                    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                    .header h1 { font-size: 14pt; text-transform: uppercase; }
                    .titulo { text-align: center; font-size: 14pt; font-weight: bold; background: #f0f0f0; padding: 10px; border: 2px solid #000; margin: 20px 0; }
                    .section-title { font-size: 11pt; font-weight: bold; background: #e8e8e8; padding: 5px 10px; border-left: 4px solid #1e3c72; margin: 15px 0 10px; }
                    .professores-box { display: flex; align-items: center; gap: 20px; border: 1px solid #000; padding: 15px; margin: 15px 0; }
                    .professor { flex: 1; text-align: center; }
                    .professor-role { font-size: 9pt; text-transform: uppercase; color: #666; margin-bottom: 5px; }
                    .professor-nome { font-size: 12pt; font-weight: bold; }
                    .professor-detalhes { font-size: 10pt; color: #444; margin-top: 3px; }
                    .arrow { font-size: 20pt; color: #1e3c72; }
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 15px 0; }
                    .info-item { border-bottom: 1px dotted #666; padding: 5px 0; }
                    .info-label { font-weight: bold; font-size: 10pt; }
                    .info-value { font-size: 11pt; }
                    .observacoes { border: 1px solid #000; padding: 10px; min-height: 60px; margin-top: 10px; }
                    .assinaturas { display: flex; justify-content: space-around; margin-top: 50px; gap: 40px; }
                    .assinatura { flex: 1; text-align: center; }
                    .assinatura-linha { border-top: 1px solid #000; padding-top: 5px; font-size: 10pt; }
                    .footer { text-align: center; margin-top: 30px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 8pt; color: #666; }
                    .registro-info { font-size: 9pt; color: #666; margin-top: 20px; text-align: center; }
                    .btn-print { display: block; margin: 20px auto; padding: 12px 30px; background: #1e3c72; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 14px; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
                
                <div class="header">
                    <h1>IEMA Pleno: São Luís - Centro</h1>
                    <h2 style="font-weight: normal; font-size: 12pt; margin-top: 5px;">Sistema de Substituição de Professores</h2>
                </div>
                
                <div class="titulo">📋 Registro de Substituição</div>
                
                <div class="section-title">👥 Professores Envolvidos</div>
                <div class="professores-box">
                    <div class="professor">
                        <div class="professor-role">Professor Ausente</div>
                        <div class="professor-nome">${s.professorAusenteNome}</div>
                        <div class="professor-detalhes">${s.professorAusenteEmail || ''}<br>${s.professorAusenteEixo || ''}</div>
                    </div>
                    <div class="arrow">➜</div>
                    <div class="professor">
                        <div class="professor-role">Professor Substituto</div>
                        <div class="professor-nome">${s.professorSubstitutoNome}</div>
                        <div class="professor-detalhes">${s.professorSubstitutoEmail || ''}<br>${s.professorSubstitutoEixo || ''}</div>
                    </div>
                </div>
                
                <div class="section-title">📚 Informações da Aula</div>
                <div class="info-grid">
                    <div class="info-item"><div class="info-label">Turma:</div><div class="info-value">${s.turma}</div></div>
                    <div class="info-item"><div class="info-label">Horário:</div><div class="info-value">${s.horario}º Horário</div></div>
                    <div class="info-item"><div class="info-label">Data:</div><div class="info-value">${dataExt}</div></div>
                    <div class="info-item"><div class="info-label">Dia da Semana:</div><div class="info-value">${s.diaSemana}</div></div>
                </div>
                
                <div class="section-title">📝 Motivo</div>
                <div class="info-item"><div class="info-value"><strong>${this.MOTIVOS_LABELS[s.motivo] || s.motivo}</strong></div></div>
                ${s.motivoDetalhes ? `<div style="margin-top:10px; font-size:10pt;"><strong>Detalhes:</strong> ${s.motivoDetalhes}</div>` : ''}
                
                ${s.observacoes ? `
                    <div class="section-title">💬 Observações</div>
                    <div class="observacoes">${s.observacoes.replace(/\n/g, '<br>')}</div>
                ` : ''}
                
                <div class="assinaturas">
                    <div class="assinatura"><div class="assinatura-linha">Professor Substituto</div></div>
                    <div class="assinatura"><div class="assinatura-linha">Coordenação / Setor Pedagógico</div></div>
                </div>
                
                <div class="registro-info">
                    Registrado por <strong>${s.registradoPorNome}</strong> em ${new Date(s.registradoEm).toLocaleString('pt-BR')}
                </div>
                
                <div class="footer">
                    <p>Documento gerado automaticamente pelo Sistema de Provas IEMA</p>
                </div>
            </body>
            </html>
        `;
        
        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    },
    
    // ============================================
    // DASHBOARD
    // ============================================
    async carregarDashboard() {
        try {
            const mes = this.safeGet('dashboardMesSubstituicao')?.value || new Date().toISOString().substring(0, 7);
            
            const response = await fetch(`/api/substituicao-professor/dashboard/resumo?mes=${mes}`, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();
            
            if (!data.success) return;
            
            const setVal = (id, val) => { const el = this.safeGet(id); if (el) el.textContent = val; };
            setVal('spStatTotalMes', data.resumo.totalMes || 0);
            setVal('spStatProfessoresAusentes', data.professoresMaisAusentes.length || 0);
            setVal('spStatProfessoresSubstitutos', data.professoresMaisSubstituiram.length || 0);
            setVal('spStatMediaDiaria', data.resumo.mediaDiaria || 0);
            
            this.renderizarGraficos(data, mes);
            this.renderizarRankings(data);
            this.renderizarUltimas(data.ultimasSubstituicoes);
        } catch (error) {
            console.error('Erro no dashboard:', error);
        }
    },
    
    renderizarGraficos(data, mes) {
        // Motivos
        const ctxMotivos = this.safeGet('spChartMotivos');
        if (ctxMotivos) {
            if (this.charts.motivos) this.charts.motivos.destroy();
            this.charts.motivos = new Chart(ctxMotivos.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: data.porMotivo.map(d => d.label),
                    datasets: [{
                        data: data.porMotivo.map(d => d.count),
                        backgroundColor: data.porMotivo.map(d => this.MOTIVOS_CORES[d.motivo] || '#64748b')
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } }
            });
        }
        
        // Horários
        const ctxHorarios = this.safeGet('spChartHorarios');
        if (ctxHorarios) {
            if (this.charts.horarios) this.charts.horarios.destroy();
            const horarios = [];
            for (let i = 1; i <= 9; i++) {
                const enc = data.porHorario.find(d => d.horario === i);
                horarios.push(enc ? enc.count : 0);
            }
            this.charts.horarios = new Chart(ctxHorarios.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: ['1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º', '9º'],
                    datasets: [{ label: 'Substituições', data: horarios, backgroundColor: '#1e3c72', borderRadius: 8 }]
                },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }
            });
        }
        
        // Dias
        const ctxDias = this.safeGet('spChartDias');
        if (ctxDias) {
            if (this.charts.dias) this.charts.dias.destroy();
            const [ano, mesNum] = mes.split('-').map(Number);
            const ultimoDia = new Date(ano, mesNum, 0).getDate();
            const labels = [], valores = [];
            for (let i = 1; i <= ultimoDia; i++) {
                labels.push(i);
                const diaStr = `${mes}-${String(i).padStart(2, '0')}`;
                const enc = data.substituicoesPorDia.find(d => d.data === diaStr);
                valores.push(enc ? enc.count : 0);
            }
            this.charts.dias = new Chart(ctxDias.getContext('2d'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Substituições', data: valores,
                        borderColor: '#1e3c72', backgroundColor: 'rgba(30, 60, 114, 0.1)',
                        fill: true, tension: 0.4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }
            });
        }
        
        // Turmas
        const ctxTurmas = this.safeGet('spChartTurmas');
        if (ctxTurmas) {
            if (this.charts.turmas) this.charts.turmas.destroy();
            this.charts.turmas = new Chart(ctxTurmas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: data.porTurma.map(d => d.turma),
                    datasets: [{ label: 'Substituições', data: data.porTurma.map(d => d.count), backgroundColor: '#8b5cf6', borderRadius: 8 }]
                },
                options: { responsive: true, maintainAspectRatio: true, indexAxis: 'y', plugins: { legend: { display: false } } }
            });
        }
    },
    
    renderizarRankings(data) {
        const render = (containerId, dados) => {
            const container = this.safeGet(containerId);
            if (!container) return;
            
            if (dados.length === 0) {
                container.innerHTML = '<p style="text-align:center;color:#6b7280;">Nenhum dado</p>';
                return;
            }
            
            container.innerHTML = dados.map((p, i) => {
                const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
                return `
                    <div class="ranking-item">
                        <div class="ranking-position ${posClass}">${i + 1}</div>
                        <div class="ranking-info">
                            <div class="ranking-nome">${this.escapeHtml(p.nome)}</div>
                            <div class="ranking-detalhes">${this.escapeHtml(p.eixo || 'Sem eixo')}</div>
                        </div>
                        <div class="ranking-count">${p.count}</div>
                    </div>
                `;
            }).join('');
        };
        
        render('spRankingAusentes', data.professoresMaisAusentes);
        render('spRankingSubstitutos', data.professoresMaisSubstituiram);
    },
    
    renderizarUltimas(lista) {
        const container = this.safeGet('spUltimasSubstituicoes');
        if (!container) return;
        
        if (lista.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#6b7280;">Nenhuma substituição recente</p>';
            return;
        }
        
        container.innerHTML = `
            <div class="table-responsive">
                <table class="table-custom">
                    <thead>
                        <tr><th>Data</th><th>Horário</th><th>Ausente</th><th>Substituto</th><th>Turma</th></tr>
                    </thead>
                    <tbody>
                        ${lista.map(s => `
                            <tr>
                                <td>${new Date(s.data + 'T12:00:00').toLocaleDateString('pt-BR')}</td>
                                <td>${s.horario}º</td>
                                <td>${this.escapeHtml(s.professorAusenteNome)}</td>
                                <td>${this.escapeHtml(s.professorSubstitutoNome)}</td>
                                <td>${this.escapeHtml(s.turma)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },
    
    // ============================================
    // RELATÓRIO
    // ============================================
    async gerarRelatorio() {
        const container = this.safeGet('resultadoRelatorioSubstituicoes');
        if (!container) return;
        
        container.innerHTML = '<div class="text-center py-5"><div class="loading"></div><p>Gerando relatório...</p></div>';
        
        try {
            const params = new URLSearchParams();
            const mes = this.safeGet('relatorioMesSubstituicao')?.value;
            const dataInicio = this.safeGet('relatorioDataInicioSubstituicao')?.value;
            const dataFim = this.safeGet('relatorioDataFimSubstituicao')?.value;
            const turma = this.safeGet('relatorioTurmaSubstituicao')?.value;
            const motivo = this.safeGet('relatorioMotivoSubstituicao')?.value;
            
            if (mes) params.append('mes', mes);
            if (dataInicio) params.append('dataInicio', dataInicio);
            if (dataFim) params.append('dataFim', dataFim);
            if (turma) params.append('turma', turma);
            if (motivo) params.append('motivo', motivo);
            
            const response = await fetch(`/api/substituicao-professor/relatorio/gerar?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();
            
            if (!data.success) throw new Error(data.error);
            
            this.relatorioAtual = data;
            
            this.safeGet('btnExportarCSVSubstituicao').disabled = false;
            this.safeGet('btnImprimirRelatorioSubstituicao').disabled = false;
            
            let html = `
                <div class="card">
                    <div class="card-body">
                        <h6><i class="fas fa-chart-bar me-2"></i> Resultado do Relatório</h6>
                        <div class="metric-card" style="margin: 15px 0;">
                            <div class="metric-value">${data.total}</div>
                            <div class="metric-label">Total de Substituições</div>
                        </div>
            `;
            
            if (Object.keys(data.estatisticas.porMotivo).length > 0) {
                html += `<h6 style="margin-top:20px;">Por Motivo</h6><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">`;
                Object.entries(data.estatisticas.porMotivo).forEach(([k, v]) => {
                    html += `<span class="badge-custom badge-gray" style="padding:8px 14px;">${k}: <strong>${v}</strong></span>`;
                });
                html += `</div>`;
            }
            
            if (Object.keys(data.estatisticas.porTurma).length > 0) {
                html += `<h6 style="margin-top:20px;">Por Turma</h6><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">`;
                Object.entries(data.estatisticas.porTurma).forEach(([k, v]) => {
                    html += `<span class="badge-custom badge-primary" style="padding:8px 14px;">${k}: <strong>${v}</strong></span>`;
                });
                html += `</div>`;
            }
            
            if (data.substituicoes.length > 0) {
                html += `
                    <h6 style="margin-top:20px;">Detalhamento</h6>
                    <div class="table-responsive" style="margin-top:10px;">
                        <table class="table-custom">
                            <thead>
                                <tr>
                                    <th>Data</th><th>Horário</th><th>Ausente</th>
                                    <th>Substituto</th><th>Turma</th><th>Motivo</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.substituicoes.map(s => `
                                    <tr>
                                        <td>${s.dataFormatada}</td>
                                        <td>${s.horario}º</td>
                                        <td>${this.escapeHtml(s.professorAusenteNome)}</td>
                                        <td>${this.escapeHtml(s.professorSubstitutoNome)}</td>
                                        <td>${this.escapeHtml(s.turma)}</td>
                                        <td>${this.escapeHtml(s.motivoLabel)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }
            
            html += `</div></div>`;
            container.innerHTML = html;
            
        } catch (error) {
            console.error(error);
            container.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><h4>Erro</h4><p>${error.message}</p></div>`;
        }
    },
    
    exportarCSV() {
        if (!this.relatorioAtual || this.relatorioAtual.substituicoes.length === 0) {
            this.mostrarToast('Gere um relatório primeiro', 'warning');
            return;
        }
        
        let csv = 'Data,Horário,Professor Ausente,Professor Substituto,Turma,Motivo,Observações\n';
        
        this.relatorioAtual.substituicoes.forEach(s => {
            csv += [
                `"${s.dataFormatada}"`,
                `${s.horario}º`,
                `"${(s.professorAusenteNome || '').replace(/"/g, '""')}"`,
                `"${(s.professorSubstitutoNome || '').replace(/"/g, '""')}"`,
                `"${(s.turma || '').replace(/"/g, '""')}"`,
                `"${(s.motivoLabel || '').replace(/"/g, '""')}"`,
                `"${(s.observacoes || '').replace(/"/g, '""')}"`
            ].join(',') + '\n';
        });
        
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `substituicoes_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
        
        this.mostrarToast('✅ CSV exportado!', 'success');
    },
    
    imprimirRelatorio() {
        if (!this.relatorioAtual) return;
        this.mostrarToast('Use Ctrl+P para imprimir o relatório', 'info');
        window.print();
    },
    
    // ============================================
    // INICIALIZAÇÃO
    // ============================================
    async init() {
        const hoje = new Date().toISOString().split('T')[0];
        const mesAtual = new Date().toISOString().substring(0, 7);
        
        const inputData = this.safeGet('inputDataSubstituicao');
        if (inputData) inputData.value = hoje;
        
        ['filtroMesSubstituicao', 'dashboardMesSubstituicao', 'relatorioMesSubstituicao'].forEach(id => {
            const el = this.safeGet(id);
            if (el) el.value = mesAtual;
        });
        
        await this.carregarProfessores();
        await this.carregarTurmas();
        await this.carregarListaSubstituicoes();
        await this.carregarDashboard();
        
        // Configurar buscas
        this.safeGet('buscaProfessorAusente')?.addEventListener('input', (e) => {
            this.filtrarProfessores(e.target.value, 'listaProfessoresAusentes', 'ausente');
        });
        
        this.safeGet('buscaProfessorSubstituto')?.addEventListener('input', (e) => {
            this.filtrarProfessores(e.target.value, 'listaProfessoresSubstitutos', 'substituto');
        });
        
        // Seleção de turma, data e motivo
        this.safeGet('selectTurmaSubstituicao')?.addEventListener('change', (e) => {
            this.formData.turma = e.target.value;
        });
        
        this.safeGet('inputDataSubstituicao')?.addEventListener('change', (e) => {
            this.formData.data = e.target.value;
        });
        
        this.safeGet('selectMotivoSubstituicao')?.addEventListener('change', (e) => {
            this.formData.motivo = e.target.value;
        });
        
        this.safeGet('inputMotivoDetalhesSubstituicao')?.addEventListener('input', (e) => {
            this.formData.motivoDetalhes = e.target.value;
        });
        
        this.safeGet('inputObservacoesSubstituicao')?.addEventListener('input', (e) => {
            this.formData.observacoes = e.target.value;
        });
        
        // Atualizar horário do preenchimento
        this.atualizarHorarioPreenchimento();
        setInterval(() => this.atualizarHorarioPreenchimento(), 1000);
        
        // Tab dashboard
        this.safeGet('sp-dashboard-tab')?.addEventListener('shown.bs.tab', () => {
            this.carregarDashboard();
        });
    }
};