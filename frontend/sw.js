// sw.js - VERSÃO INTELIGENTE (não cacheia JS/HTML em desenvolvimento)
const CACHE_NAME = 'sistema-provas-v2';  // ⚠️ MUDOU v1 para v2
const urlsToCache = [
    '/offline.html',
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// INSTALAÇÃO
self.addEventListener('install', event => {
    console.log('🔧 Service Worker instalando...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(async cache => {
            for (const url of urlsToCache) {
                try {
                    await cache.add(url);
                    console.log(`✅ Cacheado: ${url}`);
                } catch (err) {
                    console.warn(`⚠️ Falha ao cachear ${url}:`, err.message);
                }
            }
        })
    );
    self.skipWaiting();
});

// ATIVAÇÃO - LIMPAR CACHES ANTIGOS
self.addEventListener('activate', event => {
    console.log('⚡ Service Worker ativado - limpando caches antigos...');
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

// INTERCEPTAÇÃO - ESTRATÉGIA INTELIGENTE
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // 1️⃣ IGNORAR APIs - sempre da rede
    if (url.pathname.startsWith('/api/')) {
        return; // Deixa passar direto
    }

    // 2️⃣ IGNORAR requisições não-GET
    if (event.request.method !== 'GET') {
        return;
    }

    // 🔥 3️⃣ NÃO CACHEAR ARQUIVOS JS E HTML (para desenvolvimento e updates)
    // Isso resolve o problema de "salvei mas não aparece"
    const extensao = url.pathname.split('.').pop().toLowerCase();
    const ehJS = extensao === 'js';
    const ehHTML = extensao === 'html' || url.pathname === '/' || url.pathname.endsWith('/');
    const ehCSS = extensao === 'css';
    
    if (ehJS || ehHTML || ehCSS) {
        // Network-first: tenta rede, se falhar usa cache
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Guarda cópia em cache para offline
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // 4️⃣ PARA O RESTO (imagens, fontes): cache-first
    event.respondWith(
        caches.match(event.request).then(cached => {
            return cached || fetch(event.request).then(response => {
                if (response.ok && response.type === 'basic') {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            });
        }).catch(() => caches.match('/offline.html'))
    );
});

// 🔥 MENSAGEM PARA FORÇAR ATUALIZAÇÃO
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});