// js/setor-pedagogico.js
// ============================================================================
// CLASSE PRINCIPAL - SETOR PEDAGÓGICO (REFATORADO)
// ============================================================================
// Responsabilidades:
//   - Boas-vindas (home)
//   - Provas (visualizar/imprimir normal)
//   - 2ª Chamada
//   - Substituição de Professores
//   - Gestão de Professores
//   - Autorização de Visitas
//   - Adaptar Documento (global)
//   - Notificações
//
// ⚠️ Módulo AEE (Alunos, Relatórios de Acessibilidade, Provas Adaptadas)
//    está em: js/aee-module.js
// ============================================================================

// ============================================
// 🛡️ PROTEÇÃO CONTRA alert() NATIVO (Kodular)
// ============================================
(function protegerContraAlertNativo() {
    let __alertaEmProgresso = false;

    window.alert = function(mensagem) {
        if (__alertaEmProgresso) {
            console.log('[ALERT-RECURSÃO-EVITADA]', mensagem);
            return;
        }
        __alertaEmProgresso = true;

        try {
            const isWebView = /wv|WebView|Android.*Version\/[\d.]+.*Chrome/i.test(navigator.userAgent) ||
                              (typeof window.AppInventor !== 'undefined');

            if (typeof window.setorPedagogico !== 'undefined' &&
                typeof window.setorPedagogico.showToast === 'function') {
                window.setorPedagogico.showToast(String(mensagem), 'info');
                return;
            }

            if (!isWebView) {
                console.log('%c[ALERT] ' + mensagem, 'background:#f59e0b;color:white;padding:4px 8px;border-radius:4px;');
                return;
            }

            const modal = document.createElement('div');
            modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
                background:rgba(0,0,0,0.6);display:flex;align-items:center;
                justify-content:center;z-index:999999;padding:20px;box-sizing:border-box;`;
            modal.innerHTML = `
                <div style="background:white;border-radius:16px;padding:25px;max-width:380px;
                            width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center;">
                    <div style="font-size:48px;margin-bottom:15px;">ℹ️</div>
                    <p style="margin:0 0 20px;color:#374151;font-size:15px;
                              line-height:1.5;white-space:pre-line;">${String(mensagem)}</p>
                    <button onclick="this.closest('div').parentElement.remove()"
                            style="width:100%;padding:12px;background:#f59e0b;color:white;
                                   border:none;border-radius:10px;font-size:14px;
                                   font-weight:600;cursor:pointer;">OK</button>
                </div>
            `;
            document.body.appendChild(modal);
        } finally {
            __alertaEmProgresso = false;
        }
    };

    console.log('🛡️ [Proteção] window.alert sobrescrito (setor pedagógico)');
})();

// ✅ Helper: retorna data LOCAL no formato YYYY-MM-DD (evita bug de UTC)
function getDataLocalISO(dateObj) {
    const d = dateObj || new Date();
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
}

class SetorPedagogico {
    constructor() {
        this.token = localStorage.getItem('auth_token');
        this.currentUser = null;
        this.notificacoes = [];
        this.arquivoSelecionadoSetor = null;
        this.temPermissao2Chamada = false;
        this.temPermissaoSubstituicao = false;
        this.temPermissaoVisitas = false;
        this.temPermissaoGestaoProfessores = false;
        this.temPermissaoAEE = false;
        this.temPermissaoProtocoloProvas = false;
        this._visitasInicializado = false;

        this.estadoSegundaChamada = {
            currentAluno: null,
            motivoSelecionado: null,
            modoAtual: 'automatico',
            alunosPorTurma: [],
            scanner: null,
            scannerAtivo: false,
            sessaoAssinaturaId: null,
            assinaturaCapturada: null,
            monitoramentoInterval: null,
            qrCodeDataUrl: null
        };

        this.assinaturaSegundaChamada = {
            canvas: null, ctx: null, desenhando: false,
            temAssinatura: false, lastX: 0, lastY: 0
        };

        this.relatorio2Chamada = null;

        this.paginacao2Chamada = {
            paginaAtual: 1,
            porPagina: 10,
            totalRegistros: 0,
            totalPaginas: 0
        };

        this.autocomplete2Chamada = {
            alunos: [], filtrados: [], indice: -1,
            carregado: false, carregando: false
        };

        this.charts2Chamada = { motivos: null, atrasos: null, turmas: null };

        this.substituicaoState = {
            professores: [],
            turmas: [],
            substituicoes: [],
            relatorioAtual: null,
            editandoId: null,
            substituicaoParaImprimir: null,
            charts: { motivos: null, horarios: null, dias: null, turmas: null },
            formData: {
                professorAusente: null,
                professorSubstituto: null,
                turma: '',
                data: '',
                horario: null,
                motivo: '',
                motivoDetalhes: '',
                observacoes: '',
                substitutoAusente: false,
                substitutoAusenteMotivo: '',
                substitutoAusenteObservacoes: ''
            }
        };

        this.atrasosState = {
            professores: [],
            turmas: [],
            atrasos: [],
            relatorioAtual: null,
            editandoId: null,
            professorSelecionado: null,
            charts: { motivos: null, horarios: null, dias: null }
        };

        this.init();
    }

    async init() {
        console.log('🚀 Inicializando Setor Pedagógico...');

        // ============================================
        // 🆕 MODO ASSINATURA (URL com ?assinatura=UUID)
        // ============================================
        const modoAssinatura = new URLSearchParams(window.location.search).get('assinatura');
        if (modoAssinatura) {
            console.log('📱 Modo assinatura detectado:', modoAssinatura);
            try {
                const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
                if (userData.nome) this.currentUser = userData;

                if (this.token) {
                    const data = await this.apiRequest('/api/auth/me');
                    if (data.success) {
                        this.currentUser = data.user;
                        localStorage.setItem('user_data', JSON.stringify(this.currentUser));
                    }
                }
            } catch (e) {
                console.warn('Erro ao carregar usuário no modo assinatura:', e);
            }
            await this.mostrarTelaAssinatura(modoAssinatura);
            return;
        }

        // ============================================
        // INIT NORMAL (exige login)
        // ============================================
        if (!this.token) {
            window.location.href = '/login.html';
            return;
        }

        // 🚀 1) Usuário local (síncrono) — já mostra nome na hora
        try {
            const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
            if (userData.nome) {
                this.currentUser = userData;
                const el = document.getElementById('userName');
                if (el) el.textContent = userData.nome;
            }
        } catch (e) {}

        // 🚀 2) Renderiza a home IMEDIATAMENTE (sem esperar rede)
        this.setupNavigation();
        this.loadBoasVindas();

        // 🚀 3) Tudo em paralelo (não bloqueia a tela)
        Promise.allSettled([
            this.loadUser(),
            this.carregarFotoPerfil(),
            this.carregarNotificacoes(),
            this.verificarPermissoesEspeciais()
        ]).then(() => {
            // Re-renderiza a home quando as permissões chegarem (pra mostrar módulos corretos)
            this.loadBoasVindas();
        });

        // 🚀 4) Preaquece visitas em background (NÃO bloqueia)
        setTimeout(() => {
            if (this.temPermissaoVisitas) this._preaquecerModuloVisitas();
        }, 1500);

        // 🚀 5) Notificações com lock interno (a própria função já controla)
        setInterval(() => this.carregarNotificacoes(), 30000);

        // ============================================
        // 🔥 MÓDULO FORÇADO VIA URL
        // ============================================
        const urlParams = new URLSearchParams(window.location.search);
        const moduloForcado = urlParams.get('modulo');

        if (moduloForcado) {
            setTimeout(async () => {
                const modulosValidos = {
                    'gestao-professores': { metodo: () => this.loadGestaoProfessores(), permissao: () => this.temPermissaoGestaoProfessores, nome: 'Gestão de Professores' },
                    'substituicao-professores': { metodo: () => this.loadSubstituicaoProfessores(), permissao: () => this.temPermissaoSubstituicao, nome: 'Substituição de Professores' },
                    'segunda-chamada': { metodo: () => this.loadSegundaChamada(), permissao: () => this.temPermissao2Chamada, nome: '2ª Chamada' },
                    'visitas': { metodo: () => this.loadVisitas(), permissao: () => this.temPermissaoVisitas, nome: 'Autorização de Visitas' },
                    'aee': { metodo: () => this.loadAEE(), permissao: () => this.temPermissaoAEE, nome: 'AEE' },
                    'protocolo-provas': { metodo: () => this.loadProtocoloProvas(), permissao: () => this.temPermissaoProtocoloProvas, nome: 'Protocolo de Provas' }
                };

                if (modulosValidos[moduloForcado]) {
                    const modulo = modulosValidos[moduloForcado];
                    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
                    const isAdmin = ['admin', 'super_admin'].includes(userData.role);

                    if (modulo.permissao() || isAdmin) {
                        if (isAdmin) {
                            if (moduloForcado === 'gestao-professores') this.temPermissaoGestaoProfessores = true;
                            if (moduloForcado === 'substituicao-professores') this.temPermissaoSubstituicao = true;
                            if (moduloForcado === 'segunda-chamada') this.temPermissao2Chamada = true;
                            if (moduloForcado === 'visitas') this.temPermissaoVisitas = true;
                            if (moduloForcado === 'aee') this.temPermissaoAEE = true;
                            if (moduloForcado === 'protocolo-provas') this.temPermissaoProtocoloProvas = true;
                        }
                        console.log(`✅ Abrindo módulo: ${modulo.nome}`);
                        await modulo.metodo();
                        this.navigateTo(moduloForcado);
                    } else {
                        console.warn(`⚠️ Sem permissão para ${modulo.nome}`);
                    }
                } else {
                    console.warn('⚠️ Módulo inválido:', moduloForcado);
                }
            }, 500);
        }
    }

    async loadUser() {
        try {
            const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
            if (userData.nome) {
                this.currentUser = userData;
                document.getElementById('userName').textContent = userData.nome;
            }

            const data = await this.apiRequest('/api/auth/me');
            if (data.success) {
                this.currentUser = data.user;
                document.getElementById('userName').textContent = this.currentUser.nome;
                localStorage.setItem('user_data', JSON.stringify(this.currentUser));

                if (this.currentUser.role !== 'setor_pedagogico' &&
                    this.currentUser.role !== 'admin' &&
                    this.currentUser.role !== 'super_admin') {
                    window.location.href = '/login.html';
                }
            }
        } catch (error) {
            console.error('Erro ao carregar usuário:', error);
        }
    }

    async verificarPermissoesEspeciais() {
        if (!this.token) return;

        const CACHE_KEY = '_permissoesSetorPedagogico';
        const CACHE_TTL = 5 * 60 * 1000; // 5 min

        // 🔥 1) Cache em sessionStorage
        try {
            const cached = sessionStorage.getItem(CACHE_KEY);
            if (cached) {
                const { data, ts } = JSON.parse(cached);
                if (Date.now() - ts < CACHE_TTL) {
                    console.log('⚡ Permissões do cache (sessionStorage)');
                    this._aplicarPermissoes(data);
                    return;
                }
            }
        } catch (e) {}

        const modulos = [
            { key: 'segunda_chamada_setor_pedagogico', prop: 'temPermissao2Chamada', nav: 'navSegundaChamada', menu: 'menuItemSegundaChamada' },
            { key: 'substituicao_professores_setor_pedagogico', prop: 'temPermissaoSubstituicao', nav: 'navSubstituicaoProfessores', menu: 'menuItemSubstituicaoProfessores' },
            { key: 'autorizacao_visitas', prop: 'temPermissaoVisitas', nav: 'navVisitas', menu: 'menuItemVisitas' },
            { key: 'gestao_professores_setor_pedagogico', prop: 'temPermissaoGestaoProfessores', nav: 'navGestaoProfessores', menu: 'menuItemGestaoProfessores' },
            { key: 'aee_setor_pedagogico', prop: 'temPermissaoAEE', nav: 'navAEE', menu: 'menuItemAEE' },
            { key: 'protocolo_provas_setor_pedagogico', prop: 'temPermissaoProtocoloProvas', nav: 'navProtocoloProvas', menu: null }
        ];

        // 🚀 2) TUDO EM PARALELO
        const resultados = await Promise.allSettled(
            modulos.map(m =>
                fetch(`/api/admin/permissoes-modulos/verificar/${m.key}`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                }).then(r => r.json()).then(d => ({ ...m, temPermissao: !!(d.success && d.temPermissao) }))
                .catch(err => ({ ...m, temPermissao: false, erro: err.message }))
            )
        );

        const permissoes = {};
        resultados.forEach(r => {
            if (r.status === 'fulfilled') {
                const { prop, temPermissao } = r.value;
                permissoes[prop] = temPermissao;
            }
        });

        // 🚀 3) Aplica
        this._aplicarPermissoes(permissoes);

        // 🚀 4) Salva cache
        try {
            sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: permissoes, ts: Date.now() }));
        } catch (e) {}
    }

    _aplicarPermissoes(permissoes) {
        const map = {
            temPermissao2Chamada: { nav: 'navSegundaChamada', menu: 'menuItemSegundaChamada', label: '2ª Chamada' },
            temPermissaoSubstituicao: { nav: 'navSubstituicaoProfessores', menu: 'menuItemSubstituicaoProfessores', label: 'Substituição' },
            temPermissaoVisitas: { nav: 'navVisitas', menu: 'menuItemVisitas', label: 'Visitas' },
            temPermissaoGestaoProfessores: { nav: 'navGestaoProfessores', menu: 'menuItemGestaoProfessores', label: 'Gestão de Professores' },
            temPermissaoAEE: { nav: 'navAEE', menu: 'menuItemAEE', label: 'AEE' },
            temPermissaoProtocoloProvas: { nav: 'navProtocoloProvas', menu: null, label: 'Protocolo de Provas' }
        };

        Object.entries(map).forEach(([prop, cfg]) => {
            const tem = permissoes[prop] === true;
            this[prop] = tem;
            if (tem) {
                const navEl = document.getElementById(cfg.nav);
                if (navEl) navEl.style.display = 'flex';
                if (cfg.menu) {
                    const menuEl = document.getElementById(cfg.menu);
                    if (menuEl) menuEl.style.display = 'flex';
                }
                console.log(`✅ Permissão ${cfg.label} concedida`);
            } else {
                const navEl = document.getElementById(cfg.nav);
                if (navEl) navEl.style.display = 'none';
                if (cfg.menu) {
                    const menuEl = document.getElementById(cfg.menu);
                    if (menuEl) menuEl.style.display = 'none';
                }
            }
        });
    }

    async carregarFotoPerfil() {
        try {
            const data = await this.apiRequest('/api/perfil/me');
            if (data.success && data.perfil && data.perfil.fotoPerfil) {
                const avatarDiv = document.getElementById('userAvatar');
                if (avatarDiv) {
                    avatarDiv.innerHTML = `<img src="${data.perfil.fotoPerfil}" alt="Foto de perfil">`;
                }
            }
        } catch (error) {
            console.error('❌ Erro ao carregar foto:', error);
        }
    }

    async apiRequest(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        const data = await response.json();

        if (!response.ok && (response.status === 401 || response.status === 403)) {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_data');
            window.location.href = '/login.html';
            throw new Error('Sessão expirada');
        }

        return data;
    }

    showToast(mensagem, tipo = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast-notification ${tipo}`;
        toast.innerHTML = `
            <i class="fas ${tipo === 'success' ? 'fa-check-circle' : tipo === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
            <span>${mensagem}</span>
        `;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    mostrarNotificacao(mensagem, tipo = 'info') {
        if (typeof this.showToast === 'function') {
            this.showToast(mensagem, tipo);
        } else {
            console.log(`[${tipo}] ${mensagem}`);
        }
    }

    confirmarAcao(mensagem) {
        return new Promise((resolve) => {
            const old = document.getElementById('confirmSetorModal');
            if (old) old.remove();

            const modalHtml = `
                <div class="modal fade" id="confirmSetorModal" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white;">
                                <h5 class="modal-title"><i class="fas fa-question-circle"></i> Confirmação</h5>
                            </div>
                            <div class="modal-body" style="white-space: pre-line; font-size: 15px;">${this.escapeHtml(mensagem)}</div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" id="btnCancelarSetor">
                                    <i class="fas fa-times"></i> Cancelar
                                </button>
                                <button type="button" class="btn btn-warning" id="btnConfirmarSetor">
                                    <i class="fas fa-check"></i> Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);

            const modalEl = document.getElementById('confirmSetorModal');
            const modal = new bootstrap.Modal(modalEl);
            modal.show();

            const finalizar = (resultado) => {
                modal.hide();
                setTimeout(() => modalEl.remove(), 300);
                resolve(resultado);
            };

            document.getElementById('btnConfirmarSetor').addEventListener('click', () => finalizar(true));
            document.getElementById('btnCancelarSetor').addEventListener('click', () => finalizar(false));
        });
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    safeSetText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    gerarAvatarSVG(nome) {
        const inicial = (nome || '?').charAt(0).toUpperCase();
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><circle cx="40" cy="40" r="40" fill="#f59e0b"/><text x="40" y="40" font-family="Arial" font-size="36" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${inicial}</text></svg>`;
        return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
    }

    setupNavigation() {
        document.querySelectorAll('.nav-link[data-section]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = link.getAttribute('data-section');
                this.navigateTo(section);
                if (window.innerWidth < 768) {
                    document.getElementById('sidebar').classList.remove('mobile-open');
                }
            });
        });

        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', () => {
                document.getElementById('sidebar').classList.toggle('mobile-open');
            });
        }

        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                localStorage.removeItem('auth_token');
                localStorage.removeItem('user_data');
                window.location.href = '/login.html';
            });
        }

        console.log('✅ Navegação configurada');
    }

    navigateTo(section) {
        // Verificações de permissão
        if (section === 'segunda-chamada' && !this.temPermissao2Chamada) {
            this.showToast('❌ Você não tem permissão para acessar 2ª Chamada', 'error');
            return;
        }
        if (section === 'substituicao-professores' && !this.temPermissaoSubstituicao) {
            this.showToast('❌ Você não tem permissão para acessar Substituição de Professores', 'error');
            return;
        }
        if (section === 'atrasos' && !this.temPermissaoSubstituicao) {
            this.showToast('❌ Você não tem permissão para acessar Atrasos', 'error');
            return;
        }
        if (section === 'visitas' && !this.temPermissaoVisitas) {
            this.showToast('❌ Você não tem permissão para acessar Autorização de Visitas', 'error');
            return;
        }
        if (section === 'gestao-professores' && !this.temPermissaoGestaoProfessores) {
            this.showToast('❌ Você não tem permissão para acessar Gestão de Professores', 'error');
            return;
        }
        if (section === 'aee' && !this.temPermissaoAEE) {
            this.showToast('❌ Você não tem permissão para acessar AEE', 'error');
            return;
        }
        if (section === 'protocolo-provas' && !this.temPermissaoProtocoloProvas) {
            this.showToast('❌ Você não tem permissão para acessar Protocolo de Provas', 'error');
            return;
        }

        // Atualizar nav ativo
        document.querySelectorAll('.nav-link[data-section]').forEach(link => link.classList.remove('active'));
        document.querySelector(`.nav-link[data-section="${section}"]`)?.classList.add('active');

        // Bottom nav (mobile)
        const bottomNavSections = ['boas-vindas', 'provas'];
        if (bottomNavSections.includes(section)) {
            this.updateBottomNav(section);
        } else {
            document.querySelectorAll('#bottomNavSp .nav-item-sp').forEach(item => item.classList.remove('active'));
            document.querySelector('#bottomNavSp .nav-item-sp[data-section="menu"]')?.classList.add('active');
        }

        if (window.innerWidth <= 768) {
            setTimeout(() => this.fecharMenuLateral(), 100);
        }

        // Títulos
        const titles = {
            'boas-vindas': 'Setor Pedagógico',
            'provas': 'Provas',
            'segunda-chamada': '2ª Chamada',
            'substituicao-professores': 'Substituição de Professores',
            'atrasos': 'Atrasos de Professores',
            'visitas': 'Autorização de Visitas',
            'gestao-professores': 'Gestão de Professores',
            'aee': 'AEE - Atendimento Educacional Especializado',
            'protocolo-provas': 'Protocolo de Provas'
        };

        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) {
            pageTitle.textContent = titles[section] || 'Setor Pedagógico';
        }

        // Carregar conteúdo
        if (section === 'boas-vindas') {
            this.loadBoasVindas();
        } else if (section === 'provas') {
            this.loadProvas();
        } else if (section === 'segunda-chamada') {
            this.loadSegundaChamada();
        } else if (section === 'substituicao-professores') {
            this.loadSubstituicaoProfessores();
        } else if (section === 'atrasos') {
            this.loadAtrasos();
        } else if (section === 'visitas') {
            this.loadVisitas();
        } else if (section === 'gestao-professores') {
            this.loadGestaoProfessores();
        } else if (section === 'aee') {
            this.loadAEE();
        } else if (section === 'protocolo-provas') {
            this.loadProtocoloProvas();
        }
    }

    // ============================================================================
    // 🏠 BOAS-VINDAS (HOME)
    // ============================================================================
    loadBoasVindas() {
        const content = document.getElementById('content');
        if (!content) return;

        // Mata o intervalo antigo do relógio (se existir) para evitar múltiplos
        if (this._intervaloRelogioBoasVindas) {
            clearInterval(this._intervaloRelogioBoasVindas);
            this._intervaloRelogioBoasVindas = null;
        }

        const agora = new Date();
        const hora = agora.getHours();
        let saudacao = 'Bom dia';
        let iconeSaudacao = 'fa-sun';
        let corSaudacao = '#f59e0b';

        if (hora >= 12 && hora < 18) {
            saudacao = 'Boa tarde';
            iconeSaudacao = 'fa-cloud-sun';
            corSaudacao = '#f97316';
        } else if (hora >= 18 || hora < 5) {
            saudacao = 'Boa noite';
            iconeSaudacao = 'fa-moon';
            corSaudacao = '#6366f1';
        }

        const nome = (this.currentUser?.nome || 'Servidor(a)').split(' ')[0];

        const dataFormatada = agora.toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });

        // 🔥 MENSAGEM COMPLETA E DESCRITIVA
        const mensagemCompleta = 'Aqui você acompanha o AEE, autorizações de visitas, gestão e substituição de professores, 2ª chamada e muito mais. Escolha um dos módulos abaixo para começar.';

        const modulos = [];

        if (this.temPermissaoAEE) {
            modulos.push({
                section: 'aee',
                titulo: 'AEE',
                subtitulo: 'Atendimento Educacional Especializado',
                descricao: 'Acompanhamento de alunos com necessidades educacionais específicas',
                icone: 'fa-universal-access',
                cor: 'linear-gradient(135deg, #6366f1, #8b5cf6)'
            });
        }

        if (this.temPermissaoVisitas) {
            modulos.push({
                section: 'visitas',
                titulo: 'Autorização de Visitas',
                subtitulo: 'Controle de visitas e saídas',
                descricao: 'Gerencie autorizações e registros de visitas',
                icone: 'fa-map-marked-alt',
                cor: 'linear-gradient(135deg, #10b981, #059669)'
            });
        }

        if (this.temPermissaoGestaoProfessores) {
            modulos.push({
                section: 'gestao-professores',
                titulo: 'Gestão de Professores',
                subtitulo: 'Cadastro e manutenção',
                descricao: 'Cadastre, edite e gerencie o corpo docente',
                icone: 'fa-chalkboard-teacher',
                cor: 'linear-gradient(135deg, #f59e0b, #d97706)'
            });
        }

        if (this.temPermissaoSubstituicao) {
            modulos.push({
                section: 'substituicao-professores',
                titulo: 'Substituição de Professores',
                subtitulo: 'Registro de substituições e atrasos',
                descricao: 'Controle de ausências e substituições do corpo docente',
                icone: 'fa-people-arrows',
                cor: 'linear-gradient(135deg, #ec4899, #db2777)'
            });
        }

        if (this.temPermissao2Chamada) {
            modulos.push({
                section: 'segunda-chamada',
                titulo: '2ª Chamada',
                subtitulo: 'Registro de provas em segunda chamada',
                descricao: 'Registre e gerencie as segundas chamadas dos alunos',
                icone: 'fa-redo',
                cor: 'linear-gradient(135deg, #06b6d4, #0891b2)'
            });
        }
        if (this.temPermissaoProtocoloProvas) {
            modulos.push({
                section: 'protocolo-provas',
                titulo: 'Protocolo de Provas',
                subtitulo: 'Recebimento de provas',
                descricao: 'Registre o recebimento das provas dos professores',
                icone: 'fa-file-signature',
                cor: 'linear-gradient(135deg, #1e3c72, #2a5298)'
            });
        }

        content.innerHTML = `
            <div class="welcome-container">
                <div class="welcome-hero">
                    <div class="welcome-hero-bg"></div>
                    <div class="welcome-hero-content">

                        <div class="welcome-hero-main">
                            <div class="welcome-hero-left">
                                <div class="welcome-saudacao-icon" style="background: ${corSaudacao}20; color: ${corSaudacao};">
                                    <i class="fas ${iconeSaudacao}"></i>
                                </div>
                                <h1 class="welcome-title">
                                    ${saudacao}, <span>${this.escapeHtml(nome)}</span>! 👋
                                </h1>
                                <p class="welcome-subtitle">
                                    Bem-vindo(a) ao <strong>Setor Pedagógico</strong> do <strong>EducaPleno</strong>. ${this.escapeHtml(mensagemCompleta)}
                                </p>
                                <div class="welcome-data">
                                    <i class="fas fa-calendar-alt"></i>
                                    ${this.escapeHtml(dataFormatada)}
                                </div>
                            </div>

                            <div class="welcome-hero-right">
                                <div class="welcome-relogio-card">
                                    <div class="welcome-relogio-topo">
                                        <i class="fas fa-clock"></i>
                                        <span>Horário atual</span>
                                    </div>
                                    <div class="welcome-relogio-hora" id="welcomeRelogioHora">--:--</div>
                                    <div class="welcome-relogio-segundos" id="welcomeRelogioSegundos">--s</div>
                                    <div class="welcome-relogio-periodo" id="welcomeRelogioPeriodo">—</div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                ${modulos.length > 0 ? `
                    <div class="welcome-modulos-section">
                        <div class="welcome-modulos-header">
                            <h2><i class="fas fa-th-large"></i> Módulos Disponíveis</h2>
                            <span class="welcome-modulos-count">${modulos.length} ${modulos.length === 1 ? 'módulo' : 'módulos'}</span>
                        </div>
                        <div class="welcome-modulos-grid">
                            ${modulos.map(m => `
                                <div class="welcome-modulo-card" onclick="setorPedagogico.navigateTo('${m.section}')">
                                    <div class="welcome-modulo-icon" style="background: ${m.cor};">
                                        <i class="fas ${m.icone}"></i>
                                    </div>
                                    <div class="welcome-modulo-body">
                                        <h3>${m.titulo}</h3>
                                        <p class="welcome-modulo-subtitulo">${m.subtitulo}</p>
                                        <p class="welcome-modulo-descricao">${m.descricao}</p>
                                    </div>
                                    <div class="welcome-modulo-arrow">
                                        <i class="fas fa-arrow-right"></i>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : `
                    <div class="welcome-empty">
                        <i class="fas fa-lock"></i>
                        <h2>Nenhum módulo liberado ainda</h2>
                        <p>Solicite ao administrador a liberação dos módulos que você precisa acessar.</p>
                    </div>
                `}

                <div class="welcome-footer">
                    <div class="welcome-footer-item">
                        <i class="fas fa-shield-alt"></i>
                        <span>Acesso seguro</span>
                    </div>
                    <div class="welcome-footer-item">
                        <i class="fas fa-heart" style="color: #ec4899;"></i>
                        <span>EducaPleno</span>
                    </div>
                    <div class="welcome-footer-item">
                        <i class="fas fa-graduation-cap"></i>
                        <span>Setor Pedagógico</span>
                    </div>
                </div>
            </div>
        `;

        // 🔥 Inicia o relógio em tempo real
        this._iniciarRelogioBoasVindas();
    }

    // 🔥 Relógio em tempo real do hero
    _iniciarRelogioBoasVindas() {
        const horaEl = document.getElementById('welcomeRelogioHora');
        const segEl = document.getElementById('welcomeRelogioSegundos');
        const perEl = document.getElementById('welcomeRelogioPeriodo');
        if (!horaEl || !segEl || !perEl) return;

        const atualizar = () => {
            const agora = new Date();
            const hh = String(agora.getHours()).padStart(2, '0');
            const mm = String(agora.getMinutes()).padStart(2, '0');
            const ss = String(agora.getSeconds()).padStart(2, '0');

            horaEl.textContent = `${hh}:${mm}`;
            segEl.textContent = `${ss}s`;

            const h = agora.getHours();
            let periodo = 'Madrugada';
            if (h >= 5 && h < 12) periodo = 'Manhã';
            else if (h >= 12 && h < 18) periodo = 'Tarde';
            else if (h >= 18 && h < 24) periodo = 'Noite';
            perEl.textContent = periodo;
        };

        atualizar();
        this._intervaloRelogioBoasVindas = setInterval(atualizar, 1000);
    }

    // ============================================================================
    // 📝 PROVAS (visualizar / imprimir normal — SEM adaptação)
    // ============================================================================
    async loadProvas() {
        const content = document.getElementById('content');
        if (!content) return;

        // 🔥 Cache de 60s
        const agora = Date.now();
        const cacheValido = this._provasCache && (agora - this._provasCache.ts) < 60000;

        if (!cacheValido) {
            content.innerHTML = '<div class="text-center py-5"><div class="loading"></div><p class="mt-3 text-muted">Carregando provas...</p></div>';
        }

        try {
            let data;
            if (cacheValido) {
                data = this._provasCache.data;
                console.log('⚡ Provas do cache');
            } else {
                // 🚀 limita no servidor (o backend já aceita ?limit)
                data = await this.apiRequest('/api/setor-pedagogico/provas?limit=200');
                this._provasCache = { data, ts: agora };
            }

            if (data.success) {
                content.innerHTML = `
                    <div class="filtros-card">
                        <div class="row g-3 align-items-end">
                            <div class="col-md-3">
                                <label class="fw-semibold mb-2">Tipo de Prova</label>
                                <select class="form-select" id="filtroTipoProva">
                                    <option value="">Todos</option>
                                    <option value="adaptada">Adaptadas (3 alternativas)</option>
                                    <option value="normal">Normais (5 alternativas)</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="fw-semibold mb-2">Turma</label>
                                <select class="form-select" id="filtroTurmaProva">
                                    <option value="">Todas</option>
                                    ${data.filtros.turmas.map(t => `<option value="${t.id}">${t.nome}</option>`).join('')}
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="fw-semibold mb-2">Status</label>
                                <select class="form-select" id="filtroStatusProva">
                                    <option value="">Todos</option>
                                    <option value="ativa">Ativas</option>
                                    <option value="encerrada">Encerradas</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <div class="d-flex gap-2">
                                    <button class="btn btn-primary flex-grow-1" onclick="setorPedagogico.aplicarFiltrosProvas()">
                                        <i class="fas fa-search me-2"></i> Filtrar
                                    </button>
                                    <button class="btn btn-outline-secondary" onclick="setorPedagogico.limparFiltrosProvas()">
                                        <i class="fas fa-eraser"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="table-container">
                        <div class="table-header d-flex justify-content-between align-items-center">
                            <h5 class="mb-0 fw-bold"><i class="fas fa-file-alt me-2 text-primary"></i> Provas Publicadas</h5>
                            <div>
                                <button class="btn btn-sm btn-outline-primary" onclick="setorPedagogico.carregarProvas()">
                                    <i class="fas fa-sync-alt me-1"></i> Atualizar
                                </button>
                            </div>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-hover">
                                <thead>
                                    <tr><th>Código</th><th>Título</th><th>Tipo</th><th>Turma</th><th>Professor</th><th>Questões</th><th>Data Limite</th><th>Ações</th></tr>
                                </thead>
                                <tbody>
                                    ${data.provas.map(prova => `
                                        <tr>
                                            <td><code class="bg-light px-2 py-1 rounded">${prova.codigo}</code></td>
                                            <td><strong>${prova.titulo}</strong></td>
                                            <td>
                                                <span class="badge ${prova.tipo === 'adaptada' ? 'bg-warning' : 'bg-info'} px-3 py-2">
                                                    ${prova.tipo === 'adaptada' ? '🎯 Adaptada' : '📝 Normal'}
                                                </span>
                                            </td>
                                            <td>${prova.turma?.nome || '-'}</td>
                                            <td>${prova.professor}</td>
                                            <td><span class="fw-bold">${prova.quantidadeQuestoes}</span></td>
                                            <td>${prova.dataLimite ? new Date(prova.dataLimite).toLocaleDateString('pt-BR') : '-'}</td>
                                            <td>
                                                <div class="d-flex gap-2">
                                                    <button class="btn btn-sm btn-outline-info" onclick="setorPedagogico.visualizarProva('${prova.id}')">
                                                        <i class="fas fa-eye"></i>
                                                    </button>
                                                    <button class="btn btn-sm btn-print" onclick="setorPedagogico.imprimirProvaNormal('${prova.id}', '${prova.titulo}')">
                                                        <i class="fas fa-print"></i>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    `).join('')}
                                    ${data.provas.length === 0 ? '<tr><td colspan="8" class="text-center text-muted py-5">Nenhuma prova encontrada</td></tr>' : ''}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
                window.provasData = data;
            }
        } catch (error) {
            console.error('Erro ao carregar provas:', error);
            content.innerHTML = '<div class="alert alert-danger">Erro ao carregar provas</div>';
        }
    }

    async visualizarProva(provaId) {
        try {
            const data = await this.apiRequest(`/api/setor-pedagogico/provas/${provaId}/visualizar`);
            if (data.success) {
                const p = data.prova;
                let questoesHtml = '';
                p.questoes.forEach((q, index) => {
                    questoesHtml += `
                        <div class="questao-item">
                            <div class="questao-pergunta"><span class="badge bg-primary me-2">${index + 1}</span> ${q.pergunta}</div>
                            <ul class="opcoes-list">${q.opcoes.map(opcao => `<li>${opcao}</li>`).join('')}</ul>
                            <div class="mt-2 text-muted small bg-light p-2 rounded">
                                <i class="fas fa-lightbulb text-warning me-1"></i> ${q.explicacao}
                            </div>
                        </div>
                    `;
                });

                const modalHtml = `
                    <div class="prova-preview">
                        <div class="text-center mb-5">
                            <h1 class="fw-bold" style="background: linear-gradient(135deg, #667eea, #764ba2); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${p.titulo}</h1>
                            <div class="row mt-4">
                                <div class="col-md-3"><div class="border rounded p-2"><small class="text-muted">Código</small><div><strong>${p.codigo}</strong></div></div></div>
                                <div class="col-md-3"><div class="border rounded p-2"><small class="text-muted">Turma</small><div><strong>${p.turma?.nome || '-'}</strong></div></div></div>
                                <div class="col-md-3"><div class="border rounded p-2"><small class="text-muted">Professor</small><div><strong>${p.professor}</strong></div></div></div>
                                <div class="col-md-3"><div class="border rounded p-2"><small class="text-muted">Duração</small><div><strong>${p.duracaoMinutos} min</strong></div></div></div>
                            </div>
                            <hr class="my-4">
                        </div>
                        <div class="questoes">${questoesHtml}</div>
                        <div class="text-center mt-5"><hr><p class="text-muted small">Documento gerado pelo EducaPleno - Setor Pedagógico</p></div>
                    </div>
                `;

                const modal = new bootstrap.Modal(document.getElementById('provaModal'));
                document.getElementById('provaModalBody').innerHTML = modalHtml;
                document.getElementById('provaModal').querySelector('.modal-title').innerHTML = `<i class="fas fa-file-alt me-2"></i> ${p.titulo}`;
                document.getElementById('printProvaBtn').style.display = 'block';
                document.getElementById('printProvaBtn').onclick = () => this.imprimirProvaNormal(provaId, p.titulo);
                modal.show();
            }
        } catch (error) {
            console.error('Erro ao visualizar prova:', error);
            this.showToast('Erro ao carregar prova para visualização', 'error');
        }
    }

    async imprimirProvaNormal(provaId, titulo) {
        try {
            const data = await this.apiRequest(`/api/setor-pedagogico/provas/${provaId}/visualizar`);
            if (!data.success) throw new Error(data.error || 'Erro ao carregar prova');

            const p = data.prova;

            let questoesHtml = '';
            p.questoes.forEach((q, idx) => {
                questoesHtml += `
                    <div style="margin-bottom: 22px; page-break-inside: avoid;">
                        <div style="font-weight: bold; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 8px;">
                            Questão ${idx + 1}
                        </div>
                        <div style="margin-bottom: 10px; line-height: 1.5;">${q.pergunta}</div>
                        <div style="margin-left: 15px;">
                            ${(q.opcoes || []).map((op, i) => `
                                <div style="display: flex; margin: 6px 0;">
                                    <span style="font-weight: 600; min-width: 24px;">${String.fromCharCode(65 + i)})</span>
                                    <span>${op}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            });

            const html = `<!DOCTYPE html>
                <html lang="pt-BR">
                <head>
                    <meta charset="UTF-8">
                    <title>${this.escapeHtml(p.titulo)}</title>
                    <style>
                        @page { size: A4; margin: 15mm; }
                        * { box-sizing: border-box; margin: 0; padding: 0; }
                        body { font-family: 'Times New Roman', serif; font-size: 11pt; line-height: 1.4; color: #000; }
                        .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                        .header h1 { font-size: 14pt; text-transform: uppercase; }
                        .header h2 { font-size: 11pt; font-weight: normal; margin-top: 4px; }
                        .info-box { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding: 8px; background: #f5f5f5; border: 1px solid #ccc; margin-bottom: 20px; font-size: 10pt; }
                        .aluno-box { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
                        .aluno-linha { display: flex; align-items: baseline; gap: 8px; }
                        .aluno-linha strong { min-width: 90px; }
                        .aluno-linha .linha { flex: 1; border-bottom: 1px dotted #000; height: 18px; }
                        .btn-print { display: block; margin: 15px auto; padding: 10px 24px; background: #667eea; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }
                        @media print { .btn-print { display: none; } }
                    </style>
                </head>
                <body>
                    <button class="btn-print" onclick="window.print()">🖨️ Imprimir</button>

                    <div class="header">
                        <h1>IEMA Pleno: São Luís - Centro</h1>
                        <h2>${this.escapeHtml(p.titulo)}</h2>
                    </div>

                    <div class="info-box">
                        <span><strong>Código:</strong> ${this.escapeHtml(p.codigo || '-')}</span>
                        <span><strong>Turma:</strong> ${this.escapeHtml(p.turma?.nome || '-')}</span>
                        <span><strong>Disciplina:</strong> ${this.escapeHtml(p.turma?.disciplina || '-')}</span>
                        <span><strong>Professor:</strong> ${this.escapeHtml(p.professor || '-')}</span>
                        <span><strong>Duração:</strong> ${p.duracaoMinutos || '-'} min</span>
                    </div>

                    <div class="aluno-box">
                        <div class="aluno-linha">
                            <strong>ESTUDANTE:</strong>
                            <span class="linha"></span>
                        </div>
                        <div class="aluno-linha">
                            <strong>TURMA:</strong>
                            <span class="linha"></span>
                            <strong style="margin-left: 20px;">DATA:</strong>
                            <span class="linha"></span>
                        </div>
                    </div>

                    ${questoesHtml}

                    <div style="margin-top: 40px; text-align: center; font-size: 9pt; color: #666; border-top: 1px solid #ccc; padding-top: 8px;">
                        Documento gerado pelo EducaPleno — Setor Pedagógico
                    </div>
                </body>
                </html>`;

            const printWindow = window.open('', '_blank');
            printWindow.document.write(html);
            printWindow.document.close();
            printWindow.onload = () => {
                printWindow.print();
                printWindow.onafterprint = () => printWindow.close();
            };

            this.showToast('✅ Impressão preparada!', 'success');
        } catch (error) {
            console.error('❌ Erro na impressão:', error);
            this.showToast('Erro ao preparar impressão: ' + error.message, 'error');
        }
    }

    aplicarFiltrosProvas() { this.loadProvas(); }
    limparFiltrosProvas() {
        if (document.getElementById('filtroTipoProva')) document.getElementById('filtroTipoProva').value = '';
        if (document.getElementById('filtroTurmaProva')) document.getElementById('filtroTurmaProva').value = '';
        if (document.getElementById('filtroStatusProva')) document.getElementById('filtroStatusProva').value = '';
        this.loadProvas();
    }
    carregarProvas() { this.loadProvas(); }

        // ============================================================================
    // 🔥 CARREGAR MÓDULO AEE (delega para AeeModule)
    // ============================================================================
    async loadAEE() {
        const content = document.getElementById('content');
        if (!content) return;

        if (!this.temPermissaoAEE) {
            content.innerHTML = `
                <div class="alert alert-warning m-4">
                    <i class="fas fa-lock"></i>
                    <strong>Acesso Restrito</strong>
                    <p>Você não tem permissão para acessar o módulo AEE.</p>
                </div>
            `;
            return;
        }

        console.log('📋 Carregando módulo AEE...');

        if (typeof window.AeeModule !== 'undefined') {
            await window.AeeModule.init();
        } else {
            console.warn('⚠️ AeeModule não encontrado');
            content.innerHTML = `
                <div class="alert alert-danger m-4">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Erro:</strong> Módulo AEE não carregado.
                    <br><small>Recarregue a página (F5) e tente novamente.</small>
                </div>
            `;
        }
    }

    // ============================================================================
    // 🔥 PROTOCOLO DE PROVAS
    // ============================================================================
    async loadProtocoloProvas() {
        const content = document.getElementById('content');
        if (!content) return;

        if (!this.temPermissaoProtocoloProvas) {
            content.innerHTML = `
                <div class="alert alert-warning m-4">
                    <i class="fas fa-lock"></i>
                    <strong>Acesso Restrito</strong>
                    <p>Você não tem permissão para acessar este módulo.</p>
                </div>
            `;
            return;
        }

        console.log('📋 Carregando módulo de Protocolo de Provas...');

        if (typeof window.ProtocoloProvasModule !== 'undefined') {
            await window.ProtocoloProvasModule.init();
        } else {
            console.warn('⚠️ ProtocoloProvasModule não encontrado');
            content.innerHTML = `
                <div class="alert alert-danger m-4">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Erro:</strong> Módulo de Protocolo de Provas não carregado.
                    <br><small>Recarregue a página (F5) e tente novamente.</small>
                </div>
            `;
        }
    }

    // ============================================================================
    // 🔥 CARREGAR MÓDULO DE GESTÃO DE PROFESSORES (delega para GestaoProfessoresModule)
    // ============================================================================
    async loadGestaoProfessores() {
        const content = document.getElementById('content');
        if (!content) return;

        if (!this.temPermissaoGestaoProfessores) {
            content.innerHTML = `
                <div class="alert alert-warning m-4">
                    <i class="fas fa-lock"></i>
                    <strong>Acesso Restrito</strong>
                    <p>Você não tem permissão para acessar este módulo.</p>
                </div>
            `;
            return;
        }

        console.log('📋 Carregando módulo de Gestão de Professores...');

        content.innerHTML = `
            <div class="gestao-professores-container">
                <ul class="nav nav-tabs mb-3" role="tablist">
                    <li class="nav-item">
                        <button class="nav-link active" id="gpRegistrarTab" data-bs-toggle="tab" data-bs-target="#gpRegistrar" type="button">
                            <i class="fas fa-plus-circle"></i> Registrar
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" id="gpListaTab" data-bs-toggle="tab" data-bs-target="#gpLista" type="button">
                            <i class="fas fa-list"></i> Registros
                            <span class="badge bg-primary ms-1" id="gpBadgeTotal">0</span>
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" id="gpDashboardTab" data-bs-toggle="tab" data-bs-target="#gpDashboard" type="button">
                            <i class="fas fa-chart-line"></i> Dashboard
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" id="gpRelatorioTab" data-bs-toggle="tab" data-bs-target="#gpRelatorio" type="button">
                            <i class="fas fa-file-alt"></i> Relatórios
                        </button>
                    </li>
                </ul>

                <div class="tab-content">
                    <div class="tab-pane fade show active" id="gpRegistrar">
                        <div class="card mb-3" style="border: 2px solid #e0e7ff;">
                            <div class="card-body">
                                <div class="etapa-header">
                                    <div class="etapa-numero">1</div>
                                    <div class="etapa-titulo">
                                        <h5><i class="fas fa-user-tie me-2"></i> Selecionar Professor</h5>
                                        <small class="text-muted">Busque pelo professor cadastrado no sistema</small>
                                    </div>
                                </div>
                                <div class="search-box mt-3" style="position: relative;">
                                    <i class="fas fa-search" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #9ca3af;"></i>
                                    <input type="text" id="gpBuscaProfessor" placeholder="Buscar por nome, email, matrícula ou CPF..."
                                           style="width: 100%; padding: 14px 16px 14px 44px; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 14px;">
                                </div>
                                <div id="gpListaProfessores" class="mt-3" style="max-height: 400px; overflow-y: auto;">
                                    <div style="text-align: center; padding: 30px;">
                                        <i class="fas fa-spinner fa-spin" style="font-size: 24px; color: #6366f1;"></i>
                                        <p style="margin-top: 10px; color: #64748b;">Carregando professores...</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div id="gpDadosProfessor" style="display: none;"></div>

                        <div class="card mb-3" id="gpCardTurmas" style="display: none; border: 2px solid #e0e7ff;">
                            <div class="card-body">
                                <div class="etapa-header">
                                    <div class="etapa-numero">2</div>
                                    <div class="etapa-titulo">
                                        <h5><i class="fas fa-users me-2"></i> Turmas Vinculadas</h5>
                                        <small class="text-muted">Vincule as turmas que o professor leciona</small>
                                    </div>
                                </div>
                                <div class="row g-3 mt-3">
                                    <div class="col-md-5">
                                        <label class="form-label" style="font-weight: 600; font-size: 13px;">Turma</label>
                                        <select id="gpSelectTurma" class="form-select">
                                            <option value="">Selecione a turma...</option>
                                        </select>
                                    </div>
                                    <div class="col-md-2 d-flex align-items-end">
                                        <button id="gpBtnAddTurma" class="btn btn-primary w-100" style="height: 42px;">
                                            <i class="fas fa-plus"></i> Adicionar
                                        </button>
                                    </div>
                                    <div class="col-md-5">
                                        <label class="form-label" style="font-weight: 600; font-size: 13px;">Data da Coleta <span class="text-danger">*</span></label>
                                        <input type="date" id="gpDataColeta" class="form-control" style="height: 42px;">
                                    </div>
                                </div>
                                <div id="gpTurmasVinculadas" class="mt-3"></div>
                            </div>
                        </div>

                        <div class="card mb-3" id="gpCardComponentes" style="display: none; border: 2px solid #e0e7ff;">
                            <div class="card-body">
                                <div class="etapa-header">
                                    <div class="etapa-numero">3</div>
                                    <div class="etapa-titulo">
                                        <h5><i class="fas fa-book-open me-2"></i> Componentes Curriculares</h5>
                                        <small class="text-muted">Adicione os componentes que o professor leciona</small>
                                    </div>
                                </div>
                                <div id="gpListaComponentes" class="mt-3"></div>
                                <div class="mt-3">
                                    <button id="gpBtnAddComponente" class="btn btn-outline-primary">
                                        <i class="fas fa-plus"></i> Adicionar Componente
                                    </button>
                                </div>
                                <div class="mt-3">
                                    <label class="form-label" style="font-weight: 600; font-size: 13px;">Observações Gerais</label>
                                    <textarea id="gpObservacoesGerais" class="form-control" rows="3"
                                              placeholder="Observações gerais sobre a gestão deste professor..."></textarea>
                                </div>
                                <div class="d-flex gap-2 mt-4 justify-content-end">
                                    <button id="gpBtnLimpar" class="btn btn-secondary">
                                        <i class="fas fa-times me-2"></i> Cancelar
                                    </button>
                                    <button id="gpBtnRegistrar" class="btn btn-primary">
                                        <i class="fas fa-save me-2"></i> Registrar Gestão
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="tab-pane fade" id="gpLista">
                        <div class="card mb-3">
                            <div class="card-body">
                                <h6 class="card-title"><i class="fas fa-filter me-2"></i> Filtros</h6>
                                <div class="row g-3">
                                    <div class="col-md-3">
                                        <label class="form-label">Buscar</label>
                                        <input type="text" id="gpFiltroBusca" class="form-control" placeholder="Professor ou componente...">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label">Eixo</label>
                                        <select id="gpFiltroEixo" class="form-select"><option value="">Todos</option></select>
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label">Turma</label>
                                        <select id="gpFiltroTurma" class="form-select"><option value="">Todas</option></select>
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label">Data Início</label>
                                        <input type="date" id="gpFiltroDataInicio" class="form-control">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label">Data Fim</label>
                                        <input type="date" id="gpFiltroDataFim" class="form-control">
                                    </div>
                                    <div class="col-md-1 d-flex align-items-end">
                                        <button class="btn btn-secondary w-100" onclick="GestaoProfessoresModule.carregarLista()">
                                            <i class="fas fa-search"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="card">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center mb-3">
                                    <h6 class="card-title mb-0"><i class="fas fa-list me-2"></i> Registros de Gestão</h6>
                                    <span class="badge bg-primary" id="gpContadorRegistros">0 registros</span>
                                </div>
                                <div id="gpListaRegistros"></div>
                            </div>
                        </div>
                    </div>

                    <div class="tab-pane fade" id="gpDashboard">
                        <div class="card mb-3">
                            <div class="card-body">
                                <div class="row g-3 align-items-end">
                                    <div class="col-md-4">
                                        <label class="form-label">Mês de Referência</label>
                                        <input type="month" id="gpDashboardMes" class="form-control">
                                    </div>
                                    <div class="col-md-3">
                                        <button id="gpBtnAtualizarDashboard" class="btn btn-primary w-100">
                                            <i class="fas fa-sync-alt me-2"></i> Atualizar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="row mb-4">
                            <div class="col-md-3 mb-3">
                                <div class="metric-card" style="background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white;">
                                    <i class="fas fa-clipboard-list fa-2x mb-2"></i>
                                    <div class="metric-value" id="gpStatTotalGeral">0</div>
                                    <div class="metric-label">Total Geral</div>
                                </div>
                            </div>
                            <div class="col-md-3 mb-3">
                                <div class="metric-card" style="background: linear-gradient(135deg, #10b981, #059669); color: white;">
                                    <i class="fas fa-calendar-alt fa-2x mb-2"></i>
                                    <div class="metric-value" id="gpStatTotalMes">0</div>
                                    <div class="metric-label">No Mês</div>
                                </div>
                            </div>
                            <div class="col-md-3 mb-3">
                                <div class="metric-card" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white;">
                                    <i class="fas fa-user-tie fa-2x mb-2"></i>
                                    <div class="metric-value" id="gpStatProfessores">0</div>
                                    <div class="metric-label">Professores</div>
                                </div>
                            </div>
                            <div class="col-md-3 mb-3">
                                <div class="metric-card" style="background: linear-gradient(135deg, #ec4899, #db2777); color: white;">
                                    <i class="fas fa-chalkboard fa-2x mb-2"></i>
                                    <div class="metric-value" id="gpStatAulas">0</div>
                                    <div class="metric-label">Aulas Registradas</div>
                                </div>
                            </div>
                        </div>

                        <div class="row">
                            <div class="col-md-6 mb-4">
                                <div class="card h-100"><div class="card-body">
                                    <h6 class="card-title"><i class="fas fa-chart-pie"></i> Distribuição por Eixo</h6>
                                    <canvas id="gpChartEixo"></canvas>
                                </div></div>
                            </div>
                            <div class="col-md-6 mb-4">
                                <div class="card h-100"><div class="card-body">
                                    <h6 class="card-title"><i class="fas fa-chart-bar"></i> Distribuição por Turma</h6>
                                    <canvas id="gpChartTurma"></canvas>
                                </div></div>
                            </div>
                        </div>

                        <div class="row">
                            <div class="col-md-6 mb-4">
                                <div class="card h-100"><div class="card-body">
                                    <h6 class="card-title"><i class="fas fa-trophy"></i> Professores com Mais Componentes</h6>
                                    <div id="gpRankingProfessores" class="mt-3"></div>
                                </div></div>
                            </div>
                            <div class="col-md-6 mb-4">
                                <div class="card h-100"><div class="card-body">
                                    <h6 class="card-title"><i class="fas fa-history"></i> Últimos Registros</h6>
                                    <div id="gpUltimosRegistros" class="mt-3"></div>
                                </div></div>
                            </div>
                        </div>
                    </div>

                    <div class="tab-pane fade" id="gpRelatorio">
                        <div class="card mb-3">
                            <div class="card-body">
                                <h6 class="card-title"><i class="fas fa-file-alt me-2"></i> Gerar Relatório</h6>
                                <div class="row g-3">
                                    <div class="col-md-3">
                                        <label class="form-label">Tipo de Relatório</label>
                                        <select id="gpTipoRelatorio" class="form-select">
                                            <option value="geral">Geral</option>
                                            <option value="eixo">Por Eixo</option>
                                            <option value="turma">Por Turma</option>
                                            <option value="professor">Por Professor</option>
                                        </select>
                                    </div>
                                    <div class="col-md-3" id="gpRelatorioEixoDiv" style="display: none;">
                                        <label class="form-label">Eixo</label>
                                        <select id="gpRelatorioEixo" class="form-select">
                                            <option value="">Selecione...</option>
                                        </select>
                                    </div>
                                    <div class="col-md-3" id="gpRelatorioTurmaDiv" style="display: none;">
                                        <label class="form-label">Turma</label>
                                        <select id="gpRelatorioTurma" class="form-select">
                                            <option value="">Selecione...</option>
                                        </select>
                                    </div>
                                    <div class="col-md-3" id="gpRelatorioProfessorDiv" style="display: none;">
                                        <label class="form-label">Professor</label>
                                        <select id="gpRelatorioProfessor" class="form-select">
                                            <option value="">Selecione...</option>
                                        </select>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">Data Início</label>
                                        <input type="date" id="gpRelatorioDataInicio" class="form-control">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">Data Fim</label>
                                        <input type="date" id="gpRelatorioDataFim" class="form-control">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">&nbsp;</label>
                                        <button class="btn btn-primary w-100" id="gpBtnGerarRelatorio">
                                            <i class="fas fa-search me-2"></i> Gerar
                                        </button>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">&nbsp;</label>
                                        <div class="btn-group w-100">
                                            <button class="btn btn-success" id="gpBtnExportarCSV" disabled>
                                                <i class="fas fa-file-csv me-1"></i> CSV
                                            </button>
                                            <button class="btn btn-danger" id="gpBtnImprimirRelatorio" disabled>
                                                <i class="fas fa-print me-1"></i> PDF
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div id="gpResultadoRelatorio">
                            <div class="text-center py-5">
                                <i class="fas fa-chart-line fa-3x text-muted mb-3"></i>
                                <p class="text-muted">Selecione os filtros e clique em Gerar</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        setTimeout(async () => {
            if (window.GestaoProfessoresModule) {
                await window.GestaoProfessoresModule.init();
            }
        }, 150);
    }

    // ============================================================================
    // 🔥 CARREGAR MÓDULO DE AUTORIZAÇÃO DE VISITAS (OTIMIZADO)
    // ============================================================================
    loadVisitas() {
        const content = document.getElementById('content');
        if (!content) return;

        if (!this.temPermissaoVisitas) {
            content.innerHTML = `
                <div class="alert alert-warning m-4">
                    <i class="fas fa-lock"></i>
                    <strong>Acesso Restrito</strong>
                    <p>Você não tem permissão para acessar este módulo.</p>
                </div>
            `;
            return;
        }

        console.log('📋 Carregando módulo de Autorização de Visitas...');

        // 🚀 Cache: se já inicializou antes, apenas re-renderiza (instantâneo)
        if (this._visitasInicializado && window.visitasAdmin) {
            console.log('⚡ Módulo de visitas já carregado — reutilizando');

            content.innerHTML = `<div id="aba-visitas-content"></div>`;

            // Re-renderiza com os dados em cache (sem refetch)
            try {
                window.visitasAdmin.renderizar();
            } catch (e) {
                // Fallback: re-init completo
                this._visitasInicializado = false;
                this.loadVisitas();
            }
            return;
        }

        // 🚀 Renderização imediata com skeleton (sem setTimeout)
        content.innerHTML = `
            <div id="aba-visitas-content">
                <div style="text-align: center; padding: 60px;">
                    <div style="width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #667eea; border-radius: 50%; margin: 0 auto 20px; animation: spin 1s linear infinite;"></div>
                    <p style="color: #6b7280;">Carregando módulo de visitas...</p>
                </div>
                <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
            </div>
        `;

        // 🚀 Executa imediatamente (sem setTimeout) — não bloqueia a UI
        this._inicializarModuloVisitas(content);
    }

    // 🔧 Método interno isolado (permite reuso + retry)
    async _inicializarModuloVisitas(content) {
        try {
            // ⏳ Aguarda o script carregar (caso ainda não tenha sido carregado)
            await this._aguardarModuloVisitas();

            if (typeof window.visitasAdmin !== 'undefined' && window.visitasAdmin) {
                await window.visitasAdmin.init();
                this._visitasInicializado = true;
                console.log('✅ Módulo de visitas inicializado');
            } else {
                throw new Error('Módulo de visitas não encontrado. Recarregue a página (F5).');
            }
        } catch (error) {
            console.error('❌ Erro ao inicializar módulo de visitas:', error);
            content.innerHTML = `
                <div class="alert alert-danger m-4">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Erro ao carregar módulo:</strong> ${error.message}
                    <br><br>
                    <button class="btn btn-primary btn-sm" onclick="setorPedagogico.loadVisitas()">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    }

    // 🔧 Aguarda o módulo estar disponível (poll inteligente, sem travar)
    async _aguardarModuloVisitas(timeoutMs = 8000) {
        const inicio = Date.now();
        const intervalo = 50;

        while (Date.now() - inicio < timeoutMs) {
            if (typeof window.visitasAdmin !== 'undefined' && window.visitasAdmin) {
                return true;
            }
            await new Promise(r => setTimeout(r, intervalo));
        }

        throw new Error('Tempo esgotado aguardando o módulo de visitas');
    }

    // 🔥 Preaquece o módulo (baixa + inicializa sem mostrar)
    async _preaquecerModuloVisitas() {
        try {
            console.log('🔥 Prequecendo módulo de visitas...');
            // 🚀 Timeout curto (2s) — não bloqueia nada
            await this._aguardarModuloVisitas(2000);
            if (window.visitasAdmin && typeof window.visitasAdmin.preaquecer === 'function') {
                await window.visitasAdmin.preaquecer();
                console.log('✅ Módulo de visitas preaquecido');
            }
        } catch (e) {
            console.warn('⚠️ Prequecimento do módulo de visitas falhou (ok, não bloqueia):', e.message);
        }
    }

    // ============================================================================
    // 🔥 SUBSTITUIÇÃO DE PROFESSORES
    // ============================================================================
    async loadSubstituicaoProfessores() {
        // 🔥 Limpa intervalos anteriores (evita vazamento)
        if (this._intervaloHorarioSubstituicao) {
            clearInterval(this._intervaloHorarioSubstituicao);
            this._intervaloHorarioSubstituicao = null;
        }

        const content = document.getElementById('content');

        if (!this.temPermissaoSubstituicao) {
            content.innerHTML = `
                <div class="alert alert-warning m-4">
                    <i class="fas fa-lock"></i>
                    <strong>Acesso Restrito</strong>
                    <p>Você não tem permissão para acessar este módulo.</p>
                </div>
            `;
            return;
        }

        content.innerHTML = `
            <div class="substituicao-professores-container">
                <ul class="nav nav-tabs mb-3" role="tablist">
                    <li class="nav-item">
                        <button class="nav-link active" id="sp-registrar-tab" data-bs-toggle="tab" data-bs-target="#sp-registrar" type="button">
                            <i class="fas fa-plus-circle"></i> Registrar
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" id="sp-lista-tab" data-bs-toggle="tab" data-bs-target="#sp-lista" type="button">
                            <i class="fas fa-list"></i> Substituições
                            <span class="badge bg-danger ms-1" id="badgeTotalSubstituicoes">0</span>
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" id="sp-dashboard-tab" data-bs-toggle="tab" data-bs-target="#sp-dashboard" type="button">
                            <i class="fas fa-chart-line"></i> Dashboard
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" id="sp-relatorios-tab" data-bs-toggle="tab" data-bs-target="#sp-relatorios" type="button">
                            <i class="fas fa-file-alt"></i> Relatórios
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" id="sp-atrasos-tab" data-bs-toggle="tab" data-bs-target="#sp-atrasos" type="button">
                            <i class="fas fa-clock"></i> Atrasos
                            <span class="badge bg-warning text-dark ms-1" id="badgeTotalAtrasos">0</span>
                        </button>
                    </li>
                </ul>

                <div class="tab-content">
                    <div class="tab-pane fade show active" id="sp-registrar">

                        <div class="card mb-3" style="border: 2px solid #e0e7ff; background: linear-gradient(135deg, #f8faff 0%, #eef2ff 100%);">
                            <div class="card-body d-flex justify-content-between align-items-center flex-wrap gap-3">
                                <div style="display: flex; align-items: center; gap: 15px;">
                                    <div style="
                                        width: 55px; height: 55px; border-radius: 12px;
                                        background: linear-gradient(135deg, #6366f1, #8b5cf6);
                                        color: white; display: flex; align-items: center;
                                        justify-content: center; font-size: 24px;
                                        box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
                                    ">
                                        <i class="fas fa-users-cog"></i>
                                    </div>
                                    <div>
                                        <h5 class="mb-1" style="color: #1e293b; font-weight: 700;">
                                            Gerenciar Professores
                                        </h5>
                                        <small class="text-muted">
                                            Visualize, cadastre, edite ou exclua professores do sistema
                                        </small>
                                    </div>
                                </div>
                                <button class="btn btn-primary"
                                        onclick="setorPedagogico.abrirGerenciarProfessores()"
                                        style="background: linear-gradient(135deg, #6366f1, #8b5cf6); border: none; border-radius: 10px; padding: 10px 22px; font-weight: 600; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);">
                                    <i class="fas fa-user-plus me-2"></i> Gerenciar Professores
                                </button>
                            </div>
                        </div>

                        <div class="card mb-3" id="cardProfessorAusente">
                            <div class="card-body">
                                <div class="etapa-header">
                                    <div class="etapa-numero">1</div>
                                    <div class="etapa-titulo">
                                        <h5><i class="fas fa-user-slash me-2"></i> Professor Ausente</h5>
                                        <small class="text-muted">Selecione o professor que estará ausente</small>
                                    </div>
                                </div>
                                <div class="search-box mt-3">
                                    <i class="fas fa-search"></i>
                                    <input type="text" id="buscaProfessorAusente" placeholder="Buscar professor por nome, email ou matrícula...">
                                </div>
                                <div class="professor-list mt-3" id="listaProfessoresAusentes">
                                    <div class="text-center py-3"><div class="loading"></div><p>Carregando professores...</p></div>
                                </div>
                            </div>
                        </div>

                        <div class="card mb-3" id="cardProfessorSubstituto" style="display: none;">
                            <div class="card-body">
                                <div class="etapa-header">
                                    <div class="etapa-numero">2</div>
                                    <div class="etapa-titulo">
                                        <h5><i class="fas fa-user-check me-2"></i> Professor Substituto</h5>
                                        <small class="text-muted">Selecione quem irá substituir</small>
                                    </div>
                                </div>
                                <div class="search-box mt-3">
                                    <i class="fas fa-search"></i>
                                    <input type="text" id="buscaProfessorSubstituto" placeholder="Buscar professor substituto...">
                                </div>
                                <div class="professor-list mt-3" id="listaProfessoresSubstitutos">
                                    <div class="text-center py-3"><div class="loading"></div><p>Carregando professores...</p></div>
                                </div>

                                <div class="mt-3">
                                    <div style="background: #fef2f2; border: 2px solid #fecaca; border-radius: 12px; padding: 15px;">
                                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                            <input type="checkbox" id="checkSemSubstituto"
                                                onchange="setorPedagogico.toggleSemSubstituto()"
                                                style="width: 22px; height: 22px; accent-color: #dc2626; cursor: pointer;">
                                            <div>
                                                <strong style="font-size: 1rem; color: #dc2626;">
                                                    <i class="fas fa-user-slash"></i> Não há substituto disponível
                                                </strong>
                                                <p style="margin: 5px 0 0; font-size: 0.85rem; color: #991b1b;">
                                                    Marque esta opção quando ninguém puder substituir o professor ausente
                                                </p>
                                            </div>
                                        </label>

                                        <div id="camposSemSubstituto" style="display: none; margin-top: 15px; padding-top: 15px; border-top: 1px solid #fecaca;">
                                            <div class="mb-3">
                                                <label class="form-label" style="color: #991b1b; font-weight: 600;">
                                                    <i class="fas fa-exclamation-circle"></i> Motivo da Ausência do Substituto
                                                </label>
                                                <select id="selectMotivoSemSubstituto" class="form-select" style="border-color: #fecaca;">
                                                    <option value="">Selecione o motivo...</option>
                                                    <option value="falta_substituto">Falta do Substituto</option>
                                                    <option value="atestado_substituto">Atestado Médico</option>
                                                    <option value="emergencia">Emergência</option>
                                                    <option value="conflito_horario">Conflito de Horário</option>
                                                    <option value="outros">Outros</option>
                                                </select>
                                            </div>
                                            <div class="mb-0">
                                                <label class="form-label" style="color: #991b1b; font-weight: 600;">
                                                    <i class="fas fa-comment"></i> Observações
                                                </label>
                                                <textarea id="inputObservacoesSemSubstituto" class="form-control" rows="2"
                                                        placeholder="Informações adicionais sobre a ausência do substituto..."
                                                        style="border-color: #fecaca;"></textarea>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="card mb-3" id="cardDetalhes" style="display: none;">
                            <div class="card-body">
                                <div class="etapa-header">
                                    <div class="etapa-numero">3</div>
                                    <div class="etapa-titulo">
                                        <h5><i class="fas fa-clipboard-list me-2"></i> Detalhes da Substituição</h5>
                                        <small class="text-muted">Informe os dados da aula</small>
                                    </div>
                                </div>

                                <div class="resumo-professores mt-3">
                                    <div class="resumo-professor">
                                        <div class="resumo-role">AUSENTE</div>
                                        <div class="resumo-nome" id="resumoProfessorAusente">-</div>
                                    </div>
                                    <div class="resumo-arrow"><i class="fas fa-arrow-right"></i></div>
                                    <div class="resumo-professor">
                                        <div class="resumo-role">SUBSTITUTO</div>
                                        <div class="resumo-nome" id="resumoProfessorSubstituto">-</div>
                                    </div>
                                </div>

                                <div class="row g-3 mt-3">
                                    <div class="col-md-6">
                                        <label class="form-label">Turma <span class="text-danger">*</span></label>
                                        <select id="selectTurmaSubstituicao" class="form-select">
                                            <option value="">Selecione a turma...</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">Data <span class="text-danger">*</span></label>
                                        <input type="date" id="inputDataSubstituicao" class="form-control">
                                    </div>
                                </div>

                                <div class="mt-3">
                                    <label class="form-label">Horário(s) da Aula <span class="text-danger">*</span></label>
                                    <div class="horarios-grid" id="horariosGridSubstituicao">
                                        ${[1,2,3,4,5,6,7,8,9].map(n => `
                                            <div class="horario-card" data-horario="${n}" onclick="setorPedagogico.toggleHorarioSubstituicao(${n})">
                                                <div class="horario-numero">${n}º</div>
                                                <div class="horario-label">Horário</div>
                                            </div>
                                        `).join('')}
                                    </div>
                                    <input type="hidden" id="inputHorariosSubstituicao" value="">
                                    <small class="text-muted d-block mt-2">
                                        <i class="fas fa-info-circle"></i> Clique em vários para selecionar horários consecutivos (ex: 1º e 2º).
                                    </small>
                                </div>

                                <div id="blocoMotivoSubstituicao">
                                    <div class="mt-3">
                                        <label class="form-label">Motivo <span class="text-danger">*</span></label>
                                        <select id="selectMotivoSubstituicao" class="form-select" onchange="setorPedagogico.atualizarMotivoDetalhesSubstituicao()">
                                            <option value="">Selecione o motivo...</option>
                                            <option value="falta_professor">Falta do Professor</option>
                                            <option value="licenca_medica">Licença Médica</option>
                                            <option value="licenca_maternidade_paternidade">Licença Maternidade/Paternidade</option>
                                            <option value="capacitacao_formacao">Capacitação/Formação</option>
                                            <option value="reuniao_externa">Reunião Externa</option>
                                            <option value="problema_pessoal">Problema Pessoal</option>
                                            <option value="atestado">Atestado</option>
                                            <option value="outros">Outros</option>
                                        </select>
                                    </div>

                                    <div class="mt-3" id="grupoMotivoDetalhesSubstituicao" style="display: none;">
                                        <label class="form-label">Especifique o Motivo</label>
                                        <input type="text" id="inputMotivoDetalhesSubstituicao" class="form-control" placeholder="Descreva o motivo...">
                                    </div>
                                </div>

                                <div class="mt-3">
                                    <label class="form-label">Observações</label>
                                    <textarea id="inputObservacoesSubstituicao" class="form-control" rows="3" placeholder="Informações adicionais (opcional)..."></textarea>
                                </div>

                                <div class="info-preenchimento mt-3">
                                    <i class="fas fa-clock"></i>
                                    <div>
                                        <strong>Horário do Preenchimento:</strong>
                                        <span id="horarioPreenchimentoSubstituicao"></span>
                                    </div>
                                </div>

                                <div class="d-flex gap-2 mt-4 justify-content-end">
                                    <button class="btn btn-secondary" onclick="setorPedagogico.resetarFormularioSubstituicao()">
                                        <i class="fas fa-times me-2"></i> Cancelar
                                    </button>
                                    <button class="btn btn-primary" onclick="setorPedagogico.registrarSubstituicao()" id="btnRegistrarSubstituicao">
                                        <i class="fas fa-save me-2"></i> Registrar Substituição
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="tab-pane fade" id="sp-lista">
                        <div class="card mb-3">
                            <div class="card-body">
                                <h6 class="card-title"><i class="fas fa-filter me-2"></i> Filtros</h6>
                                <div class="row g-3">
                                    <div class="col-md-3">
                                        <label class="form-label">Mês de Referência</label>
                                        <input type="month" id="filtroMesSubstituicao" class="form-control">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">Buscar</label>
                                        <input type="text" id="filtroBuscaSubstituicao" class="form-control" placeholder="Nome ou turma...">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label">Turma</label>
                                        <select id="filtroTurmaSubstituicao" class="form-select"><option value="">Todas</option></select>
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label">Motivo</label>
                                        <select id="filtroMotivoSubstituicao" class="form-select">
                                            <option value="">Todos</option>
                                            <option value="falta_professor">Falta</option>
                                            <option value="licenca_medica">Licença Médica</option>
                                            <option value="licenca_maternidade_paternidade">Lic. Mat/Pater</option>
                                            <option value="capacitacao_formacao">Capacitação</option>
                                            <option value="reuniao_externa">Reunião</option>
                                            <option value="problema_pessoal">Pessoal</option>
                                            <option value="atestado">Atestado</option>
                                            <option value="sem_substituto">Sem Substituto</option>
                                            <option value="outros">Outros</option>
                                        </select>
                                    </div>
                                    <div class="col-md-2 d-flex align-items-end gap-2">
                                        <button class="btn btn-secondary flex-fill" onclick="setorPedagogico.limparFiltrosSubstituicao()">
                                            <i class="fas fa-eraser"></i>
                                        </button>
                                        <button class="btn btn-primary flex-fill" onclick="setorPedagogico.carregarListaSubstituicoes()">
                                            <i class="fas fa-search"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="card">
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center mb-3">
                                    <h6 class="card-title mb-0"><i class="fas fa-list me-2"></i> Substituições Registradas</h6>
                                    <span class="badge bg-primary" id="contadorListaSubstituicoes">0 registros</span>
                                </div>
                                <div id="listaSubstituicoes"></div>
                            </div>
                        </div>
                    </div>

                    <div class="tab-pane fade" id="sp-dashboard">
                        <div class="card mb-3">
                            <div class="card-body">
                                <div class="row g-3 align-items-end">
                                    <div class="col-md-4">
                                        <label class="form-label">Mês de Referência</label>
                                        <input type="month" id="dashboardMesSubstituicao" class="form-control">
                                    </div>
                                    <div class="col-md-3">
                                        <button class="btn btn-primary w-100" onclick="setorPedagogico.carregarDashboardSubstituicoes()">
                                            <i class="fas fa-sync-alt me-2"></i> Atualizar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="row mb-4">
                            <div class="col-md-3 mb-3">
                                <div class="metric-card">
                                    <i class="fas fa-people-arrows fa-2x text-primary mb-2"></i>
                                    <div class="metric-value" id="spStatTotalMes">0</div>
                                    <div class="metric-label">Substituições no Mês</div>
                                </div>
                            </div>
                            <div class="col-md-3 mb-3">
                                <div class="metric-card">
                                    <i class="fas fa-user-slash fa-2x text-warning mb-2"></i>
                                    <div class="metric-value" id="spStatProfessoresAusentes">0</div>
                                    <div class="metric-label">Professores Ausentes</div>
                                </div>
                            </div>
                            <div class="col-md-3 mb-3">
                                <div class="metric-card">
                                    <i class="fas fa-user-check fa-2x text-success mb-2"></i>
                                    <div class="metric-value" id="spStatProfessoresSubstitutos">0</div>
                                    <div class="metric-label">Substitutos</div>
                                </div>
                            </div>
                            <div class="col-md-3 mb-3">
                                <div class="metric-card" style="border-left: 4px solid #dc2626;">
                                    <i class="fas fa-user-times fa-2x text-danger mb-2"></i>
                                    <div class="metric-value" id="spStatSubstitutosAusentes">0</div>
                                    <div class="metric-label">Substitutos Ausentes</div>
                                </div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-md-6 mb-4">
                                <div class="card h-100"><div class="card-body">
                                    <h6 class="card-title"><i class="fas fa-chart-pie"></i> Por Motivo</h6>
                                    <canvas id="spChartMotivos"></canvas>
                                </div></div>
                            </div>
                            <div class="col-md-6 mb-4">
                                <div class="card h-100"><div class="card-body">
                                    <h6 class="card-title"><i class="fas fa-chart-bar"></i> Por Horário</h6>
                                    <canvas id="spChartHorarios"></canvas>
                                </div></div>
                            </div>
                            <div class="col-md-6 mb-4">
                                <div class="card h-100"><div class="card-body">
                                    <h6 class="card-title"><i class="fas fa-chart-line"></i> Por Dia</h6>
                                    <canvas id="spChartDias"></canvas>
                                </div></div>
                            </div>
                            <div class="col-md-6 mb-4">
                                <div class="card h-100"><div class="card-body">
                                    <h6 class="card-title"><i class="fas fa-school"></i> Por Turma</h6>
                                    <canvas id="spChartTurmas"></canvas>
                                </div></div>
                            </div>
                        </div>
                        <div class="row">
                            <div class="col-md-6 mb-4">
                                <div class="card h-100"><div class="card-body">
                                    <h6 class="card-title"><i class="fas fa-trophy"></i> Mais Ausentes</h6>
                                    <div id="spRankingAusentes" class="ranking-list mt-3"></div>
                                </div></div>
                            </div>
                            <div class="col-md-6 mb-4">
                                <div class="card h-100"><div class="card-body">
                                    <h6 class="card-title"><i class="fas fa-medal"></i> Mais Substituíram</h6>
                                    <div id="spRankingSubstitutos" class="ranking-list mt-3"></div>
                                </div></div>
                            </div>
                        </div>
                        <div class="card">
                            <div class="card-body">
                                <h6 class="card-title"><i class="fas fa-history"></i> Últimas Substituições</h6>
                                <div id="spUltimasSubstituicoes" class="mt-3"></div>
                            </div>
                        </div>
                    </div>

                    <div class="tab-pane fade" id="sp-relatorios">
                        <div class="card mb-3">
                            <div class="card-body">
                                <h6 class="card-title"><i class="fas fa-file-alt me-2"></i> Gerar Relatório</h6>
                                <div class="row g-3">
                                    <div class="col-md-3">
                                        <label class="form-label">Mês</label>
                                        <input type="month" id="relatorioMesSubstituicao" class="form-control">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">Data Início</label>
                                        <input type="date" id="relatorioDataInicioSubstituicao" class="form-control">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">Data Fim</label>
                                        <input type="date" id="relatorioDataFimSubstituicao" class="form-control">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">Turma</label>
                                        <select id="relatorioTurmaSubstituicao" class="form-select"><option value="">Todas</option></select>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">Motivo</label>
                                        <select id="relatorioMotivoSubstituicao" class="form-select">
                                            <option value="">Todos</option>
                                            <option value="falta_professor">Falta</option>
                                            <option value="licenca_medica">Licença Médica</option>
                                            <option value="licenca_maternidade_paternidade">Lic. Mat/Pater</option>
                                            <option value="capacitacao_formacao">Capacitação</option>
                                            <option value="reuniao_externa">Reunião</option>
                                            <option value="problema_pessoal">Pessoal</option>
                                            <option value="atestado">Atestado</option>
                                            <option value="sem_substituto">Sem Substituto</option>
                                            <option value="outros">Outros</option>
                                        </select>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">Substituto Ausente</label>
                                        <select id="relatorioSubstitutoAusenteSubstituicao" class="form-select">
                                            <option value="">Todos</option>
                                            <option value="false">Apenas com substituto</option>
                                            <option value="true">Apenas substituto ausente</option>
                                        </select>
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">&nbsp;</label>
                                        <button class="btn btn-primary w-100" onclick="setorPedagogico.gerarRelatorioSubstituicoes()">
                                            <i class="fas fa-search me-2"></i> Gerar
                                        </button>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">&nbsp;</label>
                                        <div class="btn-group w-100">
                                            <button class="btn btn-success" onclick="setorPedagogico.exportarCSVSubstituicoes()" id="btnExportarCSVSubstituicao" disabled>
                                                <i class="fas fa-file-csv me-1"></i> CSV
                                            </button>
                                            <button class="btn btn-danger" onclick="setorPedagogico.imprimirRelatorioSubstituicoes()" id="btnImprimirRelatorioSubstituicao" disabled>
                                                <i class="fas fa-print me-1"></i> PDF
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div id="resultadoRelatorioSubstituicoes">
                            <div class="text-center py-5">
                                <i class="fas fa-chart-line fa-3x text-muted mb-3"></i>
                                <p class="text-muted">Selecione os filtros e clique em Gerar</p>
                            </div>
                        </div>
                    </div>

                    <div class="tab-pane fade" id="sp-atrasos">
                        <div class="text-center py-5">
                            <div class="loading"></div>
                            <p class="mt-3 text-muted">Carregando módulo de atrasos...</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        setTimeout(async () => {
            const hoje = getDataLocalISO();
            const mesAtual = new Date().toISOString().substring(0, 7);

            const inputData = document.getElementById('inputDataSubstituicao');
            if (inputData) {
                inputData.value = hoje;
                this.substituicaoState.formData.data = hoje;
            }

            ['filtroMesSubstituicao', 'dashboardMesSubstituicao', 'relatorioMesSubstituicao'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = mesAtual;
            });

            // 🚀 TUDO EM PARALELO (não em cascata)
            await Promise.allSettled([
                this.carregarProfessoresSubstituicao(),
                this.carregarTurmasSubstituicao(),
                this.carregarListaSubstituicoes(),
                this.carregarDashboardSubstituicoes()
            ]);

            const buscaAusente = document.getElementById('buscaProfessorAusente');
            if (buscaAusente) {
                buscaAusente.addEventListener('input', (e) => {
                    this.filtrarProfessoresSubstituicao(e.target.value, 'listaProfessoresAusentes', 'ausente');
                });
            }

            const buscaSubstituto = document.getElementById('buscaProfessorSubstituto');
            if (buscaSubstituto) {
                buscaSubstituto.addEventListener('input', (e) => {
                    this.filtrarProfessoresSubstituicao(e.target.value, 'listaProfessoresSubstitutos', 'substituto');
                });
            }

            const selectTurma = document.getElementById('selectTurmaSubstituicao');
            if (selectTurma) {
                selectTurma.addEventListener('change', (e) => {
                    this.substituicaoState.formData.turma = e.target.value;
                });
            }

            const inputDataSub = document.getElementById('inputDataSubstituicao');
            if (inputDataSub) {
                inputDataSub.addEventListener('change', (e) => {
                    this.substituicaoState.formData.data = e.target.value;
                });
            }

            const selectMotivo = document.getElementById('selectMotivoSubstituicao');
            if (selectMotivo) {
                selectMotivo.addEventListener('change', (e) => {
                    this.substituicaoState.formData.motivo = e.target.value;
                });
            }

            const inputMotivoDet = document.getElementById('inputMotivoDetalhesSubstituicao');
            if (inputMotivoDet) {
                inputMotivoDet.addEventListener('input', (e) => {
                    this.substituicaoState.formData.motivoDetalhes = e.target.value;
                });
            }

            const inputObs = document.getElementById('inputObservacoesSubstituicao');
            if (inputObs) {
                inputObs.addEventListener('input', (e) => {
                    this.substituicaoState.formData.observacoes = e.target.value;
                });
            }

            this.atualizarHorarioPreenchimentoSubstituicao();

            // 🔥 CORREÇÃO CRÍTICA: limpa interval anterior antes de criar novo
            if (this._intervaloHorarioSubstituicao) {
                clearInterval(this._intervaloHorarioSubstituicao);
            }
            this._intervaloHorarioSubstituicao = setInterval(() => this.atualizarHorarioPreenchimentoSubstituicao(), 1000);

            document.getElementById('sp-dashboard-tab')?.addEventListener('shown.bs.tab', () => {
                this.carregarDashboardSubstituicoes();
            });

            document.getElementById('sp-atrasos-tab')?.addEventListener('shown.bs.tab', () => {
                this.carregarConteudoAtrasos();
            });

        }, 200);
    }

    async carregarProfessoresSubstituicao() {
        try {
            const response = await fetch('/api/substituicao-professor/professores', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();

            if (data.success) {
                this.substituicaoState.professores = data.professores;
                this.renderizarListaProfessoresSubstituicao(this.substituicaoState.professores, 'listaProfessoresAusentes', 'ausente');
                this.renderizarListaProfessoresSubstituicao(this.substituicaoState.professores, 'listaProfessoresSubstitutos', 'substituto');
            }
        } catch (error) {
            console.error('Erro ao carregar professores:', error);
        }
    }

    renderizarListaProfessoresSubstituicao(lista, containerId, tipo) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (lista.length === 0) {
            container.innerHTML = `<div class="empty-state"><i class="fas fa-user-slash"></i><p>Nenhum professor encontrado</p></div>`;
            return;
        }

        container.innerHTML = lista.map(p => `
            <div class="professor-item" data-id="${p.id}" data-tipo="${tipo}"
                 onclick="setorPedagogico.selecionarProfessorSubstituicao('${p.id}', '${tipo}')">
                <div class="professor-avatar">${(p.nome || '?').charAt(0).toUpperCase()}</div>
                <div class="professor-info">
                    <div class="professor-nome">${this.escapeHtml(p.nome)}</div>
                    <div class="professor-detalhes">
                        <span><i class="fas fa-envelope"></i> ${this.escapeHtml(p.email || 'Sem email')}</span>
                        <span><i class="fas fa-phone"></i> ${p.telefone || 'N/A'}</span>
                        <span><i class="fas fa-sitemap"></i> ${this.escapeHtml(p.eixo || 'Sem eixo')}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    filtrarProfessoresSubstituicao(termo, containerId, tipo) {
        const termoLower = (termo || '').toLowerCase();
        let filtrados = this.substituicaoState.professores;

        if (termoLower) {
            filtrados = filtrados.filter(p =>
                (p.nome || '').toLowerCase().includes(termoLower) ||
                (p.email || '').toLowerCase().includes(termoLower) ||
                (p.matricula || '').toLowerCase().includes(termoLower)
            );
        }

        if (tipo === 'substituto' && this.substituicaoState.formData.professorAusente) {
            filtrados = filtrados.filter(p => p.id !== this.substituicaoState.formData.professorAusente.id);
        }

        this.renderizarListaProfessoresSubstituicao(filtrados, containerId, tipo);
    }

    toggleSemSubstituto() {
        const check = document.getElementById('checkSemSubstituto');
        const campos = document.getElementById('camposSemSubstituto');
        const blocoMotivo = document.getElementById('blocoMotivoSubstituicao');

        if (check && campos) {
            if (check.checked) {
                campos.style.display = 'block';
                campos.style.opacity = '0';
                setTimeout(() => {
                    campos.style.transition = 'opacity 0.3s';
                    campos.style.opacity = '1';
                }, 10);

                if (blocoMotivo) blocoMotivo.style.display = 'none';
                const selectMotivo = document.getElementById('selectMotivoSubstituicao');
                if (selectMotivo) selectMotivo.value = '';
                const grupoDet = document.getElementById('grupoMotivoDetalhesSubstituicao');
                if (grupoDet) grupoDet.style.display = 'none';
                const inputDet = document.getElementById('inputMotivoDetalhesSubstituicao');
                if (inputDet) inputDet.value = '';

                this.substituicaoState.formData.professorSubstituto = null;
                document.querySelectorAll('#listaProfessoresSubstitutos .professor-item')
                    .forEach(el => el.classList.remove('selected'));

                document.getElementById('cardDetalhes').style.display = 'block';
                this.atualizarResumoSubstituicao();

                setTimeout(() => {
                    document.getElementById('cardDetalhes').scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            } else {
                campos.style.display = 'none';
                const selectMotivoSemSub = document.getElementById('selectMotivoSemSubstituto');
                const inputObsSemSub = document.getElementById('inputObservacoesSemSubstituto');
                if (selectMotivoSemSub) selectMotivoSemSub.value = '';
                if (inputObsSemSub) inputObsSemSub.value = '';

                if (blocoMotivo) blocoMotivo.style.display = 'block';

                if (!this.substituicaoState.formData.professorSubstituto) {
                    document.getElementById('cardDetalhes').style.display = 'none';
                }

                this.atualizarResumoSubstituicao();
            }
        }
    }

    selecionarProfessorSubstituicao(id, tipo) {
        const professor = this.substituicaoState.professores.find(p => p.id === id);
        if (!professor) return;

        if (tipo === 'ausente') {
            this.substituicaoState.formData.professorAusente = professor;
            document.querySelectorAll('#listaProfessoresAusentes .professor-item').forEach(el => {
                el.classList.toggle('selected', el.dataset.id === id);
            });

            this.substituicaoState.formData.professorSubstituto = null;
            const checkSemSub = document.getElementById('checkSemSubstituto');
            if (checkSemSub) checkSemSub.checked = false;
            const camposSemSub = document.getElementById('camposSemSubstituto');
            if (camposSemSub) camposSemSub.style.display = 'none';

            document.querySelectorAll('#listaProfessoresSubstitutos .professor-item').forEach(el => {
                el.classList.remove('selected');
            });

            document.getElementById('cardDetalhes').style.display = 'none';
            document.getElementById('cardProfessorSubstituto').style.display = 'block';
            this.atualizarResumoSubstituicao();

            const busca = document.getElementById('buscaProfessorSubstituto')?.value || '';
            this.filtrarProfessoresSubstituicao(busca, 'listaProfessoresSubstitutos', 'substituto');
            document.getElementById('cardProfessorSubstituto').scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            const checkSemSub = document.getElementById('checkSemSubstituto');
            if (checkSemSub && checkSemSub.checked) {
                checkSemSub.checked = false;
                const camposSemSub = document.getElementById('camposSemSubstituto');
                if (camposSemSub) camposSemSub.style.display = 'none';
                const selectMotivo = document.getElementById('selectMotivoSemSubstituto');
                if (selectMotivo) selectMotivo.value = '';
                const inputObs = document.getElementById('inputObservacoesSemSubstituto');
                if (inputObs) inputObs.value = '';
            }

            if (this.substituicaoState.formData.professorAusente && this.substituicaoState.formData.professorAusente.id === id) {
                this.showToast('O substituto deve ser diferente do ausente', 'warning');
                return;
            }

            this.substituicaoState.formData.professorSubstituto = professor;
            document.querySelectorAll('#listaProfessoresSubstitutos .professor-item').forEach(el => {
                el.classList.toggle('selected', el.dataset.id === id);
            });

            document.getElementById('cardDetalhes').style.display = 'block';
            this.atualizarResumoSubstituicao();
            document.getElementById('cardDetalhes').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    atualizarResumoSubstituicao() {
        const ausente = document.getElementById('resumoProfessorAusente');
        const substituto = document.getElementById('resumoProfessorSubstituto');
        if (ausente) ausente.textContent = this.substituicaoState.formData.professorAusente?.nome || '-';
        if (substituto) substituto.textContent = this.substituicaoState.formData.professorSubstituto?.nome || '-';
    }

    async carregarTurmasSubstituicao() {
        try {
            const response = await fetch('/api/substituicao-professor/turmas', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();

            if (data.success) {
                this.substituicaoState.turmas = data.turmas;
                const options = this.substituicaoState.turmas.map(t => `<option value="${this.escapeHtml(t)}">${this.escapeHtml(t)}</option>`).join('');

                const selectTurma = document.getElementById('selectTurmaSubstituicao');
                if (selectTurma) selectTurma.innerHTML = '<option value="">Selecione a turma...</option>' + options;

                const filtroTurma = document.getElementById('filtroTurmaSubstituicao');
                if (filtroTurma) filtroTurma.innerHTML = '<option value="">Todas as turmas</option>' + options;

                const relTurma = document.getElementById('relatorioTurmaSubstituicao');
                if (relTurma) relTurma.innerHTML = '<option value="">Todas as turmas</option>' + options;
            }
        } catch (error) {
            console.error('Erro ao carregar turmas:', error);
        }
    }

    toggleHorarioSubstituicao(horario) {
        if (!Array.isArray(this.substituicaoState.formData.horarios)) {
            this.substituicaoState.formData.horarios = [];
        }

        const lista = this.substituicaoState.formData.horarios;
        const idx = lista.indexOf(horario);

        if (idx >= 0) {
            lista.splice(idx, 1);
        } else {
            lista.push(horario);
        }

        lista.sort((a, b) => a - b);

        const input = document.getElementById('inputHorariosSubstituicao');
        if (input) input.value = lista.join(',');

        document.querySelectorAll('#horariosGridSubstituicao .horario-card').forEach(card => {
            const n = parseInt(card.dataset.horario);
            card.classList.toggle('selected', lista.includes(n));
        });

        this.substituicaoState.formData.horario = lista[0] || null;
    }

    atualizarMotivoDetalhesSubstituicao() {
        const motivo = document.getElementById('selectMotivoSubstituicao')?.value;
        const grupo = document.getElementById('grupoMotivoDetalhesSubstituicao');

        if (motivo === 'outros') {
            grupo?.style.setProperty('display', 'block');
        } else {
            grupo?.style.setProperty('display', 'none');
            const input = document.getElementById('inputMotivoDetalhesSubstituicao');
            if (input) input.value = '';
        }
    }

    toggleSubstitutoAusente() {
        const check = document.getElementById('checkSubstitutoAusente');
        const campos = document.getElementById('camposSubstitutoAusente');

        if (check && campos) {
            if (check.checked) {
                campos.style.display = 'block';
                campos.style.opacity = '0';
                setTimeout(() => {
                    campos.style.transition = 'opacity 0.3s';
                    campos.style.opacity = '1';
                }, 10);
            } else {
                campos.style.display = 'none';
                const selectMotivo = document.getElementById('selectMotivoSubstitutoAusente');
                const inputObs = document.getElementById('inputObservacoesSubstitutoAusente');
                if (selectMotivo) selectMotivo.value = '';
                if (inputObs) inputObs.value = '';
            }
        }
    }

    atualizarHorarioPreenchimentoSubstituicao() {
        const el = document.getElementById('horarioPreenchimentoSubstituicao');
        if (el) {
            el.textContent = new Date().toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
        }
    }

    async registrarSubstituicao() {
        const formData = this.substituicaoState.formData;

        const inputData = document.getElementById('inputDataSubstituicao');
        const valorData = inputData?.value || formData.data || '';

        const selectTurma = document.getElementById('selectTurmaSubstituicao');
        const valorTurma = selectTurma?.value || formData.turma || '';

        const listaHorarios = Array.isArray(formData.horarios) ? formData.horarios : [];

        const selectMotivo = document.getElementById('selectMotivoSubstituicao');
        const valorMotivo = selectMotivo?.value || formData.motivo || '';

        const inputDetalhes = document.getElementById('inputMotivoDetalhesSubstituicao');
        const valorDetalhes = inputDetalhes?.value || formData.motivoDetalhes || '';

        const inputObs = document.getElementById('inputObservacoesSubstituicao');
        const valorObs = inputObs?.value || formData.observacoes || '';

        const semSubstituto = document.getElementById('checkSemSubstituto')?.checked || false;
        const substitutoAusenteMotivo = semSubstituto
            ? (document.getElementById('selectMotivoSemSubstituto')?.value || '')
            : '';
        const substitutoAusenteObservacoes = semSubstituto
            ? (document.getElementById('inputObservacoesSemSubstituto')?.value || '')
            : '';

        this.substituicaoState.formData.data = valorData;
        this.substituicaoState.formData.turma = valorTurma;
        this.substituicaoState.formData.horarios = listaHorarios;
        this.substituicaoState.formData.motivo = valorMotivo;
        this.substituicaoState.formData.motivoDetalhes = valorDetalhes;
        this.substituicaoState.formData.observacoes = valorObs;

        if (!formData.professorAusente) {
            this.showToast('⚠️ Selecione o professor ausente', 'warning');
            return;
        }

        if (!semSubstituto && !formData.professorSubstituto) {
            this.showToast('⚠️ Selecione o professor substituto ou marque "Não há substituto disponível"', 'warning');
            return;
        }

        if (semSubstituto && !substitutoAusenteMotivo) {
            this.showToast('⚠️ Selecione o motivo da ausência do substituto', 'warning');
            return;
        }

        if (!valorTurma) {
            this.showToast('⚠️ Selecione a turma', 'warning');
            return;
        }

        if (!valorData) {
            this.showToast('⚠️ Informe a data', 'warning');
            return;
        }

        if (listaHorarios.length === 0) {
            this.showToast('⚠️ Selecione pelo menos um horário', 'warning');
            return;
        }

        if (!semSubstituto) {
            if (!valorMotivo) {
                this.showToast('⚠️ Selecione o motivo', 'warning');
                return;
            }
            if (valorMotivo === 'outros' && !valorDetalhes) {
                this.showToast('⚠️ Especifique o motivo', 'warning');
                return;
            }
        }

        const btn = document.getElementById('btnRegistrarSubstituicao');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Registrando...';
        }

        try {
            const payload = {
                professorAusenteId: formData.professorAusente.id,
                turma: valorTurma,
                horarios: listaHorarios,
                data: valorData,
                observacoes: valorObs,
                substitutoAusente: semSubstituto,
                substitutoAusenteMotivo: semSubstituto ? substitutoAusenteMotivo : '',
                substitutoAusenteObservacoes: semSubstituto ? substitutoAusenteObservacoes : ''
            };

            if (!semSubstituto) {
                payload.professorSubstitutoId = formData.professorSubstituto.id;
                payload.motivo = valorMotivo;
                payload.motivoDetalhes = valorDetalhes;
            }

            const response = await fetch('/api/substituicao-professor/registrar', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('✅ Substituição registrada!', 'success');
                this.resetarFormularioSubstituicao();
                await this.carregarListaSubstituicoes();
                await this.carregarDashboardSubstituicoes();

                const listaTab = document.getElementById('sp-lista-tab');
                if (listaTab) new bootstrap.Tab(listaTab).show();
            } else {
                throw new Error(data.error || 'Erro ao registrar');
            }
        } catch (error) {
            console.error('Erro:', error);
            this.showToast(error.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save me-2"></i> Registrar Substituição';
            }
        }
    }

    resetarFormularioSubstituicao() {
        const hoje = getDataLocalISO();
        this.substituicaoState.formData = {
            professorAusente: null,
            professorSubstituto: null,
            turma: '',
            data: hoje,
            horarios: [],
            horario: null,
            motivo: '',
            motivoDetalhes: '',
            observacoes: '',
            substitutoAusente: false,
            substitutoAusenteMotivo: '',
            substitutoAusenteObservacoes: ''
        };

        const inputData = document.getElementById('inputDataSubstituicao');
        if (inputData) inputData.value = hoje;

        const selectTurma = document.getElementById('selectTurmaSubstituicao');
        if (selectTurma) selectTurma.value = '';

        const selectMotivo = document.getElementById('selectMotivoSubstituicao');
        if (selectMotivo) selectMotivo.value = '';

        const inputDetalhes = document.getElementById('inputMotivoDetalhesSubstituicao');
        if (inputDetalhes) inputDetalhes.value = '';

        const inputObs = document.getElementById('inputObservacoesSubstituicao');
        if (inputObs) inputObs.value = '';

        const inputHorarios = document.getElementById('inputHorariosSubstituicao');
        if (inputHorarios) inputHorarios.value = '';

        const checkSemSub = document.getElementById('checkSemSubstituto');
        if (checkSemSub) checkSemSub.checked = false;

        const camposSemSub = document.getElementById('camposSemSubstituto');
        if (camposSemSub) camposSemSub.style.display = 'none';

        const selectMotivoSemSub = document.getElementById('selectMotivoSemSubstituto');
        if (selectMotivoSemSub) selectMotivoSemSub.value = '';

        const inputObsSemSub = document.getElementById('inputObservacoesSemSubstituto');
        if (inputObsSemSub) inputObsSemSub.value = '';

        const blocoMotivo = document.getElementById('blocoMotivoSubstituicao');
        if (blocoMotivo) blocoMotivo.style.display = 'block';

        const grupoDet = document.getElementById('grupoMotivoDetalhesSubstituicao');
        if (grupoDet) grupoDet.style.display = 'none';

        document.querySelectorAll('.professor-item').forEach(el => el.classList.remove('selected'));
        document.querySelectorAll('.horario-card').forEach(el => el.classList.remove('selected'));

        const cardSub = document.getElementById('cardProfessorSubstituto');
        if (cardSub) cardSub.style.display = 'none';

        const cardDet = document.getElementById('cardDetalhes');
        if (cardDet) cardDet.style.display = 'none';

        const buscaAusente = document.getElementById('buscaProfessorAusente');
        if (buscaAusente) buscaAusente.value = '';

        const buscaSubstituto = document.getElementById('buscaProfessorSubstituto');
        if (buscaSubstituto) buscaSubstituto.value = '';

        this.renderizarListaProfessoresSubstituicao(this.substituicaoState.professores, 'listaProfessoresAusentes', 'ausente');
        this.renderizarListaProfessoresSubstituicao(this.substituicaoState.professores, 'listaProfessoresSubstitutos', 'substituto');

        this.atualizarResumoSubstituicao();
    }

    async carregarListaSubstituicoes() {
        const container = document.getElementById('listaSubstituicoes');
        if (!container) return;

        container.innerHTML = '<div class="text-center py-3"><div class="loading"></div><p>Carregando...</p></div>';

        try {
            const params = new URLSearchParams();
            const mes = document.getElementById('filtroMesSubstituicao')?.value;
            const busca = document.getElementById('filtroBuscaSubstituicao')?.value;
            const turma = document.getElementById('filtroTurmaSubstituicao')?.value;
            const motivo = document.getElementById('filtroMotivoSubstituicao')?.value;

            if (mes) params.append('mes', mes);
            if (busca) params.append('busca', busca);
            if (turma) params.append('turma', turma);
            if (motivo) params.append('motivo', motivo);

            const response = await fetch(`/api/substituicao-professor/listar?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();

            if (data.success) {
                this.substituicaoState.substituicoes = data.substituicoes;
                this.renderizarListaSubstituicoes(data.substituicoes);

                const contador = document.getElementById('contadorListaSubstituicoes');
                if (contador) contador.textContent = `${data.total} registro${data.total !== 1 ? 's' : ''}`;

                const badge = document.getElementById('badgeTotalSubstituicoes');
                if (badge) badge.textContent = data.total;
            }
        } catch (error) {
            console.error('Erro:', error);
            container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar</p></div>';
        }
    }

    renderizarListaSubstituicoes(lista) {
        const container = document.getElementById('listaSubstituicoes');
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

        const MOTIVOS_LABELS = {
            'falta_professor': 'Falta do Professor',
            'licenca_medica': 'Licença Médica',
            'licenca_maternidade_paternidade': 'Licença Mat/Pater',
            'capacitacao_formacao': 'Capacitação/Formação',
            'reuniao_externa': 'Reunião Externa',
            'problema_pessoal': 'Problema Pessoal',
            'atestado': 'Atestado',
            'outros': 'Outros',
            'sem_substituto': 'Sem Substituto'
        };

        const MOTIVOS_CORES = {
            'falta_professor': '#ef4444',
            'licenca_medica': '#f59e0b',
            'licenca_maternidade_paternidade': '#8b5cf6',
            'capacitacao_formacao': '#3b82f6',
            'reuniao_externa': '#10b981',
            'problema_pessoal': '#f97316',
            'atestado': '#6b7280',
            'sem_substituto': '#dc2626',
            'outros': '#64748b'
        };

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Horário(s)</th>
                            <th>Professor Ausente</th>
                            <th>Professor Substituto</th>
                            <th>Turma</th>
                            <th>Motivo</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lista.map(s => {
                            const badgeSubstitutoAusente = s.substitutoAusente
                                ? `<span class="badge-custom" style="background: #fee2e2; color: #dc2626; margin-left: 5px;">
                                    <i class="fas fa-user-slash"></i> Substituto Ausente
                                </span>`
                                : '';

                            const horariosList = (s.horarios && s.horarios.length > 0)
                                ? s.horarios
                                : (s.horario ? [s.horario] : []);

                            const horariosHTML = horariosList.length > 0
                                ? horariosList.map(h => `<span class="badge-custom badge-primary" style="margin-right:3px;">${h}º</span>`).join('')
                                : '<span class="text-muted">-</span>';

                            return `
                            <tr ${s.substitutoAusente ? 'style="background: #fef2f2;"' : ''}>
                                <td>
                                    <strong>${s.dataFormatada}</strong>
                                    <br><small style="color:#6b7280;">${s.diaSemana}</small>
                                </td>
                                <td>${horariosHTML}</td>
                                <td>
                                    <strong>${this.escapeHtml(s.professorAusente.nome)}</strong>
                                    <br><small style="color:#6b7280;">${this.escapeHtml(s.professorAusente.eixo || '')}</small>
                                </td>
                                <td>
                                    <strong>${this.escapeHtml(s.professorSubstituto.nome)}</strong>
                                    ${badgeSubstitutoAusente}
                                    <br><small style="color:#6b7280;">${this.escapeHtml(s.professorSubstituto.eixo || '')}</small>
                                </td>
                                <td><span class="badge-custom badge-gray">${this.escapeHtml(s.turma)}</span></td>
                                <td>
                                    <span class="badge-custom" style="background:${(MOTIVOS_CORES[s.motivo] || '#64748b')}20; color:${MOTIVOS_CORES[s.motivo] || '#64748b'};">
                                        ${MOTIVOS_LABELS[s.motivo] || s.motivo}
                                    </span>
                                </td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn-action btn-view" onclick="setorPedagogico.verDetalhesSubstituicao('${s.id}')" title="Ver">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn-action btn-edit" onclick="setorPedagogico.abrirEdicaoSubstituicao('${s.id}')" title="Editar">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn-action btn-print" onclick="setorPedagogico.imprimirSubstituicao('${s.id}')" title="Imprimir">
                                            <i class="fas fa-print"></i>
                                        </button>
                                        <button class="btn-action btn-delete" onclick="setorPedagogico.excluirSubstituicao('${s.id}')" title="Excluir">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    limparFiltrosSubstituicao() {
        const mes = document.getElementById('filtroMesSubstituicao');
        if (mes) mes.value = new Date().toISOString().substring(0, 7);

        const busca = document.getElementById('filtroBuscaSubstituicao');
        if (busca) busca.value = '';

        const turma = document.getElementById('filtroTurmaSubstituicao');
        if (turma) turma.value = '';

        const motivo = document.getElementById('filtroMotivoSubstituicao');
        if (motivo) motivo.value = '';

        this.carregarListaSubstituicoes();
    }

    async verDetalhesSubstituicao(id) {
        try {
            const response = await fetch(`/api/substituicao-professor/${id}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();

            if (!data.success) { this.showToast('Não encontrada', 'error'); return; }

            const s = data.substituicao;
            this.substituicaoState.substituicaoParaImprimir = s;

            const MOTIVOS_LABELS = {
                'falta_professor': 'Falta do Professor',
                'licenca_medica': 'Licença Médica',
                'licenca_maternidade_paternidade': 'Licença Maternidade/Paternidade',
                'capacitacao_formacao': 'Capacitação/Formação',
                'reuniao_externa': 'Reunião Externa',
                'problema_pessoal': 'Problema Pessoal',
                'atestado': 'Atestado',
                'outros': 'Outros'
            };

            const SUBSTITUTO_MOTIVOS = {
                'falta_substituto': 'Falta do Substituto',
                'atestado_substituto': 'Atestado Médico',
                'emergencia': 'Emergência',
                'conflito_horario': 'Conflito de Horário',
                'outros': 'Outros'
            };

            const alertaSubstitutoAusente = s.substitutoAusente ? `
                <div style="background: #fef2f2; border: 2px solid #fecaca; padding: 15px; border-radius: 12px; margin-top: 20px;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                        <i class="fas fa-user-slash" style="color: #dc2626; font-size: 20px;"></i>
                        <strong style="color: #dc2626; font-size: 1.05rem;">Atenção: Professor Substituto Ausente</strong>
                    </div>
                    ${s.substitutoAusenteMotivo ? `<p style="margin: 5px 0; color: #991b1b;"><strong>Motivo:</strong> ${SUBSTITUTO_MOTIVOS[s.substitutoAusenteMotivo] || s.substitutoAusenteMotivo}</p>` : ''}
                    ${s.substitutoAusenteObservacoes ? `<p style="margin: 5px 0; color: #991b1b;"><strong>Obs:</strong> ${this.escapeHtml(s.substitutoAusenteObservacoes)}</p>` : ''}
                </div>
            ` : '';

            const modalHtml = `
                <div class="modal fade" id="modalDetalhesSp" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header" style="background: linear-gradient(135deg, #1e3c72, #2a5298); color: white;">
                                <h5 class="modal-title"><i class="fas fa-eye me-2"></i> Detalhes da Substituição</h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 15px; align-items: center; background: #f0f4ff; padding: 20px; border-radius: 12px;">
                                    <div style="text-align: center;">
                                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">AUSENTE</div>
                                        <div style="font-weight: 700; font-size: 16px;">${this.escapeHtml(s.professorAusenteNome)}</div>
                                        <div style="font-size: 12px; color: #6b7280; margin-top: 5px;">${this.escapeHtml(s.professorAusenteEmail || '')}</div>
                                    </div>
                                    <div style="font-size: 24px; color: #1e3c72;"><i class="fas fa-arrow-right"></i></div>
                                    <div style="text-align: center;">
                                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">SUBSTITUTO</div>
                                        <div style="font-weight: 700; font-size: 16px;">${this.escapeHtml(s.professorSubstitutoNome)}</div>
                                        <div style="font-size: 12px; color: #6b7280; margin-top: 5px;">${this.escapeHtml(s.professorSubstitutoEmail || '')}</div>
                                    </div>
                                </div>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 20px;">
                                    <div><strong>Turma:</strong> ${this.escapeHtml(s.turma)}</div>
                                    <div><strong>Horário(s):</strong> ${(s.horarios && s.horarios.length > 0 ? s.horarios : (s.horario ? [s.horario] : [])).map(h => `${h}º`).join(', ') || '-'}</div>
                                    <div><strong>Data:</strong> ${new Date(s.data + 'T12:00:00').toLocaleDateString('pt-BR')} (${s.diaSemana})</div>
                                    <div><strong>Motivo:</strong> ${MOTIVOS_LABELS[s.motivo] || s.motivo}</div>
                                </div>
                                ${s.observacoes ? `<div style="margin-top: 15px; background: #f9fafb; padding: 15px; border-radius: 10px;"><strong>Observações:</strong><br>${this.escapeHtml(s.observacoes)}</div>` : ''}
                                ${alertaSubstitutoAusente}
                                <div style="background: #f0fdf4; padding: 15px; border-radius: 10px; margin-top: 20px; font-size: 13px;">
                                    <i class="fas fa-user-check" style="color: #10b981;"></i>
                                    Registrado por <strong>${this.escapeHtml(s.registradoPorNome)}</strong> em ${new Date(s.registradoEm).toLocaleString('pt-BR')}
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                                <button class="btn btn-primary" onclick="setorPedagogico.imprimirSubstituicaoAtual()">
                                    <i class="fas fa-print me-2"></i> Imprimir
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const oldModal = document.getElementById('modalDetalhesSp');
            if (oldModal) oldModal.remove();

            document.body.insertAdjacentHTML('beforeend', modalHtml);
            new bootstrap.Modal(document.getElementById('modalDetalhesSp')).show();
        } catch (error) {
            console.error('Erro:', error);
            this.showToast('Erro ao carregar detalhes', 'error');
        }
    }

    async abrirEdicaoSubstituicao(id) {
        try {
            const response = await fetch(`/api/substituicao-professor/${id}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();

            if (!data.success) return;

            const s = data.substituicao;
            this.substituicaoState.editandoId = id;

            const turmasOptions = this.substituicaoState.turmas.map(t =>
                `<option value="${this.escapeHtml(t)}" ${t === s.turma ? 'selected' : ''}>${this.escapeHtml(t)}</option>`
            ).join('');

            const MOTIVOS_LABELS = {
                'falta_professor': 'Falta do Professor',
                'licenca_medica': 'Licença Médica',
                'licenca_maternidade_paternidade': 'Licença Maternidade/Paternidade',
                'capacitacao_formacao': 'Capacitação/Formação',
                'reuniao_externa': 'Reunião Externa',
                'problema_pessoal': 'Problema Pessoal',
                'atestado': 'Atestado',
                'outros': 'Outros',
                'sem_substituto': 'Sem Substituto'
            };

            const motivosOptions = Object.entries(MOTIVOS_LABELS).map(([key, label]) =>
                `<option value="${key}" ${s.motivo === key ? 'selected' : ''}>${label}</option>`
            ).join('');

            const horariosAtuais = (s.horarios && s.horarios.length > 0)
                ? s.horarios
                : (s.horario ? [s.horario] : []);

            let horariosHTML = '';
            for (let i = 1; i <= 9; i++) {
                const selected = horariosAtuais.includes(i);
                horariosHTML += `
                    <div class="horario-card ${selected ? 'selected' : ''}"
                        data-horario="${i}"
                        onclick="setorPedagogico.toggleHorarioEdicaoSubstituicao(${i})">
                        <div class="horario-numero">${i}º</div>
                        <div class="horario-label">Horário</div>
                    </div>
                `;
            }

            const SUBSTITUTO_MOTIVOS = {
                'falta_substituto': 'Falta do Substituto',
                'atestado_substituto': 'Atestado Médico',
                'emergencia': 'Emergência',
                'conflito_horario': 'Conflito de Horário',
                'outros': 'Outros'
            };

            const substitutoMotivosOptions = Object.entries(SUBSTITUTO_MOTIVOS).map(([key, label]) =>
                `<option value="${key}" ${s.substitutoAusenteMotivo === key ? 'selected' : ''}>${label}</option>`
            ).join('');

            const modalHtml = `
                <div class="modal fade" id="modalEditarSp" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white;">
                                <h5 class="modal-title"><i class="fas fa-edit me-2"></i> Editar Substituição</h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="row g-3">
                                    <div class="col-md-6">
                                        <label class="form-label">Turma</label>
                                        <select id="editTurmaSp" class="form-select">${turmasOptions}</select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">Data</label>
                                        <input type="date" id="editDataSp" class="form-control" value="${s.data}">
                                    </div>
                                </div>
                                <div class="mt-3">
                                    <label class="form-label">Horário(s)</label>
                                    <div class="horarios-grid" id="editHorariosGrid">${horariosHTML}</div>
                                    <input type="hidden" id="editHorariosSp" value="${horariosAtuais.join(',')}">
                                    <small class="text-muted d-block mt-2">
                                        <i class="fas fa-info-circle"></i> Clique em vários para selecionar horários consecutivos.
                                    </small>
                                </div>
                                <div class="row g-3 mt-3">
                                    <div class="col-md-6">
                                        <label class="form-label">Motivo</label>
                                        <select id="editMotivoSp" class="form-select">${motivosOptions}</select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">Detalhes</label>
                                        <input type="text" id="editMotivoDetalhesSp" class="form-control" value="${this.escapeHtml(s.motivoDetalhes || '')}">
                                    </div>
                                </div>

                                <div class="mt-3">
                                    <div style="background: #fef2f2; border: 2px solid #fecaca; border-radius: 12px; padding: 15px;">
                                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                            <input type="checkbox" id="editSubstitutoAusente"
                                                ${s.substitutoAusente ? 'checked' : ''}
                                                onchange="document.getElementById('editCamposSubstitutoAusente').style.display = this.checked ? 'block' : 'none'"
                                                style="width: 22px; height: 22px; accent-color: #dc2626;">
                                            <div>
                                                <strong style="color: #dc2626;">
                                                    <i class="fas fa-user-slash"></i> Professor substituto ausente
                                                </strong>
                                                <p style="margin: 5px 0 0; font-size: 0.85rem; color: #991b1b;">
                                                    Marque se o substituto também não compareceu
                                                </p>
                                            </div>
                                        </label>
                                        <div id="editCamposSubstitutoAusente" style="display: ${s.substitutoAusente ? 'block' : 'none'}; margin-top: 15px; padding-top: 15px; border-top: 1px solid #fecaca;">
                                            <div class="mb-2">
                                                <label class="form-label" style="color: #991b1b;">Motivo da Ausência</label>
                                                <select id="editMotivoSubstitutoAusente" class="form-select" style="border-color: #fecaca;">
                                                    <option value="">Selecione...</option>
                                                    ${substitutoMotivosOptions}
                                                </select>
                                            </div>
                                            <div>
                                                <label class="form-label" style="color: #991b1b;">Observações</label>
                                                <textarea id="editObsSubstitutoAusente" class="form-control" rows="2" style="border-color: #fecaca;">${this.escapeHtml(s.substitutoAusenteObservacoes || '')}</textarea>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div class="mt-3">
                                    <label class="form-label">Observações</label>
                                    <textarea id="editObservacoesSp" class="form-control" rows="3">${this.escapeHtml(s.observacoes || '')}</textarea>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                                <button class="btn btn-primary" onclick="setorPedagogico.salvarEdicaoSubstituicao()">
                                    <i class="fas fa-save me-2"></i> Salvar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const oldModal = document.getElementById('modalEditarSp');
            if (oldModal) oldModal.remove();

            document.body.insertAdjacentHTML('beforeend', modalHtml);
            new bootstrap.Modal(document.getElementById('modalEditarSp')).show();
        } catch (error) {
            console.error('Erro:', error);
        }
    }

    toggleHorarioEdicaoSubstituicao(horario) {
        const input = document.getElementById('editHorariosSp');
        if (!input) return;

        let lista = input.value
            ? input.value.split(',').map(n => parseInt(n)).filter(n => !isNaN(n) && n >= 1 && n <= 9)
            : [];

        const idx = lista.indexOf(horario);
        if (idx >= 0) {
            lista.splice(idx, 1);
        } else {
            lista.push(horario);
        }

        lista.sort((a, b) => a - b);
        input.value = lista.join(',');

        document.querySelectorAll('#editHorariosGrid .horario-card').forEach(card => {
            const n = parseInt(card.dataset.horario);
            card.classList.toggle('selected', lista.includes(n));
        });
    }

    async salvarEdicaoSubstituicao() {
        if (!this.substituicaoState.editandoId) return;

        const substitutoAusente = document.getElementById('editSubstitutoAusente')?.checked || false;
        const substitutoAusenteMotivo = substitutoAusente
            ? (document.getElementById('editMotivoSubstitutoAusente')?.value || '')
            : '';
        const substitutoAusenteObservacoes = substitutoAusente
            ? (document.getElementById('editObsSubstitutoAusente')?.value || '')
            : '';

        if (substitutoAusente && !substitutoAusenteMotivo) {
            this.showToast('⚠️ Selecione o motivo da ausência do substituto', 'warning');
            return;
        }

        const inputHorarios = document.getElementById('editHorariosSp');
        const horarios = inputHorarios?.value
            ? inputHorarios.value.split(',').map(n => parseInt(n)).filter(n => !isNaN(n) && n >= 1 && n <= 9)
            : [];

        if (horarios.length === 0) {
            this.showToast('⚠️ Selecione pelo menos um horário', 'warning');
            return;
        }

        const dados = {
            turma: document.getElementById('editTurmaSp').value,
            data: document.getElementById('editDataSp').value,
            horarios: horarios,
            motivo: document.getElementById('editMotivoSp').value,
            motivoDetalhes: document.getElementById('editMotivoDetalhesSp').value,
            observacoes: document.getElementById('editObservacoesSp').value,
            substitutoAusente,
            substitutoAusenteMotivo,
            substitutoAusenteObservacoes
        };

        try {
            const response = await fetch(`/api/substituicao-professor/${this.substituicaoState.editandoId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dados)
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('✅ Atualizada!', 'success');
                bootstrap.Modal.getInstance(document.getElementById('modalEditarSp'))?.hide();
                await this.carregarListaSubstituicoes();
                await this.carregarDashboardSubstituicoes();
            }
        } catch (error) {
            this.showToast('Erro ao atualizar', 'error');
        }
    }

    async excluirSubstituicao(id) {
        const confirmar = await this.confirmarAcao('⚠️ Tem certeza que deseja excluir?\n\nEsta ação não pode ser desfeita.');
        if (!confirmar) return;

        try {
            const response = await fetch(`/api/substituicao-professor/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('✅ Excluída!', 'success');
                await this.carregarListaSubstituicoes();
                await this.carregarDashboardSubstituicoes();
            }
        } catch (error) {
            this.showToast('Erro ao excluir', 'error');
        }
    }

    async imprimirSubstituicao(id) {
        try {
            const response = await fetch(`/api/substituicao-professor/${id}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();
            if (data.success) this.gerarImpressaoSubstituicao(data.substituicao);
        } catch (error) {
            this.showToast('Erro ao imprimir', 'error');
        }
    }

    imprimirSubstituicaoAtual() {
        if (this.substituicaoState.substituicaoParaImprimir) {
            this.gerarImpressaoSubstituicao(this.substituicaoState.substituicaoParaImprimir);
        }
    }

    gerarImpressaoSubstituicao(s) {
        const MOTIVOS_LABELS = {
            'falta_professor': 'Falta do Professor',
            'licenca_medica': 'Licença Médica',
            'licenca_maternidade_paternidade': 'Licença Maternidade/Paternidade',
            'capacitacao_formacao': 'Capacitação/Formação',
            'reuniao_externa': 'Reunião Externa',
            'problema_pessoal': 'Problema Pessoal',
            'atestado': 'Atestado',
            'outros': 'Outros'
        };

        const SUBSTITUTO_MOTIVOS = {
            'falta_substituto': 'Falta do Substituto',
            'atestado_substituto': 'Atestado Médico',
            'emergencia': 'Emergência',
            'conflito_horario': 'Conflito de Horário',
            'outros': 'Outros'
        };

        const dataExt = new Date(s.data + 'T12:00:00').toLocaleDateString('pt-BR', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });

        const alertaSubstitutoAusenteImpressao = s.substitutoAusente ? `
            <div style="margin-top: 15px; padding: 12px; background: #fef2f2; border: 2px solid #fecaca; border-radius: 8px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <span style="font-size: 16pt; color: #dc2626;">⚠️</span>
                    <strong style="color: #dc2626; font-size: 11pt; text-transform: uppercase;">ATENÇÃO: Professor Substituto Ausente</strong>
                </div>
                ${s.substitutoAusenteMotivo ? `<p style="margin: 4px 0; color: #991b1b; font-size: 10pt;"><strong>Motivo:</strong> ${SUBSTITUTO_MOTIVOS[s.substitutoAusenteMotivo] || s.substitutoAusenteMotivo}</p>` : ''}
                ${s.substitutoAusenteObservacoes ? `<p style="margin: 4px 0; color: #991b1b; font-size: 10pt;"><strong>Observações:</strong> ${s.substitutoAusenteObservacoes}</p>` : ''}
            </div>
        ` : '';

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
                ${alertaSubstitutoAusenteImpressao}
                <div class="section-title">📚 Informações da Aula</div>
                <div class="info-grid">
                    <div class="info-item"><div class="info-label">Turma:</div><div class="info-value">${s.turma}</div></div>
                    <div class="info-item">
                        <div class="info-label">Horário(s):</div>
                        <div class="info-value">
                            ${(s.horarios && s.horarios.length > 0 ? s.horarios : (s.horario ? [s.horario] : [])).map(h => `${h}º`).join(', ') || '-'}
                        </div>
                    </div>
                    <div class="info-item"><div class="info-label">Data:</div><div class="info-value">${dataExt}</div></div>
                    <div class="info-item"><div class="info-label">Dia da Semana:</div><div class="info-value">${s.diaSemana}</div></div>
                </div>
                <div class="section-title">📝 Motivo</div>
                <div class="info-item"><div class="info-value"><strong>${MOTIVOS_LABELS[s.motivo] || s.motivo}</strong></div></div>
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
                    <p>Documento gerado automaticamente pelo EducaPleno</p>
                </div>
            </body>
            </html>
        `;

        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    }

    async carregarDashboardSubstituicoes() {
        try {
            const mes = document.getElementById('dashboardMesSubstituicao')?.value || new Date().toISOString().substring(0, 7);

            const response = await fetch(`/api/substituicao-professor/dashboard/resumo?mes=${mes}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();

            if (!data.success) return;

            const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            setVal('spStatTotalMes', data.resumo.totalMes || 0);
            setVal('spStatProfessoresAusentes', data.professoresMaisAusentes.length || 0);
            setVal('spStatProfessoresSubstitutos', data.professoresMaisSubstituiram.length || 0);
            setVal('spStatSubstitutosAusentes', data.resumo.totalSubstitutosAusentes || 0);

            this.renderizarGraficosSubstituicoes(data, mes);
            this.renderizarRankingsSubstituicoes(data);
            this.renderizarUltimasSubstituicoes(data.ultimasSubstituicoes);
        } catch (error) {
            console.error('Erro no dashboard:', error);
        }
    }

    // ============================================================================
    // 🔥 GERENCIAMENTO DE PROFESSORES (CRUD)
    // ============================================================================
    async abrirGerenciarProfessores() {
        const antigo = document.getElementById('modalGerenciarProfessores');
        if (antigo) antigo.remove();

        const modalHtml = `
            <div class="modal fade" id="modalGerenciarProfessores" tabindex="-1" data-bs-backdrop="static">
                <div class="modal-dialog modal-xl modal-dialog-scrollable modal-dialog-centered">
                    <div class="modal-content" style="border-radius: 16px; overflow: hidden; border: none; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">

                        <div class="modal-header" style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: white; border: none; padding: 22px 28px;">
                            <div style="display: flex; align-items: center; gap: 14px;">
                                <div style="width: 46px; height: 46px; background: rgba(255,255,255,0.15); border-radius: 12px; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(10px);">
                                    <i class="fas fa-users-cog" style="font-size: 22px;"></i>
                                </div>
                                <div>
                                    <h5 class="modal-title mb-0" style="font-weight: 700; letter-spacing: 0.3px;">Gerenciar Professores</h5>
                                    <small style="opacity: 0.85; font-size: 13px;">Cadastre, edite e gerencie o corpo docente</small>
                                </div>
                            </div>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>

                        <div style="background: #f8fafc; border-bottom: 1px solid #e5e7eb; padding: 18px 28px;">
                            <div style="display: flex; gap: 12px; margin-bottom: 14px; flex-wrap: wrap;">
                                <div style="flex: 1; min-width: 240px; position: relative;">
                                    <i class="fas fa-search" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: #9ca3af; font-size: 14px;"></i>
                                    <input type="text" id="buscaGerenciarProfessores"
                                        placeholder="Buscar por nome, email ou matrícula..."
                                        style="width: 100%; padding: 11px 16px 11px 44px; border: 2px solid #e5e7eb; border-radius: 10px; font-size: 14px; outline: none; transition: all 0.2s; background: white;">
                                </div>
                                <button class="btn" onclick="setorPedagogico.abrirFormProfessor()"
                                        style="background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; padding: 11px 22px; border-radius: 10px; font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(16,185,129,0.3); transition: all 0.2s; white-space: nowrap;">
                                    <i class="fas fa-plus"></i> Novo Professor
                                </button>
                            </div>

                            <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
                                <span style="font-size: 13px; color: #64748b; font-weight: 600; margin-right: 4px;">
                                    <i class="fas fa-filter"></i> Filtros:
                                </span>

                                <select id="filtroStatusProfessor" class="form-select form-select-sm"
                                        style="width: auto; min-width: 140px; padding: 8px 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 13px; background: white;">
                                    <option value="todos">Todos os status</option>
                                    <option value="ativo">✓ Ativos</option>
                                    <option value="inativo">✗ Inativos</option>
                                </select>

                                <select id="filtroEixoProfessor" class="form-select form-select-sm"
                                        style="width: auto; min-width: 160px; padding: 8px 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 13px; background: white;">
                                    <option value="todos">Todos os eixos</option>
                                </select>

                                <select id="ordenacaoProfessor" class="form-select form-select-sm"
                                        style="width: auto; min-width: 160px; padding: 8px 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 13px; background: white;">
                                    <option value="nome_asc">Nome (A-Z)</option>
                                    <option value="nome_desc">Nome (Z-A)</option>
                                    <option value="recente">Mais recentes</option>
                                    <option value="antigo">Mais antigos</option>
                                </select>

                                <button class="btn btn-sm" onclick="setorPedagogico.limparFiltrosProfessores()"
                                        style="background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 7px 14px; font-size: 13px; color: #64748b; font-weight: 600;">
                                    <i class="fas fa-eraser"></i> Limpar
                                </button>
                            </div>
                        </div>

                        <div style="padding: 12px 28px; background: white; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
                            <small style="color: #64748b; font-size: 13px; font-weight: 500;" id="contadorProfessoresGerenciar">
                                <i class="fas fa-spinner fa-spin"></i> Carregando...
                            </small>
                        </div>

                        <div class="modal-body" style="padding: 20px 28px; background: #f8fafc; max-height: 55vh; overflow-y: auto;">
                            <div id="listaGerenciarProfessores">
                                <div class="text-center py-5">
                                    <div class="loading-spinner"></div>
                                    <p class="text-muted mt-2">Carregando professores...</p>
                                </div>
                            </div>
                        </div>

                        <div class="modal-footer" style="border-top: 1px solid #e5e7eb; padding: 16px 28px; background: white;">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"
                                    style="padding: 10px 22px; border-radius: 10px; font-weight: 600;">
                                <i class="fas fa-times me-2"></i> Fechar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.modalGerenciarInstance = new bootstrap.Modal(document.getElementById('modalGerenciarProfessores'));
        this.modalGerenciarInstance.show();

        await this.carregarProfessoresGerenciar();
        await this.popularFiltroEixosProfessores();

        const buscaInput = document.getElementById('buscaGerenciarProfessores');
        if (buscaInput) {
            buscaInput.addEventListener('focus', function() {
                this.style.borderColor = '#6366f1';
                this.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.1)';
            });
            buscaInput.addEventListener('blur', function() {
                this.style.borderColor = '#e5e7eb';
                this.style.boxShadow = 'none';
            });

            let timeout;
            buscaInput.addEventListener('input', () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    this.carregarProfessoresGerenciar();
                }, 400);
            });
        }

        ['filtroStatusProfessor', 'filtroEixoProfessor', 'ordenacaoProfessor'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => this.carregarProfessoresGerenciar());
        });

        document.getElementById('modalGerenciarProfessores').addEventListener('hidden.bs.modal', () => {
            this.modalGerenciarInstance = null;
        });
    }

    async popularFiltroEixosProfessores() {
        try {
            const select = document.getElementById('filtroEixoProfessor');
            if (!select) return;

            const eixos = await this.carregarEixosDisponiveis();

            select.innerHTML = '<option value="todos">Todos os eixos</option>' +
                eixos.map(e => `
                    <option value="${this.escapeHtml(e.nome)}">
                        ${this.escapeHtml(e.label || e.nome)}
                    </option>
                `).join('');

            console.log(`✅ Filtro de eixos populado: ${eixos.length} opções`);
        } catch (error) {
            console.warn('Erro ao popular filtro de eixos:', error);
        }
    }

    async carregarProfessoresGerenciar() {
        const container = document.getElementById('listaGerenciarProfessores');
        const contador = document.getElementById('contadorProfessoresGerenciar');
        if (!container) return;

        const busca = document.getElementById('buscaGerenciarProfessores')?.value || '';
        const filtroStatus = document.getElementById('filtroStatusProfessor')?.value || 'todos';
        const filtroEixo = document.getElementById('filtroEixoProfessor')?.value || 'todos';
        const ordenacao = document.getElementById('ordenacaoProfessor')?.value || 'nome_asc';

        container.innerHTML = `
            <div class="text-center py-5">
                <div style="width: 40px; height: 40px; border: 4px solid #e5e7eb; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px;"></div>
                <p class="text-muted mt-2" style="font-size: 14px;">Carregando professores...</p>
            </div>
        `;

        try {
            const url = busca
                ? `/api/substituicao-professor/professores?busca=${encodeURIComponent(busca)}`
                : '/api/substituicao-professor/professores';

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Erro ao carregar');
            }

            this.substituicaoState.professores = data.professores || [];

            let professoresFiltrados = [...(data.professores || [])];

            if (filtroStatus === 'ativo') {
                professoresFiltrados = professoresFiltrados.filter(p => p.ativo !== false);
            } else if (filtroStatus === 'inativo') {
                professoresFiltrados = professoresFiltrados.filter(p => p.ativo === false);
            }

            if (filtroEixo !== 'todos') {
                professoresFiltrados = professoresFiltrados.filter(p =>
                    (p.eixo || 'Não definido') === filtroEixo
                );
            }

            professoresFiltrados.sort((a, b) => {
                switch (ordenacao) {
                    case 'nome_asc':
                        return (a.nome || '').localeCompare(b.nome || '', 'pt-BR');
                    case 'nome_desc':
                        return (b.nome || '').localeCompare(a.nome || '', 'pt-BR');
                    case 'recente':
                        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
                    case 'antigo':
                        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
                    default:
                        return 0;
                }
            });

            if (contador) {
                const total = professoresFiltrados.length;
                const totalGeral = data.total || 0;
                const temFiltros = busca || filtroStatus !== 'todos' || filtroEixo !== 'todos';

                contador.innerHTML = temFiltros
                    ? `<i class="fas fa-info-circle" style="color: #6366f1;"></i> Mostrando <strong>${total}</strong> de ${totalGeral} professor(es)`
                    : `<i class="fas fa-users" style="color: #6366f1;"></i> <strong>${total}</strong> professor(es) cadastrado(s)`;
            }

            if (professoresFiltrados.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 60px 20px; background: white; border-radius: 12px; border: 2px dashed #e5e7eb;">
                        <i class="fas fa-user-slash" style="font-size: 52px; color: #cbd5e1; margin-bottom: 16px;"></i>
                        <h5 style="color: #475569; font-weight: 600; margin-bottom: 6px;">Nenhum professor encontrado</h5>
                        <p style="color: #94a3b8; font-size: 14px; margin: 0;">Tente ajustar os filtros ou cadastre um novo professor.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = professoresFiltrados.map(p => `
                <div class="professor-item-gerenciar" style="
                    display: flex; align-items: center; gap: 15px;
                    padding: 16px 18px; margin-bottom: 10px;
                    background: white; border: 1px solid #e5e7eb;
                    border-radius: 12px; transition: all 0.2s;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
                " onmouseover="this.style.borderColor='#c7d2fe'; this.style.boxShadow='0 4px 12px rgba(99,102,241,0.1)'; this.style.transform='translateY(-1px)';"
                onmouseout="this.style.borderColor='#e5e7eb'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.04)'; this.style.transform='translateY(0)';">

                    <div style="
                        width: 50px; height: 50px; border-radius: 12px;
                        background: linear-gradient(135deg, #1e3c72, #2a5298);
                        color: white; display: flex; align-items: center;
                        justify-content: center; font-weight: 700; font-size: 20px;
                        flex-shrink: 0;
                    ">
                        ${(p.nome || '?').charAt(0).toUpperCase()}
                    </div>

                    <div style="flex: 1; min-width: 0;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                            <span style="font-weight: 700; font-size: 15px; color: #1e293b;">
                                ${this.escapeHtml(p.nome)}
                            </span>
                            ${p.ativo === false
                                ? '<span style="background: #fee2e2; color: #991b1b; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 6px; text-transform: uppercase;">Inativo</span>'
                                : '<span style="background: #dcfce7; color: #166534; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 6px; text-transform: uppercase;">Ativo</span>'
                            }
                        </div>
                        <div style="font-size: 12px; color: #64748b; display: flex; flex-wrap: wrap; gap: 12px;">
                            <span><i class="fas fa-envelope" style="opacity: 0.6;"></i> ${this.escapeHtml(p.email || 'Sem email')}</span>
                            ${p.matricula ? `<span><i class="fas fa-id-card" style="opacity: 0.6;"></i> ${this.escapeHtml(p.matricula)}</span>` : ''}
                            ${p.eixo && p.eixo !== 'Não definido' ? `<span><i class="fas fa-sitemap" style="opacity: 0.6;"></i> ${this.escapeHtml(p.eixo)}</span>` : ''}
                        </div>
                    </div>

                    <div style="display: flex; gap: 6px; flex-shrink: 0;">
                        <button class="btn"
                                onclick="setorPedagogico.verProfessor('${p.id}')"
                                title="Visualizar"
                                style="width: 38px; height: 38px; padding: 0; background: #eff6ff; color: #2563eb; border: none; border-radius: 9px; font-size: 14px; transition: all 0.2s;"
                                onmouseover="this.style.background='#dbeafe';"
                                onmouseout="this.style.background='#eff6ff';">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="btn"
                                onclick="setorPedagogico.abrirFormProfessor('${p.id}')"
                                title="Editar"
                                style="width: 38px; height: 38px; padding: 0; background: #fef3c7; color: #d97706; border: none; border-radius: 9px; font-size: 14px; transition: all 0.2s;"
                                onmouseover="this.style.background='#fde68a';"
                                onmouseout="this.style.background='#fef3c7';">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn"
                                onclick="setorPedagogico.excluirProfessor('${p.id}', '${this.escapeHtml(p.nome)}')"
                                title="Excluir"
                                style="width: 38px; height: 38px; padding: 0; background: #fee2e2; color: #dc2626; border: none; border-radius: 9px; font-size: 14px; transition: all 0.2s;"
                                onmouseover="this.style.background='#fecaca';"
                                onmouseout="this.style.background='#fee2e2';">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('');

        } catch (error) {
            console.error('❌ Erro:', error);
            container.innerHTML = `
                <div style="background: #fee2e2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; text-align: center;">
                    <i class="fas fa-exclamation-triangle" style="color: #dc2626; font-size: 32px; margin-bottom: 10px;"></i>
                    <h6 style="color: #991b1b; margin: 0 0 6px; font-weight: 700;">Erro ao carregar professores</h6>
                    <p style="color: #7f1d1d; font-size: 13px; margin: 0;">${error.message}</p>
                </div>
            `;
        }
    }

    async verProfessor(id) {
        if (this.modalGerenciarInstance) {
            this.modalGerenciarInstance.hide();
            await new Promise(resolve => setTimeout(resolve, 350));
        }

        try {
            const response = await fetch(`/api/substituicao-professor/professores/${id}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();

            if (!data.success) throw new Error(data.error || 'Erro ao carregar');

            const u = data.professor;
            const antigo = document.getElementById('modalVerProfessor');
            if (antigo) antigo.remove();

            const modalHtml = `
                <div class="modal fade" id="modalVerProfessor" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                        <div class="modal-content" style="border-radius: 16px; overflow: hidden; border: none; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">

                            <div class="modal-header" style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); color: white; border: none; padding: 22px 28px;">
                                <div style="display: flex; align-items: center; gap: 14px;">
                                    <div style="width: 46px; height: 46px; background: rgba(255,255,255,0.18); border-radius: 12px; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(10px);">
                                        <i class="fas fa-user-circle" style="font-size: 22px;"></i>
                                    </div>
                                    <div>
                                        <h5 class="modal-title mb-0" style="font-weight: 700;">Detalhes do Professor</h5>
                                        <small style="opacity: 0.9; font-size: 13px;">Informações completas do cadastro</small>
                                    </div>
                                </div>
                                <button type="button" class="btn-close btn-close-white"
                                        onclick="setorPedagogico.fecharVerProfessor()"></button>
                            </div>

                            <div class="modal-body" style="padding: 28px;">
                                <div style="text-align: center; padding-bottom: 24px; border-bottom: 1px solid #f1f5f9; margin-bottom: 24px;">
                                    ${u.fotoPerfil
                                        ? `<img src="${u.fotoPerfil}" style="width: 90px; height: 90px; border-radius: 50%; object-fit: cover; border: 3px solid #e5e7eb; box-shadow: 0 4px 12px rgba(0,0,0,0.08);">`
                                        : `<div style="width: 90px; height: 90px; border-radius: 50%; background: linear-gradient(135deg, #1e3c72, #2a5298); color: white; display: inline-flex; align-items: center; justify-content: center; font-size: 38px; font-weight: 700; box-shadow: 0 4px 12px rgba(30,60,114,0.25);">${(u.nome || '?').charAt(0).toUpperCase()}</div>`
                                    }
                                    <h4 style="margin: 16px 0 6px; font-weight: 700; color: #1e293b;">${this.escapeHtml(u.nome)}</h4>
                                    <p style="color: #64748b; margin: 0 0 10px; font-size: 14px;">
                                        <i class="fas fa-envelope"></i> ${this.escapeHtml(u.email)}
                                    </p>
                                    <span style="display: inline-block; padding: 5px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; text-transform: uppercase; ${u.ativo ? 'background: #dcfce7; color: #166534;' : 'background: #fee2e2; color: #991b1b;'}">
                                        <i class="fas fa-${u.ativo ? 'check-circle' : 'ban'}"></i>
                                        ${u.ativo ? 'Ativo' : 'Inativo'}
                                    </span>
                                </div>

                                <div class="row g-3">
                                    <div class="col-md-6">
                                        <div style="background: #f8fafc; padding: 14px; border-radius: 10px; border: 1px solid #e5e7eb;">
                                            <small style="color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 4px;">Matrícula</small>
                                            <span style="color: #1e293b; font-weight: 600;">${this.escapeHtml(u.matricula || 'Não informada')}</span>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div style="background: #f8fafc; padding: 14px; border-radius: 10px; border: 1px solid #e5e7eb;">
                                            <small style="color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 4px;">CPF</small>
                                            <span style="color: #1e293b; font-weight: 600;">${this.escapeHtml(u.cpf || 'Não informado')}</span>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div style="background: #f8fafc; padding: 14px; border-radius: 10px; border: 1px solid #e5e7eb;">
                                            <small style="color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 4px;">Telefone</small>
                                            <span style="color: #1e293b; font-weight: 600;">${this.escapeHtml(u.telefone || 'Não informado')}</span>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div style="background: #f8fafc; padding: 14px; border-radius: 10px; border: 1px solid #e5e7eb;">
                                            <small style="color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 4px;">Eixo</small>
                                            <span style="color: #1e293b; font-weight: 600;">${this.escapeHtml(u.eixo || 'Não definido')}</span>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div style="background: #f8fafc; padding: 14px; border-radius: 10px; border: 1px solid #e5e7eb;">
                                            <small style="color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 4px;">Departamento</small>
                                            <span style="color: #1e293b; font-weight: 600;">${this.escapeHtml(u.departamento || 'Não informado')}</span>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div style="background: #f8fafc; padding: 14px; border-radius: 10px; border: 1px solid #e5e7eb;">
                                            <small style="color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 4px;">Titulação</small>
                                            <span style="color: #1e293b; font-weight: 600;">${this.escapeHtml(u.titulacao || 'Não informada')}</span>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div style="background: #f8fafc; padding: 14px; border-radius: 10px; border: 1px solid #e5e7eb;">
                                            <small style="color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 4px;">2FA</small>
                                            <span style="color: #1e293b; font-weight: 600;">
                                                <i class="fas fa-${u.twoFactorEnabled ? 'shield-alt' : 'shield'}"></i>
                                                ${u.twoFactorEnabled ? 'Ativado' : 'Desativado'}
                                            </span>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div style="background: #f8fafc; padding: 14px; border-radius: 10px; border: 1px solid #e5e7eb;">
                                            <small style="color: #64748b; font-size: 11px; font-weight: 700; text-transform: uppercase; display: block; margin-bottom: 4px;">Cadastrado em</small>
                                            <span style="color: #1e293b; font-weight: 600;">${u.createdAt ? new Date(u.createdAt).toLocaleDateString('pt-BR') : 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="modal-footer" style="border-top: 1px solid #e5e7eb; padding: 16px 28px; background: #f8fafc;">
                                <button type="button" class="btn btn-secondary"
                                        onclick="setorPedagogico.fecharVerProfessor()"
                                        style="padding: 10px 22px; border-radius: 10px; font-weight: 600;">
                                    <i class="fas fa-arrow-left me-2"></i> Voltar
                                </button>
                                <button type="button" class="btn btn-warning"
                                        onclick="setorPedagogico.fecharVerProfessor(function(){ setorPedagogico.abrirFormProfessor('${u.id}'); })"
                                        style="padding: 10px 22px; border-radius: 10px; font-weight: 600;">
                                    <i class="fas fa-edit me-2"></i> Editar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', modalHtml);
            this.modalVerProfessorInstance = new bootstrap.Modal(document.getElementById('modalVerProfessor'));
            this.modalVerProfessorInstance.show();

        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('Erro ao carregar professor: ' + error.message, 'error');
            this.reabrirModalGerenciar();
        }
    }

    fecharVerProfessor(callback) {
        const modal = document.getElementById('modalVerProfessor');
        if (modal && this.modalVerProfessorInstance) {
            this.modalVerProfessorInstance.hide();
            setTimeout(() => {
                modal.remove();
                if (typeof callback === 'function') {
                    callback();
                } else {
                    this.reabrirModalGerenciar();
                }
            }, 350);
        }
    }

    limparFiltrosProfessores() {
        const busca = document.getElementById('buscaGerenciarProfessores');
        if (busca) busca.value = '';

        const status = document.getElementById('filtroStatusProfessor');
        if (status) status.value = 'todos';

        const eixo = document.getElementById('filtroEixoProfessor');
        if (eixo) eixo.value = 'todos';

        const ord = document.getElementById('ordenacaoProfessor');
        if (ord) ord.value = 'nome_asc';

        this.carregarProfessoresGerenciar();
    }

    async abrirFormProfessor(id = null) {
        const editando = !!id;
        let professor = null;

        const modalGerenciar = document.getElementById('modalGerenciarProfessores');
        if (modalGerenciar && this.modalGerenciarInstance) {
            this.modalGerenciarInstance.hide();
            await new Promise(resolve => setTimeout(resolve, 350));
        }

        const eixos = await this.carregarEixosDisponiveis();

        if (editando) {
            try {
                const response = await fetch(`/api/substituicao-professor/professores/${id}`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                const data = await response.json();
                if (!data.success) throw new Error(data.error || 'Erro');
                professor = data.professor;
            } catch (error) {
                this.showToast('Erro ao carregar professor: ' + error.message, 'error');
                this.reabrirModalGerenciar();
                return;
            }
        }

        const antigo = document.getElementById('modalFormProfessor');
        if (antigo) antigo.remove();

        const eixoAtual = editando ? (professor.eixo || '') : '';
        const eixoOptions = `
            <option value="">— Nenhum eixo selecionado —</option>
            ${eixos.map(e => `
                <option value="${this.escapeHtml(e.nome)}"
                    ${eixoAtual === e.nome ? 'selected' : ''}
                    style="border-left: 3px solid ${e.cor || '#667eea'};">
                    ${this.escapeHtml(e.label || e.nome)}
                </option>
            `).join('')}
        `;

        const avisoEixos = eixos.length === 0
            ? `<div style="margin-top: 6px; background: #fef3c7; border-left: 3px solid #f59e0b; padding: 8px 10px; border-radius: 6px; font-size: 12px; color: #92400e;">
                    <i class="fas fa-exclamation-triangle"></i>
                    Nenhum eixo cadastrado no sistema. Peça ao administrador para cadastrar antes de atribuir.
            </div>`
            : `<small style="color: #64748b; font-size: 11px; display: block; margin-top: 4px;">
                    <i class="fas fa-info-circle"></i>
                    ${eixos.length} eixo${eixos.length > 1 ? 's' : ''} disponíve${eixos.length > 1 ? 'is' : 'l'} no sistema
            </small>`;

        const modalHtml = `
            <div class="modal fade" id="modalFormProfessor" tabindex="-1" data-bs-backdrop="static">
                <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                    <div class="modal-content" style="border-radius: 16px; overflow: hidden; border: none; box-shadow: 0 20px 60px rgba(0,0,0,0.3);">

                        <div class="modal-header" style="background: linear-gradient(135deg, ${editando ? '#f59e0b 0%, #d97706 100%' : '#10b981 0%, #059669 100%'}); color: white; border: none; padding: 22px 28px;">
                            <div style="display: flex; align-items: center; gap: 14px;">
                                <div style="width: 46px; height: 46px; background: rgba(255,255,255,0.18); border-radius: 12px; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(10px);">
                                    <i class="fas fa-${editando ? 'user-edit' : 'user-plus'}" style="font-size: 20px;"></i>
                                </div>
                                <div>
                                    <h5 class="modal-title mb-0" style="font-weight: 700;">
                                        ${editando ? 'Editar Professor' : 'Novo Professor'}
                                    </h5>
                                    <small style="opacity: 0.9; font-size: 13px;">
                                        ${editando ? 'Atualize os dados do professor' : 'Preencha os dados do novo professor'}
                                    </small>
                                </div>
                            </div>
                            <button type="button" class="btn-close btn-close-white"
                                    onclick="setorPedagogico.fecharFormProfessor()"></button>
                        </div>

                        <div style="padding: 12px 28px; background: #eff6ff; border-bottom: 1px solid #dbeafe;">
                            <div style="display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: #1e40af;">
                                <i class="fas fa-info-circle"></i>
                                <span>
                                    Os campos marcados com <strong style="color: #dc2626; font-size: 14px;">*</strong> são de <strong>preenchimento obrigatório</strong>.
                                </span>
                            </div>
                        </div>

                        <div class="modal-body" style="padding: 28px;">
                            <input type="hidden" id="formProfessorId" value="${editando ? professor.id : ''}">

                            <div class="row g-3">
                                <div class="col-md-8">
                                    <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">
                                        Nome Completo <span style="color: #dc2626; font-size: 14px; font-weight: 700;">*</span>
                                    </label>
                                    <input type="text" id="formProfessorNome" class="form-control"
                                        placeholder="Nome completo do professor"
                                        value="${editando ? this.escapeHtml(professor.nome) : ''}" required>
                                </div>

                                <div class="col-md-4">
                                    <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">
                                        Matrícula <span style="color: #dc2626; font-size: 14px; font-weight: 700;">*</span>
                                    </label>
                                    <input type="text" id="formProfessorMatricula" class="form-control"
                                        placeholder="Ex: 123456"
                                        value="${editando ? this.escapeHtml(professor.matricula || '') : ''}" required>
                                </div>

                                <div class="col-md-6">
                                    <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">
                                        Email Institucional <span style="color: #dc2626; font-size: 14px; font-weight: 700;">*</span>
                                    </label>
                                    <input type="email" id="formProfessorEmail" class="form-control"
                                        placeholder="nome@iemasaoluiscentro.net"
                                        value="${editando ? this.escapeHtml(professor.email) : ''}" required>
                                    <small class="text-muted" style="font-size: 11px;">Deve terminar com @iemasaoluiscentro.net</small>
                                </div>

                                <div class="col-md-6">
                                    <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">
                                        CPF <span style="color: #dc2626; font-size: 14px; font-weight: 700;">*</span>
                                    </label>
                                    <input type="text" id="formProfessorCPF" class="form-control"
                                        placeholder="000.000.000-00" maxlength="14"
                                        value="${editando ? this.escapeHtml(professor.cpf || '') : ''}" required>
                                </div>

                                <div class="col-md-6">
                                    <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">
                                        Telefone
                                        <span style="color: #94a3b8; font-size: 11px; font-weight: 500; margin-left: 6px;">(opcional)</span>
                                    </label>
                                    <input type="text" id="formProfessorTelefone" class="form-control"
                                        placeholder="(00) 00000-0000" maxlength="15"
                                        value="${editando ? this.escapeHtml(professor.telefone || '') : ''}">
                                </div>

                                <div class="col-md-6">
                                    <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">
                                        Eixo
                                        <span style="color: #94a3b8; font-size: 11px; font-weight: 500; margin-left: 6px;">(opcional)</span>
                                    </label>
                                    <select id="formProfessorEixo" class="form-select" ${eixos.length === 0 ? 'disabled' : ''}>
                                        ${eixoOptions}
                                    </select>
                                    ${avisoEixos}
                                </div>

                                <div class="col-md-6">
                                    <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">
                                        Departamento
                                        <span style="color: #94a3b8; font-size: 11px; font-weight: 500; margin-left: 6px;">(opcional)</span>
                                    </label>
                                    <input type="text" id="formProfessorDepartamento" class="form-control"
                                        placeholder="Ex: Ciências da Natureza"
                                        value="${editando ? this.escapeHtml(professor.departamento || '') : ''}">
                                </div>

                                <div class="col-md-6">
                                    <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">
                                        Titulação
                                        <span style="color: #94a3b8; font-size: 11px; font-weight: 500; margin-left: 6px;">(opcional)</span>
                                    </label>
                                    <select id="formProfessorTitulacao" class="form-select">
                                        <option value="">— Não informada —</option>
                                        <option value="Graduação" ${editando && professor.titulacao === 'Graduação' ? 'selected' : ''}>Graduação</option>
                                        <option value="Especialização" ${editando && professor.titulacao === 'Especialização' ? 'selected' : ''}>Especialização</option>
                                        <option value="Mestrado" ${editando && professor.titulacao === 'Mestrado' ? 'selected' : ''}>Mestrado</option>
                                        <option value="Doutorado" ${editando && professor.titulacao === 'Doutorado' ? 'selected' : ''}>Doutorado</option>
                                    </select>
                                </div>

                                ${!editando ? `
                                    <div class="col-md-6">
                                        <label class="form-label" style="font-weight: 600; font-size: 13px; color: #374151;">
                                            Senha Inicial <span style="color: #dc2626; font-size: 14px; font-weight: 700;">*</span>
                                        </label>
                                        <div style="position: relative;">
                                            <input type="password" id="formProfessorSenha" class="form-control"
                                                placeholder="Mínimo 6 caracteres" required
                                                style="padding-right: 45px;">
                                            <button type="button" onclick="toggleSenhaVisivel('formProfessorSenha', this)"
                                                    style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #64748b; padding: 4px;">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                        </div>
                                        <small class="text-muted" style="font-size: 11px;">O professor deverá trocar no primeiro login</small>
                                    </div>
                                ` : ''}

                                <div class="col-12">
                                    <div style="background: #f8fafc; border-radius: 10px; padding: 14px 16px; border: 1px solid #e5e7eb;">
                                        <div class="form-check form-switch" style="margin: 0;">
                                            <input class="form-check-input" type="checkbox" id="formProfessorAtivo"
                                                ${(!editando || professor.ativo) ? 'checked' : ''}>
                                            <label class="form-check-label" for="formProfessorAtivo" style="font-weight: 600; font-size: 14px; cursor: pointer;">
                                                Professor Ativo
                                                <span style="color: #94a3b8; font-size: 11px; font-weight: 500; margin-left: 6px;">(desmarque para inativar)</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="modal-footer" style="border-top: 1px solid #e5e7eb; padding: 16px 28px; background: #f8fafc;">
                            <button type="button" class="btn btn-secondary" onclick="setorPedagogico.fecharFormProfessor()"
                                    style="padding: 10px 22px; border-radius: 10px; font-weight: 600;">
                                <i class="fas fa-arrow-left me-2"></i> Voltar
                            </button>
                            <button type="button" class="btn btn-${editando ? 'warning' : 'success'}"
                                    onclick="setorPedagogico.salvarProfessor()" id="btnSalvarProfessor"
                                    style="padding: 10px 24px; border-radius: 10px; font-weight: 600;">
                                <i class="fas fa-save me-2"></i> ${editando ? 'Salvar Alterações' : 'Cadastrar Professor'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.modalFormProfessorInstance = new bootstrap.Modal(document.getElementById('modalFormProfessor'));
        this.modalFormProfessorInstance.show();

        setTimeout(() => {
            const cpfInput = document.getElementById('formProfessorCPF');
            const telInput = document.getElementById('formProfessorTelefone');

            if (cpfInput) {
                cpfInput.addEventListener('input', function() {
                    this.value = this.value.replace(/\D/g, '')
                        .replace(/(\d{3})(\d)/, '$1.$2')
                        .replace(/(\d{3})(\d)/, '$1.$2')
                        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
                });
            }

            if (telInput) {
                telInput.addEventListener('input', function() {
                    let v = this.value.replace(/\D/g, '').slice(0, 11);
                    if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
                    else if (v.length > 6) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
                    else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
                    this.value = v;
                });
            }
        }, 200);

        document.getElementById('modalFormProfessor').addEventListener('hidden.bs.modal', () => {
            this.modalFormProfessorInstance = null;
        });
    }

    fecharFormProfessor() {
        const modalForm = document.getElementById('modalFormProfessor');
        if (modalForm && this.modalFormProfessorInstance) {
            this.modalFormProfessorInstance.hide();
            setTimeout(() => {
                modalForm.remove();
                this.reabrirModalGerenciar();
            }, 350);
        }
    }

    async reabrirModalGerenciar() {
        const modalGerenciar = document.getElementById('modalGerenciarProfessores');
        if (modalGerenciar) {
            this.modalGerenciarInstance = new bootstrap.Modal(modalGerenciar);
            this.modalGerenciarInstance.show();
            await this.carregarProfessoresGerenciar();
        } else {
            await this.abrirGerenciarProfessores();
        }
    }

    async salvarProfessor() {
        const id = document.getElementById('formProfessorId')?.value;
        const editando = !!id;

        const nome = document.getElementById('formProfessorNome')?.value.trim();
        const matricula = document.getElementById('formProfessorMatricula')?.value.trim();
        const email = document.getElementById('formProfessorEmail')?.value.trim();
        const cpf = document.getElementById('formProfessorCPF')?.value.trim();
        const telefone = document.getElementById('formProfessorTelefone')?.value.trim();

        const eixoRaw = document.getElementById('formProfessorEixo')?.value || '';
        const eixo = eixoRaw.trim() !== '' ? eixoRaw.trim() : undefined;

        const departamento = document.getElementById('formProfessorDepartamento')?.value.trim();
        const titulacao = document.getElementById('formProfessorTitulacao')?.value;
        const ativo = document.getElementById('formProfessorAtivo')?.checked;

        if (!nome || nome.length < 3) {
            this.showToast('⚠️ Nome é obrigatório (mínimo 3 caracteres)', 'warning');
            document.getElementById('formProfessorNome')?.focus();
            return;
        }
        if (!matricula) {
            this.showToast('⚠️ Matrícula é obrigatória', 'warning');
            document.getElementById('formProfessorMatricula')?.focus();
            return;
        }
        if (!email) {
            this.showToast('⚠️ Email é obrigatório', 'warning');
            document.getElementById('formProfessorEmail')?.focus();
            return;
        }
        if (!email.endsWith('@iemasaoluiscentro.net')) {
            this.showToast('⚠️ Email deve ser institucional (@iemasaoluiscentro.net)', 'warning');
            document.getElementById('formProfessorEmail')?.focus();
            return;
        }
        if (!cpf || cpf.replace(/\D/g, '').length !== 11) {
            this.showToast('⚠️ CPF é obrigatório e deve ter 11 dígitos', 'warning');
            document.getElementById('formProfessorCPF')?.focus();
            return;
        }

        let senha = null;
        if (!editando) {
            senha = document.getElementById('formProfessorSenha')?.value;
            if (!senha || senha.length < 6) {
                this.showToast('⚠️ Senha é obrigatória (mínimo 6 caracteres)', 'warning');
                document.getElementById('formProfessorSenha')?.focus();
                return;
            }
        }

        const btn = document.getElementById('btnSalvarProfessor');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Salvando...';
        }

        try {
            const payload = {
                nome,
                matricula,
                email,
                cpf: cpf.replace(/\D/g, ''),
                telefone: telefone ? telefone.replace(/\D/g, '') : '',
                eixo: eixo,
                departamento: departamento || '',
                titulacao: titulacao || '',
                ativo
            };

            if (!editando) {
                payload.password = senha;
            }

            const url = editando
                ? `/api/substituicao-professor/professores/${id}`
                : '/api/substituicao-professor/professores';

            const method = editando ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Erro ao salvar');
            }

            const modalForm = document.getElementById('modalFormProfessor');
            if (modalForm && this.modalFormProfessorInstance) {
                this.modalFormProfessorInstance.hide();
                setTimeout(() => {
                    modalForm.remove();
                    this.reabrirModalGerenciar();
                }, 350);
            }

            this.showToast(
                editando ? '✅ Professor atualizado com sucesso!' : '✅ Professor cadastrado com sucesso!',
                'success'
            );

            await this.carregarProfessoresSubstituicao();

        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');

            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-save me-2"></i> ${editando ? 'Salvar Alterações' : 'Cadastrar Professor'}`;
            }
        }
    }

    async excluirProfessor(id, nome) {
        const confirmar = await this.confirmarAcao(
            `⚠️ Tem certeza que deseja EXCLUIR o professor "${nome}"?\n\nEsta ação não pode ser desfeita!`
        );

        if (!confirmar) return;

        try {
            const response = await fetch(`/api/substituicao-professor/professores/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Erro ao excluir');
            }

            this.showToast('✅ Professor excluído com sucesso!', 'success');
            await this.carregarProfessoresGerenciar();
            await this.carregarProfessoresSubstituicao();

        } catch (error) {
            console.error('❌ Erro:', error);

            if (error.message.includes('vínculos') || error.message.includes('dados associados')) {
                this.showToast(
                    '⚠️ Este professor possui vínculos no sistema.\n\nRecomendação: Desative-o ao invés de excluir.',
                    'warning'
                );
            } else {
                this.showToast('❌ ' + error.message, 'error');
            }
        }
    }

    async carregarEixosDisponiveis() {
        if (this._eixosCache && this._eixosCache.length > 0) {
            return this._eixosCache;
        }

        try {
            const token = localStorage.getItem('auth_token');

            const response = await fetch('/api/admin/eixos', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                console.error(`❌ Erro HTTP ${response.status} ao carregar eixos`);
                return [];
            }

            const data = await response.json();

            if (data.success && Array.isArray(data.eixos)) {
                this._eixosCache = data.eixos.map(e => ({
                    _id: e._id,
                    nome: e.nome,
                    label: e.label || e.nome,
                    cor: e.cor || '#667eea',
                    icone: e.icone || 'fa-graduation-cap',
                    descricao: e.descricao || ''
                }));

                console.log(`✅ ${this._eixosCache.length} eixos carregados com sucesso`);
                return this._eixosCache;
            }

            console.warn('⚠️ Resposta sem eixos válidos:', data);
            return [];

        } catch (error) {
            console.error('❌ Erro ao carregar eixos:', error);
            return [];
        }
    }

    renderizarGraficosSubstituicoes(data, mes) {
        const MOTIVOS_CORES = {
            'falta_professor': '#ef4444',
            'licenca_medica': '#f59e0b',
            'licenca_maternidade_paternidade': '#8b5cf6',
            'capacitacao_formacao': '#3b82f6',
            'reuniao_externa': '#10b981',
            'problema_pessoal': '#f97316',
            'atestado': '#06b6d4',
            'sem_substituto': '#dc2626',
            'outros': '#64748b'
        };

        const HORARIOS_CORES = [
            '#6366f1', '#7c3aed', '#8b5cf6', '#a855f7', '#d946ef',
            '#ec4899', '#f43f5e', '#f97316', '#f59e0b'
        ];

        const TURMAS_CORES = [
            '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981', '#22c55e',
            '#84cc16', '#eab308', '#f59e0b', '#f97316', '#ef4444',
            '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1'
        ];

        const ctxMotivos = document.getElementById('spChartMotivos');
        if (ctxMotivos) {
            if (this.substituicaoState.charts.motivos) {
                try { this.substituicaoState.charts.motivos.destroy(); } catch(e){}
            }

            this.substituicaoState.charts.motivos = new Chart(ctxMotivos.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: data.porMotivo.map(d => d.label),
                    datasets: [{
                        data: data.porMotivo.map(d => d.count),
                        backgroundColor: data.porMotivo.map(d => MOTIVOS_CORES[d.motivo] || '#64748b'),
                        borderWidth: 2,
                        borderColor: '#ffffff',
                        hoverOffset: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    cutout: '60%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 12,
                                usePointStyle: true,
                                pointStyle: 'rect',
                                boxWidth: 12,
                                boxHeight: 12,
                                font: { size: 11, family: 'Arial' }
                            }
                        },
                        tooltip: {
                            backgroundColor: '#1f2937',
                            padding: 10,
                            cornerRadius: 8,
                            titleFont: { size: 12, weight: 'bold' },
                            bodyFont: { size: 11 },
                            callbacks: {
                                label: function(context) {
                                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                    const pct = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
                                    return ` ${context.label}: ${context.parsed} (${pct}%)`;
                                }
                            }
                        }
                    }
                }
            });
        }

        const ctxHorarios = document.getElementById('spChartHorarios');
        if (ctxHorarios) {
            if (this.substituicaoState.charts.horarios) {
                try { this.substituicaoState.charts.horarios.destroy(); } catch(e){}
            }

            const horarios = [];
            for (let i = 1; i <= 9; i++) {
                const enc = data.porHorario.find(d => d.horario === i);
                horarios.push(enc ? enc.count : 0);
            }

            const coresBarras = horarios.map((_, i) => HORARIOS_CORES[i] || '#6366f1');

            this.substituicaoState.charts.horarios = new Chart(ctxHorarios.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: ['1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º', '9º'],
                    datasets: [{
                        label: 'Substituições',
                        data: horarios,
                        backgroundColor: coresBarras,
                        borderColor: coresBarras,
                        borderWidth: 1,
                        borderRadius: 6,
                        maxBarThickness: 42,
                        hoverBackgroundColor: coresBarras.map(c => c + 'dd')
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#1f2937',
                            padding: 10,
                            cornerRadius: 8,
                            titleFont: { size: 12, weight: 'bold' },
                            bodyFont: { size: 11 },
                            displayColors: false,
                            callbacks: {
                                title: (items) => `${items[0].label} Horário`,
                                label: function(context) {
                                    return `${context.parsed.y} substituição(ões)`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1,
                                precision: 0,
                                font: { size: 11 }
                            },
                            grid: { color: '#f3f4f6', drawBorder: false }
                        },
                        x: {
                            grid: { display: false },
                            ticks: {
                                font: { size: 11, weight: 'bold' },
                                color: '#374151'
                            }
                        }
                    }
                }
            });
        }

        const ctxDias = document.getElementById('spChartDias');
        if (ctxDias) {
            if (this.substituicaoState.charts.dias) {
                try { this.substituicaoState.charts.dias.destroy(); } catch(e){}
            }

            const [ano, mesNum] = mes.split('-').map(Number);
            const ultimoDia = new Date(ano, mesNum, 0).getDate();
            const labels = [], valores = [];

            for (let i = 1; i <= ultimoDia; i++) {
                labels.push(i);
                const diaStr = `${mes}-${String(i).padStart(2, '0')}`;
                const enc = data.substituicoesPorDia.find(d => d.data === diaStr);
                valores.push(enc ? enc.count : 0);
            }

            const gradiente = ctxDias.getContext('2d').createLinearGradient(0, 0, 0, 300);
            gradiente.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
            gradiente.addColorStop(0.5, 'rgba(139, 92, 246, 0.2)');
            gradiente.addColorStop(1, 'rgba(236, 72, 153, 0.02)');

            this.substituicaoState.charts.dias = new Chart(ctxDias.getContext('2d'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Substituições',
                        data: valores,
                        borderColor: '#6366f1',
                        backgroundColor: gradiente,
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointRadius: valores.map(v => v > 0 ? 5 : 2),
                        pointBackgroundColor: valores.map(v => v > 0 ? '#ef4444' : '#cbd5e1'),
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointHoverRadius: 8,
                        pointHoverBackgroundColor: '#dc2626'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#1f2937',
                            padding: 10,
                            cornerRadius: 8,
                            titleFont: { size: 12, weight: 'bold' },
                            bodyFont: { size: 11 },
                            displayColors: false,
                            callbacks: {
                                title: (items) => `📅 Dia ${items[0].label}`,
                                label: function(context) {
                                    const valor = context.parsed.y;
                                    return valor > 0
                                        ? `${valor} substituição(ões)`
                                        : 'Nenhuma substituição';
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1,
                                precision: 0,
                                font: { size: 11 }
                            },
                            grid: { color: '#f3f4f6', drawBorder: false }
                        },
                        x: {
                            grid: { display: false },
                            ticks: {
                                font: { size: 10 },
                                maxRotation: 0,
                                autoSkip: true,
                                maxTicksLimit: 15
                            }
                        }
                    }
                }
            });
        }

        const ctxTurmas = document.getElementById('spChartTurmas');
        if (ctxTurmas) {
            if (this.substituicaoState.charts.turmas) {
                try { this.substituicaoState.charts.turmas.destroy(); } catch(e){}
            }

            const coresTurmas = data.porTurma.map((_, i) => TURMAS_CORES[i % TURMAS_CORES.length]);

            this.substituicaoState.charts.turmas = new Chart(ctxTurmas.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: data.porTurma.map(d => d.turma),
                    datasets: [{
                        label: 'Substituições',
                        data: data.porTurma.map(d => d.count),
                        backgroundColor: coresTurmas,
                        borderColor: coresTurmas,
                        borderWidth: 1,
                        borderRadius: 6,
                        maxBarThickness: 28,
                        hoverBackgroundColor: coresTurmas.map(c => c + 'dd')
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    indexAxis: 'y',
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#1f2937',
                            padding: 10,
                            cornerRadius: 8,
                            titleFont: { size: 12, weight: 'bold' },
                            bodyFont: { size: 11 },
                            displayColors: false,
                            callbacks: {
                                title: (items) => `🏫 ${items[0].label}`,
                                label: function(context) {
                                    return `${context.parsed.x} substituição(ões)`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1,
                                precision: 0,
                                font: { size: 11 }
                            },
                            grid: { color: '#f3f4f6', drawBorder: false }
                        },
                        y: {
                            grid: { display: false },
                            ticks: {
                                font: { size: 11, weight: 'bold' },
                                color: '#374151'
                            }
                        }
                    }
                }
            });
        }
    }

    renderizarRankingsSubstituicoes(data) {
        const render = (containerId, dados) => {
            const container = document.getElementById(containerId);
            if (!container) return;

            if (dados.length === 0) {
                container.innerHTML = `
                    <div class="empty-state" style="text-align: center; padding: 30px; color: #9ca3af;">
                        <i class="fas fa-trophy" style="font-size: 32px; margin-bottom: 10px; opacity: 0.5;"></i>
                        <p style="margin: 0;">Nenhum dado disponível</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = dados.map((p, i) => {
                const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
                const medalha = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';

                return `
                    <div class="ranking-item">
                        <div class="ranking-position ${posClass}">
                            ${medalha || (i + 1)}
                        </div>
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
    }

    renderizarUltimasSubstituicoes(lista) {
        const container = document.getElementById('spUltimasSubstituicoes');
        if (!container) return;

        if (!lista || lista.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #9ca3af;">
                    <i class="fas fa-history" style="font-size: 32px; margin-bottom: 10px; opacity: 0.5;"></i>
                    <p style="margin: 0;">Nenhuma substituição recente</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Horário</th>
                            <th>Ausente</th>
                            <th>Substituto</th>
                            <th>Turma</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lista.map(s => {
                            const horariosList = (s.horarios && s.horarios.length > 0)
                                ? s.horarios
                                : (s.horario ? [s.horario] : []);

                            const horariosHTML = horariosList.length > 0
                                ? horariosList.map(h => `<span class="badge-custom badge-primary" style="margin-right:3px;">${h}º</span>`).join('')
                                : '<span class="text-muted">-</span>';

                            return `
                                <tr>
                                    <td>
                                        <strong>${new Date(s.data + 'T12:00:00').toLocaleDateString('pt-BR')}</strong>
                                    </td>
                                    <td>${horariosHTML}</td>
                                    <td>${this.escapeHtml(s.professorAusenteNome)}</td>
                                    <td>${this.escapeHtml(s.professorSubstitutoNome)}</td>
                                    <td><span class="badge-custom badge-gray">${this.escapeHtml(s.turma)}</span></td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async gerarRelatorioSubstituicoes() {
        const container = document.getElementById('resultadoRelatorioSubstituicoes');
        if (!container) return;

        container.innerHTML = '<div class="text-center py-5"><div class="loading"></div><p>Gerando relatório...</p></div>';

        try {
            const params = new URLSearchParams();
            const mes = document.getElementById('relatorioMesSubstituicao')?.value;
            const dataInicio = document.getElementById('relatorioDataInicioSubstituicao')?.value;
            const dataFim = document.getElementById('relatorioDataFimSubstituicao')?.value;
            const turma = document.getElementById('relatorioTurmaSubstituicao')?.value;
            const motivo = document.getElementById('relatorioMotivoSubstituicao')?.value;
            const substitutoAusente = document.getElementById('relatorioSubstitutoAusenteSubstituicao')?.value;

            if (mes) params.append('mes', mes);
            if (dataInicio) params.append('dataInicio', dataInicio);
            if (dataFim) params.append('dataFim', dataFim);
            if (turma) params.append('turma', turma);
            if (motivo) params.append('motivo', motivo);
            if (substitutoAusente !== undefined && substitutoAusente !== '') params.append('substitutoAusente', substitutoAusente);

            const response = await fetch(`/api/substituicao-professor/relatorio/gerar?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();

            if (!data.success) throw new Error(data.error);

            this.substituicaoState.relatorioAtual = data;

            const btnCSV = document.getElementById('btnExportarCSVSubstituicao');
            if (btnCSV) btnCSV.disabled = false;
            const btnPDF = document.getElementById('btnImprimirRelatorioSubstituicao');
            if (btnPDF) btnPDF.disabled = false;

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
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>Data</th><th>Horário</th><th>Ausente</th>
                                    <th>Substituto</th><th>Turma</th><th>Motivo</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.substituicoes.map(s => `
                                    <tr ${s.substitutoAusente ? 'style="background: #fef2f2;"' : ''}>
                                        <td>${s.dataFormatada}</td>
                                        <td>${(s.horarios && s.horarios.length > 0 ? s.horarios : (s.horario ? [s.horario] : [])).map(h => `${h}º`).join(', ') || '-'}</td>
                                        <td>${this.escapeHtml(s.professorAusenteNome)}</td>
                                        <td>
                                            ${this.escapeHtml(s.professorSubstitutoNome)}
                                            ${s.substitutoAusente ? '<br><span class="badge bg-danger" style="font-size:10px;">Substituto Ausente</span>' : ''}
                                        </td>
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
    }

    exportarCSVSubstituicoes() {
        const data = this.substituicaoState.relatorioAtual;
        if (!data || !data.substituicoes || data.substituicoes.length === 0) {
            this.showToast('⚠️ Gere um relatório primeiro', 'warning');
            return;
        }

        const registros = data.substituicoes;

        // ---------- Colunas ----------
        const colunas = [
            {
                label: 'Data',
                format: (s) => s.dataFormatada
                    || (s.data ? new Date(s.data + 'T12:00:00').toLocaleDateString('pt-BR') : '')
            },
            {
                label: 'Dia da Semana',
                format: (s) => s.diaSemana || ''
            },
            {
                label: 'Horário(s)',
                format: (s) => {
                    const h = s.horarios && s.horarios.length > 0
                        ? s.horarios
                        : (s.horario ? [s.horario] : []);
                    return h.length > 0 ? h.map(n => `${n}º`).join(', ') : '';
                }
            },
            {
                label: 'Professor Ausente',
                format: (s) => s.professorAusenteNome || ''
            },
            {
                label: 'Email Ausente',
                format: (s) => s.professorAusenteEmail || ''
            },
            {
                label: 'Eixo Ausente',
                format: (s) => s.professorAusenteEixo || ''
            },
            {
                label: 'Professor Substituto',
                format: (s) => s.professorSubstitutoNome || ''
            },
            {
                label: 'Email Substituto',
                format: (s) => s.professorSubstitutoEmail || ''
            },
            {
                label: 'Eixo Substituto',
                format: (s) => s.professorSubstitutoEixo || ''
            },
            {
                label: 'Substituto Ausente?',
                format: (s) => s.substitutoAusente ? 'Sim' : 'Não'
            },
            {
                label: 'Motivo da Ausência do Substituto',
                format: (s) => s.substitutoAusenteMotivo || ''
            },
            {
                label: 'Turma',
                format: (s) => s.turma || ''
            },
            {
                label: 'Motivo',
                format: (s) => s.motivoLabel || ''
            },
            {
                label: 'Detalhes do Motivo',
                format: (s) => s.motivoDetalhes || ''
            },
            {
                label: 'Observações',
                format: (s) => s.observacoes || ''
            },
            {
                label: 'Registrado por',
                format: (s) => s.registradoPorNome || ''
            },
            {
                label: 'Data de Registro',
                format: (s) => s.registradoEm
                    ? new Date(s.registradoEm).toLocaleString('pt-BR')
                    : ''
            }
        ];

        // ---------- Filtros aplicados ----------
        const filtros = [];
        const mes = document.getElementById('relatorioMesSubstituicao')?.value;
        const dI = document.getElementById('relatorioDataInicioSubstituicao')?.value;
        const dF = document.getElementById('relatorioDataFimSubstituicao')?.value;
        const turma = document.getElementById('relatorioTurmaSubstituicao')?.value;
        const motivo = document.getElementById('relatorioMotivoSubstituicao')?.value;
        const subAusente = document.getElementById('relatorioSubstitutoAusenteSubstituicao')?.value;

        if (mes) filtros.push({ label: 'Mês', valor: mes });
        if (dI) filtros.push({ label: 'Data inicial', valor: dI });
        if (dF) filtros.push({ label: 'Data final', valor: dF });
        if (turma) filtros.push({ label: 'Turma', valor: turma });
        if (motivo) filtros.push({ label: 'Motivo', valor: motivo });
        if (subAusente === 'true') filtros.push({ label: 'Substituto Ausente', valor: 'Sim' });
        if (subAusente === 'false') filtros.push({ label: 'Substituto Ausente', valor: 'Não' });

        // ---------- Métricas ----------
        const totalComSubstituto = registros.filter(s => !s.substitutoAusente).length;
        const totalSemSubstituto = registros.filter(s => s.substitutoAusente).length;

        const ok = this.gerarBaixarCSV({
            titulo: 'Relatório de Substituições',
            subtitulo: 'Registros de substituição de professores',
            setor: 'Setor Pedagógico',
            colunas,
            registros,
            filtros,
            metricas: {
                'Total de substituições': registros.length,
                'Com substituto presente': totalComSubstituto,
                'Com substituto ausente': totalSemSubstituto,
                'Turmas envolvidas': new Set(registros.map(s => s.turma).filter(Boolean)).size
            },
            nomeArquivo: 'relatorio-substituicoes',
            observacoes: `${registros.length} substituição(ões)`
        });

        if (ok) {
            this.showToast(`✅ CSV exportado (${registros.length} substituição(ões))!`, 'success');
        }
    }

    imprimirRelatorioSubstituicoes() {
        const data = this.substituicaoState.relatorioAtual;
        if (!data || data.substituicoes.length === 0) {
            this.showToast('Gere um relatório primeiro', 'warning');
            return;
        }

        const html = `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>Relatório de Substituições</title>
                <style>
                    @page { size: A4 landscape; margin: 10mm; }
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: Arial, sans-serif; font-size: 10pt; }
                    .header { text-align: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #1e3c72; }
                    .header h1 { font-size: 16pt; color: #1e3c72; }
                    .header h2 { font-size: 12pt; font-weight: normal; margin-top: 5px; }
                    .stats { display: flex; gap: 20px; margin-bottom: 20px; padding: 15px; background: #f0f4ff; border-radius: 8px; }
                    .stat { text-align: center; flex: 1; }
                    .stat-value { font-size: 24pt; font-weight: bold; color: #1e3c72; }
                    .stat-label { font-size: 9pt; color: #666; }
                    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
                    th { background: #1e3c72; color: white; padding: 8px; text-align: left; }
                    td { padding: 6px 8px; border-bottom: 1px solid #ddd; }
                    tr:nth-child(even) { background: #f9fafb; }
                    .badge-ausente { background: #fee2e2; color: #dc2626; padding: 2px 6px; border-radius: 4px; font-size: 8pt; font-weight: bold; }
                    .footer { margin-top: 20px; text-align: center; font-size: 8pt; color: #666; }
                    .btn-print { display: block; margin: 20px auto; padding: 12px 30px; background: #1e3c72; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
                <div class="header">
                    <h1>IEMA Pleno: São Luís - Centro</h1>
                    <h2>Relatório de Substituições de Professores</h2>
                    <p style="font-size: 9pt; margin-top: 5px;">Gerado em ${new Date().toLocaleString('pt-BR')}</p>
                </div>
                <div class="stats">
                    <div class="stat"><div class="stat-value">${data.total}</div><div class="stat-label">Total</div></div>
                    <div class="stat"><div class="stat-value">${Object.keys(data.estatisticas.porTurma).length}</div><div class="stat-label">Turmas</div></div>
                    <div class="stat"><div class="stat-value">${Object.keys(data.estatisticas.porProfessor).length}</div><div class="stat-label">Professores</div></div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Data</th><th>Horário</th><th>Professor Ausente</th>
                            <th>Professor Substituto</th><th>Turma</th><th>Motivo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.substituicoes.map(s => `
                            <tr>
                                <td>${s.dataFormatada}</td>
                                <td>${(s.horarios && s.horarios.length > 0 ? s.horarios : (s.horario ? [s.horario] : [])).map(h => `${h}º`).join(', ') || '-'}</td>
                                <td>${this.escapeHtml(s.professorAusenteNome)}</td>
                                <td>
                                    ${this.escapeHtml(s.professorSubstitutoNome)}
                                    ${s.substitutoAusente ? '<br><span class="badge-ausente">⚠️ Substituto Ausente</span>' : ''}
                                </td>
                                <td>${this.escapeHtml(s.turma)}</td>
                                <td>${this.escapeHtml(s.motivoLabel)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="footer">
                    <p>EducaPleno - Setor Pedagógico</p>
                </div>
            </body>
            </html>
        `;

        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    }

    // ============================================================================
    // 🔥 MÓDULO DE ATRASOS
    // ============================================================================
    async carregarConteudoAtrasos() {
        // 🔥 Limpa intervalo anterior (evita vazamento)
        if (this._intervaloHorarioAtraso) {
            clearInterval(this._intervaloHorarioAtraso);
            this._intervaloHorarioAtraso = null;
        }

        const container = document.querySelector('#sp-atrasos');
        if (!container) return;

        container.innerHTML = `
            <div class="text-center py-5">
                <div class="loading"></div>
                <p class="mt-3 text-muted">Carregando módulo de atrasos...</p>
            </div>
        `;

        try {
            // 🚀 Em paralelo
            const [professoresRes, turmasRes] = await Promise.allSettled([
                fetch('/api/atraso-professor/professores', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                }).then(r => r.json()),
                fetch('/api/atraso-professor/turmas', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                }).then(r => r.json())
            ]);

            if (professoresRes.status === 'fulfilled' && professoresRes.value.success) {
                this.atrasosState = this.atrasosState || {};
                this.atrasosState.professores = professoresRes.value.professores;
            }

            if (turmasRes.status === 'fulfilled' && turmasRes.value.success) {
                this.atrasosState = this.atrasosState || {};
                this.atrasosState.turmas = turmasRes.value.turmas;
            }

            container.innerHTML = this.getHTMLAtrasos();

            setTimeout(() => {
                this.inicializarEventosAtrasos();
            }, 100);

        } catch (error) {
            console.error('❌ Erro ao carregar módulo de atrasos:', error);
            container.innerHTML = `
                <div class="alert alert-danger m-4">
                    <i class="fas fa-exclamation-triangle"></i>
                    Erro ao carregar módulo de atrasos: ${error.message}
                </div>
            `;
        }
    }

    getHTMLAtrasos() {
        return `
            <ul class="nav nav-pills mb-3" role="tablist" style="gap: 8px;">
                <li class="nav-item">
                    <button class="nav-link active" id="atraso-registrar-tab" data-bs-toggle="pill" data-bs-target="#atraso-registrar" type="button">
                        <i class="fas fa-plus-circle"></i> Registrar
                    </button>
                </li>
                <li class="nav-item">
                    <button class="nav-link" id="atraso-lista-tab" data-bs-toggle="pill" data-bs-target="#atraso-lista" type="button">
                        <i class="fas fa-list"></i> Lista
                        <span class="badge bg-danger ms-1" id="badgeTotalAtrasos">0</span>
                    </button>
                </li>
                <li class="nav-item">
                    <button class="nav-link" id="atraso-dashboard-tab" data-bs-toggle="pill" data-bs-target="#atraso-dashboard" type="button">
                        <i class="fas fa-chart-line"></i> Dashboard
                    </button>
                </li>
                <li class="nav-item">
                    <button class="nav-link" id="atraso-relatorios-tab" data-bs-toggle="pill" data-bs-target="#atraso-relatorios" type="button">
                        <i class="fas fa-file-alt"></i> Relatórios
                    </button>
                </li>
            </ul>

            <div class="tab-content">
                <div class="tab-pane fade show active" id="atraso-registrar">
                    <div class="card mb-3">
                        <div class="card-body">
                            <div class="etapa-header">
                                <div class="etapa-numero">1</div>
                                <div class="etapa-titulo">
                                    <h5><i class="fas fa-user-clock me-2"></i> Professor Atrasado</h5>
                                    <small class="text-muted">Selecione o professor que chegou atrasado</small>
                                </div>
                            </div>

                            <div class="professor-selecionado-box mt-3" id="professorSelecionadoAtraso" style="display: none;">
                                <div class="professor-selecionado-content">
                                    <div class="professor-avatar-lg" id="avatarProfessorAtraso">?</div>
                                    <div class="professor-selecionado-info">
                                        <strong id="nomeProfessorAtraso">-</strong>
                                        <small id="emailProfessorAtraso">-</small>
                                    </div>
                                    <button class="btn btn-sm btn-outline-danger" onclick="setorPedagogico.limparProfessorAtraso()">
                                        <i class="fas fa-times"></i>
                                    </button>
                                </div>
                            </div>

                            <div class="search-box mt-3">
                                <i class="fas fa-search"></i>
                                <input type="text" id="buscaProfessorAtraso" placeholder="Buscar professor por nome, email ou matrícula...">
                            </div>
                            <div class="professor-list mt-3" id="listaProfessoresAtraso">
                                <div class="text-center py-3">
                                    <div class="loading"></div>
                                    <p>Carregando professores...</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="card mb-3" id="cardDetalhesAtraso" style="display: none;">
                        <div class="card-body">
                            <div class="etapa-header">
                                <div class="etapa-numero">2</div>
                                <div class="etapa-titulo">
                                    <h5><i class="fas fa-clipboard-list me-2"></i> Detalhes do Atraso</h5>
                                    <small class="text-muted">Informe os dados do atraso</small>
                                </div>
                            </div>

                            <div class="row g-3 mt-3">
                                <div class="col-md-4">
                                    <label class="form-label">Data do Atraso <span class="text-danger">*</span></label>
                                    <input type="date" id="inputDataAtraso" class="form-control">
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Horário da Aula <span class="text-danger">*</span></label>
                                    <select id="selectHorarioAtraso" class="form-select">
                                        <option value="">Selecione...</option>
                                        <option value="1">1º Horário</option>
                                        <option value="2">2º Horário</option>
                                        <option value="3">3º Horário</option>
                                        <option value="4">4º Horário</option>
                                        <option value="5">5º Horário</option>
                                        <option value="6">6º Horário</option>
                                        <option value="7">7º Horário</option>
                                        <option value="8">8º Horário</option>
                                        <option value="9">9º Horário</option>
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Horário de Chegada</label>
                                    <input type="time" id="inputHorarioChegadaAtraso" class="form-control">
                                </div>
                            </div>

                            <div class="row g-3 mt-3">
                                <div class="col-md-4">
                                    <label class="form-label">Minutos de Atraso</label>
                                    <input type="number" id="inputMinutosAtraso" class="form-control" min="0" max="300" placeholder="Ex: 15">
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Turma</label>
                                    <select id="selectTurmaAtraso" class="form-select">
                                        <option value="">Selecione a turma...</option>
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Motivo</label>
                                    <select id="selectMotivoAtraso" class="form-select" onchange="setorPedagogico.toggleMotivoDetalhesAtraso()">
                                        <option value="nao_justificado">Não Justificado</option>
                                        <option value="problema_transporte">Problema de Transporte</option>
                                        <option value="problema_pessoal">Problema Pessoal</option>
                                        <option value="problema_saude">Problema de Saúde</option>
                                        <option value="transito">Trânsito</option>
                                        <option value="clima">Condições Climáticas</option>
                                        <option value="outros">Outros</option>
                                    </select>
                                </div>
                            </div>

                            <div class="mt-3" id="grupoMotivoDetalhesAtraso" style="display: none;">
                                <label class="form-label">Especifique o Motivo</label>
                                <input type="text" id="inputMotivoDetalhesAtraso" class="form-control" placeholder="Descreva o motivo...">
                            </div>

                            <div class="mt-3">
                                <label class="form-label">Observações</label>
                                <textarea id="inputObservacoesAtraso" class="form-control" rows="3" placeholder="Informações adicionais (opcional)..."></textarea>
                            </div>

                            <div class="info-preenchimento mt-3">
                                <i class="fas fa-clock"></i>
                                <div>
                                    <strong>Horário do Preenchimento:</strong>
                                    <span id="horarioPreenchimentoAtraso"></span>
                                </div>
                            </div>

                            <div class="d-flex gap-2 mt-4 justify-content-end">
                                <button class="btn btn-secondary" onclick="setorPedagogico.resetarFormularioAtraso()">
                                    <i class="fas fa-times me-2"></i> Cancelar
                                </button>
                                <button class="btn btn-primary" onclick="setorPedagogico.registrarAtraso()" id="btnRegistrarAtraso">
                                    <i class="fas fa-save me-2"></i> Registrar Atraso
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="tab-pane fade" id="atraso-lista">
                    <div class="card mb-3">
                        <div class="card-body">
                            <h6 class="card-title"><i class="fas fa-filter me-2"></i> Filtros</h6>
                            <div class="row g-3">
                                <div class="col-md-3">
                                    <label class="form-label">Mês</label>
                                    <input type="month" id="filtroMesAtraso" class="form-control">
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label">Professor</label>
                                    <input type="text" id="filtroBuscaAtraso" class="form-control" placeholder="Nome...">
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label">Motivo</label>
                                    <select id="filtroMotivoAtraso" class="form-select">
                                        <option value="">Todos</option>
                                        <option value="nao_justificado">Não Justificado</option>
                                        <option value="problema_transporte">Transporte</option>
                                        <option value="problema_pessoal">Pessoal</option>
                                        <option value="problema_saude">Saúde</option>
                                        <option value="transito">Trânsito</option>
                                        <option value="clima">Clima</option>
                                        <option value="outros">Outros</option>
                                    </select>
                                </div>
                                <div class="col-md-2">
                                    <label class="form-label">Data Início</label>
                                    <input type="date" id="filtroDataInicioAtraso" class="form-control">
                                </div>
                                <div class="col-md-2 d-flex align-items-end gap-2">
                                    <button class="btn btn-secondary flex-fill" onclick="setorPedagogico.limparFiltrosAtraso()">
                                        <i class="fas fa-eraser"></i>
                                    </button>
                                    <button class="btn btn-primary flex-fill" onclick="setorPedagogico.carregarListaAtrasos()">
                                        <i class="fas fa-search"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="card">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <h6 class="card-title mb-0"><i class="fas fa-list me-2"></i> Atrasos Registrados</h6>
                                <span class="badge bg-primary" id="contadorListaAtrasos">0 registros</span>
                            </div>
                            <div id="listaAtrasos"></div>
                        </div>
                    </div>
                </div>

                <div class="tab-pane fade" id="atraso-dashboard">
                    <div class="card mb-3">
                        <div class="card-body">
                            <div class="row g-3 align-items-end">
                                <div class="col-md-4">
                                    <label class="form-label">Mês de Referência</label>
                                    <input type="month" id="dashboardMesAtraso" class="form-control">
                                </div>
                                <div class="col-md-3">
                                    <button class="btn btn-primary w-100" onclick="setorPedagogico.carregarDashboardAtrasos()">
                                        <i class="fas fa-sync-alt me-2"></i> Atualizar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="row mb-4">
                        <div class="col-md-3 mb-3">
                            <div class="metric-card">
                                <i class="fas fa-clock fa-2x text-primary mb-2"></i>
                                <div class="metric-value" id="atrasoStatTotalMes">0</div>
                                <div class="metric-label">Atrasos no Mês</div>
                            </div>
                        </div>
                        <div class="col-md-3 mb-3">
                            <div class="metric-card">
                                <i class="fas fa-calendar-day fa-2x text-success mb-2"></i>
                                <div class="metric-value" id="atrasoStatMediaDiaria">0</div>
                                <div class="metric-label">Média Diária</div>
                            </div>
                        </div>
                        <div class="col-md-3 mb-3">
                            <div class="metric-card">
                                <i class="fas fa-user-clock fa-2x text-warning mb-2"></i>
                                <div class="metric-value" id="atrasoStatProfessores">0</div>
                                <div class="metric-label">Professores</div>
                            </div>
                        </div>
                        <div class="col-md-3 mb-3">
                            <div class="metric-card">
                                <i class="fas fa-hourglass-half fa-2x text-danger mb-2"></i>
                                <div class="metric-value" id="atrasoStatTotalMinutos">0</div>
                                <div class="metric-label">Tempo Total</div>
                            </div>
                        </div>
                    </div>

                    <div class="row">
                        <div class="col-md-6 mb-4">
                            <div class="card h-100">
                                <div class="card-body">
                                    <h6 class="card-title"><i class="fas fa-chart-pie"></i> Por Motivo</h6>
                                    <canvas id="atrasoChartMotivos"></canvas>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6 mb-4">
                            <div class="card h-100">
                                <div class="card-body">
                                    <h6 class="card-title"><i class="fas fa-chart-bar"></i> Por Horário</h6>
                                    <canvas id="atrasoChartHorarios"></canvas>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6 mb-4">
                            <div class="card h-100">
                                <div class="card-body">
                                    <h6 class="card-title"><i class="fas fa-chart-line"></i> Por Dia</h6>
                                    <canvas id="atrasoChartDias"></canvas>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6 mb-4">
                            <div class="card h-100">
                                <div class="card-body">
                                    <h6 class="card-title"><i class="fas fa-trophy"></i> Professores com Mais Atrasos</h6>
                                    <div id="atrasoRankingProfessores" class="ranking-list mt-3"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-body">
                            <h6 class="card-title"><i class="fas fa-history"></i> Últimos Atrasos</h6>
                            <div id="atrasoUltimosRegistros" class="mt-3"></div>
                        </div>
                    </div>
                </div>

                <div class="tab-pane fade" id="atraso-relatorios">
                    <div class="card mb-3">
                        <div class="card-body">
                            <h6 class="card-title"><i class="fas fa-file-alt me-2"></i> Gerar Relatório</h6>
                            <div class="row g-3">
                                <div class="col-md-3">
                                    <label class="form-label">Mês</label>
                                    <input type="month" id="relatorioMesAtraso" class="form-control">
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label">Data Início</label>
                                    <input type="date" id="relatorioDataInicioAtraso" class="form-control">
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label">Data Fim</label>
                                    <input type="date" id="relatorioDataFimAtraso" class="form-control">
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label">Professor</label>
                                    <select id="relatorioProfessorAtraso" class="form-select">
                                        <option value="">Todos</option>
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label">Motivo</label>
                                    <select id="relatorioMotivoAtraso" class="form-select">
                                        <option value="">Todos</option>
                                        <option value="nao_justificado">Não Justificado</option>
                                        <option value="problema_transporte">Transporte</option>
                                        <option value="problema_pessoal">Pessoal</option>
                                        <option value="problema_saude">Saúde</option>
                                        <option value="transito">Trânsito</option>
                                        <option value="clima">Clima</option>
                                        <option value="outros">Outros</option>
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="form-label">&nbsp;</label>
                                    <button class="btn btn-primary w-100" onclick="setorPedagogico.gerarRelatorioAtrasos()">
                                        <i class="fas fa-search me-2"></i> Gerar
                                    </button>
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">&nbsp;</label>
                                    <div class="btn-group w-100">
                                        <button class="btn btn-success" onclick="setorPedagogico.exportarCSVAtrasos()" id="btnExportarCSVAtraso" disabled>
                                            <i class="fas fa-file-csv me-1"></i> CSV
                                        </button>
                                        <button class="btn btn-danger" onclick="setorPedagogico.imprimirRelatorioAtrasos()" id="btnImprimirRelatorioAtraso" disabled>
                                            <i class="fas fa-print me-1"></i> PDF
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div id="resultadoRelatorioAtrasos">
                        <div class="text-center py-5">
                            <i class="fas fa-chart-line fa-3x text-muted mb-3"></i>
                            <p class="text-muted">Selecione os filtros e clique em Gerar</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    inicializarEventosAtrasos() {
        const hoje = getDataLocalISO();
        const mesAtual = new Date().toISOString().substring(0, 7);

        const inputData = document.getElementById('inputDataAtraso');
        if (inputData) inputData.value = hoje;

        ['filtroMesAtraso', 'dashboardMesAtraso', 'relatorioMesAtraso'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = mesAtual;
        });

        // 🚀 Em paralelo
        Promise.allSettled([
            this.carregarProfessoresAtraso(),
            this.carregarTurmasAtraso(),
            this.carregarListaAtrasos()
        ]);

        const busca = document.getElementById('buscaProfessorAtraso');
        if (busca) {
            busca.addEventListener('input', (e) => {
                this.filtrarProfessoresAtraso(e.target.value);
            });
        }

        const selectMotivo = document.getElementById('selectMotivoAtraso');
        if (selectMotivo) {
            selectMotivo.addEventListener('change', () => this.toggleMotivoDetalhesAtraso());
        }

        document.getElementById('atraso-dashboard-tab')?.addEventListener('shown.bs.tab', () => {
            this.carregarDashboardAtrasos();
        });

        this.preencherSelectProfessoresAtraso();
    }

    toggleMotivoDetalhesAtraso() {
        const motivo = document.getElementById('selectMotivoAtraso')?.value;
        const grupo = document.getElementById('grupoMotivoDetalhesAtraso');

        if (motivo === 'outros') {
            grupo.style.display = 'block';
        } else {
            grupo.style.display = 'none';
            const input = document.getElementById('inputMotivoDetalhesAtraso');
            if (input) input.value = '';
        }
    }

    async carregarProfessoresAtraso() {
        const container = document.getElementById('listaProfessoresAtraso');
        if (!container) return;

        try {
            const response = await fetch('/api/atraso-professor/professores', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();

            if (data.success) {
                this.atrasosState = this.atrasosState || {};
                this.atrasosState.professores = data.professores;
                this.renderizarListaProfessoresAtraso(data.professores);
            }
        } catch (error) {
            console.error('Erro ao carregar professores:', error);
            container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar</p></div>';
        }
    }

    renderizarListaProfessoresAtraso(lista) {
        const container = document.getElementById('listaProfessoresAtraso');
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
            <div class="professor-item" data-id="${p.id}" onclick="setorPedagogico.selecionarProfessorAtraso('${p.id}')">
                <div class="professor-avatar">${(p.nome || '?').charAt(0).toUpperCase()}</div>
                <div class="professor-info">
                    <div class="professor-nome">${this.escapeHtml(p.nome)}</div>
                    <div class="professor-detalhes">
                        <span><i class="fas fa-envelope"></i> ${this.escapeHtml(p.email || 'Sem email')}</span>
                        <span><i class="fas fa-phone"></i> ${p.telefone || 'N/A'}</span>
                        <span><i class="fas fa-sitemap"></i> ${this.escapeHtml(p.eixo || 'Sem eixo')}</span>
                    </div>
                </div>
            </div>
        `).join('');
    }

    filtrarProfessoresAtraso(termo) {
        if (!this.atrasosState || !this.atrasosState.professores) return;

        const termoLower = (termo || '').toLowerCase();
        let filtrados = this.atrasosState.professores;

        if (termoLower) {
            filtrados = filtrados.filter(p =>
                (p.nome || '').toLowerCase().includes(termoLower) ||
                (p.email || '').toLowerCase().includes(termoLower) ||
                (p.matricula || '').toLowerCase().includes(termoLower)
            );
        }

        this.renderizarListaProfessoresAtraso(filtrados);
    }

    selecionarProfessorAtraso(id) {
        if (!this.atrasosState || !this.atrasosState.professores) return;

        const professor = this.atrasosState.professores.find(p => p.id === id);
        if (!professor) return;

        this.atrasosState.professorSelecionado = professor;

        document.querySelectorAll('#listaProfessoresAtraso .professor-item').forEach(el => {
            el.classList.toggle('selected', el.dataset.id === id);
        });

        const box = document.getElementById('professorSelecionadoAtraso');
        if (box) {
            box.style.display = 'block';
            document.getElementById('avatarProfessorAtraso').textContent = (professor.nome || '?').charAt(0).toUpperCase();
            document.getElementById('nomeProfessorAtraso').textContent = professor.nome;
            document.getElementById('emailProfessorAtraso').textContent = professor.email || 'Sem email';
        }

        const lista = document.getElementById('listaProfessoresAtraso');
        if (lista) lista.style.display = 'none';

        const busca = document.getElementById('buscaProfessorAtraso');
        if (busca) busca.style.display = 'none';

        const card = document.getElementById('cardDetalhesAtraso');
        if (card) {
            card.style.display = 'block';
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        this.atualizarHorarioPreenchimentoAtraso();

        // 🔥 CORREÇÃO CRÍTICA: limpa interval anterior antes de criar novo
        if (this._intervaloHorarioAtraso) {
            clearInterval(this._intervaloHorarioAtraso);
        }
        this._intervaloHorarioAtraso = setInterval(() => this.atualizarHorarioPreenchimentoAtraso(), 1000);
    }

    limparProfessorAtraso() {
        if (this.atrasosState) {
            this.atrasosState.professorSelecionado = null;
        }

        const box = document.getElementById('professorSelecionadoAtraso');
        if (box) box.style.display = 'none';

        const lista = document.getElementById('listaProfessoresAtraso');
        if (lista) lista.style.display = 'block';

        const busca = document.getElementById('buscaProfessorAtraso');
        if (busca) {
            busca.style.display = 'block';
            busca.value = '';
        }

        const card = document.getElementById('cardDetalhesAtraso');
        if (card) card.style.display = 'none';

        document.querySelectorAll('#listaProfessoresAtraso .professor-item').forEach(el => {
            el.classList.remove('selected');
        });
    }

    atualizarHorarioPreenchimentoAtraso() {
        const el = document.getElementById('horarioPreenchimentoAtraso');
        if (el) {
            el.textContent = new Date().toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
        }
    }

    async carregarTurmasAtraso() {
        try {
            const response = await fetch('/api/atraso-professor/turmas', {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();

            if (data.success) {
                this.atrasosState = this.atrasosState || {};
                this.atrasosState.turmas = data.turmas;

                const options = data.turmas.map(t => `<option value="${this.escapeHtml(t)}">${this.escapeHtml(t)}</option>`).join('');

                const selectTurma = document.getElementById('selectTurmaAtraso');
                if (selectTurma) {
                    selectTurma.innerHTML = '<option value="">Selecione a turma...</option>' + options;
                }
            }
        } catch (error) {
            console.error('Erro ao carregar turmas:', error);
        }
    }

    async preencherSelectProfessoresAtraso() {
        if (!this.atrasosState || !this.atrasosState.professores) return;

        const select = document.getElementById('relatorioProfessorAtraso');
        if (!select) return;

        select.innerHTML = '<option value="">Todos os professores</option>' +
            this.atrasosState.professores.map(p =>
                `<option value="${p.id}">${this.escapeHtml(p.nome)}</option>`
            ).join('');
    }

    async registrarAtraso() {
        if (!this.atrasosState || !this.atrasosState.professorSelecionado) {
            this.showToast('⚠️ Selecione um professor', 'warning');
            return;
        }

        const data = document.getElementById('inputDataAtraso')?.value;
        const horario = document.getElementById('selectHorarioAtraso')?.value;

        if (!data) {
            this.showToast('⚠️ Informe a data', 'warning');
            return;
        }

        if (!horario) {
            this.showToast('⚠️ Selecione o horário', 'warning');
            return;
        }

        const btn = document.getElementById('btnRegistrarAtraso');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Registrando...';
        }

        try {
            const payload = {
                professorId: this.atrasosState.professorSelecionado.id,
                data,
                horario: parseInt(horario),
                horarioChegada: document.getElementById('inputHorarioChegadaAtraso')?.value || '',
                minutosAtraso: parseInt(document.getElementById('inputMinutosAtraso')?.value) || 0,
                turma: document.getElementById('selectTurmaAtraso')?.value || '',
                observacoes: document.getElementById('inputObservacoesAtraso')?.value || '',
                motivo: document.getElementById('selectMotivoAtraso')?.value || 'nao_justificado',
                motivoDetalhes: document.getElementById('inputMotivoDetalhesAtraso')?.value || ''
            };

            const response = await fetch('/api/atraso-professor/registrar', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('✅ Atraso registrado!', 'success');
                this.resetarFormularioAtraso();
                await this.carregarListaAtrasos();

                const listaTab = document.getElementById('atraso-lista-tab');
                if (listaTab) new bootstrap.Tab(listaTab).show();
            } else {
                throw new Error(result.error || 'Erro ao registrar');
            }
        } catch (error) {
            console.error('Erro:', error);
            this.showToast(error.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save me-2"></i> Registrar Atraso';
            }
        }
    }

    resetarFormularioAtraso() {
        if (this.atrasosState) {
            this.atrasosState.professorSelecionado = null;
        }

        const box = document.getElementById('professorSelecionadoAtraso');
        if (box) box.style.display = 'none';

        const lista = document.getElementById('listaProfessoresAtraso');
        if (lista) lista.style.display = 'block';

        const busca = document.getElementById('buscaProfessorAtraso');
        if (busca) {
            busca.style.display = 'block';
            busca.value = '';
        }

        const card = document.getElementById('cardDetalhesAtraso');
        if (card) card.style.display = 'none';

        const hoje = getDataLocalISO();
        const inputData = document.getElementById('inputDataAtraso');
        if (inputData) inputData.value = hoje;

        const selectHorario = document.getElementById('selectHorarioAtraso');
        if (selectHorario) selectHorario.value = '';

        const inputChegada = document.getElementById('inputHorarioChegadaAtraso');
        if (inputChegada) inputChegada.value = '';

        const inputMinutos = document.getElementById('inputMinutosAtraso');
        if (inputMinutos) inputMinutos.value = '';

        const selectTurma = document.getElementById('selectTurmaAtraso');
        if (selectTurma) selectTurma.value = '';

        const selectMotivo = document.getElementById('selectMotivoAtraso');
        if (selectMotivo) selectMotivo.value = 'nao_justificado';

        const inputDetalhes = document.getElementById('inputMotivoDetalhesAtraso');
        if (inputDetalhes) inputDetalhes.value = '';

        const inputObs = document.getElementById('inputObservacoesAtraso');
        if (inputObs) inputObs.value = '';

        const grupo = document.getElementById('grupoMotivoDetalhesAtraso');
        if (grupo) grupo.style.display = 'none';

        if (this.atrasosState && this.atrasosState.professores) {
            this.renderizarListaProfessoresAtraso(this.atrasosState.professores);
        }
    }

    async carregarListaAtrasos() {
        const container = document.getElementById('listaAtrasos');
        if (!container) return;

        container.innerHTML = '<div class="text-center py-3"><div class="loading"></div><p>Carregando...</p></div>';

        try {
            const params = new URLSearchParams();
            const mes = document.getElementById('filtroMesAtraso')?.value;
            const busca = document.getElementById('filtroBuscaAtraso')?.value;
            const motivo = document.getElementById('filtroMotivoAtraso')?.value;
            const dataInicio = document.getElementById('filtroDataInicioAtraso')?.value;

            if (mes) params.append('mes', mes);
            if (busca) params.append('busca', busca);
            if (motivo) params.append('motivo', motivo);
            if (dataInicio) params.append('dataInicio', dataInicio);

            const response = await fetch(`/api/atraso-professor/listar?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();

            if (data.success) {
                this.atrasosState = this.atrasosState || {};
                this.atrasosState.atrasos = data.atrasos;

                this.renderizarListaAtrasos(data.atrasos);

                const contador = document.getElementById('contadorListaAtrasos');
                if (contador) contador.textContent = `${data.total} registro${data.total !== 1 ? 's' : ''}`;

                const badge = document.getElementById('badgeTotalAtrasos');
                if (badge) badge.textContent = data.total;
            }
        } catch (error) {
            console.error('Erro:', error);
            container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar</p></div>';
        }
    }

    renderizarListaAtrasos(lista) {
        const container = document.getElementById('listaAtrasos');
        if (!container) return;

        if (lista.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-inbox"></i>
                    <h4>Nenhum atraso encontrado</h4>
                    <p>Registre o primeiro atraso ou ajuste os filtros.</p>
                </div>
            `;
            return;
        }

        const MOTIVOS_CORES = {
            'nao_justificado': '#ef4444',
            'problema_transporte': '#f59e0b',
            'problema_pessoal': '#8b5cf6',
            'problema_saude': '#dc2626',
            'transito': '#3b82f6',
            'clima': '#06b6d4',
            'outros': '#64748b'
        };

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Horário</th>
                            <th>Professor</th>
                            <th>Turma</th>
                            <th>Minutos</th>
                            <th>Motivo</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lista.map(a => `
                            <tr>
                                <td>
                                    <strong>${a.dataFormatada}</strong>
                                    <br><small style="color:#6b7280;">${a.diaSemana}</small>
                                </td>
                                <td>
                                    <span class="badge-custom badge-primary">${a.horario}º Horário</span>
                                    ${a.horarioChegada ? `<br><small>Chegou: ${a.horarioChegada}</small>` : ''}
                                </td>
                                <td>
                                    <strong>${this.escapeHtml(a.professorNome)}</strong>
                                    <br><small style="color:#6b7280;">${this.escapeHtml(a.professorEixo || '')}</small>
                                </td>
                                <td>${a.turma ? `<span class="badge-custom badge-gray">${this.escapeHtml(a.turma)}</span>` : '-'}</td>
                                <td>
                                    ${a.minutosAtraso > 0
                                        ? `<span class="badge-custom" style="background: #fee2e2; color: #dc2626;">${a.minutosAtraso} min</span>`
                                        : '-'
                                    }
                                </td>
                                <td>
                                    <span class="badge-custom" style="background:${(MOTIVOS_CORES[a.motivo] || '#64748b')}20; color:${MOTIVOS_CORES[a.motivo] || '#64748b'};">
                                        ${a.motivoLabel}
                                    </span>
                                </td>
                                <td>
                                    <div class="action-buttons">
                                        <button class="btn-action btn-view" onclick="setorPedagogico.verDetalhesAtraso('${a.id}')" title="Ver">
                                            <i class="fas fa-eye"></i>
                                        </button>
                                        <button class="btn-action btn-edit" onclick="setorPedagogico.abrirEdicaoAtraso('${a.id}')" title="Editar">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn-action btn-delete" onclick="setorPedagogico.excluirAtraso('${a.id}')" title="Excluir">
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
    }

    limparFiltrosAtraso() {
        const mes = document.getElementById('filtroMesAtraso');
        if (mes) mes.value = new Date().toISOString().substring(0, 7);

        const busca = document.getElementById('filtroBuscaAtraso');
        if (busca) busca.value = '';

        const motivo = document.getElementById('filtroMotivoAtraso');
        if (motivo) motivo.value = '';

        const dataInicio = document.getElementById('filtroDataInicioAtraso');
        if (dataInicio) dataInicio.value = '';

        this.carregarListaAtrasos();
    }

    async verDetalhesAtraso(id) {
        try {
            const response = await fetch(`/api/atraso-professor/${id}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();

            if (!data.success) {
                this.showToast('Atraso não encontrado', 'error');
                return;
            }

            const a = data.atraso;

            const MOTIVOS_LABELS = {
                'nao_justificado': 'Não Justificado',
                'problema_transporte': 'Problema de Transporte',
                'problema_pessoal': 'Problema Pessoal',
                'problema_saude': 'Problema de Saúde',
                'transito': 'Trânsito',
                'clima': 'Condições Climáticas',
                'outros': 'Outros'
            };

            const modalHtml = `
                <div class="modal fade" id="modalDetalhesAtraso" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header" style="background: linear-gradient(135deg, #1e3c72, #2a5298); color: white;">
                                <h5 class="modal-title"><i class="fas fa-clock me-2"></i> Detalhes do Atraso</h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div style="background: #f0f4ff; padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                                    <div style="display: flex; align-items: center; gap: 15px;">
                                        <div style="width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, #1e3c72, #2a5298); color: white; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700;">
                                            ${(a.professorNome || '?').charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div style="font-weight: 700; font-size: 18px;">${this.escapeHtml(a.professorNome)}</div>
                                            <div style="font-size: 13px; color: #6b7280;">${this.escapeHtml(a.professorEmail || '')}</div>
                                            ${a.professorEixo ? `<div style="font-size: 12px; color: #6b7280; margin-top: 3px;"><i class="fas fa-sitemap"></i> ${this.escapeHtml(a.professorEixo)}</div>` : ''}
                                        </div>
                                    </div>
                                </div>

                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                    <div><strong>Data:</strong> ${new Date(a.data + 'T12:00:00').toLocaleDateString('pt-BR')} (${a.diaSemana})</div>
                                    <div><strong>Horário:</strong> ${a.horario}º Horário</div>
                                    ${a.horarioChegada ? `<div><strong>Chegada:</strong> ${a.horarioChegada}</div>` : ''}
                                    ${a.minutosAtraso ? `<div><strong>Minutos:</strong> ${a.minutosAtraso} min</div>` : ''}
                                    ${a.turma ? `<div><strong>Turma:</strong> ${this.escapeHtml(a.turma)}</div>` : ''}
                                    <div><strong>Motivo:</strong> ${MOTIVOS_LABELS[a.motivo] || a.motivo}</div>
                                </div>

                                ${a.observacoes ? `
                                    <div style="margin-top: 15px;">
                                        <strong>Observações:</strong>
                                        <div style="background: #f9fafb; padding: 15px; border-radius: 10px; margin-top: 5px;">
                                            ${this.escapeHtml(a.observacoes)}
                                        </div>
                                    </div>
                                ` : ''}

                                ${a.motivoDetalhes ? `
                                    <div style="margin-top: 15px;">
                                        <strong>Detalhes do Motivo:</strong>
                                        <div style="background: #f9fafb; padding: 15px; border-radius: 10px; margin-top: 5px;">
                                            ${this.escapeHtml(a.motivoDetalhes)}
                                        </div>
                                    </div>
                                ` : ''}

                                <div style="background: #f0fdf4; padding: 15px; border-radius: 10px; margin-top: 20px; font-size: 13px;">
                                    <i class="fas fa-user-check" style="color: #10b981;"></i>
                                    Registrado por <strong>${this.escapeHtml(a.registradoPorNome)}</strong>
                                    em ${new Date(a.registradoEm).toLocaleString('pt-BR')}
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const oldModal = document.getElementById('modalDetalhesAtraso');
            if (oldModal) oldModal.remove();

            document.body.insertAdjacentHTML('beforeend', modalHtml);
            new bootstrap.Modal(document.getElementById('modalDetalhesAtraso')).show();

        } catch (error) {
            console.error('Erro:', error);
            this.showToast('Erro ao carregar detalhes', 'error');
        }
    }

    async abrirEdicaoAtraso(id) {
        try {
            const response = await fetch(`/api/atraso-professor/${id}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();

            if (!data.success) return;

            const a = data.atraso;
            this.atrasosState = this.atrasosState || {};
            this.atrasosState.editandoId = id;

            const MOTIVOS_LABELS = {
                'nao_justificado': 'Não Justificado',
                'problema_transporte': 'Problema de Transporte',
                'problema_pessoal': 'Problema Pessoal',
                'problema_saude': 'Problema de Saúde',
                'transito': 'Trânsito',
                'clima': 'Condições Climáticas',
                'outros': 'Outros'
            };

            const motivosOptions = Object.entries(MOTIVOS_LABELS).map(([key, label]) =>
                `<option value="${key}" ${a.motivo === key ? 'selected' : ''}>${label}</option>`
            ).join('');

            const turmasOptions = (this.atrasosState.turmas || []).map(t =>
                `<option value="${this.escapeHtml(t)}" ${t === a.turma ? 'selected' : ''}>${this.escapeHtml(t)}</option>`
            ).join('');

            let horariosOptions = '';
            for (let i = 1; i <= 9; i++) {
                horariosOptions += `<option value="${i}" ${a.horario === i ? 'selected' : ''}>${i}º Horário</option>`;
            }

            const modalHtml = `
                <div class="modal fade" id="modalEditarAtraso" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header" style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white;">
                                <h5 class="modal-title"><i class="fas fa-edit me-2"></i> Editar Atraso</h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div style="background: #f0f4ff; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
                                    <strong>${this.escapeHtml(a.professorNome)}</strong>
                                    <br><small>${this.escapeHtml(a.professorEmail || '')}</small>
                                </div>

                                <div class="row g-3">
                                    <div class="col-md-4">
                                        <label class="form-label">Data</label>
                                        <input type="date" id="editDataAtraso" class="form-control" value="${a.data}">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">Horário</label>
                                        <select id="editHorarioAtraso" class="form-select">${horariosOptions}</select>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">Horário Chegada</label>
                                        <input type="time" id="editHorarioChegadaAtraso" class="form-control" value="${a.horarioChegada || ''}">
                                    </div>
                                </div>

                                <div class="row g-3 mt-3">
                                    <div class="col-md-4">
                                        <label class="form-label">Minutos de Atraso</label>
                                        <input type="number" id="editMinutosAtraso" class="form-control" min="0" max="300" value="${a.minutosAtraso || 0}">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">Turma</label>
                                        <select id="editTurmaAtraso" class="form-select">
                                            <option value="">Sem turma</option>
                                            ${turmasOptions}
                                        </select>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">Motivo</label>
                                        <select id="editMotivoAtraso" class="form-select">${motivosOptions}</select>
                                    </div>
                                </div>

                                <div class="mt-3">
                                    <label class="form-label">Detalhes do Motivo</label>
                                    <input type="text" id="editMotivoDetalhesAtraso" class="form-control" value="${this.escapeHtml(a.motivoDetalhes || '')}">
                                </div>

                                <div class="mt-3">
                                    <label class="form-label">Observações</label>
                                    <textarea id="editObservacoesAtraso" class="form-control" rows="3">${this.escapeHtml(a.observacoes || '')}</textarea>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                                <button class="btn btn-primary" onclick="setorPedagogico.salvarEdicaoAtraso()">
                                    <i class="fas fa-save me-2"></i> Salvar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const oldModal = document.getElementById('modalEditarAtraso');
            if (oldModal) oldModal.remove();

            document.body.insertAdjacentHTML('beforeend', modalHtml);
            new bootstrap.Modal(document.getElementById('modalEditarAtraso')).show();

        } catch (error) {
            console.error('Erro:', error);
            this.showToast('Erro ao carregar atraso', 'error');
        }
    }

    async salvarEdicaoAtraso() {
        if (!this.atrasosState || !this.atrasosState.editandoId) return;

        const dados = {
            data: document.getElementById('editDataAtraso')?.value,
            horario: parseInt(document.getElementById('editHorarioAtraso')?.value),
            horarioChegada: document.getElementById('editHorarioChegadaAtraso')?.value || '',
            minutosAtraso: parseInt(document.getElementById('editMinutosAtraso')?.value) || 0,
            turma: document.getElementById('editTurmaAtraso')?.value || '',
            motivo: document.getElementById('editMotivoAtraso')?.value,
            motivoDetalhes: document.getElementById('editMotivoDetalhesAtraso')?.value || '',
            observacoes: document.getElementById('editObservacoesAtraso')?.value || ''
        };

        if (!dados.data || !dados.horario) {
            this.showToast('Preencha data e horário', 'warning');
            return;
        }

        try {
            const response = await fetch(`/api/atraso-professor/${this.atrasosState.editandoId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dados)
            });

            const result = await response.json();

            if (result.success) {
                this.showToast('✅ Atraso atualizado!', 'success');
                bootstrap.Modal.getInstance(document.getElementById('modalEditarAtraso'))?.hide();
                await this.carregarListaAtrasos();
                await this.carregarDashboardAtrasos();
            } else {
                throw new Error(result.error || 'Erro ao atualizar');
            }
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    }

    async excluirAtraso(id) {
        const confirmar = await this.confirmarAcao('⚠️ Tem certeza que deseja excluir este registro de atraso?\n\nEsta ação não pode ser desfeita.');
        if (!confirmar) return;

        try {
            const response = await fetch(`/api/atraso-professor/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('✅ Atraso excluído!', 'success');
                await this.carregarListaAtrasos();
                await this.carregarDashboardAtrasos();
            }
        } catch (error) {
            this.showToast('Erro ao excluir', 'error');
        }
    }

    async carregarDashboardAtrasos() {
        try {
            const mes = document.getElementById('dashboardMesAtraso')?.value || new Date().toISOString().substring(0, 7);

            const response = await fetch(`/api/atraso-professor/dashboard/resumo?mes=${mes}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();

            if (!data.success) return;

            this.safeSetText('atrasoStatTotalMes', data.resumo.totalMes || 0);
            this.safeSetText('atrasoStatMediaDiaria', data.resumo.mediaDiaria || 0);
            this.safeSetText('atrasoStatProfessores', data.professoresMaisAtrasam?.length || 0);
            this.safeSetText('atrasoStatTotalMinutos', data.resumo.totalFormatado || '0min');

            this.renderizarGraficosAtrasos(data, mes);
            this.renderizarRankingAtrasos(data.professoresMaisAtrasam);
            this.renderizarUltimosAtrasos(data.ultimosAtrasos);

        } catch (error) {
            console.error('Erro no dashboard de atrasos:', error);
        }
    }

    renderizarGraficosAtrasos(data, mes) {
        const MOTIVOS_CORES = {
            'nao_justificado': '#ef4444',
            'problema_transporte': '#f59e0b',
            'problema_pessoal': '#8b5cf6',
            'problema_saude': '#dc2626',
            'transito': '#3b82f6',
            'clima': '#06b6d4',
            'outros': '#64748b'
        };

        const HORARIOS_CORES = [
            '#6366f1', '#7c3aed', '#8b5cf6', '#a855f7', '#d946ef',
            '#ec4899', '#f43f5e', '#f97316', '#f59e0b'
        ];

        const ctxMotivos = document.getElementById('atrasoChartMotivos');
        if (ctxMotivos) {
            if (this.atrasosState.charts?.motivos) {
                try { this.atrasosState.charts.motivos.destroy(); } catch(e){}
            }

            this.atrasosState = this.atrasosState || {};
            this.atrasosState.charts = this.atrasosState.charts || {};

            this.atrasosState.charts.motivos = new Chart(ctxMotivos.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: data.porMotivo.map(d => d.label),
                    datasets: [{
                        data: data.porMotivo.map(d => d.count),
                        backgroundColor: data.porMotivo.map(d => MOTIVOS_CORES[d.motivo] || '#64748b'),
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    cutout: '60%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { padding: 12, usePointStyle: true, font: { size: 11 } }
                        }
                    }
                }
            });
        }

        const ctxHorarios = document.getElementById('atrasoChartHorarios');
        if (ctxHorarios) {
            if (this.atrasosState.charts?.horarios) {
                try { this.atrasosState.charts.horarios.destroy(); } catch(e){}
            }

            const horarios = [];
            for (let i = 1; i <= 9; i++) {
                const enc = data.porHorario.find(d => d.horario === i);
                horarios.push(enc ? enc.count : 0);
            }

            this.atrasosState.charts.horarios = new Chart(ctxHorarios.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: ['1º', '2º', '3º', '4º', '5º', '6º', '7º', '8º', '9º'],
                    datasets: [{
                        label: 'Atrasos',
                        data: horarios,
                        backgroundColor: HORARIOS_CORES,
                        borderRadius: 6,
                        maxBarThickness: 40
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } }
                    }
                }
            });
        }

        const ctxDias = document.getElementById('atrasoChartDias');
        if (ctxDias) {
            if (this.atrasosState.charts?.dias) {
                try { this.atrasosState.charts.dias.destroy(); } catch(e){}
            }

            const [ano, mesNum] = mes.split('-').map(Number);
            const ultimoDia = new Date(ano, mesNum, 0).getDate();
            const labels = [];
            const valores = [];

            for (let i = 1; i <= ultimoDia; i++) {
                labels.push(i);
                const diaStr = `${mes}-${String(i).padStart(2, '0')}`;
                const enc = data.atrasosPorDia.find(d => d.data === diaStr);
                valores.push(enc ? enc.count : 0);
            }

            const gradiente = ctxDias.getContext('2d').createLinearGradient(0, 0, 0, 300);
            gradiente.addColorStop(0, 'rgba(220, 38, 38, 0.4)');
            gradiente.addColorStop(1, 'rgba(220, 38, 38, 0.02)');

            this.atrasosState.charts.dias = new Chart(ctxDias.getContext('2d'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Atrasos',
                        data: valores,
                        borderColor: '#dc2626',
                        backgroundColor: gradiente,
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointRadius: valores.map(v => v > 0 ? 5 : 2),
                        pointBackgroundColor: valores.map(v => v > 0 ? '#dc2626' : '#cbd5e1')
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1, precision: 0 } }
                    }
                }
            });
        }
    }

    renderizarRankingAtrasos(lista) {
        const container = document.getElementById('atrasoRankingProfessores');
        if (!container) return;

        if (!lista || lista.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 30px;">
                    <i class="fas fa-trophy" style="font-size: 32px; opacity: 0.5;"></i>
                    <p>Nenhum dado disponível</p>
                </div>
            `;
            return;
        }

        container.innerHTML = lista.map((p, i) => {
            const posClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
            const medalha = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';

            return `
                <div class="ranking-item">
                    <div class="ranking-position ${posClass}">
                        ${medalha || (i + 1)}
                    </div>
                    <div class="ranking-info">
                        <div class="ranking-nome">${this.escapeHtml(p.nome)}</div>
                        <div class="ranking-detalhes">
                            ${this.escapeHtml(p.eixo || 'Sem eixo')}
                            ${p.totalMinutos ? ` • ${p.totalMinutos} min` : ''}
                        </div>
                    </div>
                    <div class="ranking-count">${p.count}</div>
                </div>
            `;
        }).join('');
    }

    renderizarUltimosAtrasos(lista) {
        const container = document.getElementById('atrasoUltimosRegistros');
        if (!container) return;

        if (!lista || lista.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #9ca3af;">
                    <i class="fas fa-history" style="font-size: 32px; opacity: 0.5;"></i>
                    <p>Nenhum atraso recente</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Horário</th>
                            <th>Professor</th>
                            <th>Minutos</th>
                            <th>Motivo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lista.map(a => `
                            <tr>
                                <td>${a.dataFormatada}</td>
                                <td>${a.horario}º</td>
                                <td>${this.escapeHtml(a.professorNome)}</td>
                                <td>${a.minutosAtraso > 0 ? `${a.minutosAtraso} min` : '-'}</td>
                                <td><span class="badge-custom badge-warning">${a.motivoLabel}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    async gerarRelatorioAtrasos() {
        const container = document.getElementById('resultadoRelatorioAtrasos');
        if (!container) return;

        container.innerHTML = '<div class="text-center py-5"><div class="loading"></div><p>Gerando relatório...</p></div>';

        try {
            const params = new URLSearchParams();
            const mes = document.getElementById('relatorioMesAtraso')?.value;
            const dataInicio = document.getElementById('relatorioDataInicioAtraso')?.value;
            const dataFim = document.getElementById('relatorioDataFimAtraso')?.value;
            const professorId = document.getElementById('relatorioProfessorAtraso')?.value;
            const motivo = document.getElementById('relatorioMotivoAtraso')?.value;

            if (mes) params.append('mes', mes);
            if (dataInicio) params.append('dataInicio', dataInicio);
            if (dataFim) params.append('dataFim', dataFim);
            if (professorId) params.append('professorId', professorId);
            if (motivo) params.append('motivo', motivo);

            const response = await fetch(`/api/atraso-professor/relatorio/gerar?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();

            if (!data.success) throw new Error(data.error);

            this.atrasosState = this.atrasosState || {};
            this.atrasosState.relatorioAtual = data;

            const btnCSV = document.getElementById('btnExportarCSVAtraso');
            if (btnCSV) btnCSV.disabled = false;
            const btnPDF = document.getElementById('btnImprimirRelatorioAtraso');
            if (btnPDF) btnPDF.disabled = false;

            let html = `
                <div class="card">
                    <div class="card-body">
                        <h6><i class="fas fa-chart-bar me-2"></i> Resultado do Relatório</h6>

                        <div class="row mt-3">
                            <div class="col-md-4 mb-3">
                                <div class="metric-card">
                                    <div class="metric-value">${data.total}</div>
                                    <div class="metric-label">Total de Atrasos</div>
                                </div>
                            </div>
                            <div class="col-md-4 mb-3">
                                <div class="metric-card">
                                    <div class="metric-value">${data.totalFormatado}</div>
                                    <div class="metric-label">Tempo Total</div>
                                </div>
                            </div>
                            <div class="col-md-4 mb-3">
                                <div class="metric-card">
                                    <div class="metric-value">${Object.keys(data.estatisticas.porProfessor).length}</div>
                                    <div class="metric-label">Professores</div>
                                </div>
                            </div>
                        </div>
            `;

            if (Object.keys(data.estatisticas.porMotivo).length > 0) {
                html += `<h6 style="margin-top:20px;">Por Motivo</h6><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">`;
                Object.entries(data.estatisticas.porMotivo).forEach(([k, v]) => {
                    html += `<span class="badge-custom badge-gray" style="padding:8px 14px;">${k}: <strong>${v}</strong></span>`;
                });
                html += `</div>`;
            }

            if (data.atrasos.length > 0) {
                html += `
                    <h6 style="margin-top:20px;">Detalhamento</h6>
                    <div class="table-responsive" style="margin-top:10px;">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>Data</th>
                                    <th>Horário</th>
                                    <th>Professor</th>
                                    <th>Turma</th>
                                    <th>Minutos</th>
                                    <th>Motivo</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.atrasos.map(a => `
                                    <tr>
                                        <td>${a.dataFormatada}</td>
                                        <td>${a.horario}º</td>
                                        <td>${this.escapeHtml(a.professorNome)}</td>
                                        <td>${this.escapeHtml(a.turma || '-')}</td>
                                        <td>${a.minutosAtraso > 0 ? `${a.minutosAtraso} min` : '-'}</td>
                                        <td>${this.escapeHtml(a.motivoLabel)}</td>
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
    }

    exportarCSVAtrasos() {
        const data = this.atrasosState?.relatorioAtual;
        if (!data || !data.atrasos || data.atrasos.length === 0) {
            this.showToast('⚠️ Gere um relatório primeiro', 'warning');
            return;
        }

        const registros = data.atrasos;

        // ---------- Colunas ----------
        const colunas = [
            {
                label: 'Data',
                format: (a) => a.dataFormatada
                    || (a.data ? new Date(a.data + 'T12:00:00').toLocaleDateString('pt-BR') : '')
            },
            {
                label: 'Dia da Semana',
                format: (a) => a.diaSemana || ''
            },
            {
                label: 'Horário',
                format: (a) => a.horario ? `${a.horario}º Horário` : ''
            },
            {
                label: 'Horário de Chegada',
                format: (a) => a.horarioChegada || ''
            },
            {
                label: 'Professor',
                format: (a) => a.professorNome || ''
            },
            {
                label: 'Matrícula',
                format: (a) => a.professorMatricula || ''
            },
            {
                label: 'Email',
                format: (a) => a.professorEmail || ''
            },
            {
                label: 'Eixo',
                format: (a) => a.professorEixo || ''
            },
            {
                label: 'Turma',
                format: (a) => a.turma || ''
            },
            {
                label: 'Minutos de Atraso',
                format: (a) => (a.minutosAtraso && a.minutosAtraso > 0)
                    ? `${a.minutosAtraso} min`
                    : '0'
            },
            {
                label: 'Motivo',
                format: (a) => a.motivoLabel || ''
            },
            {
                label: 'Detalhes do Motivo',
                format: (a) => a.motivoDetalhes || ''
            },
            {
                label: 'Observações',
                format: (a) => a.observacoes || ''
            },
            {
                label: 'Registrado por',
                format: (a) => a.registradoPorNome || ''
            },
            {
                label: 'Data de Registro',
                format: (a) => a.registradoEm
                    ? new Date(a.registradoEm).toLocaleString('pt-BR')
                    : ''
            }
        ];

        // ---------- Filtros aplicados ----------
        const filtros = [];
        const mes = document.getElementById('relatorioMesAtraso')?.value;
        const dI = document.getElementById('relatorioDataInicioAtraso')?.value;
        const dF = document.getElementById('relatorioDataFimAtraso')?.value;
        const professorId = document.getElementById('relatorioProfessorAtraso')?.value;
        const motivo = document.getElementById('relatorioMotivoAtraso')?.value;

        if (mes) filtros.push({ label: 'Mês', valor: mes });
        if (dI) filtros.push({ label: 'Data inicial', valor: dI });
        if (dF) filtros.push({ label: 'Data final', valor: dF });
        if (professorId) {
            const prof = this.atrasosState?.professores?.find(p => p.id === professorId);
            filtros.push({ label: 'Professor', valor: prof?.nome || professorId });
        }
        if (motivo) filtros.push({ label: 'Motivo', valor: motivo });

        // ---------- Métricas ----------
        const totalMinutos = registros.reduce((acc, a) => acc + (a.minutosAtraso || 0), 0);
        const totalFormatado = totalMinutos < 60
            ? `${totalMinutos}min`
            : `${Math.floor(totalMinutos / 60)}h ${totalMinutos % 60}min`;

        const ok = this.gerarBaixarCSV({
            titulo: 'Relatório de Atrasos de Professores',
            subtitulo: 'Registros de atrasos do corpo docente',
            setor: 'Setor Pedagógico',
            colunas,
            registros,
            filtros,
            metricas: {
                'Total de atrasos': registros.length,
                'Tempo total': totalFormatado,
                'Professores envolvidos': new Set(registros.map(a => a.professorId).filter(Boolean)).size,
                'Turmas envolvidas': new Set(registros.map(a => a.turma).filter(Boolean)).size
            },
            nomeArquivo: 'relatorio-atrasos-professores',
            observacoes: `${registros.length} atraso(s) registrado(s)`
        });

        if (ok) {
            this.showToast(`✅ CSV exportado (${registros.length} atraso(s))!`, 'success');
        }
    }

    imprimirRelatorioAtrasos() {
        const data = this.atrasosState?.relatorioAtual;
        if (!data || data.atrasos.length === 0) {
            this.showToast('Gere um relatório primeiro', 'warning');
            return;
        }

        const html = `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>Relatório de Atrasos</title>
                <style>
                    @page { size: A4 landscape; margin: 10mm; }
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body { font-family: Arial, sans-serif; font-size: 10pt; }
                    .header { text-align: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #1e3c72; }
                    .header h1 { font-size: 16pt; color: #1e3c72; }
                    .header h2 { font-size: 12pt; font-weight: normal; margin-top: 5px; }
                    .stats { display: flex; gap: 20px; margin-bottom: 20px; padding: 15px; background: #f0f4ff; border-radius: 8px; }
                    .stat { text-align: center; flex: 1; }
                    .stat-value { font-size: 24pt; font-weight: bold; color: #1e3c72; }
                    .stat-label { font-size: 9pt; color: #666; }
                    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
                    th { background: #1e3c72; color: white; padding: 8px; text-align: left; }
                    td { padding: 6px 8px; border-bottom: 1px solid #ddd; }
                    tr:nth-child(even) { background: #f9fafb; }
                    .footer { margin-top: 20px; text-align: center; font-size: 8pt; color: #666; }
                    .btn-print { display: block; margin: 20px auto; padding: 12px 30px; background: #1e3c72; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; }
                    @media print { .no-print { display: none; } }
                </style>
            </head>
            <body>
                <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
                <div class="header">
                    <h1>IEMA Pleno: São Luís - Centro</h1>
                    <h2>Relatório de Atrasos de Professores</h2>
                    <p style="font-size: 9pt; margin-top: 5px;">Gerado em ${new Date().toLocaleString('pt-BR')}</p>
                </div>
                <div class="stats">
                    <div class="stat"><div class="stat-value">${data.total}</div><div class="stat-label">Total de Atrasos</div></div>
                    <div class="stat"><div class="stat-value">${data.totalFormatado}</div><div class="stat-label">Tempo Total</div></div>
                    <div class="stat"><div class="stat-value">${Object.keys(data.estatisticas.porProfessor).length}</div><div class="stat-label">Professores</div></div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Dia</th>
                            <th>Horário</th>
                            <th>Professor</th>
                            <th>Turma</th>
                            <th>Minutos</th>
                            <th>Motivo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.atrasos.map(a => `
                            <tr>
                                <td>${a.dataFormatada}</td>
                                <td>${a.diaSemana || '-'}</td>
                                <td>${a.horario}º</td>
                                <td>${this.escapeHtml(a.professorNome)}</td>
                                <td>${this.escapeHtml(a.turma || '-')}</td>
                                <td>${a.minutosAtraso > 0 ? `${a.minutosAtraso} min` : '-'}</td>
                                <td>${this.escapeHtml(a.motivoLabel)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="footer">
                    <p>EducaPleno - Setor Pedagógico</p>
                </div>
            </body>
            </html>
        `;

        const win = window.open('', '_blank');
        win.document.write(html);
        win.document.close();
        win.onload = () => setTimeout(() => win.print(), 500);
    }

    // ============================================================================
    // 📢 NOTIFICAÇÕES
    // ============================================================================
    async carregarNotificacoes() {
        // 🔒 Lock: evita chamadas empilhadas
        if (this._carregandoNotif) {
            console.log('⏭️ Notificações já em andamento — skip');
            return;
        }

        // 🔥 Cache 60s
        const agora = Date.now();
        if (this._notifCache && (agora - this._notifCache.ts) < 60000) {
            return;
        }

        this._carregandoNotif = true;

        try {
            // 🚀 As duas chamadas em paralelo
            const [countRes, listRes] = await Promise.allSettled([
                fetch('/api/notificacoes/nao-lidas/contador', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                }),
                fetch('/api/notificacoes?limite=20', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                })
            ]);

            if (countRes.status === 'fulfilled' && countRes.value.ok) {
                const countData = await countRes.value.json();
                this.atualizarBadgesNotificacoes(countData.count || 0);
            }

            if (listRes.status === 'fulfilled') {
                const data = await listRes.value.json();
                if (data.success) {
                    this.notificacoes = data.notificacoes || [];
                    this.renderizarNotificacoes();
                }
            }

            this._notifCache = { ts: agora };
        } catch (error) {
            console.error('Erro ao carregar notificações:', error);
        } finally {
            this._carregandoNotif = false;
        }
    }

    atualizarBadgesNotificacoes(total) {
        const badge = document.getElementById('notificacaoBadge');
        if (badge) {
            if (total > 0) {
                badge.textContent = total > 99 ? '99+' : total;
                badge.style.display = 'inline';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    renderizarNotificacoes() {
        const list = document.getElementById('notificacoesList');
        if (!list) return;

        if (!this.notificacoes || this.notificacoes.length === 0) {
            list.innerHTML = `<div class="empty-notificacoes"><i class="fas fa-bell-slash"></i><p>Nenhuma notificação</p></div>`;
            return;
        }

        let html = '';
        this.notificacoes.slice(0, 10).forEach(notif => {
            const data = new Date(notif.createdAt);
            const agora = new Date();
            const diffMin = Math.floor((agora - data) / 60000);
            let tempoTexto = diffMin < 1 ? 'agora mesmo' :
                diffMin < 60 ? `há ${diffMin} min` :
                diffMin < 1440 ? `há ${Math.floor(diffMin / 60)} h` :
                `há ${Math.floor(diffMin / 1440)} d`;

            const naoLida = !notif.lida ? 'nao-lida' : '';

            html += `
                <div class="notificacao-item ${naoLida}" data-id="${notif._id}" onclick="setorPedagogico.verNotificacao('${notif._id}')">
                    <div class="notificacao-titulo">
                        <span class="notificacao-icone" style="background: ${notif.cor || '#3498db'}20; color: ${notif.cor || '#3498db'};">
                            <i class="fas ${notif.icone || 'fa-bell'}"></i>
                        </span>
                        ${notif.titulo || 'Notificação'}
                    </div>
                    <div class="notificacao-mensagem">${notif.mensagem || ''}</div>
                    <div class="notificacao-tempo"><i class="far fa-clock"></i> ${tempoTexto}</div>
                    <div class="notificacao-actions">
                        <button onclick="event.stopPropagation(); setorPedagogico.marcarLida('${notif._id}')" title="Marcar como lida">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="delete" onclick="event.stopPropagation(); setorPedagogico.excluirNotificacao('${notif._id}')" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        list.innerHTML = html;
    }

    abrirPainelNotificacoes() {
        const panel = document.getElementById('notificacoesPanel');
        if (panel) {
            panel.classList.toggle('active');
            this.carregarNotificacoes();
        }
    }

    fecharPainelNotificacoes() {
        const panel = document.getElementById('notificacoesPanel');
        if (panel) panel.classList.remove('active');
    }

    async marcarLida(id) {
        try {
            const response = await fetch(`/api/notificacoes/${id}/lida`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();
            if (data.success) await this.carregarNotificacoes();
        } catch (error) {
            console.error('Erro ao marcar como lida:', error);
        }
    }

    async marcarTodasLidas() {
        try {
            const response = await fetch('/api/notificacoes/marcar-todas-lidas', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();
            if (data.success) {
                await this.carregarNotificacoes();
                this.showToast('✅ Todas notificações marcadas como lidas', 'success');
            }
        } catch (error) {
            console.error('Erro ao marcar todas como lidas:', error);
        }
    }

    async excluirNotificacao(id) {
        try {
            const response = await fetch(`/api/notificacoes/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${this.token}` }
            });
            const data = await response.json();
            if (data.success) {
                await this.carregarNotificacoes();
                this.showToast('✅ Notificação excluída', 'success');
            }
        } catch (error) {
            console.error('Erro ao excluir notificação:', error);
        }
    }

    async verNotificacao(id) {
        await this.marcarLida(id);
        const notif = this.notificacoes.find(n => n._id === id);
        if (notif && notif.link) window.location.href = notif.link;
    }

    // ============================================================================
    // ♿ ADAPTAR DOCUMENTO (permanece global no Setor Pedagógico)
    // ============================================================================
    async abrirModalUploadAdaptarDocumento() {
        let modal = document.getElementById('modalAdaptacaoDocumento');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'modalAdaptacaoDocumento';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered" style="max-width: 600px; margin: auto;">
                <div class="modal-content" style="border-radius: 24px; overflow: hidden; max-height: 85vh; display: flex; flex-direction: column;">
                    <div class="modal-header" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; padding: 20px 25px; border: none; flex-shrink: 0;">
                        <h5 class="modal-title fw-bold" style="display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-universal-access"></i> Adaptar Documento
                        </h5>
                        <button type="button" class="btn-close btn-close-white" onclick="setorPedagogico.fecharModalAdaptacaoDocumento()"></button>
                    </div>

                    <div style="flex: 1; overflow-y: auto; padding: 25px;">
                        <div class="upload-area"
                            onclick="document.getElementById('fileInputAdaptarSetor').click()"
                            ondrop="setorPedagogico.handleDropAdaptar(event)"
                            ondragover="setorPedagogico.handleDragOverAdaptar(event)"
                            style="background: #f8fafc; border: 3px dashed #cbd5e0; border-radius: 16px; padding: 40px; text-align: center; cursor: pointer; transition: all 0.3s;">
                            <i class="fas fa-cloud-upload-alt" style="font-size: 48px; color: #8b5cf6; margin-bottom: 15px;"></i>
                            <h4 style="margin: 0 0 5px;">Arraste ou clique para enviar</h4>
                            <p style="margin: 0; color: #718096;">PDF, DOCX, DOC (até 10MB)</p>
                            <p style="margin-top: 10px; font-size: 12px; color: #f59e0b;">
                                <i class="fas fa-info-circle"></i> Mantém 100% da formatação original
                            </p>
                        </div>
                        <input type="file" id="fileInputAdaptarSetor" style="display: none;" accept=".pdf,.docx,.doc" onchange="setorPedagogico.handleFileSelectAdaptar(event)">

                        <div id="previewArquivoSetor" style="display: none; margin-top: 20px; padding: 15px; background: #f1f5f9; border-radius: 12px;">
                            <div style="display: flex; align-items: center; gap: 15px;">
                                <i id="fileIconSetor" class="fas fa-file-word" style="font-size: 40px; color: #2b5797;"></i>
                                <div style="flex: 1;">
                                    <div><strong id="nomeArquivoSetor">-</strong></div>
                                    <div><small id="tamanhoArquivoSetor">-</small></div>
                                </div>
                                <button onclick="setorPedagogico.removerArquivoAdaptar()" style="background: #fee2e2; border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; color: #dc2626;">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>

                        <div id="opcoesAdaptacaoSetor" style="display: none; margin-top: 20px;">
                            <div style="background: #f8fafc; border-radius: 16px; padding: 20px; border: 2px solid #e5e7eb;">
                                <h3 style="margin: 0 0 15px; display: flex; align-items: center; gap: 8px;">
                                    <i class="fas fa-universal-access" style="color: #10b981;"></i>
                                    Opções de Acessibilidade
                                </h3>

                                <div style="display: flex; flex-direction: column; gap: 15px;">
                                    <div style="background: #f1f5f9; padding: 15px; border-radius: 12px;">
                                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                            <input type="checkbox" id="optFonteAmpliadaSetor" onchange="setorPedagogico.toggleSliderFonte()" style="width: 18px; height: 18px;">
                                            <div>
                                                <strong style="font-size: 1rem;">🔍 Fonte Ampliada</strong>
                                                <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Aumenta o tamanho da fonte</p>
                                            </div>
                                        </label>
                                        <div id="sliderFonteSetor" style="display: none; margin-top: 15px; padding-top: 10px; border-top: 1px solid #e5e7eb;">
                                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                                <span>Normal (12pt)</span>
                                                <span id="fonteValueSetor">18pt</span>
                                                <span>Grande (24pt)</span>
                                            </div>
                                            <input type="range" id="fonteSliderSetor" min="12" max="24" step="1" value="18" style="width: 100%;">
                                        </div>
                                    </div>

                                    <div style="background: #f1f5f9; padding: 15px; border-radius: 12px;">
                                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                            <input type="checkbox" id="optCaixaAltaSetor" style="width: 18px; height: 18px;">
                                            <div>
                                                <strong style="font-size: 1rem;">🔠 CAIXA ALTA (Maiúsculas)</strong>
                                                <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Converte todo o texto para maiúsculas</p>
                                            </div>
                                        </label>
                                    </div>

                                    <div style="background: #f1f5f9; padding: 15px; border-radius: 12px;">
                                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                            <input type="checkbox" id="optNegritoSetor" style="width: 18px; height: 18px;">
                                            <div>
                                                <strong style="font-size: 1rem;">🔤 Negrito</strong>
                                                <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Deixa o texto em negrito</p>
                                            </div>
                                        </label>
                                    </div>

                                    <div style="background: #f1f5f9; padding: 15px; border-radius: 12px;">
                                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                            <input type="checkbox" id="optAltoContrasteSetor" style="width: 18px; height: 18px;">
                                            <div>
                                                <strong style="font-size: 1rem;">🎨 Alto Contraste</strong>
                                                <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Fundo escuro com texto claro</p>
                                            </div>
                                        </label>
                                    </div>

                                    <div style="background: #f1f5f9; padding: 15px; border-radius: 12px;">
                                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                            <input type="checkbox" id="optFonteDislexiaSetor" style="width: 18px; height: 18px;">
                                            <div>
                                                <strong style="font-size: 1rem;">📖 Fonte para Dislexia</strong>
                                                <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Utiliza fonte OpenDyslexic</p>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                <div style="margin-top: 20px; padding: 12px; background: #fef3c7; border-radius: 12px;">
                                    <p style="margin: 0; font-size: 0.85rem;">
                                        <i class="fas fa-lightbulb"></i>
                                        <strong>Processado pelo Google Docs!</strong> Mantém 100% da formatação original.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div id="processandoMsgSetor" style="display: none; margin-top: 20px; padding: 15px; background: #e6f7ff; border-radius: 12px; text-align: center;">
                            <i class="fas fa-spinner fa-spin" style="font-size: 20px; color: #1890ff;"></i>
                            <span style="margin-left: 10px;">Processando documento no Google Docs...</span>
                            <div style="font-size: 12px; color: #666; margin-top: 8px;">Isso pode levar alguns segundos</div>
                        </div>
                    </div>

                    <div class="modal-footer" style="padding: 15px 20px; border-top: 1px solid #dee2e6; display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0;">
                        <button type="button" class="btn btn-secondary" onclick="setorPedagogico.fecharModalAdaptacaoDocumento()" style="border-radius: 12px; padding: 10px 20px;">Cancelar</button>
                        <button type="button" class="btn btn-primary" id="btnAplicarAdaptacoesSetor" onclick="setorPedagogico.aplicarAdaptacoesComGoogle()" style="border-radius: 12px; padding: 10px 20px; background: linear-gradient(135deg, #8b5cf6, #7c3aed);">
                            <i class="fas fa-magic"></i> Aplicar Adaptações
                        </button>
                    </div>
                </div>
            </div>

            <style>
                .upload-area:hover { background: #f0f9ff !important; border-color: #8b5cf6 !important; }
                #modalAdaptacaoDocumento { background-color: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10001; }
            </style>
        `;

        this.arquivoSelecionadoSetor = null;

        const fonteCheckbox = document.getElementById('optFonteAmpliadaSetor');
        const slider = document.getElementById('fonteSliderSetor');
        const fonteValue = document.getElementById('fonteValueSetor');

        if (fonteCheckbox) {
            fonteCheckbox.addEventListener('change', () => {
                const sliderDiv = document.getElementById('sliderFonteSetor');
                if (sliderDiv) sliderDiv.style.display = fonteCheckbox.checked ? 'block' : 'none';
            });
        }

        if (slider) {
            slider.addEventListener('input', () => {
                if (fonteValue) fonteValue.textContent = slider.value + 'pt';
            });
        }

        modal.style.display = 'flex';
    }

    fecharModalAdaptacaoDocumento() {
        const modal = document.getElementById('modalAdaptacaoDocumento');
        if (modal) modal.style.display = 'none';
        this.arquivoSelecionadoSetor = null;
    }

    handleDropAdaptar(e) {
        e.preventDefault();
        const area = e.currentTarget;
        area.style.background = '';
        area.style.borderColor = '#cbd5e0';
        const files = e.dataTransfer.files;
        if (files.length > 0) this.processarArquivoAdaptar(files[0]);
    }

    handleDragOverAdaptar(e) {
        e.preventDefault();
        const area = e.currentTarget;
        area.style.background = '#f0f9ff';
        area.style.borderColor = '#8b5cf6';
    }

    handleFileSelectAdaptar(e) {
        const files = e.target.files;
        if (files.length > 0) this.processarArquivoAdaptar(files[0]);
    }

    processarArquivoAdaptar(file) {
        const extensoes = ['pdf', 'docx', 'doc'];
        const ext = file.name.split('.').pop().toLowerCase();

        if (!extensoes.includes(ext)) {
            this.showToast('❌ Tipo de arquivo não suportado', 'error');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            this.showToast('❌ Arquivo muito grande. Máximo 10MB.', 'error');
            return;
        }

        this.arquivoSelecionadoSetor = file;

        const fileIcon = document.getElementById('fileIconSetor');
        if (fileIcon) {
            if (ext === 'pdf') {
                fileIcon.className = 'fas fa-file-pdf';
                fileIcon.style.color = '#dc2626';
            } else {
                fileIcon.className = 'fas fa-file-word';
                fileIcon.style.color = '#2b5797';
            }
        }

        document.getElementById('previewArquivoSetor').style.display = 'block';
        document.getElementById('nomeArquivoSetor').textContent = file.name;
        document.getElementById('tamanhoArquivoSetor').textContent = `${(file.size / 1024).toFixed(2)} KB`;
        document.getElementById('opcoesAdaptacaoSetor').style.display = 'block';
    }

    removerArquivoAdaptar() {
        this.arquivoSelecionadoSetor = null;
        document.getElementById('previewArquivoSetor').style.display = 'none';
        document.getElementById('opcoesAdaptacaoSetor').style.display = 'none';
        document.getElementById('fileInputAdaptarSetor').value = '';
    }

    toggleSliderFonte() {
        const slider = document.getElementById('sliderFonteSetor');
        if (slider) {
            slider.style.display = document.getElementById('optFonteAmpliadaSetor').checked ? 'block' : 'none';
        }
    }

    async aplicarAdaptacoesComGoogle() {
        if (!this.arquivoSelecionadoSetor) {
            this.showToast('❌ Nenhum arquivo selecionado', 'error');
            return;
        }

        const opcoes = {
            caixa_alta: document.getElementById('optCaixaAltaSetor')?.checked || false,
            negrito: document.getElementById('optNegritoSetor')?.checked || false,
            alto_contraste: document.getElementById('optAltoContrasteSetor')?.checked || false,
            fonte_dislexia: document.getElementById('optFonteDislexiaSetor')?.checked || false,
            tamanho_fonte: document.getElementById('optFonteAmpliadaSetor')?.checked
                ? parseInt(document.getElementById('fonteSliderSetor')?.value) || 18
                : 12
        };

        const nenhumaOpcao = !opcoes.caixa_alta && !opcoes.negrito &&
                            !opcoes.alto_contraste && !opcoes.fonte_dislexia &&
                            opcoes.tamanho_fonte === 12;

        if (nenhumaOpcao) {
            const confirmar = await this.confirmarAcao('Nenhuma opção de acessibilidade foi selecionada. Deseja apenas converter o documento?');
            if (!confirmar) return;
        }

        const processandoDiv = document.getElementById('processandoMsgSetor');
        const btnSalvar = document.getElementById('btnAplicarAdaptacoesSetor');

        if (processandoDiv) processandoDiv.style.display = 'block';
        if (btnSalvar) {
            btnSalvar.disabled = true;
            btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
        }

        try {
            const token = localStorage.getItem('auth_token');
            const formData = new FormData();
            formData.append('arquivo', this.arquivoSelecionadoSetor);
            formData.append('opcoes', JSON.stringify(opcoes));

            const response = await fetch('/api/adaptar-documento', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                const byteCharacters = atob(data.pdf);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);

                const novaJanela = window.open(url, '_blank');
                if (novaJanela) {
                    novaJanela.onload = () => setTimeout(() => novaJanela.print(), 1000);
                    this.fecharModalAdaptacaoDocumento();
                    this.showToast('✅ Documento adaptado! Aguardando impressão...', 'success');
                } else {
                    this.showToast('⚠️ Permita pop-ups para abrir o documento', 'warning');
                }
            } else {
                throw new Error(data.error || 'Erro ao processar documento');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        } finally {
            if (processandoDiv) processandoDiv.style.display = 'none';
            if (btnSalvar) {
                btnSalvar.disabled = false;
                btnSalvar.innerHTML = '<i class="fas fa-magic"></i> Aplicar Adaptações';
            }
        }
    }

    // ============================================================================
    // 📱 MÉTODOS DO MENU MOBILE
    // ============================================================================
    abrirMenuLateral() {
        console.log('🍔 Abrindo menu lateral...');

        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlaySp');

        if (!sidebar) {
            console.error('❌ Sidebar não encontrada');
            return;
        }

        sidebar.classList.add('mobile-open');

        if (overlay) {
            overlay.classList.add('active');
        }

        document.body.style.overflow = 'hidden';
    }

    fecharMenuLateral() {
        console.log('🔚 Fechando menu lateral...');

        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlaySp');

        if (sidebar) sidebar.classList.remove('mobile-open');
        if (overlay) overlay.classList.remove('active');

        document.body.style.overflow = '';
    }

    updateBottomNav(section) {
        document.querySelectorAll('#bottomNavSp .nav-item-sp').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.section === section) {
                item.classList.add('active');
            }
        });
    }

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
            this.showToast('⚠️ Nenhuma coluna definida para exportação', 'warning');
            return false;
        }
        if (!Array.isArray(registros) || registros.length === 0) {
            this.showToast('⚠️ Nenhum registro para exportar', 'warning');
            return false;
        }

        const agora = new Date();
        const dataGeracao = agora.toLocaleString('pt-BR');
        const dataArquivo = getDataLocalISO(agora);

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
        L.push(linhaUnica('Sistema de Atendimentos — EducaPleno'));
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
            this.showToast('❌ Erro ao gerar CSV', 'error');
            return false;
        }
    }
}

// ============================================================================
// 🔓 HELPER GLOBAL: MOSTRAR/OCULTAR SENHA
// ============================================================================
function toggleSenhaVisivel(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;

    if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '<i class="fas fa-eye-slash"></i>';
    } else {
        input.type = 'password';
        btn.innerHTML = '<i class="fas fa-eye"></i>';
    }
}

// ============================================================================
// INSTANCIAÇÃO GLOBAL
// ============================================================================
const setorPedagogico = new SetorPedagogico();
window.setorPedagogico = setorPedagogico;