// backend/services/logger-service.js
const WebSocket = require('ws');
const os = require('os');

class LoggerService {
    constructor(server) {
        this.wss = new WebSocket.Server({ server });
        this.clients = new Set();
        this.setupWebSocket();
        this.captureConsoleLogs();
        console.log('🔌 Logger Service iniciado!');
    }

    setupWebSocket() {
        this.wss.on('connection', (ws) => {
            console.log('🖥️  Cliente conectado');
            this.clients.add(ws);

            ws.send(JSON.stringify({
                type: 'system',
                message: '✅ Conectado ao servidor de logs',
                timestamp: new Date().toISOString()
            }));

            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    if (data.type === 'execute_command') {
                        this.executeCommand(ws, data.command);
                    }
                } catch (error) {
                    console.error('Erro:', error);
                }
            });

            ws.on('close', () => this.clients.delete(ws));
        });
    }

    captureConsoleLogs() {
        const originalLog = console.log;
        console.log = (...args) => {
            this.broadcast('info', args.join(' '));
            originalLog.apply(console, args);
        };

        const originalError = console.error;
        console.error = (...args) => {
            this.broadcast('error', args.join(' '));
            originalError.apply(console, args);
        };
    }

    executeCommand(ws, command) {
        try {
            console.log(`⚡ Comando: ${command}`);
            
            let resultado = '';
            
            if (command === 'help()' || command === 'help') {
                resultado = 
`╔══════════════════════════════════════════════════════════════╗
║                    🚀 CONSOLE DO SERVIDOR                    ║
╚══════════════════════════════════════════════════════════════╝

📋 COMANDOS BÁSICOS:
────────────────────
  help()     → Mostra esta ajuda
  stats()    → Estatísticas do sistema
  osinfo()   → Informações do SO
  memory()   → Uso de memória
  cpu()      → Informações da CPU
  clear()    → Limpa o console HTML

🧮 EXPRESSÕES MATEMÁTICAS:
────────────────────────
  2 + 2      → Soma
  10 * 5     → Multiplicação
  100 / 4    → Divisão
  Math.PI    → Valor de PI
  Math.random() → Número aleatório

⚠️  INFORMAÇÕES:
───────────────
  • Timeout: 5 segundos
  • Use setas ↑↓ para histórico

👉 Digite qualquer comando acima!`;
            }
            
            else if (command === 'stats()' || command === 'stats') {
                const mem = process.memoryUsage();
                const uptime = process.uptime();
                const horas = Math.floor(uptime / 3600);
                const minutos = Math.floor((uptime % 3600) / 60);
                
                resultado = 
`╔══════════════════════════════════════════════════════════════╗
║                    📊 ESTATÍSTICAS                            ║
╚══════════════════════════════════════════════════════════════╝

🖥️  SERVIDOR:
  Hostname: ${os.hostname()}
  Plataforma: ${os.platform()} (${os.arch()})
  Uptime: ${horas}h ${minutos}m

💾 MEMÓRIA:
  Total: ${this.formatBytes(os.totalmem())}
  Livre: ${this.formatBytes(os.freemem())}
  Em uso: ${Math.round((1 - os.freemem()/os.totalmem())*100)}%

⚙️  PROCESSO:
  PID: ${process.pid}
  Node: ${process.version}
  RSS: ${this.formatBytes(mem.rss)}
  Heap: ${this.formatBytes(mem.heapUsed)}`;
            }
            
            else if (command === 'memory()' || command === 'memory') {
                const mem = process.memoryUsage();
                resultado = 
`╔══════════════════════════════════════════════════════════════╗
║                      📊 USO DE MEMÓRIA                        ║
╚══════════════════════════════════════════════════════════════╝

📍 RSS: ${this.formatBytes(mem.rss)}
🏗️  Heap Total: ${this.formatBytes(mem.heapTotal)}
📦 Heap Usado: ${this.formatBytes(mem.heapUsed)}
🔌 Externo: ${this.formatBytes(mem.external)}`;
            }
            
            else if (command === 'cpu()' || command === 'cpu') {
                const cpus = os.cpus();
                const load = os.loadavg();
                resultado = 
`╔══════════════════════════════════════════════════════════════╗
║                    🖥️  CPUs (${cpus.length} núcleos)                  ║
╚══════════════════════════════════════════════════════════════╝

${cpus.slice(0, 2).map((cpu, i) => `  CPU ${i}: ${cpu.model.substring(0, 40)}`).join('\n')}
${cpus.length > 2 ? `  ... mais ${cpus.length - 2} CPUs` : ''}

📊 CARGA MÉDIA:
  1 min: ${load[0].toFixed(2)} | 5 min: ${load[1].toFixed(2)} | 15 min: ${load[2].toFixed(2)}`;
            }
            
            else if (command === 'osinfo()' || command === 'osinfo') {
                const uptime = os.uptime();
                const dias = Math.floor(uptime / 86400);
                const horas = Math.floor((uptime % 86400) / 3600);
                resultado = 
`╔══════════════════════════════════════════════════════════════╗
║              🖥️  INFORMAÇÕES DO SISTEMA                       ║
╚══════════════════════════════════════════════════════════════╝

📋 DADOS:
  Hostname: ${os.hostname()}
  SO: ${os.platform()} ${os.release()}
  Arquitetura: ${os.arch()}

⏰ ATIVIDADE:
  ${dias}d ${horas}h

💾 MEMÓRIA:
  Total: ${this.formatBytes(os.totalmem())}
  Livre: ${this.formatBytes(os.freemem())}`;
            }
            
            else if (command === 'clear()' || command === 'clear' || command === 'cls') {
                // Envia um comando especial para o frontend limpar o console HTML
                ws.send(JSON.stringify({
                    type: 'clear_console',
                    timestamp: new Date().toISOString()
                }));
                
                resultado = '🧹 Console limpo!';
            }
            
            else {
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
                    timestamp: new Date().toISOString()
                }));
            }

        } catch (error) {
            ws.send(JSON.stringify({
                type: 'command_error',
                error: error.message,
                timestamp: new Date().toISOString()
            }));
        }
    }

    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    broadcast(type, message) {
        const log = JSON.stringify({
            type: type,
            message: message,
            timestamp: new Date().toISOString()
        });
        this.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(log);
        });
    }
}

module.exports = LoggerService;