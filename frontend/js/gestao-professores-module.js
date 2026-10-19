// js/gestao-professores-module.js
// Módulo de Gestão de Professores - Setor Pedagógico
// ⚠️ VERSÃO 2.0 — Aulas vinculadas a PERÍODO (select) + Turma + Disciplina

window.GestaoProfessoresModule = {
    
    // ============================================
    // ESTADO
    // ============================================
    professores: [],
    turmas: [],
    componentes: [],
    eixos: [],
    periodos: [], // 🆕 Períodos letivos
    registros: [],
    relatorioAtual: null,
    editandoId: null,
    registroParaImprimir: null,
    charts: { eixo: null, turma: null, professor: null, periodo: null },
    
    componentesFormulario: [],
    professorSelecionado: null,
    turmasVinculadas: [],
    
    // ============================================
    // DISCIPLINAS PADRÃO POR EIXO (Fallback)
    // ============================================
    disciplinasPadraoPorEixo: {
        'natureza': [
            'Matemática','Física','Química','Biologia','Ciências da Natureza'
        ],
        'linguagens': [
            'Língua Portuguesa','Redação','Literatura','Arte',
            'Educação Física','Língua Inglesa','Língua Espanhola'
        ],
        'humanas': [
            'História','Geografia','Filosofia','Sociologia','Ensino Religioso'
        ]
    },

    // ============================================
    // UTILITÁRIOS
    // ============================================
    getToken() { return localStorage.getItem('auth_token'); },
    safeGet(id) { return document.getElementById(id); },
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    getDataLocalISO(dateObj) {
        const d = dateObj || new Date();
        return d.getFullYear() + '-' + 
            String(d.getMonth() + 1).padStart(2, '0') + '-' + 
            String(d.getDate()).padStart(2, '0');
    },
    
    mostrarToast(mensagem, tipo = 'info') {
        const icons = {
            success: 'fa-check-circle', error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle', info: 'fa-info-circle'
        };
        const toast = document.createElement('div');
        toast.className = `sp-toast ${tipo}`;
        toast.style.cssText = `
            position: fixed; top: 20px; right: 20px; z-index: 99999;
            background: ${tipo === 'success' ? '#10b981' : tipo === 'error' ? '#ef4444' : tipo === 'warning' ? '#f59e0b' : '#3b82f6'};
            color: white; padding: 14px 22px; border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2); display: flex;
            align-items: center; gap: 10px; font-weight: 500;
            animation: slideIn 0.3s ease; max-width: 400px;
        `;
        toast.innerHTML = `<i class="fas ${icons[tipo]}"></i><span>${mensagem}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    },

    // ============================================
    // 🆕 NORMALIZA AULAS (compatibilidade com dados antigos)
    // ============================================
    // Se vier do banco como objeto { periodo1..4 }, soma tudo num número único
    // e mantém apenas um período (o primeiro não-zero) para exibição.
    normalizarAulas(aulasRegistradas) {
        if (aulasRegistradas === null || aulasRegistradas === undefined) {
            return { aulas: 0, periodoLegado: null };
        }
        // Já é número (formato novo)
        if (typeof aulasRegistradas === 'number') {
            return { aulas: aulasRegistradas, periodoLegado: null };
        }
        // É objeto antigo (periodo1..4) → soma e detecta período legado
        if (typeof aulasRegistradas === 'object') {
            const p1 = Number(aulasRegistradas.periodo1) || 0;
            const p2 = Number(aulasRegistradas.periodo2) || 0;
            const p3 = Number(aulasRegistradas.periodo3) || 0;
            const p4 = Number(aulasRegistradas.periodo4) || 0;
            const total = p1 + p2 + p3 + p4;
            
            let periodoLegado = null;
            if (p1 > 0) periodoLegado = '1';
            else if (p2 > 0) periodoLegado = '2';
            else if (p3 > 0) periodoLegado = '3';
            else if (p4 > 0) periodoLegado = '4';
            
            return { aulas: total, periodoLegado };
        }
        return { aulas: 0, periodoLegado: null };
    },

    // ============================================
    // 📄 UTILITÁRIO: GERADOR DE CSV PROFISSIONAL
    // ============================================
    /**
     * Gera CSV profissional com cabeçalho institucional, metadados, tabela e rodapé.
     *
     * @param {Object} opts
     * @param {string}   opts.titulo        - Título do relatório
     * @param {string}  [opts.subtitulo]    - Subtítulo
     * @param {string}  [opts.setor]        - Setor (default: "Setor Pedagógico")
     * @param {Array}    opts.colunas       - [{ label, key, format? }]
     * @param {Array}    opts.registros     - Dados
     * @param {Array<{label, valor}>} [opts.filtros] - Filtros aplicados
     * @param {string}   opts.nomeArquivo   - Nome do arquivo (sem extensão)
     * @param {string}  [opts.observacoes]  - Observações extras
     * @param {Object}  [opts.metricas]     - { label: valor } extras
     */
    gerarBaixarCSV(opts) {
        const {
            titulo = 'Relatório',
            subtitulo = '',
            setor = 'Setor Pedagógico',
            colunas = [],
            registros = [],
            filtros = [],
            nomeArquivo = 'relatorio',
            observacoes = '',
            metricas = null
        } = opts || {};

        if (!Array.isArray(colunas) || colunas.length === 0) {
            this.mostrarToast('⚠️ Nenhuma coluna definida para exportação', 'warning');
            return false;
        }
        if (!Array.isArray(registros) || registros.length === 0) {
            this.mostrarToast('⚠️ Nenhum registro para exportar', 'warning');
            return false;
        }

        const agora = new Date();
        const dataGeracao = agora.toLocaleString('pt-BR');
        const dataArquivo = this.getDataLocalISO(agora);

        const esc = (v) => {
            if (v === null || v === undefined) return '""';
            let s = String(v)
                .replace(/\r\n|\r|\n/g, ' ')
                .replace(/"/g, '""')
                .trim();
            return `"${s}"`;
        };

        const linhaUnica = (texto) => {
            const t = String(texto ?? '').replace(/"/g, '""');
            return `"${t}"` + ';'.repeat(Math.max(0, colunas.length - 1));
        };

        const linhaCabecalho = colunas.map(c => esc(c.label)).join(';');
        const linhasDados = registros.map(reg => {
            return colunas.map(col => {
                let v;
                try {
                    v = col.format ? col.format(reg) : reg[col.key];
                } catch (e) {
                    console.warn(`Erro coluna ${col.key}:`, e);
                    v = '';
                }
                return esc(v);
            }).join(';');
        });

        const L = [];

        // 🏛️ Cabeçalho institucional
        L.push(linhaUnica('IEMA PLENO: SÃO LUÍS - CENTRO'));
        L.push(linhaUnica('Sistema de Gestão — EducaPleno'));
        L.push(linhaUnica(`Setor: ${setor}`));
        L.push(linhaUnica(''));

        // 📋 Título
        L.push(linhaUnica(titulo.toUpperCase()));
        if (subtitulo) L.push(linhaUnica(subtitulo));
        L.push(linhaUnica(''));

        // 📊 Metadados
        L.push(linhaUnica(`Data de geração: ${dataGeracao}`));
        L.push(linhaUnica(`Total de registros: ${registros.length}`));

        if (metricas && typeof metricas === 'object') {
            Object.entries(metricas).forEach(([label, valor]) => {
                if (valor !== null && valor !== undefined && valor !== '') {
                    L.push(linhaUnica(`${label}: ${valor}`));
                }
            });
        }

        if (filtros.length > 0) {
            L.push(linhaUnica('Filtros aplicados:'));
            filtros.forEach(f => {
                if (f && f.valor) L.push(linhaUnica(`  • ${f.label}: ${f.valor}`));
            });
        }

        if (observacoes) L.push(linhaUnica(`Observações: ${observacoes}`));

        L.push(linhaUnica(''));
        L.push(linhaUnica('─'.repeat(40)));
        L.push(linhaUnica(''));

        // 📋 Tabela
        L.push(linhaCabecalho);
        L.push(...linhasDados);

        L.push(linhaUnica(''));
        L.push(linhaUnica('─'.repeat(40)));
        L.push(linhaUnica(''));

        // 🖋️ Rodapé
        L.push(linhaUnica('Documento gerado automaticamente pelo EducaPleno'));
        L.push(linhaUnica(`Setor responsável: ${setor}`));
        L.push(linhaUnica(`Gerado em: ${dataGeracao}`));
        L.push(linhaUnica('Este relatório é de uso interno e confidencial.'));

        const csv = '\uFEFF' + L.join('\r\n');

        try {
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.href = url;
            link.download = `${nomeArquivo}_${dataArquivo}.csv`;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            setTimeout(() => {
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }, 100);
            return true;
        } catch (e) {
            console.error('Erro ao gerar CSV:', e);
            this.mostrarToast('❌ Erro ao gerar CSV', 'error');
            return false;
        }
    },

    // ============================================
    // CARREGAR DADOS INICIAIS
    // ============================================
    async carregarProfessores() {
        try {
            const response = await fetch('/api/gestao-professores/professores', {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();
            if (data.success) {
                this.professores = data.professores || [];
                this.renderizarListaProfessores(this.professores, 'gpListaProfessores');
            }
        } catch (error) {
            console.error('❌ Erro ao carregar professores:', error);
        }
    },
    
    async carregarTurmas() {
        try {
            const response = await fetch('/api/gestao-professores/turmas', {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();
            if (data.success) this.turmas = data.turmas || [];
        } catch (error) {
            console.error('❌ Erro ao carregar turmas:', error);
        }
    },
    
    async carregarComponentes() {
        try {
            const response = await fetch('/api/gestao-professores/componentes-curriculares', {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();
            if (data.success) {
                this.componentes = data.componentes || [];
                this.eixos = data.eixos || [];
            }
        } catch (error) {
            console.error('❌ Erro ao carregar componentes:', error);
        }
    },
    
    async carregarEixos() {
        try {
            const response = await fetch('/api/gestao-professores/eixos', {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();
            if (data.success) this.eixos = data.eixos || [];
        } catch (error) {
            console.error('❌ Erro ao carregar eixos:', error);
        }
    },

    // 🆕 Carregar períodos letivos (endpoint novo)
    async carregarPeriodos() {
        try {
            const response = await fetch('/api/gestao-professores/periodos', {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();
            if (data.success && Array.isArray(data.periodos) && data.periodos.length > 0) {
                this.periodos = data.periodos;
            } else {
                this.periodos = this.periodosFallback();
            }
        } catch (error) {
            console.warn('⚠️ Endpoint /periodos não disponível, usando fallback:', error.message);
            this.periodos = this.periodosFallback();
        }
    },
    
    periodosFallback() {
        return [
            { id: '1', nome: '1', label: '1º Período' },
            { id: '2', nome: '2', label: '2º Período' },
            { id: '3', nome: '3', label: '3º Período' },
            { id: '4', nome: '4', label: '4º Período' }
        ];
    },
    
    gerarOpcoesPeriodo(valorAtual) {
        const v = (valorAtual === null || valorAtual === undefined) ? '' : String(valorAtual);
        let options = '<option value="">Selecione o período...</option>';
        const lista = this.periodos.length > 0 ? this.periodos : this.periodosFallback();
        options += lista.map(p => {
            const pid = String(p.id || p.nome);
            const label = p.label || p.nome || pid;
            const selected = pid === v ? 'selected' : '';
            return `<option value="${this.escapeHtml(pid)}" ${selected}>${this.escapeHtml(label)}</option>`;
        }).join('');
        return options;
    },
    
    getPeriodoLabel(periodoId) {
        if (!periodoId) return '-';
        const pid = String(periodoId);
        const lista = this.periodos.length > 0 ? this.periodos : this.periodosFallback();
        const enc = lista.find(p => String(p.id || p.nome) === pid);
        return enc ? (enc.label || enc.nome) : `${pid}º Período`;
    },

    // ============================================
    // RENDERIZAR LISTA DE PROFESSORES
    // ============================================
    renderizarListaProfessores(lista, containerId) {
        const container = this.safeGet(containerId);
        if (!container) return;
        
        if (lista.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #9ca3af;">
                    <i class="fas fa-user-slash" style="font-size: 32px; opacity: 0.5;"></i>
                    <p>Nenhum professor encontrado</p>
                </div>`;
            return;
        }
        
        container.innerHTML = lista.map(p => `
            <div class="professor-item-gp" data-id="${p.id}" 
                 onclick="GestaoProfessoresModule.selecionarProfessor('${p.id}')"
                 style="display: flex; align-items: center; gap: 14px;
                     padding: 14px 16px; margin-bottom: 8px;
                     background: white; border: 2px solid #e5e7eb;
                     border-radius: 12px; cursor: pointer; transition: all 0.2s;"
                 onmouseover="this.style.borderColor='#6366f1'; this.style.background='#f8faff';"
                 onmouseout="this.style.borderColor='#e5e7eb'; this.style.background='white';">
                <div style="width: 45px; height: 45px; border-radius: 10px;
                    background: linear-gradient(135deg, #1e3c72, #2a5298);
                    color: white; display: flex; align-items: center;
                    justify-content: center; font-weight: 700; font-size: 18px; flex-shrink: 0;">
                    ${(p.nome || '?').charAt(0).toUpperCase()}
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 700; color: #1e293b; font-size: 15px;">
                        ${this.escapeHtml(p.nome)}
                    </div>
                    <div style="font-size: 12px; color: #64748b; margin-top: 3px;">
                        ${p.matricula ? `<i class="fas fa-id-card"></i> ${this.escapeHtml(p.matricula)}` : ''}
                        ${p.eixo ? ` • <i class="fas fa-sitemap"></i> ${this.escapeHtml(p.eixo)}` : ''}
                    </div>
                </div>
                <i class="fas fa-chevron-right" style="color: #cbd5e1;"></i>
            </div>
        `).join('');
    },
    
    filtrarProfessores(termo) {
        const termoLower = (termo || '').toLowerCase();
        let filtrados = this.professores;
        if (termoLower) {
            filtrados = this.professores.filter(p =>
                (p.nome || '').toLowerCase().includes(termoLower) ||
                (p.email || '').toLowerCase().includes(termoLower) ||
                (p.matricula || '').toLowerCase().includes(termoLower) ||
                (p.cpf || '').toLowerCase().includes(termoLower)
            );
        }
        this.renderizarListaProfessores(filtrados, 'gpListaProfessores');
    },

    // ============================================
    // SELECIONAR PROFESSOR
    // ============================================
    selecionarProfessor(id) {
        const professor = this.professores.find(p => p.id === id);
        if (!professor) return;
        this.professorSelecionado = professor;
        
        document.querySelectorAll('.professor-item-gp').forEach(el => {
            el.classList.toggle('selected', el.dataset.id === id);
            if (el.dataset.id === id) {
                el.style.borderColor = '#6366f1';
                el.style.background = '#eef2ff';
            } else {
                el.style.borderColor = '#e5e7eb';
                el.style.background = 'white';
            }
        });
        
        this.mostrarDadosProfessor(professor);
        
        const cardTurmas = this.safeGet('gpCardTurmas');
        if (cardTurmas) {
            cardTurmas.style.display = 'block';
            cardTurmas.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        const cardComponentes = this.safeGet('gpCardComponentes');
        if (cardComponentes) cardComponentes.style.display = 'block';
        
        this.atualizarSelectsTurmas();
    },
    
    mostrarDadosProfessor(professor) {
        const container = this.safeGet('gpDadosProfessor');
        if (!container) return;
        
        container.style.display = 'block';
        container.innerHTML = `
            <div style="background: linear-gradient(135deg, #eef2ff, #e0e7ff);
                border: 2px solid #c7d2fe; border-radius: 14px;
                padding: 20px; margin-top: 20px;">
                <div style="display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap;">
                    <div style="width: 65px; height: 65px; border-radius: 14px;
                        background: linear-gradient(135deg, #1e3c72, #2a5298);
                        color: white; display: flex; align-items: center;
                        justify-content: center; font-weight: 700; font-size: 26px;
                        box-shadow: 0 4px 12px rgba(30,60,114,0.25);">
                        ${(professor.nome || '?').charAt(0).toUpperCase()}
                    </div>
                    <div style="flex: 1; min-width: 200px;">
                        <h5 style="margin: 0 0 8px; color: #1e293b; font-weight: 700;">
                            ${this.escapeHtml(professor.nome)}
                        </h5>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; font-size: 13px; color: #475569;">
                            <div><strong>Email:</strong> ${this.escapeHtml(professor.email || '-')}</div>
                            <div><strong>Matrícula:</strong> ${this.escapeHtml(professor.matricula || '-')}</div>
                            <div><strong>CPF:</strong> ${this.escapeHtml(professor.cpf || '-')}</div>
                            <div><strong>Telefone:</strong> ${this.escapeHtml(professor.telefone || '-')}</div>
                            <div><strong>Eixo:</strong> ${this.escapeHtml(professor.eixo || '-')}</div>
                            <div><strong>Departamento:</strong> ${this.escapeHtml(professor.departamento || '-')}</div>
                            <div><strong>Titulação:</strong> ${this.escapeHtml(professor.titulacao || '-')}</div>
                        </div>
                    </div>
                    <button onclick="GestaoProfessoresModule.limparProfessorSelecionado()"
                            style="background: #fee2e2; color: #dc2626; border: none;
                                padding: 8px 12px; border-radius: 8px; cursor: pointer;
                                font-weight: 600; font-size: 13px;">
                        <i class="fas fa-times"></i> Trocar
                    </button>
                </div>
            </div>`;
    },
    
    limparProfessorSelecionado() {
        this.professorSelecionado = null;
        this.turmasVinculadas = [];
        this.componentesFormulario = [];
        
        const container = this.safeGet('gpDadosProfessor');
        if (container) container.style.display = 'none';
        const cardTurmas = this.safeGet('gpCardTurmas');
        if (cardTurmas) cardTurmas.style.display = 'none';
        const cardComponentes = this.safeGet('gpCardComponentes');
        if (cardComponentes) cardComponentes.style.display = 'none';
        
        document.querySelectorAll('.professor-item-gp').forEach(el => {
            el.classList.remove('selected');
            el.style.borderColor = '#e5e7eb';
            el.style.background = 'white';
        });
        const busca = this.safeGet('gpBuscaProfessor');
        if (busca) busca.value = '';
        this.renderizarListaProfessores(this.professores, 'gpListaProfessores');
    },

    // ============================================
    // TURMAS VINCULADAS
    // ============================================
    atualizarSelectsTurmas() {
        const selectTurma = this.safeGet('gpSelectTurma');
        if (selectTurma) {
            selectTurma.innerHTML = '<option value="">Selecione a turma...</option>' +
                this.turmas.map(t => 
                    `<option value="${this.escapeHtml(t.turma)}">${this.escapeHtml(t.turma)} — ${this.escapeHtml(t.curso)}</option>`
                ).join('');
        }
        this.atualizarSelectsComponentes();
    },
    
    atualizarSelectsComponentes() {
        document.querySelectorAll('.componente-turma-select').forEach(select => {
            const valorAtual = select.value;
            select.innerHTML = '<option value="">Selecione a turma...</option>' +
                this.turmas.map(t => 
                    `<option value="${this.escapeHtml(t.turma)}" ${t.turma === valorAtual ? 'selected' : ''}>${this.escapeHtml(t.turma)} — ${this.escapeHtml(t.curso)}</option>`
                ).join('');
        });
        document.querySelectorAll('.componente-eixo-select').forEach(select => {
            const valorAtual = select.value;
            select.innerHTML = '<option value="">Selecione o eixo...</option>' +
                this.eixos.map(e => 
                    `<option value="${this.escapeHtml(e.nome)}" ${e.nome === valorAtual ? 'selected' : ''}>${this.escapeHtml(e.label)}</option>`
                ).join('');
        });
        // 🆕 Períodos
        document.querySelectorAll('.componente-periodo-select').forEach(select => {
            const valorAtual = select.value;
            select.innerHTML = this.gerarOpcoesPeriodo(valorAtual);
        });
    },
    
    adicionarTurmaVinculada() {
        const selectTurma = this.safeGet('gpSelectTurma');
        const turma = selectTurma?.value;
        if (!turma) { this.mostrarToast('Selecione uma turma', 'warning'); return; }
        if (this.turmasVinculadas.some(t => t.turma === turma)) {
            this.mostrarToast('Esta turma já foi adicionada', 'warning'); return;
        }
        const turmaData = this.turmas.find(t => t.turma === turma);
        this.turmasVinculadas.push({ turma, curso: turmaData?.curso || 'Não informado' });
        this.renderizarTurmasVinculadas();
        if (selectTurma) selectTurma.value = '';
    },
    
    removerTurmaVinculada(index) {
        this.turmasVinculadas.splice(index, 1);
        this.renderizarTurmasVinculadas();
    },
    
    renderizarTurmasVinculadas() {
        const container = this.safeGet('gpTurmasVinculadas');
        if (!container) return;
        if (this.turmasVinculadas.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 13px;">
                    <i class="fas fa-info-circle"></i> Nenhuma turma vinculada ainda
                </div>`;
            return;
        }
        container.innerHTML = this.turmasVinculadas.map((t, index) => `
            <div style="display: flex; align-items: center; justify-content: space-between;
                background: #f0fdf4; border: 2px solid #bbf7d0;
                border-radius: 10px; padding: 10px 14px; margin-bottom: 8px;">
                <div>
                    <strong style="color: #166534;">${this.escapeHtml(t.turma)}</strong>
                    <span style="color: #166534; opacity: 0.7; font-size: 13px; margin-left: 8px;">
                        ${this.escapeHtml(t.curso)}
                    </span>
                </div>
                <button onclick="GestaoProfessoresModule.removerTurmaVinculada(${index})"
                        style="background: none; border: none; color: #dc2626; cursor: pointer; font-size: 16px;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    },

    // ============================================
    // COMPONENTES CURRICULARES (1 = 1 período)
    // ============================================
    adicionarComponente() {
        const novoComponente = {
            id: Date.now(),
            componenteCurricularId: null,
            nome: '',
            eixo: '',
            turma: '',
            curso: '',
            periodo: '',          // 🆕
            aulasRegistradas: '', // 🆕 (string para input; vira número no payload)
            cargaHorariaAnual: 0,
            cargaHorariaSemanal: 0,
            observacoes: '',
            _modoManual: false
        };
        this.componentesFormulario.push(novoComponente);
        this.renderizarComponentes();
    },
    
    removerComponente(id) {
        this.componentesFormulario = this.componentesFormulario.filter(c => c.id !== id);
        this.renderizarComponentes();
    },
    
    renderizarComponentes() {
        const container = this.safeGet('gpListaComponentes');
        if (!container) return;
        
        if (this.componentesFormulario.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: #9ca3af;
                    background: #f8fafc; border: 2px dashed #e5e7eb; border-radius: 12px;">
                    <i class="fas fa-book-open" style="font-size: 40px; opacity: 0.4; margin-bottom: 10px; display: block;"></i>
                    <p style="margin: 0; font-size: 14px;">Nenhum componente curricular adicionado</p>
                    <button onclick="GestaoProfessoresModule.adicionarComponente()"
                            style="margin-top: 15px; padding: 10px 20px;
                                background: linear-gradient(135deg, #6366f1, #8b5cf6);
                                color: white; border: none; border-radius: 10px;
                                font-weight: 600; cursor: pointer;">
                        <i class="fas fa-plus"></i> Adicionar Componente
                    </button>
                </div>`;
            return;
        }
        
        container.innerHTML = this.componentesFormulario.map((c, index) => {
            // ============ MONTAR OPÇÕES DE COMPONENTE ============
            let componenteOptions = '<option value="">Selecione o componente...</option>';
            const compsEixo = c.eixo ? this.componentes.filter(comp => comp.eixo === c.eixo) : [];
            const temComponentesBanco = compsEixo.length > 0;
            
            const eixosComFallback = ['natureza', 'linguagens', 'humanas'];
            const eixoNormalizado = (c.eixo || '').toLowerCase().trim();
            const temFallbackPadrao = eixosComFallback.includes(eixoNormalizado) 
                && this.disciplinasPadraoPorEixo[eixoNormalizado];
            
            if (temComponentesBanco) {
                componenteOptions += `<optgroup label="📚 Cadastrados no sistema">`;
                compsEixo.forEach(comp => {
                    const selected = c.componenteCurricularId === comp.id ? 'selected' : '';
                    componenteOptions += `<option value="banco:${comp.id}" ${selected}>${this.escapeHtml(comp.nome)}</option>`;
                });
                componenteOptions += `</optgroup>`;
            } else if (temFallbackPadrao) {
                componenteOptions += `<optgroup label="⭐ Disciplinas padrão">`;
                this.disciplinasPadraoPorEixo[eixoNormalizado].forEach(disciplina => {
                    const selected = (!c.componenteCurricularId && c.nome === disciplina) ? 'selected' : '';
                    componenteOptions += `<option value="padrao:${disciplina}" ${selected}>${this.escapeHtml(disciplina)}</option>`;
                });
                componenteOptions += `</optgroup>`;
            } else if (c.eixo) {
                componenteOptions += `<option value="" disabled>⚠️ Nenhum componente cadastrado para este eixo</option>`;
            }
            
            const estaEmModoManual = (c._modoManual === true) || 
                (c.nome && !c.componenteCurricularId && !temFallbackPadrao && c.eixo);
            
            componenteOptions += `
                <optgroup label="─────────">
                    <option value="manual:__custom__" ${estaEmModoManual ? 'selected' : ''}>
                        ➕ Outro (digitar manualmente)
                    </option>
                </optgroup>`;
            
            const eixoOptions = '<option value="">Selecione o eixo...</option>' +
                this.eixos.map(e => {
                    const selected = e.nome === c.eixo ? 'selected' : '';
                    return `<option value="${this.escapeHtml(e.nome)}" ${selected}>${this.escapeHtml(e.label)}</option>`;
                }).join('');
            
            const turmaOptions = '<option value="">Selecione a turma...</option>' +
                this.turmas.map(t => {
                    const selected = t.turma === c.turma ? 'selected' : '';
                    return `<option value="${this.escapeHtml(t.turma)}" ${selected}>${this.escapeHtml(t.turma)} — ${this.escapeHtml(t.curso)}</option>`;
                }).join('');
            
            const periodoOptions = this.gerarOpcoesPeriodo(c.periodo);
            
            const mostraInputManual = estaEmModoManual;
            const mostrarAvisoEixoVazio = c.eixo && !temComponentesBanco && !temFallbackPadrao;
            
            return `
                <div style="background: white; border: 2px solid #e5e7eb;
                    border-radius: 14px; padding: 20px; margin-bottom: 16px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                    
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h6 style="margin: 0; color: #1e293b; font-weight: 700;">
                            <i class="fas fa-book" style="color: #6366f1;"></i> Componente ${index + 1}
                        </h6>
                        <button onclick="GestaoProfessoresModule.removerComponente(${c.id})"
                                style="background: #fee2e2; color: #dc2626;
                                    border: none; padding: 6px 12px;
                                    border-radius: 8px; cursor: pointer;
                                    font-weight: 600; font-size: 12px;">
                            <i class="fas fa-trash"></i> Remover
                        </button>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px;">
                        
                        <!-- EIXO -->
                        <div>
                            <label style="font-size: 12px; font-weight: 700; color: #475569; display: block; margin-bottom: 6px;">
                                Eixo <span style="color: #dc2626;">*</span>
                            </label>
                            <select class="form-select componente-eixo-select" 
                                    data-componente-id="${c.id}"
                                    onchange="GestaoProfessoresModule.atualizarEixoComponente(${c.id}, this.value)"
                                    style="border: 2px solid #e5e7eb; border-radius: 8px; font-size: 13px;">
                                ${eixoOptions}
                            </select>
                        </div>
                        
                        <!-- COMPONENTE -->
                        <div>
                            <label style="font-size: 12px; font-weight: 700; color: #475569; display: block; margin-bottom: 6px;">
                                Componente Curricular <span style="color: #dc2626;">*</span>
                            </label>
                            <select class="form-select componente-nome-select"
                                    data-componente-id="${c.id}"
                                    onchange="GestaoProfessoresModule.atualizarNomeComponente(${c.id}, this.value)"
                                    style="border: 2px solid #e5e7eb; border-radius: 8px; font-size: 13px;">
                                ${componenteOptions}
                            </select>
                            ${temComponentesBanco ? `<small style="display:block; margin-top:6px; color:#10b981; font-size:11px;"><i class="fas fa-database"></i> ${compsEixo.length} componente(s) do sistema</small>` : 
                              temFallbackPadrao ? `<small style="display:block; margin-top:6px; color:#6366f1; font-size:11px;"><i class="fas fa-star"></i> Disciplinas padrão</small>` : 
                              mostrarAvisoEixoVazio ? `<small style="display:block; margin-top:6px; color:#f59e0b; font-size:11px;"><i class="fas fa-exclamation-triangle"></i> Cadastre componentes no sistema ou digite manualmente</small>` : ''}
                        </div>
                        
                        <!-- TURMA -->
                        <div>
                            <label style="font-size: 12px; font-weight: 700; color: #475569; display: block; margin-bottom: 6px;">
                                Turma <span style="color: #dc2626;">*</span>
                            </label>
                            <select class="form-select componente-turma-select"
                                    data-componente-id="${c.id}"
                                    onchange="GestaoProfessoresModule.atualizarTurmaComponente(${c.id}, this.value)"
                                    style="border: 2px solid #e5e7eb; border-radius: 8px; font-size: 13px;">
                                ${turmaOptions}
                            </select>
                        </div>
                        
                        <!-- 🆕 PERÍODO -->
                        <div>
                            <label style="font-size: 12px; font-weight: 700; color: #475569; display: block; margin-bottom: 6px;">
                                Período <span style="color: #dc2626;">*</span>
                            </label>
                            <select class="form-select componente-periodo-select"
                                    data-componente-id="${c.id}"
                                    onchange="GestaoProfessoresModule.atualizarPeriodoComponente(${c.id}, this.value)"
                                    style="border: 2px solid #e5e7eb; border-radius: 8px; font-size: 13px;">
                                ${periodoOptions}
                            </select>
                        </div>
                        
                        <!-- 🆕 AULAS REGISTRADAS -->
                        <div>
                            <label style="font-size: 12px; font-weight: 700; color: #475569; display: block; margin-bottom: 6px;">
                                Aulas Registradas <span style="color: #dc2626;">*</span>
                            </label>
                            <input type="number" min="0" step="1"
                                   value="${c.aulasRegistradas === '' || c.aulasRegistradas === null || c.aulasRegistradas === undefined ? '' : c.aulasRegistradas}"
                                   placeholder="Ex: 100"
                                   onchange="GestaoProfessoresModule.atualizarCampoComponente(${c.id}, 'aulasRegistradas', this.value)"
                                   style="width: 100%; padding: 10px 14px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 13px;">
                            <small style="display:block; margin-top:6px; color:#64748b; font-size:11px;">
                                Quantidade de aulas <strong>no período selecionado</strong>
                            </small>
                        </div>
                        
                        <!-- CH ANUAL -->
                        <div>
                            <label style="font-size: 12px; font-weight: 700; color: #475569; display: block; margin-bottom: 6px;">
                                Carga Horária Anual (h)
                            </label>
                            <input type="number" min="0" value="${c.cargaHorariaAnual || 0}"
                                   onchange="GestaoProfessoresModule.atualizarCampoComponente(${c.id}, 'cargaHorariaAnual', this.value)"
                                   style="width: 100%; padding: 10px 14px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 13px;">
                        </div>
                        
                        <!-- CH SEMANAL -->
                        <div>
                            <label style="font-size: 12px; font-weight: 700; color: #475569; display: block; margin-bottom: 6px;">
                                Carga Horária Semanal (h)
                            </label>
                            <input type="number" min="0" value="${c.cargaHorariaSemanal || 0}"
                                   onchange="GestaoProfessoresModule.atualizarCampoComponente(${c.id}, 'cargaHorariaSemanal', this.value)"
                                   style="width: 100%; padding: 10px 14px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 13px;">
                        </div>
                    </div>
                    
                    <!-- INPUT MANUAL -->
                    <div id="gp-input-manual-${c.id}" 
                         style="display: ${mostraInputManual ? 'block' : 'none'}; margin-top: 14px; padding: 14px; background: #fffbeb; border: 2px solid #fde68a; border-radius: 10px;">
                        <label style="font-size: 12px; font-weight: 700; color: #92400e; display: block; margin-bottom: 6px;">
                            <i class="fas fa-pencil-alt"></i> Digite o nome da disciplina
                        </label>
                        <input type="text" 
                               value="${mostraInputManual ? this.escapeHtml(c.nome) : ''}"
                               placeholder="Ex: Robótica, Empreendedorismo, Xadrez..."
                               onchange="GestaoProfessoresModule.atualizarNomeManual(${c.id}, this.value)"
                               style="width: 100%; padding: 10px 14px; border: 2px solid #fcd34d; border-radius: 8px; font-size: 13px;">
                    </div>
                    
                    <!-- OBSERVAÇÕES -->
                    <div style="margin-top: 16px;">
                        <label style="font-size: 12px; font-weight: 700; color: #475569; display: block; margin-bottom: 6px;">
                            <i class="fas fa-comment"></i> Observações, Sugestões, Metas, Prós e Contras
                        </label>
                        <textarea rows="3" 
                                  onchange="GestaoProfessoresModule.atualizarCampoComponente(${c.id}, 'observacoes', this.value)"
                                  placeholder="Descreva observações..."
                                  style="width: 100%; padding: 12px 14px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 13px; resize: vertical;">${this.escapeHtml(c.observacoes || '')}</textarea>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    atualizarEixoComponente(id, eixo) {
        const comp = this.componentesFormulario.find(c => c.id === id);
        if (comp) {
            comp.eixo = eixo;
            comp.componenteCurricularId = null;
            comp.nome = '';
            comp._modoManual = false;
            this.renderizarComponentes();
        }
    },
    
    atualizarNomeComponente(id, valor) {
        const comp = this.componentesFormulario.find(c => c.id === id);
        if (!comp) return;
        
        if (valor.startsWith('banco:')) {
            const componenteId = valor.replace('banco:', '');
            const componente = this.componentes.find(c => String(c.id) === String(componenteId));
            if (componente) {
                comp.componenteCurricularId = componente.id;
                comp.nome = componente.nome;
                comp.eixo = componente.eixo;
                comp._modoManual = false;
            }
        } else if (valor.startsWith('padrao:')) {
            comp.componenteCurricularId = null;
            comp.nome = valor.replace('padrao:', '');
            comp._modoManual = false;
        } else if (valor === 'manual:__custom__') {
            comp._modoManual = true;
            comp.componenteCurricularId = null;
            comp.nome = '';
        } else if (valor === '') {
            comp.componenteCurricularId = null;
            comp.nome = '';
            comp._modoManual = false;
        }
        this.renderizarComponentes();
    },
    
    atualizarNomeManual(id, valor) {
        const comp = this.componentesFormulario.find(c => c.id === id);
        if (comp) {
            comp.nome = valor.trim();
            comp._modoManual = true;
        }
    },
    
    atualizarTurmaComponente(id, turma) {
        const comp = this.componentesFormulario.find(c => c.id === id);
        if (comp) {
            comp.turma = turma;
            const turmaData = this.turmas.find(t => t.turma === turma);
            comp.curso = turmaData?.curso || 'Não informado';
        }
    },
    
    // 🆕 Período
    atualizarPeriodoComponente(id, periodo) {
        const comp = this.componentesFormulario.find(c => c.id === id);
        if (comp) comp.periodo = periodo;
    },
    
    atualizarCampoComponente(id, campo, valor) {
        const comp = this.componentesFormulario.find(c => c.id === id);
        if (comp) {
            if (campo === 'aulasRegistradas') {
                comp[campo] = valor === '' ? '' : parseInt(valor) || 0;
            } else {
                comp[campo] = valor;
            }
        }
    },

    // ============================================
    // REGISTRAR
    // ============================================
    async registrar() {
        if (!this.professorSelecionado) {
            this.mostrarToast('Selecione um professor', 'warning'); return;
        }
        if (this.componentesFormulario.length === 0) {
            this.mostrarToast('Adicione pelo menos um componente curricular', 'warning'); return;
        }
        const dataColeta = this.safeGet('gpDataColeta')?.value;
        if (!dataColeta) {
            this.mostrarToast('Informe a data da coleta', 'warning'); return;
        }
        
        // Validações
        for (let i = 0; i < this.componentesFormulario.length; i++) {
            const c = this.componentesFormulario[i];
            if (!c.nome) {
                this.mostrarToast(`Componente ${i + 1}: selecione ou digite o componente curricular`, 'warning'); return;
            }
            if (!c.turma) {
                this.mostrarToast(`Componente ${i + 1}: selecione a turma`, 'warning'); return;
            }
            if (!c.periodo) {
                this.mostrarToast(`Componente ${i + 1}: selecione o período`, 'warning'); return;
            }
            if (c.aulasRegistradas === '' || c.aulasRegistradas === null || c.aulasRegistradas === undefined) {
                this.mostrarToast(`Componente ${i + 1}: informe quantas aulas foram registradas`, 'warning'); return;
            }
        }
        
        const btn = this.safeGet('gpBtnRegistrar');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Registrando...';
        }
        
        try {
            const payload = {
                professorId: this.professorSelecionado.id,
                turmasVinculadas: this.turmasVinculadas,
                componentes: this.componentesFormulario.map(c => ({
                    componenteCurricularId: c.componenteCurricularId,
                    nome: c.nome,
                    eixo: c.eixo,
                    turma: c.turma,
                    curso: c.curso,
                    periodo: c.periodo,                              // 🆕
                    aulasRegistradas: parseInt(c.aulasRegistradas) || 0, // 🆕
                    cargaHorariaAnual: c.cargaHorariaAnual,
                    cargaHorariaSemanal: c.cargaHorariaSemanal,
                    observacoes: c.observacoes
                })),
                dataColeta,
                observacoesGerais: this.safeGet('gpObservacoesGerais')?.value || ''
            };
            
            const response = await fetch('/api/gestao-professores/registrar', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.getToken()}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            
            if (data.success) {
                this.mostrarToast('✅ Gestão de professor registrada com sucesso!', 'success');
                this.resetarFormulario();
                await this.carregarLista();
                await this.carregarDashboard();
                const listaTab = this.safeGet('gpListaTab');
                if (listaTab) new bootstrap.Tab(listaTab).show();
            } else {
                throw new Error(data.error || 'Erro ao registrar');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.mostrarToast(error.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save me-2"></i> Registrar';
            }
        }
    },
    
    resetarFormulario() {
        this.professorSelecionado = null;
        this.turmasVinculadas = [];
        this.componentesFormulario = [];
        
        const container = this.safeGet('gpDadosProfessor');
        if (container) container.style.display = 'none';
        const cardTurmas = this.safeGet('gpCardTurmas');
        if (cardTurmas) cardTurmas.style.display = 'none';
        const cardComponentes = this.safeGet('gpCardComponentes');
        if (cardComponentes) cardComponentes.style.display = 'none';
        const busca = this.safeGet('gpBuscaProfessor');
        if (busca) busca.value = '';
        const dataInput = this.safeGet('gpDataColeta');
        if (dataInput) dataInput.value = this.getDataLocalISO();
        const obsGerais = this.safeGet('gpObservacoesGerais');
        if (obsGerais) obsGerais.value = '';
        
        document.querySelectorAll('.professor-item-gp').forEach(el => {
            el.classList.remove('selected');
            el.style.borderColor = '#e5e7eb';
            el.style.background = 'white';
        });
        this.renderizarListaProfessores(this.professores, 'gpListaProfessores');
        this.renderizarTurmasVinculadas();
        this.renderizarComponentes();
    },

    // ============================================
    // LISTA DE REGISTROS
    // ============================================
    async carregarLista() {
        const container = this.safeGet('gpListaRegistros');
        if (!container) return;
        
        container.innerHTML = '<div style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:24px; color:#6366f1;"></i><p style="margin-top:10px; color:#64748b;">Carregando registros...</p></div>';
        
        try {
            const params = new URLSearchParams();
            const busca = this.safeGet('gpFiltroBusca')?.value;
            const eixo = this.safeGet('gpFiltroEixo')?.value;
            const turma = this.safeGet('gpFiltroTurma')?.value;
            const periodo = this.safeGet('gpFiltroPeriodo')?.value;   // 🆕
            const dataInicio = this.safeGet('gpFiltroDataInicio')?.value;
            const dataFim = this.safeGet('gpFiltroDataFim')?.value;
            
            if (busca) params.append('busca', busca);
            if (eixo) params.append('eixo', eixo);
            if (turma) params.append('turma', turma);
            if (periodo) params.append('periodo', periodo);           // 🆕
            if (dataInicio) params.append('dataInicio', dataInicio);
            if (dataFim) params.append('dataFim', dataFim);
            
            const response = await fetch(`/api/gestao-professores/listar?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();
            
            if (data.success) {
                this.registros = data.registros;
                this.renderizarListaRegistros(data.registros);
                const contador = this.safeGet('gpContadorRegistros');
                if (contador) contador.textContent = `${data.total} registro(s)`;
                const badge = this.safeGet('gpBadgeTotal');
                if (badge) badge.textContent = data.total;
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            container.innerHTML = '<div style="text-align:center; padding:40px; color:#ef4444;"><i class="fas fa-exclamation-triangle" style="font-size:32px;"></i><p>Erro ao carregar registros</p></div>';
        }
    },
    
    renderizarListaRegistros(lista) {
        const container = this.safeGet('gpListaRegistros');
        if (!container) return;
        
        if (lista.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; background: white; border-radius: 12px; border: 2px dashed #e5e7eb;">
                    <i class="fas fa-inbox" style="font-size: 52px; color: #cbd5e1; margin-bottom: 16px;"></i>
                    <h5 style="color: #475569; font-weight: 600;">Nenhum registro encontrado</h5>
                    <p style="color: #94a3b8; font-size: 14px;">Registre a primeira gestão ou ajuste os filtros.</p>
                </div>`;
            return;
        }
        
        container.innerHTML = lista.map(r => {
            // Soma total de aulas (novo formato = number, antigo = objeto)
            let totalAulas = 0;
            (r.componentes || []).forEach(c => {
                const norm = this.normalizarAulas(c.aulasRegistradas);
                totalAulas += norm.aulas;
            });
            
            return `
                <div style="background: white; border: 2px solid #e5e7eb;
                    border-radius: 12px; padding: 18px; margin-bottom: 12px;
                    transition: all 0.2s;"
                onmouseover="this.style.borderColor='#c7d2fe'; this.style.boxShadow='0 4px 12px rgba(99,102,241,0.1)';"
                onmouseout="this.style.borderColor='#e5e7eb'; this.style.boxShadow='none';">
                    
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
                        <div style="flex: 1; min-width: 250px;">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                                <div style="width: 42px; height: 42px; border-radius: 10px;
                                    background: linear-gradient(135deg, #1e3c72, #2a5298);
                                    color: white; display: flex; align-items: center;
                                    justify-content: center; font-weight: 700; font-size: 17px;">
                                    ${(r.professorNome || '?').charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div style="font-weight: 700; color: #1e293b; font-size: 15px;">
                                        ${this.escapeHtml(r.professorNome)}
                                    </div>
                                    <div style="font-size: 12px; color: #64748b;">
                                        ${r.professorEixo ? `<i class="fas fa-sitemap"></i> ${this.escapeHtml(r.professorEixo)}` : ''}
                                        ${r.professorMatricula ? ` • <i class="fas fa-id-card"></i> ${this.escapeHtml(r.professorMatricula)}` : ''}
                                    </div>
                                </div>
                            </div>
                            
                            <div style="display: flex; flex-wrap: wrap; gap: 12px; font-size: 12px; color: #475569; margin-top: 8px;">
                                <span><i class="fas fa-calendar"></i> Coleta: <strong>${r.dataColetaFormatada}</strong></span>
                                <span><i class="fas fa-book"></i> <strong>${r.totalComponentes}</strong> componente(s)</span>
                                <span><i class="fas fa-chalkboard"></i> <strong>${totalAulas}</strong> aula(s)</span>
                                ${r.turmasVinculadas?.length ? `<span><i class="fas fa-users"></i> ${r.turmasVinculadas.length} turma(s)</span>` : ''}
                            </div>
                        </div>
                        
                        <div style="display: flex; gap: 6px; flex-shrink: 0;">
                            <button onclick="GestaoProfessoresModule.verRegistro('${r.id}')" title="Visualizar"
                                    style="width: 38px; height: 38px; padding: 0; background: #eff6ff; color: #2563eb; border: none; border-radius: 9px; font-size: 14px; cursor: pointer;">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button onclick="GestaoProfessoresModule.abrirEdicao('${r.id}')" title="Editar"
                                    style="width: 38px; height: 38px; padding: 0; background: #fef3c7; color: #d97706; border: none; border-radius: 9px; font-size: 14px; cursor: pointer;">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button onclick="GestaoProfessoresModule.imprimirRegistro('${r.id}')" title="Imprimir"
                                    style="width: 38px; height: 38px; padding: 0; background: #e0e7ff; color: #4f46e5; border: none; border-radius: 9px; font-size: 14px; cursor: pointer;">
                                <i class="fas fa-print"></i>
                            </button>
                            <button onclick="GestaoProfessoresModule.excluirRegistro('${r.id}', '${this.escapeHtml(r.professorNome)}')" title="Excluir"
                                    style="width: 38px; height: 38px; padding: 0; background: #fee2e2; color: #dc2626; border: none; border-radius: 9px; font-size: 14px; cursor: pointer;">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    // ============================================
    // VER REGISTRO
    // ============================================
    async verRegistro(id) {
        try {
            const response = await fetch(`/api/gestao-professores/${id}`, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();
            if (!data.success) { this.mostrarToast('Registro não encontrado', 'error'); return; }
            
            const r = data.registro;
            this.registroParaImprimir = r;
            
            const modalHtml = `
                <div class="modal fade" id="gpModalVer" tabindex="-1">
                    <div class="modal-dialog modal-xl">
                        <div class="modal-content" style="border-radius: 16px; overflow: hidden; border: none;">
                            <div class="modal-header" style="background: linear-gradient(135deg, #1e3c72, #2a5298); color: white; border: none; padding: 22px 28px;">
                                <div style="display: flex; align-items: center; gap: 14px;">
                                    <div style="width: 46px; height: 46px; background: rgba(255,255,255,0.15); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                                        <i class="fas fa-clipboard-list" style="font-size: 20px;"></i>
                                    </div>
                                    <div>
                                        <h5 class="modal-title mb-0" style="font-weight: 700;">Detalhes da Gestão</h5>
                                        <small style="opacity: 0.85;">${this.escapeHtml(r.professorNome)}</small>
                                    </div>
                                </div>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            
                            <div class="modal-body" style="padding: 28px; max-height: 70vh; overflow-y: auto;">
                                <div style="background: linear-gradient(135deg, #eef2ff, #e0e7ff); border-radius: 14px; padding: 20px; margin-bottom: 20px;">
                                    <h6 style="color: #1e3c72; font-weight: 700; margin-bottom: 14px;">
                                        <i class="fas fa-user-tie"></i> Dados do Professor
                                    </h6>
                                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; font-size: 13px;">
                                        <div><strong>Nome:</strong> ${this.escapeHtml(r.professorNome)}</div>
                                        <div><strong>Email:</strong> ${this.escapeHtml(r.professorEmail || '-')}</div>
                                        <div><strong>Matrícula:</strong> ${this.escapeHtml(r.professorMatricula || '-')}</div>
                                        <div><strong>CPF:</strong> ${this.escapeHtml(r.professorCPF || '-')}</div>
                                        <div><strong>Telefone:</strong> ${this.escapeHtml(r.professorTelefone || '-')}</div>
                                        <div><strong>Eixo:</strong> ${this.escapeHtml(r.professorEixo || '-')}</div>
                                        <div><strong>Departamento:</strong> ${this.escapeHtml(r.professorDepartamento || '-')}</div>
                                        <div><strong>Titulação:</strong> ${this.escapeHtml(r.professorTitulacao || '-')}</div>
                                    </div>
                                </div>
                                
                                <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 14px 18px; border-radius: 10px; margin-bottom: 20px;">
                                    <strong style="color: #92400e;"><i class="fas fa-calendar-check"></i> Data da Coleta:</strong>
                                    <span style="color: #78350f; font-size: 16px; font-weight: 700; margin-left: 8px;">
                                        ${new Date(r.dataColeta).toLocaleDateString('pt-BR')}
                                    </span>
                                </div>
                                
                                ${r.turmasVinculadas?.length ? `
                                    <div style="margin-bottom: 20px;">
                                        <h6 style="color: #1e293b; font-weight: 700; margin-bottom: 10px;">
                                            <i class="fas fa-users"></i> Turmas Vinculadas
                                        </h6>
                                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                                            ${r.turmasVinculadas.map(t => `
                                                <span style="background: #dbeafe; color: #1e40af; padding: 6px 14px; border-radius: 8px; font-size: 13px; font-weight: 600;">
                                                    ${this.escapeHtml(t.turma)} — ${this.escapeHtml(t.curso)}
                                                </span>
                                            `).join('')}
                                        </div>
                                    </div>
                                ` : ''}
                                
                                <h6 style="color: #1e293b; font-weight: 700; margin-bottom: 12px;">
                                    <i class="fas fa-book-open"></i> Componentes Curriculares (${r.componentes?.length || 0})
                                </h6>
                                
                                ${(r.componentes || []).map((c, i) => {
                                    const norm = this.normalizarAulas(c.aulasRegistradas);
                                    const periodoId = c.periodo || norm.periodoLegado;
                                    const periodoLabel = this.getPeriodoLabel(periodoId);
                                    return `
                                        <div style="background: white; border: 2px solid #e5e7eb; border-radius: 12px; padding: 18px; margin-bottom: 12px;">
                                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                                                <h6 style="margin: 0; color: #6366f1; font-weight: 700;">
                                                    <i class="fas fa-book"></i> ${this.escapeHtml(c.nome)}
                                                </h6>
                                                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                                                    <span style="background: #eef2ff; color: #4f46e5; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">
                                                        ${this.escapeHtml(c.turma)}
                                                    </span>
                                                    <span style="background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600;">
                                                        ${periodoLabel}
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; font-size: 13px; color: #475569;">
                                                <div><strong>Eixo:</strong> ${this.escapeHtml(c.eixo || '-')}</div>
                                                <div><strong>Curso:</strong> ${this.escapeHtml(c.curso || '-')}</div>
                                                <div><strong>CH Anual:</strong> ${c.cargaHorariaAnual || 0}h</div>
                                                <div><strong>CH Semanal:</strong> ${c.cargaHorariaSemanal || 0}h</div>
                                            </div>
                                            
                                            <div style="margin-top: 12px; padding: 12px; background: #f8fafc; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
                                                <strong style="font-size: 12px; color: #475569;">Aulas Registradas no Período:</strong>
                                                <div style="font-size: 22px; font-weight: 700; color: #6366f1;">${norm.aulas}</div>
                                            </div>
                                            
                                            ${c.observacoes ? `
                                                <div style="margin-top: 12px; padding: 12px; background: #fffbeb; border-left: 3px solid #f59e0b; border-radius: 8px;">
                                                    <strong style="font-size: 12px; color: #92400e;">Observações:</strong>
                                                    <p style="margin: 6px 0 0; font-size: 13px; color: #78350f; white-space: pre-line;">${this.escapeHtml(c.observacoes)}</p>
                                                </div>
                                            ` : ''}
                                        </div>
                                    `;
                                }).join('')}
                                
                                ${r.observacoesGerais ? `
                                    <div style="margin-top: 20px; padding: 16px; background: #f0fdf4; border-left: 4px solid #10b981; border-radius: 10px;">
                                        <strong style="color: #065f46;"><i class="fas fa-comment-dots"></i> Observações Gerais:</strong>
                                        <p style="margin: 8px 0 0; color: #047857; white-space: pre-line;">${this.escapeHtml(r.observacoesGerais)}</p>
                                    </div>
                                ` : ''}
                                
                                <div style="margin-top: 20px; padding: 14px; background: #f8fafc; border-radius: 10px; font-size: 12px; color: #64748b;">
                                    <i class="fas fa-user-check"></i> Registrado por <strong>${this.escapeHtml(r.registradoPorNome)}</strong>
                                    em ${new Date(r.registradoEm).toLocaleString('pt-BR')}
                                    ${r.editadoPorNome ? `<br><i class="fas fa-edit"></i> Editado por <strong>${this.escapeHtml(r.editadoPorNome)}</strong> em ${new Date(r.editadoEm).toLocaleString('pt-BR')}` : ''}
                                </div>
                            </div>
                            
                            <div class="modal-footer" style="border-top: 1px solid #e5e7eb; padding: 16px 28px;">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                    <i class="fas fa-times me-2"></i> Fechar
                                </button>
                                <button type="button" class="btn btn-primary" onclick="GestaoProfessoresModule.imprimirRegistroAtual()"
                                        style="background: linear-gradient(135deg, #1e3c72, #2a5298); border: none;">
                                    <i class="fas fa-print me-2"></i> Imprimir
                                </button>
                            </div>
                        </div>
                    </div>
                </div>`;
            
            const oldModal = this.safeGet('gpModalVer');
            if (oldModal) oldModal.remove();
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            new bootstrap.Modal(this.safeGet('gpModalVer')).show();
        } catch (error) {
            console.error('❌ Erro:', error);
            this.mostrarToast('Erro ao carregar detalhes', 'error');
        }
    },

    // ============================================
    // EDITAR
    // ============================================
    async abrirEdicao(id) {
        try {
            const response = await fetch(`/api/gestao-professores/${id}`, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();
            if (!data.success) return;
            
            const r = data.registro;
            this.editandoId = id;
            
            this.componentesFormulario = (r.componentes || []).map((c, i) => {
                const norm = this.normalizarAulas(c.aulasRegistradas);
                return {
                    id: Date.now() + i,
                    componenteCurricularId: c.componenteCurricularId || null,
                    nome: c.nome || '',
                    eixo: c.eixo || '',
                    turma: c.turma || '',
                    curso: c.curso || '',
                    periodo: c.periodo || norm.periodoLegado || '',  // 🆕
                    aulasRegistradas: norm.aulas,                     // 🆕
                    cargaHorariaAnual: c.cargaHorariaAnual || 0,
                    cargaHorariaSemanal: c.cargaHorariaSemanal || 0,
                    observacoes: c.observacoes || '',
                    _modoManual: c.componenteCurricularId ? false : (c.nome ? false : true)
                };
            });
            this.turmasVinculadas = r.turmasVinculadas || [];
            
            const modalHtml = `
                <div class="modal fade" id="gpModalEditar" tabindex="-1">
                    <div class="modal-dialog modal-xl modal-dialog-scrollable">
                        <div class="modal-content" style="border-radius: 16px; overflow: hidden; border: none;">
                            <div class="modal-header" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; padding: 22px 28px;">
                                <div style="display: flex; align-items: center; gap: 14px;">
                                    <div style="width: 46px; height: 46px; background: rgba(255,255,255,0.18); border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                                        <i class="fas fa-edit" style="font-size: 20px;"></i>
                                    </div>
                                    <div>
                                        <h5 class="modal-title mb-0" style="font-weight: 700;">Editar Gestão</h5>
                                        <small style="opacity: 0.9;">${this.escapeHtml(r.professorNome)}</small>
                                    </div>
                                </div>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            
                            <div class="modal-body" style="padding: 28px;">
                                <div style="margin-bottom: 20px;">
                                    <label style="font-size: 13px; font-weight: 700; color: #374151; display: block; margin-bottom: 6px;">
                                        Data da Coleta <span style="color: #dc2626;">*</span>
                                    </label>
                                    <input type="date" id="gpEditDataColeta" 
                                           value="${this.getDataLocalISO(new Date(r.dataColeta))}"
                                           style="padding: 10px 14px; border: 2px solid #e5e7eb; border-radius: 10px; font-size: 14px;">
                                </div>
                                
                                <div style="margin-bottom: 20px;">
                                    <label style="font-size: 13px; font-weight: 700; color: #374151; display: block; margin-bottom: 10px;">
                                        <i class="fas fa-users"></i> Turmas Vinculadas
                                    </label>
                                    <div id="gpEditTurmasVinculadas"></div>
                                    <div style="display: flex; gap: 8px; margin-top: 10px;">
                                        <select id="gpEditSelectTurma" style="flex: 1; padding: 10px 14px; border: 2px solid #e5e7eb; border-radius: 10px; font-size: 13px;">
                                            <option value="">Selecione a turma...</option>
                                            ${this.turmas.map(t => `<option value="${this.escapeHtml(t.turma)}">${this.escapeHtml(t.turma)} — ${this.escapeHtml(t.curso)}</option>`).join('')}
                                        </select>
                                        <button onclick="GestaoProfessoresModule.adicionarTurmaEdicao()"
                                                style="padding: 10px 18px; background: #6366f1; color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer;">
                                            <i class="fas fa-plus"></i> Adicionar
                                        </button>
                                    </div>
                                </div>
                                
                                <div style="margin-bottom: 20px;">
                                    <label style="font-size: 13px; font-weight: 700; color: #374151; display: block; margin-bottom: 10px;">
                                        <i class="fas fa-book-open"></i> Componentes Curriculares
                                    </label>
                                    <div id="gpEditListaComponentes"></div>
                                    <button onclick="GestaoProfessoresModule.adicionarComponenteEdicao()"
                                            style="margin-top: 10px; padding: 10px 20px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; border: none; border-radius: 10px; font-weight: 600; cursor: pointer;">
                                        <i class="fas fa-plus"></i> Adicionar Componente
                                    </button>
                                </div>
                                
                                <div>
                                    <label style="font-size: 13px; font-weight: 700; color: #374151; display: block; margin-bottom: 6px;">
                                        Observações Gerais
                                    </label>
                                    <textarea id="gpEditObservacoesGerais" rows="3"
                                              style="width: 100%; padding: 12px 14px; border: 2px solid #e5e7eb; border-radius: 10px; font-size: 13px; resize: vertical;">${this.escapeHtml(r.observacoesGerais || '')}</textarea>
                                </div>
                            </div>
                            
                            <div class="modal-footer" style="border-top: 1px solid #e5e7eb; padding: 16px 28px;">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                    <i class="fas fa-times me-2"></i> Cancelar
                                </button>
                                <button type="button" class="btn btn-warning" onclick="GestaoProfessoresModule.salvarEdicao()"
                                        style="font-weight: 600;">
                                    <i class="fas fa-save me-2"></i> Salvar Alterações
                                </button>
                            </div>
                        </div>
                    </div>
                </div>`;
            
            const oldModal = this.safeGet('gpModalEditar');
            if (oldModal) oldModal.remove();
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            
            this.renderizarTurmasEdicao();
            this.renderizarComponentesEdicao();
            
            new bootstrap.Modal(this.safeGet('gpModalEditar')).show();
        } catch (error) {
            console.error('❌ Erro:', error);
        }
    },
    
    renderizarTurmasEdicao() {
        const container = this.safeGet('gpEditTurmasVinculadas');
        if (!container) return;
        if (this.turmasVinculadas.length === 0) {
            container.innerHTML = '<p style="color:#9ca3af; font-size:13px;">Nenhuma turma vinculada</p>';
            return;
        }
        container.innerHTML = this.turmasVinculadas.map((t, i) => `
            <div style="display:flex; align-items:center; justify-content:space-between; background:#f0fdf4; border:2px solid #bbf7d0; border-radius:8px; padding:8px 12px; margin-bottom:6px;">
                <span><strong>${this.escapeHtml(t.turma)}</strong> — ${this.escapeHtml(t.curso)}</span>
                <button onclick="GestaoProfessoresModule.removerTurmaEdicao(${i})" style="background:none; border:none; color:#dc2626; cursor:pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
    },
    
    adicionarTurmaEdicao() {
        const select = this.safeGet('gpEditSelectTurma');
        const turma = select?.value;
        if (!turma) return;
        if (this.turmasVinculadas.some(t => t.turma === turma)) {
            this.mostrarToast('Turma já adicionada', 'warning'); return;
        }
        const turmaData = this.turmas.find(t => t.turma === turma);
        this.turmasVinculadas.push({ turma, curso: turmaData?.curso || 'Não informado' });
        this.renderizarTurmasEdicao();
        if (select) select.value = '';
    },
    
    removerTurmaEdicao(index) {
        this.turmasVinculadas.splice(index, 1);
        this.renderizarTurmasEdicao();
    },
    
    renderizarComponentesEdicao() {
        const container = this.safeGet('gpEditListaComponentes');
        if (!container) return;
        
        if (this.componentesFormulario.length === 0) {
            container.innerHTML = '<p style="color:#9ca3af; font-size:13px;">Nenhum componente</p>';
            return;
        }
        
        container.innerHTML = this.componentesFormulario.map((c, i) => {
            let componenteOptions = '<option value="">Selecione...</option>';
            const compsEixo = c.eixo ? this.componentes.filter(comp => comp.eixo === c.eixo) : [];
            const temComponentesBanco = compsEixo.length > 0;
            const eixosComFallback = ['natureza', 'linguagens', 'humanas'];
            const eixoNormalizado = (c.eixo || '').toLowerCase().trim();
            const temFallbackPadrao = eixosComFallback.includes(eixoNormalizado) 
                && this.disciplinasPadraoPorEixo[eixoNormalizado];
            
            if (temComponentesBanco) {
                componenteOptions += `<optgroup label="📚 Cadastrados no sistema">`;
                compsEixo.forEach(comp => {
                    const selected = String(c.componenteCurricularId) === String(comp.id) ? 'selected' : '';
                    componenteOptions += `<option value="banco:${comp.id}" ${selected}>${this.escapeHtml(comp.nome)}</option>`;
                });
                componenteOptions += `</optgroup>`;
            } else if (temFallbackPadrao) {
                componenteOptions += `<optgroup label="⭐ Disciplinas padrão">`;
                this.disciplinasPadraoPorEixo[eixoNormalizado].forEach(disciplina => {
                    const selected = (!c.componenteCurricularId && c.nome === disciplina) ? 'selected' : '';
                    componenteOptions += `<option value="padrao:${disciplina}" ${selected}>${this.escapeHtml(disciplina)}</option>`;
                });
                componenteOptions += `</optgroup>`;
            } else if (c.eixo) {
                componenteOptions += `<option value="" disabled>⚠️ Nenhum componente cadastrado</option>`;
            }
            
            const estaEmModoManual = c._modoManual === true || (!c.componenteCurricularId && c.nome && !temFallbackPadrao);
            
            componenteOptions += `
                <optgroup label="─────────">
                    <option value="manual:__custom__" ${estaEmModoManual ? 'selected' : ''}>
                        ➕ Outro (digitar manualmente)
                    </option>
                </optgroup>`;
            
            const eixoOptions = '<option value="">Selecione...</option>' +
                this.eixos.map(e => `<option value="${this.escapeHtml(e.nome)}" ${e.nome === c.eixo ? 'selected' : ''}>${this.escapeHtml(e.label)}</option>`).join('');
            
            const turmaOptions = '<option value="">Selecione...</option>' +
                this.turmas.map(t => `<option value="${this.escapeHtml(t.turma)}" ${t.turma === c.turma ? 'selected' : ''}>${this.escapeHtml(t.turma)}</option>`).join('');
            
            const periodoOptions = this.gerarOpcoesPeriodo(c.periodo);
            
            return `
                <div style="background:white; border:2px solid #e5e7eb; border-radius:12px; padding:16px; margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                        <strong>Componente ${i+1}</strong>
                        <button onclick="GestaoProfessoresModule.removerComponenteEdicao(${c.id})" style="background:#fee2e2; color:#dc2626; border:none; padding:5px 10px; border-radius:6px; cursor:pointer; font-size:12px;">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                    
                    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:10px;">
                        <div>
                            <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Eixo</label>
                            <select onchange="GestaoProfessoresModule.atualizarEixoEdicao(${c.id}, this.value)" style="width:100%; padding:8px; border:2px solid #e5e7eb; border-radius:6px; font-size:12px;">
                                ${eixoOptions}
                            </select>
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Componente</label>
                            <select onchange="GestaoProfessoresModule.atualizarNomeEdicao(${c.id}, this.value)" style="width:100%; padding:8px; border:2px solid #e5e7eb; border-radius:6px; font-size:12px;">
                                ${componenteOptions}
                            </select>
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Turma</label>
                            <select onchange="GestaoProfessoresModule.atualizarTurmaEdicao(${c.id}, this.value)" style="width:100%; padding:8px; border:2px solid #e5e7eb; border-radius:6px; font-size:12px;">
                                ${turmaOptions}
                            </select>
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Período <span style="color:#dc2626;">*</span></label>
                            <select onchange="GestaoProfessoresModule.atualizarPeriodoEdicao(${c.id}, this.value)" style="width:100%; padding:8px; border:2px solid #e5e7eb; border-radius:6px; font-size:12px;">
                                ${periodoOptions}
                            </select>
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Aulas Registradas <span style="color:#dc2626;">*</span></label>
                            <input type="number" min="0" value="${c.aulasRegistradas === '' ? '' : c.aulasRegistradas}" 
                                   onchange="GestaoProfessoresModule.atualizarCampoEdicao(${c.id}, 'aulasRegistradas', this.value)"
                                   style="width:100%; padding:8px; border:2px solid #e5e7eb; border-radius:6px; font-size:12px;">
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">CH Anual</label>
                            <input type="number" value="${c.cargaHorariaAnual || 0}" onchange="GestaoProfessoresModule.atualizarCampoEdicao(${c.id}, 'cargaHorariaAnual', this.value)" style="width:100%; padding:8px; border:2px solid #e5e7eb; border-radius:6px; font-size:12px;">
                        </div>
                        <div>
                            <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">CH Semanal</label>
                            <input type="number" value="${c.cargaHorariaSemanal || 0}" onchange="GestaoProfessoresModule.atualizarCampoEdicao(${c.id}, 'cargaHorariaSemanal', this.value)" style="width:100%; padding:8px; border:2px solid #e5e7eb; border-radius:6px; font-size:12px;">
                        </div>
                    </div>
                    
                    ${estaEmModoManual ? `
                        <div style="margin-top:10px; padding:10px; background:#fffbeb; border:2px solid #fde68a; border-radius:8px;">
                            <label style="font-size:11px; font-weight:700; color:#92400e; display:block; margin-bottom:4px;">
                                <i class="fas fa-pencil-alt"></i> Nome manual:
                            </label>
                            <input type="text" value="${this.escapeHtml(c.nome)}" 
                                   onchange="GestaoProfessoresModule.atualizarNomeManualEdicao(${c.id}, this.value)"
                                   placeholder="Digite a disciplina..."
                                   style="width:100%; padding:8px; border:2px solid #fcd34d; border-radius:6px; font-size:12px;">
                        </div>
                    ` : ''}
                    
                    <div style="margin-top:10px;">
                        <label style="font-size:11px; font-weight:700; display:block; margin-bottom:4px;">Observações</label>
                        <textarea onchange="GestaoProfessoresModule.atualizarCampoEdicao(${c.id}, 'observacoes', this.value)" rows="2" style="width:100%; padding:8px; border:2px solid #e5e7eb; border-radius:6px; font-size:12px; resize:vertical;">${this.escapeHtml(c.observacoes || '')}</textarea>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    adicionarComponenteEdicao() {
        this.componentesFormulario.push({
            id: Date.now(),
            componenteCurricularId: null,
            nome: '', eixo: '', turma: '', curso: '',
            periodo: '',                    // 🆕
            aulasRegistradas: '',           // 🆕
            cargaHorariaAnual: 0,
            cargaHorariaSemanal: 0,
            observacoes: '',
            _modoManual: false
        });
        this.renderizarComponentesEdicao();
    },
    
    removerComponenteEdicao(id) {
        this.componentesFormulario = this.componentesFormulario.filter(c => c.id !== id);
        this.renderizarComponentesEdicao();
    },
    
    atualizarEixoEdicao(id, eixo) {
        const c = this.componentesFormulario.find(x => x.id === id);
        if (c) { 
            c.eixo = eixo; c.componenteCurricularId = null; c.nome = ''; c._modoManual = false;
            this.renderizarComponentesEdicao(); 
        }
    },
    
    atualizarNomeEdicao(id, valor) {
        const c = this.componentesFormulario.find(x => x.id === id);
        if (!c) return;
        if (valor.startsWith('banco:')) {
            const comp = this.componentes.find(x => String(x.id) === String(valor.replace('banco:', '')));
            if (comp) { c.componenteCurricularId = comp.id; c.nome = comp.nome; c.eixo = comp.eixo; c._modoManual = false; }
        } else if (valor.startsWith('padrao:')) {
            c.componenteCurricularId = null;
            c.nome = valor.replace('padrao:', '');
            c._modoManual = false;
        } else if (valor === 'manual:__custom__') {
            c._modoManual = true; c.componenteCurricularId = null; c.nome = '';
        }
        this.renderizarComponentesEdicao();
    },
    
    atualizarNomeManualEdicao(id, valor) {
        const c = this.componentesFormulario.find(x => x.id === id);
        if (c) { c.nome = valor.trim(); c._modoManual = true; }
    },
    
    atualizarTurmaEdicao(id, turma) {
        const c = this.componentesFormulario.find(x => x.id === id);
        if (c) { 
            c.turma = turma; 
            const td = this.turmas.find(t => t.turma === turma); 
            c.curso = td?.curso || ''; 
        }
    },
    
    // 🆕 Período na edição
    atualizarPeriodoEdicao(id, periodo) {
        const c = this.componentesFormulario.find(x => x.id === id);
        if (c) c.periodo = periodo;
    },
    
    atualizarCampoEdicao(id, campo, valor) {
        const c = this.componentesFormulario.find(x => x.id === id);
        if (c) {
            if (campo === 'aulasRegistradas') {
                c[campo] = valor === '' ? '' : parseInt(valor) || 0;
            } else {
                c[campo] = valor;
            }
        }
    },
    
    async salvarEdicao() {
        if (!this.editandoId) return;
        const dataColeta = this.safeGet('gpEditDataColeta')?.value;
        if (!dataColeta) { this.mostrarToast('Informe a data da coleta', 'warning'); return; }
        
        // Validações
        for (let i = 0; i < this.componentesFormulario.length; i++) {
            const c = this.componentesFormulario[i];
            if (!c.nome) { this.mostrarToast(`Componente ${i + 1}: nome é obrigatório`, 'warning'); return; }
            if (!c.turma) { this.mostrarToast(`Componente ${i + 1}: turma é obrigatória`, 'warning'); return; }
            if (!c.periodo) { this.mostrarToast(`Componente ${i + 1}: período é obrigatório`, 'warning'); return; }
            if (c.aulasRegistradas === '' || c.aulasRegistradas === null || c.aulasRegistradas === undefined) {
                this.mostrarToast(`Componente ${i + 1}: aulas são obrigatórias`, 'warning'); return;
            }
        }
        
        try {
            const payload = {
                turmasVinculadas: this.turmasVinculadas,
                componentes: this.componentesFormulario.map(c => ({
                    componenteCurricularId: c.componenteCurricularId,
                    nome: c.nome,
                    eixo: c.eixo,
                    turma: c.turma,
                    curso: c.curso,
                    periodo: c.periodo,                              // 🆕
                    aulasRegistradas: parseInt(c.aulasRegistradas) || 0, // 🆕
                    cargaHorariaAnual: c.cargaHorariaAnual,
                    cargaHorariaSemanal: c.cargaHorariaSemanal,
                    observacoes: c.observacoes
                })),
                dataColeta,
                observacoesGerais: this.safeGet('gpEditObservacoesGerais')?.value || ''
            };
            
            const response = await fetch(`/api/gestao-professores/${this.editandoId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${this.getToken()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            
            if (data.success) {
                this.mostrarToast('✅ Registro atualizado!', 'success');
                const modal = bootstrap.Modal.getInstance(this.safeGet('gpModalEditar'));
                if (modal) modal.hide();
                this.editandoId = null;
                await this.carregarLista();
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
    async excluirRegistro(id, nome) {
        const confirmar = await (window.setorPedagogico?.confirmarAcao?.(`Tem certeza que deseja excluir a gestão de "${nome}"?`) 
            ?? Promise.resolve(confirm('Tem certeza?')));
        if (!confirmar) return;
        
        try {
            const response = await fetch(`/api/gestao-professores/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();
            if (data.success) {
                this.mostrarToast('✅ Registro excluído!', 'success');
                await this.carregarLista();
                await this.carregarDashboard();
            }
        } catch (error) {
            this.mostrarToast('Erro ao excluir', 'error');
        }
    },

    // ============================================
    // IMPRESSÃO
    // ============================================
    async imprimirRegistro(id) {
        try {
            const response = await fetch(`/api/gestao-professores/${id}`, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();
            if (data.success) this.gerarImpressao(data.registro);
        } catch (error) {
            this.mostrarToast('Erro ao imprimir', 'error');
        }
    },
    
    imprimirRegistroAtual() {
        if (this.registroParaImprimir) this.gerarImpressao(this.registroParaImprimir);
    },
    
    gerarImpressao(r) {
        const logo = '/uploads/logo-iema.png';
        const carimbo = '/icons/assinatura_gpeda.ico';
        const dataGeracao = new Date().toLocaleString('pt-BR');
        
        const componentesHTML = (r.componentes || []).map((c, i) => {
            const norm = this.normalizarAulas(c.aulasRegistradas);
            const periodoId = c.periodo || norm.periodoLegado;
            const periodoLabel = this.getPeriodoLabel(periodoId);
            return `
                <div style="margin-bottom: 12px; padding: 10px; border: 1px solid #ccc; border-radius: 6px; background: #fafafa;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 6px; flex-wrap: wrap; gap: 4px;">
                        <strong style="font-size: 10pt;">${i + 1}. ${this.escapeHtml(c.nome)}</strong>
                        <div style="display: flex; gap: 4px;">
                            <span style="font-size: 9pt; background: #e0e7ff; padding: 2px 8px; border-radius: 4px;">
                                Turma: ${this.escapeHtml(c.turma)}
                            </span>
                            <span style="font-size: 9pt; background: #fef3c7; padding: 2px 8px; border-radius: 4px;">
                                ${periodoLabel}
                            </span>
                        </div>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px; font-size: 9pt; margin-bottom: 6px;">
                        <div><strong>Eixo:</strong> ${this.escapeHtml(c.eixo || '-')}</div>
                        <div><strong>Curso:</strong> ${this.escapeHtml(c.curso || '-')}</div>
                        <div><strong>CH Anual:</strong> ${c.cargaHorariaAnual || 0}h</div>
                        <div><strong>CH Semanal:</strong> ${c.cargaHorariaSemanal || 0}h</div>
                    </div>
                    <div style="text-align: center; background: white; padding: 6px; border-radius: 4px; border: 1px solid #e5e7eb;">
                        <div style="font-size: 8pt; color: #666;">Aulas Registradas no Período</div>
                        <strong style="font-size: 14pt; color: #1e3c72;">${norm.aulas}</strong>
                    </div>
                    ${c.observacoes ? `<div style="font-size: 9pt; padding: 6px; background: #fffbeb; border-left: 3px solid #f59e0b; border-radius: 4px; margin-top: 6px;"><strong>Obs:</strong> ${this.escapeHtml(c.observacoes)}</div>` : ''}
                </div>
            `;
        }).join('');
        
        const html = `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>Gestão de Professor - ${this.escapeHtml(r.professorNome)}</title>
                <style>
                    @page { size: A4 portrait; margin: 12mm; }
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: 'Times New Roman', Times, serif; font-size: 10pt; line-height: 1.4; color: #000; }
                    .header { text-align: center; border-bottom: 2px double #000; padding-bottom: 6px; margin-bottom: 10px; }
                    .header img { max-height: 18mm; display: block; margin: 0 auto 4px; }
                    .header h1 { font-size: 12pt; text-transform: uppercase; font-weight: bold; }
                    .header p { font-size: 9pt; margin: 2px 0 0; }
                    .titulo { text-align: center; font-size: 13pt; font-weight: bold; background: #eef2ff; padding: 8px; border: 2px solid #000; margin: 12px 0; text-transform: uppercase; letter-spacing: 1px; }
                    .section-title { font-size: 10pt; font-weight: bold; background: #e8e8e8; padding: 4px 10px; border-left: 4px solid #1e3c72; margin: 12px 0 8px; }
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; margin: 8px 0; font-size: 10pt; }
                    .info-grid div { padding: 3px 0; border-bottom: 1px dotted #999; }
                    .turmas-list { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
                    .turma-tag { background: #dbeafe; padding: 4px 10px; border-radius: 4px; font-size: 9pt; border: 1px solid #93c5fd; }
                    .assinaturas { display: flex; justify-content: space-around; margin-top: 40px; gap: 40px; }
                    .assinatura { flex: 1; text-align: center; }
                    .assinatura-container { position: relative; min-height: 18mm; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 0; }
                    .assinatura-container::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; border-bottom: 1px solid #000; }
                    .carimbo-overlay { max-height: 16mm; max-width: 50mm; opacity: 0.95; margin-bottom: 2mm; }
                    .assinatura-linha { padding-top: 4px; font-size: 9pt; }
                    .footer { text-align: center; margin-top: 20px; padding-top: 6px; border-top: 1px solid #ccc; font-size: 8pt; color: #666; }
                    .btn-print { display: block; margin: 15px auto; padding: 12px 30px; background: #1e3c72; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 14px; }
                    @media print { .no-print { display: none !important; } }
                </style>
            </head>
            <body>
                <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
                
                <div class="header">
                    <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
                    <h1>IEMA Pleno: São Luís - Centro</h1>
                    <p>Sistema de Gestão de Professores — Setor Pedagógico</p>
                </div>
                
                <div class="titulo">📋 Gestão de Professor</div>
                
                <div class="section-title">👤 Dados do Professor</div>
                <div class="info-grid">
                    <div><strong>Nome:</strong> ${this.escapeHtml(r.professorNome)}</div>
                    <div><strong>Email:</strong> ${this.escapeHtml(r.professorEmail || '-')}</div>
                    <div><strong>Matrícula:</strong> ${this.escapeHtml(r.professorMatricula || '-')}</div>
                    <div><strong>CPF:</strong> ${this.escapeHtml(r.professorCPF || '-')}</div>
                    <div><strong>Telefone:</strong> ${this.escapeHtml(r.professorTelefone || '-')}</div>
                    <div><strong>Eixo:</strong> ${this.escapeHtml(r.professorEixo || '-')}</div>
                    <div><strong>Departamento:</strong> ${this.escapeHtml(r.professorDepartamento || '-')}</div>
                    <div><strong>Titulação:</strong> ${this.escapeHtml(r.professorTitulacao || '-')}</div>
                </div>
                
                <div style="background: #fef3c7; padding: 8px 12px; border-left: 4px solid #f59e0b; border-radius: 4px; margin: 10px 0;">
                    <strong>📅 Data da Coleta:</strong> ${new Date(r.dataColeta).toLocaleDateString('pt-BR')}
                </div>
                
                ${r.turmasVinculadas?.length ? `
                    <div class="section-title">👥 Turmas Vinculadas</div>
                    <div class="turmas-list">
                        ${r.turmasVinculadas.map(t => `<span class="turma-tag">${this.escapeHtml(t.turma)} — ${this.escapeHtml(t.curso)}</span>`).join('')}
                    </div>
                ` : ''}
                
                <div class="section-title">📚 Componentes Curriculares</div>
                ${componentesHTML}
                
                ${r.observacoesGerais ? `
                    <div class="section-title">💬 Observações Gerais</div>
                    <div style="padding: 10px; border: 1px solid #ccc; border-radius: 6px; min-height: 40px; background: #f0fdf4;">
                        ${this.escapeHtml(r.observacoesGerais).replace(/\n/g, '<br>')}
                    </div>
                ` : ''}
                
                <div class="assinaturas">
                    <div class="assinatura">
                        <div class="assinatura-container">
                            <img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
                        </div>
                        <div class="assinatura-linha">Setor Pedagógico</div>
                    </div>
                    <div class="assinatura">
                        <div class="assinatura-container"></div>
                        <div class="assinatura-linha">Professor</div>
                    </div>
                </div>
                
                <div class="footer">
                    <p>Documento gerado em ${dataGeracao} — EducaPleno</p>
                </div>
            </body>
            </html>`;
        
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
            const mes = this.safeGet('gpDashboardMes')?.value || new Date().toISOString().substring(0, 7);
            const response = await fetch(`/api/gestao-professores/dashboard/resumo?mes=${mes}`, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();
            if (!data.success) return;
            
            const setVal = (id, val) => { const el = this.safeGet(id); if (el) el.textContent = val; };
            setVal('gpStatTotalGeral', data.resumo.totalGeral || 0);
            setVal('gpStatTotalMes', data.resumo.totalMes || 0);
            setVal('gpStatProfessores', data.resumo.totalProfessores || 0);
            setVal('gpStatAulas', data.resumo.totalAulasRegistradas || 0);
            
            this.renderizarGraficos(data, mes);
            this.renderizarTopProfessores(data.topProfessores);
            this.renderizarUltimos(data.ultimosRegistros);
        } catch (error) {
            console.error('❌ Erro no dashboard:', error);
        }
    },
    
    renderizarGraficos(data, mes) {
        // Gráfico por Eixo
        const ctxEixo = this.safeGet('gpChartEixo');
        if (ctxEixo && data.porEixo) {
            if (this.charts.eixo) { try { this.charts.eixo.destroy(); } catch(e){} }
            const cores = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#ef4444'];
            this.charts.eixo = new Chart(ctxEixo.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: data.porEixo.map(e => e.eixo),
                    datasets: [{
                        data: data.porEixo.map(e => e.count),
                        backgroundColor: data.porEixo.map((_, i) => cores[i % cores.length]),
                        borderWidth: 2, borderColor: '#fff'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: true, cutout: '60%',
                    plugins: { legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, font: { size: 11 } } } }
                }
            });
        }
        
        // Gráfico por Turma
        const ctxTurma = this.safeGet('gpChartTurma');
        if (ctxTurma && data.porTurma) {
            if (this.charts.turma) { try { this.charts.turma.destroy(); } catch(e){} }
            const coresTurma = ['#0ea5e9', '#06b6d4', '#14b8a6', '#10b981', '#22c55e', '#84cc16', '#eab308', '#f59e0b', '#f97316', '#ef4444', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1'];
            this.charts.turma = new Chart(ctxTurma.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: data.porTurma.map(t => t.turma),
                    datasets: [{
                        label: 'Componentes',
                        data: data.porTurma.map(t => t.count),
                        backgroundColor: data.porTurma.map((_, i) => coresTurma[i % coresTurma.length]),
                        borderRadius: 6, maxBarThickness: 32
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: true, indexAxis: 'y',
                    plugins: { legend: { display: false } },
                    scales: { x: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } } }
                }
            });
        }
        
        // 🆕 Gráfico por Período
        const ctxPeriodo = this.safeGet('gpChartPeriodo');
        if (ctxPeriodo && data.porPeriodo) {
            if (this.charts.periodo) { try { this.charts.periodo.destroy(); } catch(e){} }
            const coresPeriodo = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];
            this.charts.periodo = new Chart(ctxPeriodo.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: data.porPeriodo.map(p => this.getPeriodoLabel(p.periodo)),
                    datasets: [{
                        label: 'Aulas',
                        data: data.porPeriodo.map(p => p.totalAulas),
                        backgroundColor: data.porPeriodo.map((_, i) => coresPeriodo[i % coresPeriodo.length]),
                        borderRadius: 6, maxBarThickness: 48
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: true,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } }
                }
            });
        }
    },
    
    renderizarTopProfessores(lista) {
        const container = this.safeGet('gpRankingProfessores');
        if (!container) return;
        if (!lista || lista.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:30px; color:#9ca3af;"><i class="fas fa-trophy" style="font-size:32px; opacity:0.5;"></i><p>Nenhum dado</p></div>';
            return;
        }
        container.innerHTML = lista.map((p, i) => {
            const medalha = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1);
            return `
                <div style="display:flex; align-items:center; gap:12px; padding:12px; background:${i < 3 ? '#fef3c7' : '#f8fafc'}; border-radius:10px; margin-bottom:8px;">
                    <div style="width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg,#1e3c72,#2a5298); color:white; display:flex; align-items:center; justify-content:center; font-weight:700;">${medalha}</div>
                    <div style="flex:1;">
                        <div style="font-weight:700; color:#1e293b; font-size:14px;">${this.escapeHtml(p.nome)}</div>
                        <div style="font-size:11px; color:#64748b;">${this.escapeHtml(p.eixo || 'Sem eixo')}</div>
                    </div>
                    <div style="font-size:20px; font-weight:700; color:#6366f1;">${p.totalComponentes}</div>
                </div>
            `;
        }).join('');
    },
    
    renderizarUltimos(lista) {
        const container = this.safeGet('gpUltimosRegistros');
        if (!container) return;
        if (!lista || lista.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:30px; color:#9ca3af;"><i class="fas fa-history" style="font-size:32px; opacity:0.5;"></i><p>Nenhum registro</p></div>';
            return;
        }
        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr><th>Data</th><th>Professor</th><th>Eixo</th><th>Componentes</th></tr>
                    </thead>
                    <tbody>
                        ${lista.map(r => `
                            <tr>
                                <td>${r.dataColetaFormatada}</td>
                                <td>${this.escapeHtml(r.professorNome)}</td>
                                <td>${this.escapeHtml(r.professorEixo || '-')}</td>
                                <td><span class="badge bg-primary">${r.totalComponentes}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    },

    // ============================================
    // GERAR RELATÓRIO (VERSÃO CORRIGIDA — por tipo)
    // ============================================
    async gerarRelatorio() {
        const container = this.safeGet('gpResultadoRelatorio');
        if (!container) return;
        
        container.innerHTML = '<div style="text-align:center; padding:50px;"><i class="fas fa-spinner fa-spin" style="font-size:32px; color:#6366f1;"></i><p style="margin-top:15px;">Gerando relatório...</p></div>';
        
        try {
            const tipo = this.safeGet('gpTipoRelatorio')?.value || 'geral';
            const params = new URLSearchParams({ tipo });
            
            const eixo = this.safeGet('gpRelatorioEixo')?.value;
            const turma = this.safeGet('gpRelatorioTurma')?.value;
            const periodo = this.safeGet('gpRelatorioPeriodo')?.value;
            const professorId = this.safeGet('gpRelatorioProfessor')?.value;
            const dataInicio = this.safeGet('gpRelatorioDataInicio')?.value;
            const dataFim = this.safeGet('gpRelatorioDataFim')?.value;
            
            if (eixo) params.append('eixo', eixo);
            if (turma) params.append('turma', turma);
            if (periodo) params.append('periodo', periodo);
            if (professorId) params.append('professorId', professorId);
            if (dataInicio) params.append('dataInicio', dataInicio);
            if (dataFim) params.append('dataFim', dataFim);
            
            const response = await fetch(`/api/gestao-professores/relatorio/gerar?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${this.getToken()}` }
            });
            const data = await response.json();
            if (!data.success) throw new Error(data.error);
            
            this.relatorioAtual = data;
            
            const btnCSV = this.safeGet('gpBtnExportarCSV');
            if (btnCSV) btnCSV.disabled = false;
            const btnPDF = this.safeGet('gpBtnImprimirRelatorio');
            if (btnPDF) btnPDF.disabled = false;
            
            // ============================================
            // MONTAR HTML DO RESULTADO POR TIPO
            // ============================================
            let html = this.renderizarResumoRelatorio(data, tipo);
            
            // ------ Tipo: GERAL ------
            if (tipo === 'geral') {
                html += this.renderizarRelatorioGeral(data);
            }
            // ------ Tipo: PROFESSOR ------
            else if (tipo === 'professor') {
                html += this.renderizarRelatorioPorProfessor(data);
            }
            // ------ Tipo: TURMA ------
            else if (tipo === 'turma') {
                html += this.renderizarRelatorioPorTurma(data);
            }
            // ------ Tipo: EIXO ------
            else if (tipo === 'eixo') {
                html += this.renderizarRelatorioPorEixo(data);
            }
            
            container.innerHTML = html;
        } catch (error) {
            console.error(error);
            container.innerHTML = `<div style="text-align:center; padding:50px; color:#ef4444;">
                <i class="fas fa-exclamation-triangle" style="font-size:48px;"></i>
                <h4>Erro</h4>
                <p>${error.message}</p>
            </div>`;
        }
    },

    // ============================================
    // RENDERIZAR RESUMO (cards do topo — comum a todos os tipos)
    // ============================================
    renderizarResumoRelatorio(data, tipo) {
        const total = data.total || 0;
        const totalComponentes = data.totalComponentes || 0;
        const totalAulas = data.totalAulas || 0;
        const totalRegistros = data.totalRegistros || data.total || 0;
        
        let labelTotal = 'Registros';
        if (tipo === 'professor') labelTotal = 'Professores';
        else if (tipo === 'turma') labelTotal = 'Turmas';
        else if (tipo === 'eixo') labelTotal = 'Eixos';
        
        return `
            <div class="card" style="margin-bottom:20px;">
                <div class="card-body">
                    <h5><i class="fas fa-chart-bar"></i> Resultado do Relatório ${this.labelTipo(tipo)}</h5>
                    <div style="display:flex; gap:15px; flex-wrap:wrap; margin:20px 0;">
                        <div style="flex:1; min-width:150px; text-align:center; padding:20px; background:#eef2ff; border-radius:12px;">
                            <div style="font-size:32px; font-weight:700; color:#4f46e5;">${total}</div>
                            <div style="font-size:12px; color:#64748b;">${labelTotal}</div>
                        </div>
                        <div style="flex:1; min-width:150px; text-align:center; padding:20px; background:#f0fdf4; border-radius:12px;">
                            <div style="font-size:32px; font-weight:700; color:#10b981;">${totalComponentes}</div>
                            <div style="font-size:12px; color:#64748b;">Componentes</div>
                        </div>
                        <div style="flex:1; min-width:150px; text-align:center; padding:20px; background:#fef3c7; border-radius:12px;">
                            <div style="font-size:32px; font-weight:700; color:#f59e0b;">${totalAulas}</div>
                            <div style="font-size:12px; color:#64748b;">Aulas Registradas</div>
                        </div>
                        ${tipo !== 'geral' ? `
                            <div style="flex:1; min-width:150px; text-align:center; padding:20px; background:#ede9fe; border-radius:12px;">
                                <div style="font-size:32px; font-weight:700; color:#8b5cf6;">${totalRegistros}</div>
                                <div style="font-size:12px; color:#64748b;">Registros Totais</div>
                            </div>
                        ` : ''}
                    </div>
        `;
    },

    labelTipo(tipo) {
        const labels = {
            'geral': 'Geral',
            'professor': 'por Professor',
            'turma': 'por Turma',
            'eixo': 'por Eixo'
        };
        return labels[tipo] || '';
    },

    // ============================================
    // RENDERIZAR RELATÓRIO GERAL
    // ============================================
    renderizarRelatorioGeral(data) {
        let html = '';
        
        if (data.estatisticas?.porEixo && Object.keys(data.estatisticas.porEixo).length > 0) {
            html += `<h6 style="margin-top:20px;">Por Eixo</h6><div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">`;
            Object.entries(data.estatisticas.porEixo).forEach(([k, v]) => {
                html += `<span style="background:#eef2ff; color:#4f46e5; padding:8px 14px; border-radius:8px; font-weight:600; font-size:13px;">${k}: ${v}</span>`;
            });
            html += `</div>`;
        }
        
        if (data.estatisticas?.porPeriodo && Object.keys(data.estatisticas.porPeriodo).length > 0) {
            html += `<h6 style="margin-top:20px;">Aulas por Período</h6><div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">`;
            Object.entries(data.estatisticas.porPeriodo).forEach(([k, v]) => {
                html += `<span style="background:#fef3c7; color:#92400e; padding:8px 14px; border-radius:8px; font-weight:600; font-size:13px;">${this.getPeriodoLabel(k)}: ${v} aula(s)</span>`;
            });
            html += `</div>`;
        }
        
        if (data.registros?.length > 0) {
            html += `
                <h6 style="margin-top:20px;">Detalhamento (${data.registros.length} registro(s))</h6>
                <div class="table-responsive" style="margin-top:10px;">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Professor</th>
                                <th>Eixo</th>
                                <th>Componentes</th>
                                <th>Aulas</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${data.registros.map(r => {
                                let totalAulasR = 0;
                                (r.componentes || []).forEach(c => {
                                    totalAulasR += this.normalizarAulas(c.aulasRegistradas).aulas;
                                });
                                return `
                                    <tr>
                                        <td>${r.dataColetaFormatada}</td>
                                        <td>${this.escapeHtml(r.professorNome)}</td>
                                        <td>${this.escapeHtml(r.professorEixo || '-')}</td>
                                        <td>${r.componentes?.length || 0}</td>
                                        <td>${totalAulasR}</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
        
        html += `</div></div>`;
        return html;
    },

    // ============================================
    // RENDERIZAR RELATÓRIO POR PROFESSOR
    // ============================================
    renderizarRelatorioPorProfessor(data) {
        let html = '';
        
        if (!data.professores || data.professores.length === 0) {
            return `<div style="text-align:center; padding:40px; color:#94a3b8;">
                <i class="fas fa-user-slash" style="font-size:48px; opacity:0.5;"></i>
                <p>Nenhum professor encontrado com os filtros aplicados</p>
            </div></div></div>`;
        }
        
        html += `
            <h6 style="margin-top:20px;"><i class="fas fa-chalkboard-teacher"></i> Detalhamento por Professor (${data.professores.length})</h6>
            <div style="display:flex; flex-direction:column; gap:15px; margin-top:15px;">
                ${data.professores.map(p => `
                    <div style="background:white; border:2px solid #e5e7eb; border-radius:12px; padding:18px; border-left:4px solid #6366f1;">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
                            <div>
                                <h6 style="margin:0; color:#1e293b; font-weight:700; font-size:15px;">
                                    <i class="fas fa-user-tie" style="color:#6366f1;"></i> ${this.escapeHtml(p.professorNome)}
                                </h6>
                                <div style="font-size:12px; color:#64748b; margin-top:4px;">
                                    ${p.professorMatricula ? `<i class="fas fa-id-card"></i> ${this.escapeHtml(p.professorMatricula)}` : ''}
                                    ${p.professorEixo ? ` • <i class="fas fa-sitemap"></i> ${this.escapeHtml(p.professorEixo)}` : ''}
                                    ${p.professorEmail ? ` • <i class="fas fa-envelope"></i> ${this.escapeHtml(p.professorEmail)}` : ''}
                                </div>
                            </div>
                            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                <span style="background:#eef2ff; color:#4f46e5; padding:5px 12px; border-radius:8px; font-size:12px; font-weight:600;">
                                    ${p.totalRegistros} registro(s)
                                </span>
                                <span style="background:#f0fdf4; color:#065f46; padding:5px 12px; border-radius:8px; font-size:12px; font-weight:600;">
                                    ${p.totalComponentes} componente(s)
                                </span>
                                <span style="background:#fef3c7; color:#92400e; padding:5px 12px; border-radius:8px; font-size:12px; font-weight:600;">
                                    ${p.totalAulas} aula(s)
                                </span>
                            </div>
                        </div>
                        
                        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px; font-size:13px; color:#475569;">
                            <div>
                                <strong>Turmas (${p.totalTurmas}):</strong><br>
                                ${p.turmas.length > 0 ? p.turmas.map(t => `<span style="background:#dbeafe; color:#1e40af; padding:3px 8px; border-radius:6px; font-size:11px; margin:2px; display:inline-block;">${this.escapeHtml(t)}</span>`).join('') : '<span style="color:#94a3b8;">-</span>'}
                            </div>
                            <div>
                                <strong>Componentes (${p.totalComponentesUnicos}):</strong><br>
                                ${p.componentes.length > 0 ? p.componentes.map(c => `<span style="background:#e0e7ff; color:#4f46e5; padding:3px 8px; border-radius:6px; font-size:11px; margin:2px; display:inline-block;">${this.escapeHtml(c)}</span>`).join('') : '<span style="color:#94a3b8;">-</span>'}
                            </div>
                            <div>
                                <strong>Períodos (${p.totalPeriodos}):</strong><br>
                                ${p.periodos.length > 0 ? p.periodos.map(pe => `<span style="background:#fef3c7; color:#92400e; padding:3px 8px; border-radius:6px; font-size:11px; margin:2px; display:inline-block;">${this.getPeriodoLabel(pe)}</span>`).join('') : '<span style="color:#94a3b8;">-</span>'}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        html += `</div></div>`;
        return html;
    },

    // ============================================
    // RENDERIZAR RELATÓRIO POR TURMA
    // ============================================
    renderizarRelatorioPorTurma(data) {
        let html = '';
        
        if (!data.turmas || data.turmas.length === 0) {
            return `<div style="text-align:center; padding:40px; color:#94a3b8;">
                <i class="fas fa-users-slash" style="font-size:48px; opacity:0.5;"></i>
                <p>Nenhuma turma encontrada com os filtros aplicados</p>
            </div></div></div>`;
        }
        
        html += `
            <h6 style="margin-top:20px;"><i class="fas fa-users"></i> Detalhamento por Turma (${data.turmas.length})</h6>
            <div style="display:flex; flex-direction:column; gap:15px; margin-top:15px;">
                ${data.turmas.map(t => `
                    <div style="background:white; border:2px solid #e5e7eb; border-radius:12px; padding:18px; border-left:4px solid #10b981;">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
                            <div>
                                <h6 style="margin:0; color:#1e293b; font-weight:700; font-size:15px;">
                                    <i class="fas fa-school" style="color:#10b981;"></i> Turma ${this.escapeHtml(t.turma)}
                                </h6>
                                <div style="font-size:12px; color:#64748b; margin-top:4px;">
                                    <i class="fas fa-graduation-cap"></i> ${this.escapeHtml(t.curso || 'Não informado')}
                                </div>
                            </div>
                            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                <span style="background:#dbeafe; color:#1e40af; padding:5px 12px; border-radius:8px; font-size:12px; font-weight:600;">
                                    ${t.totalProfessores} professor(es)
                                </span>
                                <span style="background:#f0fdf4; color:#065f46; padding:5px 12px; border-radius:8px; font-size:12px; font-weight:600;">
                                    ${t.totalComponentes} componente(s)
                                </span>
                                <span style="background:#fef3c7; color:#92400e; padding:5px 12px; border-radius:8px; font-size:12px; font-weight:600;">
                                    ${t.totalAulas} aula(s)
                                </span>
                            </div>
                        </div>
                        
                        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:12px; font-size:13px; color:#475569;">
                            <div>
                                <strong>Professores (${t.totalProfessores}):</strong><br>
                                ${t.professores.length > 0 ? t.professores.map(p => `<span style="background:#eef2ff; color:#4f46e5; padding:3px 8px; border-radius:6px; font-size:11px; margin:2px; display:inline-block;">${this.escapeHtml(p)}</span>`).join('') : '<span style="color:#94a3b8;">-</span>'}
                            </div>
                            <div>
                                <strong>Componentes (${t.totalComponentesUnicos}):</strong><br>
                                ${t.componentes.length > 0 ? t.componentes.map(c => `<span style="background:#e0e7ff; color:#4f46e5; padding:3px 8px; border-radius:6px; font-size:11px; margin:2px; display:inline-block;">${this.escapeHtml(c)}</span>`).join('') : '<span style="color:#94a3b8;">-</span>'}
                            </div>
                            <div>
                                <strong>Períodos (${t.totalPeriodos}):</strong><br>
                                ${t.periodos.length > 0 ? t.periodos.map(pe => `<span style="background:#fef3c7; color:#92400e; padding:3px 8px; border-radius:6px; font-size:11px; margin:2px; display:inline-block;">${this.getPeriodoLabel(pe)}</span>`).join('') : '<span style="color:#94a3b8;">-</span>'}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        html += `</div></div>`;
        return html;
    },

    // ============================================
    // RENDERIZAR RELATÓRIO POR EIXO (com nomes de componentes)
    // ============================================
    renderizarRelatorioPorEixo(data) {
        let html = '';
        
        if (!data.eixos || data.eixos.length === 0) {
            return `<div style="text-align:center; padding:40px; color:#94a3b8;">
                <i class="fas fa-sitemap" style="font-size:48px; opacity:0.5;"></i>
                <p>Nenhum eixo encontrado com os filtros aplicados</p>
            </div></div></div>`;
        }
        
        html += `
            <h6 style="margin-top:20px;"><i class="fas fa-sitemap"></i> Detalhamento por Eixo (${data.eixos.length})</h6>
            <div style="display:flex; flex-direction:column; gap:15px; margin-top:15px;">
                ${data.eixos.map(e => `
                    <div style="background:white; border:2px solid #e5e7eb; border-radius:12px; padding:18px; border-left:4px solid #f59e0b;">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
                            <div>
                                <h6 style="margin:0; color:#1e293b; font-weight:700; font-size:15px;">
                                    <i class="fas fa-layer-group" style="color:#f59e0b;"></i> ${this.escapeHtml(e.eixo)}
                                </h6>
                            </div>
                            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                                <span style="background:#dbeafe; color:#1e40af; padding:5px 12px; border-radius:8px; font-size:12px; font-weight:600;">
                                    ${e.totalProfessores} professor(es)
                                </span>
                                <span style="background:#fef3c7; color:#92400e; padding:5px 12px; border-radius:8px; font-size:12px; font-weight:600;">
                                    ${e.totalTurmas} turma(s)
                                </span>
                                <span style="background:#f0fdf4; color:#065f46; padding:5px 12px; border-radius:8px; font-size:12px; font-weight:600;">
                                    ${e.totalComponentesUnicos} componente(s)
                                </span>
                                <span style="background:#fee2e2; color:#991b1b; padding:5px 12px; border-radius:8px; font-size:12px; font-weight:600;">
                                    ${e.totalAulas} aula(s)
                                </span>
                            </div>
                        </div>
                        
                        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:12px; font-size:13px; color:#475569; margin-bottom:12px;">
                            <div>
                                <strong>Professores:</strong><br>
                                ${e.professores.length > 0 ? e.professores.map(p => `<span style="background:#eef2ff; color:#4f46e5; padding:3px 8px; border-radius:6px; font-size:11px; margin:2px; display:inline-block;">${this.escapeHtml(p)}</span>`).join('') : '<span style="color:#94a3b8;">-</span>'}
                            </div>
                            <div>
                                <strong>Turmas:</strong><br>
                                ${e.turmas.length > 0 ? e.turmas.map(t => `<span style="background:#dbeafe; color:#1e40af; padding:3px 8px; border-radius:6px; font-size:11px; margin:2px; display:inline-block;">${this.escapeHtml(t)}</span>`).join('') : '<span style="color:#94a3b8;">-</span>'}
                            </div>
                        </div>
                        
                        <div style="background:#f8fafc; border-radius:8px; padding:12px; margin-top:8px;">
                            <strong style="font-size:12px; color:#475569;">
                                <i class="fas fa-book-open"></i> Componentes Curriculares (${e.componentes.length}):
                            </strong>
                            <table style="width:100%; margin-top:8px; font-size:13px; border-collapse:collapse;">
                                <thead>
                                    <tr style="background:#e2e8f0;">
                                        <th style="padding:6px 10px; text-align:left; border-radius:6px 0 0 6px;">Componente</th>
                                        <th style="padding:6px 10px; text-align:center; width:100px;">Registros</th>
                                        <th style="padding:6px 10px; text-align:center; width:100px; border-radius:0 6px 6px 0;">Aulas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${e.componentes.map(c => `
                                        <tr style="border-bottom:1px solid #e2e8f0;">
                                            <td style="padding:6px 10px; color:#1e293b; font-weight:500;">
                                                <i class="fas fa-book" style="color:#6366f1; margin-right:6px;"></i>
                                                ${this.escapeHtml(c.nome)}
                                            </td>
                                            <td style="padding:6px 10px; text-align:center; color:#4f46e5; font-weight:600;">${c.count}</td>
                                            <td style="padding:6px 10px; text-align:center; color:#f59e0b; font-weight:600;">${c.aulas}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        html += `</div></div>`;
        return html;
    },
    
    // ============================================
    // EXPORTAR CSV (VERSÃO CORRIGIDA — por tipo)
    // ============================================
    exportarCSV() {
        const data = this.relatorioAtual;
        if (!data) {
            this.mostrarToast('⚠️ Gere um relatório primeiro', 'warning');
            return;
        }

        const tipo = data.tipo || 'geral';

        // ============================================
        // TÍTULO + SUBTÍTULO (por tipo)
        // ============================================
        const titulos = {
            'geral': 'Relatório Geral de Gestão de Professores',
            'professor': 'Relatório de Gestão por Professor',
            'turma': 'Relatório de Gestão por Turma',
            'eixo': 'Relatório de Gestão por Eixo'
        };
        const titulo = titulos[tipo] || 'Relatório de Gestão de Professores';

        // ============================================
        // FILTROS APLICADOS
        // ============================================
        const filtros = [];
        if (data.filtros?.eixo) filtros.push({ label: 'Eixo', valor: data.filtros.eixo });
        if (data.filtros?.turma) filtros.push({ label: 'Turma', valor: data.filtros.turma });
        if (data.filtros?.periodo) filtros.push({ label: 'Período', valor: this.getPeriodoLabel(data.filtros.periodo) });
        if (data.filtros?.professorId) {
            const prof = this.professores.find(p => String(p.id) === String(data.filtros.professorId));
            filtros.push({ label: 'Professor', valor: prof?.nome || data.filtros.professorId });
        }
        if (data.filtros?.dataInicio) filtros.push({ label: 'Data inicial', valor: data.filtros.dataInicio });
        if (data.filtros?.dataFim) filtros.push({ label: 'Data final', valor: data.filtros.dataFim });

        // ============================================
        // MÉTRICAS (comuns)
        // ============================================
        const metricas = {
            'Total de registros': data.totalRegistros || data.total || 0,
            'Total de componentes': data.totalComponentes || 0,
            'Total de aulas': data.totalAulas || 0
        };

        // ============================================
        // COLUNAS POR TIPO
        // ============================================
        let colunas = [];
        let registros = [];
        let subtitulo = '';

        // ------------------------------------------------
        // TIPO: GERAL
        // ------------------------------------------------
        if (tipo === 'geral') {
            registros = data.registros || [];
            subtitulo = 'Visão consolidada de todas as gestões';

            // Achata cada registro em linhas por componente
            const linhasAchatadas = [];
            registros.forEach(r => {
                if (!r.componentes || r.componentes.length === 0) {
                    linhasAchatadas.push({
                        dataColeta: r.dataColetaFormatada,
                        professorNome: r.professorNome,
                        professorMatricula: r.professorMatricula || '',
                        professorEixo: r.professorEixo || '',
                        professorEmail: r.professorEmail || '',
                        componenteNome: '',
                        componenteEixo: '',
                        componenteTurma: '',
                        componenteCurso: '',
                        componentePeriodo: '',
                        aulas: 0,
                        chAnual: 0,
                        chSemanal: 0,
                        observacoes: r.observacoesGerais || ''
                    });
                } else {
                    r.componentes.forEach(c => {
                        const norm = this.normalizarAulas(c.aulasRegistradas);
                        const periodoId = c.periodo || norm.periodoLegado;
                        linhasAchatadas.push({
                            dataColeta: r.dataColetaFormatada,
                            professorNome: r.professorNome,
                            professorMatricula: r.professorMatricula || '',
                            professorEixo: r.professorEixo || '',
                            professorEmail: r.professorEmail || '',
                            componenteNome: c.nome || '',
                            componenteEixo: c.eixo || '',
                            componenteTurma: c.turma || '',
                            componenteCurso: c.curso || '',
                            componentePeriodo: this.getPeriodoLabel(periodoId),
                            aulas: norm.aulas,
                            chAnual: c.cargaHorariaAnual || 0,
                            chSemanal: c.cargaHorariaSemanal || 0,
                            observacoes: c.observacoes || ''
                        });
                    });
                }
            });
            registros = linhasAchatadas;

            colunas = [
                { label: 'Data da Coleta', format: (l) => l.dataColeta },
                { label: 'Professor', format: (l) => l.professorNome },
                { label: 'Matrícula', format: (l) => l.professorMatricula },
                { label: 'Email', format: (l) => l.professorEmail },
                { label: 'Eixo do Professor', format: (l) => l.professorEixo },
                { label: 'Componente Curricular', format: (l) => l.componenteNome },
                { label: 'Eixo do Componente', format: (l) => l.componenteEixo },
                { label: 'Turma', format: (l) => l.componenteTurma },
                { label: 'Curso', format: (l) => l.componenteCurso },
                { label: 'Período', format: (l) => l.componentePeriodo },
                { label: 'Aulas Registradas', format: (l) => l.aulas },
                { label: 'CH Anual', format: (l) => l.chAnual },
                { label: 'CH Semanal', format: (l) => l.chSemanal },
                { label: 'Observações', format: (l) => l.observacoes }
            ];
        }

        // ------------------------------------------------
        // TIPO: PROFESSOR
        // ------------------------------------------------
        else if (tipo === 'professor') {
            registros = data.professores || [];
            subtitulo = `${registros.length} professor(es) no relatório`;

            colunas = [
                { label: 'Professor', format: (p) => p.professorNome },
                { label: 'Matrícula', format: (p) => p.professorMatricula || '' },
                { label: 'Email', format: (p) => p.professorEmail || '' },
                { label: 'Eixo', format: (p) => p.professorEixo || '' },
                { label: 'Total de Registros', format: (p) => p.totalRegistros },
                { label: 'Total de Componentes', format: (p) => p.totalComponentes },
                { label: 'Total de Aulas', format: (p) => p.totalAulas },
                { label: 'Total de Turmas', format: (p) => p.totalTurmas },
                {
                    label: 'Turmas',
                    format: (p) => Array.isArray(p.turmas) ? p.turmas.join(' | ') : ''
                },
                {
                    label: 'Componentes Únicos',
                    format: (p) => p.totalComponentesUnicos
                },
                {
                    label: 'Componentes',
                    format: (p) => Array.isArray(p.componentes) ? p.componentes.join(' | ') : ''
                },
                {
                    label: 'Períodos',
                    format: (p) => Array.isArray(p.periodos)
                        ? p.periodos.map(id => this.getPeriodoLabel(id)).join(' | ')
                        : ''
                }
            ];
        }

        // ------------------------------------------------
        // TIPO: TURMA
        // ------------------------------------------------
        else if (tipo === 'turma') {
            registros = data.turmas || [];
            subtitulo = `${registros.length} turma(s) no relatório`;

            colunas = [
                { label: 'Turma', format: (t) => t.turma },
                { label: 'Curso', format: (t) => t.curso || '' },
                { label: 'Total de Registros', format: (t) => t.totalRegistros },
                { label: 'Total de Componentes', format: (t) => t.totalComponentes },
                { label: 'Total de Aulas', format: (t) => t.totalAulas },
                { label: 'Total de Professores', format: (t) => t.totalProfessores },
                {
                    label: 'Professores',
                    format: (t) => Array.isArray(t.professores) ? t.professores.join(' | ') : ''
                },
                {
                    label: 'Componentes',
                    format: (t) => Array.isArray(t.componentes) ? t.componentes.join(' | ') : ''
                },
                {
                    label: 'Períodos',
                    format: (t) => Array.isArray(t.periodos)
                        ? t.periodos.map(id => this.getPeriodoLabel(id)).join(' | ')
                        : ''
                }
            ];
        }

        // ------------------------------------------------
        // TIPO: EIXO
        // ------------------------------------------------
        else if (tipo === 'eixo') {
            registros = data.eixos || [];
            subtitulo = `${registros.length} eixo(s) no relatório`;

            colunas = [
                { label: 'Eixo', format: (e) => e.eixo },
                { label: 'Total de Professores', format: (e) => e.totalProfessores },
                { label: 'Total de Turmas', format: (e) => e.totalTurmas },
                { label: 'Total de Componentes Únicos', format: (e) => e.totalComponentesUnicos },
                { label: 'Total de Aulas', format: (e) => e.totalAulas },
                {
                    label: 'Professores',
                    format: (e) => Array.isArray(e.professores) ? e.professores.join(' | ') : ''
                },
                {
                    label: 'Turmas',
                    format: (e) => Array.isArray(e.turmas) ? e.turmas.join(' | ') : ''
                },
                {
                    label: 'Componentes (detalhe)',
                    format: (e) => Array.isArray(e.componentes)
                        ? e.componentes.map(c => `${c.nome} (${c.count} reg. / ${c.aulas} aulas)`).join(' | ')
                        : ''
                }
            ];
        }

        // ============================================
        // GERA E BAIXA
        // ============================================
        const ok = this.gerarBaixarCSV({
            titulo,
            subtitulo,
            setor: 'Setor Pedagógico',
            colunas,
            registros,
            filtros,
            metricas,
            nomeArquivo: `gestao-professores-${tipo}`,
            observacoes: `${registros.length} registro(s) listado(s) no formato ${tipo}`
        });

        if (ok) {
            this.mostrarToast(`✅ CSV exportado (${registros.length} registro(s))!`, 'success');
        }
    },
    
    // ============================================
    // IMPRIMIR RELATÓRIO (VERSÃO CORRIGIDA — por tipo)
    // ============================================
    imprimirRelatorio() {
        const data = this.relatorioAtual;
        if (!data) { this.mostrarToast('Gere um relatório primeiro', 'warning'); return; }
        
        const logo = '/uploads/logo-iema.png';
        const carimbo = '/icons/assinatura_gpeda.ico';
        const dataGeracao = new Date().toLocaleString('pt-BR');
        const tipo = data.tipo || 'geral';
        
        // Título dinâmico
        const titulos = {
            'geral': 'RELATÓRIO GERAL DE GESTÃO DE PROFESSORES',
            'professor': 'RELATÓRIO DE GESTÃO POR PROFESSOR',
            'turma': 'RELATÓRIO DE GESTÃO POR TURMA',
            'eixo': 'RELATÓRIO DE GESTÃO POR EIXO'
        };
        const titulo = titulos[tipo] || 'RELATÓRIO DE GESTÃO DE PROFESSORES';
        
        // Subtítulo com filtros aplicados
        const filtros = [];
        if (data.filtros?.eixo) filtros.push(`Eixo: ${this.escapeHtml(data.filtros.eixo)}`);
        if (data.filtros?.turma) filtros.push(`Turma: ${this.escapeHtml(data.filtros.turma)}`);
        if (data.filtros?.periodo) filtros.push(`Período: ${this.getPeriodoLabel(data.filtros.periodo)}`);
        if (data.filtros?.dataInicio) filtros.push(`De: ${data.filtros.dataInicio}`);
        if (data.filtros?.dataFim) filtros.push(`Até: ${data.filtros.dataFim}`);
        const subtituloFiltros = filtros.length > 0 
            ? `<p style="margin-top:5px; font-size:9pt; color:#333; font-style:italic;">Filtros: ${filtros.join(' | ')}</p>` 
            : '';
        
        // Montar conteúdo por tipo
        let conteudoHTML = '';
        
        if (tipo === 'professor') {
            conteudoHTML = this.gerarHTMLRelatorioProfessor(data);
        } else if (tipo === 'turma') {
            conteudoHTML = this.gerarHTMLRelatorioTurma(data);
        } else if (tipo === 'eixo') {
            conteudoHTML = this.gerarHTMLRelatorioEixo(data);
        } else {
            conteudoHTML = this.gerarHTMLRelatorioGeral(data);
        }
        
        // Stats
        const totalMostrar = data.total || 0;
        const labelTotal = tipo === 'professor' ? 'Professores' : tipo === 'turma' ? 'Turmas' : tipo === 'eixo' ? 'Eixos' : 'Registros';
        
        const html = `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>${titulo}</title>
                <style>
                    @page { size: A4 portrait; margin: 12mm; }
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: 'Times New Roman', Times, serif; font-size: 9pt; line-height: 1.3; }
                    .header { text-align: center; border-bottom: 2px double #000; padding-bottom: 6px; margin-bottom: 10px; }
                    .header img { max-height: 18mm; display: block; margin: 0 auto 4px; }
                    .header h1 { font-size: 12pt; text-transform: uppercase; }
                    .titulo { text-align: center; font-size: 12pt; font-weight: bold; background: #eef2ff; padding: 8px; border: 2px solid #000; margin: 12px 0; }
                    .stats { display: flex; gap: 10px; margin: 10px 0; }
                    .stat { flex: 1; text-align: center; padding: 8px; background: #f8fafc; border: 1px solid #999; border-radius: 6px; }
                    .stat-value { font-size: 18pt; font-weight: bold; color: #1e3c72; }
                    .stat-label { font-size: 8pt; color: #333; text-transform: uppercase; }
                    .section-title { font-size: 10pt; font-weight: bold; background: #e8e8e8; padding: 4px 8px; border-left: 4px solid #1e3c72; margin: 12px 0 6px; }
                    table { width: 100%; border-collapse: collapse; font-size: 8pt; margin-top: 6px; }
                    th { background: #1e3c72; color: white; padding: 5px; text-align: left; border: 1px solid #000; }
                    td { padding: 4px 6px; border: 1px solid #999; vertical-align: top; }
                    tr:nth-child(even) { background: #f5f5f5; }
                    .tag { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 7pt; margin: 1px; background: #e0e7ff; color: #3730a3; }
                    .tag-turma { background: #dbeafe; color: #1e40af; }
                    .tag-periodo { background: #fef3c7; color: #92400e; }
                    .bloco { border: 1px solid #000; border-radius: 6px; padding: 8px; margin-bottom: 10px; background: #fafafa; page-break-inside: avoid; }
                    .bloco-title { font-size: 10pt; font-weight: bold; color: #1e3c72; border-bottom: 1px solid #999; padding-bottom: 3px; margin-bottom: 6px; }
                    .bloco-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; font-size: 8pt; margin-bottom: 6px; }
                    .assinaturas { display: flex; justify-content: center; margin-top: 25px; }
                    .assinatura { flex: 0 0 45%; text-align: center; }
                    .assinatura-container { position: relative; min-height: 18mm; display: flex; align-items: flex-end; justify-content: center; }
                    .assinatura-container::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; border-bottom: 1px solid #000; }
                    .carimbo-overlay { max-height: 16mm; max-width: 45mm; opacity: 0.95; margin-bottom: 2mm; }
                    .assinatura-linha { padding-top: 4px; font-size: 9pt; }
                    .footer { text-align: center; margin-top: 15px; padding-top: 5px; border-top: 1px solid #ccc; font-size: 8pt; color: #666; }
                    .btn-print { display: block; margin: 15px auto; padding: 12px 30px; background: #1e3c72; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
                
                <div class="header">
                    <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
                    <h1>IEMA Pleno: São Luís - Centro</h1>
                    <p>Sistema de Gestão de Professores — Setor Pedagógico</p>
                </div>
                
                <div class="titulo">${titulo}</div>
                ${subtituloFiltros}
                
                <div class="stats">
                    <div class="stat"><div class="stat-value">${totalMostrar}</div><div class="stat-label">${labelTotal}</div></div>
                    <div class="stat"><div class="stat-value">${data.totalComponentes || 0}</div><div class="stat-label">Componentes</div></div>
                    <div class="stat"><div class="stat-value">${data.totalAulas || 0}</div><div class="stat-label">Aulas Registradas</div></div>
                </div>
                
                ${conteudoHTML}
                
                <div class="assinaturas">
                    <div class="assinatura">
                        <div class="assinatura-container">
                            <img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
                        </div>
                        <div class="assinatura-linha">Setor Pedagógico</div>
                    </div>
                </div>
                
                <div class="footer">
                    <p>Gerado em ${dataGeracao} — EducaPleno</p>
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
    // HTML DO RELATÓRIO — GERAL
    // ============================================
    gerarHTMLRelatorioGeral(data) {
        if (!data.registros || data.registros.length === 0) {
            return '<p style="text-align:center; padding:20px; color:#666;">Nenhum registro encontrado</p>';
        }
        
        return `
            <div class="section-title">📋 Detalhamento dos Registros (${data.registros.length})</div>
            <table>
                <thead>
                    <tr>
                        <th style="width:70px;">Data</th>
                        <th>Professor</th>
                        <th style="width:80px;">Eixo</th>
                        <th style="width:60px; text-align:center;">Componentes</th>
                        <th style="width:60px; text-align:center;">Aulas</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.registros.map(r => {
                        let totalAulasR = 0;
                        (r.componentes || []).forEach(c => {
                            totalAulasR += this.normalizarAulas(c.aulasRegistradas).aulas;
                        });
                        return `
                            <tr>
                                <td>${r.dataColetaFormatada}</td>
                                <td>${this.escapeHtml(r.professorNome)}</td>
                                <td>${this.escapeHtml(r.professorEixo || '-')}</td>
                                <td style="text-align:center;">${r.componentes?.length || 0}</td>
                                <td style="text-align:center;"><strong>${totalAulasR}</strong></td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    },

    // ============================================
    // HTML DO RELATÓRIO — PROFESSOR
    // ============================================
    gerarHTMLRelatorioProfessor(data) {
        if (!data.professores || data.professores.length === 0) {
            return '<p style="text-align:center; padding:20px; color:#666;">Nenhum professor encontrado</p>';
        }
        
        return `
            <div class="section-title">👨‍🏫 Detalhamento por Professor (${data.professores.length})</div>
            ${data.professores.map(p => `
                <div class="bloco">
                    <div class="bloco-title">
                        <strong>${this.escapeHtml(p.professorNome)}</strong>
                        ${p.professorMatricula ? ` — Mat: ${this.escapeHtml(p.professorMatricula)}` : ''}
                    </div>
                    <div class="bloco-grid">
                        <div><strong>Eixo:</strong> ${this.escapeHtml(p.professorEixo || '-')}</div>
                        <div><strong>Registros:</strong> ${p.totalRegistros}</div>
                        <div><strong>Componentes:</strong> ${p.totalComponentes}</div>
                        <div><strong>Aulas:</strong> <strong style="color:#1e3c72;">${p.totalAulas}</strong></div>
                    </div>
                    <div style="font-size:8pt; margin-bottom:5px;">
                        <strong>Turmas (${p.totalTurmas}):</strong>
                        ${p.turmas.length > 0 ? p.turmas.map(t => `<span class="tag tag-turma">${this.escapeHtml(t)}</span>`).join(' ') : '-'}
                    </div>
                    <div style="font-size:8pt; margin-bottom:5px;">
                        <strong>Componentes (${p.totalComponentesUnicos}):</strong>
                        ${p.componentes.length > 0 ? p.componentes.map(c => `<span class="tag">${this.escapeHtml(c)}</span>`).join(' ') : '-'}
                    </div>
                    <div style="font-size:8pt;">
                        <strong>Períodos (${p.totalPeriodos}):</strong>
                        ${p.periodos.length > 0 ? p.periodos.map(pe => `<span class="tag tag-periodo">${this.getPeriodoLabel(pe)}</span>`).join(' ') : '-'}
                    </div>
                </div>
            `).join('')}
        `;
    },

    // ============================================
    // HTML DO RELATÓRIO — TURMA
    // ============================================
    gerarHTMLRelatorioTurma(data) {
        if (!data.turmas || data.turmas.length === 0) {
            return '<p style="text-align:center; padding:20px; color:#666;">Nenhuma turma encontrada</p>';
        }
        
        return `
            <div class="section-title">👥 Detalhamento por Turma (${data.turmas.length})</div>
            ${data.turmas.map(t => `
                <div class="bloco">
                    <div class="bloco-title">
                        <strong>Turma ${this.escapeHtml(t.turma)}</strong>
                        — ${this.escapeHtml(t.curso || 'Não informado')}
                    </div>
                    <div class="bloco-grid">
                        <div><strong>Registros:</strong> ${t.totalRegistros}</div>
                        <div><strong>Componentes:</strong> ${t.totalComponentes}</div>
                        <div><strong>Professores:</strong> ${t.totalProfessores}</div>
                        <div><strong>Aulas:</strong> <strong style="color:#1e3c72;">${t.totalAulas}</strong></div>
                    </div>
                    <div style="font-size:8pt; margin-bottom:5px;">
                        <strong>Professores (${t.totalProfessores}):</strong>
                        ${t.professores.length > 0 ? t.professores.map(p => `<span class="tag">${this.escapeHtml(p)}</span>`).join(' ') : '-'}
                    </div>
                    <div style="font-size:8pt; margin-bottom:5px;">
                        <strong>Componentes (${t.totalComponentesUnicos}):</strong>
                        ${t.componentes.length > 0 ? t.componentes.map(c => `<span class="tag">${this.escapeHtml(c)}</span>`).join(' ') : '-'}
                    </div>
                    <div style="font-size:8pt;">
                        <strong>Períodos (${t.totalPeriodos}):</strong>
                        ${t.periodos.length > 0 ? t.periodos.map(pe => `<span class="tag tag-periodo">${this.getPeriodoLabel(pe)}</span>`).join(' ') : '-'}
                    </div>
                </div>
            `).join('')}
        `;
    },

    // ============================================
    // HTML DO RELATÓRIO — EIXO (com tabela de componentes)
    // ============================================
    gerarHTMLRelatorioEixo(data) {
        if (!data.eixos || data.eixos.length === 0) {
            return '<p style="text-align:center; padding:20px; color:#666;">Nenhum eixo encontrado</p>';
        }
        
        return `
            <div class="section-title">🗂️ Detalhamento por Eixo (${data.eixos.length})</div>
            ${data.eixos.map(e => `
                <div class="bloco">
                    <div class="bloco-title">
                        <strong>Eixo: ${this.escapeHtml(e.eixo)}</strong>
                    </div>
                    <div class="bloco-grid">
                        <div><strong>Professores:</strong> ${e.totalProfessores}</div>
                        <div><strong>Turmas:</strong> ${e.totalTurmas}</div>
                        <div><strong>Componentes:</strong> ${e.totalComponentesUnicos}</div>
                        <div><strong>Aulas:</strong> <strong style="color:#1e3c72;">${e.totalAulas}</strong></div>
                    </div>
                    
                    <div style="font-size:8pt; margin-bottom:5px;">
                        <strong>Professores:</strong>
                        ${e.professores.length > 0 ? e.professores.map(p => `<span class="tag">${this.escapeHtml(p)}</span>`).join(' ') : '-'}
                    </div>
                    
                    <div style="font-size:8pt; margin-bottom:5px;">
                        <strong>Turmas:</strong>
                        ${e.turmas.length > 0 ? e.turmas.map(t => `<span class="tag tag-turma">${this.escapeHtml(t)}</span>`).join(' ') : '-'}
                    </div>
                    
                    <table style="margin-top:8px;">
                        <thead>
                            <tr>
                                <th>Componente Curricular</th>
                                <th style="width:80px; text-align:center;">Registros</th>
                                <th style="width:80px; text-align:center;">Aulas</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${e.componentes.map(c => `
                                <tr>
                                    <td>${this.escapeHtml(c.nome)}</td>
                                    <td style="text-align:center;">${c.count}</td>
                                    <td style="text-align:center;"><strong>${c.aulas}</strong></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `).join('')}
        `;
    },

    // ============================================
    // INICIALIZAÇÃO
    // ============================================
    async init() {
        console.log('🚀 Inicializando Gestão de Professores...');
        
        await Promise.all([
            this.carregarProfessores(),
            this.carregarTurmas(),
            this.carregarComponentes(),
            this.carregarEixos(),
            this.carregarPeriodos()   // 🆕
        ]);
        
        const dataInput = this.safeGet('gpDataColeta');
        if (dataInput) dataInput.value = this.getDataLocalISO();
        
        const dashMes = this.safeGet('gpDashboardMes');
        if (dashMes) dashMes.value = new Date().toISOString().substring(0, 7);
        
        // Eventos
        const buscaInput = this.safeGet('gpBuscaProfessor');
        if (buscaInput) {
            buscaInput.addEventListener('input', (e) => this.filtrarProfessores(e.target.value));
        }
        
        const btnAddTurma = this.safeGet('gpBtnAddTurma');
        if (btnAddTurma) btnAddTurma.onclick = () => this.adicionarTurmaVinculada();
        
        const btnAddComp = this.safeGet('gpBtnAddComponente');
        if (btnAddComp) btnAddComp.onclick = () => this.adicionarComponente();
        
        const btnReg = this.safeGet('gpBtnRegistrar');
        if (btnReg) btnReg.onclick = () => this.registrar();
        
        const btnLimpar = this.safeGet('gpBtnLimpar');
        if (btnLimpar) btnLimpar.onclick = () => this.resetarFormulario();
        
        ['gpFiltroBusca', 'gpFiltroEixo', 'gpFiltroTurma', 'gpFiltroPeriodo', 'gpFiltroDataInicio', 'gpFiltroDataFim'].forEach(id => {
            const el = this.safeGet(id);
            if (el) el.addEventListener('change', () => this.carregarLista());
        });
        
        const buscaLista = this.safeGet('gpFiltroBusca');
        if (buscaLista) {
            let timeout;
            buscaLista.addEventListener('input', () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => this.carregarLista(), 400);
            });
        }
        
        this.popularSelectsFiltros();
        
        await Promise.all([this.carregarLista(), this.carregarDashboard()]);
        
        this.safeGet('gpDashboardTab')?.addEventListener('shown.bs.tab', () => this.carregarDashboard());
        this.safeGet('gpRelatorioTab')?.addEventListener('shown.bs.tab', () => this.popularSelectsRelatorio());
        this.safeGet('gpListaTab')?.addEventListener('shown.bs.tab', () => this.carregarLista());
        
        const btnGerarRel = this.safeGet('gpBtnGerarRelatorio');
        if (btnGerarRel) btnGerarRel.onclick = () => this.gerarRelatorio();
        
        const btnCSV = this.safeGet('gpBtnExportarCSV');
        if (btnCSV) btnCSV.onclick = () => this.exportarCSV();
        
        const btnPDF = this.safeGet('gpBtnImprimirRelatorio');
        if (btnPDF) btnPDF.onclick = () => this.imprimirRelatorio();
        
        const btnDash = this.safeGet('gpBtnAtualizarDashboard');
        if (btnDash) btnDash.onclick = () => this.carregarDashboard();
        
        const tipoRel = this.safeGet('gpTipoRelatorio');
        if (tipoRel) tipoRel.addEventListener('change', () => this.toggleFiltrosRelatorio());
        
        console.log('✅ Gestão de Professores inicializada');
    },
    
    popularSelectsFiltros() {
        const filtroEixo = this.safeGet('gpFiltroEixo');
        if (filtroEixo) {
            filtroEixo.innerHTML = '<option value="">Todos os eixos</option>' +
                this.eixos.map(e => `<option value="${this.escapeHtml(e.nome)}">${this.escapeHtml(e.label)}</option>`).join('');
        }
        
        const filtroTurma = this.safeGet('gpFiltroTurma');
        if (filtroTurma) {
            filtroTurma.innerHTML = '<option value="">Todas as turmas</option>' +
                this.turmas.map(t => `<option value="${this.escapeHtml(t.turma)}">${this.escapeHtml(t.turma)}</option>`).join('');
        }
        
        // 🆕 Filtro por período
        const filtroPeriodo = this.safeGet('gpFiltroPeriodo');
        if (filtroPeriodo) {
            filtroPeriodo.innerHTML = '<option value="">Todos os períodos</option>' +
                (this.periodos.length > 0 ? this.periodos : this.periodosFallback())
                    .map(p => `<option value="${this.escapeHtml(String(p.id || p.nome))}">${this.escapeHtml(p.label || p.nome)}</option>`).join('');
        }
    },
    
    popularSelectsRelatorio() {
        const relEixo = this.safeGet('gpRelatorioEixo');
        if (relEixo) {
            relEixo.innerHTML = '<option value="">Todos os eixos</option>' +
                this.eixos.map(e => `<option value="${this.escapeHtml(e.nome)}">${this.escapeHtml(e.label)}</option>`).join('');
        }
        
        const relTurma = this.safeGet('gpRelatorioTurma');
        if (relTurma) {
            relTurma.innerHTML = '<option value="">Todas as turmas</option>' +
                this.turmas.map(t => `<option value="${this.escapeHtml(t.turma)}">${this.escapeHtml(t.turma)}</option>`).join('');
        }
        
        // 🆕 Período
        const relPeriodo = this.safeGet('gpRelatorioPeriodo');
        if (relPeriodo) {
            relPeriodo.innerHTML = '<option value="">Todos os períodos</option>' +
                (this.periodos.length > 0 ? this.periodos : this.periodosFallback())
                    .map(p => `<option value="${this.escapeHtml(String(p.id || p.nome))}">${this.escapeHtml(p.label || p.nome)}</option>`).join('');
        }
        
        const relProf = this.safeGet('gpRelatorioProfessor');
        if (relProf) {
            relProf.innerHTML = '<option value="">Todos os professores</option>' +
                this.professores.map(p => `<option value="${p.id}">${this.escapeHtml(p.nome)}</option>`).join('');
        }
    },
    
    toggleFiltrosRelatorio() {
        const tipo = this.safeGet('gpTipoRelatorio')?.value;
        const campos = {
            eixo: this.safeGet('gpRelatorioEixoDiv'),
            turma: this.safeGet('gpRelatorioTurmaDiv'),
            professor: this.safeGet('gpRelatorioProfessorDiv')
        };
        Object.values(campos).forEach(c => { if (c) c.style.display = 'none'; });
        if (tipo === 'eixo' && campos.eixo) campos.eixo.style.display = 'block';
        if (tipo === 'turma' && campos.turma) campos.turma.style.display = 'block';
        if (tipo === 'professor' && campos.professor) campos.professor.style.display = 'block';
    }

    
};

window.GestaoProfessoresModule = window.GestaoProfessoresModule;