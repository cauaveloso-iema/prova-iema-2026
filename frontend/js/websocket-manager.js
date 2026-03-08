// frontend/js/websocket-manager.js
class WebSocketManager {
    constructor() {
        this.ws = null;
        this.reconnectTimer = null;
        this.listeners = [];
        this.logBuffer = [];
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 50;
        this.connectionTimeout = null;
        this.heartbeatInterval = null;
        this.isManualDisconnect = false;
        this.isConnecting = false;
        this.connectionCheckInterval = null;
        
        // ===== CONTROLE DE COMANDOS =====
        this.ultimoComando = null;
        this.ultimoTimestamp = 0;
        this.minIntervaloComandos = 2000; // 2 segundos entre comandos iguais
        this.comandosPendentes = new Set();
        
        // Tentar conectar imediatamente
        this.connect();
        
        // Monitorar visibilidade da página
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                console.log('👁️ Página visível novamente');
                this.checkConnection();
            }
        });
        
        // Verificar conexão a cada 30 segundos
        this.connectionCheckInterval = setInterval(() => {
            this.checkConnection();
        }, 30000);
        
        console.log('📡 WebSocketManager inicializado');
    }

    connect() {
        if (this.isConnecting) return;
        
        this.clearTimers();
        
        if (this.isManualDisconnect) {
            console.log('⏸️ Desconexão manual');
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        console.log(`🔌 Conectando... (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
        
        this.isConnecting = true;
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.connectionTimeout = setTimeout(() => {
                if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
                    console.log('⏰ Timeout de conexão');
                    this.ws.close();
                    this.isConnecting = false;
                }
            }, 10000);
            
            this.ws.onopen = () => {
                console.log('✅ Conectado!');
                clearTimeout(this.connectionTimeout);
                this.reconnectAttempts = 0;
                this.isManualDisconnect = false;
                this.isConnecting = false;
                
                this.startHeartbeat();
                
                this.notifyListeners({ 
                    type: 'connection', 
                    status: 'connected',
                    timestamp: new Date().toISOString()
                });
                
                // NÃO enviar comandos automáticos aqui!
                // Deixa o admin decidir quando pedir
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    if (data.type === 'ping') {
                        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                            this.ws.send(JSON.stringify({ type: 'pong' }));
                        }
                        return;
                    }
                    
                    if (data.type === 'pong') {
                        return; // Ignorar pongs
                    }
                    
                    if (data.type === 'clear_console') {
                        this.notifyListeners(data);
                        return;
                    }
                    
                    // Armazenar no buffer
                    this.logBuffer.push(data);
                    if (this.logBuffer.length > 5000) this.logBuffer.shift();
                    
                    // Notificar listeners
                    this.notifyListeners(data);
                    
                } catch (e) {
                    console.error('Erro ao processar mensagem:', e);
                }
            };
            
            this.ws.onclose = (event) => {
                console.log(`🔌 Desconectado (código: ${event.code})`);
                clearTimeout(this.connectionTimeout);
                this.stopHeartbeat();
                this.isConnecting = false;
                
                // Limpar comandos pendentes
                this.comandosPendentes.clear();
                
                this.notifyListeners({ 
                    type: 'connection', 
                    status: 'disconnected',
                    code: event.code,
                    timestamp: new Date().toISOString()
                });
                
                if (!this.isManualDisconnect && event.code !== 1000) {
                    this.scheduleReconnect();
                }
            };
            
            this.ws.onerror = (error) => {
                console.error('❌ Erro:', error);
            };
            
        } catch (error) {
            console.error('❌ Erro ao criar WebSocket:', error);
            this.isConnecting = false;
            this.scheduleReconnect();
        }
    }

    // ===== NOVO: Enviar comando com controle de duplicação =====
    sendCommand(command) {
        // Verificar se é o mesmo comando enviado recentemente
        const agora = Date.now();
        
        if (command === this.ultimoComando && (agora - this.ultimoTimestamp) < this.minIntervaloComandos) {
            console.log(`⏸️ Comando "${command}" ignorado (muito recente)`);
            return false;
        }
        
        // Verificar se comando já está pendente
        if (this.comandosPendentes.has(command)) {
            console.log(`⏸️ Comando "${command}" já está pendente`);
            return false;
        }
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.comandosPendentes.add(command);
            this.ultimoComando = command;
            this.ultimoTimestamp = agora;
            
            this.ws.send(JSON.stringify({
                type: 'execute_command',
                command: command,
                timestamp: new Date().toISOString()
            }));
            
            // Remover dos pendentes após 3 segundos
            setTimeout(() => {
                this.comandosPendentes.delete(command);
            }, 3000);
            
            return true;
        }
        
        console.log('⚠️ WebSocket não conectado');
        return false;
    }

    // ===== NOVO: Enviar comando único (para histórico) =====
    requestHistory() {
        return this.sendCommand('history()');
    }

    // ===== NOVO: Enviar comando único (para buffer) =====
    requestBuffer() {
        return this.sendCommand('buffer()');
    }

    checkConnection() {
        const status = this.getConnectionStatus();
        
        if (status === 'disconnected' && !this.isManualDisconnect && !this.isConnecting) {
            console.log('🔄 Reconectando...');
            this.connect();
        }
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                try {
                    this.ws.send(JSON.stringify({ type: 'ping' }));
                } catch (e) {
                    console.log('⚠️ Erro no heartbeat');
                }
            }
        }, 30000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    clearTimers() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('❌ Máximo de tentativas atingido');
            return;
        }

        const delays = [1, 2, 3, 5, 8, 13, 21, 30];
        const delay = delays[Math.min(this.reconnectAttempts, delays.length - 1)] * 1000;
        
        console.log(`⏳ Reconectando em ${delay/1000}s...`);
        
        this.reconnectTimer = setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
        }, delay);
    }

    addListener(callback) {
        this.listeners.push(callback);
        
        // Se já tiver logs no buffer, enviar
        if (this.logBuffer.length > 0) {
            setTimeout(() => {
                try {
                    callback({ 
                        type: 'history', 
                        logs: [...this.logBuffer],
                        timestamp: new Date().toISOString()
                    });
                } catch (e) {}
            }, 0);
        }
        
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    notifyListeners(data) {
        this.listeners.forEach(callback => {
            try {
                callback(data);
            } catch (e) {
                console.error('Erro no listener:', e);
            }
        });
    }

    getConnectionStatus() {
        if (!this.ws) return 'disconnected';
        try {
            switch(this.ws.readyState) {
                case WebSocket.CONNECTING: return 'connecting';
                case WebSocket.OPEN: return 'connected';
                case WebSocket.CLOSING: return 'closing';
                case WebSocket.CLOSED: return 'disconnected';
                default: return 'unknown';
            }
        } catch (e) {
            return 'disconnected';
        }
    }

    disconnect(manual = true) {
        this.isManualDisconnect = manual;
        this.stopHeartbeat();
        this.clearTimers();
        
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = null;
        }
        
        if (this.ws) {
            try {
                this.ws.close(1000, 'Desconectado pelo usuário');
            } catch (e) {}
            this.ws = null;
        }
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.comandosPendentes.clear();
    }
}

// Criar instância global APENAS UMA VEZ
if (!window.wsManager) {
    window.wsManager = new WebSocketManager();
}