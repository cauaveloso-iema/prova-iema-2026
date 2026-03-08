// backend/services/logger-service.js
const WebSocket = require('ws');
const os = require('os');

class LoggerService {
    constructor(server) {
        this.wss = new WebSocket.Server({ 
            server,
            perMessageDeflate: false,
            clientTracking: true,
        });
        
        this.clients = new Map(); // Mudar para Map para rastrear clientes
        this.logBuffer = [];
        this.maxBufferSize = 5000;
        
        // Capturar logs imediatamente
        this.captureAllLogs();
        
        // Logs iniciais
        this.addLog('system', `🚀 LoggerService iniciado em ${this.getCurrentTime().full}`);
        this.addLog('system', `📊 PID: ${process.pid} | Node: ${process.version}`);
        this.addLog('system', `💻 Hostname: ${os.hostname()}`);
        
        // Monitoramento
        this.startSystemMonitoring();
        this.setupWebSocket();
        
        console.log('🔌 Logger Service PRONTO - capturando TODOS os logs!');
    }

    // ===== FUNÇÃO PARA PEGAR HORA CERTA =====
    getCurrentTime() {
        const now = new Date();
        return {
            iso: now.toISOString(),
            local: now.toLocaleString('pt-BR', { 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit',
                hour12: false 
            }),
            full: now.toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            })
        };
    }

    // ===== CAPTURAR ABSOLUTAMENTE TUDO =====
    captureAllLogs() {
        const originalLog = console.log;
        const originalError = console.error;
        const originalWarn = console.warn;
        const originalInfo = console.info;
        const originalDebug = console.debug;

        console.log = (...args) => {
            const message = args.map(arg => {
                if (typeof arg === 'object') {
                    try {
                        return JSON.stringify(arg, null, 2);
                    } catch {
                        return String(arg);
                    }
                }
                return String(arg);
            }).join(' ');
            
            this.addLog('info', message);
            originalLog.apply(console, args);
        };

        console.error = (...args) => {
            const message = args.map(arg => {
                if (arg instanceof Error) {
                    return `${arg.message}\n${arg.stack}`;
                }
                return String(arg);
            }).join(' ');
            
            this.addLog('error', message);
            originalError.apply(console, args);
        };

        console.warn = (...args) => {
            const message = args.map(arg => String(arg)).join(' ');
            this.addLog('warn', message);
            originalWarn.apply(console, args);
        };

        console.info = (...args) => {
            const message = args.map(arg => String(arg)).join(' ');
            this.addLog('info', message);
            originalInfo.apply(console, args);
        };

        console.debug = (...args) => {
            const message = args.map(arg => String(arg)).join(' ');
            this.addLog('debug', message);
            if (originalDebug) originalDebug.apply(console, args);
        };

        process.on('uncaughtException', (error) => {
            this.addLog('error', `❌ Uncaught Exception: ${error.message}\n${error.stack}`);
        });

        process.on('unhandledRejection', (reason, promise) => {
            this.addLog('error', `❌ Unhandled Rejection at: ${promise}\nReason: ${reason}`);
        });
    }

    // ===== ADICIONAR LOG AO BUFFER =====
    addLog(type, message) {
        const timeInfo = this.getCurrentTime();
        
        const logEntry = {
            type: type,
            message: message,
            timestamp: timeInfo.iso,
            localTime: timeInfo.local,
            fullTime: timeInfo.full
        };
        
        this.logBuffer.push(logEntry);
        
        if (this.logBuffer.length > this.maxBufferSize) {
            this.logBuffer.shift();
        }
        
        this.broadcast(logEntry);
        
        return logEntry;
    }

    // ===== MONITORAR SISTEMA =====
    startSystemMonitoring() {
        setInterval(() => {
            const mem = process.memoryUsage();
            const uptime = process.uptime();
            const horas = Math.floor(uptime / 3600);
            const minutos = Math.floor((uptime % 3600) / 60);
            
            this.addLog('system', 
                `📊 Status: RSS ${this.formatBytes(mem.rss)} | ` +
                `Heap ${this.formatBytes(mem.heapUsed)} | ` +
                `Uptime ${horas}h ${minutos}m | ` +
                `Clientes: ${this.clients.size}`
            );
        }, 60000);
    }

    // ===== CONFIGURAR WEBSOCKET =====
    setupWebSocket() {
        this.wss.on('connection', (ws) => {
            const clientId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            console.log(`🖥️  Cliente ${clientId} conectado (total: ${this.clients.size + 1})`);
            
            ws.isAlive = true;
            ws.clientId = clientId;
            
            ws.on('pong', () => {
                ws.isAlive = true;
            });
            
            // Guardar cliente no Map
            this.clients.set(clientId, ws);
            
            // ENVIAR BUFFER DE LOGS IMEDIATAMENTE NA CONEXÃO
            this.sendFullBuffer(ws, clientId);
            
            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    if (data.type === 'execute_command') {
                        this.executeCommand(ws, data.command);
                    } else if (data.type === 'ping') {
                        ws.send(JSON.stringify({ type: 'pong' }));
                    } else if (data.type === 'request_history') {
                        // Se o cliente pedir histórico explicitamente, enviar de novo
                        this.sendFullBuffer(ws, clientId);
                    }
                } catch (error) {
                    console.error('Erro ao processar mensagem:', error);
                }
            });

            ws.on('close', (code, reason) => {
                console.log(`🔌 Cliente ${clientId} desconectado (código: ${code})`);
                this.clients.delete(clientId);
            });

            ws.on('error', (error) => {
                console.error(`❌ Erro no WebSocket cliente ${clientId}:`, error.message);
            });
        });

        // Keep-alive
        setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (ws.isAlive === false) {
                    console.log(`💀 Cliente ${ws.clientId} inativo, terminando conexão`);
                    this.clients.delete(ws.clientId);
                    return ws.terminate();
                }
                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);
    }

    // ===== ENVIAR BUFFER COMPLETO =====
    sendFullBuffer(ws, clientId) {
        if (ws.readyState !== WebSocket.OPEN) return;
        
        console.log(`📦 Enviando buffer completo (${this.logBuffer.length} logs) para cliente ${clientId}`);
        
        // Mensagem inicial
        ws.send(JSON.stringify({
            type: 'system',
            message: `📦 Enviando ${this.logBuffer.length} logs históricos...`,
            timestamp: new Date().toISOString(),
            localTime: this.getCurrentTime().local,
            fullTime: this.getCurrentTime().full
        }));
        
        // Enviar logs em lotes
        let index = 0;
        const BATCH_SIZE = 100;
        
        const sendNextBatch = () => {
            if (ws.readyState !== WebSocket.OPEN) {
                console.log(`⚠️ Cliente ${clientId} desconectado durante envio`);
                return;
            }
            
            const batch = this.logBuffer.slice(index, index + BATCH_SIZE);
            
            batch.forEach(log => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(log));
                }
            });
            
            index += BATCH_SIZE;
            
            if (index < this.logBuffer.length && ws.readyState === WebSocket.OPEN) {
                setTimeout(sendNextBatch, 50);
            } else {
                setTimeout(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'system',
                            message: `✅ Histórico completo (${this.logBuffer.length} logs) enviado para cliente ${clientId}`,
                            timestamp: new Date().toISOString(),
                            localTime: this.getCurrentTime().local,
                            fullTime: this.getCurrentTime().full
                        }));
                        
                        // Enviar comando buffer() automaticamente
                        setTimeout(() => {
                            if (ws.readyState === WebSocket.OPEN) {
                                ws.send(JSON.stringify({
                                    type: 'command_result',
                                    result: this.getBufferStats(),
                                    timestamp: new Date().toISOString(),
                                    localTime: this.getCurrentTime().local,
                                    fullTime: this.getCurrentTime().full
                                }));
                            }
                        }, 500);
                    }
                }, 100);
            }
        };
        
        sendNextBatch();
    }

    // ===== BROADCAST =====
    broadcast(logEntry) {
        const logString = JSON.stringify(logEntry);
        this.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(logString);
            }
        });
    }

    // ===== EXECUTAR COMANDOS =====
    executeCommand(ws, command) {
        try {
            console.log(`⚡ Comando: ${command}`);
            
            let resultado = '';
            
            if (command === 'help()') {
                resultado = this.getHelpText();
            } else if (command === 'logs()') {
                resultado = this.getLastLogs();
            } else if (command === 'buffer()') {
                resultado = this.getBufferStats();
            } else if (command === 'stats()') {
                resultado = this.getSystemStats();
            } else if (command === 'history()' || command === 'resend') {
                // Comando para reenviar histórico
                this.sendFullBuffer(ws, ws.clientId);
                resultado = '📦 Reenviando histórico...';
            } else {
                try {
                    const result = eval(command);
                    resultado = `📝 Resultado: ${result}`;
                } catch {
                    resultado = `❌ Comando não reconhecido: "${command}"`;
                }
            }
            
            if (resultado) {
                ws.send(JSON.stringify({
                    type: 'command_result',
                    result: resultado,
                    timestamp: new Date().toISOString(),
                    localTime: this.getCurrentTime().local,
                    fullTime: this.getCurrentTime().full
                }));
            }

        } catch (error) {
            ws.send(JSON.stringify({
                type: 'command_error',
                error: error.message,
                timestamp: new Date().toISOString(),
                localTime: this.getCurrentTime().local,
                fullTime: this.getCurrentTime().full
            }));
        }
    }

    getHelpText() {
        return `╔══════════════════════════════════════════════════════════════╗
║                    🚀 CONSOLE DO SERVIDOR                    ║
╚══════════════════════════════════════════════════════════════╝

📋 COMANDOS:
  help()      → Esta ajuda
  stats()     → Estatísticas do sistema
  logs()      → Últimos 10 logs
  buffer()    → Estatísticas do buffer
  history()   → Reenviar histórico completo
  clear()     → Limpa console

📊 LOGS NO BUFFER: ${this.logBuffer.length}`;
    }

    getLastLogs() {
        const ultimos = this.logBuffer.slice(-10).map(log => 
            `[${log.localTime || '??:??'}] ${log.type}: ${log.message.substring(0, 80)}`
        ).join('\n');
        
        return `📋 ÚLTIMOS 10 LOGS:\n\n${ultimos}`;
    }

    getBufferStats() {
        const tipos = {};
        this.logBuffer.forEach(log => {
            tipos[log.type] = (tipos[log.type] || 0) + 1;
        });
        
        const primeiro = this.logBuffer[0]?.localTime || 'N/A';
        const ultimo = this.logBuffer[this.logBuffer.length-1]?.localTime || 'N/A';
        
        return `📊 BUFFER STATS:
  Total: ${this.logBuffer.length} logs
  Início: ${primeiro}
  Fim: ${ultimo}
  
  Clientes ativos: ${this.clients.size}
  
  Tipos:
${Object.entries(tipos).map(([t, q]) => `    ${t}: ${q}`).join('\n')}`;
    }

    getSystemStats() {
        const mem = process.memoryUsage();
        const uptime = process.uptime();
        const horas = Math.floor(uptime / 3600);
        const minutos = Math.floor((uptime % 3600) / 60);
        
        return `📊 SISTEMA:
  PID: ${process.pid}
  Uptime: ${horas}h ${minutos}m
  RSS: ${this.formatBytes(mem.rss)}
  Heap: ${this.formatBytes(mem.heapUsed)}
  Clientes: ${this.clients.size}`;
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
    }
}

module.exports = LoggerService;