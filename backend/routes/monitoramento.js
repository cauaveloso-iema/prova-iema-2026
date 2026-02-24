// backend/routes/monitoramento.js
const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const os = require('os');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Middleware de autenticação para admin
const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');

// Modelos
const User = require('../models/User');
const Prova = require('../models/Prova');
const Turma = require('../models/Turma');

// Modelos inline (se não existirem como arquivos separados)
let Resultado, ProvaRealizada;

try {
    Resultado = mongoose.model('Resultado');
} catch {
    const ResultadoSchema = new mongoose.Schema({
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        provaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prova' },
        alunoNome: String,
        respostas: [String],
        nota: Number,
        acertos: Number,
        total: Number,
        porcentagem: String,
        tempoGasto: Number,
        resultadoDetalhado: [Object],
        notaLiberada: { type: Boolean, default: false },
        cancelada: { type: Boolean, default: false },
        motivoCancelamento: String,
        flagViolacao: { type: Boolean, default: false },
        estatisticasCancelamento: Object,
        motivoCancelamentoTipo: { type: String, enum: ['violacao', 'prazo_expirado', 'outro', null] },
        status: { type: String, enum: ['pendente', 'corrigida', 'cancelada', null] },
        createdAt: { type: Date, default: Date.now }
    });
    Resultado = mongoose.model('Resultado', ResultadoSchema);
}

try {
    ProvaRealizada = mongoose.model('ProvaRealizada');
} catch {
    const ProvaRealizadaSchema = new mongoose.Schema({
        provaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Prova' },
        alunoId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        respostas: [String],
        nota: Number,
        tempoGasto: Number,
        dataRealizacao: { type: Date, default: Date.now },
        status: { type: String, enum: ['pendente', 'em_andamento', 'finalizada', 'corrigida', 'cancelada'] },
        notaLiberada: { type: Boolean, default: false },
        resultadoDetalhado: [Object],
        cancelada: { type: Boolean, default: false },
        motivoCancelamento: String,
        flagViolacao: { type: Boolean, default: false },
        estatisticasCancelamento: Object,
        motivoCancelamentoTipo: { type: String, enum: ['violacao', 'prazo_expirado', 'outro', null] },
        sincronizadoEm: Date,
        createdAt: { type: Date, default: Date.now }
    });
    ProvaRealizada = mongoose.model('ProvaRealizada', ProvaRealizadaSchema);
}

// Aplicar middlewares
router.use(authMiddleware);
router.use(adminMiddleware);

// ============ LOGS DO SERVIDOR EM TEMPO REAL ============
router.get('/logs/realtime', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Função para enviar logs
    const sendLog = (type, message) => {
        res.write(`data: ${JSON.stringify({ type, message, timestamp: new Date() })}\n\n`);
    };
    
    // Criar diretório de logs se não existir
    const logDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
    
    const logPath = path.join(logDir, 'app.log');
    
    // Capturar console.log do Node.js
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    
    process.stdout.write = function(chunk, encoding, callback) {
        const message = chunk.toString().trim();
        if (message) {
            sendLog('info', message);
            
            // Também escrever no arquivo de log
            const logEntry = `[${new Date().toISOString()}] INFO: ${message}\n`;
            fs.appendFile(logPath, logEntry, (err) => {
                if (err) console.error('Erro ao escrever log:', err);
            });
        }
        return originalStdoutWrite.call(this, chunk, encoding, callback);
    };
    
    process.stderr.write = function(chunk, encoding, callback) {
        const message = chunk.toString().trim();
        if (message) {
            sendLog('error', message);
            
            const logEntry = `[${new Date().toISOString()}] ERROR: ${message}\n`;
            fs.appendFile(logPath, logEntry, (err) => {
                if (err) console.error('Erro ao escrever log:', err);
            });
        }
        return originalStderrWrite.call(this, chunk, encoding, callback);
    };
    
    // Enviar logs existentes do arquivo (últimas 100 linhas)
    if (fs.existsSync(logPath)) {
        const logs = fs.readFileSync(logPath, 'utf8')
            .split('\n')
            .filter(line => line.trim())
            .slice(-100);
        
        logs.forEach(line => {
            try {
                const match = line.match(/\[(.*?)\] (INFO|ERROR): (.*)/);
                if (match) {
                    const [, timestamp, level, message] = match;
                    sendLog(level.toLowerCase(), message);
                } else {
                    sendLog('info', line);
                }
            } catch (e) {
                sendLog('info', line);
            }
        });
    }
    
    // Enviar heartbeat a cada 30 segundos
    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 30000);
    
    // Limpar ao desconectar
    req.on('close', () => {
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
        clearInterval(heartbeat);
    });
});

// ============ MÉTRICAS DO SISTEMA ============
router.get('/metricas', async (req, res) => {
    try {
        // Uso de CPU
        const cpus = os.cpus();
        const loadAvg = os.loadavg();
        
        // Uso de memória
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        
        // Uptime
        const uptime = os.uptime();
        
        // Informações do processo Node
        const processUptime = process.uptime();
        const processMemory = process.memoryUsage();
        
        // Informações de disco
        let diskInfo = 'N/A';
        try {
            if (process.platform === 'win32') {
                const { stdout } = await execPromise('wmic logicaldisk get size,freespace,caption');
                diskInfo = stdout;
            } else {
                const { stdout } = await execPromise('df -h /');
                diskInfo = stdout;
            }
        } catch (error) {
            console.error('Erro ao obter informações de disco:', error);
        }
        
        res.json({
            success: true,
            data: {
                cpu: {
                    cores: cpus.length,
                    model: cpus[0]?.model || 'Unknown',
                    loadAverage: loadAvg,
                    usage: await getCpuUsage()
                },
                memory: {
                    total: totalMem,
                    free: freeMem,
                    used: usedMem,
                    usedPercent: ((usedMem / totalMem) * 100).toFixed(1)
                },
                system: {
                    hostname: os.hostname(),
                    platform: os.platform(),
                    release: os.release(),
                    uptime: uptime,
                    uptimeFormatted: formatUptime(uptime)
                },
                process: {
                    pid: process.pid,
                    uptime: processUptime,
                    memory: processMemory,
                    version: process.version,
                    nodeEnv: process.env.NODE_ENV || 'development'
                },
                disk: diskInfo
            }
        });
    } catch (error) {
        console.error('Erro ao obter métricas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ANOMALIAS DETECTADAS ============
router.get('/anomalias', async (req, res) => {
    try {
        const agora = new Date();
        const ultimas24h = new Date(agora - 24 * 60 * 60 * 1000);
        const ultimos7dias = new Date(agora - 7 * 24 * 60 * 60 * 1000);
        
        const anomalias = [];
        
        // 1. Provas canceladas por violação (últimos 7 dias)
        const provasCanceladas = await ProvaRealizada.find({
            $or: [
                { cancelada: true, dataRealizacao: { $gte: ultimos7dias } },
                { status: 'cancelada', dataRealizacao: { $gte: ultimos7dias } }
            ]
        })
        .populate('alunoId', 'nome email matricula')
        .populate('provaId', 'titulo')
        .sort({ dataRealizacao: -1 })
        .limit(50);

        provasCanceladas.forEach(p => {
            const isViolacao = p.flagViolacao || 
                              (p.motivoCancelamento && (
                                  p.motivoCancelamento.toLowerCase().includes('viola') ||
                                  p.motivoCancelamento.toLowerCase().includes('multiplas')
                              ));
            
            anomalias.push({
                id: p._id,
                tipo: isViolacao ? 'Prova Cancelada - Violação' : 'Prova Cancelada - Prazo',
                descricao: `Aluno ${p.alunoId?.nome || 'Desconhecido'} - ${p.motivoCancelamento || 'Motivo não especificado'}`,
                nivel: isViolacao ? 'critica' : 'media',
                timestamp: p.dataRealizacao,
                solucao: isViolacao ? 
                    'Revisar regras de monitoramento e entrar em contato com o aluno' : 
                    'Ajustar prazos ou permitir nova tentativa com supervisão',
                solucaoImediata: isViolacao ?
                    'Notificar aluno e professor imediatamente' :
                    'Oferecer prazo extra para realização',
                logAssociado: `Prova: ${p.provaId?.titulo || 'N/A'} - Nota: ${p.nota || 0}`,
                aluno: {
                    id: p.alunoId?._id,
                    nome: p.alunoId?.nome,
                    email: p.alunoId?.email
                }
            });
        });

        // 2. Erros de sistema (últimas 24h)
        const logPath = path.join(__dirname, '../../logs/app.log');
        if (fs.existsSync(logPath)) {
            const logs = fs.readFileSync(logPath, 'utf8')
                .split('\n')
                .filter(line => line.includes('ERROR') && new Date(line.split(']')[0].replace('[','')) > ultimas24h)
                .slice(-20);
            
            logs.forEach((log, index) => {
                const match = log.match(/\[(.*?)\] ERROR: (.*)/);
                if (match) {
                    const [, timestamp, message] = match;
                    anomalias.push({
                        id: `error-${Date.now()}-${index}`,
                        tipo: 'Erro no Sistema',
                        descricao: message.substring(0, 200),
                        nivel: message.includes('Mongo') || message.includes('database') ? 'critica' : 'alta',
                        timestamp: new Date(timestamp),
                        solucao: 'Verificar logs detalhados e reiniciar serviço se necessário',
                        solucaoImediata: 'Reiniciar o serviço da aplicação',
                        logAssociado: message
                    });
                }
            });
        }

        // 3. Múltiplas tentativas de acesso (simulado - buscar do banco se tiver collection de logs)
        try {
            const AccessLog = mongoose.model('AccessLog');
            const acessosSuspeitos = await AccessLog.find({
                tipo: 'invalido',
                timestamp: { $gte: ultimas24h },
                tentativas: { $gt: 5 }
            }).limit(20);
            
            acessosSuspeitos.forEach(acesso => {
                anomalias.push({
                    id: acesso._id,
                    tipo: 'Múltiplas Tentativas de Acesso',
                    descricao: `${acesso.tentativas} tentativas falhas do IP ${acesso.ip}`,
                    nivel: 'media',
                    timestamp: acesso.timestamp,
                    solucao: 'Implementar rate limiting e bloquear IP temporariamente',
                    solucaoImediata: 'Adicionar IP à lista de bloqueio',
                    logAssociado: `Usuário: ${acesso.email || 'N/A'}`
                });
            });
        } catch (e) {
            // Collection não existe, ignorar
        }

        // Ordenar por timestamp (mais recentes primeiro)
        anomalias.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json({
            success: true,
            data: anomalias,
            total: anomalias.length
        });

    } catch (error) {
        console.error('Erro ao buscar anomalias:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ESTATÍSTICAS DE MONITORAMENTO ============
router.get('/estatisticas', async (req, res) => {
    try {
        const agora = new Date();
        const ultimas24h = new Date(agora - 24 * 60 * 60 * 1000);
        const ultimos7dias = new Date(agora - 7 * 24 * 60 * 60 * 1000);

        // Estatísticas de cancelamentos
        const cancelamentos24h = await ProvaRealizada.countDocuments({
            $or: [
                { cancelada: true, dataRealizacao: { $gte: ultimas24h } },
                { status: 'cancelada', dataRealizacao: { $gte: ultimas24h } }
            ]
        });

        const cancelamentos7d = await ProvaRealizada.countDocuments({
            $or: [
                { cancelada: true, dataRealizacao: { $gte: ultimos7dias } },
                { status: 'cancelada', dataRealizacao: { $gte: ultimos7dias } }
            ]
        });

        // Violações (flagViolacao = true)
        const violacoes24h = await ProvaRealizada.countDocuments({
            flagViolacao: true,
            dataRealizacao: { $gte: ultimas24h }
        });

        // Erros no log (últimas 24h)
        let erros24h = 0;
        const logPath = path.join(__dirname, '../../logs/app.log');
        if (fs.existsSync(logPath)) {
            const logs = fs.readFileSync(logPath, 'utf8')
                .split('\n')
                .filter(line => line.includes('ERROR') && new Date(line.split(']')[0].replace('[','')) > ultimas24h);
            erros24h = logs.length;
        }

        // Provas ativas
        const provasAtivas = await Prova.countDocuments({
            status: 'ativa',
            publicada: true
        });

        // Usuários online (últimos 5 minutos)
        const cincoMinutosAtras = new Date(agora - 5 * 60 * 1000);
        const usuariosOnline = await User.countDocuments({
            lastLogin: { $gte: cincoMinutosAtras }
        });

        res.json({
            success: true,
            data: {
                cancelamentos: {
                    ultimas24h: cancelamentos24h,
                    ultimos7dias: cancelamentos7d
                },
                violacoes: {
                    ultimas24h: violacoes24h
                },
                erros: {
                    ultimas24h: erros24h
                },
                sistema: {
                    provasAtivas,
                    usuariosOnline,
                    timestamp: agora
                }
            }
        });

    } catch (error) {
        console.error('Erro ao buscar estatísticas:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ EXECUTAR SOLUÇÃO IMEDIATA ============
router.post('/solucao/:anomaliaId', async (req, res) => {
    try {
        const { anomaliaId } = req.params;
        const { tipo, acao } = req.body;
        
        console.log(`🔧 Aplicando solução imediata para anomalia ${anomaliaId} por admin ${req.userId}`);
        
        // Registrar no log
        const logPath = path.join(__dirname, '../../logs/admin.log');
        const logEntry = `[${new Date().toISOString()}] ADMIN ${req.userId} - Solução aplicada: ${tipo} - ${JSON.stringify(acao)}\n`;
        fs.appendFileSync(logPath, logEntry);

        // Simular aplicação da solução
        await new Promise(resolve => setTimeout(resolve, 1000));

        res.json({
            success: true,
            message: 'Solução aplicada com sucesso',
            solucao: {
                tipo,
                aplicadoPor: req.userId,
                timestamp: new Date()
            }
        });

    } catch (error) {
        console.error('Erro ao aplicar solução:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ FUNÇÕES AUXILIARES ============
async function getCpuUsage() {
    return new Promise((resolve) => {
        const startMeasure = os.cpus().map(cpu => cpu.times);
        
        setTimeout(() => {
            const endMeasure = os.cpus().map(cpu => cpu.times);
            
            const cpuUsage = endMeasure.map((end, i) => {
                const start = startMeasure[i];
                const idleDiff = end.idle - start.idle;
                const totalDiff = Object.keys(end).reduce((sum, key) => 
                    sum + (end[key] - start[key]), 0);
                
                return ((totalDiff - idleDiff) / totalDiff * 100).toFixed(1);
            });
            
            const avgUsage = cpuUsage.reduce((a, b) => a + parseFloat(b), 0) / cpuUsage.length;
            resolve(avgUsage.toFixed(1));
        }, 1000);
    });
}

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    return `${days}d ${hours}h ${minutes}m`;
}

module.exports = router;