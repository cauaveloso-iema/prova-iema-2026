class MonitoramentoProva {
    constructor() {
        this.avisos = 0;
        this.maxAvisos = 3;
        this.tempoFora = 0;
        this.maxTempoFora = 5; // segundos
        this.isModalOpen = false;
        this.timerPerdaFoco = null;
        this.tentativasAtalho = 0;
        this.maxTentativasAtalho = 5;
        this.screenshots = 0;
        this.maxScreenshots = 2;
        this.capturasAtividades = [];
        
        this.init();
    }
    
    init() {
        this.configurarMonitoramento();
        this.criarModalWarning();
        this.atualizarStatus();
        
        // Registrar início da prova no servidor
        this.registrarInicioProva();
    }
    
    configurarMonitoramento() {
        // 1. Monitorar perda de foco
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.registrarPerdaFoco();
            } else {
                this.tempoFora = 0;
            }
        });
        
        // 2. Monitorar saída da janela
        window.addEventListener('blur', () => {
            this.registrarPerdaFoco();
        });
        
        window.addEventListener('focus', () => {
            this.tempoFora = 0;
        });
        
        // 3. Prevenir saída da página
        window.addEventListener('beforeunload', (e) => {
            if (this.avisos < this.maxAvisos) {
                e.preventDefault();
                e.returnValue = 'Se você sair da página, sua prova será cancelada. Tem certeza?';
            }
        });
        
        // 4. Prevenir teclas de atalho
        document.addEventListener('keydown', (e) => {
            // F5, Ctrl+R, Ctrl+Shift+R
            if (e.key === 'F5' || (e.ctrlKey && e.key === 'r') || (e.ctrlKey && e.shiftKey && e.key === 'R')) {
                e.preventDefault();
                this.registrarTentativaAtalho('Recarregar página');
            }
            
            // Ctrl+T (nova aba), Ctrl+N (nova janela)
            if ((e.ctrlKey && e.key === 't') || (e.ctrlKey && e.key === 'n')) {
                e.preventDefault();
                this.registrarTentativaAtalho('Nova aba/janela');
            }
            
            // Print Screen
            if (e.key === 'PrintScreen' || (e.ctrlKey && e.key === 'p')) {
                e.preventDefault();
                this.registrarScreenshot();
            }
            
            // Alt+Tab, Alt+F4 (mais difícil de prevenir, mas podemos detectar)
            if (e.altKey && e.key === 'Tab') {
                this.registrarTentativaAtalho('Alt+Tab detectado');
            }
            
            // Ctrl+Shift+I (DevTools)
            if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
                e.preventDefault();
                this.registrarTentativaAtalho('Abrir DevTools');
            }
            
            // F12 (DevTools)
            if (e.key === 'F12') {
                e.preventDefault();
                this.registrarTentativaAtalho('Abrir DevTools (F12)');
            }
        });
        
        // 5. Prevenir clique com botão direito
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.registrarTentativaAtalho('Clique direito');
        });
        
        // 6. Prevenir arrastar elementos
        document.addEventListener('dragstart', (e) => {
            e.preventDefault();
        });
        
        // 7. Prevenir seleção de texto
        document.addEventListener('selectstart', (e) => {
            e.preventDefault();
        });
        
        // 8. Prevenir cópia (Ctrl+C)
        document.addEventListener('copy', (e) => {
            e.preventDefault();
            this.registrarTentativaAtalho('Tentativa de cópia (Ctrl+C)');
        });
        
        // 9. Prevenir recorte (Ctrl+X)
        document.addEventListener('cut', (e) => {
            e.preventDefault();
            this.registrarTentativaAtalho('Tentativa de recorte (Ctrl+X)');
        });
        
        // 10. Prevenir colar (Ctrl+V)
        document.addEventListener('paste', (e) => {
            e.preventDefault();
            this.registrarTentativaAtalho('Tentativa de colar (Ctrl+V)');
        });
        
        // 11. Monitorar mudanças de tamanho de janela (tentativa de reduzir)
        window.addEventListener('resize', () => {
            if (window.outerHeight < 400 || window.outerWidth < 400) {
                this.registrarTentativaAtalho('Redução excessiva da janela');
            }
        });
        
        // 12. Monitorar mudança de orientação (mobile/tablet)
        window.addEventListener('orientationchange', () => {
            this.registrarTentativaAtalho('Mudança de orientação');
        });
        
        // 13. Prevenir abrir DevTools via menu do navegador
        document.addEventListener('keyup', (e) => {
            // Detecta Ctrl+Shift+C/I/J
            if (e.ctrlKey && e.shiftKey && ['C', 'c', 'I', 'i', 'J', 'j'].includes(e.key)) {
                this.registrarTentativaAtalho('Tentativa de abrir DevTools');
            }
        });
        
        // 14. Monitorar tecla ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.registrarTentativaAtalho('Tecla Escape pressionada');
            }
        });
        
        // 15. Prevenir arrastar e soltar para fora
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        
        document.addEventListener('drop', (e) => {
            e.preventDefault();
            this.registrarTentativaAtalho('Arrastar e soltar arquivos');
        });
    }
    
    criarModalWarning() {
        // Criar modal se não existir
        if (!document.getElementById('warningModal')) {
            const modal = document.createElement('div');
            modal.id = 'warningModal';
            modal.className = 'modal-warning';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3><i class="fas fa-exclamation-triangle"></i> Atenção!</h3>
                    </div>
                    <div class="modal-body">
                        <p id="warningMessage">Você saiu da página da prova!</p>
                        <div class="countdown-container">
                            <p>Retorne à prova em: <span id="countdown">5</span> segundos</p>
                        </div>
                        <div class="warning-details">
                            <p><small>Isso conta como uma violação das regras da prova.</small></p>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="btnReturn" class="btn-return">
                            <i class="fas fa-arrow-left"></i> Retornar à Prova
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            
            // Adicionar estilos
            this.adicionarEstilosModal();
        }
    }
    
    adicionarEstilosModal() {
        const style = document.createElement('style');
        style.textContent = `
            .modal-warning {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.9);
                z-index: 9999;
                align-items: center;
                justify-content: center;
            }
            
            .modal-warning.active {
                display: flex;
                animation: fadeIn 0.3s ease;
            }
            
            .modal-content {
                background: white;
                border-radius: 15px;
                width: 90%;
                max-width: 500px;
                overflow: hidden;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                animation: slideIn 0.4s ease;
            }
            
            .modal-header {
                background: linear-gradient(135deg, #f59e0b, #d97706);
                color: white;
                padding: 20px;
                text-align: center;
            }
            
            .modal-header h3 {
                margin: 0;
                font-size: 1.5rem;
            }
            
            .modal-body {
                padding: 30px;
                text-align: center;
            }
            
            #warningMessage {
                font-size: 1.2rem;
                margin-bottom: 20px;
                color: #374151;
            }
            
            .countdown-container {
                background: #f3f4f6;
                padding: 15px;
                border-radius: 10px;
                margin: 20px 0;
            }
            
            #countdown {
                font-size: 2rem;
                font-weight: bold;
                color: #dc2626;
                display: inline-block;
                min-width: 40px;
            }
            
            .warning-details {
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid #e5e7eb;
            }
            
            .modal-footer {
                padding: 20px;
                background: #f9fafb;
                display: flex;
                justify-content: center;
            }
            
            .btn-return {
                background: linear-gradient(135deg, #10b981, #059669);
                color: white;
                border: none;
                padding: 12px 30px;
                border-radius: 8px;
                font-size: 1rem;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 10px;
                transition: transform 0.2s, background 0.3s;
            }
            
            .btn-return:hover {
                transform: translateY(-2px);
                background: linear-gradient(135deg, #059669, #047857);
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @keyframes slideIn {
                from { 
                    opacity: 0;
                    transform: translateY(-50px) scale(0.9);
                }
                to { 
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }
            
            /* Animação de piscar para contagem regressiva */
            @keyframes blink {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            
            .blink {
                animation: blink 1s infinite;
            }
        `;
        document.head.appendChild(style);
    }
    
    registrarPerdaFoco() {
        this.avisos++;
        this.atualizarStatus();
        
        // Registrar no servidor
        this.registrarViolacao('perda_foco', {
            avisoNumero: this.avisos,
            timestamp: new Date().toISOString()
        });
        
        if (this.avisos >= this.maxAvisos) {
            this.cancelarProva();
            return;
        }
        
        this.mostrarModalAviso();
    }
    
    registrarTentativaAtalho(tipo) {
        this.tentativasAtalho++;
        
        // Registrar no servidor
        this.registrarViolacao('atalho_teclado', {
            tipo: tipo,
            tentativaNumero: this.tentativasAtalho,
            timestamp: new Date().toISOString()
        });
        
        // Adicionar à lista de atividades suspeitas
        this.capturasAtividades.push({
            tipo: 'atalho',
            descricao: tipo,
            timestamp: new Date().toISOString()
        });
        
        // Atualizar interface
        const shortcutAlert = document.getElementById('shortcutAlert');
        if (shortcutAlert) {
            shortcutAlert.innerHTML = `
                <i class="fas fa-keyboard"></i>
                <span>Atalhos bloqueados: ${this.tentativasAtalho}</span>
            `;
        }
        
        if (this.tentativasAtalho >= this.maxTentativasAtalho) {
            this.cancelarProva();
        }
    }
    
    registrarScreenshot() {
        this.screenshots++;
        
        // Registrar no servidor
        this.registrarViolacao('screenshot', {
            capturaNumero: this.screenshots,
            timestamp: new Date().toISOString()
        });
        
        // Atualizar interface
        const screenshotAlert = document.getElementById('screenshotAlert');
        if (screenshotAlert) {
            screenshotAlert.innerHTML = `
                <i class="fas fa-camera"></i>
                <span>Capturas bloqueadas: ${this.screenshots}</span>
            `;
        }
        
        if (this.screenshots >= this.maxScreenshots) {
            this.cancelarProva();
        }
    }
    
    mostrarModalAviso() {
        if (this.isModalOpen) return;
        
        this.isModalOpen = true;
        const modal = document.getElementById('warningModal');
        const countdownElement = document.getElementById('countdown');
        const messageElement = document.getElementById('warningMessage');
        
        // Configurar mensagem baseada no número de avisos
        const messages = [
            '⚠️ Atenção! Você saiu da página da prova.',
            '⚠️ Alerta! Redução/Fechamento de janela detectado.',
            '⚠️ Cuidado! Troca de aba ou aplicativo detectada.',
            '⚠️ Aviso final! Comportamento suspeito detectado.'
        ];
        
        messageElement.textContent = messages[Math.min(this.avisos - 1, messages.length - 1)];
        
        // Mostrar modal
        modal.classList.add('active');
        
        // Contagem regressiva
        let countdown = this.maxTempoFora;
        countdownElement.textContent = countdown;
        countdownElement.classList.add('blink');
        
        this.timerPerdaFoco = setInterval(() => {
            countdown--;
            countdownElement.textContent = countdown;
            
            if (countdown <= 0) {
                clearInterval(this.timerPerdaFoco);
                countdownElement.classList.remove('blink');
                this.cancelarProva();
            }
        }, 1000);
        
        // Botão de retorno manual
        document.getElementById('btnReturn').addEventListener('click', () => {
            if (this.timerPerdaFoco) {
                clearInterval(this.timerPerdaFoco);
            }
            countdownElement.classList.remove('blink');
            this.fecharModal();
        }, { once: true });
    }
    
    fecharModal() {
        const modal = document.getElementById('warningModal');
        if (modal) {
            modal.classList.remove('active');
        }
        this.isModalOpen = false;
    }
    
    atualizarStatus() {
        // Atualizar contador de avisos
        const warningCount = document.querySelector('#warningCount span');
        if (warningCount) {
            warningCount.textContent = this.avisos;
            
            // Adicionar classe baseada na gravidade
            warningCount.className = '';
            if (this.avisos === 1) {
                warningCount.classList.add('warning-low');
            } else if (this.avisos === 2) {
                warningCount.classList.add('warning-medium');
            } else if (this.avisos >= 3) {
                warningCount.classList.add('warning-high');
            }
        }
        
        // Atualizar status de foco
        this.atualizarStatusFoco();
        
        // Atualizar painel de monitoramento
        this.atualizarPainelMonitoramento();
    }
    
    atualizarStatusFoco() {
        const statusFocus = document.getElementById('statusFocus');
        if (!statusFocus) return;
        
        if (document.hidden) {
            statusFocus.innerHTML = '<i class="fas fa-times-circle"></i> Foco Perdido';
            statusFocus.style.background = '#fef3c7';
            statusFocus.style.color = '#92400e';
            statusFocus.style.border = '2px solid #f59e0b';
        } else {
            statusFocus.innerHTML = '<i class="fas fa-check-circle"></i> Foco Mantido';
            statusFocus.style.background = '#d1fae5';
            statusFocus.style.color = '#065f46';
            statusFocus.style.border = '2px solid #10b981';
        }
    }
    
    atualizarPainelMonitoramento() {
        // Criar ou atualizar painel de monitoramento
        let monitorPanel = document.getElementById('monitorPanel');
        
        if (!monitorPanel) {
            monitorPanel = document.createElement('div');
            monitorPanel.id = 'monitorPanel';
            monitorPanel.className = 'monitor-panel';
            monitorPanel.innerHTML = `
                <div class="panel-header">
                    <h4><i class="fas fa-shield-alt"></i> Monitoramento</h4>
                </div>
                <div class="panel-body">
                    <div class="metric-row">
                        <div class="metric">
                            <div class="metric-label">Avisos de Foco</div>
                            <div class="metric-value" id="warningCount">${this.avisos}/3</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">Atalhos Bloqueados</div>
                            <div class="metric-value" id="shortcutCount">${this.tentativasAtalho}/5</div>
                        </div>
                        <div class="metric">
                            <div class="metric-label">Capturas Bloqueadas</div>
                            <div class="metric-value" id="screenshotCount">${this.screenshots}/2</div>
                        </div>
                    </div>
                    <div class="status-row">
                        <div class="status-item" id="statusFocus">
                            <i class="fas fa-check-circle"></i> Foco Mantido
                        </div>
                        <div class="status-item" id="statusIntegrity">
                            <i class="fas fa-lock"></i> Integridade OK
                        </div>
                    </div>
                </div>
            `;
            
            // Adicionar ao body
            document.body.appendChild(monitorPanel);
            
            // Adicionar estilos
            this.adicionarEstilosPainel();
        }
        
        // Atualizar valores
        document.getElementById('warningCount').textContent = `${this.avisos}/3`;
        document.getElementById('shortcutCount').textContent = `${this.tentativasAtalho}/5`;
        document.getElementById('screenshotCount').textContent = `${this.screenshots}/2`;
        
        // Atualizar status de integridade
        const statusIntegrity = document.getElementById('statusIntegrity');
        if (statusIntegrity) {
            if (this.avisos > 0 || this.tentativasAtalho > 0 || this.screenshots > 0) {
                statusIntegrity.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Monitorando';
                statusIntegrity.style.background = '#fef3c7';
                statusIntegrity.style.color = '#92400e';
            } else {
                statusIntegrity.innerHTML = '<i class="fas fa-lock"></i> Integridade OK';
                statusIntegrity.style.background = '#d1fae5';
                statusIntegrity.style.color = '#065f46';
            }
        }
    }
    
    adicionarEstilosPainel() {
        const style = document.createElement('style');
        style.textContent = `
            .monitor-panel {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                width: 300px;
                z-index: 1000;
                border: 2px solid #e5e7eb;
                overflow: hidden;
            }
            
            .panel-header {
                background: linear-gradient(135deg, #4f46e5, #7c3aed);
                color: white;
                padding: 12px 15px;
            }
            
            .panel-header h4 {
                margin: 0;
                font-size: 0.9rem;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .panel-body {
                padding: 15px;
            }
            
            .metric-row {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 10px;
                margin-bottom: 15px;
            }
            
            .metric {
                text-align: center;
                padding: 10px;
                background: #f9fafb;
                border-radius: 8px;
                border: 1px solid #e5e7eb;
            }
            
            .metric-label {
                font-size: 0.7rem;
                color: #6b7280;
                margin-bottom: 5px;
                font-weight: 600;
            }
            
            .metric-value {
                font-size: 1.1rem;
                font-weight: bold;
                color: #374151;
            }
            
            .status-row {
                display: flex;
                gap: 10px;
            }
            
            .status-item {
                flex: 1;
                padding: 8px 10px;
                border-radius: 8px;
                font-size: 0.8rem;
                font-weight: 600;
                text-align: center;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 5px;
            }
            
            .warning-low {
                color: #f59e0b;
                font-weight: bold;
            }
            
            .warning-medium {
                color: #ea580c;
                font-weight: bold;
            }
            
            .warning-high {
                color: #dc2626;
                font-weight: bold;
                animation: pulse 1s infinite;
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }
        `;
        document.head.appendChild(style);
    }
    
    async registrarInicioProva() {
        try {
            const token = localStorage.getItem('auth_token');
            const provaId = localStorage.getItem('provaAtual');
            
            if (!token || !provaId) return;
            
            await fetch('http://localhost:3000/api/monitor/inicio', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    provaId: provaId,
                    timestamp: new Date().toISOString(),
                    userAgent: navigator.userAgent,
                    screenResolution: `${window.screen.width}x${window.screen.height}`,
                    windowSize: `${window.innerWidth}x${window.innerHeight}`
                })
            });
            
            console.log('📊 Início da prova registrado no servidor');
        } catch (error) {
            console.error('Erro ao registrar início da prova:', error);
        }
    }
    
    async registrarViolacao(tipo, dados) {
        try {
            const token = localStorage.getItem('auth_token');
            const provaId = localStorage.getItem('provaAtual');
            
            if (!token || !provaId) return;
            
            await fetch('http://localhost:3000/api/monitor/violacao', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    provaId: provaId,
                    tipo: tipo,
                    dados: dados,
                    timestamp: new Date().toISOString()
                })
            });
            
            console.log(`📊 Violação registrada: ${tipo}`);
        } catch (error) {
            console.error('Erro ao registrar violação:', error);
        }
    }
    
    cancelarProva() {
        // Limpar intervalos
        if (this.timerPerdaFoco) {
            clearInterval(this.timerPerdaFoco);
        }
        
        // Fechar modal
        this.fecharModal();
        
        // Registrar cancelamento
        this.registrarViolacao('prova_cancelada', {
            motivo: 'múltiplas violações',
            avisos: this.avisos,
            tentativasAtalho: this.tentativasAtalho,
            screenshots: this.screenshots
        });
        
        // Limpar dados
        localStorage.removeItem('provaId');
        localStorage.removeItem('questoes');
        localStorage.removeItem('provaAtual');
        localStorage.removeItem('provaData');
        localStorage.removeItem('provaToken');
        
        // Mostrar mensagem final
        const cancelMessage = document.createElement('div');
        cancelMessage.id = 'cancelMessage';
        cancelMessage.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.95);
            z-index: 99999;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            text-align: center;
        `;
        cancelMessage.innerHTML = `
            <div style="max-width: 600px; padding: 30px;">
                <div style="font-size: 4rem; margin-bottom: 20px; color: #ef4444;">
                    <i class="fas fa-ban"></i>
                </div>
                <h1 style="color: #ef4444; margin-bottom: 20px;">Prova Cancelada</h1>
                <div style="background: rgba(239, 68, 68, 0.1); padding: 20px; border-radius: 10px; margin-bottom: 30px;">
                    <p style="font-size: 1.2rem; margin-bottom: 10px;">
                        <strong>Motivo:</strong> Múltiplas violações das regras da prova
                    </p>
                    <div style="display: flex; justify-content: center; gap: 20px; margin-top: 15px;">
                        <div class="stat">
                            <div class="stat-value">${this.avisos}</div>
                            <div class="stat-label">Avisos</div>
                        </div>
                        <div class="stat">
                            <div class="stat-value">${this.tentativasAtalho}</div>
                            <div class="stat-label">Atalhos</div>
                        </div>
                        <div class="stat">
                            <div class="stat-value">${this.screenshots}</div>
                            <div class="stat-label">Capturas</div>
                        </div>
                    </div>
                </div>
                <p style="color: #9ca3af; margin-bottom: 30px;">
                    Esta ação foi registrada e será reportada ao professor.
                </p>
                <button onclick="window.location.href='index.html'" 
                        style="background: #ef4444; color: white; border: none; padding: 12px 30px; 
                               border-radius: 8px; font-size: 1rem; cursor: pointer; font-weight: 600;">
                    <i class="fas fa-home"></i> Voltar ao Início
                </button>
            </div>
        `;
        
        // Adicionar estilos para as estatísticas
        const style = document.createElement('style');
        style.textContent = `
            .stat {
                text-align: center;
            }
            .stat-value {
                font-size: 2rem;
                font-weight: bold;
                color: #ef4444;
            }
            .stat-label {
                font-size: 0.9rem;
                color: #9ca3af;
            }
        `;
        document.head.appendChild(style);
        
        document.body.appendChild(cancelMessage);
        
        // Impedir qualquer interação
        document.querySelectorAll('button, input, select, textarea').forEach(el => {
            el.disabled = true;
        });
        
        console.log('🚫 Prova cancelada devido a múltiplas violações');
    }
    
    // Método para limpar recursos
    destruir() {
        if (this.timerPerdaFoco) {
            clearInterval(this.timerPerdaFoco);
        }
        
        // Remover event listeners
        const events = ['visibilitychange', 'blur', 'focus', 'beforeunload', 'keydown', 
                       'contextmenu', 'dragstart', 'selectstart', 'copy', 'cut', 
                       'paste', 'resize', 'orientationchange', 'keyup', 'dragover', 'drop'];
        
        events.forEach(event => {
            document.removeEventListener(event, this[`handle${event}`]);
        });
        
        // Remover elementos DOM criados
        ['warningModal', 'monitorPanel', 'cancelMessage'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
    }
}

// Inicializar monitoramento quando a prova carregar
document.addEventListener('DOMContentLoaded', () => {
    // Verificar se estamos na página de prova
    if (window.location.pathname.includes('prova.html') || 
        window.location.pathname.includes('realizar-prova.html')) {
        
        // Aguardar um pouco para garantir que tudo carregou
        setTimeout(() => {
            window.monitoramento = new MonitoramentoProva();
            
            // Adicionar botão de ajuda sobre o monitoramento
            const helpButton = document.createElement('button');
            helpButton.id = 'monitorHelp';
            helpButton.title = 'Sobre o sistema de monitoramento';
            helpButton.innerHTML = '<i class="fas fa-question-circle"></i>';
            helpButton.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 20px;
                background: #4f46e5;
                color: white;
                border: none;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 1001;
                box-shadow: 0 3px 10px rgba(0,0,0,0.2);
                font-size: 1.2rem;
            `;
            
            helpButton.addEventListener('click', () => {
                alert(`
📊 SISTEMA DE MONITORAMENTO DA PROVA

Este sistema monitora sua atividade durante a prova para garantir a integridade do processo avaliativo.

🔍 O QUE É MONITORADO:
• Troca de abas/janelas
• Redução da janela do navegador
• Teclas de atalho (F5, Ctrl+R, etc.)
• Tentativas de cópia/cola
• Capturas de tela
• Clique direito
• E outras atividades suspeitas

⚠️ CONSEQUÊNCIAS:
• 3 avisos = Prova cancelada
• 5 atalhos bloqueados = Prova cancelada
• 2 capturas de tela = Prova cancelada

✅ DICAS:
• Mantenha o navegador em tela cheia
• Não troque de aba ou aplicativo
• Use apenas o mouse para navegar
• Em caso de problema, entre em contato com o professor

Boa prova! 🎯
                `);
            });
            
            document.body.appendChild(helpButton);
            
        }, 1000);
    }
});

// Prevenir que o monitoramento seja desativado
Object.freeze(MonitoramentoProva.prototype);