// ============================================================================
// sw.js — SERVICE WORKER ÚNICO (EducaPleno)
// Versão: 3.2 (Força offline.html em caso de falha de rede)
// ============================================================================

const CACHE_NAME = 'educapleno-v4'; // ⚠️ Mudei para v4 para forçar a atualização
const OFFLINE_URL = '/offline.html';

// INSTALAÇÃO
self.addEventListener('install', event => {
    console.log('🔧 [SW] Instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            // Cacheia apenas o offline.html (o essencial)
            return cache.add(OFFLINE_URL).catch(err => {
                console.warn('⚠️ [SW] Falha ao cachear offline.html:', err.message);
            });
        })
    );
    self.skipWaiting();
});

// ATIVAÇÃO (Limpa caches antigos, incluindo o v3)
self.addEventListener('activate', event => {
    console.log('⚡ [SW] Ativado');
    event.waitUntil(
        caches.keys()
            .then(keys =>
                Promise.all(
                    keys.filter(k => k !== CACHE_NAME).map(k => {
                        console.log('🗑️ [SW] Removendo cache antigo:', k);
                        return caches.delete(k);
                    })
                )
            )
            .then(() => self.clients.claim())
    );
});

// FETCH
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // 1) Ignorar APIs e métodos não-GET
    if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') return;

    // 2) IGNORAR DOMÍNIOS EXTERNOS (CDNs, OneSignal, etc.)
    if (url.origin !== self.location.origin) return;

    // 3) NAVEGAÇÃO (Páginas HTML)
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Se a rede funcionou, retorna a página
                    return response;
                })
                .catch(() => {
                    // 🚨 SE A REDE FALHAR (OFFLINE): Vai direto pro offline.html
                    console.log('📴 [SW] Rede falhou. Servindo offline.html...');
                    return caches.match(OFFLINE_URL);
                })
        );
        return;
    }

    // 4) OUTROS RECURSOS (JS, CSS, Imagens locais)
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).catch(() => {
                // Se falhar e for JS/CSS, retorna vazio para não quebrar a página
                if (event.request.destination === 'script' || event.request.destination === 'style') {
                    return new Response('', { headers: { 'Content-Type': 'text/plain' } });
                }
                // Se for imagem, retorna um pixel transparente
                if (event.request.destination === 'image') {
                    return new Response('', { status: 200, headers: { 'Content-Type': 'image/svg+xml' } });
                }
                return null;
            });
        })
    );
});

// PUSH NOTIFICATIONS
self.addEventListener('push', event => {
    let data = { title: 'EducaPleno', body: 'Você tem uma nova notificação.' };
    try {
        if (event.data) data = event.data.json();
    } catch (e) {}

    const options = {
        body: data.body,
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        vibrate: [200, 100, 200],
        data: data.data || {}
    };
    event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const urlToOpen = event.notification.data?.url || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            for (const client of clientList) {
                if (client.url.includes(urlToOpen) && 'focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow(urlToOpen);
        })
    );
});