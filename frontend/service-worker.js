// ============================================================================
// SERVICE WORKER PARA NOTIFICAÇÕES PUSH
// ============================================================================

const CACHE_NAME = 'provas-cache-v1';

// Instalação do service worker
self.addEventListener('install', (event) => {
    console.log('✅ Service Worker instalado');
    self.skipWaiting();
});

// Ativação
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker ativado');
    event.waitUntil(clients.claim());
});

// Receber notificação push
self.addEventListener('push', (event) => {
    console.log('📨 Push recebido:', event);

    let data = {};
    
    try {
        data = event.data ? event.data.json() : {
            title: 'Nova notificação',
            body: 'Clique para ver',
            icon: '/icon-192x192.png'
        };
    } catch (e) {
        data = {
            title: 'Nova notificação',
            body: event.data ? event.data.text() : 'Clique para ver',
            icon: '/icon-192x192.png'
        };
    }

    const options = {
        body: data.body,
        icon: data.icon || '/icon-192x192.png',
        badge: data.badge || '/badge-72x72.png',
        vibrate: data.vibrate || [200, 100, 200],
        data: data.data || {},
        actions: data.actions || [],
        requireInteraction: data.requireInteraction || false,
        silent: false
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// Clique na notificação
self.addEventListener('notificationclick', (event) => {
    console.log('🔔 Notificação clicada:', event);

    event.notification.close();

    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((clientList) => {
            // Verificar se já tem uma janela aberta
            for (const client of clientList) {
                if (client.url.includes(urlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }
            
            // Abrir nova janela
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});

// Fechar notificação
self.addEventListener('notificationclose', (event) => {
    console.log('🔕 Notificação fechada:', event);
});

// Fetch (cache básico)
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                return response || fetch(event.request);
            })
    );
});