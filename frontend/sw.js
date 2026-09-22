// sw.js - VERSÃO CORRIGIDA COM INSTALAÇÃO AUTOMÁTICA
const CACHE_NAME = 'sistema-provas-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/aluno.html',
    '/admin-simples.html',
    '/admin.html',
    '/login.html',
    '/realizar-prova.html',
    '/resultado-aluno.html',
    '/prova.html',
    '/notificacoes.html',
    '/calendario.html',
    '/validar-2fa.html',
    '/trocar-senha.html',
    '/manutencao.html',
    '/offline.html',
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// INSTALAÇÃO - FORÇAR CACHE IMEDIATO
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            for (const url of urlsToCache) {
                try {
                    await cache.add(url);
                } catch (err) {
                    console.warn(`⚠️ Falha ao cachear ${url}:`, err.message);
                    // Continua mesmo assim
                }
            }
        })
    );
    self.skipWaiting();
});

// ATIVAÇÃO - LIMPAR CACHES ANTIGOS
self.addEventListener('activate', event => {
    console.log('⚡ Service Worker ativado');
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => {
                        console.log('🗑️ Removendo cache antigo:', key);
                        return caches.delete(key);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// INTERCEPTAÇÃO - SERVIR DO CACHE
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // 🔥 NÃO cachear APIs
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 🔥 NÃO cachear requisições não-GET
    if (event.request.method !== 'GET') {
        return;
    }

    // Assets: cache-first
    event.respondWith(
        caches.match(event.request).then(cached => {
            return cached || fetch(event.request).then(response => {
                // Só cachear respostas válidas
                if (response.ok && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            });
        }).catch(() => {
            // Fallback para página offline se existir
            return caches.match('/offline.html');
        })
    );
});