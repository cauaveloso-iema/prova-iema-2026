// ============================================================================
// SERVIÇO DE NOTIFICAÇÕES PUSH - ONESIGNAL (VERSÃO DEFINITIVA)
// ============================================================================
// Responsável por enviar notificações push para dispositivos móveis e web
// através da API do OneSignal
// 
// ✅ CORREÇÃO CRÍTICA: Timestamp adicionado aos dados
// ✅ Todas as notificações agora têm data válida
// ============================================================================

const axios = require('axios');

class OneSignalService {
    constructor() {
        this.appId = process.env.ONESIGNAL_APP_ID;
        this.apiKey = process.env.ONESIGNAL_REST_API_KEY;
        
        if (!this.appId || !this.apiKey) {
            console.warn('⚠️ OneSignal não configurado. Push notifications desabilitadas.');
        } else {
            console.log('📱 OneSignal Service inicializado com sucesso');
            console.log(`   App ID: ${this.appId.substring(0, 8)}...`);
        }
    }

    /**
     * Envia uma notificação push para um usuário específico
     * @param {string} usuarioId - ID do usuário no banco de dados
     * @param {string} titulo - Título da notificação
     * @param {string} mensagem - Corpo da mensagem
     * @param {Object} dados - Dados adicionais para enviar junto com a notificação
     * @returns {Promise<Object|boolean>} - Resultado do envio ou false em caso de erro
     */
    async enviarPush(usuarioId, titulo, mensagem, dados = {}) {
        try {
            // ===== VALIDAÇÕES INICIAIS =====
            if (!this.appId || !this.apiKey) {
                console.log('🔕 Push desabilitado - OneSignal não configurado');
                return false;
            }

            if (!usuarioId) {
                console.log('⚠️ ID do usuário não fornecido');
                return false;
            }

            if (!titulo || !mensagem) {
                console.log('⚠️ Título e mensagem são obrigatórios');
                return false;
            }

            // ===== BUSCAR PLAYER_ID DO USUÁRIO =====
            const User = require('mongoose').model('User');
            const user = await User.findById(usuarioId).select('onesignalPlayerId nome email');
            
            if (!user) {
                console.log(`⚠️ Usuário ${usuarioId} não encontrado no banco`);
                return false;
            }

            if (!user.onesignalPlayerId) {
                console.log(`⚠️ Usuário ${usuarioId} (${user.nome || 'sem nome'}) não tem player_id cadastrado`);
                return false;
            }

            console.log(`📤 Enviando push para usuário ${usuarioId} (${user.nome || 'N/A'}) via OneSignal`);
            console.log(`   Título: ${titulo}`);
            console.log(`   Player ID: ${user.onesignalPlayerId.substring(0, 8)}...`);

            // ===== 🔥 CORREÇÃO CRÍTICA: TIMESTAMP VÁLIDO =====
            // Timestamp em milissegundos (formato JavaScript)
            const timestampAtual = Date.now();
            
            // Dados completos com timestamp SEMPRE presente
            const dadosCompletos = {
                ...dados,
                timestamp: timestampAtual,              // ← TIMESTAMP ATUAL (corrige data 1970)
                usuarioId: usuarioId,                    // ID do usuário para referência
                origem: 'sistema_provas',                // Identificação da origem
                versao: '1.0',                           // Versão do payload
                dataEnvio: new Date().toISOString()      // Data ISO para debug
            };

            console.log(`   Timestamp: ${timestampAtual} (${new Date(timestampAtual).toLocaleString('pt-BR')})`);

            // ===== MONTAR PAYLOAD DA NOTIFICAÇÃO =====
            const payload = {
                app_id: this.appId,
                
                // Títulos em múltiplos idiomas
                headings: { 
                    en: titulo,
                    pt: titulo 
                },
                
                // Conteúdo em múltiplos idiomas
                contents: { 
                    en: mensagem,
                    pt: mensagem 
                },
                
                // Destinatários (player IDs)
                include_player_ids: [user.onesignalPlayerId],
                
                // Dados adicionais (importante para o Notification Clicked)
                data: dadosCompletos,
                
                // ===== CONFIGURAÇÕES DE ÁUDIO E APARÊNCIA =====
                android_sound: 'notification',
                android_led_color: 'FF0D6EFD',
                android_accent_color: 'FF0D6EFD',
                small_icon: 'ic_notification',
                large_icon: 'ic_notification',
                
                // ===== PRIORIDADE E EXPIRAÇÃO =====
                priority: 10,                      // Alta prioridade
                ttl: 86400,                        // 24 horas em segundos
                
                // ===== 🔥 NÃO INCLUIR CAMPOS DE AGENDAMENTO =====
                // Importante: não enviar send_after ou schedule
                // para que a notificação seja entregue imediatamente
            };

            // ===== ENVIAR PARA ONESIGNAL =====
            const response = await axios.post('https://onesignal.com/api/v1/notifications', payload, {
                headers: {
                    'Authorization': `Basic ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            // ===== PROCESSAR RESPOSTA =====
            if (response.data && response.data.id) {
                console.log(`✅ Push enviado com sucesso!`);
                console.log(`   ID: ${response.data.id}`);
                console.log(`   Destinatários: ${response.data.recipients || 1}`);
                
                // Retornar dados completos da resposta
                return {
                    success: true,
                    notificationId: response.data.id,
                    recipients: response.data.recipients || 1,
                    externalId: response.data.external_id || null,
                    data: response.data,
                    timestamp: timestampAtual
                };
            } else {
                console.log(`⚠️ Resposta inesperada do OneSignal:`, response.data);
                return false;
            }

        } catch (error) {
            // ===== TRATAMENTO DETALHADO DE ERROS =====
            console.error('❌ Erro ao enviar push:');
            
            if (error.response) {
                // Erro com resposta da API
                console.error(`   Status: ${error.response.status}`);
                console.error(`   Data:`, error.response.data);
                
                // Tratamento específico por código de erro
                if (error.response.status === 401) {
                    console.error('   🔑 Erro de autenticação - Verifique API Key');
                } else if (error.response.status === 404) {
                    console.error('   🔍 App ID não encontrado');
                } else if (error.response.status === 400) {
                    console.error('   📦 Payload inválido:', error.response.data.errors);
                }
            } else if (error.request) {
                // Erro de rede/sem resposta
                console.error(`   Sem resposta do servidor: ${error.message}`);
            } else {
                // Erro na configuração da requisição
                console.error(`   Erro interno: ${error.message}`);
            }
            
            return false;
        }
    }

    /**
     * Envia notificação em lote para múltiplos usuários
     * @param {Array} usuariosIds - Array de IDs de usuários
     * @param {string} titulo - Título da notificação
     * @param {string} mensagem - Corpo da mensagem
     * @param {Object} dados - Dados adicionais
     * @returns {Promise<Object>} - Resultado do envio em lote
     */
    async enviarPushLote(usuariosIds, titulo, mensagem, dados = {}) {
        try {
            if (!this.appId || !this.apiKey) {
                console.log('🔕 Push desabilitado - OneSignal não configurado');
                return { success: false, error: 'OneSignal não configurado' };
            }

            if (!usuariosIds || !Array.isArray(usuariosIds) || usuariosIds.length === 0) {
                console.log('⚠️ Lista de usuários vazia');
                return { success: false, error: 'Nenhum usuário fornecido' };
            }

            // Buscar todos os player_ids dos usuários
            const User = require('mongoose').model('User');
            const users = await User.find({ 
                _id: { $in: usuariosIds },
                onesignalPlayerId: { $exists: true, $ne: null }
            }).select('onesignalPlayerId');

            const playerIds = users
                .map(u => u.onesignalPlayerId)
                .filter(id => id && id.length > 0);

            if (playerIds.length === 0) {
                console.log('⚠️ Nenhum player_id válido encontrado');
                return { success: false, error: 'Nenhum usuário com push habilitado' };
            }

            console.log(`📤 Enviando push em lote para ${playerIds.length} dispositivos`);

            const payload = {
                app_id: this.appId,
                headings: { en: titulo, pt: titulo },
                contents: { en: mensagem, pt: mensagem },
                include_player_ids: playerIds,
                data: {
                    ...dados,
                    timestamp: Date.now(),
                    lote: true
                },
                android_sound: 'notification',
                small_icon: 'ic_notification',
                large_icon: 'ic_notification',
                android_accent_color: 'FF0D6EFD',
                priority: 10,
                ttl: 86400
            };

            const response = await axios.post('https://onesignal.com/api/v1/notifications', payload, {
                headers: {
                    'Authorization': `Basic ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`✅ Push em lote enviado! ID: ${response.data.id}`);
            
            return {
                success: true,
                notificationId: response.data.id,
                recipients: playerIds.length,
                data: response.data
            };

        } catch (error) {
            console.error('❌ Erro no push em lote:', error.response?.data || error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Verifica o status de uma notificação enviada
     * @param {string} notificationId - ID da notificação no OneSignal
     * @returns {Promise<Object>} - Status da notificação
     */
    async verificarStatus(notificationId) {
        try {
            if (!this.appId || !this.apiKey) {
                return { success: false, error: 'OneSignal não configurado' };
            }

            const response = await axios.get(
                `https://onesignal.com/api/v1/notifications/${notificationId}?app_id=${this.appId}`,
                {
                    headers: {
                        'Authorization': `Basic ${this.apiKey}`
                    }
                }
            );

            return {
                success: true,
                data: response.data
            };

        } catch (error) {
            console.error('❌ Erro ao verificar status:', error.response?.data || error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Cancela uma notificação pendente
     * @param {string} notificationId - ID da notificação no OneSignal
     * @returns {Promise<Object>} - Resultado do cancelamento
     */
    async cancelarNotificacao(notificationId) {
        try {
            if (!this.appId || !this.apiKey) {
                return { success: false, error: 'OneSignal não configurado' };
            }

            const response = await axios.delete(
                `https://onesignal.com/api/v1/notifications/${notificationId}?app_id=${this.appId}`,
                {
                    headers: {
                        'Authorization': `Basic ${this.apiKey}`
                    }
                }
            );

            return {
                success: true,
                data: response.data
            };

        } catch (error) {
            console.error('❌ Erro ao cancelar notificação:', error.response?.data || error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = OneSignalService;