// frontend/js/admin-simples.js
// v2.0 - CORRIGIDO: modais com onClick isolado, funções faltantes adicionadas

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

            if (typeof window.adminSimples !== 'undefined' &&
                typeof window.adminSimples.showToast === 'function') {
                window.adminSimples.showToast(String(mensagem), 'info');
                return;
            }

            if (!isWebView) {
                console.log('%c[ALERT] ' + mensagem, 'background:#4f46e5;color:white;padding:4px 8px;border-radius:4px;');
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
                            style="width:100%;padding:12px;background:#4f46e5;color:white;
                                   border:none;border-radius:10px;font-size:14px;
                                   font-weight:600;cursor:pointer;">OK</button>
                </div>
            `;
            document.body.appendChild(modal);
        } finally {
            __alertaEmProgresso = false;
        }
    };

    console.log('🛡️ [Proteção] window.alert sobrescrito (admin-simples)');
})();

class AdminSimples {
    constructor() {
        this.abaAtual = 'dashboard';
        this.usuarios = [];
        this.turmas = [];
        this.provas = [];
        this.resultados = [];
        this.notificacoes = [];
        this.paginaAtual = 1;
        this.itensPorPagina = 10;
        this.usuario = null;

        // ===== SELECTS =====
        this.turmasParaSelect = [];
        this.professoresParaSelect = [];
        this.professoresLista = [];
        this.todosProfessoresLista = [];
        this.contagemPorProfessor = {};

        // ===== PROVAS =====
        this.provaGeradaSimples = null;
        this.anexosSimples = [];
        this.arquivosParaUploadSimples = [];

        // ===== NOTIFICAÇÕES =====
        this.usuariosSelecionados = new Set();
        this.tipoDestinatarioAtual = 'todos';
        this.filtroAtualNotificacao = '';
        this.roleFiltroNotificacao = 'todos';
        this.modoSelecaoIndividual = false;
        this.usuarioIndividualSelecionado = null;
        this.usuariosParaNotificacao = [];

        // ===== EIXOS / CURSOS =====
        this.eixos = [];
        this.cursos = [];
        this.arquivoSelecionado = null;

        // ===== RESULTADOS =====
        this.resultadosCompletos = [];
        this.resultadosFiltrados = [];
        this.paginaAtualResultados = 1;
        this.itensPorPaginaResultados = 15;

        // ===== PAGINAÇÃO USUÁRIOS / TURMAS =====
        this.paginaAtualUsuario = 1;
        this.usuariosFiltrados = [];
        this.paginaAtualTurma = 1;
        this.turmasFiltradas = [];

        // ===== CONTROLE DE MODAL =====
        this._modalTokenAtual = null;

        this.init();
    }

    async init() {
        console.log('🚀 Inicializando admin simples v2.0...');
        await this.verificarAuth();
        this.atualizarDataHora();
        setInterval(() => this.atualizarDataHora(), 1000);

        await this.carregarNotificacoes();
        setInterval(() => this.carregarNotificacoes(), 30000);

        await this.carregarUsuarios();
        await this.carregarTurmas();
        await this.carregarProvas();
        await this.carregarResultados();

        await this.carregarDashboard();
        await this.carregarFotoPerfilAdmin();

        window.addEventListener('pageshow', async (event) => {
            if (event.persisted || (document.referrer && document.referrer.includes('editar-perfil'))) {
                console.log('🔄 Página restaurada, recarregando foto...');
                setTimeout(() => {
                    if (adminSimples && typeof adminSimples.carregarFotoPerfilAdmin === 'function') {
                        adminSimples.carregarFotoPerfilAdmin();
                    }
                }, 300);
            }
        });
    }

    // ============================================================================
    // 🎯 SISTEMA DE MODAL CENTRALIZADO (CORRIGE O PROBLEMA DOS NOMES ERRADOS)
    // ============================================================================
    /**
     * Abre o modal principal.
     * @param {string} titulo - HTML do título
     * @param {string} conteudo - HTML do corpo
     * @param {boolean} mostrarSalvar - Se true, mostra o botão salvar
     * @param {Function|null} onSalvar - Callback do botão salvar (ISOLADO!)
     */
    abrirModal(titulo, conteudo, mostrarSalvar = true, onSalvar = null) {
        console.log('📂 Abrindo modal:', { titulo, mostrarSalvar, temOnSalvar: !!onSalvar });

        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        const modalSaveBtn = document.getElementById('modalSaveBtn');
        const modal = document.getElementById('modal');

        if (!modalTitle || !modalBody || !modal) {
            console.error('❌ Elementos do modal não encontrados');
            return;
        }

        modalTitle.innerHTML = titulo || 'Título';
        modalBody.innerHTML = conteudo || '<p style="padding: 20px; text-align: center;">Nenhum conteúdo disponível</p>';

        if (modalSaveBtn) {
            // 🔥 LIMPA QUALQUER ONCLICK ANTIGO PRIMEIRO
            modalSaveBtn.onclick = null;
            modalSaveBtn.removeAttribute('onclick');

            if (mostrarSalvar) {
                modalSaveBtn.style.display = 'inline-block';
                // 🔥 SE FOI PASSADO onSalvar, USA; SENÃO, NÃO FAZ NADA
                if (typeof onSalvar === 'function') {
                    modalSaveBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onSalvar();
                    };
                } else {
                    // Se não passou callback, o botão não faz nada (evita herdar onclick antigo)
                    modalSaveBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.warn('⚠️ Botão salvar clicado, mas nenhum callback foi definido.');
                    };
                }
            } else {
                modalSaveBtn.style.display = 'none';
            }
        }

        modal.style.display = 'flex';
    }

    /**
     * Alias para compatibilidade — aponta para o mesmo modal.
     */
    openModal() {
        const modal = document.getElementById('modal');
        if (modal) modal.style.display = 'flex';
    }

    /**
     * Fecha o modal principal e RESETA o botão salvar.
     */
    fecharModal() {
        console.log('🔚 Fechando modal');
        const modal = document.getElementById('modal');
        if (modal) modal.style.display = 'none';

        const modalSaveBtn = document.getElementById('modalSaveBtn');
        if (modalSaveBtn) {
            modalSaveBtn.onclick = null;
            modalSaveBtn.removeAttribute('onclick');
            modalSaveBtn.style.display = 'inline-block';
            modalSaveBtn.innerHTML = '<i class="fas fa-save"></i> Salvar';
        }
    }

    /**
     * Alias — algumas funções chamam closeModal()
     */
    closeModal() {
        this.fecharModal();
    }

    // ============================================================================
    // ADAPTAÇÃO DE DOCUMENTOS
    // ============================================================================
    async abrirModalUploadAdaptarDocumento() {
        console.log('📂 Abrindo modal de adaptação de documentos...');

        const modalBody = document.getElementById('modalBody');
        const modalTitle = document.getElementById('modalTitle');

        const conteudo = `
            <div style="padding: 20px;">
                <div class="upload-area"
                    onclick="document.getElementById('fileInputAdaptar').click()"
                    ondrop="adminSimples.handleDropAdaptar(event)"
                    ondragover="adminSimples.handleDragOverAdaptar(event)"
                    style="background:#f8fafc;border:3px dashed #cbd5e0;border-radius:16px;
                           padding:40px;text-align:center;cursor:pointer;transition:all 0.3s;">
                    <i class="fas fa-cloud-upload-alt" style="font-size:48px;color:#667eea;margin-bottom:15px;"></i>
                    <h4 style="margin:0 0 5px;">Arraste ou clique para enviar</h4>
                    <p style="margin:0;color:#718096;">PDF, DOCX, DOC (até 10MB)</p>
                    <p style="margin-top:10px;font-size:12px;color:#f59e0b;">
                        <i class="fas fa-info-circle"></i> O documento mantém 100% da formatação original
                    </p>
                </div>
                <input type="file" id="fileInputAdaptar" style="display:none;" accept=".pdf,.docx,.doc"
                       onchange="adminSimples.handleFileSelectAdaptar(event)">

                <div id="previewArquivo" style="display:none;margin-top:20px;padding:15px;background:#f1f5f9;border-radius:12px;">
                    <div style="display:flex;align-items:center;gap:15px;">
                        <i id="fileIcon" class="fas fa-file-word" style="font-size:40px;color:#2b5797;"></i>
                        <div style="flex:1;">
                            <div><strong id="nomeArquivo">-</strong></div>
                            <div><small id="tamanhoArquivo">-</small></div>
                        </div>
                        <button onclick="adminSimples.removerArquivoAdaptar()"
                            style="background:#fee2e2;border:none;width:32px;height:32px;border-radius:50%;cursor:pointer;color:#dc2626;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                <div id="opcoesAdaptacao" style="display:none;margin-top:20px;">
                    <div style="background:#f8fafc;border-radius:16px;padding:20px;border:2px solid #e5e7eb;">
                        <h3 style="margin:0 0 15px;display:flex;align-items:center;gap:8px;">
                            <i class="fas fa-universal-access" style="color:#10b981;"></i>
                            Opções de Acessibilidade
                        </h3>

                        <div style="display:flex;flex-direction:column;gap:15px;">
                            <div style="background:#f1f5f9;padding:15px;border-radius:12px;">
                                <label style="display:flex;align-items:center;gap:12px;cursor:pointer;">
                                    <input type="checkbox" id="optFonteAmpliada" onchange="adminSimples.toggleSliderFonte()" style="width:18px;height:18px;">
                                    <div>
                                        <strong style="font-size:1rem;">🔍 Fonte Ampliada</strong>
                                        <p style="margin:5px 0 0;font-size:0.85rem;color:#6b7280;">Aumenta o tamanho da fonte</p>
                                    </div>
                                </label>
                                <div id="sliderFonte" style="display:none;margin-top:15px;padding-top:10px;border-top:1px solid #e5e7eb;">
                                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                                        <span>Normal (12pt)</span>
                                        <span id="fonteValue">18pt</span>
                                        <span>Grande (24pt)</span>
                                    </div>
                                    <input type="range" id="fonteSlider" min="12" max="24" step="1" value="18" style="width:100%;">
                                </div>
                            </div>

                            <div style="background:#f1f5f9;padding:15px;border-radius:12px;">
                                <label style="display:flex;align-items:center;gap:12px;cursor:pointer;">
                                    <input type="checkbox" id="optCaixaAlta" style="width:18px;height:18px;">
                                    <div>
                                        <strong style="font-size:1rem;">🔠 CAIXA ALTA (Maiúsculas)</strong>
                                        <p style="margin:5px 0 0;font-size:0.85rem;color:#6b7280;">Converte todo o texto para maiúsculas</p>
                                    </div>
                                </label>
                            </div>

                            <div style="background:#f1f5f9;padding:15px;border-radius:12px;">
                                <label style="display:flex;align-items:center;gap:12px;cursor:pointer;">
                                    <input type="checkbox" id="optNegrito" style="width:18px;height:18px;">
                                    <div>
                                        <strong style="font-size:1rem;">🔤 Negrito</strong>
                                        <p style="margin:5px 0 0;font-size:0.85rem;color:#6b7280;">Deixa o texto em negrito</p>
                                    </div>
                                </label>
                            </div>

                            <div style="background:#f1f5f9;padding:15px;border-radius:12px;">
                                <label style="display:flex;align-items:center;gap:12px;cursor:pointer;">
                                    <input type="checkbox" id="optAltoContraste" style="width:18px;height:18px;">
                                    <div>
                                        <strong style="font-size:1rem;">🎨 Alto Contraste</strong>
                                        <p style="margin:5px 0 0;font-size:0.85rem;color:#6b7280;">Fundo escuro com texto claro</p>
                                    </div>
                                </label>
                            </div>

                            <div style="background:#f1f5f9;padding:15px;border-radius:12px;">
                                <label style="display:flex;align-items:center;gap:12px;cursor:pointer;">
                                    <input type="checkbox" id="optFonteDislexia" style="width:18px;height:18px;">
                                    <div>
                                        <strong style="font-size:1rem;">📖 Fonte para Dislexia</strong>
                                        <p style="margin:5px 0 0;font-size:0.85rem;color:#6b7280;">Utiliza fonte OpenDyslexic</p>
                                    </div>
                                </label>
                            </div>
                        </div>

                        <div style="margin-top:20px;padding:12px;background:#fef3c7;border-radius:12px;">
                            <p style="margin:0;font-size:0.85rem;">
                                <i class="fas fa-lightbulb"></i>
                                <strong>Processado pelo Google Docs!</strong> Mantém 100% da formatação original.
                            </p>
                        </div>
                    </div>
                </div>

                <div id="processandoMsg" style="display:none;margin-top:20px;padding:15px;background:#e6f7ff;border-radius:12px;text-align:center;">
                    <i class="fas fa-spinner fa-spin" style="font-size:20px;color:#1890ff;"></i>
                    <span style="margin-left:10px;">Processando documento no Google Docs...</span>
                    <div style="font-size:12px;color:#666;margin-top:8px;">Isso pode levar alguns segundos</div>
                </div>
            </div>

            <style>
                .upload-area:hover { background:#f0f9ff !important; border-color:#667eea !important; }
            </style>
        `;

        // 🔥 CHAMA COM CALLBACK ISOLADO
        this.abrirModal(
            '<i class="fas fa-universal-access"></i> Adaptar Documento',
            conteudo,
            true,
            () => {
                console.log('🔘 Botão de adaptação clicado!');
                this.aplicarAdaptacoesComGoogle();
            }
        );

        // Customiza o botão
        setTimeout(() => {
            const btn = document.getElementById('modalSaveBtn');
            if (btn) {
                btn.innerHTML = '<i class="fas fa-magic"></i> Aplicar Adaptações';
                btn.disabled = false;
            }
        }, 50);

        this.arquivoSelecionado = null;

        const fonteCheckbox = document.getElementById('optFonteAmpliada');
        const slider = document.getElementById('fonteSlider');
        const fonteValue = document.getElementById('fonteValue');

        if (fonteCheckbox) {
            fonteCheckbox.addEventListener('change', () => {
                const sliderDiv = document.getElementById('sliderFonte');
                if (sliderDiv) sliderDiv.style.display = fonteCheckbox.checked ? 'block' : 'none';
            });
        }

        if (slider) {
            slider.addEventListener('input', () => {
                if (fonteValue) fonteValue.textContent = slider.value + 'pt';
            });
        }
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
        area.style.borderColor = '#667eea';
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

        this.arquivoSelecionado = file;

        const fileIcon = document.getElementById('fileIcon');
        if (fileIcon) {
            if (ext === 'pdf') {
                fileIcon.className = 'fas fa-file-pdf';
                fileIcon.style.color = '#dc2626';
            } else {
                fileIcon.className = 'fas fa-file-word';
                fileIcon.style.color = '#2b5797';
            }
        }

        const preview = document.getElementById('previewArquivo');
        const nome = document.getElementById('nomeArquivo');
        const tam = document.getElementById('tamanhoArquivo');
        const opcoes = document.getElementById('opcoesAdaptacao');

        if (preview) preview.style.display = 'block';
        if (nome) nome.textContent = file.name;
        if (tam) tam.textContent = `${(file.size / 1024).toFixed(2)} KB`;
        if (opcoes) opcoes.style.display = 'block';
    }

    removerArquivoAdaptar() {
        this.arquivoSelecionado = null;
        document.getElementById('previewArquivo').style.display = 'none';
        document.getElementById('opcoesAdaptacao').style.display = 'none';
        document.getElementById('fileInputAdaptar').value = '';
    }

    toggleSliderFonte() {
        const slider = document.getElementById('sliderFonte');
        if (slider) {
            slider.style.display = document.getElementById('optFonteAmpliada').checked ? 'block' : 'none';
        }
    }

    async aplicarAdaptacoesComGoogle() {
        if (!this.arquivoSelecionado) {
            this.showToast('❌ Nenhum arquivo selecionado', 'error');
            return;
        }

        const opcoes = {
            caixa_alta: document.getElementById('optCaixaAlta')?.checked || false,
            negrito: document.getElementById('optNegrito')?.checked || false,
            alto_contraste: document.getElementById('optAltoContraste')?.checked || false,
            fonte_dislexia: document.getElementById('optFonteDislexia')?.checked || false,
            tamanho_fonte: document.getElementById('optFonteAmpliada')?.checked
                ? parseInt(document.getElementById('fonteSlider')?.value) || 18
                : 12
        };

        const nenhumaOpcao = !opcoes.caixa_alta && !opcoes.negrito &&
                            !opcoes.alto_contraste && !opcoes.fonte_dislexia &&
                            opcoes.tamanho_fonte === 12;

        if (nenhumaOpcao) {
            const confirmar = await this.confirmar(
                '⚠️ Nenhuma Adaptação',
                'Nenhuma opção de acessibilidade foi selecionada. Deseja apenas converter o documento?'
            );
            if (!confirmar) return;
        }

        const processandoDiv = document.getElementById('processandoMsg');
        const btnSalvar = document.getElementById('modalSaveBtn');

        if (processandoDiv) processandoDiv.style.display = 'block';
        if (btnSalvar) {
            btnSalvar.disabled = true;
            btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
        }

        try {
            const token = localStorage.getItem('auth_token');
            const formData = new FormData();
            formData.append('arquivo', this.arquivoSelecionado);
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
                    novaJanela.onload = () => {
                        setTimeout(() => novaJanela.print(), 1000);
                    };
                    this.fecharModal();
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
    // AUTENTICAÇÃO / NAVEGAÇÃO
    // ============================================================================
    async verificarAuth() {
        const token = localStorage.getItem('auth_token');
        const userData = JSON.parse(localStorage.getItem('user_data') || '{}');

        if (!token) {
            window.location.href = 'login.html';
            return;
        }

        if (userData.role !== 'admin' && userData.role !== 'super_admin') {
            this.showToast('❌ Acesso negado', 'error');
            window.location.href = userData.role === 'professor' ? 'index.html' : 'aluno.html';
            return;
        }

        this.usuario = userData;
        const nomeEl = document.getElementById('adminNome');
        const emailEl = document.getElementById('adminEmail');
        if (nomeEl) nomeEl.textContent = userData.nome || 'Administrador';
        if (emailEl) emailEl.textContent = userData.email || 'admin@iemasaoluiscentro.net';

        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.section === 'dashboard') {
                item.classList.add('active');
            }
        });
    }

    toggleMenu() {
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.toggle('active');
    }

    atualizarDataHora() {
        const agora = new Date();
        const el = document.getElementById('datetime');
        if (el) el.textContent = agora.toLocaleString('pt-BR');
    }

    // ============================================================================
    // NOTIFICAÇÕES
    // ============================================================================
    async carregarNotificacoes() {
        try {
            const token = localStorage.getItem('auth_token');

            const countResponse = await fetch('/api/notificacoes/nao-lidas/contador', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (countResponse.ok) {
                const countData = await countResponse.json();
                this.atualizarBadgesNotificacoes(countData.count || 0);
            }

            const response = await fetch('/api/notificacoes?limite=20', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            if (data.success) {
                this.notificacoes = data.notificacoes || [];
                this.renderizarNotificacoes();
            }
        } catch (error) {
            console.error('Erro ao carregar notificações:', error);
        }
    }

    atualizarBadgesNotificacoes(total) {
        const ids = [
            'sidebarNotificacaoBadge',
            'topNotificacaoBadge',
            'topNotificacaoBadgeDesktop',
            'menuNotificacaoBadge'
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            if (total > 0) {
                el.textContent = total > 99 ? '99+' : total;
                el.style.display = (id === 'topNotificacaoBadge') ? 'block' : 'inline';
            } else {
                el.style.display = 'none';
            }
        });
    }

    renderizarNotificacoes() {
        const list = document.getElementById('notificacoesList');
        if (!list) return;

        if (!this.notificacoes || this.notificacoes.length === 0) {
            list.innerHTML = `
                <div class="empty-notificacoes">
                    <i class="fas fa-bell-slash"></i>
                    <p>Nenhuma notificação</p>
                </div>
            `;
            return;
        }

        let html = '';
        this.notificacoes.slice(0, 10).forEach(notif => {
            const data = new Date(notif.createdAt);
            const agora = new Date();
            const diffMs = agora - data;
            const diffMin = Math.floor(diffMs / 60000);
            const diffHora = Math.floor(diffMs / 3600000);
            const diffDia = Math.floor(diffMs / 86400000);

            let tempoTexto = '';
            if (diffMin < 1) tempoTexto = 'agora mesmo';
            else if (diffMin < 60) tempoTexto = `há ${diffMin} min`;
            else if (diffHora < 24) tempoTexto = `há ${diffHora} h`;
            else tempoTexto = `há ${diffDia} d`;

            const naoLida = !notif.lida ? 'nao-lida' : '';

            html += `
                <div class="notificacao-item ${naoLida}" data-id="${notif._id}" onclick="adminSimples.verNotificacao('${notif._id}')">
                    <div class="notificacao-titulo">
                        <span class="notificacao-icone" style="background: ${notif.cor || '#3498db'}20; color: ${notif.cor || '#3498db'};">
                            <i class="fas ${notif.icone || 'fa-bell'}"></i>
                        </span>
                        ${notif.titulo || 'Notificação'}
                    </div>
                    <div class="notificacao-mensagem">${notif.mensagem || ''}</div>
                    <div class="notificacao-tempo">
                        <i class="far fa-clock"></i> ${tempoTexto}
                    </div>
                    <div class="notificacao-actions">
                        <button onclick="event.stopPropagation(); adminSimples.marcarLida('${notif._id}')" title="Marcar como lida">
                            <i class="fas fa-check"></i>
                        </button>
                        <button class="delete" onclick="event.stopPropagation(); adminSimples.excluirNotificacao('${notif._id}')" title="Excluir">
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
        if (panel) panel.classList.toggle('active');
        this.carregarNotificacoes();
    }

    fecharPainelNotificacoes() {
        const panel = document.getElementById('notificacoesPanel');
        if (panel) panel.classList.remove('active');
    }

    async marcarLida(id) {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/notificacoes/${id}/lida`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) await this.carregarNotificacoes();
        } catch (error) {
            console.error('Erro ao marcar como lida:', error);
        }
    }

    async marcarTodasLidas() {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/notificacoes/marcar-todas-lidas', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
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
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/notificacoes/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
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

    async enviarPushParaUsuario(usuarioId, titulo, mensagem, dados = {}) {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return false;

            console.log(`📱 Enviando push para ${usuarioId}: ${titulo}`);

            const response = await fetch('/api/usuario/enviar-push', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    usuarioId,
                    titulo,
                    mensagem,
                    dados: { ...dados, timestamp: Date.now(), origem: 'admin' }
                })
            });

            const data = await response.json();
            return data.success === true;
        } catch (error) {
            console.error('❌ Erro ao enviar push:', error);
            return false;
        }
    }

        // ============================================================================
    // 📢 ENVIO DE NOTIFICAÇÕES EM MASSA
    // ============================================================================
    async abrirModalEnvioNotificacao() {
        console.log('📢 Abrindo modal de envio de notificação...');

        const modalBody = document.getElementById('modalBody');
        const modalTitle = document.getElementById('modalTitle');
        const modalSaveBtn = document.getElementById('modalSaveBtn');

        if (!modalBody || !modalTitle || !modalSaveBtn) {
            console.error('❌ Elementos do modal não encontrados');
            return;
        }

        // 🔥 Abre com callback ISOLADO
        this.abrirModal(
            '<i class="fas fa-paper-plane"></i> Enviar Notificação',
            `<div style="text-align:center;padding:40px;">
                <div style="width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #4f46e5;
                            border-radius:50%;margin:0 auto 15px;animation:spin 1s linear infinite;"></div>
                <p style="color:#6b7280;">Carregando usuários...</p>
            </div>
            <style>@keyframes spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}</style>`,
            false
        );

        modalSaveBtn.style.display = 'none';

        // Buscar todos os usuários
        let todosUsuarios = [];
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/admin/usuarios?limit=2000', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            if (data.success && data.usuarios) {
                todosUsuarios = data.usuarios;
                console.log(`✅ ${todosUsuarios.length} usuários carregados`);
            } else {
                throw new Error(data.error || 'Erro ao carregar usuários');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            modalBody.innerHTML = `
                <div style="text-align:center;padding:40px;color:#dc3545;">
                    <i class="fas fa-exclamation-triangle" style="font-size:48px;margin-bottom:15px;"></i>
                    <h3>Erro ao carregar usuários</h3>
                    <p>${error.message}</p>
                    <button onclick="adminSimples.abrirModalEnvioNotificacao()"
                        style="margin-top:15px;padding:10px 20px;background:#4f46e5;color:white;
                               border:none;border-radius:8px;cursor:pointer;">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
            return;
        }

        // Contagem por perfil
        const c = {
            todos: todosUsuarios.length,
            aluno: todosUsuarios.filter(u => u.role === 'aluno').length,
            professor: todosUsuarios.filter(u => u.role === 'professor').length,
            admin: todosUsuarios.filter(u => u.role === 'admin' || u.role === 'super_admin').length,
            super_admin: todosUsuarios.filter(u => u.role === 'super_admin').length,
            setor_pedagogico: todosUsuarios.filter(u => u.role === 'setor_pedagogico').length,
            coordenacao_patio: todosUsuarios.filter(u => u.role === 'coordenacao_patio').length,
            cozinha: todosUsuarios.filter(u => u.role === 'cozinha').length,
            gestao_geral: todosUsuarios.filter(u => u.role === 'gestao_geral').length,
            enfermaria: todosUsuarios.filter(u => u.role === 'enfermaria').length,
            supervisao: todosUsuarios.filter(u => u.role === 'supervisao').length,
            psicologia: todosUsuarios.filter(u => u.role === 'psicologia').length,
            'assistente-social': todosUsuarios.filter(u => u.role === 'assistente-social').length,
            protagonismo: todosUsuarios.filter(u => u.role === 'protagonismo').length,
            biblioteca: todosUsuarios.filter(u => u.role === 'biblioteca').length,
            secretaria: todosUsuarios.filter(u => u.role === 'secretaria').length,
            'gestao-adm': todosUsuarios.filter(u => u.role === 'gestao-adm').length,
            recepcao: todosUsuarios.filter(u => u.role === 'recepcao').length
        };

        // Estado
        this.usuariosParaNotificacao = todosUsuarios;
        this.usuariosSelecionados = new Set();
        this.tipoDestinatarioAtual = 'todos';
        this.filtroAtualNotificacao = '';
        this.roleFiltroNotificacao = 'todos';
        this.modoSelecaoIndividual = false;
        this.usuarioIndividualSelecionado = null;

        const html = `
            <div style="padding:20px;max-width:800px;">
                <!-- MODO -->
                <div style="margin-bottom:20px;background:#f8fafc;border-radius:12px;padding:5px;display:flex;gap:5px;">
                    <button type="button" id="modoTodosBtn" onclick="adminSimples.mudarModoNotificacao('todos')"
                        style="flex:1;padding:12px;border:none;border-radius:10px;cursor:pointer;font-weight:600;
                               font-size:14px;background:#4f46e5;color:white;display:flex;align-items:center;
                               justify-content:center;gap:8px;">
                        <i class="fas fa-users"></i> Enviar para Muitos
                    </button>
                    <button type="button" id="modoIndividualBtn" onclick="adminSimples.mudarModoNotificacao('individual')"
                        style="flex:1;padding:12px;border:none;border-radius:10px;cursor:pointer;font-weight:600;
                               font-size:14px;background:transparent;color:#6b7280;display:flex;align-items:center;
                               justify-content:center;gap:8px;">
                        <i class="fas fa-user"></i> Enviar para Um
                    </button>
                </div>

                <!-- INDIVIDUAL -->
                <div id="secaoSelecaoIndividual" style="display:none;margin-bottom:20px;">
                    <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);border-radius:12px;
                                padding:20px;color:white;">
                        <label style="display:block;margin-bottom:10px;font-weight:600;font-size:0.95rem;">
                            <i class="fas fa-search"></i> Buscar Usuário
                        </label>
                        <div style="position:relative;">
                            <input type="text" id="buscaUsuarioIndividual"
                                placeholder="Nome, email ou matrícula..."
                                style="width:100%;padding:14px 45px 14px 16px;border:none;border-radius:10px;
                                       font-size:14px;outline:none;box-sizing:border-box;"
                                oninput="adminSimples.buscarUsuarioIndividual(this.value)"
                                autocomplete="off">
                            <i class="fas fa-search" style="position:absolute;right:16px;top:50%;transform:translateY(-50%);
                                                          color:#9ca3af;font-size:16px;"></i>
                        </div>
                        <div id="resultadosBuscaIndividual" style="display:none;margin-top:10px;background:white;
                            border-radius:10px;max-height:250px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,0.15);"></div>
                        <div id="usuarioIndividualSelecionado" style="display:none;margin-top:15px;
                            background:rgba(255,255,255,0.2);border-radius:10px;padding:15px;">
                            <div style="display:flex;align-items:center;gap:12px;">
                                <div id="avatarUsuarioSelecionado" style="width:50px;height:50px;background:white;
                                    border-radius:50%;display:flex;align-items:center;justify-content:center;
                                    font-weight:bold;color:#4f46e5;font-size:18px;flex-shrink:0;">?</div>
                                <div style="flex:1;min-width:0;">
                                    <div id="nomeUsuarioSelecionado" style="font-weight:600;font-size:15px;"></div>
                                    <div id="emailUsuarioSelecionado" style="font-size:12px;opacity:0.9;"></div>
                                    <div id="roleUsuarioSelecionado" style="font-size:11px;opacity:0.8;margin-top:2px;"></div>
                                </div>
                                <button type="button" onclick="adminSimples.limparSelecaoIndividual()"
                                    style="background:rgba(255,255,255,0.3);border:none;color:white;width:32px;
                                           height:32px;border-radius:50%;cursor:pointer;">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- PERFIS EM MASSA -->
                <div id="secaoPerfisMassa" style="margin-bottom:20px;">
                    <label style="display:block;margin-bottom:10px;font-weight:600;font-size:0.9rem;color:#374151;">
                        <i class="fas fa-user-tag" style="color:#4f46e5;"></i> Filtrar por Perfil
                    </label>
                    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;">
                        <button type="button" class="perfil-notif-btn active" data-role="todos"
                            onclick="adminSimples.filtrarNotificacaoPorRole('todos')"
                            style="padding:12px;border:2px solid #4f46e5;border-radius:10px;background:#eef2ff;
                                   cursor:pointer;text-align:left;">
                            <div style="font-weight:700;color:#4f46e5;font-size:0.9rem;">📋 Todos</div>
                            <div style="font-size:0.75rem;color:#6b7280;margin-top:3px;">${c.todos} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="aluno"
                            onclick="adminSimples.filtrarNotificacaoPorRole('aluno')"
                            style="padding:12px;border:2px solid #e5e7eb;border-radius:10px;background:white;cursor:pointer;text-align:left;">
                            <div style="font-weight:700;color:#1e40af;font-size:0.9rem;">👨‍🎓 Alunos</div>
                            <div style="font-size:0.75rem;color:#6b7280;margin-top:3px;">${c.aluno} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="professor"
                            onclick="adminSimples.filtrarNotificacaoPorRole('professor')"
                            style="padding:12px;border:2px solid #e5e7eb;border-radius:10px;background:white;cursor:pointer;text-align:left;">
                            <div style="font-weight:700;color:#92400e;font-size:0.9rem;">👨‍🏫 Professores</div>
                            <div style="font-size:0.75rem;color:#6b7280;margin-top:3px;">${c.professor} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="admin"
                            onclick="adminSimples.filtrarNotificacaoPorRole('admin')"
                            style="padding:12px;border:2px solid #e5e7eb;border-radius:10px;background:white;cursor:pointer;text-align:left;">
                            <div style="font-weight:700;color:#991b1b;font-size:0.9rem;">👑 Admins</div>
                            <div style="font-size:0.75rem;color:#6b7280;margin-top:3px;">${c.admin} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="setor_pedagogico"
                            onclick="adminSimples.filtrarNotificacaoPorRole('setor_pedagogico')"
                            style="padding:12px;border:2px solid #e5e7eb;border-radius:10px;background:white;cursor:pointer;text-align:left;">
                            <div style="font-weight:700;color:#7c3aed;font-size:0.9rem;">👩‍🏫 Pedagógico</div>
                            <div style="font-size:0.75rem;color:#6b7280;margin-top:3px;">${c.setor_pedagogico} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="coordenacao_patio"
                            onclick="adminSimples.filtrarNotificacaoPorRole('coordenacao_patio')"
                            style="padding:12px;border:2px solid #e5e7eb;border-radius:10px;background:white;cursor:pointer;text-align:left;">
                            <div style="font-weight:700;color:#d97706;font-size:0.9rem;">🏃 Coord. Pátio</div>
                            <div style="font-size:0.75rem;color:#6b7280;margin-top:3px;">${c.coordenacao_patio} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="cozinha"
                            onclick="adminSimples.filtrarNotificacaoPorRole('cozinha')"
                            style="padding:12px;border:2px solid #e5e7eb;border-radius:10px;background:white;cursor:pointer;text-align:left;">
                            <div style="font-weight:700;color:#059669;font-size:0.9rem;">🍽️ Cozinha</div>
                            <div style="font-size:0.75rem;color:#6b7280;margin-top:3px;">${c.cozinha} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="gestao_geral"
                            onclick="adminSimples.filtrarNotificacaoPorRole('gestao_geral')"
                            style="padding:12px;border:2px solid #e5e7eb;border-radius:10px;background:white;cursor:pointer;text-align:left;">
                            <div style="font-weight:700;color:#1e3c72;font-size:0.9rem;">📊 Gestão Geral</div>
                            <div style="font-size:0.75rem;color:#6b7280;margin-top:3px;">${c.gestao_geral} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="enfermaria"
                            onclick="adminSimples.filtrarNotificacaoPorRole('enfermaria')"
                            style="padding:12px;border:2px solid #e5e7eb;border-radius:10px;background:white;cursor:pointer;text-align:left;">
                            <div style="font-weight:700;color:#0891b2;font-size:0.9rem;">🏥 Enfermaria</div>
                            <div style="font-size:0.75rem;color:#6b7280;margin-top:3px;">${c.enfermaria} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="supervisao"
                            onclick="adminSimples.filtrarNotificacaoPorRole('supervisao')"
                            style="padding:12px;border:2px solid #e5e7eb;border-radius:10px;background:white;cursor:pointer;text-align:left;">
                            <div style="font-weight:700;color:#1e3a8a;font-size:0.9rem;">🛡️ Supervisão</div>
                            <div style="font-size:0.75rem;color:#6b7280;margin-top:3px;">${c.supervisao} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="psicologia"
                            onclick="adminSimples.filtrarNotificacaoPorRole('psicologia')"
                            style="padding:12px;border:2px solid #e5e7eb;border-radius:10px;background:white;cursor:pointer;text-align:left;">
                            <div style="font-weight:700;color:#0d9488;font-size:0.9rem;">🧠 Psicologia</div>
                            <div style="font-size:0.75rem;color:#6b7280;margin-top:3px;">${c.psicologia} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="assistente-social"
                            onclick="adminSimples.filtrarNotificacaoPorRole('assistente-social')"
                            style="padding:12px;border:2px solid #e5e7eb;border-radius:10px;background:white;cursor:pointer;text-align:left;">
                            <div style="font-weight:700;color:#7c3aed;font-size:0.9rem;">🤝 Assist. Social</div>
                            <div style="font-size:0.75rem;color:#6b7280;margin-top:3px;">${c['assistente-social']} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="protagonismo"
                            onclick="adminSimples.filtrarNotificacaoPorRole('protagonismo')"
                            style="padding:12px;border:2px solid #e5e7eb;border-radius:10px;background:white;cursor:pointer;text-align:left;">
                            <div style="font-weight:700;color:#ea580c;font-size:0.9rem;">⭐ Protagonismo</div>
                            <div style="font-size:0.75rem;color:#6b7280;margin-top:3px;">${c.protagonismo} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="biblioteca"
                            onclick="adminSimples.filtrarNotificacaoPorRole('biblioteca')"
                            style="padding:12px;border:2px solid #e5e7eb;border-radius:10px;background:white;cursor:pointer;text-align:left;">
                            <div style="font-weight:700;color:#0284c7;font-size:0.9rem;">📚 Biblioteca</div>
                            <div style="font-size:0.75rem;color:#6b7280;margin-top:3px;">${c.biblioteca} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="secretaria"
                            onclick="adminSimples.filtrarNotificacaoPorRole('secretaria')"
                            style="padding:12px;border:2px solid #e5e7eb;border-radius:10px;background:white;cursor:pointer;text-align:left;">
                            <div style="font-weight:700;color:#059669;font-size:0.9rem;">🎓 Secretaria</div>
                            <div style="font-size:0.75rem;color:#6b7280;margin-top:3px;">${c.secretaria} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="recepcao"
                            onclick="adminSimples.filtrarNotificacaoPorRole('recepcao')"
                            style="padding:12px;border:2px solid #e5e7eb;border-radius:10px;background:white;cursor:pointer;text-align:left;">
                            <div style="font-weight:700;color:#0891b2;font-size:0.9rem;">🛎️ Recepção</div>
                            <div style="font-size:0.75rem;color:#6b7280;margin-top:3px;">${c.recepcao} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="gestao-adm" onclick="admin.filtrarNotificacaoPorRole('gestao-adm')"
                            style="padding: 12px; border: 2px solid #e5e7eb; border-radius: 10px; background: white; cursor: pointer; text-align: left; transition: all 0.2s;">
                            <div style="font-weight: 700; color: #4f46e5; font-size: 0.9rem;">🧑‍💼 Gestão ADM</div>
                            <div style="font-size: 0.75rem; color: #6b7280; margin-top: 3px;">${c['gestao-adm']} usuários</div>
                        </button>
                    </div>
                </div>

                <!-- INFO -->
                <div id="infoDestinatariosNotificacao" style="background:#eef2ff;border-left:4px solid #4f46e5;
                    padding:12px 15px;border-radius:8px;margin-bottom:20px;display:flex;align-items:center;gap:10px;">
                    <i class="fas fa-info-circle" style="font-size:1.2rem;color:#4f46e5;"></i>
                    <span style="font-size:0.9rem;color:#1e40af;">
                        <strong>${todosUsuarios.length}</strong> usuário(s) receberão esta notificação
                    </span>
                </div>

                <!-- TEMPLATES -->
                <div style="margin-bottom:20px;background:#f8fafc;border-radius:8px;padding:15px;border:1px solid #e5e7eb;">
                    <label style="display:block;margin-bottom:10px;font-weight:600;font-size:0.9rem;color:#374151;">
                        <i class="fas fa-magic" style="color:#4f46e5;"></i> Modelos Rápidos
                    </label>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">
                        <button type="button" onclick="adminSimples.aplicarTemplateMensagem('informativo')"
                            style="padding:10px;border:2px solid #e5e7eb;border-radius:8px;background:white;cursor:pointer;font-size:0.85rem;">📢 Informativo</button>
                        <button type="button" onclick="adminSimples.aplicarTemplateMensagem('lembrete')"
                            style="padding:10px;border:2px solid #e5e7eb;border-radius:8px;background:white;cursor:pointer;font-size:0.85rem;">⏰ Lembrete</button>
                        <button type="button" onclick="adminSimples.aplicarTemplateMensagem('urgente')"
                            style="padding:10px;border:2px solid #e5e7eb;border-radius:8px;background:white;cursor:pointer;font-size:0.85rem;">⚠️ Urgente</button>
                        <button type="button" onclick="adminSimples.aplicarTemplateMensagem('manutencao')"
                            style="padding:10px;border:2px solid #e5e7eb;border-radius:8px;background:white;cursor:pointer;font-size:0.85rem;">🔧 Manutenção</button>
                    </div>
                </div>

                <!-- FORM -->
                <div>
                    <div style="margin-bottom:15px;">
                        <label style="display:block;margin-bottom:5px;font-weight:600;font-size:0.9rem;color:#374151;">
                            <i class="fas fa-heading" style="color:#4f46e5;"></i> Título
                        </label>
                        <input type="text" id="notificacaoTitulo" placeholder="Ex: Aviso importante"
                            style="width:100%;padding:10px 12px;border:2px solid #e5e7eb;border-radius:8px;
                                   font-size:0.9rem;box-sizing:border-box;">
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="display:block;margin-bottom:5px;font-weight:600;font-size:0.9rem;color:#374151;">
                            <i class="fas fa-align-left" style="color:#4f46e5;"></i> Mensagem
                        </label>
                        <textarea id="notificacaoMensagem" rows="4" placeholder="Digite sua mensagem..."
                            style="width:100%;padding:10px 12px;border:2px solid #e5e7eb;border-radius:8px;
                                   font-size:0.9rem;resize:vertical;min-height:100px;box-sizing:border-box;"></textarea>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:15px;">
                        <div>
                            <label style="display:block;margin-bottom:5px;font-weight:600;font-size:0.9rem;color:#374151;">
                                <i class="fas fa-palette" style="color:#4f46e5;"></i> Cor
                            </label>
                            <input type="color" id="notificacaoCor" value="#4f46e5"
                                style="width:100%;height:42px;padding:4px;border:2px solid #e5e7eb;
                                       border-radius:8px;background:white;cursor:pointer;">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;font-weight:600;font-size:0.9rem;color:#374151;">
                                <i class="fas fa-star" style="color:#4f46e5;"></i> Prioridade
                            </label>
                            <select id="notificacaoPrioridade"
                                style="width:100%;padding:10px 12px;border:2px solid #e5e7eb;
                                       border-radius:8px;font-size:0.9rem;background:white;">
                                <option value="1">🔵 Baixa</option>
                                <option value="3" selected>🟡 Média</option>
                                <option value="5">🔴 Alta</option>
                            </select>
                        </div>
                    </div>
                    <div style="margin-bottom:15px;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <input type="checkbox" id="notificacaoPush" checked
                                style="width:18px;height:18px;accent-color:#4f46e5;">
                            <label for="notificacaoPush" style="font-weight:500;color:#374151;">
                                <i class="fas fa-mobile-alt"></i> Enviar também via Push (celular)
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 🔥 ABRE O MODAL COM CALLBACK ISOLADO
        this.abrirModal(
            '<i class="fas fa-paper-plane"></i> Enviar Notificação',
            html,
            true,
            () => this.enviarNotificacaoEmMassa()
        );

        modalSaveBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Notificação';

        console.log('✅ Modal renderizado!');
    }

    mudarModoNotificacao(modo) {
        this.modoSelecaoIndividual = modo === 'individual';

        const btnTodos = document.getElementById('modoTodosBtn');
        const btnIndividual = document.getElementById('modoIndividualBtn');
        const secaoIndividual = document.getElementById('secaoSelecaoIndividual');
        const secaoPerfis = document.getElementById('secaoPerfisMassa');
        const infoDestinatarios = document.getElementById('infoDestinatariosNotificacao');

        if (modo === 'individual') {
            btnIndividual.style.background = '#4f46e5';
            btnIndividual.style.color = 'white';
            btnTodos.style.background = 'transparent';
            btnTodos.style.color = '#6b7280';
            secaoIndividual.style.display = 'block';
            secaoPerfis.style.display = 'none';
            if (infoDestinatarios) {
                infoDestinatarios.innerHTML = `
                    <i class="fas fa-info-circle" style="font-size:1.2rem;color:#4f46e5;"></i>
                    <span style="font-size:0.9rem;color:#1e40af;">
                        Busque e selecione <strong>1 usuário</strong> para enviar a notificação
                    </span>`;
            }
            setTimeout(() => document.getElementById('buscaUsuarioIndividual')?.focus(), 100);
        } else {
            btnTodos.style.background = '#4f46e5';
            btnTodos.style.color = 'white';
            btnIndividual.style.background = 'transparent';
            btnIndividual.style.color = '#6b7280';
            secaoIndividual.style.display = 'none';
            secaoPerfis.style.display = 'block';
            this.limparSelecaoIndividual();

            const roleFiltro = this.roleFiltroNotificacao || 'todos';
            let count = this.usuariosParaNotificacao?.length || 0;
            if (roleFiltro !== 'todos') {
                count = roleFiltro === 'admin'
                    ? (this.usuariosParaNotificacao?.filter(u => u.role === 'admin' || u.role === 'super_admin').length || 0)
                    : (this.usuariosParaNotificacao?.filter(u => u.role === roleFiltro).length || 0);
            }
            if (infoDestinatarios) {
                infoDestinatarios.innerHTML = `
                    <i class="fas fa-info-circle" style="font-size:1.2rem;color:#4f46e5;"></i>
                    <span style="font-size:0.9rem;color:#1e40af;">
                        <strong>${count}</strong> usuário(s) receberão esta notificação
                    </span>`;
            }
        }
    }

    buscarUsuarioIndividual(termo) {
        const container = document.getElementById('resultadosBuscaIndividual');
        if (!container) return;

        if (!termo || termo.length < 2) {
            container.style.display = 'none';
            return;
        }

        const termoLower = termo.toLowerCase();
        const resultados = (this.usuariosParaNotificacao || []).filter(u =>
            (u.nome && u.nome.toLowerCase().includes(termoLower)) ||
            (u.email && u.email.toLowerCase().includes(termoLower)) ||
            (u.matricula && u.matricula.includes(termo))
        ).slice(0, 10);

        if (resultados.length === 0) {
            container.innerHTML = `
                <div style="padding:20px;text-align:center;color:#6b7280;">
                    <i class="fas fa-search" style="font-size:24px;display:block;margin-bottom:10px;opacity:0.5;"></i>
                    Nenhum usuário encontrado
                </div>`;
            container.style.display = 'block';
            return;
        }

        let html = '';
        resultados.forEach(usuario => {
            const iniciais = (usuario.nome || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            const roleLabel = this.getRoleLabelVincular(usuario.role);
            const roleIcon = this.getRoleIconNotificacao(usuario.role);

            html += `
                <div onclick="adminSimples.selecionarUsuarioIndividual('${usuario._id}')"
                    style="padding:12px 15px;display:flex;align-items:center;gap:12px;cursor:pointer;
                           border-bottom:1px solid #f3f4f6;"
                    onmouseover="this.style.background='#f3f4f6'"
                    onmouseout="this.style.background='white'">
                    <div style="width:42px;height:42px;background:linear-gradient(135deg,#4f46e5,#7c3aed);
                        border-radius:50%;display:flex;align-items:center;justify-content:center;
                        color:white;font-weight:600;font-size:14px;flex-shrink:0;">${iniciais}</div>
                    <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;color:#1f2937;font-size:14px;
                                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            ${usuario.nome || 'Sem nome'}
                        </div>
                        <div style="font-size:12px;color:#6b7280;
                                    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            ${usuario.email || 'Sem email'}
                        </div>
                    </div>
                    <span style="background:#e0e7ff;color:#4f46e5;padding:3px 10px;border-radius:20px;
                                 font-size:10px;font-weight:600;white-space:nowrap;">
                        ${roleIcon} ${roleLabel}
                    </span>
                </div>
            `;
        });

        container.innerHTML = html;
        container.style.display = 'block';
    }

    selecionarUsuarioIndividual(usuarioId) {
        const usuario = this.usuariosParaNotificacao?.find(u => u._id === usuarioId);
        if (!usuario) {
            this.showToast('❌ Usuário não encontrado', 'error');
            return;
        }

        this.usuarioIndividualSelecionado = usuario;

        const r = document.getElementById('resultadosBuscaIndividual');
        if (r) r.style.display = 'none';
        const b = document.getElementById('buscaUsuarioIndividual');
        if (b) b.value = '';

        const selecionadoDiv = document.getElementById('usuarioIndividualSelecionado');
        if (selecionadoDiv) selecionadoDiv.style.display = 'block';

        const iniciais = (usuario.nome || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const roleLabel = this.getRoleLabelVincular(usuario.role);
        const roleIcon = this.getRoleIconNotificacao(usuario.role);

        const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
        set('avatarUsuarioSelecionado', iniciais);
        set('nomeUsuarioSelecionado', usuario.nome || 'Sem nome');
        set('emailUsuarioSelecionado', usuario.email || 'Sem email');
        set('roleUsuarioSelecionado', `${roleIcon} ${roleLabel}`);

        const infoDestinatarios = document.getElementById('infoDestinatariosNotificacao');
        if (infoDestinatarios) {
            infoDestinatarios.innerHTML = `
                <i class="fas fa-check-circle" style="font-size:1.2rem;color:#10b981;"></i>
                <span style="font-size:0.9rem;color:#065f46;">
                    <strong>1 usuário selecionado:</strong> ${usuario.nome}
                </span>`;
        }
    }

    limparSelecaoIndividual() {
        this.usuarioIndividualSelecionado = null;
        const sel = document.getElementById('usuarioIndividualSelecionado');
        if (sel) sel.style.display = 'none';
        const res = document.getElementById('resultadosBuscaIndividual');
        if (res) res.style.display = 'none';
        const info = document.getElementById('infoDestinatariosNotificacao');
        if (info) {
            info.innerHTML = `
                <i class="fas fa-info-circle" style="font-size:1.2rem;color:#4f46e5;"></i>
                <span style="font-size:0.9rem;color:#1e40af;">
                    Busque e selecione <strong>1 usuário</strong> para enviar a notificação
                </span>`;
        }
    }

    getRoleIconNotificacao(role) {
        const icons = {
            'aluno': '👨‍🎓', 'professor': '👨‍🏫', 'admin': '👑', 'super_admin': '⭐',
            'setor_pedagogico': '👩‍🏫', 'coordenacao_patio': '🏃', 'cozinha': '🍽️',
            'gestao_geral': '📊', 'enfermaria': '🏥', 'supervisao': '🛡️',
            'psicologia': '🧠', 'assistente-social': '🤝', 'protagonismo': '⭐',
            'biblioteca': '📚', 'secretaria': '🎓',
            'recepcao': '🛎️', 'gestao-adm': '🧑‍💼'
        };
        return icons[role] || '👤';
    }

    filtrarNotificacaoPorRole(role) {
        this.roleFiltroNotificacao = role;

        document.querySelectorAll('.perfil-notif-btn').forEach(btn => {
            const btnRole = btn.dataset.role;
            if (btnRole === role) {
                btn.style.borderColor = '#4f46e5';
                btn.style.background = '#eef2ff';
            } else {
                btn.style.borderColor = '#e5e7eb';
                btn.style.background = 'white';
            }
        });

        let usuariosFiltrados = this.usuariosParaNotificacao || [];
        if (role !== 'todos') {
            usuariosFiltrados = role === 'admin'
                ? usuariosFiltrados.filter(u => u.role === 'admin' || u.role === 'super_admin')
                : usuariosFiltrados.filter(u => u.role === role);
        }

        const roleLabels = {
            'todos': '📋 Todos os usuários', 'aluno': '👨‍🎓 Alunos', 'professor': '👨‍🏫 Professores',
            'admin': '👑 Administradores', 'setor_pedagogico': '👩‍🏫 Setor Pedagógico',
            'coordenacao_patio': '🏃 Coordenação de Pátio', 'cozinha': '🍽️ Cozinha',
            'gestao_geral': '📊 Gestão Geral', 'enfermaria': '🏥 Enfermaria',
            'supervisao': '🛡️ Supervisão', 'psicologia': '🧠 Psicologia',
            'assistente-social': '🤝 Assistente Social', 'protagonismo': '⭐ Protagonismo',
            'biblioteca': '📚 Biblioteca', 'secretaria': '🎓 Secretaria',
            'recepcao': '🛎️ Recepção', 'recepcao': '🛎️ Recepção', 'gestao-adm': '🧑‍💼 Gestão ADM'
        };

        const infoEl = document.getElementById('infoDestinatariosNotificacao');
        if (infoEl) {
            infoEl.innerHTML = `
                <i class="fas fa-info-circle" style="font-size:1.2rem;color:#4f46e5;"></i>
                <span style="font-size:0.9rem;color:#1e40af;">
                    <strong>${roleLabels[role] || role}:</strong>
                    <strong>${usuariosFiltrados.length}</strong> usuário(s) receberão
                </span>`;
        }
    }

    async enviarNotificacaoEmMassa() {
        console.log('📤 Enviando notificação...');

        const titulo = document.getElementById('notificacaoTitulo')?.value?.trim();
        const mensagem = document.getElementById('notificacaoMensagem')?.value?.trim();
        const cor = document.getElementById('notificacaoCor')?.value || '#4f46e5';
        const prioridade = parseInt(document.getElementById('notificacaoPrioridade')?.value) || 3;
        const enviarPush = document.getElementById('notificacaoPush')?.checked || false;

        if (!titulo) { this.showToast('❌ Digite um título', 'error'); return; }
        if (!mensagem) { this.showToast('❌ Digite uma mensagem', 'error'); return; }

        let usuariosDestino = [];
        let labelDestinatarios = '';

        if (this.modoSelecaoIndividual) {
            if (!this.usuarioIndividualSelecionado) {
                this.showToast('❌ Selecione um usuário', 'error');
                return;
            }
            usuariosDestino = [{
                id: this.usuarioIndividualSelecionado._id,
                nome: this.usuarioIndividualSelecionado.nome,
                email: this.usuarioIndividualSelecionado.email,
                role: this.usuarioIndividualSelecionado.role
            }];
            labelDestinatarios = this.usuarioIndividualSelecionado.nome;
        } else {
            const roleFiltro = this.roleFiltroNotificacao || 'todos';
            if (!this.usuariosParaNotificacao || this.usuariosParaNotificacao.length === 0) {
                this.showToast('❌ Nenhum usuário carregado', 'error');
                return;
            }
            if (roleFiltro === 'todos') {
                usuariosDestino = this.usuariosParaNotificacao.map(u => ({ id: u._id, nome: u.nome, email: u.email, role: u.role }));
                labelDestinatarios = 'Todos os usuários';
            } else if (roleFiltro === 'admin') {
                usuariosDestino = this.usuariosParaNotificacao
                    .filter(u => u.role === 'admin' || u.role === 'super_admin')
                    .map(u => ({ id: u._id, nome: u.nome, email: u.email, role: u.role }));
                labelDestinatarios = 'Administradores';
            } else {
                usuariosDestino = this.usuariosParaNotificacao
                    .filter(u => u.role === roleFiltro)
                    .map(u => ({ id: u._id, nome: u.nome, email: u.email, role: u.role }));
                labelDestinatarios = roleFiltro;
            }
        }

        if (usuariosDestino.length === 0) {
            this.showToast(`❌ Nenhum usuário para: ${labelDestinatarios}`, 'error');
            return;
        }

        const confirmar = await this.confirmar(
            '📢 Confirmar Envio',
            `Deseja enviar esta notificação?<br><br>
            <strong>📋 Destinatários:</strong> ${labelDestinatarios}<br>
            <strong>👥 Total:</strong> ${usuariosDestino.length} usuário(s)<br>
            <strong>📌 Título:</strong> ${titulo}<br>
            <strong>💬 Mensagem:</strong> ${mensagem.substring(0, 100)}${mensagem.length > 100 ? '...' : ''}<br>
            ${enviarPush ? '<br>📱 <strong>Push (celular) ativado</strong>' : '<br>💻 <strong>Apenas no sistema</strong>'}`
        );

        if (!confirmar) return;

        this.fecharModal();
        this.showToast(`📤 Enviando para ${usuariosDestino.length} usuários...`, 'info');

        const progressId = 'progresso-notificacao-' + Date.now();
        const progressHTML = `
            <div id="${progressId}" style="position:fixed;bottom:20px;right:20px;background:white;
                border-radius:12px;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,0.2);
                z-index:10000;min-width:320px;border:1px solid #e5e7eb;">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:15px;">
                    <div style="width:40px;height:40px;background:linear-gradient(135deg,#4f46e5,#7c3aed);
                        border-radius:10px;display:flex;align-items:center;justify-content:center;
                        color:white;font-size:20px;"><i class="fas fa-paper-plane"></i></div>
                    <div>
                        <strong style="display:block;color:#1f2937;">Enviando Notificações</strong>
                        <small style="color:#6b7280;">${labelDestinatarios}</small>
                    </div>
                </div>
                <div style="background:#f3f4f6;border-radius:20px;height:8px;overflow:hidden;margin-bottom:10px;">
                    <div id="${progressId}-bar" style="background:linear-gradient(90deg,#4f46e5,#7c3aed);
                        height:100%;width:0%;transition:width 0.3s ease;"></div>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:0.85rem;color:#4b5563;">
                    <span id="${progressId}-text">Iniciando...</span>
                    <span id="${progressId}-percent">0%</span>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', progressHTML);

        let enviados = 0;
        let erros = 0;
        let pushEnviados = 0;
        const token = localStorage.getItem('auth_token');

        for (let i = 0; i < usuariosDestino.length; i++) {
            const usuario = usuariosDestino[i];
            try {
                const notificacaoResponse = await fetch('/api/notificacoes', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        usuarioId: usuario.id,
                        tipo: 'sistema',
                        titulo: titulo,
                        mensagem: mensagem,
                        icone: '📢',
                        cor: cor,
                        link: null,
                        prioridade: prioridade,
                        dados: {
                            tipo: 'notificacao_massa',
                            enviadoPor: 'Admin',
                            role: usuario.role,
                            individual: this.modoSelecaoIndividual,
                            timestamp: Date.now()
                        }
                    })
                });

                const notificacaoData = await notificacaoResponse.json();
                if (notificacaoData.success) enviados++;
                else erros++;

                if (enviarPush && typeof this.enviarPushParaUsuario === 'function') {
                    try {
                        const ok = await this.enviarPushParaUsuario(
                            usuario.id, titulo, mensagem,
                            { tipo: 'notificacao_massa', prioridade, individual: this.modoSelecaoIndividual }
                        );
                        if (ok) pushEnviados++;
                    } catch (e) { console.warn('Push error:', e); }
                }
            } catch (error) {
                console.error(`❌ Erro ao processar ${usuario.nome}:`, error);
                erros++;
            }

            const percent = Math.round(((i + 1) / usuariosDestino.length) * 100);
            const barElement = document.getElementById(`${progressId}-bar`);
            const textElement = document.getElementById(`${progressId}-text`);
            const percentElement = document.getElementById(`${progressId}-percent`);

            if (barElement) barElement.style.width = `${percent}%`;
            if (percentElement) percentElement.textContent = `${percent}%`;
            if (textElement) textElement.textContent = `${i + 1} de ${usuariosDestino.length}...`;

            if (i < usuariosDestino.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        const progressElement = document.getElementById(progressId);
        const barElement = document.getElementById(`${progressId}-bar`);
        const textElement = document.getElementById(`${progressId}-text`);
        const percentElement = document.getElementById(`${progressId}-percent`);

        if (barElement) barElement.style.width = '100%';
        if (percentElement) percentElement.textContent = '100%';
        if (textElement) textElement.textContent = 'Concluído!';

        if (progressElement) {
            const iconeEl = progressElement.querySelector('div[style*="linear-gradient"]');
            if (iconeEl) {
                iconeEl.innerHTML = '<i class="fas fa-check"></i>';
                iconeEl.style.background = 'linear-gradient(135deg,#10b981,#059669)';
            }
        }

        setTimeout(() => {
            if (progressElement) {
                progressElement.style.transition = 'all 0.3s ease';
                progressElement.style.opacity = '0';
                progressElement.style.transform = 'translateY(20px)';
                setTimeout(() => progressElement.remove(), 300);
            }
        }, 2000);

        console.log(`✅ ${enviados} enviados, ${erros} erros, ${pushEnviados} push`);
        this.showToast(
            `✅ ${enviados} notificações enviadas!${erros > 0 ? ` (${erros} erros)` : ''}`,
            enviados > 0 ? 'success' : 'error'
        );
    }

    aplicarTemplateMensagem(tipo) {
        const t = document.getElementById('notificacaoTitulo');
        const m = document.getElementById('notificacaoMensagem');
        const c = document.getElementById('notificacaoCor');

        const templates = {
            'informativo': {
                titulo: '📢 Informativo Geral',
                mensagem: 'Prezados,\n\nInformamos que o sistema estará disponível normalmente. Qualquer novidade, comunicaremos em breve.\n\nAtenciosamente,\nAdministração',
                cor: '#4f46e5'
            },
            'lembrete': {
                titulo: '⏰ Lembrete Importante',
                mensagem: 'Olá!\n\nLembramos que os prazos para entrega de atividades e realização de provas devem ser respeitados. Fiquem atentos ao calendário.\n\nEquipe de Ensino',
                cor: '#f59e0b'
            },
            'urgente': {
                titulo: '⚠️ AVISO URGENTE',
                mensagem: 'ATENÇÃO!\n\nComunicado importante a todos. Por favor, verifiquem suas pendências com urgência.\n\nAdministração',
                cor: '#dc2626'
            },
            'manutencao': {
                titulo: '🔧 Manutenção Programada',
                mensagem: 'Prezados,\n\nInformamos que o sistema passará por manutenção programada no dia [DATA] das [HORÁRIO]. O sistema poderá ficar indisponível durante este período.\n\nAgradecemos a compreensão.',
                cor: '#2563eb'
            }
        };

        const template = templates[tipo];
        if (template) {
            if (t) t.value = template.titulo;
            if (m) m.value = template.mensagem;
            if (c) c.value = template.cor;
            this.showToast(`✅ Template "${template.titulo}" aplicado!`, 'success');
        }
    }

    // ============================================================================
    // DASHBOARD
    // ============================================================================
    async mudarAba(aba) {
        this.abaAtual = aba;

        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
        document.querySelectorAll('.nav-item[data-section="' + aba + '"]').forEach(item => item.classList.add('active'));

        const titulos = {
            dashboard: 'Dashboard', usuarios: 'Gerenciar Usuários', turmas: 'Gerenciar Turmas',
            provas: 'Gerenciar Provas', eixos: 'Gerenciar Eixos', cursos: 'Gerenciar Cursos',
            resultados: 'Resultados'
        };
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) pageTitle.textContent = titulos[aba] || 'Dashboard';

        switch (aba) {
            case 'dashboard': await this.carregarDashboard(); break;
            case 'usuarios': await this.carregarUsuarios(); break;
            case 'turmas': await this.carregarTurmas(); break;
            case 'provas': await this.carregarProvas(); break;
            case 'eixos': await this.carregarEixos(); break;
            case 'cursos': await this.carregarCursos(); break;
            case 'resultados': await this.carregarResultados(); break;
        }

        this.fecharPainelNotificacoes();
        if (typeof this.updateBottomNav === 'function') this.updateBottomNav(aba);
    }

    async carregarDashboard() {
        const content = document.getElementById('contentArea');
        if (!content) return;

        try {
            const token = localStorage.getItem('auth_token');

            const [response, eixosRes, cursosRes] = await Promise.all([
                fetch('/api/admin/dashboard', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/admin/eixos', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/admin/cursos', { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            const data = await response.json();
            const eixosData = await eixosRes.json();
            const cursosData = await cursosRes.json();

            const stats = data.success ? data.data : this.getDadosExemplo();

            this.eixos = eixosData.success ? (eixosData.eixos || []) : [];
            this.cursos = cursosData.success ? (cursosData.cursos || []) : [];

            const hora = new Date().getHours();
            let saudacao = 'Bom dia';
            if (hora >= 12 && hora < 18) saudacao = 'Boa tarde';
            else if (hora >= 18 || hora < 6) saudacao = 'Boa noite';

            const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
            const primeiroNome = (userData.nome || 'Admin').split(' ')[0];

            const hoje = new Date();
            const dataFormatada = hoje.toLocaleDateString('pt-BR', {
                weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            });
            const horaFormatada = hoje.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            const totalUsuarios = stats.totalUsuarios || 0;
            const totalTurmas = stats.totalTurmas || 0;
            const totalProvas = stats.totalProvas || 0;
            const totalResultados = stats.totalResultados || 0;
            const turmasAtivas = stats.turmasAtivas || 0;
            const provasAtivas = stats.provasPorStatus?.ativa || 0;
            const totalAlunos = stats.totalAlunos || 0;
            const totalProfessores = stats.totalProfessores || 0;

            content.innerHTML = `
                <div class="dashboard-welcome-simples">
                    <div class="welcome-simples-left">
                        <h1>👋 Olá, ${primeiroNome}!</h1>
                        <p>Aqui está o resumo do EducaPleno.</p>
                    </div>
                    <div class="welcome-simples-right">
                        <div class="welcome-simples-date">${dataFormatada}</div>
                        <div class="welcome-simples-time">${horaFormatada}</div>
                    </div>
                </div>

                <div class="dashboard-cards-simples">
                    <div class="card-simples usuarios" onclick="adminSimples.mudarAba('usuarios')">
                        <div class="card-simples-icon"><i class="fas fa-users"></i></div>
                        <div class="card-simples-content">
                            <div class="card-simples-label">Usuários</div>
                            <div class="card-simples-value">${totalUsuarios}</div>
                            <div class="card-simples-detail">
                                <i class="fas fa-user-graduate"></i> ${totalAlunos} alunos •
                                <i class="fas fa-chalkboard-teacher"></i> ${totalProfessores} prof.
                            </div>
                        </div>
                    </div>
                    <div class="card-simples turmas" onclick="adminSimples.mudarAba('turmas')">
                        <div class="card-simples-icon"><i class="fas fa-school"></i></div>
                        <div class="card-simples-content">
                            <div class="card-simples-label">Turmas</div>
                            <div class="card-simples-value">${totalTurmas}</div>
                            <div class="card-simples-detail"><i class="fas fa-check-circle"></i> ${turmasAtivas} ativas</div>
                        </div>
                    </div>
                    <div class="card-simples provas" onclick="adminSimples.mudarAba('provas')">
                        <div class="card-simples-icon"><i class="fas fa-file-alt"></i></div>
                        <div class="card-simples-content">
                            <div class="card-simples-label">Provas</div>
                            <div class="card-simples-value">${totalProvas}</div>
                            <div class="card-simples-detail"><i class="fas fa-fire"></i> ${provasAtivas} ativas</div>
                        </div>
                    </div>
                    <div class="card-simples resultados" onclick="adminSimples.mudarAba('resultados')">
                        <div class="card-simples-icon"><i class="fas fa-chart-bar"></i></div>
                        <div class="card-simples-content">
                            <div class="card-simples-label">Resultados</div>
                            <div class="card-simples-value">${totalResultados}</div>
                            <div class="card-simples-detail"><i class="fas fa-check-double"></i> correções</div>
                        </div>
                    </div>
                </div>

                <div class="dashboard-simples-layout">
                    <div class="dashboard-simples-main">
                        <div class="painel-simples-card">
                            <div class="painel-simples-header">
                                <div class="painel-simples-title">
                                    <i class="fas fa-history"></i><h3>Atividades Recentes</h3>
                                </div>
                                <a href="#" class="painel-simples-link" onclick="event.preventDefault(); adminSimples.verHistorico();">
                                    Ver histórico <i class="fas fa-arrow-right"></i>
                                </a>
                            </div>
                            <div class="painel-simples-list" id="atividadesRecentes">
                                ${this.gerarAtividades(stats.atividadesRecentes)}
                            </div>
                        </div>

                        <div class="painel-simples-card">
                            <div class="painel-simples-header">
                                <div class="painel-simples-title"><i class="fas fa-chart-pie"></i><h3>Estatísticas Rápidas</h3></div>
                            </div>
                            <div style="padding:8px;">
                                <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">
                                    <div style="background:#f0f9ff;padding:15px;border-radius:10px;border-left:3px solid #0891b2;">
                                        <div style="font-size:11px;color:#0891b2;font-weight:600;margin-bottom:5px;">
                                            <i class="fas fa-users"></i> ALUNOS ATIVOS
                                        </div>
                                        <div style="font-size:22px;font-weight:700;color:#1f2937;">${stats.totalAlunos || 0}</div>
                                    </div>
                                    <div style="background:#f0fdf4;padding:15px;border-radius:10px;border-left:3px solid #10b981;">
                                        <div style="font-size:11px;color:#059669;font-weight:600;margin-bottom:5px;">
                                            <i class="fas fa-user-graduate"></i> ACESSIBILIDADE
                                        </div>
                                        <div style="font-size:22px;font-weight:700;color:#1f2937;">${stats.alunosComAcessibilidade || 0}</div>
                                    </div>
                                    <div style="background:#fef3c7;padding:15px;border-radius:10px;border-left:3px solid #f59e0b;">
                                        <div style="font-size:11px;color:#d97706;font-weight:600;margin-bottom:5px;">
                                            <i class="fas fa-question-circle"></i> QUESTÕES
                                        </div>
                                        <div style="font-size:22px;font-weight:700;color:#1f2937;">${stats.totalQuestoes || 0}</div>
                                    </div>
                                    <div style="background:#f3e8ff;padding:15px;border-radius:10px;border-left:3px solid #8b5cf6;">
                                        <div style="font-size:11px;color:#7c3aed;font-weight:600;margin-bottom:5px;">
                                            <i class="fas fa-graduation-cap"></i> CURSOS/EIXOS
                                        </div>
                                        <div style="font-size:22px;font-weight:700;color:#1f2937;">
                                            ${(this.cursos?.length || 0)} / ${(this.eixos?.length || 0)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="dashboard-simples-sidebar">
                        <div class="painel-simples-card">
                            <div class="painel-simples-header">
                                <div class="painel-simples-title"><i class="fas fa-bolt"></i><h3>Ações Rápidas</h3></div>
                            </div>
                            <div class="acoes-rapidas-simples">
                                <a class="acao-rapida-simples-item" onclick="adminSimples.mudarAba('usuarios')">
                                    <div class="acao-rapida-simples-icon"><i class="fas fa-users"></i></div>
                                    <span>Gerenciar usuários</span><i class="fas fa-chevron-right"></i>
                                </a>
                                <a class="acao-rapida-simples-item" onclick="adminSimples.mudarAba('turmas')">
                                    <div class="acao-rapida-simples-icon"><i class="fas fa-school"></i></div>
                                    <span>Gerenciar turmas</span><i class="fas fa-chevron-right"></i>
                                </a>
                                <a class="acao-rapida-simples-item" onclick="adminSimples.mudarAba('provas')">
                                    <div class="acao-rapida-simples-icon"><i class="fas fa-file-alt"></i></div>
                                    <span>Criar prova</span><i class="fas fa-chevron-right"></i>
                                </a>
                                <a class="acao-rapida-simples-item" onclick="adminSimples.abrirModalEnvioNotificacao()">
                                    <div class="acao-rapida-simples-icon"><i class="fas fa-bullhorn"></i></div>
                                    <span>Enviar notificação</span><i class="fas fa-chevron-right"></i>
                                </a>
                                <a class="acao-rapida-simples-item" onclick="adminSimples.mudarAba('resultados')">
                                    <div class="acao-rapida-simples-icon"><i class="fas fa-chart-line"></i></div>
                                    <span>Ver resultados</span><i class="fas fa-chevron-right"></i>
                                </a>
                            </div>
                        </div>

                        <div class="painel-simples-card">
                            <div class="painel-simples-header">
                                <div class="painel-simples-title"><i class="fas fa-th-large"></i><h3>Atalhos</h3></div>
                            </div>
                            <div class="atalhos-simples">
                                <a class="atalho-simples-item" onclick="adminSimples.mudarAba('eixos')">
                                    <div class="atalho-simples-icon"><i class="fas fa-sitemap"></i></div>
                                    <div class="atalho-simples-label">Eixos</div>
                                </a>
                                <a class="atalho-simples-item" onclick="adminSimples.mudarAba('cursos')">
                                    <div class="atalho-simples-icon"><i class="fas fa-graduation-cap"></i></div>
                                    <div class="atalho-simples-label">Cursos</div>
                                </a>
                                <a class="atalho-simples-item" onclick="adminSimples.abrirModalUploadAdaptarDocumento()">
                                    <div class="atalho-simples-icon"><i class="fas fa-universal-access"></i></div>
                                    <div class="atalho-simples-label">Adaptar</div>
                                </a>
                                <a class="atalho-simples-item" onclick="window.location.href='editar-perfil.html'">
                                    <div class="atalho-simples-icon"><i class="fas fa-user-edit"></i></div>
                                    <div class="atalho-simples-label">Meu Perfil</div>
                                </a>
                            </div>
                        </div>

                        <div class="painel-simples-card">
                            <div class="painel-simples-header">
                                <div class="painel-simples-title"><i class="fas fa-info-circle"></i><h3>Info do Sistema</h3></div>
                            </div>
                            <div class="info-sistema-simples">
                                <div class="info-sistema-item">
                                    <div class="info-sistema-label"><i class="fas fa-code-branch"></i> Versão</div>
                                    <div class="info-sistema-valor">2.0.0</div>
                                </div>
                                <div class="info-sistema-item">
                                    <div class="info-sistema-label"><i class="fas fa-circle"></i> Status</div>
                                    <div class="info-sistema-valor ok"><i class="fas fa-circle" style="font-size:6px;"></i> Online</div>
                                </div>
                                <div class="info-sistema-item">
                                    <div class="info-sistema-label"><i class="fas fa-user-shield"></i> Perfil</div>
                                    <div class="info-sistema-valor">${userData.role === 'super_admin' ? 'Super Admin' : 'Admin'}</div>
                                </div>
                                <div class="info-sistema-item">
                                    <div class="info-sistema-label"><i class="fas fa-clock"></i> Última sync</div>
                                    <div class="info-sistema-valor">${horaFormatada}</div>
                                </div>
                                <div class="info-sistema-item">
                                    <div class="info-sistema-label"><i class="fas fa-database"></i> Último backup</div>
                                    <div class="info-sistema-valor warning"><i class="fas fa-exclamation-triangle"></i> Pendente</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('❌ Erro ao carregar dashboard:', error);
            content.innerHTML = `
                <div style="text-align:center;padding:60px;background:white;border-radius:14px;">
                    <i class="fas fa-exclamation-triangle" style="font-size:48px;color:#dc3545;margin-bottom:15px;"></i>
                    <h3 style="color:#721c24;margin-bottom:8px;">Erro ao carregar dashboard</h3>
                    <p style="color:#6c757d;margin-bottom:20px;">${error.message}</p>
                    <button onclick="adminSimples.carregarDashboard()" class="btn-primary">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>`;
        }
    }

    getDadosExemplo() {
        return {
            totalUsuarios: 150, totalAlunos: 120, totalProfessores: 28,
            totalTurmas: 12, turmasAtivas: 10, totalProvas: 45,
            provasPorStatus: { ativa: 25 }, totalResultados: 230,
            mediaGeral: 7.2, atividadesRecentes: []
        };
    }

    gerarAtividades(atividades) {
        if (!atividades || atividades.length === 0) {
            return `
                <div class="empty-dashboard-simples">
                    <i class="fas fa-history"></i>
                    <h4>Nenhuma atividade recente</h4>
                    <p>As atividades do sistema aparecerão aqui</p>
                </div>`;
        }

        return atividades.slice(0, 6).map(a => {
            let tipoClass = 'sistema';
            let icone = 'fa-info-circle';
            const acao = (a.acao || '').toLowerCase();

            if (acao.includes('criado') || acao.includes('cadastr') || acao.includes('usuário')) {
                tipoClass = 'cadastro'; icone = 'fa-user-plus';
            } else if (acao.includes('finalizou') || acao.includes('realizou') || acao.includes('resultado')) {
                tipoClass = 'resultado'; icone = 'fa-check-circle';
            } else if (acao.includes('prova') || acao.includes('publicad')) {
                tipoClass = 'prova'; icone = 'fa-file-alt';
            } else if (acao.includes('sistema') || acao.includes('iniciado')) {
                tipoClass = 'sistema'; icone = 'fa-crown';
            }

            const data = a.data ? new Date(a.data) : new Date();
            const dataFormatada = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
            const horaFormatada = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            return `
                <div class="atividade-simples-item">
                    <div class="atividade-simples-icon ${tipoClass}"><i class="fas ${icone}"></i></div>
                    <div class="atividade-simples-content">
                        <p><strong>${a.usuario || 'Sistema'}</strong> ${a.acao || ''} ${a.prova ? `<strong>${a.prova}</strong>` : ''}</p>
                        <small>${a.prova ? 'Prova' : 'Sistema'}</small>
                    </div>
                    <div class="atividade-simples-time">${dataFormatada}<br>${horaFormatada}</div>
                </div>`;
        }).join('');
    }

    verHistorico() {
        this.showToast('📊 Redirecionando para histórico...', 'info');
        setTimeout(() => this.showToast('ℹ️ Recurso em desenvolvimento', 'info'), 800);
    }

    // ============================================================================
    // USUÁRIOS
    // ============================================================================
    async carregarUsuarios() {
        console.log('📢 CARREGANDO USUÁRIOS...');
        const content = document.getElementById('contentArea');
        if (!content) return;

        content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Carregando usuários...</p></div>';

        try {
            const token = localStorage.getItem('auth_token');
            const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
            const isAdminNormal = userData.role === 'admin';

            const response = await fetch('/api/admin/usuarios?limit=1000', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro ao carregar usuários');

            let usuarios = data.usuarios || [];
            if (isAdminNormal) {
                usuarios = usuarios.filter(u => u.role !== 'super_admin');
            }

            this.usuarios = usuarios;

            content.innerHTML = `
                <div class="section-header">
                    <h2><i class="fas fa-users"></i> Usuários</h2>
                    <button class="btn-primary" onclick="adminSimples.novoUsuario()">
                        <i class="fas fa-plus"></i> Novo
                    </button>
                </div>

                <div class="filters-bar">
                    <div class="filter-group">
                        <label><i class="fas fa-search"></i> Buscar</label>
                        <input type="text" id="buscaUsuario" placeholder="Nome, email ou matrícula..."
                            class="form-control" onkeyup="adminSimples.filtrarUsuarios()" autocomplete="off">
                    </div>
                    <div class="filter-group">
                        <label><i class="fas fa-user-tag"></i> Perfil</label>
                        <select id="filtroRole" class="form-control" onchange="adminSimples.filtrarUsuarios()">
                            <option value="todos">Todos</option>
                            <option value="aluno">Alunos</option>
                            <option value="professor">Professores</option>
                            <option value="setor_pedagogico">Setor Pedagógico</option>
                            <option value="coordenacao_patio">Coordenação de Pátio</option>
                            <option value="cozinha">Cozinha</option>
                            <option value="gestao_geral">Gestão Geral</option>
                            <option value="enfermaria">Enfermaria</option>
                            <option value="supervisao">Supervisão</option>
                            <option value="psicologia">Psicologia</option>
                            <option value="assistente-social">Assistente Social</option>
                            <option value="protagonismo">Protagonismo</option>
                            <option value="biblioteca">Biblioteca</option>
                            <option value="secretaria">Secretaria</option>
                            <option value="gestao-adm">Gestão ADM</option>
                            <option value="recepcao">Recepção</option>
                            <option value="admin">Admins</option>
                        </select>
                    </div>
                    <div class="filter-actions">
                        <button class="btn-filter" onclick="adminSimples.limparFiltrosUsuarios()">
                            <i class="fas fa-eraser"></i> Limpar
                        </button>
                    </div>
                </div>

                <div class="table-responsive">
                    <table>
                        <thead>
                            <tr>
                                <th>Nome</th><th>Email</th><th>Perfil</th><th>Matrícula</th>
                                <th>CPF</th><th>Telefone</th><th>Status</th><th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="tabelaUsuarios">
                            ${this.gerarLinhasUsuarios(this.usuarios)}
                        </tbody>
                    </table>
                </div>

                <div class="pagination">
                    <button class="btn-pagination" onclick="adminSimples.paginaAnterior('usuarios')" id="btnAnteriorUsuario" disabled>
                        <i class="fas fa-chevron-left"></i> Anterior
                    </button>
                    <span id="pageInfoUsuario">Página 1 de 1</span>
                    <button class="btn-pagination" onclick="adminSimples.proximaPagina('usuarios')" id="btnProximaUsuario" disabled>
                        Próxima <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            `;

            this.paginaAtualUsuario = 1;
            this.usuariosFiltrados = [...this.usuarios];
            this.itensPorPagina = 10;
            this.atualizarTabelaUsuarios();

        } catch (error) {
            console.error('❌ Erro ao carregar usuários:', error);
            content.innerHTML = `
                <div class="error-container" style="text-align:center;padding:40px;">
                    <i class="fas fa-exclamation-triangle" style="font-size:48px;color:#dc3545;margin-bottom:15px;"></i>
                    <h3 style="color:#721c24;">Erro ao carregar usuários</h3>
                    <p style="color:#6c757d;">${error.message}</p>
                    <button onclick="adminSimples.carregarUsuarios()" class="btn-primary" style="margin-top:15px;">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>`;
        }
    }

    gerarLinhasUsuarios(usuarios) {
        const usuariosFiltrados = usuarios.filter(u => u.role !== 'super_admin');
        if (!usuariosFiltrados || usuariosFiltrados.length === 0) {
            return '<tr><td colspan="8" class="empty-state">Nenhum usuário encontrado</td></tr>';
        }

        return usuariosFiltrados.map(u => {
            const cpfFormatado = u.cpf ? u.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '-';
            const telefoneFormatado = u.telefone ? u.telefone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3') : '-';

            const roleMap = {
                'aluno': { class: 'aluno', icon: 'fa-user-graduate', label: 'Aluno' },
                'professor': { class: 'professor', icon: 'fa-chalkboard-teacher', label: 'Professor' },
                'admin': { class: 'admin', icon: 'fa-user-shield', label: 'Admin' },
                'super_admin': { class: 'super_admin', icon: 'fa-crown', label: 'Super Admin' },
                'setor_pedagogico': { class: 'setor_pedagogico', icon: 'fa-chalkboard-user', label: 'Setor Pedagógico' },
                'coordenacao_patio': { class: 'coordenacao_patio', icon: 'fa-utensils', label: 'Coordenação de Pátio' },
                'cozinha': { class: 'cozinha', icon: 'fa-kitchen-set', label: 'Cozinha' },
                'gestao_geral': { class: 'gestao_geral', icon: 'fa-chart-line', label: 'Gestão Geral' },
                'enfermaria': { class: 'enfermaria', icon: 'fa-hospital-user', label: 'Enfermaria' },
                'supervisao': { class: 'supervisao', icon: 'fa-shield-alt', label: 'Supervisão' },
                'psicologia': { class: 'psicologia', icon: 'fa-brain', label: 'Psicologia' },
                'assistente-social': { class: 'assistente-social', icon: 'fa-hands-helping', label: 'Assistente Social' },
                'protagonismo': { class: 'protagonismo', icon: 'fa-star', label: 'Protagonismo' },
                'biblioteca': { class: 'biblioteca', icon: 'fa-book-reader', label: 'Biblioteca' },
                'secretaria': { class: 'secretaria', icon: 'fa-graduation-cap', label: 'Secretaria' },
                'gestao-adm': { class: 'gestao-adm', icon: 'fa-user-tie', label: 'Gestão ADM' },
                'recepcao': { class: 'recepcao', icon: 'fa-concierge-bell', label: 'Recepção' }
            };

            const roleInfo = roleMap[u.role] || { class: '', icon: 'fa-user', label: u.role || 'Desconhecido' };
            const roleBadge = `<span class="role-badge ${roleInfo.class}"><i class="fas ${roleInfo.icon}"></i> ${roleInfo.label}</span>`;

            return `
                <tr>
                    <td><strong>${this.escapeHtml(u.nome) || 'N/A'}</strong></td>
                    <td>${this.escapeHtml(u.email) || '-'}</td>
                    <td>${roleBadge}</td>
                    <td>${this.escapeHtml(u.matricula) || '-'}</td>
                    <td>${cpfFormatado}</td>
                    <td>${telefoneFormatado}</td>
                    <td><span class="status-badge ${u.ativo ? 'active' : 'inactive'}">${u.ativo ? 'Ativo' : 'Inativo'}</span></td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-icon" onclick="adminSimples.visualizarQRCodeUsuario('${u._id}')" title="QR Code">
                                <i class="fas fa-qrcode" style="color:#8b5cf6;"></i>
                            </button>
                            <button class="btn-icon edit" onclick="adminSimples.editarUsuario('${u._id}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon" onclick="adminSimples.resetarSenha('${u._id}')" title="Resetar senha">
                                <i class="fas fa-key"></i>
                            </button>
                            <button class="btn-icon" onclick="adminSimples.gerarRelatorioUsuario('${u._id}')" title="Relatório">
                                <i class="fas fa-chart-line"></i>
                            </button>
                            <button class="btn-icon ${u.ativo ? 'warning' : 'success'}"
                                onclick="adminSimples.inativarAtivarUsuario('${u._id}')"
                                title="${u.ativo ? 'Inativar' : 'Ativar'}">
                                <i class="fas ${u.ativo ? 'fa-ban' : 'fa-check-circle'}"></i>
                            </button>
                            <button class="btn-icon delete" onclick="adminSimples.excluirUsuario('${u._id}')" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
        }).join('');
    }

    async inativarAtivarUsuario(id) {
        const usuario = this.usuarios.find(u => u._id === id);
        if (!usuario) { this.showToast('❌ Usuário não encontrado', 'error'); return; }
        if (usuario.role === 'super_admin') { this.showToast('❌ Não é possível inativar Super Admins', 'error'); return; }

        const novoStatus = !usuario.ativo;
        const acao = novoStatus ? 'ativar' : 'inativar';
        const acaoTexto = novoStatus ? 'ativado' : 'inativado';

        const confirmar = await this.confirmar(
            `${novoStatus ? '✅ Ativar' : '⚠️ Inativar'} Usuário`,
            `Deseja ${acao} <strong>${usuario.nome}</strong>?<br><br>${!novoStatus ? '<span style="color:#dc3545;">Usuários inativados não poderão acessar o sistema.</span>' : ''}`,
            `Sim, ${acao}`, 'Cancelar'
        );
        if (!confirmar) return;

        try {
            this.showToast(`🔄 ${acao === 'ativar' ? 'Ativando' : 'Inativando'}...`, 'info');
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/admin/usuarios/${id}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ativo: novoStatus })
            });
            const data = await response.json();
            if (data.success) {
                this.showToast(`✅ Usuário ${acaoTexto}!`, 'success');
                usuario.ativo = novoStatus;
                this.atualizarTabelaUsuarios();
                this.carregarDashboard();
            } else {
                throw new Error(data.error || 'Erro ao alterar status');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    async excluirUsuario(id) {
        const usuario = this.usuarios.find(u => u._id === id);
        if (!usuario) { this.showToast('❌ Usuário não encontrado', 'error'); return; }
        if (usuario.role === 'super_admin') { this.showToast('❌ Não é possível excluir Super Admins', 'error'); return; }

        const confirmar = await this.confirmar(
            '🗑️ Excluir Usuário',
            `Excluir PERMANENTEMENTE <strong>${usuario.nome}</strong>?<br><br>
            <span style="color:#dc3545;">⚠️ Esta ação não pode ser desfeita!</span>`,
            'Sim, excluir permanentemente', 'Cancelar'
        );
        if (!confirmar) return;

        try {
            this.showToast('🗑️ Excluindo...', 'info');
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/admin/usuarios/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                this.showToast('✅ Usuário excluído!', 'success');
                this.usuarios = this.usuarios.filter(u => u._id !== id);
                this.usuariosFiltrados = this.usuariosFiltrados.filter(u => u._id !== id);
                this.atualizarTabelaUsuarios();
                this.carregarDashboard();
            } else {
                throw new Error(data.error || 'Erro ao excluir');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    async gerarRelatorioUsuario(id) {
        const usuario = this.usuarios.find(u => u._id === id);
        if (!usuario) { this.showToast('❌ Usuário não encontrado', 'error'); return; }

        try {
            this.showToast('📊 Gerando relatório...', 'info');
            const token = localStorage.getItem('auth_token');
            let resultados = [];

            try {
                const response = await fetch(`/api/admin/usuarios/${id}/resultados`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const ct = response.headers.get('content-type');
                if (ct && ct.includes('application/json')) {
                    const data = await response.json();
                    if (data.success && data.resultados) resultados = data.resultados;
                }
            } catch (error) {
                console.warn('Erro ao buscar resultados:', error);
            }

            const totalProvas = resultados.length;
            const aprovacoes = resultados.filter(r => r.nota && r.nota >= 7).length;
            const reprovacoes = resultados.filter(r => r.nota && r.nota < 7).length;
            const pendentes = resultados.filter(r => !r.nota && !r.cancelada).length;
            const notas = resultados.filter(r => r.nota);
            const media = notas.length > 0 ? (notas.reduce((acc, r) => acc + r.nota, 0) / notas.length).toFixed(2) : '0.00';

            const html = `
                <div style="padding:20px;min-width:500px;">
                    <div style="text-align:center;margin-bottom:25px;">
                        <div style="width:80px;height:80px;background:linear-gradient(135deg,#667eea,#764ba2);
                            border-radius:50%;display:flex;align-items:center;justify-content:center;
                            margin:0 auto 15px;">
                            <span style="font-size:32px;color:white;font-weight:bold;">
                                ${usuario.nome?.charAt(0).toUpperCase() || 'U'}
                            </span>
                        </div>
                        <h2 style="margin:0;color:#1f2937;">${usuario.nome || 'Usuário'}</h2>
                        <p style="color:#6b7280;margin:5px 0;">${usuario.email || ''}</p>
                        <p style="color:#6b7280;font-size:13px;">
                            Matrícula: ${usuario.matricula || 'Não cadastrada'} •
                            Perfil: ${this.getRoleLabel(usuario.role)}
                        </p>
                    </div>

                    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:15px;margin-bottom:25px;">
                        <div style="background:#e3f2fd;padding:15px;border-radius:12px;text-align:center;">
                            <div style="font-size:28px;font-weight:bold;color:#1976d2;">${totalProvas}</div>
                            <div style="font-size:12px;color:#666;">Provas</div>
                        </div>
                        <div style="background:#e8f5e9;padding:15px;border-radius:12px;text-align:center;">
                            <div style="font-size:28px;font-weight:bold;color:#388e3c;">${aprovacoes}</div>
                            <div style="font-size:12px;color:#666;">Aprovações</div>
                        </div>
                        <div style="background:#ffebee;padding:15px;border-radius:12px;text-align:center;">
                            <div style="font-size:28px;font-weight:bold;color:#c62828;">${reprovacoes}</div>
                            <div style="font-size:12px;color:#666;">Reprovações</div>
                        </div>
                        <div style="background:#fff3e0;padding:15px;border-radius:12px;text-align:center;">
                            <div style="font-size:28px;font-weight:bold;color:#f57c00;">${pendentes}</div>
                            <div style="font-size:12px;color:#666;">Pendentes</div>
                        </div>
                    </div>

                    <div style="background:#f8fafc;padding:15px;border-radius:12px;margin-bottom:25px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span><strong>Média Geral:</strong></span>
                            <span style="font-size:24px;font-weight:bold;color:${parseFloat(media) >= 7 ? '#10b981' : '#ef4444'};">${media}</span>
                        </div>
                        <div style="margin-top:10px;background:#e5e7eb;border-radius:10px;height:8px;overflow:hidden;">
                            <div style="width:${(parseFloat(media) / 10) * 100}%;height:100%;
                                background:${parseFloat(media) >= 7 ? '#10b981' : '#ef4444'};border-radius:10px;"></div>
                        </div>
                    </div>
                </div>`;

            this.abrirModal(`📊 Relatório - ${usuario.nome}`, html, false);

        } catch (error) {
            console.error('❌ Erro ao gerar relatório:', error);
            this.showToast('❌ Erro ao carregar relatório', 'error');
        }
    }

    atualizarTabelaUsuarios() {
        if (!this.usuariosFiltrados) return;

        const inicio = (this.paginaAtualUsuario - 1) * this.itensPorPagina;
        const fim = inicio + this.itensPorPagina;
        const pagina = this.usuariosFiltrados.slice(inicio, fim);

        const tabela = document.getElementById('tabelaUsuarios');
        if (tabela) tabela.innerHTML = this.gerarLinhasUsuarios(pagina);

        const totalPaginas = Math.ceil(this.usuariosFiltrados.length / this.itensPorPagina) || 1;

        const pageInfo = document.getElementById('pageInfoUsuario');
        const btnAnterior = document.getElementById('btnAnteriorUsuario');
        const btnProxima = document.getElementById('btnProximaUsuario');

        if (pageInfo) pageInfo.textContent = `Página ${this.paginaAtualUsuario} de ${totalPaginas}`;
        if (btnAnterior) btnAnterior.disabled = this.paginaAtualUsuario === 1;
        if (btnProxima) btnProxima.disabled = this.paginaAtualUsuario === totalPaginas;
    }

    filtrarUsuarios() {
        const busca = document.getElementById('buscaUsuario')?.value.toLowerCase() || '';
        const role = document.getElementById('filtroRole')?.value || 'todos';

        const usuariosSemSuper = this.usuarios.filter(u => u.role !== 'super_admin');

        this.usuariosFiltrados = usuariosSemSuper.filter(u => {
            const matchBusca = busca === '' ||
                (u.nome && u.nome.toLowerCase().includes(busca)) ||
                (u.email && u.email.toLowerCase().includes(busca));
            const matchRole = role === 'todos' || u.role === role;
            return matchBusca && matchRole;
        });

        this.paginaAtualUsuario = 1;
        this.atualizarTabelaUsuarios();
    }

    limparFiltrosUsuarios() {
        const buscaInput = document.getElementById('buscaUsuario');
        if (buscaInput) buscaInput.value = '';
        const selectRole = document.getElementById('filtroRole');
        if (selectRole) selectRole.value = 'todos';

        this.usuariosFiltrados = [...this.usuarios];
        this.paginaAtualUsuario = 1;
        this.atualizarTabelaUsuarios();
        this.showToast('✅ Filtros limpos', 'success');
    }

    paginaAnterior(tipo) {
        if (tipo === 'usuarios') {
            if (this.paginaAtualUsuario > 1) {
                this.paginaAtualUsuario--;
                this.atualizarTabelaUsuarios();
            }
        } else if (tipo === 'turmas') {
            if (this.paginaAtualTurma > 1) {
                this.paginaAtualTurma--;
                this.atualizarTabelaTurmas();
            }
        }
    }

    proximaPagina(tipo) {
        if (tipo === 'usuarios') {
            const totalPaginas = Math.ceil(this.usuariosFiltrados.length / this.itensPorPagina);
            if (this.paginaAtualUsuario < totalPaginas) {
                this.paginaAtualUsuario++;
                this.atualizarTabelaUsuarios();
            }
        } else if (tipo === 'turmas') {
            const totalPaginas = Math.ceil(this.turmasFiltradas.length / this.itensPorPagina);
            if (this.paginaAtualTurma < totalPaginas) {
                this.paginaAtualTurma++;
                this.atualizarTabelaTurmas();
            }
        }
    }

    novoUsuario() { this.abrirModalUsuario(); }

    async editarUsuario(id) {
        const usuario = this.usuarios.find(u => u._id === id);
        if (usuario) {
            if (usuario.role === 'super_admin') {
                this.showToast('❌ Não é possível editar Super Admins', 'error');
                return;
            }
            this.abrirModalUsuario(usuario);
        }
    }

    gerarSenha() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
        let senha = '';
        for (let i = 0; i < 10; i++) senha += chars.charAt(Math.floor(Math.random() * chars.length));
        return senha;
    }

    gerarNovaSenha() {
        const input = document.getElementById('senhaUsuario');
        if (input) input.value = this.gerarSenha();
    }

    async visualizarQRCodeUsuario(usuarioId) {
        try {
            console.log('📱 Buscando QR Code:', usuarioId);
            this.showToast('🔄 Carregando QR Code...', 'info');
            const token = localStorage.getItem('auth_token');

            const response = await fetch(`/api/admin/usuarios/${usuarioId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro ao carregar usuário');

            const usuario = data.user;
            let qrCodeDataUrl = usuario.qrCodeUsuario || null;
            let qrCodeGeradoEm = usuario.qrCodeUsuarioGeradoEm || null;

            if (!qrCodeDataUrl) {
                try {
                    const p = await fetch('/api/perfil/me', { headers: { 'Authorization': `Bearer ${token}` } });
                    const pd = await p.json();
                    if (pd.success && pd.perfil && pd.perfil.qrCodeUsuario) {
                        qrCodeDataUrl = pd.perfil.qrCodeUsuario;
                        qrCodeGeradoEm = pd.perfil.qrCodeUsuarioGeradoEm;
                    }
                } catch (e) { console.log('⚠️ Rota alternativa falhou:', e.message); }
            }

            let qrCodeHtml = '';
            if (qrCodeDataUrl) {
                qrCodeHtml = `
                    <div style="text-align:center;padding:20px;">
                        <img src="${qrCodeDataUrl}" alt="QR Code"
                            style="width:200px;height:200px;margin:0 auto;border:3px solid #e5e7eb;
                                   border-radius:16px;padding:15px;background:white;
                                   box-shadow:0 4px 12px rgba(0,0,0,0.1);">
                        <div style="margin-top:15px;">
                            <p style="font-size:0.85rem;color:#10b981;">
                                <i class="fas fa-check-circle"></i> QR Code ${qrCodeGeradoEm ? `gerado em ${new Date(qrCodeGeradoEm).toLocaleDateString('pt-BR')}` : 'disponível'}
                            </p>
                            <p style="font-size:0.8rem;color:#6b7280;">
                                <i class="fas fa-user"></i> <strong>${usuario.nome}</strong>
                            </p>
                            <p style="font-size:0.75rem;color:#8b5cf6;">
                                <i class="fas fa-arrow-right"></i> <strong>Destino:</strong> ${this.getDestinoLabel(usuario.role)}
                            </p>
                        </div>
                    </div>`;
            } else {
                qrCodeHtml = `
                    <div style="text-align:center;padding:40px;">
                        <i class="fas fa-qrcode" style="font-size:64px;color:#d1d5db;margin-bottom:15px;"></i>
                        <h3 style="color:#6b7280;">QR Code não disponível</h3>
                        <p style="color:#9ca3af;">O usuário ainda não possui um QR Code gerado.</p>
                    </div>`;
            }

            const modalBody = document.getElementById('modalBody');
            if (!modalBody) return;

            modalBody.innerHTML = `
                <div style="padding:20px;max-height:70vh;overflow-y:auto;">
                    <div style="text-align:center;margin-bottom:20px;">
                        <div style="width:80px;height:80px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);
                            border-radius:50%;display:flex;align-items:center;justify-content:center;
                            margin:0 auto 15px;">
                            <i class="fas fa-qrcode" style="font-size:36px;color:white;"></i>
                        </div>
                        <h2 style="margin:0;color:#1f2937;">QR Code de Identificação</h2>
                        <p style="color:#6b7280;margin:5px 0;">
                            <strong>${usuario.nome}</strong> • ${usuario.email}
                        </p>
                    </div>

                    <div style="background:#f8fafc;border-radius:12px;padding:15px;margin-bottom:20px;">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                            <div>
                                <div style="font-size:0.7rem;color:#64748b;">Perfil</div>
                                <div style="font-weight:600;">${this.getRoleLabel(usuario.role)}</div>
                            </div>
                            <div>
                                <div style="font-size:0.7rem;color:#64748b;">Matrícula</div>
                                <div style="font-weight:600;">${usuario.matricula || 'Não informada'}</div>
                            </div>
                            <div>
                                <div style="font-size:0.7rem;color:#64748b;">Status</div>
                                <div><span class="status-badge ${usuario.ativo ? 'active' : 'inactive'}">${usuario.ativo ? 'Ativo' : 'Inativo'}</span></div>
                            </div>
                            <div>
                                <div style="font-size:0.7rem;color:#64748b;">Destino</div>
                                <div style="font-weight:600;color:#8b5cf6;">${this.getDestinoLabel(usuario.role)}</div>
                            </div>
                        </div>
                    </div>

                    ${qrCodeHtml}

                    <div style="display:flex;gap:10px;margin-top:20px;">
                        ${qrCodeDataUrl ? `
                            <button onclick="adminSimples.baixarQRCodeImagem('${qrCodeDataUrl}', '${usuario.nome}')"
                                style="flex:1;padding:12px;background:#8b5cf6;color:white;border:none;
                                       border-radius:8px;cursor:pointer;">
                                <i class="fas fa-download"></i> Baixar QR Code
                            </button>` : ''}
                        <button onclick="adminSimples.fecharModal()"
                            style="flex:1;padding:12px;background:#6b7280;color:white;border:none;
                                   border-radius:8px;cursor:pointer;">
                            Fechar
                        </button>
                    </div>
                </div>`;

            this.abrirModal(
                '<i class="fas fa-qrcode" style="color:#8b5cf6;"></i> QR Code do Usuário',
                modalBody.innerHTML,
                false
            );
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    baixarQRCodeImagem(qrCodeDataUrl, nomeUsuario) {
        try {
            const link = document.createElement('a');
            const nomeArquivo = `qrcode-${nomeUsuario.replace(/\s/g, '-')}-${Date.now()}.png`;
            link.download = nomeArquivo;
            link.href = qrCodeDataUrl;
            link.click();
            this.showToast(`✅ QR Code baixado!`, 'success');
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ Erro ao baixar QR Code', 'error');
        }
    }

    async resetarSenha(id) {
        const usuario = this.usuarios.find(u => u._id === id);
        if (!usuario) return;
        if (usuario.role === 'super_admin') {
            this.showToast('❌ Não é possível resetar Super Admins', 'error');
            return;
        }

        const novaSenha = Math.random().toString(36).slice(-8);

        const confirmar = await this.confirmar(
            '🔑 Resetar Senha',
            `Resetar senha de <strong>${usuario.nome}</strong>?<br><br>Nova senha: <code>${novaSenha}</code>`,
            'Sim, resetar', 'Cancelar'
        );
        if (!confirmar) return;

        try {
            this.showToast('Processando...', 'info');
            const response = await fetch(`/api/admin/usuarios/${id}/reset-password`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify({ novaSenha })
            });
            const data = await response.json();
            if (data.success) {
                this.showToast(`✅ Nova senha: ${novaSenha}`, 'success');
            } else {
                throw new Error(data.error || 'Erro ao resetar senha');
            }
        } catch (error) {
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    escapeHtml(text) {
        if (!text) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
            .replace(/\n/g, '\\n');
    }

    async abrirModalUsuario(usuario = null) {
        console.log('📝 Abrindo modal usuário');

        if (usuario && usuario.role === 'super_admin') {
            this.showToast('❌ Não é possível editar Super Admins', 'error');
            return;
        }

        let cursosDoBanco = [];
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/admin/cursos', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success && data.cursos) cursosDoBanco = data.cursos;
        } catch (error) {
            console.error('❌ Erro ao buscar cursos:', error);
        }

        const nome = usuario?.nome || '';
        const email = usuario?.email || '';
        const role = usuario?.role || 'aluno';
        const ativo = usuario?.ativo !== false;
        const id = usuario?._id || usuario?.id || '';
        const cpf = usuario?.cpf || '';
        const telefone = usuario?.telefone || '';
        const matricula = usuario?.matricula || '';
        const cursoSelecionado = usuario?.curso || '';
        const turma = usuario?.turma || '';
        const eixo = usuario?.eixo || '';
        const precisaAcessibilidade = usuario?.precisaAcessibilidade === true;
        const condicaoAcessibilidade = usuario?.condicaoAcessibilidade || '';
        const perfilAlimentar = usuario?.perfilAlimentar || 'nao_informado';
        const refeicoesQueParticipa = usuario?.refeicoesQueParticipa || [];

        const escapeStr = (str) => String(str || '').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

        const gerarOpcoesCursos = () => {
            if (!cursosDoBanco || cursosDoBanco.length === 0) {
                return '<option value="">Nenhum curso disponível</option>';
            }
            let options = '<option value="">Selecione um curso...</option>';
            const ordenados = [...cursosDoBanco].sort((a, b) => a.nome.localeCompare(b.nome));
            ordenados.forEach(curso => {
                if (curso.ativo === false) return;
                const selected = cursoSelecionado === curso.nome ? 'selected' : '';
                options += `<option value="${escapeStr(curso.nome)}" ${selected}>${curso.nome}</option>`;
            });
            return options;
        };

        const conteudoHTML = `
            <form id="formUsuario">
                <div class="form-group">
                    <label>Nome</label>
                    <input type="text" id="nomeUsuario" class="form-control" value="${escapeStr(nome)}" required>
                </div>
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="emailUsuario" class="form-control" value="${escapeStr(email)}" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Perfil</label>
                        <select id="roleUsuario" class="form-control">
                            <option value="aluno" ${role === 'aluno' ? 'selected' : ''}>Aluno</option>
                            <option value="professor" ${role === 'professor' ? 'selected' : ''}>Professor</option>
                            <option value="admin" ${role === 'admin' ? 'selected' : ''}>Admin</option>
                            <option value="super_admin" ${role === 'super_admin' ? 'selected' : ''}>Super Admin</option>
                            <option value="setor_pedagogico" ${role === 'setor_pedagogico' ? 'selected' : ''}>Setor Pedagógico</option>
                            <option value="coordenacao_patio" ${role === 'coordenacao_patio' ? 'selected' : ''}>Coordenação de Pátio</option>
                            <option value="cozinha" ${role === 'cozinha' ? 'selected' : ''}>Cozinha</option>
                            <option value="gestao_geral" ${role === 'gestao_geral' ? 'selected' : ''}>Gestão Geral</option>
                            <option value="enfermaria" ${role === 'enfermaria' ? 'selected' : ''}>Enfermaria</option>
                            <option value="supervisao" ${role === 'supervisao' ? 'selected' : ''}>Supervisão</option>
                            <option value="psicologia" ${role === 'psicologia' ? 'selected' : ''}>Psicologia</option>
                            <option value="assistente-social" ${role === 'assistente-social' ? 'selected' : ''}>Assistente Social</option>
                            <option value="protagonismo" ${role === 'protagonismo' ? 'selected' : ''}>Protagonismo</option>
                            <option value="biblioteca" ${role === 'biblioteca' ? 'selected' : ''}>Biblioteca</option>
                            <option value="secretaria" ${role === 'secretaria' ? 'selected' : ''}>Secretaria</option>
                            <option value="gestao-adm" ${role === 'gestao-adm' ? 'selected' : ''}>Gestão ADM</option>
                            <option value="recepcao" ${role === 'recepcao' ? 'selected' : ''}>Recepção</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Status</label>
                        <select id="statusUsuario" class="form-control">
                            <option value="true" ${ativo ? 'selected' : ''}>Ativo</option>
                            <option value="false" ${!ativo ? 'selected' : ''}>Inativo</option>
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>CPF</label>
                        <input type="text" id="cpfUsuario" class="form-control" value="${escapeStr(cpf)}" placeholder="Apenas números">
                    </div>
                    <div class="form-group">
                        <label>Telefone</label>
                        <input type="text" id="telefoneUsuario" class="form-control" value="${escapeStr(telefone)}" placeholder="(99) 99999-9999">
                    </div>
                </div>
                <div class="form-group">
                    <label>Matrícula</label>
                    <input type="text" id="matriculaUsuario" class="form-control" value="${escapeStr(matricula)}">
                </div>

                <div id="alunoFields" style="${role === 'aluno' ? 'display:block;' : 'display:none;'}">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Curso</label>
                            <select id="cursoUsuario" class="form-control">${gerarOpcoesCursos()}</select>
                            ${cursosDoBanco.length === 0 ? '<small style="color:#ef4444;">⚠️ Nenhum curso encontrado.</small>' : ''}
                        </div>
                        <div class="form-group">
                            <label>Turma</label>
                            <input type="text" id="turmaUsuario" class="form-control" value="${escapeStr(turma)}" placeholder="Ex: 101">
                        </div>
                    </div>

                    <div style="margin-top:15px;padding:15px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;">
                        <h4 style="margin:0 0 12px;font-size:0.9rem;color:#334155;">
                            <i class="fas fa-utensils" style="color:#10b981;"></i> Preferências Alimentares
                        </h4>
                        <div class="form-group">
                            <label>Participa das refeições?</label>
                            <select id="perfilAlimentarUsuario" class="form-control" onchange="adminSimples.toggleRefeicoesUsuario()">
                                <option value="sempre" ${perfilAlimentar === 'sempre' ? 'selected' : ''}>✅ Sim, sempre</option>
                                <option value="as_vezes" ${perfilAlimentar === 'as_vezes' ? 'selected' : ''}>⚠️ Às vezes</option>
                                <option value="nunca" ${perfilAlimentar === 'nunca' ? 'selected' : ''}>❌ Nunca</option>
                                <option value="nao_informado" ${perfilAlimentar === 'nao_informado' ? 'selected' : ''}>❓ Prefiro não informar</option>
                            </select>
                        </div>
                        <div id="refeicoesUsuarioDiv" style="${(perfilAlimentar === 'sempre' || perfilAlimentar === 'as_vezes') ? 'display:block;margin-top:12px;' : 'display:none;'}">
                            <label style="display:block;margin-bottom:8px;font-size:0.85rem;color:#4b5563;font-weight:600;">
                                Quais refeições participa?
                            </label>
                            <div style="display:flex;gap:15px;flex-wrap:wrap;">
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.85rem;">
                                    <input type="checkbox" value="manha" class="refeicao-checkbox" ${refeicoesQueParticipa.includes('manha') ? 'checked' : ''}> ☀️ Manhã
                                </label>
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.85rem;">
                                    <input type="checkbox" value="almoco" class="refeicao-checkbox" ${refeicoesQueParticipa.includes('almoco') ? 'checked' : ''}> 🍽️ Almoço
                                </label>
                                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.85rem;">
                                    <input type="checkbox" value="tarde" class="refeicao-checkbox" ${refeicoesQueParticipa.includes('tarde') ? 'checked' : ''}> 🌙 Tarde
                                </label>
                            </div>
                        </div>
                    </div>

                    <div style="margin-top:15px;padding:15px;background:#eef2ff;border-radius:12px;border-left:4px solid #6366f1;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <input type="checkbox" id="userAcessibilidade" ${precisaAcessibilidade ? 'checked' : ''}
                                style="width:20px;height:20px;accent-color:#6366f1;"
                                onchange="adminSimples.toggleCondicaoAcessibilidade()">
                            <label for="userAcessibilidade" style="cursor:pointer;font-weight:600;color:#3730a3;font-size:0.9rem;">
                                <i class="fas fa-wheelchair"></i> Necessita de acessibilidade
                            </label>
                        </div>
                        <div id="condicaoAcessibilidadeDiv" style="${precisaAcessibilidade ? 'display:block;margin-top:12px;' : 'display:none;margin-top:12px;'}">
                            <label style="display:block;margin-bottom:6px;font-size:0.8rem;color:#4b5563;font-weight:600;">Qual a condição?</label>
                            <select id="condicaoAcessibilidadeUsuario" class="form-control">
                                <option value="">Selecione...</option>
                                <option value="baixa_visao" ${condicaoAcessibilidade === 'baixa_visao' ? 'selected' : ''}>👁️ Baixa Visão</option>
                                <option value="cegueira" ${condicaoAcessibilidade === 'cegueira' ? 'selected' : ''}>👁️ Cegueira</option>
                                <option value="dislexia" ${condicaoAcessibilidade === 'dislexia' ? 'selected' : ''}>📖 Dislexia</option>
                                <option value="discalculia" ${condicaoAcessibilidade === 'discalculia' ? 'selected' : ''}>🔢 Discalculia</option>
                                <option value="tdah" ${condicaoAcessibilidade === 'tdah' ? 'selected' : ''}>🧠 TDAH</option>
                                <option value="tea" ${condicaoAcessibilidade === 'tea' ? 'selected' : ''}>🧩 TEA (Autismo)</option>
                                <option value="deficiencia_auditiva" ${condicaoAcessibilidade === 'deficiencia_auditiva' ? 'selected' : ''}>👂 Def. Auditiva</option>
                                <option value="deficiencia_fisica" ${condicaoAcessibilidade === 'deficiencia_fisica' ? 'selected' : ''}>🦽 Def. Física</option>
                                <option value="outra" ${condicaoAcessibilidade === 'outra' ? 'selected' : ''}>📝 Outra</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div id="professorFields" style="${role === 'professor' ? 'display:block;' : 'display:none;'}">
                    <div class="form-group">
                        <label>Eixo</label>
                        <select id="eixoUsuario" class="form-control">
                            <option value="">Selecione...</option>
                            <option value="natureza" ${eixo === 'natureza' ? 'selected' : ''}>Natureza</option>
                            <option value="humanas" ${eixo === 'humanas' ? 'selected' : ''}>Humanas</option>
                            <option value="linguagens" ${eixo === 'linguagens' ? 'selected' : ''}>Linguagens</option>
                            <option value="desenvolvimento" ${eixo === 'desenvolvimento' ? 'selected' : ''}>Desenvolvimento</option>
                            <option value="gestao" ${eixo === 'gestao' ? 'selected' : ''}>Gestão</option>
                            <option value="turismo" ${eixo === 'turismo' ? 'selected' : ''}>Turismo</option>
                            <option value="ambiente" ${eixo === 'ambiente' ? 'selected' : ''}>Ambiente</option>
                        </select>
                    </div>
                </div>

                ${!usuario ? `
                <div class="form-group">
                    <label>Senha Temporária</label>
                    <div style="display:flex;gap:10px;">
                        <input type="text" id="senhaUsuario" class="form-control" value="${this.gerarSenha()}" required>
                        <button type="button" class="btn-icon" onclick="adminSimples.gerarNovaSenha()" title="Gerar nova senha">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </div>
                    <small style="color:#6c757d;">O usuário usará esta senha para fazer login</small>
                </div>` : ''}

                <div class="info-card">
                    <i class="fas fa-info-circle"></i>
                    <span>Email institucional (@iemasaoluiscentro.net) é obrigatório</span>
                </div>
            </form>`;

        const titulo = usuario
            ? '<i class="fas fa-edit"></i> Editar Usuário'
            : '<i class="fas fa-user-plus"></i> Novo Usuário';

        // 🔥 ABRE COM CALLBACK ISOLADO
        this.abrirModal(titulo, conteudoHTML, true, () => this.salvarUsuario(id));

        setTimeout(() => {
            const btn = document.getElementById('modalSaveBtn');
            if (btn) {
                btn.innerHTML = usuario
                    ? '<i class="fas fa-save"></i> Salvar Alterações'
                    : '<i class="fas fa-user-plus"></i> Criar Usuário';
            }
            const roleSelect = document.getElementById('roleUsuario');
            if (roleSelect) roleSelect.addEventListener('change', () => this.toggleCamposRole());
        }, 50);
    }

    toggleRefeicoesUsuario() {
        const perfil = document.getElementById('perfilAlimentarUsuario')?.value;
        const div = document.getElementById('refeicoesUsuarioDiv');
        if (div) {
            if (perfil === 'sempre' || perfil === 'as_vezes') {
                div.style.display = 'block';
            } else {
                div.style.display = 'none';
                document.querySelectorAll('.refeicao-checkbox').forEach(cb => cb.checked = false);
            }
        }
    }

    toggleCondicaoAcessibilidade() {
        const checkbox = document.getElementById('userAcessibilidade');
        const div = document.getElementById('condicaoAcessibilidadeDiv');
        if (div) div.style.display = checkbox?.checked ? 'block' : 'none';
    }

    toggleCamposRole() {
        const role = document.getElementById('roleUsuario')?.value;
        const map = {
            'aluno': 'alunoFields',
            'professor': 'professorFields',
            'setor_pedagogico': 'setorPedagogicoFields',
            'coordenacao_patio': 'coordenacaoPatioFields',
            'cozinha': 'cozinhaFields',
            'gestao_geral': 'gestaoGeralFields',
            'enfermaria': 'enfermariaFields',
            'supervisao': 'supervisaoFields',
            'psicologia': 'psicologiaFields',
            'assistente-social': 'assistenteSocialFields',
            'protagonismo': 'protagonismoFields',
            'biblioteca': 'bibliotecaFields',
            'secretaria': 'secretariaFields',
            'recepcao': 'recepcaoFields',
            'gestao-adm': 'gestao-admFields'
        };
        Object.entries(map).forEach(([roleKey, fieldId]) => {
            const el = document.getElementById(fieldId);
            if (el) el.style.display = (roleKey === role) ? 'block' : 'none';
        });
    }

    getRoleLabel(role) {
        const labels = {
            'aluno': 'Aluno', 'professor': 'Professor', 'admin': 'Administrador',
            'super_admin': 'Super Administrador', 'setor_pedagogico': 'Setor Pedagógico',
            'coordenacao_patio': 'Coordenação de Pátio', 'cozinha': 'Cozinha',
            'gestao_geral': 'Gestão Geral', 'enfermaria': 'Enfermaria',
            'supervisao': 'Supervisão', 'psicologia': 'Psicologia',
            'assistente-social': 'Assistente Social', 'protagonismo': 'Protagonismo',
            'biblioteca': 'Biblioteca', 'secretaria': 'Secretaria', 'recepcao': 'Recepção', 'gestao-adm': 'Gestão ADM'
        };
        return labels[role] || role || 'Desconhecido';
    }

    getRoleLabelVincular(role) {
        const labels = {
            'aluno': 'Aluno', 'professor': 'Professor', 'admin': 'Admin',
            'super_admin': 'Super Admin', 'setor_pedagogico': 'Setor Pedagógico',
            'coordenacao_patio': 'Coord. Pátio', 'cozinha': 'Cozinha',
            'gestao_geral': 'Gestão Geral', 'enfermaria': 'Enfermaria',
            'supervisao': 'Supervisão', 'psicologia': 'Psicologia',
            'assistente-social': 'Assist. Social', 'protagonismo': 'Protagonismo',
            'biblioteca': 'Biblioteca', 'secretaria': 'Secretaria', 'recepcao': 'Recepção', 'gestao-adm': 'Gestão ADM'
        };
        return labels[role] || role;
    }

    getDestinoLabel(role) {
        const labels = {
            'aluno': '📱 Correção de Prova',
            'professor': '👨‍🏫 Área do Professor',
            'setor_pedagogico': '👩‍🏫 Setor Pedagógico',
            'coordenacao_patio': '🏃 Coord. Pátio - Refeições',
            'cozinha': '🍽️ Cozinha - Refeições',
            'gestao_geral': '📊 Gestão Geral - Rodízio',
            'enfermaria': '🏥 Enfermaria',
            'supervisao': '🛡️ Supervisão',
            'psicologia': '🧠 Psicologia',
            'assistente-social': '🤝 Assist. Social',
            'protagonismo': '⭐ Protagonismo',
            'biblioteca': '📚 Biblioteca',
            'secretaria': '🎓 Secretaria',
            'recepcao': '🛎️ Recepção',
            'gestao-adm': '🧑‍💼 Gestão ADM',
            'admin': '👑 Área Administrativa',
            'super_admin': '⭐ Super Administrador'
        };
        return labels[role] || 'Área do Sistema';
    }

    async salvarUsuario(id = null) {
        try {
            console.log('💾 Salvando usuário. ID:', id);

            const roleSelecionada = document.getElementById('roleUsuario')?.value;
            if (roleSelecionada === 'super_admin') {
                this.showToast('❌ Não é possível criar/editar Super Admins', 'error');
                return;
            }

            const dados = {
                nome: document.getElementById('nomeUsuario')?.value?.trim() || '',
                email: document.getElementById('emailUsuario')?.value?.trim() || '',
                role: roleSelecionada,
                ativo: document.getElementById('statusUsuario')?.value === 'true'
            };

            const cpf = document.getElementById('cpfUsuario')?.value;
            const telefone = document.getElementById('telefoneUsuario')?.value;
            const matricula = document.getElementById('matriculaUsuario')?.value;

            if (cpf) dados.cpf = cpf.replace(/\D/g, '');
            if (telefone) dados.telefone = telefone.replace(/\D/g, '');
            if (matricula) dados.matricula = matricula;

            if (roleSelecionada === 'aluno') {
                dados.curso = document.getElementById('cursoUsuario')?.value || '';
                dados.turma = document.getElementById('turmaUsuario')?.value || '';
                dados.precisaAcessibilidade = document.getElementById('userAcessibilidade')?.checked || false;

                if (dados.precisaAcessibilidade) {
                    dados.condicaoAcessibilidade = document.getElementById('condicaoAcessibilidadeUsuario')?.value || '';
                } else {
                    dados.condicaoAcessibilidade = '';
                }

                dados.perfilAlimentar = document.getElementById('perfilAlimentarUsuario')?.value || 'nao_informado';

                const refeicoes = [];
                document.querySelectorAll('.refeicao-checkbox:checked').forEach(cb => refeicoes.push(cb.value));
                dados.refeicoesQueParticipa = refeicoes;
            } else if (roleSelecionada === 'professor') {
                dados.eixo = document.getElementById('eixoUsuario')?.value || '';
            } else if (roleSelecionada === 'biblioteca' || roleSelecionada === 'secretaria ||') {
                dados.departamento = document.getElementById('departamentoUsuario')?.value || '';
                dados.matricula = document.getElementById('matriculaUsuario')?.value || '';
            }

            if (!id) {
                const senha = document.getElementById('senhaUsuario')?.value;
                if (senha) dados.password = senha;
            }

            if (!dados.nome) { this.showToast('❌ Nome é obrigatório', 'error'); return; }
            if (!dados.email) { this.showToast('❌ Email é obrigatório', 'error'); return; }

            console.log('📤 Dados:', dados);
            this.showToast('💾 Salvando...', 'info');

            const url = id ? `/api/admin/usuarios/${id}` : '/api/admin/usuarios';
            const method = id ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dados)
            });

            const data = await response.json();

            if (data.success) {
                this.showToast(id ? '✅ Usuário atualizado!' : '✅ Usuário criado!', 'success');
                this.fecharModal();
                await this.carregarUsuarios();
            } else {
                throw new Error(data.error || 'Erro ao salvar usuário');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============================================================================
    // TURMAS
    // ============================================================================
    async carregarTurmas() {
        console.log('📚 CARREGANDO TURMAS...');
        const contentArea = document.getElementById('contentArea');
        if (!contentArea) return;

        contentArea.innerHTML = `
            <div style="text-align:center;padding:60px;background:white;border-radius:12px;">
                <div style="width:50px;height:50px;border:5px solid #f3f3f3;border-top:5px solid #667eea;
                            border-radius:50%;margin:0 auto 20px;animation:spin 1s linear infinite;"></div>
                <p style="color:#6b7280;">Carregando turmas...</p>
            </div>
            <style>@keyframes spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}</style>`;

        try {
            const token = localStorage.getItem('auth_token');

            const [turmasRes, professoresRes, eixosRes] = await Promise.all([
                fetch('/api/admin/turmas?limit=1000', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/admin/usuarios?role=professor&limit=1000', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/admin/eixos', { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            const turmasData = await turmasRes.json();
            const professoresData = await professoresRes.json();
            const eixosData = await eixosRes.json();

            if (!turmasData.success) throw new Error(turmasData.error || 'Erro ao carregar turmas');

            const todasTurmas = turmasData.turmas || [];
            this.turmas = todasTurmas;
            this.turmasFiltradas = [...todasTurmas];
            this.paginaAtualTurma = 1;
            this.itensPorPagina = 10;

            this.eixos = (eixosData.success && eixosData.eixos) ? eixosData.eixos : [];

            const todosProfessores = (professoresData.success && professoresData.usuarios)
                ? professoresData.usuarios.map(p => p.nome).sort()
                : [];
            this.todosProfessoresLista = todosProfessores;

            const contagemPorProfessor = {};
            todasTurmas.forEach(t => {
                const prof = t.professor?.nome || 'Sem professor';
                contagemPorProfessor[prof] = (contagemPorProfessor[prof] || 0) + 1;
            });
            this.contagemPorProfessor = contagemPorProfessor;

            const totalTurmas = todasTurmas.length;
            const turmasAtivas = todasTurmas.filter(t => t.ativa === true).length;
            const turmasInativas = todasTurmas.filter(t => t.ativa === false).length;
            const alunosComAcessibilidade = todasTurmas.reduce((acc, t) => acc + (t.alunosComAcessibilidade || 0), 0);

            contentArea.innerHTML = this.renderTurmasHTMLSimples({
                totalTurmas, turmasAtivas, turmasInativas, alunosComAcessibilidade,
                turmas: todasTurmas, professores: todosProfessores,
                contagemPorProfessor, eixos: this.eixos
            });

            this.configurarEventosFiltrosTurmas();
            console.log(`✅ ${todasTurmas.length} turmas carregadas`);
        } catch (error) {
            console.error('❌ Erro ao carregar turmas:', error);
            contentArea.innerHTML = this.renderErroTurmas(error.message);
        }
    }

    getEixoLabel(eixoNome) {
        if (!eixoNome) return 'Não definido';
        if (this.eixos && this.eixos.length > 0) {
            const e = this.eixos.find(x => x.nome === eixoNome || x._id === eixoNome || x.label === eixoNome);
            if (e) {
                const icone = e.icone ? `<i class="fas ${e.icone}"></i> ` : '';
                return `${icone}${e.label || e.nome}`;
            }
        }
        return eixoNome;
    }

    getEixoColor(eixoNome) {
        if (!eixoNome) return '#667eea';
        if (this.eixos && this.eixos.length > 0) {
            const e = this.eixos.find(x => x.nome === eixoNome || x._id === eixoNome || x.label === eixoNome);
            if (e && e.cor) return e.cor;
        }
        return '#667eea';
    }

    getEixoIcon(eixoNome) {
        if (!eixoNome) return 'fa-book';
        if (this.eixos && this.eixos.length > 0) {
            const e = this.eixos.find(x => x.nome === eixoNome || x._id === eixoNome || x.label === eixoNome);
            if (e && e.icone) return e.icone;
        }
        return 'fa-book';
    }

    renderTurmasHTMLSimples({ totalTurmas, turmasAtivas, turmasInativas, alunosComAcessibilidade, turmas, professores = [], contagemPorProfessor = {}, eixos = [] }) {
        const opcoesEixosFiltro = eixos.length > 0
            ? eixos.map(e => `<option value="${e.nome}">${e.label || e.nome}</option>`).join('')
            : '<option value="" disabled>Nenhum eixo cadastrado</option>';

        const opcoesProfessores = professores.map(p => {
            const count = contagemPorProfessor[p] || 0;
            const countText = count > 0 ? ` (${count} ${count === 1 ? 'turma' : 'turmas'})` : '';
            return `<option value="${p}">${p}${countText}</option>`;
        }).join('');

        return `
            <div class="trm-container">
                <div class="trm-header">
                    <div class="trm-header-left">
                        <div class="trm-header-icon"><i class="fas fa-school"></i></div>
                        <div class="trm-header-text">
                            <h1>Gerenciar Turmas</h1>
                            <p>Visualize e gerencie todas as turmas do sistema</p>
                        </div>
                    </div>
                    <div class="trm-header-actions">
                        <button class="trm-btn-header transparent" onclick="adminSimples.atualizarTurmas()" title="Atualizar">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                        <button class="trm-btn-header white" onclick="adminSimples.abrirModalTurma()">
                            <i class="fas fa-plus-circle"></i><span>Nova Turma</span>
                        </button>
                    </div>
                </div>

                <div class="trm-stats-grid">
                    <div class="trm-stat-card" onclick="adminSimples.filtrarTurmasPorStatus('todas')">
                        <div class="trm-stat-icon purple"><i class="fas fa-school"></i></div>
                        <div class="trm-stat-content">
                            <span class="trm-stat-label">Total de Turmas</span>
                            <span class="trm-stat-value">${totalTurmas}</span>
                            <span class="trm-stat-detail">${turmasAtivas} ativas • ${turmasInativas} inativas</span>
                        </div>
                    </div>
                    <div class="trm-stat-card" onclick="adminSimples.filtrarTurmasPorStatus('ativas')">
                        <div class="trm-stat-icon green"><i class="fas fa-check-circle"></i></div>
                        <div class="trm-stat-content">
                            <span class="trm-stat-label">Turmas Ativas</span>
                            <span class="trm-stat-value">${turmasAtivas}</span>
                            <span class="trm-stat-detail">Clique para filtrar</span>
                        </div>
                    </div>
                    <div class="trm-stat-card" onclick="adminSimples.filtrarTurmasPorStatus('inativas')">
                        <div class="trm-stat-icon orange"><i class="fas fa-pause-circle"></i></div>
                        <div class="trm-stat-content">
                            <span class="trm-stat-label">Turmas Inativas</span>
                            <span class="trm-stat-value">${turmasInativas}</span>
                            <span class="trm-stat-detail">Clique para filtrar</span>
                        </div>
                    </div>
                    <div class="trm-stat-card">
                        <div class="trm-stat-icon blue"><i class="fas fa-wheelchair"></i></div>
                        <div class="trm-stat-content">
                            <span class="trm-stat-label">Acessibilidade</span>
                            <span class="trm-stat-value">${alunosComAcessibilidade}</span>
                            <span class="trm-stat-detail">alunos com necessidades</span>
                        </div>
                    </div>
                </div>

                <div class="trm-filters-wrapper">
                    <div class="trm-filters-header">
                        <div class="trm-filters-title">
                            <div class="trm-filters-title-icon"><i class="fas fa-sliders-h"></i></div>
                            <div>
                                <h3>Filtros de Busca</h3>
                                <p>Refine sua busca por professor, eixo ou status</p>
                            </div>
                        </div>
                        <button class="trm-btn-clear-all" onclick="adminSimples.limparFiltrosTurmas()">
                            <i class="fas fa-eraser"></i><span>Limpar Tudo</span>
                        </button>
                    </div>

                    <div class="trm-filters-grid">
                        <div class="trm-filter-card">
                            <div class="trm-filter-label"><i class="fas fa-search"></i><span>Busca Rápida</span></div>
                            <div class="trm-input-wrapper">
                                <i class="fas fa-search trm-input-icon"></i>
                                <input type="text" id="searchTurmas" placeholder="Nome, código, disciplina..."
                                    oninput="adminSimples.filtrarTurmasDebounce(this.value)" autocomplete="off">
                                <button class="trm-input-clear" onclick="adminSimples.limparBuscaTurmas()" id="clearBuscaTurmas" style="display:none;">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>

                        <div class="trm-filter-card">
                            <div class="trm-filter-label">
                                <i class="fas fa-chalkboard-teacher"></i><span>Professor</span>
                                ${professores.length > 0 ? `<span class="trm-filter-count">${professores.length}</span>` : ''}
                            </div>
                            <div class="trm-select-wrapper">
                                <i class="fas fa-user-tie trm-select-icon"></i>
                                <select id="filterProfessor" onchange="adminSimples.filtrarTurmasPorProfessor()">
                                    <option value="todos">Todos os professores</option>
                                    ${opcoesProfessores}
                                </select>
                                <i class="fas fa-chevron-down trm-select-arrow"></i>
                            </div>
                        </div>

                        <div class="trm-filter-card">
                            <div class="trm-filter-label">
                                <i class="fas fa-sitemap"></i><span>Eixo</span>
                                ${eixos.length > 0 ? `<span class="trm-filter-count">${eixos.length}</span>` : ''}
                            </div>
                            <div class="trm-select-wrapper">
                                <i class="fas fa-book trm-select-icon"></i>
                                <select id="filterEixo" onchange="adminSimples.filtrarTurmas()">
                                    <option value="todos">Todos os eixos</option>
                                    ${opcoesEixosFiltro}
                                </select>
                                <i class="fas fa-chevron-down trm-select-arrow"></i>
                            </div>
                        </div>

                        <div class="trm-filter-card">
                            <div class="trm-filter-label"><i class="fas fa-circle"></i><span>Status</span></div>
                            <div class="trm-status-buttons">
                                <button class="trm-status-btn active" onclick="adminSimples.filtrarTurmasPorStatus('todas')">
                                    <i class="fas fa-list"></i> Todas
                                </button>
                                <button class="trm-status-btn success" onclick="adminSimples.filtrarTurmasPorStatus('ativas')">
                                    <i class="fas fa-check"></i> Ativas
                                </button>
                                <button class="trm-status-btn warning" onclick="adminSimples.filtrarTurmasPorStatus('inativas')">
                                    <i class="fas fa-pause"></i> Inativas
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="trm-results-bar">
                        <div class="trm-results-info">
                            <i class="fas fa-info-circle"></i>
                            <span>Mostrando <strong>${turmas.length}</strong> ${turmas.length === 1 ? 'turma' : 'turmas'}</span>
                        </div>
                    </div>
                </div>

                <div class="trm-cards-grid" id="turmasCardsGrid">
                    ${this.gerarCardsTurmasSimples(turmas)}
                </div>
            </div>

            <style>
                .trm-container { padding:24px; max-width:1400px; margin:0 auto; font-family:'Inter',-apple-system,sans-serif; }
                .trm-header { background:linear-gradient(135deg,#667eea 0%,#764ba2 100%); border-radius:24px;
                    padding:32px; margin-bottom:24px; display:flex; justify-content:space-between;
                    align-items:center; flex-wrap:wrap; gap:20px;
                    box-shadow:0 12px 32px rgba(102,126,234,0.35); position:relative; overflow:hidden; }
                .trm-header::before { content:''; position:absolute; top:-60px; right:-60px; width:240px;
                    height:240px; background:rgba(255,255,255,0.08); border-radius:50%; }
                .trm-header-left { display:flex; align-items:center; gap:20px; position:relative; z-index:2; }
                .trm-header-icon { width:72px; height:72px; background:rgba(255,255,255,0.18);
                    border-radius:20px; display:flex; align-items:center; justify-content:center;
                    font-size:32px; color:white; backdrop-filter:blur(10px);
                    border:1px solid rgba(255,255,255,0.25); }
                .trm-header-text h1 { color:white; font-size:28px; font-weight:700; margin:0 0 4px; }
                .trm-header-text p { color:rgba(255,255,255,0.9); font-size:14px; margin:0; }
                .trm-header-actions { display:flex; gap:10px; position:relative; z-index:2; }
                .trm-btn-header { padding:12px 24px; border-radius:40px; font-size:14px; font-weight:600;
                    cursor:pointer; display:flex; align-items:center; gap:8px; transition:all 0.3s; border:none; }
                .trm-btn-header.white { background:white; color:#667eea; box-shadow:0 4px 12px rgba(0,0,0,0.1); }
                .trm-btn-header.white:hover { transform:translateY(-2px); }
                .trm-btn-header.transparent { background:rgba(255,255,255,0.15); color:white;
                    border:1px solid rgba(255,255,255,0.3); padding:12px; }
                .trm-stats-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:20px; margin-bottom:24px; }
                .trm-stat-card { background:white; border-radius:18px; padding:22px;
                    box-shadow:0 2px 12px rgba(0,0,0,0.05); display:flex; align-items:center; gap:18px;
                    transition:all 0.3s; border:1px solid rgba(0,0,0,0.04); cursor:pointer; }
                .trm-stat-card:hover { transform:translateY(-4px); box-shadow:0 12px 24px rgba(0,0,0,0.1); }
                .trm-stat-icon { width:56px; height:56px; border-radius:16px; display:flex; align-items:center;
                    justify-content:center; font-size:22px; color:white; flex-shrink:0; }
                .trm-stat-icon.purple { background:linear-gradient(135deg,#667eea,#764ba2); }
                .trm-stat-icon.green { background:linear-gradient(135deg,#10b981,#059669); }
                .trm-stat-icon.orange { background:linear-gradient(135deg,#f59e0b,#d97706); }
                .trm-stat-icon.blue { background:linear-gradient(135deg,#3b82f6,#2563eb); }
                .trm-stat-content { flex:1; min-width:0; }
                .trm-stat-label { display:block; font-size:12px; color:#6b7280; margin-bottom:4px; font-weight:500; }
                .trm-stat-value { display:block; font-size:28px; font-weight:700; color:#111827; line-height:1.1; }
                .trm-stat-detail { font-size:11px; color:#9ca3af; margin-top:4px; display:block; }
                .trm-filters-wrapper { background:white; border-radius:24px; padding:28px; margin-bottom:24px;
                    box-shadow:0 2px 16px rgba(0,0,0,0.06); border:1px solid rgba(0,0,0,0.04); }
                .trm-filters-header { display:flex; justify-content:space-between; align-items:center;
                    margin-bottom:24px; padding-bottom:20px; border-bottom:2px solid #f3f4f6;
                    flex-wrap:wrap; gap:15px; }
                .trm-filters-title { display:flex; align-items:center; gap:14px; }
                .trm-filters-title-icon { width:48px; height:48px; background:linear-gradient(135deg,#667eea,#764ba2);
                    border-radius:14px; display:flex; align-items:center; justify-content:center;
                    color:white; font-size:20px; }
                .trm-filters-title h3 { margin:0; font-size:18px; color:#111827; font-weight:700; }
                .trm-filters-title p { margin:2px 0 0; font-size:13px; color:#6b7280; }
                .trm-btn-clear-all { padding:10px 20px; background:#f3f4f6; border:none; border-radius:12px;
                    font-size:13px; font-weight:600; color:#4b5563; cursor:pointer;
                    display:flex; align-items:center; gap:8px; transition:all 0.3s; }
                .trm-btn-clear-all:hover { background:#fee2e2; color:#dc2626; }
                .trm-filters-grid { display:grid; grid-template-columns:2fr 1.5fr 1fr 1.2fr; gap:18px; }
                .trm-filter-card { background:#f9fafb; border-radius:16px; padding:16px; border:2px solid #f3f4f6; }
                .trm-filter-card:focus-within { border-color:#667eea; box-shadow:0 4px 16px rgba(102,126,234,0.12); background:white; }
                .trm-filter-label { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700;
                    color:#4b5563; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px; }
                .trm-filter-label i { color:#667eea; font-size:13px; }
                .trm-filter-count { margin-left:auto; background:#667eea; color:white; padding:2px 8px;
                    border-radius:20px; font-size:10px; font-weight:700; }
                .trm-input-wrapper, .trm-select-wrapper { position:relative; }
                .trm-input-wrapper input, .trm-select-wrapper select {
                    width:100%; padding:12px 40px 12px 42px; border:2px solid #e5e7eb;
                    border-radius:10px; font-size:14px; background:white; color:#111827; box-sizing:border-box;
                }
                .trm-select-wrapper select { cursor:pointer; appearance:none; }
                .trm-input-icon, .trm-select-icon { position:absolute; left:14px; top:50%;
                    transform:translateY(-50%); color:#9ca3af; font-size:14px; pointer-events:none; }
                .trm-select-arrow { position:absolute; right:14px; top:50%; transform:translateY(-50%);
                    color:#9ca3af; font-size:12px; pointer-events:none; }
                .trm-input-clear { position:absolute; right:10px; top:50%; transform:translateY(-50%);
                    background:#f3f4f6; border:none; color:#6b7280; cursor:pointer; width:26px; height:26px;
                    border-radius:50%; display:flex; align-items:center; justify-content:center; }
                .trm-status-buttons { display:flex; gap:4px; background:white; padding:4px;
                    border-radius:10px; border:2px solid #e5e7eb; }
                .trm-status-btn { flex:1; padding:9px 8px; border:none; background:transparent;
                    border-radius:8px; font-size:12px; font-weight:600; color:#6b7280; cursor:pointer;
                    display:flex; align-items:center; justify-content:center; gap:5px; white-space:nowrap; }
                .trm-status-btn.active { background:linear-gradient(135deg,#667eea,#764ba2); color:white; }
                .trm-status-btn.success.active { background:linear-gradient(135deg,#10b981,#059669); }
                .trm-status-btn.warning.active { background:linear-gradient(135deg,#f59e0b,#d97706); }
                .trm-results-bar { display:flex; justify-content:space-between; align-items:center;
                    padding-top:18px; border-top:2px solid #f3f4f6; flex-wrap:wrap; gap:12px; }
                .trm-results-info { display:flex; align-items:center; gap:10px; font-size:14px; color:#4b5563; }
                .trm-results-info i { color:#667eea; font-size:16px; }
                .trm-results-info strong { color:#111827; font-weight:700; font-size:15px; }
                .trm-cards-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(350px,1fr));
                    gap:20px; margin-bottom:24px; }
                .trm-turma-card { background:white; border-radius:18px; overflow:hidden;
                    box-shadow:0 2px 12px rgba(0,0,0,0.05); transition:all 0.3s; border:1px solid rgba(0,0,0,0.05); }
                .trm-turma-card:hover { transform:translateY(-4px); box-shadow:0 12px 28px rgba(0,0,0,0.12); }
                .trm-turma-card-header { padding:20px; color:white; position:relative; overflow:hidden; }
                .trm-turma-card-header::before { content:''; position:absolute; top:-30px; right:-30px;
                    width:100px; height:100px; background:rgba(255,255,255,0.1); border-radius:50%; }
                .trm-turma-card-header-content { position:relative; z-index:2; display:flex;
                    justify-content:space-between; align-items:flex-start; }
                .trm-turma-card-title { font-size:18px; font-weight:700; margin:0; flex:1; }
                .trm-turma-status { padding:4px 12px; border-radius:30px; font-size:11px; font-weight:600;
                    background:rgba(255,255,255,0.2); display:inline-flex; align-items:center; gap:5px; }
                .trm-turma-status .dot { width:6px; height:6px; border-radius:50%; display:inline-block; }
                .trm-turma-status .dot.green { background:#10b981; }
                .trm-turma-status .dot.red { background:#ef4444; }
                .trm-turma-codigo { display:inline-block; margin-top:10px; padding:4px 12px;
                    background:rgba(0,0,0,0.15); border-radius:30px; font-size:11px; font-family:monospace; }
                .trm-turma-card-body { padding:20px; }
                .trm-info-row { display:flex; align-items:center; gap:10px; margin-bottom:12px;
                    color:#4b5563; font-size:14px; }
                .trm-info-row i { width:18px; color:#667eea; }
                .trm-info-row strong { color:#111827; font-weight:600; }
                .trm-professor-info { display:flex; align-items:center; gap:12px; padding:12px;
                    background:#f9fafb; border-radius:12px; margin:15px 0; }
                .trm-professor-avatar { width:40px; height:40px; background:linear-gradient(135deg,#667eea,#764ba2);
                    border-radius:50%; display:flex; align-items:center; justify-content:center;
                    color:white; font-weight:700; font-size:14px; flex-shrink:0; }
                .trm-professor-details { flex:1; min-width:0; }
                .trm-professor-nome { font-weight:600; color:#111827; font-size:14px;
                    display:flex; align-items:center; gap:6px; }
                .trm-professor-email { font-size:11px; color:#6b7280; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
                .trm-mini-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:15px 0; }
                .trm-mini-stat { text-align:center; padding:10px 8px; background:#f9fafb; border-radius:10px; }
                .trm-mini-stat .number { display:block; font-size:18px; font-weight:700; color:#111827; }
                .trm-mini-stat .label { font-size:10px; color:#6b7280; margin-top:2px; display:block; }
                .trm-card-footer { display:flex; border-top:1px solid #f3f4f6; }
                .trm-card-action { flex:1; padding:14px; background:none; border:none; cursor:pointer;
                    display:flex; align-items:center; justify-content:center; gap:6px;
                    font-size:12px; color:#6b7280; transition:all 0.2s; border-right:1px solid #f3f4f6; }
                .trm-card-action:last-child { border-right:none; }
                .trm-card-action:hover { background:#f9fafb; color:#667eea; }
                .trm-card-action.danger:hover { color:#dc2626; background:#fef2f2; }
                .trm-card-action.primary:hover { color:#3b82f6; background:#eff6ff; }
                .trm-empty-state { grid-column:1/-1; text-align:center; padding:80px 40px;
                    background:white; border-radius:20px; border:2px dashed #e5e7eb; }
                .trm-empty-state i { font-size:64px; color:#d1d5db; margin-bottom:20px; }
                .trm-empty-state h3 { color:#374151; margin-bottom:10px; font-size:20px; }
                .trm-empty-state p { color:#6b7280; margin-bottom:25px; }
                .trm-btn-create { padding:14px 32px; background:linear-gradient(135deg,#667eea,#764ba2);
                    color:white; border:none; border-radius:40px; font-weight:600; font-size:14px;
                    cursor:pointer; display:inline-flex; align-items:center; gap:10px; }
                @media (max-width:1200px) {
                    .trm-filters-grid { grid-template-columns:1fr 1fr; }
                    .trm-stats-grid { grid-template-columns:repeat(2,1fr); }
                }
                @media (max-width:768px) {
                    .trm-header { flex-direction:column; align-items:flex-start; padding:24px; }
                    .trm-stats-grid { grid-template-columns:1fr; }
                    .trm-filters-grid { grid-template-columns:1fr; }
                    .trm-cards-grid { grid-template-columns:1fr; }
                }
            </style>`;
    }

    gerarCardsTurmasSimples(turmas) {
        if (!turmas || turmas.length === 0) {
            return `
                <div class="trm-empty-state">
                    <i class="fas fa-school"></i>
                    <h3>Nenhuma turma encontrada</h3>
                    <p>Não há turmas cadastradas com os filtros selecionados.</p>
                    <button class="trm-btn-create" onclick="adminSimples.abrirModalTurma()">
                        <i class="fas fa-plus-circle"></i> Criar Nova Turma
                    </button>
                </div>`;
        }

        return turmas.map(turma => {
            const eixoColor = this.getEixoColor(turma.eixo);
            const eixoLabel = this.getEixoLabel(turma.eixo);
            const percentualAlunos = turma.capacidadeMaxima
                ? Math.min(100, Math.round((turma.totalAlunos || 0) / turma.capacidadeMaxima * 100))
                : (turma.totalAlunos || 0) > 0 ? Math.min(100, Math.round((turma.totalAlunos || 0) / 40 * 100)) : 0;

            const professor = turma.professor || {};
            const professorNome = professor.nome || 'Não atribuído';
            const professorEmail = professor.email || '';
            const professorIniciais = professorNome.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

            const dataCriacao = turma.dataCriacao || turma.createdAt
                ? new Date(turma.dataCriacao || turma.createdAt).toLocaleDateString('pt-BR')
                : 'N/A';

            const turmaId = turma.id || turma._id;

            return `
                <div class="trm-turma-card" data-turma-id="${turmaId}" data-status="${turma.ativa ? 'ativa' : 'inativa'}"
                    style="opacity:${turma.ativa ? 1 : 0.8};">
                    <div class="trm-turma-card-header" style="background:linear-gradient(135deg,${eixoColor},${eixoColor}dd);">
                        <div class="trm-turma-card-header-content">
                            <h3 class="trm-turma-card-title">${turma.nome}</h3>
                            <span class="trm-turma-status">
                                <i class="fas fa-circle dot ${turma.ativa ? 'green' : 'red'}"></i>
                                ${turma.ativa ? 'Ativa' : 'Inativa'}
                            </span>
                        </div>
                        <span class="trm-turma-codigo"><i class="fas fa-hashtag"></i> ${turma.codigo || 'SEM CÓDIGO'}</span>
                    </div>

                    <div class="trm-turma-card-body">
                        <div class="trm-info-row">
                            <i class="fas fa-book"></i>
                            <span><strong>Disciplina:</strong> ${turma.disciplina || 'Não definida'}</span>
                        </div>
                        <div class="trm-info-row">
                            <i class="fas fa-sitemap"></i>
                            <span><strong>Eixo:</strong> ${eixoLabel}</span>
                        </div>
                        <div class="trm-professor-info">
                            <div class="trm-professor-avatar">${professorIniciais || '?'}</div>
                            <div class="trm-professor-details">
                                <div class="trm-professor-nome">
                                    <i class="fas fa-chalkboard-teacher"></i> ${professorNome}
                                </div>
                                ${professorEmail ? `<div class="trm-professor-email">${professorEmail}</div>` : ''}
                            </div>
                        </div>
                        <div class="trm-mini-stats">
                            <div class="trm-mini-stat">
                                <span class="number">${turma.totalAlunos || 0}</span>
                                <span class="label">Alunos</span>
                            </div>
                            <div class="trm-mini-stat">
                                <span class="number">${turma.totalProvas || 0}</span>
                                <span class="label">Provas</span>
                            </div>
                            <div class="trm-mini-stat">
                                <span class="number">${turma.alunosComAcessibilidade || 0}</span>
                                <span class="label">Acessib.</span>
                            </div>
                        </div>
                        <div style="margin:15px 0;">
                            <div style="display:flex;justify-content:space-between;font-size:11px;
                                        color:#6b7280;margin-bottom:5px;">
                                <span>Ocupação</span><span>${percentualAlunos}%</span>
                            </div>
                            <div style="height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;">
                                <div style="height:100%;background:linear-gradient(90deg,${eixoColor},${eixoColor}dd);
                                            width:${percentualAlunos}%;"></div>
                            </div>
                        </div>
                        <div class="trm-info-row" style="margin-bottom:0;">
                            <i class="fas fa-calendar-alt"></i>
                            <span><strong>Criada em:</strong> ${dataCriacao}</span>
                        </div>
                    </div>

                    <div class="trm-card-footer">
                        <button class="trm-card-action" onclick="adminSimples.verDetalhesTurma('${turmaId}')" title="Ver detalhes">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="trm-card-action primary" onclick="adminSimples.editarTurma('${turmaId}')" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="trm-card-action" onclick="adminSimples.verAlunosTurma('${turmaId}')"
                            title="Gerenciar alunos" style="color:${eixoColor};">
                            <i class="fas fa-users"></i>
                        </button>
                        <button class="trm-card-action danger" onclick="adminSimples.excluirTurma('${turmaId}')" title="Excluir">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>`;
        }).join('');
    }

    configurarEventosFiltrosTurmas() {
        const searchInput = document.getElementById('searchTurmas');
        if (searchInput) {
            const novoSearch = searchInput.cloneNode(true);
            searchInput.parentNode.replaceChild(novoSearch, searchInput);
            novoSearch.addEventListener('input', (e) => {
                const clearBtn = document.getElementById('clearBuscaTurmas');
                if (clearBtn) clearBtn.style.display = e.target.value ? 'flex' : 'none';
            });
        }
    }

    filtrarTurmasDebounce(valor) {
        clearTimeout(this._debounceBuscaTurmas);
        this._debounceBuscaTurmas = setTimeout(() => {
            this.filtrarTurmasLocal(valor);
        }, 400);
    }

    filtrarTurmasLocal(termoBusca = null) {
        const search = termoBusca !== null
            ? termoBusca.toLowerCase().trim()
            : (document.getElementById('searchTurmas')?.value || '').toLowerCase().trim();
        const professor = document.getElementById('filterProfessor')?.value || 'todos';
        const eixo = document.getElementById('filterEixo')?.value || 'todos';

        let status = 'todas';
        const statusBtnAtivo = document.querySelector('.trm-status-btn.active');
        if (statusBtnAtivo) {
            const txt = statusBtnAtivo.textContent.toLowerCase();
            if (txt.includes('ativa')) status = 'ativas';
            else if (txt.includes('inativa')) status = 'inativas';
        }

        let filtradas = [...this.turmas];

        if (search) {
            filtradas = filtradas.filter(t =>
                (t.nome && t.nome.toLowerCase().includes(search)) ||
                (t.codigo && t.codigo.toLowerCase().includes(search)) ||
                (t.disciplina && t.disciplina.toLowerCase().includes(search)));
        }
        if (professor !== 'todos') filtradas = filtradas.filter(t => t.professor?.nome === professor);
        if (eixo !== 'todos') filtradas = filtradas.filter(t => t.eixo === eixo);
        if (status === 'ativas') filtradas = filtradas.filter(t => t.ativa === true);
        else if (status === 'inativas') filtradas = filtradas.filter(t => t.ativa === false);

        this.turmasFiltradas = filtradas;

        const grid = document.getElementById('turmasCardsGrid');
        if (grid) grid.innerHTML = this.gerarCardsTurmasSimples(filtradas);

        const resultsInfo = document.querySelector('.trm-results-info');
        if (resultsInfo) {
            resultsInfo.innerHTML = `
                <i class="fas fa-info-circle"></i>
                <span>Mostrando <strong>${filtradas.length}</strong> ${filtradas.length === 1 ? 'turma' : 'turmas'}</span>`;
        }
    }

    filtrarTurmas() { this.filtrarTurmasLocal(); }
    filtrarTurmasPorProfessor() { this.filtrarTurmasLocal(); }

    filtrarTurmasPorStatus(status) {
        document.querySelectorAll('.trm-status-btn').forEach(btn => btn.classList.remove('active'));
        const botoes = document.querySelectorAll('.trm-status-btn');
        if (status === 'todas' && botoes[0]) botoes[0].classList.add('active');
        else if (status === 'ativas' && botoes[1]) botoes[1].classList.add('active');
        else if (status === 'inativas' && botoes[2]) botoes[2].classList.add('active');
        this.filtrarTurmasLocal();
    }

    limparBuscaTurmas() {
        const searchInput = document.getElementById('searchTurmas');
        if (searchInput) searchInput.value = '';
        const clearBtn = document.getElementById('clearBuscaTurmas');
        if (clearBtn) clearBtn.style.display = 'none';
        this.filtrarTurmasLocal('');
    }

    limparFiltrosTurmas() {
        const searchInput = document.getElementById('searchTurmas');
        const eixoSelect = document.getElementById('filterEixo');
        const professorSelect = document.getElementById('filterProfessor');
        if (searchInput) searchInput.value = '';
        if (eixoSelect) eixoSelect.value = 'todos';
        if (professorSelect) professorSelect.value = 'todos';
        const clearBtn = document.getElementById('clearBuscaTurmas');
        if (clearBtn) clearBtn.style.display = 'none';
        document.querySelectorAll('.trm-status-btn').forEach(btn => btn.classList.remove('active'));
        const botoes = document.querySelectorAll('.trm-status-btn');
        if (botoes[0]) botoes[0].classList.add('active');
        this.turmasFiltradas = [...this.turmas];
        const grid = document.getElementById('turmasCardsGrid');
        if (grid) grid.innerHTML = this.gerarCardsTurmasSimples(this.turmas);
    }

    async atualizarTurmas() {
        const refreshBtn = document.querySelector('.trm-btn-header.transparent i');
        try {
            if (refreshBtn) refreshBtn.className = 'fas fa-spinner fa-spin';
            this.showToast('🔄 Atualizando turmas...', 'info');
            await this.carregarTurmas();
            this.showToast('✅ Turmas atualizadas!', 'success');
        } catch (error) {
            console.error('Erro:', error);
            this.showToast('❌ Erro ao atualizar', 'error');
        } finally {
            if (refreshBtn) setTimeout(() => refreshBtn.className = 'fas fa-sync-alt', 500);
        }
    }

    renderErroTurmas(mensagem) {
        return `
            <div style="text-align:center;padding:60px;background:white;border-radius:16px;">
                <i class="fas fa-exclamation-triangle" style="font-size:48px;color:#dc3545;margin-bottom:20px;"></i>
                <h3 style="color:#721c24;">Erro ao carregar turmas</h3>
                <p style="color:#6c757d;">${mensagem}</p>
                <button onclick="adminSimples.carregarTurmas()"
                    style="background:#667eea;color:white;border:none;padding:10px 30px;
                           border-radius:8px;cursor:pointer;font-size:14px;margin-top:20px;">
                    <i class="fas fa-sync-alt"></i> Tentar novamente
                </button>
            </div>`;
    }

    novaTurma() { this.abrirModalTurma(); }

    editarTurma(id) {
        console.log('✏️ Editando turma ID:', id);
        const turma = this.turmas.find(t => t.id === id || t._id === id);
        if (!turma) {
            this.showToast('❌ Turma não encontrada', 'error');
            return;
        }
        this.abrirModalTurma(turma);
    }

    async inativarAtivarTurma(turmaId) {
        const turma = this.turmas.find(t => t.id === turmaId || t._id === turmaId);
        if (!turma) { this.showToast('❌ Turma não encontrada', 'error'); return; }

        const novoStatus = !turma.ativa;
        const acao = novoStatus ? 'ativar' : 'inativar';
        const acaoTexto = novoStatus ? 'ativada' : 'inativada';

        const confirmar = await this.confirmar(
            `${novoStatus ? '✅ Ativar' : '⚠️ Inativar'} Turma`,
            `Deseja ${acao} a turma <strong>${turma.nome}</strong>?`,
            `Sim, ${acao}`, 'Cancelar'
        );
        if (!confirmar) return;

        try {
            this.showToast(`🔄 ${acao === 'ativar' ? 'Ativando' : 'Inativando'}...`, 'info');
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/admin/turmas/${turmaId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ativa: novoStatus })
            });
            const data = await response.json();
            if (data.success) {
                this.showToast(`✅ Turma ${acaoTexto}!`, 'success');
                turma.ativa = novoStatus;
                await this.carregarTurmas();
                this.carregarDashboard();
            } else {
                throw new Error(data.error || 'Erro');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    async excluirTurma(turmaId) {
        const turma = this.turmas.find(t => t.id === turmaId || t._id === turmaId);
        if (!turma) { this.showToast('❌ Turma não encontrada', 'error'); return; }

        const temProvas = turma.totalProvas > 0;
        const temAlunos = turma.totalAlunos > 0;

        let msgAdicional = '';
        if (temProvas) msgAdicional += `<br><span style="color:#dc3545;">⚠️ Esta turma possui ${turma.totalProvas} prova(s).</span>`;
        if (temAlunos) msgAdicional += `<br><span style="color:#dc3545;">⚠️ Esta turma possui ${turma.totalAlunos} aluno(s).</span>`;

        const confirmar = await this.confirmar(
            '🗑️ Excluir Turma',
            `Excluir PERMANENTEMENTE <strong>${turma.nome}</strong>?<br><br>
            <span style="color:#dc3545;">⚠️ Esta ação não pode ser desfeita!</span>${msgAdicional}`,
            'Sim, excluir permanentemente', 'Cancelar'
        );
        if (!confirmar) return;

        try {
            this.showToast('🗑️ Excluindo...', 'info');
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/admin/turmas/${turmaId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                this.showToast('✅ Turma excluída!', 'success');
                this.turmas = this.turmas.filter(t => (t.id || t._id) !== turmaId);
                this.turmasFiltradas = this.turmasFiltradas.filter(t => (t.id || t._id) !== turmaId);
                await this.carregarTurmas();
            } else {
                throw new Error(data.error || 'Erro');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    async verAlunosTurma(id) {
        const turma = this.turmas.find(t => t.id === id || t._id === id);
        if (!turma) { this.showToast('❌ Turma não encontrada', 'error'); return; }

        try {
            this.showToast('👥 Carregando alunos...', 'info');
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/admin/usuarios?role=aluno&limit=2000', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            const todosAlunos = data.success ? (data.usuarios || []) : [];

            const alunosMatriculados = todosAlunos.filter(a => a.turma === turma.nome);
            const alunosDisponiveis = todosAlunos.filter(a => a.turma !== turma.nome);

            this._todosAlunosVerTurma = todosAlunos;
            this._turmaAtualVerAlunos = turma;

            this.mostrarModalGerenciarAlunos(turma, alunosMatriculados, alunosDisponiveis);
            this.showToast('✅ Alunos carregados!', 'success', 1500);
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    mostrarModalGerenciarAlunos(turma, alunosMatriculados, alunosDisponiveis) {
        const modalBody = document.getElementById('modalBody');
        if (!modalBody) return;

        modalBody.innerHTML = `
            <div style="padding:0;max-height:80vh;overflow-y:auto;">
                <div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:20px;color:white;
                    position:sticky;top:0;z-index:10;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <h3 style="margin:0;font-size:1.2rem;">${turma.nome}</h3>
                            <p style="margin:5px 0 0;opacity:0.9;">${turma.disciplina || ''}</p>
                        </div>
                        <div style="text-align:right;">
                            <span style="background:rgba(255,255,255,0.2);padding:4px 12px;border-radius:30px;font-size:0.85rem;">
                                <i class="fas fa-users"></i> ${alunosMatriculados.length} matriculados
                            </span>
                        </div>
                    </div>
                </div>

                <div style="display:flex;gap:10px;padding:15px 15px 0;border-bottom:2px solid #e2e8f0;">
                    <button class="tab-aluno active" onclick="adminSimples.mudarTabAluno('matriculados')" id="tab-matriculados"
                        style="padding:8px 16px;background:none;border:none;border-bottom:3px solid #667eea;
                               font-weight:600;color:#667eea;cursor:pointer;">
                        <i class="fas fa-check-circle"></i> Matriculados
                        <span style="background:#667eea;color:white;padding:2px 6px;border-radius:20px;margin-left:5px;">${alunosMatriculados.length}</span>
                    </button>
                    <button class="tab-aluno" onclick="adminSimples.mudarTabAluno('disponiveis')" id="tab-disponiveis"
                        style="padding:8px 16px;background:none;border:none;border-bottom:3px solid transparent;
                               font-weight:600;color:#6c757d;cursor:pointer;">
                        <i class="fas fa-user-plus"></i> Disponíveis
                        <span style="background:#e2e8f0;color:#4b5563;padding:2px 6px;border-radius:20px;margin-left:5px;">${alunosDisponiveis.length}</span>
                    </button>
                </div>

                <div id="conteudo-matriculados" class="tab-conteudo-aluno" style="display:block;padding:15px;">
                    ${this.gerarListaAlunosMatriculados(alunosMatriculados, turma.nome)}
                </div>
                <div id="conteudo-disponiveis" class="tab-conteudo-aluno" style="display:none;padding:15px;">
                    ${this.gerarListaAlunosDisponiveisComFiltro(alunosDisponiveis, turma.nome)}
                </div>
            </div>`;

        this.turmaAtual = turma;
        this.alunosMatriculados = alunosMatriculados;
        this.alunosDisponiveis = alunosDisponiveis;

        this.abrirModal(`<i class="fas fa-users"></i> Alunos - ${turma.nome}`, modalBody.innerHTML, false);
    }

    mudarTabAluno(tab) {
        document.querySelectorAll('.tab-aluno').forEach(btn => {
            btn.classList.remove('active');
            btn.style.borderBottomColor = 'transparent';
            btn.style.color = '#6c757d';
        });

        if (tab === 'matriculados') {
            const t = document.getElementById('tab-matriculados');
            if (t) { t.classList.add('active'); t.style.borderBottomColor = '#667eea'; t.style.color = '#667eea'; }
            const c = document.getElementById('conteudo-matriculados');
            if (c) c.style.display = 'block';
            const d = document.getElementById('conteudo-disponiveis');
            if (d) d.style.display = 'none';
        } else {
            const t = document.getElementById('tab-disponiveis');
            if (t) { t.classList.add('active'); t.style.borderBottomColor = '#667eea'; t.style.color = '#667eea'; }
            const c = document.getElementById('conteudo-matriculados');
            if (c) c.style.display = 'none';
            const d = document.getElementById('conteudo-disponiveis');
            if (d) d.style.display = 'block';
        }
    }

    gerarListaAlunosMatriculados(alunos, turmaNome) {
        if (!alunos || alunos.length === 0) {
            return `<div style="text-align:center;padding:40px;background:#f8fafc;border-radius:12px;">
                <i class="fas fa-user-graduate" style="font-size:48px;color:#cbd5e0;margin-bottom:15px;"></i>
                <h4 style="color:#64748b;margin-bottom:5px;">Nenhum aluno matriculado</h4>
                <p style="color:#94a3b8;font-size:14px;">Mude para "Disponíveis" para adicionar alunos</p>
            </div>`;
        }

        return alunos.map(aluno => {
            const iniciais = (aluno.nome || 'A').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            const temAcessibilidade = aluno.precisaAcessibilidade === true;
            const ativo = aluno.ativo !== false;

            return `
                <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:12px;
                    margin-bottom:10px;display:flex;align-items:center;gap:12px;">
                    <div style="width:45px;height:45px;background:linear-gradient(135deg,#667eea,#764ba2);
                        border-radius:50%;display:flex;align-items:center;justify-content:center;
                        color:white;font-weight:600;font-size:16px;flex-shrink:0;">${iniciais}</div>
                    <div style="flex:1;">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <strong style="font-size:15px;color:#1e293b;">${aluno.nome}</strong>
                            ${temAcessibilidade ? '<span style="background:#e6f7ff;color:#0066cc;padding:2px 8px;border-radius:30px;font-size:10px;"><i class="fas fa-wheelchair"></i> Acessibilidade</span>' : ''}
                            ${!ativo ? '<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:30px;font-size:10px;">Inativo</span>' : ''}
                        </div>
                        <div style="display:flex;gap:15px;margin-top:4px;font-size:12px;color:#64748b;">
                            <span><i class="fas fa-envelope"></i> ${aluno.email || 'Sem email'}</span>
                            <span><i class="fas fa-id-card"></i> ${aluno.matricula || 'Sem matrícula'}</span>
                        </div>
                    </div>
                    <button class="btn-icon" onclick="adminSimples.removerAlunoDaTurma('${turmaNome}', '${aluno._id}', '${aluno.nome.replace(/'/g, "\\'")}')"
                        style="width:34px;height:34px;border:1px solid #fee2e2;border-radius:8px;
                               background:#fff5f5;cursor:pointer;">
                        <i class="fas fa-user-minus" style="color:#dc2626;"></i>
                    </button>
                </div>`;
        }).join('');
    }

    gerarListaAlunosDisponiveisComFiltro(alunos, turmaNome) {
        const turmasUnicas = [...new Set(
            (this._todosAlunosVerTurma || []).map(a => a.turma).filter(t => t && t.trim() !== '')
        )].sort();

        return `
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:15px;margin-bottom:15px;">
                <div style="display:grid;grid-template-columns:2fr 1fr;gap:10px;margin-bottom:10px;">
                    <div style="position:relative;">
                        <i class="fas fa-search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94a3b8;"></i>
                        <input type="text" id="buscaDisponivel" placeholder="Buscar..."
                            style="width:100%;padding:10px 10px 10px 38px;border:2px solid #e2e8f0;
                                   border-radius:10px;font-size:14px;box-sizing:border-box;"
                            oninput="adminSimples.filtrarAlunosDisponiveis()">
                    </div>
                    <div style="position:relative;">
                        <i class="fas fa-school" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#94a3b8;pointer-events:none;"></i>
                        <select id="filtroTurmaDisponivel"
                            style="width:100%;padding:10px 10px 10px 38px;border:2px solid #e2e8f0;
                                   border-radius:10px;font-size:14px;background:white;appearance:none;box-sizing:border-box;"
                            onchange="adminSimples.filtrarAlunosDisponiveis()">
                            <option value="todas">🌐 Todas as turmas</option>
                            <option value="sem_turma">⚠️ Sem turma</option>
                            ${turmasUnicas.map(t => `<option value="${t}">${t}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;color:#64748b;">
                    <span id="contadorDisponiveis"><strong>${alunos.length}</strong> aluno(s) disponível(is)</span>
                    <button onclick="adminSimples.limparFiltrosDisponiveis()"
                        style="background:none;border:none;color:#667eea;cursor:pointer;font-size:12px;
                               font-weight:600;display:flex;align-items:center;gap:5px;">
                        <i class="fas fa-eraser"></i> Limpar
                    </button>
                </div>
            </div>
            <div id="listaDisponiveisContainer">
                ${this.gerarCardsAlunosDisponiveis(alunos, turmaNome)}
            </div>`;
    }

    gerarCardsAlunosDisponiveis(alunos, turmaNome) {
        if (!alunos || alunos.length === 0) {
            return `<div style="text-align:center;padding:40px;background:#f8fafc;border-radius:12px;">
                <i class="fas fa-user-check" style="font-size:48px;color:#cbd5e0;margin-bottom:15px;"></i>
                <h4 style="color:#64748b;margin-bottom:5px;">Nenhum aluno disponível</h4>
                <p style="color:#94a3b8;font-size:14px;">Ajuste os filtros</p>
            </div>`;
        }

        return alunos.map(aluno => {
            const iniciais = (aluno.nome || 'A').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            const turmaAtual = aluno.turma || 'Sem turma';
            const temAcessibilidade = aluno.precisaAcessibilidade === true;
            const ativo = aluno.ativo !== false;

            return `
                <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:12px;
                    margin-bottom:10px;display:flex;align-items:center;gap:12px;transition:all 0.2s;"
                    onmouseover="this.style.borderColor='#10b981';this.style.boxShadow='0 4px 12px rgba(16,185,129,0.1)'"
                    onmouseout="this.style.borderColor='#e2e8f0';this.style.boxShadow='none'">
                    <div style="width:45px;height:45px;background:linear-gradient(135deg,#94a3b8,#64748b);
                        border-radius:50%;display:flex;align-items:center;justify-content:center;
                        color:white;font-weight:600;font-size:16px;flex-shrink:0;">${iniciais}</div>
                    <div style="flex:1;">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <strong style="font-size:15px;color:#1e293b;">${aluno.nome}</strong>
                            ${temAcessibilidade ? '<span style="background:#e6f7ff;color:#0066cc;padding:2px 8px;border-radius:30px;font-size:10px;"><i class="fas fa-wheelchair"></i></span>' : ''}
                            ${!ativo ? '<span style="background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:30px;font-size:10px;">Inativo</span>' : ''}
                        </div>
                        <div style="display:flex;gap:15px;margin-top:4px;font-size:12px;color:#64748b;flex-wrap:wrap;">
                            <span><i class="fas fa-envelope"></i> ${aluno.email || 'Sem email'}</span>
                            <span><i class="fas fa-id-card"></i> ${aluno.matricula || 'Sem matrícula'}</span>
                            <span style="background:${turmaAtual === 'Sem turma' ? '#fef3c7' : '#e0e7ff'};
                                color:${turmaAtual === 'Sem turma' ? '#92400e' : '#3730a3'};
                                padding:1px 8px;border-radius:20px;font-size:11px;font-weight:500;">
                                <i class="fas fa-school"></i> ${turmaAtual}
                            </span>
                        </div>
                    </div>
                    <button onclick="adminSimples.adicionarAlunoNaTurma('${turmaNome}', '${aluno._id}', '${aluno.nome.replace(/'/g, "\\'")}')"
                        style="background:#10b981;border:none;color:white;padding:8px 16px;border-radius:8px;
                               cursor:pointer;font-size:13px;display:flex;align-items:center;gap:5px;white-space:nowrap;">
                        <i class="fas fa-user-plus"></i> Adicionar
                    </button>
                </div>`;
        }).join('');
    }

    filtrarAlunosDisponiveis() {
        const busca = (document.getElementById('buscaDisponivel')?.value || '').toLowerCase().trim();
        const filtroTurma = document.getElementById('filtroTurmaDisponivel')?.value || 'todas';
        const turmaAtual = this.turmaAtual?.nome;

        let alunos = (this._todosAlunosVerTurma || []).filter(a => a.turma !== turmaAtual);

        if (filtroTurma === 'sem_turma') {
            alunos = alunos.filter(a => !a.turma || a.turma.trim() === '');
        } else if (filtroTurma !== 'todas') {
            alunos = alunos.filter(a => a.turma === filtroTurma);
        }

        if (busca) {
            alunos = alunos.filter(a =>
                (a.nome && a.nome.toLowerCase().includes(busca)) ||
                (a.email && a.email.toLowerCase().includes(busca)) ||
                (a.matricula && a.matricula.toLowerCase().includes(busca)));
        }

        const container = document.getElementById('listaDisponiveisContainer');
        if (container) container.innerHTML = this.gerarCardsAlunosDisponiveis(alunos, turmaAtual);

        const contador = document.getElementById('contadorDisponiveis');
        if (contador) contador.innerHTML = `<strong>${alunos.length}</strong> aluno(s) encontrado(s)`;
    }

    limparFiltrosDisponiveis() {
        const busca = document.getElementById('buscaDisponivel');
        const filtroTurma = document.getElementById('filtroTurmaDisponivel');
        if (busca) busca.value = '';
        if (filtroTurma) filtroTurma.value = 'todas';
        this.filtrarAlunosDisponiveis();
    }

    async adicionarAlunoNaTurma(turmaNome, alunoId, alunoNome) {
        if (!turmaNome || !alunoId) { this.showToast('❌ Dados inválidos', 'error'); return; }

        const confirmar = await this.confirmar(
            '➕ Adicionar Aluno',
            `Adicionar <strong>${alunoNome}</strong> à turma <strong>${turmaNome}</strong>?`
        );
        if (!confirmar) return;

        try {
            this.showToast('🔄 Adicionando...', 'info');
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/admin/usuarios/${alunoId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ turma: turmaNome })
            });
            const data = await response.json();
            if (data.success) {
                this.showToast(`✅ ${alunoNome} adicionado!`, 'success');
                const turmaId = this.turmaAtual?.id || this.turmaAtual?._id;
                if (turmaId) await this.verAlunosTurma(turmaId);
            } else {
                throw new Error(data.error || 'Erro');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    async removerAlunoDaTurma(turmaNome, alunoId, alunoNome) {
        const confirmar = await this.confirmar(
            '🗑️ Remover Aluno',
            `Remover <strong>${alunoNome}</strong> desta turma?`
        );
        if (!confirmar) return;

        try {
            this.showToast('🔄 Removendo...', 'info');
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/admin/usuarios/${alunoId}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ turma: '' })
            });
            const data = await response.json();
            if (data.success) {
                this.showToast(`✅ ${alunoNome} removido!`, 'success');
                const turmaId = this.turmaAtual?.id || this.turmaAtual?._id;
                if (turmaId) await this.verAlunosTurma(turmaId);
            } else {
                throw new Error(data.error || 'Erro');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    async verProvasTurma(id) {
        const turma = this.turmas.find(t => t.id === id || t._id === id);
        if (!turma) return;

        try {
            this.showToast('📚 Carregando provas...', 'info');
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/turmas/${id}/provas`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            const provas = data.success ? data.provas : [];

            if (provas.length === 0) {
                this.showToast('ℹ️ Nenhuma prova cadastrada', 'info');
                return;
            }

            let html = `<div style="padding:20px;max-height:60vh;overflow-y:auto;">
                <h3 style="margin:0 0 15px;"><i class="fas fa-file-alt" style="color:#3498db;"></i>
                    Provas: ${turma.nome} <span style="font-size:14px;color:#6c757d;">(${provas.length})</span>
                </h3>
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="background:#f8f9fa;">
                            <th style="padding:10px;text-align:left;">Título</th>
                            <th style="padding:10px;text-align:left;">Professor</th>
                            <th style="padding:10px;text-align:center;">Data Limite</th>
                            <th style="padding:10px;text-align:center;">Status</th>
                        </tr>
                    </thead>
                    <tbody>`;

            provas.forEach(prova => {
                const agora = new Date();
                const dataLimite = prova.dataLimite ? new Date(prova.dataLimite) : null;
                let statusClass = 'active';
                let statusText = 'Ativa';

                if (prova.cancelada) { statusClass = 'inactive'; statusText = 'Cancelada'; }
                else if (!prova.publicada) { statusClass = 'pending'; statusText = 'Rascunho'; }
                else if (dataLimite && dataLimite < agora) { statusClass = 'inactive'; statusText = 'Expirada'; }

                html += `<tr style="border-bottom:1px solid #e9ecef;">
                    <td style="padding:10px;"><strong>${prova.titulo || 'N/A'}</strong></td>
                    <td style="padding:10px;">${prova.professor?.nome || prova.professor || '-'}</td>
                    <td style="padding:10px;text-align:center;">${dataLimite ? dataLimite.toLocaleDateString('pt-BR') : 'Sem data'}</td>
                    <td style="padding:10px;text-align:center;">
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </td>
                </tr>`;
            });

            html += `</tbody></table></div>`;
            this.abrirModal(`📚 Provas da Turma: ${turma.nome}`, html, false);
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    verDetalhesTurma(turmaId) {
        const turma = this.turmas.find(t => t.id === turmaId || t._id === turmaId);
        if (!turma) { this.showToast('❌ Turma não encontrada', 'error'); return; }

        this.abrirModal(
            '👁️ Detalhes da Turma',
            `<div style="padding:20px;">
                <p><strong>Nome:</strong> ${turma.nome || 'N/A'}</p>
                <p><strong>Disciplina:</strong> ${turma.disciplina || 'N/A'}</p>
                <p><strong>Eixo:</strong> ${this.getEixoLabel(turma.eixo)}</p>
                <p><strong>Código:</strong> ${turma.codigo || 'N/A'}</p>
                <p><strong>Professor:</strong> ${turma.professor?.nome || 'Não atribuído'}</p>
                <p><strong>Alunos:</strong> ${turma.totalAlunos || 0}</p>
                <p><strong>Provas:</strong> ${turma.totalProvas || 0}</p>
                <p><strong>Status:</strong> ${turma.ativa ? 'Ativa' : 'Inativa'}</p>
            </div>`,
            false
        );
    }

    async abrirModalTurma(turmaId = null) {
        console.log('📝 Abrindo modal de turma. ID:', turmaId);

        let turma = null;
        if (turmaId) {
            // Se turmaId for um objeto (chamado por editarTurma), usa direto
            if (typeof turmaId === 'object') {
                turma = turmaId;
            } else {
                try {
                    const token = localStorage.getItem('auth_token');
                    const response = await fetch(`/api/admin/turmas/${turmaId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const data = await response.json();
                    if (data.success && data.turma) turma = data.turma;
                    else throw new Error(data.error || 'Turma não encontrada');
                } catch (error) {
                    console.error('❌ Erro ao buscar turma:', error);
                    this.showToast('❌ Erro ao carregar turma', 'error');
                    return;
                }
            }
        }

        let eixosDoBanco = [];
        let professoresDoBanco = [];

        try {
            const token = localStorage.getItem('auth_token');
            const [eixosRes, professoresRes] = await Promise.all([
                fetch('/api/admin/eixos', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/admin/usuarios?role=professor&limit=1000&status=ativo', { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            const eixosData = await eixosRes.json();
            const professoresData = await professoresRes.json();

            if (eixosData.success && eixosData.eixos) eixosDoBanco = eixosData.eixos;
            if (professoresData.success && professoresData.usuarios) {
                professoresDoBanco = professoresData.usuarios.sort((a, b) => a.nome.localeCompare(b.nome));
            }
        } catch (error) {
            console.error('❌ Erro ao carregar dados do modal:', error);
        }

        const isEdicao = !!turma;

        const opcoesEixos = eixosDoBanco.length > 0
            ? eixosDoBanco.map(e => {
                const selected = turma?.eixo === e.nome ? 'selected' : '';
                return `<option value="${e.nome}" ${selected}>${e.label || e.nome}</option>`;
            }).join('')
            : '<option value="" disabled>Nenhum eixo cadastrado</option>';

        const opcoesProfessores = professoresDoBanco.length > 0
            ? professoresDoBanco.map(p => {
                const selected = turma?.professor?._id === p._id || turma?.professorId === p._id ? 'selected' : '';
                const email = p.email ? ` - ${p.email}` : '';
                return `<option value="${p._id}" ${selected}>${p.nome}${email}</option>`;
            }).join('')
            : '<option value="" disabled>Nenhum professor cadastrado</option>';

        const nomeAtual = turma?.nome || '';
        const disciplinaAtual = turma?.disciplina || '';
        const codigoAtual = turma?.codigo || '';
        const descricaoAtual = turma?.descricao || '';
        const ativaAtual = turma?.ativa !== false;

        const conteudoHTML = `
            <form id="turmaForm" onsubmit="event.preventDefault();">
                <div style="background:linear-gradient(135deg,#667eea,#764ba2);margin:-20px -20px 20px -20px;
                    padding:25px 30px;border-radius:12px 12px 0 0;color:white;">
                    <div style="display:flex;align-items:center;gap:15px;">
                        <div style="width:50px;height:50px;background:rgba(255,255,255,0.2);
                            border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:24px;">
                            <i class="fas fa-school"></i>
                        </div>
                        <div>
                            <h2 style="margin:0;font-size:1.5rem;font-weight:600;">
                                ${isEdicao ? '✏️ Editar Turma' : '➕ Nova Turma'}
                            </h2>
                            <p style="margin:5px 0 0;opacity:0.9;font-size:0.9rem;">
                                <i class="fas fa-users"></i> Gerencie as informações da turma
                            </p>
                        </div>
                    </div>
                </div>

                <div style="padding:10px 20px 20px;">
                    <div style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:20px;
                        border:1px solid #e2e8f0;">
                        <div style="margin-bottom:20px;">
                            <label style="display:flex;align-items:center;gap:8px;font-weight:600;color:#334155;margin-bottom:8px;">
                                <i class="fas fa-tag" style="color:#667eea;"></i> Nome da Turma <span style="color:#ef4444;">*</span>
                            </label>
                            <input type="text" id="turmaNome" value="${nomeAtual}"
                                placeholder="Ex: Turma A - 2024"
                                style="width:100%;padding:12px 16px;border:2px solid #e2e8f0;
                                       border-radius:10px;font-size:14px;" required>
                        </div>

                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:20px;">
                            <div>
                                <label style="display:flex;align-items:center;gap:8px;font-weight:600;color:#334155;margin-bottom:8px;">
                                    <i class="fas fa-book" style="color:#667eea;"></i> Disciplina <span style="color:#ef4444;">*</span>
                                </label>
                                <input type="text" id="turmaDisciplina" value="${disciplinaAtual}"
                                    placeholder="Ex: Matemática"
                                    style="width:100%;padding:12px 16px;border:2px solid #e2e8f0;
                                           border-radius:10px;font-size:14px;" required>
                            </div>
                            <div>
                                <label style="display:flex;align-items:center;gap:8px;font-weight:600;color:#334155;margin-bottom:8px;">
                                    <i class="fas fa-sitemap" style="color:#667eea;"></i> Eixo <span style="color:#ef4444;">*</span>
                                </label>
                                <select id="turmaEixo"
                                    style="width:100%;padding:12px 16px;border:2px solid #e2e8f0;
                                           border-radius:10px;font-size:14px;background:white;" required>
                                    <option value="">Selecione um eixo...</option>
                                    ${opcoesEixos}
                                </select>
                            </div>
                        </div>

                        <div style="margin-bottom:20px;">
                            <label style="display:flex;align-items:center;gap:8px;font-weight:600;color:#334155;margin-bottom:8px;">
                                <i class="fas fa-hashtag" style="color:#667eea;"></i> Código
                            </label>
                            <input type="text" id="turmaCodigo" value="${codigoAtual}"
                                placeholder="Ex: 101"
                                style="width:100%;padding:12px 16px;border:2px solid #e2e8f0;
                                       border-radius:10px;font-size:14px;">
                        </div>

                        <div style="margin-bottom:20px;">
                            <label style="display:flex;align-items:center;gap:8px;font-weight:600;color:#334155;margin-bottom:8px;">
                                <i class="fas fa-chalkboard-teacher" style="color:#667eea;"></i> Professor
                            </label>
                            <select id="turmaProfessor"
                                style="width:100%;padding:12px 16px;border:2px solid #e2e8f0;
                                       border-radius:10px;font-size:14px;background:white;">
                                <option value="">Selecione um professor...</option>
                                ${opcoesProfessores}
                            </select>
                        </div>

                        <div style="margin-bottom:20px;">
                            <label style="display:flex;align-items:center;gap:8px;font-weight:600;color:#334155;margin-bottom:8px;">
                                <i class="fas fa-align-left" style="color:#667eea;"></i> Descrição
                            </label>
                            <textarea id="turmaDescricao" rows="3"
                                placeholder="Descrição..."
                                style="width:100%;padding:12px 16px;border:2px solid #e2e8f0;
                                       border-radius:10px;font-size:14px;resize:vertical;">${descricaoAtual}</textarea>
                        </div>

                        <div style="background:#f8fafc;border-radius:12px;padding:15px;border:1px solid #e2e8f0;">
                            <div style="display:flex;align-items:center;gap:12px;">
                                <input type="checkbox" id="turmaAtiva" ${ativaAtual ? 'checked' : ''}
                                    style="width:18px;height:18px;cursor:pointer;">
                                <label for="turmaAtiva" style="font-weight:600;cursor:pointer;color:#1e293b;">
                                    Turma Ativa
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </form>`;

        const titulo = isEdicao
            ? '<i class="fas fa-edit"></i> Editar Turma'
            : '<i class="fas fa-plus"></i> Nova Turma';

        // 🔥 ABRE COM CALLBACK ISOLADO
        const turmaIdParaSalvar = isEdicao ? (turma._id || turma.id) : null;
        this.abrirModal(titulo, conteudoHTML, true, () => this.salvarTurma(turmaIdParaSalvar));

        setTimeout(() => {
            const btn = document.getElementById('modalSaveBtn');
            if (btn) {
                btn.textContent = isEdicao ? '💾 Salvar Alterações' : '➕ Criar Turma';
            }
            document.getElementById('turmaNome')?.focus();
        }, 50);
    }

    async salvarTurma(turmaId = null) {
        console.log('💾 Salvando turma. ID:', turmaId);

        try {
            const nome = document.getElementById('turmaNome')?.value?.trim();
            const disciplina = document.getElementById('turmaDisciplina')?.value?.trim();
            const eixo = document.getElementById('turmaEixo')?.value;
            const codigo = document.getElementById('turmaCodigo')?.value?.trim();
            const professorId = document.getElementById('turmaProfessor')?.value || null;
            const descricao = document.getElementById('turmaDescricao')?.value?.trim();
            const ativa = document.getElementById('turmaAtiva')?.checked !== false;

            if (!nome) { this.showToast('❌ Nome é obrigatório', 'error'); return; }
            if (!disciplina) { this.showToast('❌ Disciplina é obrigatória', 'error'); return; }
            if (!eixo) { this.showToast('❌ Selecione um eixo', 'error'); return; }

            const dados = { nome, disciplina, eixo, ativa };
            if (codigo) dados.codigo = codigo;
            if (professorId) dados.professorId = professorId;
            if (descricao) dados.descricao = descricao;

            console.log('📤 Dados:', dados);
            this.showToast('💾 Salvando turma...', 'info');

            const token = localStorage.getItem('auth_token');
            const url = turmaId ? `/api/admin/turmas/${turmaId}` : '/api/admin/turmas';
            const method = turmaId ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dados)
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);

            if (data.success) {
                this.showToast(turmaId ? '✅ Turma atualizada!' : '✅ Turma criada!', 'success');
                this.fecharModal();
                await this.carregarTurmas();
            } else {
                throw new Error(data.error || 'Erro ao salvar turma');
            }
        } catch (error) {
            console.error('❌ Erro ao salvar turma:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============================================================================
    // EIXOS
    // ============================================================================
    async carregarEixos() {
        const contentArea = document.getElementById('contentArea');
        if (!contentArea) return;

        contentArea.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>Carregando eixos...</p></div>`;

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/admin/eixos', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            this.eixos = data.success ? data.eixos : [];
            contentArea.innerHTML = this.renderizarEixos();
        } catch (error) {
            contentArea.innerHTML = `<p style="color:red;">Erro: ${error.message}</p>`;
        }
    }

    renderizarEixos() {
        return `
            <div class="eixos-container">
                <div class="page-header">
                    <h1><i class="fas fa-sitemap"></i> Eixos Tecnológicos</h1>
                    <button class="btn-primary" onclick="adminSimples.abrirModalEixo()">
                        <i class="fas fa-plus"></i> Novo Eixo
                    </button>
                </div>
                <div class="eixos-grid">
                    ${this.eixos.map(eixo => `
                        <div class="eixo-card" style="border-left:4px solid ${eixo.cor};">
                            <div class="eixo-header">
                                <div>
                                    <i class="fas ${eixo.icone}" style="color:${eixo.cor};"></i>
                                    <h3>${eixo.label}</h3>
                                </div>
                                <div class="eixo-actions">
                                    <button onclick="adminSimples.editarEixo('${eixo._id}')"><i class="fas fa-edit"></i></button>
                                    <button onclick="adminSimples.excluirEixo('${eixo._id}')"><i class="fas fa-trash"></i></button>
                                </div>
                            </div>
                            <p class="eixo-nome">${eixo.nome}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
            <style>
                .eixos-container { padding:24px; }
                .page-header { display:flex; justify-content:space-between; margin-bottom:20px; }
                .page-header h1 { margin:0; font-size:24px; color:#1f2937; display:flex; align-items:center; gap:10px; }
                .eixos-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:20px; }
                .eixo-card { background:white; border-radius:12px; padding:20px; box-shadow:0 2px 8px rgba(0,0,0,0.1); }
                .eixo-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
                .eixo-header div:first-child { display:flex; align-items:center; gap:10px; }
                .eixo-header i { font-size:24px; }
                .eixo-header h3 { margin:0; font-size:16px; }
                .eixo-nome { color:#666; font-size:12px; margin:0; }
                .eixo-actions button { background:none; border:none; cursor:pointer; padding:5px; color:#666; }
                .eixo-actions button:hover { color:#333; }
            </style>`;
    }

    abrirModalEixo(eixoId = null) {
        const eixo = eixoId ? this.eixos.find(e => e._id === eixoId) : null;

        const conteudo = `
            <form id="eixoForm">
                <div class="form-group">
                    <label>Nome (identificador)</label>
                    <input type="text" id="eixoNome" class="form-control" value="${eixo?.nome || ''}"
                        placeholder="Ex: desenvolvimento" required>
                    <small>Usado internamente</small>
                </div>
                <div class="form-group">
                    <label>Label (exibição)</label>
                    <input type="text" id="eixoLabel" class="form-control" value="${eixo?.label || ''}"
                        placeholder="Ex: 💻 Desenvolvimento de Sistemas" required>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Cor</label>
                        <input type="color" id="eixoCor" class="form-control" value="${eixo?.cor || '#667eea'}">
                    </div>
                    <div class="form-group">
                        <label>Ícone</label>
                        <select id="eixoIcone" class="form-control">
                            <option value="fa-graduation-cap" ${eixo?.icone === 'fa-graduation-cap' ? 'selected' : ''}>🎓 Graduação</option>
                            <option value="fa-code" ${eixo?.icone === 'fa-code' ? 'selected' : ''}>💻 Código</option>
                            <option value="fa-network-wired" ${eixo?.icone === 'fa-network-wired' ? 'selected' : ''}>🌐 Rede</option>
                            <option value="fa-utensils" ${eixo?.icone === 'fa-utensils' ? 'selected' : ''}>🍳 Gastronomia</option>
                            <option value="fa-chart-line" ${eixo?.icone === 'fa-chart-line' ? 'selected' : ''}>📊 Gestão</option>
                            <option value="fa-leaf" ${eixo?.icone === 'fa-leaf' ? 'selected' : ''}>🌱 Ambiente</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Descrição</label>
                    <textarea id="eixoDescricao" class="form-control" rows="3">${eixo?.descricao || ''}</textarea>
                </div>
            </form>`;

        const titulo = eixoId
            ? '<i class="fas fa-edit"></i> Editar Eixo'
            : '<i class="fas fa-plus"></i> Novo Eixo';

        // 🔥 ABRE COM CALLBACK ISOLADO
        this.abrirModal(titulo, conteudo, true, () => this.salvarEixo(eixoId));
    }

    async salvarEixo(eixoId = null) {
        try {
            const dados = {
                nome: document.getElementById('eixoNome').value,
                label: document.getElementById('eixoLabel').value,
                cor: document.getElementById('eixoCor').value,
                icone: document.getElementById('eixoIcone').value,
                descricao: document.getElementById('eixoDescricao').value
            };

            const token = localStorage.getItem('auth_token');
            const url = eixoId ? `/api/admin/eixos/${eixoId}` : '/api/admin/eixos';
            const method = eixoId ? 'PUT' : 'POST';

            this.showToast('🔄 Salvando eixo...', 'info');

            const response = await fetch(url, {
                method,
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
            const data = await response.json();

            if (data.success) {
                this.showToast(eixoId ? '✅ Eixo atualizado!' : '✅ Eixo criado!', 'success');
                this.fecharModal();
                await this.carregarEixos();
            } else {
                throw new Error(data.error || 'Erro ao salvar eixo');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    editarEixo(eixoId) { this.abrirModalEixo(eixoId); }

    async excluirEixo(eixoId) {
        const eixo = this.eixos.find(e => e._id === eixoId);
        if (!eixo) return;

        const confirmar = await this.confirmar(
            '🗑️ Excluir Eixo',
            `Excluir o eixo <strong>${eixo.label}</strong>?<br><br>
            Esta ação não pode ser desfeita e afetará os cursos vinculados.`
        );
        if (!confirmar) return;

        try {
            this.showToast('🔄 Excluindo eixo...', 'info');
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/admin/eixos/${eixoId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                this.showToast('✅ Eixo excluído!', 'success');
                await this.carregarEixos();
            } else {
                throw new Error(data.error || 'Erro ao excluir eixo');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============================================================================
    // CURSOS
    // ============================================================================
    async carregarCursos() {
        const contentArea = document.getElementById('contentArea');
        if (!contentArea) return;

        contentArea.innerHTML = `<div class="loading-spinner"><div class="spinner"></div><p>Carregando cursos...</p></div>`;

        try {
            const token = localStorage.getItem('auth_token');

            const eixosRes = await fetch('/api/admin/eixos', { headers: { 'Authorization': `Bearer ${token}` } });
            const eixosData = await eixosRes.json();
            this.eixos = eixosData.success ? eixosData.eixos : [];

            const cursosRes = await fetch('/api/admin/cursos', { headers: { 'Authorization': `Bearer ${token}` } });
            const cursosData = await cursosRes.json();
            this.cursos = cursosData.success ? cursosData.cursos : [];

            contentArea.innerHTML = this.renderizarCursos();
        } catch (error) {
            console.error('❌ Erro ao carregar cursos:', error);
            contentArea.innerHTML = `<p style="color:red;">Erro: ${error.message}</p>`;
        }
    }

    renderizarCursos() {
        const eixosMap = {};
        this.eixos.forEach(eixo => { eixosMap[eixo._id] = eixo; });

        return `
            <div class="cursos-container">
                <div class="page-header">
                    <h1><i class="fas fa-graduation-cap"></i> Cursos</h1>
                    <button class="btn-primary" onclick="adminSimples.abrirModalCurso()">
                        <i class="fas fa-plus"></i> Novo Curso
                    </button>
                </div>
                <div class="cursos-list">
                    ${this.cursos.map(curso => {
                        let eixo = null;
                        if (curso.eixoId && typeof curso.eixoId === 'object') eixo = curso.eixoId;
                        else if (curso.eixoId && eixosMap[curso.eixoId]) eixo = eixosMap[curso.eixoId];

                        const icone = eixo?.icone || 'fa-graduation-cap';
                        const cor = eixo?.cor || '#667eea';
                        const eixoLabel = eixo?.label || 'Eixo não definido';

                        return `
                            <div class="curso-card" style="border-left:4px solid ${cor};">
                                <div class="curso-header">
                                    <div class="curso-title">
                                        <i class="fas ${icone}" style="color:${cor};"></i>
                                        <h3>${curso.nome}</h3>
                                        <span class="eixo-badge" style="background:${cor}20;color:${cor};border:1px solid ${cor}40;">
                                            <i class="fas ${icone}"></i> ${eixoLabel}
                                        </span>
                                    </div>
                                    <div class="curso-actions">
                                        <button class="btn-icon" onclick="adminSimples.editarCurso('${curso._id}')" title="Editar curso">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="btn-icon danger" onclick="adminSimples.excluirCurso('${curso._id}')" title="Excluir curso">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>

                                <div class="turmas-section">
                                    <div class="turmas-header">
                                        <span class="turmas-title">
                                            <i class="fas fa-users"></i> Turmas (${curso.turmas?.length || 0})
                                        </span>
                                        <button class="btn-add-turma" onclick="adminSimples.abrirModalTurmaCurricular('${curso._id}')">
                                            <i class="fas fa-plus"></i> Nova Turma
                                        </button>
                                    </div>
                                    <div class="turmas-list">
                                        ${curso.turmas?.map(t => `
                                            <div class="turma-item ${t.ativa ? '' : 'inativa'}">
                                                <span class="turma-codigo">${t.codigo}</span>
                                                <span class="turma-periodo">${t.periodo}ª Série</span>
                                                <span class="turma-vagas">${t.vagas} vagas</span>
                                                <span class="turma-status ${t.ativa ? 'ativa' : 'inativa'}">
                                                    ${t.ativa ? 'Ativa' : 'Inativa'}
                                                </span>
                                                <div class="turma-actions">
                                                    <button class="btn-icon-small" onclick="adminSimples.editarTurmaCurricular('${curso._id}', '${t._id}')" title="Editar">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button class="btn-icon-small danger" onclick="adminSimples.excluirTurmaCurricular('${curso._id}', '${t._id}')" title="Excluir">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        `).join('') || '<p class="sem-turmas">Nenhuma turma cadastrada</p>'}
                                    </div>
                                </div>

                                <div class="curso-footer">
                                    <span class="curso-data">
                                        <i class="fas fa-calendar-alt"></i>
                                        Criado em: ${new Date(curso.createdAt).toLocaleDateString('pt-BR')}
                                    </span>
                                    <span class="curso-status ${curso.ativo ? 'ativo' : 'inativo'}">
                                        ${curso.ativo ? 'Ativo' : 'Inativo'}
                                    </span>
                                </div>
                            </div>`;
                    }).join('')}
                    ${this.cursos.length === 0 ? `
                        <div class="empty-state">
                            <i class="fas fa-graduation-cap"></i>
                            <h3>Nenhum curso cadastrado</h3>
                            <p>Clique em "Novo Curso" para começar</p>
                        </div>` : ''}
                </div>
            </div>
            <style>
                .cursos-container { padding:24px; max-width:1200px; margin:0 auto; }
                .page-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:30px; }
                .page-header h1 { margin:0; font-size:24px; color:#1f2937; display:flex; align-items:center; gap:10px; }
                .cursos-list { display:flex; flex-direction:column; gap:20px; }
                .curso-card { background:white; border-radius:16px; padding:20px;
                    box-shadow:0 2px 8px rgba(0,0,0,0.05); border:1px solid #e5e7eb; transition:all 0.3s; }
                .curso-card:hover { box-shadow:0 4px 12px rgba(0,0,0,0.1); }
                .curso-header { display:flex; justify-content:space-between; align-items:center;
                    margin-bottom:20px; padding-bottom:15px; border-bottom:1px solid #e5e7eb; }
                .curso-title { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
                .curso-title i { font-size:24px; }
                .curso-title h3 { margin:0; font-size:18px; color:#1f2937; }
                .eixo-badge { padding:4px 12px; border-radius:30px; font-size:12px;
                    display:flex; align-items:center; gap:5px; }
                .curso-actions { display:flex; gap:8px; }
                .turmas-section { background:#f9fafb; border-radius:12px; padding:15px; margin-bottom:15px; }
                .turmas-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; }
                .turmas-title { font-size:14px; font-weight:600; color:#4b5563;
                    display:flex; align-items:center; gap:8px; }
                .btn-add-turma { background:#10b981; color:white; border:none; padding:6px 12px;
                    border-radius:6px; font-size:12px; cursor:pointer; display:flex; align-items:center; gap:5px; }
                .turmas-list { display:flex; flex-direction:column; gap:8px; }
                .turma-item { background:white; border-radius:8px; padding:12px; display:flex;
                    align-items:center; gap:15px; border:1px solid #e5e7eb; }
                .turma-item.inativa { opacity:0.7; background:#f3f4f6; }
                .turma-codigo { font-weight:600; color:#1f2937; min-width:80px; }
                .turma-periodo { background:#667eea; color:white; padding:2px 8px; border-radius:20px; font-size:11px; }
                .turma-vagas { color:#6b7280; font-size:13px; }
                .turma-status { padding:2px 8px; border-radius:20px; font-size:11px; font-weight:500; }
                .turma-status.ativa { background:#d1fae5; color:#065f46; }
                .turma-status.inativa { background:#fee2e2; color:#991b1b; }
                .turma-actions { margin-left:auto; display:flex; gap:5px; }
                .btn-icon-small { width:28px; height:28px; border:none; background:transparent;
                    color:#6b7280; cursor:pointer; border-radius:4px; }
                .btn-icon-small:hover { background:#f3f4f6; }
                .btn-icon-small.danger:hover { color:#dc3545; }
                .sem-turmas { text-align:center; color:#9ca3af; padding:20px; margin:0; }
                .curso-footer { display:flex; justify-content:space-between; align-items:center;
                    font-size:12px; color:#6b7280; }
                .curso-data i { margin-right:5px; }
                .curso-status { padding:4px 12px; border-radius:30px; }
                .curso-status.ativo { background:#d1fae5; color:#065f46; }
                .curso-status.inativo { background:#fee2e2; color:#991b1b; }
                .empty-state { text-align:center; padding:60px; background:white; border-radius:16px; }
                .empty-state i { font-size:64px; color:#d1d5db; margin-bottom:15px; }
                .empty-state h3 { color:#374151; margin-bottom:10px; }
                .empty-state p { color:#6b7280; margin-bottom:20px; }
            </style>`;
    }

    abrirModalCurso(cursoId = null) {
        const curso = cursoId ? this.cursos.find(c => c._id === cursoId) : null;

        const conteudo = `
            <form id="cursoForm">
                <div class="form-group">
                    <label>Nome do Curso</label>
                    <input type="text" id="cursoNome" class="form-control" value="${curso?.nome || ''}"
                        placeholder="Ex: TÉCNICO EM DESENVOLVIMENTO DE SISTEMAS" required>
                </div>
                <div class="form-group">
                    <label>Eixo</label>
                    <select id="cursoEixoId" class="form-control" required>
                        <option value="">Selecione um eixo...</option>
                        ${this.eixos.map(e => `
                            <option value="${e._id}"
                                ${curso?.eixoId?._id === e._id || curso?.eixoId === e._id ? 'selected' : ''}>
                                ${e.label}
                            </option>
                        `).join('')}
                    </select>
                </div>
                ${curso ? `
                    <div style="background:#f8fafc;border-radius:10px;padding:15px;margin-top:15px;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <input type="checkbox" id="cursoAtivo" ${curso.ativo !== false ? 'checked' : ''}>
                            <label for="cursoAtivo" style="font-weight:600;cursor:pointer;">Curso Ativo</label>
                        </div>
                    </div>` : ''}
            </form>`;

        const titulo = cursoId
            ? '<i class="fas fa-edit"></i> Editar Curso'
            : '<i class="fas fa-plus"></i> Novo Curso';

        this.abrirModal(titulo, conteudo, true, () => this.salvarCurso(cursoId));
    }

    async salvarCurso(cursoId = null) {
        try {
            const dados = {
                nome: document.getElementById('cursoNome').value,
                eixoId: document.getElementById('cursoEixoId').value
            };

            if (!dados.nome || !dados.eixoId) {
                this.showToast('❌ Nome e eixo são obrigatórios', 'error');
                return;
            }

            this.showToast('🔄 Salvando curso...', 'info');
            const token = localStorage.getItem('auth_token');
            const url = cursoId ? `/api/admin/cursos/${cursoId}` : '/api/admin/cursos';
            const method = cursoId ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
            const data = await response.json();

            if (data.success) {
                this.showToast(cursoId ? '✅ Curso atualizado!' : '✅ Curso criado!', 'success');
                this.fecharModal();
                await this.carregarCursos();
            } else {
                throw new Error(data.error || 'Erro ao salvar curso');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    editarCurso(cursoId) { this.abrirModalCurso(cursoId); }

    async excluirCurso(cursoId) {
        const confirmar = await this.confirmar(
            '🗑️ Excluir Curso',
            'Tem certeza? Todas as turmas serão removidas.'
        );
        if (!confirmar) return;

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/admin/cursos/${cursoId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                this.showToast('✅ Curso excluído!', 'success');
                await this.carregarCursos();
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // 🔥 ESTE É O MÉTODO QUE ESTAVA FALTANDO (o erro que você reportou!)
    editarTurmaCurricular(cursoId, turmaId) {
        console.log('✏️ Editando turma curricular:', { cursoId, turmaId });
        this.abrirModalTurmaCurricular(cursoId, turmaId);
    }

    abrirModalTurmaCurricular(cursoId, turmaId = null) {
        const curso = this.cursos.find(c => c._id === cursoId);
        if (!curso) {
            this.showToast('❌ Curso não encontrado', 'error');
            return;
        }

        this.cursoAtual = curso;
        const turma = turmaId ? curso.turmas.find(t => t._id === turmaId) : null;

        const conteudo = `
            <form id="turmaCurricularForm">
                <div style="padding:20px;">
                    <h4 style="margin-bottom:15px;color:#1f2937;">Curso: ${curso.nome}</h4>
                    <div class="form-group" style="margin-bottom:15px;">
                        <label style="display:block;margin-bottom:5px;font-weight:600;">Código da Turma</label>
                        <input type="text" id="turmaCodigo" class="form-control" value="${turma?.codigo || ''}"
                            placeholder="Ex: 101" required
                            style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;">
                    </div>
                    <div class="form-group" style="margin-bottom:15px;">
                        <label style="display:block;margin-bottom:5px;font-weight:600;">Série</label>
                        <select id="turmaPeriodo" class="form-control" required
                            style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;">
                            <option value="1" ${turma?.periodo === '1' ? 'selected' : ''}>1ª Série</option>
                            <option value="2" ${turma?.periodo === '2' ? 'selected' : ''}>2ª Série</option>
                            <option value="3" ${turma?.periodo === '3' ? 'selected' : ''}>3ª Série</option>
                            <option value="4" ${turma?.periodo === '4' ? 'selected' : ''}>4ª Série</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom:15px;">
                        <label style="display:block;margin-bottom:5px;font-weight:600;">Vagas</label>
                        <input type="number" id="turmaVagas" class="form-control" value="${turma?.vagas || 40}"
                            min="1" max="100"
                            style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;">
                    </div>
                    <div style="background:#f8fafc;border-radius:10px;padding:15px;margin-bottom:15px;">
                        <div style="display:flex;align-items:center;gap:10px;">
                            <input type="checkbox" id="turmaAtiva" ${turma?.ativa !== false ? 'checked' : ''}>
                            <label for="turmaAtiva" style="font-weight:600;cursor:pointer;">Turma Ativa</label>
                        </div>
                    </div>
                </div>
            </form>`;

        const titulo = turmaId
            ? '<i class="fas fa-edit"></i> Editar Turma do Curso'
            : '<i class="fas fa-plus"></i> Nova Turma no Curso';

        this.abrirModal(titulo, conteudo, true, () => this.salvarTurmaCurricular(cursoId, turmaId));
    }

    async salvarTurmaCurricular(cursoId, turmaId = null) {
        try {
            const dados = {
                codigo: document.getElementById('turmaCodigo')?.value,
                periodo: document.getElementById('turmaPeriodo')?.value,
                vagas: parseInt(document.getElementById('turmaVagas')?.value) || 40,
                ativa: document.getElementById('turmaAtiva')?.checked !== false
            };

            if (!dados.codigo || !dados.periodo) {
                this.showToast('❌ Código e série são obrigatórios', 'error');
                return;
            }

            this.showToast('🔄 Salvando turma curricular...', 'info');
            const token = localStorage.getItem('auth_token');
            const url = turmaId
                ? `/api/admin/cursos/${cursoId}/turmas/${turmaId}`
                : `/api/admin/cursos/${cursoId}/turmas`;
            const method = turmaId ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
            const data = await response.json();

            if (data.success) {
                this.showToast(turmaId ? '✅ Turma atualizada!' : '✅ Turma criada!', 'success');
                this.fecharModal();
                await this.carregarCursos();
            } else {
                throw new Error(data.error || 'Erro ao salvar turma curricular');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    async excluirTurmaCurricular(cursoId, turmaId) {
        const curso = this.cursos.find(c => c._id === cursoId);
        if (!curso) return;
        const turma = curso.turmas.find(t => t._id === turmaId);
        if (!turma) return;

        const confirmar = await this.confirmar(
            '🗑️ Excluir Turma',
            `Excluir <strong>${turma.codigo} - ${turma.periodo}ª Série</strong> do curso <strong>${curso.nome}</strong>?`
        );
        if (!confirmar) return;

        try {
            this.showToast('🔄 Excluindo...', 'info');
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/admin/cursos/${cursoId}/turmas/${turmaId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                this.showToast('✅ Turma curricular excluída!', 'success');
                await this.carregarCursos();
            } else {
                throw new Error(data.error || 'Erro');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============================================================================
    // CARREGAR FOTO DE PERFIL
    // ============================================================================
    async carregarFotoPerfilAdmin() {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            const response = await fetch('/api/perfil/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();

            if (data.success && data.perfil && data.perfil.fotoPerfil) {
                const imgElement = document.getElementById('adminFotoPerfil');
                const iconElement = document.getElementById('adminAvatarIcon');
                if (imgElement && iconElement) {
                    imgElement.src = data.perfil.fotoPerfil;
                    imgElement.style.display = 'block';
                    iconElement.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('❌ Erro ao carregar foto:', error);
        }
    }

        // ============================================================================
    // PROVAS
    // ============================================================================
    async carregarProvas() {
        console.log('📚 CARREGANDO PROVAS...');
        const contentArea = document.getElementById('contentArea');

        if (contentArea && this.abaAtual === 'provas') {
            contentArea.innerHTML = `
                <div style="text-align:center;padding:60px;background:white;border-radius:12px;">
                    <div style="width:50px;height:50px;border:5px solid #f3f3f3;border-top:5px solid #1e3a8a;
                                border-radius:50%;margin:0 auto 20px;animation:spin 1s linear infinite;"></div>
                    <p style="color:#6b7280;">Carregando provas...</p>
                </div>
                <style>@keyframes spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}</style>`;
        }

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/admin/provas?limit=100', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);

            const data = await response.json();
            this.provas = data.success ? (data.provas || []) : [];
            this.professoresLista = this.extrairProfessores(this.provas);

            console.log(`✅ ${this.provas.length} provas carregadas`);

            if (this.abaAtual === 'provas' && contentArea) {
                this.renderizarPaginaProvas();
            }
        } catch (error) {
            console.error('❌ Erro ao carregar provas:', error);
            this.provas = [];

            if (this.abaAtual === 'provas' && contentArea) {
                contentArea.innerHTML = `
                    <div style="text-align:center;padding:60px;background:white;border-radius:16px;">
                        <i class="fas fa-exclamation-triangle" style="font-size:48px;color:#dc3545;margin-bottom:20px;"></i>
                        <h3 style="color:#721c24;margin-bottom:10px;">Erro ao carregar provas</h3>
                        <p style="color:#6c757d;margin-bottom:20px;">${error.message}</p>
                        <button onclick="adminSimples.carregarProvas()"
                            style="background:#1e3a8a;color:white;border:none;padding:10px 30px;
                                   border-radius:8px;cursor:pointer;">
                            <i class="fas fa-sync-alt"></i> Tentar novamente
                        </button>
                    </div>`;
            }
        }
    }

    renderizarPaginaProvas() {
        const contentArea = document.getElementById('contentArea');
        if (!contentArea) return;

        const provasAtivas = this.provas.filter(p =>
            p.publicada && !p.cancelada && (!p.dataLimite || new Date(p.dataLimite) > new Date())
        ).length;
        const rascunhos = this.provas.filter(p => !p.publicada && !p.cancelada).length;
        const canceladas = this.provas.filter(p => p.cancelada).length;

        contentArea.innerHTML = `
            <div class="provas-container">
                <div class="provas-header">
                    <div class="header-left">
                        <div class="header-icon"><i class="fas fa-file-alt"></i></div>
                        <div class="header-text">
                            <h1>Gerenciar Provas</h1>
                            <p>Gerencie todas as provas do sistema</p>
                        </div>
                    </div>
                    <div class="header-actions">
                        <button class="btn-header btn-refresh" onclick="adminSimples.atualizarProvas()"
                            style="background:rgba(255,255,255,0.15);color:white;border:1px solid rgba(255,255,255,0.3);
                                   padding:12px;border-radius:40px;cursor:pointer;">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                        <button class="btn-header btn-primary" onclick="adminSimples.mostrarFormCriarProva()"
                            style="background:white;color:#1e3a8a;padding:12px 24px;border-radius:40px;
                                   border:none;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:8px;">
                            <i class="fas fa-magic"></i><span>Nova Prova com IA</span>
                        </button>
                        <button class="btn-header"
                            style="background:#8b5cf6;color:white;border:none;padding:12px 24px;
                                   border-radius:40px;font-weight:600;cursor:pointer;display:flex;
                                   align-items:center;gap:8px;"
                            onclick="adminSimples.abrirModalUploadAdaptarDocumento()"
                            title="Adaptar documento">
                            <i class="fas fa-universal-access"></i><span>Adaptar Documento</span>
                        </button>
                    </div>
                </div>

                <div class="stats-grid">
                    <div class="stat-card primary" onclick="adminSimples.filtrarProvasPorStatus('todas')">
                        <div class="stat-icon" style="background:linear-gradient(135deg,#1e3a8a,#1e40af);">
                            <i class="fas fa-file-alt"></i>
                        </div>
                        <div class="stat-content">
                            <span class="stat-label">Total de Provas</span>
                            <span class="stat-value">${this.provas.length}</span>
                        </div>
                    </div>
                    <div class="stat-card success" onclick="adminSimples.filtrarProvasPorStatus('ativa')">
                        <div class="stat-icon" style="background:linear-gradient(135deg,#10b981,#059669);">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <div class="stat-content">
                            <span class="stat-label">Ativas</span>
                            <span class="stat-value">${provasAtivas}</span>
                        </div>
                    </div>
                    <div class="stat-card warning" onclick="adminSimples.filtrarProvasPorStatus('rascunho')">
                        <div class="stat-icon" style="background:linear-gradient(135deg,#f59e0b,#d97706);">
                            <i class="fas fa-clock"></i>
                        </div>
                        <div class="stat-content">
                            <span class="stat-label">Rascunhos</span>
                            <span class="stat-value">${rascunhos}</span>
                        </div>
                    </div>
                    <div class="stat-card danger" onclick="adminSimples.filtrarProvasPorStatus('cancelada')">
                        <div class="stat-icon" style="background:linear-gradient(135deg,#ef4444,#dc2626);">
                            <i class="fas fa-ban"></i>
                        </div>
                        <div class="stat-content">
                            <span class="stat-label">Canceladas</span>
                            <span class="stat-value">${canceladas}</span>
                        </div>
                    </div>
                </div>

                <div class="filters-card">
                    <div class="filters-header">
                        <div class="filters-title">
                            <i class="fas fa-sliders-h"></i><h3>Filtros</h3>
                        </div>
                        <span class="filters-badge" id="resultadosBadge">
                            ${this.provas.length} ${this.provas.length === 1 ? 'prova' : 'provas'}
                        </span>
                    </div>
                    <div class="filters-grid">
                        <div class="filter-group">
                            <label><i class="fas fa-search"></i> Buscar</label>
                            <input type="text" id="searchProvas" placeholder="Título, conteúdo ou professor..."
                                value="" onkeyup="adminSimples.filtrarProvasLista()"
                                style="width:100%;padding:10px 15px;border:2px solid #e5e7eb;
                                       border-radius:12px;font-size:14px;">
                        </div>
                        <div class="filter-group">
                            <label><i class="fas fa-circle"></i> Status</label>
                            <select id="filtroStatusProva" onchange="adminSimples.filtrarProvasLista()"
                                style="width:100%;padding:10px 15px;border:2px solid #e5e7eb;
                                       border-radius:12px;font-size:14px;background:white;">
                                <option value="todas">Todas</option>
                                <option value="rascunho">📝 Rascunhos</option>
                                <option value="ativa">✅ Ativas</option>
                                <option value="expirada">⏰ Expiradas</option>
                                <option value="cancelada">🚫 Canceladas</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label><i class="fas fa-tag"></i> Tipo</label>
                            <select id="filtroTipoProva" onchange="adminSimples.filtrarProvasLista()"
                                style="width:100%;padding:10px 15px;border:2px solid #e5e7eb;
                                       border-radius:12px;font-size:14px;background:white;">
                                <option value="todas">Todos</option>
                                <option value="simples">📄 Simples</option>
                                <option value="enem">🎯 ENEM</option>
                                <option value="adaptada">♿ Adaptada</option>
                            </select>
                        </div>
                        <div class="filter-actions">
                            <button onclick="adminSimples.limparFiltrosProvas()"
                                style="padding:10px 20px;border:none;border-radius:12px;font-size:13px;
                                       font-weight:600;cursor:pointer;background:#6b7280;color:white;">
                                <i class="fas fa-eraser"></i> Limpar
                            </button>
                        </div>
                    </div>
                </div>

                <div id="formCriarProvaContainer" style="display:none;margin-bottom:30px;"></div>

                <div class="table-professional">
                    <div class="table-header">
                        <div class="table-title">
                            <i class="fas fa-list"></i><h3>Lista de Provas</h3>
                        </div>
                        <div class="table-info">
                            <span id="itemsCounter">${this.provas.length} registros</span>
                        </div>
                    </div>
                    <div style="overflow-x:auto;">
                        <table style="width:100%;border-collapse:collapse;">
                            <thead>
                                <tr style="background:#f9fafb;">
                                    <th style="padding:15px 20px;text-align:left;font-size:13px;font-weight:600;color:#4b5563;border-bottom:2px solid #e5e7eb;">Título</th>
                                    <th style="padding:15px 20px;text-align:left;font-size:13px;font-weight:600;color:#4b5563;border-bottom:2px solid #e5e7eb;">Professor</th>
                                    <th style="padding:15px 20px;text-align:left;font-size:13px;font-weight:600;color:#4b5563;border-bottom:2px solid #e5e7eb;">Turma</th>
                                    <th style="padding:15px 20px;text-align:left;font-size:13px;font-weight:600;color:#4b5563;border-bottom:2px solid #e5e7eb;">Tipo</th>
                                    <th style="padding:15px 20px;text-align:left;font-size:13px;font-weight:600;color:#4b5563;border-bottom:2px solid #e5e7eb;">Status</th>
                                    <th style="padding:15px 20px;text-align:left;font-size:13px;font-weight:600;color:#4b5563;border-bottom:2px solid #e5e7eb;">Questões</th>
                                    <th style="padding:15px 20px;text-align:left;font-size:13px;font-weight:600;color:#4b5563;border-bottom:2px solid #e5e7eb;">Ações</th>
                                </tr>
                            </thead>
                            <tbody id="tabelaProvas">
                                ${this.gerarLinhasProvas(this.provas)}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <style>
                .provas-container { padding:24px; max-width:1400px; margin:0 auto; }
                .provas-header { background:linear-gradient(135deg,#1e3a8a 0%,#1e40af 100%);
                    border-radius:20px; padding:30px; margin-bottom:30px; display:flex;
                    justify-content:space-between; align-items:center; flex-wrap:wrap; gap:20px;
                    box-shadow:0 10px 30px rgba(30,58,138,0.3); color:white; }
                .header-left { display:flex; align-items:center; gap:20px; }
                .header-icon { width:70px; height:70px; background:rgba(255,255,255,0.15);
                    border-radius:20px; display:flex; align-items:center; justify-content:center;
                    font-size:32px; backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.2); }
                .header-text h1 { color:white; font-size:28px; font-weight:600; margin:0 0 5px; }
                .header-text p { color:rgba(255,255,255,0.9); font-size:14px; margin:0; }
                .header-actions { display:flex; gap:10px; flex-wrap:wrap; }
                .stats-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:20px; margin-bottom:30px; }
                .stat-card { background:white; border-radius:16px; padding:20px;
                    box-shadow:0 2px 8px rgba(0,0,0,0.05); display:flex; align-items:center;
                    gap:20px; cursor:pointer; transition:all 0.3s; border:1px solid rgba(0,0,0,0.05); }
                .stat-card:hover { transform:translateY(-4px); box-shadow:0 8px 16px rgba(0,0,0,0.1); }
                .stat-icon { width:60px; height:60px; border-radius:16px; display:flex;
                    align-items:center; justify-content:center; font-size:24px; color:white; }
                .stat-content { flex:1; }
                .stat-label { display:block; font-size:12px; color:#6b7280; margin-bottom:4px; }
                .stat-value { display:block; font-size:28px; font-weight:700; color:#1f2937; line-height:1.2; }
                .filters-card { background:white; border-radius:16px; padding:20px;
                    margin-bottom:30px; box-shadow:0 2px 8px rgba(0,0,0,0.05); }
                .filters-header { display:flex; justify-content:space-between; align-items:center;
                    margin-bottom:20px; padding-bottom:15px; border-bottom:2px solid #f0f0f0; }
                .filters-title { display:flex; align-items:center; gap:10px; }
                .filters-title i { font-size:18px; color:#1e3a8a; background:#e0e7ff;
                    padding:8px; border-radius:10px; }
                .filters-title h3 { margin:0; font-size:16px; color:#374151; }
                .filters-badge { background:#1e3a8a; color:white; padding:4px 12px;
                    border-radius:30px; font-size:12px; font-weight:600; }
                .filters-grid { display:grid; grid-template-columns:2fr 1fr 1fr auto; gap:15px; }
                .filter-group { display:flex; flex-direction:column; gap:5px; }
                .filter-group label { font-size:12px; font-weight:600; color:#4b5563;
                    display:flex; align-items:center; gap:5px; }
                .filter-actions { display:flex; gap:10px; align-items:flex-end; }
                .table-professional { background:white; border-radius:16px;
                    box-shadow:0 2px 8px rgba(0,0,0,0.05); overflow:hidden;
                    border:1px solid rgba(0,0,0,0.05); }
                .table-header { padding:16px 20px; background:#f9fafb; border-bottom:1px solid #e5e7eb;
                    display:flex; justify-content:space-between; align-items:center; }
                .table-title { display:flex; align-items:center; gap:10px; }
                .table-title i { color:#1e3a8a; font-size:16px; }
                .table-title h3 { margin:0; font-size:15px; color:#374151; }
                .table-info { font-size:13px; color:#6b7280; font-weight:500; }
                .status-badge { display:inline-block; padding:4px 10px; border-radius:30px;
                    font-size:11px; font-weight:600; }
                .status-badge.active { background:#d1fae5; color:#065f46; }
                .status-badge.pending { background:#fef3c7; color:#92400e; }
                .status-badge.inactive { background:#fee2e2; color:#991b1b; }
                .status-badge.primary { background:#e0e7ff; color:#1e40af; }
                .status-badge.info { background:#cff4fc; color:#055160; }
                .status-badge.warning { background:#fff3cd; color:#856404; }
                .empty-state { text-align:center; padding:60px 20px; color:#6b7280; }
                .empty-state i { font-size:64px; color:#d1d5db; margin-bottom:15px; display:block; }
                .btn-icon { width:32px; height:32px; border:none; border-radius:6px;
                    cursor:pointer; display:inline-flex; align-items:center;
                    justify-content:center; color:white; margin:0 2px; transition:all 0.2s; }
                .btn-icon:hover { transform:scale(1.1); }
                @media (max-width:1024px) {
                    .stats-grid { grid-template-columns:repeat(2,1fr); }
                    .filters-grid { grid-template-columns:1fr; }
                }
                @media (max-width:768px) {
                    .stats-grid { grid-template-columns:1fr; }
                    .provas-header { flex-direction:column; align-items:flex-start; }
                }
            </style>`;
    }

    filtrarProvasPorStatus(status) {
        const select = document.getElementById('filtroStatusProva');
        if (select) {
            select.value = status;
            this.filtrarProvasLista();
        }
    }

    filtrarProvasLista() {
        const busca = document.getElementById('searchProvas')?.value.toLowerCase() || '';
        const status = document.getElementById('filtroStatusProva')?.value || 'todas';
        const tipo = document.getElementById('filtroTipoProva')?.value || 'todas';
        const agora = new Date();

        const filtradas = this.provas.filter(p => {
            let nomeProfessor = '';
            if (p.professor) {
                nomeProfessor = typeof p.professor === 'object'
                    ? (p.professor.nome || '')
                    : p.professor;
            }

            let nomeTurma = '';
            if (p.turma) {
                nomeTurma = typeof p.turma === 'object' ? (p.turma.nome || '') : p.turma;
            }

            const matchBusca = busca === '' ||
                (p.titulo && p.titulo.toLowerCase().includes(busca)) ||
                (nomeProfessor && nomeProfessor.toLowerCase().includes(busca)) ||
                (nomeTurma && nomeTurma.toLowerCase().includes(busca));

            let matchStatus = true;
            if (status === 'rascunho') {
                matchStatus = (p.publicada === false || p.publicada === 'false') && p.cancelada !== true;
            } else if (status === 'ativa') {
                const dataLimite = p.dataLimite ? new Date(p.dataLimite) : null;
                matchStatus = (p.publicada === true || p.publicada === 'true') &&
                    p.cancelada !== true && (!dataLimite || dataLimite > agora);
            } else if (status === 'expirada') {
                const dataLimite = p.dataLimite ? new Date(p.dataLimite) : null;
                matchStatus = (p.publicada === true || p.publicada === 'true') &&
                    p.cancelada !== true && dataLimite && dataLimite < agora;
            } else if (status === 'cancelada') {
                matchStatus = p.cancelada === true;
            }

            let matchTipo = true;
            if (tipo === 'simples') {
                matchTipo = (p.tipoProva === 'simples' || !p.tipoProva) && p.adaptada !== true;
            } else if (tipo === 'enem') {
                matchTipo = p.tipoProva === 'enem';
            } else if (tipo === 'adaptada') {
                matchTipo = p.adaptada === true;
            }

            return matchBusca && matchStatus && matchTipo;
        });

        const tabela = document.getElementById('tabelaProvas');
        if (tabela) tabela.innerHTML = this.gerarLinhasProvas(filtradas);

        const resultadosBadge = document.getElementById('resultadosBadge');
        if (resultadosBadge) {
            resultadosBadge.textContent = `${filtradas.length} ${filtradas.length === 1 ? 'prova' : 'provas'}`;
        }

        const itemsCounter = document.getElementById('itemsCounter');
        if (itemsCounter) itemsCounter.textContent = `${filtradas.length} registros`;
    }

    limparFiltrosProvas() {
        const searchInput = document.getElementById('searchProvas');
        if (searchInput) searchInput.value = '';
        const statusSelect = document.getElementById('filtroStatusProva');
        if (statusSelect) statusSelect.value = 'todas';
        const tipoSelect = document.getElementById('filtroTipoProva');
        if (tipoSelect) tipoSelect.value = 'todas';
        this.filtrarProvasLista();
    }

    async atualizarProvas() {
        this.showToast('🔄 Atualizando provas...', 'info');
        await this.carregarProvas();
        this.showToast('✅ Provas atualizadas!', 'success');
    }

    extrairProfessores(provas) {
        const professores = new Map();
        (provas || []).forEach(p => {
            if (p.professor) {
                if (typeof p.professor === 'object') {
                    const id = p.professor.id || p.professor._id;
                    const nome = p.professor.nome;
                    if (id && nome) professores.set(id, { id, nome });
                } else if (typeof p.professor === 'string' && p.professor !== '-') {
                    professores.set(p.professor, { id: p.professor, nome: p.professor });
                }
            }
            if (p.professorId && !professores.has(p.professorId) && this.usuarios) {
                const prof = this.usuarios.find(u => u._id === p.professorId || u.id === p.professorId);
                if (prof) professores.set(p.professorId, { id: p.professorId, nome: prof.nome });
            }
        });
        return Array.from(professores.values());
    }

    obterNomeProfessor(prova) {
        if (prova.professor) {
            if (typeof prova.professor === 'object') {
                return prova.professor.nome || prova.professor.name || 'Não informado';
            }
            return prova.professor;
        }
        return 'Não informado';
    }

    gerarLinhasProvas(provas) {
        if (!provas || provas.length === 0) {
            return '<tr><td colspan="9" class="empty-state">Nenhuma prova encontrada</td></tr>';
        }

        return provas.map(p => {
            let statusClass = '';
            let statusText = '';

            if (p.cancelada) {
                statusClass = 'inactive'; statusText = 'Cancelada';
            } else if (!p.publicada) {
                statusClass = 'pending'; statusText = 'Rascunho';
            } else if (p.dataLimite && new Date(p.dataLimite) < new Date()) {
                statusClass = 'inactive'; statusText = 'Expirada';
            } else {
                statusClass = 'active'; statusText = 'Ativa';
            }

            let tipoClass = 'primary';
            let tipo = 'Simples';
            if (p.tipoProva === 'enem') { tipoClass = 'info'; tipo = 'ENEM'; }
            else if (p.adaptada === true) { tipoClass = 'warning'; tipo = 'Adaptada'; }

            const provaId = p.id || p._id;

            return `
                <tr>
                    <td style="padding:12px 16px;border-bottom:1px solid #e9ecef;font-size:13px;">
                        <strong>${p.titulo || 'Sem título'}</strong>
                        <br><small style="color:#666;">${(p.conteudo || '').substring(0, 50)}</small>
                    </td>
                    <td style="padding:12px 16px;border-bottom:1px solid #e9ecef;font-size:13px;">
                        ${this.obterNomeProfessor(p)}
                    </td>
                    <td style="padding:12px 16px;border-bottom:1px solid #e9ecef;font-size:13px;">
                        ${p.turma?.nome || p.turma || '-'}
                    </td>
                    <td style="padding:12px 16px;border-bottom:1px solid #e9ecef;font-size:13px;">
                        <span class="status-badge ${tipoClass}">${tipo}</span>
                    </td>
                    <td style="padding:12px 16px;border-bottom:1px solid #e9ecef;font-size:13px;">
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </td>
                    <td style="padding:12px 16px;border-bottom:1px solid #e9ecef;font-size:13px;">
                        ${p.quantidadeQuestoes || 0}
                    </td>
                    <td style="padding:12px 16px;border-bottom:1px solid #e9ecef;font-size:13px;">
                        <div style="display:flex;gap:5px;flex-wrap:wrap;">
                            <button class="btn-icon" style="background:#3498db;"
                                onclick="adminSimples.verDetalhesProva('${provaId}')" title="Ver detalhes">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn-icon" style="background:#9b59b6;"
                                onclick="adminSimples.visualizarQuestoes('${provaId}')" title="Ver questões">
                                <i class="fas fa-question-circle"></i>
                            </button>
                            ${p.publicada ? `
                            <button class="btn-icon" style="background:#27ae60;"
                                onclick="adminSimples.verResultadosProva('${provaId}')" title="Ver resultados">
                                <i class="fas fa-chart-bar"></i>
                            </button>` : ''}
                            ${!p.publicada && !p.cancelada ? `
                            <button class="btn-icon" style="background:#f39c12;"
                                onclick="adminSimples.publicarProva('${provaId}')" title="Publicar">
                                <i class="fas fa-paper-plane"></i>
                            </button>` : ''}
                            <button class="btn-icon" style="background:#f1c40f;"
                                onclick="adminSimples.editarProvaSimples('${provaId}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon" style="background:#8b5cf6;"
                                onclick="adminSimples.corrigirProvaComQRCode('${provaId}')" title="Corrigir (QR Code)">
                                <i class="fas fa-qrcode"></i>
                            </button>
                            ${p.publicada && !p.cancelada && p.dataLimite && new Date(p.dataLimite) > new Date() ? `
                            <button class="btn-icon" style="background:#e67e22;"
                                onclick="adminSimples.adiarProva('${provaId}')" title="Adiar data">
                                <i class="fas fa-calendar-plus"></i>
                            </button>` : ''}
                            <button class="btn-icon" style="background:#e67e22;"
                                onclick="adminSimples.baixarImprimirProva('${provaId}')" title="Imprimir">
                                <i class="fas fa-print"></i>
                            </button>
                            <button class="btn-icon" style="background:#e74c3c;"
                                onclick="adminSimples.excluirProva('${provaId}')" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
        }).join('');
    }

    corrigirProvaComQRCode(provaId) {
        console.log('📱 Corrigindo prova via QR Code:', provaId);
        const token = localStorage.getItem('auth_token');
        if (!token) {
            this.showToast('❌ Você precisa estar logado', 'error');
            return;
        }
        const url = `/corrigir-prova?prova=${provaId}&token=${encodeURIComponent(token)}`;
        window.open(url, '_blank');
        this.showToast('📱 Abrindo página de correção...', 'info');
    }

    // ============================================================================
    // CRIAR PROVA COM IA
    // ============================================================================
    async carregarProfessoresParaSelect() {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/admin/usuarios?role=professor&limit=100', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            this.professoresParaSelect = data.success ? (data.usuarios || []) : [];
            console.log(`✅ ${this.professoresParaSelect.length} professores`);
        } catch (error) {
            console.error('❌ Erro ao carregar professores:', error);
            this.professoresParaSelect = [];
        }
    }

    async carregarTurmasParaSelect() {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/admin/turmas?limit=100', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            this.turmasParaSelect = data.success ? (data.turmas || []) : [];
            console.log(`✅ ${this.turmasParaSelect.length} turmas`);
        } catch (error) {
            console.error('❌ Erro ao carregar turmas:', error);
            this.turmasParaSelect = [];
        }
    }

    preencherSelectProfessores() {
        const select = document.getElementById('professorProvaSimples');
        if (!select) return;
        select.innerHTML = '<option value="">Selecione um professor...</option>';
        if (!this.professoresParaSelect || this.professoresParaSelect.length === 0) {
            select.innerHTML += '<option value="" disabled>Nenhum professor disponível</option>';
            return;
        }
        this.professoresParaSelect.forEach(prof => {
            const option = document.createElement('option');
            option.value = prof._id;
            option.textContent = `${prof.nome} - ${prof.email}`;
            select.appendChild(option);
        });
    }

    preencherSelectTurmas() {
        const select = document.getElementById('turmaProvaSimples');
        if (!select) return;
        select.innerHTML = '<option value="">Selecione uma turma...</option>';
        if (!this.turmasParaSelect || this.turmasParaSelect.length === 0) {
            select.innerHTML += '<option value="" disabled>Nenhuma turma disponível</option>';
            return;
        }
        this.turmasParaSelect.forEach(turma => {
            const option = document.createElement('option');
            option.value = turma.id || turma._id;
            option.textContent = `${turma.nome} - ${turma.disciplina || 'Sem disciplina'} (${turma.totalAlunos || 0} alunos)`;
            select.appendChild(option);
        });
    }

    calcularDuracaoSimples() {
        const inicio = document.getElementById('horarioInicioSimples')?.value;
        const termino = document.getElementById('horarioTerminoSimples')?.value;
        if (!inicio || !termino) return;

        const [h1, m1] = inicio.split(':').map(Number);
        const [h2, m2] = termino.split(':').map(Number);
        const totalMinutos = (h2 * 60 + m2) - (h1 * 60 + m1);

        const duracaoEl = document.getElementById('duracaoCalculadaSimples');
        if (!duracaoEl) return;

        if (totalMinutos <= 0) {
            duracaoEl.innerHTML = '<span style="color:#ef4444;">⚠️ Horário inválido</span>';
            return;
        }

        const horas = Math.floor(totalMinutos / 60);
        const minutos = totalMinutos % 60;
        let duracaoTexto = '';
        if (horas > 0) duracaoTexto += `${horas} hora${horas > 1 ? 's' : ''}`;
        if (minutos > 0) {
            if (horas > 0) duracaoTexto += ' e ';
            duracaoTexto += `${minutos} minuto${minutos > 1 ? 's' : ''}`;
        }
        duracaoEl.innerHTML = `<strong>⏱️ ${duracaoTexto}</strong> (${totalMinutos} minutos)`;
    }

    mudarTipoProvaSimples() {
        const tipo = document.getElementById('tipoProvaSimples')?.value;
        if (tipo === 'adaptada') {
            this.showToast('♿ Modo Adaptada ativado! 3 alternativas por questão.', 'info');
        } else if (tipo === 'enem') {
            this.showToast('🎯 Modo ENEM ativado!', 'info');
        }
    }

    fecharFormCriarProva() {
        const container = document.getElementById('formCriarProvaContainer');
        if (container) { container.style.display = 'none'; container.innerHTML = ''; }
        this.provaGeradaSimples = null;
    }

    mostrarFormCriarProva() {
        console.log('📝 Abrindo formulário de criação...');
        const container = document.getElementById('formCriarProvaContainer');
        if (!container) {
            this.showToast('❌ Container não encontrado', 'error');
            return;
        }

        this.carregarProfessoresParaSelect();
        this.carregarTurmasParaSelect();

        container.innerHTML = `
            <div style="background:white;border-radius:16px;padding:25px;
                box-shadow:0 4px 12px rgba(0,0,0,0.1);border:2px solid #1e3a8a;margin-bottom:30px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                    <h3 style="margin:0;display:flex;align-items:center;gap:10px;">
                        <i class="fas fa-magic" style="color:#1e3a8a;"></i> Criar Nova Prova com IA
                    </h3>
                    <button onclick="adminSimples.fecharFormCriarProva()"
                        style="background:none;border:none;font-size:24px;cursor:pointer;color:#6b7280;">&times;</button>
                </div>

                <form id="formNovaProvaSimples" onsubmit="event.preventDefault(); adminSimples.gerarProvaSimples();">
                    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:20px;">
                        <div style="grid-column:span 2;">
                            <label style="display:block;margin-bottom:5px;font-weight:600;">
                                <i class="fas fa-lightbulb"></i> Tema da Prova
                            </label>
                            <textarea id="temaProvaSimples" rows="2" required
                                style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;"
                                placeholder="Ex: Equações do 2º grau, Segunda Guerra Mundial..."></textarea>
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;font-weight:600;">Título</label>
                            <input type="text" id="tituloProvaSimples" required
                                style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;"
                                placeholder="Ex: Prova Bimestral">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;font-weight:600;">Período</label>
                            <select id="periodoProvaSimples" required
                                style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;">
                                <option value="">Selecione...</option>
                                <option value="1">1º Período</option>
                                <option value="2">2º Período</option>
                                <option value="3">3º Período</option>
                                <option value="4">4º Período</option>
                            </select>
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;font-weight:600;">Professor</label>
                            <select id="professorProvaSimples" required
                                style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;">
                                <option value="">Carregando...</option>
                            </select>
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;font-weight:600;">Turma</label>
                            <select id="turmaProvaSimples" required
                                style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;">
                                <option value="">Carregando...</option>
                            </select>
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;font-weight:600;">Tipo</label>
                            <select id="tipoProvaSimples" onchange="adminSimples.mudarTipoProvaSimples()"
                                style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;">
                                <option value="simples">📝 Simples (5 alternativas)</option>
                                <option value="enem">🎯 Formato ENEM</option>
                                <option value="adaptada">♿ Adaptada (3 alternativas)</option>
                            </select>
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;font-weight:600;">Questões</label>
                            <select id="quantidadeSimples"
                                style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;">
                                <option value="5">5 questões</option>
                                <option value="10" selected>10 questões</option>
                                <option value="15">15 questões</option>
                                <option value="20">20 questões</option>
                                <option value="25">25 questões</option>
                                <option value="30">30 questões</option>
                            </select>
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;font-weight:600;">Dificuldade</label>
                            <select id="dificuldadeSimples"
                                style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;">
                                <option value="facil">🟢 Fácil</option>
                                <option value="media" selected>🟡 Médio</option>
                                <option value="dificil">🔴 Difícil</option>
                            </select>
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;font-weight:600;">Data Limite</label>
                            <input type="date" id="dataLimiteSimples"
                                style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;font-weight:600;">Início</label>
                            <input type="time" id="horarioInicioSimples" value="08:00" required
                                style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;">
                        </div>
                        <div>
                            <label style="display:block;margin-bottom:5px;font-weight:600;">Término</label>
                            <input type="time" id="horarioTerminoSimples" value="09:30" required
                                style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;">
                        </div>
                    </div>

                    <div style="margin:20px 0;padding:15px;background:#f3f4f6;border-radius:8px;
                        text-align:center;font-weight:600;" id="duracaoCalculadaSimples">
                        Calculando duração...
                    </div>

                    <button type="submit"
                        style="width:100%;padding:15px;background:linear-gradient(135deg,#10b981,#059669);
                               color:white;border:none;border-radius:8px;font-weight:600;
                               font-size:16px;cursor:pointer;">
                        <i class="fas fa-magic"></i> Gerar Prova com IA
                    </button>
                </form>
            </div>`;

        container.style.display = 'block';

        setTimeout(() => {
            this.preencherSelectProfessores();
            this.preencherSelectTurmas();

            const inicio = document.getElementById('horarioInicioSimples');
            const termino = document.getElementById('horarioTerminoSimples');
            if (inicio && termino) {
                inicio.addEventListener('change', () => this.calcularDuracaoSimples());
                termino.addEventListener('change', () => this.calcularDuracaoSimples());
                this.calcularDuracaoSimples();
            }
        }, 100);
    }

    async gerarProvaSimples() {
        console.log('🤖 Gerando prova com IA...');
        const btn = document.querySelector('#formNovaProvaSimples button[type="submit"]');
        if (!btn) return;

        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
        btn.disabled = true;

        try {
            const token = localStorage.getItem('auth_token');
            const professorId = document.getElementById('professorProvaSimples')?.value;
            const turmaId = document.getElementById('turmaProvaSimples')?.value;
            const titulo = document.getElementById('tituloProvaSimples')?.value;
            const tema = document.getElementById('temaProvaSimples')?.value;
            const periodo = document.getElementById('periodoProvaSimples')?.value;
            const tipoProva = document.getElementById('tipoProvaSimples')?.value;
            const quantidade = parseInt(document.getElementById('quantidadeSimples')?.value) || 10;
            const dificuldade = document.getElementById('dificuldadeSimples')?.value;
            const horarioInicio = document.getElementById('horarioInicioSimples')?.value;
            const horarioTermino = document.getElementById('horarioTerminoSimples')?.value;

            if (!professorId) throw new Error('Selecione um professor');
            if (!turmaId) throw new Error('Selecione uma turma');
            if (!periodo) throw new Error('Selecione o período');
            if (!tema) throw new Error('Digite o tema');

            let dataLimite = null;
            const dataLimiteInput = document.getElementById('dataLimiteSimples')?.value;
            if (dataLimiteInput) {
                const [ano, mes, dia] = dataLimiteInput.split('-').map(Number);
                dataLimite = new Date(ano, mes - 1, dia, 23, 59, 59).toISOString();
            }

            const dadosBase = {
                professorId, turmaId, titulo, conteudo: tema,
                tipoProva, periodo, quantidadeQuestoes: quantidade,
                dificuldade, dataLimite, horarioInicio, horarioTermino
            };

            if (tipoProva === 'adaptada') {
                dadosBase.adaptada = true;
                dadosBase.alternativas = 3;
            }

            const response = await fetch(`/api/turmas/${turmaId}/prova-v2`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dadosBase)
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);

            if (data.success) {
                this.provaGeradaSimples = { id: data.provaId, ...data.prova, questoes: data.questoes || [] };
                this.showToast('✅ Prova gerada!', 'success');
                this.mostrarPreviewProvaSimples(data.questoes || []);
            } else {
                throw new Error(data.error || 'Erro ao gerar prova');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    mostrarPreviewProvaSimples(questoes) {
        const container = document.getElementById('formCriarProvaContainer');
        if (!container) return;

        if (!questoes || questoes.length === 0) {
            container.innerHTML += `
                <div style="padding:20px;background:#fef3c7;border-radius:12px;margin-top:20px;text-align:center;">
                    <i class="fas fa-exclamation-triangle" style="font-size:32px;color:#f59e0b;margin-bottom:10px;"></i>
                    <p style="color:#92400e;">Nenhuma questão foi gerada.</p>
                </div>`;
            return;
        }

        let questoesHTML = '';
        questoes.forEach((q, index) => {
            const tipo = q.tipo === 'enem' ? 'ENEM' : (q.tipo === 'adaptada' ? 'ADAPTADA' : 'SIMPLES');
            const tipoBg = q.tipo === 'enem' ? '#cffafe' : (q.tipo === 'adaptada' ? '#fef3c7' : '#e0e7ff');
            const tipoTextoCor = q.tipo === 'enem' ? '#055160' : (q.tipo === 'adaptada' ? '#856404' : '#1e40af');

            const respostaCorreta = q.respostaCorreta !== undefined ? q.respostaCorreta : 0;
            const opcoes = q.opcoes || [];

            questoesHTML += `
                <div style="margin-bottom:20px;padding:15px;background:#f8fafc;border-radius:8px;
                    border-left:4px solid #10b981;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                        <span style="background:#10b981;color:white;padding:2px 10px;
                            border-radius:12px;font-size:12px;font-weight:600;">
                            Questão ${index + 1}
                        </span>
                        <span style="padding:2px 10px;border-radius:12px;font-size:11px;
                            font-weight:600;background:${tipoBg};color:${tipoTextoCor};">
                            ${tipo}
                        </span>
                    </div>
                    <div style="margin-bottom:10px;font-weight:500;color:#1f2937;font-size:0.95rem;">
                        ${q.pergunta || q.enunciado || 'Pergunta não disponível'}
                    </div>
                    <div style="margin-left:15px;">
                        ${opcoes.map((opcao, idx) => {
                            const letra = String.fromCharCode(65 + idx);
                            const isCorreta = idx === respostaCorreta;
                            return `
                                <div style="padding:5px 8px;margin-bottom:4px;border-radius:4px;
                                    ${isCorreta ? 'background:#d1fae5;font-weight:600;color:#065f46;' : 'color:#4b5563;'}">
                                    <strong>${letra})</strong> ${opcao} ${isCorreta ? ' ✓' : ''}
                                </div>`;
                        }).join('')}
                    </div>
                    ${q.explicacao ? `
                        <div style="margin-top:10px;padding:10px;background:#f0f9ff;border-radius:6px;
                            font-size:0.85rem;color:#0369a1;">
                            <i class="fas fa-lightbulb"></i> <strong>Explicação:</strong> ${q.explicacao}
                        </div>` : ''}
                </div>`;
        });

        container.insertAdjacentHTML('beforeend', `
            <div style="margin-top:20px;padding:20px;background:white;border-radius:16px;
                border:2px solid #10b981;box-shadow:0 4px 12px rgba(16,185,129,0.15);">
                <div style="display:flex;justify-content:space-between;align-items:center;
                    margin-bottom:20px;padding-bottom:15px;border-bottom:2px solid #f0f0f0;">
                    <h3 style="margin:0;display:flex;align-items:center;gap:8px;color:#1f2937;">
                        <i class="fas fa-eye" style="color:#10b981;"></i> Pré-visualização
                    </h3>
                    <span style="background:#10b981;color:white;padding:5px 15px;
                        border-radius:30px;font-weight:600;font-size:14px;">
                        ${questoes.length} ${questoes.length === 1 ? 'questão' : 'questões'}
                    </span>
                </div>
                <div style="max-height:60vh;overflow-y:auto;padding-right:10px;">
                    ${questoesHTML}
                </div>
                <div style="display:flex;gap:10px;margin-top:20px;padding-top:20px;
                    border-top:2px solid #f0f0f0;">
                    <button onclick="adminSimples.publicarProvaSimples()"
                        style="flex:1;padding:12px;background:linear-gradient(135deg,#10b981,#059669);
                               color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;">
                        <i class="fas fa-paper-plane"></i> Publicar Prova
                    </button>
                    <button onclick="adminSimples.regenerarProvaSimples()"
                        style="flex:1;padding:12px;background:linear-gradient(135deg,#f59e0b,#d97706);
                               color:white;border:none;border-radius:8px;font-weight:600;cursor:pointer;">
                        <i class="fas fa-redo"></i> Regenerar
                    </button>
                    <button onclick="adminSimples.fecharPreviewSimples()"
                        style="padding:12px 20px;background:#6b7280;color:white;border:none;
                               border-radius:8px;font-weight:600;cursor:pointer;">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>
            </div>`);

        setTimeout(() => {
            const preview = container.lastElementChild;
            if (preview) preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 200);
    }

    async publicarProvaSimples() {
        if (!this.provaGeradaSimples || !this.provaGeradaSimples.id) {
            this.showToast('❌ Nenhuma prova para publicar', 'error');
            return;
        }

        try {
            this.showToast('📢 Publicando...', 'info');
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/professor/provas/${this.provaGeradaSimples.id}/publicar`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            const data = await response.json();
            if (data.success) {
                this.showToast('✅ Prova publicada!', 'success');
                this.fecharFormCriarProva();
                await this.carregarProvas();
            } else {
                throw new Error(data.error || 'Erro ao publicar');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    async regenerarProvaSimples() {
        if (!this.provaGeradaSimples) {
            this.showToast('❌ Nenhuma prova para regenerar', 'error');
            return;
        }
        this.showToast('🔄 Regenerando...', 'info');
        await this.gerarProvaSimples();
    }

    fecharPreviewSimples() {
        const container = document.getElementById('formCriarProvaContainer');
        if (container) {
            const previews = container.querySelectorAll('div[style*="border:2px solid #10b981"], div[style*="border: 2px solid #10b981"]');
            previews.forEach(p => p.remove());
        }
        this.provaGeradaSimples = null;
    }

    // ============================================================================
    // EDITAR / PUBLICAR / ADIAR / EXCLUIR PROVA
    // ============================================================================
    async editarProvaSimples(provaId) {
        console.log('✏️ Editando prova:', provaId);

        const prova = this.provas.find(p => (p.id || p._id) === provaId);
        if (!prova) { this.showToast('❌ Prova não encontrada', 'error'); return; }

        try {
            this.showToast('📝 Carregando dados...', 'info');
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/provas/${provaId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro ao carregar prova');

            const provaCompleta = data.prova || prova;
            const questoes = data.questoes || [];

            let dataLimiteStr = '';
            if (provaCompleta.dataLimite) {
                const dl = new Date(provaCompleta.dataLimite);
                const ano = dl.getFullYear();
                const mes = String(dl.getMonth() + 1).padStart(2, '0');
                const dia = String(dl.getDate()).padStart(2, '0');
                dataLimiteStr = `${ano}-${mes}-${dia}`;
            }

            this.criarModalEdicaoProvaSimples(
                provaId, provaCompleta, questoes, dataLimiteStr,
                provaCompleta.horarioInicio || prova.horarioInicio || '08:00',
                provaCompleta.horarioTermino || prova.horarioTermino || '09:30'
            );
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    criarModalEdicaoProvaSimples(provaId, prova, questoes, dataLimiteStr, horarioInicio, horarioTermino) {
        let modal = document.getElementById('modalEditarProvaSimples');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'modalEditarProvaSimples';
            document.body.appendChild(modal);
        }

        let questoesHTML = '';
        questoes.forEach((q, index) => {
            const opcoes = q.opcoes || ['', '', '', '', ''];
            const letras = ['A', 'B', 'C', 'D', 'E'];

            questoesHTML += `
                <div style="margin-bottom:30px;padding:20px;background:#f8fafc;
                    border-radius:12px;border-left:4px solid #f39c12;">
                    <h4 style="margin:0 0 15px;display:flex;align-items:center;gap:10px;">
                        <span style="background:#f39c12;color:white;width:30px;height:30px;
                            display:flex;align-items:center;justify-content:center;border-radius:50%;">
                            ${index + 1}
                        </span>
                        Questão ${index + 1}
                    </h4>
                    <div style="margin-bottom:15px;">
                        <label style="display:block;margin-bottom:5px;font-weight:600;">Pergunta</label>
                        <textarea id="edit-pergunta-${index}" rows="3"
                            style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;">${q.pergunta || ''}</textarea>
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="display:block;margin-bottom:5px;font-weight:600;">Opções</label>
                        ${opcoes.map((opcao, optIdx) => {
                            const letra = letras[optIdx];
                            const isCorreta = optIdx === q.respostaCorreta;
                            return `
                            <div style="display:flex;gap:10px;margin-bottom:8px;align-items:center;">
                                <span style="font-weight:600;min-width:30px;">${letra})</span>
                                <input type="text" id="edit-opcao-${index}-${optIdx}"
                                    value="${opcao.replace(/"/g, '&quot;')}"
                                    style="flex:1;padding:8px;border:2px solid #e5e7eb;border-radius:6px;">
                                <div style="display:flex;align-items:center;gap:5px;">
                                    <input type="radio" name="resposta-correta-${index}" value="${optIdx}"
                                        ${isCorreta ? 'checked' : ''}
                                        onchange="adminSimples.marcarRespostaCorreta(${index}, ${optIdx})">
                                    <span>Correta</span>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:5px;font-weight:600;">Explicação</label>
                        <textarea id="edit-explicacao-${index}" rows="2"
                            style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;">${q.explicacao || ''}</textarea>
                    </div>
                </div>`;
        });

        modal.innerHTML = `
            <div class="modal-content" style="max-width:900px;max-height:90vh;overflow-y:auto;">
                <div class="modal-header" style="background:linear-gradient(135deg,#f39c12,#e67e22);
                    color:white;padding:20px;">
                    <h3 style="margin:0;display:flex;align-items:center;gap:10px;">
                        <i class="fas fa-edit"></i> Editar Prova
                    </h3>
                    <button class="modal-close" onclick="fecharModalEditarSimples()"
                        style="color:white;background:none;border:none;font-size:28px;cursor:pointer;">&times;</button>
                </div>
                <div style="padding:25px;">
                    <div style="background:#f8fafc;padding:20px;border-radius:12px;margin-bottom:25px;">
                        <h4 style="margin:0 0 15px;">Informações Básicas</h4>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:15px;">
                            <div>
                                <label style="display:block;margin-bottom:5px;font-weight:600;">Título</label>
                                <input type="text" id="edit-titulo" value="${prova.titulo || ''}"
                                    style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;">
                            </div>
                            <div>
                                <label style="display:block;margin-bottom:5px;font-weight:600;">Conteúdo</label>
                                <input type="text" id="edit-conteudo" value="${prova.conteudo || ''}"
                                    style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;">
                            </div>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:15px;">
                            <div>
                                <label style="display:block;margin-bottom:5px;font-weight:600;">Data Limite</label>
                                <input type="date" id="edit-data-limite" value="${dataLimiteStr}"
                                    style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;">
                            </div>
                            <div>
                                <label style="display:block;margin-bottom:5px;font-weight:600;">Início</label>
                                <input type="time" id="edit-horario-inicio" value="${horarioInicio}"
                                    style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;">
                            </div>
                            <div>
                                <label style="display:block;margin-bottom:5px;font-weight:600;">Término</label>
                                <input type="time" id="edit-horario-termino" value="${horarioTermino}"
                                    style="width:100%;padding:10px;border:2px solid #e5e7eb;border-radius:8px;">
                            </div>
                        </div>
                        <div style="margin-top:15px;padding:10px;background:#f1f5f9;border-radius:8px;
                            font-weight:600;color:#f39c12;text-align:center;" id="duracao-calculada-edit">
                            Calculando...
                        </div>
                    </div>
                    <h4 style="margin:0 0 15px;">Questões (${questoes.length})</h4>
                    <div id="questoes-edit-container">${questoesHTML}</div>
                    <input type="hidden" id="questoes-count" value="${questoes.length}">
                    <div style="display:flex;gap:10px;margin-top:25px;">
                        <button onclick="adminSimples.salvarEdicaoProvaSimples('${provaId}')"
                            style="flex:1;padding:12px;background:#10b981;color:white;border:none;
                                   border-radius:8px;font-weight:600;cursor:pointer;">
                            <i class="fas fa-save"></i> Salvar Alterações
                        </button>
                        <button onclick="fecharModalEditarSimples()"
                            style="flex:1;padding:12px;background:#6b7280;color:white;border:none;
                                   border-radius:8px;font-weight:600;cursor:pointer;">
                            <i class="fas fa-times"></i> Cancelar
                        </button>
                    </div>
                </div>
            </div>`;

        modal.style.display = 'flex';
        this.calcularDuracaoEditavel();

        const inicioInput = document.getElementById('edit-horario-inicio');
        const terminoInput = document.getElementById('edit-horario-termino');
        if (inicioInput && terminoInput) {
            inicioInput.addEventListener('change', () => this.calcularDuracaoEditavel());
            terminoInput.addEventListener('change', () => this.calcularDuracaoEditavel());
        }
    }

    calcularDuracaoEditavel() {
        const inicio = document.getElementById('edit-horario-inicio')?.value;
        const termino = document.getElementById('edit-horario-termino')?.value;
        if (!inicio || !termino) return;

        const [h1, m1] = inicio.split(':').map(Number);
        const [h2, m2] = termino.split(':').map(Number);
        const totalMinutos = (h2 * 60 + m2) - (h1 * 60 + m1);

        const duracaoEl = document.getElementById('duracao-calculada-edit');
        if (!duracaoEl) return;

        if (totalMinutos <= 0) {
            duracaoEl.innerHTML = '<span style="color:#ef4444;">Horário inválido</span>';
            return;
        }

        const horas = Math.floor(totalMinutos / 60);
        const minutos = totalMinutos % 60;
        let duracaoTexto = '';
        if (horas > 0) duracaoTexto += `${horas} hora${horas > 1 ? 's' : ''}`;
        if (minutos > 0) {
            if (horas > 0) duracaoTexto += ' e ';
            duracaoTexto += `${minutos} minuto${minutos > 1 ? 's' : ''}`;
        }
        duracaoEl.innerHTML = `<strong>${duracaoTexto}</strong> (${totalMinutos} minutos)`;
    }

    marcarRespostaCorreta(questaoIndex, opcaoIndex) {
        console.log(`✅ Q${questaoIndex} - Correta: ${opcaoIndex}`);
    }

    async salvarEdicaoProvaSimples(provaId) {
        try {
            this.showToast('💾 Salvando...', 'info');
            const token = localStorage.getItem('auth_token');

            const dados = {
                titulo: document.getElementById('edit-titulo')?.value,
                conteudo: document.getElementById('edit-conteudo')?.value,
                dataLimite: document.getElementById('edit-data-limite')?.value,
                horarioInicio: document.getElementById('edit-horario-inicio')?.value,
                horarioTermino: document.getElementById('edit-horario-termino')?.value,
                questoes: []
            };

            const totalQuestoes = parseInt(document.getElementById('questoes-count')?.value || '0');
            for (let i = 0; i < totalQuestoes; i++) {
                const pergunta = document.getElementById(`edit-pergunta-${i}`)?.value;
                const explicacao = document.getElementById(`edit-explicacao-${i}`)?.value;
                const opcoes = [];
                let respostaCorreta = 0;

                const radios = document.getElementsByName(`resposta-correta-${i}`);
                for (let r of radios) {
                    if (r.checked) { respostaCorreta = parseInt(r.value); break; }
                }

                for (let j = 0; j < 5; j++) {
                    const opcao = document.getElementById(`edit-opcao-${i}-${j}`)?.value;
                    if (opcao) opcoes.push(opcao);
                }

                dados.questoes.push({ pergunta, opcoes, respostaCorreta, explicacao });
            }

            const response = await fetch(`/api/professor/provas/${provaId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dados)
            });

            const ct = response.headers.get('content-type');
            if (!ct || !ct.includes('application/json')) {
                const text = await response.text();
                console.error('❌ Resposta não-JSON:', text.substring(0, 200));
                throw new Error('Resposta do servidor inválida');
            }

            const data = await response.json();
            if (data.success) {
                this.showToast('✅ Prova atualizada!', 'success');
                fecharModalEditarSimples();
                setTimeout(() => this.carregarProvas(), 1500);
            } else {
                throw new Error(data.error || 'Erro ao salvar');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    async verDetalhesProva(id) {
        const prova = this.provas.find(p => (p.id || p._id) === id);
        if (!prova) return;

        try {
            this.showToast('📋 Carregando...', 'info');
            const response = await fetch(`/api/provas/${id}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });
            const data = await response.json();

            let html = `
                <div style="padding:20px;max-height:70vh;overflow-y:auto;">
                    <h3 style="margin:0 0 20px;color:#333;border-bottom:2px solid #3498db;padding-bottom:10px;">
                        <i class="fas fa-file-alt" style="color:#3498db;"></i> ${prova.titulo}
                    </h3>
                    <div style="background:#f8f9fa;border-radius:10px;padding:20px;margin-bottom:20px;">`;

            const p = (data.success && data.prova) ? data.prova : prova;
            html += `
                        <p><strong>Conteúdo:</strong> ${p.conteudo || 'Não especificado'}</p>
                        <p><strong>Professor:</strong> ${p.professor?.nome || p.professor || 'Não informado'}</p>
                        <p><strong>Turma:</strong> ${p.turma?.nome || p.turma || 'Não informada'}</p>
                        <p><strong>Data Limite:</strong> ${p.dataLimite ? new Date(p.dataLimite).toLocaleString('pt-BR') : 'Sem data'}</p>
                        <p><strong>Duração:</strong> ${p.duracaoMinutos ? p.duracaoMinutos + ' minutos' : 'Não definida'}</p>
                        <p><strong>Questões:</strong> ${p.quantidadeQuestoes || 0}</p>
                        <p><strong>Realizações:</strong> ${p.totalParticipantes || 0}</p>
                    </div>
                    <div style="display:flex;gap:10px;justify-content:center;margin-top:20px;">
                        <button class="btn-primary" onclick="adminSimples.visualizarQuestoes('${id}')">
                            <i class="fas fa-question-circle"></i> Ver Questões
                        </button>
                        <button class="btn-secondary" onclick="adminSimples.verResultadosProva('${id}')">
                            <i class="fas fa-chart-bar"></i> Resultados
                        </button>
                    </div>
                </div>`;

            this.abrirModal('📋 Detalhes da Prova', html, false);
        } catch (error) {
            console.error('Erro:', error);
            this.showToast('❌ Erro ao carregar', 'error');
        }
    }

    async visualizarQuestoes(id) {
        const prova = this.provas.find(p => (p.id || p._id) === id);
        if (!prova) return;

        try {
            this.showToast('📚 Carregando...', 'info');
            const response = await fetch(`/api/provas/${id}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });
            const data = await response.json();
            const questoes = (data.success && data.questoes) ? data.questoes : [];

            if (questoes.length === 0) {
                this.showToast('ℹ️ Nenhuma questão cadastrada', 'info');
                return;
            }

            const limparPrefixo = (texto, letra) => {
                if (!texto) return 'Opção não disponível';
                let t = String(texto).trim();
                const L = letra.toUpperCase();
                const padroes = [
                    new RegExp(`^\\(${L}\\)\\s*`, 'i'),
                    new RegExp(`^${L}\\)\\s*`, 'i'),
                    new RegExp(`^${L}\\.\\s*`, 'i'),
                    new RegExp(`^${L}\\s*-\\s*`, 'i'),
                    new RegExp(`^${L}:\\s*`, 'i'),
                    new RegExp(`^${L}\\s+`, 'i')
                ];
                for (const p of padroes) {
                    if (p.test(t)) { t = t.replace(p, '').trim(); break; }
                }
                return t || 'Opção não disponível';
            };

            let html = `
                <div style="padding:10px;max-height:70vh;overflow-y:auto;">
                    <h3 style="margin:0 0 20px;color:#333;border-bottom:2px solid #9b59b6;padding-bottom:10px;">
                        <i class="fas fa-question-circle" style="color:#9b59b6;"></i> Questões - ${prova.titulo}
                    </h3>`;

            questoes.forEach((q, index) => {
                const alternativas = q.opcoes || [];
                html += `
                    <div style="margin-bottom:25px;padding:15px;background:#f8f9fa;border-radius:8px;
                        border-left:4px solid #9b59b6;">
                        <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                            <strong>Questão ${index + 1}</strong>
                            <span style="background:#9b59b6;color:white;padding:2px 8px;
                                border-radius:12px;font-size:11px;">${q.dificuldade || 'Média'}</span>
                        </div>
                        <p style="margin-bottom:15px;line-height:1.5;">${q.pergunta || 'Pergunta não disponível'}</p>
                        <div style="background:white;border-radius:6px;padding:10px;">`;

                alternativas.forEach((opcao, idx) => {
                    const letra = String.fromCharCode(65 + idx);
                    const isCorreta = idx === q.respostaCorreta;
                    const textoLimpo = limparPrefixo(opcao, letra);
                    html += `
                        <div style="padding:8px;margin-bottom:5px;
                            background:${isCorreta ? '#d4edda' : '#f8f9fa'};border-radius:4px;
                            border-left:3px solid ${isCorreta ? '#28a745' : '#dee2e6'};">
                            <strong>${letra})</strong> ${textoLimpo}
                            ${isCorreta ? ' <span style="color:#28a745;font-size:11px;">✓ Correta</span>' : ''}
                        </div>`;
                });

                if (q.explicacao) {
                    html += `
                        <div style="margin-top:10px;padding:10px;background:#e7f3ff;border-radius:4px;
                            font-size:12px;color:#004085;">
                            <strong><i class="fas fa-info-circle"></i> Explicação:</strong> ${q.explicacao}
                        </div>`;
                }

                html += `</div></div>`;
            });
            html += `</div>`;

            this.abrirModal('📝 Questões', html, false);
        } catch (error) {
            console.error('Erro:', error);
            this.showToast('❌ Erro ao carregar questões', 'error');
        }
    }

    async verResultadosProva(id) {
        const prova = this.provas.find(p => (p.id || p._id) === id);
        if (!prova) return;

        try {
            this.showToast('📊 Carregando...', 'info');
            const response = await fetch(`/api/provas/${id}/resultados`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro');

            const resultados = data.resultados || [];
            if (resultados.length === 0) {
                this.showToast('ℹ️ Nenhum resultado ainda', 'info');
                return;
            }

            const notasValidas = resultados.filter(r => r.nota !== null && r.nota !== undefined);
            const soma = notasValidas.reduce((acc, r) => acc + (r.nota || 0), 0);
            const media = notasValidas.length > 0 ? (soma / notasValidas.length).toFixed(2) : '0.00';
            const aprovados = resultados.filter(r => r.nota && r.nota >= 7).length;
            const reprovados = resultados.filter(r => r.nota && r.nota < 7).length;
            const pendentes = resultados.filter(r => !r.nota && !r.cancelada).length;

            let html = `
                <div style="padding:10px;max-height:70vh;overflow-y:auto;">
                    <h3 style="margin:0 0 20px;border-bottom:2px solid #27ae60;padding-bottom:10px;">
                        <i class="fas fa-chart-bar" style="color:#27ae60;"></i> Resultados - ${prova.titulo}
                    </h3>
                    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px;">
                        <div style="background:#e9ecef;padding:15px;border-radius:8px;text-align:center;">
                            <div style="font-size:24px;font-weight:bold;color:#3498db;">${resultados.length}</div>
                            <div style="font-size:12px;color:#666;">Total</div>
                        </div>
                        <div style="background:#d4edda;padding:15px;border-radius:8px;text-align:center;">
                            <div style="font-size:24px;font-weight:bold;color:#28a745;">${aprovados}</div>
                            <div style="font-size:12px;color:#666;">Aprovados</div>
                        </div>
                        <div style="background:#f8d7da;padding:15px;border-radius:8px;text-align:center;">
                            <div style="font-size:24px;font-weight:bold;color:#dc3545;">${reprovados}</div>
                            <div style="font-size:12px;color:#666;">Reprovados</div>
                        </div>
                        <div style="background:#fff3cd;padding:15px;border-radius:8px;text-align:center;">
                            <div style="font-size:24px;font-weight:bold;color:#ffc107;">${pendentes}</div>
                            <div style="font-size:12px;color:#666;">Pendentes</div>
                        </div>
                    </div>
                    <div style="background:#e8f4fd;padding:15px;border-radius:8px;margin-bottom:20px;
                        text-align:center;">
                        <strong>Média geral: <span style="font-size:20px;color:#3498db;">${media}</span></strong>
                    </div>
                    <table style="width:100%;border-collapse:collapse;">
                        <thead style="background:#f8f9fa;">
                            <tr>
                                <th style="padding:10px;text-align:left;font-size:12px;">Aluno</th>
                                <th style="padding:10px;text-align:center;font-size:12px;">Nota</th>
                                <th style="padding:10px;text-align:center;font-size:12px;">Acertos</th>
                                <th style="padding:10px;text-align:center;font-size:12px;">Status</th>
                            </tr>
                        </thead>
                        <tbody>`;

            resultados.slice(0, 30).forEach(r => {
                let statusText = '', statusColor = '';
                if (r.cancelada) { statusText = 'Cancelada'; statusColor = '#dc3545'; }
                else if (r.nota && r.nota >= 7) { statusText = 'Aprovado'; statusColor = '#28a745'; }
                else if (r.nota) { statusText = 'Reprovado'; statusColor = '#dc3545'; }
                else { statusText = 'Pendente'; statusColor = '#ffc107'; }

                html += `
                    <tr style="border-bottom:1px solid #dee2e6;">
                        <td style="padding:10px;font-size:13px;">${r.alunoNome || 'N/A'}</td>
                        <td style="padding:10px;text-align:center;font-weight:bold;
                            color:${r.nota ? (r.nota >= 7 ? '#28a745' : '#dc3545') : '#666'};">
                            ${r.nota ? r.nota.toFixed(2) : '-'}
                        </td>
                        <td style="padding:10px;text-align:center;">${r.acertos || 0}/${r.total || 0}</td>
                        <td style="padding:10px;text-align:center;">
                            <span style="background:${statusColor};color:white;padding:3px 8px;
                                border-radius:12px;font-size:11px;">${statusText}</span>
                        </td>
                    </tr>`;
            });

            if (resultados.length > 30) {
                html += `<tr><td colspan="4" style="padding:15px;text-align:center;color:#666;">
                    ... e mais ${resultados.length - 30} resultados
                </td></tr>`;
            }
            html += `</tbody></table></div>`;

            this.abrirModal('📊 Resultados', html, false);
        } catch (error) {
            console.error('Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    async publicarProva(id) {
        const prova = this.provas.find(p => (p.id || p._id) === id);
        if (!prova) return;
        if (prova.publicada) { this.showToast('❌ Já está publicada', 'error'); return; }
        if (prova.cancelada) { this.showToast('❌ Prova cancelada', 'error'); return; }

        const confirmar = await this.confirmar(
            '📢 Publicar Prova',
            `Publicar a prova <strong>${prova.titulo}</strong>?<br><br>
            Após publicada, os alunos poderão vê-la e realizá-la.`
        );
        if (!confirmar) return;

        try {
            this.showToast('Publicando...', 'info');
            const token = localStorage.getItem('auth_token');

            const response = await fetch(`/api/professor/provas/${id}/publicar`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                this.showToast('✅ Prova publicada!', 'success');
                await this.carregarProvas();
            } else {
                throw new Error(data.error || 'Erro ao publicar');
            }
        } catch (error) {
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    async adiarProva(id) {
        const prova = this.provas.find(p => (p.id || p._id) === id);
        if (!prova) return;

        if (!prova.publicada) { this.showToast('❌ Apenas provas publicadas', 'error'); return; }
        if (prova.cancelada) { this.showToast('❌ Prova cancelada', 'error'); return; }

        const dataAtual = prova.dataLimite ? new Date(prova.dataLimite).toISOString().split('T')[0] : '';
        const hoje = new Date().toISOString().split('T')[0];

        const html = `
            <div style="padding:20px;">
                <p><strong>Prova:</strong> ${prova.titulo}</p>
                <p><strong>Data atual:</strong> ${prova.dataLimite ? new Date(prova.dataLimite).toLocaleDateString('pt-BR') : 'Não definida'}</p>
                <div style="margin-bottom:15px;">
                    <label style="display:block;margin-bottom:5px;font-weight:600;">Nova data limite</label>
                    <input type="date" id="novaDataLimite" value="${dataAtual}" min="${hoje}" required
                        style="width:100%;padding:8px;border:1px solid #ddd;border-radius:5px;">
                </div>
                <div style="margin-bottom:15px;">
                    <label style="display:block;margin-bottom:5px;font-weight:600;">Novo horário</label>
                    <input type="time" id="novoHorarioTermino" value="${prova.horarioTermino || '23:59'}"
                        style="width:100%;padding:8px;border:1px solid #ddd;border-radius:5px;">
                </div>
                <div style="margin-bottom:15px;">
                    <label style="display:block;margin-bottom:5px;font-weight:600;">Justificativa</label>
                    <input type="text" id="justificativaAdiamento" placeholder="Motivo..."
                        style="width:100%;padding:8px;border:1px solid #ddd;border-radius:5px;">
                </div>
                <div style="background:#e3f2fd;padding:12px;border-radius:5px;display:flex;gap:10px;">
                    <i class="fas fa-info-circle" style="color:#084298;"></i>
                    <span style="color:#084298;font-size:13px;">Os alunos serão notificados</span>
                </div>
            </div>`;

        this.abrirModal('📅 Adiar Prova', html, true, () => this.confirmarAdiamento(id));
    }

    async confirmarAdiamento(provaId) {
        const novaData = document.getElementById('novaDataLimite')?.value;
        const novoHorario = document.getElementById('novoHorarioTermino')?.value;
        const justificativa = document.getElementById('justificativaAdiamento')?.value;

        if (!novaData) { this.showToast('❌ Selecione uma data', 'error'); return; }

        try {
            this.showToast('📅 Adiando...', 'info');
            const token = localStorage.getItem('auth_token');

            const novaDataLimite = `${novaData}T${novoHorario || '23:59'}:00`;
            const dataFormatada = new Date(novaDataLimite).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });

            const response = await fetch(`/api/admin/provas/${provaId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    dataLimite: novaDataLimite,
                    horarioTermino: novoHorario,
                    justificativaAdiamento: justificativa
                })
            });
            const data = await response.json();

            if (data.success) {
                this.showToast('✅ Data atualizada!', 'success');
                this.fecharModal();
                await this.carregarProvas();
                setTimeout(() => this.showToast(`📅 Nova data: ${dataFormatada}`, 'info'), 1500);
            } else {
                throw new Error(data.error || 'Erro ao adiar');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    async excluirProva(id) {
        const prova = this.provas.find(p => (p.id || p._id) === id);
        if (!prova) { this.showToast('❌ Prova não encontrada', 'error'); return; }

        let msg = '', tipoAlerta = '';

        if (prova.publicada && (!prova.dataLimite || new Date(prova.dataLimite) > new Date())) {
            tipoAlerta = '⚠️ PROVA ATIVA';
            msg = `
                <strong>⚠️ ATENÇÃO: Esta prova está ATIVA!</strong><br><br>
                <strong>Prova:</strong> ${prova.titulo}<br><br>
                <span style="color:#e74c3c;">Excluir irá remover permanentemente e todos os resultados!</span><br><br>
                Deseja continuar?`;
        } else if (prova.cancelada) {
            tipoAlerta = '📋 PROVA CANCELADA';
            msg = `Excluir permanentemente a prova cancelada <strong>${prova.titulo}</strong>?`;
        } else if (!prova.publicada) {
            tipoAlerta = '📝 RASCUNHO';
            msg = `Excluir o rascunho <strong>${prova.titulo}</strong>?`;
        } else {
            tipoAlerta = '📄 PROVA EXPIRADA';
            msg = `Excluir a prova expirada <strong>${prova.titulo}</strong>?`;
        }

        if (prova.totalParticipantes > 0) {
            msg += `<br><br><span style="color:#e67e22;">⚠️ Esta prova tem <strong>${prova.totalParticipantes} aluno(s)</strong> que já realizaram!</span>`;
        }

        const confirmar = await this.confirmar(tipoAlerta, msg, 'Sim, excluir permanentemente', 'Cancelar');
        if (!confirmar) return;

        try {
            this.showToast('🗑️ Excluindo...', 'info');
            const response = await fetch(`/api/professor/provas/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                    'Content-Type': 'application/json'
                }
            });
            const data = await response.json();
            if (data.success) {
                this.showToast('✅ Prova excluída!', 'success');
                this.provas = this.provas.filter(p => (p.id || p._id) !== id);
                const tabela = document.getElementById('tabelaProvas');
                if (tabela) tabela.innerHTML = this.gerarLinhasProvas(this.provas);
                this.atualizarContadoresProvas();
            } else {
                throw new Error(data.error || 'Erro ao excluir');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    atualizarContadoresProvas() {
        const totalEl = document.getElementById('totalProvasCount');
        const ativasEl = document.getElementById('ativasCount');
        const rascunhosEl = document.getElementById('rascunhosCount');

        if (totalEl) totalEl.textContent = this.provas.length;
        if (ativasEl) {
            ativasEl.textContent = this.provas.filter(p =>
                p.publicada && !p.cancelada && (!p.dataLimite || new Date(p.dataLimite) > new Date())
            ).length;
        }
        if (rascunhosEl) {
            rascunhosEl.textContent = this.provas.filter(p => !p.publicada && !p.cancelada).length;
        }
    }

    // ============================================================================
    // IMPRESSÃO DE PROVAS
    // ============================================================================
    async baixarImprimirProva(provaId) {
        console.log('🖨️ Preparando impressão:', provaId);

        try {
            const token = localStorage.getItem('auth_token');
            this.closeAllModals();

            const IS_LOCALHOST = window.location.hostname === 'localhost' ||
                                window.location.hostname === '127.0.0.1';
            const API_BASE_URL = IS_LOCALHOST ? 'http://localhost:3000/api' : '/api';

            this.showToast('📄 Preparando prova...', 'info');

            const response = await fetch(`${API_BASE_URL}/provas/${provaId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Erro ao carregar prova');

            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro');

            const prova = data.prova;
            const questoes = data.questoes || [];

            // QR Code (com fallback)
            let qrCodeDataUrl = '';
            try {
                const correcaoUrl = `${window.location.origin}/corrigir-prova.html?prova=${provaId}`;
                const qrResponse = await fetch(`${API_BASE_URL}/qrcode/gerar`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ url: correcaoUrl })
                });

                const ct = qrResponse.headers.get('content-type');
                if (qrResponse.ok && ct && ct.includes('application/json')) {
                    const qrData = await qrResponse.json();
                    if (qrData.success && qrData.qrCode) qrCodeDataUrl = qrData.qrCode;
                }
            } catch (qrError) {
                console.warn('⚠️ QR Code não gerado:', qrError.message);
            }

            window.provaParaImpressao = { prova, questoes, qrCodeDataUrl, API_BASE_URL, token };
            await this.carregarAlunosParaImpressao();
            this.mostrarModalPerguntaAdaptacao();
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast(`❌ Erro: ${error.message}`, 'error');
        }
    }

    async carregarAlunosParaImpressao() {
        try {
            const { prova } = window.provaParaImpressao || {};
            if (!prova) { window.alunosDaTurma = []; return; }

            const turmaId = prova.turmaId || prova.turma?.id || prova.turma;
            if (!turmaId) { window.alunosDaTurma = []; return; }

            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/turmas/${turmaId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) throw new Error(`Erro ${response.status}`);

            const data = await response.json();
            let alunosRaw = [];
            if (data.success && data.turma && data.turma.alunos) alunosRaw = data.turma.alunos;
            else if (data.turma && data.turma.alunos) alunosRaw = data.turma.alunos;
            else if (data.alunos) alunosRaw = data.alunos;

            const alunosUnicos = new Map();
            for (const aluno of alunosRaw) {
                const alunoId = aluno._id || aluno.id || aluno.alunoId;
                if (alunoId && !alunosUnicos.has(alunoId.toString())) {
                    alunosUnicos.set(alunoId.toString(), {
                        id: alunoId,
                        nome: aluno.nome || aluno.alunoNome || 'Aluno',
                        email: aluno.email || aluno.alunoEmail || '',
                        matricula: aluno.matricula || ''
                    });
                }
            }
            window.alunosDaTurma = Array.from(alunosUnicos.values());
        } catch (error) {
            console.error('❌ Erro ao carregar alunos:', error);
            window.alunosDaTurma = [];
        }
    }

    mostrarModalPerguntaAdaptacao() {
        if (!window.provaParaImpressao || !window.provaParaImpressao.prova) {
            this.showToast('❌ Dados não encontrados', 'error');
            return;
        }

        this.closeAllModals();

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'modalPerguntaAdaptacao';
        modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
            background:rgba(0,0,0,0.5);z-index:10001;display:flex;align-items:center;justify-content:center;`;

        const alunos = window.alunosDaTurma || [];
        const temAlunos = alunos.length > 0;

        let selectOptions = '<option value="">Selecione um aluno...</option>';
        if (temAlunos) {
            selectOptions += alunos.map(a => `
                <option value="${a.id}">${a.nome} ${a.matricula ? `(${a.matricula})` : ''}</option>
            `).join('');
        } else {
            selectOptions = '<option value="" disabled>Nenhum aluno encontrado</option>';
        }

        modal.innerHTML = `
            <div style="max-width:500px;width:90%;background:white;border-radius:24px;
                padding:0;box-shadow:0 20px 40px rgba(0,0,0,0.2);">
                <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white;
                    padding:20px 25px;border-radius:24px 24px 0 0;display:flex;
                    justify-content:space-between;align-items:center;">
                    <h3 style="margin:0;display:flex;align-items:center;gap:10px;">
                        <i class="fas fa-print"></i> Imprimir Prova
                    </h3>
                    <button onclick="adminSimples.fecharModalImpressao()"
                        style="background:none;border:none;color:white;font-size:28px;cursor:pointer;">&times;</button>
                </div>
                <div style="padding:25px;">
                    <p style="color:#4b5563;margin-bottom:20px;text-align:center;font-size:1rem;">
                        Deseja adaptar esta prova para acessibilidade?
                    </p>
                    <div style="margin-bottom:20px;padding:15px;background:#f8fafc;border-radius:16px;">
                        <label style="display:flex;align-items:center;gap:12px;cursor:pointer;margin-bottom:12px;">
                            <input type="radio" name="tipoImpressao" value="individual"
                                ${temAlunos ? 'checked' : 'disabled'}
                                onchange="adminSimples.toggleOpcaoAlunos()">
                            <span><strong>👤 Imprimir para um aluno específico</strong></span>
                        </label>
                        <label style="display:flex;align-items:center;gap:12px;cursor:pointer;">
                            <input type="radio" name="tipoImpressao" value="todos"
                                ${temAlunos ? '' : 'checked disabled'}
                                onchange="adminSimples.toggleOpcaoAlunos()">
                            <span><strong>👥 Imprimir para todos os alunos</strong></span>
                        </label>
                        <div id="selectAlunosContainer" style="margin-top:15px;${temAlunos ? 'display:block;' : 'display:none;'}">
                            <label style="display:block;margin-bottom:8px;font-weight:500;">
                                <i class="fas fa-user-graduate"></i> Selecione o aluno:
                            </label>
                            <select id="selectAlunoImpressao"
                                style="width:100%;padding:10px;border-radius:8px;border:1px solid #ddd;">
                                ${selectOptions}
                            </select>
                        </div>
                        <div style="margin-top:12px;padding:10px;background:#e0f2fe;
                            border-radius:8px;font-size:0.85rem;">
                            <i class="fas fa-info-circle"></i>
                            <span id="infoImpressao">
                                ${temAlunos ? 'Selecione um aluno ou imprima para todos.' : 'Nenhum aluno encontrado.'}
                            </span>
                        </div>
                    </div>
                    <div style="display:flex;gap:15px;">
                        <button onclick="adminSimples.gerarImpressaoNormal()"
                            style="flex:1;padding:14px;background:#6b7280;color:white;border:none;
                                   border-radius:12px;font-weight:600;cursor:pointer;">
                            <i class="fas fa-times"></i> Não, imprimir normal
                        </button>
                        <button onclick="adminSimples.mostrarModalOpcoesAdaptacao()"
                            style="flex:1;padding:14px;background:linear-gradient(135deg,#10b981,#059669);
                                   color:white;border:none;border-radius:12px;font-weight:600;cursor:pointer;">
                            <i class="fas fa-universal-access"></i> Sim, adaptar
                        </button>
                    </div>
                </div>
            </div>`;

        document.body.appendChild(modal);
    }

    toggleOpcaoAlunos() {
        const tipo = document.querySelector('input[name="tipoImpressao"]:checked')?.value;
        const selectContainer = document.getElementById('selectAlunosContainer');
        const infoSpan = document.getElementById('infoImpressao');

        if (tipo === 'individual') {
            if (selectContainer) selectContainer.style.display = 'block';
            if (infoSpan) infoSpan.innerHTML = 'Será gerada uma prova com QR Code específico para o aluno.';
        } else {
            if (selectContainer) selectContainer.style.display = 'none';
            if (infoSpan) infoSpan.innerHTML = 'Será gerado um documento único com todos os alunos.';
        }
    }

    mostrarModalOpcoesAdaptacao() {
        if (!window.provaParaImpressao || !window.provaParaImpressao.prova) {
            this.showToast('❌ Dados não encontrados', 'error');
            return;
        }

        const modalPergunta = document.getElementById('modalPerguntaAdaptacao');
        if (modalPergunta) modalPergunta.style.display = 'none';

        const existing = document.getElementById('modalOpcoesAdaptacao');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'modalOpcoesAdaptacao';
        modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
            background:rgba(0,0,0,0.5);z-index:10002;display:flex;align-items:center;justify-content:center;`;

        const { prova } = window.provaParaImpressao;
        const isAdaptada = prova?.tipoProva === 'adaptada' || prova?.adaptada === true;

        modal.innerHTML = `
            <div style="max-width:580px;width:90%;background:white;border-radius:24px;
                max-height:90vh;overflow-y:auto;">
                <div style="background:linear-gradient(135deg,#10b981,#059669);color:white;
                    padding:20px 25px;border-radius:24px 24px 0 0;display:flex;
                    justify-content:space-between;position:sticky;top:0;z-index:10;">
                    <h3 style="margin:0;"><i class="fas fa-universal-access"></i> Opções de Adaptação</h3>
                    <button onclick="adminSimples.fecharModalOpcoesAdaptacao()"
                        style="background:none;border:none;color:white;font-size:28px;cursor:pointer;">&times;</button>
                </div>
                <div style="padding:25px;">
                    ${isAdaptada ? `<div style="background:#dbeafe;padding:10px;margin-bottom:15px;border-radius:8px;">
                        <i class="fas fa-info-circle"></i> Prova adaptada - 3 alternativas
                    </div>` : ''}

                    <div style="display:flex;flex-direction:column;gap:15px;">
                        <div style="background:#f8fafc;padding:15px;border-radius:16px;border:2px solid #e5e7eb;">
                            <label style="display:flex;align-items:center;gap:12px;cursor:pointer;margin-bottom:10px;">
                                <input type="checkbox" id="optFonteDinamica" style="width:20px;height:20px;">
                                <div>
                                    <strong>🔍 Fonte Dinâmica</strong>
                                    <p style="margin:5px 0 0;font-size:0.85rem;color:#6b7280;">
                                        Amplie o tamanho da fonte
                                    </p>
                                </div>
                            </label>
                            <div id="sliderContainer" style="display:none;margin-top:15px;padding-top:10px;
                                border-top:1px solid #e5e7eb;">
                                <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                                    <span style="font-size:12px;">Normal (12pt)</span>
                                    <span style="font-size:12px;font-weight:bold;" id="tamanhoFonteAtual">12pt</span>
                                    <span style="font-size:12px;">Máximo (48pt)</span>
                                </div>
                                <input type="range" id="fonteSlider" min="12" max="48" step="1" value="12"
                                    style="width:100%;margin:10px 0;">
                                <div style="display:flex;justify-content:space-between;gap:10px;margin-top:10px;">
                                    <button type="button" onclick="adminSimples.ajustarFonte(12)"
                                        style="flex:1;padding:6px;background:#e5e7eb;border:none;border-radius:6px;cursor:pointer;font-size:12px;">Normal</button>
                                    <button type="button" onclick="adminSimples.ajustarFonte(18)"
                                        style="flex:1;padding:6px;background:#e5e7eb;border:none;border-radius:6px;cursor:pointer;font-size:12px;">Médio</button>
                                    <button type="button" onclick="adminSimples.ajustarFonte(24)"
                                        style="flex:1;padding:6px;background:#e5e7eb;border:none;border-radius:6px;cursor:pointer;font-size:12px;">Grande</button>
                                    <button type="button" onclick="adminSimples.ajustarFonte(36)"
                                        style="flex:1;padding:6px;background:#e5e7eb;border:none;border-radius:6px;cursor:pointer;font-size:12px;">M.Grande</button>
                                    <button type="button" onclick="adminSimples.ajustarFonte(48)"
                                        style="flex:1;padding:6px;background:#e5e7eb;border:none;border-radius:6px;cursor:pointer;font-size:12px;">Máximo</button>
                                </div>
                                <div style="margin-top:10px;padding:8px;background:#f1f5f9;border-radius:8px;
                                    text-align:center;font-size:12px;color:#475569;">
                                    <i class="fas fa-mouse-pointer"></i> <strong>Pré-visualização:</strong>
                                    <span id="previewFonte" style="font-size:12px;margin-left:8px;">Texto exemplo</span>
                                </div>
                            </div>
                        </div>

                        <div style="background:#f8fafc;padding:15px;border-radius:16px;border:2px solid #e5e7eb;">
                            <label style="display:flex;align-items:center;gap:12px;cursor:pointer;">
                                <input type="checkbox" id="optCaixaAlta" style="width:20px;height:20px;">
                                <div>
                                    <strong>🔠 CAIXA ALTA</strong>
                                    <p style="margin:5px 0 0;font-size:0.85rem;color:#6b7280;">Converte para maiúsculas</p>
                                </div>
                            </label>
                        </div>

                        <div style="background:#f8fafc;padding:15px;border-radius:16px;border:2px solid #e5e7eb;">
                            <label style="display:flex;align-items:center;gap:12px;cursor:pointer;">
                                <input type="checkbox" id="optNegrito" style="width:20px;height:20px;">
                                <div>
                                    <strong>🔤 Negrito</strong>
                                    <p style="margin:5px 0 0;font-size:0.85rem;color:#6b7280;">Texto em negrito</p>
                                </div>
                            </label>
                        </div>

                        <div style="background:#f8fafc;padding:15px;border-radius:16px;border:2px solid #e5e7eb;">
                            <label style="display:flex;align-items:center;gap:12px;cursor:pointer;">
                                <input type="checkbox" id="optAltoContraste" style="width:20px;height:20px;">
                                <div>
                                    <strong>🎨 Alto Contraste</strong>
                                    <p style="margin:5px 0 0;font-size:0.85rem;color:#6b7280;">Fundo escuro, texto claro</p>
                                </div>
                            </label>
                        </div>

                        <div style="background:#f8fafc;padding:15px;border-radius:16px;border:2px solid #e5e7eb;">
                            <label style="display:flex;align-items:center;gap:12px;cursor:pointer;">
                                <input type="checkbox" id="optLayoutSimplificado" style="width:20px;height:20px;">
                                <div>
                                    <strong>📄 Layout Simplificado</strong>
                                    <p style="margin:5px 0 0;font-size:0.85rem;color:#6b7280;">Remover decorações</p>
                                </div>
                            </label>
                        </div>
                    </div>

                    <div style="margin-top:20px;padding:12px;background:#fef3c7;border-radius:12px;">
                        <p style="margin:0;font-size:0.85rem;">
                            <i class="fas fa-lightbulb"></i> Combine várias opções conforme a necessidade.
                        </p>
                    </div>

                    <div style="display:flex;gap:12px;margin-top:25px;">
                        <button type="button" onclick="adminSimples.gerarImpressaoComOpcoes()"
                            style="flex:1;padding:14px;background:linear-gradient(135deg,#10b981,#059669);
                                   color:white;border:none;border-radius:12px;font-weight:600;cursor:pointer;">
                            Imprimir com Adaptações
                        </button>
                        <button type="button" onclick="adminSimples.fecharModalOpcoesAdaptacao()"
                            style="flex:1;padding:14px;background:#6b7280;color:white;border:none;
                                   border-radius:12px;font-weight:600;cursor:pointer;">Cancelar</button>
                    </div>
                </div>
            </div>`;

        document.body.appendChild(modal);

        const fonteDinamicaCheckbox = document.getElementById('optFonteDinamica');
        const sliderContainer = document.getElementById('sliderContainer');
        const fonteSlider = document.getElementById('fonteSlider');
        const tamanhoAtual = document.getElementById('tamanhoFonteAtual');
        const previewFonte = document.getElementById('previewFonte');

        if (fonteDinamicaCheckbox) {
            fonteDinamicaCheckbox.addEventListener('change', function () {
                sliderContainer.style.display = this.checked ? 'block' : 'none';
            });
        }

        if (fonteSlider) {
            fonteSlider.addEventListener('input', function () {
                tamanhoAtual.textContent = this.value + 'pt';
                previewFonte.style.fontSize = this.value + 'pt';
                previewFonte.style.fontWeight = 'bold';
            });
            fonteSlider.dispatchEvent(new Event('input'));
        }
    }

    ajustarFonte(tamanho) {
        const slider = document.getElementById('fonteSlider');
        const tamanhoAtual = document.getElementById('tamanhoFonteAtual');
        const previewFonte = document.getElementById('previewFonte');
        const checkbox = document.getElementById('optFonteDinamica');
        const sliderContainer = document.getElementById('sliderContainer');

        if (slider) {
            slider.value = tamanho;
            tamanhoAtual.textContent = tamanho + 'pt';
            previewFonte.style.fontSize = tamanho + 'pt';
            if (checkbox && !checkbox.checked) {
                checkbox.checked = true;
                if (sliderContainer) sliderContainer.style.display = 'block';
            }
        }
    }

    async gerarImpressaoNormal() {
        console.log('🖨️ Impressão normal...');
        const { prova, questoes, qrCodeDataUrl } = window.provaParaImpressao || {};
        if (!prova) { this.showToast('❌ Dados não encontrados', 'error'); return; }

        const tipoImpressao = document.querySelector('input[name="tipoImpressao"]:checked')?.value;
        const selectAluno = document.getElementById('selectAlunoImpressao');
        const alunoId = selectAluno?.value;
        const alunoNome = selectAluno?.options[selectAluno.selectedIndex]?.text.split('(')[0].trim();

        this.fecharModalImpressao();

        if (tipoImpressao === 'todos') {
            const alunos = window.alunosDaTurma || [];
            if (alunos.length === 0) { this.showToast('⚠️ Nenhum aluno', 'info'); return; }
            await this.gerarImpressaoTodosAlunos(prova, questoes, qrCodeDataUrl, {}, alunos);
            return;
        }

        if (!alunoId) {
            this.showToast('⚠️ Selecione um aluno', 'info');
            this.mostrarModalPerguntaAdaptacao();
            return;
        }

        let qrCodeAlunoUrl = null;
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/aluno/qrcode/${alunoId}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.success && data.qrCode) {
                qrCodeAlunoUrl = data.qrCode;
                window.alunoSelecionadoNome = alunoNome;
            }
        } catch (error) {
            console.error('❌ Erro QR Code aluno:', error);
        }

        await this.gerarHTMLImpressao(prova, questoes, qrCodeDataUrl, {}, qrCodeAlunoUrl, alunoNome);
    }

    async gerarImpressaoComOpcoes() {
        console.log('🎨 Impressão com adaptações...');
        const { prova, questoes, qrCodeDataUrl } = window.provaParaImpressao || {};
        if (!prova) { this.showToast('❌ Dados não encontrados', 'error'); return; }

        const fonteDinamica = document.getElementById('optFonteDinamica')?.checked || false;
        const tamanhoFonte = fonteDinamica ? (document.getElementById('fonteSlider')?.value || 12) : 12;

        const opcoes = {
            fonteAmpliada: fonteDinamica ? tamanhoFonte : false,
            fontePersonalizada: fonteDinamica ? tamanhoFonte : false,
            negrito: document.getElementById('optNegrito')?.checked || false,
            altoContraste: document.getElementById('optAltoContraste')?.checked || false,
            layoutSimplificado: document.getElementById('optLayoutSimplificado')?.checked || false,
            tamanhoFonte: parseInt(tamanhoFonte),
            caixaAlta: document.getElementById('optCaixaAlta')?.checked || false
        };

        const nenhuma = !opcoes.fonteAmpliada && !opcoes.negrito && !opcoes.altoContraste &&
                        !opcoes.layoutSimplificado && !opcoes.caixaAlta;

        if (nenhuma) {
            const confirmar = await this.confirmar(
                '📄 Nenhuma Adaptação',
                'Nenhuma opção foi selecionada. Imprimir normalmente?',
                'Sim, imprimir normal', 'Cancelar'
            );
            if (confirmar) {
                this.fecharModalOpcoesAdaptacao();
                await this.gerarImpressaoNormal();
            }
            return;
        }

        const tipoImpressao = document.querySelector('input[name="tipoImpressao"]:checked')?.value;
        const selectAluno = document.getElementById('selectAlunoImpressao');
        const alunoId = selectAluno?.value;
        const alunoNome = selectAluno?.options[selectAluno.selectedIndex]?.text.split('(')[0].trim();

        this.fecharModalOpcoesAdaptacao();
        this.fecharModalImpressao();

        if (tipoImpressao === 'todos') {
            const alunos = window.alunosDaTurma || [];
            if (alunos.length === 0) { this.showToast('⚠️ Nenhum aluno', 'info'); return; }
            await this.gerarImpressaoTodosAlunos(prova, questoes, qrCodeDataUrl, opcoes, alunos);
            return;
        }

        if (!alunoId) {
            this.showToast('⚠️ Selecione um aluno', 'info');
            this.mostrarModalPerguntaAdaptacao();
            return;
        }

        let qrCodeAlunoUrl = null;
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/aluno/qrcode/${alunoId}`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.success && data.qrCode) {
                qrCodeAlunoUrl = data.qrCode;
                window.alunoSelecionadoNome = alunoNome;
            }
        } catch (error) {
            console.error('❌ Erro:', error);
        }

        await this.gerarHTMLImpressao(prova, questoes, qrCodeDataUrl, opcoes, qrCodeAlunoUrl, alunoNome);
    }

    async gerarImpressaoTodosAlunos(prova, questoes, qrCodeDataUrl, opcoesAdaptacao, alunos) {
        this.showToast(`🖨️ Gerando para ${alunos.length} aluno(s)...`, 'info');

        try {
            const token = localStorage.getItem('auth_token');
            this.showToast(`📱 Buscando QR Codes...`, 'info');

            const alunosComQRCode = await Promise.all(alunos.map(async (aluno) => {
                const alunoId = aluno.id || aluno._id;
                const alunoNome = aluno.nome || aluno.alunoNome || 'Aluno';
                let qrCodeAlunoUrl = '';

                try {
                    const response = await fetch(`/api/aluno/qrcode/${alunoId}`, {
                        method: 'GET',
                        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
                    });
                    const data = await response.json();
                    if (data.success && data.qrCode) qrCodeAlunoUrl = data.qrCode;
                } catch (e) { console.error(e); }

                return { ...aluno, qrCodeDataUrl: qrCodeAlunoUrl, id: alunoId, nome: alunoNome };
            }));

            let htmlCompleto = '';
            for (let i = 0; i < alunosComQRCode.length; i++) {
                const aluno = alunosComQRCode[i];
                window.alunoSelecionadoNome = aluno.nome;
                const htmlAluno = this.gerarHTMLProvaCompleta(
                    prova, questoes, qrCodeDataUrl, opcoesAdaptacao,
                    aluno.qrCodeDataUrl, aluno.nome
                );
                htmlCompleto += htmlAluno;
                if (i < alunosComQRCode.length - 1) {
                    htmlCompleto += `<div style="page-break-before:always;break-before:page;"></div>`;
                }
            }

            const printWindow = window.open('', '_blank');
            printWindow.document.write(htmlCompleto);
            printWindow.document.close();
            printWindow.onload = function () {
                setTimeout(() => {
                    printWindow.print();
                    printWindow.onafterprint = () => printWindow.close();
                }, 500);
            };

            this.showToast(`✅ Impressão preparada!`, 'success');
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast(`❌ ${error.message}`, 'error');
        }
    }

    gerarHTMLProvaCompleta(prova, questoes, qrCodeDataUrl, opcoesAdaptacao = {}, qrCodeAlunoUrl = null, alunoNome = null) {
        const provaTitulo = prova.titulo || 'Prova sem título';
        const logoIema = '/uploads/logo-iema.png';
        const dataAtual = new Date();
        const dataFormatada = dataAtual.toLocaleDateString('pt-BR');

        const totalQuestoes = questoes.length;
        const turmaNome = prova.turma?.nome || 'Turma não especificada';
        const disciplina = prova.turma?.disciplina || 'Disciplina não especificada';
        const professorNome = prova.professor?.nome || 'Professor';
        const periodo = prova.periodo ? `${prova.periodo}º Período` : '1º Período';

        const isAdaptada = prova.tipoProva === 'adaptada' || prova.adaptada === true;
        const letrasUsadas = isAdaptada ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D', 'E'];

        const limparPrefixoOpcao = (texto, letra) => {
            if (!texto) return 'Opção não disponível';
            let t = String(texto).trim();
            const L = letra.toUpperCase();
            const padroes = [
                new RegExp(`^\\(${L}\\)\\s*`, 'i'),
                new RegExp(`^${L}\\)\\s*`, 'i'),
                new RegExp(`^${L}\\.\\s*`, 'i'),
                new RegExp(`^${L}\\s*-\\s*`, 'i'),
                new RegExp(`^${L}:\\s*`, 'i'),
                new RegExp(`^${L}\\s+`, 'i')
            ];
            for (const p of padroes) {
                if (p.test(t)) { t = t.replace(p, '').trim(); break; }
            }
            return t || 'Opção não disponível';
        };

        let adaptacoesTexto = '';
        const temAdaptacoes = opcoesAdaptacao.fonteAmpliada || opcoesAdaptacao.negrito ||
                            opcoesAdaptacao.altoContraste || opcoesAdaptacao.layoutSimplificado;

        if (temAdaptacoes) {
            const adaptacoesSelecionadas = [];
            if (opcoesAdaptacao.fonteAmpliada) adaptacoesSelecionadas.push('Fonte Ampliada');
            if (opcoesAdaptacao.negrito) adaptacoesSelecionadas.push('Texto em Negrito');
            if (opcoesAdaptacao.altoContraste) adaptacoesSelecionadas.push('Alto Contraste');
            if (opcoesAdaptacao.layoutSimplificado) adaptacoesSelecionadas.push('Layout Simplificado');

            adaptacoesTexto = `
                <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:8px 12px;
                    margin:10px 0;border-radius:8px;">
                    <p style="margin:0;font-size:0.85rem;color:#92400e;">
                        <i class="fas fa-universal-access"></i> <strong>Prova Adaptada</strong> -
                        ${adaptacoesSelecionadas.join(', ')}
                    </p>
                </div>`;
        }

        let questoesHTML = '';
        questoes.forEach((questao, index) => {
            const opcoes = questao.opcoes || [];
            const opcoesFormatadas = opcoes.map((opcao, optIndex) => {
                const letra = letrasUsadas[optIndex];
                return { letra, texto: limparPrefixoOpcao(opcao, letra) };
            });

            questoesHTML += `
                <div class="questao-print">
                    <div class="questao-numero">
                        Questão ${index + 1} ${isAdaptada ? '(Adaptada - 3 alternativas)' : ''}
                    </div>
                    <div class="questao-texto">
                        <strong>${questao.pergunta || 'Pergunta não disponível'}</strong>
                    </div>
                    <div class="opcoes-print">
                        ${opcoesFormatadas.map(op => `
                            <div class="opcao-linha">
                                <span class="opcao-letra">${op.letra})</span>
                                <span class="opcao-texto">${op.texto}</span>
                            </div>`).join('')}
                    </div>
                    <div class="rascunho-area">
                        <small>Espaço para rascunho</small>
                        <div class="rascunho-linhas"></div>
                    </div>
                </div>`;
        });

        const gerarCartaoResposta = () => {
            const qrCodeArea = qrCodeDataUrl ? `
                <div style="text-align:center;margin-top:10px;padding:8px;background:#f9f9f9;
                    border:1px solid #ddd;border-radius:8px;display:inline-block;">
                    <img src="${qrCodeDataUrl}" style="width:85px;height:auto;border:1px solid #ccc;
                        border-radius:8px;" alt="QR Code">
                    <div style="font-size:9px;color:#666;text-align:center;margin-top:5px;">
                        <strong>📱 Correção Automática</strong>
                    </div>
                </div>` : '';

            const qrCodeAlunoArea = qrCodeAlunoUrl ? `
                <div style="text-align:center;margin-top:10px;padding:8px;background:#f9f9f9;
                    border:1px solid #ddd;border-radius:8px;display:inline-block;">
                    <img src="${qrCodeAlunoUrl}" style="width:85px;height:auto;border:1px solid #ccc;
                        border-radius:8px;" alt="QR Code do Aluno">
                    <div style="font-size:9px;color:#666;text-align:center;margin-top:5px;">
                        <strong>👤 ${alunoNome || 'Aluno'}</strong>
                    </div>
                </div>` : '';

            return `
                <div style="text-align:center;">
                    <h4 style="margin:0 0 5px;font-size:11pt;font-weight:bold;text-align:center;">
                        📝 CARTÃO-RESPOSTA
                    </h4>
                    <div style="font-size:8pt;color:#333;text-align:center;padding:8px;
                        background:#fef3c7;border-radius:6px;margin-bottom:8px;">
                        <p style="margin:0;"><strong>INSTRUÇÕES</strong></p>
                        <p style="margin:5px 0 0;">Use caneta azul ou preta. Será anulada a questão com rasura ou múltiplas marcações.</p>
                    </div>
                    <div style="position:relative;margin:8px auto;border:2px solid #000;padding:15px 12px;
                        background:#fff;display:inline-block;width:85%;max-width:650px;">
                        <div style="position:absolute;top:5px;left:5px;width:25px;height:25px;
                            background:#000;border:1px solid #000;"></div>
                        <div style="position:absolute;top:5px;right:5px;width:25px;height:25px;
                            background:#000;border:1px solid #000;"></div>
                        <div style="position:absolute;bottom:5px;left:5px;width:25px;height:25px;
                            background:#000;border:1px solid #000;"></div>
                        <div style="position:absolute;bottom:5px;right:5px;width:25px;height:25px;
                            background:#000;border:1px solid #000;"></div>
                        <table style="width:100%;border-collapse:collapse;border:1px solid #000;">
                            <thead>
                                <tr style="background:#e8e8e8;">
                                    <th style="border:1px solid #000;padding:6px 3px;text-align:center;
                                        font-size:8pt;width:35px;">Q</th>
                                    ${letrasUsadas.map(l => `
                                        <th style="border:1px solid #000;padding:6px 3px;text-align:center;
                                            font-size:8pt;width:35px;">${l}</th>`).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${Array.from({ length: totalQuestoes }, (_, i) => `
                                    <tr>
                                        <td style="border:1px solid #000;padding:5px 3px;text-align:center;
                                            font-weight:bold;font-size:8pt;">${i + 1}</td>
                                        ${letrasUsadas.map(() => `
                                            <td style="border:1px solid #000;padding:5px 3px;text-align:center;">
                                                <div style="width:12px;height:12px;border:1.5px solid #000;
                                                    border-radius:50%;margin:0 auto;"></div>
                                            </td>`).join('')}
                                    </tr>`).join('')}
                            </tbody>
                        </table>
                    </div>
                    <div style="display:flex;justify-content:center;gap:40px;margin-top:15px;flex-wrap:wrap;">
                        ${qrCodeArea}${qrCodeAlunoArea}
                    </div>
                </div>`;
        };

        let cssAdaptacoes = '';
        if (opcoesAdaptacao.caixaAlta) {
            cssAdaptacoes += `body, .questao-texto, .opcao-linha, .instrucoes-cartao {
                text-transform:uppercase !important;}`;
        }
        if (opcoesAdaptacao.fontePersonalizada && opcoesAdaptacao.tamanhoFonte) {
            const t = opcoesAdaptacao.tamanhoFonte;
            cssAdaptacoes += `
                body { font-size:${t}pt !important; }
                .questao-texto { font-size:${t}pt !important; }
                .opcao-linha { font-size:${t - 2}pt !important; }
                .questao-numero { font-size:${t - 2}pt !important; }
                .print-header h1 { font-size:${t + 4}pt !important; }`;
        } else if (opcoesAdaptacao.fonteAmpliada) {
            cssAdaptacoes += `
                body { font-size:16pt !important; }
                .questao-texto { font-size:16pt !important; }
                .opcao-linha { font-size:14pt !important; }`;
        }
        if (opcoesAdaptacao.negrito) {
            cssAdaptacoes += `body, .questao-texto, .opcao-linha {font-weight:bold !important;}`;
        }
        if (opcoesAdaptacao.altoContraste) {
            cssAdaptacoes += `
                body { background:#000 !important; color:#fff !important; }
                .print-header, .campos-box, .instrucoes-box, .print-prova-info,
                .cartao-resposta, .questao-print, .rascunho-area {
                    background:#000 !important; color:#fff !important; border-color:#fff !important;
                }`;
        }
        if (opcoesAdaptacao.layoutSimplificado) {
            cssAdaptacoes += `.print-logo {display:none !important;}`;
        }

        return `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>Prova - ${provaTitulo}</title>
                <style>
                    @media print {
                        body { margin:0; padding:0; }
                        .questao-print { page-break-inside: avoid; }
                        .cartao-resposta { page-break-inside: avoid; }
                        .questoes-container { page-break-before: always; }
                    }
                    body { font-family:'Times New Roman',serif; font-size:12pt; line-height:1.3;
                        margin:0; padding:0.4in; background:white; color:black; }
                    .print-header { text-align:center; margin-bottom:6px; padding-bottom:6px;
                        border-bottom:2px solid #000; }
                    .print-logo { max-width:999px; width:100%; height:auto; display:block;
                        margin:0 auto 3px; }
                    .print-header h1 { font-size:14pt; font-weight:bold; margin:0 0 5px; }
                    .student-row { display:flex; justify-content:space-between; margin:4px 0; gap:15px; }
                    .student-item { flex:1; display:flex; align-items:baseline; gap:6px; }
                    .label { font-weight:bold; min-width:65px; font-size:10pt; }
                    .underline { border-bottom:1px dotted #000; flex:1; height:16px; }
                    .campos-box { margin:6px 0; border:2px solid #000; padding:5px 12px;
                        display:flex; justify-content:space-between; gap:20px; }
                    .campo-item { flex:1; display:flex; align-items:baseline; gap:6px; }
                    .campo-label { font-weight:bold; min-width:35px; font-size:10pt; }
                    .campo-underline { border-bottom:1px dotted #000; flex:1; height:16px; }
                    .instrucoes-box { margin:6px 0; border:1px solid #ccc; padding:8px 12px;
                        background:#fefefe; border-radius:4px; }
                    .instrucoes-box h4 { margin:0 0 5px; font-size:10pt; font-weight:bold;
                        color:#4f46e5; text-align:center; }
                    .instrucoes-box ul { margin:0; padding-left:20px; }
                    .instrucoes-box li { margin-bottom:3px; font-size:8.5pt; line-height:1.3; }
                    .print-prova-info { margin:8px 0; padding:5px 8px; border:1px solid #ddd;
                        background:#fafafa; }
                    .print-prova-info h3 { margin:0 0 3px; font-size:11pt; text-align:center;
                        font-weight:bold; }
                    .info-linha { display:flex; justify-content:space-between; flex-wrap:wrap;
                        gap:8px; font-size:8pt; border-top:1px solid #eee;
                        padding-top:4px; margin-top:4px; }
                    .questao-print { margin-bottom:20px; }
                    .questao-numero { font-weight:bold; margin-bottom:6px;
                        border-bottom:1px solid #ccc; padding-bottom:3px; font-size:10pt; }
                    .questao-texto { margin-bottom:10px; margin-left:8px; line-height:1.4;
                        font-size:11pt; }
                    .opcao-linha { margin:6px 0 6px 18px; display:flex; font-size:10pt; }
                    .opcao-letra { min-width:22px; font-weight:500; }
                    .rascunho-area { margin-top:8px; border-top:1px dashed #ccc; padding-top:5px; }
                    .rascunho-area small { font-size:7pt; }
                    .rascunho-linhas { min-height:35px;
                        background:repeating-linear-gradient(transparent, transparent 16px,
                            #eee 16px, #eee 18px); }
                    .print-footer { margin-top:25px; text-align:center; font-size:7.5pt;
                        color:#666; border-top:1px solid #ccc; padding-top:8px; }
                    ${cssAdaptacoes}
                </style>
            </head>
            <body>
                <div class="print-header">
                    <img src="${logoIema}" class="print-logo" alt="IEMA"
                        onerror="this.style.display='none'">
                    <h1>IEMA PLENO: SÃO LUÍS - CENTRO</h1>
                    <div class="student-row">
                        <div class="student-item">
                            <span class="label">ESTUDANTE:</span><span class="underline"></span>
                        </div>
                    </div>
                    <div class="student-row">
                        <div class="student-item">
                            <span class="label">CURSO:</span><span class="underline"></span>
                        </div>
                        <div class="student-item">
                            <span class="label">TURMA:</span><span class="underline"></span>
                        </div>
                    </div>
                </div>

                <div class="campos-box">
                    <div class="campo-item"><span class="campo-label">Nota:</span><span class="campo-underline"></span></div>
                    <div class="campo-item"><span class="campo-label">Ass.:</span><span class="campo-underline"></span></div>
                    <div class="campo-item"><span class="campo-label">Data:</span><span class="campo-underline"></span></div>
                </div>

                <div class="instrucoes-box">
                    <h4>📋 INSTRUÇÕES GERAIS</h4>
                    <ul>
                        <li>Escreva seu nome legível e assine a lista de frequência.</li>
                        <li>Todas as anotações e cálculos devem ser feitos no caderno de prova.</li>
                        <li>Os celulares <strong>deverão ser desligados</strong> durante a prova.</li>
                        <li>Cada questão contém apenas uma alternativa correta.</li>
                        <li>Leia e siga as instruções do cartão-resposta abaixo.</li>
                    </ul>
                </div>

                ${adaptacoesTexto}

                <div class="print-prova-info">
                    <h3>${provaTitulo}</h3>
                    <div class="info-linha">
                        <span>Período: ${periodo}</span>
                        <span>Turma: ${turmaNome}</span>
                        <span>Disciplina: ${disciplina}</span>
                        <span>Professor: ${professorNome}</span>
                        <span>Questões: ${totalQuestoes}</span>
                    </div>
                </div>

                ${gerarCartaoResposta()}

                <div class="questoes-container">
                    ${questoesHTML}
                </div>

                <div class="print-footer">
                    <p>EducaPleno - ${dataFormatada}</p>
                    <p>📱 Escaneie o QR Code para correção automática</p>
                    <p style="font-size:6pt;">Aluno: ${alunoNome || '_________________'} |
                        Turma: ${turmaNome} | Código: ${prova.codigo || 'N/A'}</p>
                </div>
                <div style="page-break-after:always;"></div>
            </body>
            </html>`;
    }

    async gerarHTMLImpressao(prova, questoes, qrCodeDataUrl, opcoesAdaptacao = {}, qrCodeAlunoUrl = null, alunoNome = null) {
        try {
            const printHTML = this.gerarHTMLProvaCompleta(
                prova, questoes, qrCodeDataUrl, opcoesAdaptacao, qrCodeAlunoUrl, alunoNome
            );
            const printWindow = window.open('', '_blank');
            printWindow.document.write(printHTML);
            printWindow.document.close();
            printWindow.onload = () => {
                printWindow.print();
                printWindow.onafterprint = () => printWindow.close();
            };
            this.showToast('✅ Impressão preparada!', 'success');
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast(`❌ ${error.message}`, 'error');
        }
    }

    fecharModalImpressao() {
        const modal = document.getElementById('modalPerguntaAdaptacao');
        if (modal) modal.remove();
    }

    fecharModalOpcoesAdaptacao() {
        const modal = document.getElementById('modalOpcoesAdaptacao');
        if (modal) modal.remove();
        const m = document.getElementById('modalPerguntaAdaptacao');
        if (m) m.style.display = 'flex';
    }

    closeAllModals() {
        const modal = document.getElementById('modal');
        if (modal) modal.style.display = 'none';
        const c = document.getElementById('confirmModal');
        if (c) c.style.display = 'none';
        this.fecharModalImpressao();
        this.fecharModalOpcoesAdaptacao();
    }

    // ============================================================================
    // RESULTADOS
    // ============================================================================
    async carregarResultados() {
        const contentArea = document.getElementById('contentArea');
        if (!contentArea) return;

        contentArea.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner"></div>
                <p>Carregando resultados...</p>
            </div>
            <style>
                .loading-spinner { text-align:center; padding:60px; background:white; border-radius:12px; }
                .spinner { width:40px; height:40px; border:4px solid #f3f3f3; border-top:4px solid #0d6efd;
                    border-radius:50%; margin:0 auto 15px; animation:spin 1s linear infinite; }
                @keyframes spin { 0% { transform:rotate(0deg); } 100% { transform:rotate(360deg); } }
            </style>`;

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/admin/todos-resultados', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();

            if (!data.success) throw new Error(data.error || 'Erro ao carregar resultados');

            if (!data.resultados || data.resultados.length === 0) {
                contentArea.innerHTML = this.renderSemResultados();
                return;
            }

            const resultados = data.resultados.map(r => ({
                id: r.id || r._id,
                alunoId: r.alunoId,
                alunoNome: r.alunoNome || 'Aluno',
                alunoEmail: r.alunoEmail || '',
                alunoMatricula: r.alunoMatricula || '',
                alunoTurma: r.alunoTurma || '',
                provaId: r.provaId,
                provaTitulo: r.provaTitulo || 'Prova',
                dataRealizacao: r.dataRealizacao || r.createdAt,
                notaAutomatica: r.notaAutomatica !== undefined ? r.notaAutomatica : r.nota,
                notaAutomaticaLiberada: r.notaAutomaticaLiberada !== undefined ? r.notaAutomaticaLiberada : r.notaLiberada,
                notaManual: r.notaManual,
                notaManualLiberada: r.notaManualLiberada,
                notaManualObservacao: r.notaManualObservacao,
                notaManualData: r.notaManualData,
                notaManualAtribuidaPor: r.notaManualAtribuidaPor,
                nota: r.notaManual !== null && r.notaManual !== undefined ? r.notaManual : r.nota,
                notaLiberada: r.notaManualLiberada || r.notaLiberada,
                tipoNota: r.tipoNota || (r.notaManual !== null ? 'manual' : 'automatica'),
                acertos: r.acertos || 0,
                total: r.total || 0,
                tempoGasto: r.tempoGasto || 0,
                status: r.status || (r.nota !== null ? (r.nota >= 7 ? 'aprovado' : 'reprovado') : 'pendente'),
                cancelada: r.cancelada || false,
                motivoCancelamento: r.motivoCancelamento,
                resultadoDetalhado: r.resultadoDetalhado || [],
                observacoes: r.observacoes || '',
                createdAt: r.createdAt
            }));

            const aprovados = resultados.filter(r => r.nota && r.nota >= 7 && !r.cancelada).length;
            const reprovados = resultados.filter(r => r.nota && r.nota < 7 && !r.cancelada).length;
            const pendentes = resultados.filter(r => r.nota === null || r.nota === undefined).length;
            const cancelados = resultados.filter(r => r.cancelada).length;
            const notasValidas = resultados.filter(r => r.nota !== null && r.nota !== undefined && !r.cancelada).map(r => r.nota);
            const mediaGeral = notasValidas.length > 0
                ? (notasValidas.reduce((a, b) => a + b, 0) / notasValidas.length).toFixed(2)
                : '0.00';
            const taxaAprovacao = notasValidas.length > 0
                ? ((aprovados / notasValidas.length) * 100).toFixed(1)
                : '0.0';

            const estatisticas = {
                totalResultados: resultados.length,
                totalAlunos: new Set(resultados.map(r => r.alunoId)).size,
                totalProvas: new Set(resultados.map(r => r.provaId)).size,
                aprovados, reprovados, pendentes, cancelados, mediaGeral, taxaAprovacao,
                notasManuais: resultados.filter(r => r.tipoNota === 'manual').length,
                notasAutomaticas: resultados.filter(r => r.tipoNota === 'automatica').length
            };

            this.resultadosCompletos = resultados;
            this.resultadosFiltrados = resultados;
            this.paginaAtual = 1;
            this.itensPorPagina = 15;

            contentArea.innerHTML = this.renderResultadosCompleto(resultados, estatisticas);

            setTimeout(() => {
                const tbody = document.getElementById('tabelaResultadosBody');
                if (tbody) tbody.innerHTML = this.gerarLinhasResultados(resultados);
                this.inicializarGraficosResultados(this.prepararDadosGraficos(resultados));
                this.configurarEventosResultados();
                this.atualizarContadoresCards();
                this.atualizarTabelaPaginada();
            }, 100);
        } catch (error) {
            console.error('❌ Erro:', error);
            contentArea.innerHTML = this.renderErro(error.message);
        }
    }

    prepararDadosGraficos(resultados) {
        const provasMap = new Map();
        resultados.forEach(r => {
            if (!provasMap.has(r.provaTitulo)) provasMap.set(r.provaTitulo, 0);
            provasMap.set(r.provaTitulo, provasMap.get(r.provaTitulo) + 1);
        });
        const provasArray = Array.from(provasMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);

        const ultimos7Dias = [];
        const hoje = new Date();
        for (let i = 6; i >= 0; i--) {
            const data = new Date(hoje);
            data.setDate(data.getDate() - i);
            ultimos7Dias.push(data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
        }

        const resultadosPorDia = Array(7).fill(0);
        resultados.forEach(r => {
            const dataR = new Date(r.dataRealizacao);
            const diffDias = Math.floor((hoje - dataR) / (1000 * 60 * 60 * 24));
            if (diffDias >= 0 && diffDias < 7) resultadosPorDia[6 - diffDias]++;
        });

        return {
            provas: {
                labels: provasArray.map(p => p[0].length > 20 ? p[0].substring(0, 17) + '...' : p[0]),
                dados: provasArray.map(p => p[1])
            },
            evolucao: { labels: ultimos7Dias, dados: resultadosPorDia }
        };
    }

    renderResultadosCompleto(resultados, estatisticas) {
        return `
            <div class="resultados-container">
                <div class="resultados-header">
                    <div class="header-left">
                        <i class="fas fa-chart-line"></i>
                        <div>
                            <h2>Gestão de Resultados</h2>
                            <p>${resultados.length} ${resultados.length === 1 ? 'resultado' : 'resultados'}</p>
                        </div>
                    </div>
                    <div class="header-actions">
                        <button class="btn-header" onclick="adminSimples.exportarResultadosPDF()" title="PDF">
                            <i class="fas fa-file-pdf"></i> PDF
                        </button>
                        <button class="btn-header" onclick="adminSimples.exportarResultadosCSV()" title="CSV">
                            <i class="fas fa-file-csv"></i> CSV
                        </button>
                        <button class="btn-header" style="background:#10b981;color:white;border:none;"
                            onclick="adminSimples.liberarTodasNotas()" title="Liberar todas">
                            <i class="fas fa-lock-open"></i> Liberar Todas
                        </button>
                        <button class="btn-header refresh" onclick="adminSimples.carregarResultados()" title="Atualizar">
                            <i class="fas fa-sync-alt"></i> Atualizar
                        </button>
                    </div>
                </div>

                <div class="stats-grid">
                    <div class="stat-card primary" onclick="adminSimples.filtrarPorStatusAdmin('todos')">
                        <div class="stat-icon"><i class="fas fa-file-alt"></i></div>
                        <div class="stat-content">
                            <h3>Total</h3>
                            <div class="stat-number">${estatisticas.totalResultados}</div>
                            <div class="stat-details">
                                <span><i class="fas fa-users"></i> ${estatisticas.totalAlunos} alunos</span>
                                <span><i class="fas fa-tasks"></i> ${estatisticas.totalProvas} provas</span>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card success" onclick="adminSimples.filtrarPorStatusAdmin('aprovado')">
                        <div class="stat-icon"><i class="fas fa-check-circle"></i></div>
                        <div class="stat-content">
                            <h3>Aprovados</h3>
                            <div class="stat-number">${estatisticas.aprovados}</div>
                            <div class="stat-details">
                                <span><i class="fas fa-percent"></i> ${estatisticas.taxaAprovacao}%</span>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card danger" onclick="adminSimples.filtrarPorStatusAdmin('reprovado')">
                        <div class="stat-icon"><i class="fas fa-times-circle"></i></div>
                        <div class="stat-content">
                            <h3>Reprovados</h3>
                            <div class="stat-number">${estatisticas.reprovados}</div>
                            <div class="stat-details">
                                <span><i class="fas fa-chart-line"></i> Média: ${estatisticas.mediaGeral}</span>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card warning" onclick="adminSimples.filtrarPorStatusAdmin('pendente')">
                        <div class="stat-icon"><i class="fas fa-clock"></i></div>
                        <div class="stat-content">
                            <h3>Pendentes</h3>
                            <div class="stat-number">${estatisticas.pendentes}</div>
                            <div class="stat-details">
                                <span><i class="fas fa-hourglass-half"></i> aguardando</span>
                            </div>
                        </div>
                    </div>
                    <div class="stat-card" style="background:white;border-radius:16px;padding:20px;
                        box-shadow:0 2px 8px rgba(0,0,0,0.05);display:flex;align-items:center;gap:20px;
                        cursor:pointer;" onclick="adminSimples.filtrarPorStatusAdmin('cancelado')">
                        <div class="stat-icon" style="width:60px;height:60px;border-radius:16px;
                            display:flex;align-items:center;justify-content:center;font-size:24px;color:white;
                            background:linear-gradient(135deg,#dc2626,#b91c1c);">
                            <i class="fas fa-ban"></i>
                        </div>
                        <div class="stat-content">
                            <h3 style="font-size:14px;color:#6c757d;margin-bottom:5px;">Canceladas</h3>
                            <div class="stat-number">${estatisticas.cancelados}</div>
                            <div class="stat-details">
                                <span><i class="fas fa-user-slash"></i> violações</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="charts-row">
                    <div class="chart-card">
                        <h3><i class="fas fa-chart-bar"></i> Resultados por Prova</h3>
                        <canvas id="graficoProvas" style="width:100%;height:250px;"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3><i class="fas fa-chart-line"></i> Últimos 7 Dias</h3>
                        <canvas id="graficoEvolucao" style="width:100%;height:250px;"></canvas>
                    </div>
                </div>

                <div class="filters-card">
                    <div class="filters-row" style="display:flex;gap:15px;flex-wrap:wrap;align-items:flex-end;">
                        <div class="filter-group" style="flex:2;">
                            <label style="display:block;font-size:12px;color:#6c757d;margin-bottom:5px;">
                                <i class="fas fa-search"></i> Buscar
                            </label>
                            <input type="text" id="searchResultados" placeholder="Aluno, prova, turma..."
                                class="filter-input"
                                style="width:100%;padding:8px 12px;border:1px solid #dee2e6;
                                       border-radius:8px;font-size:13px;"
                                onkeyup="adminSimples.filtrarTabelaResultados()">
                        </div>
                        <div class="filter-group" style="flex:1;">
                            <label style="display:block;font-size:12px;color:#6c757d;margin-bottom:5px;">
                                <i class="fas fa-filter"></i> Status
                            </label>
                            <select id="filtroStatusAdmin" class="filter-select"
                                style="width:100%;padding:8px 12px;border:1px solid #dee2e6;
                                       border-radius:8px;font-size:13px;"
                                onchange="adminSimples.filtrarTabelaResultados()">
                                <option value="todos">Todos</option>
                                <option value="aprovado">✅ Aprovados</option>
                                <option value="reprovado">❌ Reprovados</option>
                                <option value="pendente">⏳ Pendentes</option>
                                <option value="cancelado">🚫 Cancelados</option>
                            </select>
                        </div>
                        <div class="filter-group" style="flex:1;">
                            <label style="display:block;font-size:12px;color:#6c757d;margin-bottom:5px;">
                                <i class="fas fa-calendar"></i> Período
                            </label>
                            <select id="filtroPeriodo" class="filter-select"
                                style="width:100%;padding:8px 12px;border:1px solid #dee2e6;
                                       border-radius:8px;font-size:13px;"
                                onchange="adminSimples.filtrarTabelaResultados()">
                                <option value="todos">Todos</option>
                                <option value="hoje">Hoje</option>
                                <option value="semana">Esta semana</option>
                                <option value="mes">Este mês</option>
                            </select>
                        </div>
                        <div class="filter-group" style="flex:1;">
                            <label style="display:block;font-size:12px;color:#6c757d;margin-bottom:5px;">
                                <i class="fas fa-sort"></i> Ordenar
                            </label>
                            <select id="filtroOrdenacao" class="filter-select"
                                style="width:100%;padding:8px 12px;border:1px solid #dee2e6;
                                       border-radius:8px;font-size:13px;"
                                onchange="adminSimples.ordenarResultados()">
                                <option value="data_desc">Mais recentes</option>
                                <option value="data_asc">Mais antigos</option>
                                <option value="nome_asc">Aluno (A-Z)</option>
                                <option value="nome_desc">Aluno (Z-A)</option>
                                <option value="nota_desc">Maior nota</option>
                                <option value="nota_asc">Menor nota</option>
                            </select>
                        </div>
                        <button class="btn-clear-filters" onclick="adminSimples.limparFiltrosAdmin()"
                            style="padding:8px 16px;background:#6c757d;color:white;border:none;
                                   border-radius:8px;cursor:pointer;font-size:13px;
                                   display:flex;align-items:center;gap:5px;height:38px;">
                            <i class="fas fa-eraser"></i> Limpar
                        </button>
                    </div>
                </div>

                <div class="table-container" style="background:white;border-radius:16px;padding:20px;
                    box-shadow:0 2px 8px rgba(0,0,0,0.05);">
                    <div class="table-header" style="display:flex;justify-content:space-between;
                        align-items:center;margin-bottom:15px;">
                        <h3 style="margin:0;font-size:16px;color:#495057;">
                            <i class="fas fa-list"></i> Lista de Resultados
                        </h3>
                        <div class="table-info" style="color:#6c757d;font-size:13px;">
                            <span id="resultadosCount">${resultados.length}</span> registros
                        </div>
                    </div>
                    <div class="table-responsive" style="overflow-x:auto;">
                        <table class="data-table" style="width:100%;border-collapse:collapse;">
                            <thead>
                                <tr>
                                    <th style="background:#f8f9fa;padding:12px 16px;text-align:left;
                                        font-size:13px;font-weight:600;color:#495057;
                                        border-bottom:2px solid #dee2e6;">Aluno</th>
                                    <th style="background:#f8f9fa;padding:12px 16px;text-align:left;
                                        font-size:13px;font-weight:600;color:#495057;
                                        border-bottom:2px solid #dee2e6;">Email</th>
                                    <th style="background:#f8f9fa;padding:12px 16px;text-align:left;
                                        font-size:13px;font-weight:600;color:#495057;
                                        border-bottom:2px solid #dee2e6;">Prova</th>
                                    <th style="background:#f8f9fa;padding:12px 16px;text-align:left;
                                        font-size:13px;font-weight:600;color:#495057;
                                        border-bottom:2px solid #dee2e6;">Turma</th>
                                    <th style="background:#f8f9fa;padding:12px 16px;text-align:left;
                                        font-size:13px;font-weight:600;color:#495057;
                                        border-bottom:2px solid #dee2e6;">Data</th>
                                    <th style="background:#f8f9fa;padding:12px 16px;text-align:left;
                                        font-size:13px;font-weight:600;color:#495057;
                                        border-bottom:2px solid #dee2e6;">Nota</th>
                                    <th style="background:#f8f9fa;padding:12px 16px;text-align:left;
                                        font-size:13px;font-weight:600;color:#495057;
                                        border-bottom:2px solid #dee2e6;">Acertos</th>
                                    <th style="background:#f8f9fa;padding:12px 16px;text-align:left;
                                        font-size:13px;font-weight:600;color:#495057;
                                        border-bottom:2px solid #dee2e6;">Tempo</th>
                                    <th style="background:#f8f9fa;padding:12px 16px;text-align:left;
                                        font-size:13px;font-weight:600;color:#495057;
                                        border-bottom:2px solid #dee2e6;">Status</th>
                                    <th style="background:#f8f9fa;padding:12px 16px;text-align:left;
                                        font-size:13px;font-weight:600;color:#495057;
                                        border-bottom:2px solid #dee2e6;width:120px;">Ações</th>
                                </tr>
                            </thead>
                            <tbody id="tabelaResultadosBody"></tbody>
                        </table>
                    </div>
                    <div class="pagination-container" id="paginacao"
                        style="display:flex;justify-content:center;align-items:center;gap:15px;
                               margin-top:20px;padding-top:20px;border-top:1px solid #e9ecef;">
                        <button class="btn-pagination" onclick="adminSimples.paginaAnterior()" id="btnAnterior"
                            disabled
                            style="padding:8px 16px;border:1px solid #dee2e6;background:white;
                                   border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:5px;">
                            <i class="fas fa-chevron-left"></i> Anterior
                        </button>
                        <span class="page-info" id="pageInfo" style="font-size:13px;color:#6c757d;">
                            Página 1 de 1
                        </span>
                        <button class="btn-pagination" onclick="adminSimples.proximaPagina()" id="btnProxima"
                            disabled
                            style="padding:8px 16px;border:1px solid #dee2e6;background:white;
                                   border-radius:6px;cursor:pointer;display:flex;align-items:center;gap:5px;">
                            Próxima <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                </div>
            </div>

            <style>
                .resultados-container { padding:20px; max-width:1400px; margin:0 auto;
                    font-family:'Inter',-apple-system,sans-serif; }
                .resultados-header { display:flex; justify-content:space-between; align-items:center;
                    margin-bottom:25px; background:white; padding:20px 25px; border-radius:16px;
                    box-shadow:0 2px 8px rgba(0,0,0,0.05); }
                .header-left { display:flex; align-items:center; gap:15px; }
                .header-left i { font-size:32px; color:#0d6efd; background:#e7f3ff;
                    padding:12px; border-radius:12px; }
                .header-left h2 { margin:0; font-size:20px; color:#212529; }
                .header-left p { margin:5px 0 0; color:#6c757d; font-size:13px; }
                .header-actions { display:flex; gap:10px; }
                .btn-header { padding:8px 16px; border:1px solid #dee2e6; background:white;
                    border-radius:8px; cursor:pointer; display:flex; align-items:center;
                    gap:8px; font-size:13px; transition:all 0.3s; }
                .btn-header:hover { background:#f8f9fa; border-color:#0d6efd; color:#0d6efd; }
                .btn-header.refresh { background:#0d6efd; border-color:#0d6efd; color:white; }
                .stats-grid { display:grid; grid-template-columns:repeat(5,1fr);
                    gap:20px; margin-bottom:25px; }
                .stat-card { background:white; border-radius:16px; padding:20px;
                    box-shadow:0 2px 8px rgba(0,0,0,0.05); display:flex; align-items:center;
                    gap:20px; transition:all 0.3s; cursor:pointer; }
                .stat-card:hover { transform:translateY(-4px); box-shadow:0 8px 16px rgba(0,0,0,0.1); }
                .stat-card.primary .stat-icon { background:linear-gradient(135deg,#0d6efd,#0b5ed7); }
                .stat-card.success .stat-icon { background:linear-gradient(135deg,#198754,#157347); }
                .stat-card.danger .stat-icon { background:linear-gradient(135deg,#dc3545,#bb2d3b); }
                .stat-card.warning .stat-icon { background:linear-gradient(135deg,#ffc107,#ffb300); }
                .stat-icon { width:60px; height:60px; border-radius:16px; display:flex;
                    align-items:center; justify-content:center; font-size:28px; color:white; }
                .stat-content h3 { font-size:14px; color:#6c757d; margin-bottom:5px; }
                .stat-number { font-size:28px; font-weight:700; color:#212529; line-height:1.2; }
                .stat-details { display:flex; gap:12px; margin-top:5px; font-size:12px;
                    color:#6c757d; }
                .charts-row { display:grid; grid-template-columns:repeat(2,1fr);
                    gap:20px; margin-bottom:25px; }
                .chart-card { background:white; border-radius:16px; padding:20px;
                    box-shadow:0 2px 8px rgba(0,0,0,0.05); }
                .chart-card h3 { margin:0 0 15px; font-size:16px; color:#495057;
                    display:flex; align-items:center; gap:8px; }
                .filters-card { background:white; border-radius:16px; padding:20px;
                    margin-bottom:25px; box-shadow:0 2px 8px rgba(0,0,0,0.05); }
                .status-badge { padding:4px 10px; border-radius:30px; font-size:11px;
                    font-weight:600; display:inline-block; }
                .status-aprovado { background:#d4edda; color:#155724; }
                .status-reprovado { background:#f8d7da; color:#721c24; }
                .status-pendente { background:#fff3cd; color:#856404; }
                .status-cancelado { background:#fee2e2; color:#991b1b; }
                .nota-alta { color:#28a745; font-weight:600; }
                .nota-baixa { color:#dc3545; font-weight:600; }
                .action-buttons { display:flex; gap:5px; }
                .btn-icon { width:32px; height:32px; border:none; border-radius:6px;
                    background:transparent; color:#6c757d; cursor:pointer;
                    display:inline-flex; align-items:center; justify-content:center;
                    transition:all 0.2s; }
                .btn-icon:hover { background:#e9ecef; color:#0d6efd; }
                .btn-icon.edit:hover { color:#ffc107; }
                .btn-icon.delete:hover { color:#dc3545; }
                .badge-manual { background:#f59e0b; color:white; padding:2px 6px;
                    border-radius:4px; font-size:10px; margin-left:5px;
                    display:inline-flex; align-items:center; gap:3px; }
                .badge-automatica { background:#10b981; color:white; padding:2px 6px;
                    border-radius:4px; font-size:10px; margin-left:5px;
                    display:inline-flex; align-items:center; gap:3px; }
                @media (max-width:1200px) { .stats-grid { grid-template-columns:repeat(3,1fr); } }
                @media (max-width:768px) {
                    .stats-grid { grid-template-columns:1fr; }
                    .charts-row { grid-template-columns:1fr; }
                    .filters-row { flex-direction:column; }
                    .resultados-header { flex-direction:column; gap:15px; align-items:flex-start; }
                }
            </style>`;
    }

    atualizarContadoresCards() {
        if (!this.resultadosCompletos) return;
        const resultados = this.resultadosCompletos;

        let aprovados = 0, reprovados = 0, pendentes = 0, canceladas = 0;
        resultados.forEach(r => {
            if (r.cancelada === true) canceladas++;
            else if (r.nota === null || r.nota === undefined || r.notaLiberada === false) pendentes++;
            else if (r.nota >= 7) aprovados++;
            else reprovados++;
        });

        const statsNumbers = document.querySelectorAll('.stat-number');
        if (statsNumbers.length >= 5) {
            statsNumbers[0].textContent = resultados.length;
            statsNumbers[1].textContent = aprovados;
            statsNumbers[2].textContent = reprovados;
            statsNumbers[3].textContent = pendentes;
            if (statsNumbers[4]) statsNumbers[4].textContent = canceladas;
        }
    }

    gerarLinhasResultados(resultados) {
        if (!resultados || resultados.length === 0) {
            return `<tr><td colspan="10" style="text-align:center;padding:40px;">
                <i class="fas fa-chart-line" style="font-size:2rem;color:#dee2e6;
                    margin-bottom:10px;display:block;"></i>
                Nenhum resultado encontrado
            </td></tr>`;
        }

        return resultados.map(r => {
            const isCancelada = r.cancelada === true;
            const notaExibida = r.tipoNota === 'manual' ? r.notaManual : r.notaAutomatica;
            const notaLiberada = r.tipoNota === 'manual' ? r.notaManualLiberada : r.notaLiberada;

            let statusClass = '', statusText = '', statusIcon = '';
            if (isCancelada) {
                statusClass = 'status-cancelado'; statusText = 'Cancelada'; statusIcon = '🚫 ';
            } else if (notaExibida === null || notaExibida === undefined || !notaLiberada) {
                statusClass = 'status-pendente'; statusText = 'Aguardando'; statusIcon = '⏳ ';
            } else if (notaExibida >= 7) {
                statusClass = 'status-aprovado'; statusText = 'Aprovado'; statusIcon = '✅ ';
            } else {
                statusClass = 'status-reprovado'; statusText = 'Reprovado'; statusIcon = '❌ ';
            }

            let tipoNotaBadge = '';
            if (r.tipoNota === 'manual') {
                tipoNotaBadge = '<span class="badge-manual"><i class="fas fa-print"></i> Manual</span>';
            } else if (r.tipoNota === 'automatica' && r.notaAutomatica !== null) {
                tipoNotaBadge = '<span class="badge-automatica"><i class="fas fa-laptop-code"></i> Online</span>';
            }

            const notaExibir = (notaLiberada && notaExibida !== null) ? notaExibida.toFixed(2) : '-';
            let notaClass = '';
            if (notaLiberada && notaExibida !== null && !isCancelada) {
                if (notaExibida >= 7) notaClass = 'nota-alta';
                else if (notaExibida > 0) notaClass = 'nota-baixa';
            }

            const precisaLiberar = !isCancelada && notaExibida !== null && !notaLiberada;
            const data = r.dataRealizacao
                ? new Date(r.dataRealizacao).toLocaleDateString('pt-BR')
                : (r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR') : 'N/A');
            const percentual = r.total > 0 ? Math.round((r.acertos / r.total) * 100) : 0;

            return `
                <tr>
                    <td style="padding:12px 16px;border-bottom:1px solid #e9ecef;font-size:13px;">
                        <strong>${r.alunoNome || 'N/A'}</strong>
                        <div style="font-size:11px;color:#6c757d;">${r.alunoMatricula || ''}</div>
                    </td>
                    <td style="padding:12px 16px;border-bottom:1px solid #e9ecef;font-size:13px;color:#6c757d;">
                        ${r.alunoEmail || '-'}
                    </td>
                    <td style="padding:12px 16px;border-bottom:1px solid #e9ecef;font-size:13px;">
                        ${r.provaTitulo || 'N/A'}${tipoNotaBadge}
                    </td>
                    <td style="padding:12px 16px;border-bottom:1px solid #e9ecef;font-size:13px;">
                        ${r.alunoTurma || '-'}
                    </td>
                    <td style="padding:12px 16px;border-bottom:1px solid #e9ecef;font-size:13px;">
                        ${data}
                    </td>
                    <td style="padding:12px 16px;border-bottom:1px solid #e9ecef;font-size:13px;"
                        class="${notaClass}">
                        <strong>${notaExibir}</strong>
                        ${r.tipoNota === 'manual' ? '<span style="font-size:10px;color:#f59e0b;"> (Manual)</span>' : ''}
                    </td>
                    <td style="padding:12px 16px;border-bottom:1px solid #e9ecef;font-size:13px;">
                        ${r.acertos || 0}/${r.total || 0}
                        <span style="color:#6c757d;font-size:11px;">(${percentual}%)</span>
                    </td>
                    <td style="padding:12px 16px;border-bottom:1px solid #e9ecef;font-size:13px;">
                        ${this.formatarTempoResultado(r.tempoGasto, r.cancelada, r.status)}
                    </td>
                    <td style="padding:12px 16px;border-bottom:1px solid #e9ecef;font-size:13px;">
                        <span class="status-badge ${statusClass}">${statusIcon}${statusText}</span>
                    </td>
                    <td style="padding:12px 16px;border-bottom:1px solid #e9ecef;font-size:13px;">
                        <div class="action-buttons">
                            <button class="btn-icon" onclick="adminSimples.verResultadoDetalhado('${r.id}')" title="Detalhes">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn-icon edit" onclick="adminSimples.editarResultado('${r.id}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            ${precisaLiberar ? `
                                <button class="btn-icon" style="background:#10b981;color:white;"
                                    onclick="adminSimples.liberarNota('${r.id}')" title="Liberar nota">
                                    <i class="fas fa-lock-open"></i>
                                </button>` : ''}
                            ${isCancelada ? `
                                <button class="btn-icon" onclick="adminSimples.verDetalhesCancelamento('${r.id}')"
                                    title="Detalhes do cancelamento" style="color:#f59e0b;">
                                    <i class="fas fa-info-circle"></i>
                                </button>` : `
                                <button class="btn-icon" onclick="adminSimples.enviarLembrete('${r.id}')" title="Lembrete">
                                    <i class="fas fa-bell"></i>
                                </button>`}
                            <button class="btn-icon delete" onclick="adminSimples.excluirResultado('${r.id}')" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
        }).join('');
    }

    formatarTempoResultado(tempoGasto, cancelada = false, status = '') {
        if (cancelada || status === 'cancelada') {
            return '<span style="color:#dc2626;"><i class="fas fa-ban"></i> Cancelada</span>';
        }
        if (!tempoGasto || tempoGasto <= 0) {
            return '<span style="color:#6b7280;">—</span>';
        }
        const minutos = Math.round(tempoGasto);
        return `<span style="color:#1f2937;">${minutos} min</span>`;
    }

    atualizarTabelaPaginada() {
        const tbody = document.getElementById('tabelaResultadosBody');
        if (!tbody || !this.resultadosFiltrados) return;

        const inicio = (this.paginaAtual - 1) * this.itensPorPagina;
        const fim = inicio + this.itensPorPagina;
        const paginaResultados = this.resultadosFiltrados.slice(inicio, fim);
        tbody.innerHTML = this.gerarLinhasResultados(paginaResultados);

        const totalPaginas = Math.ceil(this.resultadosFiltrados.length / this.itensPorPagina) || 1;
        const pageInfo = document.getElementById('pageInfo');
        const resultadosCount = document.getElementById('resultadosCount');
        const btnAnterior = document.getElementById('btnAnterior');
        const btnProxima = document.getElementById('btnProxima');

        if (pageInfo) pageInfo.textContent = `Página ${this.paginaAtual} de ${totalPaginas}`;
        if (resultadosCount) resultadosCount.textContent = this.resultadosFiltrados.length;
        if (btnAnterior) btnAnterior.disabled = this.paginaAtual === 1;
        if (btnProxima) btnProxima.disabled = this.paginaAtual === totalPaginas;
    }

    inicializarGraficosResultados(dadosGraficos) {
        if (!window.Chart) { console.warn('Chart.js não encontrado'); return; }

        if (this.graficoProvas) this.graficoProvas.destroy();
        if (this.graficoEvolucao) this.graficoEvolucao.destroy();

        const ctxProvas = document.getElementById('graficoProvas')?.getContext('2d');
        if (ctxProvas && dadosGraficos.provas.labels.length > 0) {
            this.graficoProvas = new Chart(ctxProvas, {
                type: 'bar',
                data: {
                    labels: dadosGraficos.provas.labels,
                    datasets: [{
                        data: dadosGraficos.provas.dados,
                        backgroundColor: '#0d6efd',
                        borderRadius: 5
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                }
            });
        }

        const ctxEvolucao = document.getElementById('graficoEvolucao')?.getContext('2d');
        if (ctxEvolucao) {
            this.graficoEvolucao = new Chart(ctxEvolucao, {
                type: 'line',
                data: {
                    labels: dadosGraficos.evolucao.labels,
                    datasets: [{
                        data: dadosGraficos.evolucao.dados,
                        borderColor: '#198754',
                        backgroundColor: 'rgba(25,135,84,0.1)',
                        borderWidth: 3, tension: 0.4, fill: true,
                        pointBackgroundColor: '#198754',
                        pointBorderColor: 'white', pointBorderWidth: 2, pointRadius: 4
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                }
            });
        }
    }

    async liberarNota(resultadoId) {
        try {
            const resultado = this.resultadosCompletos?.find(r => r.id === resultadoId);
            if (!resultado) { this.showToast('❌ Resultado não encontrado', 'error'); return; }

            const confirmar = await this.confirmar(
                '✅ Liberar Nota',
                `Liberar a nota <strong>${resultado.nota}</strong> para <strong>${resultado.alunoNome}</strong>?`
            );
            if (!confirmar) return;

            this.showToast('🔄 Liberando...', 'info');
            const token = localStorage.getItem('auth_token');

            const response = await fetch(`/api/admin/resultados/${resultadoId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    nota: resultado.nota,
                    acertos: resultado.acertos,
                    total: resultado.total,
                    tempoGasto: resultado.tempoGasto,
                    observacoes: resultado.observacoes,
                    notaLiberada: true
                })
            });
            const data = await response.json();

            if (data.success) {
                resultado.notaLiberada = true;
                this.showToast('✅ Nota liberada!', 'success');
                this.filtrarTabelaResultados();
                this.atualizarContadoresCards();
            } else {
                throw new Error(data.error || 'Erro');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    async liberarTodasNotas() {
        const pendentes = this.resultadosCompletos?.filter(r =>
            !((r.nota === 0 && r.status === 'pendente') || r.cancelada === true || r.motivoCancelamento) &&
            r.nota !== null && r.notaLiberada === false
        );

        if (!pendentes || pendentes.length === 0) {
            this.showToast('ℹ️ Nenhuma nota pendente', 'info');
            return;
        }

        const confirmar = await this.confirmar(
            '📢 Liberar Todas as Notas',
            `Liberar <strong>${pendentes.length} nota(s)</strong> pendente(s)?<br><br>
            Cada aluno receberá uma notificação.`
        );
        if (!confirmar) return;

        this.showToast(`🔄 Liberando ${pendentes.length} notas...`, 'info');
        const token = localStorage.getItem('auth_token');
        let sucessos = 0, erros = 0;

        for (const resultado of pendentes) {
            try {
                const response = await fetch(`/api/admin/resultados/${resultado.id}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        nota: resultado.nota,
                        acertos: resultado.acertos,
                        total: resultado.total,
                        tempoGasto: resultado.tempoGasto,
                        observacoes: resultado.observacoes,
                        notaLiberada: true
                    })
                });
                const data = await response.json();
                if (data.success) {
                    resultado.notaLiberada = true;
                    sucessos++;
                } else erros++;
            } catch (error) {
                console.error('Erro:', error);
                erros++;
            }
        }

        this.showToast(`✅ ${sucessos} liberadas, ${erros} erros`, 'success');
        this.filtrarTabelaResultados();
        this.atualizarContadoresCards();
    }

    filtrarTabelaResultados() {
        if (!this.resultadosCompletos) return;

        const search = document.getElementById('searchResultados')?.value.toLowerCase() || '';
        const status = document.getElementById('filtroStatusAdmin')?.value || 'todos';
        const periodo = document.getElementById('filtroPeriodo')?.value || 'todos';
        const agora = new Date();

        this.resultadosFiltrados = this.resultadosCompletos.filter(r => {
            const matchSearch = search === '' ||
                (r.alunoNome && r.alunoNome.toLowerCase().includes(search)) ||
                (r.alunoEmail && r.alunoEmail.toLowerCase().includes(search)) ||
                (r.provaTitulo && r.provaTitulo.toLowerCase().includes(search)) ||
                (r.alunoTurma && r.alunoTurma.toLowerCase().includes(search)) ||
                (r.alunoMatricula && r.alunoMatricula.toLowerCase().includes(search));

            let matchStatus = true;
            const isCancelada = (r.nota === 0 && r.status === 'pendente') ||
                                r.cancelada === true || r.motivoCancelamento;

            if (status !== 'todos') {
                if (status === 'aprovado') matchStatus = !isCancelada && r.nota && r.nota >= 7 && r.notaLiberada === true;
                else if (status === 'reprovado') matchStatus = !isCancelada && r.nota && r.nota < 7 && r.notaLiberada === true;
                else if (status === 'pendente') matchStatus = !isCancelada && r.nota !== null && r.nota !== undefined && r.notaLiberada === false;
                else if (status === 'cancelado') matchStatus = isCancelada;
            }

            let matchPeriodo = true;
            if (periodo !== 'todos') {
                const dataR = new Date(r.dataRealizacao || r.createdAt);
                if (periodo === 'hoje') matchPeriodo = dataR.toDateString() === agora.toDateString();
                else if (periodo === 'semana') {
                    const umaSemana = new Date(agora - 7 * 24 * 60 * 60 * 1000);
                    matchPeriodo = dataR >= umaSemana;
                } else if (periodo === 'mes') {
                    const umMes = new Date(agora);
                    umMes.setMonth(umMes.getMonth() - 1);
                    matchPeriodo = dataR >= umMes;
                }
            }

            return matchSearch && matchStatus && matchPeriodo;
        });

        this.paginaAtual = 1;
        this.atualizarTabelaPaginada();
        this.atualizarContadoresCards();
    }

    ordenarResultados() {
        if (!this.resultadosFiltrados) return;
        const ordenacao = document.getElementById('filtroOrdenacao')?.value || 'data_desc';

        switch (ordenacao) {
            case 'data_desc': this.resultadosFiltrados.sort((a, b) => new Date(b.dataRealizacao) - new Date(a.dataRealizacao)); break;
            case 'data_asc': this.resultadosFiltrados.sort((a, b) => new Date(a.dataRealizacao) - new Date(b.dataRealizacao)); break;
            case 'nome_asc': this.resultadosFiltrados.sort((a, b) => a.alunoNome.localeCompare(b.alunoNome)); break;
            case 'nome_desc': this.resultadosFiltrados.sort((a, b) => b.alunoNome.localeCompare(a.alunoNome)); break;
            case 'nota_desc': this.resultadosFiltrados.sort((a, b) => (b.nota || 0) - (a.nota || 0)); break;
            case 'nota_asc': this.resultadosFiltrados.sort((a, b) => (a.nota || 0) - (b.nota || 0)); break;
        }
        this.paginaAtual = 1;
        this.atualizarTabelaPaginada();
    }

    filtrarPorStatusAdmin(status) {
        const select = document.getElementById('filtroStatusAdmin');
        if (select) {
            select.value = status;
            this.filtrarTabelaResultados();
        }
    }

    limparFiltrosAdmin() {
        document.getElementById('searchResultados').value = '';
        document.getElementById('filtroStatusAdmin').value = 'todos';
        document.getElementById('filtroPeriodo').value = 'todos';
        document.getElementById('filtroOrdenacao').value = 'data_desc';
        this.filtrarTabelaResultados();
    }

    paginaAnterior() {
        if (this.paginaAtual > 1) { this.paginaAtual--; this.atualizarTabelaPaginada(); }
    }

    proximaPagina() {
        const totalPaginas = Math.ceil(this.resultadosFiltrados.length / this.itensPorPagina);
        if (this.paginaAtual < totalPaginas) { this.paginaAtual++; this.atualizarTabelaPaginada(); }
    }

    configurarEventosResultados() {
        console.log('🔧 Configurando eventos de resultados...');

        const searchInput = document.getElementById('searchResultados');
        if (searchInput) {
            const newSearch = searchInput.cloneNode(true);
            searchInput.parentNode.replaceChild(newSearch, searchInput);
            newSearch.addEventListener('input', () => this.filtrarTabelaResultados());
        }
        ['filtroStatusAdmin', 'filtroPeriodo'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const newEl = el.cloneNode(true);
                el.parentNode.replaceChild(newEl, el);
                newEl.addEventListener('change', () => this.filtrarTabelaResultados());
            }
        });
        const filtroOrdenacao = document.getElementById('filtroOrdenacao');
        if (filtroOrdenacao) {
            const newEl = filtroOrdenacao.cloneNode(true);
            filtroOrdenacao.parentNode.replaceChild(newEl, filtroOrdenacao);
            newEl.addEventListener('change', () => this.ordenarResultados());
        }
    }

    async verResultadoDetalhado(resultadoId) {
        const resultado = this.resultadosCompletos?.find(r => r.id === resultadoId);
        if (!resultado) { this.showToast('❌ Resultado não encontrado', 'error'); return; }
        if (resultado.cancelada === true) {
            this.showToast('ℹ️ Use o ícone de informações', 'info');
            return;
        }

        const dataRealizacao = resultado.dataRealizacao || resultado.createdAt;
        const data = dataRealizacao ? new Date(dataRealizacao).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }) : 'N/A';

        const percentual = resultado.total > 0
            ? ((resultado.acertos / resultado.total) * 100).toFixed(1)
            : '0.0';

        let statusClass = '', statusText = '', statusColor = '', statusIcon = '';
        if (resultado.nota !== null && resultado.nota !== undefined) {
            if (resultado.nota >= 7) {
                statusClass = 'status-aprovado'; statusText = 'Aprovado';
                statusColor = '#28a745'; statusIcon = '✅ ';
            } else {
                statusClass = 'status-reprovado'; statusText = 'Reprovado';
                statusColor = '#dc3545'; statusIcon = '❌ ';
            }
        } else {
            statusClass = 'status-pendente'; statusText = 'Aguardando';
            statusColor = '#ffc107'; statusIcon = '⏳ ';
        }

        let questoesHtml = '';
        if (resultado.resultadoDetalhado && resultado.resultadoDetalhado.length > 0) {
            questoesHtml = '<div style="margin-top:20px;"><h4>📋 Detalhamento</h4>';
            resultado.resultadoDetalhado.forEach((q, index) => {
                const correto = q.correto === true;
                questoesHtml += `
                    <div style="background:${correto ? '#d4edda' : '#f8d7da'};padding:15px;
                        border-radius:8px;margin-bottom:10px;border-left:4px solid ${correto ? '#28a745' : '#dc3545'};">
                        <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                            <strong>Questão ${index + 1}</strong>
                            <span style="color:${correto ? '#28a745' : '#dc3545'};">
                                ${correto ? '✓ Correta' : '✗ Incorreta'}
                            </span>
                        </div>
                        <p style="margin:5px 0;font-size:14px;">${q.pergunta || ''}</p>
                        <p style="margin:3px 0;"><strong>Sua resposta:</strong> <span style="color:${correto ? '#28a745' : '#dc3545'};">${q.respostaAluno || '-'}</span></p>
                        <p style="margin:3px 0;"><strong>Correta:</strong> <span style="color:#28a745;">${q.respostaCorreta || '-'}</span></p>
                        ${q.explicacao ? `<p style="margin:8px 0 0;color:#6c757d;font-size:13px;background:#f8f9fa;padding:8px;border-radius:4px;"><i class="fas fa-lightbulb" style="color:#ffc107;"></i> ${q.explicacao}</p>` : ''}
                    </div>`;
            });
            questoesHtml += '</div>';
        }

        const html = `
            <div style="padding:25px;max-height:70vh;overflow-y:auto;">
                <div style="text-align:center;margin-bottom:25px;">
                    <div style="width:100px;height:100px;background:linear-gradient(135deg,#667eea,#764ba2);
                        border-radius:50%;display:flex;align-items:center;justify-content:center;
                        margin:0 auto 15px;">
                        <span style="font-size:40px;color:white;font-weight:bold;">
                            ${resultado.alunoNome ? resultado.alunoNome.charAt(0).toUpperCase() : 'A'}
                        </span>
                    </div>
                    <h2 style="margin:0;color:#1f2937;font-size:24px;">${resultado.alunoNome || 'Aluno'}</h2>
                    <p style="color:#6b7280;margin:5px 0;">
                        <i class="fas fa-envelope"></i> ${resultado.alunoEmail || 'Email não cadastrado'}
                    </p>
                    <p style="color:#6b7280;font-size:13px;margin:5px 0;">
                        <i class="fas fa-id-card"></i> ${resultado.alunoMatricula || 'Sem matrícula'} •
                        <i class="fas fa-school"></i> ${resultado.alunoTurma || 'Sem turma'}
                    </p>
                    <div style="margin-top:10px;">
                        <span style="display:inline-block;padding:6px 15px;border-radius:30px;
                            font-size:13px;font-weight:600;background:${statusClass === 'status-aprovado' ? '#d4edda' :
                            statusClass === 'status-reprovado' ? '#f8d7da' : '#fff3cd'};
                            color:${statusColor};border:1px solid ${statusColor}40;">
                            ${statusIcon}${statusText}
                        </span>
                    </div>
                </div>

                <div style="background:linear-gradient(135deg,#f8fafc,#f1f5f9);border-radius:12px;
                    padding:20px;margin-bottom:20px;border:1px solid #e2e8f0;">
                    <h3 style="margin:0 0 15px;font-size:16px;color:#334155;">
                        <i class="fas fa-file-alt" style="color:#667eea;"></i> Prova
                    </h3>
                    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:15px;">
                        <div>
                            <div style="font-size:12px;color:#64748b;margin-bottom:4px;">Prova</div>
                            <div style="font-size:16px;font-weight:600;color:#1e293b;">
                                ${resultado.provaTitulo || 'Prova'}
                            </div>
                        </div>
                        <div>
                            <div style="font-size:12px;color:#64748b;margin-bottom:4px;">Data</div>
                            <div style="font-size:14px;color:#334155;">${data}</div>
                        </div>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:15px;margin-bottom:20px;">
                    <div style="text-align:center;background:#f8fafc;padding:20px;border-radius:12px;
                        border:1px solid #e2e8f0;">
                        <div style="font-size:32px;font-weight:700;
                            color:${resultado.nota !== null ? (resultado.nota >= 7 ? '#10b981' : '#ef4444') : '#94a3b8'};">
                            ${resultado.nota !== null ? resultado.nota.toFixed(2) : '-'}
                        </div>
                        <div style="font-size:12px;color:#64748b;margin-top:5px;">Nota Final</div>
                    </div>
                    <div style="text-align:center;background:#f8fafc;padding:20px;border-radius:12px;
                        border:1px solid #e2e8f0;">
                        <div style="font-size:32px;font-weight:700;color:#1e293b;">
                            ${resultado.acertos || 0}/${resultado.total || 0}
                        </div>
                        <div style="font-size:12px;color:#64748b;margin-top:5px;">Acertos • ${percentual}%</div>
                    </div>
                    <div style="text-align:center;background:#f8fafc;padding:20px;border-radius:12px;
                        border:1px solid #e2e8f0;">
                        <div style="font-size:32px;font-weight:700;color:#1e293b;">
                            ${resultado.tempoGasto ? Math.round(resultado.tempoGasto / 60) : 0}
                        </div>
                        <div style="font-size:12px;color:#64748b;margin-top:5px;">Tempo (min)</div>
                    </div>
                </div>

                ${resultado.observacoes ? `
                    <div style="background:#fef9c3;border-left:4px solid #f59e0b;border-radius:8px;
                        padding:15px;margin-bottom:20px;">
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                            <i class="fas fa-pencil-alt" style="color:#f59e0b;"></i>
                            <span style="font-weight:600;color:#92400e;">Observações</span>
                        </div>
                        <p style="margin:0;color:#78350f;font-size:14px;">${resultado.observacoes}</p>
                    </div>` : ''}

                ${questoesHtml}
            </div>`;

        this.abrirModal('<i class="fas fa-eye" style="color:#667eea;"></i> Detalhes do Resultado', html, false);
    }

    async editarResultado(resultadoId) {
        const resultado = this.resultadosCompletos?.find(r => r.id === resultadoId);
        if (!resultado) return;

        const html = `
            <div style="padding:25px;">
                <h3 style="margin:0 0 20px;">Editar - ${resultado.alunoNome}</h3>
                <div style="background:#f8f9fa;padding:15px;border-radius:10px;margin-bottom:20px;">
                    <p><strong>Prova:</strong> ${resultado.provaTitulo}</p>
                    <p><strong>Data:</strong> ${new Date(resultado.dataRealizacao).toLocaleString('pt-BR')}</p>
                </div>
                <div style="margin-bottom:20px;">
                    <label style="display:block;margin-bottom:5px;font-weight:600;">Nota (0-10)</label>
                    <input type="number" id="editNota" min="0" max="10" step="0.1" value="${resultado.nota || 0}"
                        style="width:100%;padding:10px;border:2px solid #dee2e6;border-radius:8px;">
                </div>
                <div style="margin-bottom:20px;">
                    <label style="display:block;margin-bottom:5px;font-weight:600;">Acertos</label>
                    <input type="number" id="editAcertos" min="0" max="${resultado.total || 10}"
                        value="${resultado.acertos}"
                        style="width:100%;padding:10px;border:2px solid #dee2e6;border-radius:8px;">
                </div>
                <div style="margin-bottom:20px;">
                    <label style="display:block;margin-bottom:5px;font-weight:600;">Total de Questões</label>
                    <input type="number" id="editTotal" min="1" value="${resultado.total || 10}"
                        style="width:100%;padding:10px;border:2px solid #dee2e6;border-radius:8px;">
                </div>
                <div style="margin-bottom:20px;">
                    <label style="display:block;margin-bottom:5px;font-weight:600;">Tempo (min)</label>
                    <input type="number" id="editTempo" min="0"
                        value="${Math.round(resultado.tempoGasto / 60) || 0}"
                        style="width:100%;padding:10px;border:2px solid #dee2e6;border-radius:8px;">
                </div>
                <div style="margin-bottom:20px;">
                    <label style="display:block;margin-bottom:5px;font-weight:600;">Observações</label>
                    <textarea id="editObservacoes" rows="3"
                        style="width:100%;padding:10px;border:2px solid #dee2e6;border-radius:8px;">${resultado.observacoes || ''}</textarea>
                </div>
            </div>`;

        this.abrirModal(
            '<i class="fas fa-edit"></i> Editar Resultado',
            html,
            true,
            () => this.salvarEdicaoResultado(resultadoId)
        );
    }

    async salvarEdicaoResultado(resultadoId) {
        try {
            const resultado = this.resultadosCompletos?.find(r => r.id === resultadoId);
            if (!resultado) { this.showToast('❌ Resultado não encontrado', 'error'); return; }

            const isCancelada = (resultado.nota === 0 && resultado.status === 'pendente') ||
                                resultado.cancelada === true || resultado.motivoCancelamento;
            if (isCancelada) { this.showToast('❌ Resultados cancelados não podem ser editados', 'error'); return; }

            const novaNota = parseFloat(document.getElementById('editNota')?.value);
            const novoTotal = parseInt(document.getElementById('editTotal')?.value);
            const novoTempo = parseInt(document.getElementById('editTempo')?.value) * 60;
            const novasObservacoes = document.getElementById('editObservacoes')?.value;
            const novosAcertos = Math.round((novaNota / 10) * novoTotal);

            if (isNaN(novaNota) || novaNota < 0 || novaNota > 10) {
                this.showToast('❌ Nota inválida', 'error');
                return;
            }
            if (isNaN(novoTotal) || novoTotal < 1) {
                this.showToast('❌ Total inválido', 'error');
                return;
            }

            this.showToast('💾 Salvando...', 'info');
            const token = localStorage.getItem('auth_token');

            const response = await fetch(`/api/admin/resultados/${resultadoId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    nota: novaNota,
                    acertos: novosAcertos,
                    total: novoTotal,
                    tempoGasto: novoTempo,
                    observacoes: novasObservacoes,
                    notaLiberada: true
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
            if (!data.success) throw new Error(data.error || 'Erro');

            this.showToast('✅ Resultado atualizado!', 'success');
            this.fecharModal();
            this.filtrarTabelaResultados();
            this.atualizarContadoresCards();
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    async excluirResultado(resultadoId) {
        const resultado = this.resultadosCompletos?.find(r => r.id === resultadoId);
        if (!resultado) return;

        const confirmar = await this.confirmar(
            '🗑️ Excluir Resultado',
            `Excluir PERMANENTEMENTE o resultado de <strong>${resultado.alunoNome}</strong> na prova <strong>${resultado.provaTitulo}</strong>?<br><br>
            <span style="color:#dc3545;">⚠️ Esta ação não pode ser desfeita!</span>`
        );
        if (!confirmar) return;

        try {
            this.showToast('🔄 Excluindo...', 'info');
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/admin/resultados/${resultadoId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            const data = await response.json();
            if (data.success) {
                await this.carregarResultados();
                this.showToast(data.message || '✅ Registro excluído!', 'success');
            } else {
                throw new Error(data.error || 'Erro');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    async enviarLembrete(resultadoId) {
        try {
            const token = localStorage.getItem('auth_token');
            const resultado = this.resultadosCompletos?.find(r => r.id === resultadoId);
            if (!resultado) { this.showToast('❌ Resultado não encontrado', 'error'); return; }

            const confirmar = await this.confirmar(
                '📧 Enviar Lembrete',
                `Enviar lembrete para <strong>${resultado.alunoNome}</strong> sobre <strong>${resultado.provaTitulo}</strong>?`
            );
            if (!confirmar) return;

            this.showToast('📧 Enviando...', 'info');

            const notificacaoResponse = await fetch('/api/notificacoes', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    usuarioId: resultado.alunoId,
                    tipo: 'sistema',
                    titulo: '📝 Lembrete de Prova',
                    mensagem: `Lembrete sobre a prova "${resultado.provaTitulo}".`,
                    icone: '📧',
                    cor: '#3b82f6',
                    prioridade: 1,
                    dados: { tipo: 'lembrete', provaId: resultado.provaId, resultadoId }
                })
            });
            const notifData = await notificacaoResponse.json();
            if (!notifData.success) throw new Error(notifData.error || 'Erro');

            this.showToast('✅ Lembrete enviado!', 'success');
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    async verDetalhesCancelamento(resultadoId) {
        try {
            const resultado = this.resultadosCompletos?.find(r => r.id === resultadoId);
            if (!resultado) { this.showToast('❌ Resultado não encontrado', 'error'); return; }

            const isCancelada = (resultado.nota === 0 && resultado.status === 'pendente') ||
                                resultado.cancelada === true || resultado.motivoCancelamento;
            if (!isCancelada) { this.showToast('❌ Este resultado não foi cancelado', 'error'); return; }

            this.showToast('🔄 Carregando...', 'info');

            const motivo = resultado.motivoCancelamento || '';
            const motivoLower = motivo.toLowerCase();
            const palavrasViolacao = ['violação', 'violacao', 'violou', 'multiplas', 'múltiplas',
                'regras', 'trapaça', 'trapaca', 'fraude', 'atalho', 'f5', 'refresh', 'saiu'];
            const isViolacao = palavrasViolacao.some(p => motivoLower.includes(p)) || resultado.flagViolacao === true;

            const tipo = isViolacao ? 'violacao' : 'prazo';
            const config = {
                'violacao': { cor: '#dc2626', corFundo: '#fee2e2', icone: 'user-slash', titulo: 'CANCELADA - VIOLAÇÃO DAS REGRAS' },
                'prazo': { cor: '#f59e0b', corFundo: '#fef3c7', icone: 'clock', titulo: 'CANCELADA - PRAZO EXPIRADO' }
            }[tipo];

            const dataCancelamento = new Date(resultado.dataRealizacao || resultado.createdAt || new Date());
            const dataFormatada = dataCancelamento.toLocaleString('pt-BR');

            const html = `
                <div style="padding:20px;max-height:70vh;overflow-y:auto;">
                    <div style="text-align:center;margin-bottom:20px;">
                        <div style="width:70px;height:70px;background:${config.corFundo};border-radius:50%;
                            display:flex;align-items:center;justify-content:center;margin:0 auto 15px;
                            border:3px solid ${config.cor};">
                            <i class="fas fa-${config.icone}" style="font-size:30px;color:${config.cor};"></i>
                        </div>
                        <h2 style="color:${config.cor};margin:0;font-size:1.5rem;">${config.titulo}</h2>
                    </div>

                    <div style="background:#f8fafc;border-radius:12px;padding:20px;margin-bottom:20px;
                        border:1px solid #e5e7eb;">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">
                            <div>
                                <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Prova</div>
                                <div style="font-weight:600;color:#1f2937;">${resultado.provaTitulo || 'N/I'}</div>
                            </div>
                            <div>
                                <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Aluno</div>
                                <div style="font-weight:600;color:#1f2937;">${resultado.alunoNome || 'N/I'}</div>
                            </div>
                            <div>
                                <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Data</div>
                                <div style="font-weight:600;color:#1f2937;">${dataFormatada}</div>
                            </div>
                            <div>
                                <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Nota atribuída</div>
                                <div style="font-weight:600;color:${config.cor};">
                                    ${resultado.nota?.toFixed(2) || '0.00'}
                                </div>
                            </div>
                        </div>
                        <div style="margin-top:15px;padding-top:15px;border-top:1px solid #e5e7eb;">
                            <div style="font-size:12px;color:#6b7280;margin-bottom:4px;">Motivo</div>
                            <div style="background:white;padding:12px;border-radius:8px;
                                border:1px solid #e5e7eb;color:#374151;">
                                "${resultado.motivoCancelamento || 'Motivo não especificado'}"
                            </div>
                        </div>
                    </div>

                    <div style="background:#f0f9ff;border-radius:12px;padding:15px;
                        border-left:4px solid #3b82f6;">
                        <div style="display:flex;align-items:center;gap:10px;color:#1e40af;">
                            <i class="fas fa-info-circle"></i>
                            <span style="font-weight:500;">Professor notificado automaticamente</span>
                        </div>
                    </div>
                </div>`;

            this.abrirModal(
                `<i class="fas fa-info-circle" style="color:${config.cor};"></i> Detalhes do Cancelamento`,
                html,
                false
            );
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ Erro ao carregar detalhes', 'error');
        }
    }

    // ============================================================================
    // EXPORTAÇÕES
    // ============================================================================
    exportarResultadosPDF() {
        if (!this.resultadosFiltrados || this.resultadosFiltrados.length === 0) {
            this.showToast('❌ Nenhum resultado para exportar', 'error');
            return;
        }

        this.showToast('📄 Gerando PDF...', 'info');

        try {
            const printWindow = window.open('', '_blank');
            if (!printWindow) {
                this.showToast('⚠️ Permita popups', 'warning');
                return;
            }

            const total = this.resultadosFiltrados.length;
            const aprovados = this.resultadosFiltrados.filter(r => r.nota && r.nota >= 7).length;
            const reprovados = this.resultadosFiltrados.filter(r => r.nota && r.nota < 7).length;
            const notas = this.resultadosFiltrados.filter(r => r.nota);
            const media = notas.length > 0
                ? (notas.reduce((a, r) => a + r.nota, 0) / notas.length).toFixed(2)
                : '0.00';

            const dataAtual = new Date().toLocaleString('pt-BR');

            let html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
                <title>Relatório de Resultados</title>
                <style>
                    body { font-family:'Inter',sans-serif; margin:0; padding:20px; background:#fff; color:#333; }
                    .header { background:linear-gradient(135deg,#667eea,#764ba2); color:white;
                        padding:30px; border-radius:12px; margin-bottom:30px; }
                    .header h1 { margin:0; font-size:28px; }
                    .header p { margin:10px 0 0; opacity:0.9; }
                    .stats-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:20px; margin-bottom:30px; }
                    .stat-card { background:#f8f9fa; padding:20px; border-radius:12px;
                        border-left:4px solid #667eea; }
                    .stat-card .label { font-size:14px; color:#6c757d; margin-bottom:5px; }
                    .stat-card .value { font-size:28px; font-weight:600; color:#333; }
                    table { width:100%; border-collapse:collapse; margin-top:20px; font-size:12px; }
                    th { background:#f1f3f5; padding:12px; text-align:left; font-weight:600; }
                    td { padding:10px 12px; border-bottom:1px solid #e9ecef; }
                    .status-aprovado { background:#d4edda; color:#155724; padding:4px 8px;
                        border-radius:20px; font-size:11px; }
                    .status-reprovado { background:#f8d7da; color:#721c24; padding:4px 8px;
                        border-radius:20px; font-size:11px; }
                    .status-pendente { background:#fff3cd; color:#856404; padding:4px 8px;
                        border-radius:20px; font-size:11px; }
                    .footer { margin-top:30px; text-align:center; color:#6c757d;
                        font-size:12px; border-top:1px solid #e9ecef; padding-top:20px; }
                    @media print { body { print-color-adjust:exact; -webkit-print-color-adjust:exact; } }
                </style></head><body>
                <div class="header">
                    <h1>📊 Relatório de Resultados</h1>
                    <p>Gerado em: ${dataAtual}</p>
                    <p>Total: ${this.resultadosFiltrados.length}</p>
                </div>
                <div class="stats-grid">
                    <div class="stat-card"><div class="label">Total</div><div class="value">${total}</div></div>
                    <div class="stat-card" style="border-left-color:#28a745;">
                        <div class="label">Aprovados</div><div class="value">${aprovados}</div>
                    </div>
                    <div class="stat-card" style="border-left-color:#dc3545;">
                        <div class="label">Reprovados</div><div class="value">${reprovados}</div>
                    </div>
                    <div class="stat-card" style="border-left-color:#ffc107;">
                        <div class="label">Média</div><div class="value">${media}</div>
                    </div>
                </div>
                <table><thead><tr>
                    <th>Aluno</th><th>Email</th><th>Matrícula</th><th>Turma</th>
                    <th>Prova</th><th>Data</th><th>Nota</th><th>Acertos</th><th>Status</th>
                </tr></thead><tbody>`;

            this.resultadosFiltrados.slice(0, 100).forEach(r => {
                const data = r.dataRealizacao ? new Date(r.dataRealizacao).toLocaleDateString('pt-BR') : 'N/A';
                const statusClass = r.nota ? (r.nota >= 7 ? 'status-aprovado' : 'status-reprovado') : 'status-pendente';
                const statusText = r.nota ? (r.nota >= 7 ? 'Aprovado' : 'Reprovado') : 'Pendente';
                html += `<tr>
                    <td>${r.alunoNome || ''}</td><td>${r.alunoEmail || ''}</td>
                    <td>${r.alunoMatricula || ''}</td><td>${r.alunoTurma || ''}</td>
                    <td>${r.provaTitulo || ''}</td><td>${data}</td>
                    <td style="font-weight:600;color:${r.nota ? (r.nota >= 7 ? '#28a745' : '#dc3545') : '#6c757d'};">
                        ${r.nota ? r.nota.toFixed(2) : '-'}
                    </td>
                    <td>${r.acertos}/${r.total}</td>
                    <td><span class="${statusClass}">${statusText}</span></td>
                </tr>`;
            });

            if (this.resultadosFiltrados.length > 100) {
                html += `<tr><td colspan="9" style="text-align:center;padding:15px;color:#6c757d;">
                    Mostrando 100 de ${this.resultadosFiltrados.length}
                </td></tr>`;
            }

            html += `</tbody></table>
                <div class="footer"><p>Relatório gerado pelo EducaPleno</p></div>
            </body></html>`;

            printWindow.document.write(html);
            printWindow.document.close();
            setTimeout(() => { printWindow.focus(); printWindow.print(); }, 500);
            this.showToast('📄 Relatório gerado!', 'success');
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ Erro ao gerar PDF', 'error');
        }
    }

    exportarResultadosCSV() {
        if (!this.resultadosFiltrados || this.resultadosFiltrados.length === 0) {
            this.showToast('❌ Nenhum resultado', 'error');
            return;
        }

        try {
            this.showToast('📥 Gerando CSV...', 'info');

            const headers = ['Aluno', 'Email', 'Matrícula', 'Turma', 'Prova', 'Data',
                'Nota', 'Acertos', 'Total', 'Percentual', 'Tempo (min)', 'Status'];
            let csv = headers.join(',') + '\n';

            this.resultadosFiltrados.forEach(r => {
                const data = r.dataRealizacao ? new Date(r.dataRealizacao).toLocaleDateString('pt-BR') : 'N/A';
                const status = r.nota ? (r.nota >= 7 ? 'Aprovado' : 'Reprovado') : 'Pendente';
                const percentual = r.total > 0 ? Math.round((r.acertos / r.total) * 100) : 0;

                const linha = [
                    `"${(r.alunoNome || '').replace(/"/g, '""')}"`,
                    `"${(r.alunoEmail || '').replace(/"/g, '""')}"`,
                    `"${(r.alunoMatricula || '').replace(/"/g, '""')}"`,
                    `"${(r.alunoTurma || '').replace(/"/g, '""')}"`,
                    `"${(r.provaTitulo || '').replace(/"/g, '""')}"`,
                    `"${data}"`, r.nota || '', r.acertos, r.total, percentual,
                    Math.round(r.tempoGasto / 60) || 0, `"${status}"`
                ].join(',');
                csv += linha + '\n';
            });

            const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `resultados-${new Date().toISOString().slice(0, 10)}.csv`;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            this.showToast('✅ CSV exportado!', 'success');
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ Erro ao exportar', 'error');
        }
    }

    renderSemResultados() {
        return `
            <div style="text-align:center;padding:80px;background:white;border-radius:16px;">
                <i class="fas fa-chart-line" style="font-size:64px;color:#dee2e6;margin-bottom:20px;"></i>
                <h2 style="color:#495057;margin-bottom:10px;">Nenhum resultado</h2>
                <p style="color:#6c757d;margin-bottom:25px;">Ainda não há resultados de provas.</p>
                <button onclick="adminSimples.carregarResultados()"
                    style="background:#0d6efd;color:white;border:none;padding:12px 30px;
                           border-radius:8px;cursor:pointer;font-size:14px;">
                    <i class="fas fa-sync-alt"></i> Atualizar
                </button>
            </div>`;
    }

    renderErro(error) {
        return `
            <div style="text-align:center;padding:80px;background:white;border-radius:16px;">
                <i class="fas fa-exclamation-triangle" style="font-size:64px;color:#dc3545;margin-bottom:20px;"></i>
                <h2 style="color:#721c24;margin-bottom:10px;">Erro ao carregar resultados</h2>
                <p style="color:#6c757d;margin-bottom:25px;">${error}</p>
                <button onclick="adminSimples.carregarResultados()"
                    style="background:#0d6efd;color:white;border:none;padding:12px 30px;
                           border-radius:8px;cursor:pointer;font-size:14px;">
                    <i class="fas fa-sync-alt"></i> Tentar novamente
                </button>
            </div>`;
    }

    // ============================================================================
    // CONFIRMAÇÃO E TOAST
    // ============================================================================
    async confirmar(titulo, mensagem, textoSim = 'Sim', textoNao = 'Não') {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmModal');
            const titleEl = document.getElementById('confirmTitle');
            const messageEl = document.getElementById('confirmMessage');
            const btnSim = document.getElementById('confirmBtn');
            const btnNao = document.querySelector('#confirmModal .btn-cancel');

            if (!modal || !titleEl || !messageEl || !btnSim || !btnNao) {
                console.warn('⚠️ Modal de confirmação não encontrado, assumindo SIM');
                return resolve(true);
            }

            titleEl.innerHTML = titulo;
            messageEl.innerHTML = mensagem;
            btnSim.textContent = textoSim;
            btnNao.textContent = textoNao;

            modal.style.display = 'flex';

            const novoBtnSim = btnSim.cloneNode(true);
            const novoBtnNao = btnNao.cloneNode(true);
            btnSim.parentNode.replaceChild(novoBtnSim, btnSim);
            btnNao.parentNode.replaceChild(novoBtnNao, btnNao);

            const fechar = (resultado) => {
                modal.style.display = 'none';
                resolve(resultado);
            };

            novoBtnSim.addEventListener('click', () => fechar(true));
            novoBtnNao.addEventListener('click', () => fechar(false));

            const closeBtn = modal.querySelector('.modal-close');
            if (closeBtn) {
                const novoClose = closeBtn.cloneNode(true);
                closeBtn.parentNode.replaceChild(novoClose, closeBtn);
                novoClose.addEventListener('click', () => fechar(false));
            }
        });
    }

    fecharConfirmModal() {
        const modal = document.getElementById('confirmModal');
        if (modal) modal.style.display = 'none';
    }

    showToast(mensagem, tipo = 'info', duracao = 3000) {
        let container = document.getElementById('toastContainer');

        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.style.cssText = `position:fixed;top:20px;right:20px;z-index:99999;
                display:flex;flex-direction:column;gap:10px;pointer-events:none;`;
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${tipo}`;
        toast.style.cssText = `background:${tipo === 'success' ? '#10b981' : tipo === 'error' ? '#ef4444' : tipo === 'warning' ? '#f59e0b' : '#3b82f6'};
            color:white;padding:14px 20px;border-radius:12px;font-size:14px;font-weight:500;
            box-shadow:0 4px 12px rgba(0,0,0,0.15);display:flex;align-items:center;gap:10px;
            pointer-events:auto;animation:slideIn 0.3s ease;max-width:400px;`;

        const icone = tipo === 'success' ? 'fa-check-circle'
            : tipo === 'error' ? 'fa-exclamation-circle'
            : tipo === 'warning' ? 'fa-exclamation-triangle'
            : 'fa-info-circle';

        toast.innerHTML = `<i class="fas ${icone}"></i> ${mensagem}`;

        if (!document.getElementById('toastStyle')) {
            const style = document.createElement('style');
            style.id = 'toastStyle';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }`;
            document.head.appendChild(style);
        }

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.transition = 'all 0.3s ease';
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, duracao);
    }

    logout() {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        window.location.href = 'login.html';
    }

    // ============================================================================
    // MENU MOBILE
    // ============================================================================
    abrirMenuLateral() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) sidebar.classList.add('active');
        if (overlay) overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    fecharMenuLateral() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (sidebar) sidebar.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    updateBottomNav(section) {
        document.querySelectorAll('#bottomNavSimples .nav-item-bottom').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.section === section) item.classList.add('active');
        });
    }

} // fim da classe AdminSimples

// ============================================
// INICIALIZAÇÃO
// ============================================
const adminSimples = new AdminSimples();
window.adminSimples = adminSimples;

// ============================================
// FUNÇÕES GLOBAIS
// ============================================

/**
 * Fecha o menu lateral e volta ao topo
 */
function fecharMenuEVoltar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const overlayAlt = document.getElementById('sidebarOverlay');

    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    if (overlayAlt) overlayAlt.classList.remove('active');

    document.body.style.overflow = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Fecha o modal de edição de prova (chamado por botão HTML inline)
 */
function fecharModalEditarSimples() {
    const modal = document.getElementById('modalEditarProvaSimples');
    if (modal) modal.style.display = 'none';
}

/**
 * Formata CPF no input
 */
function formatarCPF(input) {
    let cpf = input.value.replace(/\D/g, '').substring(0, 11);
    if (cpf.length > 9) {
        cpf = cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    } else if (cpf.length > 6) {
        cpf = cpf.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
    } else if (cpf.length > 3) {
        cpf = cpf.replace(/(\d{3})(\d{1,3})/, '$1.$2');
    }
    input.value = cpf;
}

/**
 * Formata telefone no input
 */
function formatarTelefone(input) {
    let telefone = input.value.replace(/\D/g, '').substring(0, 11);
    if (telefone.length > 10) {
        telefone = telefone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
    } else if (telefone.length > 6) {
        telefone = telefone.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
    } else if (telefone.length > 2) {
        telefone = telefone.replace(/(\d{2})(\d{0,5})/, '($1) $2');
    }
    input.value = telefone;
}

// Log de inicialização
console.log('%c✅ admin-simples.js v2.0 carregado com sucesso!',
    'background:#10b981;color:white;padding:4px 12px;border-radius:6px;font-weight:600;');