// ============================================================================
// SERVIÇO DE CONFIGURAÇÕES - SISTEMA DE PROVAS IEMA 2026
// ============================================================================
// Gerencia as configurações do sistema e sincroniza com outros serviços
// ============================================================================

const mongoose = require('mongoose');
const PushService = require('./push-service');

let Config;
try {
    Config = mongoose.model('Config');
} catch {
    const ConfigSchema = new mongoose.Schema({
        chave: { 
            type: String, 
            required: true, 
            unique: true, 
            trim: true 
        },
        valor: { 
            type: mongoose.Schema.Types.Mixed, 
            required: true 
        },
        tipo: { 
            type: String, 
            enum: ['string', 'number', 'boolean', 'object', 'array'], 
            default: 'string' 
        },
        descricao: { 
            type: String, 
            default: '' 
        },
        categoria: { 
            type: String, 
            enum: ['geral', 'sistema', 'seguranca', 'provas', 'email', 'backups', 'logs', 'aparencia', 'notificacoes'], 
            default: 'geral' 
        },
        publico: { 
            type: Boolean, 
            default: false 
        },
        editavel: { 
            type: Boolean, 
            default: true 
        },
        atualizadoPor: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'User' 
        },
        atualizadoEm: { 
            type: Date, 
            default: Date.now 
        }
    }, { 
        timestamps: true 
    });

    ConfigSchema.index({ chave: 1 }, { unique: true });
    ConfigSchema.index({ categoria: 1 });
    ConfigSchema.index({ atualizadoEm: -1 });

    Config = mongoose.model('Config', ConfigSchema);
    console.log('✅ Modelo Config criado com sucesso!');
}

class ConfigService {
    constructor() {
        this.pushService = new PushService();
    }

    // ===== SALVAR CONFIGURAÇÕES =====
    async salvarConfiguracoes(configuracoes, userId) {
        try {
            console.log('%c💾 SALVANDO CONFIGURAÇÕES', 'font-weight:bold; color:#4f46e5;');
            
            // Buscar configurações antigas
            const notificacoesAntigas = await Config.findOne({ chave: 'notificacoes' });
            const notificacoesAntigasValor = notificacoesAntigas ? notificacoesAntigas.valor : {};

            console.log('📋 Configurações antigas de notificações:', notificacoesAntigasValor);

            // Função para achatar objeto
            function flattenObject(obj, prefix = '') {
                return Object.keys(obj).reduce((acc, key) => {
                    const pre = prefix.length ? prefix + '.' : '';
                    if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                        Object.assign(acc, flattenObject(obj[key], pre + key));
                    } else {
                        acc[pre + key] = obj[key];
                    }
                    return acc;
                }, {});
            }

            const flatConfig = flattenObject(configuracoes);
            
            // Salvar cada configuração no banco
            const resultados = [];
            for (const [chave, valor] of Object.entries(flatConfig)) {
                try {
                    // Determinar tipo do valor
                    let tipo = typeof valor;
                    if (Array.isArray(valor)) tipo = 'array';
                    if (valor === null) tipo = 'null';
                    
                    // Categorizar automaticamente pela chave
                    let categoria = 'geral';
                    if (chave.startsWith('sistema')) categoria = 'sistema';
                    else if (chave.startsWith('seguranca')) categoria = 'seguranca';
                    else if (chave.startsWith('provas')) categoria = 'provas';
                    else if (chave.startsWith('notificacoes')) categoria = 'notificacoes';
                    else if (chave.startsWith('email')) categoria = 'email';
                    else if (chave.startsWith('logs')) categoria = 'logs';
                    else if (chave.startsWith('backups')) categoria = 'backups';
                    else if (chave.startsWith('aparencia')) categoria = 'aparencia';
                    else if (chave.startsWith('desempenho')) categoria = 'desempenho';
                    else if (chave.startsWith('api')) categoria = 'api';
                    
                    const result = await Config.findOneAndUpdate(
                        { chave },
                        {
                            chave,
                            valor,
                            tipo,
                            categoria,
                            atualizadoPor: userId,
                            atualizadoEm: new Date()
                        },
                        { upsert: true, new: true }
                    );
                    resultados.push(result);
                } catch (itemError) {
                    console.error(`❌ Erro ao salvar ${chave}:`, itemError.message);
                }
            }

            console.log(`✅ ${resultados.length} configurações salvas`);

            // ===== VERIFICAR SE CONFIGURAÇÃO DE NOTIFICAÇÕES MUDOU =====
            const notificacoesNovas = await Config.findOne({ chave: 'notificacoes' });
            const notificacoesNovasValor = notificacoesNovas ? notificacoesNovas.valor : {};
            
            console.log('📋 Configurações novas de notificações:', notificacoesNovasValor);
            
            // Verificar se a configuração de push mudou
            const pushAntigo = notificacoesAntigasValor?.push === true;
            const pushNovo = notificacoesNovasValor?.push === true;
            
            console.log('🔔 Push antigo:', pushAntigo ? 'ATIVADO' : 'DESATIVADO');
            console.log('🔔 Push novo:', pushNovo ? 'ATIVADO' : 'DESATIVADO');
            
            if (pushAntigo !== pushNovo) {
                console.log('🔄 Sincronizando push global com configurações de notificações...');
                console.log(`   Push: ${pushAntigo ? 'ATIVADO' : 'DESATIVADO'} → ${pushNovo ? 'ATIVADO' : 'DESATIVADO'}`);
                
                // Ativar/desativar push global de acordo com a configuração
                const result = await this.pushService.setPushAtivado(pushNovo, userId);
                
                if (result.success) {
                    console.log(`✅ Push sincronizado com configurações: ${pushNovo ? 'ATIVADO' : 'DESATIVADO'}`);
                    
                    // Log adicional no console do servidor
                    console.log(`📝 LOG: Admin ${userId} alterou push via configurações para ${pushNovo ? 'ATIVADO' : 'DESATIVADO'}`);
                    
                    return {
                        success: true,
                        message: 'Configurações salvas com sucesso! Push sincronizado.',
                        total: resultados.length,
                        pushSincronizado: true,
                        pushAtivado: pushNovo,
                        alteracao: {
                            anterior: pushAntigo,
                            novo: pushNovo
                        }
                    };
                } else {
                    console.error('❌ Erro ao sincronizar push:', result.error);
                }
            } else {
                console.log(`ℹ️ Push permanece ${pushNovo ? 'ATIVADO' : 'DESATIVADO'} (sem alterações)`);
            }

            return {
                success: true,
                message: 'Configurações salvas com sucesso!',
                total: resultados.length,
                pushSincronizado: false,
                pushAtivado: pushNovo
            };

        } catch (error) {
            console.error('❌ Erro ao salvar configurações:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== CARREGAR CONFIGURAÇÕES =====
    async carregarConfiguracoes() {
        try {
            // Configurações padrão
            const configPadrao = {
                aparencia: {
                    corPrimaria: '#667eea',
                    corSecundaria: '#764ba2',
                    modoEscuro: false,
                    tema: 'padrao',
                    animacoes: true,
                    arredondamento: true,
                    logoUrl: '',
                    faviconUrl: ''
                },
                sistema: {
                    nome: 'Sistema de Provas IEMA 2026',
                    versao: '1.0.0',
                    ambiente: process.env.NODE_ENV || 'development',
                    urlBase: process.env.BASE_URL || 'http://localhost:3000',
                    modoManutencao: false,
                    modoDebug: process.env.NODE_ENV !== 'production',
                    timeoutSessao: 60,
                    manutencaoMensagem: 'Sistema em manutenção. Volte mais tarde.'
                },
                seguranca: {
                    jwtExpiracao: process.env.JWT_EXPIRES_IN || '24h',
                    tentativasLogin: 5,
                    bloqueioTempo: 15,
                    doisFatores: false,
                    permitirMultiplosLogins: true,
                    senha: {
                        forcarTrocaInicial: true,
                        tamanhoMinimo: 6,
                        expiracaoDias: 90,
                        exigirMaiuscula: false,
                        exigirNumero: false,
                        exigirEspecial: false
                    }
                },
                provas: {
                    tempoMaximo: 240,
                    tempoMinimo: 10,
                    tempoAdicionalAcessibilidade: true,
                    tempoAdicionalPercent: 50,
                    questoesMinimas: 5,
                    questoesMaximas: 50,
                    correcaoAutomatica: true,
                    liberacaoAutomatica: false,
                    permitirRevisao: true,
                    mostrarGabarito: false,
                    permitirCancelamento: true,
                    notificarProfessorCancelamento: true
                },
                notificacoes: {
                    email: true,
                    sistema: true,
                    push: false,
                    whatsapp: false,
                    lembreteProva: 24,
                    lembreteCorrecao: true,
                    notificarResultado: true,
                    notificarCancelamento: true
                },
                email: {
                    servico: process.env.EMAIL_SERVICE || 'brevo',
                    host: process.env.EMAIL_HOST || 'smtp-relay.brevo.com',
                    porta: parseInt(process.env.EMAIL_PORT) || 587,
                    seguranca: process.env.EMAIL_SECURITY || 'tls',
                    usuario: process.env.EMAIL_USER || '',
                    senha: process.env.EMAIL_PASS ? '********' : '',
                    remetente: process.env.EMAIL_FROM || 'naoresponder@iemasaoluiscentro.net',
                    nomeRemetente: process.env.EMAIL_FROM_NAME || 'Sistema de Provas',
                    notificacoes: true,
                    lembretes: true,
                    resultados: true
                },
                logs: {
                    nivel: process.env.LOG_LEVEL || 'info',
                    retencaoDias: 30,
                    console: true,
                    arquivo: true,
                    auditoria: true,
                    nivelAuditoria: 'medio'
                },
                backups: {
                    automatico: true,
                    frequencia: 'daily',
                    horario: '03:00',
                    manterPor: 30,
                    local: 'local',
                    maxBackups: 50,
                    incluirArquivos: true,
                    compactar: true,
                    ultimoBackup: null,
                    espacoUtilizado: '0 MB'
                },
                desempenho: {
                    cacheTempo: 300,
                    paginacaoPadrao: 20,
                    maxResultados: 1000,
                    compressaoRespostas: true,
                    timeoutRequisicao: 30,
                    limiteArquivo: 10
                },
                api: {
                    rateLimit: 100,
                    versao: 'v1',
                    documentacao: true,
                    chaveObrigatoria: false,
                    cors: true,
                    dominiosPermitidos: ['localhost']
                }
            };

            // Buscar configurações do banco
            const configuracoes = await Config.find().lean();

            if (configuracoes.length === 0) {
                return {
                    success: true,
                    configuracoes: configPadrao,
                    origem: 'padrao'
                };
            }

            // Criar cópia profunda do objeto padrão
            const configObj = JSON.parse(JSON.stringify(configPadrao));
            
            // Aplicar configurações do banco
            configuracoes.forEach(c => {
                if (!c || !c.chave) return;
                
                try {
                    const parts = c.chave.split('.');
                    let target = configObj;
                    let pathExists = true;
                    
                    for (let i = 0; i < parts.length - 1; i++) {
                        if (!target[parts[i]]) {
                            pathExists = false;
                            break;
                        }
                        target = target[parts[i]];
                    }
                    
                    if (pathExists) {
                        const lastKey = parts[parts.length - 1];
                        if (target && target[lastKey] !== undefined) {
                            target[lastKey] = c.valor;
                        }
                    }
                } catch (pathError) {
                    console.warn(`⚠️ Erro ao processar chave ${c.chave}:`, pathError.message);
                }
            });

            return {
                success: true,
                configuracoes: configObj,
                total: configuracoes.length
            };

        } catch (error) {
            console.error('❌ Erro ao carregar configurações:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== OBTER CONFIGURAÇÃO ESPECÍFICA =====
    async getConfiguracao(chave) {
        try {
            const config = await Config.findOne({ chave }).lean();
            
            if (!config) {
                return {
                    success: false,
                    error: 'Configuração não encontrada'
                };
            }

            return {
                success: true,
                configuracao: config
            };

        } catch (error) {
            console.error('❌ Erro ao buscar configuração:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== ATUALIZAR CONFIGURAÇÃO ESPECÍFICA =====
    async atualizarConfiguracao(chave, valor, descricao, categoria, publico, userId) {
        try {
            // Buscar configuração antiga para comparar
            const configAntiga = await Config.findOne({ chave });
            const valorAntigo = configAntiga ? configAntiga.valor : null;

            const config = await Config.findOneAndUpdate(
                { chave },
                {
                    chave,
                    valor,
                    descricao,
                    categoria,
                    publico,
                    atualizadoPor: userId,
                    atualizadoEm: new Date()
                },
                { upsert: true, new: true }
            );

            // Verificar se é configuração de notificações e push mudou
            if (chave === 'notificacoes' && valor) {
                const pushAntigo = valorAntigo?.push === true;
                const pushNovo = valor?.push === true;
                
                console.log(`📝 Atualizando configurações de notificações:`, valor);
                console.log(`🔔 Push antigo: ${pushAntigo ? 'ATIVADO' : 'DESATIVADO'}`);
                console.log(`🔔 Push novo: ${pushNovo ? 'ATIVADO' : 'DESATIVADO'}`);
                
                if (pushAntigo !== pushNovo) {
                    console.log('🔄 Sincronizando push global...');
                    
                    // 🔥 IMPORTANTE: Chamar setPushAtivado
                    const result = await this.pushService.setPushAtivado(pushNovo, userId);
                    
                    if (result.success) {
                        console.log(`✅ Push sincronizado: ${pushNovo ? 'ATIVADO' : 'DESATIVADO'}`);
                    } else {
                        console.error('❌ Erro ao sincronizar push:', result.error);
                    }
                    
                    return {
                        success: true,
                        message: 'Configuração atualizada com sucesso! Push sincronizado.',
                        configuracao: config,
                        pushSincronizado: true,
                        pushAtivado: pushNovo
                    };
                }
            }

            return {
                success: true,
                message: 'Configuração atualizada com sucesso!',
                configuracao: config,
                pushSincronizado: false
            };

        } catch (error) {
            console.error('❌ Erro ao atualizar configuração:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== RESETAR CONFIGURAÇÃO =====
    async resetarConfiguracao(chave) {
        try {
            await Config.deleteOne({ chave });

            return {
                success: true,
                message: 'Configuração resetada para o padrão'
            };

        } catch (error) {
            console.error('❌ Erro ao resetar configuração:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== RESETAR TODAS CONFIGURAÇÕES =====
    async resetarTodasConfiguracoes() {
        try {
            await Config.deleteMany({});

            return {
                success: true,
                message: 'Todas as configurações foram resetadas!'
            };

        } catch (error) {
            console.error('❌ Erro ao resetar configurações:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== OBTER CONFIGURAÇÕES DE NOTIFICAÇÕES =====
    async getConfiguracoesNotificacoes() {
        try {
            const configDoc = await Config.findOne({ chave: 'notificacoes' });
            const configGeral = configDoc ? configDoc.valor : {};
            
            return {
                email: configGeral.email !== false,
                sistema: configGeral.sistema !== false,
                push: configGeral.push === true,
                whatsapp: configGeral.whatsapp === true,
                lembreteProva: configGeral.lembreteProva || 24,
                lembreteCorrecao: configGeral.lembreteCorrecao !== false,
                notificarResultado: configGeral.notificarResultado !== false,
                notificarCancelamento: configGeral.notificarCancelamento !== false
            };
        } catch (error) {
            console.error('❌ Erro ao buscar configurações de notificação:', error);
            return {
                email: true,
                sistema: true,
                push: false,
                whatsapp: false,
                lembreteProva: 24,
                lembreteCorrecao: true,
                notificarResultado: true,
                notificarCancelamento: true
            };
        }
    }
}

module.exports = ConfigService;