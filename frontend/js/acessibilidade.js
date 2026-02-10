// frontend/js/acessibilidade.js
/**
 * Sistema de Ferramentas de Acessibilidade
 * Leitor de tela + Comando por voz para navegação
 */

class SistemaAcessibilidade {
    constructor() {
        this.toolsVisible = false;
        this.fontSize = 16;
        this.lineHeight = 1.5;
        this.letterSpacing = 'normal';
        this.textStyle = 'normal';
        this.highContrast = false;
        this.screenReaderActive = false;
        this.screenReaderEnabled = false;
        this.currentUtterance = null;
        this.isReadingPage = false;
        this.lastSpokenElement = null;
        this.lastSpokenTime = 0;
        
        // Sistema de comando por voz
        this.voiceControlEnabled = false;
        this.recognition = null;
        this.isListening = false;
        this.lastCommand = '';
        this.commandHistory = [];
        this.availableCommands = [
            'navegar para',
            'abrir',
            'fechar',
            'clicar em',
            'rolar para cima',
            'rolar para baixo',
            'ler página',
            'parar leitura',
            'aumentar fonte',
            'diminuir fonte',
            'alto contraste',
            'modo normal',
            'ir para início',
            'pesquisar',
            'menu',
            'ajuda',
            'desativar voz'
        ];
        
        // Controle de proteção
        this.protectionActive = false;
        this.blockNavigation = false;
        
        this.init();
    }

    init() {
        console.log('♿ Inicializando Sistema de Acessibilidade...');
        
        // Adicionar estilos
        this.addStyles();
        
        // Adicionar HTML
        this.addHTML();
        
        // Configurar eventos
        this.setupEvents();
        
        // Carregar configurações
        this.loadSettings();
        
        // Aplicar configurações
        this.applySettings();
        
        console.log('✅ Sistema carregado - Leitor: DESATIVADO | Voz: DESATIVADO');
    }

    addStyles() {
        const style = document.createElement('style');
        style.id = 'accessibility-styles';
        style.textContent = `
            /* ===== ESTILOS DA ACESSIBILIDADE ===== */
            
            /* Botão principal */
            .accessibility-toggle {
                position: fixed;
                bottom: 100px;
                right: 20px;
                width: 56px;
                height: 56px;
                background: linear-gradient(135deg, #059669 0%, #10b981 100%);
                border-radius: 16px;
                border: none;
                color: white;
                font-size: 24px;
                cursor: pointer;
                z-index: 9999;
                box-shadow: 0 6px 20px rgba(5, 150, 105, 0.25);
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .accessibility-toggle:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 25px rgba(5, 150, 105, 0.35);
            }
            
            .accessibility-toggle.active {
                background: linear-gradient(135deg, #047857 0%, #0da271 100%);
            }
            
            /* Botão de voz flutuante */
            .voice-command-toggle {
                position: fixed;
                bottom: 170px;
                right: 20px;
                width: 56px;
                height: 56px;
                background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
                border-radius: 16px;
                border: none;
                color: white;
                font-size: 20px;
                cursor: pointer;
                z-index: 9998;
                box-shadow: 0 6px 20px rgba(59, 130, 246, 0.25);
                transition: all 0.3s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                visibility: hidden;
                transform: translateY(20px);
            }
            
            .voice-command-toggle.visible {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
            }
            
            .voice-command-toggle.active {
                background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
                animation: pulseVoice 2s infinite;
            }
            
            @keyframes pulseVoice {
                0%, 100% { box-shadow: 0 6px 20px rgba(59, 130, 246, 0.25); }
                50% { box-shadow: 0 6px 30px rgba(59, 130, 246, 0.5); }
            }
            
            .voice-command-toggle:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 25px rgba(59, 130, 246, 0.35);
            }
            
            /* Indicação de foco */
            *:focus {
                outline: 2px solid #3b82f6 !important;
                outline-offset: 1px !important;
            }
            
            /* Painel de ferramentas */
            .accessibility-panel {
                position: fixed;
                bottom: 240px;
                right: 20px;
                width: 400px;
                max-width: calc(100vw - 40px);
                max-height: 70vh;
                background: white;
                border-radius: 16px;
                box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
                z-index: 10000;
                display: none;
                overflow: hidden;
                border: 1px solid #e5e7eb;
            }
            
            .accessibility-panel.visible {
                display: block;
                animation: slideIn 0.3s ease-out;
            }
            
            .accessibility-panel.hidden {
                display: none;
            }
            
            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateY(20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .panel-header {
                background: linear-gradient(135deg, #059669 0%, #10b981 100%);
                color: white;
                padding: 16px 20px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-radius: 16px 16px 0 0;
            }
            
            .panel-header h3 {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .panel-close {
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: white;
                width: 32px;
                height: 32px;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            }
            
            .panel-close:hover {
                background: rgba(255, 255, 255, 0.3);
            }
            
            .panel-body {
                padding: 20px;
                overflow-y: auto;
                max-height: calc(70vh - 120px);
            }
            
            .tool-section {
                margin-bottom: 20px;
                padding-bottom: 20px;
                border-bottom: 1px solid #e5e7eb;
            }
            
            .tool-section:last-child {
                border-bottom: none;
                margin-bottom: 0;
            }
            
            .tool-section h4 {
                margin: 0 0 12px 0;
                color: #1f2937;
                font-size: 14px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .tool-description {
                margin: 0 0 12px 0;
                color: #6b7280;
                font-size: 12px;
                line-height: 1.4;
            }
            
            /* Controle do leitor de tela e voz */
            .feature-toggle {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 12px 16px;
                background: #f3f4f6;
                border: 1px solid #e5e7eb;
                border-radius: 10px;
                margin-bottom: 16px;
            }
            
            .feature-status {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .feature-status i {
                font-size: 18px;
            }
            
            .feature-status-text {
                font-size: 14px;
                font-weight: 500;
                color: #1f2937;
            }
            
            .feature-status-desc {
                font-size: 12px;
                color: #6b7280;
            }
            
            .toggle-switch {
                position: relative;
                width: 50px;
                height: 26px;
            }
            
            .toggle-switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            
            .toggle-slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: #d1d5db;
                transition: .4s;
                border-radius: 34px;
            }
            
            .toggle-slider:before {
                position: absolute;
                content: "";
                height: 18px;
                width: 18px;
                left: 4px;
                bottom: 4px;
                background-color: white;
                transition: .4s;
                border-radius: 50%;
            }
            
            input:checked + .toggle-slider {
                background-color: #059669;
            }
            
            input:checked + .toggle-slider:before {
                transform: translateX(24px);
            }
            
            /* Status do comando de voz */
            .voice-status-panel {
                background: #f0f9ff;
                border: 1px solid #bae6fd;
                border-radius: 10px;
                padding: 12px;
                margin-bottom: 16px;
                display: none;
            }
            
            .voice-status-panel.active {
                display: block;
                animation: pulseBorder 2s infinite;
            }
            
            @keyframes pulseBorder {
                0%, 100% { border-color: #bae6fd; }
                50% { border-color: #0ea5e9; }
            }
            
            .voice-status-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
            }
            
            .voice-status-header i {
                color: #0ea5e9;
                font-size: 14px;
                animation: listeningPulse 1.5s infinite;
            }
            
            @keyframes listeningPulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.3; }
            }
            
            .voice-status-text {
                font-size: 13px;
                color: #0c4a6e;
                font-weight: 600;
            }
            
            .voice-command-display {
                font-size: 13px;
                color: #0369a1;
                background: white;
                padding: 8px 12px;
                border-radius: 6px;
                border: 1px solid #bae6fd;
                min-height: 40px;
                font-style: italic;
                word-break: break-word;
            }
            
            /* Controles do leitor e voz */
            .control-buttons-group {
                display: flex;
                gap: 8px;
                margin-top: 12px;
            }
            
            .control-btn {
                flex: 1;
                padding: 10px 12px;
                border: 1px solid #d1d5db;
                background: white;
                border-radius: 8px;
                font-size: 13px;
                color: #374151;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
            }
            
            .control-btn:hover {
                background: #f3f4f6;
            }
            
            .control-btn.active {
                background: #059669;
                color: white;
                border-color: #059669;
            }
            
            .control-btn.voice-active {
                background: #3b82f6;
                color: white;
                border-color: #3b82f6;
            }
            
            .control-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            /* Lista de comandos de voz */
            .voice-commands-list {
                display: none;
                grid-template-columns: repeat(2, 1fr);
                gap: 8px;
                margin-top: 12px;
            }
            
            .voice-commands-list.visible {
                display: grid;
                animation: fadeIn 0.3s ease;
            }
            
            .voice-command-item {
                font-size: 11px;
                color: #4b5563;
                background: #f9fafb;
                padding: 6px 8px;
                border-radius: 6px;
                border: 1px solid #e5e7eb;
                line-height: 1.3;
            }
            
            .voice-command-item kbd {
                background: white;
                padding: 1px 4px;
                border-radius: 3px;
                border: 1px solid #d1d5db;
                font-family: monospace;
                font-size: 10px;
                display: inline-block;
                margin-top: 2px;
            }
            
            /* Controles de fonte */
            .font-controls {
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            
            .control-group {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            
            .control-group label {
                font-size: 13px;
                color: #374151;
                font-weight: 500;
            }
            
            .font-size-buttons {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .font-size-btn {
                width: 36px;
                height: 36px;
                border-radius: 8px;
                border: 1px solid #d1d5db;
                background: white;
                color: #374151;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            }
            
            .font-size-btn:hover {
                background: #f3f4f6;
            }
            
            .font-size-display {
                min-width: 60px;
                text-align: center;
                font-size: 14px;
                color: #6b7280;
                font-weight: 500;
            }
            
            .style-buttons {
                display: flex;
                gap: 8px;
            }
            
            .style-btn {
                flex: 1;
                padding: 8px 12px;
                border: 1px solid #d1d5db;
                background: white;
                border-radius: 8px;
                font-size: 13px;
                color: #374151;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .style-btn:hover {
                background: #f3f4f6;
            }
            
            .style-btn.active {
                background: #10b981;
                color: white;
                border-color: #10b981;
            }
            
            /* Navegação */
            .navigation-tools {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 8px;
            }
            
            .nav-tool {
                padding: 12px;
                border: 1px solid #e5e7eb;
                background: white;
                border-radius: 10px;
                cursor: pointer;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 6px;
                transition: all 0.2s ease;
            }
            
            .nav-tool:hover {
                background: #f9fafb;
            }
            
            .nav-tool.active {
                background: #10b981;
                color: white;
                border-color: #10b981;
            }
            
            .nav-tool i {
                font-size: 18px;
            }
            
            .nav-tool span {
                font-size: 11px;
                font-weight: 500;
                text-align: center;
            }
            
            /* Atalhos */
            .shortcuts {
                background: #f9fafb;
                border-radius: 10px;
                padding: 16px;
                margin-top: 20px;
            }
            
            .shortcut-list {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 10px;
            }
            
            .shortcut-item {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .shortcut-item kbd {
                background: white;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                padding: 2px 6px;
                font-size: 11px;
                font-family: monospace;
                color: #374151;
                min-width: 40px;
                text-align: center;
            }
            
            .shortcut-item span {
                font-size: 11px;
                color: #6b7280;
            }
            
            .panel-footer {
                padding: 12px 20px;
                background: #f9fafb;
                border-top: 1px solid #e5e7eb;
                text-align: center;
            }
            
            .panel-footer small {
                font-size: 11px;
                color: #9ca3af;
            }
            
            /* Modo alto contraste */
            .high-contrast {
                background: #000 !important;
                color: #fff !important;
            }
            
            .high-contrast * {
                background-color: #000 !important;
                color: #fff !important;
                border-color: #fff !important;
            }
            
            .high-contrast a {
                color: #ffff00 !important;
            }
            
            .high-contrast button {
                background: #000 !important;
                color: #fff !important;
                border: 2px solid #fff !important;
            }
            
            /* Feedback sutil de leitura */
            .reading-feedback {
                position: fixed;
                bottom: 10px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 8px 16px;
                border-radius: 20px;
                font-size: 12px;
                z-index: 10001;
                display: none;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                max-width: 90%;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .reading-feedback.show {
                display: flex;
                align-items: center;
                gap: 8px;
                animation: fadeInOut 2s ease;
            }
            
            @keyframes fadeInOut {
                0% { opacity: 0; }
                10% { opacity: 1; }
                90% { opacity: 1; }
                100% { opacity: 0; }
            }
            
            /* Overlay de proteção */
            .protection-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.95);
                z-index: 20000;
                display: none;
                align-items: center;
                justify-content: center;
                color: white;
                text-align: center;
                padding: 20px;
            }
            
            .protection-overlay.active {
                display: flex;
                animation: fadeIn 0.1s ease;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            .protection-content {
                max-width: 500px;
                background: rgba(220, 38, 38, 0.95);
                padding: 40px;
                border-radius: 20px;
                box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5);
                border: 3px solid white;
            }
            
            .protection-content h3 {
                margin: 0 0 20px 0;
                font-size: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 15px;
            }
            
            .protection-content p {
                margin: 0 0 25px 0;
                font-size: 18px;
                line-height: 1.6;
            }
            
            .protection-buttons {
                display: flex;
                gap: 15px;
            }
            
            .protection-btn {
                flex: 1;
                padding: 15px;
                border: none;
                border-radius: 12px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
            }
            
            .protection-btn.cancel {
                background: white;
                color: #dc2626;
            }
            
            .protection-btn.cancel:hover {
                background: #f3f4f6;
                transform: scale(1.05);
            }
            
            .protection-btn.confirm {
                background: #000;
                color: white;
            }
            
            .protection-btn.confirm:hover {
                background: #333;
                transform: scale(1.05);
            }
            
            /* Indicador de proteção */
            .protection-indicator {
                position: fixed;
                top: 10px;
                right: 10px;
                background: #dc2626;
                color: white;
                padding: 8px 15px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 600;
                z-index: 10003;
                display: none;
                align-items: center;
                gap: 8px;
                box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
            }
            
            .protection-indicator.active {
                display: flex;
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.7); }
                70% { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); }
                100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0); }
            }
            
            /* Responsividade */
            @media (max-width: 768px) {
                .accessibility-toggle {
                    bottom: 80px;
                    right: 16px;
                }
                
                .voice-command-toggle {
                    bottom: 150px;
                    right: 16px;
                }
                
                .accessibility-panel {
                    width: calc(100vw - 32px);
                    bottom: 200px;
                    right: 16px;
                    max-height: 60vh;
                }
                
                .panel-body {
                    max-height: calc(60vh - 120px);
                }
                
                .control-buttons-group {
                    flex-wrap: wrap;
                }
                
                .control-btn {
                    min-width: 120px;
                }
                
                .voice-commands-list {
                    grid-template-columns: 1fr;
                }
                
                .protection-buttons {
                    flex-direction: column;
                }
                
                .protection-content {
                    padding: 25px;
                }
                
                .protection-content h3 {
                    font-size: 20px;
                }
                
                .protection-content p {
                    font-size: 16px;
                }
            }
            
            @media (max-width: 480px) {
                .accessibility-toggle {
                    width: 48px;
                    height: 48px;
                    font-size: 20px;
                    bottom: 70px;
                }
                
                .voice-command-toggle {
                    width: 48px;
                    height: 48px;
                    font-size: 18px;
                    bottom: 130px;
                }
                
                .accessibility-panel {
                    width: calc(100vw - 24px);
                    right: 12px;
                    left: 12px;
                }
                
                .navigation-tools,
                .shortcut-list {
                    grid-template-columns: 1fr;
                }
                
                .voice-commands-list {
                    grid-template-columns: 1fr;
                }
            }
        `;
        
        document.head.appendChild(style);
    }

    addHTML() {
        // Botão de Acessibilidade
        const toggleButton = document.createElement('button');
        toggleButton.id = 'accessibilityToggle';
        toggleButton.className = 'accessibility-toggle';
        toggleButton.setAttribute('aria-label', 'Abrir ferramentas de acessibilidade');
        toggleButton.setAttribute('title', 'Acessibilidade');
        toggleButton.innerHTML = '<i class="fas fa-universal-access"></i>';
        document.body.appendChild(toggleButton);
        
        // Botão de Comando por Voz
        const voiceToggleButton = document.createElement('button');
        voiceToggleButton.id = 'voiceCommandToggle';
        voiceToggleButton.className = 'voice-command-toggle';
        voiceToggleButton.setAttribute('aria-label', 'Ativar/desativar comando por voz');
        voiceToggleButton.setAttribute('title', 'Comando por voz');
        voiceToggleButton.innerHTML = '<i class="fas fa-microphone"></i>';
        document.body.appendChild(voiceToggleButton);

        // Painel de Ferramentas
        const panelHTML = `
            <div class="accessibility-panel hidden" id="accessibilityPanel" aria-hidden="true">
                <div class="panel-header">
                    <h3><i class="fas fa-universal-access"></i> Ferramentas de Acessibilidade</h3>
                    <button class="panel-close" id="closePanel" aria-label="Fechar painel">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div class="panel-body">
                    <!-- Seção: Leitor de Tela -->
                    <div class="tool-section">
                        <h4><i class="fas fa-headphones"></i> Leitor de Tela</h4>
                        <p class="tool-description">Ative para ler elementos automaticamente ao navegar.</p>
                        
                        <div class="feature-toggle">
                            <div class="feature-status">
                                <i class="fas fa-volume-up"></i>
                                <div>
                                    <div class="feature-status-text">Leitor de Tela</div>
                                    <div class="feature-status-desc">Lê elementos automaticamente</div>
                                </div>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" id="screenReaderToggle">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                        
                        <div class="control-buttons-group">
                            <button class="control-btn" id="readPageBtn">
                                <i class="fas fa-play"></i>
                                <span>Ler Página</span>
                            </button>
                            <button class="control-btn" id="pauseReaderBtn" disabled>
                                <i class="fas fa-pause"></i>
                                <span>Pausar</span>
                            </button>
                            <button class="control-btn" id="stopReaderBtn" disabled>
                                <i class="fas fa-stop"></i>
                                <span>Parar</span>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Seção: Comando por Voz -->
                    <div class="tool-section">
                        <h4><i class="fas fa-microphone-alt"></i> Comando por Voz</h4>
                        <p class="tool-description">Controle o site usando comandos de voz. Ative e diga o que deseja fazer.</p>
                        
                        <div class="feature-toggle">
                            <div class="feature-status">
                                <i class="fas fa-microphone"></i>
                                <div>
                                    <div class="feature-status-text">Controle por Voz</div>
                                    <div class="feature-status-desc">Navegue com comandos de voz</div>
                                </div>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" id="voiceControlToggle">
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                        
                        <!-- Painel de status do comando de voz -->
                        <div class="voice-status-panel" id="voiceStatusPanel">
                            <div class="voice-status-header">
                                <i class="fas fa-circle"></i>
                                <span class="voice-status-text" id="voiceStatusText">Ouvindo comandos...</span>
                            </div>
                            <div class="voice-command-display" id="voiceCommandDisplay">
                                Aguardando comando...
                            </div>
                        </div>
                        
                        <div class="control-buttons-group">
                            <button class="control-btn" id="startVoiceBtn">
                                <i class="fas fa-microphone"></i>
                                <span>Iniciar Voz</span>
                            </button>
                            <button class="control-btn" id="stopVoiceBtn" disabled>
                                <i class="fas fa-microphone-slash"></i>
                                <span>Parar Voz</span>
                            </button>
                            <button class="control-btn" id="showVoiceCommandsBtn">
                                <i class="fas fa-list"></i>
                                <span>Comandos</span>
                            </button>
                        </div>
                        
                        <!-- Lista de comandos de voz -->
                        <div class="voice-commands-list" id="voiceCommandsList">
                            <div class="voice-command-item"><kbd>navegar para [página]</kbd></div>
                            <div class="voice-command-item"><kbd>abrir [menu]</kbd></div>
                            <div class="voice-command-item"><kbd>clicar em [botão]</kbd></div>
                            <div class="voice-command-item"><kbd>rolar para cima</kbd></div>
                            <div class="voice-command-item"><kbd>rolar para baixo</kbd></div>
                            <div class="voice-command-item"><kbd>ler página</kbd></div>
                            <div class="voice-command-item"><kbd>parar leitura</kbd></div>
                            <div class="voice-command-item"><kbd>aumentar fonte</kbd></div>
                            <div class="voice-command-item"><kbd>diminuir fonte</kbd></div>
                            <div class="voice-command-item"><kbd>alto contraste</kbd></div>
                            <div class="voice-command-item"><kbd>modo normal</kbd></div>
                            <div class="voice-command-item"><kbd>desativar voz</kbd></div>
                        </div>
                    </div>
                    
                    <!-- Seção: Aparência -->
                    <div class="tool-section">
                        <h4><i class="fas fa-font"></i> Aparência</h4>
                        
                        <div class="font-controls">
                            <div class="control-group">
                                <label>Tamanho da Fonte</label>
                                <div class="font-size-buttons">
                                    <button class="font-size-btn" data-action="decrease">
                                        A-
                                    </button>
                                    <span class="font-size-display" id="fontSizeDisplay">${this.fontSize}px</span>
                                    <button class="font-size-btn" data-action="increase">
                                        A+
                                    </button>
                                </div>
                            </div>
                            
                            <div class="control-group">
                                <label>Estilo do Texto</label>
                                <div class="style-buttons">
                                    <button class="style-btn" data-style="normal">
                                        Normal
                                    </button>
                                    <button class="style-btn" data-style="bold">
                                        Negrito
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Seção: Navegação -->
                    <div class="tool-section">
                        <h4><i class="fas fa-compass"></i> Navegação</h4>
                        
                        <div class="navigation-tools">
                            <button class="nav-tool" id="highContrast">
                                <i class="fas fa-adjust"></i>
                                <span>Contraste</span>
                            </button>
                            
                            <button class="nav-tool" id="scrollToTop">
                                <i class="fas fa-arrow-up"></i>
                                <span>Topo</span>
                            </button>
                            
                            <button class="nav-tool" id="scrollToContent">
                                <i class="fas fa-align-left"></i>
                                <span>Conteúdo</span>
                            </button>
                            
                            <button class="nav-tool" id="restoreDefaults">
                                <i class="fas fa-undo"></i>
                                <span>Padrão</span>
                            </button>
                        </div>
                    </div>
                    
                    <!-- Seção: Atalhos -->
                    <div class="tool-section shortcuts">
                        <h4><i class="fas fa-keyboard"></i> Atalhos de Teclado</h4>
                        <div class="shortcut-list">
                            <div class="shortcut-item">
                                <kbd>Alt</kbd> + <kbd>A</kbd>
                                <span>Abrir Painel</span>
                            </div>
                            <div class="shortcut-item">
                                <kbd>Alt</kbd> + <kbd>V</kbd>
                                <span>Ativar Voz</span>
                            </div>
                            <div class="shortcut-item">
                                <kbd>Alt</kbd> + <kbd>R</kbd>
                                <span>Ler Página</span>
                            </div>
                            <div class="shortcut-item">
                                <kbd>Tab</kbd>
                                <span>Navegar</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="panel-footer">
                    <small id="statusDisplay">Leitor: DESATIVADO | Voz: DESATIVADO</small>
                </div>
            </div>
            
            <!-- Feedback sutil -->
            <div class="reading-feedback" id="readingFeedback">
                <i class="fas fa-volume-up"></i>
                <span id="feedbackText"></span>
            </div>
            
            <!-- Overlay de proteção -->
            <div class="protection-overlay" id="protectionOverlay">
                <div class="protection-content">
                    <h3><i class="fas fa-shield-alt"></i> LEITOR DE TELA ATIVO</h3>
                    <p>⚠️ <strong>NÃO FECHE A PÁGINA!</strong></p>
                    <p>O leitor de tela está em uso. Para garantir a acessibilidade, você precisa parar a leitura antes de fechar ou navegar para outra página.</p>
                    <p><strong>Instruções:</strong><br>
                    1. Clique em "Parar Leitura" abaixo<br>
                    2. Depois tente novamente</p>
                    <div class="protection-buttons">
                        <button class="protection-btn cancel" id="protectionCancel">
                            <i class="fas fa-times"></i> Continuar Lendo
                        </button>
                        <button class="protection-btn confirm" id="protectionConfirm">
                            <i class="fas fa-stop"></i> Parar Leitura
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Indicador de proteção -->
            <div class="protection-indicator" id="protectionIndicator">
                <i class="fas fa-shield-alt"></i>
                <span>PROTEÇÃO ATIVA - NÃO FECHE</span>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', panelHTML);
    }

    setupEvents() {
        // Botão de abrir/fechar painel
        document.getElementById('accessibilityToggle').addEventListener('click', () => {
            this.togglePanel();
        });

        // Botão de comando por voz
        document.getElementById('voiceCommandToggle').addEventListener('click', () => {
            this.toggleVoiceControl();
        });

        // Botão de fechar painel
        document.getElementById('closePanel').addEventListener('click', () => {
            this.closePanel();
        });

        // Fechar com ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.toolsVisible) {
                this.closePanel();
            }
            
            // Atalhos de teclado
            if (e.altKey) {
                switch(e.key.toLowerCase()) {
                    case 'a':
                        e.preventDefault();
                        this.togglePanel();
                        break;
                    case 'v':
                        e.preventDefault();
                        this.toggleVoiceControl();
                        break;
                    case 'r':
                        e.preventDefault();
                        this.readEntirePage();
                        break;
                    case ' ':
                        if (this.isReadingPage) {
                            e.preventDefault();
                            this.togglePauseReader();
                        }
                        break;
                }
            }
        });

        // Toggle do leitor de tela
        document.getElementById('screenReaderToggle').addEventListener('change', (e) => {
            this.toggleScreenReader(e.target.checked);
        });

        // Toggle do comando por voz
        document.getElementById('voiceControlToggle').addEventListener('change', (e) => {
            this.toggleVoiceControl(e.target.checked);
        });

        // Controles do leitor
        document.getElementById('readPageBtn').addEventListener('click', () => {
            this.readEntirePage();
        });

        document.getElementById('pauseReaderBtn').addEventListener('click', () => {
            this.togglePauseReader();
        });

        document.getElementById('stopReaderBtn').addEventListener('click', () => {
            this.stopReader();
        });

        // Controles de voz
        document.getElementById('startVoiceBtn').addEventListener('click', () => {
            this.startVoiceRecognition();
        });

        document.getElementById('stopVoiceBtn').addEventListener('click', () => {
            this.stopVoiceRecognition();
        });

        document.getElementById('showVoiceCommandsBtn').addEventListener('click', () => {
            this.toggleVoiceCommandsList();
        });

        // Controles de fonte
        document.querySelectorAll('.font-size-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                this.adjustFontSize(action);
            });
        });

        // Estilos de texto
        document.querySelectorAll('.style-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const style = e.target.dataset.style;
                this.setTextStyle(style);
            });
        });

        // Ferramentas de navegação
        document.getElementById('highContrast').addEventListener('click', () => {
            this.toggleHighContrast();
        });

        document.getElementById('scrollToTop').addEventListener('click', () => {
            this.scrollToTop();
        });

        document.getElementById('scrollToContent').addEventListener('click', () => {
            this.scrollToContent();
        });

        document.getElementById('restoreDefaults').addEventListener('click', () => {
            this.restoreDefaults();
        });

        // Configurar eventos de leitura automática
        this.setupAutoReading();

        // Eventos do leitor
        window.speechSynthesis.addEventListener('end', () => {
            this.isReadingPage = false;
            this.protectionActive = false;
            this.hideProtectionIndicator();
            this.updateReaderControls();
        });

        window.speechSynthesis.addEventListener('error', () => {
            this.isReadingPage = false;
            this.protectionActive = false;
            this.hideProtectionIndicator();
            this.updateReaderControls();
        });
        
        // Configurar proteção
        this.setupProtection();
    }
    
    // ===== SISTEMA DE COMANDO POR VOZ =====
    
    toggleVoiceControl(enable) {
        if (enable !== undefined) {
            this.voiceControlEnabled = enable;
        } else {
            this.voiceControlEnabled = !this.voiceControlEnabled;
        }
        
        const toggle = document.getElementById('voiceControlToggle');
        const shortcutBtn = document.getElementById('voiceCommandToggle');
        
        if (toggle) toggle.checked = this.voiceControlEnabled;
        
        if (this.voiceControlEnabled) {
            this.initializeSpeechRecognition();
            shortcutBtn.classList.add('visible');
            
            if (!this.isListening) {
                this.startVoiceRecognition();
            }
            
            this.speak('Controle por voz ativado. Diga "ajuda" para ver os comandos disponíveis.');
        } else {
            this.stopVoiceRecognition();
            shortcutBtn.classList.remove('visible', 'active');
            this.speak('Controle por voz desativado.');
        }
        
        this.updateStatus();
        this.saveSettings();
    }
    
    initializeSpeechRecognition() {
        if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            alert('Seu navegador não suporta reconhecimento de voz. Use Chrome, Edge ou Safari.');
            this.voiceControlEnabled = false;
            document.getElementById('voiceControlToggle').checked = false;
            return;
        }
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        
        this.recognition.lang = 'pt-BR';
        this.recognition.continuous = true;
        this.recognition.interimResults = false;
        this.recognition.maxAlternatives = 1;
        
        this.recognition.onstart = () => {
            this.isListening = true;
            this.updateVoiceControls();
            this.showVoiceStatus(true);
            this.speak('Ouvindo comandos...');
        };
        
        this.recognition.onresult = (event) => {
            const last = event.results.length - 1;
            const transcript = event.results[last][0].transcript.trim().toLowerCase();
            
            console.log('Comando reconhecido:', transcript);
            this.lastCommand = transcript;
            this.commandHistory.push(transcript);
            
            this.displayVoiceCommand(transcript);
            this.processVoiceCommand(transcript);
        };
        
        this.recognition.onerror = (event) => {
            console.error('Erro no reconhecimento de voz:', event.error);
            
            if (event.error === 'no-speech') {
                this.speak('Não ouvi nada. Tente novamente.');
            } else if (event.error === 'audio-capture') {
                this.speak('Não consegui acessar o microfone. Verifique as permissões.');
            } else if (event.error === 'not-allowed') {
                this.speak('Permissão para usar microfone negada. Ative nas configurações do navegador.');
            }
            
            this.stopVoiceRecognition();
        };
        
        this.recognition.onend = () => {
            this.isListening = false;
            this.updateVoiceControls();
            this.showVoiceStatus(false);
            
            // Reiniciar se ainda estiver ativado
            if (this.voiceControlEnabled) {
                setTimeout(() => {
                    if (this.voiceControlEnabled && !this.isListening) {
                        this.startVoiceRecognition();
                    }
                }, 1000);
            }
        };
    }
    
    startVoiceRecognition() {
        if (!this.voiceControlEnabled) {
            alert('Ative o controle por voz primeiro.');
            return;
        }
        
        if (!this.recognition) {
            this.initializeSpeechRecognition();
        }
        
        try {
            this.recognition.start();
            this.speak('Ouvindo...');
        } catch (error) {
            console.error('Erro ao iniciar reconhecimento:', error);
            this.speak('Erro ao acessar microfone.');
        }
    }
    
    stopVoiceRecognition() {
        if (this.recognition && this.isListening) {
            this.recognition.stop();
            this.isListening = false;
            this.updateVoiceControls();
            this.showVoiceStatus(false);
            this.speak('Parando escuta.');
        }
    }
    
    processVoiceCommand(command) {
        console.log('Processando comando:', command);
        
        // Normalizar comando
        const normalizedCmd = command.toLowerCase();
        
        // Comandos de navegação
        if (normalizedCmd.includes('navegar para') || normalizedCmd.includes('ir para')) {
            const page = this.extractPageFromCommand(command);
            this.navigateToPage(page);
        }
        // Comandos de ação
        else if (normalizedCmd.includes('abrir')) {
            const target = this.extractTargetFromCommand(command);
            this.openTarget(target);
        }
        else if (normalizedCmd.includes('clicar em') || normalizedCmd.includes('clique em')) {
            const target = this.extractTargetFromCommand(command);
            this.clickOnTarget(target);
        }
        else if (normalizedCmd.includes('rolar para cima')) {
            window.scrollBy(0, -300);
            this.speak('Rolando para cima.');
        }
        else if (normalizedCmd.includes('rolar para baixo')) {
            window.scrollBy(0, 300);
            this.speak('Rolando para baixo.');
        }
        else if (normalizedCmd.includes('ler página') || normalizedCmd.includes('ler tudo')) {
            this.readEntirePage();
        }
        else if (normalizedCmd.includes('parar leitura') || normalizedCmd.includes('parar de ler')) {
            this.stopReader();
        }
        // Comandos de aparência
        else if (normalizedCmd.includes('aumentar fonte') || normalizedCmd.includes('aumentar texto')) {
            this.adjustFontSize('increase');
        }
        else if (normalizedCmd.includes('diminuir fonte') || normalizedCmd.includes('diminuir texto')) {
            this.adjustFontSize('decrease');
        }
        else if (normalizedCmd.includes('alto contraste')) {
            this.toggleHighContrast();
        }
        else if (normalizedCmd.includes('modo normal') || normalizedCmd.includes('contraste normal')) {
            document.body.classList.remove('high-contrast');
            document.getElementById('highContrast').classList.remove('active');
            this.highContrast = false;
            this.speak('Contraste normal ativado.');
        }
        else if (normalizedCmd.includes('ir para início') || normalizedCmd.includes('topo')) {
            this.scrollToTop();
        }
        // Comandos do sistema
        else if (normalizedCmd.includes('pesquisar')) {
            this.focusSearch();
        }
        else if (normalizedCmd.includes('menu')) {
            this.openMenu();
        }
        else if (normalizedCmd.includes('ajuda') || normalizedCmd.includes('comandos')) {
            this.showHelp();
        }
        else if (normalizedCmd.includes('desativar voz') || normalizedCmd.includes('parar voz')) {
            this.toggleVoiceControl(false);
        }
        else if (normalizedCmd.includes('fechar') || normalizedCmd.includes('sair')) {
            this.closePanel();
            this.speak('Fechando painel.');
        }
        else {
            this.speak(`Comando não reconhecido: ${command}. Diga "ajuda" para ver os comandos disponíveis.`);
        }
    }
    
    extractPageFromCommand(command) {
        const patterns = [
            /navegar para (.*)/i,
            /ir para (.*)/i,
            /vai para (.*)/i
        ];
        
        for (const pattern of patterns) {
            const match = command.match(pattern);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        
        return '';
    }
    
    extractTargetFromCommand(command) {
        const patterns = [
            /abrir (.*)/i,
            /clicar em (.*)/i,
            /clique em (.*)/i,
            /clicar no (.*)/i,
            /clique no (.*)/i,
            /clicar na (.*)/i,
            /clique na (.*)/i
        ];
        
        for (const pattern of patterns) {
            const match = command.match(pattern);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        
        return '';
    }
    
    navigateToPage(page) {
        const pageMap = {
            'início': '/',
            'home': '/',
            'página inicial': '/',
            'produtos': '/produtos',
            'serviços': '/servicos',
            'sobre': '/sobre',
            'contato': '/contato',
            'blog': '/blog',
            'notícias': '/noticias',
            'ajuda': '/ajuda',
            'suporte': '/suporte'
        };
        
        const normalizedPage = page.toLowerCase();
        
        if (pageMap[normalizedPage]) {
            this.speak(`Navegando para ${page}.`);
            setTimeout(() => {
                window.location.href = pageMap[normalizedPage];
            }, 1000);
        } else {
            this.speak(`Página ${page} não encontrada.`);
        }
    }
    
    openTarget(target) {
        const targetMap = {
            'menu': '.menu-button, .hamburger-menu, [aria-label="menu"]',
            'painel': '#accessibilityToggle',
            'pesquisa': 'input[type="search"], .search-box, .search-button',
            'login': '.login-button, .signin-button, [href*="login"]',
            'carrinho': '.cart-button, .shopping-cart, [aria-label="carrinho"]',
            'conta': '.account-button, .profile-button, [href*="account"]'
        };
        
        const normalizedTarget = target.toLowerCase();
        
        if (targetMap[normalizedTarget]) {
            const element = document.querySelector(targetMap[normalizedTarget]);
            if (element) {
                element.click();
                this.speak(`${target} aberto.`);
            } else {
                this.speak(`${target} não encontrado.`);
            }
        } else {
            const elements = Array.from(document.querySelectorAll('a, button, [role="button"]'));
            const found = elements.find(el => {
                const text = el.textContent.toLowerCase();
                return text.includes(normalizedTarget);
            });
            
            if (found) {
                found.click();
                this.speak(`${target} aberto.`);
            } else {
                this.speak(`${target} não encontrado.`);
            }
        }
    }
    
    clickOnTarget(target) {
        const elements = Array.from(document.querySelectorAll('a, button, [role="button"], input[type="button"], input[type="submit"]'));
        
        let found = elements.find(el => {
            const text = el.textContent.toLowerCase().trim();
            return text === target.toLowerCase() || 
                   text.includes(target.toLowerCase()) ||
                   el.getAttribute('aria-label')?.toLowerCase().includes(target.toLowerCase());
        });
        
        if (!found) {
            found = document.getElementById(target) || 
                   document.querySelector(`.${target}`) ||
                   document.querySelector(`[aria-label*="${target}"]`);
        }
        
        if (found) {
            found.click();
            found.focus();
            this.speak(`Clicado em ${target}.`);
        } else {
            this.speak(`${target} não encontrado para clique.`);
        }
    }
    
    focusSearch() {
        const searchInput = document.querySelector('input[type="search"], input[name="search"], .search-input');
        if (searchInput) {
            searchInput.focus();
            this.speak('Campo de pesquisa focado.');
        } else {
            this.speak('Campo de pesquisa não encontrado.');
        }
    }
    
    openMenu() {
        const menuButton = document.querySelector('.menu-button, .hamburger-menu, [aria-label="menu"], button:has(i.fa-bars)');
        if (menuButton) {
            menuButton.click();
            this.speak('Menu aberto.');
        } else {
            this.speak('Botão de menu não encontrado.');
        }
    }
    
    showHelp() {
        const commands = this.availableCommands.join(', ');
        this.speak(`Comandos disponíveis: ${commands}.`);
        
        this.toggleVoiceCommandsList();
    }
    
    toggleVoiceCommandsList() {
        const list = document.getElementById('voiceCommandsList');
        const button = document.getElementById('showVoiceCommandsBtn');
        
        if (list.style.display === 'none' || list.style.display === '') {
            list.style.display = 'grid';
            button.innerHTML = '<i class="fas fa-times"></i><span>Fechar</span>';
            button.classList.add('active');
        } else {
            list.style.display = 'none';
            button.innerHTML = '<i class="fas fa-list"></i><span>Comandos</span>';
            button.classList.remove('active');
        }
    }
    
    displayVoiceCommand(command) {
        const display = document.getElementById('voiceCommandDisplay');
        if (display) {
            display.textContent = command;
            
            display.style.fontWeight = 'bold';
            display.style.color = '#059669';
            
            setTimeout(() => {
                display.style.fontWeight = 'normal';
                display.style.color = '#0369a1';
            }, 1000);
        }
    }
    
    showVoiceStatus(show) {
        const statusPanel = document.getElementById('voiceStatusPanel');
        const shortcutBtn = document.getElementById('voiceCommandToggle');
        
        if (show) {
            statusPanel?.classList.add('active');
            shortcutBtn?.classList.add('active');
        } else {
            statusPanel?.classList.remove('active');
            shortcutBtn?.classList.remove('active');
        }
    }
    
    updateVoiceControls() {
        const startBtn = document.getElementById('startVoiceBtn');
        const stopBtn = document.getElementById('stopVoiceBtn');
        
        if (this.isListening) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
            startBtn.innerHTML = '<i class="fas fa-microphone-alt"></i><span>Ouvindo...</span>';
        } else {
            startBtn.disabled = false;
            stopBtn.disabled = true;
            startBtn.innerHTML = '<i class="fas fa-microphone"></i><span>Iniciar Voz</span>';
        }
    }
    
    updateStatus() {
        const statusDisplay = document.getElementById('statusDisplay');
        if (statusDisplay) {
            const readerStatus = this.screenReaderEnabled ? 'ATIVADO' : 'DESATIVADO';
            const voiceStatus = this.voiceControlEnabled ? 'ATIVADO' : 'DESATIVADO';
            statusDisplay.textContent = `Leitor: ${readerStatus} | Voz: ${voiceStatus}`;
        }
    }
    
    // ===== MÉTODOS EXISTENTES =====
    
    setupAutoReading() {
        // Só configura se o leitor estiver ativado
        if (!this.screenReaderEnabled) return;
        
        // 1. Leitura ao focar com Tab
        document.addEventListener('focusin', (e) => {
            if (this.screenReaderEnabled && !this.isReadingPage) {
                this.readFocusedElement(e.target);
            }
        });

        // 2. Leitura ao passar mouse
        let mouseoverTimer;
        document.addEventListener('mouseover', (e) => {
            if (!this.screenReaderEnabled || this.isReadingPage) return;
            
            clearTimeout(mouseoverTimer);
            mouseoverTimer = setTimeout(() => {
                if (this.shouldReadElement(e.target)) {
                    this.readElement(e.target, false);
                }
            }, 300);
        });

        // 3. Leitura ao clicar
        document.addEventListener('click', (e) => {
            if (this.screenReaderEnabled && !this.isReadingPage) {
                const element = e.target;
                if (this.isInteractiveElement(element)) {
                    this.readElement(element, true);
                }
            }
        });
    }

    toggleScreenReader(enable) {
        this.screenReaderEnabled = enable;
        
        if (enable) {
            this.enhanceAccessibility();
            this.setupAutoReading();
            setTimeout(() => {
                this.speak('Leitor de tela ativado. Navegue com Tab ou passe o mouse sobre os elementos.');
            }, 500);
        } else {
            if (window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
                this.isReadingPage = false;
                this.protectionActive = false;
                this.hideProtectionIndicator();
            }
            this.speak('Leitor de tela desativado.');
        }
        
        this.updateStatus();
        this.saveSettings();
    }

    enhanceAccessibility() {
        document.querySelectorAll('button:not([aria-label])').forEach(button => {
            if (!button.textContent.trim()) {
                const icon = button.querySelector('i');
                if (icon && icon.className) {
                    const iconClass = icon.className;
                    if (iconClass.includes('fa-search')) button.setAttribute('aria-label', 'Buscar');
                    else if (iconClass.includes('fa-bars')) button.setAttribute('aria-label', 'Menu');
                    else if (iconClass.includes('fa-times')) button.setAttribute('aria-label', 'Fechar');
                }
            }
        });
        
        document.querySelectorAll('img:not([alt])').forEach(img => {
            if (!img.getAttribute('alt')) {
                img.setAttribute('alt', 'Imagem');
            }
        });
    }

    readFocusedElement(element) {
        if (!this.screenReaderEnabled || !element || this.isReadingPage) return;
        
        if (this.lastSpokenElement === element && 
            Date.now() - this.lastSpokenTime < 1000) {
            return;
        }
        
        this.lastSpokenElement = element;
        this.lastSpokenTime = Date.now();
        
        this.readElement(element, false);
    }

    shouldReadElement(element) {
        if (!element || element.offsetWidth === 0 || element.offsetHeight === 0) {
            return false;
        }
        
        const tagName = element.tagName.toLowerCase();
        const ignoreTags = ['div', 'span', 'section', 'article'];
        
        if (ignoreTags.includes(tagName)) {
            const text = element.textContent || element.innerText;
            if (!text || text.trim().length < 3) {
                return false;
            }
        }
        
        if (this.lastSpokenElement === element && 
            Date.now() - this.lastSpokenTime < 1500) {
            return false;
        }
        
        return true;
    }

    isInteractiveElement(element) {
        const tagName = element.tagName.toLowerCase();
        return ['a', 'button', 'input', 'select', 'textarea'].includes(tagName) ||
               element.getAttribute('role') === 'button' ||
               element.getAttribute('role') === 'link' ||
               element.onclick ||
               element.closest('a, button, [role="button"], [role="link"]');
    }

    readElement(element, isClick = false) {
        if (!this.screenReaderEnabled || !element || this.isReadingPage) return;
        
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        
        const description = this.getElementDescription(element, isClick);
        
        if (description) {
            this.lastSpokenElement = element;
            this.lastSpokenTime = Date.now();
            
            this.showFeedback(description);
            this.speak(description);
        }
    }

    getElementDescription(element, isClick = false) {
        let description = '';
        const tagName = element.tagName.toLowerCase();
        
        if (tagName === 'a') {
            const text = element.textContent.trim() || 'link';
            const href = element.getAttribute('href');
            description = `Link: ${text}`;
            if (href && href.startsWith('http')) {
                description += '. Link externo';
            }
        }
        else if (tagName === 'button') {
            const text = element.textContent.trim();
            description = `Botão: ${text || 'sem texto'}`;
        }
        else if (tagName === 'input') {
            const type = element.type || 'text';
            const placeholder = element.placeholder || '';
            const value = element.value || '';
            
            if (type === 'submit' || type === 'button') {
                description = `Botão: ${value || 'enviar'}`;
            } else {
                description = `Campo ${type}: ${placeholder}`;
                if (value) {
                    description += `. Valor: ${value}`;
                }
            }
        }
        else if (tagName === 'img') {
            const alt = element.getAttribute('alt') || 'imagem';
            description = `Imagem: ${alt}`;
        }
        else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) {
            const text = element.textContent.trim();
            const level = tagName.substring(1);
            description = `Título nível ${level}: ${text}`;
        }
        else if (tagName === 'p') {
            const text = element.textContent.trim();
            if (text.length > 0) {
                description = `Parágrafo: ${text.substring(0, 100)}`;
            }
        }
        else if (['li', 'td'].includes(tagName)) {
            const text = element.textContent.trim();
            if (text.length > 0) {
                description = text.substring(0, 80);
            }
        }
        else {
            const text = element.textContent || element.innerText;
            if (text && text.trim().length > 2) {
                const cleanText = text.trim().substring(0, 80);
                description = cleanText;
            }
        }
        
        if (element.disabled) {
            description += ' (desabilitado)';
        }
        
        if (element.checked) {
            description += ' (marcado)';
        }
        
        if (isClick) {
            description = `Clicado: ${description}`;
        }
        
        if (tagName === 'li') {
            const parent = element.parentElement;
            if (parent && parent.tagName.toLowerCase() === 'ul') {
                const index = Array.from(parent.children).indexOf(element) + 1;
                const total = parent.children.length;
                description = `Item ${index} de ${total}: ${description}`;
            }
        }
        
        return description;
    }

    readEntirePage() {
        if (!('speechSynthesis' in window)) {
            alert('Seu navegador não suporta leitura de voz.');
            return;
        }
        
        if (!this.screenReaderEnabled) {
            alert('Por favor, ative o leitor de tela primeiro.');
            return;
        }
        
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
        }
        
        const mainContent = document.querySelector('main, article, .content, #content') || document.body;
        const text = this.getCleanText(mainContent);
        
        if (!text) {
            this.speak('Nenhum texto encontrado na página.');
            return;
        }
        
        this.isReadingPage = true;
        this.protectionActive = true;
        this.updateReaderControls();
        this.showFeedback('Lendo página... Proteção FORTE ativada.');
        
        this.speak('Iniciando leitura da página. ATENÇÃO: Proteção FORTE ativada. Para fechar ou navegar, você precisa parar a leitura primeiro.');
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'pt-BR';
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.volume = 1;
        
        utterance.onend = () => {
            this.isReadingPage = false;
            this.protectionActive = false;
            this.hideProtectionIndicator();
            this.updateReaderControls();
            this.speak('Leitura concluída. Proteção desativada.');
        };
        
        utterance.onerror = () => {
            this.isReadingPage = false;
            this.protectionActive = false;
            this.hideProtectionIndicator();
            this.updateReaderControls();
            this.speak('Erro na leitura. Proteção desativada.');
        };
        
        window.speechSynthesis.speak(utterance);
    }

    getCleanText(element) {
        const clone = element.cloneNode(true);
        
        clone.querySelectorAll('script, style, noscript, iframe, [aria-hidden="true"]').forEach(el => {
            el.remove();
        });
        
        let text = clone.textContent || clone.innerText;
        
        text = text
            .replace(/\s+/g, ' ')
            .replace(/\n+/g, ' ')
            .trim();
        
        return text;
    }

    togglePauseReader() {
        if (!window.speechSynthesis.speaking) return;
        
        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
            document.getElementById('pauseReaderBtn').innerHTML = '<i class="fas fa-pause"></i><span>Pausar</span>';
            this.speak('Continuando.');
        } else {
            window.speechSynthesis.pause();
            document.getElementById('pauseReaderBtn').innerHTML = '<i class="fas fa-play"></i><span>Continuar</span>';
            this.speak('Pausado.');
        }
    }

    stopReader() {
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            this.isReadingPage = false;
            this.protectionActive = false;
            this.hideProtectionIndicator();
            this.updateReaderControls();
            this.speak('Leitura parada. Proteção desativada.');
        }
    }

    speak(text) {
        if (!this.screenReaderEnabled || !text) return;
        
        if (window.speechSynthesis.speaking && !this.isReadingPage) {
            window.speechSynthesis.cancel();
        }
        
        this.showFeedback(text);
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'pt-BR';
        utterance.rate = 1.1;
        utterance.volume = 0.9;
        
        window.speechSynthesis.speak(utterance);
    }

    showFeedback(text) {
        const feedback = document.getElementById('readingFeedback');
        const feedbackText = document.getElementById('feedbackText');
        
        if (feedback && feedbackText) {
            const shortText = text.length > 50 ? text.substring(0, 50) + '...' : text;
            feedbackText.textContent = shortText;
            feedback.classList.add('show');
            
            setTimeout(() => {
                feedback.classList.remove('show');
            }, 2000);
        }
    }

    updateReaderControls() {
        const pauseBtn = document.getElementById('pauseReaderBtn');
        const stopBtn = document.getElementById('stopReaderBtn');
        
        if (this.isReadingPage) {
            pauseBtn.disabled = false;
            stopBtn.disabled = false;
        } else {
            pauseBtn.disabled = true;
            stopBtn.disabled = true;
            pauseBtn.innerHTML = '<i class="fas fa-pause"></i><span>Pausar</span>';
        }
    }

    togglePanel() {
        this.toolsVisible = !this.toolsVisible;
        const panel = document.getElementById('accessibilityPanel');
        const toggle = document.getElementById('accessibilityToggle');
        
        if (this.toolsVisible) {
            panel.classList.remove('hidden');
            panel.classList.add('visible');
            toggle.classList.add('active');
            
            setTimeout(() => {
                document.getElementById('closePanel').focus();
                if (this.screenReaderEnabled) {
                    this.speak('Painel aberto.');
                }
            }, 100);
        } else {
            this.closePanel();
        }
    }

    closePanel() {
        this.toolsVisible = false;
        const panel = document.getElementById('accessibilityPanel');
        const toggle = document.getElementById('accessibilityToggle');
        
        panel.classList.remove('visible');
        panel.classList.add('hidden');
        toggle.classList.remove('active');
        
        toggle.focus();
    }

    adjustFontSize(action) {
        const minSize = 12;
        const maxSize = 24;
        
        if (action === 'increase' && this.fontSize < maxSize) {
            this.fontSize += 2;
        } else if (action === 'decrease' && this.fontSize > minSize) {
            this.fontSize -= 2;
        }
        
        document.getElementById('fontSizeDisplay').textContent = `${this.fontSize}px`;
        this.applyFontSize();
        
        this.speak(`Fonte ${this.fontSize} pixels.`);
        
        this.saveSettings();
    }

    setTextStyle(style) {
        this.textStyle = style;
        
        document.querySelectorAll('.style-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const activeBtn = document.querySelector(`.style-btn[data-style="${style}"]`);
        if (activeBtn) activeBtn.classList.add('active');
        
        this.applyTextStyle();
        
        const styleName = style === 'bold' ? 'negrito' : 'normal';
        this.speak(`Texto em ${styleName}.`);
        
        this.saveSettings();
    }

    applyFontSize() {
        document.documentElement.style.fontSize = `${this.fontSize}px`;
    }

    applyTextStyle() {
        document.body.classList.remove('text-bold');
        
        if (this.textStyle === 'bold') {
            document.body.classList.add('text-bold');
            document.body.style.fontWeight = '700';
        } else {
            document.body.style.fontWeight = 'normal';
        }
    }

    toggleHighContrast() {
        const button = document.getElementById('highContrast');
        
        if (document.body.classList.contains('high-contrast')) {
            document.body.classList.remove('high-contrast');
            button.classList.remove('active');
            this.highContrast = false;
            this.speak('Contraste normal.');
        } else {
            document.body.classList.add('high-contrast');
            button.classList.add('active');
            this.highContrast = true;
            this.speak('Alto contraste.');
        }
        
        this.saveSettings();
    }

    scrollToTop() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
        this.speak('Topo.');
    }

    scrollToContent() {
        const mainContent = document.querySelector('main, article, .content');
        if (mainContent) {
            mainContent.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
            this.speak('Conteúdo principal.');
        }
    }

    restoreDefaults() {
        if (confirm('Restaurar configurações padrão?')) {
            this.fontSize = 16;
            this.lineHeight = 1.5;
            this.letterSpacing = 'normal';
            this.textStyle = 'normal';
            this.highContrast = false;
            this.screenReaderEnabled = false;
            this.voiceControlEnabled = false;
            
            document.getElementById('fontSizeDisplay').textContent = '16px';
            document.getElementById('screenReaderToggle').checked = false;
            document.getElementById('voiceControlToggle').checked = false;
            
            document.querySelectorAll('.style-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelector('[data-style="normal"]').classList.add('active');
            
            document.body.classList.remove('high-contrast');
            document.getElementById('highContrast').classList.remove('active');
            
            document.getElementById('voiceCommandToggle').classList.remove('visible', 'active');
            
            this.applySettings();
            localStorage.removeItem('accessibility_settings');
            
            this.speak('Configurações padrão restauradas. Leitor e voz desativados.');
        }
    }
    
    setupProtection() {
        let isBlocking = false;
        
        const showBlockOverlay = () => {
            if (this.screenReaderEnabled && this.isReadingPage && this.protectionActive) {
                if (!isBlocking) {
                    isBlocking = true;
                    this.showProtectionOverlay();
                    
                    setTimeout(() => {
                        document.getElementById('protectionCancel')?.focus();
                    }, 50);
                }
                return true;
            }
            return false;
        };
        
        window.addEventListener('beforeunload', (e) => {
            if (showBlockOverlay()) {
                e.preventDefault();
                e.returnValue = '⚠️ LEITOR DE TELA ATIVO - NÃO FECHE!';
                
                const blocker = document.createElement('div');
                blocker.id = 'pageBlocker';
                blocker.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(255,0,0,0.1);
                    z-index: 2147483647;
                `;
                document.body.appendChild(blocker);
                
                return '⚠️ LEITOR DE TELA ATIVO - NÃO FECHE!';
            }
        });
        
        document.addEventListener('keydown', (e) => {
            if (this.screenReaderEnabled && this.isReadingPage && this.protectionActive) {
                const dangerousKeys = [
                    'F5', 'F4', 'F11',
                    'r', 'R', 'w', 'W', 'q', 'Q',
                    'BrowserBack', 'BrowserForward',
                    'BrowserRefresh', 'BrowserStop',
                    'BrowserSearch', 'BrowserFavorites'
                ];
                
                const dangerousCombos = [
                    {ctrl: true, key: 'r'},
                    {ctrl: true, key: 'R'},
                    {ctrl: true, shift: true, key: 'r'},
                    {ctrl: true, shift: true, key: 'R'},
                    {ctrl: true, key: 'w'},
                    {ctrl: true, key: 'W'},
                    {alt: true, key: 'F4'},
                    {ctrl: true, alt: true, key: 'w'}
                ];
                
                const isDangerousKey = dangerousKeys.includes(e.key);
                const isDangerousCombo = dangerousCombos.some(combo => 
                    (combo.ctrl === undefined || combo.ctrl === e.ctrlKey) &&
                    (combo.alt === undefined || combo.alt === e.altKey) &&
                    (combo.shift === undefined || combo.shift === e.shiftKey) &&
                    combo.key.toLowerCase() === e.key.toLowerCase()
                );
                
                if (isDangerousKey || isDangerousCombo) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    if (showBlockOverlay()) {
                        return false;
                    }
                }
            }
        }, true);
        
        document.addEventListener('click', (e) => {
            if (this.screenReaderEnabled && this.isReadingPage && this.protectionActive) {
                const link = e.target.closest('a');
                if (link && link.href) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                    
                    if (showBlockOverlay()) {
                        return false;
                    }
                }
            }
        }, true);
        
        document.addEventListener('submit', (e) => {
            if (this.screenReaderEnabled && this.isReadingPage && this.protectionActive) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                
                if (showBlockOverlay()) {
                    return false;
                }
            }
        }, true);
        
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        const originalBack = history.back;
        const originalForward = history.forward;
        const originalGo = history.go;
        
        history.pushState = function(...args) {
            if (showBlockOverlay()) {
                console.warn('Navegação bloqueada pelo leitor de tela');
                return;
            }
            return originalPushState.apply(this, args);
        };
        
        history.replaceState = function(...args) {
            if (showBlockOverlay()) {
                console.warn('Navegação bloqueada pelo leitor de tela');
                return;
            }
            return originalReplaceState.apply(this, args);
        };
        
        history.back = function(...args) {
            if (showBlockOverlay()) {
                console.warn('Navegação bloqueada pelo leitor de tela');
                return;
            }
            return originalBack.apply(this, args);
        };
        
        history.forward = function(...args) {
            if (showBlockOverlay()) {
                console.warn('Navegação bloqueada pelo leitor de tela');
                return;
            }
            return originalForward.apply(this, args);
        };
        
        history.go = function(...args) {
            if (showBlockOverlay()) {
                console.warn('Navegação bloqueada pelo leitor de tela');
                return;
            }
            return originalGo.apply(this, args);
        };
        
        document.getElementById('protectionCancel').addEventListener('click', () => {
            this.hideProtectionOverlay();
            isBlocking = false;
            
            const blocker = document.getElementById('pageBlocker');
            if (blocker) blocker.remove();
        });
        
        document.getElementById('protectionConfirm').addEventListener('click', () => {
            this.stopReader();
            this.hideProtectionOverlay();
            isBlocking = false;
            
            const blocker = document.getElementById('pageBlocker');
            if (blocker) blocker.remove();
            
            this.speak('Leitura parada. Agora você pode fechar ou navegar.');
        });
    }
    
    showProtectionOverlay() {
        const overlay = document.getElementById('protectionOverlay');
        const indicator = document.getElementById('protectionIndicator');
        
        overlay.classList.add('active');
        overlay.style.zIndex = '2147483647';
        
        if (indicator) {
            indicator.classList.add('active');
        }
        
        document.body.style.overflow = 'hidden';
        document.body.style.pointerEvents = 'none';
        overlay.style.pointerEvents = 'auto';
        
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.pause();
        }
        
        this.speak('ATENÇÃO! Tentativa de interromper a leitura. Para sair, primeiro pare a leitura.');
    }
    
    hideProtectionOverlay() {
        const overlay = document.getElementById('protectionOverlay');
        const indicator = document.getElementById('protectionIndicator');
        
        overlay.classList.remove('active');
        
        if (indicator) {
            indicator.classList.remove('active');
        }
        
        document.body.style.overflow = '';
        document.body.style.pointerEvents = '';
        
        if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
        }
    }
    
    hideProtectionIndicator() {
        const indicator = document.getElementById('protectionIndicator');
        if (indicator) {
            indicator.classList.remove('active');
        }
    }

    saveSettings() {
        const settings = {
            fontSize: this.fontSize,
            lineHeight: this.lineHeight,
            letterSpacing: this.letterSpacing,
            textStyle: this.textStyle,
            highContrast: this.highContrast,
            screenReaderEnabled: this.screenReaderEnabled,
            voiceControlEnabled: this.voiceControlEnabled
        };
        
        localStorage.setItem('accessibility_settings', JSON.stringify(settings));
    }

    loadSettings() {
        try {
            const saved = localStorage.getItem('accessibility_settings');
            if (saved) {
                const settings = JSON.parse(saved);
                
                this.fontSize = settings.fontSize || 16;
                this.lineHeight = settings.lineHeight || 1.5;
                this.letterSpacing = settings.letterSpacing || 'normal';
                this.textStyle = settings.textStyle || 'normal';
                this.highContrast = settings.highContrast || false;
                this.screenReaderEnabled = settings.screenReaderEnabled !== undefined ? settings.screenReaderEnabled : false;
                this.voiceControlEnabled = settings.voiceControlEnabled || false;
                
                if (this.voiceControlEnabled) {
                    document.getElementById('voiceCommandToggle').classList.add('visible');
                }
            }
        } catch (error) {
            console.error('Erro ao carregar configurações:', error);
        }
    }

    applySettings() {
        const fontSizeDisplay = document.getElementById('fontSizeDisplay');
        const screenReaderToggle = document.getElementById('screenReaderToggle');
        const voiceToggle = document.getElementById('voiceControlToggle');
        
        if (fontSizeDisplay) fontSizeDisplay.textContent = `${this.fontSize}px`;
        if (screenReaderToggle) screenReaderToggle.checked = this.screenReaderEnabled;
        if (voiceToggle) voiceToggle.checked = this.voiceControlEnabled;
        
        this.applyFontSize();
        this.applyTextStyle();
        this.updateStatus();
        
        if (this.highContrast) {
            document.body.classList.add('high-contrast');
            document.getElementById('highContrast').classList.add('active');
        }
        
        document.querySelectorAll('.style-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeStyleBtn = document.querySelector(`[data-style="${this.textStyle}"]`);
        if (activeStyleBtn) {
            activeStyleBtn.classList.add('active');
        } else {
            document.querySelector('[data-style="normal"]').classList.add('active');
        }
    }
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        try {
            window.acessibilidade = new SistemaAcessibilidade();
            console.log('✅ Sistema de Acessibilidade carregado');
            console.log('🎤 Controle por voz disponível');
            console.log('🔊 Leitor de tela disponível');
            console.log('🛡️ Sistema de proteção ativo');
        } catch (error) {
            console.error('❌ Erro no sistema de acessibilidade:', error);
        }
    }, 100);
});