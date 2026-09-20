// ============================================
// chatbot-frontend.js - Frontend do Chatbot (VERSÃO COMPLETA CORRIGIDA)
// ============================================

class SistemaProvasChatbot {
    constructor() {
        this.isOpen = false;
        this.isTyping = false;
        this.conversation = [];
        this.userData = this.getUserData();
        this.currentPage = this.detectCurrentPage();
        this.sessionId = this.generateSessionId();
        
        this.config = {
            maxMessageLength: 500,
            maxConversationHistory: 50,
            responseTimeout: 30000,
            autoCloseInactive: 600000
        };
        
        this.inactivityTimer = null;
        this.messageQueue = [];
        this.isProcessing = false;
        this.connectionStatus = 'online';
        this.hasNewMessages = false;
        
        this.init();
        this.setupEventListeners();
        this.loadConversation();
        this.networkMonitor();
        
        setTimeout(() => this.showWelcomeMessage(), 1000);
    }

    generateSessionId() {
        return 'chatbot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    getUserData() {
        try {
            const userData = localStorage.getItem('user_data');
            return userData ? JSON.parse(userData) : { role: 'guest' };
        } catch (error) {
            return { role: 'guest' };
        }
    }

    // ============================================
    // DETECTAR PERFIL - VERSÃO COMPLETA
    // ============================================
    detectCurrentPage() {
        const url = window.location.href.toLowerCase();
        const path = window.location.pathname.toLowerCase();
        
        // Função auxiliar para verificar múltiplos termos
        const urlMatch = (termos) => termos.some(t => url.includes(t) || path.includes(t));
        
        // ========== PERFIS ESPECÍFICOS ==========
        
        // GESTÃO GERAL
        if (urlMatch(['gestao-geral', 'gestao_geral', 'gestao geral', 'gestao-geral.html'])) {
            console.log('📍 Página GESTÃO GERAL detectada');
            return 'gestaoGeral';
        }
        
        // ENFERMARIA
        if (urlMatch(['enfermaria', 'enfermaria.html'])) {
            console.log('📍 Página ENFERMARIA detectada');
            return 'enfermaria';
        }
        
        // COZINHA
        if (urlMatch(['cozinha', 'cozinha.html', 'cozinha-dashboard', 'cozinha-dashboard.html'])) {
            console.log('📍 Página COZINHA detectada');
            return 'cozinha';
        }
        
        // COORDENAÇÃO DE PÁTIO
        if (urlMatch(['coordenacao-patio', 'coordenacao_patio', 'coordenacao patio', 'coordenacao-patio.html'])) {
            console.log('📍 Página COORDENAÇÃO DE PÁTIO detectada');
            return 'coordenacaoPatio';
        }
        
        // SETOR PEDAGÓGICO
        if (urlMatch(['setor-pedagogico', 'setor_pedagogico', 'setor pedagogico', 'setorpedagogico', 'setor-pedagogico.html'])) {
            console.log('📍 Página SETOR PEDAGÓGICO detectada');
            return 'setorPedagogico';
        }
        
        // ADMIN SIMPLES
        if (urlMatch(['admin-simples', 'admin_simples', 'adminsimples', 'admin-simples.html'])) {
            console.log('📍 Página ADMIN SIMPLES detectada');
            return 'adminSimples';
        }
        
        // SUPER ADMIN
        if (urlMatch(['admin.html', 'super-admin', 'super_admin', 'painel admin', 'superadmin'])) {
            console.log('📍 Página SUPER ADMIN detectada');
            return 'superAdmin';
        }
        
        // PROFESSOR
        if (urlMatch(['index.html', 'professor', 'dashboard', '/admin']) && 
            !urlMatch(['admin-simples', 'admin_simples', 'admin.html', 'super-admin', 'super_admin'])) {
            console.log('📍 Página PROFESSOR detectada');
            return 'professor';
        }
        
        // ALUNO
        if (urlMatch(['/aluno', 'aluno.html', 'capturar-face', 'validar-face', 'resultado-aluno', 
                      'editar-perfil', 'calendario', 'minhas-provas', 'meus-resultados'])) {
            console.log('📍 Página ALUNO detectada');
            return 'aluno';
        }
        
        // LOGIN
        if (urlMatch(['/login', 'login.html', '/register', '/cadastro', 'recuperar-senha', 'trocar-senha'])) {
            console.log('📍 Página LOGIN detectada');
            return 'login';
        }
        
        // ========== VERIFICAR PELOS DADOS DO USUÁRIO (FALLBACK) ==========
        try {
            const userData = localStorage.getItem('user_data');
            if (userData) {
                const user = JSON.parse(userData);
                const role = user.role;
                
                // Mapear role para página
                const roleMap = {
                    'gestao_geral': 'gestaoGeral',
                    'enfermaria': 'enfermaria',
                    'cozinha': 'cozinha',
                    'coordenacao_patio': 'coordenacaoPatio',
                    'setor_pedagogico': 'setorPedagogico',
                    'admin': 'adminSimples',
                    'super_admin': 'superAdmin',
                    'professor': 'professor',
                    'aluno': 'aluno'
                };
                
                if (roleMap[role]) {
                    console.log(`📍 Perfil detectado pelo user_data: ${role} → ${roleMap[role]}`);
                    return roleMap[role];
                }
            }
        } catch (e) {
            console.warn('⚠️ Erro ao ler user_data:', e);
        }
        
        // ========== FALLBACK: VERIFICAR PELA URL RAIZ ==========
        if (path === '/' || path === '') {
            const token = localStorage.getItem('auth_token');
            if (token) {
                console.log('📍 Página raiz com token - tentando buscar perfil...');
                // Tentar buscar perfil do usuário
                this.buscarPerfilDoUsuario();
                // Enquanto isso, retorna 'padrao'
                return 'padrao';
            }
        }
        
        console.log('📍 Nenhum perfil específico detectado - usando PADRÃO');
        return 'padrao';
    }

    // ============================================
    // BUSCAR PERFIL DO USUÁRIO (FALLBACK)
    // ============================================
    async buscarPerfilDoUsuario() {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return;
            
            const response = await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.user) {
                    const user = data.user;
                    localStorage.setItem('user_data', JSON.stringify(user));
                    
                    // Atualizar perfil
                    const roleMap = {
                        'gestao_geral': 'gestaoGeral',
                        'enfermaria': 'enfermaria',
                        'cozinha': 'cozinha',
                        'coordenacao_patio': 'coordenacaoPatio',
                        'setor_pedagogico': 'setorPedagogico',
                        'admin': 'adminSimples',
                        'super_admin': 'superAdmin',
                        'professor': 'professor',
                        'aluno': 'aluno'
                    };
                    
                    if (roleMap[user.role]) {
                        this.currentPage = roleMap[user.role];
                        console.log(`✅ Perfil atualizado via API: ${user.role} → ${this.currentPage}`);
                        this.updateQuickActions();
                        this.showWelcomeMessage();
                    }
                }
            }
        } catch (error) {
            console.error('❌ Erro ao buscar perfil:', error);
        }
    }

    // ============================================
    // OBTER SUGESTÕES POR PERFIL
    // ============================================
    obterSugestoesPorPerfil(perfil) {
        const sugestoes = {
            'aluno': [
                '📝 Ver provas pendentes',
                '✅ Ver provas concluídas',
                '📊 Ver resultados',
                '📅 Calendário de provas',
                '🔔 Notificações',
                '👤 Editar perfil'
            ],
            'professor': [
                '📝 Nova prova',
                '🏫 Nova turma',
                '📚 Minhas provas',
                '📊 Resultados',
                '📅 Meu calendário',
                '♿ Adaptar documento',
                '👤 Editar perfil'
            ],
            'adminSimples': [
                '📊 Dashboard',
                '👥 Usuários',
                '🏫 Turmas',
                '📝 Provas',
                '📚 Eixos',
                '🎓 Cursos',
                '📊 Resultados',
                '♿ Adaptar documento'
            ],
            'superAdmin': [
                '📊 Dashboard',
                '👥 Usuários',
                '🏫 Turmas',
                '📝 Provas',
                '🖥️ Monitoramento',
                '📊 Resultados',
                '📚 Eixos',
                '🎓 Cursos',
                '💾 Backups',
                '⚙️ Configurações'
            ],
            'setorPedagogico': [
                '📊 Dashboard',
                '👥 Alunos com Acessibilidade',
                '📝 Provas Adaptadas',
                '📊 Relatórios',
                '♿ Adaptar documento'
            ],
            'coordenacaoPatio': [
                '📊 Dashboard',
                '🍽️ Registrar Refeição',
                '👥 Alunos',
                '🏫 Turmas',
                '📊 Relatórios'
            ],
            'cozinha': [
                '📊 Dashboard',
                '📋 Planejar Refeições',
                '📊 Monitorar',
                '📦 Estoque',
                '📊 Relatórios',
                '⭐ Feedback alunos'
            ],
            'gestaoGeral': [
                '📊 Dashboard',
                '🔄 Rodízio de Refeições',
                '🏫 Turmas',
                '📊 Relatórios'
            ],
            'enfermaria': [
                '📊 Dashboard',
                '📋 Atendimentos',
                '👥 Alunos',
                '📊 Relatórios'
            ],
            'login': [
                '🔐 Login',
                '📝 Criar Conta',
                '🔑 Recuperar Senha'
            ],
            'padrao': [
                '📝 Provas',
                '🏫 Turmas',
                '📞 Suporte'
            ]
        };

        return sugestoes[perfil] || sugestoes['padrao'];
    }

    // ============================================
    // OBTER MENSAGEM DE BOAS-VINDAS
    // ============================================
    obterMensagemBoasVindas(perfil) {
        const mensagens = {
            'aluno': 'Olá! 👋 Sou seu assistente virtual do Sistema de Provas.\n\n📌 No painel do aluno você pode:\n• 📝 Ver provas pendentes e concluídas\n• 📊 Acompanhar seus resultados\n• 📅 Visualizar o calendário de provas\n• 🔔 Receber notificações\n• 👤 Editar seu perfil\n\nComo posso ajudá-lo hoje? 😊',
            
            'professor': 'Olá Professor(a)! 👋 Sou seu assistente virtual do Sistema de Provas.\n\n📌 No painel do professor você pode:\n• 📝 Criar novas provas com IA\n• 🏫 Gerenciar turmas e alunos\n• 📚 Acompanhar minhas provas\n• 📊 Visualizar resultados\n• ♿ Adaptar documentos para acessibilidade\n• 📅 Ver meu calendário\n\nComo posso ajudá-lo hoje? 😊',
            
            'adminSimples': 'Olá Administrador(a)! 👋 Sou seu assistente virtual do Sistema de Provas.\n\n📌 No painel administrativo você pode:\n• 📊 Acompanhar o dashboard\n• 👥 Gerenciar usuários\n• 🏫 Gerenciar turmas\n• 📝 Gerenciar provas\n• 📚 Gerenciar eixos\n• 🎓 Gerenciar cursos\n• 📊 Visualizar resultados\n• ♿ Adaptar documentos\n\nComo posso ajudá-lo hoje? 😊',
            
            'superAdmin': 'Olá Super Administrador(a)! 👑 Sou seu assistente virtual do Sistema de Provas.\n\n📌 No painel completo você pode:\n• 📊 Dashboard completo\n• 👥 Gerenciar todos os usuários\n• 🏫 Gerenciar turmas\n• 📝 Gerenciar provas\n• 🖥️ Monitorar violações\n• 📊 Resultados gerais\n• 📚 Gerenciar eixos\n• 🎓 Gerenciar cursos\n• 💾 Gerenciar backups\n• ⚙️ Configurações do sistema\n\nComo posso ajudá-lo hoje? 😊',
            
            'setorPedagogico': 'Olá! 👋 Sou seu assistente virtual do Setor Pedagógico.\n\n📌 No painel do Setor Pedagógico você pode:\n• 📊 Dashboard com visão geral\n• 👥 Gerenciar alunos com acessibilidade\n• 📝 Gerenciar provas adaptadas\n• 📊 Gerar relatórios\n• ♿ Adaptar documentos\n\nComo posso ajudá-lo hoje? 😊',
            
            'coordenacaoPatio': 'Olá! 👋 Sou seu assistente virtual da Coordenação de Pátio.\n\n📌 No painel você pode:\n• 📊 Dashboard do dia\n• 🍽️ Registrar refeições\n• 👥 Visualizar alunos\n• 🏫 Visualizar turmas\n• 📊 Gerar relatórios\n\nComo posso ajudá-lo hoje? 😊',
            
            'cozinha': 'Olá! 👋 Sou seu assistente virtual da Cozinha.\n\n📌 No painel da Cozinha você pode:\n• 📊 Dashboard com estatísticas\n• 📋 Planejar refeições\n• 📊 Monitorar produção\n• 📦 Gerenciar estoque\n• 📊 Gerar relatórios\n• ⭐ Ver feedback dos alunos\n\nComo posso ajudá-lo hoje? 😊',
            
            'gestaoGeral': 'Olá! 👋 Sou seu assistente virtual da Gestão Geral.\n\n📌 No painel da Gestão Geral você pode:\n• 📊 Dashboard do rodízio\n• 🔄 Gerenciar rodízio de refeições\n• 🏫 Visualizar turmas\n• 📊 Gerar relatórios\n\nComo posso ajudá-lo hoje? 😊',
            
            'enfermaria': 'Olá! 👋 Sou seu assistente virtual da Enfermaria.\n\n📌 No painel da Enfermaria você pode:\n• 📊 Dashboard com estatísticas\n• 📋 Registrar atendimentos\n• 👥 Visualizar alunos e histórico\n• 📊 Gerar relatórios\n\nComo posso ajudá-lo hoje? 😊',
            
            'login': 'Olá! 👋 Sou seu assistente virtual do Sistema de Provas.\n\n📌 Na página de login você pode:\n• 🔐 Fazer login com email e senha\n• 📝 Criar uma nova conta\n• 🔑 Recuperar sua senha\n\nComo posso ajudá-lo hoje? 😊',
            
            'padrao': 'Olá! 👋 Sou seu assistente virtual do Sistema de Provas.\n\nComo posso ajudá-lo hoje? 😊'
        };

        return mensagens[perfil] || mensagens['padrao'];
    }

    // ============================================
    // ATUALIZAR AÇÕES RÁPIDAS
    // ============================================
    updateQuickActions() {
        const actionsContainer = document.getElementById('chatbotActions');
        if (!actionsContainer) return;
        
        console.log(`🔄 Atualizando ações rápidas para o perfil: ${this.currentPage}`);
        
        // Usar o perfil atual
        const perfil = this.currentPage || this.detectCurrentPage() || 'padrao';
        
        // Se o perfil ainda não foi detectado, tentar buscar do usuário
        let perfilFinal = perfil;
        if (perfilFinal === 'padrao') {
            try {
                const userData = localStorage.getItem('user_data');
                if (userData) {
                    const user = JSON.parse(userData);
                    const roleMap = {
                        'gestao_geral': 'gestaoGeral',
                        'enfermaria': 'enfermaria',
                        'cozinha': 'cozinha',
                        'coordenacao_patio': 'coordenacaoPatio',
                        'setor_pedagogico': 'setorPedagogico',
                        'admin': 'adminSimples',
                        'super_admin': 'superAdmin',
                        'professor': 'professor',
                        'aluno': 'aluno'
                    };
                    if (roleMap[user.role]) {
                        perfilFinal = roleMap[user.role];
                        this.currentPage = perfilFinal;
                        console.log(`✅ Perfil atualizado do localStorage: ${user.role} → ${perfilFinal}`);
                    }
                }
            } catch (e) {}
        }
        
        console.log(`📋 Usando perfil: ${perfilFinal}`);
        
        const actions = this.obterSugestoesPorPerfil(perfilFinal);
        
        actionsContainer.innerHTML = actions.map(action => `
            <button class="chatbot-action-btn" onclick="window.chatbot.suggestAction('${action.replace(/'/g, "\\'")}')" ${this.connectionStatus === 'offline' ? 'disabled' : ''}>
                ${action}
            </button>
        `).join('');
        
        console.log(`✅ ${actions.length} ações rápidas exibidas para ${perfilFinal}`);
    }

    // ============================================
    // MENSAGEM DE BOAS-VINDAS
    // ============================================
    showWelcomeMessage() {
        const lastWelcome = localStorage.getItem('chatbot_last_welcome');
        const today = new Date().toDateString();
        if (lastWelcome === today) return;
        
        // Detectar perfil atual
        const perfil = this.currentPage || this.detectCurrentPage() || 'padrao';
        
        // Tentar obter do user_data se ainda for padrao
        let perfilFinal = perfil;
        if (perfilFinal === 'padrao') {
            try {
                const userData = localStorage.getItem('user_data');
                if (userData) {
                    const user = JSON.parse(userData);
                    const roleMap = {
                        'gestao_geral': 'gestaoGeral',
                        'enfermaria': 'enfermaria',
                        'cozinha': 'cozinha',
                        'coordenacao_patio': 'coordenacaoPatio',
                        'setor_pedagogico': 'setorPedagogico',
                        'admin': 'adminSimples',
                        'super_admin': 'superAdmin',
                        'professor': 'professor',
                        'aluno': 'aluno'
                    };
                    if (roleMap[user.role]) {
                        perfilFinal = roleMap[user.role];
                        this.currentPage = perfilFinal;
                        console.log(`✅ Perfil da boas-vindas: ${user.role} → ${perfilFinal}`);
                    }
                }
            } catch (e) {}
        }
        
        console.log(`👋 Exibindo boas-vindas para: ${perfilFinal}`);
        
        const mensagem = this.obterMensagemBoasVindas(perfilFinal);
        const sugestoes = this.obterSugestoesPorPerfil(perfilFinal);
        
        // Criar botões a partir das sugestões
        let botoesHTML = sugestoes.slice(0, 4).map(s => `
            <button onclick="window.chatbot.suggestAction('${s.replace(/'/g, "\\'")}')" 
                style="background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; padding: 3px 10px; font-size: 12px; cursor: pointer; margin: 2px;">
                ${s}
            </button>
        `).join('');
        
        const welcomeHTML = `
            <div class="message bot" style="background: white; border: 1px solid #e5e7eb; border-radius: 14px; padding: 14px;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span style="font-size: 22px;">👋</span>
                    <strong style="font-size: 15px;">Olá! Como posso ajudar?</strong>
                </div>
                <p style="color: #6b7280; font-size: 13px; margin: 0 0 10px 0; white-space: pre-wrap;">${mensagem}</p>
                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                    ${botoesHTML}
                </div>
                <div style="margin-top: 8px; font-size: 10px; color: #9ca3af; border-top: 1px solid #f3f4f6; padding-top: 6px;">
                    💡 Clique nos botões para perguntas rápidas
                </div>
            </div>
        `;
        
        const messagesContainer = document.getElementById('chatbotMessages');
        if (messagesContainer) {
            // Verificar se já tem mensagem de boas-vindas
            const existing = messagesContainer.querySelector('.message.bot .chatbot-welcome');
            if (!existing) {
                messagesContainer.insertAdjacentHTML('beforeend', welcomeHTML);
                localStorage.setItem('chatbot_last_welcome', today);
            }
        }
        
        // Atualizar ações rápidas
        this.updateQuickActions();
    }

    init() {
        if (!document.getElementById('chatbotContainer')) {
            this.createChatbotHTML();
        }
        this.addDynamicStyles();
        this.setupInactivityTimer();
        this.updateConnectionStatus();
    }

    createChatbotHTML() {
        const chatbotHTML = `
            <div class="chatbot-container" id="chatbotContainer">
                <div class="chatbot-window" id="chatbotWindow" role="dialog" aria-label="Assistente Virtual">
                    <div class="chatbot-header">
                        <div class="header-content">
                            <div class="header-brand">
                                <div class="chatbot-avatar">
                                    <i class="fas fa-graduation-cap"></i>
                                </div>
                                <div class="header-info">
                                    <h3>Assistente</h3>
                                    <p class="chatbot-subtitle">Sistema de Provas</p>
                                </div>
                            </div>
                            <div class="chatbot-status">
                                <div class="status-indicator">
                                    <span class="status-dot" id="statusDot"></span>
                                    <span class="status-text" id="statusText">Online</span>
                                </div>
                            </div>
                        </div>
                        <div class="header-controls">
                            <button class="chatbot-minimize" id="minimizeChatbot" aria-label="Minimizar" title="Minimizar">
                                <i class="fas fa-minus"></i>
                            </button>
                            <button class="chatbot-close" id="closeChatbot" aria-label="Fechar" title="Fechar">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                    <div class="chatbot-messages" id="chatbotMessages" role="log" aria-live="polite"></div>
                    <div class="chatbot-actions" id="chatbotActions" role="toolbar" aria-label="Ações rápidas"></div>
                    <div class="chatbot-input-area">
                        <div class="input-wrapper">
                            <textarea id="chatbotInput" rows="1" placeholder="${this.connectionStatus === 'offline' ? 'Conecte-se...' : 'Digite sua mensagem...'}" maxlength="${this.config.maxMessageLength}" ${this.connectionStatus === 'offline' ? 'disabled' : ''}></textarea>
                            <button id="sendMessage" class="send-button" aria-label="Enviar" ${this.connectionStatus === 'offline' ? 'disabled' : ''}>
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </div>
                        <div class="input-footer">
                            <span class="char-count" id="charCount">0/${this.config.maxMessageLength}</span>
                        </div>
                    </div>
                </div>
                <button class="chatbot-toggle" id="chatbotToggle" aria-label="Abrir assistente" title="Assistente Virtual">
                    <i class="fas fa-graduation-cap"></i>
                    <span class="notification-badge" id="notificationBadge" style="display:none;">1</span>
                </button>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', chatbotHTML);
    }

    addDynamicStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .chatbot-container {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 10000;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            .chatbot-toggle {
                width: 56px;
                height: 56px;
                background: linear-gradient(135deg, #1a56db 0%, #1e40af 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 24px;
                cursor: pointer;
                box-shadow: 0 4px 16px rgba(26, 86, 219, 0.35);
                transition: all 0.3s ease;
                border: none;
                outline: none;
                z-index: 10001;
                position: relative;
            }
            .chatbot-toggle:hover {
                transform: scale(1.05);
                box-shadow: 0 6px 24px rgba(26, 86, 219, 0.45);
            }
            .notification-badge {
                position: absolute;
                top: -4px;
                right: -4px;
                background: #ef4444;
                color: white;
                font-size: 11px;
                font-weight: 600;
                min-width: 20px;
                height: 20px;
                border-radius: 10px;
                display: none;
                align-items: center;
                justify-content: center;
                padding: 0 6px;
                border: 2px solid white;
            }
            .chatbot-window {
                position: absolute;
                bottom: 68px;
                right: 0;
                width: 360px;
                max-width: calc(100vw - 40px);
                height: 480px;
                max-height: 60vh;
                background: white;
                border-radius: 16px;
                box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
                display: none;
                flex-direction: column;
                overflow: hidden;
                border: 1px solid #e5e7eb;
            }
            .chatbot-window.active { display: flex; }
            .chatbot-header {
                background: linear-gradient(135deg, #1a56db 0%, #1e40af 100%);
                color: white;
                padding: 12px 16px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-shrink: 0;
                border-radius: 16px 16px 0 0;
            }
            .header-content {
                display: flex;
                align-items: center;
                gap: 10px;
                flex: 1;
            }
            .header-brand { display: flex; align-items: center; gap: 8px; }
            .chatbot-avatar {
                width: 32px;
                height: 32px;
                background: rgba(255,255,255,0.2);
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
            }
            .header-info h3 { margin: 0; font-size: 14px; font-weight: 600; line-height: 1.2; }
            .chatbot-subtitle { margin: 0; font-size: 10px; opacity: 0.8; }
            .chatbot-status { margin-left: auto; }
            .status-indicator {
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 10px;
                background: rgba(255,255,255,0.15);
                padding: 3px 8px;
                border-radius: 10px;
            }
            .status-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #10b981;
                animation: blink 2s infinite;
            }
            .header-controls {
                display: flex;
                gap: 4px;
                margin-left: 8px;
            }
            .chatbot-minimize, .chatbot-close {
                background: rgba(255,255,255,0.1);
                border: none;
                color: white;
                font-size: 12px;
                cursor: pointer;
                padding: 4px;
                border-radius: 6px;
                transition: all 0.2s ease;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .chatbot-minimize:hover, .chatbot-close:hover { background: rgba(255,255,255,0.2); }
            .chatbot-messages {
                flex: 1;
                padding: 16px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 10px;
                background: #f9fafb;
                scroll-behavior: smooth;
            }
            .message {
                max-width: 85%;
                padding: 8px 12px;
                border-radius: 12px;
                line-height: 1.4;
                word-wrap: break-word;
                animation: messageAppear 0.2s ease-out;
                font-size: 13px;
            }
            .message.bot {
                align-self: flex-start;
                background: white;
                color: #1f2937;
                border: 1px solid #e5e7eb;
                box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                border-radius: 12px 12px 12px 4px;
            }
            .message.user {
                align-self: flex-end;
                background: linear-gradient(135deg, #1a56db 0%, #1e40af 100%);
                color: white;
                border-radius: 12px 12px 4px 12px;
            }
            .message.system {
                align-self: center;
                background: #f3f4f6;
                color: #374151;
                font-size: 12px;
                padding: 6px 12px;
                border-radius: 8px;
                max-width: 90%;
                text-align: center;
                border: 1px solid #e5e7eb;
            }
            .message.error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
            .message.success { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
            .message.info { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
            .message.warning { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
            .message.loading {
                background: white;
                padding: 10px 14px;
                border: 1px solid #e5e7eb;
                border-radius: 12px 12px 12px 4px;
                display: flex;
                align-items: center;
                gap: 8px;
                width: fit-content;
            }
            .loading-dots { display: flex; gap: 4px; }
            .loading-dots span {
                width: 5px;
                height: 5px;
                border-radius: 50%;
                background: #1a56db;
                animation: bounce 1.4s infinite;
            }
            .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
            .loading-dots span:nth-child(3) { animation-delay: 0.4s; }
            .message-time {
                font-size: 9px;
                opacity: 0.5;
                margin-top: 3px;
                text-align: right;
                display: block;
            }
            .message.user .message-time { color: rgba(255,255,255,0.7); }
            .chatbot-input-area {
                padding: 12px 16px;
                border-top: 1px solid #e5e7eb;
                background: white;
                flex-shrink: 0;
            }
            .input-wrapper {
                display: flex;
                align-items: flex-end;
                gap: 8px;
                background: #f9fafb;
                border-radius: 12px;
                padding: 2px;
                border: 1px solid #e5e7eb;
                transition: all 0.3s ease;
            }
            .input-wrapper:focus-within {
                border-color: #1a56db;
                background: white;
                box-shadow: 0 0 0 2px rgba(26,86,219,0.1);
            }
            .chatbot-input-area textarea {
                flex: 1;
                padding: 8px 12px;
                border: none;
                background: transparent;
                font-size: 13px;
                line-height: 1.4;
                resize: none;
                max-height: 60px;
                outline: none;
                font-family: inherit;
            }
            .chatbot-input-area textarea:disabled { cursor: not-allowed; opacity: 0.5; }
            .send-button {
                width: 32px;
                height: 32px;
                border-radius: 8px;
                background: linear-gradient(135deg, #1a56db 0%, #1e40af 100%);
                color: white;
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
                flex-shrink: 0;
                font-size: 13px;
            }
            .send-button:hover:not(:disabled) { transform: scale(1.05); }
            .send-button:disabled { opacity: 0.5; cursor: not-allowed; background: #9ca3af; }
            .input-footer { display: flex; justify-content: flex-end; margin-top: 4px; padding: 0 4px; }
            .char-count { font-size: 10px; color: #6b7280; }
            .chatbot-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                padding: 8px 12px;
                border-top: 1px solid #e5e7eb;
                background: white;
                flex-shrink: 0;
            }
            .chatbot-action-btn {
                padding: 4px 10px;
                background: white;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                font-size: 11px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s ease;
                flex: 1;
                min-width: calc(50% - 2px);
                text-align: center;
                color: #4b5563;
                height: 28px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
            }
            .chatbot-action-btn:hover:not(:disabled) {
                background: #1a56db;
                color: white;
                border-color: #1a56db;
            }
            .chatbot-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
            @keyframes blink { 0%,50% { opacity: 1; } 51%,100% { opacity: 0.6; } }
            @keyframes bounce { 0%,60%,100% { transform: translateY(0); } 30% { transform: translateY(-4px); } }
            @keyframes messageAppear { from { opacity: 0; transform: translateY(4px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
            @media (max-width: 480px) {
                .chatbot-container { bottom: 16px; right: 16px; }
                .chatbot-window { width: calc(100vw - 32px); height: calc(100vh - 120px); max-height: none; bottom: 64px; border-radius: 16px; }
                .chatbot-header { padding: 10px 14px; }
                .chatbot-messages { padding: 12px; gap: 8px; }
                .chatbot-input-area { padding: 10px 14px; }
                .chatbot-actions { padding: 6px 10px; gap: 3px; }
                .chatbot-action-btn { font-size: 10px; height: 26px; padding: 3px 8px; }
                .message { font-size: 12px; padding: 6px 10px; }
            }
            .chatbot-messages::-webkit-scrollbar { width: 3px; }
            .chatbot-messages::-webkit-scrollbar-track { background: transparent; }
            .chatbot-messages::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 2px; }
            .chatbot-messages::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
        `;
        document.head.appendChild(style);
    }

    setupEventListeners() {
        document.getElementById('chatbotToggle').addEventListener('click', () => this.toggleChat());
        document.getElementById('closeChatbot').addEventListener('click', () => this.closeChat());
        document.getElementById('minimizeChatbot').addEventListener('click', () => this.minimizeChat());
        document.getElementById('sendMessage').addEventListener('click', () => this.sendMessage());
        
        const textarea = document.getElementById('chatbotInput');
        textarea.addEventListener('input', () => {
            this.adjustTextareaHeight(textarea);
            const count = textarea.value.length;
            document.getElementById('charCount').textContent = `${count}/${this.config.maxMessageLength}`;
        });
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) this.closeChat();
        });
    }

    adjustTextareaHeight(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 60) + 'px';
    }

    resetInactivityTimer() {
        if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
        if (this.isOpen) {
            this.inactivityTimer = setTimeout(() => {
                if (this.isOpen) {
                    this.closeChat();
                    this.addMessage('system', '💤 Chat pausado por inatividade.', 'info');
                }
            }, this.config.autoCloseInactive);
        }
    }

    networkMonitor() {
        window.addEventListener('online', () => {
            this.connectionStatus = 'online';
            this.updateConnectionStatus();
        });
        window.addEventListener('offline', () => {
            this.connectionStatus = 'offline';
            this.updateConnectionStatus();
        });
        setInterval(() => {
            if (navigator.onLine && this.connectionStatus !== 'online') {
                this.connectionStatus = 'online';
                this.updateConnectionStatus();
            }
        }, 5000);
    }

    updateConnectionStatus() {
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.querySelector('.status-text');
        if (statusDot && statusText) {
            if (this.connectionStatus === 'online') {
                statusDot.style.background = '#10b981';
                statusDot.style.boxShadow = '0 0 8px #10b981';
                statusText.textContent = 'Online';
                statusText.style.color = '#10b981';
            } else {
                statusDot.style.background = '#ef4444';
                statusDot.style.boxShadow = '0 0 8px #ef4444';
                statusText.textContent = 'Offline';
                statusText.style.color = '#ef4444';
            }
        }
    }

    setupInactivityTimer() {
        const resetTimer = () => {
            if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
            if (this.isOpen) {
                this.inactivityTimer = setTimeout(() => {
                    if (this.isOpen) {
                        this.closeChat();
                        this.addMessage('system', '💤 Chat pausado por inatividade.', 'info');
                    }
                }, this.config.autoCloseInactive);
            }
        };
        const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
        events.forEach(event => document.addEventListener(event, resetTimer, { passive: true }));
        resetTimer();
    }

    toggleChat() {
        this.isOpen = !this.isOpen;
        const windowElement = document.getElementById('chatbotWindow');
        if (this.isOpen) {
            windowElement.classList.add('active');
            document.getElementById('chatbotInput').focus();
            this.updateQuickActions();
            this.resetInactivityTimer();
            this.clearNotification();
        } else {
            windowElement.classList.remove('active');
            this.resetInactivityTimer();
        }
    }

    minimizeChat() {
        this.isOpen = false;
        document.getElementById('chatbotWindow').classList.remove('active');
    }

    closeChat() {
        this.isOpen = false;
        document.getElementById('chatbotWindow').classList.remove('active');
        if (this.inactivityTimer) clearTimeout(this.inactivityTimer);
    }

    addMessage(sender, content, type = 'normal') {
        if (!content || content.trim() === '') return;
        const messagesContainer = document.getElementById('chatbotMessages');
        if (!messagesContainer) return;
        
        const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        
        let messageClass = sender;
        if (type !== 'normal') messageClass = type;
        
        let contentLimpo = content;
        if (content.includes('<think>')) {
            contentLimpo = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
            if (!contentLimpo) contentLimpo = content;
        }
        
        const messageHTML = `
            <div class="message ${messageClass}" id="${messageId}" role="article">
                ${this.formatMessage(contentLimpo)}
                <span class="message-time">${time}</span>
            </div>
        `;
        messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
        
        this.conversation.push({ id: messageId, sender, content: contentLimpo, type, time, timestamp: Date.now() });
        this.saveConversation();
        
        setTimeout(() => {
            const element = document.getElementById(messageId);
            if (element) element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
        
        if (!this.isOpen && sender === 'bot') this.showNotification();
        return messageId;
    }

    formatMessage(content) {
        if (!content) return '';
        return content
            .replace(/[<>]/g, (m) => m === '<' ? '&lt;' : '&gt;')
            .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: #1a56db; text-decoration: underline;">$1</a>')
            .replace(/^\s*[-•]\s+(.*$)/gm, '<div style="display: flex; gap: 4px; margin: 2px 0;"><span>•</span><span>$1</span></div>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
    }

    showTypingIndicator() {
        if (this.isTyping) return;
        const messagesContainer = document.getElementById('chatbotMessages');
        if (!messagesContainer) return;
        
        const typingId = 'typing_' + Date.now();
        const typingHTML = `
            <div class="message bot loading" id="${typingId}">
                <div class="loading-dots"><span></span><span></span><span></span></div>
                <span style="font-size: 11px; color: #6b7280;">Digitando...</span>
            </div>
        `;
        messagesContainer.insertAdjacentHTML('beforeend', typingHTML);
        this.isTyping = true;
        this.typingIndicatorId = typingId;
        setTimeout(() => {
            const indicator = document.getElementById(typingId);
            if (indicator) indicator.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
    }

    hideTypingIndicator() {
        if (!this.isTyping || !this.typingIndicatorId) return;
        const indicator = document.getElementById(this.typingIndicatorId);
        if (indicator) indicator.remove();
        this.isTyping = false;
        this.typingIndicatorId = null;
    }

    showNotification() {
        const badge = document.getElementById('notificationBadge');
        if (!this.isOpen && badge) {
            badge.style.display = 'flex';
            badge.textContent = '1';
            this.hasNewMessages = true;
        }
    }

    clearNotification() {
        const badge = document.getElementById('notificationBadge');
        if (badge) { badge.style.display = 'none'; }
        this.hasNewMessages = false;
    }

    async sendMessage() {
        if (this.connectionStatus === 'offline') {
            this.addMessage('error', '⚠️ Você está offline. Conecte-se à internet.', 'warning');
            return;
        }

        const textarea = document.getElementById('chatbotInput');
        const message = textarea.value.trim();
        if (!message) { textarea.focus(); return; }
        if (message.length > this.config.maxMessageLength) {
            this.addMessage('error', `Mensagem muito longa (${message.length} caracteres). Limite: ${this.config.maxMessageLength}.`, 'error');
            return;
        }
        if (this.isTyping || this.isProcessing) {
            this.messageQueue.push(message);
            this.addMessage('system', 'Aguarde a resposta atual...', 'info');
            return;
        }
        
        this.addMessage('user', message);
        textarea.value = '';
        textarea.style.height = 'auto';
        document.getElementById('charCount').textContent = `0/${this.config.maxMessageLength}`;
        
        textarea.disabled = true;
        document.getElementById('sendMessage').disabled = true;
        this.isProcessing = true;
        
        try {
            this.showTypingIndicator();
            const response = await Promise.race([
                this.getBackendResponse(message),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), this.config.responseTimeout))
            ]);
            this.hideTypingIndicator();
            if (response) this.addMessage('bot', response);
        } catch (error) {
            console.error('❌ Erro no chatbot:', error);
            this.hideTypingIndicator();
            this.addMessage('bot', this.getFallbackMessage(), 'error');
        } finally {
            textarea.disabled = false;
            document.getElementById('sendMessage').disabled = false;
            this.isProcessing = false;
            textarea.focus();
            if (this.messageQueue.length > 0) {
                setTimeout(() => {
                    const nextMessage = this.messageQueue.shift();
                    textarea.value = nextMessage;
                    this.adjustTextareaHeight(textarea);
                    this.sendMessage();
                }, 1000);
            }
        }
    }

    getFallbackMessage() {
        return `Desculpe, estou com dificuldades técnicas.

📞 Entre em contato com o suporte:
Email: caua.veloso@iemasaoluiscentro.net
Telefone: (98) 98308-6504
Site: sistemadeprovas.com

🔄 Tente novamente em alguns instantes.`;
    }

    async getBackendResponse(userMessage) {
        const token = localStorage.getItem('auth_token');
        const endpoint = token ? '/api/chatbot/message' : '/api/chatbot/public/message';
        
        const url = window.location.href.toLowerCase();
        const path = window.location.pathname.toLowerCase();
        
        // DETECTAR PERFIL CORRETAMENTE
        let perfilDetectado = this.currentPage || 'padrao';
        
        // Se ainda for padrao, tentar detectar pela URL
        if (perfilDetectado === 'padrao') {
            const urlMatch = (termos) => termos.some(t => url.includes(t) || path.includes(t));
            
            if (urlMatch(['gestao-geral', 'gestao_geral', 'gestao geral', 'gestao-geral.html'])) perfilDetectado = 'gestaoGeral';
            else if (urlMatch(['enfermaria', 'enfermaria.html'])) perfilDetectado = 'enfermaria';
            else if (urlMatch(['cozinha', 'cozinha.html', 'cozinha-dashboard', 'cozinha-dashboard.html'])) perfilDetectado = 'cozinha';
            else if (urlMatch(['coordenacao-patio', 'coordenacao_patio', 'coordenacao patio', 'coordenacao-patio.html'])) perfilDetectado = 'coordenacaoPatio';
            else if (urlMatch(['setor-pedagogico', 'setor_pedagogico', 'setor pedagogico', 'setorpedagogico', 'setor-pedagogico.html'])) perfilDetectado = 'setorPedagogico';
            else if (urlMatch(['admin-simples', 'admin_simples', 'adminsimples', 'admin-simples.html'])) perfilDetectado = 'adminSimples';
            else if (urlMatch(['admin.html', 'super-admin', 'super_admin', 'painel admin', 'superadmin'])) perfilDetectado = 'superAdmin';
            else if (urlMatch(['index.html', 'professor', 'dashboard', '/admin']) && !urlMatch(['admin-simples', 'admin_simples', 'admin.html', 'super-admin', 'super_admin'])) perfilDetectado = 'professor';
            else if (urlMatch(['/aluno', 'aluno.html', 'capturar-face', 'validar-face', 'resultado-aluno', 'editar-perfil', 'calendario', 'minhas-provas', 'meus-resultados'])) perfilDetectado = 'aluno';
            else if (urlMatch(['/login', 'login.html', '/register', '/cadastro', 'recuperar-senha', 'trocar-senha'])) perfilDetectado = 'login';
        }
        
        // Se ainda for padrao, tentar pelo user_data
        if (perfilDetectado === 'padrao') {
            try {
                const userData = localStorage.getItem('user_data');
                if (userData) {
                    const user = JSON.parse(userData);
                    const roleMap = {
                        'gestao_geral': 'gestaoGeral',
                        'enfermaria': 'enfermaria',
                        'cozinha': 'cozinha',
                        'coordenacao_patio': 'coordenacaoPatio',
                        'setor_pedagogico': 'setorPedagogico',
                        'admin': 'adminSimples',
                        'super_admin': 'superAdmin',
                        'professor': 'professor',
                        'aluno': 'aluno'
                    };
                    if (roleMap[user.role]) {
                        perfilDetectado = roleMap[user.role];
                        this.currentPage = perfilDetectado;
                        console.log(`✅ Perfil detectado do user_data: ${user.role} → ${perfilDetectado}`);
                    }
                }
            } catch (e) {}
        }
        
        console.log(`📤 Enviando mensagem com perfil: ${perfilDetectado}`);
        
        const requestData = {
            sessionId: this.sessionId,
            message: userMessage,
            conversationHistory: this.conversation.slice(-5).map(msg => ({
                sender: msg.sender,
                content: msg.content,
                timestamp: msg.timestamp
            })),
            context: {
                currentPage: this.currentPage || perfilDetectado,
                currentPath: path,
                fullUrl: url,
                perfil: perfilDetectado,
                userRole: this.userData.role || 'guest',
                timestamp: new Date().toISOString()
            }
        };
        
        const headers = {
            'Content-Type': 'application/json',
            'X-Chatbot-Session': this.sessionId
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro ${response.status}: ${errorText || response.statusText}`);
        }
        
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Erro na resposta');
        return data.response;
    }

    suggestAction(actionText) {
        if (this.connectionStatus === 'offline') {
            this.addMessage('warning', '⚠️ Esta ação requer internet.', 'warning');
            return;
        }
        const textarea = document.getElementById('chatbotInput');
        textarea.value = actionText;
        this.adjustTextareaHeight(textarea);
        textarea.focus();
        setTimeout(() => this.sendMessage(), 200);
    }

    loadConversation() {
        try {
            const saved = localStorage.getItem('chatbot_conversation');
            if (saved) {
                const parsed = JSON.parse(saved);
                const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
                this.conversation = parsed.filter(msg => msg.timestamp && msg.timestamp > twentyFourHoursAgo);
                if (this.conversation.length > this.config.maxConversationHistory) {
                    this.conversation = this.conversation.slice(-this.config.maxConversationHistory);
                }
            }
        } catch (error) {
            console.error('❌ Erro ao carregar conversação:', error);
            this.conversation = [];
        }
    }

    saveConversation() {
        try {
            if (this.conversation.length > this.config.maxConversationHistory) {
                this.conversation = this.conversation.slice(-this.config.maxConversationHistory);
            }
            localStorage.setItem('chatbot_conversation', JSON.stringify(this.conversation));
        } catch (error) {
            console.error('❌ Erro ao salvar conversação:', error);
        }
    }

    async clearConversation() {
        const confirmar = await confirm('Limpar histórico da conversa?');
        if (confirmar) {
            this.conversation = [];
            localStorage.removeItem('chatbot_conversation');
            const messagesContainer = document.getElementById('chatbotMessages');
            if (messagesContainer) messagesContainer.innerHTML = '';
            this.addMessage('system', '🗑️ Histórico limpo.', 'info');
            setTimeout(() => this.showWelcomeMessage(), 500);
        }
    }

    debug() {
        console.group('🎓 Chatbot Debug');
        console.log('Session ID:', this.sessionId);
        console.log('Open:', this.isOpen);
        console.log('Processing:', this.isProcessing);
        console.log('Page:', this.currentPage);
        console.log('URL:', window.location.href);
        console.log('Role:', this.userData.role);
        console.log('Status:', this.connectionStatus);
        console.log('Messages:', this.conversation.length);
        console.groupEnd();
    }
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        try {
            if (!window.chatbot) {
                window.chatbot = new SistemaProvasChatbot();
                window.chatbotDebug = () => window.chatbot.debug();
                window.chatbotClear = () => window.chatbot.clearConversation();
                console.log('🎓 Chatbot inicializado!');
                console.log('💡 Comandos: chatbotDebug(), chatbotClear()');
            } else {
                console.log('🔄 Chatbot já inicializado, atualizando perfil...');
                window.chatbot.currentPage = window.chatbot.detectCurrentPage();
                window.chatbot.updateQuickActions();
            }
        } catch (error) {
            console.error('❌ Falha ao inicializar chatbot:', error);
        }
    }, 1000);
});

if (typeof module !== 'undefined' && module.exports) {
    module.exports = SistemaProvasChatbot;
} else {
    window.SistemaProvasChatbot = SistemaProvasChatbot;
}