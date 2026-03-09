// backend/services/onesignal-service.js
const axios = require('axios');

class OneSignalService {
    constructor() {
        this.appId = process.env.ONESIGNAL_APP_ID;
        this.apiKey = process.env.ONESIGNAL_REST_API_KEY;
        
        if (!this.appId || !this.apiKey) {
            console.warn('⚠️ OneSignal não configurado. Push notifications desabilitadas.');
        }
    }

    async enviarPush(usuarioId, titulo, mensagem, dados = {}) {
        try {
            if (!this.appId || !this.apiKey) {
                console.log('🔕 Push desabilitado - OneSignal não configurado');
                return false;
            }

            // Buscar o player_id do usuário no banco
            // Você precisa adicionar este campo no modelo User
            const User = require('mongoose').model('User');
            const user = await User.findById(usuarioId).select('onesignalPlayerId');
            
            if (!user || !user.onesignalPlayerId) {
                console.log(`⚠️ Usuário ${usuarioId} não tem player_id cadastrado`);
                return false;
            }

            console.log(`📤 Enviando push para usuário ${usuarioId} via OneSignal`);

            const response = await axios.post('https://onesignal.com/api/v1/notifications', {
                app_id: this.appId,
                headings: { en: titulo },
                contents: { en: mensagem },
                include_player_ids: [user.onesignalPlayerId],
                data: dados,  // IMPORTANTE: vai para o Notification Clicked
                android_sound: 'notification',
                small_icon: 'ic_notification',
                large_icon: 'ic_notification',
                android_accent_color: 'FF0D6EFD',
                priority: 10,
                ttl: 86400, // 24 horas
                expiration: 86400
            }, {
                headers: {
                    'Authorization': `Basic ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`✅ Push enviado! ID: ${response.data.id}`);
            return response.data;

        } catch (error) {
            console.error('❌ Erro ao enviar push:', error.response?.data || error.message);
            return false;
        }
    }
}

module.exports = OneSignalService;