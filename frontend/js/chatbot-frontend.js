// frontend/js/chatbot-frontend.js
class SistemaProvasChatbot {
    constructor() {
        this.isOpen = false;
        this.isTyping = false;
        this.conversation = [];
        this.userData = this.getUserData();
        this.currentPage = this.detectCurrentPage();
        this.sessionId = this.generateSessionId();
        
        // Configurações profissionais
        this.config = {
            maxMessageLength: 500,
            maxConversationHistory: 50,
            typingSpeed: 100,
            responseTimeout: 30000,
            autoCloseInactive: 600000,
            maxQuickActions: 4,
            analyticsEnabled: true,
            welcomeDisplayedToday: false,
            introductionDisplayed: false
        };
        
        this.inactivityTimer = null;
        this.messageQueue = [];
        this.isProcessing = false;
        this.connectionStatus = 'online';
        this.hasNewMessages = false;
        
        this.init();
        this.setupEventListeners();
        this.loadConversation();
        this.setupAnalytics();
        this.setupPerformanceMonitoring();
        this.networkMonitor();
        
        // Mostrar mensagem de boas-vindas após 2 segundos
        setTimeout(() => this.showWelcomeMessage(), 2000);
    }

    // ============ MÉTODOS AUXILIARES PROFISSIONAIS ============
    
    generateSessionId() {
        return 'chatbot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    
    setupAnalytics() {
        if (this.config.analyticsEnabled) {
            console.log('📊 Chatbot Analytics: Sessão iniciada', {
                sessionId: this.sessionId,
                userData: this.userData,
                currentPage: this.currentPage,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    setupPerformanceMonitoring() {
        this.responseTimes = [];
        window.addEventListener('beforeunload', () => {
            if (this.config.analyticsEnabled && this.responseTimes.length > 0) {
                const avgResponseTime = this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
                console.log('📊 Chatbot Performance:', {
                    sessionId: this.sessionId,
                    totalMessages: this.conversation.length,
                    avgResponseTime: avgResponseTime.toFixed(2) + 'ms',
                    userEngagement: this.calculateEngagementScore()
                });
            }
        });
    }
    
    calculateEngagementScore() {
        const userMessages = this.conversation.filter(msg => msg.sender === 'user').length;
        const botMessages = this.conversation.filter(msg => msg.sender === 'bot').length;
        return botMessages > 0 ? (userMessages / botMessages).toFixed(2) : 0;
    }
    
    getUserData() {
        try {
            const userData = localStorage.getItem('user_data');
            return userData ? JSON.parse(userData) : {
                role: 'guest',
                sessionStart: new Date().toISOString()
            };
        } catch (error) {
            console.error('❌ Erro ao carregar dados do usuário:', error);
            return {
                role: 'guest',
                sessionStart: new Date().toISOString(),
                error: 'parse_error'
            };
        }
    }

    detectCurrentPage() {
        const path = window.location.pathname.toLowerCase();
        const pageMap = {
            'index': 'professor',
            'professor': 'professor',
            'aluno': 'aluno',
            'login': 'login',
            'realizar-prova': 'prova',
            'cadastro': 'cadastro',
            'resultado': 'resultado',
            'dashboard': 'professor'
        };
        
        for (const [key, value] of Object.entries(pageMap)) {
            if (path.includes(key)) return value;
        }
        
        return 'home';
    }

    init() {
        if (!document.getElementById('chatbotContainer')) {
            this.createChatbotHTML();
        }
        
        this.addDynamicStyles();
        this.setupInactivityTimer();
        this.updateConnectionStatus();
    }

    networkMonitor() {
        window.addEventListener('online', () => {
            this.connectionStatus = 'online';
            this.updateConnectionStatus();
            if (!this.isOpen) {
                this.showConnectionMessage('✅ Conexão restaurada!', 'success');
            }
        });
        
        window.addEventListener('offline', () => {
            this.connectionStatus = 'offline';
            this.updateConnectionStatus();
            this.showConnectionMessage('⚠️ Você está offline. Algumas funcionalidades podem estar limitadas.', 'warning');
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

    showConnectionMessage(message, type = 'info') {
        this.addMessage('system', message, type);
        this.showNotification();
    }

    setupInactivityTimer() {
        const resetTimer = () => {
            if (this.inactivityTimer) {
                clearTimeout(this.inactivityTimer);
            }
            if (this.isOpen) {
                this.inactivityTimer = setTimeout(() => {
                    if (this.isOpen) {
                        this.closeChat();
                        this.sendSystemMessage(
                            "💤 Chat pausado por inatividade. " +
                            "Clique no botão para continuar nossa conversa!"
                        );
                    }
                }, this.config.autoCloseInactive);
            }
        };

        const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
        events.forEach(event => {
            document.addEventListener(event, resetTimer, { passive: true });
        });
        
        resetTimer();
    }

    createChatbotHTML() {
        const userName = this.userData.nome ? this.userData.nome.split(' ')[0] : '';
        
        const chatbotHTML = `
            <!-- Assistente Virtual Acadêmico -->
            <div class="chatbot-container" id="chatbotContainer">
                <!-- Janela do Chat -->
                <div class="chatbot-window" id="chatbotWindow" role="dialog" 
                    aria-label="Assistente Virtual do Sistema de Provas">
                    <div class="chatbot-header">
                        <div class="header-content">
                            <div class="header-brand">
                                <div class="chatbot-avatar">
                                    <i class="fas fa-robot"></i>
                                </div>
                                <div class="header-info">
                                    <h3 id="chatbotTitle">Assistente</h3>
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
                            <button class="chatbot-minimize" id="minimizeChatbot" 
                                    aria-label="Minimizar assistente" title="Minimizar">
                                <i class="fas fa-minus"></i>
                            </button>
                            <button class="chatbot-close" id="closeChatbot" 
                                    aria-label="Fechar assistente" title="Fechar">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Área de Mensagens -->
                    <div class="chatbot-messages" id="chatbotMessages" 
                        role="log" aria-live="polite" aria-label="Histórico da conversa">
                        <!-- Mensagens serão adicionadas aqui -->
                    </div>

                    <!-- Ações Rápidas -->
                    <div class="chatbot-actions" id="chatbotActions" 
                        role="toolbar" aria-label="Ações rápidas do assistente">
                        <!-- Botões de ação rápida serão adicionados aqui -->
                    </div>

                    <!-- Área de Entrada -->
                    <div class="chatbot-input-area">
                        <div class="input-wrapper">
                            <textarea 
                                id="chatbotInput" 
                                rows="1"
                                placeholder="${this.connectionStatus === 'offline' ? 'Conecte-se à internet...' : 'Digite sua mensagem...'}" 
                                maxlength="${this.config.maxMessageLength}"
                                aria-label="Campo de entrada de mensagem"
                                aria-describedby="charCount"
                                ${this.connectionStatus === 'offline' ? 'disabled' : ''}
                            ></textarea>
                            <div class="input-actions">
                                <button id="sendMessage" 
                                        class="send-button"
                                        aria-label="Enviar mensagem" 
                                        title="Enviar"
                                        ${this.connectionStatus === 'offline' ? 'disabled' : ''}>
                                    <i class="fas fa-paper-plane"></i>
                                </button>
                            </div>
                        </div>
                        <div class="input-footer">
                            <span class="char-count" id="charCount" aria-live="polite">
                                0/${this.config.maxMessageLength}
                            </span>
                            <span class="connection-status" id="connectionStatus">
                                ${this.connectionStatus === 'online' ? 
                                    '<i class="fas fa-circle" style="color: #10b981; font-size: 8px;"></i>' : 
                                    '<i class="fas fa-circle" style="color: #ef4444; font-size: 8px;"></i>'}
                            </span>
                        </div>
                    </div>
                </div>

                <!-- Botão Principal -->
                <button class="chatbot-toggle" id="chatbotToggle" 
                        aria-label="${this.isOpen ? 'Fechar assistente' : 'Abrir assistente'}"
                        title="Assistente Virtual">
                    <div class="toggle-icon">
                        <i class="fas fa-graduation-cap"></i>
                        ${this.hasNewMessages ? '<span class="notification-pulse"></span>' : ''}
                    </div>
                    ${this.hasNewMessages ? `
                        <span class="notification-badge" id="notificationBadge" aria-label="Nova mensagem">
                            <i class="fas fa-bell"></i>
                        </span>
                    ` : ''}
                </button>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', chatbotHTML);
    }

    addDynamicStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* ===== ESTILOS DINÂMICOS DO CHATBOT ===== */
            .chatbot-container {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 10000;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }

            .chatbot-toggle {
                width: 56px;
                height: 56px;
                background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
                border-radius: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 22px;
                cursor: pointer;
                box-shadow: 0 6px 20px rgba(79, 70, 229, 0.25);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
                border: none;
                outline: none;
                z-index: 10001;
            }

            .chatbot-toggle:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 25px rgba(79, 70, 229, 0.35);
            }

            .chatbot-toggle:active {
                transform: translateY(0);
            }

            .chatbot-toggle.active {
                background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
                transform: translateY(-2px);
            }

            .notification-badge {
                position: absolute;
                top: -4px;
                right: -4px;
                background: #ef4444;
                color: white;
                font-size: 10px;
                font-weight: 600;
                min-width: 18px;
                height: 18px;
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 4px;
                border: 2px solid white;
                display: none;
            }

            .chatbot-toggle.has-notification::after {
                content: '';
                position: absolute;
                top: 6px;
                right: 6px;
                width: 8px;
                height: 8px;
                background: #ef4444;
                border-radius: 50%;
                border: 2px solid white;
            }

            .chatbot-window {
                position: absolute;
                bottom: 68px;
                right: 0;
                width: 360px;
                max-width: calc(100vw - 40px);
                height: 500px;
                max-height: 65vh;
                background: white;
                border-radius: 16px;
                box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
                display: none;
                flex-direction: column;
                overflow: hidden;
                animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                border: 1px solid #e5e7eb;
            }

            .chatbot-window.active {
                display: flex;
            }

            .chatbot-header {
                background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
                color: white;
                padding: 16px 20px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-shrink: 0;
                border-radius: 16px 16px 0 0;
            }

            .header-content {
                display: flex;
                align-items: center;
                gap: 12px;
                flex: 1;
            }

            .header-brand {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .chatbot-avatar {
                width: 36px;
                height: 36px;
                background: rgba(255, 255, 255, 0.2);
                border-radius: 10px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
            }

            .header-info {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .chatbot-header h3 {
                margin: 0;
                font-size: 15px;
                font-weight: 600;
                line-height: 1.2;
            }

            .chatbot-subtitle {
                margin: 0;
                font-size: 11px;
                opacity: 0.9;
                font-weight: 400;
            }

            .chatbot-status {
                margin-left: auto;
            }

            .status-indicator {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 11px;
                font-weight: 500;
                background: rgba(255, 255, 255, 0.15);
                padding: 4px 8px;
                border-radius: 10px;
                backdrop-filter: blur(4px);
            }

            .status-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #10b981;
                box-shadow: 0 0 6px #10b981;
                animation: blink 2s infinite;
            }

            .header-controls {
                display: flex;
                gap: 4px;
                margin-left: 10px;
            }

            .chatbot-minimize,
            .chatbot-close {
                background: rgba(255, 255, 255, 0.1);
                border: none;
                color: white;
                font-size: 13px;
                cursor: pointer;
                padding: 5px;
                border-radius: 6px;
                transition: all 0.2s ease;
                width: 26px;
                height: 26px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .chatbot-minimize:hover,
            .chatbot-close:hover {
                background: rgba(255, 255, 255, 0.2);
                transform: translateY(-1px);
            }

            .chatbot-messages {
                flex: 1;
                padding: 20px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 14px;
                background: #f9fafb;
                scroll-behavior: smooth;
            }

            .message {
                max-width: 85%;
                padding: 10px 14px;
                border-radius: 16px;
                line-height: 1.4;
                word-wrap: break-word;
                animation: messageAppear 0.25s ease-out;
                position: relative;
                font-size: 13px;
            }

            .message.bot {
                align-self: flex-start;
                background: white;
                color: #1f2937;
                border: 1px solid #e5e7eb;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
                border-radius: 16px 16px 16px 4px;
            }

            .message.user {
                align-self: flex-end;
                background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
                color: white;
                box-shadow: 0 2px 8px rgba(79, 70, 229, 0.2);
                border-radius: 16px 16px 4px 16px;
            }

            .message.loading {
                background: white;
                padding: 14px;
                border: 1px solid #e5e7eb;
                border-radius: 16px 16px 16px 4px;
                display: flex;
                align-items: center;
                gap: 10px;
                width: fit-content;
            }

            .loading-dots {
                display: flex;
                gap: 4px;
            }

            .loading-dots span {
                width: 5px;
                height: 5px;
                border-radius: 50%;
                background: #4f46e5;
                animation: bounce 1.4s infinite;
            }

            .loading-dots span:nth-child(2) {
                animation-delay: 0.2s;
            }

            .loading-dots span:nth-child(3) {
                animation-delay: 0.4s;
            }

            .message-time {
                font-size: 10px;
                opacity: 0.6;
                margin-top: 4px;
                text-align: right;
                display: block;
                font-weight: 400;
            }

            .message.user .message-time {
                color: rgba(255, 255, 255, 0.8);
            }

            .chatbot-input-area {
                padding: 16px 20px;
                border-top: 1px solid #e5e7eb;
                background: white;
                flex-shrink: 0;
            }

            .input-wrapper {
                display: flex;
                align-items: flex-end;
                gap: 10px;
                background: #f9fafb;
                border-radius: 14px;
                padding: 3px;
                border: 1px solid #e5e7eb;
                transition: all 0.3s ease;
            }

            .input-wrapper:focus-within {
                border-color: #4f46e5;
                background: white;
                box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
            }

            .chatbot-input-area textarea {
                flex: 1;
                padding: 10px 14px;
                border: none;
                background: transparent;
                font-size: 13px;
                line-height: 1.4;
                resize: none;
                max-height: 80px;
                outline: none;
                font-family: inherit;
            }

            .chatbot-input-area textarea:disabled {
                cursor: not-allowed;
                opacity: 0.5;
            }

            .send-button {
                width: 36px;
                height: 36px;
                border-radius: 10px;
                background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
                color: white;
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
                flex-shrink: 0;
                font-size: 14px;
            }

            .send-button:hover:not(:disabled) {
                transform: translateY(-1px);
                box-shadow: 0 3px 8px rgba(79, 70, 229, 0.25);
            }

            .send-button:active:not(:disabled) {
                transform: translateY(0);
            }

            .send-button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                background: #9ca3af;
            }

            .input-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 6px;
                padding: 0 4px;
            }

            .char-count {
                font-size: 10px;
                color: #6b7280;
                font-weight: 400;
            }

            .connection-status {
                font-size: 10px;
                color: #6b7280;
                display: flex;
                align-items: center;
                gap: 4px;
                font-weight: 400;
            }

            .chatbot-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                padding: 12px 20px;
                border-top: 1px solid #e5e7eb;
                background: white;
                flex-shrink: 0;
            }

            .chatbot-action-btn {
                padding: 6px 12px;
                background: white;
                border: 1px solid #e5e7eb;
                border-radius: 10px;
                font-size: 12px;
                font-weight: 500;
                white-space: nowrap;
                cursor: pointer;
                transition: all 0.2s ease;
                flex: 1;
                min-width: calc(50% - 3px);
                text-align: center;
                color: #4b5563;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
            }

            .chatbot-action-btn:hover:not(:disabled) {
                background: #4f46e5;
                color: white;
                border-color: #4f46e5;
                transform: translateY(-1px);
                box-shadow: 0 2px 6px rgba(79, 70, 229, 0.2);
            }

            .chatbot-action-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            /* Tipos de mensagens */
            .message.system {
                align-self: center;
                background: #f3f4f6;
                color: #374151;
                border: 1px solid #e5e7eb;
                font-size: 12px;
                padding: 10px 14px;
                border-radius: 10px;
                max-width: 90%;
                text-align: center;
                font-weight: 400;
                width: 100%;
            }

            .message.error {
                background: #fef2f2;
                color: #dc2626;
                border: 1px solid #fecaca;
            }

            .message.success {
                background: #f0fdf4;
                color: #16a34a;
                border: 1px solid #bbf7d0;
            }

            .message.info {
                background: #eff6ff;
                color: #2563eb;
                border: 1px solid #bfdbfe;
            }

            .message.warning {
                background: #fffbeb;
                color: #d97706;
                border: 1px solid #fde68a;
            }

            /* Welcome message */
            .welcome-message {
                background: white !important;
                border: 1px solid #e5e7eb !important;
                border-radius: 14px !important;
                padding: 16px !important;
                margin-bottom: 12px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
            }

            /* Introduction message */
            .introduction-message {
                background: white !important;
                border: 1px solid #e5e7eb !important;
                border-radius: 14px !important;
                padding: 16px !important;
                margin-bottom: 12px;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
                border-left: 3px solid #4f46e5;
            }

            .welcome-header {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 12px;
                padding-bottom: 10px;
                border-bottom: 1px solid #f3f4f6;
            }

            .welcome-header h4 {
                margin: 0;
                color: #1f2937;
                font-size: 14px;
                font-weight: 600;
            }

            .assistance-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 6px;
                margin: 10px 0;
            }

            .assistance-item {
                display: flex;
                align-items: flex-start;
                gap: 10px;
                padding: 8px 10px;
                background: #f9fafb;
                border-radius: 8px;
                border: 1px solid #e5e7eb;
                transition: all 0.2s ease;
            }

            .assistance-icon {
                font-size: 14px;
                background: #f3f4f6;
                width: 28px;
                height: 28px;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                color: #4f46e5;
            }

            .assistance-content {
                flex: 1;
            }

            .assistance-content strong {
                display: block;
                color: #374151;
                font-size: 12px;
                font-weight: 500;
                margin-bottom: 2px;
            }

            .assistance-content p {
                margin: 0;
                color: #6b7280;
                font-size: 11px;
                line-height: 1.3;
                font-weight: 400;
            }

            .quick-suggestions {
                display: flex;
                flex-direction: column;
                gap: 6px;
                margin-top: 10px;
            }

            .suggestion-btn {
                background: white;
                border: 1px solid #e5e7eb;
                border-radius: 6px;
                padding: 8px 12px;
                font-size: 12px;
                color: #4b5563;
                text-align: left;
                cursor: pointer;
                transition: all 0.2s ease;
                font-weight: 400;
            }

            .assistant-status {
                display: flex;
                align-items: center;
                margin-top: 12px;
                padding-top: 12px;
                border-top: 1px solid #f3f4f6;
            }

            /* Animações */
            @keyframes slideUp {
                from { 
                    opacity: 0; 
                    transform: translateY(15px) scale(0.98); 
                }
                to { 
                    opacity: 1; 
                    transform: translateY(0) scale(1); 
                }
            }

            @keyframes messageAppear {
                from { 
                    opacity: 0; 
                    transform: translateY(6px) scale(0.96); 
                }
                to { 
                    opacity: 1; 
                    transform: translateY(0) scale(1); 
                }
            }

            @keyframes blink {
                0%, 50% { opacity: 1; }
                51%, 100% { opacity: 0.7; }
            }

            @keyframes bounce {
                0%, 60%, 100% { transform: translateY(0); }
                30% { transform: translateY(-3px); }
            }

            /* Modo responsivo */
            @media (max-width: 480px) {
                .chatbot-container {
                    bottom: 16px;
                    right: 16px;
                }

                .chatbot-window {
                    width: calc(100vw - 32px);
                    height: calc(100vh - 120px);
                    max-height: none;
                    bottom: 64px;
                    right: 16px;
                    border-radius: 16px;
                }

                .chatbot-header {
                    padding: 14px 16px;
                }

                .chatbot-messages {
                    padding: 16px;
                    gap: 12px;
                }

                .chatbot-input-area {
                    padding: 12px 16px;
                }

                .chatbot-actions {
                    padding: 10px 16px;
                    gap: 4px;
                }

                .chatbot-action-btn {
                    min-width: calc(50% - 2px);
                    font-size: 11px;
                    padding: 5px 8px;
                    height: 30px;
                }
            }

            /* Scrollbar personalizada */
            .chatbot-messages::-webkit-scrollbar {
                width: 4px;
            }

            .chatbot-messages::-webkit-scrollbar-track {
                background: transparent;
            }

            .chatbot-messages::-webkit-scrollbar-thumb {
                background: #d1d5db;
                border-radius: 2px;
            }

            .chatbot-messages::-webkit-scrollbar-thumb:hover {
                background: #9ca3af;
            }

            /* Estados de foco para acessibilidade */
            .chatbot-toggle:focus-visible,
            .chatbot-action-btn:focus-visible,
            .send-button:focus-visible {
                outline: 2px solid #4f46e5;
                outline-offset: 2px;
            }

            .chatbot-input-area textarea:focus-visible {
                outline: none;
            }
        `;
        
        document.head.appendChild(style);
    }

    setupEventListeners() {
        const toggleBtn = document.getElementById('chatbotToggle');
        toggleBtn.addEventListener('click', () => this.toggleChat());
        toggleBtn.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.toggleChat();
            }
        });
        
        document.getElementById('closeChatbot').addEventListener('click', () => this.closeChat());
        document.getElementById('minimizeChatbot').addEventListener('click', () => this.minimizeChat());
        
        document.getElementById('sendMessage').addEventListener('click', () => this.sendMessage());
        
        const textarea = document.getElementById('chatbotInput');
        textarea.addEventListener('input', () => {
            this.adjustTextareaHeight(textarea);
            
            const count = textarea.value.length;
            const charCount = document.getElementById('charCount');
            charCount.textContent = `${count}/${this.config.maxMessageLength}`;
            
            if (count > this.config.maxMessageLength * 0.9) {
                charCount.style.color = '#ef4444';
                charCount.style.fontWeight = '600';
            } else if (count > this.config.maxMessageLength * 0.75) {
                charCount.style.color = '#f59e0b';
            } else {
                charCount.style.color = '#6b7280';
                charCount.style.fontWeight = '400';
            }
        });
        
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        const messagesContainer = document.getElementById('chatbotMessages');
        const observer = new MutationObserver(() => {
            this.scrollToBottom(messagesContainer);
        });
        observer.observe(messagesContainer, { childList: true, subtree: true });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.closeChat();
            }
        });
        
        textarea.addEventListener('focus', () => this.resetInactivityTimer());
        textarea.addEventListener('blur', () => this.resetInactivityTimer());
    }

    adjustTextareaHeight(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 80) + 'px';
    }

    scrollToBottom(element) {
        element.scrollTop = element.scrollHeight;
    }

    resetInactivityTimer() {
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
        }
        if (this.isOpen) {
            this.inactivityTimer = setTimeout(() => {
                if (this.isOpen) {
                    this.closeChat();
                    this.sendSystemMessage(
                        "💤 Chat pausado por inatividade. " +
                        "Clique no botão para continuar nossa conversa!"
                    );
                }
            }, this.config.autoCloseInactive);
        }
    }

    showNotification() {
        const toggleButton = document.getElementById('chatbotToggle');
        const notificationBadge = document.getElementById('notificationBadge');
        
        if (!this.isOpen) {
            toggleButton.classList.add('has-notification');
            this.hasNewMessages = true;
            
            if (notificationBadge) {
                notificationBadge.style.display = 'flex';
            }
        }
    }

    clearNotification() {
        const toggleButton = document.getElementById('chatbotToggle');
        const notificationBadge = document.getElementById('notificationBadge');
        
        toggleButton.classList.remove('has-notification');
        this.hasNewMessages = false;
        
        if (notificationBadge) {
            notificationBadge.style.display = 'none';
        }
    }

    toggleChat() {
        this.isOpen = !this.isOpen;
        const windowElement = document.getElementById('chatbotWindow');
        const toggleButton = document.getElementById('chatbotToggle');
        
        if (this.isOpen) {
            windowElement.classList.add('active');
            toggleButton.classList.add('active');
            
            if (this.connectionStatus === 'offline') {
                document.getElementById('chatbotInput').setAttribute('placeholder', 'Conecte-se à internet...');
            } else {
                document.getElementById('chatbotInput').focus();
            }
            
            this.updateQuickActions();
            this.resetInactivityTimer();
            this.clearNotification();
            
            // Mostrar apresentação se for a primeira vez que abre
            this.showIntroduction();
            
            if (this.config.analyticsEnabled) {
                console.log('📊 Chatbot: Chat aberto', {
                    sessionId: this.sessionId,
                    timestamp: new Date().toISOString(),
                    conversationLength: this.conversation.length,
                    connectionStatus: this.connectionStatus
                });
            }
        } else {
            windowElement.classList.remove('active');
            toggleButton.classList.remove('active');
            this.resetInactivityTimer();
        }
        
        toggleButton.setAttribute('aria-label', 
            this.isOpen ? 'Fechar chat' : 'Abrir chat'
        );
        windowElement.setAttribute('aria-hidden', !this.isOpen);
    }

    minimizeChat() {
        this.isOpen = false;
        document.getElementById('chatbotWindow').classList.remove('active');
        document.getElementById('chatbotToggle').classList.remove('active');
        this.sendSystemMessage("💼 Chat minimizado. Clique no ícone para continuar.");
    }

    closeChat() {
        this.isOpen = false;
        const windowElement = document.getElementById('chatbotWindow');
        const toggleButton = document.getElementById('chatbotToggle');
        
        windowElement.classList.remove('active');
        toggleButton.classList.remove('active');
        
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
        }
    }

    addMessage(sender, content, type = 'normal') {
        if (!content || content.trim() === '') {
            console.warn('⚠️ Tentativa de adicionar mensagem vazia');
            return;
        }

        const messagesContainer = document.getElementById('chatbotMessages');
        if (!messagesContainer) {
            console.error('❌ Container de mensagens não encontrado');
            return;
        }
        
        const messageId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const time = new Date().toLocaleTimeString('pt-BR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        let messageClass = sender;
        let ariaLabel = sender === 'user' ? 'Você disse' : 'Assistente disse';
        
        switch (type) {
            case 'system': messageClass = 'system'; ariaLabel = 'Mensagem do sistema'; break;
            case 'error': messageClass = 'error'; ariaLabel = 'Mensagem de erro'; break;
            case 'success': messageClass = 'success'; ariaLabel = 'Mensagem de sucesso'; break;
            case 'info': messageClass = 'info'; ariaLabel = 'Informação'; break;
            case 'warning': messageClass = 'warning'; ariaLabel = 'Aviso'; break;
        }
        
        const messageHTML = `
            <div class="message ${messageClass}" 
                 id="${messageId}" 
                 role="article"
                 aria-label="${ariaLabel}">
                ${this.formatMessage(content)}
                <span class="message-time">${time}</span>
            </div>
        `;
        
        messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
        
        this.conversation.push({
            id: messageId,
            sender,
            content,
            type,
            time,
            timestamp: Date.now()
        });
        
        this.saveConversation();
        
        setTimeout(() => {
            const messageElement = document.getElementById(messageId);
            if (messageElement) {
                messageElement.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'nearest' 
                });
            }
        }, 50);
        
        // Mostrar notificação se chat fechado
        if (!this.isOpen && sender === 'bot') {
            this.showNotification();
        }
        
        return messageId;
    }

    formatMessage(content) {
        if (!content) return '';
        
        let formatted = content
            .replace(/[<>]/g, (m) => m === '<' ? '&lt;' : '&gt;')
            .replace(
                /(https?:\/\/[^\s]+)/g,
                '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: #4f46e5; text-decoration: none; border-bottom: 1px solid #4f46e5;">$1</a>'
            )
            .replace(/^[-•]\s+(.*$)/gm, '<div style="display: flex; gap: 6px; align-items: flex-start; margin: 3px 0;"><span style="color: #4f46e5; font-weight: 600;">•</span><span>$1</span></div>')
            .replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 600;">$1</strong>')
            .replace(/\*(.*?)\*/g, '<em style="font-style: italic;">$1</em>')
            .replace(/`(.*?)`/g, '<code style="background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-family: monospace; font-size: 12px;">$1</code>')
            .replace(/\n/g, '<br>');
        
        return formatted;
    }

    showTypingIndicator() {
        if (this.isTyping) return;
        
        const messagesContainer = document.getElementById('chatbotMessages');
        if (!messagesContainer) return;
        
        const typingId = 'typing_' + Date.now();
        const typingHTML = `
            <div class="message bot loading" id="${typingId}" aria-label="Assistente está digitando">
                <div class="loading-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                <span style="font-size: 12px; color: #6b7280;">Digitando...</span>
            </div>
        `;
        
        messagesContainer.insertAdjacentHTML('beforeend', typingHTML);
        this.isTyping = true;
        this.typingIndicatorId = typingId;
        
        setTimeout(() => {
            const indicator = document.getElementById(typingId);
            if (indicator) {
                indicator.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 100);
    }

    hideTypingIndicator() {
        if (!this.isTyping || !this.typingIndicatorId) return;
        
        const typingIndicator = document.getElementById(this.typingIndicatorId);
        if (typingIndicator) {
            typingIndicator.remove();
        }
        
        this.isTyping = false;
        this.typingIndicatorId = null;
    }

    async sendMessage() {
        if (this.connectionStatus === 'offline') {
            this.addMessage('error', 
                '⚠️ Você está offline. Conecte-se à internet para enviar mensagens.', 
                'warning'
            );
            return;
        }

        const textarea = document.getElementById('chatbotInput');
        const message = textarea.value.trim();
        
        if (!message) {
            textarea.focus();
            return;
        }
        
        if (message.length > this.config.maxMessageLength) {
            this.addMessage('error', 
                `Mensagem muito longa (${message.length} caracteres). ` +
                `Limite: ${this.config.maxMessageLength} caracteres.`, 
                'error'
            );
            return;
        }
        
        if (this.isTyping || this.isProcessing) {
            this.messageQueue.push(message);
            this.addMessage('system', 
                'Aguarde a resposta atual... Sua mensagem está na fila.', 
                'info'
            );
            return;
        }
        
        const userMessageId = this.addMessage('user', message);
        textarea.value = '';
        textarea.style.height = 'auto';
        document.getElementById('charCount').textContent = `0/${this.config.maxMessageLength}`;
        
        textarea.disabled = true;
        document.getElementById('sendMessage').disabled = true;
        this.isProcessing = true;
        
        try {
            this.showTypingIndicator();
            const typingTime = Math.min(message.length * 20, 2000);
            
            const startTime = Date.now();
            const response = await Promise.race([
                this.getBackendResponse(message),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout na resposta')), this.config.responseTimeout)
                )
            ]);
            const responseTime = Date.now() - startTime;
            
            this.responseTimes.push(responseTime);
            this.hideTypingIndicator();
            await this.simulateTyping(response, typingTime);
            
        } catch (error) {
            console.error('❌ Erro no chatbot:', error);
            this.hideTypingIndicator();
            
            let fallbackMessage = "Desculpe, estou com dificuldades técnicas no momento. ";
            
            if (error.message.includes('Timeout')) {
                fallbackMessage += "A resposta está demorando mais que o esperado. ";
            } else if (error.message.includes('Network')) {
                fallbackMessage += "Parece que há problemas de conexão. ";
            } else if (error.message.includes('401') || error.message.includes('403')) {
                fallbackMessage += "Sua sessão pode ter expirado. ";
            }
            
            fallbackMessage += "Por favor, tente novamente em alguns instantes.";
            
            this.addMessage('bot', fallbackMessage, 'error');
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

    async simulateTyping(text, minTime = 500) {
        const typingTime = Math.min(Math.max(minTime, text.length * 30), 3000);
        
        return new Promise(resolve => {
            setTimeout(() => {
                this.addMessage('bot', text);
                resolve();
            }, typingTime);
        });
    }

    async getBackendResponse(userMessage) {
        const token = localStorage.getItem('auth_token');
        const userData = this.getUserData();
        
        const endpoint = token ? '/api/chatbot/message' : '/api/chatbot/public/message';
        
        const requestData = {
            sessionId: this.sessionId,
            message: userMessage,
            conversationHistory: this.conversation.slice(-5).map(msg => ({
                sender: msg.sender,
                content: msg.content,
                timestamp: msg.timestamp
            })),
            context: {
                currentPage: this.currentPage,
                userRole: userData.role || 'guest',
                userPreferences: {
                    language: navigator.language || 'pt-BR',
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                },
                systemInfo: {
                    userAgent: navigator.userAgent.substring(0, 100),
                    screenSize: `${window.innerWidth}x${window.innerHeight}`,
                    platform: navigator.platform
                },
                timestamp: new Date().toISOString()
            },
            metadata: {
                messageLength: userMessage.length,
                conversationLength: this.conversation.length,
                isTyping: this.isTyping
            }
        };
        
        const headers = {
            'Content-Type': 'application/json',
            'X-Chatbot-Session': this.sessionId,
            'X-Chatbot-Version': '1.0.0'
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        if (this.config.analyticsEnabled) {
            console.log('📤 Chatbot: Enviando requisição', {
                endpoint,
                messageLength: userMessage.length,
                timestamp: new Date().toISOString()
            });
        }
        
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
        
        if (!data.success) {
            throw new Error(data.error || 'Erro na resposta do chatbot');
        }
        
        if (this.config.analyticsEnabled) {
            console.log('📥 Chatbot: Resposta recebida', {
                responseLength: data.response?.length || 0,
                success: data.success,
                timestamp: new Date().toISOString()
            });
        }
        
        return data.response;
    }

    updateQuickActions() {
        const actionsContainer = document.getElementById('chatbotActions');
        if (!actionsContainer) return;
        
        let actions = [];
        const maxActions = 4;
        
        switch (this.currentPage) {
            case 'professor':
                actions = [
                    { text: '📝 Criar prova', query: 'Como criar uma nova prova?' },
                    { text: '👥 Gerenciar turmas', query: 'Como gerenciar minhas turmas?' },
                    { text: '📊 Ver resultados', query: 'Como ver os resultados dos alunos?' },
                    { text: '🎯 Dicas', query: 'Dicas para criar boas provas' }
                ];
                break;
                
            case 'aluno':
                actions = [
                    { text: '📚 Provas pendentes', query: 'Como ver minhas provas pendentes?' },
                    { text: '🏆 Minhas notas', query: 'Como ver minhas notas?' },
                    { text: '🎯 Entrar em turma', query: 'Como entrar em uma turma?' },
                    { text: '❓ Dúvidas', query: 'Tenho dúvidas sobre uma prova' }
                ];
                break;
                
            case 'login':
            case 'cadastro':
                actions = [
                    { text: '🔐 Login', query: 'Estou com problemas para fazer login' },
                    { text: '📝 Criar conta', query: 'Como criar uma conta?' },
                    { text: '🔑 Senha', query: 'Esqueci minha senha' },
                    { text: '📞 Contato', query: 'Como entrar em contato com o suporte?' }
                ];
                break;
                
            case 'prova':
                actions = [
                    { text: '⏱️ Tempo', query: 'Como funciona o tempo da prova?' },
                    { text: '📝 Responder', query: 'Como responder às questões?' },
                    { text: '🔍 Revisar', query: 'Posso revisar minhas respostas?' },
                    { text: '🚪 Sair', query: 'O que acontece se eu sair da prova?' }
                ];
                break;
                
            default:
                actions = [
                    { text: '🌟 Sistema', query: 'Conte-me sobre o sistema de provas' },
                    { text: '🎓 Alunos', query: 'Como funciona para alunos?' },
                    { text: '👨‍🏫 Professores', query: 'Como funciona para professores?' },
                    { text: '🚀 Começar', query: 'Como começar a usar o sistema?' }
                ];
        }
        
        actionsContainer.innerHTML = actions.slice(0, maxActions).map(action => `
            <button class="chatbot-action-btn" 
                    onclick="window.chatbot.suggestAction('${action.query.replace(/'/g, "\\'")}')"
                    aria-label="${action.text}"
                    ${this.connectionStatus === 'offline' ? 'disabled' : ''}>
                ${action.text}
            </button>
        `).join('');
    }

    suggestAction(actionText) {
        if (this.connectionStatus === 'offline') {
            this.showConnectionMessage('⚠️ Esta ação requer conexão com a internet.', 'warning');
            return;
        }

        const textarea = document.getElementById('chatbotInput');
        textarea.value = actionText;
        this.adjustTextareaHeight(textarea);
        textarea.focus();
        
        setTimeout(() => {
            this.sendMessage();
        }, 100);
    }

    showIntroduction() {
        // Verificar se já mostrou a apresentação nesta sessão
        if (this.config.introductionDisplayed) {
            return;
        }
        
        // Verificar se já tem alguma mensagem na conversa (exceto welcome)
        const hasOtherMessages = this.conversation.some(msg => 
            msg.sender !== 'bot' || (msg.sender === 'bot' && msg.content !== 'Mensagem de boas-vindas')
        );
        
        if (!hasOtherMessages) {
            const introId = 'intro_' + Date.now();
            const introHTML = `
                <div class="message bot introduction-message" id="${introId}" aria-label="Apresentação do assistente">
                    <div class="welcome-header">
                        <i class="fas fa-hand-wave" style="color: #4f46e5; font-size: 18px;"></i>
                        <h4>Olá! Eu sou seu Assistente Virtual</h4>
                    </div>
                    
                    <p style="margin-bottom: 12px; color: #4b5563; font-size: 13px; line-height: 1.4;">
                        Estou aqui para ajudar você no <strong>Sistema de Provas</strong>. Posso auxiliar com:
                    </p>
                    
                    <div class="assistance-grid">
                        <div class="assistance-item">
                            <div class="assistance-icon">
                                <i class="fas fa-question-circle"></i>
                            </div>
                            <div class="assistance-content">
                                <strong>Tire suas dúvidas</strong>
                                <p>Sobre login, cadastro ou uso do sistema</p>
                            </div>
                        </div>
                        
                        <div class="assistance-item">
                            <div class="assistance-icon">
                                <i class="fas fa-lightbulb"></i>
                            </div>
                            <div class="assistance-content">
                                <strong>Orientações</strong>
                                <p>Dicas e melhores práticas</p>
                            </div>
                        </div>
                        
                        <div class="assistance-item">
                            <div class="assistance-icon">
                                <i class="fas fa-bolt"></i>
                            </div>
                            <div class="assistance-content">
                                <strong>Ações rápidas</strong>
                                <p>Use os botões abaixo para facilitar</p>
                            </div>
                        </div>
                    </div>
                    
                    <p style="margin-top: 12px; color: #6b7280; font-size: 12px; font-style: italic;">
                        💬 <strong>Como usar:</strong> Digite sua pergunta ou clique em um dos botões abaixo!
                    </p>
                </div>
            `;
            
            const messagesContainer = document.getElementById('chatbotMessages');
            if (messagesContainer) {
                // Inserir após a mensagem de boas-vindas, se houver
                const welcomeMessage = messagesContainer.querySelector('.welcome-message');
                if (welcomeMessage) {
                    welcomeMessage.insertAdjacentHTML('afterend', introHTML);
                } else {
                    messagesContainer.insertAdjacentHTML('beforeend', introHTML);
                }
                
                this.conversation.push({
                    id: introId,
                    sender: 'bot',
                    content: 'Apresentação do assistente',
                    type: 'system',
                    time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                    timestamp: Date.now()
                });
                
                this.config.introductionDisplayed = true;
                
                if (this.config.analyticsEnabled) {
                    console.log('📊 Chatbot: Apresentação exibida', {
                        sessionId: this.sessionId,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        }
    }

    showWelcomeMessage() {
        const lastWelcome = localStorage.getItem('chatbot_last_welcome');
        const today = new Date().toDateString();
        
        if (!lastWelcome || lastWelcome !== today) {
            const welcomeId = 'welcome_' + Date.now();
            const welcomeHTML = `
                <div class="message bot welcome-message" id="${welcomeId}" aria-label="Mensagem de boas-vindas">
                    <div class="welcome-header">
                        <i class="fas fa-robot" style="color: #4f46e5; font-size: 18px;"></i>
                        <h4>👋 Olá${this.userData.nome ? `, ${this.userData.nome.split(' ')[0]}` : ''}!</h4>
                    </div>
                    
                    <p style="margin-bottom: 12px; color: #4b5563; font-size: 13px; line-height: 1.4;">
                        Seja bem-vindo(a) ao <strong>Sistema de Provas</strong>! Estou aqui para ajudar você com:
                    </p>
                    
                    <div class="assistance-grid">
                        <div class="assistance-item">
                            <div class="assistance-icon">
                                <i class="fas fa-graduation-cap"></i>
                            </div>
                            <div class="assistance-content">
                                <strong>Provas e Avaliações</strong>
                                <p>Criação, gerenciamento e realização</p>
                            </div>
                        </div>
                        
                        <div class="assistance-item">
                            <div class="assistance-icon">
                                <i class="fas fa-users"></i>
                            </div>
                            <div class="assistance-content">
                                <strong>Turmas e Alunos</strong>
                                <p>Organização e acompanhamento</p>
                            </div>
                        </div>
                        
                        <div class="assistance-item">
                            <div class="assistance-icon">
                                <i class="fas fa-chart-bar"></i>
                            </div>
                            <div class="assistance-content">
                                <strong>Resultados</strong>
                                <p>Análise de desempenho</p>
                            </div>
                        </div>
                        
                        <div class="assistance-item">
                            <div class="assistance-icon">
                                <i class="fas fa-life-ring"></i>
                            </div>
                            <div class="assistance-content">
                                <strong>Suporte</strong>
                                <p>Solução de problemas</p>
                            </div>
                        </div>
                    </div>
                    
                    <p style="margin-top: 12px; color: #6b7280; font-size: 12px; font-style: italic;">
                        💡 Dica: Use os botões abaixo para ações rápidas!
                    </p>
                    
                    <div class="assistant-status">
                        <span style="font-size: 11px; color: #9ca3af; display: flex; align-items: center; gap: 4px;">
                            <i class="fas fa-circle" style="color: #10b981; font-size: 7px;"></i>
                            Assistente online
                        </span>
                    </div>
                </div>
            `;
            
            const messagesContainer = document.getElementById('chatbotMessages');
            if (messagesContainer) {
                messagesContainer.insertAdjacentHTML('beforeend', welcomeHTML);
                
                this.conversation.push({
                    id: welcomeId,
                    sender: 'bot',
                    content: 'Mensagem de boas-vindas',
                    type: 'system',
                    time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
                    timestamp: Date.now()
                });
                
                localStorage.setItem('chatbot_last_welcome', today);
                
                if (this.config.analyticsEnabled) {
                    console.log('📊 Chatbot: Welcome message exibida', {
                        sessionId: this.sessionId,
                        timestamp: new Date().toISOString(),
                        userHasName: !!this.userData.nome
                    });
                }
            }
        }
    }

    loadConversation() {
        try {
            const saved = localStorage.getItem('chatbot_conversation');
            if (saved) {
                const parsed = JSON.parse(saved);
                const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);
                this.conversation = parsed.filter(msg => 
                    msg.timestamp && msg.timestamp > twentyFourHoursAgo
                );
                
                if (this.conversation.length > this.config.maxConversationHistory) {
                    this.conversation = this.conversation.slice(-this.config.maxConversationHistory);
                }
                
                console.log(`💾 Chatbot: Carregadas ${this.conversation.length} mensagens da conversa anterior`);
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
            
            const lastBackup = localStorage.getItem('chatbot_last_backup');
            const now = Date.now();
            if (!lastBackup || (now - parseInt(lastBackup)) > 3600000) {
                localStorage.setItem('chatbot_backup_' + Date.now(), JSON.stringify(this.conversation));
                localStorage.setItem('chatbot_last_backup', now.toString());
            }
            
        } catch (error) {
            console.error('❌ Erro ao salvar conversação:', error);
            
            const simpleConversation = this.conversation.map(msg => ({
                t: msg.time,
                s: msg.sender,
                c: msg.content.substring(0, 100)
            }));
            localStorage.setItem('chatbot_conversation_simple', JSON.stringify(simpleConversation));
        }
    }

    // ============ MÉTODOS PÚBLICOS ============
    
    open() {
        if (!this.isOpen) {
            this.toggleChat();
        }
    }

    close() {
        if (this.isOpen) {
            this.closeChat();
        }
    }

    sendSystemMessage(message) {
        this.addMessage('system', message, 'system');
    }

    sendErrorMessage(message) {
        this.addMessage('error', message, 'error');
    }

    sendSuccessMessage(message) {
        this.addMessage('success', message, 'success');
    }

    sendInfoMessage(message) {
        this.addMessage('info', message, 'info');
    }

    clearConversation() {
        const confirmClear = confirm('Tem certeza que deseja limpar todo o histórico da conversa?');
        if (confirmClear) {
            this.conversation = [];
            localStorage.removeItem('chatbot_conversation');
            localStorage.removeItem('chatbot_conversation_simple');
            
            const messagesContainer = document.getElementById('chatbotMessages');
            if (messagesContainer) {
                messagesContainer.innerHTML = '';
            }
            
            this.sendSystemMessage('🗑️ Histórico da conversa limpo com sucesso.');
            
            if (this.config.analyticsEnabled) {
                console.log('📊 Chatbot: Conversação limpa', {
                    sessionId: this.sessionId,
                    timestamp: new Date().toISOString()
                });
            }
        }
    }

    getConversationStats() {
        const userMessages = this.conversation.filter(msg => msg.sender === 'user').length;
        const botMessages = this.conversation.filter(msg => msg.sender === 'bot').length;
        const systemMessages = this.conversation.filter(msg => msg.type === 'system').length;
        
        return {
            total: this.conversation.length,
            userMessages,
            botMessages,
            systemMessages,
            engagementRate: botMessages > 0 ? (userMessages / botMessages).toFixed(2) : 0,
            avgResponseLength: botMessages > 0 ? 
                Math.round(this.conversation
                    .filter(msg => msg.sender === 'bot')
                    .reduce((sum, msg) => sum + msg.content.length, 0) / botMessages) : 0
        };
    }

    // ============ UTILITÁRIOS DE DEBUG ============
    
    debug() {
        console.group('🤖 Chatbot Debug Info');
        console.log('Session ID:', this.sessionId);
        console.log('Is Open:', this.isOpen);
        console.log('Is Typing:', this.isTyping);
        console.log('Is Processing:', this.isProcessing);
        console.log('Current Page:', this.currentPage);
        console.log('User Role:', this.userData.role);
        console.log('Connection Status:', this.connectionStatus);
        console.log('Has New Messages:', this.hasNewMessages);
        console.log('Conversation Stats:', this.getConversationStats());
        console.log('Response Times:', this.responseTimes);
        console.log('Message Queue:', this.messageQueue);
        console.groupEnd();
    }

    exportConversation() {
        const dataStr = JSON.stringify(this.conversation, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `chatbot_conversation_${this.sessionId}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
        
        this.sendSystemMessage(`💾 Conversação exportada como: ${exportFileDefaultName}`);
    }
}

// Inicializar quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        try {
            window.chatbot = new SistemaProvasChatbot();
            
            window.chatbotDebug = () => window.chatbot.debug();
            window.chatbotExport = () => window.chatbot.exportConversation();
            window.chatbotClear = () => window.chatbot.clearConversation();
            
            console.log('🤖 Chatbot inicializado com sucesso!');
            console.log('💡 Dica: Use chatbotDebug(), chatbotExport() ou chatbotClear() para utilitários');
            
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log('%c🛠️ Ferramentas de Desenvolvimento:', 'color: #4f46e5; font-weight: 600');
                console.log('%c• window.chatbotDebug() - Ver informações de debug', 'color: #6b7280');
                console.log('%c• window.chatbotExport() - Exportar conversação', 'color: #6b7280');
                console.log('%c• window.chatbotClear() - Limpar histórico', 'color: #6b7280');
            }
            
        } catch (error) {
            console.error('❌ Falha ao inicializar chatbot:', error);
            
            const fallbackHTML = `
                <button onclick="alert('Chatbot temporariamente indisponível. Tente recarregar a página.')"
                        style="position:fixed;bottom:20px;right:20px;background:#4f46e5;color:white;border:none;border-radius:16px;width:56px;height:56px;font-size:22px;cursor:pointer;z-index:10000;box-shadow:0 6px 20px rgba(79,70,229,0.25);transition:all 0.3s;">
                    <i class="fas fa-robot"></i>
                </button>
            `;
            document.body.insertAdjacentHTML('beforeend', fallbackHTML);
        }
    }, 1000);
});

// Exportar para uso global
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SistemaProvasChatbot;
} else {
    window.SistemaProvasChatbot = SistemaProvasChatbot;
}

// Polifill para focus-visible
if (!document.documentElement.classList.contains('focus-visible')) {
    document.documentElement.classList.add('focus-visible');
}