// frontend/js/admin-simples.js


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
            
            // Se a instância global existe, usa o showToast dela
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

        this.turmasParaSelect = [];
        this.professoresParaSelect = [];
        this.provaGeradaSimples = null;
        this.anexosSimples = [];
        this.arquivosParaUploadSimples = [];
        this.usuariosSelecionados = new Set();
        this.tipoDestinatarioAtual = 'todos';
        this.filtroAtualNotificacao = '';
        this.roleFiltroNotificacao = 'todos';
        this.modoSelecaoIndividual = false;
        this.usuarioIndividualSelecionado = null;

        // ===== NOVAS VARIÁVEIS =====
        this.eixos = [];
        this.cursos = [];
        this.arquivoSelecionado = null;

        // ===== VARIÁVEIS PARA RESULTADOS =====
        this.resultadosCompletos = [];
        this.resultadosFiltrados = [];
        this.paginaAtualResultados = 1;
        this.itensPorPaginaResultados = 15;

        // ===== VARIÁVEIS PARA NOTIFICAÇÕES =====
        this.usuariosParaNotificacao = [];
        this.usuariosSelecionados = new Set();
        this.tipoDestinatarioAtual = 'todos';
        this.filtroAtualNotificacao = '';
        this.modoSelecaoIndividual = false;
        this.usuarioIndividualSelecionado = null;
        this.roleFiltroNotificacao = 'todos';

        this.init();
    }

    async init() {
        console.log('🚀 Inicializando admin simples...');
        await this.verificarAuth();
        this.atualizarDataHora();
        setInterval(() => this.atualizarDataHora(), 1000);

        await this.carregarNotificacoes();
        setInterval(() => this.carregarNotificacoes(), 30000);

        // CARREGAR DADOS AO INICIAR
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
    // FUNÇÕES DE ADAPTAÇÃO DE DOCUMENTOS COM GOOGLE DOCS API
    // ============================================================================

    async abrirModalUploadAdaptarDocumento() {
        console.log('📂 Abrindo modal de adaptação de documentos...');

        const modalBody = document.getElementById('modalBody');
        const modalTitle = document.getElementById('modalTitle');
        const modalSaveBtn = document.getElementById('modalSaveBtn');

        modalTitle.innerHTML = '<i class="fas fa-universal-access"></i> Adaptar Documento';

        modalBody.innerHTML = `
            <div style="padding: 20px;">
                <div class="upload-area" 
                    onclick="document.getElementById('fileInputAdaptar').click()"
                    ondrop="adminSimples.handleDropAdaptar(event)"
                    ondragover="adminSimples.handleDragOverAdaptar(event)"
                    style="
                        background: #f8fafc;
                        border: 3px dashed #cbd5e0;
                        border-radius: 16px;
                        padding: 40px;
                        text-align: center;
                        cursor: pointer;
                        transition: all 0.3s;
                    ">
                    <i class="fas fa-cloud-upload-alt" style="font-size: 48px; color: #667eea; margin-bottom: 15px;"></i>
                    <h4 style="margin: 0 0 5px;">Arraste ou clique para enviar</h4>
                    <p style="margin: 0; color: #718096;">PDF, DOCX, DOC (até 10MB)</p>
                    <p style="margin-top: 10px; font-size: 12px; color: #f59e0b;">
                        <i class="fas fa-info-circle"></i> O documento mantém 100% da formatação original
                    </p>
                </div>
                <input type="file" id="fileInputAdaptar" style="display: none;" accept=".pdf,.docx,.doc" onchange="adminSimples.handleFileSelectAdaptar(event)">
                
                <div id="previewArquivo" style="display: none; margin-top: 20px; padding: 15px; background: #f1f5f9; border-radius: 12px;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <i id="fileIcon" class="fas fa-file-word" style="font-size: 40px; color: #2b5797;"></i>
                        <div style="flex: 1;">
                            <div><strong id="nomeArquivo">-</strong></div>
                            <div><small id="tamanhoArquivo">-</small></div>
                        </div>
                        <button onclick="adminSimples.removerArquivoAdaptar()" style="background: #fee2e2; border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; color: #dc2626;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <div id="opcoesAdaptacao" style="display: none; margin-top: 20px;">
                    <div style="background: #f8fafc; border-radius: 16px; padding: 20px; border: 2px solid #e5e7eb;">
                        <h3 style="margin: 0 0 15px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-universal-access" style="color: #10b981;"></i>
                            Opções de Acessibilidade
                        </h3>
                        
                        <div style="display: flex; flex-direction: column; gap: 15px;">
                            <div style="background: #f1f5f9; padding: 15px; border-radius: 12px;">
                                <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                    <input type="checkbox" id="optFonteAmpliada" onchange="adminSimples.toggleSliderFonte()" style="width: 18px; height: 18px;">
                                    <div>
                                        <strong style="font-size: 1rem;">🔍 Fonte Ampliada</strong>
                                        <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Aumenta o tamanho da fonte</p>
                                    </div>
                                </label>
                                <div id="sliderFonte" style="display: none; margin-top: 15px; padding-top: 10px; border-top: 1px solid #e5e7eb;">
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                        <span>Normal (12pt)</span>
                                        <span id="fonteValue">18pt</span>
                                        <span>Grande (24pt)</span>
                                    </div>
                                    <input type="range" id="fonteSlider" min="12" max="24" step="1" value="18" style="width: 100%;">
                                </div>
                            </div>
                            
                            <div style="background: #f1f5f9; padding: 15px; border-radius: 12px;">
                                <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                    <input type="checkbox" id="optCaixaAlta" style="width: 18px; height: 18px;">
                                    <div>
                                        <strong style="font-size: 1rem;">🔠 CAIXA ALTA (Maiúsculas)</strong>
                                        <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Converte todo o texto para maiúsculas</p>
                                    </div>
                                </label>
                            </div>
                            
                            <div style="background: #f1f5f9; padding: 15px; border-radius: 12px;">
                                <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                    <input type="checkbox" id="optNegrito" style="width: 18px; height: 18px;">
                                    <div>
                                        <strong style="font-size: 1rem;">🔤 Negrito</strong>
                                        <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Deixa o texto em negrito</p>
                                    </div>
                                </label>
                            </div>
                            
                            <div style="background: #f1f5f9; padding: 15px; border-radius: 12px;">
                                <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                    <input type="checkbox" id="optAltoContraste" style="width: 18px; height: 18px;">
                                    <div>
                                        <strong style="font-size: 1rem;">🎨 Alto Contraste</strong>
                                        <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Fundo escuro com texto claro</p>
                                    </div>
                                </label>
                            </div>
                            
                            <div style="background: #f1f5f9; padding: 15px; border-radius: 12px;">
                                <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                    <input type="checkbox" id="optFonteDislexia" style="width: 18px; height: 18px;">
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
                
                <div id="processandoMsg" style="display: none; margin-top: 20px; padding: 15px; background: #e6f7ff; border-radius: 12px; text-align: center;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 20px; color: #1890ff;"></i>
                    <span style="margin-left: 10px;">Processando documento no Google Docs...</span>
                    <div style="font-size: 12px; color: #666; margin-top: 8px;">Isso pode levar alguns segundos</div>
                </div>
            </div>
            
            <style>
                .upload-area:hover {
                    background: #f0f9ff !important;
                    border-color: #667eea !important;
                }
            </style>
        `;

        // 🔥 ABRIR O MODAL PRIMEIRO
        this.abrirModal(modalTitle.innerHTML, modalBody.innerHTML, true);

        // 🔥 DEPOIS DE ABRIR, RECONFIGURAR O BOTÃO (FORÇADAMENTE)
        setTimeout(() => {
            const btn = document.getElementById('modalSaveBtn');
            if (btn) {
                console.log('🔧 Reconfigurando botão do modal de adaptação...');
                btn.removeAttribute('onclick');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-magic"></i> Aplicar Adaptações';
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🔘 Botão de adaptação clicado!');
                    this.aplicarAdaptacoesComGoogle();
                };
                console.log('✅ Botão reconfigurado com sucesso!');
            }
        }, 100);

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

    // ============ HANDLE DROP ============
    handleDropAdaptar(e) {
        e.preventDefault();
        const area = e.currentTarget;
        area.style.background = '';
        area.style.borderColor = '#cbd5e0';

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.processarArquivoAdaptar(files[0]);
        }
    }

    handleDragOverAdaptar(e) {
        e.preventDefault();
        const area = e.currentTarget;
        area.style.background = '#f0f9ff';
        area.style.borderColor = '#667eea';
    }

    handleFileSelectAdaptar(e) {
        const files = e.target.files;
        if (files.length > 0) {
            this.processarArquivoAdaptar(files[0]);
        }
    }

    // ============ PROCESSAR ARQUIVO ============
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

        document.getElementById('previewArquivo').style.display = 'block';
        document.getElementById('nomeArquivo').textContent = file.name;
        document.getElementById('tamanhoArquivo').textContent = `${(file.size / 1024).toFixed(2)} KB`;
        document.getElementById('opcoesAdaptacao').style.display = 'block';
    }

    // ============ REMOVER ARQUIVO ============
    removerArquivoAdaptar() {
        this.arquivoSelecionado = null;
        document.getElementById('previewArquivo').style.display = 'none';
        document.getElementById('opcoesAdaptacao').style.display = 'none';
        document.getElementById('fileInputAdaptar').value = '';
    }

    // ============ TOGGLE SLIDER FONTE ============
    toggleSliderFonte() {
        const slider = document.getElementById('sliderFonte');
        if (slider) {
            slider.style.display = document.getElementById('optFonteAmpliada').checked ? 'block' : 'none';
        }
    }

    // ============ APLICAR ADAPTAÇÕES COM GOOGLE DOCS ============
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

        processandoDiv.style.display = 'block';
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';

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
                // Converter base64 para blob
                const byteCharacters = atob(data.pdf);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);

                // Abrir para impressão
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
            processandoDiv.style.display = 'none';
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = '<i class="fas fa-magic"></i> Aplicar Adaptações';
        }
    }

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
        document.getElementById('adminNome').textContent = userData.nome || 'Administrador';
        document.getElementById('adminEmail').textContent = userData.email || 'admin@iemasaoluiscentro.net';

        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.section === 'dashboard') {
                item.classList.add('active');
            }
        });
    }

    toggleMenu() {
        document.getElementById('sidebar').classList.toggle('active');
    }

    atualizarDataHora() {
        const agora = new Date();
        document.getElementById('datetime').textContent = agora.toLocaleString('pt-BR');
    }
        // ============ SISTEMA DE NOTIFICAÇÕES ============
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
        // Badge da sidebar
        const sidebarBadge = document.getElementById('sidebarNotificacaoBadge');
        if (sidebarBadge) {
            if (total > 0) {
                sidebarBadge.textContent = total > 99 ? '99+' : total;
                sidebarBadge.style.display = 'inline';
            } else {
                sidebarBadge.style.display = 'none';
            }
        }
        
        // Badge do header MOBILE
        const topBadge = document.getElementById('topNotificacaoBadge');
        if (topBadge) {
            if (total > 0) {
                topBadge.textContent = total > 99 ? '99+' : total;
                topBadge.style.display = 'block';
            } else {
                topBadge.style.display = 'none';
            }
        }
        
        // Badge do header DESKTOP
        const topBadgeDesktop = document.getElementById('topNotificacaoBadgeDesktop');
        if (topBadgeDesktop) {
            if (total > 0) {
                topBadgeDesktop.textContent = total > 99 ? '99+' : total;
                topBadgeDesktop.style.display = 'inline';
            } else {
                topBadgeDesktop.style.display = 'none';
            }
        }
        
        // Badge do menu (Usuários)
        const menuBadge = document.getElementById('menuNotificacaoBadge');
        if (menuBadge) {
            if (total > 0) {
                menuBadge.textContent = total > 99 ? '99+' : total;
                menuBadge.style.display = 'inline';
            } else {
                menuBadge.style.display = 'none';
            }
        }
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
        document.getElementById('notificacoesPanel').classList.toggle('active');
        this.carregarNotificacoes();
    }

    fecharPainelNotificacoes() {
        document.getElementById('notificacoesPanel').classList.remove('active');
    }

    async marcarLida(id) {
        try {
            const token = localStorage.getItem('auth_token');

            const response = await fetch(`/api/notificacoes/${id}/lida`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            if (data.success) {
                await this.carregarNotificacoes();
            }
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
        if (notif && notif.link) {
            window.location.href = notif.link;
        }
    }

    // ============ ENVIAR PUSH PARA USUÁRIO ============
    async enviarPushParaUsuario(usuarioId, titulo, mensagem, dados = {}) {
        try {
            const token = localStorage.getItem('auth_token');

            if (!token) {
                console.error('❌ Token não encontrado');
                return false;
            }

            console.log(`📱 Enviando push para usuário ${usuarioId}: ${titulo}`);

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
                    dados: {
                        ...dados,
                        timestamp: Date.now(),
                        origem: 'admin'
                    }
                })
            });

            const data = await response.json();

            if (data.success) {
                console.log('✅ Push enviado com sucesso! ID:', data.notificationId);
                return true;
            } else {
                console.log('⚠️ Push não enviado:', data.error);
                return false;
            }
        } catch (error) {
            console.error('❌ Erro ao enviar push:', error);
            return false;
        }
    }

    // ============ ABRIR MODAL DE ENVIO DE NOTIFICAÇÃO ============
    async abrirModalEnvioNotificacao() {
        console.log('📢 Abrindo modal de envio de notificação...');

        const modalBody = document.getElementById('modalBody');
        const modalTitle = document.getElementById('modalTitle');
        const modalSaveBtn = document.getElementById('modalSaveBtn');

        if (!modalBody || !modalTitle || !modalSaveBtn) {
            console.error('❌ Elementos do modal não encontrados');
            return;
        }

        // Loading
        modalBody.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #4f46e5; border-radius: 50%; margin: 0 auto 15px; animation: spin 1s linear infinite;"></div>
                <p style="color: #6b7280;">Carregando usuários...</p>
            </div>
            <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
        `;

        modalTitle.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Notificação';
        modalSaveBtn.style.display = 'none';

        this.openModal();

        // ===== BUSCAR TODOS OS USUÁRIOS =====
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
                <div style="text-align: center; padding: 40px; color: #dc3545;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; margin-bottom: 15px;"></i>
                    <h3>Erro ao carregar usuários</h3>
                    <p>${error.message}</p>
                    <button onclick="adminSimples.abrirModalEnvioNotificacao()" class="btn-primary" style="margin-top: 15px; padding: 10px 20px; background: #4f46e5; color: white; border: none; border-radius: 8px; cursor: pointer;">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
            return;
        }

        // ===== CONTAGEM POR TODOS OS PERFIS =====
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
            protagonismo: todosUsuarios.filter(u => u.role === 'protagonismo').length
        };

        // ===== ARMAZENAR ESTADO =====
        this.usuariosParaNotificacao = todosUsuarios;
        this.usuariosSelecionados = new Set();
        this.tipoDestinatarioAtual = 'todos';
        this.filtroAtualNotificacao = '';
        this.roleFiltroNotificacao = 'todos';
        this.modoSelecaoIndividual = false;
        this.usuarioIndividualSelecionado = null;

        // ===== RENDERIZAR MODAL =====
        modalBody.innerHTML = `
            <div style="padding: 20px; max-width: 800px;">
                <!-- MODO DE ENVIO (TODOS OU INDIVIDUAL) -->
                <div style="margin-bottom: 20px; background: #f8fafc; border-radius: 12px; padding: 5px; display: flex; gap: 5px;">
                    <button type="button" id="modoTodosBtn" onclick="adminSimples.mudarModoNotificacao('todos')" 
                        style="flex: 1; padding: 12px; border: none; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 14px; transition: all 0.3s; background: #4f46e5; color: white; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <i class="fas fa-users"></i> Enviar para Muitos
                    </button>
                    <button type="button" id="modoIndividualBtn" onclick="adminSimples.mudarModoNotificacao('individual')" 
                        style="flex: 1; padding: 12px; border: none; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 14px; transition: all 0.3s; background: transparent; color: #6b7280; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <i class="fas fa-user"></i> Enviar para Um
                    </button>
                </div>
                
                <!-- CAMPO DE BUSCA INDIVIDUAL -->
                <div id="secaoSelecaoIndividual" style="display: none; margin-bottom: 20px;">
                    <div style="background: linear-gradient(135deg, #4f46e5, #7c3aed); border-radius: 12px; padding: 20px; color: white;">
                        <label style="display: block; margin-bottom: 10px; font-weight: 600; font-size: 0.95rem;">
                            <i class="fas fa-search"></i> Buscar Usuário
                        </label>
                        <div style="position: relative;">
                            <input type="text" id="buscaUsuarioIndividual" 
                                placeholder="Digite o nome, email ou matrícula do usuário..."
                                style="width: 100%; padding: 14px 45px 14px 16px; border: none; border-radius: 10px; font-size: 14px; outline: none; box-sizing: border-box;"
                                oninput="adminSimples.buscarUsuarioIndividual(this.value)"
                                autocomplete="off">
                            <i class="fas fa-search" style="position: absolute; right: 16px; top: 50%; transform: translateY(-50%); color: #9ca3af; font-size: 16px;"></i>
                        </div>
                        
                        <div id="resultadosBuscaIndividual" style="display: none; margin-top: 10px; background: white; border-radius: 10px; max-height: 250px; overflow-y: auto; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                        </div>
                        
                        <div id="usuarioIndividualSelecionado" style="display: none; margin-top: 15px; background: rgba(255,255,255,0.2); border-radius: 10px; padding: 15px;">
                            <div style="display: flex; align-items: center; gap: 12px;">
                                <div id="avatarUsuarioSelecionado" style="width: 50px; height: 50px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #4f46e5; font-size: 18px; flex-shrink: 0;">?</div>
                                <div style="flex: 1; min-width: 0;">
                                    <div id="nomeUsuarioSelecionado" style="font-weight: 600; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></div>
                                    <div id="emailUsuarioSelecionado" style="font-size: 12px; opacity: 0.9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></div>
                                    <div id="roleUsuarioSelecionado" style="font-size: 11px; opacity: 0.8; margin-top: 2px;"></div>
                                </div>
                                <button type="button" onclick="adminSimples.limparSelecaoIndividual()" 
                                    style="background: rgba(255,255,255,0.3); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;"
                                    onmouseover="this.style.background='rgba(255,255,255,0.5)'"
                                    onmouseout="this.style.background='rgba(255,255,255,0.3)'">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- GRID DE PERFIS (para envio em massa) -->
                <div id="secaoPerfisMassa" style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 10px; font-weight: 600; font-size: 0.9rem; color: #374151;">
                        <i class="fas fa-user-tag" style="margin-right: 5px; color: #4f46e5;"></i> Filtrar por Perfil
                    </label>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px;" id="gridPerfisNotificacao">
                        <button type="button" class="perfil-notif-btn active" data-role="todos" onclick="adminSimples.filtrarNotificacaoPorRole('todos')"
                            style="padding: 12px; border: 2px solid #4f46e5; border-radius: 10px; background: #eef2ff; cursor: pointer; text-align: left; transition: all 0.2s;">
                            <div style="font-weight: 700; color: #4f46e5; font-size: 0.9rem;">📋 Todos</div>
                            <div style="font-size: 0.75rem; color: #6b7280; margin-top: 3px;">${c.todos} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="aluno" onclick="adminSimples.filtrarNotificacaoPorRole('aluno')"
                            style="padding: 12px; border: 2px solid #e5e7eb; border-radius: 10px; background: white; cursor: pointer; text-align: left; transition: all 0.2s;">
                            <div style="font-weight: 700; color: #1e40af; font-size: 0.9rem;">👨‍🎓 Alunos</div>
                            <div style="font-size: 0.75rem; color: #6b7280; margin-top: 3px;">${c.aluno} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="professor" onclick="adminSimples.filtrarNotificacaoPorRole('professor')"
                            style="padding: 12px; border: 2px solid #e5e7eb; border-radius: 10px; background: white; cursor: pointer; text-align: left; transition: all 0.2s;">
                            <div style="font-weight: 700; color: #92400e; font-size: 0.9rem;">👨‍🏫 Professores</div>
                            <div style="font-size: 0.75rem; color: #6b7280; margin-top: 3px;">${c.professor} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="admin" onclick="adminSimples.filtrarNotificacaoPorRole('admin')"
                            style="padding: 12px; border: 2px solid #e5e7eb; border-radius: 10px; background: white; cursor: pointer; text-align: left; transition: all 0.2s;">
                            <div style="font-weight: 700; color: #991b1b; font-size: 0.9rem;">👑 Admins</div>
                            <div style="font-size: 0.75rem; color: #6b7280; margin-top: 3px;">${c.admin} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="setor_pedagogico" onclick="adminSimples.filtrarNotificacaoPorRole('setor_pedagogico')"
                            style="padding: 12px; border: 2px solid #e5e7eb; border-radius: 10px; background: white; cursor: pointer; text-align: left; transition: all 0.2s;">
                            <div style="font-weight: 700; color: #7c3aed; font-size: 0.9rem;">👩‍🏫 Pedagógico</div>
                            <div style="font-size: 0.75rem; color: #6b7280; margin-top: 3px;">${c.setor_pedagogico} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="coordenacao_patio" onclick="adminSimples.filtrarNotificacaoPorRole('coordenacao_patio')"
                            style="padding: 12px; border: 2px solid #e5e7eb; border-radius: 10px; background: white; cursor: pointer; text-align: left; transition: all 0.2s;">
                            <div style="font-weight: 700; color: #d97706; font-size: 0.9rem;">🏃 Coord. Pátio</div>
                            <div style="font-size: 0.75rem; color: #6b7280; margin-top: 3px;">${c.coordenacao_patio} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="cozinha" onclick="adminSimples.filtrarNotificacaoPorRole('cozinha')"
                            style="padding: 12px; border: 2px solid #e5e7eb; border-radius: 10px; background: white; cursor: pointer; text-align: left; transition: all 0.2s;">
                            <div style="font-weight: 700; color: #059669; font-size: 0.9rem;">🍽️ Cozinha</div>
                            <div style="font-size: 0.75rem; color: #6b7280; margin-top: 3px;">${c.cozinha} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="gestao_geral" onclick="adminSimples.filtrarNotificacaoPorRole('gestao_geral')"
                            style="padding: 12px; border: 2px solid #e5e7eb; border-radius: 10px; background: white; cursor: pointer; text-align: left; transition: all 0.2s;">
                            <div style="font-weight: 700; color: #1e3c72; font-size: 0.9rem;">📊 Gestão Geral</div>
                            <div style="font-size: 0.75rem; color: #6b7280; margin-top: 3px;">${c.gestao_geral} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="enfermaria" onclick="adminSimples.filtrarNotificacaoPorRole('enfermaria')"
                            style="padding: 12px; border: 2px solid #e5e7eb; border-radius: 10px; background: white; cursor: pointer; text-align: left; transition: all 0.2s;">
                            <div style="font-weight: 700; color: #0891b2; font-size: 0.9rem;">🏥 Enfermaria</div>
                            <div style="font-size: 0.75rem; color: #6b7280; margin-top: 3px;">${c.enfermaria} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="supervisao" onclick="adminSimples.filtrarNotificacaoPorRole('supervisao')"
                            style="padding: 12px; border: 2px solid #e5e7eb; border-radius: 10px; background: white; cursor: pointer; text-align: left; transition: all 0.2s;">
                            <div style="font-weight: 700; color: #1e3a8a; font-size: 0.9rem;">🛡️ Supervisão</div>
                            <div style="font-size: 0.75rem; color: #6b7280; margin-top: 3px;">${c.supervisao} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="psicologia" onclick="adminSimples.filtrarNotificacaoPorRole('psicologia')"
                            style="padding: 12px; border: 2px solid #e5e7eb; border-radius: 10px; background: white; cursor: pointer; text-align: left; transition: all 0.2s;">
                            <div style="font-weight: 700; color: #0d9488; font-size: 0.9rem;">🧠 Psicologia</div>
                            <div style="font-size: 0.75rem; color: #6b7280; margin-top: 3px;">${c.psicologia} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="assistente-social" onclick="adminSimples.filtrarNotificacaoPorRole('assistente-social')"
                            style="padding: 12px; border: 2px solid #e5e7eb; border-radius: 10px; background: white; cursor: pointer; text-align: left; transition: all 0.2s;">
                            <div style="font-weight: 700; color: #7c3aed; font-size: 0.9rem;">🤝 Assist. Social</div>
                            <div style="font-size: 0.75rem; color: #6b7280; margin-top: 3px;">${c['assistente-social']} usuários</div>
                        </button>
                        <button type="button" class="perfil-notif-btn" data-role="protagonismo" onclick="adminSimples.filtrarNotificacaoPorRole('protagonismo')"
                            style="padding: 12px; border: 2px solid #e5e7eb; border-radius: 10px; background: white; cursor: pointer; text-align: left; transition: all 0.2s;">
                            <div style="font-weight: 700; color: #ea580c; font-size: 0.9rem;">⭐ Protagonismo</div>
                            <div style="font-size: 0.75rem; color: #6b7280; margin-top: 3px;">${c.protagonismo} usuários</div>
                        </button>
                    </div>
                </div>
                
                <!-- INFO DESTINATÁRIOS -->
                <div id="infoDestinatariosNotificacao" style="background: #eef2ff; border-left: 4px solid #4f46e5; padding: 12px 15px; border-radius: 8px; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-info-circle" style="font-size: 1.2rem; color: #4f46e5;"></i>
                    <span style="font-size: 0.9rem; color: #1e40af;">
                        <strong>${todosUsuarios.length}</strong> usuário(s) receberão esta notificação
                    </span>
                </div>
                
                <!-- TEMPLATES -->
                <div style="margin-bottom: 20px; background: #f8fafc; border-radius: 8px; padding: 15px; border: 1px solid #e5e7eb;">
                    <label style="display: block; margin-bottom: 10px; font-weight: 600; font-size: 0.9rem; color: #374151;">
                        <i class="fas fa-magic" style="margin-right: 5px; color: #4f46e5;"></i> Modelos Rápidos
                    </label>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px;">
                        <button type="button" onclick="adminSimples.aplicarTemplateMensagem('informativo')" style="padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px; background: white; cursor: pointer; font-size: 0.85rem;">📢 Informativo</button>
                        <button type="button" onclick="adminSimples.aplicarTemplateMensagem('lembrete')" style="padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px; background: white; cursor: pointer; font-size: 0.85rem;">⏰ Lembrete</button>
                        <button type="button" onclick="adminSimples.aplicarTemplateMensagem('urgente')" style="padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px; background: white; cursor: pointer; font-size: 0.85rem;">⚠️ Urgente</button>
                        <button type="button" onclick="adminSimples.aplicarTemplateMensagem('manutencao')" style="padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px; background: white; cursor: pointer; font-size: 0.85rem;">🔧 Manutenção</button>
                    </div>
                </div>
                
                <!-- FORMULÁRIO -->
                <div>
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600; font-size: 0.9rem; color: #374151;">
                            <i class="fas fa-heading" style="margin-right: 5px; color: #4f46e5;"></i> Título
                        </label>
                        <input type="text" id="notificacaoTitulo" placeholder="Ex: Aviso importante" required
                            style="width: 100%; padding: 10px 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 0.9rem; box-sizing: border-box;">
                    </div>
                    
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600; font-size: 0.9rem; color: #374151;">
                            <i class="fas fa-align-left" style="margin-right: 5px; color: #4f46e5;"></i> Mensagem
                        </label>
                        <textarea id="notificacaoMensagem" rows="4" placeholder="Digite sua mensagem..." required
                            style="width: 100%; padding: 10px 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 0.9rem; resize: vertical; min-height: 100px; box-sizing: border-box;"></textarea>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600; font-size: 0.9rem; color: #374151;">
                                <i class="fas fa-palette" style="margin-right: 5px; color: #4f46e5;"></i> Cor
                            </label>
                            <input type="color" id="notificacaoCor" value="#4f46e5"
                                style="width: 100%; height: 42px; padding: 4px; border: 2px solid #e5e7eb; border-radius: 8px; background: white; cursor: pointer;">
                        </div>
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600; font-size: 0.9rem; color: #374151;">
                                <i class="fas fa-star" style="margin-right: 5px; color: #4f46e5;"></i> Prioridade
                            </label>
                            <select id="notificacaoPrioridade" style="width: 100%; padding: 10px 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 0.9rem; background: white;">
                                <option value="1">🔵 Baixa</option>
                                <option value="3" selected>🟡 Média</option>
                                <option value="5">🔴 Alta</option>
                            </select>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 15px;">
                        <div style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                            <input type="checkbox" id="notificacaoPush" checked style="width: 18px; height: 18px; cursor: pointer; accent-color: #4f46e5;">
                            <label for="notificacaoPush" style="font-weight: 500; color: #374151; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                                <i class="fas fa-mobile-alt"></i> Enviar também via Push (celular)
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        `;

        modalSaveBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Notificação';
        modalSaveBtn.onclick = () => this.enviarNotificacaoEmMassa();
        modalSaveBtn.style.display = 'inline-block';

        console.log('✅ Modal renderizado com sucesso!');
    }
        // ============ MUDAR MODO DE NOTIFICAÇÃO ============
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

            infoDestinatarios.innerHTML = `
                <i class="fas fa-info-circle" style="font-size: 1.2rem; color: #4f46e5;"></i>
                <span style="font-size: 0.9rem; color: #1e40af;">
                    Busque e selecione <strong>1 usuário</strong> para enviar a notificação
                </span>
            `;

            setTimeout(() => {
                document.getElementById('buscaUsuarioIndividual')?.focus();
            }, 100);

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
                if (roleFiltro === 'admin') {
                    count = this.usuariosParaNotificacao?.filter(u => u.role === 'admin' || u.role === 'super_admin').length || 0;
                } else {
                    count = this.usuariosParaNotificacao?.filter(u => u.role === roleFiltro).length || 0;
                }
            }

            infoDestinatarios.innerHTML = `
                <i class="fas fa-info-circle" style="font-size: 1.2rem; color: #4f46e5;"></i>
                <span style="font-size: 0.9rem; color: #1e40af;">
                    <strong>${count}</strong> usuário(s) receberão esta notificação
                </span>
            `;
        }
    }

    // ============ BUSCAR USUÁRIO INDIVIDUAL ============
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
                <div style="padding: 20px; text-align: center; color: #6b7280;">
                    <i class="fas fa-search" style="font-size: 24px; margin-bottom: 10px; display: block; opacity: 0.5;"></i>
                    Nenhum usuário encontrado
                </div>
            `;
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
                    style="padding: 12px 15px; display: flex; align-items: center; gap: 12px; cursor: pointer; border-bottom: 1px solid #f3f4f6; transition: all 0.2s;"
                    onmouseover="this.style.background='#f3f4f6'"
                    onmouseout="this.style.background='white'">
                    <div style="width: 42px; height: 42px; background: linear-gradient(135deg, #4f46e5, #7c3aed); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; font-size: 14px; flex-shrink: 0;">
                        ${iniciais}
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 600; color: #1f2937; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${usuario.nome || 'Sem nome'}
                        </div>
                        <div style="font-size: 12px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            ${usuario.email || 'Sem email'}
                        </div>
                    </div>
                    <span style="background: #e0e7ff; color: #4f46e5; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 600; white-space: nowrap;">
                        ${roleIcon} ${roleLabel}
                    </span>
                </div>
            `;
        });

        container.innerHTML = html;
        container.style.display = 'block';
    }

    // ============ SELECIONAR USUÁRIO INDIVIDUAL ============
    selecionarUsuarioIndividual(usuarioId) {
        const usuario = this.usuariosParaNotificacao?.find(u => u._id === usuarioId);
        if (!usuario) {
            this.showToast('❌ Usuário não encontrado', 'error');
            return;
        }

        this.usuarioIndividualSelecionado = usuario;

        const resultadosContainer = document.getElementById('resultadosBuscaIndividual');
        if (resultadosContainer) resultadosContainer.style.display = 'none';

        const buscaInput = document.getElementById('buscaUsuarioIndividual');
        if (buscaInput) buscaInput.value = '';

        const selecionadoDiv = document.getElementById('usuarioIndividualSelecionado');
        if (selecionadoDiv) selecionadoDiv.style.display = 'block';

        const iniciais = (usuario.nome || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        const roleLabel = this.getRoleLabelVincular(usuario.role);
        const roleIcon = this.getRoleIconNotificacao(usuario.role);

        const avatarEl = document.getElementById('avatarUsuarioSelecionado');
        if (avatarEl) avatarEl.textContent = iniciais;

        const nomeEl = document.getElementById('nomeUsuarioSelecionado');
        if (nomeEl) nomeEl.textContent = usuario.nome || 'Sem nome';

        const emailEl = document.getElementById('emailUsuarioSelecionado');
        if (emailEl) emailEl.textContent = usuario.email || 'Sem email';

        const roleEl = document.getElementById('roleUsuarioSelecionado');
        if (roleEl) roleEl.textContent = `${roleIcon} ${roleLabel}`;

        const infoDestinatarios = document.getElementById('infoDestinatariosNotificacao');
        if (infoDestinatarios) {
            infoDestinatarios.innerHTML = `
                <i class="fas fa-check-circle" style="font-size: 1.2rem; color: #10b981;"></i>
                <span style="font-size: 0.9rem; color: #065f46;">
                    <strong>1 usuário selecionado:</strong> ${usuario.nome}
                </span>
            `;
        }

        console.log('✅ Usuário individual selecionado:', usuario.nome);
    }

    // ============ LIMPAR SELEÇÃO INDIVIDUAL ============
    limparSelecaoIndividual() {
        this.usuarioIndividualSelecionado = null;

        const selecionadoDiv = document.getElementById('usuarioIndividualSelecionado');
        if (selecionadoDiv) selecionadoDiv.style.display = 'none';

        const resultadosContainer = document.getElementById('resultadosBuscaIndividual');
        if (resultadosContainer) resultadosContainer.style.display = 'none';

        const infoDestinatarios = document.getElementById('infoDestinatariosNotificacao');
        if (infoDestinatarios) {
            infoDestinatarios.innerHTML = `
                <i class="fas fa-info-circle" style="font-size: 1.2rem; color: #4f46e5;"></i>
                <span style="font-size: 0.9rem; color: #1e40af;">
                    Busque e selecione <strong>1 usuário</strong> para enviar a notificação
                </span>
            `;
        }
    }

    // ============ OBTER ÍCONE DO ROLE ============
    getRoleIconNotificacao(role) {
        const icons = {
            'aluno': '👨‍🎓',
            'professor': '👨‍🏫',
            'admin': '👑',
            'super_admin': '⭐',
            'setor_pedagogico': '👩‍🏫',
            'coordenacao_patio': '🏃',
            'cozinha': '🍽️',
            'gestao_geral': '📊',
            'enfermaria': '🏥',
            'supervisao': '🛡️',
            'psicologia': '🧠',
            'assistente-social': '🤝',
            'protagonismo': '⭐'
        };
        return icons[role] || '👤';
    }

    // ============ FILTRAR NOTIFICAÇÃO POR ROLE ============
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
            if (role === 'admin') {
                usuariosFiltrados = usuariosFiltrados.filter(u => 
                    u.role === 'admin' || u.role === 'super_admin'
                );
            } else {
                usuariosFiltrados = usuariosFiltrados.filter(u => u.role === role);
            }
        }

        const roleLabels = {
            'todos': '📋 Todos os usuários',
            'aluno': '👨‍🎓 Alunos',
            'professor': '👨‍🏫 Professores',
            'admin': '👑 Administradores',
            'setor_pedagogico': '👩‍🏫 Setor Pedagógico',
            'coordenacao_patio': '🏃 Coordenação de Pátio',
            'cozinha': '🍽️ Cozinha',
            'gestao_geral': '📊 Gestão Geral',
            'enfermaria': '🏥 Enfermaria',
            'supervisao': '🛡️ Supervisão',
            'psicologia': '🧠 Psicologia',
            'assistente-social': '🤝 Assistente Social',
            'protagonismo': '⭐ Protagonismo'
        };

        const infoEl = document.getElementById('infoDestinatariosNotificacao');
        if (infoEl) {
            infoEl.innerHTML = `
                <i class="fas fa-info-circle" style="font-size: 1.2rem; color: #4f46e5;"></i>
                <span style="font-size: 0.9rem; color: #1e40af;">
                    <strong>${roleLabels[role] || role}:</strong> 
                    <strong>${usuariosFiltrados.length}</strong> usuário(s) receberão
                </span>
            `;
        }
    }

    // ============================================================================
    // ENVIAR NOTIFICAÇÃO EM MASSA (VERSÃO ATUALIZADA COM MODO INDIVIDUAL)
    // ============================================================================
    async enviarNotificacaoEmMassa() {
        console.log('📤 Iniciando envio de notificação...');

        // ===== 1. COLETAR DADOS DO FORMULÁRIO =====
        const titulo = document.getElementById('notificacaoTitulo')?.value?.trim();
        const mensagem = document.getElementById('notificacaoMensagem')?.value?.trim();
        const cor = document.getElementById('notificacaoCor')?.value || '#4f46e5';
        const prioridade = parseInt(document.getElementById('notificacaoPrioridade')?.value) || 3;
        const enviarPush = document.getElementById('notificacaoPush')?.checked || false;

        // ===== 2. VALIDAÇÕES =====
        if (!titulo) {
            this.showToast('❌ Digite um título para a notificação', 'error');
            return;
        }

        if (!mensagem) {
            this.showToast('❌ Digite uma mensagem para a notificação', 'error');
            return;
        }

        // ===== 3. DETERMINAR DESTINATÁRIOS =====
        let usuariosDestino = [];
        let labelDestinatarios = '';

        if (this.modoSelecaoIndividual) {
            if (!this.usuarioIndividualSelecionado) {
                this.showToast('❌ Selecione um usuário para enviar a notificação', 'error');
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
                usuariosDestino = this.usuariosParaNotificacao.map(u => ({
                    id: u._id,
                    nome: u.nome,
                    email: u.email,
                    role: u.role
                }));
                labelDestinatarios = 'Todos os usuários';
            } 
            else if (roleFiltro === 'admin') {
                usuariosDestino = this.usuariosParaNotificacao
                    .filter(u => u.role === 'admin' || u.role === 'super_admin')
                    .map(u => ({ id: u._id, nome: u.nome, email: u.email, role: u.role }));
                labelDestinatarios = 'Administradores';
            } 
            else {
                usuariosDestino = this.usuariosParaNotificacao
                    .filter(u => u.role === roleFiltro)
                    .map(u => ({ id: u._id, nome: u.nome, email: u.email, role: u.role }));
                labelDestinatarios = roleFiltro;
            }
        }

        // ===== 4. VERIFICAR SE TEM DESTINATÁRIOS =====
        if (usuariosDestino.length === 0) {
            this.showToast(`❌ Nenhum usuário encontrado para: ${labelDestinatarios}`, 'error');
            return;
        }

        console.log(`📤 Enviando para ${usuariosDestino.length} usuários (${labelDestinatarios})`);

        // ===== 5. CONFIRMAR ENVIO =====
        const confirmar = await this.confirmar(
            '📢 Confirmar Envio',
            `
                Deseja enviar esta notificação?<br><br>
                <strong>📋 Destinatários:</strong> ${labelDestinatarios}<br>
                <strong>👥 Total:</strong> ${usuariosDestino.length} usuário(s)<br>
                <strong>📌 Título:</strong> ${titulo}<br>
                <strong>💬 Mensagem:</strong> ${mensagem.substring(0, 100)}${mensagem.length > 100 ? '...' : ''}<br>
                ${enviarPush ? '<br>📱 <strong>Push (celular) ativado</strong>' : '<br>💻 <strong>Apenas no sistema</strong>'}
            `
        );

        if (!confirmar) return;

        // ===== 6. FECHAR MODAL E MOSTRAR PROGRESSO =====
        this.fecharModal();
        this.showToast(`📤 Enviando para ${usuariosDestino.length} usuários...`, 'info');

        // Criar barra de progresso flutuante
        const progressId = 'progresso-notificacao-' + Date.now();
        const progressHTML = `
            <div id="${progressId}" style="
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: white;
                border-radius: 12px;
                padding: 20px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                z-index: 10000;
                min-width: 320px;
                border: 1px solid #e5e7eb;
            ">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 15px;">
                    <div style="
                        width: 40px;
                        height: 40px;
                        background: linear-gradient(135deg, #4f46e5, #7c3aed);
                        border-radius: 10px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        color: white;
                        font-size: 20px;
                    ">
                        <i class="fas fa-paper-plane"></i>
                    </div>
                    <div>
                        <strong style="display: block; color: #1f2937;">Enviando Notificações</strong>
                        <small style="color: #6b7280;">${labelDestinatarios}</small>
                    </div>
                </div>
                
                <div style="
                    background: #f3f4f6;
                    border-radius: 20px;
                    height: 8px;
                    overflow: hidden;
                    margin-bottom: 10px;
                ">
                    <div id="${progressId}-bar" style="
                        background: linear-gradient(90deg, #4f46e5, #7c3aed);
                        height: 100%;
                        width: 0%;
                        transition: width 0.3s ease;
                    "></div>
                </div>
                
                <div style="display: flex; justify-content: space-between; font-size: 0.85rem; color: #4b5563;">
                    <span id="${progressId}-text">Iniciando...</span>
                    <span id="${progressId}-percent">0%</span>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', progressHTML);

        // ===== 7. ENVIAR NOTIFICAÇÕES =====
        let enviados = 0;
        let erros = 0;
        let pushEnviados = 0;
        const token = localStorage.getItem('auth_token');

        for (let i = 0; i < usuariosDestino.length; i++) {
            const usuario = usuariosDestino[i];

            try {
                // 7.1 - CRIAR NOTIFICAÇÃO NO SISTEMA
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

                if (notificacaoData.success) {
                    enviados++;
                } else {
                    console.warn(`⚠️ Erro ao notificar ${usuario.nome}:`, notificacaoData.error);
                    erros++;
                }

                // 7.2 - ENVIAR PUSH (SE ATIVADO)
                if (enviarPush && typeof this.enviarPushParaUsuario === 'function') {
                    try {
                        const pushEnviado = await this.enviarPushParaUsuario(
                            usuario.id,
                            titulo,
                            mensagem,
                            {
                                tipo: 'notificacao_massa',
                                prioridade: prioridade,
                                individual: this.modoSelecaoIndividual
                            }
                        );

                        if (pushEnviado) {
                            pushEnviados++;
                        }
                    } catch (pushError) {
                        console.warn(`⚠️ Erro ao enviar push para ${usuario.nome}:`, pushError);
                    }
                }

            } catch (error) {
                console.error(`❌ Erro ao processar ${usuario.nome}:`, error);
                erros++;
            }

            // 7.3 - ATUALIZAR PROGRESSO
            const percent = Math.round(((i + 1) / usuariosDestino.length) * 100);
            const barElement = document.getElementById(`${progressId}-bar`);
            const textElement = document.getElementById(`${progressId}-text`);
            const percentElement = document.getElementById(`${progressId}-percent`);

            if (barElement) barElement.style.width = `${percent}%`;
            if (percentElement) percentElement.textContent = `${percent}%`;
            if (textElement) {
                textElement.textContent = `${i + 1} de ${usuariosDestino.length}...`;
            }

            // Pequeno delay para não sobrecarregar a API
            if (i < usuariosDestino.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        // ===== 8. FINALIZAR =====
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
                iconeEl.style.background = 'linear-gradient(135deg, #10b981, #059669)';
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

        // ===== 9. MOSTRAR RESULTADO =====
        console.log(`✅ Envio concluído: ${enviados} enviados, ${erros} erros, ${pushEnviados} push`);

        this.showToast(
            `✅ ${enviados} notificações enviadas!${erros > 0 ? ` (${erros} erros)` : ''}`,
            enviados > 0 ? 'success' : 'error'
        );

        if (typeof this.mostrarNotificacaoSistema === 'function') {
            this.mostrarNotificacaoSistema(
                enviados > 0 ? 'success' : 'error',
                '📢 Envio Concluído',
                `<strong>${enviados}</strong> notificações enviadas!<br>
                ${pushEnviados > 0 ? `📱 <strong>${pushEnviados}</strong> push enviados<br>` : ''}
                ${erros > 0 ? `⚠️ <strong>${erros}</strong> falhas` : ''}`,
                6000
            );
        }
    }

    // ============ APLICAR TEMPLATE DE MENSAGEM ============
    aplicarTemplateMensagem(tipo) {
        const tituloInput = document.getElementById('notificacaoTitulo');
        const mensagemInput = document.getElementById('notificacaoMensagem');
        const corInput = document.getElementById('notificacaoCor');

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
            tituloInput.value = template.titulo;
            mensagemInput.value = template.mensagem;
            corInput.value = template.cor;

            this.showToast(`✅ Template "${template.titulo}" aplicado!`, 'success');
        }
    }

    // ============ CONFIGURAR FECHAMENTO DO MODAL ============
    configurarFechamentoModal() {
        const closeBtn = document.querySelector('#modal .modal-close');
        if (closeBtn) {
            const newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

            newCloseBtn.onclick = (e) => {
                e.preventDefault();
                this.fecharModal();
            };
        }

        const modal = document.getElementById('modal');
        if (modal) {
            const newModal = modal.cloneNode(true);
            modal.parentNode.replaceChild(newModal, modal);

            newModal.onclick = (e) => {
                if (e.target === newModal) {
                    this.fecharModal();
                }
            };
        }
    }
        // ============ MUDAR ABA ============
        async mudarAba(aba) {
            this.abaAtual = aba;

            document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
            document.querySelectorAll('.nav-item[data-section="' + aba + '"]').forEach(item => item.classList.add('active'));

            const titulos = {
                dashboard: 'Dashboard',
                usuarios: 'Gerenciar Usuários',
                turmas: 'Gerenciar Turmas',
                provas: 'Gerenciar Provas',
                eixos: 'Gerenciar Eixos',
                cursos: 'Gerenciar Cursos',
                resultados: 'Resultados'
            };
            document.getElementById('pageTitle').textContent = titulos[aba] || 'Dashboard';

            switch(aba) {
                case 'dashboard': await this.carregarDashboard(); break;
                case 'usuarios': await this.carregarUsuarios(); break;
                case 'turmas': await this.carregarTurmas(); break;
                case 'provas': await this.carregarProvas(); break;
                case 'eixos': await this.carregarEixos(); break;
                case 'cursos': await this.carregarCursos(); break;
                case 'resultados': await this.carregarResultados(); break;
            }

            this.fecharPainelNotificacoes();
        }

    // ============ DASHBOARD ============
    async carregarDashboard() {
        const content = document.getElementById('contentArea');

        try {
            const token = localStorage.getItem('auth_token');

            const response = await fetch('/api/admin/dashboard', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();
            const stats = data.success ? data.data : this.getDadosExemplo();

            const hora = new Date().getHours();
            let saudacao = 'Bom dia';
            if (hora >= 12 && hora < 18) saudacao = 'Boa tarde';
            else if (hora >= 18 || hora < 6) saudacao = 'Boa noite';

            const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
            const primeiroNome = (userData.nome || 'Admin').split(' ')[0];

            const hoje = new Date();
            const dataFormatada = hoje.toLocaleDateString('pt-BR', { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
            });
            const horaFormatada = hoje.toLocaleTimeString('pt-BR', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });

            const totalUsuarios = stats.totalUsuarios || 0;
            const totalTurmas = stats.totalTurmas || 0;
            const totalProvas = stats.totalProvas || 0;
            const totalResultados = stats.totalResultados || 0;
            const turmasAtivas = stats.turmasAtivas || 0;
            const provasAtivas = stats.provasPorStatus?.ativa || 0;
            const totalAlunos = stats.totalAlunos || 0;
            const totalProfessores = stats.totalProfessores || 0;

            content.innerHTML = `
                <!-- HEADER DE SAUDAÇÃO -->
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

                <!-- CARDS DE RESUMO -->
                <div class="dashboard-cards-simples">
                    <div class="card-simples usuarios" onclick="adminSimples.mudarAba('usuarios')">
                        <div class="card-simples-icon">
                            <i class="fas fa-users"></i>
                        </div>
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
                        <div class="card-simples-icon">
                            <i class="fas fa-school"></i>
                        </div>
                        <div class="card-simples-content">
                            <div class="card-simples-label">Turmas</div>
                            <div class="card-simples-value">${totalTurmas}</div>
                            <div class="card-simples-detail">
                                <i class="fas fa-check-circle"></i> ${turmasAtivas} ativas
                            </div>
                        </div>
                    </div>

                    <div class="card-simples provas" onclick="adminSimples.mudarAba('provas')">
                        <div class="card-simples-icon">
                            <i class="fas fa-file-alt"></i>
                        </div>
                        <div class="card-simples-content">
                            <div class="card-simples-label">Provas</div>
                            <div class="card-simples-value">${totalProvas}</div>
                            <div class="card-simples-detail">
                                <i class="fas fa-fire"></i> ${provasAtivas} ativas
                            </div>
                        </div>
                    </div>

                    <div class="card-simples resultados" onclick="adminSimples.mudarAba('resultados')">
                        <div class="card-simples-icon">
                            <i class="fas fa-chart-bar"></i>
                        </div>
                        <div class="card-simples-content">
                            <div class="card-simples-label">Resultados</div>
                            <div class="card-simples-value">${totalResultados}</div>
                            <div class="card-simples-detail">
                                <i class="fas fa-check-double"></i> correções
                            </div>
                        </div>
                    </div>
                </div>

                <!-- LAYOUT EM 2 COLUNAS -->
                <div class="dashboard-simples-layout">
                    <div class="dashboard-simples-main">
                        <div class="painel-simples-card">
                            <div class="painel-simples-header">
                                <div class="painel-simples-title">
                                    <i class="fas fa-history"></i>
                                    <h3>Atividades Recentes</h3>
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
                                <div class="painel-simples-title">
                                    <i class="fas fa-chart-pie"></i>
                                    <h3>Estatísticas Rápidas</h3>
                                </div>
                            </div>
                            <div style="padding: 8px;">
                                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
                                    <div style="background: #f0f9ff; padding: 15px; border-radius: 10px; border-left: 3px solid #0891b2;">
                                        <div style="font-size: 11px; color: #0891b2; font-weight: 600; margin-bottom: 5px;">
                                            <i class="fas fa-users"></i> ALUNOS ATIVOS
                                        </div>
                                        <div style="font-size: 22px; font-weight: 700; color: #1f2937;">
                                            ${stats.totalAlunos || 0}
                                        </div>
                                    </div>
                                    
                                    <div style="background: #f0fdf4; padding: 15px; border-radius: 10px; border-left: 3px solid #10b981;">
                                        <div style="font-size: 11px; color: #059669; font-weight: 600; margin-bottom: 5px;">
                                            <i class="fas fa-user-graduate"></i> ACESSIBILIDADE
                                        </div>
                                        <div style="font-size: 22px; font-weight: 700; color: #1f2937;">
                                            ${stats.alunosComAcessibilidade || 0}
                                        </div>
                                    </div>
                                    
                                    <div style="background: #fef3c7; padding: 15px; border-radius: 10px; border-left: 3px solid #f59e0b;">
                                        <div style="font-size: 11px; color: #d97706; font-weight: 600; margin-bottom: 5px;">
                                            <i class="fas fa-question-circle"></i> QUESTÕES
                                        </div>
                                        <div style="font-size: 22px; font-weight: 700; color: #1f2937;">
                                            ${stats.totalQuestoes || 0}
                                        </div>
                                    </div>
                                    
                                    <div style="background: #f3e8ff; padding: 15px; border-radius: 10px; border-left: 3px solid #8b5cf6;">
                                        <div style="font-size: 11px; color: #7c3aed; font-weight: 600; margin-bottom: 5px;">
                                            <i class="fas fa-graduation-cap"></i> CURSOS/EIXOS
                                        </div>
                                        <div style="font-size: 22px; font-weight: 700; color: #1f2937;">
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
                                <div class="painel-simples-title">
                                    <i class="fas fa-bolt"></i>
                                    <h3>Ações Rápidas</h3>
                                </div>
                            </div>
                            <div class="acoes-rapidas-simples">
                                <a class="acao-rapida-simples-item" onclick="adminSimples.mudarAba('usuarios')">
                                    <div class="acao-rapida-simples-icon">
                                        <i class="fas fa-users"></i>
                                    </div>
                                    <span>Gerenciar usuários</span>
                                    <i class="fas fa-chevron-right"></i>
                                </a>
                                <a class="acao-rapida-simples-item" onclick="adminSimples.mudarAba('turmas')">
                                    <div class="acao-rapida-simples-icon">
                                        <i class="fas fa-school"></i>
                                    </div>
                                    <span>Gerenciar turmas</span>
                                    <i class="fas fa-chevron-right"></i>
                                </a>
                                <a class="acao-rapida-simples-item" onclick="adminSimples.mudarAba('provas')">
                                    <div class="acao-rapida-simples-icon">
                                        <i class="fas fa-file-alt"></i>
                                    </div>
                                    <span>Criar prova</span>
                                    <i class="fas fa-chevron-right"></i>
                                </a>
                                <a class="acao-rapida-simples-item" onclick="adminSimples.abrirModalEnvioNotificacao()">
                                    <div class="acao-rapida-simples-icon">
                                        <i class="fas fa-bullhorn"></i>
                                    </div>
                                    <span>Enviar notificação</span>
                                    <i class="fas fa-chevron-right"></i>
                                </a>
                                <a class="acao-rapida-simples-item" onclick="adminSimples.mudarAba('resultados')">
                                    <div class="acao-rapida-simples-icon">
                                        <i class="fas fa-chart-line"></i>
                                    </div>
                                    <span>Ver resultados</span>
                                    <i class="fas fa-chevron-right"></i>
                                </a>
                            </div>
                        </div>

                        <div class="painel-simples-card">
                            <div class="painel-simples-header">
                                <div class="painel-simples-title">
                                    <i class="fas fa-th-large"></i>
                                    <h3>Atalhos</h3>
                                </div>
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
                                <div class="painel-simples-title">
                                    <i class="fas fa-info-circle"></i>
                                    <h3>Info do Sistema</h3>
                                </div>
                            </div>
                            <div class="info-sistema-simples">
                                <div class="info-sistema-item">
                                    <div class="info-sistema-label">
                                        <i class="fas fa-code-branch"></i> Versão
                                    </div>
                                    <div class="info-sistema-valor">1.0.0</div>
                                </div>
                                <div class="info-sistema-item">
                                    <div class="info-sistema-label">
                                        <i class="fas fa-circle"></i> Status
                                    </div>
                                    <div class="info-sistema-valor ok">
                                        <i class="fas fa-circle" style="font-size: 6px;"></i> Online
                                    </div>
                                </div>
                                <div class="info-sistema-item">
                                    <div class="info-sistema-label">
                                        <i class="fas fa-user-shield"></i> Perfil
                                    </div>
                                    <div class="info-sistema-valor">
                                        ${userData.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                                    </div>
                                </div>
                                <div class="info-sistema-item">
                                    <div class="info-sistema-label">
                                        <i class="fas fa-clock"></i> Última sync
                                    </div>
                                    <div class="info-sistema-valor">${horaFormatada}</div>
                                </div>
                                <div class="info-sistema-item">
                                    <div class="info-sistema-label">
                                        <i class="fas fa-database"></i> Último backup
                                    </div>
                                    <div class="info-sistema-valor warning">
                                        <i class="fas fa-exclamation-triangle"></i> Pendente
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

        } catch (error) {
            console.error('❌ Erro ao carregar dashboard:', error);
            content.innerHTML = `
                <div style="text-align: center; padding: 60px; background: white; border-radius: 14px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #dc3545; margin-bottom: 15px;"></i>
                    <h3 style="color: #721c24; margin-bottom: 8px;">Erro ao carregar dashboard</h3>
                    <p style="color: #6c757d; margin-bottom: 20px;">${error.message}</p>
                    <button onclick="adminSimples.carregarDashboard()" class="btn-primary" style="margin: 0 auto;">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    }

    getDadosExemplo() {
        return {
            totalUsuarios: 150,
            totalAlunos: 120,
            totalProfessores: 28,
            totalTurmas: 12,
            turmasAtivas: 10,
            totalProvas: 45,
            provasPorStatus: { ativa: 25 },
            totalResultados: 230,
            mediaGeral: 7.2,
            atividadesRecentes: []
        };
    }

    // ============ GERAR ATIVIDADES RECENTES ============
    gerarAtividades(atividades) {
        if (!atividades || atividades.length === 0) {
            return `
                <div class="empty-dashboard-simples">
                    <i class="fas fa-history"></i>
                    <h4>Nenhuma atividade recente</h4>
                    <p>As atividades do sistema aparecerão aqui</p>
                </div>
            `;
        }

        return atividades.slice(0, 6).map(a => {
            let tipoClass = 'sistema';
            let icone = 'fa-info-circle';

            const acao = (a.acao || '').toLowerCase();

            if (acao.includes('criado') || acao.includes('cadastr') || acao.includes('usuário')) {
                tipoClass = 'cadastro';
                icone = 'fa-user-plus';
            } else if (acao.includes('finalizou') || acao.includes('realizou') || acao.includes('resultado')) {
                tipoClass = 'resultado';
                icone = 'fa-check-circle';
            } else if (acao.includes('prova') || acao.includes('publicad')) {
                tipoClass = 'prova';
                icone = 'fa-file-alt';
            } else if (acao.includes('sistema') || acao.includes('iniciado')) {
                tipoClass = 'sistema';
                icone = 'fa-crown';
            }

            const data = a.data ? new Date(a.data) : new Date();
            const dataFormatada = data.toLocaleDateString('pt-BR', { 
                day: '2-digit', 
                month: '2-digit',
                year: '2-digit'
            });
            const horaFormatada = data.toLocaleTimeString('pt-BR', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });

            return `
                <div class="atividade-simples-item">
                    <div class="atividade-simples-icon ${tipoClass}">
                        <i class="fas ${icone}"></i>
                    </div>
                    <div class="atividade-simples-content">
                        <p><strong>${a.usuario || 'Sistema'}</strong> ${a.acao || ''} ${a.prova ? `<strong>${a.prova}</strong>` : ''}</p>
                        <small>${a.prova ? 'Prova' : 'Sistema'}</small>
                    </div>
                    <div class="atividade-simples-time">
                        ${dataFormatada}<br>${horaFormatada}
                    </div>
                </div>
            `;
        }).join('');
    }

    verHistorico() {
        this.showToast('📊 Redirecionando para histórico...', 'info');
        setTimeout(() => {
            this.showToast('ℹ️ Recurso em desenvolvimento', 'info');
        }, 800);
    }

    // ============ CARREGAR USUÁRIOS ============
    async carregarUsuarios() {
        console.log('📢 CARREGANDO USUÁRIOS...');
        const content = document.getElementById('contentArea');

        content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Carregando usuários...</p></div>';

        try {
            const token = localStorage.getItem('auth_token');
            const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
            const isAdminNormal = userData.role === 'admin';
            const isSuperAdmin = userData.role === 'super_admin';

            const response = await fetch('/api/admin/usuarios?limit=100', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Erro ao carregar usuários');
            }

            let usuarios = data.usuarios || [];

            if (isAdminNormal) {
                const totalAntes = usuarios.length;
                usuarios = usuarios.filter(u => u.role !== 'super_admin');
                console.log(`🔍 Admin normal: removidos ${totalAntes - usuarios.length} super_admins`);
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
                                <th>Nome</th>
                                <th>Email</th>
                                <th>Perfil</th>
                                <th>Matrícula</th>
                                <th>CPF</th>
                                <th>Telefone</th>
                                <th>Status</th>
                                <th>Ações</th>
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
                <div class="error-container" style="text-align: center; padding: 40px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #dc3545; margin-bottom: 15px;"></i>
                    <h3 style="color: #721c24;">Erro ao carregar usuários</h3>
                    <p style="color: #6c757d;">${error.message}</p>
                    <button onclick="adminSimples.carregarUsuarios()" class="btn-primary" style="margin-top: 15px;">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    }

    // ============ GERAR LINHAS USUÁRIOS ============
    gerarLinhasUsuarios(usuarios) {
        const usuariosFiltrados = usuarios.filter(u => u.role !== 'super_admin');

        if (!usuariosFiltrados || usuariosFiltrados.length === 0) {
            return '<tr><td colspan="8" class="empty-state">Nenhum usuário encontrado</td></tr>';
        }

        return usuariosFiltrados.map(u => {
            const cpfFormatado = u.cpf ? u.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '-';
            const telefoneFormatado = u.telefone ? u.telefone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3') : '-';

            let roleBadge = '';

            if (u.role === 'aluno') {
                roleBadge = '<span class="role-badge aluno"><i class="fas fa-user-graduate"></i> Aluno</span>';
            } else if (u.role === 'professor') {
                roleBadge = '<span class="role-badge professor"><i class="fas fa-chalkboard-teacher"></i> Professor</span>';
            } else if (u.role === 'admin') {
                roleBadge = '<span class="role-badge admin"><i class="fas fa-user-shield"></i> Admin</span>';
            } else if (u.role === 'super_admin') {
                roleBadge = '<span class="role-badge super_admin"><i class="fas fa-crown"></i> Super Admin</span>';
            } else if (u.role === 'setor_pedagogico') {
                roleBadge = '<span class="role-badge setor_pedagogico"><i class="fas fa-chalkboard-user"></i> Setor Pedagógico</span>';
            } else if (u.role === 'coordenacao_patio') {
                roleBadge = '<span class="role-badge coordenacao_patio"><i class="fas fa-utensils"></i> Coordenação de Pátio</span>';
            } else if (u.role === 'cozinha') {
                roleBadge = '<span class="role-badge cozinha"><i class="fas fa-kitchen-set"></i> Cozinha</span>';
            } else if (u.role === 'gestao_geral') {
                roleBadge = '<span class="role-badge gestao_geral"><i class="fas fa-chart-line"></i> Gestão Geral</span>';
            } else if (u.role === 'enfermaria') {
                roleBadge = '<span class="role-badge enfermaria"><i class="fas fa-hospital-user"></i> Enfermaria</span>';
            } else if (u.role === 'supervisao') {
                roleBadge = '<span class="role-badge supervisao"><i class="fas fa-shield-alt"></i> Supervisão</span>';
            } else if (u.role === 'psicologia') {
                roleBadge = '<span class="role-badge psicologia"><i class="fas fa-brain"></i> Psicologia</span>';
            } else if (u.role === 'assistente-social') {
                roleBadge = '<span class="role-badge assistente-social"><i class="fas fa-hands-helping"></i> Assistente Social</span>';
            } else if (u.role === 'protagonismo') {
                roleBadge = '<span class="role-badge protagonismo"><i class="fas fa-star"></i> Protagonismo</span>';
            } else {
                roleBadge = `<span class="role-badge">${u.role || 'Desconhecido'}</span>`;
            }

            return `
                <tr>
                    <td><strong>${this.escapeHtml(u.nome) || 'N/A'}</strong></td>
                    <td>${this.escapeHtml(u.email) || '-'}</td>
                    <td>${roleBadge}</td>
                    <td>${this.escapeHtml(u.matricula) || '-'}</td>
                    <td>${cpfFormatado}</td>
                    <td>${telefoneFormatado}</td>
                    <td>
                        <span class="status-badge ${u.ativo ? 'active' : 'inactive'}">
                            ${u.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-icon" onclick="adminSimples.visualizarQRCodeUsuario('${u._id}')" title="Ver QR Code">
                                <i class="fas fa-qrcode" style="color: #8b5cf6;"></i>
                            </button>
                            <button class="btn-icon edit" onclick="adminSimples.editarUsuario('${u._id}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon" onclick="adminSimples.resetarSenha('${u._id}')" title="Resetar senha">
                                <i class="fas fa-key"></i>
                            </button>
                            <button class="btn-icon" onclick="adminSimples.gerarRelatorioUsuario('${u._id}')" title="Gerar relatório">
                                <i class="fas fa-chart-line"></i>
                            </button>
                            <button class="btn-icon ${u.ativo ? 'warning' : 'success'}" 
                                    onclick="adminSimples.inativarAtivarUsuario('${u._id}')" 
                                    title="${u.ativo ? 'Inativar usuário' : 'Ativar usuário'}">
                                <i class="fas ${u.ativo ? 'fa-ban' : 'fa-check-circle'}"></i>
                            </button>
                            <button class="btn-icon delete" onclick="adminSimples.excluirUsuario('${u._id}')" title="Excluir permanentemente">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ============ INATIVAR/ATIVAR USUÁRIO ============
    async inativarAtivarUsuario(id) {
        const usuario = this.usuarios.find(u => u._id === id);
        if (!usuario) {
            this.showToast('❌ Usuário não encontrado', 'error');
            return;
        }

        if (usuario.role === 'super_admin') {
            this.showToast('❌ Não é possível inativar Super Admins', 'error');
            return;
        }

        const novoStatus = !usuario.ativo;
        const acao = novoStatus ? 'ativar' : 'inativar';
        const acaoTexto = novoStatus ? 'ativado' : 'inativado';

        const confirmar = await this.confirmar(
            `${novoStatus ? '✅ Ativar' : '⚠️ Inativar'} Usuário`,
            `Tem certeza que deseja ${acao} o usuário <strong>${usuario.nome}</strong>?<br><br>
            ${!novoStatus ? '<span style="color: #dc3545;">Usuários inativados não poderão acessar o sistema.</span>' : ''}`,
            `Sim, ${acao}`,
            'Cancelar'
        );

        if (!confirmar) return;

        try {
            this.showToast(`🔄 ${acao === 'ativar' ? 'Ativando' : 'Inativando'} usuário...`, 'info');

            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/admin/usuarios/${id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ativo: novoStatus })
            });

            const data = await response.json();

            if (data.success) {
                this.showToast(`✅ Usuário ${acaoTexto} com sucesso!`, 'success');

                usuario.ativo = novoStatus;
                this.atualizarTabelaUsuarios();

                if (typeof this.atualizarDashboard === 'function') {
                    this.carregarDashboard();
                }
            } else {
                throw new Error(data.error || 'Erro ao alterar status');
            }

        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============ EXCLUIR USUÁRIO ============
    async excluirUsuario(id) {
        const usuario = this.usuarios.find(u => u._id === id);
        if (!usuario) {
            this.showToast('❌ Usuário não encontrado', 'error');
            return;
        }

        if (usuario.role === 'super_admin') {
            this.showToast('❌ Não é possível excluir Super Admins', 'error');
            return;
        }

        const confirmar = await this.confirmar(
            '🗑️ Excluir Usuário',
            `Tem certeza que deseja EXCLUIR PERMANENTEMENTE o usuário <strong>${usuario.nome}</strong>?<br><br>
            <span style="color: #dc3545;">⚠️ Esta ação não pode ser desfeita!<br>
            Todos os dados associados a este usuário serão removidos.</span>`,
            'Sim, excluir permanentemente',
            'Cancelar'
        );

        if (!confirmar) return;

        try {
            this.showToast('🗑️ Excluindo usuário...', 'info');

            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/admin/usuarios/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('✅ Usuário excluído com sucesso!', 'success');

                this.usuarios = this.usuarios.filter(u => u._id !== id);
                this.usuariosFiltrados = this.usuariosFiltrados.filter(u => u._id !== id);

                this.atualizarTabelaUsuarios();

                if (typeof this.carregarDashboard === 'function') {
                    this.carregarDashboard();
                }
            } else {
                throw new Error(data.error || 'Erro ao excluir usuário');
            }

        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }
        // ============ GERAR RELATÓRIO DO USUÁRIO ============
    async gerarRelatorioUsuario(id) {
        const usuario = this.usuarios.find(u => u._id === id);
        if (!usuario) {
            this.showToast('❌ Usuário não encontrado', 'error');
            return;
        }

        try {
            this.showToast('📊 Gerando relatório...', 'info');

            const token = localStorage.getItem('auth_token');

            let resultados = [];
            try {
                const response = await fetch(`/api/admin/usuarios/${id}/resultados`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const data = await response.json();
                    if (data.success && data.resultados) {
                        resultados = data.resultados;
                    }
                }
            } catch (error) {
                console.warn('Erro ao buscar resultados:', error);
            }

            const totalProvas = resultados.length;
            const aprovacoes = resultados.filter(r => r.nota && r.nota >= 7).length;
            const reprovacoes = resultados.filter(r => r.nota && r.nota < 7).length;
            const pendentes = resultados.filter(r => !r.nota && !r.cancelada).length;
            const media = resultados.filter(r => r.nota).length > 0 
                ? (resultados.filter(r => r.nota).reduce((acc, r) => acc + r.nota, 0) / resultados.filter(r => r.nota).length).toFixed(2)
                : '0.00';

            const html = `
                <div style="padding: 20px; min-width: 500px;">
                    <div style="text-align: center; margin-bottom: 25px;">
                        <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px;">
                            <span style="font-size: 32px; color: white; font-weight: bold;">
                                ${usuario.nome?.charAt(0).toUpperCase() || 'U'}
                            </span>
                        </div>
                        <h2 style="margin: 0; color: #1f2937;">${usuario.nome || 'Usuário'}</h2>
                        <p style="color: #6b7280; margin: 5px 0;">${usuario.email || ''}</p>
                        <p style="color: #6b7280; font-size: 13px;">
                            Matrícula: ${usuario.matricula || 'Não cadastrada'} • 
                            Perfil: ${usuario.role === 'aluno' ? 'Aluno' : usuario.role === 'professor' ? 'Professor' : usuario.role === 'setor_pedagogico' ? 'Setor Pedagógico' : 'Admin'}
                        </p>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 25px;">
                        <div style="background: #e3f2fd; padding: 15px; border-radius: 12px; text-align: center;">
                            <div style="font-size: 28px; font-weight: bold; color: #1976d2;">${totalProvas}</div>
                            <div style="font-size: 12px; color: #666;">Provas Realizadas</div>
                        </div>
                        <div style="background: #e8f5e9; padding: 15px; border-radius: 12px; text-align: center;">
                            <div style="font-size: 28px; font-weight: bold; color: #388e3c;">${aprovacoes}</div>
                            <div style="font-size: 12px; color: #666;">Aprovações</div>
                        </div>
                        <div style="background: #ffebee; padding: 15px; border-radius: 12px; text-align: center;">
                            <div style="font-size: 28px; font-weight: bold; color: #c62828;">${reprovacoes}</div>
                            <div style="font-size: 12px; color: #666;">Reprovações</div>
                        </div>
                        <div style="background: #fff3e0; padding: 15px; border-radius: 12px; text-align: center;">
                            <div style="font-size: 28px; font-weight: bold; color: #f57c00;">${pendentes}</div>
                            <div style="font-size: 12px; color: #666;">Pendentes</div>
                        </div>
                    </div>

                    <div style="background: #f8fafc; padding: 15px; border-radius: 12px; margin-bottom: 25px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span><strong>Média Geral:</strong></span>
                            <span style="font-size: 24px; font-weight: bold; color: ${parseFloat(media) >= 7 ? '#10b981' : '#ef4444'};">${media}</span>
                        </div>
                        <div style="margin-top: 10px; background: #e5e7eb; border-radius: 10px; height: 8px; overflow: hidden;">
                            <div style="width: ${(parseFloat(media) / 10) * 100}%; height: 100%; background: ${parseFloat(media) >= 7 ? '#10b981' : '#ef4444'}; border-radius: 10px;"></div>
                        </div>
                    </div>
                </div>
            `;

            this.abrirModal(`📊 Relatório - ${usuario.nome}`, html, false);

        } catch (error) {
            console.error('❌ Erro ao gerar relatório:', error);
            this.showToast('❌ Erro ao carregar relatório. Tente novamente.', 'error');
        }
    }

    atualizarTabelaUsuarios() {
        if (!this.usuariosFiltrados) return;

        const inicio = (this.paginaAtualUsuario - 1) * this.itensPorPagina;
        const fim = inicio + this.itensPorPagina;
        const pagina = this.usuariosFiltrados.slice(inicio, fim);

        document.getElementById('tabelaUsuarios').innerHTML = this.gerarLinhasUsuarios(pagina);

        const totalPaginas = Math.ceil(this.usuariosFiltrados.length / this.itensPorPagina);
        document.getElementById('pageInfoUsuario').textContent = `Página ${this.paginaAtualUsuario} de ${totalPaginas}`;
        document.getElementById('btnAnteriorUsuario').disabled = this.paginaAtualUsuario === 1;
        document.getElementById('btnProximaUsuario').disabled = this.paginaAtualUsuario === totalPaginas;
    }

    // ============ FILTRAR USUÁRIOS ============
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

    novoUsuario() {
        this.abrirModalUsuario();
    }

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

    // ============ GERAR SENHA ALEATÓRIA ============
    gerarSenha() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
        let senha = '';
        for (let i = 0; i < 10; i++) {
            senha += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return senha;
    }

    gerarNovaSenha() {
        const input = document.getElementById('senhaUsuario');
        if (input) {
            input.value = this.gerarSenha();
        }
    }

    // ============ VISUALIZAR QR CODE DO USUÁRIO ============
    async visualizarQRCodeUsuario(usuarioId) {
        try {
            console.log('📱 Buscando QR Code do usuário:', usuarioId);
            this.showToast('🔄 Carregando QR Code...', 'info');

            const token = localStorage.getItem('auth_token');

            const response = await fetch(`/api/admin/usuarios/${usuarioId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Erro ao carregar usuário');
            }

            const usuario = data.user;

            let qrCodeDataUrl = usuario.qrCodeUsuario || null;
            let qrCodeGeradoEm = usuario.qrCodeUsuarioGeradoEm || null;

            if (!qrCodeDataUrl) {
                try {
                    const perfilResponse = await fetch('/api/perfil/me', {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    const perfilData = await perfilResponse.json();
                    if (perfilData.success && perfilData.perfil && perfilData.perfil.qrCodeUsuario) {
                        qrCodeDataUrl = perfilData.perfil.qrCodeUsuario;
                        qrCodeGeradoEm = perfilData.perfil.qrCodeUsuarioGeradoEm;
                    }
                } catch (e) {
                    console.log('⚠️ Erro na rota alternativa:', e.message);
                }
            }

            const modalBody = document.getElementById('modalBody');

            let qrCodeHtml = '';
            if (qrCodeDataUrl) {
                qrCodeHtml = `
                    <div style="text-align: center; padding: 20px;">
                        <img src="${qrCodeDataUrl}" alt="QR Code do Usuário" 
                            style="width: 200px; height: 200px; margin: 0 auto; border: 3px solid #e5e7eb; border-radius: 16px; padding: 15px; background: white; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                        <div style="margin-top: 15px;">
                            <p style="font-size: 0.85rem; color: #10b981;">
                                <i class="fas fa-check-circle"></i> QR Code ${qrCodeGeradoEm ? `gerado em ${new Date(qrCodeGeradoEm).toLocaleDateString('pt-BR')}` : 'disponível'}
                            </p>
                            <p style="font-size: 0.8rem; color: #6b7280;">
                                <i class="fas fa-user"></i> <strong>${usuario.nome}</strong>
                            </p>
                            <p style="font-size: 0.75rem; color: #8b5cf6;">
                                <i class="fas fa-arrow-right"></i> <strong>Destino:</strong> ${this.getDestinoLabel(usuario.role)}
                            </p>
                        </div>
                    </div>
                `;
            } else {
                qrCodeHtml = `
                    <div style="text-align: center; padding: 40px;">
                        <i class="fas fa-qrcode" style="font-size: 64px; color: #d1d5db; margin-bottom: 15px;"></i>
                        <h3 style="color: #6b7280;">QR Code não disponível</h3>
                        <p style="color: #9ca3af;">O usuário ainda não possui um QR Code gerado.</p>
                        <div style="margin-top: 15px; padding: 12px; background: #fef3c7; border-radius: 8px;">
                            <i class="fas fa-info-circle" style="color: #f59e0b;"></i>
                            <span style="font-size: 0.85rem; color: #92400e;">O QR Code é gerado automaticamente no cadastro do usuário.</span>
                        </div>
                        <button onclick="adminSimples.gerarQRCodeParaUsuario('${usuarioId}')" 
                            style="margin-top: 20px; padding: 12px 24px; background: #8b5cf6; color: white; border: none; border-radius: 8px; cursor: pointer;">
                            <i class="fas fa-sync-alt"></i> Gerar QR Code
                        </button>
                    </div>
                `;
            }

            modalBody.innerHTML = `
                <div style="padding: 20px; max-height: 70vh; overflow-y: auto;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px;">
                            <i class="fas fa-qrcode" style="font-size: 36px; color: white;"></i>
                        </div>
                        <h2 style="margin: 0; color: #1f2937;">QR Code de Identificação</h2>
                        <p style="color: #6b7280; margin: 5px 0;">
                            <strong>${usuario.nome}</strong> • ${usuario.email}
                        </p>
                    </div>

                    <div style="background: #f8fafc; border-radius: 12px; padding: 15px; margin-bottom: 20px;">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <div>
                                <div style="font-size: 0.7rem; color: #64748b;">Perfil</div>
                                <div style="font-weight: 600;">${this.getRoleLabel(usuario.role)}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: #64748b;">Matrícula</div>
                                <div style="font-weight: 600;">${usuario.matricula || 'Não informada'}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: #64748b;">Status</div>
                                <div><span class="status-badge ${usuario.ativo ? 'active' : 'inactive'}">${usuario.ativo ? 'Ativo' : 'Inativo'}</span></div>
                            </div>
                            <div>
                                <div style="font-size: 0.7rem; color: #64748b;">Destino</div>
                                <div style="font-weight: 600; color: #8b5cf6;">${this.getDestinoLabel(usuario.role)}</div>
                            </div>
                        </div>
                    </div>
                    
                    ${qrCodeHtml}
                    
                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        ${qrCodeDataUrl ? `
                            <button onclick="adminSimples.baixarQRCodeImagem('${qrCodeDataUrl}', '${usuario.nome}')" 
                                style="flex: 1; padding: 12px; background: #8b5cf6; color: white; border: none; border-radius: 8px; cursor: pointer;">
                                <i class="fas fa-download"></i> Baixar QR Code
                            </button>
                        ` : ''}
                        <button onclick="adminSimples.fecharModal()" 
                            style="flex: 1; padding: 12px; background: #6b7280; color: white; border: none; border-radius: 8px; cursor: pointer;">
                            Fechar
                        </button>
                    </div>
                </div>
            `;

            document.getElementById('modalTitle').innerHTML = '<i class="fas fa-qrcode" style="color: #8b5cf6;"></i> QR Code do Usuário';
            document.getElementById('modalSaveBtn').style.display = 'none';

            this.abrirModal(document.getElementById('modalTitle').innerHTML, modalBody.innerHTML, false);

        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============ BAIXAR QR CODE COMO IMAGEM ============
    baixarQRCodeImagem(qrCodeDataUrl, nomeUsuario) {
        try {
            const link = document.createElement('a');
            const nomeArquivo = `qrcode-${nomeUsuario.replace(/\s/g, '-')}-${Date.now()}.png`;
            link.download = nomeArquivo;
            link.href = qrCodeDataUrl;
            link.click();
            this.showToast(`✅ QR Code "${nomeArquivo}" baixado!`, 'success');
        } catch (error) {
            console.error('❌ Erro ao baixar QR Code:', error);
            this.showToast('❌ Erro ao baixar QR Code', 'error');
        }
    }

    async resetarSenha(id) {
        const usuario = this.usuarios.find(u => u._id === id);
        if (!usuario) return;

        if (usuario.role === 'super_admin') {
            this.showToast('❌ Não é possível resetar senha de Super Admins', 'error');
            return;
        }

        const novaSenha = Math.random().toString(36).slice(-8);

        const confirmar = await this.confirmar(
            '🔑 Resetar Senha',
            `Deseja resetar a senha de <strong>${usuario.nome}</strong>?<br><br>Nova senha: <code>${novaSenha}</code>`,
            'Sim, resetar',
            'Cancelar'
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

    // ============ ESCAPAR HTML ============
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

    // ============ ABRIR MODAL USUÁRIO ============
    abrirModalUsuario(usuario = null) {
        console.log('📝 Abrindo modal usuário. Dados:', usuario);

        if (usuario && usuario.role === 'super_admin') {
            this.showToast('❌ Não é possível editar Super Admins', 'error');
            return;
        }

        const modalBody = document.getElementById('modalBody');

        const nome = usuario?.nome || '';
        const email = usuario?.email || '';
        const role = usuario?.role || 'aluno';
        const ativo = usuario?.ativo !== false;
        const id = usuario?._id || usuario?.id || '';
        const cpf = usuario?.cpf || '';
        const telefone = usuario?.telefone || '';
        const matricula = usuario?.matricula || '';
        const curso = usuario?.curso || '';
        const turma = usuario?.turma || '';
        const eixo = usuario?.eixo || '';

        const escapeStr = (str) => String(str || '').replace(/"/g, '&quot;');

        const nomeStr = escapeStr(nome);
        const emailStr = escapeStr(email);
        const cpfStr = escapeStr(cpf);
        const telefoneStr = escapeStr(telefone);
        const matriculaStr = escapeStr(matricula);
        const cursoStr = escapeStr(curso);
        const turmaStr = escapeStr(turma);

        const conteudoHTML = `
            <form id="formUsuario">
                <div class="form-group">
                    <label>Nome</label>
                    <input type="text" id="nomeUsuario" class="form-control" value="${nomeStr}" required>
                </div>
                
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" id="emailUsuario" class="form-control" value="${emailStr}" required>
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
                        <input type="text" id="cpfUsuario" class="form-control" value="${cpfStr}" placeholder="Apenas números">
                    </div>
                    <div class="form-group">
                        <label>Telefone</label>
                        <input type="text" id="telefoneUsuario" class="form-control" value="${telefoneStr}" placeholder="(99) 99999-9999">
                    </div>
                </div>
                
                <div class="form-group">
                    <label>Matrícula</label>
                    <input type="text" id="matriculaUsuario" class="form-control" value="${matriculaStr}">
                </div>
                
                <div id="alunoFields" style="${role === 'aluno' ? 'display: block;' : 'display: none;'}">
                    <div class="form-row">
                        <div class="form-group">
                            <label>Curso</label>
                            <input type="text" id="cursoUsuario" class="form-control" value="${cursoStr}">
                        </div>
                        <div class="form-group">
                            <label>Turma</label>
                            <input type="text" id="turmaUsuario" class="form-control" value="${turmaStr}">
                        </div>
                    </div>
                </div>
                
                <div id="professorFields" style="${role === 'professor' ? 'display: block;' : 'display: none;'}">
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
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="senhaUsuario" class="form-control" value="${this.gerarSenha()}" required>
                        <button type="button" class="btn-icon" onclick="adminSimples.gerarNovaSenha()" title="Gerar nova senha">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </div>
                    <small style="color: #6c757d;">O usuário usará esta senha para fazer login</small>
                </div>
                ` : ''}
                
                <div class="info-card">
                    <i class="fas fa-info-circle"></i>
                    <span>Email institucional (@iemasaoluiscentro.net) é obrigatório</span>
                </div>
            </form>
        `;

        const titulo = usuario ? 
            '<i class="fas fa-edit"></i> Editar Usuário' : 
            '<i class="fas fa-user-plus"></i> Novo Usuário';

        this.abrirModal(titulo, conteudoHTML, true);

        document.getElementById('modalSaveBtn').onclick = () => this.salvarUsuario(id);

        const roleSelect = document.getElementById('roleUsuario');
        if (roleSelect) {
            roleSelect.addEventListener('change', () => this.toggleCamposRole());
        }
    }

    // ============ TOGGLE CAMPOS POR ROLE ============
    toggleCamposRole() {
        const role = document.getElementById('roleUsuario')?.value;

        const alunoFields = document.getElementById('alunoFields');
        const professorFields = document.getElementById('professorFields');
        const setorPedagogicoFields = document.getElementById('setorPedagogicoFields');
        const coordenacaoPatioFields = document.getElementById('coordenacaoPatioFields');
        const cozinhaFields = document.getElementById('cozinhaFields');
        const gestaoGeralFields = document.getElementById('gestaoGeralFields');
        const enfermariaFields = document.getElementById('enfermariaFields');
        const supervisaoFields = document.getElementById('supervisaoFields');
        const psicologiaFields = document.getElementById('psicologiaFields');
        const assistenteSocialFields = document.getElementById('assistenteSocialFields');
        const protagonismoFields = document.getElementById('protagonismoFields');

        if (alunoFields) alunoFields.style.display = role === 'aluno' ? 'block' : 'none';
        if (professorFields) professorFields.style.display = role === 'professor' ? 'block' : 'none';
        if (setorPedagogicoFields) setorPedagogicoFields.style.display = role === 'setor_pedagogico' ? 'block' : 'none';
        if (coordenacaoPatioFields) coordenacaoPatioFields.style.display = role === 'coordenacao_patio' ? 'block' : 'none';
        if (cozinhaFields) cozinhaFields.style.display = role === 'cozinha' ? 'block' : 'none';
        if (gestaoGeralFields) gestaoGeralFields.style.display = role === 'gestao_geral' ? 'block' : 'none';
        if (enfermariaFields) enfermariaFields.style.display = role === 'enfermaria' ? 'block' : 'none';
        if (supervisaoFields) supervisaoFields.style.display = role === 'supervisao' ? 'block' : 'none';
        if (psicologiaFields) psicologiaFields.style.display = role === 'psicologia' ? 'block' : 'none';
        if (assistenteSocialFields) assistenteSocialFields.style.display = role === 'assistente-social' ? 'block' : 'none';
        if (protagonismoFields) protagonismoFields.style.display = role === 'protagonismo' ? 'block' : 'none';
    }

    getRoleLabel(role) {
        const labels = {
            'aluno': 'Aluno',
            'professor': 'Professor',
            'admin': 'Administrador',
            'super_admin': 'Super Administrador',
            'setor_pedagogico': 'Setor Pedagógico',
            'coordenacao_patio': 'Coordenação de Pátio',
            'cozinha': 'Cozinha',
            'gestao_geral': 'Gestão Geral',
            'enfermaria': 'Enfermaria',
            'supervisao': 'Supervisão',
            'psicologia': 'Psicologia',
            'assistente-social': 'Assistente Social',
            'protagonismo': 'Protagonismo'
        };
        return labels[role] || role || 'Desconhecido';
    }

    getRoleLabelVincular(role) {
        const labels = {
            'aluno': 'Aluno',
            'professor': 'Professor',
            'admin': 'Admin',
            'super_admin': 'Super Admin',
            'setor_pedagogico': 'Setor Pedagógico',
            'coordenacao_patio': 'Coord. Pátio',
            'cozinha': 'Cozinha',
            'gestao_geral': 'Gestão Geral',
            'enfermaria': 'Enfermaria',
            'supervisao': 'Supervisão',
            'psicologia': 'Psicologia',
            'assistente-social': 'Assist. Social',
            'protagonismo': 'Protagonismo'
        };
        return labels[role] || role;
    }

    getDestinoLabel(role) {
        const labels = {
            'aluno': '📱 Correção de Prova',
            'professor': '👨‍🏫 Área do Professor',
            'setor_pedagogico': '👩‍🏫 Setor Pedagógico',
            'coordenacao_patio': '🏃 Coordenação de Pátio - Controle de Refeições',
            'cozinha': '🍽️ Cozinha - Monitoramento de Refeições',
            'gestao_geral': '📊 Gestão Geral - Rodízio de Refeições',
            'enfermaria': '🏥 Enfermaria - Atendimentos',
            'supervisao': '🛡️ Supervisão - Ocorrências e Advertências',
            'psicologia': '🧠 Psicologia - Escutas e Crises',
            'assistente-social': '🤝 Assistente Social - Evasão e Vulnerabilidades',
            'protagonismo': '⭐ Protagonismo - Clubes e Eleições',
            'admin': '👑 Área Administrativa',
            'super_admin': '⭐ Super Administrador'
        };
        return labels[role] || 'Área do Sistema';
    }

    async salvarUsuario(id = null) {
        const roleSelecionada = document.getElementById('roleUsuario').value;
        if (roleSelecionada === 'super_admin') {
            this.showToast('❌ Não é possível criar/editar Super Admins', 'error');
            return;
        }

        const dados = {
            nome: document.getElementById('nomeUsuario').value,
            email: document.getElementById('emailUsuario').value,
            role: roleSelecionada,
            ativo: document.getElementById('statusUsuario').value === 'true'
        };

        const cpf = document.getElementById('cpfUsuario')?.value;
        const telefone = document.getElementById('telefoneUsuario')?.value;
        const matricula = document.getElementById('matriculaUsuario')?.value;

        if (cpf) dados.cpf = cpf;
        if (telefone) dados.telefone = telefone;
        if (matricula) dados.matricula = matricula;

        if (roleSelecionada === 'aluno') {
            dados.curso = document.getElementById('cursoUsuario')?.value;
            dados.turma = document.getElementById('turmaUsuario')?.value;
        } else if (roleSelecionada === 'professor') {
            dados.eixo = document.getElementById('eixoUsuario')?.value;
        }

        if (!id) {
            const senha = document.getElementById('senhaUsuario')?.value;
            if (senha) dados.password = senha;
        }

        this.showToast('Salvando...', 'info');

        try {
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
                this.showToast(id ? 'Usuário atualizado!' : 'Usuário criado!', 'success');
                this.fecharModal();
                await this.carregarUsuarios();
            } else {
                throw new Error(data.error || 'Erro ao salvar');
            }
        } catch (error) {
            this.showToast('❌ ' + error.message, 'error');
        }
    }
        // ============ TURMAS ============
    async carregarTurmas() {
        const content = document.getElementById('contentArea');
        content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Carregando turmas...</p></div>';

        try {
            const response = await fetch('/api/admin/turmas?limit=100', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });

            const data = await response.json();
            this.turmas = data.success ? data.turmas : [];

            content.innerHTML = `
                <div class="section-header">
                    <h2><i class="fas fa-school"></i> Turmas</h2>
                    <button class="btn-primary" onclick="adminSimples.novaTurma()">
                        <i class="fas fa-plus"></i> Nova
                    </button>
                </div>

                <div class="filters-bar">
                    <div class="filter-group">
                        <label>Buscar</label>
                        <input type="text" id="buscaTurma" placeholder="Nome ou código..." 
                            class="form-control" onkeyup="adminSimples.filtrarTurmas()">
                    </div>
                </div>

                <div class="table-responsive">
                    <table>
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>Disciplina</th>
                                <th>Eixo</th>
                                <th>Código</th>
                                <th>Alunos</th>
                                <th>Provas</th>
                                <th>Status</th>
                                <th>Ações</th>
                            </tr>
                        </thead>
                        <tbody id="tabelaTurmas">
                            ${this.gerarLinhasTurmas(this.turmas)}
                        </tbody>
                    </table>
                </div>

                <div class="pagination">
                    <button class="btn-pagination" onclick="adminSimples.paginaAnterior('turmas')" id="btnAnteriorTurma">Anterior</button>
                    <span id="pageInfoTurma">Página 1</span>
                    <button class="btn-pagination" onclick="adminSimples.proximaPagina('turmas')" id="btnProximaTurma">Próxima</button>
                </div>
            `;

            this.paginaAtualTurma = 1;
            this.turmasFiltradas = [...this.turmas];
            this.atualizarTabelaTurmas();

        } catch (error) {
            content.innerHTML = `<p style="color: red;">Erro: ${error.message}</p>`;
        }
    }

    // ============ GERAR LINHAS DA TABELA DE TURMAS ============
    gerarLinhasTurmas(turmas) {
        if (!turmas || turmas.length === 0) {
            return '<tr><td colspan="8" class="empty-state" style="text-align: center; padding: 40px; color: #6c757d;">Nenhuma turma encontrada</td></tr>';
        }

        return turmas.map(t => {
            const id = t.id || t._id;

            return `
                <tr>
                    <td>
                        <strong>${t.nome || 'N/A'}</strong>
                        ${t.codigo ? `<br><small style="color: #6c757d;">Cód: ${t.codigo}</small>` : ''}
                    </td>
                    <td>${t.disciplina || '-'}</td>
                    <td>${t.eixo || '-'}</td>
                    <td><code>${t.codigo || '-'}</code></td>
                    <td style="text-align: center;">
                        <button class="btn-icon" onclick="adminSimples.verAlunosTurma('${id}')" title="Ver alunos" style="background: #3498db; color: white; width: 28px; height: 28px; border-radius: 4px;">
                            <i class="fas fa-users"></i>
                        </button>
                        <span style="margin-left: 5px; font-weight: 600;">${t.totalAlunos || 0}</span>
                    </td>
                    <td style="text-align: center;">
                        <button class="btn-icon" onclick="adminSimples.verProvasTurma('${id}')" title="Ver provas" style="background: #9b59b6; color: white; width: 28px; height: 28px; border-radius: 4px;">
                            <i class="fas fa-file-alt"></i>
                        </button>
                        <span style="margin-left: 5px; font-weight: 600;">${t.totalProvas || 0}</span>
                    </td>
                    <td>
                        <span class="status-badge ${t.ativa ? 'active' : 'inactive'}">
                            ${t.ativa ? 'Ativa' : 'Inativa'}
                        </span>
                    </td>
                    <td>
                        <div class="action-buttons" style="display: flex; gap: 5px; flex-wrap: wrap;">
                            <button class="btn-icon edit" onclick="adminSimples.editarTurma('${id}')" title="Editar turma">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon" onclick="adminSimples.verDetalhesTurma('${id}')" title="Ver detalhes">
                                <i class="fas fa-eye"></i>
                            </button>
                            <button class="btn-icon ${t.ativa ? 'warning' : 'success'}" 
                                    onclick="adminSimples.inativarAtivarTurma('${id}')" 
                                    title="${t.ativa ? 'Inativar turma' : 'Ativar turma'}">
                                <i class="fas ${t.ativa ? 'fa-ban' : 'fa-check-circle'}"></i>
                            </button>
                            <button class="btn-icon delete" onclick="adminSimples.excluirTurma('${id}')" title="Excluir turma">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    atualizarTabelaTurmas() {
        if (!this.turmasFiltradas) return;

        const inicio = (this.paginaAtualTurma - 1) * this.itensPorPagina;
        const fim = inicio + this.itensPorPagina;
        const pagina = this.turmasFiltradas.slice(inicio, fim);

        document.getElementById('tabelaTurmas').innerHTML = this.gerarLinhasTurmas(pagina);

        const totalPaginas = Math.ceil(this.turmasFiltradas.length / this.itensPorPagina);
        document.getElementById('pageInfoTurma').textContent = `Página ${this.paginaAtualTurma} de ${totalPaginas}`;
        document.getElementById('btnAnteriorTurma').disabled = this.paginaAtualTurma === 1;
        document.getElementById('btnProximaTurma').disabled = this.paginaAtualTurma === totalPaginas;
    }

    filtrarTurmas() {
        const busca = document.getElementById('buscaTurma')?.value.toLowerCase() || '';

        this.turmasFiltradas = this.turmas.filter(t => 
            (t.nome && t.nome.toLowerCase().includes(busca)) ||
            (t.codigo && t.codigo.toLowerCase().includes(busca))
        );

        this.paginaAtualTurma = 1;
        this.atualizarTabelaTurmas();
    }

    novaTurma() {
        this.abrirModalTurma();
    }

    // ============ EDITAR TURMA ============
    editarTurma(id) {
        console.log('✏️ Editando turma ID:', id);

        const turma = this.turmas.find(t => t.id === id || t._id === id);

        if (!turma) {
            console.error('❌ Turma não encontrada!');
            this.showToast('❌ Turma não encontrada', 'error');
            return;
        }

        this.abrirModalTurma(turma);
    }

    // ============ INATIVAR/ATIVAR TURMA ============
    async inativarAtivarTurma(id) {
        const turma = this.turmas.find(t => t.id === id || t._id === id);
        if (!turma) {
            this.showToast('❌ Turma não encontrada', 'error');
            return;
        }

        const novoStatus = !turma.ativa;
        const acao = novoStatus ? 'ativar' : 'inativar';
        const acaoTexto = novoStatus ? 'ativada' : 'inativada';

        const confirmar = await this.confirmar(
            `${novoStatus ? '✅ Ativar' : '⚠️ Inativar'} Turma`,
            `Tem certeza que deseja ${acao} a turma <strong>${turma.nome}</strong>?<br><br>
            ${!novoStatus ? '<span style="color: #dc3545;">Turmas inativadas não aparecerão em novas provas e alunos não poderão ser matriculados.</span>' : ''}`,
            `Sim, ${acao}`,
            'Cancelar'
        );

        if (!confirmar) return;

        try {
            this.showToast(`🔄 ${acao === 'ativar' ? 'Ativando' : 'Inativando'} turma...`, 'info');

            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/admin/turmas/${id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ativa: novoStatus })
            });

            const data = await response.json();

            if (data.success) {
                this.showToast(`✅ Turma ${acaoTexto} com sucesso!`, 'success');

                turma.ativa = novoStatus;

                const turmaFiltrada = this.turmasFiltradas.find(t => (t.id === id || t._id === id));
                if (turmaFiltrada) turmaFiltrada.ativa = novoStatus;

                this.atualizarTabelaTurmas();

                if (typeof this.carregarDashboard === 'function') {
                    this.carregarDashboard();
                }
            } else {
                throw new Error(data.error || 'Erro ao alterar status');
            }

        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============ EXCLUIR TURMA ============
    async excluirTurma(id) {
        const turma = this.turmas.find(t => t.id === id || t._id === id);
        if (!turma) {
            this.showToast('❌ Turma não encontrada', 'error');
            return;
        }

        const temProvas = turma.totalProvas > 0;
        const temAlunos = turma.totalAlunos > 0;

        let mensagemAdicional = '';
        if (temProvas) {
            mensagemAdicional += `<br><span style="color: #dc3545;">⚠️ Esta turma possui ${turma.totalProvas} prova(s) associada(s). Ao excluir a turma, todas as provas também serão removidas!</span>`;
        }
        if (temAlunos) {
            mensagemAdicional += `<br><span style="color: #dc3545;">⚠️ Esta turma possui ${turma.totalAlunos} aluno(s) matriculado(s). A exclusão removerá a vinculação desses alunos com a turma!</span>`;
        }

        const confirmar = await this.confirmar(
            '🗑️ Excluir Turma',
            `Tem certeza que deseja EXCLUIR PERMANENTEMENTE a turma <strong>${turma.nome}</strong>?<br><br>
            <span style="color: #dc3545;">⚠️ Esta ação não pode ser desfeita!</span>
            ${mensagemAdicional}`,
            'Sim, excluir permanentemente',
            'Cancelar'
        );

        if (!confirmar) return;

        try {
            this.showToast('🗑️ Excluindo turma...', 'info');

            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/admin/turmas/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('✅ Turma excluída com sucesso!', 'success');

                this.turmas = this.turmas.filter(t => t.id !== id && t._id !== id);
                this.turmasFiltradas = this.turmasFiltradas.filter(t => t.id !== id && t._id !== id);

                this.atualizarTabelaTurmas();

                if (typeof this.carregarDashboard === 'function') {
                    this.carregarDashboard();
                }
            } else {
                throw new Error(data.error || 'Erro ao excluir turma');
            }

        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============ VER ALUNOS DA TURMA ============
    async verAlunosTurma(id) {
        const turma = this.turmas.find(t => t.id === id || t._id === id);
        if (!turma) return;

        try {
            this.showToast('👥 Carregando alunos...', 'info');

            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/turmas/${id}/alunos`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            let alunos = [];
            if (data.success && data.alunos) {
                alunos = data.alunos;
            } else if (Array.isArray(data)) {
                alunos = data;
            }

            alunos = alunos.map(aluno => {
                if (aluno.status !== undefined) {
                    aluno.ativo = aluno.status === 'ativo' || aluno.status === true;
                }
                if (aluno.ativo === undefined) {
                    aluno.ativo = true;
                }
                return aluno;
            });

            let alunosHtml = `
                <div style="padding: 25px; min-width: 800px; max-width: 1000px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; flex-wrap: wrap; gap: 15px;">
                        <div>
                            <h2 style="margin: 0 0 5px; display: flex; align-items: center; gap: 12px;">
                                <i class="fas fa-users" style="color: #3498db; font-size: 28px;"></i> 
                                ${turma.nome}
                            </h2>
                            <div style="color: #6c757d; font-size: 13px;">
                                <i class="fas fa-tag"></i> Código: ${turma.codigo || 'N/A'} | 
                                <i class="fas fa-book"></i> Disciplina: ${turma.disciplina || 'N/A'} | 
                                <i class="fas fa-layer-group"></i> Eixo: ${turma.eixo || 'N/A'}
                            </div>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 20px; display: flex; gap: 15px; align-items: center;">
                        <div style="background: #e3f2fd; padding: 8px 16px; border-radius: 20px;">
                            <i class="fas fa-user-graduate" style="color: #1976d2;"></i> 
                            <strong>${alunos.length}</strong> alunos matriculados
                        </div>
                        <div style="background: #e8f5e9; padding: 8px 16px; border-radius: 20px;">
                            <i class="fas fa-check-circle" style="color: #388e3c;"></i> 
                            <strong>${alunos.filter(a => a.ativo).length}</strong> ativos
                        </div>
                    </div>
                    
                    <div class="table-responsive" style="border-radius: 12px; overflow: auto; border: 1px solid #e5e7eb; max-height: 500px;">
                        <table style="width: 100%; border-collapse: collapse; min-width: 600px;">
                            <thead style="position: sticky; top: 0; z-index: 10;">
                                <tr style="background: linear-gradient(135deg, #667eea, #764ba2); color: white;">
                                    <th style="padding: 14px 16px; text-align: left; font-size: 14px;">Nome</th>
                                    <th style="padding: 14px 16px; text-align: left; font-size: 14px;">Email</th>
                                    <th style="padding: 14px 16px; text-align: center; font-size: 14px;">Matrícula</th>
                                    <th style="padding: 14px 16px; text-align: center; font-size: 14px;">Status</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            if (alunos.length === 0) {
                alunosHtml += `
                    <tr>
                        <td colspan="4" style="padding: 60px; text-align: center;">
                            <i class="fas fa-user-graduate" style="font-size: 64px; color: #dee2e6; margin-bottom: 15px; display: block;"></i>
                            <h3 style="color: #6c757d; margin-bottom: 10px;">Nenhum aluno matriculado</h3>
                        </td>
                    </tr>
                `;
            } else {
                alunos.forEach(aluno => {
                    const estaAtivo = aluno.ativo === true || aluno.ativo === 'true' || aluno.status === 'ativo';
                    const statusBg = estaAtivo ? '#d1fae5' : '#fee2e2';
                    const statusColor = estaAtivo ? '#10b981' : '#ef4444';
                    const statusText = estaAtivo ? 'Ativo' : 'Inativo';

                    alunosHtml += `
                        <tr style="border-bottom: 1px solid #e5e7eb;">
                            <td style="padding: 14px 16px;">
                                <div style="display: flex; align-items: center; gap: 12px;">
                                    <div style="width: 36px; height: 36px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px;">
                                        ${aluno.nome?.charAt(0).toUpperCase() || '?'}
                                    </div>
                                    <strong style="font-size: 14px;">${this.escapeHtml(aluno.nome) || 'N/A'}</strong>
                                </div>
                            </td>
                            <td style="padding: 14px 16px; color: #6b7280; font-size: 13px;">${this.escapeHtml(aluno.email) || '-'}</td>
                            <td style="padding: 14px 16px; text-align: center; font-family: monospace; font-size: 13px;">${aluno.matricula || '-'}</td>
                            <td style="padding: 14px 16px; text-align: center;">
                                <span style="display: inline-block; padding: 5px 14px; border-radius: 30px; font-size: 12px; font-weight: 600; background: ${statusBg}; color: ${statusColor};">
                                    ${estaAtivo ? '✅' : '❌'} ${statusText}
                                </span>
                            </td>
                        </tr>
                    `;
                });
            }

            alunosHtml += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            this.abrirModalMaior(`👥 Gerenciar Alunos - ${turma.nome}`, alunosHtml, false);

        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============ ABRIR MODAL MAIOR ============
    abrirModalMaior(titulo, conteudo, salvar = false) {
        console.log('📂 Abrindo modal maior:', { titulo, salvar });

        const modal = document.getElementById('modal');
        const modalContent = modal.querySelector('.modal-content');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        const modalSaveBtn = document.getElementById('modalSaveBtn');

        if (!modal || !modalContent || !modalTitle || !modalBody) {
            console.error('❌ Elementos do modal não encontrados');
            return;
        }

        const originalStyle = modalContent.style.cssText;

        modalContent.style.cssText = `
            width: 90%;
            max-width: 1100px;
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.2);
            max-height: 90vh;
            overflow-y: auto;
        `;

        modalTitle.innerHTML = titulo || 'Título';
        modalBody.innerHTML = conteudo || '<p style="padding: 20px; text-align: center;">Nenhum conteúdo disponível</p>';

        if (modalSaveBtn) {
            modalSaveBtn.style.display = salvar ? 'inline-block' : 'none';
            modalSaveBtn.onclick = null;
        }

        modal.style.display = 'flex';

        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'style' && modal.style.display === 'none') {
                    modalContent.style.cssText = originalStyle;
                    observer.disconnect();
                }
            });
        });
        observer.observe(modal, { attributes: true });
    }

    // ============ VER PROVAS DA TURMA ============
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
                this.showToast('ℹ️ Nenhuma prova cadastrada para esta turma', 'info');
                return;
            }

            let provasHtml = `
                <div style="padding: 20px; max-height: 60vh; overflow-y: auto;">
                    <h3 style="margin: 0 0 15px; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-file-alt" style="color: #3498db;"></i> 
                        Provas da Turma: ${turma.nome}
                        <span style="font-size: 14px; color: #6c757d;">(${provas.length} provas)</span>
                    </h3>
                    <div class="table-responsive">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: #f8f9fa;">
                                    <th style="padding: 10px; text-align: left;">Título</th>
                                    <th style="padding: 10px; text-align: left;">Professor</th>
                                    <th style="padding: 10px; text-align: center;">Data Limite</th>
                                    <th style="padding: 10px; text-align: center;">Status</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            provas.forEach(prova => {
                const agora = new Date();
                const dataLimite = prova.dataLimite ? new Date(prova.dataLimite) : null;

                let statusClass = '';
                let statusText = '';

                if (prova.cancelada) {
                    statusClass = 'inactive';
                    statusText = 'Cancelada';
                } else if (!prova.publicada) {
                    statusClass = 'pending';
                    statusText = 'Rascunho';
                } else if (dataLimite && dataLimite < agora) {
                    statusClass = 'inactive';
                    statusText = 'Expirada';
                } else {
                    statusClass = 'active';
                    statusText = 'Ativa';
                }

                provasHtml += `
                    <tr style="border-bottom: 1px solid #e9ecef;">
                        <td style="padding: 10px;"><strong>${prova.titulo || 'N/A'}</strong></td>
                        <td style="padding: 10px;">${prova.professor?.nome || prova.professor || '-'}</td>
                        <td style="padding: 10px; text-align: center;">${dataLimite ? dataLimite.toLocaleDateString('pt-BR') : 'Sem data'}</td>
                        <td style="padding: 10px; text-align: center;">
                            <span class="status-badge ${statusClass}">${statusText}</span>
                        </td>
                    </tr>
                `;
            });

            provasHtml += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            this.abrirModal(`📚 Provas da Turma: ${turma.nome}`, provasHtml, false);

        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    verDetalhesTurma(id) {
        const turma = this.turmas.find(t => t.id === id);
        if (!turma) return;

        this.abrirModal(
            '👁️ Detalhes da Turma',
            `
                <p><strong>Nome:</strong> ${turma.nome}</p>
                <p><strong>Disciplina:</strong> ${turma.disciplina}</p>
                <p><strong>Eixo:</strong> ${turma.eixo}</p>
                <p><strong>Código:</strong> ${turma.codigo}</p>
                <p><strong>Alunos:</strong> ${turma.totalAlunos || 0}</p>
                <p><strong>Provas:</strong> ${turma.totalProvas || 0}</p>
                <p><strong>Status:</strong> ${turma.ativa ? 'Ativa' : 'Inativa'}</p>
            `,
            false
        );
    }

    // ============ ABRIR MODAL TURMA ============
    abrirModalTurma(turma = null) {
        console.log('📝 Abrindo modal turma. Dados:', turma);

        const modalBody = document.getElementById('modalBody');

        const nome = turma?.nome || turma?.name || '';
        const disciplina = turma?.disciplina || '';
        const eixo = turma?.eixo || '';
        const ativa = turma?.ativa !== false;
        const id = turma?.id || turma?._id || '';

        const nomeStr = String(nome || '').replace(/"/g, '&quot;');
        const disciplinaStr = String(disciplina || '').replace(/"/g, '&quot;');

        const conteudoHTML = `
            <form id="formTurma">
                <div class="form-group">
                    <label>Nome da Turma</label>
                    <input type="text" id="nomeTurma" class="form-control" value="${nomeStr}" required>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label>Disciplina</label>
                        <input type="text" id="disciplinaTurma" class="form-control" value="${disciplinaStr}" required>
                    </div>
                    
                    <div class="form-group">
                        <label>Eixo</label>
                        <select id="eixoTurma" class="form-control">
                            <option value="">Selecione...</option>
                            <option value="natureza" ${eixo === 'natureza' ? 'selected' : ''}>🌿 Natureza</option>
                            <option value="humanas" ${eixo === 'humanas' ? 'selected' : ''}>📜 Humanas</option>
                            <option value="linguagens" ${eixo === 'linguagens' ? 'selected' : ''}>📚 Linguagens</option>
                            <option value="desenvolvimento" ${eixo === 'desenvolvimento' ? 'selected' : ''}>💻 Desenvolvimento</option>
                            <option value="gestao" ${eixo === 'gestao' ? 'selected' : ''}>📊 Gestão</option>
                            <option value="turismo" ${eixo === 'turismo' ? 'selected' : ''}>✈️ Turismo</option>
                            <option value="ambiente" ${eixo === 'ambiente' ? 'selected' : ''}>🌱 Ambiente</option>
                        </select>
                    </div>
                </div>
                
                <div class="form-check">
                    <input type="checkbox" id="ativaTurma" ${ativa ? 'checked' : ''}>
                    <label for="ativaTurma">Turma ativa</label>
                </div>
                
                <div class="info-card">
                    <i class="fas fa-info-circle"></i>
                    <span>Código será gerado automaticamente</span>
                </div>
            </form>
        `;

        const titulo = turma ? 
            '<i class="fas fa-edit"></i> Editar Turma' : 
            '<i class="fas fa-plus"></i> Nova Turma';

        this.abrirModal(titulo, conteudoHTML, true);

        document.getElementById('modalSaveBtn').onclick = () => this.salvarTurma(id);
    }

    async salvarTurma(id = null) {
        const dados = {
            nome: document.getElementById('nomeTurma').value,
            disciplina: document.getElementById('disciplinaTurma').value,
            eixo: document.getElementById('eixoTurma').value,
            ativa: document.getElementById('ativaTurma').checked
        };

        this.showToast('Salvando...', 'info');

        try {
            const url = id ? `/api/admin/turmas/${id}` : '/api/admin/turmas';
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
                this.showToast(id ? 'Turma atualizada!' : 'Turma criada!', 'success');
                this.fecharModal();
                await this.carregarTurmas();
            } else {
                throw new Error(data.error || 'Erro ao salvar');
            }
        } catch (error) {
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============ CARREGAR EIXOS ============
    async carregarEixos() {
        const contentArea = document.getElementById('contentArea');

        contentArea.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner"></div>
                <p>Carregando eixos...</p>
            </div>
        `;

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/admin/eixos', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();
            this.eixos = data.success ? data.eixos : [];

            contentArea.innerHTML = this.renderizarEixos();

        } catch (error) {
            contentArea.innerHTML = `<p style="color: red;">Erro: ${error.message}</p>`;
        }
    }

    // ============ RENDERIZAR EIXOS ============
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
                        <div class="eixo-card" style="border-left: 4px solid ${eixo.cor};">
                            <div class="eixo-header">
                                <div>
                                    <i class="fas ${eixo.icone}" style="color: ${eixo.cor};"></i>
                                    <h3>${eixo.label}</h3>
                                </div>
                                <div class="eixo-actions">
                                    <button onclick="adminSimples.editarEixo('${eixo._id}')">
                                        <i class="fas fa-edit"></i>
                                    </button>
                                    <button onclick="adminSimples.excluirEixo('${eixo._id}')">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                            <p class="eixo-nome">${eixo.nome}</p>
                        </div>
                    `).join('')}
                </div>
            </div>

            <style>
                .eixos-container { padding: 24px; }
                .page-header { display: flex; justify-content: space-between; margin-bottom: 20px; }
                .page-header h1 { margin: 0; font-size: 24px; color: #1f2937; display: flex; align-items: center; gap: 10px; }
                .eixos-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 20px;
                }
                .eixo-card {
                    background: white;
                    border-radius: 12px;
                    padding: 20px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                .eixo-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                }
                .eixo-header div:first-child {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                .eixo-header i { font-size: 24px; }
                .eixo-header h3 { margin: 0; font-size: 16px; }
                .eixo-nome { color: #666; font-size: 12px; margin: 0; }
                .eixo-actions button {
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 5px;
                    color: #666;
                }
                .eixo-actions button:hover { color: #333; }
            </style>
        `;
    }

    // ============ ABRIR MODAL EIXO ============
    abrirModalEixo(eixoId = null) {
        const eixo = eixoId ? this.eixos.find(e => e._id === eixoId) : null;

        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <form id="eixoForm">
                <div class="form-group">
                    <label>Nome (identificador)</label>
                    <input type="text" id="eixoNome" class="form-control" 
                        value="${eixo?.nome || ''}" 
                        placeholder="Ex: desenvolvimento" required>
                    <small>Usado internamente no sistema</small>
                </div>
                
                <div class="form-group">
                    <label>Label (exibição)</label>
                    <input type="text" id="eixoLabel" class="form-control" 
                        value="${eixo?.label || ''}" 
                        placeholder="Ex: 💻 Desenvolvimento de Sistemas" required>
                </div>
                
                <div class="form-row">
                    <div class="form-group">
                        <label>Cor</label>
                        <input type="color" id="eixoCor" class="form-control" 
                            value="${eixo?.cor || '#667eea'}">
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
            </form>
        `;

        document.getElementById('modalTitle').innerHTML = eixoId ? 
            '<i class="fas fa-edit"></i> Editar Eixo' : 
            '<i class="fas fa-plus"></i> Novo Eixo';

        document.getElementById('modalSaveBtn').onclick = () => this.salvarEixo(eixoId);
        this.abrirModal(document.getElementById('modalTitle').innerHTML, modalBody.innerHTML, true);
    }

    // ============ SALVAR EIXO ============
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
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
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
            console.error('❌ Erro ao salvar eixo:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============ EDITAR EIXO ============
    editarEixo(eixoId) {
        this.abrirModalEixo(eixoId);
    }

    // ============ EXCLUIR EIXO ============
    async excluirEixo(eixoId) {
        const eixo = this.eixos.find(e => e._id === eixoId);
        if (!eixo) return;

        const confirmar = await this.confirmar(
            '🗑️ Excluir Eixo',
            `Tem certeza que deseja excluir o eixo <strong>${eixo.label}</strong>?<br><br>
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
            console.error('❌ Erro ao excluir eixo:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }
        // ============ CARREGAR CURSOS ============
    async carregarCursos() {
        const contentArea = document.getElementById('contentArea');

        contentArea.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner"></div>
                <p>Carregando cursos...</p>
            </div>
        `;

        try {
            const token = localStorage.getItem('auth_token');

            const eixosRes = await fetch('/api/admin/eixos', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const eixosData = await eixosRes.json();
            this.eixos = eixosData.success ? eixosData.eixos : [];

            const cursosRes = await fetch('/api/admin/cursos', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const cursosData = await cursosRes.json();
            this.cursos = cursosData.success ? cursosData.cursos : [];

            contentArea.innerHTML = this.renderizarCursos();

        } catch (error) {
            console.error('❌ Erro ao carregar cursos:', error);
            contentArea.innerHTML = `<p style="color: red;">Erro: ${error.message}</p>`;
        }
    }

    // ============ RENDERIZAR CURSOS ============
    renderizarCursos() {
        const eixosMap = {};
        this.eixos.forEach(eixo => {
            eixosMap[eixo._id] = eixo;
        });

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
                        if (curso.eixoId && typeof curso.eixoId === 'object') {
                            eixo = curso.eixoId;
                        } else if (curso.eixoId && eixosMap[curso.eixoId]) {
                            eixo = eixosMap[curso.eixoId];
                        }

                        const icone = eixo?.icone || 'fa-graduation-cap';
                        const cor = eixo?.cor || '#667eea';
                        const eixoLabel = eixo?.label || 'Eixo não definido';

                        return `
                            <div class="curso-card" style="border-left: 4px solid ${cor};">
                                <div class="curso-header">
                                    <div class="curso-title">
                                        <i class="fas ${icone}" style="color: ${cor};"></i>
                                        <h3>${curso.nome}</h3>
                                        <span class="eixo-badge" style="background: ${cor}20; color: ${cor}; border: 1px solid ${cor}40;">
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
                                                    <button class="btn-icon-small" onclick="adminSimples.editarTurmaCurricular('${curso._id}', '${t._id}')" title="Editar turma">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button class="btn-icon-small danger" onclick="adminSimples.excluirTurmaCurricular('${curso._id}', '${t._id}')" title="Excluir turma">
                                                        <i class="fas fa-trash"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        `).join('') || '<p class="sem-turmas">Nenhuma turma cadastrada</p>'}
                                    </div>
                                </div>
                                
                                <div class="curso-footer">
                                    <span class="curso-data">
                                        <i class="fas fa-calendar-alt"></i> Criado em: ${new Date(curso.createdAt).toLocaleDateString('pt-BR')}
                                    </span>
                                    <span class="curso-status ${curso.ativo ? 'ativo' : 'inativo'}">
                                        ${curso.ativo ? 'Ativo' : 'Inativo'}
                                    </span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                    
                    ${this.cursos.length === 0 ? `
                        <div class="empty-state">
                            <i class="fas fa-graduation-cap"></i>
                            <h3>Nenhum curso cadastrado</h3>
                            <p>Clique em "Novo Curso" para começar</p>
                        </div>
                    ` : ''}
                </div>
            </div>

            <style>
                .cursos-container { padding: 24px; max-width: 1200px; margin: 0 auto; }
                .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; }
                .page-header h1 { margin: 0; font-size: 24px; color: #1f2937; display: flex; align-items: center; gap: 10px; }
                
                .cursos-list { display: flex; flex-direction: column; gap: 20px; }
                
                .curso-card {
                    background: white;
                    border-radius: 16px;
                    padding: 20px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                    border: 1px solid #e5e7eb;
                    transition: all 0.3s;
                }
                .curso-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
                
                .curso-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 15px;
                    border-bottom: 1px solid #e5e7eb;
                }
                
                .curso-title {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    flex-wrap: wrap;
                }
                
                .curso-title i { font-size: 24px; }
                .curso-title h3 { margin: 0; font-size: 18px; color: #1f2937; }
                
                .eixo-badge {
                    padding: 4px 12px;
                    border-radius: 30px;
                    font-size: 12px;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                
                .curso-actions { display: flex; gap: 8px; }
                
                .turmas-section {
                    background: #f9fafb;
                    border-radius: 12px;
                    padding: 15px;
                    margin-bottom: 15px;
                }
                
                .turmas-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 15px;
                }
                
                .turmas-title {
                    font-size: 14px;
                    font-weight: 600;
                    color: #4b5563;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                
                .btn-add-turma {
                    background: #10b981;
                    color: white;
                    border: none;
                    padding: 6px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                .btn-add-turma:hover { background: #059669; }
                
                .turmas-list {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                
                .turma-item {
                    background: white;
                    border-radius: 8px;
                    padding: 12px;
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    border: 1px solid #e5e7eb;
                }
                .turma-item.inativa { opacity: 0.7; background: #f3f4f6; }
                
                .turma-codigo {
                    font-weight: 600;
                    color: #1f2937;
                    min-width: 80px;
                }
                
                .turma-periodo {
                    background: #667eea;
                    color: white;
                    padding: 2px 8px;
                    border-radius: 20px;
                    font-size: 11px;
                }
                
                .turma-vagas {
                    color: #6b7280;
                    font-size: 13px;
                }
                
                .turma-status {
                    padding: 2px 8px;
                    border-radius: 20px;
                    font-size: 11px;
                    font-weight: 500;
                }
                .turma-status.ativa { background: #d1fae5; color: #065f46; }
                .turma-status.inativa { background: #fee2e2; color: #991b1b; }
                
                .turma-actions {
                    margin-left: auto;
                    display: flex;
                    gap: 5px;
                }
                
                .btn-icon-small {
                    width: 28px;
                    height: 28px;
                    border: none;
                    background: transparent;
                    color: #6b7280;
                    cursor: pointer;
                    border-radius: 4px;
                }
                .btn-icon-small:hover { background: #f3f4f6; }
                .btn-icon-small.danger:hover { color: #dc3545; }
                
                .sem-turmas {
                    text-align: center;
                    color: #9ca3af;
                    padding: 20px;
                    margin: 0;
                }
                
                .curso-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 12px;
                    color: #6b7280;
                }
                
                .curso-data i { margin-right: 5px; }
                
                .curso-status {
                    padding: 4px 12px;
                    border-radius: 30px;
                }
                .curso-status.ativo { background: #d1fae5; color: #065f46; }
                .curso-status.inativo { background: #fee2e2; color: #991b1b; }
                
                .empty-state {
                    text-align: center;
                    padding: 60px;
                    background: white;
                    border-radius: 16px;
                }
                .empty-state i { font-size: 64px; color: #d1d5db; margin-bottom: 15px; }
                .empty-state h3 { color: #374151; margin-bottom: 10px; }
                .empty-state p { color: #6b7280; margin-bottom: 20px; }
            </style>
        `;
    }

    // ============ ABRIR MODAL CURSO ============
    abrirModalCurso(cursoId = null) {
        const curso = cursoId ? this.cursos.find(c => c._id === cursoId) : null;

        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <form id="cursoForm">
                <div class="form-group">
                    <label>Nome do Curso</label>
                    <input type="text" id="cursoNome" class="form-control" 
                        value="${curso?.nome || ''}" 
                        placeholder="Ex: TÉCNICO EM DESENVOLVIMENTO DE SISTEMAS" required>
                </div>
                
                <div class="form-group">
                    <label>Eixo</label>
                    <select id="cursoEixoId" class="form-control" required>
                        <option value="">Selecione um eixo...</option>
                        ${this.eixos.map(e => `
                            <option value="${e._id}" 
                                ${curso?.eixoId?._id === e._id || curso?.eixoId === e._id ? 'selected' : ''}
                                style="border-left: 3px solid ${e.cor};">
                                <i class="fas ${e.icone}"></i> ${e.label}
                            </option>
                        `).join('')}
                    </select>
                </div>
                
                ${curso ? `
                    <div style="background: #f8fafc; border-radius: 10px; padding: 15px; margin-top: 15px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <input type="checkbox" id="cursoAtivo" ${curso.ativo !== false ? 'checked' : ''}>
                            <label for="cursoAtivo" style="font-weight: 600; cursor: pointer;">Curso Ativo</label>
                        </div>
                        <p style="margin: 5px 0 0; font-size: 12px; color: #6b7280;">
                            <i class="fas fa-info-circle"></i> 
                            Se inativado, o curso não aparecerá em novas matrículas
                        </p>
                    </div>
                ` : ''}
            </form>
        `;

        document.getElementById('modalTitle').innerHTML = cursoId ? 
            '<i class="fas fa-edit"></i> Editar Curso' : 
            '<i class="fas fa-plus"></i> Novo Curso';

        document.getElementById('modalSaveBtn').onclick = () => this.salvarCurso(cursoId);
        this.abrirModal(document.getElementById('modalTitle').innerHTML, modalBody.innerHTML, true);
    }

    // ============ SALVAR CURSO ============
    async salvarCurso(cursoId = null) {
        try {
            const dados = {
                nome: document.getElementById('cursoNome').value,
                eixoId: document.getElementById('cursoEixoId').value
            };

            if (!dados.nome || !dados.eixoId) {
                this.showToast('❌ Nome do curso e eixo são obrigatórios', 'error');
                return;
            }

            this.showToast('🔄 Salvando curso...', 'info');

            const token = localStorage.getItem('auth_token');
            const url = cursoId ? `/api/admin/cursos/${cursoId}` : '/api/admin/cursos';
            const method = cursoId ? 'PUT' : 'POST';

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

    // ============ EDITAR CURSO ============
    editarCurso(cursoId) {
        this.abrirModalCurso(cursoId);
    }

    // ============ EXCLUIR CURSO ============
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

    // ============ ABRIR MODAL TURMA CURRICULAR ============
    abrirModalTurmaCurricular(cursoId, turmaId = null) {
        const curso = this.cursos.find(c => c._id === cursoId);
        if (!curso) {
            this.showToast('❌ Curso não encontrado', 'error');
            return;
        }

        this.cursoAtual = curso;
        const turma = turmaId ? curso.turmas.find(t => t._id === turmaId) : null;

        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <form id="turmaCurricularForm">
                <div style="padding: 20px;">
                    <h4 style="margin-bottom: 15px; color: #1f2937;">Curso: ${curso.nome}</h4>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Código da Turma</label>
                        <input type="text" id="turmaCodigo" class="form-control" 
                            value="${turma?.codigo || ''}" 
                            placeholder="Ex: 101" required
                            style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Série</label>
                        <select id="turmaPeriodo" class="form-control" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;" required>
                            <option value="1" ${turma?.periodo === '1' ? 'selected' : ''}>1ª Série</option>
                            <option value="2" ${turma?.periodo === '2' ? 'selected' : ''}>2ª Série</option>
                            <option value="3" ${turma?.periodo === '3' ? 'selected' : ''}>3ª Série</option>
                            <option value="4" ${turma?.periodo === '4' ? 'selected' : ''}>4ª Série</option>
                        </select>
                    </div>
                    
                    <div class="form-group" style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Vagas</label>
                        <input type="number" id="turmaVagas" class="form-control" 
                            value="${turma?.vagas || 40}" min="1" max="100"
                            style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                    </div>
                    
                    <div style="background: #f8fafc; border-radius: 10px; padding: 15px; margin-bottom: 15px;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                            <input type="checkbox" id="turmaAtiva" ${turma?.ativa !== false ? 'checked' : ''}>
                            <label for="turmaAtiva" style="font-weight: 600; cursor: pointer;">Turma Ativa</label>
                        </div>
                        <p style="margin: 0; font-size: 12px; color: #6b7280;">
                            <i class="fas fa-info-circle"></i> 
                            Se desativada, não aparecerá no cadastro de alunos
                        </p>
                    </div>
                </div>
            </form>
        `;

        document.getElementById('modalTitle').innerHTML = turmaId ? 
            '<i class="fas fa-edit"></i> Editar Turma do Curso' : 
            '<i class="fas fa-plus"></i> Nova Turma no Curso';

        document.getElementById('modalSaveBtn').onclick = () => this.salvarTurmaCurricular(cursoId, turmaId);
        this.abrirModal(document.getElementById('modalTitle').innerHTML, modalBody.innerHTML, true);
    }

    // ============ SALVAR TURMA CURRICULAR ============
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
            const url = turmaId ? 
                `/api/admin/cursos/${cursoId}/turmas/${turmaId}` : 
                `/api/admin/cursos/${cursoId}/turmas`;
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

            if (data.success) {
                this.showToast(turmaId ? '✅ Turma curricular atualizada!' : '✅ Turma curricular criada!', 'success');
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

    // ============ EDITAR TURMA CURRICULAR ============
    editarTurmaCurricular(cursoId, turmaId) {
        this.abrirModalTurmaCurricular(cursoId, turmaId);
    }

    // ============ EXCLUIR TURMA CURRICULAR ============
    async excluirTurmaCurricular(cursoId, turmaId) {
        const curso = this.cursos.find(c => c._id === cursoId);
        if (!curso) return;

        const turma = curso.turmas.find(t => t._id === turmaId);
        if (!turma) return;

        const confirmar = await this.confirmar(
            '🗑️ Excluir Turma do Curso',
            `Tem certeza que deseja excluir a turma <strong>${turma.codigo} - ${turma.periodo}ª Série</strong> do curso <strong>${curso.nome}</strong>?`
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
                throw new Error(data.error || 'Erro ao excluir');
            }

        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }
        // ============ FILTRAR PROVAS POR STATUS ============
    filtrarProvasPorStatus(status) {
        const select = document.getElementById('filtroStatusProva');
        if (select) {
            select.value = status;
            this.filtrarProvasLista();
        }
    }

    // ============ FILTRAR PROVAS NA LISTA ============
    filtrarProvasLista() {
        const busca = document.getElementById('searchProvas')?.value.toLowerCase() || '';
        const status = document.getElementById('filtroStatusProva')?.value || 'todas';
        const tipo = document.getElementById('filtroTipoProva')?.value || 'todas';

        const agora = new Date();

        const filtradas = this.provas.filter(p => {
            let nomeProfessor = '';
            if (p.professor) {
                if (typeof p.professor === 'object') {
                    nomeProfessor = p.professor.nome || '';
                } else {
                    nomeProfessor = p.professor;
                }
            }

            let nomeTurma = '';
            if (p.turma) {
                if (typeof p.turma === 'object') {
                    nomeTurma = p.turma.nome || '';
                } else {
                    nomeTurma = p.turma;
                }
            }

            const matchBusca = busca === '' || 
                (p.titulo && p.titulo.toLowerCase().includes(busca)) ||
                (nomeProfessor && nomeProfessor.toLowerCase().includes(busca)) ||
                (nomeTurma && nomeTurma.toLowerCase().includes(busca));

            let matchStatus = true;
            if (status === 'rascunho') {
                matchStatus = (p.publicada === false || p.publicada === 'false') && p.cancelada !== true;
            }
            else if (status === 'ativa') {
                const dataLimite = p.dataLimite ? new Date(p.dataLimite) : null;
                matchStatus = (p.publicada === true || p.publicada === 'true') && p.cancelada !== true && (!dataLimite || dataLimite > agora);
            }
            else if (status === 'expirada') {
                const dataLimite = p.dataLimite ? new Date(p.dataLimite) : null;
                matchStatus = (p.publicada === true || p.publicada === 'true') && p.cancelada !== true && dataLimite && dataLimite < agora;
            }
            else if (status === 'cancelada') {
                matchStatus = p.cancelada === true;
            }

            let matchTipo = true;
            if (tipo === 'simples') {
                matchTipo = (p.tipoProva === 'simples' || !p.tipoProva) && p.adaptada !== true;
            }
            else if (tipo === 'enem') {
                matchTipo = p.tipoProva === 'enem';
            }
            else if (tipo === 'adaptada') {
                matchTipo = p.adaptada === true;
            }

            return matchBusca && matchStatus && matchTipo;
        });

        const tabela = document.getElementById('tabelaProvas');
        if (tabela) {
            tabela.innerHTML = this.gerarLinhasProvas(filtradas);
        }

        const resultadosBadge = document.getElementById('resultadosBadge');
        if (resultadosBadge) {
            resultadosBadge.textContent = `${filtradas.length} ${filtradas.length === 1 ? 'prova' : 'provas'}`;
        }

        const itemsCounter = document.getElementById('itemsCounter');
        if (itemsCounter) {
            itemsCounter.textContent = `${filtradas.length} registros`;
        }
    }

    // ============ LIMPAR FILTROS ============
    limparFiltrosProvas() {
        const searchInput = document.getElementById('searchProvas');
        if (searchInput) searchInput.value = '';

        const statusSelect = document.getElementById('filtroStatusProva');
        if (statusSelect) statusSelect.value = 'todas';

        const tipoSelect = document.getElementById('filtroTipoProva');
        if (tipoSelect) tipoSelect.value = 'todas';

        this.filtrarProvasLista();
    }

    // ============ ATUALIZAR PROVAS ============
    async atualizarProvas() {
        this.showToast('🔄 Atualizando provas...', 'info');
        await this.carregarProvas();
        this.showToast('✅ Provas atualizadas!', 'success');
    }

    // ============ EXTRAIR PROFESSORES ============
    extrairProfessores(provas) {
        const professores = new Map();

        provas.forEach(p => {
            if (p.professor) {
                if (typeof p.professor === 'object') {
                    const id = p.professor.id || p.professor._id;
                    const nome = p.professor.nome;
                    if (id && nome) {
                        professores.set(id, { id, nome });
                    }
                } else if (typeof p.professor === 'string' && p.professor !== '-') {
                    professores.set(p.professor, { id: p.professor, nome: p.professor });
                }
            }

            if (p.professorId && !professores.has(p.professorId)) {
                if (this.usuarios) {
                    const prof = this.usuarios.find(u => u._id === p.professorId || u.id === p.professorId);
                    if (prof) {
                        professores.set(p.professorId, { id: p.professorId, nome: prof.nome });
                    }
                }
            }
        });

        return Array.from(professores.values());
    }

    // ============ OBTER NOME DO PROFESSOR ============
    obterNomeProfessor(prova) {
        if (prova.professor) {
            if (typeof prova.professor === 'object') {
                return prova.professor.nome || prova.professor.name || 'Não informado';
            }
            return prova.professor;
        }
        return 'Não informado';
    }

    // ============ GERAR LINHAS DA TABELA DE PROVAS ============
    gerarLinhasProvas(provas) {
        if (!provas || provas.length === 0) {
            return '<tr><td colspan="9" class="empty-state">Nenhuma prova encontrada</td></tr>';
        }

        return provas.map(p => {
            let statusClass = '';
            let statusText = '';

            if (p.cancelada) {
                statusClass = 'inactive';
                statusText = 'Cancelada';
            } else if (!p.publicada) {
                statusClass = 'pending';
                statusText = 'Rascunho';
            } else if (p.dataLimite && new Date(p.dataLimite) < new Date()) {
                statusClass = 'inactive';
                statusText = 'Expirada';
            } else {
                statusClass = 'active';
                statusText = 'Ativa';
            }

            let tipoClass = 'primary';
            let tipo = 'Simples';

            if (p.tipoProva === 'enem') {
                tipoClass = 'info';
                tipo = 'ENEM';
            } else if (p.adaptada === true) {
                tipoClass = 'warning';
                tipo = 'Adaptada';
            }

            return `
                <tr>
                    <td>
                        <strong>${p.titulo || 'Sem título'}</strong>
                        <br><small style="color: #666;">${p.conteudo?.substring(0, 50) || ''}</small>
                    </td>
                    <td>${this.obterNomeProfessor(p)}</td>
                    <td>${p.turma?.nome || p.turma || '-'}</td>
                    <td>
                        <span class="status-badge ${tipoClass}">${tipo}</span>
                    </td>
                    <td>
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </td>
                    <td>${p.quantidadeQuestoes || 0}</td>
                    <td>
                        <div style="text-align: center;">
                            <strong>${p.totalParticipantes || p.alunosRealizaram || 0}</strong>
                            <br><small style="color: #666;">alunos</small>
                        </div>
                    </td>
                    <td>
                        <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                            <button class="btn-icon" style="background: #3498db; color: white;" 
                                    onclick="adminSimples.verDetalhesProva('${p.id}')" 
                                    title="Ver detalhes">
                                <i class="fas fa-eye"></i>
                            </button>
                            
                            <button class="btn-icon" style="background: #9b59b6; color: white;" 
                                    onclick="adminSimples.visualizarQuestoes('${p.id}')" 
                                    title="Ver questões">
                                <i class="fas fa-question-circle"></i>
                            </button>
                            
                            ${p.publicada ? `
                            <button class="btn-icon" style="background: #27ae60; color: white;" 
                                    onclick="adminSimples.verResultadosProva('${p.id}')" 
                                    title="Ver resultados">
                                <i class="fas fa-chart-bar"></i>
                            </button>
                            ` : ''}
                            
                            ${!p.publicada && !p.cancelada ? `
                            <button class="btn-icon" style="background: #f39c12; color: white;" 
                                    onclick="adminSimples.publicarProva('${p.id}')" 
                                    title="Publicar prova">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                            ` : ''}
                            
                            <button class="btn-icon" style="background: #f1c40f; color: white;" 
                                    onclick="adminSimples.editarProvaSimples('${p.id}')" 
                                    title="Editar prova">
                                <i class="fas fa-edit"></i>
                            </button>

                            <button class="btn-icon" style="background: #8b5cf6; color: white;" 
                                    onclick="adminSimples.corrigirProvaComQRCode('${p.id}')" 
                                    title="Corrigir prova (QR Code)">
                                <i class="fas fa-qrcode"></i>
                            </button>
                            
                            ${p.publicada && !p.cancelada && p.dataLimite && new Date(p.dataLimite) > new Date() ? `
                            <button class="btn-icon" style="background: #e67e22; color: white;" 
                                    onclick="adminSimples.adiarProva('${p.id}')" 
                                    title="Adiar data">
                                <i class="fas fa-calendar-plus"></i>
                            </button>
                            ` : ''}
                            
                            <button class="btn-icon" style="background: #e67e22; color: white;" 
                                    onclick="adminSimples.baixarImprimirProva('${p.id}')" 
                                    title="Baixar/Imprimir prova">
                                <i class="fas fa-print"></i>
                            </button>
                            
                            <button class="btn-icon" style="background: #e74c3c; color: white;" 
                                    onclick="adminSimples.excluirProva('${p.id}')" 
                                    title="Excluir prova">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ============ CORRIGIR PROVA COM QR CODE ============
    corrigirProvaComQRCode(provaId) {
        console.log('📱 Abrindo correção da prova via QR Code:', provaId);

        const token = localStorage.getItem('auth_token');

        if (!token) {
            this.showToast('❌ Você precisa estar logado para corrigir provas', 'error');
            return;
        }

        const url = `/corrigir-prova?prova=${provaId}&token=${encodeURIComponent(token)}`;
        window.open(url, '_blank');

        this.showToast('📱 Abrindo página de correção em nova aba...', 'info');
    }

    // ============ EDITAR PROVA (SIMPLES) ============
    async editarProvaSimples(provaId) {
        console.log('✏️ Admin Simples editando prova:', provaId);

        const prova = this.provas.find(p => p.id === provaId);
        if (!prova) {
            this.showToast('❌ Prova não encontrada', 'error');
            return;
        }

        try {
            this.showToast('📝 Carregando dados da prova...', 'info');

            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/provas/${provaId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Erro ao carregar dados da prova');
            }

            const provaCompleta = data.prova || prova;
            const questoes = data.questoes || [];

            let dataLimiteStr = '';
            if (provaCompleta.dataLimite) {
                const dataLimite = new Date(provaCompleta.dataLimite);
                const ano = dataLimite.getFullYear();
                const mes = String(dataLimite.getMonth() + 1).padStart(2, '0');
                const dia = String(dataLimite.getDate()).padStart(2, '0');
                dataLimiteStr = `${ano}-${mes}-${dia}`;
            }

            const horarioInicio = provaCompleta.horarioInicio || prova.horarioInicio || '08:00';
            const horarioTermino = provaCompleta.horarioTermino || prova.horarioTermino || '09:30';

            this.criarModalEdicaoProvaSimples(provaId, provaCompleta, questoes, dataLimiteStr, horarioInicio, horarioTermino);

        } catch (error) {
            console.error('❌ Erro ao carregar prova para edição:', error);
            this.showToast('❌ Erro: ' + error.message, 'error');
        }
    }

    // ============ CRIAR MODAL DE EDIÇÃO ============
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
                <div style="margin-bottom: 30px; padding: 20px; background: #f8fafc; border-radius: 12px; border-left: 4px solid #f39c12;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h4 style="margin: 0; display: flex; align-items: center; gap: 10px;">
                            <span style="background: #f39c12; color: white; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 50%;">
                                ${index + 1}
                            </span>
                            Questão ${index + 1}
                        </h4>
                    </div>
                    
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Pergunta</label>
                        <textarea id="edit-pergunta-${index}" rows="3" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">${q.pergunta || ''}</textarea>
                    </div>
                    
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Opções</label>
                        ${opcoes.map((opcao, optIdx) => {
                            const letra = letras[optIdx];
                            const isCorreta = optIdx === q.respostaCorreta;
                            return `
                            <div style="display: flex; gap: 10px; margin-bottom: 8px; align-items: center;">
                                <span style="font-weight: 600; min-width: 30px;">${letra})</span>
                                <input type="text" id="edit-opcao-${index}-${optIdx}" value="${opcao.replace(/"/g, '&quot;')}" style="flex: 1; padding: 8px; border: 2px solid #e5e7eb; border-radius: 6px;">
                                <div style="display: flex; align-items: center; gap: 5px;">
                                    <input type="radio" name="resposta-correta-${index}" value="${optIdx}" ${isCorreta ? 'checked' : ''} onchange="adminSimples.marcarRespostaCorreta(${index}, ${optIdx})">
                                    <span>Correta</span>
                                </div>
                            </div>
                        `}).join('')}
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 5px; font-weight: 600;">Explicação</label>
                        <textarea id="edit-explicacao-${index}" rows="2" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">${q.explicacao || ''}</textarea>
                    </div>
                </div>
            `;
        });

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header" style="background: linear-gradient(135deg, #f39c12, #e67e22); color: white; padding: 20px;">
                    <h3 style="margin: 0; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-edit"></i> Editar Prova
                    </h3>
                    <button class="modal-close" onclick="fecharModalEditarSimples()" style="color: white;">&times;</button>
                </div>
                
                <div style="padding: 25px;">
                    <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 25px;">
                        <h4 style="margin: 0 0 15px 0;">Informações Básicas</h4>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: 600;">Título</label>
                                <input type="text" id="edit-titulo" value="${prova.titulo || ''}" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                            </div>
                            
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: 600;">Conteúdo</label>
                                <input type="text" id="edit-conteudo" value="${prova.conteudo || ''}" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                            </div>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: 600;">Data Limite</label>
                                <input type="date" id="edit-data-limite" value="${dataLimiteStr}" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                            </div>
                            
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: 600;">Horário Início</label>
                                <input type="time" id="edit-horario-inicio" value="${horarioInicio}" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                            </div>
                            
                            <div>
                                <label style="display: block; margin-bottom: 5px; font-weight: 600;">Horário Término</label>
                                <input type="time" id="edit-horario-termino" value="${horarioTermino}" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                            </div>
                        </div>
                        
                        <div style="margin-top: 15px; padding: 10px; background: #f1f5f9; border-radius: 8px; font-weight: 600; color: #f39c12; text-align: center;" id="duracao-calculada-edit">
                            Calculando...
                        </div>
                    </div>
                    
                    <h4 style="margin: 0 0 15px 0;">Questões (${questoes.length})</h4>
                    <div id="questoes-edit-container">
                        ${questoesHTML}
                    </div>
                    
                    <input type="hidden" id="questoes-count" value="${questoes.length}">
                    
                    <div style="display: flex; gap: 10px; margin-top: 25px;">
                        <button onclick="adminSimples.salvarEdicaoProvaSimples('${provaId}')" style="flex: 1; padding: 12px; background: #10b981; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
                            <i class="fas fa-save"></i> Salvar Alterações
                        </button>
                        <button onclick="fecharModalEditarSimples()" style="flex: 1; padding: 12px; background: #6b7280; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
                            <i class="fas fa-times"></i> Cancelar
                        </button>
                    </div>
                </div>
            </div>
        `;

        modal.style.display = 'flex';
        this.calcularDuracaoEditavel();

        const inicioInput = document.getElementById('edit-horario-inicio');
        const terminoInput = document.getElementById('edit-horario-termino');

        if (inicioInput && terminoInput) {
            inicioInput.addEventListener('change', () => this.calcularDuracaoEditavel());
            terminoInput.addEventListener('change', () => this.calcularDuracaoEditavel());
        }
    }

    // ============ CALCULAR DURAÇÃO NO MODAL DE EDIÇÃO ============
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
            duracaoEl.innerHTML = '<span style="color: #ef4444;">Horário inválido</span>';
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

    // ============ MARCAR RESPOSTA CORRETA ============
    marcarRespostaCorreta(questaoIndex, opcaoIndex) {
        console.log(`✅ Questão ${questaoIndex} - Resposta correta: ${opcaoIndex}`);
    }

    // ============ SALVAR EDIÇÃO DA PROVA ============
    async salvarEdicaoProvaSimples(provaId) {
        try {
            this.showToast('💾 Salvando alterações...', 'info');

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
                    if (r.checked) {
                        respostaCorreta = parseInt(r.value);
                        break;
                    }
                }

                for (let j = 0; j < 5; j++) {
                    const opcao = document.getElementById(`edit-opcao-${i}-${j}`)?.value;
                    if (opcao) {
                        opcoes.push(opcao);
                    }
                }

                dados.questoes.push({
                    pergunta,
                    opcoes,
                    respostaCorreta,
                    explicacao
                });
            }

            console.log('📤 Enviando dados para:', `/api/professor/provas/${provaId}`);

            const response = await fetch(`/api/professor/provas/${provaId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dados)
            });

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('❌ Resposta não é JSON:', text.substring(0, 200));
                throw new Error('Resposta do servidor não é JSON');
            }

            const data = await response.json();

            if (data.success) {
                this.showToast('✅ Prova atualizada com sucesso!', 'success');
                fecharModalEditarSimples();

                setTimeout(() => {
                    if (typeof this.carregarProvas === 'function') {
                        this.carregarProvas();
                    }
                }, 1500);

            } else {
                throw new Error(data.error || 'Erro ao salvar');
            }

        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============ VER DETALHES DA PROVA ============
    async verDetalhesProva(id) {
        console.log('🔍 verDetalhesProva chamado com ID:', id);
        const prova = this.provas.find(p => p.id === id);
        if (!prova) {
            console.log('❌ Prova não encontrada');
            return;
        }

        try {
            this.showToast('📋 Carregando detalhes...', 'info');

            const response = await fetch(`/api/provas/${id}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });

            const data = await response.json();

            let html = `
                <div style="padding: 20px; max-height: 70vh; overflow-y: auto;">
                    <h3 style="margin: 0 0 20px; color: #333; border-bottom: 2px solid #3498db; padding-bottom: 10px;">
                        <i class="fas fa-file-alt" style="color: #3498db;"></i> ${prova.titulo}
                    </h3>
                    
                    <div style="background: #f8f9fa; border-radius: 10px; padding: 20px; margin-bottom: 20px;">
            `;

            if (data.success && data.prova) {
                const p = data.prova;
                html += `
                        <p><strong><i class="fas fa-align-left"></i> Conteúdo:</strong> ${p.conteudo || 'Não especificado'}</p>
                        <p><strong><i class="fas fa-user"></i> Professor:</strong> ${p.professor?.nome || p.professor || 'Não informado'}</p>
                        <p><strong><i class="fas fa-school"></i> Turma:</strong> ${p.turma?.nome || p.turma || 'Não informada'}</p>
                        <p><strong><i class="fas fa-calendar"></i> Data Limite:</strong> ${p.dataLimite ? new Date(p.dataLimite).toLocaleString('pt-BR') : 'Sem data'}</p>
                        <p><strong><i class="fas fa-clock"></i> Duração:</strong> ${p.duracaoMinutos ? p.duracaoMinutos + ' minutos' : 'Não definida'}</p>
                        <p><strong><i class="fas fa-list"></i> Questões:</strong> ${p.quantidadeQuestoes || 0}</p>
                        <p><strong><i class="fas fa-users"></i> Realizações:</strong> ${p.totalParticipantes || 0}</p>
                        ${p.mediaNotas ? `<p><strong><i class="fas fa-chart-line"></i> Média:</strong> ${p.mediaNotas.toFixed(2)}</p>` : ''}
                `;
            } else {
                html += `
                        <p><strong><i class="fas fa-align-left"></i> Conteúdo:</strong> ${prova.conteudo || 'Não especificado'}</p>
                        <p><strong><i class="fas fa-user"></i> Professor:</strong> ${prova.professor?.nome || prova.professor || 'Não informado'}</p>
                        <p><strong><i class="fas fa-school"></i> Turma:</strong> ${prova.turma?.nome || prova.turma || 'Não informada'}</p>
                        <p><strong><i class="fas fa-calendar"></i> Data Limite:</strong> ${prova.dataLimite ? new Date(prova.dataLimite).toLocaleString('pt-BR') : 'Sem data'}</p>
                        <p><strong><i class="fas fa-clock"></i> Duração:</strong> ${prova.duracaoMinutos ? prova.duracaoMinutos + ' minutos' : 'Não definida'}</p>
                        <p><strong><i class="fas fa-list"></i> Questões:</strong> ${prova.quantidadeQuestoes || 0}</p>
                        <p><strong><i class="fas fa-users"></i> Realizações:</strong> ${prova.totalParticipantes || 0}</p>
                `;
            }

            html += `
                    </div>
                    
                    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
                        <button class="btn-primary" onclick="adminSimples.visualizarQuestoes('${id}')">
                            <i class="fas fa-question-circle"></i> Ver Questões
                        </button>
                        <button class="btn-secondary" onclick="adminSimples.verResultadosProva('${id}')">
                            <i class="fas fa-chart-bar"></i> Resultados
                        </button>
                        ${!prova.publicada && !prova.cancelada ? `
                        <button class="btn-success" onclick="adminSimples.publicarProva('${id}')">
                            <i class="fas fa-paper-plane"></i> Publicar
                        </button>
                        ` : ''}
                    </div>
                </div>
            `;

            this.abrirModal(`📋 Detalhes da Prova`, html, false);

        } catch (error) {
            console.error('Erro:', error);
            this.showToast('❌ Erro ao carregar detalhes', 'error');
        }
    }

    // ============ VISUALIZAR QUESTÕES ============
    async visualizarQuestoes(id) {
        console.log('📝 visualizarQuestoes chamado com ID:', id);
        const prova = this.provas.find(p => p.id === id);
        if (!prova) return;

        try {
            this.showToast('📚 Carregando questões...', 'info');

            const response = await fetch(`/api/provas/${id}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });

            const data = await response.json();

            let questoes = [];
            if (data.success && data.questoes) {
                questoes = data.questoes;
            }

            if (questoes.length === 0) {
                this.showToast('ℹ️ Nenhuma questão cadastrada', 'info');
                return;
            }

            let html = `
                <div style="padding: 10px; max-height: 70vh; overflow-y: auto;">
                    <h3 style="margin: 0 0 20px; color: #333; border-bottom: 2px solid #9b59b6; padding-bottom: 10px;">
                        <i class="fas fa-question-circle" style="color: #9b59b6;"></i> Questões - ${prova.titulo}
                    </h3>
            `;

            questoes.forEach((q, index) => {
                const alternativas = q.opcoes || [];

                html += `
                    <div style="margin-bottom: 25px; padding: 15px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #9b59b6;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                            <strong style="font-size: 14px;">Questão ${index + 1}</strong>
                            <span style="background: #9b59b6; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px;">
                                ${q.dificuldade || 'Média'}
                            </span>
                        </div>
                        
                        <p style="margin-bottom: 15px; font-size: 14px; line-height: 1.5;">${q.pergunta || 'Pergunta não disponível'}</p>
                        
                        <div style="background: white; border-radius: 6px; padding: 10px;">
                `;

                alternativas.forEach((opcao, idx) => {
                    const letra = String.fromCharCode(65 + idx);
                    const isCorreta = idx === q.respostaCorreta;
                    html += `
                        <div style="padding: 8px; margin-bottom: 5px; background: ${isCorreta ? '#d4edda' : '#f8f9fa'}; border-radius: 4px; border-left: 3px solid ${isCorreta ? '#28a745' : '#dee2e6'};">
                            <strong>${letra})</strong> ${opcao}
                            ${isCorreta ? ' <span style="color: #28a745; font-size: 11px;">✓ Correta</span>' : ''}
                        </div>
                    `;
                });

                if (q.explicacao) {
                    html += `
                        <div style="margin-top: 10px; padding: 10px; background: #e7f3ff; border-radius: 4px; font-size: 12px; color: #004085;">
                            <strong><i class="fas fa-info-circle"></i> Explicação:</strong> ${q.explicacao}
                        </div>
                    `;
                }

                html += `
                        </div>
                    </div>
                `;
            });

            html += `</div>`;

            this.abrirModal(`📝 Questões`, html, false);

        } catch (error) {
            console.error('Erro:', error);
            this.showToast('❌ Erro ao carregar questões', 'error');
        }
    }

    // ============ VER RESULTADOS DA PROVA ============
    async verResultadosProva(id) {
        console.log('📊 verResultadosProva chamado com ID:', id);
        const prova = this.provas.find(p => p.id === id);
        if (!prova) return;

        try {
            this.showToast('📊 Carregando resultados...', 'info');

            const response = await fetch(`/api/provas/${id}/resultados`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'Erro ao carregar resultados');
            }

            const resultados = data.resultados || [];

            if (resultados.length === 0) {
                this.showToast('ℹ️ Nenhum resultado ainda', 'info');
                return;
            }

            const notasValidas = resultados.filter(r => r.nota !== null && r.nota !== undefined);
            const somaNotas = notasValidas.reduce((acc, r) => acc + (r.nota || 0), 0);
            const media = notasValidas.length > 0 ? (somaNotas / notasValidas.length).toFixed(2) : '0.00';

            const aprovados = resultados.filter(r => r.nota && r.nota >= 7).length;
            const reprovados = resultados.filter(r => r.nota && r.nota < 7).length;
            const pendentes = resultados.filter(r => !r.nota && !r.cancelada).length;
            const cancelados = resultados.filter(r => r.cancelada).length;

            let html = `
                <div style="padding: 10px; max-height: 70vh; overflow-y: auto;">
                    <h3 style="margin: 0 0 20px; color: #333; border-bottom: 2px solid #27ae60; padding-bottom: 10px;">
                        <i class="fas fa-chart-bar" style="color: #27ae60;"></i> Resultados - ${prova.titulo}
                    </h3>
                    
                    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px;">
                        <div style="background: #e9ecef; padding: 15px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 24px; font-weight: bold; color: #3498db;">${resultados.length}</div>
                            <div style="font-size: 12px; color: #666;">Total</div>
                        </div>
                        <div style="background: #d4edda; padding: 15px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 24px; font-weight: bold; color: #28a745;">${aprovados}</div>
                            <div style="font-size: 12px; color: #666;">Aprovados</div>
                        </div>
                        <div style="background: #f8d7da; padding: 15px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 24px; font-weight: bold; color: #dc3545;">${reprovados}</div>
                            <div style="font-size: 12px; color: #666;">Reprovados</div>
                        </div>
                        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 24px; font-weight: bold; color: #ffc107;">${pendentes}</div>
                            <div style="font-size: 12px; color: #666;">Pendentes</div>
                        </div>
                    </div>
                    
                    ${cancelados > 0 ? `
                    <div style="background: #f8d7da; padding: 10px; border-radius: 8px; margin-bottom: 20px; text-align: center; color: #721c24;">
                        <i class="fas fa-ban"></i> ${cancelados} prova(s) cancelada(s)
                    </div>
                    ` : ''}
                    
                    <div style="background: #e8f4fd; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
                        <strong>Média geral: <span style="font-size: 20px; color: #3498db;">${media}</span></strong>
                    </div>
                    
                    <h4 style="margin: 20px 0 10px; color: #333;">📋 Lista de Alunos</h4>
                    
                    <div style="max-height: 300px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 8px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead style="background: #f8f9fa; position: sticky; top: 0;">
                                <tr>
                                    <th style="padding: 10px; text-align: left; font-size: 12px;">Aluno</th>
                                    <th style="padding: 10px; text-align: center; font-size: 12px;">Nota</th>
                                    <th style="padding: 10px; text-align: center; font-size: 12px;">Acertos</th>
                                    <th style="padding: 10px; text-align: center; font-size: 12px;">Status</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            resultados.slice(0, 30).forEach(r => {
                let statusClass = '';
                let statusText = '';
                let statusColor = '';

                if (r.cancelada) {
                    statusText = 'Cancelada';
                    statusColor = '#dc3545';
                } else if (r.nota && r.nota >= 7) {
                    statusText = 'Aprovado';
                    statusColor = '#28a745';
                } else if (r.nota) {
                    statusText = 'Reprovado';
                    statusColor = '#dc3545';
                } else {
                    statusText = 'Pendente';
                    statusColor = '#ffc107';
                }

                html += `
                    <tr style="border-bottom: 1px solid #dee2e6;">
                        <td style="padding: 10px; font-size: 13px;">${r.alunoNome || 'N/A'}</td>
                        <td style="padding: 10px; text-align: center; font-weight: bold; color: ${r.nota ? (r.nota >= 7 ? '#28a745' : '#dc3545') : '#666'};">
                            ${r.nota ? r.nota.toFixed(2) : '-'}
                        </td>
                        <td style="padding: 10px; text-align: center;">${r.acertos || 0}/${r.total || 0}</td>
                        <td style="padding: 10px; text-align: center;">
                            <span style="background: ${statusColor}; color: white; padding: 3px 8px; border-radius: 12px; font-size: 11px;">
                                ${statusText}
                            </span>
                        </td>
                    </tr>
                `;
            });

            if (resultados.length > 30) {
                html += `
                    <tr>
                        <td colspan="4" style="padding: 15px; text-align: center; color: #666;">
                            ... e mais ${resultados.length - 30} resultados
                        </td>
                    </tr>
                `;
            }

            html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;

            this.abrirModal(`📊 Resultados`, html, false);

        } catch (error) {
            console.error('Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============ PUBLICAR PROVA ============
    async publicarProva(id) {
        const prova = this.provas.find(p => p.id === id);
        if (!prova) return;

        if (prova.publicada) {
            this.showToast('❌ Esta prova já está publicada', 'error');
            return;
        }

        if (prova.cancelada) {
            this.showToast('❌ Não é possível publicar uma prova cancelada', 'error');
            return;
        }

        const confirmar = await this.confirmar(
            '📢 Publicar Prova',
            `Deseja publicar a prova <strong>${prova.titulo}</strong>?<br><br>
            Após publicada, os alunos poderão vê-la e realizá-la.`
        );

        if (!confirmar) return;

        try {
            this.showToast('Publicando...', 'info');

            const token = localStorage.getItem('auth_token');

            const responseProva = await fetch(`/api/provas/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const dataProva = await responseProva.json();
            const provaCompleta = dataProva.success ? dataProva.prova : null;

            const response = await fetch(`/api/professor/provas/${id}/publicar`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('✅ Prova publicada com sucesso!', 'success');

                if (provaCompleta && provaCompleta.turmaId) {
                    try {
                        const turmaRes = await fetch(`/api/turmas/${provaCompleta.turmaId}`, {
                            headers: { 'Authorization': `Bearer ${token}` }
                        });

                        const turmaData = await turmaRes.json();
                        const turma = turmaData.success ? turmaData.turma : null;

                        if (turma && turma.alunos && turma.alunos.length > 0) {
                            const alunos = turma.alunos;
                            console.log(`📢 Notificando ${alunos.length} alunos sobre nova prova...`);

                            const configRes = await fetch('/api/admin/configuracoes', {
                                headers: { 'Authorization': `Bearer ${token}` }
                            }).catch(() => ({ json: () => ({ configuracoes: { notificacoes: { push: false } } }) }));

                            const configData = await configRes.json();
                            const pushAtivado = configData.configuracoes?.notificacoes?.push === true;

                            let notificacoesEnviadas = 0;

                            for (const aluno of alunos) {
                                try {
                                    const alunoId = aluno._id || aluno.id;

                                    await fetch('/api/notificacoes', {
                                        method: 'POST',
                                        headers: {
                                            'Authorization': `Bearer ${token}`,
                                            'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify({
                                            usuarioId: alunoId,
                                            tipo: 'sistema',
                                            titulo: '📝 Nova Prova Publicada',
                                            mensagem: `A prova "${prova.titulo}" foi publicada na turma ${turma.nome}.`,
                                            icone: '📚',
                                            cor: '#10b981',
                                            link: `/aluno.html`,
                                            prioridade: 3,
                                            dados: {
                                                provaId: id,
                                                provaTitulo: prova.titulo,
                                                turmaId: turma._id,
                                                turmaNome: turma.nome,
                                                tipo: 'nova_prova'
                                            }
                                        })
                                    });

                                    if (pushAtivado) {
                                        await this.enviarPushParaUsuario(
                                            alunoId,
                                            '📝 Nova Prova',
                                            `Prova "${prova.titulo}" publicada em ${turma.nome}`,
                                            {
                                                tipo: 'nova_prova',
                                                provaId: id,
                                                provaTitulo: prova.titulo
                                            }
                                        );
                                    }

                                    notificacoesEnviadas++;

                                } catch (alunoError) {
                                    console.error(`Erro ao notificar aluno ${aluno._id}:`, alunoError);
                                }
                            }

                            console.log(`✅ ${notificacoesEnviadas} alunos notificados sobre nova prova`);
                            this.showToast(`📢 ${notificacoesEnviadas} alunos notificados!`, 'info');
                        }
                    } catch (notifError) {
                        console.error('❌ Erro ao notificar alunos:', notifError);
                    }
                }

                await this.carregarProvas();
            } else {
                throw new Error(data.error || 'Erro ao publicar');
            }

        } catch (error) {
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============ ADIAR PROVA ============
    async adiarProva(id) {
        console.log('📅 adiarProva chamado com ID:', id);
        const prova = this.provas.find(p => p.id === id);
        if (!prova) return;

        if (!prova.publicada) {
            this.showToast('❌ Apenas provas publicadas podem ser adiadas', 'error');
            return;
        }

        if (prova.cancelada) {
            this.showToast('❌ Não é possível adiar uma prova cancelada', 'error');
            return;
        }

        const dataAtual = prova.dataLimite ? new Date(prova.dataLimite).toISOString().split('T')[0] : '';
        const hoje = new Date().toISOString().split('T')[0];

        const html = `
            <div style="padding: 20px;">
                <p><strong>Prova:</strong> ${prova.titulo}</p>
                <p><strong>Data limite atual:</strong> ${prova.dataLimite ? new Date(prova.dataLimite).toLocaleDateString('pt-BR') : 'Não definida'}</p>
                
                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Nova data limite</label>
                    <input type="date" id="novaDataLimite" class="form-control" value="${dataAtual}" min="${hoje}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;" required>
                </div>
                
                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Novo horário de término</label>
                    <input type="time" id="novoHorarioTermino" class="form-control" value="${prova.horarioTermino || '23:59'}" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                </div>
                
                <div class="form-group" style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Justificativa (opcional)</label>
                    <input type="text" id="justificativaAdiamento" class="form-control" placeholder="Motivo do adiamento..." style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 5px;">
                </div>
                
                <div class="info-card" style="background: #e3f2fd; padding: 12px; border-radius: 5px; margin-top: 15px; display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-info-circle" style="color: #084298; font-size: 18px;"></i>
                    <span style="color: #084298; font-size: 13px;">Os alunos serão notificados sobre a nova data</span>
                </div>
            </div>
        `;

        this.abrirModal('📅 Adiar Prova', html, true);

        document.getElementById('modalSaveBtn').onclick = () => this.confirmarAdiamento(id);
    }

    // ============ CONFIRMAR ADIAMENTO ============
    async confirmarAdiamento(provaId) {
        const novaData = document.getElementById('novaDataLimite')?.value;
        const novoHorario = document.getElementById('novoHorarioTermino')?.value;
        const justificativa = document.getElementById('justificativaAdiamento')?.value;

        if (!novaData) {
            this.showToast('❌ Selecione uma nova data', 'error');
            return;
        }

        try {
            this.showToast('📅 Adiando prova...', 'info');

            const token = localStorage.getItem('auth_token');

            const responseProva = await fetch(`/api/provas/${provaId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const dataProva = await responseProva.json();
            const prova = dataProva.success ? dataProva.prova : null;

            if (!prova) {
                throw new Error('Prova não encontrada');
            }

            const novaDataLimite = `${novaData}T${novoHorario || '23:59'}:00`;
            const dataFormatada = new Date(novaDataLimite).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
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
                if (prova.userId) {
                    const professorNome = prova.professor?.nome || 'Professor';

                    await fetch('/api/notificacoes', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            usuarioId: prova.userId,
                            tipo: 'sistema',
                            titulo: '📅 Prova Adiada',
                            mensagem: `A prova "${prova.titulo}" foi adiada para ${dataFormatada}. ${justificativa ? `Motivo: ${justificativa}` : ''}`,
                            icone: '📅',
                            cor: '#e67e22',
                            link: `/admin-simples.html?prova=${provaId}`,
                            prioridade: 3,
                            dados: {
                                provaId: provaId,
                                provaTitulo: prova.titulo,
                                novaData: novaDataLimite,
                                justificativa: justificativa,
                                tipo: 'adiamento'
                            }
                        })
                    });

                    await this.enviarPushParaUsuario(
                        prova.userId,
                        '📅 Prova Adiada',
                        `A prova "${prova.titulo}" foi adiada para ${dataFormatada}`,
                        {
                            tipo: 'adiamento',
                            provaId: provaId,
                            novaData: novaDataLimite
                        }
                    );

                    console.log('✅ Professor notificado sobre adiamento');
                }

                if (prova.turmaId && prova.turmaId.alunos && prova.turmaId.alunos.length > 0) {
                    const alunos = prova.turmaId.alunos;
                    console.log(`📢 Notificando ${alunos.length} alunos sobre adiamento...`);

                    let notificacoesEnviadas = 0;

                    for (const alunoId of alunos) {
                        try {
                            await fetch('/api/notificacoes', {
                                method: 'POST',
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify({
                                    usuarioId: alunoId,
                                    tipo: 'sistema',
                                    titulo: '📅 Prova Adiada',
                                    mensagem: `A prova "${prova.titulo}" foi adiada para ${dataFormatada}. ${justificativa ? `Motivo: ${justificativa}` : 'Verifique o novo prazo.'}`,
                                    icone: '📅',
                                    cor: '#e67e22',
                                    link: `/aluno.html`,
                                    prioridade: 3,
                                    dados: {
                                        provaId: provaId,
                                        provaTitulo: prova.titulo,
                                        novaData: novaDataLimite,
                                        tipo: 'adiamento'
                                    }
                                })
                            });

                            await this.enviarPushParaUsuario(
                                alunoId,
                                '📅 Prova Adiada',
                                `A prova "${prova.titulo}" foi adiada para ${dataFormatada}`,
                                {
                                    tipo: 'adiamento',
                                    provaId: provaId,
                                    novaData: novaDataLimite
                                }
                            );

                            notificacoesEnviadas++;

                        } catch (alunoError) {
                            console.error(`Erro ao notificar aluno ${alunoId}:`, alunoError);
                        }
                    }

                    console.log(`✅ ${notificacoesEnviadas} alunos notificados sobre adiamento`);
                }

                this.showToast('✅ Data limite atualizada com sucesso!', 'success');
                this.fecharModal();

                await this.carregarProvas();

                setTimeout(() => {
                    this.showToast(`📅 Nova data: ${dataFormatada}`, 'info');
                }, 1500);

            } else {
                throw new Error(data.error || 'Erro ao adiar prova');
            }

        } catch (error) {
            console.error('❌ Erro ao adiar prova:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============ EXCLUIR PROVA ============
    async excluirProva(id) {
        console.log('🗑️ excluirProva chamado com ID:', id);

        const prova = this.provas.find(p => p.id === id);
        if (!prova) {
            this.showToast('❌ Prova não encontrada', 'error');
            return;
        }

        let mensagemConfirmacao = '';
        let tipoAlerta = '';

        if (prova.publicada && (!prova.dataLimite || new Date(prova.dataLimite) > new Date())) {
            tipoAlerta = '⚠️ PROVA ATIVA';
            mensagemConfirmacao = `
                <strong>⚠️ ATENÇÃO: Esta prova está ATIVA!</strong><br><br>
                <strong>Prova:</strong> ${prova.titulo}<br>
                <strong>Status:</strong> Publicada e disponível para os alunos<br><br>
                <span style="color: #e74c3c;">Excluir esta prova irá:</span><br>
                • Remover a prova permanentemente<br>
                • Excluir todos os resultados já registrados<br>
                • Os alunos não terão mais acesso à prova<br><br>
                <strong>Esta ação não pode ser desfeita!</strong><br><br>
                Deseja continuar mesmo assim?
            `;
        } 
        else if (prova.cancelada) {
            tipoAlerta = '📋 PROVA CANCELADA';
            mensagemConfirmacao = `
                <strong>Prova Cancelada: ${prova.titulo}</strong><br><br>
                Esta prova já está cancelada e será excluída permanentemente.<br>
                Todos os dados serão removidos.<br><br>
                Deseja continuar?
            `;
        }
        else if (!prova.publicada) {
            tipoAlerta = '📝 RASCUNHO';
            mensagemConfirmacao = `
                <strong>Excluir rascunho: ${prova.titulo}</strong><br><br>
                Este é um rascunho que ainda não foi publicado.<br>
                Deseja excluir permanentemente?
            `;
        }
        else {
            tipoAlerta = '📄 PROVA EXPIRADA';
            mensagemConfirmacao = `
                <strong>Excluir prova expirada: ${prova.titulo}</strong><br><br>
                Esta prova já expirou e será excluída permanentemente.<br>
                Deseja continuar?
            `;
        }

        if (prova.totalParticipantes > 0) {
            mensagemConfirmacao = `
                ${mensagemConfirmacao}<br><br>
                <span style="color: #e67e22;">⚠️ IMPORTANTE: Esta prova tem <strong>${prova.totalParticipantes} aluno(s)</strong> que já realizaram!</span><br>
                Excluir a prova removerá TODOS os resultados desses alunos.<br>
                Esta ação não pode ser desfeita.
            `;
        }

        const confirmar = await this.confirmar(
            tipoAlerta,
            mensagemConfirmacao,
            'Sim, excluir permanentemente', 
            'Cancelar'
        );

        if (!confirmar) return;

        try {
            this.showToast('🗑️ Excluindo prova...', 'info');

            const response = await fetch(`/api/professor/provas/${id}`, {
                method: 'DELETE',
                headers: { 
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.success) {
                this.showToast('✅ Prova excluída com sucesso!', 'success');

                this.provas = this.provas.filter(p => p.id !== id);

                const tabela = document.getElementById('tabelaProvas');
                if (tabela) {
                    tabela.innerHTML = this.gerarLinhasProvas(this.provas);
                }

                this.atualizarContadoresProvas();

            } else {
                throw new Error(data.error || 'Erro ao excluir prova');
            }

        } catch (error) {
            console.error('❌ Erro ao excluir prova:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============ ATUALIZAR CONTADORES DE PROVAS ============
    atualizarContadoresProvas() {
        const totalEl = document.getElementById('totalProvasCount');
        const ativasEl = document.getElementById('ativasCount');
        const rascunhosEl = document.getElementById('rascunhosCount');

        if (totalEl) {
            totalEl.textContent = this.provas.length;
        }

        if (ativasEl) {
            const ativas = this.provas.filter(p => 
                p.publicada && !p.cancelada && (!p.dataLimite || new Date(p.dataLimite) > new Date())
            ).length;
            ativasEl.textContent = ativas;
        }

        if (rascunhosEl) {
            const rascunhos = this.provas.filter(p => !p.publicada && !p.cancelada).length;
            rascunhosEl.textContent = rascunhos;
        }
    }
        // ============ FUNÇÃO DE IMPRESSÃO COM FLUXO DE ADAPTAÇÃO ============
    async baixarImprimirProva(provaId) {
        console.log('🖨️ Baixando/Imprimindo prova:', provaId);

        try {
            const token = localStorage.getItem('auth_token');

            this.closeAllModals();

            const IS_LOCALHOST = window.location.hostname === 'localhost' || 
                                window.location.hostname === '127.0.0.1';
            const IS_RENDER = window.location.hostname.includes('render.com') || 
                            window.location.hostname.includes('sistema-avaliativo');

            let API_BASE_URL;
            if (IS_LOCALHOST) {
                API_BASE_URL = 'http://localhost:3000/api';
                console.log('🔧 Modo: DESENVOLVIMENTO LOCAL');
            } else if (IS_RENDER) {
                API_BASE_URL = window.location.origin + '/api';
                console.log('🚀 Modo: PRODUÇÃO (Render)');
            } else {
                API_BASE_URL = '/api';
                console.log('⚙️ Modo: FALLBACK');
            }

            this.showToast('📄 Preparando prova para impressão...', 'info');

            const response = await fetch(`${API_BASE_URL}/provas/${provaId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Erro ao carregar dados da prova');

            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro ao carregar prova');

            const prova = data.prova;
            const questoes = data.questoes || [];

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

                const qrData = await qrResponse.json();
                if (qrData.success && qrData.qrCode) {
                    qrCodeDataUrl = qrData.qrCode;
                    console.log('✅ QR Code gerado com sucesso');
                }
            } catch (qrError) {
                console.error('❌ Erro ao buscar QR Code:', qrError);
                qrCodeDataUrl = '';
            }

            window.provaParaImpressao = { prova, questoes, qrCodeDataUrl, API_BASE_URL, token };

            await this.carregarAlunosParaImpressao();

            this.mostrarModalPerguntaAdaptacao();

        } catch (error) {
            console.error('❌ Erro ao preparar impressão:', error);
            this.showToast(`❌ Erro: ${error.message}`, 'error');
        }
    }

    // ============ CARREGAR ALUNOS DA TURMA ============
    async carregarAlunosParaImpressao() {
        try {
            const { prova } = window.provaParaImpressao || {};

            if (!prova) {
                window.alunosDaTurma = [];
                return;
            }

            let turmaId = prova.turmaId || prova.turma?.id || prova.turma;

            if (!turmaId) {
                window.alunosDaTurma = [];
                return;
            }

            const tokenLocal = localStorage.getItem('auth_token');

            const response = await fetch(`/api/turmas/${turmaId}`, {
                headers: { 'Authorization': `Bearer ${tokenLocal}` }
            });

            if (!response.ok) {
                throw new Error(`Erro ${response.status}`);
            }

            const data = await response.json();

            let alunosRaw = [];

            if (data.success && data.turma && data.turma.alunos) {
                alunosRaw = data.turma.alunos;
            } else if (data.turma && data.turma.alunos) {
                alunosRaw = data.turma.alunos;
            } else if (data.alunos) {
                alunosRaw = data.alunos;
            }

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

    // ============ MODAL: PERGUNTAR SE DESEJA ADAPTAR ============
    mostrarModalPerguntaAdaptacao() {
        if (!window.provaParaImpressao || !window.provaParaImpressao.prova) {
            this.showToast('❌ Dados da prova não encontrados.', 'error');
            return;
        }

        this.closeAllModals();

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'modalPerguntaAdaptacao';
        modal.style.display = 'flex';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modal.style.zIndex = '10001';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';

        const alunos = window.alunosDaTurma || [];
        const temAlunos = alunos.length > 0;

        let selectOptions = '<option value="">Selecione um aluno...</option>';
        if (temAlunos) {
            selectOptions += alunos.map(aluno => `
                <option value="${aluno.id}">
                    ${aluno.nome} ${aluno.matricula ? `(${aluno.matricula})` : ''}
                </option>
            `).join('');
        } else {
            selectOptions = '<option value="" disabled>Nenhum aluno encontrado</option>';
        }

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px; width: 90%; background: white; border-radius: 24px; padding: 0; box-shadow: 0 20px 40px rgba(0,0,0,0.2);">
                <div class="modal-header" style="background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 20px 25px; border-radius: 24px 24px 0 0; display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="margin: 0; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-print"></i> Imprimir Prova
                    </h3>
                    <button onclick="adminSimples.fecharModalImpressao()" style="background: none; border: none; color: white; font-size: 28px; cursor: pointer;">&times;</button>
                </div>
                
                <div style="padding: 25px;">
                    <p style="color: #4b5563; margin-bottom: 20px; text-align: center; font-size: 1rem;">
                        Deseja adaptar esta prova para acessibilidade?
                    </p>
                    
                    <div style="margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 16px;">
                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; margin-bottom: 12px;">
                            <input type="radio" name="tipoImpressao" value="individual" ${temAlunos ? 'checked' : 'disabled'} onchange="adminSimples.toggleOpcaoAlunos()">
                            <span><strong>👤 Imprimir para um aluno específico</strong></span>
                        </label>
                        
                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                            <input type="radio" name="tipoImpressao" value="todos" ${temAlunos ? '' : 'checked disabled'} onchange="adminSimples.toggleOpcaoAlunos()">
                            <span><strong>👥 Imprimir para todos os alunos da turma</strong></span>
                        </label>
                        
                        <div id="selectAlunosContainer" style="margin-top: 15px; ${temAlunos ? 'display: block;' : 'display: none;'}">
                            <label style="display: block; margin-bottom: 8px; font-weight: 500;">
                                <i class="fas fa-user-graduate"></i> Selecione o aluno:
                            </label>
                            <select id="selectAlunoImpressao" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #ddd;">
                                ${selectOptions}
                            </select>
                        </div>
                        
                        <div style="margin-top: 12px; padding: 10px; background: #e0f2fe; border-radius: 8px; font-size: 0.85rem;">
                            <i class="fas fa-info-circle"></i>
                            <span id="infoImpressao">${temAlunos ? 'Selecione um aluno ou imprima para todos.' : 'Nenhum aluno encontrado nesta turma.'}</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 15px;">
                        <button onclick="adminSimples.gerarImpressaoNormal()" style="flex: 1; padding: 14px; background: #6b7280; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">
                            <i class="fas fa-times"></i> Não, imprimir normal
                        </button>
                        <button onclick="adminSimples.mostrarModalOpcoesAdaptacao()" style="flex: 1; padding: 14px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">
                            <i class="fas fa-universal-access"></i> Sim, adaptar
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
    }

    // ============ ALTERNAR ENTRE IMPRESSÃO INDIVIDUAL E TODOS ============
    toggleOpcaoAlunos() {
        const tipoImpressao = document.querySelector('input[name="tipoImpressao"]:checked')?.value;
        const selectContainer = document.getElementById('selectAlunosContainer');
        const infoSpan = document.getElementById('infoImpressao');

        if (tipoImpressao === 'individual') {
            if (selectContainer) selectContainer.style.display = 'block';
            if (infoSpan) infoSpan.innerHTML = 'Será gerada uma prova com QR Code específico para o aluno selecionado.';
        } else {
            if (selectContainer) selectContainer.style.display = 'none';
            if (infoSpan) infoSpan.innerHTML = 'Será gerado um documento único com todos os alunos da turma.';
        }
    }

    // ============ MODAL DE OPÇÕES DE ADAPTAÇÃO ============
    mostrarModalOpcoesAdaptacao() {
        if (!window.provaParaImpressao || !window.provaParaImpressao.prova) {
            this.showToast('❌ Dados da prova não encontrados.', 'error');
            return;
        }

        const modalPergunta = document.getElementById('modalPerguntaAdaptacao');
        if (modalPergunta) modalPergunta.style.display = 'none';

        let modalOpcoes = document.getElementById('modalOpcoesAdaptacao');
        if (modalOpcoes) modalOpcoes.remove();

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'modalOpcoesAdaptacao';
        modal.style.display = 'flex';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modal.style.zIndex = '10002';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';

        const { prova } = window.provaParaImpressao;
        const isAdaptada = prova?.tipoProva === 'adaptada' || prova?.adaptada === true;

        modal.innerHTML = `
            <div class="modal-content" style="max-width: 580px; width: 90%; background: white; border-radius: 24px; padding: 0; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header" style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 20px 25px; border-radius: 24px 24px 0 0; display: flex; justify-content: space-between; position: sticky; top: 0; z-index: 10;">
                    <h3 style="margin: 0;"><i class="fas fa-universal-access"></i> Opções de Adaptação</h3>
                    <button onclick="adminSimples.fecharModalOpcoesAdaptacao()" style="background: none; border: none; color: white; font-size: 28px; cursor: pointer;">&times;</button>
                </div>
                <div style="padding: 25px;">
                    ${isAdaptada ? `<div style="background: #dbeafe; padding: 10px; margin-bottom: 15px; border-radius: 8px;"><i class="fas fa-info-circle"></i> Prova originalmente adaptada - 3 alternativas</div>` : ''}
                    
                    <div style="display: flex; flex-direction: column; gap: 15px;">
                        <div style="background: #f8fafc; padding: 15px; border-radius: 16px; border: 2px solid #e5e7eb;">
                            <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; margin-bottom: 10px;">
                                <input type="checkbox" id="optFonteDinamica" style="width: 20px; height: 20px;">
                                <div>
                                    <strong style="font-size: 1rem;">🔍 Fonte Dinâmica</strong>
                                    <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Amplie o tamanho da fonte conforme sua necessidade</p>
                                </div>
                            </label>
                            <div id="sliderContainer" style="display: none; margin-top: 15px; padding-top: 10px; border-top: 1px solid #e5e7eb;">
                                <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                    <span style="font-size: 12px;">Normal (12pt)</span>
                                    <span style="font-size: 12px; font-weight: bold;" id="tamanhoFonteAtual">12pt</span>
                                    <span style="font-size: 12px;">Máximo (48pt)</span>
                                </div>
                                <input type="range" id="fonteSlider" min="12" max="48" step="1" value="12" style="width: 100%; margin: 10px 0;">
                                <div style="display: flex; justify-content: space-between; gap: 10px; margin-top: 10px;">
                                    <button type="button" onclick="adminSimples.ajustarFonte(12)" style="flex: 1; padding: 6px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Normal</button>
                                    <button type="button" onclick="adminSimples.ajustarFonte(18)" style="flex: 1; padding: 6px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Médio</button>
                                    <button type="button" onclick="adminSimples.ajustarFonte(24)" style="flex: 1; padding: 6px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Grande</button>
                                    <button type="button" onclick="adminSimples.ajustarFonte(36)" style="flex: 1; padding: 6px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Muito Grande</button>
                                    <button type="button" onclick="adminSimples.ajustarFonte(48)" style="flex: 1; padding: 6px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Máximo</button>
                                </div>
                                <div style="margin-top: 10px; padding: 8px; background: #f1f5f9; border-radius: 8px; text-align: center; font-size: 12px; color: #475569;">
                                    <i class="fas fa-mouse-pointer"></i> <strong>Pré-visualização:</strong>
                                    <span id="previewFonte" style="font-size: 12px; display: inline-block; margin-left: 8px;">Texto exemplo</span>
                                </div>
                            </div>
                        </div>
                        
                        <div style="background: #f8fafc; padding: 15px; border-radius: 16px; border: 2px solid #e5e7eb;">
                            <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                <input type="checkbox" id="optCaixaAlta" style="width: 20px; height: 20px;">
                                <div>
                                    <strong style="font-size: 1rem;">🔠 CAIXA ALTA (Maiúsculas)</strong>
                                    <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Converte todo o texto para letras maiúsculas</p>
                                </div>
                            </label>
                            <div id="caixaAltaPreview" style="margin-top: 10px; padding: 8px; background: #fff; border-radius: 8px; font-size: 12px; color: #64748b; border: 1px solid #e5e7eb;">
                                <i class="fas fa-eye"></i> Pré-visualização: <span id="previewCaixaAlta">Exemplo de texto em maiúsculas</span>
                            </div>
                        </div>
                        
                        <div style="background: #f8fafc; padding: 15px; border-radius: 16px; border: 2px solid #e5e7eb;">
                            <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                <input type="checkbox" id="optNegrito" style="width: 20px; height: 20px;">
                                <div>
                                    <strong style="font-size: 1rem;">🔤 Texto em Negrito</strong>
                                    <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Aplicar negrito em todo o texto da prova</p>
                                </div>
                            </label>
                        </div>
                        
                        <div style="background: #f8fafc; padding: 15px; border-radius: 16px; border: 2px solid #e5e7eb;">
                            <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                <input type="checkbox" id="optAltoContraste" style="width: 20px; height: 20px;">
                                <div>
                                    <strong style="font-size: 1rem;">🎨 Alto Contraste</strong>
                                    <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Fundo escuro com texto claro para melhor visualização</p>
                                </div>
                            </label>
                        </div>
                        
                        <div style="background: #f8fafc; padding: 15px; border-radius: 16px; border: 2px solid #e5e7eb;">
                            <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                <input type="checkbox" id="optLayoutSimplificado" style="width: 20px; height: 20px;">
                                <div>
                                    <strong style="font-size: 1rem;">📄 Layout Simplificado</strong>
                                    <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Remover elementos decorativos, manter apenas o essencial</p>
                                </div>
                            </label>
                        </div>
                    </div>
                    
                    <div style="margin-top: 20px; padding: 12px; background: #fef3c7; border-radius: 12px;">
                        <p style="margin: 0; font-size: 0.85rem;"><i class="fas fa-lightbulb"></i> <strong>Dica:</strong> Você pode combinar várias opções conforme a necessidade do aluno.</p>
                    </div>
                    
                    <div style="display: flex; gap: 12px; margin-top: 25px;">
                        <button type="button" onclick="adminSimples.gerarImpressaoComOpcoes()" style="flex: 1; padding: 14px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Imprimir com Adaptações</button>
                        <button type="button" onclick="adminSimples.fecharModalOpcoesAdaptacao()" style="flex: 1; padding: 14px; background: #6b7280; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Cancelar</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const fonteDinamicaCheckbox = document.getElementById('optFonteDinamica');
        const sliderContainer = document.getElementById('sliderContainer');
        const fonteSlider = document.getElementById('fonteSlider');
        const tamanhoAtual = document.getElementById('tamanhoFonteAtual');
        const previewFonte = document.getElementById('previewFonte');

        const caixaAltaCheckbox = document.getElementById('optCaixaAlta');
        const previewCaixaAlta = document.getElementById('previewCaixaAlta');

        if (caixaAltaCheckbox && previewCaixaAlta) {
            caixaAltaCheckbox.addEventListener('change', function() {
                if (this.checked) {
                    previewCaixaAlta.style.textTransform = 'uppercase';
                    previewCaixaAlta.style.fontWeight = 'bold';
                    previewCaixaAlta.style.color = '#10b981';
                    previewCaixaAlta.innerHTML = 'EXEMPLO DE TEXTO EM MAIÚSCULAS';
                } else {
                    previewCaixaAlta.style.textTransform = 'none';
                    previewCaixaAlta.style.fontWeight = 'normal';
                    previewCaixaAlta.style.color = '#64748b';
                    previewCaixaAlta.innerHTML = 'Exemplo de texto em maiúsculas';
                }
            });
        }

        if (fonteDinamicaCheckbox) {
            fonteDinamicaCheckbox.addEventListener('change', function() {
                sliderContainer.style.display = this.checked ? 'block' : 'none';
            });
        }

        if (fonteSlider) {
            fonteSlider.addEventListener('input', function() {
                const tamanho = this.value;
                tamanhoAtual.textContent = tamanho + 'pt';
                previewFonte.style.fontSize = tamanho + 'pt';
                previewFonte.style.fontWeight = 'bold';
            });
            fonteSlider.dispatchEvent(new Event('input'));
        }
    }

    // ============ AJUSTAR FONTE ============
    ajustarFonte(tamanho) {
        const slider = document.getElementById('fonteSlider');
        const tamanhoAtual = document.getElementById('tamanhoFonteAtual');
        const previewFonte = document.getElementById('previewFonte');

        if (slider) {
            slider.value = tamanho;
            tamanhoAtual.textContent = tamanho + 'pt';
            previewFonte.style.fontSize = tamanho + 'pt';

            const checkbox = document.getElementById('optFonteDinamica');
            if (checkbox && !checkbox.checked) {
                checkbox.checked = true;
                const sliderContainer = document.getElementById('sliderContainer');
                if (sliderContainer) sliderContainer.style.display = 'block';
            }
        }
    }

    // ============ IMPRESSÃO NORMAL ============
    async gerarImpressaoNormal() {
        console.log('🖨️ Gerando impressão normal (sem adaptações)...');

        const { prova, questoes, qrCodeDataUrl } = window.provaParaImpressao || {};
        if (!prova) {
            console.error('❌ Dados da prova não encontrados');
            this.showToast('❌ Erro: dados da prova não encontrados', 'error');
            return;
        }

        const tipoImpressao = document.querySelector('input[name="tipoImpressao"]:checked')?.value;
        const selectAluno = document.getElementById('selectAlunoImpressao');
        const alunoId = selectAluno?.value;
        const alunoNome = selectAluno?.options[selectAluno.selectedIndex]?.text.split('(')[0].trim();

        this.fecharModalImpressao();

        if (tipoImpressao === 'todos') {
            const alunos = window.alunosDaTurma || [];
            if (alunos.length === 0) {
                this.showToast('⚠️ Nenhum aluno encontrado', 'info');
                return;
            }
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
            console.log(`📱 Buscando QR Code do aluno ${alunoId} no banco...`);

            const response = await fetch(`/api/aluno/qrcode/${alunoId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.success && data.qrCode) {
                qrCodeAlunoUrl = data.qrCode;
                window.alunoSelecionadoNome = alunoNome;
                console.log(`✅ QR Code do aluno ${alunoNome} obtido do banco (gerado em ${data.geradoEm})`);
            } else {
                console.warn('⚠️ QR Code não encontrado no banco para o aluno:', alunoId);
                this.showToast('⚠️ QR Code do aluno não encontrado. Peça para o aluno atualizar o cadastro.', 'warning');
            }
        } catch (error) {
            console.error('❌ Erro ao buscar QR Code do aluno no banco:', error);
            this.showToast('❌ Erro ao buscar QR Code do aluno', 'error');
        }

        await this.gerarHTMLImpressao(prova, questoes, qrCodeDataUrl, {}, qrCodeAlunoUrl, alunoNome);
    }

    // ============ IMPRESSÃO COM OPÇÕES ============
    async gerarImpressaoComOpcoes() {
        console.log('🎨 Gerando impressão com as opções selecionadas...');

        const { prova, questoes, qrCodeDataUrl } = window.provaParaImpressao || {};
        if (!prova) {
            this.showToast('❌ Dados da prova não encontrados', 'error');
            return;
        }

        const fonteDinamicaHabilitada = document.getElementById('optFonteDinamica')?.checked || false;
        const tamanhoFonte = fonteDinamicaHabilitada ? (document.getElementById('fonteSlider')?.value || 12) : 12;

        const opcoes = {
            fonteAmpliada: fonteDinamicaHabilitada ? tamanhoFonte : false,
            fontePersonalizada: fonteDinamicaHabilitada ? tamanhoFonte : false,
            negrito: document.getElementById('optNegrito')?.checked || false,
            altoContraste: document.getElementById('optAltoContraste')?.checked || false,
            layoutSimplificado: document.getElementById('optLayoutSimplificado')?.checked || false,
            tamanhoFonte: parseInt(tamanhoFonte),
            caixaAlta: document.getElementById('optCaixaAlta')?.checked || false
        };

        const nenhumaOpcao = !opcoes.fonteAmpliada && !opcoes.negrito && !opcoes.altoContraste && !opcoes.layoutSimplificado && !opcoes.caixaAlta;

        if (nenhumaOpcao) {
            const confirmar = await this.confirmar(
                '📄 Nenhuma Adaptação',
                'Nenhuma opção de adaptação foi selecionada.<br><br>Deseja imprimir a prova normalmente?',
                'Sim, imprimir normal',
                'Cancelar'
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
            if (alunos.length === 0) {
                this.showToast('⚠️ Nenhum aluno encontrado', 'info');
                return;
            }
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
            console.log(`📱 Buscando QR Code do aluno ${alunoId} no banco...`);

            const response = await fetch(`/api/aluno/qrcode/${alunoId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();

            if (data.success && data.qrCode) {
                qrCodeAlunoUrl = data.qrCode;
                window.alunoSelecionadoNome = alunoNome;
                console.log(`✅ QR Code do aluno ${alunoNome} obtido do banco (gerado em ${data.geradoEm})`);
            } else {
                console.warn('⚠️ QR Code não encontrado no banco para o aluno:', alunoId);
                this.showToast('⚠️ QR Code do aluno não encontrado. Peça para o aluno atualizar o cadastro.', 'warning');
            }
        } catch (error) {
            console.error('❌ Erro ao buscar QR Code do aluno no banco:', error);
            this.showToast('❌ Erro ao buscar QR Code do aluno', 'error');
        }

        await this.gerarHTMLImpressao(prova, questoes, qrCodeDataUrl, opcoes, qrCodeAlunoUrl, alunoNome);
    }

    // ============ GERAR IMPRESSÃO PARA TODOS OS ALUNOS ============
    async gerarImpressaoTodosAlunos(prova, questoes, qrCodeDataUrl, opcoesAdaptacao, alunos) {
        this.showToast(`🖨️ Gerando prova para ${alunos.length} aluno(s)...`, 'info');

        try {
            const token = localStorage.getItem('auth_token');

            const IS_LOCALHOST = window.location.hostname === 'localhost' || 
                                window.location.hostname === '127.0.0.1';
            const IS_RENDER = window.location.hostname.includes('render.com') || 
                            window.location.hostname.includes('sistema-avaliativo');

            let BASE_URL;
            if (IS_LOCALHOST) {
                BASE_URL = 'http://localhost:3000';
            } else if (IS_RENDER) {
                BASE_URL = window.location.origin;
            } else {
                BASE_URL = window.location.origin;
            }

            this.showToast(`📱 Buscando QR Codes dos ${alunos.length} alunos no banco...`, 'info');

            const alunosComQRCode = await Promise.all(alunos.map(async (aluno) => {
                const alunoId = aluno.id || aluno._id;
                const alunoNome = aluno.nome || aluno.alunoNome || 'Aluno';

                let qrCodeAlunoUrl = '';
                try {
                    const response = await fetch(`/api/aluno/qrcode/${alunoId}`, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    const data = await response.json();
                    if (data.success && data.qrCode) {
                        qrCodeAlunoUrl = data.qrCode;
                    }
                } catch (error) {
                    console.error(`❌ Erro ao buscar QR Code para ${alunoNome}:`, error);
                }

                return { 
                    ...aluno, 
                    qrCodeDataUrl: qrCodeAlunoUrl,
                    id: alunoId,
                    nome: alunoNome
                };
            }));

            let htmlCompleto = '';

            for (let i = 0; i < alunosComQRCode.length; i++) {
                const aluno = alunosComQRCode[i];

                window.alunoSelecionadoNome = aluno.nome;

                const htmlAluno = this.gerarHTMLProvaCompleta(prova, questoes, qrCodeDataUrl, opcoesAdaptacao, aluno.qrCodeDataUrl, aluno.nome);
                htmlCompleto += htmlAluno;

                if (i < alunosComQRCode.length - 1) {
                    htmlCompleto += `<div style="page-break-before: always; break-before: page;"></div>`;
                }
            }

            const printWindow = window.open('', '_blank');
            printWindow.document.write(htmlCompleto);
            printWindow.document.close();

            printWindow.onload = function() {
                setTimeout(() => {
                    printWindow.print();
                    printWindow.onafterprint = function() {
                        printWindow.close();
                    };
                }, 500);
            };

            this.showToast(`✅ Impressão preparada para ${alunosComQRCode.length} aluno(s)!`, 'success');

        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast(`❌ Erro: ${error.message}`, 'error');
        }
    }

    // ============ GERAR HTML COMPLETO DA PROVA ============
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
                <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 8px 12px; margin: 10px 0; border-radius: 8px;">
                    <p style="margin: 0; font-size: 0.85rem; color: #92400e;">
                        <i class="fas fa-universal-access"></i> <strong>Prova Adaptada</strong> - Esta impressão inclui as seguintes adaptações: ${adaptacoesSelecionadas.join(', ')}.
                    </p>
                </div>
            `;
        }

        let questoesHTML = '';

        questoes.forEach((questao, index) => {
            const opcoes = questao.opcoes || [];

            const opcoesFormatadas = opcoes.map((opcao, optIndex) => {
                const letra = letrasUsadas[optIndex];
                let opcaoLimpa = opcao || 'Opção não disponível';
                if (opcaoLimpa.startsWith(`${letra})`) || opcaoLimpa.startsWith(`${letra}.`)) {
                    opcaoLimpa = opcaoLimpa.substring(2).trim();
                }
                return { letra, texto: opcaoLimpa };
            });

            questoesHTML += `
                <div class="questao-print">
                    <div class="questao-numero">
                        Questão ${index + 1} ${isAdaptada ? '(Prova Adaptada - 3 alternativas)' : ''}
                    </div>
                    <div class="questao-texto">
                        <strong>${questao.pergunta || 'Pergunta não disponível'}</strong>
                    </div>
                    <div class="opcoes-print">
                        ${opcoesFormatadas.map(op => `
                            <div class="opcao-linha">
                                <span class="opcao-letra">${op.letra})</span>
                                <span class="opcao-texto">${op.texto}</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="rascunho-area">
                        <small>Espaço para rascunho</small>
                        <div class="rascunho-linhas"></div>
                    </div>
                </div>
            `;
        });

        const gerarCartaoResposta = () => {
            const IS_LOCALHOST = window.location.hostname === 'localhost' || 
                                window.location.hostname === '127.0.0.1';
            const IS_RENDER = window.location.hostname.includes('render.com') || 
                            window.location.hostname.includes('sistema-avaliativo');

            let API_BASE_URL;
            if (IS_LOCALHOST) {
                API_BASE_URL = 'http://localhost:3000';
            } else if (IS_RENDER) {
                API_BASE_URL = window.location.origin;
            } else {
                API_BASE_URL = window.location.origin;
            }

            const qrCodeArea = qrCodeDataUrl ? `
                <div style="text-align: center; margin-top: 10px; padding: 8px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; display: inline-block; width: auto;">
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
                        <img src="${qrCodeDataUrl}" style="width: 85px; height: auto; border: 1px solid #ccc; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" alt="QR Code">
                        <div style="font-size: 9px; color: #666; text-align: center;">
                            <strong>📱 Correção Automática</strong><br>
                            Escaneie este QR Code
                        </div>
                    </div>
                </div>
            ` : '';

            const qrCodeAlunoArea = qrCodeAlunoUrl ? `
                <div style="text-align: center; margin-top: 10px; padding: 8px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; display: inline-block; width: auto;">
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
                        <img src="${qrCodeAlunoUrl}" style="width: 85px; height: auto; border: 1px solid #ccc; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" alt="QR Code do Aluno">
                        <div style="font-size: 9px; color: #666; text-align: center;">
                            <strong>👤 Identificação do Aluno</strong><br>
                            ${alunoNome || 'Aluno'}
                        </div>
                    </div>
                </div>
            ` : '';

            return `
                <div style="text-align: center;">
                    <div class="cartao-header" style="margin-bottom: 8px;">
                        <h4 style="margin: 0 0 5px 0; font-size: 11pt; font-weight: bold; text-align: center;">📝 CARTÃO-RESPOSTA</h4>
                        <div class="instrucoes-cartao" style="font-size: 8pt; color: #333; text-align: center; padding: 8px; background: #fef3c7; border-radius: 6px;">
                            <p style="margin: 0;"><strong>INSTRUÇÕES PARA PREENCHIMENTO DO CARTÃO-RESPOSTA</strong></p>
                            <p style="margin: 5px 0 0 0;">Ao marcar a alternativa correta no cartão-resposta (Gabarito), use caneta esferográfica de tinta azul ou preta. Será anulada a questão que contiver rasura ou, ainda, a que apresentar mais de uma alternativa assinalada no cartão-resposta (Gabarito).</p>
                        </div>
                    </div>
                    <div class="cartao-resposta" style="position: relative; margin: 8px auto; border: 2px solid #000; padding: 15px 12px 12px 12px; background: #fff; display: inline-block; width: 85%; box-sizing: border-box; max-width: 650px;">
                        <div style="position: absolute; top: 5px; left: 5px; width: 25px; height: 25px; background: #000 !important; border: 1px solid #000 !important; z-index: 5; print-color-adjust: exact;"></div>
                        <div style="position: absolute; top: 5px; right: 5px; width: 25px; height: 25px; background: #000 !important; border: 1px solid #000 !important; z-index: 5; print-color-adjust: exact;"></div>
                        <div style="position: absolute; bottom: 5px; left: 5px; width: 25px; height: 25px; background: #000 !important; border: 1px solid #000 !important; z-index: 5; print-color-adjust: exact;"></div>
                        <div style="position: absolute; bottom: 5px; right: 5px; width: 25px; height: 25px; background: #000 !important; border: 1px solid #000 !important; z-index: 5; print-color-adjust: exact;"></div>
                        <table style="width: 100%; border-collapse: collapse; border: 1px solid #000;">
                            <thead><tr style="background: #e8e8e8;"><th style="border: 1px solid #000; padding: 6px 3px; text-align: center; font-weight: bold; font-size: 8pt; width: 35px;">Q</th>${letrasUsadas.map(letra => `<th style="border: 1px solid #000; padding: 6px 3px; text-align: center; font-weight: bold; font-size: 8pt; width: 35px;">${letra}</th>`).join('')} </thead>
                            <tbody>${Array.from({ length: totalQuestoes }, (_, i) => `   <tr><td style="border: 1px solid #000; padding: 5px 3px; text-align: center; font-weight: bold; font-size: 8pt;">${i + 1}</td>${letrasUsadas.map(() => `<td style="border: 1px solid #000; padding: 5px 3px; text-align: center;"><div style="width: 12px; height: 12px; border: 1.5px solid #000; border-radius: 50%; margin: 0 auto;"></div></td>`).join('')}</tr>`).join('')}</tbody>
                        </table>
                    </div>
                    <div style="display: flex; justify-content: center; align-items: center; gap: 40px; margin-top: 15px; flex-wrap: wrap;">${qrCodeArea}${qrCodeAlunoArea}</div>
                </div>
            `;
        };

        let cssAdaptacoes = '';

        if (opcoesAdaptacao.caixaAlta) {
            cssAdaptacoes += `
                body, .questao-texto, .opcao-linha, .instrucoes-cartao, .questao-numero, 
                .cartao-header h4, .print-header h1, .print-prova-info h3, .label, .campo-label,
                .instrucoes-box h4, .info-label, .info-linha, .instrucoes-box li, .print-footer,
                .student-item, .campo-item, .cartao-resposta td, .cartao-resposta th,
                .rascunho-area small, .instrucoes-box ul, .instrucoes-box p,
                .student-item .label, .campo-item .campo-label, .info-linha .info-item,
                .print-prova-info .info-linha span, .questao-print, .opcoes-print,
                .opcao-linha .opcao-letra, .opcao-linha .opcao-texto, .print-header .student-row {
                    text-transform: uppercase !important;
                }
            `;
        }

        if (opcoesAdaptacao.fontePersonalizada && opcoesAdaptacao.tamanhoFonte) {
            const tamanho = opcoesAdaptacao.tamanhoFonte;
            cssAdaptacoes += `
                body { font-size: ${tamanho}pt !important; }
                .questao-texto { font-size: ${tamanho}pt !important; }
                .opcao-linha { font-size: ${tamanho - 2}pt !important; }
                .instrucoes-cartao { font-size: ${tamanho - 5}pt !important; }
                .rascunho-area small { font-size: ${tamanho - 5}pt !important; }
                .questao-numero { font-size: ${tamanho - 2}pt !important; }
                .print-header h1 { font-size: ${tamanho + 4}pt !important; }
                .print-prova-info h3 { font-size: ${tamanho + 2}pt !important; }
                .campos-box .campo-label, .student-item .label { font-size: ${tamanho - 2}pt !important; }
                .instrucoes-box li, .instrucoes-box h4, .info-linha, .info-item { font-size: ${tamanho - 4}pt !important; }
                .cartao-resposta th, .cartao-resposta td { font-size: ${tamanho - 4}pt !important; }
                .instrucoes-cartao p { font-size: ${tamanho - 4}pt !important; }
                .print-footer { font-size: ${tamanho - 4.5}pt !important; }
            `;
        } 
        else if (opcoesAdaptacao.fonteAmpliada && !opcoesAdaptacao.fontePersonalizada) {
            cssAdaptacoes += `
                body { font-size: 16pt !important; }
                .questao-texto { font-size: 16pt !important; }
                .opcao-linha { font-size: 14pt !important; }
                .instrucoes-cartao { font-size: 11pt !important; }
                .rascunho-area small { font-size: 10pt !important; }
                .questao-numero { font-size: 14pt !important; }
                .print-header h1 { font-size: 18pt !important; }
                .print-prova-info h3 { font-size: 16pt !important; }
                .campos-box .campo-label, .student-item .label { font-size: 12pt !important; }
                .instrucoes-box li, .instrucoes-box h4, .info-linha, .info-item { font-size: 11pt !important; }
            `;
        }

        if (opcoesAdaptacao.negrito) {
            cssAdaptacoes += `
                body, .questao-texto, .opcao-linha, .instrucoes-cartao, .questao-numero, 
                .cartao-header h4, .print-header h1, .print-prova-info h3, .label, .campo-label,
                .instrucoes-box h4, .info-label, .info-linha, .instrucoes-box li, .print-footer {
                    font-weight: bold !important;
                }
            `;
        }

        if (opcoesAdaptacao.altoContraste) {
            cssAdaptacoes += `
                body { background: #000000 !important; color: #ffffff !important; }
                .print-header, .campos-box, .instrucoes-box, .print-prova-info, 
                .cartao-resposta, .questao-print, .rascunho-area, .info-linha {
                    background: #000000 !important;
                    color: #ffffff !important;
                    border-color: #ffffff !important;
                }
                .underline, .campo-underline { border-bottom-color: #ffffff !important; }
                .rascunho-linhas { background: repeating-linear-gradient(transparent, transparent 16px, #ffffff 16px, #ffffff 18px) !important; }
            `;
        }

        if (opcoesAdaptacao.layoutSimplificado) {
            cssAdaptacoes += `
                .print-logo, .logo-iema { display: none !important; }
                .campos-box { border: 1px solid #000 !important; }
                .instrucoes-box { border: 1px solid #000 !important; background: #fefefe !important; }
                .print-header { border-bottom: 1px solid #000 !important; }
            `;
        }

        return `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Prova - ${provaTitulo}</title>
                <style>
                    @media print {
                        body { margin: 0; padding: 0; }
                        .questao-print { page-break-inside: avoid; }
                        .cartao-resposta { page-break-inside: avoid; }
                        .questoes-container { page-break-before: always; margin-top: 0; }
                    }
                    
                    body {
                        font-family: 'Times New Roman', Times, serif;
                        font-size: 12pt;
                        line-height: 1.3;
                        margin: 0;
                        padding: 0.4in;
                        background: white;
                        color: black;
                    }
                    
                    .print-header {
                        text-align: center;
                        margin-bottom: 6px;
                        padding-bottom: 6px;
                        border-bottom: 2px solid #000;
                    }
                    
                    .print-logo {
                        max-width: 999px;
                        width: 100%;
                        height: auto;
                        display: block;
                        margin: 0 auto 3px auto;
                    }
                    
                    .print-header h1 {
                        font-size: 14pt;
                        font-weight: bold;
                        margin: 0 0 5px 0;
                    }
                    
                    .student-row {
                        display: flex;
                        justify-content: space-between;
                        margin: 4px 0;
                        gap: 15px;
                    }
                    
                    .student-item {
                        flex: 1;
                        display: flex;
                        align-items: baseline;
                        gap: 6px;
                    }
                    
                    .label {
                        font-weight: bold;
                        min-width: 65px;
                        font-size: 10pt;
                    }
                    
                    .underline {
                        border-bottom: 1px dotted #000;
                        flex: 1;
                        height: 16px;
                    }
                    
                    .campos-box {
                        margin: 6px 0;
                        border: 2px solid #000;
                        padding: 5px 12px;
                        display: flex;
                        justify-content: space-between;
                        gap: 20px;
                    }
                    
                    .campo-item {
                        flex: 1;
                        display: flex;
                        align-items: baseline;
                        gap: 6px;
                    }
                    
                    .campo-label {
                        font-weight: bold;
                        min-width: 35px;
                        font-size: 10pt;
                    }
                    
                    .campo-underline {
                        border-bottom: 1px dotted #000;
                        flex: 1;
                        height: 16px;
                    }
                    
                    .instrucoes-box {
                        margin: 6px 0;
                        border: 1px solid #ccc;
                        padding: 8px 12px;
                        background: #fefefe;
                        border-radius: 4px;
                    }
                    
                    .instrucoes-box h4 {
                        margin: 0 0 5px 0;
                        font-size: 10pt;
                        font-weight: bold;
                        color: #4f46e5;
                        text-align: center;
                    }
                    
                    .instrucoes-box ul {
                        margin: 0;
                        padding-left: 20px;
                    }
                    
                    .instrucoes-box li {
                        margin-bottom: 3px;
                        font-size: 8.5pt;
                        line-height: 1.3;
                    }
                    
                    .print-prova-info {
                        margin: 8px 0;
                        padding: 5px 8px;
                        border: 1px solid #ddd;
                        background: #fafafa;
                    }
                    
                    .print-prova-info h3 {
                        margin: 0 0 3px 0;
                        font-size: 11pt;
                        text-align: center;
                        font-weight: bold;
                    }
                    
                    .info-linha {
                        display: flex;
                        justify-content: space-between;
                        flex-wrap: wrap;
                        gap: 8px;
                        font-size: 8pt;
                        border-top: 1px solid #eee;
                        padding-top: 4px;
                        margin-top: 4px;
                    }
                    
                    .questao-print {
                        margin-bottom: 20px;
                    }
                    
                    .questao-numero {
                        font-weight: bold;
                        margin-bottom: 6px;
                        border-bottom: 1px solid #ccc;
                        padding-bottom: 3px;
                        font-size: 10pt;
                    }
                    
                    .questao-texto {
                        margin-bottom: 10px;
                        margin-left: 8px;
                        line-height: 1.4;
                        font-size: 11pt;
                    }
                    
                    .opcao-linha {
                        margin: 6px 0 6px 18px;
                        display: flex;
                        font-size: 10pt;
                    }
                    
                    .opcao-letra {
                        min-width: 22px;
                        font-weight: 500;
                    }
                    
                    .rascunho-area {
                        margin-top: 8px;
                        border-top: 1px dashed #ccc;
                        padding-top: 5px;
                    }
                    
                    .rascunho-area small {
                        font-size: 7pt;
                    }
                    
                    .rascunho-linhas {
                        min-height: 35px;
                        background: repeating-linear-gradient(transparent, transparent 16px, #eee 16px, #eee 18px);
                    }
                    
                    .print-footer {
                        margin-top: 25px;
                        text-align: center;
                        font-size: 7.5pt;
                        color: #666;
                        border-top: 1px solid #ccc;
                        padding-top: 8px;
                    }
                    
                    ${cssAdaptacoes}
                </style>
            </head>
            <body>
                <div class="print-header">
                    <img src="${logoIema}" class="print-logo" alt="IEMA" onerror="this.style.display='none'">
                    <h1>IEMA PLENO: SÃO LUÍS - CENTRO</h1>
                    
                    <div class="student-row">
                        <div class="student-item">
                            <span class="label">ESTUDANTE:</span>
                            <span class="underline"></span>
                        </div>
                    </div>
                    
                    <div class="student-row">
                        <div class="student-item">
                            <span class="label">CURSO:</span>
                            <span class="underline"></span>
                        </div>
                        <div class="student-item">
                            <span class="label">TURMA:</span>
                            <span class="underline"></span>
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
                        <li>Escreva seu nome de registro legível e não esqueça de assinar a lista de frequência.</li>
                        <li>Todas as anotações e cálculos devem ser feitos no caderno de prova.</li>
                        <li>Os celulares <strong>deverão ser desligados</strong> durante todo o período de realização da prova.</li>
                        <li>Cada questão contém apenas uma alternativa correta.</li>
                        <li>Leia e siga as instruções de preenchimento do cartão-resposta (GABARITO) abaixo.</li>
                    </ul>
                </div>
                
                ${adaptacoesTexto}
                
                <div class="print-prova-info">
                    <h3>${provaTitulo}</h3>
                    <div class="info-linha">
                        <span class="info-item">Período: ${periodo}</span>
                        <span class="info-item">Turma: ${turmaNome}</span>
                        <span class="info-item">Disciplina: ${disciplina}</span>
                        <span class="info-item">Professor: ${professorNome}</span>
                        <span class="info-item">Questões: ${totalQuestoes}</span>
                    </div>
                </div>
                
                ${gerarCartaoResposta()}
                
                <div class="questoes-container">
                    ${questoesHTML}
                </div>
                
                <div class="print-footer">
                    <p>EducaPleno - ${dataFormatada}</p>
                    <p>📱 Escaneie o QR Code para correção automática</p>
                    <p style="font-size: 6pt;">Aluno: ${alunoNome || '_________________'} | Turma: ${turmaNome} | Código: ${prova.codigo || 'N/A'}</p>
                </div>
                <div style="page-break-after: always;"></div>
            </body>
            </html>
        `;
    }

    // ============ GERAR HTML E IMPRIMIR ============
    async gerarHTMLImpressao(prova, questoes, qrCodeDataUrl, opcoesAdaptacao = {}, qrCodeAlunoUrl = null, alunoNome = null) {
        try {
            const printHTML = this.gerarHTMLProvaCompleta(prova, questoes, qrCodeDataUrl, opcoesAdaptacao, qrCodeAlunoUrl, alunoNome);
            const printWindow = window.open('', '_blank');
            printWindow.document.write(printHTML);
            printWindow.document.close();
            printWindow.onload = () => { printWindow.print(); printWindow.onafterprint = () => printWindow.close(); };
            this.showToast('✅ Impressão preparada!', 'success');
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast(`❌ Erro: ${error.message}`, 'error');
        }
    }

    // ============ FECHAR MODAIS ============
    fecharModalImpressao() {
        const modal = document.getElementById('modalPerguntaAdaptacao');
        if (modal) modal.remove();
    }

    fecharModalOpcoesAdaptacao() {
        const modal = document.getElementById('modalOpcoesAdaptacao');
        if (modal) modal.remove();
        const modalPergunta = document.getElementById('modalPerguntaAdaptacao');
        if (modalPergunta) modalPergunta.style.display = 'flex';
    }

    closeAllModals() {
        const modal = document.getElementById('modal');
        if (modal) modal.style.display = 'none';
        const confirmModal = document.getElementById('confirmModal');
        if (confirmModal) confirmModal.style.display = 'none';
        this.fecharModalImpressao();
        this.fecharModalOpcoesAdaptacao();
    }
        // ============ RESULTADOS ============
    async carregarResultados() {
        const contentArea = document.getElementById('contentArea');

        contentArea.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner"></div>
                <p>Carregando resultados...</p>
            </div>
            <style>
                .loading-spinner { text-align: center; padding: 60px; background: white; border-radius: 12px; }
                .spinner { width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #0d6efd; border-radius: 50%; margin: 0 auto 15px; animation: spin 1s linear infinite; }
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        `;

        try {
            const token = localStorage.getItem('auth_token');

            const response = await fetch('/api/admin/todos-resultados', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            console.log('📊 Todos os resultados (incluindo notas manuais):', data);

            if (!data.success) {
                throw new Error(data.error || 'Erro ao carregar resultados');
            }

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

            console.log('📊 Resultados processados:', {
                total: resultados.length,
                comNotaManual: resultados.filter(r => r.tipoNota === 'manual').length,
                comNotaAutomatica: resultados.filter(r => r.tipoNota === 'automatica').length
            });

            const aprovados = resultados.filter(r => r.nota && r.nota >= 7 && !r.cancelada).length;
            const reprovados = resultados.filter(r => r.nota && r.nota < 7 && !r.cancelada).length;
            const pendentes = resultados.filter(r => r.nota === null || r.nota === undefined).length;
            const cancelados = resultados.filter(r => r.cancelada).length;
            const notasValidas = resultados.filter(r => r.nota !== null && r.nota !== undefined && !r.cancelada).map(r => r.nota);
            const mediaGeral = notasValidas.length > 0 ? (notasValidas.reduce((a,b) => a+b,0) / notasValidas.length).toFixed(2) : '0.00';
            const taxaAprovacao = notasValidas.length > 0 ? ((aprovados / notasValidas.length) * 100).toFixed(1) : '0.0';

            const totalAlunos = new Set(resultados.map(r => r.alunoId)).size;
            const totalProvas = new Set(resultados.map(r => r.provaId)).size;

            const estatisticas = {
                totalResultados: resultados.length,
                totalAlunos,
                totalProvas,
                aprovados,
                reprovados,
                pendentes,
                cancelados,
                mediaGeral,
                taxaAprovacao,
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
                if (tbody) {
                    tbody.innerHTML = this.gerarLinhasResultados(resultados);
                    console.log('✅ Tabela de resultados renderizada com notas manuais');
                }

                this.inicializarGraficosResultados(this.prepararDadosGraficos(resultados));
                this.configurarEventosResultados();
                this.atualizarContadoresCards();
                this.atualizarTabelaPaginada();
            }, 100);

        } catch (error) {
            console.error('❌ Erro ao carregar resultados:', error);
            contentArea.innerHTML = this.renderErro(error.message);
        }
    }

    prepararDadosGraficos(resultados) {
        const provasMap = new Map();
        resultados.forEach(r => {
            if (!provasMap.has(r.provaTitulo)) {
                provasMap.set(r.provaTitulo, 0);
            }
            provasMap.set(r.provaTitulo, provasMap.get(r.provaTitulo) + 1);
        });

        const provasArray = Array.from(provasMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);

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
            if (diffDias >= 0 && diffDias < 7) {
                resultadosPorDia[6 - diffDias]++;
            }
        });

        return {
            provas: {
                labels: provasArray.map(p => p[0].length > 20 ? p[0].substring(0, 17) + '...' : p[0]),
                dados: provasArray.map(p => p[1])
            },
            evolucao: {
                labels: ultimos7Dias,
                dados: resultadosPorDia
            }
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
                            <p>${resultados.length} ${resultados.length === 1 ? 'resultado encontrado' : 'resultados encontrados'}</p>
                        </div>
                    </div>
                    <div class="header-actions">
                        <button class="btn-header" onclick="adminSimples.exportarResultadosPDF()" title="Exportar PDF">
                            <i class="fas fa-file-pdf"></i> PDF
                        </button>
                        <button class="btn-header" onclick="adminSimples.exportarResultadosCSV()" title="Exportar CSV">
                            <i class="fas fa-file-csv"></i> CSV
                        </button>
                        <button class="btn-header" style="background: #10b981; color: white; border: none;" 
                                onclick="adminSimples.liberarTodasNotas()" title="Liberar todas as notas pendentes">
                            <i class="fas fa-lock-open"></i> Liberar Todas
                        </button>
                        <button class="btn-header refresh" onclick="adminSimples.carregarResultados()" title="Atualizar">
                            <i class="fas fa-sync-alt"></i> Atualizar
                        </button>
                    </div>
                </div>

                <div class="stats-grid">
                    <div class="stat-card primary" onclick="adminSimples.filtrarPorStatusAdmin('todos')">
                        <div class="stat-icon">
                            <i class="fas fa-file-alt"></i>
                        </div>
                        <div class="stat-content">
                            <h3>Total de Resultados</h3>
                            <div class="stat-number">${estatisticas.totalResultados}</div>
                            <div class="stat-details">
                                <span><i class="fas fa-users"></i> ${estatisticas.totalAlunos} alunos</span>
                                <span><i class="fas fa-tasks"></i> ${estatisticas.totalProvas} provas</span>
                            </div>
                        </div>
                    </div>

                    <div class="stat-card success" onclick="adminSimples.filtrarPorStatusAdmin('aprovado')">
                        <div class="stat-icon">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <div class="stat-content">
                            <h3>Aprovados</h3>
                            <div class="stat-number">${estatisticas.aprovados}</div>
                            <div class="stat-details">
                                <span><i class="fas fa-percent"></i> ${estatisticas.taxaAprovacao}%</span>
                            </div>
                        </div>
                    </div>

                    <div class="stat-card danger" onclick="adminSimples.filtrarPorStatusAdmin('reprovado')">
                        <div class="stat-icon">
                            <i class="fas fa-times-circle"></i>
                        </div>
                        <div class="stat-content">
                            <h3>Reprovados</h3>
                            <div class="stat-number">${estatisticas.reprovados}</div>
                            <div class="stat-details">
                                <span><i class="fas fa-chart-line"></i> Média: ${estatisticas.mediaGeral}</span>
                            </div>
                        </div>
                    </div>

                    <div class="stat-card warning" onclick="adminSimples.filtrarPorStatusAdmin('pendente')">
                        <div class="stat-icon">
                            <i class="fas fa-clock"></i>
                        </div>
                        <div class="stat-content">
                            <h3>Pendentes</h3>
                            <div class="stat-number">${estatisticas.pendentes}</div>
                            <div class="stat-details">
                                <span><i class="fas fa-hourglass-half"></i> aguardando correção</span>
                            </div>
                        </div>
                    </div>

                    <div class="stat-card" style="background: white; border-radius: 16px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); display: flex; align-items: center; gap: 20px; cursor: pointer;" onclick="adminSimples.filtrarPorStatusAdmin('cancelado')">
                        <div class="stat-icon" style="width: 60px; height: 60px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: white; background: linear-gradient(135deg, #dc2626, #b91c1c);">
                            <i class="fas fa-ban"></i>
                        </div>
                        <div class="stat-content">
                            <h3 style="font-size: 14px; color: #6c757d; margin-bottom: 5px;">Canceladas</h3>
                            <div class="stat-number" style="font-size: 28px; font-weight: 700; color: #1f2937; line-height: 1.2;">${estatisticas.cancelados}</div>
                            <div class="stat-details" style="display: flex; gap: 12px; margin-top: 5px; font-size: 12px; color: #6c757d;">
                                <span><i class="fas fa-user-slash"></i> violações</span>
                                <span><i class="fas fa-clock"></i> prazos</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="charts-row">
                    <div class="chart-card">
                        <h3><i class="fas fa-chart-bar"></i> Resultados por Prova</h3>
                        <canvas id="graficoProvas" style="width: 100%; height: 250px;"></canvas>
                    </div>
                    <div class="chart-card">
                        <h3><i class="fas fa-chart-line"></i> Atividades nos Últimos 7 Dias</h3>
                        <canvas id="graficoEvolucao" style="width: 100%; height: 250px;"></canvas>
                    </div>
                </div>

                <div class="filters-card">
                    <div class="filters-row" style="display: flex; gap: 15px; flex-wrap: wrap; align-items: flex-end;">
                        <div class="filter-group" style="flex: 2;">
                            <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 5px;"><i class="fas fa-search"></i> Buscar</label>
                            <input type="text" id="searchResultados" placeholder="Aluno, prova, turma, email..." 
                                class="filter-input" style="width: 100%; padding: 8px 12px; border: 1px solid #dee2e6; border-radius: 8px; font-size: 13px;" 
                                onkeyup="adminSimples.filtrarTabelaResultados()">
                        </div>
                        
                        <div class="filter-group" style="flex: 1;">
                            <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 5px;"><i class="fas fa-filter"></i> Status</label>
                            <select id="filtroStatusAdmin" class="filter-select" style="width: 100%; padding: 8px 12px; border: 1px solid #dee2e6; border-radius: 8px; font-size: 13px;" onchange="adminSimples.filtrarTabelaResultados()">
                                <option value="todos">Todos os status</option>
                                <option value="aprovado">✅ Aprovados (≥7)</option>
                                <option value="reprovado">❌ Reprovados (<7)</option>
                                <option value="pendente">⏳ Aguardando correção</option>
                                <option value="cancelado" style="color: #dc3545;">🚫 Cancelados</option>
                            </select>
                        </div>
                        
                        <div class="filter-group" style="flex: 1;">
                            <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 5px;"><i class="fas fa-calendar"></i> Período</label>
                            <select id="filtroPeriodo" class="filter-select" style="width: 100%; padding: 8px 12px; border: 1px solid #dee2e6; border-radius: 8px; font-size: 13px;" onchange="adminSimples.filtrarTabelaResultados()">
                                <option value="todos">Todos</option>
                                <option value="hoje">Hoje</option>
                                <option value="semana">Esta semana</option>
                                <option value="mes">Este mês</option>
                            </select>
                        </div>
                        
                        <div class="filter-group" style="flex: 1;">
                            <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 5px;"><i class="fas fa-sort"></i> Ordenar</label>
                            <select id="filtroOrdenacao" class="filter-select" style="width: 100%; padding: 8px 12px; border: 1px solid #dee2e6; border-radius: 8px; font-size: 13px;" onchange="adminSimples.ordenarResultados()">
                                <option value="data_desc">Mais recentes</option>
                                <option value="data_asc">Mais antigos</option>
                                <option value="nome_asc">Aluno (A-Z)</option>
                                <option value="nome_desc">Aluno (Z-A)</option>
                                <option value="nota_desc">Maior nota</option>
                                <option value="nota_asc">Menor nota</option>
                            </select>
                        </div>
                        
                        <button class="btn-clear-filters" onclick="adminSimples.limparFiltrosAdmin()" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 5px; height: 38px;">
                            <i class="fas fa-eraser"></i> Limpar
                        </button>
                    </div>
                </div>

                <div class="table-container" style="background: white; border-radius: 16px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                    <div class="table-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 style="margin: 0; font-size: 16px; color: #495057;"><i class="fas fa-list"></i> Lista de Resultados</h3>
                        <div class="table-info" style="color: #6c757d; font-size: 13px;">
                            <span id="resultadosCount">${resultados.length}</span> registros
                            <span id="statusTotal" style="margin-left: 15px; padding: 3px 10px; background: #f3f4f6; border-radius: 20px; font-size: 0.8rem;">
                                📊 Total: ${resultados.length}
                            </span>
                        </div>
                    </div>
                    <div class="table-responsive" style="overflow-x: auto;">
                        <table class="data-table" style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr>
                                    <th style="background: #f8f9fa; padding: 12px 16px; text-align: left; font-size: 13px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Aluno</th>
                                    <th style="background: #f8f9fa; padding: 12px 16px; text-align: left; font-size: 13px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Email</th>
                                    <th style="background: #f8f9fa; padding: 12px 16px; text-align: left; font-size: 13px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Prova</th>
                                    <th style="background: #f8f9fa; padding: 12px 16px; text-align: left; font-size: 13px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Turma</th>
                                    <th style="background: #f8f9fa; padding: 12px 16px; text-align: left; font-size: 13px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Data</th>
                                    <th style="background: #f8f9fa; padding: 12px 16px; text-align: left; font-size: 13px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Nota</th>
                                    <th style="background: #f8f9fa; padding: 12px 16px; text-align: left; font-size: 13px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Acertos</th>
                                    <th style="background: #f8f9fa; padding: 12px 16px; text-align: left; font-size: 13px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Tempo</th>
                                    <th style="background: #f8f9fa; padding: 12px 16px; text-align: left; font-size: 13px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6;">Status</th>
                                    <th style="background: #f8f9fa; padding: 12px 16px; text-align: left; font-size: 13px; font-weight: 600; color: #495057; border-bottom: 2px solid #dee2e6; width: 120px;">Ações</th>
                                </tr>
                            </thead>
                            <tbody id="tabelaResultadosBody"></tbody>
                        </table>
                    </div>
                    
                    <div class="pagination-container" id="paginacao" style="display: flex; justify-content: center; align-items: center; gap: 15px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e9ecef;">
                        <button class="btn-pagination" onclick="adminSimples.paginaAnterior()" id="btnAnterior" disabled style="padding: 8px 16px; border: 1px solid #dee2e6; background: white; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px; font-size: 13px;">
                            <i class="fas fa-chevron-left"></i> Anterior
                        </button>
                        <span class="page-info" id="pageInfo" style="font-size: 13px; color: #6c757d;">Página 1 de 1</span>
                        <button class="btn-pagination" onclick="adminSimples.proximaPagina()" id="btnProxima" disabled style="padding: 8px 16px; border: 1px solid #dee2e6; background: white; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px; font-size: 13px;">
                            Próxima <i class="fas fa-chevron-right"></i>
                        </button>
                    </div>
                </div>
            </div>

            <style>
                .resultados-container {
                    padding: 20px;
                    max-width: 1400px;
                    margin: 0 auto;
                    font-family: 'Inter', -apple-system, sans-serif;
                }

                .resultados-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 25px;
                    background: white;
                    padding: 20px 25px;
                    border-radius: 16px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                }

                .header-left {
                    display: flex;
                    align-items: center;
                    gap: 15px;
                }

                .header-left i {
                    font-size: 32px;
                    color: #0d6efd;
                    background: #e7f3ff;
                    padding: 12px;
                    border-radius: 12px;
                }

                .header-left h2 {
                    margin: 0;
                    font-size: 20px;
                    color: #212529;
                }

                .header-left p {
                    margin: 5px 0 0;
                    color: #6c757d;
                    font-size: 13px;
                }

                .header-actions {
                    display: flex;
                    gap: 10px;
                }

                .btn-header {
                    padding: 8px 16px;
                    border: 1px solid #dee2e6;
                    background: white;
                    border-radius: 8px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 13px;
                    transition: all 0.3s;
                }

                .btn-header:hover {
                    background: #f8f9fa;
                    border-color: #0d6efd;
                    color: #0d6efd;
                }

                .btn-header.refresh {
                    background: #0d6efd;
                    border-color: #0d6efd;
                    color: white;
                }

                .btn-header.refresh:hover {
                    background: #0b5ed7;
                }

                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(5, 1fr);
                    gap: 20px;
                    margin-bottom: 25px;
                }

                .stat-card {
                    background: white;
                    border-radius: 16px;
                    padding: 20px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    transition: all 0.3s;
                    cursor: pointer;
                }

                .stat-card:hover {
                    transform: translateY(-4px);
                    box-shadow: 0 8px 16px rgba(0,0,0,0.1);
                }

                .stat-card.primary .stat-icon { background: linear-gradient(135deg, #0d6efd, #0b5ed7); }
                .stat-card.success .stat-icon { background: linear-gradient(135deg, #198754, #157347); }
                .stat-card.danger .stat-icon { background: linear-gradient(135deg, #dc3545, #bb2d3b); }
                .stat-card.warning .stat-icon { background: linear-gradient(135deg, #ffc107, #ffb300); }

                .stat-icon {
                    width: 60px;
                    height: 60px;
                    border-radius: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 28px;
                    color: white;
                }

                .stat-content h3 {
                    font-size: 14px;
                    color: #6c757d;
                    margin-bottom: 5px;
                }

                .stat-number {
                    font-size: 28px;
                    font-weight: 700;
                    color: #212529;
                    line-height: 1.2;
                }

                .stat-details {
                    display: flex;
                    gap: 12px;
                    margin-top: 5px;
                    font-size: 12px;
                    color: #6c757d;
                }

                .charts-row {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 20px;
                    margin-bottom: 25px;
                }

                .chart-card {
                    background: white;
                    border-radius: 16px;
                    padding: 20px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                }

                .chart-card h3 {
                    margin: 0 0 15px;
                    font-size: 16px;
                    color: #495057;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .filters-card {
                    background: white;
                    border-radius: 16px;
                    padding: 20px;
                    margin-bottom: 25px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                }

                .filters-row {
                    display: flex;
                    gap: 15px;
                    flex-wrap: wrap;
                    align-items: flex-end;
                }

                .filter-group {
                    flex: 1;
                    min-width: 150px;
                }

                .filter-group label {
                    display: block;
                    font-size: 12px;
                    color: #6c757d;
                    margin-bottom: 5px;
                }

                .filter-input, .filter-select {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid #dee2e6;
                    border-radius: 8px;
                    font-size: 13px;
                    transition: all 0.3s;
                }

                .filter-input:focus, .filter-select:focus {
                    outline: none;
                    border-color: #0d6efd;
                    box-shadow: 0 0 0 3px rgba(13,110,253,0.1);
                }

                .btn-clear-filters {
                    padding: 8px 16px;
                    background: #6c757d;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-size: 13px;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    height: 38px;
                }

                .btn-clear-filters:hover {
                    background: #5a6268;
                }

                .table-container {
                    background: white;
                    border-radius: 16px;
                    padding: 20px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                }

                .table-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 15px;
                }

                .table-header h3 {
                    margin: 0;
                    font-size: 16px;
                    color: #495057;
                }

                .table-info {
                    color: #6c757d;
                    font-size: 13px;
                }

                .data-table {
                    width: 100%;
                    border-collapse: collapse;
                }

                .data-table th {
                    background: #f8f9fa;
                    padding: 12px 16px;
                    text-align: left;
                    font-size: 13px;
                    font-weight: 600;
                    color: #495057;
                    border-bottom: 2px solid #dee2e6;
                }

                .data-table td {
                    padding: 12px 16px;
                    border-bottom: 1px solid #e9ecef;
                    font-size: 13px;
                    vertical-align: middle;
                }

                .data-table tr:hover td {
                    background: #f8f9fa;
                }

                .status-badge {
                    padding: 4px 10px;
                    border-radius: 30px;
                    font-size: 11px;
                    font-weight: 600;
                    display: inline-block;
                }

                .status-aprovado {
                    background: #d4edda;
                    color: #155724;
                }

                .status-reprovado {
                    background: #f8d7da;
                    color: #721c24;
                }

                .status-pendente {
                    background: #fff3cd;
                    color: #856404;
                }

                .nota-alta {
                    color: #28a745;
                    font-weight: 600;
                }

                .nota-baixa {
                    color: #dc3545;
                    font-weight: 600;
                }

                .action-buttons {
                    display: flex;
                    gap: 5px;
                }

                .btn-icon {
                    width: 32px;
                    height: 32px;
                    border: none;
                    border-radius: 6px;
                    background: transparent;
                    color: #6c757d;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }

                .btn-icon:hover {
                    background: #e9ecef;
                    color: #0d6efd;
                }

                .btn-icon.edit:hover {
                    color: #ffc107;
                }

                .btn-icon.delete:hover {
                    color: #dc3545;
                }

                .pagination-container {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 15px;
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 1px solid #e9ecef;
                }

                .btn-pagination {
                    padding: 8px 16px;
                    border: 1px solid #dee2e6;
                    background: white;
                    border-radius: 6px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 13px;
                    transition: all 0.3s;
                }

                .btn-pagination:hover:not(:disabled) {
                    background: #e9ecef;
                    border-color: #0d6efd;
                    color: #0d6efd;
                }

                .btn-pagination:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .page-info {
                    font-size: 13px;
                    color: #6c757d;
                }

                @media (max-width: 1200px) {
                    .stats-grid {
                        grid-template-columns: repeat(3, 1fr);
                    }
                }

                @media (max-width: 768px) {
                    .stats-grid {
                        grid-template-columns: 1fr;
                    }
                    .charts-row {
                        grid-template-columns: 1fr;
                    }
                    .filters-row {
                        flex-direction: column;
                    }
                    .filter-group {
                        width: 100%;
                    }
                    .resultados-header {
                        flex-direction: column;
                        gap: 15px;
                        align-items: flex-start;
                    }
                }

                .badge-manual {
                    background: #f59e0b;
                    color: white;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 10px;
                    margin-left: 5px;
                    display: inline-flex;
                    align-items: center;
                    gap: 3px;
                }

                .badge-automatica {
                    background: #10b981;
                    color: white;
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 10px;
                    margin-left: 5px;
                    display: inline-flex;
                    align-items: center;
                    gap: 3px;
                }

                .status-cancelado {
                    background: #fee2e2;
                    color: #991b1b;
                }

                .nota-alta {
                    color: #28a745;
                    font-weight: bold;
                }

                .nota-baixa {
                    color: #dc3545;
                    font-weight: bold;
                }
            </style>
        `;
    }

    // ============ ATUALIZAR CONTADORES DOS CARDS ============
    atualizarContadoresCards() {
        if (!this.resultadosCompletos) return;

        const resultados = this.resultadosCompletos;

        let aprovados = 0;
        let reprovados = 0;
        let pendentes = 0;
        let canceladas = 0;

        resultados.forEach(r => {
            if (r.cancelada === true) {
                canceladas++;
            }
            else if (r.nota === null || r.nota === undefined || r.notaLiberada === false) {
                pendentes++;
            }
            else {
                if (r.nota >= 7) {
                    aprovados++;
                } else {
                    reprovados++;
                }
            }
        });

        const statsNumbers = document.querySelectorAll('.stat-number');

        if (statsNumbers.length >= 5) {
            statsNumbers[0].textContent = resultados.length;
            statsNumbers[1].textContent = aprovados;
            statsNumbers[2].textContent = reprovados;
            statsNumbers[3].textContent = pendentes;
            if (statsNumbers[4]) statsNumbers[4].textContent = canceladas;

            console.log('✅ Cards atualizados:', { 
                total: resultados.length, 
                aprovados, 
                reprovados, 
                pendentes, 
                canceladas 
            });
        }

        const notasValidas = resultados.filter(r => 
            !r.cancelada && r.nota !== null && r.nota !== undefined && r.notaLiberada === true
        ).map(r => r.nota);

        const mediaGeral = notasValidas.length > 0 
            ? (notasValidas.reduce((a, b) => a + b, 0) / notasValidas.length).toFixed(2)
            : '0.00';

        const taxaAprovacao = notasValidas.length > 0 
            ? Math.round((aprovados / notasValidas.length) * 100)
            : 0;

        const mediaElement = document.querySelector('.stat-card.danger .stat-details span:last-child');
        if (mediaElement) {
            mediaElement.innerHTML = `<i class="fas fa-chart-line"></i> Média: ${mediaGeral}`;
        }

        const taxaElement = document.querySelector('.stat-card.success .stat-details span:last-child');
        if (taxaElement) {
            taxaElement.innerHTML = `<i class="fas fa-percent"></i> ${taxaAprovacao}%`;
        }

        const totalAlunos = new Set(resultados.map(r => r.alunoId)).size;
        const totalProvas = new Set(resultados.map(r => r.provaId)).size;

        const alunosElement = document.querySelector('.stat-card.primary .stat-details span:first-child');
        const provasElement = document.querySelector('.stat-card.primary .stat-details span:last-child');

        if (alunosElement) {
            alunosElement.innerHTML = `<i class="fas fa-users"></i> ${totalAlunos} alunos`;
        }
        if (provasElement) {
            provasElement.innerHTML = `<i class="fas fa-tasks"></i> ${totalProvas} provas`;
        }
    }

    // ============ GERAR LINHAS DA TABELA DE RESULTADOS ============
    gerarLinhasResultados(resultados) {
        if (!resultados || resultados.length === 0) {
            return `
                <tr>
                    <td colspan="10" style="text-align: center; padding: 40px;">
                        <i class="fas fa-chart-line" style="font-size: 2rem; color: #dee2e6; margin-bottom: 10px; display: block;"></i>
                        Nenhum resultado encontrado
                    </td>
                </tr>
            `;
        }

        return resultados.map(r => {
            const isCancelada = r.cancelada === true;

            const notaExibida = r.tipoNota === 'manual' ? r.notaManual : r.notaAutomatica;
            const notaLiberada = r.tipoNota === 'manual' ? r.notaManualLiberada : r.notaLiberada;

            let statusClass = '';
            let statusText = '';
            let statusIcon = '';

            if (isCancelada) {
                statusClass = 'status-cancelado';
                statusText = 'Cancelada';
                statusIcon = '🚫 ';
            } 
            else if (notaExibida === null || notaExibida === undefined || !notaLiberada) {
                statusClass = 'status-pendente';
                statusText = 'Aguardando Correção';
                statusIcon = '⏳ ';
            } 
            else {
                if (notaExibida >= 7) {
                    statusClass = 'status-aprovado';
                    statusText = 'Aprovado';
                    statusIcon = '✅ ';
                } else {
                    statusClass = 'status-reprovado';
                    statusText = 'Reprovado';
                    statusIcon = '❌ ';
                }
            }

            let tipoNotaBadge = '';
            if (r.tipoNota === 'manual') {
                tipoNotaBadge = '<span class="badge-manual" style="background: #f59e0b; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 5px;"><i class="fas fa-print"></i> Manual</span>';
            } else if (r.tipoNota === 'automatica' && r.notaAutomatica !== null) {
                tipoNotaBadge = '<span class="badge-automatica" style="background: #10b981; color: white; padding: 2px 6px; border-radius: 4px; font-size: 10px; margin-left: 5px;"><i class="fas fa-laptop-code"></i> Online</span>';
            }

            const notaExibir = (notaLiberada && notaExibida !== null) ? notaExibida.toFixed(2) : '-';

            let notaClass = '';
            if (notaLiberada && notaExibida !== null && !isCancelada) {
                if (notaExibida >= 7) notaClass = 'nota-alta';
                else if (notaExibida > 0) notaClass = 'nota-baixa';
            }

            const precisaLiberar = !isCancelada && notaExibida !== null && !notaLiberada;

            const data = r.dataRealizacao ? 
                new Date(r.dataRealizacao).toLocaleDateString('pt-BR') : 
                (r.createdAt ? new Date(r.createdAt).toLocaleDateString('pt-BR') : 'N/A');

            const percentual = r.total > 0 ? Math.round((r.acertos / r.total) * 100) : 0;

            return `
                <tr>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #e9ecef; font-size: 13px; vertical-align: middle;">
                        <strong>${r.alunoNome || 'N/A'}</strong>
                        <div style="font-size: 11px; color: #6c757d;">${r.alunoMatricula || ''}</div>
                    </td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #e9ecef; font-size: 13px; vertical-align: middle; color: #6c757d;">${r.alunoEmail || '-'}</td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #e9ecef; font-size: 13px; vertical-align: middle;">
                        ${r.provaTitulo || 'N/A'}
                        ${tipoNotaBadge}
                    </td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #e9ecef; font-size: 13px; vertical-align: middle;">${r.alunoTurma || '-'}</td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #e9ecef; font-size: 13px; vertical-align: middle;">${data}</td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #e9ecef; font-size: 13px; vertical-align: middle;" class="${notaClass}">
                        <strong>${notaExibir}</strong>
                        ${r.tipoNota === 'manual' ? '<span style="font-size: 10px; color: #f59e0b;"> (Manual)</span>' : ''}
                    </td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #e9ecef; font-size: 13px; vertical-align: middle;">
                        ${r.acertos || 0}/${r.total || 0} 
                        <span style="color: #6c757d; font-size: 11px;">(${percentual}%)</span>
                    </td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #e9ecef; font-size: 13px; vertical-align: middle;">
                        ${this.formatarTempoResultado(r.tempoGasto, r.cancelada, r.status)}
                    </td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #e9ecef; font-size: 13px; vertical-align: middle;">
                        <span class="status-badge ${statusClass}" style="
                            display: inline-block;
                            padding: 4px 10px;
                            border-radius: 30px;
                            font-size: 11px;
                            font-weight: 600;
                            background: ${statusClass === 'status-cancelado' ? '#fee2e2' : 
                                    statusClass === 'status-aprovado' ? '#d4edda' : 
                                    statusClass === 'status-reprovado' ? '#f8d7da' : '#fff3cd'};
                            color: ${statusClass === 'status-cancelado' ? '#dc2626' : 
                                    statusClass === 'status-aprovado' ? '#155724' : 
                                    statusClass === 'status-reprovado' ? '#721c24' : '#856404'};
                        ">
                            ${statusIcon}${statusText}
                        </span>
                    </td>
                    <td style="padding: 12px 16px; border-bottom: 1px solid #e9ecef; font-size: 13px; vertical-align: middle;">
                        <div class="action-buttons" style="display: flex; gap: 5px;">
                            <button class="btn-icon" onclick="adminSimples.verResultadoDetalhado('${r.id}')" title="Ver detalhes">
                                <i class="fas fa-eye"></i>
                            </button>
                            
                            <button class="btn-icon edit" onclick="adminSimples.editarResultado('${r.id}')" title="Editar">
                                <i class="fas fa-edit"></i>
                            </button>
                            
                            ${precisaLiberar ? `
                                <button class="btn-icon" style="background: #10b981; color: white;" 
                                        onclick="adminSimples.liberarNota('${r.id}')" 
                                        title="Liberar nota para o aluno">
                                    <i class="fas fa-lock-open"></i>
                                </button>
                            ` : ''}
                            
                            ${isCancelada ? `
                                <button class="btn-icon warning" onclick="adminSimples.verDetalhesCancelamento('${r.id}')" 
                                        title="Ver detalhes do cancelamento" style="color: #f59e0b;">
                                    <i class="fas fa-info-circle"></i>
                                </button>
                            ` : `
                                <button class="btn-icon" onclick="adminSimples.enviarLembrete('${r.id}')" title="Enviar lembrete">
                                    <i class="fas fa-bell"></i>
                                </button>
                            `}
                            
                            <button class="btn-icon danger" onclick="adminSimples.excluirResultado('${r.id}')" title="Excluir">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ============ FORMATAR TEMPO DO RESULTADO ============
    formatarTempoResultado(tempoGasto, cancelada = false, status = '') {
        if (cancelada || status === 'cancelada') {
            return '<span style="color: #dc2626;"><i class="fas fa-ban"></i> Cancelada</span>';
        }

        if (!tempoGasto || tempoGasto <= 0) {
            return '<span style="color: #6b7280;">—</span>';
        }

        const minutos = Math.round(tempoGasto);

        return `<span style="color: #1f2937;">${minutos} min</span>`;
    }

    // ============ ATUALIZAR TABELA PAGINADA ============
    atualizarTabelaPaginada() {
        const tbody = document.getElementById('tabelaResultadosBody');
        if (!tbody || !this.resultadosFiltrados) return;

        const inicio = (this.paginaAtual - 1) * this.itensPorPagina;
        const fim = inicio + this.itensPorPagina;
        const paginaResultados = this.resultadosFiltrados.slice(inicio, fim);

        tbody.innerHTML = this.gerarLinhasResultados(paginaResultados);

        const totalPaginas = Math.ceil(this.resultadosFiltrados.length / this.itensPorPagina);
        const pageInfo = document.getElementById('pageInfo');
        const resultadosCount = document.getElementById('resultadosCount');
        const btnAnterior = document.getElementById('btnAnterior');
        const btnProxima = document.getElementById('btnProxima');

        if (pageInfo) pageInfo.textContent = `Página ${this.paginaAtual} de ${totalPaginas}`;
        if (resultadosCount) resultadosCount.textContent = this.resultadosFiltrados.length;

        if (btnAnterior) btnAnterior.disabled = this.paginaAtual === 1;
        if (btnProxima) btnProxima.disabled = this.paginaAtual === totalPaginas;
    }

    // ============ INICIALIZAR GRÁFICOS ============
    inicializarGraficosResultados(dadosGraficos) {
        if (!window.Chart) {
            console.warn('Chart.js não encontrado');
            return;
        }

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
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { 
                        legend: { display: false },
                        tooltip: { backgroundColor: '#1e1e1e' }
                    },
                    scales: {
                        y: { 
                            beginAtZero: true,
                            ticks: { stepSize: 1 }
                        }
                    }
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
                        borderWidth: 3,
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: '#198754',
                        pointBorderColor: 'white',
                        pointBorderWidth: 2,
                        pointRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { 
                        legend: { display: false },
                        tooltip: { backgroundColor: '#1e1e1e' }
                    },
                    scales: {
                        y: { 
                            beginAtZero: true,
                            ticks: { stepSize: 1 }
                        }
                    }
                }
            });
        }
    }

    // ============ LIBERAR NOTA ============
    async liberarNota(resultadoId) {
        try {
            const resultado = this.resultadosCompletos?.find(r => r.id === resultadoId);
            if (!resultado) {
                this.showToast('❌ Resultado não encontrado', 'error');
                return;
            }

            const confirmar = await this.confirmar(
                '✅ Liberar Nota',
                `Deseja realmente liberar a nota <strong>${resultado.nota}</strong> para o aluno <strong>${resultado.alunoNome}</strong>?`
            );

            if (!confirmar) return;

            this.showToast('🔄 Liberando nota...', 'info');

            const token = localStorage.getItem('auth_token');

            const configResponse = await fetch('/api/admin/configuracoes', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const configData = await configResponse.json();
            const pushAtivado = configData.configuracoes?.notificacoes?.push === true;

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

                this.showToast('✅ Nota liberada com sucesso!', 'success');

                if (pushAtivado && resultado.alunoId) {
                    await this.enviarPushParaUsuario(
                        resultado.alunoId,
                        '📊 Resultado Liberado!',
                        `Sua nota em "${resultado.provaTitulo}" foi liberada: ${resultado.nota.toFixed(2)}`,
                        {
                            tipo: 'resultado_liberado',
                            provaId: resultado.provaId,
                            nota: resultado.nota
                        }
                    );
                }

                if (typeof this.filtrarTabelaResultados === 'function') {
                    this.filtrarTabelaResultados();
                }

                if (typeof this.atualizarContadoresCards === 'function') {
                    this.atualizarContadoresCards();
                }
            } else {
                throw new Error(data.error || 'Erro ao liberar nota');
            }

        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============ LIBERAR TODAS AS NOTAS ============
    async liberarTodasNotas() {
        const pendentes = this.resultadosCompletos?.filter(r => 
            !((r.nota === 0 && r.status === 'pendente') || 
            r.cancelada === true || 
            r.motivoCancelamento) && 
            r.nota !== null && 
            r.notaLiberada === false
        );

        if (!pendentes || pendentes.length === 0) {
            this.showToast('ℹ️ Nenhuma nota pendente para liberar', 'info');
            return;
        }

        const confirmar = await this.confirmar(
            '📢 Liberar Todas as Notas',
            `Deseja liberar <strong>${pendentes.length} nota(s)</strong> pendente(s)?<br><br>
            Cada aluno receberá uma notificação.`
        );

        if (!confirmar) return;

        this.showToast(`🔄 Liberando ${pendentes.length} notas...`, 'info');

        const token = localStorage.getItem('auth_token');
        const configResponse = await fetch('/api/admin/configuracoes', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const configData = await configResponse.json();
        const pushAtivado = configData.configuracoes?.notificacoes?.push === true;

        let sucessos = 0;
        let erros = 0;

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

                    if (pushAtivado && resultado.alunoId) {
                        await this.enviarPushParaUsuario(
                            resultado.alunoId,
                            '📊 Resultado Liberado!',
                            `Sua nota em "${resultado.provaTitulo}" foi liberada: ${resultado.nota.toFixed(2)}`,
                            {
                                tipo: 'resultado_liberado',
                                provaId: resultado.provaId,
                                nota: resultado.nota
                            }
                        );
                    }
                } else {
                    erros++;
                }
            } catch (error) {
                console.error('Erro ao liberar:', error);
                erros++;
            }
        }

        this.showToast(`✅ ${sucessos} notas liberadas, ${erros} erros`, 'success');

        if (typeof this.filtrarTabelaResultados === 'function') {
            this.filtrarTabelaResultados();
        }

        if (typeof this.atualizarContadoresCards === 'function') {
            this.atualizarContadoresCards();
        }
    }
        // ============ FILTRAR TABELA DE RESULTADOS ============
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
                                r.cancelada === true || 
                                r.motivoCancelamento;

            if (status !== 'todos') {
                if (status === 'aprovado') {
                    matchStatus = !isCancelada && r.nota && r.nota >= 7 && r.notaLiberada === true;
                } else if (status === 'reprovado') {
                    matchStatus = !isCancelada && r.nota && r.nota < 7 && r.notaLiberada === true;
                } else if (status === 'pendente') {
                    matchStatus = !isCancelada && r.nota !== null && r.nota !== undefined && r.notaLiberada === false;
                } else if (status === 'cancelado') {
                    matchStatus = isCancelada;
                }
            }

            let matchPeriodo = true;
            if (periodo !== 'todos') {
                const dataR = new Date(r.dataRealizacao || r.createdAt);
                if (periodo === 'hoje') {
                    matchPeriodo = dataR.toDateString() === agora.toDateString();
                } else if (periodo === 'semana') {
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
        if (typeof this.atualizarContadoresCards === 'function') {
            this.atualizarContadoresCards();
        }
    }

    // ============ ORDENAR RESULTADOS ============
    ordenarResultados() {
        if (!this.resultadosFiltrados) return;

        const ordenacao = document.getElementById('filtroOrdenacao')?.value || 'data_desc';

        switch(ordenacao) {
            case 'data_desc':
                this.resultadosFiltrados.sort((a, b) => new Date(b.dataRealizacao) - new Date(a.dataRealizacao));
                break;
            case 'data_asc':
                this.resultadosFiltrados.sort((a, b) => new Date(a.dataRealizacao) - new Date(b.dataRealizacao));
                break;
            case 'nome_asc':
                this.resultadosFiltrados.sort((a, b) => a.alunoNome.localeCompare(b.alunoNome));
                break;
            case 'nome_desc':
                this.resultadosFiltrados.sort((a, b) => b.alunoNome.localeCompare(a.alunoNome));
                break;
            case 'nota_desc':
                this.resultadosFiltrados.sort((a, b) => (b.nota || 0) - (a.nota || 0));
                break;
            case 'nota_asc':
                this.resultadosFiltrados.sort((a, b) => (a.nota || 0) - (b.nota || 0));
                break;
        }

        this.paginaAtual = 1;
        this.atualizarTabelaPaginada();
    }

    // ============ FILTRAR POR STATUS (ADMIN) ============
    filtrarPorStatusAdmin(status) {
        const select = document.getElementById('filtroStatusAdmin');
        if (select) {
            select.value = status;
            this.filtrarTabelaResultados();
        }
    }

    // ============ LIMPAR FILTROS (ADMIN) ============
    limparFiltrosAdmin() {
        document.getElementById('searchResultados').value = '';
        document.getElementById('filtroStatusAdmin').value = 'todos';
        document.getElementById('filtroPeriodo').value = 'todos';
        document.getElementById('filtroOrdenacao').value = 'data_desc';
        this.filtrarTabelaResultados();
    }

    paginaAnterior() {
        if (this.paginaAtual > 1) {
            this.paginaAtual--;
            this.atualizarTabelaPaginada();
        }
    }

    proximaPagina() {
        const totalPaginas = Math.ceil(this.resultadosFiltrados.length / this.itensPorPagina);
        if (this.paginaAtual < totalPaginas) {
            this.paginaAtual++;
            this.atualizarTabelaPaginada();
        }
    }

    // ============ CONFIGURAR EVENTOS DOS RESULTADOS ============
    configurarEventosResultados() {
        console.log('🔧 Configurando eventos dos resultados...');

        const searchInput = document.getElementById('searchResultados');
        if (searchInput) {
            const newSearch = searchInput.cloneNode(true);
            searchInput.parentNode.replaceChild(newSearch, searchInput);
            newSearch.addEventListener('input', () => this.filtrarTabelaResultados());
        }

        const filtroStatus = document.getElementById('filtroStatusAdmin');
        if (filtroStatus) {
            const newFiltro = filtroStatus.cloneNode(true);
            filtroStatus.parentNode.replaceChild(newFiltro, filtroStatus);
            newFiltro.addEventListener('change', () => this.filtrarTabelaResultados());
        }

        const filtroPeriodo = document.getElementById('filtroPeriodo');
        if (filtroPeriodo) {
            const newPeriodo = filtroPeriodo.cloneNode(true);
            filtroPeriodo.parentNode.replaceChild(newPeriodo, filtroPeriodo);
            newPeriodo.addEventListener('change', () => this.filtrarTabelaResultados());
        }

        const filtroOrdenacao = document.getElementById('filtroOrdenacao');
        if (filtroOrdenacao) {
            const newOrdenacao = filtroOrdenacao.cloneNode(true);
            filtroOrdenacao.parentNode.replaceChild(newOrdenacao, filtroOrdenacao);
            newOrdenacao.addEventListener('change', () => this.ordenarResultados());
        }

        const btnLimpar = document.querySelector('.btn-clear-filters');
        if (btnLimpar) {
            const newBtn = btnLimpar.cloneNode(true);
            btnLimpar.parentNode.replaceChild(newBtn, btnLimpar);
            newBtn.addEventListener('click', () => this.limparFiltrosAdmin());
        }
    }

    // ============ VER RESULTADO DETALHADO ============
    async verResultadoDetalhado(resultadoId) {
        const resultado = this.resultadosCompletos?.find(r => r.id === resultadoId);
        if (!resultado) {
            this.showToast('❌ Resultado não encontrado', 'error');
            return;
        }

        console.log('📝 Dados completos do resultado:', resultado);

        const isCancelada = resultado.cancelada === true;

        if (isCancelada) {
            this.showToast('ℹ️ Este resultado foi cancelado. Use o ícone de informações para ver detalhes.', 'info');
            return;
        }

        const modalBody = document.getElementById('modalBody');
        const modalTitle = document.getElementById('modalTitle');
        const modalSaveBtn = document.getElementById('modalSaveBtn');

        if (!modalBody || !modalTitle) return;

        const dataRealizacao = resultado.dataRealizacao || resultado.createdAt;
        const data = dataRealizacao ? new Date(dataRealizacao).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }) : 'Data não disponível';

        const percentual = resultado.total > 0 
            ? ((resultado.acertos / resultado.total) * 100).toFixed(1)
            : '0.0';

        let statusClass = '';
        let statusText = '';
        let statusColor = '';
        let statusIcon = '';

        if (resultado.nota !== null && resultado.nota !== undefined) {
            if (resultado.nota >= 7) {
                statusClass = 'status-aprovado';
                statusText = 'Aprovado';
                statusColor = '#28a745';
                statusIcon = '✅ ';
            } else {
                statusClass = 'status-reprovado';
                statusText = 'Reprovado';
                statusColor = '#dc3545';
                statusIcon = '❌ ';
            }
        } else {
            statusClass = 'status-pendente';
            statusText = 'Aguardando Correção';
            statusColor = '#ffc107';
            statusIcon = '⏳ ';
        }

        let questoesHtml = '';

        if (resultado.resultadoDetalhado && resultado.resultadoDetalhado.length > 0) {
            questoesHtml = '<div style="margin-top: 20px;"><h4 style="margin: 0 0 15px; font-size: 16px; color: #495057;">📋 Detalhamento das Questões</h4>';

            resultado.resultadoDetalhado.forEach((q, index) => {
                const correto = q.correto === true;
                const respostaAluno = q.respostaAluno || 'Não respondida';
                const respostaCorreta = q.respostaCorreta || 'Não disponível';
                const pergunta = q.pergunta || `Questão ${index + 1}`;
                const explicacao = q.explicacao || '';

                questoesHtml += `
                    <div style="background: ${correto ? '#d4edda' : '#f8d7da'}; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ${correto ? '#28a745' : '#dc3545'};">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                            <strong>Questão ${index + 1}</strong>
                            <span style="color: ${correto ? '#28a745' : '#dc3545'};">${correto ? '✓ Correta' : '✗ Incorreta'}</span>
                        </div>
                        <p style="margin: 5px 0; font-size: 14px; color: #1f2937;">${pergunta}</p>
                        <div style="margin-top: 8px;">
                            <p style="margin: 3px 0;"><strong>Sua resposta:</strong> <span style="color: ${correto ? '#28a745' : '#dc3545'};">${respostaAluno}</span></p>
                            <p style="margin: 3px 0;"><strong>Resposta correta:</strong> <span style="color: #28a745;">${respostaCorreta}</span></p>
                            ${explicacao ? `<p style="margin: 8px 0 0 0; color: #6c757d; font-size: 13px; background: #f8f9fa; padding: 8px; border-radius: 4px;"><i class="fas fa-lightbulb" style="color: #ffc107; margin-right: 5px;"></i>${explicacao}</p>` : ''}
                        </div>
                    </div>
                `;
            });
            questoesHtml += '</div>';
        }

        modalBody.innerHTML = `
            <div style="padding: 25px; max-height: 70vh; overflow-y: auto;">
                <div style="text-align: center; margin-bottom: 25px;">
                    <div style="width: 100px; height: 100px; background: linear-gradient(135deg, #667eea, #764ba2); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 15px; box-shadow: 0 4px 10px rgba(102,126,234,0.3);">
                        <span style="font-size: 40px; color: white; font-weight: bold;">
                            ${resultado.alunoNome ? resultado.alunoNome.charAt(0).toUpperCase() : 'A'}
                        </span>
                    </div>
                    <h2 style="margin: 0; color: #1f2937; font-size: 24px;">${resultado.alunoNome || 'Aluno'}</h2>
                    <p style="color: #6b7280; margin: 5px 0;">
                        <i class="fas fa-envelope"></i> ${resultado.alunoEmail || 'Email não cadastrado'}
                    </p>
                    <p style="color: #6b7280; font-size: 13px; margin: 5px 0;">
                        <i class="fas fa-id-card"></i> ${resultado.alunoMatricula || 'Sem matrícula'} • 
                        <i class="fas fa-school"></i> ${resultado.alunoTurma || 'Sem turma'}
                    </p>
                    
                    <div style="margin-top: 10px;">
                        <span style="
                            display: inline-block;
                            padding: 6px 15px;
                            border-radius: 30px;
                            font-size: 13px;
                            font-weight: 600;
                            background: ${statusClass === 'status-aprovado' ? '#d4edda' : 
                                    statusClass === 'status-reprovado' ? '#f8d7da' : '#fff3cd'};
                            color: ${statusColor};
                            border: 1px solid ${statusColor}40;
                        ">
                            ${statusIcon}${statusText}
                        </span>
                        ${resultado.notaLiberada ? '' : '<span style="margin-left: 8px; padding: 4px 8px; background: #e5e7eb; border-radius: 20px; font-size: 11px; color: #6b7280;"><i class="fas fa-lock"></i> Aguardando liberação</span>'}
                    </div>
                </div>

                <div style="background: linear-gradient(135deg, #f8fafc, #f1f5f9); border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
                    <h3 style="margin: 0 0 15px; font-size: 16px; color: #334155; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-file-alt" style="color: #667eea;"></i> Informações da Prova
                    </h3>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                        <div>
                            <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">Prova</div>
                            <div style="font-size: 16px; font-weight: 600; color: #1e293b;">${resultado.provaTitulo || 'Prova'}</div>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: #64748b; margin-bottom: 4px;">Data de Realização</div>
                            <div style="font-size: 14px; color: #334155;">${data}</div>
                        </div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px;">
                    <div style="text-align: center; background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
                        <div style="font-size: 32px; font-weight: 700; color: ${resultado.nota !== null ? (resultado.nota >= 7 ? '#10b981' : '#ef4444') : '#94a3b8'};">
                            ${resultado.nota !== null ? resultado.nota.toFixed(2) : '-'}
                        </div>
                        <div style="font-size: 12px; color: #64748b; margin-top: 5px;">Nota Final</div>
                    </div>
                    <div style="text-align: center; background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
                        <div style="font-size: 32px; font-weight: 700; color: #1e293b;">${resultado.acertos || 0}/${resultado.total || 0}</div>
                        <div style="font-size: 12px; color: #64748b; margin-top: 5px;">Acertos • ${percentual}%</div>
                    </div>
                    <div style="text-align: center; background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
                        <div style="font-size: 32px; font-weight: 700; color: #1e293b;">${resultado.tempoGasto ? Math.round(resultado.tempoGasto / 60) : 0}</div>
                        <div style="font-size: 12px; color: #64748b; margin-top: 5px;">Tempo (minutos)</div>
                    </div>
                </div>

                ${resultado.observacoes ? `
                    <div style="background: #fef9c3; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                            <i class="fas fa-pencil-alt" style="color: #f59e0b;"></i>
                            <span style="font-weight: 600; color: #92400e;">Observações do Professor</span>
                        </div>
                        <p style="margin: 0; color: #78350f; font-size: 14px;">${resultado.observacoes}</p>
                    </div>
                ` : ''}

                ${questoesHtml}
                
                <div style="margin-top: 20px; text-align: right; font-size: 11px; color: #94a3b8;">
                    <i class="fas fa-database"></i> ID: ${resultado.id}
                </div>
            </div>
        `;

        modalTitle.innerHTML = '<i class="fas fa-eye" style="color: #667eea;"></i> Detalhes do Resultado';

        if (modalSaveBtn) {
            modalSaveBtn.style.display = 'none';
        }

        this.configurarFechamentoModal();
        this.openModal();
    }

    // ============ CONFIGURAR FECHAMENTO DO MODAL ============
    configurarFechamentoModal() {
        const closeBtn = document.querySelector('#modal .modal-close');
        if (closeBtn) {
            const newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
            newCloseBtn.onclick = () => this.fecharModal();
        }

        const modal = document.getElementById('modal');
        if (modal) {
            const newModal = modal.cloneNode(true);
            modal.parentNode.replaceChild(newModal, modal);
            newModal.onclick = (e) => {
                if (e.target === newModal) {
                    this.fecharModal();
                }
            };
        }
    }

    // ============ EDITAR RESULTADO ============
    async editarResultado(resultadoId) {
        const resultado = this.resultadosCompletos?.find(r => r.id === resultadoId);
        if (!resultado) return;

        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = `
            <div style="padding: 25px;">
                <h3 style="margin: 0 0 20px;">Editar Resultado - ${resultado.alunoNome}</h3>
                
                <div style="background: #f8f9fa; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
                    <p><strong>Prova:</strong> ${resultado.provaTitulo}</p>
                    <p><strong>Data:</strong> ${new Date(resultado.dataRealizacao).toLocaleString('pt-BR')}</p>
                    <p><strong>Email:</strong> ${resultado.alunoEmail || 'Não cadastrado'}</p>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Nota (0-10)</label>
                    <input type="number" id="editNota" min="0" max="10" step="0.1" value="${resultado.nota || 0}" 
                        style="width: 100%; padding: 10px; border: 2px solid #dee2e6; border-radius: 8px;">
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Acertos</label>
                    <input type="number" id="editAcertos" min="0" max="${resultado.total || 10}" value="${resultado.acertos}" 
                        style="width: 100%; padding: 10px; border: 2px solid #dee2e6; border-radius: 8px;">
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Total de Questões</label>
                    <input type="number" id="editTotal" min="1" value="${resultado.total || 10}" 
                        style="width: 100%; padding: 10px; border: 2px solid #dee2e6; border-radius: 8px;">
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Tempo Gasto (minutos)</label>
                    <input type="number" id="editTempo" min="0" value="${Math.round(resultado.tempoGasto / 60) || 0}" 
                        style="width: 100%; padding: 10px; border: 2px solid #dee2e6; border-radius: 8px;">
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Observações</label>
                    <textarea id="editObservacoes" rows="3" style="width: 100%; padding: 10px; border: 2px solid #dee2e6; border-radius: 8px;">${resultado.observacoes || ''}</textarea>
                </div>
            </div>
        `;

        document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> Editar Resultado';
        document.getElementById('modalSaveBtn').onclick = () => this.salvarEdicaoResultado(resultadoId);
        document.getElementById('modalSaveBtn').style.display = 'inline-block';
        document.getElementById('modalSaveBtn').textContent = 'Salvar Alterações';
        this.openModal();
    }

    // ============ SALVAR EDIÇÃO DO RESULTADO ============
    async salvarEdicaoResultado(resultadoId) {
        try {
            const resultado = this.resultadosCompletos?.find(r => r.id === resultadoId);
            if (!resultado) {
                this.showToast('❌ Resultado não encontrado', 'error');
                return;
            }

            const isCancelada = (resultado.nota === 0 && resultado.status === 'pendente') || 
                                resultado.cancelada === true || 
                                resultado.motivoCancelamento;

            if (isCancelada) {
                this.showToast('❌ Resultados cancelados não podem ser editados', 'error');
                return;
            }

            const novaNota = parseFloat(document.getElementById('editNota')?.value);
            const novoTotal = parseInt(document.getElementById('editTotal')?.value);
            const novoTempo = parseInt(document.getElementById('editTempo')?.value) * 60;
            const novasObservacoes = document.getElementById('editObservacoes')?.value;
            const liberarNota = document.getElementById('editLiberarNota')?.checked || true;

            const novosAcertos = Math.round((novaNota / 10) * novoTotal);

            if (isNaN(novaNota) || novaNota < 0 || novaNota > 10) {
                this.showToast('❌ Nota inválida. Deve ser entre 0 e 10', 'error');
                return;
            }

            if (isNaN(novoTotal) || novoTotal < 1) {
                this.showToast('❌ Total de questões inválido', 'error');
                return;
            }

            const tipoAcao = (!resultado.notaLiberada && liberarNota) ? 'liberada' : 'editada';

            this.showToast('💾 Salvando alterações...', 'info');

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
                    notaLiberada: liberarNota
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `Erro ${response.status}: ${response.statusText}`);
            }

            if (!data.success) {
                throw new Error(data.error || 'Erro ao salvar no servidor');
            }

            const responseAtualizado = await fetch(`/api/admin/todos-resultados`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const dataAtualizado = await responseAtualizado.json();

            if (dataAtualizado.success) {
                this.resultadosCompletos = dataAtualizado.resultados;
            }

            const configResponse = await fetch('/api/admin/configuracoes', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const configData = await configResponse.json();
            const pushAtivado = configData.configuracoes?.notificacoes?.push === true;

            if (pushAtivado && liberarNota && resultado.alunoId) {
                const alunoNome = resultado.alunoNome || 'Aluno';
                const provaTitulo = resultado.provaTitulo || 'Prova';

                const tituloPush = tipoAcao === 'liberada' 
                    ? '📊 Resultado Liberado!' 
                    : '✏️ Resultado Atualizado';

                const mensagemPush = tipoAcao === 'liberada'
                    ? `Sua nota em "${provaTitulo}" foi liberada: ${novaNota.toFixed(2)}`
                    : `Sua nota em "${provaTitulo}" foi atualizada para ${novaNota.toFixed(2)}`;

                await this.enviarPushParaUsuario(
                    resultado.alunoId,
                    tituloPush,
                    mensagemPush,
                    {
                        tipo: 'resultado',
                        acao: tipoAcao,
                        provaId: resultado.provaId,
                        nota: novaNota,
                        resultadoId: resultadoId
                    }
                );
            }

            this.showToast('✅ Resultado atualizado com sucesso!', 'success');
            this.fecharModal();

            if (typeof this.filtrarTabelaResultados === 'function') {
                this.filtrarTabelaResultados();
            }

            if (typeof this.atualizarContadoresCards === 'function') {
                this.atualizarContadoresCards();
            }

        } catch (error) {
            console.error('❌ Erro ao salvar resultado:', error);
            this.showToast('❌ Erro: ' + error.message, 'error');
        }
    }

    // ============ EXCLUIR RESULTADO ============
    async excluirResultado(resultadoId) {
        const resultado = this.resultadosCompletos?.find(r => r.id === resultadoId);
        if (!resultado) return;

        const confirmar = await this.confirmar(
            '🗑️ Excluir Resultado',
            `Tem certeza que deseja excluir permanentemente o resultado de <strong>${resultado.alunoNome}</strong> na prova <strong>${resultado.provaTitulo}</strong>?<br><br>
            <span style="color: #dc3545;">⚠️ Esta ação excluirá de TODAS as coleções do banco!</span>`
        );

        if (!confirmar) return;

        try {
            this.showToast('🔄 Excluindo resultado...', 'info');

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

                this.showToast(data.message || '✅ Registro excluído com sucesso!', 'success');
            } else {
                throw new Error(data.error || 'Erro ao excluir do servidor');
            }

        } catch (error) {
            console.error('❌ Erro ao excluir resultado:', error);
            this.showToast('❌ Erro: ' + error.message, 'error');
        }
    }

    // ============ ENVIAR LEMBRETE ============
    async enviarLembrete(resultadoId) {
        try {
            console.log('📧 Enviando lembrete para resultado:', resultadoId);

            const token = localStorage.getItem('auth_token');

            const configResponse = await fetch('/api/admin/configuracoes', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!configResponse.ok) {
                throw new Error('Erro ao buscar configurações');
            }

            const configData = await configResponse.json();
            const notificacoesHabilitadas = configData.configuracoes?.notificacoes?.sistema !== false;
            const pushAtivado = configData.configuracoes?.notificacoes?.push === true;

            if (!notificacoesHabilitadas) {
                this.showToast('⚠️ Notificações do sistema estão desabilitadas nas configurações', 'warning');
                return;
            }

            let resultado = this.resultadosCompletos?.find(r => r.id === resultadoId);

            if (!resultado) {
                const response = await fetch('/api/admin/todos-resultados', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                const data = await response.json();
                resultado = data.resultados?.find(r => r.id === resultadoId);

                if (!resultado) {
                    this.showToast('❌ Resultado não encontrado', 'error');
                    return;
                }
            }

            const alunoId = resultado.alunoId;
            const alunoNome = resultado.alunoNome;
            const provaTitulo = resultado.provaTitulo;
            const provaId = resultado.provaId;

            if (!alunoId) {
                this.showToast('❌ ID do aluno não encontrado', 'error');
                return;
            }

            const adminResponse = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const adminData = await adminResponse.json();
            const adminNome = adminData.user?.nome || 'Administrador';

            const confirmar = await this.confirmar(
                '📧 Enviar Lembrete',
                `Deseja enviar um lembrete para o aluno <strong>${alunoNome}</strong> sobre a prova <strong>${provaTitulo}</strong>?`
            );

            if (!confirmar) return;

            this.showToast('📧 Enviando lembrete...', 'info');

            const notificacaoBody = {
                usuarioId: alunoId,
                tipo: 'sistema',
                titulo: '📝 Lembrete de Prova',
                mensagem: `Professor ${adminNome} enviou um lembrete sobre a prova "${provaTitulo}".`,
                icone: '📧',
                cor: '#3b82f6',
                link: `/aluno.html?prova=${provaId}`,
                prioridade: 1,
                dados: {
                    tipo: 'lembrete',
                    provaId: provaId,
                    provaTitulo: provaTitulo,
                    professor: adminNome,
                    resultadoId: resultadoId
                }
            };

            const notificacaoResponse = await fetch('/api/notificacoes', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(notificacaoBody)
            });

            const notificacaoData = await notificacaoResponse.json();

            if (!notificacaoData.success) {
                throw new Error(notificacaoData.error || 'Erro ao criar notificação');
            }

            if (pushAtivado) {
                const pushEnviado = await this.enviarPushParaUsuario(
                    alunoId,
                    '📝 Lembrete de Prova',
                    `Professor ${adminNome} enviou lembrete: ${provaTitulo}`,
                    {
                        tipo: 'lembrete',
                        provaId: provaId,
                        provaTitulo: provaTitulo,
                        notificacaoId: notificacaoData.notificacao.id,
                        resultadoId: resultadoId
                    }
                );
            }

            this.showToast('✅ Lembrete enviado com sucesso!', 'success');

            this.mostrarConfirmacaoLembrete(alunoNome, provaTitulo, pushAtivado);

        } catch (error) {
            console.error('❌ Erro ao enviar lembrete:', error);
            this.showToast('❌ Erro: ' + error.message, 'error');
        }
    }

    // ============ MOSTRAR CONFIRMAÇÃO DE LEMBRETE ============
    mostrarConfirmacaoLembrete(alunoNome, provaTitulo, pushEnviado = false) {
        const modalBody = document.getElementById('modalBody');
        const modalTitle = document.getElementById('modalTitle');
        const modalSaveBtn = document.getElementById('modalSaveBtn');

        const pushIcon = pushEnviado ? '📱' : '📋';
        const pushText = pushEnviado ? 'Push enviado para o celular!' : 'Notificação enviada no sistema';

        modalBody.innerHTML = `
            <div style="padding: 20px; text-align: center;">
                <div style="
                    width: 60px;
                    height: 60px;
                    background: #10b981;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 15px;
                ">
                    <i class="fas fa-check" style="font-size: 30px; color: white;"></i>
                </div>
                <h3 style="margin: 0 0 10px; color: #1f2937;">✅ Lembrete Enviado!</h3>
                <p style="color: #6b7280; margin-bottom: 5px;"><strong>Aluno:</strong> ${alunoNome}</p>
                <p style="color: #6b7280;"><strong>Prova:</strong> ${provaTitulo}</p>
                <div style="
                    margin-top: 15px;
                    padding: 10px;
                    background: ${pushEnviado ? '#d1fae5' : '#f3f4f6'};
                    border-radius: 8px;
                    color: ${pushEnviado ? '#065f46' : '#4b5563'};
                    font-size: 0.9rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                ">
                    <span style="font-size: 1.2rem;">${pushIcon}</span>
                    <span>${pushText}</span>
                </div>
                <p style="color: #9ca3af; font-size: 0.85rem; margin-top: 15px;">
                    <i class="fas fa-bell"></i> O aluno receberá no sistema e no celular (se push ativado).
                </p>
            </div>
        `;

        modalTitle.innerHTML = '<i class="fas fa-envelope"></i> Lembrete Enviado';
        modalSaveBtn.style.display = 'none';
        this.openModal();

        setTimeout(() => {
            this.fecharModal();
        }, 2500);
    }

    // ============ VER DETALHES DE CANCELAMENTO ============
    async verDetalhesCancelamento(resultadoId) {
        try {
            console.log('🔍 Buscando detalhes de cancelamento para:', resultadoId);

            const resultado = this.resultadosCompletos?.find(r => r.id === resultadoId);

            if (!resultado) {
                this.showToast('❌ Resultado não encontrado', 'error');
                return;
            }

            const isCancelada = (resultado.nota === 0 && resultado.status === 'pendente') || 
                                resultado.cancelada === true || 
                                resultado.motivoCancelamento;

            if (!isCancelada) {
                this.showToast('❌ Este resultado não foi cancelado', 'error');
                return;
            }

            this.showToast('🔄 Carregando detalhes do cancelamento...', 'info');

            const token = localStorage.getItem('auth_token');

            try {
                const response = await fetch(`/api/admin/resultados/${resultadoId}/cancelamento`, {
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.success) {
                        this.mostrarModalCancelamento(data);
                        return;
                    }
                }
            } catch (apiError) {
                console.log('⚠️ API falhou, usando dados locais:', apiError.message);
            }

            const motivo = resultado.motivoCancelamento || '';
            const motivoLower = motivo.toLowerCase();

            const palavrasViolacao = [
                'violação', 'violacao', 'violou', 'viola', 'multiplas', 'múltiplas',
                'regras', 'monitoramento', 'trapaça', 'trapaca', 'fraude',
                'atalho', 'f5', 'refresh', 'recarregar', 'saiu'
            ];

            const isViolacao = palavrasViolacao.some(palavra => motivoLower.includes(palavra)) ||
                            resultado.flagViolacao === true;

            const dadosCancelamento = {
                success: true,
                tipoCancelamento: isViolacao ? 'violacao' : 'prazo',
                prova: {
                    titulo: resultado.provaTitulo || 'Prova'
                },
                aluno: {
                    nome: resultado.alunoNome || 'Aluno',
                    email: resultado.alunoEmail || '',
                    matricula: resultado.alunoMatricula || ''
                },
                cancelamento: {
                    data: resultado.dataRealizacao || resultado.createdAt || new Date().toISOString(),
                    motivo: resultado.motivoCancelamento || 'Prazo de entrega expirado',
                    nota: resultado.nota || 0,
                    tempoGasto: resultado.tempoGasto || 0
                },
                estatisticas: resultado.estatisticasCancelamento || {
                    avisos: isViolacao ? 3 : 0,
                    tentativasAtalho: isViolacao ? 2 : 0,
                    capturasTela: 0,
                    tempoFora: 0
                }
            };

            this.mostrarModalCancelamento(dadosCancelamento);

        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ Erro ao carregar detalhes do cancelamento', 'error');
        }
    }

    // ============ MOSTRAR MODAL DE CANCELAMENTO ============
    mostrarModalCancelamento(dados) {
        const modalBody = document.getElementById('modalBody');
        const modalTitle = document.getElementById('modalTitle');
        const modalSaveBtn = document.getElementById('modalSaveBtn');

        if (!modalBody || !modalTitle) return;

        const tipo = dados.tipoCancelamento || 'prazo';
        const config = {
            'violacao': { 
                cor: '#dc2626', 
                corFundo: '#fee2e2', 
                icone: 'user-slash', 
                titulo: 'CANCELADA - VIOLAÇÃO DAS REGRAS' 
            },
            'prazo': { 
                cor: '#f59e0b', 
                corFundo: '#fef3c7', 
                icone: 'clock', 
                titulo: 'CANCELADA - PRAZO EXPIRADO' 
            },
            'outro': { 
                cor: '#6b7280', 
                corFundo: '#f3f4f6', 
                icone: 'ban', 
                titulo: 'CANCELADA' 
            }
        }[tipo] || config.prazo;

        const dataCancelamento = new Date(dados.cancelamento.data);
        const dataFormatada = dataCancelamento.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        let estatisticasHtml = '';
        if (dados.estatisticas) {
            const stats = dados.estatisticas;
            estatisticasHtml = Object.entries(stats)
                .filter(([_, v]) => v !== undefined && v !== null && v !== 0)
                .map(([k, v]) => {
                    let label = k;
                    if (k === 'avisos') label = 'Avisos';
                    if (k === 'tentativasAtalho') label = 'Tentativas de atalho';
                    if (k === 'capturasTela') label = 'Capturas de tela';
                    if (k === 'tempoFora') label = 'Tempo fora da página (s)';
                    if (k === 'timestamp') return '';

                    return `
                        <div style="margin: 8px 0; display: flex; justify-content: space-between; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px;">
                            <span style="color: #4b5563;">${label}:</span>
                            <span style="font-weight: 600; color: ${config.cor};">${v}</span>
                        </div>
                    `;
                }).join('');
        }

        modalBody.innerHTML = `
            <div style="padding: 20px; max-height: 70vh; overflow-y: auto;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="
                        width: 70px;
                        height: 70px;
                        background: ${config.corFundo};
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto 15px;
                        border: 3px solid ${config.cor};
                    ">
                        <i class="fas fa-${config.icone}" style="font-size: 30px; color: ${config.cor};"></i>
                    </div>
                    <h2 style="color: ${config.cor}; margin: 0; font-size: 1.5rem;">${config.titulo}</h2>
                </div>
                
                <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #e5e7eb;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div>
                            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Prova</div>
                            <div style="font-weight: 600; color: #1f2937;">${dados.prova.titulo || 'Não identificada'}</div>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Aluno</div>
                            <div style="font-weight: 600; color: #1f2937;">${dados.aluno.nome || 'Não identificado'}</div>
                            ${dados.aluno.matricula ? `<div style="font-size: 11px; color: #6b7280;">Mat: ${dados.aluno.matricula}</div>` : ''}
                        </div>
                        <div>
                            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Data do cancelamento</div>
                            <div style="font-weight: 600; color: #1f2937;">${dataFormatada}</div>
                        </div>
                        <div>
                            <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Nota atribuída</div>
                            <div style="font-weight: 600; color: ${config.cor};">${dados.cancelamento.nota?.toFixed(2) || '0.00'}</div>
                        </div>
                    </div>
                    
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
                        <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Motivo do cancelamento</div>
                        <div style="background: white; padding: 12px; border-radius: 8px; border: 1px solid #e5e7eb; color: #374151;">
                            "${dados.cancelamento.motivo || 'Motivo não especificado'}"
                        </div>
                        ${dados.cancelamento.tempoGasto ? `
                            <div style="margin-top: 10px; font-size: 12px; color: #6b7280;">
                                <i class="fas fa-clock"></i> Tempo gasto: ${Math.round(dados.cancelamento.tempoGasto / 60)} minutos
                            </div>
                        ` : ''}
                    </div>
                </div>
                
                ${estatisticasHtml ? `
                    <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #e5e7eb;">
                        <h4 style="margin: 0 0 15px 0; color: #374151; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-chart-bar" style="color: ${config.cor};"></i>
                            Estatísticas do Monitoramento
                        </h4>
                        ${estatisticasHtml}
                    </div>
                ` : ''}
                
                <div style="background: #f0f9ff; border-radius: 12px; padding: 15px; border-left: 4px solid #3b82f6;">
                    <div style="display: flex; align-items: center; gap: 10px; color: #1e40af;">
                        <i class="fas fa-info-circle"></i>
                        <span style="font-weight: 500;">Professor notificado automaticamente</span>
                    </div>
                    ${dados.professor ? `
                        <p style="margin: 8px 0 0 0; color: #2563eb; font-size: 0.9rem;">
                            <strong>${dados.professor.nome}</strong> (${dados.professor.email})
                        </p>
                    ` : `
                        <p style="margin: 8px 0 0 0; color: #2563eb; font-size: 0.9rem;">
                            O professor responsável foi notificado sobre este cancelamento.
                        </p>
                    `}
                </div>
                
                <div style="margin-top: 15px; text-align: right; font-size: 10px; color: #9ca3af;">
                    <i class="fas fa-clock"></i> ${new Date(dados.timestamp || new Date()).toLocaleString('pt-BR')}
                </div>
            </div>
        `;

        modalTitle.innerHTML = `<i class="fas fa-info-circle" style="color: ${config.cor};"></i> Detalhes do Cancelamento`;

        if (modalSaveBtn) {
            modalSaveBtn.style.display = 'none';
        }

        const closeBtn = document.querySelector('#modal .modal-close');
        if (closeBtn) {
            const newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);

            newCloseBtn.onclick = () => this.fecharModal();
        }

        const modal = document.getElementById('modal');
        if (modal) {
            const newModal = modal.cloneNode(true);
            modal.parentNode.replaceChild(newModal, modal);

            newModal.onclick = (e) => {
                if (e.target === newModal) {
                    this.fecharModal();
                }
            };
        }

        this.openModal();
    }
        // ============ EXPORTAR RESULTADOS PDF ============
    exportarResultadosPDF() {
        if (!this.resultadosFiltrados || this.resultadosFiltrados.length === 0) {
            this.showToast('❌ Nenhum resultado para exportar', 'error');
            return;
        }

        this.showToast('📄 Gerando relatório PDF...', 'info');

        try {
            const printWindow = window.open('', '_blank');

            if (!printWindow) {
                this.showToast('⚠️ Permita popups para gerar o PDF', 'warning');
                return;
            }

            const totalResultados = this.resultadosFiltrados.length;
            const aprovados = this.resultadosFiltrados.filter(r => r.nota && r.nota >= 7).length;
            const reprovados = this.resultadosFiltrados.filter(r => r.nota && r.nota < 7).length;
            const pendentes = this.resultadosFiltrados.filter(r => !r.nota).length;
            const mediaGeral = this.resultadosFiltrados.filter(r => r.nota).reduce((acc, r) => acc + r.nota, 0) / (this.resultadosFiltrados.filter(r => r.nota).length || 1);

            const dataAtual = new Date().toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            let htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Relatório de Resultados</title>
        <style>
            body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                margin: 0;
                padding: 20px;
                background: #fff;
                color: #333;
            }
            .header {
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                padding: 30px;
                border-radius: 12px;
                margin-bottom: 30px;
            }
            .header h1 {
                margin: 0;
                font-size: 28px;
            }
            .header p {
                margin: 10px 0 0;
                opacity: 0.9;
            }
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 20px;
                margin-bottom: 30px;
            }
            .stat-card {
                background: #f8f9fa;
                padding: 20px;
                border-radius: 12px;
                border-left: 4px solid #667eea;
            }
            .stat-card .label {
                font-size: 14px;
                color: #6c757d;
                margin-bottom: 5px;
            }
            .stat-card .value {
                font-size: 28px;
                font-weight: 600;
                color: #333;
            }
            .stat-card .detail {
                font-size: 12px;
                color: #6c757d;
                margin-top: 5px;
            }
            table {
                width: 100%;
                border-collapse: collapse;
                margin-top: 20px;
                font-size: 12px;
            }
            th {
                background: #f1f3f5;
                padding: 12px;
                text-align: left;
                font-weight: 600;
                color: #495057;
            }
            td {
                padding: 10px 12px;
                border-bottom: 1px solid #e9ecef;
            }
            .status-aprovado {
                background: #d4edda;
                color: #155724;
                padding: 4px 8px;
                border-radius: 20px;
                font-size: 11px;
                font-weight: 600;
                display: inline-block;
            }
            .status-reprovado {
                background: #f8d7da;
                color: #721c24;
                padding: 4px 8px;
                border-radius: 20px;
                font-size: 11px;
                font-weight: 600;
                display: inline-block;
            }
            .status-pendente {
                background: #fff3cd;
                color: #856404;
                padding: 4px 8px;
                border-radius: 20px;
                font-size: 11px;
                font-weight: 600;
                display: inline-block;
            }
            .footer {
                margin-top: 30px;
                text-align: center;
                color: #6c757d;
                font-size: 12px;
                border-top: 1px solid #e9ecef;
                padding-top: 20px;
            }
            @media print {
                body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>📊 Relatório de Resultados</h1>
            <p>Gerado em: ${dataAtual}</p>
            <p>Total de registros: ${this.resultadosFiltrados.length}</p>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="label">Total de Resultados</div>
                <div class="value">${totalResultados}</div>
            </div>
            <div class="stat-card" style="border-left-color: #28a745;">
                <div class="label">Aprovados</div>
                <div class="value">${aprovados}</div>
                <div class="detail">${((aprovados / (totalResultados || 1)) * 100).toFixed(1)}%</div>
            </div>
            <div class="stat-card" style="border-left-color: #dc3545;">
                <div class="label">Reprovados</div>
                <div class="value">${reprovados}</div>
                <div class="detail">${((reprovados / (totalResultados || 1)) * 100).toFixed(1)}%</div>
            </div>
            <div class="stat-card" style="border-left-color: #ffc107;">
                <div class="label">Média Geral</div>
                <div class="value">${mediaGeral.toFixed(2)}</div>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Aluno</th>
                    <th>Email</th>
                    <th>Matrícula</th>
                    <th>Turma</th>
                    <th>Prova</th>
                    <th>Data</th>
                    <th>Nota</th>
                    <th>Acertos</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
            `;

            this.resultadosFiltrados.slice(0, 100).forEach(r => {
                const data = r.dataRealizacao ? new Date(r.dataRealizacao).toLocaleDateString('pt-BR') : 'N/A';
                const statusClass = r.nota ? (r.nota >= 7 ? 'status-aprovado' : 'status-reprovado') : 'status-pendente';
                const statusText = r.nota ? (r.nota >= 7 ? 'Aprovado' : 'Reprovado') : 'Pendente';

                htmlContent += `
                <tr>
                    <td>${r.alunoNome || ''}</td>
                    <td>${r.alunoEmail || ''}</td>
                    <td>${r.alunoMatricula || ''}</td>
                    <td>${r.alunoTurma || ''}</td>
                    <td>${r.provaTitulo || ''}</td>
                    <td>${data}</td>
                    <td style="font-weight: 600; color: ${r.nota ? (r.nota >= 7 ? '#28a745' : '#dc3545') : '#6c757d'};">${r.nota ? r.nota.toFixed(2) : '-'}</td>
                    <td>${r.acertos}/${r.total}</td>
                    <td><span class="${statusClass}">${statusText}</span></td>
                </tr>
                `;
            });

            if (this.resultadosFiltrados.length > 100) {
                htmlContent += `<tr><td colspan="9" style="text-align: center; padding: 15px; color: #6c757d;">Mostrando 100 de ${this.resultadosFiltrados.length} resultados</td></tr>`;
            }

            htmlContent += `
            </tbody>
        </table>

        <div class="footer">
            <p>Relatório gerado automaticamente pelo EducaPleno</p>
        </div>
    </body>
    </html>
    `;

            printWindow.document.write(htmlContent);
            printWindow.document.close();

            setTimeout(() => {
                printWindow.focus();
                printWindow.print();
            }, 500);

            this.showToast('📄 Relatório gerado! Verifique a janela de impressão.', 'success');

        } catch (error) {
            console.error('❌ Erro ao gerar PDF:', error);
            this.showToast('❌ Erro ao gerar relatório PDF', 'error');
        }
    }

    // ============ EXPORTAR RESULTADOS CSV ============
    exportarResultadosCSV() {
        if (!this.resultadosFiltrados || this.resultadosFiltrados.length === 0) {
            this.showToast('❌ Nenhum resultado para exportar', 'error');
            return;
        }

        try {
            this.showToast('📥 Gerando arquivo CSV...', 'info');

            const headers = [
                'Aluno',
                'Email',
                'Matrícula',
                'Turma',
                'Prova',
                'Data',
                'Nota',
                'Acertos',
                'Total',
                'Percentual',
                'Tempo (min)',
                'Status'
            ];

            let csvContent = headers.join(',') + '\n';

            this.resultadosFiltrados.forEach(r => {
                const data = r.dataRealizacao ? new Date(r.dataRealizacao).toLocaleDateString('pt-BR') : 'N/A';
                const status = r.nota ? (r.nota >= 7 ? 'Aprovado' : 'Reprovado') : 'Pendente';
                const percentual = r.total > 0 ? Math.round((r.acertos / r.total) * 100) : 0;

                const alunoNome = (r.alunoNome || '').replace(/"/g, '""');
                const alunoEmail = (r.alunoEmail || '').replace(/"/g, '""');
                const alunoMatricula = (r.alunoMatricula || '').replace(/"/g, '""');
                const alunoTurma = (r.alunoTurma || '').replace(/"/g, '""');
                const provaTitulo = (r.provaTitulo || '').replace(/"/g, '""');

                const linha = [
                    `"${alunoNome}"`,
                    `"${alunoEmail}"`,
                    `"${alunoMatricula}"`,
                    `"${alunoTurma}"`,
                    `"${provaTitulo}"`,
                    `"${data}"`,
                    r.nota || '',
                    r.acertos,
                    r.total,
                    percentual,
                    Math.round(r.tempoGasto / 60) || 0,
                    `"${status}"`
                ].join(',');

                csvContent += linha + '\n';
            });

            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });

            const url = window.URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = url;
            link.download = `resultados-${new Date().toISOString().slice(0, 10)}.csv`;
            link.style.display = 'none';

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            window.URL.revokeObjectURL(url);

            this.showToast('✅ Resultados exportados com sucesso!', 'success');

        } catch (error) {
            console.error('❌ Erro ao exportar CSV:', error);
            this.showToast('❌ Erro ao exportar resultados', 'error');
        }
    }

    // ============ RENDERIZAR SEM RESULTADOS ============
    renderSemResultados() {
        return `
            <div class="empty-state" style="text-align: center; padding: 80px; background: white; border-radius: 16px;">
                <i class="fas fa-chart-line" style="font-size: 64px; color: #dee2e6; margin-bottom: 20px;"></i>
                <h2 style="color: #495057; margin-bottom: 10px;">Nenhum resultado encontrado</h2>
                <p style="color: #6c757d; margin-bottom: 25px;">Ainda não há resultados de provas no sistema.</p>
                <button class="btn-primary" onclick="adminSimples.carregarResultados()" style="background: #0d6efd; color: white; border: none; padding: 12px 30px; border-radius: 8px; cursor: pointer; font-size: 14px;">
                    <i class="fas fa-sync-alt"></i> Atualizar
                </button>
            </div>
        `;
    }

    // ============ RENDERIZAR ERRO ============
    renderErro(error) {
        return `
            <div class="error-container" style="text-align: center; padding: 80px; background: white; border-radius: 16px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 64px; color: #dc3545; margin-bottom: 20px;"></i>
                <h2 style="color: #721c24; margin-bottom: 10px;">Erro ao carregar resultados</h2>
                <p style="color: #6c757d; margin-bottom: 25px;">${error.message}</p>
                <button class="btn-primary" onclick="adminSimples.carregarResultados()" style="background: #0d6efd; color: white; border: none; padding: 12px 30px; border-radius: 8px; cursor: pointer; font-size: 14px;">
                    <i class="fas fa-sync-alt"></i> Tentar novamente
                </button>
            </div>
        `;
    }

    // ============ CARREGAR FOTO DE PERFIL DO ADMIN ============
    async carregarFotoPerfilAdmin() {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            console.log('🔍 Buscando foto de perfil do admin...');

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
                    console.log('✅ Foto de perfil do admin carregada!');
                }
            } else {
                console.log('📸 Nenhuma foto de perfil cadastrada');
            }
        } catch (error) {
            console.error('❌ Erro ao carregar foto:', error);
        }
    }
        // ============ MODAL ============
    abrirModal(titulo, conteudo, salvar = true) {
        console.log('📂 Abrindo modal:', { titulo, salvar, temConteudo: !!conteudo });

        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        const modalSaveBtn = document.getElementById('modalSaveBtn');

        if (!modalTitle || !modalBody) {
            console.error('❌ Elementos do modal não encontrados');
            return;
        }

        modalTitle.innerHTML = titulo || 'Título';
        modalBody.innerHTML = conteudo || '<p style="padding: 20px; text-align: center;">Nenhum conteúdo disponível</p>';

        if (modalSaveBtn) {
            modalSaveBtn.style.display = salvar ? 'inline-block' : 'none';
            modalSaveBtn.onclick = null;
        }

        const modal = document.getElementById('modal');
        if (modal) {
            modal.style.display = 'flex';
        } else {
            console.error('❌ Modal não encontrado no DOM');
        }
    }

    // ============ FECHAR MODAL ============
    fecharModal() {
        console.log('🔚 Fechando modal');
        const modal = document.getElementById('modal');
        if (modal) {
            modal.style.display = 'none';
        }

        const modalSaveBtn = document.getElementById('modalSaveBtn');
        if (modalSaveBtn) {
            modalSaveBtn.style.display = 'inline-block';
            modalSaveBtn.onclick = null;
        }
    }

    // ============ CONFIRMAR ============
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
        document.getElementById('confirmModal').style.display = 'none';
    }

    // ============ UTILITÁRIOS ============
    showToast(mensagem, tipo = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${tipo}`;
        toast.innerHTML = `<i class="fas ${tipo === 'success' ? 'fa-check-circle' : tipo === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i> ${mensagem}`;
        document.getElementById('toastContainer').appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    logout() {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        window.location.href = 'login.html';
    }
        // ============================================================================
    // 🔥 MÉTODOS ESSENCIAIS - COLAR ANTES DO FECHAMENTO DA CLASSE
    // ============================================================================

    // ============ ABRIR MODAL GENÉRICO ============
    abrirModal(titulo, conteudo, salvar = true) {
        console.log('📂 Abrindo modal:', { titulo, salvar, temConteudo: !!conteudo });

        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        const modalSaveBtn = document.getElementById('modalSaveBtn');

        if (!modalTitle || !modalBody) {
            console.error('❌ Elementos do modal não encontrados');
            return;
        }

        modalTitle.innerHTML = titulo || 'Título';
        modalBody.innerHTML = conteudo || '<p style="padding: 20px; text-align: center;">Nenhum conteúdo disponível</p>';

        if (modalSaveBtn) {
            modalSaveBtn.style.display = salvar ? 'inline-block' : 'none';
            modalSaveBtn.onclick = null;
        }

        const modal = document.getElementById('modal');
        if (modal) {
            modal.style.display = 'flex';
        } else {
            console.error('❌ Modal não encontrado no DOM');
        }
    }

    // ============ ABRIR MODAL (ALIAS usado no abrirModalEnvioNotificacao) ============
    openModal() {
        console.log('📂 Abrindo modal (openModal)');
        const modal = document.getElementById('modal');
        if (modal) {
            modal.style.display = 'flex';
        }
    }

    // ============ FECHAR MODAL ============
    fecharModal() {
        console.log('🔚 Fechando modal');
        const modal = document.getElementById('modal');
        if (modal) {
            modal.style.display = 'none';
        }

        const modalSaveBtn = document.getElementById('modalSaveBtn');
        if (modalSaveBtn) {
            modalSaveBtn.style.display = 'inline-block';
            modalSaveBtn.onclick = null;
        }
    }

    // ============ FECHAR MODAL (ALIAS) ============
    closeModal() {
        console.log('🔚 Fechando modal (closeModal)');
        const modal = document.getElementById('modal');
        if (modal) {
            modal.style.display = 'none';
        }

        const modalSaveBtn = document.getElementById('modalSaveBtn');
        if (modalSaveBtn) {
            modalSaveBtn.style.display = 'inline-block';
            modalSaveBtn.onclick = null;
        }
    }

    // ============ CARREGAR PROVAS (VERSÃO CORRIGIDA E COMPLETA) ============
    async carregarProvas() {
        console.log('📚 CARREGANDO PROVAS...');
        
        const contentArea = document.getElementById('contentArea');
        if (contentArea) {
            contentArea.innerHTML = `
                <div style="text-align: center; padding: 60px; background: white; border-radius: 12px;">
                    <div style="width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #1e3a8a; border-radius: 50%; margin: 0 auto 20px; animation: spin 1s linear infinite;"></div>
                    <p style="color: #6b7280;">Carregando provas...</p>
                </div>
                <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
            `;
        }

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/admin/provas?limit=100', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status}`);
            }

            const data = await response.json();
            this.provas = data.success ? (data.provas || []) : [];
            
            console.log(`✅ ${this.provas.length} provas carregadas`);

            this.professoresLista = this.extrairProfessores(this.provas);

            // Se estamos na aba de provas, renderizar a interface completa
            if (this.abaAtual === 'provas' && contentArea) {
                this.renderizarPaginaProvas();
            }

        } catch (error) {
            console.error('❌ Erro ao carregar provas:', error);
            this.provas = [];
            
            if (this.abaAtual === 'provas' && contentArea) {
                contentArea.innerHTML = `
                    <div style="text-align: center; padding: 60px; background: white; border-radius: 16px;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #dc3545; margin-bottom: 20px;"></i>
                        <h3 style="color: #721c24; margin-bottom: 10px;">Erro ao carregar provas</h3>
                        <p style="color: #6c757d; margin-bottom: 20px;">${error.message}</p>
                        <button onclick="adminSimples.carregarProvas()" style="background: #1e3a8a; color: white; border: none; padding: 10px 30px; border-radius: 8px; cursor: pointer;">
                            <i class="fas fa-sync-alt"></i> Tentar novamente
                        </button>
                    </div>
                `;
            }
        }
    }

    // ============ RENDERIZAR PÁGINA DE PROVAS (INTERFACE COMPLETA) ============
    renderizarPaginaProvas() {
        console.log('🎨 Renderizando página de provas...');
        
        const contentArea = document.getElementById('contentArea');
        if (!contentArea) return;

        const provasAtivas = this.provas.filter(p => 
            p.publicada && !p.cancelada && (!p.dataLimite || new Date(p.dataLimite) > new Date())
        ).length;
        
        const rascunhos = this.provas.filter(p => !p.publicada && !p.cancelada).length;
        const canceladas = this.provas.filter(p => p.cancelada).length;
        const expiradas = this.provas.filter(p => 
            p.publicada && p.dataLimite && new Date(p.dataLimite) < new Date()
        ).length;

        contentArea.innerHTML = `
            <div class="provas-container">
                <!-- HEADER PROFISSIONAL -->
                <div class="provas-header">
                    <div class="header-left">
                        <div class="header-icon">
                            <i class="fas fa-file-alt"></i>
                        </div>
                        <div class="header-text">
                            <h1>Gerenciar Provas</h1>
                            <p>Gerencie todas as provas do sistema</p>
                        </div>
                    </div>
                    
                    <div class="header-actions">
                        <button class="btn-header btn-refresh" onclick="adminSimples.atualizarProvas()" title="Atualizar" style="background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.3); padding: 12px; border-radius: 40px; cursor: pointer;">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                        <button class="btn-header btn-primary" onclick="adminSimples.mostrarFormCriarProva()" style="background: white; color: #1e3a8a; padding: 12px 24px; border-radius: 40px; border: none; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-magic"></i>
                            <span>Nova Prova com IA</span>
                        </button>
                        
                        <button class="btn-header" style="background: #8b5cf6; color: white; border: none; padding: 12px 24px; border-radius: 40px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;" 
                                onclick="adminSimples.abrirModalUploadAdaptarDocumento()" title="Adaptar documento para acessibilidade">
                            <i class="fas fa-universal-access"></i>
                            <span>Adaptar Documento</span>
                        </button>
                    </div>
                </div>

                <!-- STATS -->
                <div class="stats-grid">
                    <div class="stat-card primary" onclick="adminSimples.filtrarProvasPorStatus('todos')">
                        <div class="stat-icon" style="background: linear-gradient(135deg, #1e3a8a, #1e40af);">
                            <i class="fas fa-file-alt"></i>
                        </div>
                        <div class="stat-content">
                            <span class="stat-label">Total de Provas</span>
                            <span class="stat-value">${this.provas.length}</span>
                        </div>
                    </div>

                    <div class="stat-card success" onclick="adminSimples.filtrarProvasPorStatus('ativa')">
                        <div class="stat-icon" style="background: linear-gradient(135deg, #10b981, #059669);">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <div class="stat-content">
                            <span class="stat-label">Ativas</span>
                            <span class="stat-value">${provasAtivas}</span>
                        </div>
                    </div>

                    <div class="stat-card warning" onclick="adminSimples.filtrarProvasPorStatus('rascunho')">
                        <div class="stat-icon" style="background: linear-gradient(135deg, #f59e0b, #d97706);">
                            <i class="fas fa-clock"></i>
                        </div>
                        <div class="stat-content">
                            <span class="stat-label">Rascunhos</span>
                            <span class="stat-value">${rascunhos}</span>
                        </div>
                    </div>

                    <div class="stat-card danger" onclick="adminSimples.filtrarProvasPorStatus('cancelada')">
                        <div class="stat-icon" style="background: linear-gradient(135deg, #ef4444, #dc2626);">
                            <i class="fas fa-ban"></i>
                        </div>
                        <div class="stat-content">
                            <span class="stat-label">Canceladas</span>
                            <span class="stat-value">${canceladas}</span>
                        </div>
                    </div>
                </div>

                <!-- FILTROS -->
                <div class="filters-card">
                    <div class="filters-header">
                        <div class="filters-title">
                            <i class="fas fa-sliders-h"></i>
                            <h3>Filtros</h3>
                        </div>
                        <span class="filters-badge" id="resultadosBadge">${this.provas.length} ${this.provas.length === 1 ? 'prova' : 'provas'}</span>
                    </div>
                    
                    <div class="filters-grid">
                        <div class="filter-group">
                            <label><i class="fas fa-search"></i> Buscar</label>
                            <input type="text" id="searchProvas" placeholder="Título, conteúdo ou professor..." 
                                value="" onkeyup="adminSimples.filtrarProvasLista()"
                                style="width: 100%; padding: 10px 15px; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 14px;">
                        </div>
                        
                        <div class="filter-group">
                            <label><i class="fas fa-circle"></i> Status</label>
                            <select id="filtroStatusProva" onchange="adminSimples.filtrarProvasLista()"
                                style="width: 100%; padding: 10px 15px; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 14px; background: white;">
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
                                style="width: 100%; padding: 10px 15px; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 14px; background: white;">
                                <option value="todas">Todos</option>
                                <option value="simples">📄 Simples</option>
                                <option value="enem">🎯 ENEM</option>
                                <option value="adaptada">♿ Adaptada</option>
                            </select>
                        </div>
                        
                        <div class="filter-actions">
                            <button onclick="adminSimples.limparFiltrosProvas()" style="padding: 10px 20px; border: none; border-radius: 12px; font-size: 13px; font-weight: 600; cursor: pointer; background: #6b7280; color: white;">
                                <i class="fas fa-eraser"></i> Limpar
                            </button>
                        </div>
                    </div>
                </div>

                <!-- CONTAINER DO FORMULÁRIO DE CRIAÇÃO -->
                <div id="formCriarProvaContainer" style="display: none; margin-bottom: 30px;"></div>

                <!-- TABELA DE PROVAS -->
                <div class="table-professional">
                    <div class="table-header">
                        <div class="table-title">
                            <i class="fas fa-list"></i>
                            <h3>Lista de Provas</h3>
                        </div>
                        <div class="table-info">
                            <span id="itemsCounter">${this.provas.length} registros</span>
                        </div>
                    </div>
                    
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: #f9fafb;">
                                    <th style="padding: 15px 20px; text-align: left; font-size: 13px; font-weight: 600; color: #4b5563; border-bottom: 2px solid #e5e7eb;">Título</th>
                                    <th style="padding: 15px 20px; text-align: left; font-size: 13px; font-weight: 600; color: #4b5563; border-bottom: 2px solid #e5e7eb;">Professor</th>
                                    <th style="padding: 15px 20px; text-align: left; font-size: 13px; font-weight: 600; color: #4b5563; border-bottom: 2px solid #e5e7eb;">Turma</th>
                                    <th style="padding: 15px 20px; text-align: left; font-size: 13px; font-weight: 600; color: #4b5563; border-bottom: 2px solid #e5e7eb;">Tipo</th>
                                    <th style="padding: 15px 20px; text-align: left; font-size: 13px; font-weight: 600; color: #4b5563; border-bottom: 2px solid #e5e7eb;">Status</th>
                                    <th style="padding: 15px 20px; text-align: left; font-size: 13px; font-weight: 600; color: #4b5563; border-bottom: 2px solid #e5e7eb;">Questões</th>
                                    <th style="padding: 15px 20px; text-align: left; font-size: 13px; font-weight: 600; color: #4b5563; border-bottom: 2px solid #e5e7eb;">Ações</th>
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
                .provas-container { padding: 24px; max-width: 1400px; margin: 0 auto; }
                .provas-header {
                    background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
                    border-radius: 20px;
                    padding: 30px;
                    margin-bottom: 30px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-wrap: wrap;
                    gap: 20px;
                    box-shadow: 0 10px 30px rgba(30, 58, 138, 0.3);
                    color: white;
                }
                .header-left { display: flex; align-items: center; gap: 20px; }
                .header-icon {
                    width: 70px; height: 70px;
                    background: rgba(255,255,255,0.15);
                    border-radius: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 32px;
                    color: white;
                    backdrop-filter: blur(10px);
                    border: 1px solid rgba(255,255,255,0.2);
                }
                .header-text h1 { color: white; font-size: 28px; font-weight: 600; margin: 0 0 5px; }
                .header-text p { color: rgba(255,255,255,0.9); font-size: 14px; margin: 0; }
                .header-actions { display: flex; gap: 10px; flex-wrap: wrap; }
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(4, 1fr);
                    gap: 20px;
                    margin-bottom: 30px;
                }
                .stat-card {
                    background: white;
                    border-radius: 16px;
                    padding: 20px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                    display: flex;
                    align-items: center;
                    gap: 20px;
                    cursor: pointer;
                    transition: all 0.3s;
                    border: 1px solid rgba(0,0,0,0.05);
                }
                .stat-card:hover { transform: translateY(-4px); box-shadow: 0 8px 16px rgba(0,0,0,0.1); }
                .stat-icon {
                    width: 60px; height: 60px;
                    border-radius: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                    color: white;
                }
                .stat-content { flex: 1; }
                .stat-label { display: block; font-size: 12px; color: #6b7280; margin-bottom: 4px; }
                .stat-value { display: block; font-size: 28px; font-weight: 700; color: #1f2937; line-height: 1.2; }
                .filters-card {
                    background: white;
                    border-radius: 16px;
                    padding: 20px;
                    margin-bottom: 30px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                }
                .filters-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 15px;
                    border-bottom: 2px solid #f0f0f0;
                }
                .filters-title { display: flex; align-items: center; gap: 10px; }
                .filters-title i { font-size: 18px; color: #1e3a8a; background: #e0e7ff; padding: 8px; border-radius: 10px; }
                .filters-title h3 { margin: 0; font-size: 16px; color: #374151; }
                .filters-badge { background: #1e3a8a; color: white; padding: 4px 12px; border-radius: 30px; font-size: 12px; font-weight: 600; }
                .filters-grid {
                    display: grid;
                    grid-template-columns: 2fr 1fr 1fr auto;
                    gap: 15px;
                }
                .filter-group { display: flex; flex-direction: column; gap: 5px; }
                .filter-group label { font-size: 12px; font-weight: 600; color: #4b5563; display: flex; align-items: center; gap: 5px; }
                .filter-actions { display: flex; gap: 10px; align-items: flex-end; }
                .table-professional {
                    background: white;
                    border-radius: 16px;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                    overflow: hidden;
                    border: 1px solid rgba(0,0,0,0.05);
                }
                .table-header {
                    padding: 16px 20px;
                    background: #f9fafb;
                    border-bottom: 1px solid #e5e7eb;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
                .table-title { display: flex; align-items: center; gap: 10px; }
                .table-title i { color: #1e3a8a; font-size: 16px; }
                .table-title h3 { margin: 0; font-size: 15px; color: #374151; }
                .table-info { font-size: 13px; color: #6b7280; font-weight: 500; }
                .status-badge {
                    display: inline-block;
                    padding: 4px 10px;
                    border-radius: 30px;
                    font-size: 11px;
                    font-weight: 600;
                }
                .status-badge.active { background: #d1fae5; color: #065f46; }
                .status-badge.pending { background: #fef3c7; color: #92400e; }
                .status-badge.inactive { background: #fee2e2; color: #991b1b; }
                .status-badge.primary { background: #e0e7ff; color: #1e40af; }
                .status-badge.info { background: #cff4fc; color: #055160; }
                .status-badge.warning { background: #fff3cd; color: #856404; }
                
                .empty-state {
                    text-align: center;
                    padding: 60px 20px;
                    color: #6b7280;
                }
                .empty-state i {
                    font-size: 64px;
                    color: #d1d5db;
                    margin-bottom: 15px;
                    display: block;
                }
                
                @media (max-width: 1024px) {
                    .stats-grid { grid-template-columns: repeat(2, 1fr); }
                    .filters-grid { grid-template-columns: 1fr; }
                }
                @media (max-width: 768px) {
                    .stats-grid { grid-template-columns: 1fr; }
                    .provas-header { flex-direction: column; align-items: flex-start; }
                    .header-actions { width: 100%; }
                }
            </style>
        `;
    }

        // ============================================================================
    // 🔥 MÉTODOS AUXILIARES DE CRIAÇÃO DE PROVA
    // ============================================================================

    // ============ CARREGAR PROFESSORES PARA O SELECT ============
    async carregarProfessoresParaSelect() {
        console.log('👨‍🏫 Carregando professores para o select...');
        
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/admin/usuarios?role=professor&limit=100', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            if (data.success) {
                this.professoresParaSelect = data.usuarios || [];
                console.log(`✅ ${this.professoresParaSelect.length} professores carregados`);
            } else {
                this.professoresParaSelect = [];
                console.warn('⚠️ Nenhum professor retornado pela API');
            }
        } catch (error) {
            console.error('❌ Erro ao carregar professores:', error);
            this.professoresParaSelect = [];
        }
    }

    // ============ CARREGAR TURMAS PARA O SELECT ============
    async carregarTurmasParaSelect() {
        console.log('📚 Carregando turmas para o select...');
        
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/admin/turmas?limit=100', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            if (data.success) {
                // Guardar em variável específica para não sobrescrever this.turmas
                this.turmasParaSelect = data.turmas || [];
                console.log(`✅ ${this.turmasParaSelect.length} turmas carregadas`);
            } else {
                this.turmasParaSelect = [];
                console.warn('⚠️ Nenhuma turma retornada pela API');
            }
        } catch (error) {
            console.error('❌ Erro ao carregar turmas:', error);
            this.turmasParaSelect = [];
        }
    }

    // ============ PREENCHER SELECT DE PROFESSORES ============
    preencherSelectProfessores() {
        const select = document.getElementById('professorProvaSimples');
        if (!select) {
            console.warn('⚠️ Select professorProvaSimples não encontrado');
            return;
        }

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

        console.log(`✅ ${this.professoresParaSelect.length} professores adicionados ao select`);
    }

    // ============ PREENCHER SELECT DE TURMAS ============
    preencherSelectTurmas() {
        const select = document.getElementById('turmaProvaSimples');
        if (!select) {
            console.warn('⚠️ Select turmaProvaSimples não encontrado');
            return;
        }

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

        console.log(`✅ ${this.turmasParaSelect.length} turmas adicionadas ao select`);
    }

    // ============ CALCULAR DURAÇÃO DA PROVA ============
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
            duracaoEl.innerHTML = '<span style="color: #ef4444;">⚠️ Horário inválido</span>';
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

    // ============ MUDAR TIPO DE PROVA ============
    mudarTipoProvaSimples() {
        const tipo = document.getElementById('tipoProvaSimples')?.value;

        if (tipo === 'adaptada') {
            this.showToast('♿ Modo Prova Adaptada ativado! 3 alternativas por questão.', 'info');
        } else if (tipo === 'enem') {
            this.showToast('🎯 Modo ENEM ativado!', 'info');
        }
    }

    // ============ FECHAR FORMULÁRIO DE CRIAÇÃO ============
    fecharFormCriarProva() {
        console.log('❌ Fechando formulário de criação de prova');
        
        const container = document.getElementById('formCriarProvaContainer');
        if (container) {
            container.style.display = 'none';
            container.innerHTML = '';
        }
        this.provaGeradaSimples = null;
    }

    // ============ MOSTRAR PREVIEW DA PROVA GERADA ============
    mostrarPreviewProvaSimples(questoes) {
        console.log(`👁️ Mostrando preview de ${questoes.length} questões`);
        
        const container = document.getElementById('formCriarProvaContainer');
        if (!container) return;

        if (!questoes || questoes.length === 0) {
            container.innerHTML += `
                <div style="padding: 20px; background: #fef3c7; border-radius: 12px; margin-top: 20px; text-align: center;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 32px; color: #f59e0b; margin-bottom: 10px;"></i>
                    <p style="color: #92400e;">Nenhuma questão foi gerada. Tente novamente.</p>
                </div>
            `;
            return;
        }

        let questoesHTML = '';

        questoes.forEach((q, index) => {
            const tipo = q.tipo === 'enem' ? 'ENEM' : (q.tipo === 'adaptada' ? 'ADAPTADA' : 'SIMPLES');
            const tipoCor = q.tipo === 'enem' ? '#0891b2' : (q.tipo === 'adaptada' ? '#f59e0b' : '#4f46e5');
            const tipoBg = q.tipo === 'enem' ? '#cffafe' : (q.tipo === 'adaptada' ? '#fef3c7' : '#e0e7ff');
            const tipoTextoCor = q.tipo === 'enem' ? '#055160' : (q.tipo === 'adaptada' ? '#856404' : '#1e40af');
            
            const respostaCorreta = q.respostaCorreta !== undefined ? q.respostaCorreta : 0;
            const opcoes = q.opcoes || [];

            questoesHTML += `
                <div style="margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #10b981;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <span style="background: #10b981; color: white; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600;">
                            Questão ${index + 1}
                        </span>
                        <span style="padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; background: ${tipoBg}; color: ${tipoTextoCor};">
                            ${tipo}
                        </span>
                    </div>
                    <div style="margin-bottom: 10px; font-weight: 500; color: #1f2937; font-size: 0.95rem;">
                        ${q.pergunta || q.enunciado || 'Pergunta não disponível'}
                    </div>
                    <div style="margin-left: 15px;">
                        ${opcoes.map((opcao, idx) => {
                            const letra = String.fromCharCode(65 + idx);
                            const isCorreta = idx === respostaCorreta;
                            return `
                                <div style="padding: 5px 8px; margin-bottom: 4px; border-radius: 4px; ${isCorreta ? 'background: #d1fae5; font-weight: 600; color: #065f46;' : 'color: #4b5563;'}">
                                    <strong>${letra})</strong> ${opcao} ${isCorreta ? ' ✓' : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                    ${q.explicacao ? `
                        <div style="margin-top: 10px; padding: 10px; background: #f0f9ff; border-radius: 6px; font-size: 0.85rem; color: #0369a1;">
                            <i class="fas fa-lightbulb" style="margin-right: 5px;"></i> <strong>Explicação:</strong> ${q.explicacao}
                        </div>
                    ` : ''}
                </div>
            `;
        });

        // Adicionar o preview ao final do container
        container.insertAdjacentHTML('beforeend', `
            <div style="margin-top: 20px; padding: 20px; background: white; border-radius: 16px; border: 2px solid #10b981; box-shadow: 0 4px 12px rgba(16,185,129,0.15);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #f0f0f0;">
                    <h3 style="margin: 0; display: flex; align-items: center; gap: 8px; color: #1f2937;">
                        <i class="fas fa-eye" style="color: #10b981;"></i> Pré-visualização da Prova
                    </h3>
                    <span style="background: #10b981; color: white; padding: 5px 15px; border-radius: 30px; font-weight: 600; font-size: 14px;">
                        ${questoes.length} ${questoes.length === 1 ? 'questão' : 'questões'}
                    </span>
                </div>
                
                <div style="max-height: 60vh; overflow-y: auto; padding-right: 10px;">
                    ${questoesHTML}
                </div>
                
                <div style="display: flex; gap: 10px; margin-top: 20px; padding-top: 20px; border-top: 2px solid #f0f0f0;">
                    <button onclick="adminSimples.publicarProvaSimples()" 
                        style="flex: 1; padding: 12px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
                        <i class="fas fa-paper-plane"></i> Publicar Prova
                    </button>
                    <button onclick="adminSimples.regenerarProvaSimples()" 
                        style="flex: 1; padding: 12px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
                        <i class="fas fa-redo"></i> Regenerar
                    </button>
                    <button onclick="adminSimples.fecharPreviewSimples()" 
                        style="padding: 12px 20px; background: #6b7280; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px;">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>
            </div>
        `);

        // Scroll até o preview
        setTimeout(() => {
            const preview = container.lastElementChild;
            if (preview) {
                preview.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 200);
    }

    // ============ PUBLICAR PROVA SIMPLES ============
    async publicarProvaSimples() {
        if (!this.provaGeradaSimples || !this.provaGeradaSimples.id) {
            this.showToast('❌ Nenhuma prova para publicar', 'error');
            return;
        }

        try {
            this.showToast('📢 Publicando prova...', 'info');
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
                this.showToast('✅ Prova publicada com sucesso!', 'success');
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

    // ============ REGENERAR PROVA SIMPLES ============
    async regenerarProvaSimples() {
        if (!this.provaGeradaSimples) {
            this.showToast('❌ Nenhuma prova para regenerar', 'error');
            return;
        }

        this.showToast('🔄 Regenerando prova...', 'info');
        await this.gerarProvaSimples();
    }

    // ============ FECHAR PREVIEW ============
    fecharPreviewSimples() {
        const container = document.getElementById('formCriarProvaContainer');
        if (container) {
            // Remove apenas o preview (último filho), mantém o formulário
            const previews = container.querySelectorAll('div[style*="border: 2px solid rgb(16, 185, 129)"], div[style*="border: 2px solid #10b981"]');
            previews.forEach(preview => preview.remove());
        }
        this.provaGeradaSimples = null;
    }

    // ============ EXTRAIR PROFESSORES DAS PROVAS ============
    extrairProfessores(provas) {
        const professores = new Map();

        (provas || []).forEach(p => {
            if (p.professor) {
                if (typeof p.professor === 'object') {
                    const id = p.professor.id || p.professor._id;
                    const nome = p.professor.nome;
                    if (id && nome) {
                        professores.set(id, { id, nome });
                    }
                } else if (typeof p.professor === 'string' && p.professor !== '-') {
                    professores.set(p.professor, { id: p.professor, nome: p.professor });
                }
            }
        });

        return Array.from(professores.values());
    }

    // ============ CARREGAR USUÁRIOS PARA NOTIFICAÇÃO ============
    async carregarUsuariosParaNotificacao() {
        console.log('📢 Carregando usuários para notificação...');
        
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/admin/usuarios?limit=2000', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            if (data.success && data.usuarios) {
                this.usuariosParaNotificacao = data.usuarios;
                this.usuariosSelecionados = this.usuariosSelecionados || new Set();
                this.renderizarListaUsuariosNotificacao();
                console.log(`✅ ${this.usuariosParaNotificacao.length} usuários carregados para notificação`);
            } else {
                throw new Error(data.error || 'Erro ao carregar usuários');
            }
        } catch (error) {
            console.error('❌ Erro ao carregar usuários para notificação:', error);
            const container = document.getElementById('listaUsuariosNotificacao');
            if (container) {
                container.innerHTML = `
                    <p style="text-align: center; color: #dc3545; padding: 20px;">
                        ❌ Erro ao carregar usuários: ${error.message}
                    </p>
                `;
            }
        }
    }
        // ============================================================================
    // 🔥 MÉTODOS DE CRIAÇÃO DE PROVA COM IA
    // ============================================================================

    // ============ MOSTRAR FORMULÁRIO DE CRIAÇÃO DE PROVA ============
    mostrarFormCriarProva() {
        console.log('📝 Abrindo formulário de criação de prova...');
        
        const container = document.getElementById('formCriarProvaContainer');
        if (!container) {
            console.error('❌ Container formCriarProvaContainer não encontrado');
            this.showToast('❌ Erro: container do formulário não encontrado', 'error');
            return;
        }

        // Carregar dados necessários
        this.carregarProfessoresParaSelect();
        this.carregarTurmasParaSelect();

        container.innerHTML = `
            <div class="form-criar-prova" style="background: white; border-radius: 16px; padding: 25px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 2px solid #1e3a8a; margin-bottom: 30px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-magic" style="color: #1e3a8a;"></i>
                        Criar Nova Prova com IA
                    </h3>
                    <button onclick="adminSimples.fecharFormCriarProva()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #6b7280;">&times;</button>
                </div>
                
                <form id="formNovaProvaSimples" onsubmit="event.preventDefault(); adminSimples.gerarProvaSimples();">
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                        <div style="grid-column: span 2;">
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">
                                <i class="fas fa-lightbulb"></i> Tema da Prova
                            </label>
                            <textarea id="temaProvaSimples" rows="2" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px; font-family: inherit;" 
                                placeholder="Ex: Equações do 2º grau, Segunda Guerra Mundial, Fotossíntese..." required></textarea>
                        </div>
                        
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Título</label>
                            <input type="text" id="tituloProvaSimples" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;" 
                                placeholder="Ex: Prova Bimestral" required>
                        </div>
                        
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Período</label>
                            <select id="periodoProvaSimples" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;" required>
                                <option value="">Selecione...</option>
                                <option value="1">1º Período</option>
                                <option value="2">2º Período</option>
                                <option value="3">3º Período</option>
                                <option value="4">4º Período</option>
                            </select>
                        </div>
                        
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Professor</label>
                            <select id="professorProvaSimples" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;" required>
                                <option value="">Carregando...</option>
                            </select>
                        </div>
                        
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Turma</label>
                            <select id="turmaProvaSimples" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;" required>
                                <option value="">Carregando...</option>
                            </select>
                        </div>
                        
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Tipo</label>
                            <select id="tipoProvaSimples" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;" 
                                    onchange="adminSimples.mudarTipoProvaSimples()">
                                <option value="simples">📝 Simples (5 alternativas)</option>
                                <option value="enem">🎯 Formato ENEM</option>
                                <option value="adaptada">♿ Adaptada (3 alternativas)</option>
                            </select>
                        </div>
                        
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Questões</label>
                            <select id="quantidadeSimples" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                                <option value="5">5 questões</option>
                                <option value="10" selected>10 questões</option>
                                <option value="15">15 questões</option>
                                <option value="20">20 questões</option>
                                <option value="25">25 questões</option>
                                <option value="30">30 questões</option>
                            </select>
                        </div>
                        
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Dificuldade</label>
                            <select id="dificuldadeSimples" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                                <option value="facil">🟢 Fácil</option>
                                <option value="media" selected>🟡 Médio</option>
                                <option value="dificil">🔴 Difícil</option>
                            </select>
                        </div>
                        
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Data Limite</label>
                            <input type="date" id="dataLimiteSimples" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                        </div>
                        
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Início</label>
                            <input type="time" id="horarioInicioSimples" value="08:00" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;" required>
                        </div>
                        
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Término</label>
                            <input type="time" id="horarioTerminoSimples" value="09:30" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;" required>
                        </div>
                    </div>
                    
                    <div style="margin: 20px 0; padding: 15px; background: #f3f4f6; border-radius: 8px; text-align: center; font-weight: 600;" id="duracaoCalculadaSimples">
                        Calculando duração...
                    </div>
                    
                    <button type="submit" style="width: 100%; padding: 15px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 8px; font-weight: 600; font-size: 16px; cursor: pointer;">
                        <i class="fas fa-magic"></i> Gerar Prova com IA
                    </button>
                </form>
            </div>
        `;

        container.style.display = 'block';

        // Preencher selects após renderizar
        setTimeout(() => {
            this.preencherSelectProfessores();
            this.preencherSelectTurmas();
        }, 100);

        // Configurar cálculo de duração
        const inicio = document.getElementById('horarioInicioSimples');
        const termino = document.getElementById('horarioTerminoSimples');

        if (inicio && termino) {
            inicio.addEventListener('change', () => this.calcularDuracaoSimples());
            termino.addEventListener('change', () => this.calcularDuracaoSimples());
            this.calcularDuracaoSimples();
        }
    }

    // ============ GERAR PROVA COM IA ============
    async gerarProvaSimples() {
        console.log('🤖 Gerando prova com IA...');
        
        const btn = document.querySelector('#formNovaProvaSimples button[type="submit"]');
        if (!btn) {
            console.error('❌ Botão de submit não encontrado');
            return;
        }
        
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

            // Validações
            if (!professorId) {
                throw new Error('Selecione um professor');
            }
            if (!turmaId) {
                throw new Error('Selecione uma turma');
            }
            if (!periodo) {
                throw new Error('Selecione o período letivo');
            }
            if (!tema) {
                throw new Error('Digite o tema da prova');
            }

            // Construir data limite
            let dataLimite = null;
            const dataLimiteInput = document.getElementById('dataLimiteSimples')?.value;
            if (dataLimiteInput) {
                const [ano, mes, dia] = dataLimiteInput.split('-').map(Number);
                dataLimite = new Date(ano, mes - 1, dia, 23, 59, 59).toISOString();
            }

            const dadosBase = {
                professorId,
                turmaId,
                titulo,
                conteudo: tema,
                tipoProva,
                periodo,
                quantidadeQuestoes: quantidade,
                dificuldade,
                dataLimite,
                horarioInicio,
                horarioTermino
            };

            if (tipoProva === 'adaptada') {
                dadosBase.adaptada = true;
                dadosBase.alternativas = 3;
            }

            console.log('📤 Enviando dados:', dadosBase);

            const response = await fetch(`/api/turmas/${turmaId}/prova-v2`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dadosBase)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `Erro ${response.status}`);
            }

            if (data.success) {
                this.provaGeradaSimples = {
                    id: data.provaId,
                    ...data.prova,
                    questoes: data.questoes || []
                };

                this.showToast('✅ Prova gerada com sucesso!', 'success');
                this.mostrarPreviewProvaSimples(data.questoes || []);
            } else {
                throw new Error(data.error || 'Erro ao gerar prova');
            }

        } catch (error) {
            console.error('❌ Erro ao gerar prova:', error);
            this.showToast('❌ ' + error.message, 'error');
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    // ============================================================================
    // 🔥 MÉTODO DE RENDERIZAÇÃO DA LISTA DE USUÁRIOS (NOTIFICAÇÃO)
    // ============================================================================

    // ============ RENDERIZAR LISTA DE USUÁRIOS PARA NOTIFICAÇÃO ============
    renderizarListaUsuariosNotificacao() {
        const container = document.getElementById('listaUsuariosNotificacao');
        if (!container) {
            console.warn('⚠️ Container listaUsuariosNotificacao não encontrado');
            return;
        }

        let usuariosFiltrados = this.usuariosParaNotificacao || [];

        // Filtrar por termo de busca
        if (this.filtroAtualNotificacao) {
            const termo = this.filtroAtualNotificacao.toLowerCase();
            usuariosFiltrados = usuariosFiltrados.filter(u => 
                (u.nome && u.nome.toLowerCase().includes(termo)) ||
                (u.email && u.email.toLowerCase().includes(termo)) ||
                (u.matricula && u.matricula.includes(termo))
            );
        }

        // Filtrar por role (tipo de destinatário)
        if (this.tipoDestinatarioAtual && 
            this.tipoDestinatarioAtual !== 'selecionar' && 
            this.tipoDestinatarioAtual !== 'todos') {
            
            if (this.tipoDestinatarioAtual === 'admin') {
                usuariosFiltrados = usuariosFiltrados.filter(u => 
                    u.role === 'admin' || u.role === 'super_admin'
                );
            } else {
                usuariosFiltrados = usuariosFiltrados.filter(u => 
                    u.role === this.tipoDestinatarioAtual
                );
            }
        }

        if (usuariosFiltrados.length === 0) {
            container.innerHTML = `
                <p style="text-align: center; color: #6b7280; padding: 20px;">
                    <i class="fas fa-user-slash" style="font-size: 32px; display: block; margin-bottom: 10px; opacity: 0.5;"></i>
                    Nenhum usuário encontrado
                </p>
            `;
            return;
        }

        let html = '';
        usuariosFiltrados.forEach(usuario => {
            const selecionado = this.usuariosSelecionados?.has(usuario._id);
            const iniciais = (usuario.nome || 'U')
                .split(' ')
                .map(n => n[0])
                .join('')
                .substring(0, 2)
                .toUpperCase();

            // Cores por role
            let roleColor = '#6b7280';
            let roleBg = '#f3f4f6';
            let roleIcon = '👤';

            if (usuario.role === 'aluno') {
                roleColor = '#1e40af';
                roleBg = '#dbeafe';
                roleIcon = '👨‍🎓';
            } else if (usuario.role === 'professor') {
                roleColor = '#92400e';
                roleBg = '#fed7aa';
                roleIcon = '👨‍🏫';
            } else if (usuario.role === 'admin' || usuario.role === 'super_admin') {
                roleColor = '#991b1b';
                roleBg = '#fee2e2';
                roleIcon = '👑';
            } else if (usuario.role === 'setor_pedagogico') {
                roleColor = '#a855f7';
                roleBg = '#f3e8ff';
                roleIcon = '👩‍🏫';
            } else if (usuario.role === 'coordenacao_patio') {
                roleColor = '#d97706';
                roleBg = '#fef3c7';
                roleIcon = '🏃';
            } else if (usuario.role === 'cozinha') {
                roleColor = '#059669';
                roleBg = '#d1fae5';
                roleIcon = '🍽️';
            } else if (usuario.role === 'gestao_geral') {
                roleColor = '#1e3c72';
                roleBg = '#e0f2fe';
                roleIcon = '📊';
            } else if (usuario.role === 'enfermaria') {
                roleColor = '#0891b2';
                roleBg = '#cffafe';
                roleIcon = '🏥';
            } else if (usuario.role === 'supervisao') {
                roleColor = '#1e3a8a';
                roleBg = '#dbeafe';
                roleIcon = '🛡️';
            } else if (usuario.role === 'psicologia') {
                roleColor = '#0d9488';
                roleBg = '#ccfbf1';
                roleIcon = '🧠';
            } else if (usuario.role === 'assistente-social') {
                roleColor = '#7c3aed';
                roleBg = '#ede9fe';
                roleIcon = '🤝';
            } else if (usuario.role === 'protagonismo') {
                roleColor = '#ea580c';
                roleBg = '#ffedd5';
                roleIcon = '⭐';
            }

            html += `
                <div class="usuario-item" 
                    data-id="${usuario._id}" 
                    onclick="adminSimples.toggleSelecionarUsuario('${usuario._id}')" 
                    style="
                        display: flex;
                        align-items: center;
                        padding: 12px;
                        border-bottom: 1px solid #e5e7eb;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        border-radius: 6px;
                        margin-bottom: 4px;
                        ${selecionado ? 'background: #e0e7ff; border-left: 4px solid #4f46e5; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.1);' : ''}
                    "
                    onmouseover="this.style.background='${selecionado ? '#d1d5ff' : '#f3f4f6'}'; this.style.transform='translateX(4px)';"
                    onmouseout="this.style.background='${selecionado ? '#e0e7ff' : 'transparent'}'; this.style.transform='translateX(0)';"
                >
                    <div style="
                        width: 40px;
                        height: 40px;
                        border-radius: 50%;
                        background: linear-gradient(135deg, #4f46e5, #7c3aed);
                        color: white;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-weight: 600;
                        font-size: 1rem;
                        margin-right: 12px;
                        flex-shrink: 0;
                        box-shadow: 0 2px 4px rgba(79, 70, 229, 0.2);
                    ">
                        ${iniciais}
                    </div>
                    <div style="flex: 1;">
                        <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px; font-size: 0.95rem;">
                            ${usuario.nome || 'Sem nome'}
                        </div>
                        <div style="font-size: 0.8rem; color: #6b7280; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <i class="fas fa-envelope" style="font-size: 0.7rem; color: #9ca3af;"></i> ${usuario.email || 'Sem email'}
                            <span style="padding: 2px 8px; border-radius: 12px; font-size: 0.7rem; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; background: ${roleBg}; color: ${roleColor};">
                                ${roleIcon} ${usuario.role || 'desconhecido'}
                            </span>
                        </div>
                    </div>
                    <div style="width: 24px; text-align: center;">
                        ${selecionado 
                            ? '<i class="fas fa-check-circle" style="color: #10b981; font-size: 1.2rem;"></i>' 
                            : '<i class="far fa-circle" style="color: #9ca3af; font-size: 1.2rem;"></i>'
                        }
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

        // Atualizar contador de selecionados
        const contador = document.getElementById('usuariosSelecionadosCount');
        if (contador) {
            contador.innerHTML = `<strong>${this.usuariosSelecionados?.size || 0}</strong> usuários selecionados`;
        }
    }

        // ============================================================================
    // 🔥 MÉTODOS DE SELEÇÃO DE USUÁRIOS (NOTIFICAÇÃO)
    // ============================================================================

    // ============ MUDAR ABA DE DESTINATÁRIO ============
    mudarTabaDestinatario(tipo) {
        console.log(`🔄 Mudando aba de destinatário para: ${tipo}`);
        
        this.tipoDestinatarioAtual = tipo;

        // Atualizar estilo das abas
        document.querySelectorAll('.tab-destinatario').forEach(tab => {
            const tabTipo = tab.dataset.tipo;
            if (tabTipo === tipo) {
                tab.style.background = '#4f46e5';
                tab.style.color = 'white';
                tab.classList.add('active');
            } else {
                tab.style.background = '#e5e7eb';
                tab.style.color = '#4b5563';
                tab.classList.remove('active');
            }
        });

        // Mostrar/esconder área de seleção de usuários
        const areaSelecao = document.getElementById('areaSelecaoUsuarios');
        if (areaSelecao) {
            if (tipo === 'selecionar') {
                areaSelecao.style.display = 'block';
                this.usuariosSelecionados = new Set();
                this.renderizarListaUsuariosNotificacao();
            } else {
                areaSelecao.style.display = 'none';
            }
        }

        // Atualizar info de destinatários
        this.atualizarInfoDestinatarios();
    }

    // ============ TOGGLE SELECIONAR USUÁRIO ============
    toggleSelecionarUsuario(usuarioId) {
        if (!usuarioId) {
            console.warn('⚠️ ID de usuário inválido');
            return;
        }

        // Garantir que o Set existe
        if (!this.usuariosSelecionados) {
            this.usuariosSelecionados = new Set();
        }

        // Alternar seleção
        if (this.usuariosSelecionados.has(usuarioId)) {
            this.usuariosSelecionados.delete(usuarioId);
            console.log(`➖ Usuário desmarcado: ${usuarioId}`);
        } else {
            this.usuariosSelecionados.add(usuarioId);
            console.log(`➕ Usuário marcado: ${usuarioId}`);
        }

        // Re-renderizar lista
        this.renderizarListaUsuariosNotificacao();

        // Atualizar contador
        const contador = document.getElementById('usuariosSelecionadosCount');
        if (contador) {
            const total = this.usuariosSelecionados.size;
            contador.innerHTML = `<strong>${total}</strong> ${total === 1 ? 'usuário selecionado' : 'usuários selecionados'}`;
        }

        // Atualizar info de destinatários
        this.atualizarInfoDestinatarios();
    }

    // ============ SELECIONAR TODOS OS USUÁRIOS ============
    selecionarTodosUsuarios() {
        if (!this.usuariosParaNotificacao) {
            console.warn('⚠️ Nenhum usuário carregado');
            return;
        }

        // Inicializar Set
        this.usuariosSelecionados = new Set();

        // Filtrar usuários (respeitando o filtro de busca atual)
        let usuariosFiltrados = this.usuariosParaNotificacao;

        if (this.filtroAtualNotificacao) {
            const termo = this.filtroAtualNotificacao.toLowerCase();
            usuariosFiltrados = usuariosFiltrados.filter(u => 
                (u.nome && u.nome.toLowerCase().includes(termo)) ||
                (u.email && u.email.toLowerCase().includes(termo)) ||
                (u.matricula && u.matricula.includes(termo))
            );
        }

        // Adicionar todos os filtrados ao Set
        usuariosFiltrados.forEach(u => {
            this.usuariosSelecionados.add(u._id);
        });

        console.log(`✅ ${usuariosFiltrados.length} usuários selecionados`);

        // Re-renderizar lista
        this.renderizarListaUsuariosNotificacao();

        // Atualizar contador
        const contador = document.getElementById('usuariosSelecionadosCount');
        if (contador) {
            const total = this.usuariosSelecionados.size;
            contador.innerHTML = `<strong>${total}</strong> ${total === 1 ? 'usuário selecionado' : 'usuários selecionados'}`;
        }

        // Atualizar info de destinatários
        this.atualizarInfoDestinatarios();
    }

    // ============ FILTRAR USUÁRIOS NA NOTIFICAÇÃO ============
    filtrarUsuariosNotificacao() {
        const termo = document.getElementById('buscaUsuarioNotificacao')?.value || '';
        this.filtroAtualNotificacao = termo;
        
        console.log(`🔍 Filtrando usuários por: "${termo}"`);
        
        this.renderizarListaUsuariosNotificacao();
    }

    // ============ ATUALIZAR INFO DE DESTINATÁRIOS (AUXILIAR) ============
    atualizarInfoDestinatarios() {
        const infoEl = document.getElementById('infoDestinatariosNotificacao');
        if (!infoEl) return;

        let quantidade = 0;
        let textoAdicional = '';

        switch (this.tipoDestinatarioAtual) {
            case 'todos':
                quantidade = this.usuariosParaNotificacao?.length || 0;
                textoAdicional = 'Todos os usuários';
                break;
            case 'alunos':
                quantidade = (this.usuariosParaNotificacao || []).filter(u => u.role === 'aluno').length;
                textoAdicional = 'Apenas alunos';
                break;
            case 'professores':
                quantidade = (this.usuariosParaNotificacao || []).filter(u => u.role === 'professor').length;
                textoAdicional = 'Apenas professores';
                break;
            case 'admins':
                quantidade = (this.usuariosParaNotificacao || []).filter(u => 
                    u.role === 'admin' || u.role === 'super_admin'
                ).length;
                textoAdicional = 'Apenas administradores';
                break;
            case 'selecionar':
                quantidade = this.usuariosSelecionados?.size || 0;
                textoAdicional = quantidade === 1 ? 'Usuário selecionado' : 'Usuários selecionados';
                break;
            default:
                quantidade = this.usuariosParaNotificacao?.length || 0;
                textoAdicional = 'Todos os usuários';
        }

        infoEl.innerHTML = `
            <i class="fas fa-info-circle" style="font-size: 1.2rem; color: #4f46e5;"></i>
            <span style="font-size: 0.9rem; color: #1e40af;">
                <strong>${quantidade}</strong> ${quantidade === 1 ? 'usuário' : 'usuários'} ${textoAdicional.toLowerCase()}
            </span>
        `;
    }

    // ============================================================================
    // 📱 MÉTODOS DO MENU MOBILE
    // ============================================================================

    /**
     * Abre o menu lateral no mobile
     */
    abrirMenuLateral() {
        console.log('🍔 Abrindo menu lateral...');
        
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        
        if (!sidebar || !overlay) {
            console.warn('⚠️ Sidebar ou overlay não encontrados');
            return;
        }
        
        sidebar.classList.add('active');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    /**
     * Fecha o menu lateral
     */
    fecharMenuLateral() {
        console.log('🔚 Fechando menu lateral...');
        
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        
        if (sidebar) sidebar.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    /**
     * Atualiza o estado ativo da bottom navigation
     */
    updateBottomNav(section) {
        document.querySelectorAll('#bottomNavSimples .nav-item-bottom').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.section === section) {
                item.classList.add('active');
            }
        });
    }
}

// ============================================
// INICIALIZAÇÃO
// ============================================
const adminSimples = new AdminSimples();
window.adminSimples = adminSimples;

// ============================================
// FUNÇÃO PARA FECHAR MENU E VOLTAR
// ============================================
function fecharMenuEVoltar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.querySelector('.sidebar-overlay');

    if (sidebar) {
        sidebar.classList.remove('active');
    }

    if (overlay) {
        overlay.classList.remove('active');
    }

    document.body.style.overflow = '';

    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

// ============================================
// FUNÇÃO GLOBAL PARA FECHAR MODAL DE EDIÇÃO
// ============================================
function fecharModalEditarSimples() {
    const modal = document.getElementById('modalEditarProvaSimples');
    if (modal) {
        modal.style.display = 'none';
    }
}

// ============================================
// FUNÇÕES DE FORMATAÇÃO GLOBAIS
// ============================================
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
