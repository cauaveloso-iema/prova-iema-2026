// frontend/js/core-security.js

/**
 * ====================================================================
 * CORE SECURITY & WATCHDOG - EDUCAPLENO
 * ====================================================================
 * Este arquivo é global e deve ser incluído em TODAS as páginas.
 * Ele monitora a saúde da página, intercepta erros 401 e força o logout.
 * ====================================================================
 */

(function() {
    'use strict';

    console.log('🛡️ Core Security & Watchdog inicializado');

    // ================================================================
    // 1. FUNÇÃO GLOBAL DE LOGOUT FORÇADO
    // ================================================================
    window.forcarLogoutGlobal = function(motivo = 'Sessão encerrada') {
        console.warn(`🚪 Forçando logout global: ${motivo}`);
        
        // Limpa os dados de autenticação
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        
        // Evita loop se já estiver na tela de login
        if (window.location.pathname.includes('login.html')) {
            return;
        }

        // Redirecionamento "duro" (hard redirect) - limpa todo o estado
        window.location.replace('/login.html?motivo=' + encodeURIComponent(motivo));
    };

    // ================================================================
    // 2. INTERCEPTOR DE FETCH (Detecta Erros 401/403)
    // ================================================================
    const originalFetch = window.fetch;
    
    window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);
        
        // Se receber 401 (Não Autorizado) ou 403 (Proibido), força o logout
        // EXCEÇÃO: Não forçar logout se for a própria rota de login
        const url = args[0];
        const isLoginRoute = typeof url === 'string' && (url.includes('/api/auth/login') || url.includes('/api/auth/2fa'));
        
        if ((response.status === 401 || response.status === 403) && !isLoginRoute) {
            console.warn(`🔒 Token expirado ou inválido (Erro ${response.status}). Forçando logout...`);
            window.forcarLogoutGlobal('Sessão expirada');
        }
        
        return response;
    };

    // ================================================================
    // 3. WATCHDOG (Monitor de Memória e DOM)
    // ================================================================
    function iniciarWatchdog() {
        console.log('🐕 Watchdog global iniciado - monitorando saúde da página...');
        
        setInterval(() => {
            // A. Verifica Memória (Chrome/Edge)
            if (performance && performance.memory) {
                const usedMB = performance.memory.usedJSHeapSize / 1024 / 1024;
                const limitMB = performance.memory.jsHeapSizeLimit / 1024 / 1024;
                const usagePercent = (usedMB / limitMB) * 100;

                if (usagePercent > 85) {
                    console.warn(`⚠️ Memória alta (${usagePercent.toFixed(1)}%). Forçando recarregamento...`);
                    window.forcarLogoutGlobal('Memória cheia');
                }
            }

            // B. Verifica Tamanho do DOM (Elementos acumulados)
            const totalElementos = document.getElementsByTagName('*').length;
            if (totalElementos > 6000) { // Limite seguro para painéis complexos
                console.warn(`⚠️ DOM muito grande (${totalElementos} elementos). Forçando recarregamento...`);
                window.forcarLogoutGlobal('Página sobrecarregada');
            }

        }, 30000); // Verifica a cada 30 segundos
    }

    // ================================================================
    // 4. LIMPEZA PERIÓDICA DE CACHE (Opcional)
    // ================================================================
    function iniciarLimpezaPeriodica() {
        setInterval(() => {
            console.log('🧹 Limpeza periódica de dados em memória...');
            
            // Se a aplicação tiver variáveis globais grandes, limpe-as aqui
            if (window.admin && window.admin.usuarios && window.admin.usuarios.length > 2000) {
                window.admin.usuarios = window.admin.usuarios.slice(0, 2000);
            }
            // Adicione outras variáveis globais de outros perfis se necessário
        }, 5 * 60 * 1000); // A cada 5 minutos
    }

    // ================================================================
    // 5. INICIALIZAÇÃO AUTOMÁTICA
    // ================================================================
    // Aguarda o DOM estar pronto para iniciar o Watchdog
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            iniciarWatchdog();
            iniciarLimpezaPeriodica();
        });
    } else {
        iniciarWatchdog();
        iniciarLimpezaPeriodica();
    }

})();