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
    console.log('📦 Instalando Service Worker e criando cache...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log(`✅ Adicionando ${urlsToCache.length} arquivos ao cache...`);
                return cache.addAll(urlsToCache);
            })
            .then(() => {
                console.log('✅ Cache criado com sucesso!');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('❌ Erro ao criar cache:', error);
            })
    );
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
    if (event.request.url.includes('/api/')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    console.log('📦 Cache hit:', event.request.url);
                    return response;
                }

                console.log('🌐 Buscando da rede:', event.request.url);
                return fetch(event.request)
                    .then(response => {
                        if (!response || response.status !== 200) {
                            return response;
                        }

                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(event.request, responseToCache));

                        return response;
                    })
                    .catch(() => {
                        if (event.request.mode === 'navigate') {
                            return caches.match('/offline.html');
                        }
                    });
            })
    );
});