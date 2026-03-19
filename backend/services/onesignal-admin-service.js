// ============================================================================
// SERVIÇO ADMIN DO ONESIGNAL - PRODUÇÃO
// ============================================================================
// Integração direta com a API do OneSignal para gerenciamento de dispositivos
// ============================================================================

const axios = require('axios');

class OneSignalAdminService {
    constructor() {
        this.appId = process.env.ONESIGNAL_APP_ID;
        this.apiKey = process.env.ONESIGNAL_REST_API_KEY;
        this.baseUrl = 'https://onesignal.com/api/v1';
        
        if (!this.appId || !this.apiKey) {
            console.error('❌ OneSignal não configurado! Verifique .env');
        } else {
            console.log('📱 OneSignal Admin Service inicializado');
            console.log(`   App ID: ${this.appId.substring(0, 8)}...`);
        }
    }

    // ============ LISTAR TODOS OS DISPOSITIVOS ============
    async listarDispositivos(limit = 300, offset = 0) {
        try {            
            const response = await axios.get(`${this.baseUrl}/players`, {
                params: {
                    app_id: this.appId,
                    limit: limit,
                    offset: offset
                },
                headers: {
                    'Authorization': `Basic ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            return {
                success: true,
                players: response.data.players || [],
                total: response.data.total_count || 0,
                offset: response.data.offset || 0,
                limit: response.data.limit || limit
            };

        } catch (error) {
            console.error('❌ Erro ao listar dispositivos:');
            if (error.response) {
                console.error(`   Status: ${error.response.status}`);
                console.error(`   Data:`, error.response.data);
            } else {
                console.error(`   ${error.message}`);
            }
            
            return {
                success: false,
                error: error.response?.data?.errors || error.message
            };
        }
    }

    // ============ BUSCAR DISPOSITIVO POR ID ============
    async buscarDispositivo(playerId) {
        try {
            console.log(`🔍 Buscando dispositivo ${playerId.substring(0, 8)}...`);
            
            const response = await axios.get(`${this.baseUrl}/players/${playerId}`, {
                params: { app_id: this.appId },
                headers: {
                    'Authorization': `Basic ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            return {
                success: true,
                dispositivo: response.data
            };

        } catch (error) {
            console.error(`❌ Erro ao buscar dispositivo ${playerId}:`, error.response?.data || error.message);
            
            return {
                success: false,
                error: error.response?.data?.errors || error.message
            };
        }
    }

    // ============ ATUALIZAR TAGS DO DISPOSITIVO ============
    async atualizarTags(playerId, tags) {
        try {
            console.log(`🏷️ Atualizando tags do dispositivo ${playerId.substring(0, 8)}...`);
            
            const response = await axios.put(`${this.baseUrl}/players/${playerId}`, {
                app_id: this.appId,
                tags: tags
            }, {
                headers: {
                    'Authorization': `Basic ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            return {
                success: true,
                result: response.data
            };

        } catch (error) {
            console.error(`❌ Erro ao atualizar tags:`, error.response?.data || error.message);
            
            return {
                success: false,
                error: error.response?.data?.errors || error.message
            };
        }
    }

    // ============ DELETAR DISPOSITIVO ============
    async deletarDispositivo(playerId) {
        try {
            console.log(`🗑️ Deletando dispositivo ${playerId.substring(0, 8)} do OneSignal...`);
            
            const response = await axios.delete(`${this.baseUrl}/players/${playerId}`, {
                params: { app_id: this.appId },
                headers: {
                    'Authorization': `Basic ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            return {
                success: true,
                message: 'Dispositivo removido do OneSignal',
                data: response.data
            };

        } catch (error) {
            console.error(`❌ Erro ao deletar dispositivo:`, error.response?.data || error.message);
            
            return {
                success: false,
                error: error.response?.data?.errors || error.message
            };
        }
    }

    // ============ ENVIAR NOTIFICAÇÃO DE TESTE ============
    async enviarNotificacaoTeste(playerId, titulo, mensagem, adminNome = 'Administrador') {
        try {
            console.log(`📤 Enviando notificação de teste para ${playerId.substring(0, 8)}...`);
            
            const timestamp = Date.now();
            
            const response = await axios.post(`${this.baseUrl}/notifications`, {
                app_id: this.appId,
                include_player_ids: [playerId],
                headings: { en: titulo, pt: titulo },
                contents: { en: mensagem, pt: mensagem },
                data: {
                    tipo: 'teste_admin',
                    timestamp: timestamp,
                    admin: adminNome,
                    origem: 'sistema_provas'
                },
                android_sound: 'notification',
                android_accent_color: 'FFE54B4B',
                small_icon: 'ic_notification',
                priority: 10
            }, {
                headers: {
                    'Authorization': `Basic ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            return {
                success: true,
                notificationId: response.data.id,
                data: response.data
            };

        } catch (error) {
            console.error(`❌ Erro ao enviar notificação:`, error.response?.data || error.message);
            
            return {
                success: false,
                error: error.response?.data?.errors || error.message
            };
        }
    }

    // ============ OBTER ESTATÍSTICAS DO APP ============
    async obterEstatisticas() {
        try {
            // Buscar dispositivos
            const dispositivos = await this.listarDispositivos(1000);
            
            if (!dispositivos.success) {
                throw new Error(dispositivos.error);
            }

            const players = dispositivos.players;
            const agora = Math.floor(Date.now() / 1000);
            const seteDiasAtras = agora - (7 * 24 * 60 * 60);
            const trintaDiasAtras = agora - (30 * 24 * 60 * 60);

            // Calcular estatísticas
            const estatisticas = {
                total: dispositivos.total,
                ativos7dias: players.filter(p => p.last_active > seteDiasAtras).length,
                ativos30dias: players.filter(p => p.last_active > trintaDiasAtras).length,
                inativos: players.filter(p => p.last_active <= trintaDiasAtras).length,
                porTipo: {},
                porIdioma: {},
                sdk: {}
            };

            // Contar por tipo de dispositivo
            players.forEach(p => {
                const tipo = this.getTipoDispositivo(p.device_type);
                estatisticas.porTipo[tipo] = (estatisticas.porTipo[tipo] || 0) + 1;
                
                if (p.language) {
                    estatisticas.porIdioma[p.language] = (estatisticas.porIdioma[p.language] || 0) + 1;
                }
                
                if (p.sdk) {
                    const sdk = p.sdk.toString();
                    estatisticas.sdk[sdk] = (estatisticas.sdk[sdk] || 0) + 1;
                }
            });

            return {
                success: true,
                estatisticas
            };

        } catch (error) {
            console.error('❌ Erro ao obter estatísticas:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ============ MAPEAR TIPO DE DISPOSITIVO ============
    getTipoDispositivo(tipo) {
        const tipos = {
            '0': 'iOS',
            '1': 'Android',
            '2': 'Amazon',
            '3': 'WindowsPhone',
            '4': 'Chrome Extension',
            '5': 'Firefox Extension',
            '6': 'Safari Extension',
            '7': 'Edge Extension',
            '8': 'Opera Extension',
            '9': 'MacOS',
            '10': 'Windows'
        };
        return tipos[tipo] || `Desconhecido (${tipo})`;
    }
}

module.exports = OneSignalAdminService;