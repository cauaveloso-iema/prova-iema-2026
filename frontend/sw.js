// ============================================================================
// sw.js — SERVICE WORKER ÚNICO (EducaPleno)
// Escopo: / (raiz)
// Funções: Offline fallback + Cache inteligente + Push notifications
// Versão: 3.0 (unificado — substitui sw.js antigo e service-worker.js)
// ============================================================================

const CACHE_NAME = 'educapleno-v3'; // ⚠️ mude a versão sempre que alterar este arquivo
const OFFLINE_URL = '/offline.html';

const urlsToCache = [
    OFFLINE_URL,
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// ============================================================================
// INSTALAÇÃO — pré-cacheia offline.html e recursos essenciais
// ============================================================================
self.addEventListener('install', event => {
    console.log('🔧 [SW] Instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            for (const url of urlsToCache) {
                try {
                    await cache.add(url);
                    console.log(`✅ [SW] Cacheado: ${url}`);
                } catch (err) {
                    console.warn(`⚠️ [SW] Falha ao cachear ${url}:`, err.message);
                }
            }
        })
    );
    self.skipWaiting();
});

// ============================================================================
// ATIVAÇÃO — limpa caches antigos
// ============================================================================
self.addEventListener('activate', event => {
    console.log('⚡ [SW] Ativado');
    event.waitUntil(
        caches.keys()
            .then(keys =>
                Promise.all(
                    keys
                        .filter(k => k !== CACHE_NAME)
                        .map(k => {
                            console.log('🗑️ [SW] Removendo cache antigo:', k);
                            return caches.delete(k);
                        })
                )
            )
            .then(() => self.clients.claim())
    );
});

// ============================================================================
// FETCH — estratégia inteligente com fallback offline
// ============================================================================
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // 1) Ignorar APIs (sempre rede)
    if (url.pathname.startsWith('/api/')) return;

    // 2) Ignorar métodos não-GET
    if (event.request.method !== 'GET') return;

    const ext = url.pathname.split('.').pop().toLowerCase();
    const ehJS   = ext === 'js';
    const ehCSS  = ext === 'css';
    const ehHTML = ext === 'html' || url.pathname === '/' || url.pathname.endsWith('/');

    // 3) NAVEGAÇÃO / HTML: network-first → fallback offline.html
    if (event.request.mode === 'navigate' || ehHTML) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                    }
                    return response;
                })
                .catch(async () => {
                    const cached = await caches.match(event.request);
                    return cached || caches.match(OFFLINE_URL);
                })
        );
        return;
    }

    // 4) JS e CSS: network-first com fallback cache
    if (ehJS || ehCSS) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // 5) Imagens, fontes, ícones: cache-first
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request)
                .then(response => {
                    if (response.ok && response.type === 'basic') {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(OFFLINE_URL));
        })
    );
});

// ============================================================================
// PUSH NOTIFICATIONS
// ============================================================================
self.addEventListener('push', event => {
    console.log('📨 [SW] Push recebido:', event);

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

    event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', event => {
    console.log('🔔 [SW] Notificação clicada:', event);
    event.notification.close();

    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then(clientList => {
                for (const client of clientList) {
                    if (client.url.includes(urlToOpen) && 'focus' in client) {
                        return client.focus();
                    }
                }
                if (clients.openWindow) return clients.openWindow(urlToOpen);
            })
    );
});

self.addEventListener('notificationclose', event => {
    console.log('🔕 [SW] Notificação fechada:', event);
});

// ============================================================================
// MENSAGENS — forçar atualização
// ============================================================================
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});