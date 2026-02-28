// ============================================
// CLIENTE PARA NOTIFICAÇÕES PUSH - VERSÃO FINAL
// ============================================
// Os usuários NÃO PODEM ativar/desativar manualmente
// O ADMIN controla globalmente via /api/push/admin/toggle
// ============================================

class PushClient {
    constructor() {
        this.swRegistration = null;
        this.isSubscribed = false;
        this.publicKey = null;
        this.apiBaseUrl = window.API_BASE_URL || '/api';
        this.userId = this.getUserId();
        this.applicationServerKey = null;
        this.pushAtivadoGlobal = false;
        this.userRole = this.getUserRole();
        this.initialized = false;
    }

    getUserId() {
        try {
            const userData = localStorage.getItem('user_data');
            if (userData) {
                const user = JSON.parse(userData);
                return user.id || user._id;
            }
        } catch (e) {}
        return null;
    }

    getUserRole() {
        try {
            const userData = localStorage.getItem('user_data');
            if (userData) {
                const user = JSON.parse(userData);
                return user.role;
            }
        } catch (e) {}
        return null;
    }

    isPushSupported() {
        return 'serviceWorker' in navigator && 'PushManager' in window;
    }

    // ===== VERIFICAR STATUS GLOBAL DO PUSH =====
    async checkGlobalStatus() {
        try {
            const response = await fetch(`${this.apiBaseUrl}/push/status`);
            const data = await response.json();
            
            if (data.success) {
                this.pushAtivadoGlobal = data.pushAtivado;
                this.publicKey = data.vapidPublicKey;
                this.applicationServerKey = this.urlBase64ToUint8Array(this.publicKey);
                
                // Atualizar indicador visual para usuários comuns
                this.atualizarIndicadorPush();
                
                return data;
            }
        } catch (error) {
            console.error('❌ Erro ao verificar status global:', error);
        }
        return { pushAtivado: false };
    }

    // ===== ATUALIZAR INDICADOR VISUAL (para alunos/professores) =====
    atualizarIndicadorPush() {
        const indicator = document.getElementById('pushDesativadoIndicator');
        if (!indicator) return;
        
        if (!this.pushAtivadoGlobal) {
            indicator.style.display = 'flex';
        } else {
            indicator.style.display = 'none';
        }
    }

    // ===== INICIALIZAR =====
    async init() {
        console.log('🔔 Inicializando Push Client...');

        if (!this.isPushSupported()) {
            console.log('❌ Push não suportado neste navegador');
            return false;
        }

        if (!this.userId) {
            console.log('❌ Usuário não logado');
            return false;
        }

        // Verificar status global do push
        await this.checkGlobalStatus();

        // Se push estiver desativado, não continuar
        if (!this.pushAtivadoGlobal) {
            console.log('⏸️ Push desativado globalmente pelo administrador');
            return false;
        }

        if (Notification.permission === 'denied') {
            console.log('❌ Permissão de notificações negada');
            return false;
        }

        await this.registerServiceWorker();
        await this.setupSubscription();
        
        this.initialized = true;
        return true;
    }

    urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    }

    async registerServiceWorker() {
        try {
            this.swRegistration = await navigator.serviceWorker.register('/service-worker.js');
            console.log('✅ Service Worker registrado');
        } catch (error) {
            console.error('❌ Erro ao registrar Service Worker:', error);
        }
    }

    async setupSubscription() {
        if (!this.swRegistration) return;
        
        const subscription = await this.swRegistration.pushManager.getSubscription();
        this.isSubscribed = !!subscription;
        
        // Se não estiver inscrito mas push está ativo, tenta inscrever automaticamente
        if (!this.isSubscribed && this.pushAtivadoGlobal && Notification.permission === 'default') {
            // Pede permissão automaticamente (uma vez)
            await this.subscribe();
        }
    }

    // ===== INSCREVER (SÓ FUNCIONA SE PUSH ESTIVER ATIVADO) =====
    async subscribe() {
        try {
            // Verificar novamente se push está ativado
            await this.checkGlobalStatus();
            if (!this.pushAtivadoGlobal) {
                console.log('⏸️ Push desativado globalmente - não é possível inscrever');
                return false;
            }

            if (!this.swRegistration || !this.applicationServerKey) return false;

            const oldSubscription = await this.swRegistration.pushManager.getSubscription();
            if (oldSubscription) {
                await oldSubscription.unsubscribe();
            }

            const subscription = await this.swRegistration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: this.applicationServerKey
            });

            console.log('✅ Nova push subscription criada');
            
            const success = await this.sendSubscriptionToServer(subscription);
            
            if (success) {
                this.isSubscribed = true;
            }

            return success;

        } catch (error) {
            console.error('❌ Erro ao inscrever:', error);
            return false;
        }
    }

    // ===== CANCELAR INSCRIÇÃO (quando push é desativado) =====
    async unsubscribe() {
        try {
            if (!this.swRegistration) return false;

            const subscription = await this.swRegistration.pushManager.getSubscription();

            if (subscription) {
                await this.removeSubscriptionFromServer(subscription.endpoint);
                await subscription.unsubscribe();
                this.isSubscribed = false;
                console.log('🔕 Push subscription cancelada');
                return true;
            }
        } catch (error) {
            console.error('❌ Erro ao cancelar inscrição:', error);
            return false;
        }
    }

    async sendSubscriptionToServer(subscription) {
        try {
            const token = localStorage.getItem('auth_token');

            const response = await fetch(`${this.apiBaseUrl}/push/subscribe`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    subscription: subscription.toJSON ? subscription.toJSON() : subscription,
                    userAgent: navigator.userAgent,
                    deviceInfo: this.getDeviceInfo()
                })
            });

            const data = await response.json();
            
            return data.success;

        } catch (error) {
            console.error('❌ Erro ao enviar subscription:', error);
            return false;
        }
    }

    async removeSubscriptionFromServer(endpoint) {
        try {
            const token = localStorage.getItem('auth_token');
            await fetch(`${this.apiBaseUrl}/push/unsubscribe`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ endpoint })
            });
        } catch (error) {}
    }

    getDeviceInfo() {
        const ua = navigator.userAgent;
        let device = 'desktop';
        if (/mobile/i.test(ua)) device = 'mobile';
        else if (/tablet/i.test(ua)) device = 'tablet';

        let browser = 'unknown';
        if (ua.includes('Chrome')) browser = 'chrome';
        else if (ua.includes('Firefox')) browser = 'firefox';
        else if (ua.includes('Safari')) browser = 'safari';
        else if (ua.includes('Edge')) browser = 'edge';

        return `${device} - ${browser}`;
    }

    // ===== VERIFICAR E MANTER SUBSCRIÇÃO (baseado no status global) =====
    async checkAndMaintainSubscription() {
        if (!this.swRegistration) return;
        
        // Verificar status atual
        await this.checkGlobalStatus();
        
        const subscription = await this.swRegistration.pushManager.getSubscription();
        
        if (this.pushAtivadoGlobal) {
            // Push ativado: deve estar inscrito
            if (!subscription && Notification.permission === 'default') {
                // Pede permissão e inscreve
                await this.subscribe();
            } else if (!subscription && Notification.permission === 'granted') {
                // Tem permissão mas não está inscrito
                await this.subscribe();
            }
        } else {
            // Push desativado: deve cancelar inscrição
            if (subscription) {
                await this.unsubscribe();
            }
        }
    }

    // ===== MÉTODO PÚBLICO PARA CHECAR PERIODICAMENTE =====
    async checkStatus() {
        if (!this.initialized) return;
        await this.checkAndMaintainSubscription();
    }
}

// Inicializar quando o DOM carregar
document.addEventListener('DOMContentLoaded', () => {
    window.pushClient = new PushClient();
    
    // Iniciar com delay para não bloquear carregamento
    setTimeout(() => {
        if (window.pushClient.isPushSupported()) {
            window.pushClient.init();
            
            // Verificar status a cada 60 segundos
            setInterval(() => {
                window.pushClient.checkStatus();
            }, 60000);
        }
    }, 2000);
});