// frontend/js/visitas-publico.js
// Autorização de Visitas - Página Pública (FLUXO PROGRESSIVO 5 ETAPAS)

class VisitasPublico {
    constructor() {
        this.apiBase = '/api/visitas-publico';
        this.turmas = [];
        this.cursos = [];
        this.alunos = [];
        this.termos = [];
        this.termosPorCodigo = [];

        this.alunoSelecionado = null;
        this.termoAtual = null;

        this.responsavel = {
            nome: '',
            rg: '',
            cpf: '',
            telefone: '',
            email: ''
        };

        this.lgpdAceito = false;
        this.totpSecret = null;

        this.assinatura = {
            canvas: null,
            ctx: null,
            desenhando: false,
            temAssinatura: false,
            lastX: 0,
            lastY: 0
        };

        this.localizacao = null;
        this.whatsappEscola = '5598983086504';

        // ============================================
        // CONTROLE DO FLUXO PROGRESSIVO
        // ============================================
        this.etapaAtual = 0;
        this.etapaMaxima = 0;
        this.fluxoIniciado = false;

        // ============================================
        // 🆕 AUTENTICAÇÃO: biometria (principal) ou QR/TOTP (fallback)
        // ============================================
        this.autenticacaoDisponivel = {
            verificada: false,
            passkeyDisponivel: false,
            credenciais: [],
            metodoEscolhido: null,       // 'passkey' | 'totp'
            passkeyCredentialId: null
        };

        // ============================================
        // LOCKS ANTI-CLIQUE-DUPLO
        // ============================================
        this._locks = {
            selecionarAluno: false,
            abrirTermo: false,
            buscarPorCodigo: false,
            verificarTOTP: false,
            prepararAutenticacao: false,
            autenticarPasskey: false,
            autorizar: false,
            recusar: false,
            imprimirTermo: false,
            gerarQRCode: false,
            carregarDadosIniciais: false
        };

        this._termoCache = new Map();
        this._dadosIniciaisCarregados = false;
    }

    // ============================================
    // HELPERS DE LOCK
    // ============================================
    _adquirirLock(nome) {
        if (this._locks[nome]) {
            console.log(`🔒 Lock "${nome}" já ativo — ignorando clique`);
            return false;
        }
        this._locks[nome] = true;
        return true;
    }

    _liberarLock(nome) {
        this._locks[nome] = false;
    }

    async _comLock(nome, fn) {
        if (!this._adquirirLock(nome)) return;
        try {
            return await fn();
        } finally {
            this._liberarLock(nome);
        }
    }

    obterAlunoIdAlvo() {
        return (
            this.termoAtual?.alunoIdFoco ||
            this.termoAtual?.alunos?.[0]?.alunoId ||
            this.termoAtual?.alunos?.[0]?._id ||
            this.alunoSelecionado?.id ||
            this.alunoSelecionado?._id ||
            null
        );
    }

    // ============================================
    // HELPERS base64url (WebAuthn)
    // ============================================
    _b64urlParaBuffer(s) {
        if (!s) return new ArrayBuffer(0);
        const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
        const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return arr.buffer;
    }

    _bufferParaB64url(buf) {
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    // ============================================
    // CONTROLE DE ETAPAS
    // ============================================
    _mostrarTela(id) {
        const telas = ['telaIntroducao', 'etapa1Aluno', 'etapa2Autorizacao', 'etapa3LGPD', 'etapa4TOTP', 'etapa5Dados', 'telaSucesso'];
        telas.forEach(t => {
            const el = document.getElementById(t);
            if (el) el.style.display = 'none';
        });
        const alvo = document.getElementById(id);
        if (alvo) alvo.style.display = 'block';
    }

    _atualizarStepper(etapa) {
        const stepper = document.getElementById('stepperGlobal');
        if (!stepper) return;

        if (etapa >= 1 && etapa <= 5) {
            stepper.style.display = 'block';
        } else {
            stepper.style.display = 'none';
        }

        const items = stepper.querySelectorAll('.stepper-item');
        items.forEach((item, idx) => {
            const stepNum = idx + 1;
            item.classList.remove('active', 'done');
            if (stepNum < etapa) {
                item.classList.add('done');
                item.querySelector('.stepper-dot').innerHTML = '<i class="fas fa-check"></i>';
            } else if (stepNum === etapa) {
                item.classList.add('active');
                const icons = ['fa-user-graduate', 'fa-file-alt', 'fa-shield-alt', 'fa-qrcode', 'fa-signature'];
                item.querySelector('.stepper-dot').innerHTML = `<i class="fas ${icons[idx]}"></i>`;
            } else {
                const icons = ['fa-user-graduate', 'fa-file-alt', 'fa-shield-alt', 'fa-qrcode', 'fa-signature'];
                item.querySelector('.stepper-dot').innerHTML = `<i class="fas ${icons[idx]}"></i>`;
            }
        });

        const fill = document.getElementById('stepperProgressFill');
        if (fill) {
            const percent = Math.max(0, ((etapa - 1) / 4) * 100);
            fill.style.width = percent + '%';
        }
    }

    irParaEtapa(etapa) {
        this.etapaAtual = etapa;
        if (etapa > this.etapaMaxima) this.etapaMaxima = etapa;

        this._atualizarStepper(etapa);

        switch (etapa) {
            case 1:
                this._mostrarTela('etapa1Aluno');
                this.renderizarEstadoInicial();
                break;
            case 2:
                this._mostrarTela('etapa2Autorizacao');
                break;
            case 3:
                this._mostrarTela('etapa3LGPD');
                this.preencherDetalhesTermo('detalhesTermoLgpd');
                break;
            case 4:
                this._mostrarTela('etapa4TOTP');
                // 🆕 Agora decide entre biometria (principal) e QR (fallback)
                this.prepararAutenticacao();
                break;
            case 5:
                this._mostrarTela('etapa5Dados');
                this.preencherDetalhesTermo('detalhesTermoDados');
                setTimeout(() => this.inicializarAssinatura(), 200);
                break;
            case 0:
                this._mostrarTela('telaIntroducao');
                this._atualizarStepper(0);
                break;
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    iniciarFluxo() {
        this.fluxoIniciado = true;
        this.irParaEtapa(1);
    }

    voltarParaEtapa(etapa) {
        // 🆕 Se voltou para a etapa 4, reseta o estado de autenticação
        if (etapa === 4) {
            this.autenticacaoDisponivel = {
                verificada: false,
                passkeyDisponivel: false,
                credenciais: [],
                metodoEscolhido: null,
                passkeyCredentialId: null
            };
        }
        this.irParaEtapa(etapa);
    }

    reiniciarFluxo() {
        location.reload();
    }

    // ============================================
    // INICIALIZAÇÃO
    // ============================================
    async init() {
        console.log('🚀 Iniciando página pública de visitas...');

        try {
            const statusRes = await fetch(`${this.apiBase}/status`);
            const statusData = await statusRes.json();

            const statusPill = document.getElementById('statusPill');

            if (!statusData.success || !statusData.status.visitasAbertas) {
                if (statusPill) {
                    statusPill.className = 'status-pill';
                    statusPill.innerHTML = '<i class="fas fa-circle" style="font-size: 8px;"></i> Autorizações Fechadas';
                }
                this.mostrarIndisponivel(statusData.status?.avisoPublico);
                return;
            }

            if (statusPill) {
                statusPill.className = 'status-pill ativo';
                statusPill.innerHTML = '<i class="fas fa-circle" style="font-size: 8px;"></i> Autorizações Abertas';
            }

            if (statusData.status.avisoPublico) {
                const avisoContainer = document.getElementById('avisoPublicoContainer');
                const avisoTexto = document.getElementById('avisoPublicoTexto');
                if (avisoContainer && avisoTexto) {
                    avisoTexto.textContent = statusData.status.avisoPublico;
                    avisoContainer.style.display = 'block';
                }
            }

            await this.carregarDadosIniciais();
            this.configurarEventos();
            this.capturarLocalizacao();

            this._mostrarTela('telaIntroducao');

            console.log('✅ Página pública inicializada');
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('Erro ao carregar página', 'error');
        }
    }

    async carregarDadosIniciais() {
        if (this._dadosIniciaisCarregados) return;

        return this._comLock('carregarDadosIniciais', async () => {
            try {
                const [turmasRes, cursosRes] = await Promise.all([
                    fetch(`${this.apiBase}/turmas`),
                    fetch(`${this.apiBase}/cursos`)
                ]);

                const [turmasData, cursosData] = await Promise.all([
                    turmasRes.json(),
                    cursosRes.json()
                ]);

                if (turmasData.success && turmasData.turmas) {
                    this.turmas = turmasData.turmas;
                    this.preencherSelectTurmas();
                }

                if (cursosData.success && cursosData.cursos) {
                    this.cursos = cursosData.cursos;
                    this.preencherSelectCursos();
                }

                this._dadosIniciaisCarregados = true;
                console.log('✅ Turmas e cursos carregados');
            } catch (error) {
                console.error('❌ Erro ao carregar dados iniciais:', error);
            }
        });
    }

    mostrarIndisponivel(aviso) {
        const container = document.querySelector('.container-public');
        if (!container) return;

        container.innerHTML = `
            <div class="hero-section">
                <div class="hero-icon" style="background: linear-gradient(135deg, #ef4444, #dc2626);">
                    <i class="fas fa-lock"></i>
                </div>
                <h1>Autorizações Fechadas</h1>
                <p>${aviso || 'As autorizações de visitas não estão abertas no momento.'}</p>
                <p style="font-size: 13px; color: #9ca3af; margin-top: 15px;">
                    <i class="fas fa-info-circle"></i> Volte mais tarde ou entre em contato com a escola.
                </p>
            </div>
        `;
    }

    preencherSelectTurmas() {
        const select = document.getElementById('filtroTurmaPublico');
        if (!select) return;

        select.innerHTML = '<option value="">Todas as turmas</option>' +
            this.turmas.map(t => {
                const nome = t.nome || t;
                return `<option value="${nome}">${nome}</option>`;
            }).join('');
    }

    preencherSelectCursos() {
        const select = document.getElementById('filtroCursoPublico');
        if (!select) return;

        select.innerHTML = '<option value="">Todos os cursos</option>' +
            this.cursos.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    configurarEventos() {
        const buscaInput = document.getElementById('buscaAlunoPublico');
        if (buscaInput) {
            let timeout;
            buscaInput.addEventListener('input', () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => this.buscarAlunos(), 400);
            });
        }

        const buscaCodigoIntro = document.getElementById('buscaCodigoPublicoIntro');
        if (buscaCodigoIntro) {
            buscaCodigoIntro.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.buscarPorCodigoIntro();
                }
            });
        }

        const cpfInput = document.getElementById('respCPF');
        if (cpfInput) {
            cpfInput.addEventListener('input', (e) => {
                let v = e.target.value.replace(/\D/g, '').slice(0, 11);
                if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
                else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
                else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
                e.target.value = v;
            });
        }

        const telInput = document.getElementById('respTelefone');
        if (telInput) {
            telInput.addEventListener('input', (e) => {
                let v = e.target.value.replace(/\D/g, '').slice(0, 11);
                if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
                else if (v.length > 6) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
                else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
                e.target.value = v;
            });
        }

        const totpInput = document.getElementById('totpCodigo');
        if (totpInput) {
            totpInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.verificarTOTP();
                }
            });
        }

        const ajudaTelInput = document.getElementById('ajudaTelefone');
        if (ajudaTelInput) {
            ajudaTelInput.addEventListener('input', (e) => {
                let v = e.target.value.replace(/\D/g, '').slice(0, 11);
                if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
                else if (v.length > 6) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
                else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
                e.target.value = v;
            });
        }

        const modalAjuda = document.getElementById('modalAjuda');
        if (modalAjuda) {
            modalAjuda.addEventListener('click', (e) => {
                if (e.target === modalAjuda) {
                    this.fecharAjuda();
                }
            });
        }
    }

    // ============================================
    // CONSULTA RÁPIDA POR CÓDIGO (INTRO)
    // ============================================
    async buscarPorCodigoIntro() {
        const codigo = document.getElementById('buscaCodigoPublicoIntro')?.value?.trim();
        const resultado = document.getElementById('resultadoConsultaIntro');

        if (!codigo || codigo.length < 4) {
            this.showToast('Digite pelo menos 4 caracteres do código', 'error');
            return;
        }

        if (resultado) {
            resultado.innerHTML = '<div style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin" style="font-size:24px;color:#667eea;"></i></div>';
        }

        try {
            const response = await fetch(`${this.apiBase}/termos-por-codigo/${encodeURIComponent(codigo)}`);
            const data = await response.json();

            if (data.success) {
                this.termosPorCodigo = data.termos || [];
                this.renderizarTermosPorCodigo('resultadoConsultaIntro');
            } else {
                throw new Error(data.error || 'Erro na busca');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            if (resultado) {
                resultado.innerHTML = `<div style="text-align:center;padding:20px;color:#ef4444;font-size:14px;"><i class="fas fa-exclamation-circle"></i> ${this.escapeHtml(error.message)}</div>`;
            }
        }
    }

    renderizarTermosPorCodigo(containerId) {
        const container = document.getElementById(containerId || 'listaTermosCodigoPublico');
        if (!container) return;

        if (this.termosPorCodigo.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #9ca3af;">
                    <i class="fas fa-search" style="font-size: 32px; margin-bottom: 10px; display: block;"></i>
                    <p style="margin: 0;">Nenhum termo encontrado com este código</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.termosPorCodigo.map(t => {
            const dataVisita = new Date(t.dataVisita).toLocaleDateString('pt-BR', {
                day: '2-digit', month: 'long', year: 'numeric'
            });

            let badgeStatus = '';
            if (t.status === 'autorizado') {
                badgeStatus = '<span class="badge-termo autorizado">✓ Totalmente Autorizado</span>';
            } else if (t.status === 'parcialmente_autorizado') {
                badgeStatus = '<span class="badge-termo parcial">🔶 Parcialmente Autorizado</span>';
            } else if (t.status === 'recusado') {
                badgeStatus = '<span class="badge-termo recusado">✗ Recusado</span>';
            } else {
                badgeStatus = '<span class="badge-termo pendente">⏳ Pendente</span>';
            }

            const alunosHTML = (t.alunos || []).map(a => {
                const alunoId = a.alunoId?._id || a.alunoId || a._id || a.id || '';
                return `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: #f9fafb; border-radius: 8px; margin-top: 6px; font-size: 12px; gap: 8px; flex-wrap: wrap;">
                    <span style="flex: 1; min-width: 150px;">
                        <i class="fas fa-user-graduate" style="color: #667eea;"></i>
                        ${this.escapeHtml(a.nome || a.alunoNome || '-')}
                    </span>
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <span style="color: #6b7280; font-size: 11px;">${a.turma || '-'}</span>
                        ${t.responsaveis.autorizados > 0 ? `
                            <button class="btn-filter btn-imprimir-termo"
                                data-termo-id="${t.id}"
                                data-aluno-id="${alunoId}"
                                style="padding: 4px 10px; font-size: 11px; background: #3b82f6; border-radius: 20px;"
                                title="Imprimir termo somente deste aluno">
                                <i class="fas fa-print"></i> Imprimir
                            </button>
                        ` : ''}
                    </div>
                </div>
            `}).join('');

            return `
                <div class="termo-publico-card" style="cursor: default;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px; gap: 8px; flex-wrap: wrap;">
                        <h4 style="margin: 0;">${this.escapeHtml(t.atividade)}</h4>
                        ${badgeStatus}
                    </div>

                    ${t.descricaoAtividade ? `
                        <div style="background: #f0f9ff; border-left: 3px solid #3b82f6; padding: 8px 12px; margin: 8px 0; border-radius: 6px; font-size: 12px; color: #1e40af;">
                            <i class="fas fa-align-left"></i> ${this.escapeHtml(t.descricaoAtividade)}
                        </div>
                    ` : ''}

                    <div class="info"><i class="fas fa-barcode"></i> <strong>Código:</strong> <code>${t.codigo}</code></div>
                    <div class="info"><i class="fas fa-chalkboard-teacher"></i> ${this.escapeHtml(t.professor)}</div>
                    <div class="info"><i class="fas fa-calendar-alt"></i> ${dataVisita}</div>
                    <div class="info"><i class="fas fa-clock"></i> ${t.horario}</div>
                    <div class="info"><i class="fas fa-map-marker-alt"></i> ${this.escapeHtml(t.local)}</div>

                    <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #e5e7eb;">
                        <div style="font-size: 11px; color: #6b7280; margin-bottom: 6px;">
                            <strong>Alunos (${t.totalAlunos}):</strong>
                            <span style="font-size: 10px; color: #9ca3af;">— clique em imprimir para gerar o termo individual</span>
                        </div>
                        ${alunosHTML}
                    </div>

                    <div style="margin-top: 12px; padding: 10px; background: #f0fdf4; border-radius: 8px; font-size: 12px; display: flex; justify-content: space-around; text-align: center;">
                        <div>
                            <div style="color: #10b981; font-weight: 700; font-size: 16px;">${t.responsaveis.autorizados}</div>
                            <div style="color: #6b7280; font-size: 10px;">Autorizados</div>
                        </div>
                        <div>
                            <div style="color: #f59e0b; font-weight: 700; font-size: 16px;">${t.responsaveis.pendentes}</div>
                            <div style="color: #6b7280; font-size: 10px;">Pendentes</div>
                        </div>
                        <div>
                            <div style="color: #ef4444; font-weight: 700; font-size: 16px;">${t.responsaveis.recusados}</div>
                            <div style="color: #6b7280; font-size: 10px;">Recusados</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.btn-imprimir-termo').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.imprimirTermoOficial(btn.dataset.termoId, btn.dataset.alunoId);
            });
        });
    }

    // ============================================
    // ETAPA 1: BUSCAR E SELECIONAR ALUNO
    // ============================================
    async buscarAlunos() {
        const turma = document.getElementById('filtroTurmaPublico')?.value;
        const curso = document.getElementById('filtroCursoPublico')?.value;
        const nome = document.getElementById('buscaAlunoPublico')?.value;

        if (!turma && !curso && !nome) {
            this.renderizarEstadoInicial();
            return;
        }

        try {
            const params = new URLSearchParams();
            if (turma) params.append('turma', turma);
            if (curso) params.append('curso', curso);
            if (nome) params.append('nome', nome);

            const response = await fetch(`${this.apiBase}/alunos?${params}`);
            const data = await response.json();

            if (data.success) {
                this.alunos = data.alunos || [];
                this.renderizarAlunos();
            }
        } catch (error) {
            console.error('❌ Erro:', error);
        }
    }

    renderizarEstadoInicial() {
        const container = document.getElementById('listaAlunosPublico');
        if (!container) return;

        this.alunos = [];
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #9ca3af;">
                <i class="fas fa-filter" style="font-size: 42px; margin-bottom: 15px; display: block; color: #d1d5db;"></i>
                <p style="margin: 0 0 8px; font-weight: 600; color: #6b7280;">
                    Selecione uma turma ou curso
                </p>
                <p style="margin: 0; font-size: 13px;">
                    Use os filtros acima ou busque pelo nome do aluno para encontrar a autorização
                </p>
            </div>
        `;
    }

    renderizarAlunos() {
        const container = document.getElementById('listaAlunosPublico');
        if (!container) return;

        if (this.alunos.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #9ca3af;">
                    <i class="fas fa-search" style="font-size: 32px; margin-bottom: 10px; display: block;"></i>
                    <p style="margin: 0;">Nenhum aluno encontrado</p>
                </div>
            `;
            return;
        }

        const limite = 50;
        const lista = this.alunos.slice(0, limite);
        const temMais = this.alunos.length > limite;
        const totalRestante = this.alunos.length - limite;

        const cardsHTML = lista.map(a => `
            <div class="termo-publico-card aluno-card-public"
                data-aluno-id="${a.id}"
                style="cursor: pointer;">
                <h4>${this.escapeHtml(a.nome)}</h4>
                <div class="info"><i class="fas fa-id-card"></i> ${a.matricula || 'N/A'}</div>
                <div class="info"><i class="fas fa-school"></i> ${a.turma || 'N/A'}</div>
                <div class="info"><i class="fas fa-book"></i> ${a.curso || 'N/A'}</div>
                <div style="margin-top: 12px; text-align: right;">
                    <span style="color: #667eea; font-weight: 600; font-size: 13px;">
                        Selecionar <i class="fas fa-arrow-right"></i>
                    </span>
                </div>
            </div>
        `).join('');

        const avisoHTML = temMais ? `
            <div style="text-align: center; padding: 20px 15px; color: #6b7280; font-size: 13px; background: #f9fafb; border-radius: 12px; margin-top: 10px; border: 1px dashed #d1d5db;">
                <i class="fas fa-info-circle" style="color: #667eea;"></i>
                Mostrando <strong>${limite}</strong> de <strong>${this.alunos.length}</strong> alunos encontrados.
                <br>
                <span style="font-size: 12px; color: #9ca3af;">
                    Refine os filtros (turma, curso ou nome) para ver os outros <strong>${totalRestante}</strong>.
                </span>
            </div>
        ` : '';

        container.innerHTML = cardsHTML + avisoHTML;

        container.querySelectorAll('.aluno-card-public').forEach(card => {
            card.addEventListener('click', () => {
                this.selecionarAluno(card.dataset.alunoId);
            });
        });
    }

    // ============================================
    // SELECIONAR ALUNO → AVANÇA PARA ETAPA 2
    // ============================================
    async selecionarAluno(alunoId) {
        return this._comLock('selecionarAluno', async () => {
            const aluno = this.alunos.find(a => a.id === alunoId);
            if (!aluno) return;

            const container = document.getElementById('listaAlunosPublico');
            if (container) {
                container.style.opacity = '0.5';
                container.style.pointerEvents = 'none';
            }

            this.alunoSelecionado = aluno;

            try {
                const response = await fetch(`${this.apiBase}/termos/${alunoId}`);
                const data = await response.json();

                if (data.success && data.termos.length > 0) {
                    this.termos = data.termos;

                    const nomeEl = document.getElementById('nomeAlunoEtapa2');
                    if (nomeEl) {
                        nomeEl.textContent = `Termos disponíveis para ${aluno.nome}`;
                    }

                    this.mostrarTermos();
                    this.irParaEtapa(2);
                } else {
                    this.showToast('Nenhum termo encontrado para este aluno', 'info');
                }
            } catch (error) {
                console.error('❌ Erro:', error);
                this.showToast('Erro ao buscar termos', 'error');
            } finally {
                if (container) {
                    container.style.opacity = '1';
                    container.style.pointerEvents = '';
                }
            }
        });
    }

    // ============================================
    // ETAPA 2: MOSTRAR TERMOS DISPONÍVEIS
    // ============================================
    mostrarTermos() {
        const container = document.getElementById('listaTermosPublico');
        if (!container) return;

        const alunoSelecionadoId = this.alunoSelecionado?.id
            || this.alunoSelecionado?._id
            || null;

        const nomeAlunoExibicao = this.alunoSelecionado?.nome || 'Aluno Selecionado';

        container.innerHTML = this.termos.map(t => {
            const dataVisita = new Date(t.dataVisita).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });

            let badgeStatus = '';
            let acoesHTML = '';

            if (t.jaAutorizou) {
                badgeStatus = '<span class="badge-termo autorizado">✓ Você já autorizou</span>';
                acoesHTML = `
                    <button class="btn-filter btn-imprimir-termo"
                        data-termo-id="${t.id}"
                        data-aluno-id="${alunoSelecionadoId || ''}"
                        style="padding: 8px 16px; font-size: 12px; background: #3b82f6;">
                        <i class="fas fa-print"></i> Imprimir Termo
                    </button>
                `;
            } else if (t.jaRecusou) {
                badgeStatus = '<span class="badge-termo recusado">✗ Você recusou</span>';
                acoesHTML = `
                    <span style="color: #9ca3af; font-size: 12px;">
                        <i class="fas fa-info-circle"></i> Nenhuma ação disponível
                    </span>
                `;
            } else {
                badgeStatus = '<span class="badge-termo pendente">⏳ Aguardando sua autorização</span>';
                acoesHTML = `
                    <span style="color: #667eea; font-weight: 600; font-size: 13px;">
                        Selecionar <i class="fas fa-arrow-right"></i>
                    </span>
                `;
            }

            const clicavel = t.pendente;
            const cursorStyle = clicavel ? 'cursor: pointer;' : 'cursor: default;';
            const cardClass = clicavel ? 'termo-publico-card termo-card-clicavel' : 'termo-publico-card';

            return `
                <div class="${cardClass}" data-termo-id="${t.id}" data-clicavel="${clicavel}" style="${cursorStyle}">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px; gap: 8px; flex-wrap: wrap;">
                        <h4 style="margin: 0;">${this.escapeHtml(t.atividade)}</h4>
                        ${badgeStatus}
                    </div>

                    ${t.descricaoAtividade ? `
                        <div style="background: #f0f9ff; border-left: 3px solid #3b82f6; padding: 8px 12px; margin: 8px 0; border-radius: 6px; font-size: 12px; color: #1e40af; line-height: 1.5;">
                            <i class="fas fa-align-left"></i> <strong>Descrição:</strong>
                            <p style="margin: 4px 0 0; text-indent: 0;">${this.escapeHtml(t.descricaoAtividade)}</p>
                        </div>
                    ` : ''}

                    <div class="info"><i class="fas fa-user-graduate"></i> <strong>Aluno:</strong> ${this.escapeHtml(nomeAlunoExibicao)}</div>
                    <div class="info"><i class="fas fa-barcode"></i> <code style="font-size: 11px;">${t.codigo}</code></div>
                    <div class="info"><i class="fas fa-chalkboard-teacher"></i> ${this.escapeHtml(t.professor)}</div>
                    <div class="info"><i class="fas fa-calendar-alt"></i> ${dataVisita}</div>
                    <div class="info"><i class="fas fa-clock"></i> ${t.horario}</div>
                    <div class="info"><i class="fas fa-map-marker-alt"></i> ${this.escapeHtml(t.local)}</div>

                    <div style="margin-top: 12px; padding-top: 10px; border-top: 1px dashed #e5e7eb; text-align: right;">
                        ${acoesHTML}
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.termo-card-clicavel').forEach(card => {
            card.addEventListener('click', async (e) => {
                if (e.target.closest('.btn-imprimir-termo')) return;

                const allCards = container.querySelectorAll('.termo-card-clicavel');
                allCards.forEach(c => {
                    c.style.opacity = '0.5';
                    c.style.pointerEvents = 'none';
                });

                await this.abrirTermo(card.dataset.termoId);

                allCards.forEach(c => {
                    c.style.opacity = '1';
                    c.style.pointerEvents = '';
                });
            });
        });

        container.querySelectorAll('.btn-imprimir-termo').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.imprimirTermoOficial(btn.dataset.termoId, btn.dataset.alunoId);
            });
        });
    }

    // ============================================
    // ABRIR TERMO → AVANÇA PARA ETAPA 3 (LGPD)
    // ============================================
    async abrirTermo(termoId) {
        return this._comLock('abrirTermo', async () => {
            try {
                const termoEncontrado = this.termos.find(t => t.id === termoId);

                if (termoEncontrado && (termoEncontrado.jaAutorizou || termoEncontrado.jaRecusou)) {
                    this.showToast('Este termo já foi respondido por você', 'info');
                    return;
                }

                let termoData = this._termoCache.get(termoId);

                if (!termoData) {
                    const response = await fetch(`${this.apiBase}/termo/${termoId}`);
                    termoData = await response.json();
                    if (termoData.success) {
                        this._termoCache.set(termoId, termoData);
                    }
                }

                if (!termoData.success) throw new Error('Termo não encontrado');

                this.termoAtual = termoData.termo;
                this.lgpdAceito = false;
                this.totpSecret = null;

                let nomeAlunoExibicao = this.termoAtual.alunoNome || 'Aluno';

                if (this.alunoSelecionado) {
                    nomeAlunoExibicao = this.alunoSelecionado.nome;
                    this.termoAtual.alunoIdFoco = this.alunoSelecionado.id || this.alunoSelecionado._id;
                } else if (this.termoAtual.alunos?.length > 0) {
                    nomeAlunoExibicao = this.termoAtual.alunos[0].nome || this.termoAtual.alunos[0].alunoNome;
                    this.termoAtual.alunoIdFoco = this.termoAtual.alunos[0].alunoId || this.termoAtual.alunos[0]._id;
                }

                this.termoAtual._nomeAlunoExibicao = nomeAlunoExibicao;

                const lgpdCheckbox = document.getElementById('lgpdCheckbox');
                if (lgpdCheckbox) lgpdCheckbox.checked = false;
                const btnLGPD = document.getElementById('btnProsseguirLGPD');
                if (btnLGPD) btnLGPD.disabled = true;

                const totpCodigoEl = document.getElementById('totpCodigo');
                if (totpCodigoEl) totpCodigoEl.value = '';

                this.irParaEtapa(3);

            } catch (error) {
                console.error('❌ Erro:', error);
                this.showToast('Erro ao abrir termo', 'error');
            }
        });
    }

    preencherDetalhesTermo(containerId) {
        const container = document.getElementById(containerId);
        if (!container || !this.termoAtual) return;

        const nomeAlunoExibicao = this.termoAtual._nomeAlunoExibicao || this.termoAtual.alunoNome || 'Aluno';

        container.innerHTML = `
            <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; border-radius: 16px; padding: 20px; margin-bottom: 20px;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                    <i class="fas fa-file-alt" style="font-size: 24px;"></i>
                    <h3 style="margin: 0; font-size: 18px;">${this.escapeHtml(this.termoAtual.atividade)}</h3>
                </div>

                ${this.termoAtual.descricaoAtividade ? `
                    <div style="background: rgba(255,255,255,0.15); padding: 12px; border-radius: 10px; margin-bottom: 12px; font-size: 13px; text-align: left;">
                        <strong style="display: flex; align-items: center; gap: 6px; margin-bottom: 6px;">
                            <i class="fas fa-align-left"></i> Descrição da Atividade:
                        </strong>
                        <p style="margin: 0; opacity: 0.95; white-space: pre-wrap; line-height: 1.5;">${this.escapeHtml(this.termoAtual.descricaoAtividade)}</p>
                    </div>
                ` : ''}

                <div style="background: rgba(255,255,255,0.15); padding: 12px; border-radius: 10px; font-size: 13px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div><strong>Aluno:</strong> ${this.escapeHtml(nomeAlunoExibicao)}</div>
                    <div><strong>Turma:</strong> ${this.termoAtual.alunoTurma || 'N/A'}</div>
                    <div><strong>Curso:</strong> ${this.termoAtual.alunoCurso || 'N/A'}</div>
                    <div><strong>Professor:</strong> ${this.escapeHtml(this.termoAtual.professorNome)}</div>
                    <div><strong>Data:</strong> ${new Date(this.termoAtual.dataVisita).toLocaleDateString('pt-BR')}</div>
                    <div><strong>Horário:</strong> ${this.termoAtual.horario}</div>
                    <div style="grid-column: span 2;"><strong>Local:</strong> ${this.escapeHtml(this.termoAtual.local)}</div>
                    ${this.termoAtual.localizacao?.enderecoCompleto ? `
                        <div style="grid-column: span 2; font-size: 12px; opacity: 0.9;">
                            <i class="fas fa-map-pin"></i> ${this.escapeHtml(this.termoAtual.localizacao.enderecoCompleto)}
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // ============================================
    // ETAPA 3: LGPD
    // ============================================
    toggleBotaoLGPD(checked) {
        const btn = document.getElementById('btnProsseguirLGPD');
        if (btn) btn.disabled = !checked;
    }

    // ============================================
    // 🆕 ETAPA 4: PREPARAR AUTENTICAÇÃO (biometria → fallback QR)
    // ============================================
    async prepararAutenticacao() {
        return this._comLock('prepararAutenticacao', async () => {
            this._setBlocoAutenticacao('carregando');

            const alunoId = this.obterAlunoIdAlvo();
            const nomeAluno = this.termoAtual?._nomeAlunoExibicao || this.termoAtual?.alunoNome || this.alunoSelecionado?.nome;

            try {
                const params = new URLSearchParams();
                if (alunoId) params.append('alunoId', String(alunoId));
                if (nomeAluno) params.append('nome', String(nomeAluno));

                const r = await fetch(`/api/inscricoes/passkeys/publica/disponivel?${params}`);
                const data = await r.json();

                this.autenticacaoDisponivel.verificada = true;
                this.autenticacaoDisponivel.passkeyDisponivel = !!(data.success && data.disponivel);
                
                if (this.autenticacaoDisponivel.passkeyDisponivel) {
                    this.autenticacaoDisponivel.metodoEscolhido = 'passkey';
                    this._setBlocoAutenticacao('passkey');
                    this._renderizarBotaoBiometria();
                } else {
                    this.autenticacaoDisponivel.metodoEscolhido = 'totp';
                    this._setBlocoAutenticacao('totp');
                    await this.gerarQRCodeTOTP();
                }
            } catch (err) {
                console.error('❌ Erro ao preparar autenticação:', err);
                this.autenticacaoDisponivel.metodoEscolhido = 'totp';
                this._setBlocoAutenticacao('totp');
                await this.gerarQRCodeTOTP();
            }
        });
    }

    _setBlocoAutenticacao(modo) {
        const elCarregando = document.getElementById('totpLoading');
        const elQRCode     = document.getElementById('totpQRCodeBox');
        const elPasskey    = document.getElementById('passkeyBox');
        const elSecret     = document.getElementById('totpSecretBox');
        const elVerify     = document.getElementById('totpVerifyBox');
        const elInfo       = document.getElementById('totpInfoBox');

        // 1. Esconde TUDO
        if (elCarregando) elCarregando.style.display = 'none';
        if (elQRCode)     elQRCode.style.display = 'none';
        if (elPasskey)    elPasskey.style.display = 'none';
        if (elSecret)     elSecret.style.display = 'none';
        if (elVerify)     elVerify.style.display = 'none';
        if (elInfo)       elInfo.style.display = 'none';

        // 2. Mostra o modo atual
        if (modo === 'carregando') {
            if (elCarregando) elCarregando.style.display = 'flex';
        } else if (modo === 'passkey') {
            if (elPasskey) elPasskey.style.display = 'block';
        } else if (modo === 'totp') {
            if (elInfo)    elInfo.style.display = 'flex';
            if (elQRCode)  elQRCode.style.display = 'block';
            if (elVerify)  elVerify.style.display = 'block';
        }
    }

    _renderizarBotaoBiometria() {
        const box = document.getElementById('passkeyBox');
        if (!box) return;

        box.innerHTML = `
            <div style="text-align:center; padding: 25px 20px;">
                <div style="width:90px; height:90px; margin:0 auto 18px;
                            background: linear-gradient(135deg,#10b981,#059669);
                            border-radius:50%; display:flex; align-items:center;
                            justify-content:center; color:white; font-size:42px;
                            box-shadow: 0 8px 24px rgba(16,185,129,0.35);">
                    <i class="fas fa-fingerprint"></i>
                </div>
                <h3 style="margin:0 0 8px; font-size:1.15rem; color:#065f46;">
                    Use sua biometria
                </h3>
                <p style="margin:0 0 20px; font-size:13px; color:#6b7280; line-height:1.6;">
                    Confirme sua identidade com a digital, rosto ou senha
                    do seu celular. É mais rápido e seguro.
                </p>
                <button class="btn-continuar-grande" id="btnUsarBiometria"
                        onclick="visitasPublico.autenticarComPasskey()">
                    <i class="fas fa-fingerprint"></i> Autenticar com Biometria
                </button>
                <button class="btn-filter" style="margin-top:14px; background:transparent;
                        border:1.5px solid #d1d5db; color:#6b7280; padding:10px 20px;
                        border-radius:24px; font-size:13px; cursor:pointer;"
                        onclick="visitasPublico.usarFallbackTOTP()">
                    <i class="fas fa-qrcode"></i> Usar QR Code em vez disso
                </button>
            </div>
        `;
    }

    async usarFallbackTOTP() {
        this.autenticacaoDisponivel.metodoEscolhido = 'totp';
        this.autenticacaoDisponivel.passkeyCredentialId = null;
        this._setBlocoAutenticacao('totp');
        await this.gerarQRCodeTOTP();
    }

    // ============================================
    // 🆕 AUTENTICAR COM PASSKEY
    // ============================================
    async autenticarComPasskey() {
        return this._comLock('autenticarPasskey', async () => {
            const btn = document.getElementById('btnUsarBiometria');
            const originalHTML = btn?.innerHTML;

            try {
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Solicitando biometria...';
                }

                if (!window.PublicKeyCredential) {
                    throw Object.assign(new Error('Dispositivo sem suporte a WebAuthn'), { name: 'NotSupportedError' });
                }

                const alunoId = this.obterAlunoIdAlvo();
                const nomeAluno = this.termoAtual?._nomeAlunoExibicao
                            || this.termoAtual?.alunoNome
                            || this.alunoSelecionado?.nome
                            || null;

                // 1) INICIAR
                const rIniciar = await fetch('/api/inscricoes/passkeys/autenticar/iniciar', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        matriculaId: alunoId ? String(alunoId) : null,
                        nome: nomeAluno,
                        escopo: 'qualquer'
                    })
                });
                const dIniciar = await rIniciar.json();
                if (!dIniciar.success) throw new Error(dIniciar.error || 'Falha ao iniciar biometria');

                // 2) NAVEGADOR
                const opcoes = dIniciar.opcoes;
                opcoes.challenge = this._b64urlParaBuffer(opcoes.challenge);
                opcoes.allowCredentials = (opcoes.allowCredentials || []).map(c => ({
                    ...c,
                    id: this._b64urlParaBuffer(c.id)
                }));

                const credencial = await navigator.credentials.get({ publicKey: opcoes });
                if (!credencial) throw new Error('Autenticação cancelada');

                // 3) SERIALIZA
                const credencialSerializada = {
                    id: credencial.id,
                    rawId: this._bufferParaB64url(credencial.rawId),
                    type: credencial.type,
                    response: {
                        clientDataJSON: this._bufferParaB64url(credencial.response.clientDataJSON),
                        authenticatorData: this._bufferParaB64url(credencial.response.authenticatorData),
                        signature: this._bufferParaB64url(credencial.response.signature),
                        userHandle: credencial.response.userHandle
                            ? this._bufferParaB64url(credencial.response.userHandle)
                            : null
                    }
                };

                // 4) CONCLUIR
                const rConcluir = await fetch('/api/inscricoes/passkeys/autenticar/concluir', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        matriculaId: alunoId ? String(alunoId) : null,
                        nome: nomeAluno,
                        credential: credencialSerializada
                    })
                });
                const dConcluir = await rConcluir.json();
                if (!dConcluir.success) throw new Error(dConcluir.error || 'Falha ao validar biometria');

                // 5) SUCESSO → marca método e avança
                this.autenticacaoDisponivel.metodoEscolhido = 'passkey';
                this.autenticacaoDisponivel.passkeyCredentialId = dConcluir.credentialId;

                this.showToast('Biometria validada com sucesso!', 'success');
                this.irParaEtapa(5);

            } catch (err) {
                console.error('❌ Erro passkey:', err);

                let msg = 'Não foi possível validar a biometria.';

                if (err.name === 'NotAllowedError') {
                    msg = 'Biometria cancelada ou não reconhecida. Tente novamente.';
                } else if (err.name === 'NotSupportedError') {
                    msg = 'Seu dispositivo não suporta biometria. Use o QR Code.';
                } else if (err.name === 'SecurityError') {
                    msg = 'Erro de segurança. Verifique se está em HTTPS.';
                } else if (err.name === 'InvalidStateError') {
                    msg = 'Nenhuma biometria cadastrada neste dispositivo. Use o QR Code.';
                } else if (err.message) {
                    msg = err.message;
                }

                this.showToast(msg, 'error');

                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalHTML || '<i class="fas fa-fingerprint"></i> Autenticar com Biometria';
                }

                if (err.name === 'NotAllowedError' || err.name === 'InvalidStateError') {
                    setTimeout(() => {
                        if (confirm('Deseja usar o QR Code (Google Authenticator) em vez da biometria?')) {
                            this.usarFallbackTOTP();
                        }
                    }, 300);
                }
            }
        });
    }

    // ============================================
    // ETAPA 4 (FALLBACK): AUTENTICAÇÃO TOTP
    // ============================================
    async gerarQRCodeTOTP() {
        return this._comLock('gerarQRCode', async () => {
            try {
                const loadingEl = document.getElementById('totpLoading');
                const qrBoxEl = document.getElementById('totpQRCodeBox');
                const secretBoxEl = document.getElementById('totpSecretBox');
                const verifyBoxEl = document.getElementById('totpVerifyBox');

                if (loadingEl) loadingEl.style.display = 'flex';
                if (qrBoxEl) qrBoxEl.style.display = 'none';
                if (secretBoxEl) secretBoxEl.style.display = 'none';
                if (verifyBoxEl) verifyBoxEl.style.display = 'none'; // 🔥 Esconde a caixa vazia

                const alunoIdTOTP = this.obterAlunoIdAlvo();

                const response = await fetch(`${this.apiBase}/gerar-qrcode-totp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        termoId: this.termoAtual.id,
                        alunoId: alunoIdTOTP ? String(alunoIdTOTP) : null
                    })
                });

                const data = await response.json();

                if (!data.success) {
                    throw new Error(data.error || 'Erro ao gerar QR Code');
                }

                if (data.jaVerificado) {
                    this.showToast('Este aluno já foi autenticado por você', 'info');
                    this.irParaEtapa(5);
                    return;
                }

                if (loadingEl) loadingEl.style.display = 'none';
                if (qrBoxEl) qrBoxEl.style.display = 'block';
                if (verifyBoxEl) verifyBoxEl.style.display = 'block'; // 🔥 Mostra só depois de gerar
                
                document.getElementById('totpQRCodeImg').src = data.qrCode;

                this.totpSecret = data.secret;
                this.mostrarSecretTOTP(data.secret);

                setTimeout(() => {
                    document.getElementById('totpCodigo')?.focus();
                }, 300);

            } catch (error) {
                console.error('❌ Erro:', error);
                const loadingEl = document.getElementById('totpLoading');
                if (loadingEl) {
                    loadingEl.innerHTML = `
                        <i class="fas fa-exclamation-triangle" style="color: #ef4444; font-size: 42px;"></i>
                        <span style="color: #ef4444;">Erro ao gerar QR Code</span>
                        <button class="btn-filter btn-tentar-novamente" style="margin-top: 10px;">
                            <i class="fas fa-sync-alt"></i> Tentar novamente
                        </button>
                    `;
                    loadingEl.style.display = 'flex';
                    document.querySelector('.btn-tentar-novamente')?.addEventListener('click', () => {
                        this.gerarQRCodeTOTP();
                    });
                }
            }
        });
    }

    mostrarSecretTOTP(secret) {
        if (!secret) return;
        const box = document.getElementById('totpSecretBox');
        const textEl = document.getElementById('totpSecretText');
        if (!box || !textEl) return;

        const secretFormatado = secret.match(/.{1,4}/g)?.join(' ') || secret;
        textEl.textContent = secretFormatado;
        textEl.dataset.secretRaw = secret;
        box.style.display = 'block';
    }

    async copiarSecretTOTP() {
        const textEl = document.getElementById('totpSecretText');
        const valueEl = document.getElementById('totpSecretValue');

        if (!textEl || !this.totpSecret) {
            this.showToast('Nenhuma chave disponível para copiar', 'error');
            return;
        }

        const secretRaw = textEl.dataset.secretRaw || this.totpSecret;

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(secretRaw);
            } else {
                const textarea = document.createElement('textarea');
                textarea.value = secretRaw;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                textarea.style.left = '-9999px';
                document.body.appendChild(textarea);
                textarea.select();
                textarea.setSelectionRange(0, 99999);
                document.execCommand('copy');
                document.body.removeChild(textarea);
            }

            if (valueEl) {
                valueEl.classList.add('copiado');
                const icon = valueEl.querySelector('i.fa-copy');
                if (icon) icon.className = 'fas fa-check';
                setTimeout(() => {
                    valueEl.classList.remove('copiado');
                    if (icon) icon.className = 'fas fa-copy';
                }, 2000);
            }
            this.showToast('✅ Chave copiada! Cole no Google Authenticator', 'success');

        } catch (error) {
            console.error('❌ Erro ao copiar:', error);
            this.showToast('❌ Não foi possível copiar. Selecione manualmente.', 'error');
        }
    }

    async verificarTOTP(event) {
        return this._comLock('verificarTOTP', async () => {
            const codigo = document.getElementById('totpCodigo')?.value;

            if (!codigo || codigo.length !== 6) {
                this.showToast('Digite o código de 6 dígitos do Google Authenticator', 'error');
                return;
            }

            const btn = event?.target?.closest('button')
                || document.querySelector('#etapa4TOTP .btn-continuar-grande');

            try {
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
                }

                const alunoIdTOTP = this.obterAlunoIdAlvo();

                const response = await fetch(`${this.apiBase}/verificar-totp`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        termoId: this.termoAtual.id,
                        codigo,
                        alunoId: alunoIdTOTP ? String(alunoIdTOTP) : null
                    })
                });

                const data = await response.json();

                if (data.success) {
                    this.autenticacaoDisponivel.metodoEscolhido = 'totp';
                    this.autenticacaoDisponivel.passkeyCredentialId = null;
                    this.showToast('✅ Autenticado com sucesso!', 'success');
                    this.irParaEtapa(5);
                } else {
                    throw new Error(data.error || 'Código inválido');
                }

            } catch (error) {
                console.error('❌ Erro:', error);
                this.showToast('❌ ' + error.message, 'error');

                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-check-circle"></i> Verificar Código e Continuar';
                }

                const input = document.getElementById('totpCodigo');
                if (input) {
                    input.value = '';
                    input.focus();
                }
            }
        });
    }

    // ============================================
    // ETAPA 5: DADOS + ASSINATURA
    // ============================================
    inicializarAssinatura() {
        const canvas = document.getElementById('assinaturaCanvasPublic');
        if (!canvas) return;
        if (canvas.dataset.init === 'true') return;
        canvas.dataset.init = 'true';

        const container = canvas.parentElement;
        const placeholder = document.getElementById('assinaturaPlaceholderPublic');

        const ajustarCanvas = () => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0) {
                setTimeout(ajustarCanvas, 200);
                return;
            }
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = 180 * dpr;
            canvas.style.height = '180px';
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#667eea';
            this.assinatura.canvas = canvas;
            this.assinatura.ctx = ctx;
        };

        ajustarCanvas();

        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            let clientX, clientY;
            if (e.touches) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }
            return { x: clientX - rect.left, y: clientY - rect.top };
        };

        const iniciar = (e) => {
            e.preventDefault();
            this.assinatura.desenhando = true;
            const pos = getPos(e);
            this.assinatura.lastX = pos.x;
            this.assinatura.lastY = pos.y;
            this.assinatura.temAssinatura = true;
            if (container) container.classList.add('ativa');
            if (placeholder) placeholder.classList.add('escondido');
        };

        const desenhar = (e) => {
            if (!this.assinatura.desenhando) return;
            e.preventDefault();
            const pos = getPos(e);
            this.assinatura.ctx.beginPath();
            this.assinatura.ctx.moveTo(this.assinatura.lastX, this.assinatura.lastY);
            this.assinatura.ctx.lineTo(pos.x, pos.y);
            this.assinatura.ctx.stroke();
            this.assinatura.lastX = pos.x;
            this.assinatura.lastY = pos.y;
        };

        const parar = (e) => {
            if (e && e.preventDefault) e.preventDefault();
            this.assinatura.desenhando = false;
            if (container) container.classList.remove('ativa');
        };

        canvas.addEventListener('mousedown', iniciar);
        canvas.addEventListener('mousemove', desenhar);
        canvas.addEventListener('mouseup', parar);
        canvas.addEventListener('mouseleave', () => {
            if (this.assinatura.desenhando) parar();
        });
        canvas.addEventListener('touchstart', iniciar, { passive: false });
        canvas.addEventListener('touchmove', desenhar, { passive: false });
        canvas.addEventListener('touchend', parar, { passive: false });
    }

    limparAssinatura() {
        if (!this.assinatura.canvas || !this.assinatura.ctx) return;
        const rect = this.assinatura.canvas.getBoundingClientRect();
        this.assinatura.ctx.clearRect(0, 0, rect.width, rect.height);
        this.assinatura.temAssinatura = false;
        const placeholder = document.getElementById('assinaturaPlaceholderPublic');
        if (placeholder) placeholder.classList.remove('escondido');
    }

    capturarLocalizacao() {
        if (!navigator.geolocation) {
            console.warn('⚠️ Geolocalização não suportada');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude, accuracy } = position.coords;

                try {
                    const response = await fetch(`${this.apiBase}/geocoding-reverso`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ latitude, longitude })
                    });

                    const data = await response.json();

                    this.localizacao = {
                        latitude,
                        longitude,
                        accuracy,
                        endereco: data.success ? data.endereco : ''
                    };

                    console.log('📍 Localização capturada:', this.localizacao);
                } catch (e) {
                    this.localizacao = { latitude, longitude, accuracy };
                }
            },
            (error) => {
                console.warn('⚠️ Erro ao obter localização:', error.message);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }

    async autorizar() {
        return this._comLock('autorizar', async () => {
            const nome = document.getElementById('respNome')?.value?.trim();
            const rg = document.getElementById('respRG')?.value?.trim();
            const cpf = document.getElementById('respCPF')?.value?.trim();
            const telefone = document.getElementById('respTelefone')?.value?.trim();
            const email = document.getElementById('respEmail')?.value?.trim();

            if (!nome || nome.length < 5) return this.showToast('Informe seu nome completo', 'error');
            if (!rg || rg.length < 5) return this.showToast('Informe o RG', 'error');
            if (!cpf || cpf.replace(/\D/g, '').length !== 11) return this.showToast('CPF inválido', 'error');
            if (!telefone || telefone.replace(/\D/g, '').length < 10) return this.showToast('Telefone inválido', 'error');

            if (!this.assinatura.temAssinatura) {
                return this.showToast('Assine o documento antes de continuar', 'error');
            }

            const alunoId = this.obterAlunoIdAlvo();

            if (!alunoId) {
                return this.showToast('Erro: aluno não identificado no termo', 'error');
            }

            // 🆕 Exige que um método de autenticação tenha sido concluído
            if (!this.autenticacaoDisponivel.metodoEscolhido) {
                return this.showToast('Conclua a autenticação antes de continuar', 'error');
            }
            if (this.autenticacaoDisponivel.metodoEscolhido === 'passkey'
                && !this.autenticacaoDisponivel.passkeyCredentialId) {
                return this.showToast('Biometria não confirmada. Refaça a autenticação.', 'error');
            }

            const assinaturaBase64 = this.assinatura.canvas.toDataURL('image/png');

            const btn = document.querySelector('.btn-autorizar-grande');
            const btnOriginalHTML = btn?.innerHTML;

            try {
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
                }

                this.showToast('📝 Salvando autorização...', 'info');

                const response = await fetch(`${this.apiBase}/autorizar/${this.termoAtual.id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nome,
                        rg,
                        cpf: cpf.replace(/\D/g, ''),
                        telefone: telefone.replace(/\D/g, ''),
                        email: email || '',
                        lgpdAceito: true,
                        assinaturaBase64,
                        localizacao: this.localizacao,
                        alunoId: alunoId.toString(),

                        // 🆕 método de autenticação + credencial (se passkey)
                        metodoAutenticacao: this.autenticacaoDisponivel.metodoEscolhido,
                        passkeyCredentialId: this.autenticacaoDisponivel.passkeyCredentialId
                    })
                });

                const data = await response.json();

                if (data.success) {
                    this.responsavel = { nome, rg, cpf, telefone, email };
                    this.mostrarSucesso(data.termo);
                } else {
                    throw new Error(data.error || 'Erro ao autorizar');
                }
            } catch (error) {
                console.error('❌ Erro:', error);
                this.showToast('❌ ' + error.message, 'error');
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = btnOriginalHTML;
                }
            }
        });
    }

    async recusar() {
        return this._comLock('recusar', async () => {
            const motivo = prompt('Por favor, informe o motivo da recusa (opcional):');

            if (motivo === null) return;

            const confirmar = confirm('Tem certeza que deseja RECUSAR a participação?');
            if (!confirmar) return;

            const alunoId = this.obterAlunoIdAlvo();

            try {
                const response = await fetch(`${this.apiBase}/recusar/${this.termoAtual.id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        motivo: motivo || 'Não informado',
                        nome: 'Responsável',
                        alunoId: alunoId ? alunoId.toString() : undefined
                    })
                });

                const data = await response.json();

                if (data.success) {
                    this.showToast('Recusa registrada. O professor será notificado.', 'info');
                    this.reiniciarFluxo();
                } else {
                    throw new Error(data.error);
                }
            } catch (error) {
                console.error('❌ Erro:', error);
                this.showToast('❌ ' + error.message, 'error');
            }
        });
    }

    // ============================================
    // TELA DE SUCESSO
    // ============================================
    mostrarSucesso(termo) {
        this.etapaAtual = 6;
        this._mostrarTela('telaSucesso');
        this._atualizarStepper(6);

        const alunoId = termo.alunos?.[0]?.alunoId
            || termo.alunos?.[0]?._id
            || this.alunoSelecionado?.id
            || this.alunoSelecionado?._id
            || '';

        const msgEl = document.getElementById('sucessoMensagemAluno');
        if (msgEl) {
            msgEl.innerHTML = `Você autorizou a visita de <strong>${this.escapeHtml(termo.alunoNome)}</strong>.`;
        }

        const detalhesEl = document.getElementById('sucessoDetalhes');
        if (detalhesEl) {
            detalhesEl.innerHTML = `
                <h3 style="margin: 0 0 15px; color: #065f46; font-size: 1rem;">
                    <i class="fas fa-file-alt"></i> Detalhes da Autorização
                </h3>
                <div style="font-size: 13px; line-height: 1.8;">
                    <div><strong>Código:</strong> <code style="background: #e5e7eb; padding: 2px 8px; border-radius: 4px;">${termo.codigo}</code></div>
                    <div><strong>Aluno:</strong> ${this.escapeHtml(termo.alunoNome)}</div>
                    <div><strong>Atividade:</strong> ${this.escapeHtml(termo.atividade)}</div>
                    <div><strong>Data:</strong> ${new Date(termo.dataVisita).toLocaleDateString('pt-BR')}</div>
                    <div><strong>Local:</strong> ${this.escapeHtml(termo.local)}</div>
                    <div><strong>Responsável:</strong> ${this.escapeHtml(this.responsavel.nome)}</div>
                    <div><strong>Autenticação:</strong> ${this.autenticacaoDisponivel.metodoEscolhido === 'passkey' ? '🔒 Biometria' : '🔐 QR Code (TOTP)'}</div>
                </div>
            `;
        }

        const btnImprimir = document.querySelector('.btn-imprimir-sucesso');
        if (btnImprimir) {
            btnImprimir.dataset.termoId = termo.id;
            btnImprimir.dataset.alunoId = alunoId;
            btnImprimir.onclick = (e) => {
                this.imprimirTermoOficial(termo.id, alunoId);
            };
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ============================================
    // IMPRIMIR TERMO OFICIAL
    // ============================================
    async imprimirTermoOficial(termoId, alunoId = null) {
        return this._comLock('imprimirTermo', async () => {
            const btn = document.activeElement;
            const originalHTML = btn ? btn.innerHTML : '';

            if (btn && (btn.classList.contains('btn-imprimir-termo') || btn.classList.contains('btn-imprimir-sucesso'))) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
            }

            try {
                this.showToast('📄 Gerando termo oficial...', 'info');

                if (!alunoId) {
                    alunoId = this.obterAlunoIdAlvo();
                }

                if (alunoId && typeof alunoId === 'object') {
                    alunoId = alunoId._id || alunoId.id || alunoId.toString();
                }

                let url = `${this.apiBase}/termo-oficial/${termoId}`;
                if (alunoId) {
                    url += `?alunoId=${encodeURIComponent(alunoId)}`;
                }

                const response = await fetch(url);
                const data = await response.json();

                if (!data.success) {
                    throw new Error(data.error || 'Erro ao gerar termo');
                }

                const win = window.open('', '_blank');
                win.document.write(data.html);
                win.document.close();

                win.onload = () => {
                    setTimeout(() => {
                        win.print();
                    }, 800);
                };

                if (data.modoIndividual) {
                    this.showToast(`📄 Termo de ${data.termo.alunoImpresso} gerado!`, 'success');
                } else {
                    this.showToast(`📄 ${data.termo.totalPaginas} termo(s) gerado(s)`, 'info');
                }

            } catch (error) {
                console.error('❌ Erro:', error);
                this.showToast('❌ ' + error.message, 'error');
            } finally {
                if (btn && (btn.classList.contains('btn-imprimir-termo') || btn.classList.contains('btn-imprimir-sucesso'))) {
                    btn.disabled = false;
                    btn.innerHTML = originalHTML;
                }
            }
        });
    }

    // ============================================
    // AJUDA VIA WHATSAPP
    // ============================================
    abrirAjuda() {
        const modal = document.getElementById('modalAjuda');
        if (!modal) return;
        modal.classList.add('ativo');
        document.body.style.overflow = 'hidden';

        const ajudaNome = document.getElementById('ajudaNome');
        if (ajudaNome && !ajudaNome.value && this.alunoSelecionado?.nome) {
            ajudaNome.value = this.alunoSelecionado.nome;
        }

        setTimeout(() => {
            document.getElementById('ajudaNome')?.focus();
        }, 250);
    }

    fecharAjuda() {
        const modal = document.getElementById('modalAjuda');
        if (!modal) return;
        modal.classList.remove('ativo');
        document.body.style.overflow = '';
    }

    enviarAjudaWhatsApp() {
        const nome = document.getElementById('ajudaNome')?.value?.trim();
        const telefone = document.getElementById('ajudaTelefone')?.value?.trim();
        const turma = document.getElementById('ajudaTurma')?.value?.trim();
        const curso = document.getElementById('ajudaCurso')?.value?.trim();
        const problema = document.getElementById('ajudaProblema')?.value?.trim();

        if (!nome || nome.length < 3) return this.showToast('Informe seu nome', 'error');
        if (!telefone || telefone.replace(/\D/g, '').length < 10) return this.showToast('Informe um telefone válido', 'error');
        if (!turma) return this.showToast('Informe a turma', 'error');
        if (!curso) return this.showToast('Informe o curso', 'error');
        if (!problema || problema.length < 10) return this.showToast('Descreva o problema (mínimo 10 caracteres)', 'error');

        const btn = document.getElementById('btnEnviarWhats');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Abrindo...';
        }

        try {
            const dataHora = new Date().toLocaleString('pt-BR');

            const mensagem =
                `*🆘 Preciso de Ajuda - Autorização de Visitas*\n\n` +
                `*Nome:* ${nome}\n` +
                `*Telefone:* ${telefone}\n` +
                `*Turma:* ${turma}\n` +
                `*Curso:* ${curso}\n\n` +
                `*Problema Enfrentado:*\n${problema}\n\n` +
                `_Enviado em: ${dataHora}_`;

            const url = `https://wa.me/${this.whatsappEscola}?text=${encodeURIComponent(mensagem)}`;

            window.open(url, '_blank');

            this.showToast('✅ WhatsApp aberto! Estaremos respondendo assim que possível.', 'success');

            setTimeout(() => {
                ['ajudaNome', 'ajudaTelefone', 'ajudaTurma', 'ajudaCurso', 'ajudaProblema'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                this.fecharAjuda();
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fab fa-whatsapp"></i> Enviar pelo WhatsApp';
                }
            }, 800);

        } catch (error) {
            console.error('❌ Erro ao abrir WhatsApp:', error);
            this.showToast('❌ Não foi possível abrir o WhatsApp. Tente novamente.', 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fab fa-whatsapp"></i> Enviar pelo WhatsApp';
            }
        }
    }

    // ============================================
    // UTILITÁRIOS
    // ============================================
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(mensagem, tipo = 'info') {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; top: 20px; right: 20px;
            padding: 14px 20px; border-radius: 12px;
            background: ${tipo === 'success' ? '#10b981' : tipo === 'error' ? '#ef4444' : '#3b82f6'};
            color: white; font-size: 14px; font-weight: 500;
            box-shadow: 0 8px 20px rgba(0,0,0,0.2);
            z-index: 99999; max-width: 340px;
            animation: slideIn 0.3s ease;
        `;
        toast.textContent = mensagem;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    fecharModalErro() {
        document.getElementById('modalErro')?.classList.remove('active');
    }

    fecharModalSucesso() {
        document.getElementById('modalSucesso')?.classList.remove('active');
    }
}

// ============================================
// INICIALIZAÇÃO
// ============================================
const visitasPublico = new VisitasPublico();
window.visitasPublico = visitasPublico;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => visitasPublico.init());
} else {
    visitasPublico.init();
}