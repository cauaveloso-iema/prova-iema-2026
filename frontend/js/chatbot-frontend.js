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
            welcomeDisplayedToday: false
        };
        
        this.inactivityTimer = null;
        this.messageQueue = [];
        this.isProcessing = false;
        this.connectionStatus = 'online';
        this.hasNewMessages = false;
        
        this.init();
        this.setupEventListeners();
        this.setupProximityDetection();
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
        const statusText = document.querySelector('.chatbot-status span');
        
        if (statusDot && statusText) {
            if (this.connectionStatus === 'online') {
                statusDot.style.background = '#10b981';
                statusDot.style.boxShadow = '0 0 8px #10b981';
                statusText.textContent = 'Online';
            } else {
                statusDot.style.background = '#ef4444';
                statusDot.style.boxShadow = '0 0 8px #ef4444';
                statusText.textContent = 'Offline';
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
        const userRole = this.userData.role || 'visitante';
        const roleText = userRole === 'professor' ? 'Professor' : 
                        userRole === 'aluno' ? 'Aluno' : 'Visitante';
        
        const chatbotHTML = `
            <!-- Assistente Virtual Acadêmico -->
            <div class="chatbot-container" id="chatbotContainer">
                <!-- Sugestão de Acesso -->
                <div class="chatbot-gesture" id="chatbotGesture">
                    <div class="gesture-icon">
                        <i class="fas fa-graduation-cap"></i>
                    </div>
                    <div class="gesture-content">
                        <div class="gesture-header">
                            <strong>${userName ? `Olá, ${userName}!` : 'Bem-vindo!'}</strong>
                            <span class="gesture-role">${roleText}</span>
                        </div>
                        <p class="gesture-subtitle">Assistente acadêmico disponível para:</p>
                        <ul class="gesture-features">
                            <li><i class="fas fa-file-alt"></i> Gestão de provas</li>
                            <li><i class="fas fa-users"></i> Controle de turmas</li>
                            <li><i class="fas fa-chart-line"></i> Análise de resultados</li>
                        </ul>
                    </div>
                    <button class="gesture-close" id="closeGesture" aria-label="Ignorar sugestão" title="Fechar">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

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
                                    <h3 id="chatbotTitle">Assistente Acadêmico</h3>
                                    <p class="chatbot-description">Sistema de Provas Inteligente</p>
                                </div>
                            </div>
                            <div class="chatbot-status">
                                <div class="status-indicator">
                                    <span class="status-dot" id="statusDot" aria-label="Status da conexão"></span>
                                    <span class="status-text" id="statusText">Conectado</span>
                                </div>
                                ${userName ? `
                                    <div class="user-badge" title="${roleText}">
                                        <i class="fas fa-user"></i>
                                        <span>${userName}</span>
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                        <div class="header-controls">
                            <button class="chatbot-minimize" id="minimizeChatbot" 
                                    aria-label="Minimizar assistente" title="Minimizar">
                                <i class="fas fa-window-minimize"></i>
                            </button>
                            <button class="chatbot-settings" id="chatbotSettings" 
                                    aria-label="Configurações" title="Configurações">
                                <i class="fas fa-cog"></i>
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
                            <input 
                                type="text" 
                                id="chatbotInput" 
                                placeholder="${this.connectionStatus === 'offline' ? 'Conecte-se à internet para enviar mensagens...' : 'Digite sua pergunta sobre provas, turmas ou resultados...'}" 
                                maxlength="${this.config.maxMessageLength}"
                                aria-label="Campo de entrada de mensagem"
                                aria-describedby="charCount"
                                ${this.connectionStatus === 'offline' ? 'disabled' : ''}
                            >
                            <div class="input-actions">
                                <button class="chatbot-attach" id="attachButton" 
                                        aria-label="Anexar arquivo" title="Anexar arquivo" disabled>
                                    <i class="fas fa-paperclip"></i>
                                </button>
                                <button class="chatbot-voice" id="voiceButton" 
                                        aria-label="Ativar entrada por voz" title="Voz">
                                    <i class="fas fa-microphone"></i>
                                </button>
                                <button id="sendMessage" 
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
                                    '<i class="fas fa-wifi"></i> Online' : 
                                    '<i class="fas fa-wifi-slash"></i> Offline'}
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
                z-index: 9999;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            }

            .chatbot-toggle {
                width: 60px;
                height: 60px;
                background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 24px;
                cursor: pointer;
                box-shadow: 0 10px 30px rgba(79, 70, 229, 0.3);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
                border: none;
                outline: none;
                z-index: 10000;
            }

            .chatbot-toggle::before {
                content: '';
                position: absolute;
                top: -2px;
                left: -2px;
                right: -2px;
                bottom: -2px;
                background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
                border-radius: 50%;
                z-index: -1;
                opacity: 0;
                transition: opacity 0.3s;
            }

            .chatbot-toggle:hover::before {
                opacity: 0.4;
                animation: shimmer 2s infinite;
            }

            .chatbot-toggle:hover {
                transform: scale(1.1);
                box-shadow: 0 15px 40px rgba(79, 70, 229, 0.4);
            }

            .chatbot-toggle:active {
                transform: scale(0.95);
            }

            .chatbot-toggle.pulsing {
                animation: pulse 2s infinite;
            }

            .chatbot-toggle.has-notification::after {
                content: '';
                position: absolute;
                top: 5px;
                right: 5px;
                width: 12px;
                height: 12px;
                background: #ef4444;
                border-radius: 50%;
                border: 2px solid white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }

            .chatbot-toggle.active {
                background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                transform: rotate(45deg);
            }

            .notification-badge {
                position: absolute;
                top: -5px;
                right: -5px;
                background: #ef4444;
                color: white;
                font-size: 11px;
                font-weight: bold;
                min-width: 18px;
                height: 18px;
                border-radius: 9px;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 4px;
                border: 2px solid white;
                display: none;
            }

            .chatbot-window {
                position: absolute;
                bottom: 70px;
                right: 0;
                width: 380px;
                max-width: 90vw;
                height: 550px;
                max-height: 70vh;
                background: white;
                border-radius: 16px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
                display: none;
                flex-direction: column;
                overflow: hidden;
                animation: slideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                border: 1px solid #e9ecef;
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
                border-radius: 16px 16px 0 0;
                flex-shrink: 0;
            }

            .header-content {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .chatbot-header h3 {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .chatbot-status {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                opacity: 0.9;
                background: rgba(255, 255, 255, 0.2);
                padding: 4px 8px;
                border-radius: 12px;
            }

            .status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #10b981;
                box-shadow: 0 0 8px #10b981;
                animation: blink 2s infinite;
            }

            .header-controls {
                display: flex;
                gap: 8px;
            }

            .chatbot-minimize,
            .chatbot-close {
                background: rgba(255, 255, 255, 0.1);
                border: none;
                color: white;
                font-size: 16px;
                cursor: pointer;
                padding: 6px;
                border-radius: 6px;
                transition: background 0.2s;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .chatbot-minimize:hover,
            .chatbot-close:hover {
                background: rgba(255, 255, 255, 0.2);
            }

            .chatbot-messages {
                flex: 1;
                padding: 20px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 12px;
                background: linear-gradient(180deg, #f8f9fa 0%, #ffffff 100%);
                scroll-behavior: smooth;
            }

            .message {
                max-width: 85%;
                padding: 12px 16px;
                border-radius: 18px;
                line-height: 1.5;
                word-wrap: break-word;
                animation: messageAppear 0.3s ease;
                position: relative;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }

            .message.bot {
                align-self: flex-start;
                background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
                color: #333;
                border-bottom-left-radius: 4px;
                border: 1px solid #e9ecef;
                box-shadow: 
                    0 2px 8px rgba(0,0,0,0.1),
                    inset 0 1px 0 rgba(255,255,255,0.8);
            }

            .message.user {
                align-self: flex-end;
                background: linear-gradient(135deg, #4f46e5 0%, #5a67d8 100%);
                color: white;
                border-bottom-right-radius: 4px;
                box-shadow: 
                    0 4px 12px rgba(79, 70, 229, 0.3),
                    inset 0 1px 0 rgba(255,255,255,0.2);
            }

            .message.loading {
                background: white;
                padding: 16px;
                display: flex;
                align-items: center;
                gap: 12px;
                border: 1px solid #e9ecef;
            }

            .loading-dots {
                display: flex;
                gap: 4px;
            }

            .loading-dots span {
                width: 8px;
                height: 8px;
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
                font-size: 11px;
                opacity: 0.6;
                margin-top: 4px;
                text-align: right;
                display: block;
            }

            .chatbot-input {
                padding: 16px;
                border-top: 1px solid #e9ecef;
                display: flex;
                gap: 8px;
                background: white;
                position: relative;
                flex-shrink: 0;
            }

            .chatbot-input input {
                flex: 1;
                padding: 12px 16px;
                border: 2px solid #e9ecef;
                border-radius: 24px;
                font-size: 14px;
                outline: none;
                transition: all 0.3s;
                background: #f8f9fa;
            }

            .chatbot-input input:focus {
                border-color: #4f46e5;
                background: white;
                box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
            }

            .chatbot-input input:disabled {
                background: #f3f4f6;
                cursor: not-allowed;
            }

            .chatbot-input button {
                width: 44px;
                height: 44px;
                border-radius: 50%;
                background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
                color: white;
                border: none;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s;
                flex-shrink: 0;
            }

            .chatbot-input button:hover {
                transform: scale(1.05);
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }

            .chatbot-input button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none !important;
            }

            .chatbot-voice {
                background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%) !important;
            }

            .char-count {
                position: absolute;
                top: -20px;
                right: 20px;
                font-size: 11px;
                color: #6c757d;
                background: white;
                padding: 2px 6px;
                border-radius: 10px;
                border: 1px solid #e9ecef;
            }

            .chatbot-actions {
                display: flex;
                gap: 8px;
                padding: 12px 16px;
                border-top: 1px solid #e9ecef;
                background: white;
                overflow-x: auto;
                scrollbar-width: none;
                flex-shrink: 0;
            }

            .chatbot-actions::-webkit-scrollbar {
                display: none;
            }

            .chatbot-action-btn {
                padding: 8px 14px;
                background: #f8f9fa;
                border: 1px solid #e9ecef;
                border-radius: 20px;
                font-size: 13px;
                white-space: nowrap;
                cursor: pointer;
                transition: all 0.3s;
                flex-shrink: 0;
            }

            .chatbot-action-btn:hover {
                background: #4f46e5;
                color: white;
                border-color: #4f46e5;
                transform: translateY(-1px);
            }

            .chatbot-gesture {
                position: absolute;
                bottom: 80px;
                right: 0;
                background: white;
                padding: 12px 16px;
                border-radius: 12px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
                display: none;
                align-items: center;
                gap: 12px;
                animation: gestureAppear 0.3s ease;
                max-width: 280px;
                z-index: 9998;
                border: 1px solid #e9ecef;
            }

            .chatbot-gesture.show {
                display: flex;
            }

            .gesture-icon {
                width: 36px;
                height: 36px;
                background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 16px;
                flex-shrink: 0;
            }

            .gesture-content {
                flex: 1;
                font-size: 13px;
                color: #495057;
            }

            .gesture-close {
                background: none;
                border: none;
                color: #adb5bd;
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
                transition: background 0.2s;
                flex-shrink: 0;
            }

            .gesture-close:hover {
                background: #f8f9fa;
                color: #495057;
            }

            /* Tipos de mensagens */
            .message.system {
                background: #fff3cd;
                color: #856404;
                border: 1px solid #ffeaa7;
                align-self: center;
                font-size: 13px;
                padding: 10px 14px;
                border-radius: 12px;
                max-width: 90%;
                text-align: center;
            }

            .message.error {
                background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
                color: #dc2626;
                border: 1px solid #fecaca;
            }

            .message.success {
                background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
                color: #065f46;
                border: 1px solid #a7f3d0;
            }

            .message.info {
                background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
                color: #1e40af;
                border: 1px solid #bfdbfe;
            }

            .message.warning {
                background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
                color: #92400e;
                border: 1px solid #fde68a;
            }

            /* Animações */
            @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0.7); }
                70% { box-shadow: 0 0 0 10px rgba(79, 70, 229, 0); }
                100% { box-shadow: 0 0 0 0 rgba(79, 70, 229, 0); }
            }

            @keyframes shimmer {
                0% { opacity: 0.4; }
                50% { opacity: 0.6; }
                100% { opacity: 0.4; }
            }

            @keyframes slideUp {
                from { opacity: 0; transform: translateY(20px) scale(0.95); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }

            @keyframes messageAppear {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }

            @keyframes gestureAppear {
                from { opacity: 0; transform: translateY(10px) translateX(10px); }
                to { opacity: 1; transform: translateY(0) translateX(0); }
            }

            @keyframes blink {
                0%, 50% { opacity: 1; }
                51%, 100% { opacity: 0.7; }
            }

            @keyframes bounce {
                0%, 60%, 100% { transform: translateY(0); }
                30% { transform: translateY(-6px); }
            }

            /* Modo responsivo */
            @media (max-width: 480px) {
                .chatbot-container {
                    bottom: 10px;
                    right: 10px;
                }

                .chatbot-window {
                    width: calc(100vw - 20px);
                    height: calc(100vh - 80px);
                    max-height: none;
                    bottom: 60px;
                    right: 10px;
                    border-radius: 12px;
                }

                .chatbot-header {
                    padding: 12px 16px;
                }

                .chatbot-input {
                    padding: 12px;
                }
            }

            /* Scrollbar personalizada */
            .chatbot-messages::-webkit-scrollbar {
                width: 8px;
            }

            .chatbot-messages::-webkit-scrollbar-track {
                background: #f1f1f1;
                border-radius: 4px;
            }

            .chatbot-messages::-webkit-scrollbar-thumb {
                background: linear-gradient(180deg, #4f46e5 0%, #7c3aed 100%);
                border-radius: 4px;
            }

            .chatbot-messages::-webkit-scrollbar-thumb:hover {
                background: linear-gradient(180deg, #4338ca 0%, #6b46c1 100%);
            }

            /* Estados de foco para acessibilidade */
            .chatbot-toggle:focus-visible,
            .chatbot-action-btn:focus-visible,
            .chatbot-input button:focus-visible {
                outline: 3px solid #4f46e5;
                outline-offset: 2px;
            }

            .chatbot-input input:focus-visible {
                outline: none;
                border-color: #4f46e5;
                box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.2);
            }

            /* Feedback visual para mensagens enviadas */
            .message.sending {
                opacity: 0.7;
            }

            .message.sent {
                animation: messageSent 0.3s ease;
            }

            @keyframes messageSent {
                from { transform: scale(0.95); opacity: 0.5; }
                to { transform: scale(1); opacity: 1; }
            }

            /* Welcome message professional */
            .welcome-message {
                background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%) !important;
                border: 1px solid #e5e7eb !important;
                border-left: 4px solid #4f46e5 !important;
                border-radius: 12px !important;
                padding: 20px !important;
                margin-bottom: 20px;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                animation: professionalEntrance 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }

            .welcome-header {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 16px;
                padding-bottom: 12px;
                border-bottom: 1px solid #e5e7eb;
            }

            .welcome-header h4 {
                margin: 0;
                color: #1f2937;
                font-size: 18px;
                font-weight: 600;
            }

            .assistance-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 12px;
                margin: 12px 0;
            }

            .assistance-item {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                padding: 12px;
                background: rgba(255, 255, 255, 0.8);
                border-radius: 8px;
                border: 1px solid #e5e7eb;
                transition: all 0.2s ease;
            }

            .assistance-item:hover {
                background: white;
                border-color: #4f46e5;
                transform: translateY(-2px);
                box-shadow: 0 2px 8px rgba(79, 70, 229, 0.1);
            }

            .assistance-icon {
                font-size: 20px;
                background: #f3f4f6;
                width: 36px;
                height: 36px;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }

            .assistance-content {
                flex: 1;
            }

            .assistance-content strong {
                display: block;
                color: #374151;
                font-size: 14px;
                margin-bottom: 4px;
            }

            .assistance-content p {
                margin: 0;
                color: #6b7280;
                font-size: 12px;
                line-height: 1.4;
            }

            .quick-suggestions {
                display: flex;
                flex-direction: column;
                gap: 8px;
                margin-top: 12px;
            }

            .suggestion-btn {
                background: white;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                padding: 10px 16px;
                font-size: 14px;
                color: #4b5563;
                text-align: left;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .suggestion-btn:hover {
                background: #f9fafb;
                border-color: #4f46e5;
                color: #4f46e5;
                box-shadow: 0 2px 4px rgba(79, 70, 229, 0.1);
            }

            .assistant-status {
                display: flex;
                align-items: center;
                margin-top: 16px;
                padding-top: 16px;
                border-top: 1px solid #e5e7eb;
            }

            @keyframes professionalEntrance {
                0% { opacity: 0; transform: translateY(20px) scale(0.95); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
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
        
        const input = document.getElementById('chatbotInput');
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        input.addEventListener('input', () => {
            const count = input.value.length;
            const charCount = document.getElementById('charCount');
            charCount.textContent = `${count}/${this.config.maxMessageLength}`;
            
            if (count > this.config.maxMessageLength * 0.9) {
                charCount.style.color = '#ef4444';
                charCount.style.fontWeight = 'bold';
            } else if (count > this.config.maxMessageLength * 0.75) {
                charCount.style.color = '#f59e0b';
            } else {
                charCount.style.color = '#6c757d';
                charCount.style.fontWeight = 'normal';
            }
        });
        
        document.getElementById('closeGesture').addEventListener('click', () => {
            document.getElementById('chatbotGesture').classList.remove('show');
            sessionStorage.setItem('chatbot_gesture_closed', 'true');
        });
        
        const messagesContainer = document.getElementById('chatbotMessages');
        const observer = new MutationObserver(() => {
            this.scrollToBottom(messagesContainer);
        });
        observer.observe(messagesContainer, { childList: true, subtree: true });
        
        document.getElementById('voiceButton').addEventListener('click', () => {
            if (this.connectionStatus === 'offline') {
                this.showConnectionMessage('🎤 A funcionalidade de voz requer conexão com a internet.', 'warning');
            } else {
                this.addMessage('system', '🎤 Funcionalidade de voz em desenvolvimento! Em breve você poderá falar comigo!', 'info');
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.closeChat();
            }
        });
        
        input.addEventListener('focus', () => this.resetInactivityTimer());
        input.addEventListener('blur', () => this.resetInactivityTimer());
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

    setupProximityDetection() {
        let mouseY = window.innerHeight;
        const gestureThreshold = 150;
        const gestureElement = document.getElementById('chatbotGesture');
        const toggleButton = document.getElementById('chatbotToggle');

        if (sessionStorage.getItem('chatbot_gesture_closed')) {
            return;
        }

        document.addEventListener('mousemove', (e) => {
            mouseY = e.clientY;
            
            if (!this.isOpen && !this.isTyping) {
                const distanceFromBottom = window.innerHeight - mouseY;
                
                if (distanceFromBottom < gestureThreshold) {
                    gestureElement.classList.add('show');
                    toggleButton.classList.add('pulsing');
                    
                    setTimeout(() => {
                        if (gestureElement.classList.contains('show')) {
                            gestureElement.classList.remove('show');
                            toggleButton.classList.remove('pulsing');
                        }
                    }, 5000);
                } else if (distanceFromBottom > gestureThreshold + 50) {
                    gestureElement.classList.remove('show');
                    toggleButton.classList.remove('pulsing');
                }
            }
        });

        gestureElement.addEventListener('click', (e) => {
            if (e.target.closest('.gesture-close')) return;
            this.toggleChat();
            gestureElement.classList.remove('show');
        });
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
        const gestureElement = document.getElementById('chatbotGesture');
        
        if (this.isOpen) {
            windowElement.classList.add('active');
            toggleButton.classList.add('active');
            toggleButton.classList.remove('pulsing');
            gestureElement.classList.remove('show');
            
            if (this.connectionStatus === 'offline') {
                document.getElementById('chatbotInput').setAttribute('placeholder', 'Conecte-se à internet para enviar mensagens...');
            } else {
                document.getElementById('chatbotInput').focus();
            }
            
            this.updateQuickActions();
            this.resetInactivityTimer();
            this.clearNotification();
            
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
                messageElement.classList.add('sent');
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
                '<a href="$1" target="_blank" rel="noopener noreferrer" style="color: #4f46e5; text-decoration: underline;">$1</a>'
            )
            .replace(/^[-•]\s+(.*$)/gm, '<div style="display: flex; gap: 8px; align-items: flex-start; margin: 4px 0;"><span style="color: #4f46e5;">•</span><span>$1</span></div>')
            .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #1f2937;">$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace;">$1</code>')
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
                <span>Digitando...</span>
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

        const inputElement = document.getElementById('chatbotInput');
        const message = inputElement.value.trim();
        
        if (!message) {
            inputElement.focus();
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
        inputElement.value = '';
        document.getElementById('charCount').textContent = `0/${this.config.maxMessageLength}`;
        
        inputElement.disabled = true;
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
            inputElement.disabled = false;
            document.getElementById('sendMessage').disabled = false;
            this.isProcessing = false;
            inputElement.focus();
            
            if (this.messageQueue.length > 0) {
                setTimeout(() => {
                    const nextMessage = this.messageQueue.shift();
                    inputElement.value = nextMessage;
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
        const maxActions = this.config.maxQuickActions;
        
        switch (this.currentPage) {
            case 'professor':
                actions = [
                    { text: '📝 Criar prova', query: 'Como criar uma nova prova?' },
                    { text: '👥 Ver turmas', query: 'Como gerenciar minhas turmas?' },
                    { text: '📊 Resultados', query: 'Como ver os resultados dos alunos?' },
                    { text: '🔧 Ajuda', query: 'Preciso de ajuda com o painel do professor' },
                    { text: '🎯 Dicas', query: 'Dicas para criar boas provas' }
                ];
                break;
                
            case 'aluno':
                actions = [
                    { text: '📚 Provas', query: 'Como ver minhas provas pendentes?' },
                    { text: '🏆 Notas', query: 'Como ver minhas notas?' },
                    { text: '🎯 Turmas', query: 'Como entrar em uma turma?' },
                    { text: '❓ Dúvidas', query: 'Tenho dúvidas sobre uma prova' },
                    { text: '⏱️ Prazos', query: 'Quais são os prazos das provas?' }
                ];
                break;
                
            case 'login':
            case 'cadastro':
                actions = [
                    { text: '🔐 Login', query: 'Estou com problemas para fazer login' },
                    { text: '📝 Cadastro', query: 'Como criar uma conta?' },
                    { text: '🔑 Senha', query: 'Esqueci minha senha' },
                    { text: '❓ Conta', query: 'Qual a diferença entre conta de aluno e professor?' }
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
                    { text: '🚀 Começar', query: 'Como começar a usar o sistema?' },
                    { text: '📞 Contato', query: 'Como entrar em contato com o suporte?' }
                ];
        }
        
        actions = actions.slice(0, maxActions);
        
        actionsContainer.innerHTML = actions.map(action => `
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

        const inputElement = document.getElementById('chatbotInput');
        inputElement.value = actionText;
        inputElement.focus();
        
        setTimeout(() => {
            this.sendMessage();
        }, 100);
    }

    showWelcomeMessage() {
        const lastWelcome = localStorage.getItem('chatbot_last_welcome');
        const today = new Date().toDateString();
        
        if (!lastWelcome || lastWelcome !== today) {
            const welcomeId = 'welcome_' + Date.now();
            const welcomeHTML = `
                <div class="message bot welcome-message" id="${welcomeId}" aria-label="Mensagem de boas-vindas">
                    <div class="welcome-header">
                        <i class="fas fa-robot" style="color: #4f46e5; font-size: 24px;"></i>
                        <h4>👋 Olá${this.userData.nome ? `, ${this.userData.nome.split(' ')[0]}` : ''}!</h4>
                    </div>
                    
                    <p style="margin-bottom: 16px; color: #4b5563;">
                        Seja bem-vindo(a) ao <strong>Sistema de Provas</strong>! Estou aqui para ajudar você com:
                    </p>
                    
                    <div class="assistance-grid">
                        <div class="assistance-item">
                            <div class="assistance-icon">
                                <i class="fas fa-graduation-cap" style="color: #4f46e5;"></i>
                            </div>
                            <div class="assistance-content">
                                <strong>Provas e Avaliações</strong>
                                <p>Criação, gerenciamento e realização</p>
                            </div>
                        </div>
                        
                        <div class="assistance-item">
                            <div class="assistance-icon">
                                <i class="fas fa-users" style="color: #7c3aed;"></i>
                            </div>
                            <div class="assistance-content">
                                <strong>Turmas e Alunos</strong>
                                <p>Organização e acompanhamento</p>
                            </div>
                        </div>
                        
                        <div class="assistance-item">
                            <div class="assistance-icon">
                                <i class="fas fa-chart-bar" style="color: #10b981;"></i>
                            </div>
                            <div class="assistance-content">
                                <strong>Resultados e Estatísticas</strong>
                                <p>Análise de desempenho e relatórios</p>
                            </div>
                        </div>
                        
                        <div class="assistance-item">
                            <div class="assistance-icon">
                                <i class="fas fa-life-ring" style="color: #f59e0b;"></i>
                            </div>
                            <div class="assistance-content">
                                <strong>Suporte Técnico</strong>
                                <p>Solução de problemas e dúvidas</p>
                            </div>
                        </div>
                    </div>
                    
                    <p style="margin-top: 16px; color: #6b7280; font-size: 13px;">
                        💡 <em>Dica: Use os botões abaixo para ações rápidas!</em>
                    </p>
                    
                    <div class="assistant-status">
                        <span style="font-size: 12px; color: #9ca3af;">
                            <i class="fas fa-circle" style="color: #10b981; font-size: 8px; margin-right: 6px;"></i>
                            Assistente virtual online
                        </span>
                    </div>
                </div>
            `;
            
            const messagesContainer = document.getElementById('chatbotMessages');
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
                console.log('%c🛠️ Ferramentas de Desenvolvimento:', 'color: #4f46e5; font-weight: bold');
                console.log('%c• window.chatbotDebug() - Ver informações de debug', 'color: #6b7280');
                console.log('%c• window.chatbotExport() - Exportar conversação', 'color: #6b7280');
                console.log('%c• window.chatbotClear() - Limpar histórico', 'color: #6b7280');
            }
            
        } catch (error) {
            console.error('❌ Falha ao inicializar chatbot:', error);
            
            const fallbackHTML = `
                <button onclick="alert('Chatbot temporariamente indisponível. Tente recarregar a página.')"
                        style="position:fixed;bottom:20px;right:20px;background:#4f46e5;color:white;border:none;border-radius:50%;width:60px;height:60px;font-size:24px;cursor:pointer;z-index:9999;box-shadow:0 10px 30px rgba(79,70,229,0.3);transition:all 0.3s;">
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