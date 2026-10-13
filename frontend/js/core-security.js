// frontend/js/core-security.js

/**
 * ====================================================================
 * CORE SECURITY & WATCHDOG - EDUCAPLENO
 * ====================================================================
 * 
 * ⚠️ ESCOPO DESTE ARQUIVO:
 *   Este arquivo faz APENAS UMA COISA:
 *   → Monitorar a memória do navegador e recarregar a página
 *     se ela estiver crítica (para evitar crash do navegador).
 * 
 * ⚠️ O QUE ESTE ARQUIVO **NÃO FAZ**:
 *   ❌ NÃO intercepta requisições fetch
 *   ❌ NÃO trata erros 401 / 403
 *   ❌ NÃO força logout em nenhuma outra situação
 *   ❌ NÃO limpa localStorage sozinho
 *   ❌ NÃO desloga por DOM grande
 * 
 * ⚠️ ÚNICO CASO DE LOGOUT:
 *   Somente quando a memória do navegador estiver TÃO CHEIA que
 *   a página está prestes a travar. Nesse caso:
 *   1) Tenta recarregar a página (sem deslogar) — 3 tentativas
 *   2) Se não resolver, aí sim desloga e limpa a sessão
 * 
 * ====================================================================
 */

(function() {
    'use strict';

    // ================================================================
    // CONFIGURAÇÕES
    // ================================================================
    const CONFIG = {
        // ---------- MEMÓRIA ----------
        // Percentual da memória que dispara o recarregamento
        MEMORIA_ALERTA_PERCENT: 95,       // Avisa ao chegar em 95%
        MEMORIA_CRITICA_PERCENT: 98,      // Considera crítico em 98%
        
        // Quantas medições consecutivas acima do limite antes de agir
        MEDICOES_CONSECUTIVAS: 3,
        
        // ---------- TIMING ----------
        INTERVALO_VERIFICACAO_MS: 60 * 1000,   // Verifica a cada 1 minuto
        INTERVALO_LIMPEZA_MS: 15 * 60 * 1000,  // Limpeza a cada 15 minutos
        
        // ---------- RECARREGAMENTO ----------
        // Quantas vezes pode tentar recarregar antes de deslogar
        MAX_RECARREGAMENTOS: 3,
        
        // Janela de tempo (ms) para contar recarregamentos
        JANELA_RECARREGAMENTO_MS: 5 * 60 * 1000, // 5 minutos
        
        // ---------- DEBUG ----------
        DEBUG: false
    };

    // ================================================================
    // LOG HELPER
    // ================================================================
    function log(tipo, mensagem, dados) {
        if (!CONFIG.DEBUG && tipo === 'debug') return;
        
        const prefixos = {
            info: '🛡️ [Core-Security]',
            warn: '⚠️ [Core-Security]',
            error: '❌ [Core-Security]',
            debug: '🔍 [Core-Security]',
            success: '✅ [Core-Security]'
        };
        
        const prefixo = prefixos[tipo] || prefixos.info;
        
        if (dados) {
            console.log(prefixo, mensagem, dados);
        } else {
            console.log(prefixo, mensagem);
        }
    }

    // ================================================================
    // VERIFICAR SE ESTÁ EM PÁGINA DE LOGIN
    // ================================================================
    function estaNaTelaDeLogin() {
        return window.location.pathname.includes('login.html') ||
               window.location.pathname === '/' ||
               window.location.pathname === '/index.html';
    }

    // ================================================================
    // CONTADOR DE RECARREGAMENTOS (para evitar loop infinito)
    // ================================================================
    function obterChaveRecarregamento() {
        return 'core_security_recarregamentos';
    }

    function obterRecarregamentosRecentes() {
        try {
            const dados = JSON.parse(localStorage.getItem(obterChaveRecarregamento()) || '[]');
            const agora = Date.now();
            // Filtra apenas os recarregamentos dentro da janela
            return dados.filter(timestamp => (agora - timestamp) < CONFIG.JANELA_RECARREGAMENTO_MS);
        } catch (e) {
            return [];
        }
    }

    function registrarRecarregamento() {
        try {
            const recentes = obterRecarregamentosRecentes();
            recentes.push(Date.now());
            localStorage.setItem(obterChaveRecarregamento(), JSON.stringify(recentes));
            return recentes.length;
        } catch (e) {
            return 1;
        }
    }

    function limparRecarregamentos() {
        try {
            localStorage.removeItem(obterChaveRecarregamento());
        } catch (e) {}
    }

    // ================================================================
    // LOGOUT FORÇADO (USADO APENAS EM CASO DE MEMÓRIA CRÍTICA)
    // ================================================================
    function forcarLogoutPorMemoriaCritica() {
        // Nunca desloga se já está na tela de login
        if (estaNaTelaDeLogin()) {
            log('debug', 'Já está na tela de login, ignorando logout');
            return;
        }

        log('error', '🚪 Memória crítica persistente — Forçando logout');

        try {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_data');
            localStorage.removeItem(obterChaveRecarregamento());
        } catch (e) {
            console.warn('Erro ao limpar localStorage:', e);
        }

        // Redirecionamento "duro"
        window.location.replace('/login.html?motivo=' + encodeURIComponent('Memória do navegador esgotada'));
    }

    // ================================================================
    // RECARREGAR PÁGINA COM CONTROLE DE LOOP
    // ================================================================
    function recarregarPagina(motivo) {
        const recarregamentos = registrarRecarregamento();
        
        log('warn', `🔄 Tentando recarregar (${recarregamentos}/${CONFIG.MAX_RECARREGAMENTOS}) — Motivo: ${motivo}`);

        // Se já recarregou muitas vezes, a memória não está resolvendo
        // → aí sim desloga para limpar tudo
        if (recarregamentos >= CONFIG.MAX_RECARREGAMENTOS) {
            log('error', '🔴 Muitos recarregamentos sem resolver — Deslogando');
            forcarLogoutPorMemoriaCritica();
            return;
        }

        // Recarrega a página SEM deslogar
        window.location.reload();
    }

    // ================================================================
    // MEDIÇÃO DE MEMÓRIA
    // ================================================================
    function obterUsoMemoria() {
        // Só funciona em Chrome/Edge (não funciona Firefox/Safari)
        if (!performance || !performance.memory) {
            return null;
        }

        try {
            const usedBytes = performance.memory.usedJSHeapSize;
            const limitBytes = performance.memory.jsHeapSizeLimit;
            
            const usedMB = usedBytes / 1024 / 1024;
            const limitMB = limitBytes / 1024 / 1024;
            const percent = (usedBytes / limitBytes) * 100;
            
            return {
                usedMB: usedMB.toFixed(1),
                limitMB: limitMB.toFixed(1),
                percent: percent.toFixed(1),
                percentNum: percent
            };
        } catch (e) {
            return null;
        }
    }

    // ================================================================
    // WATCHDOG — MONITOR DE MEMÓRIA
    // ================================================================
    let medicoesConsecutivasAcima = 0;
    let avisoEmitido = false;

    function verificarMemoria() {
        const memoria = obterUsoMemoria();

        // Navegador não suporta API de memória
        if (!memoria) {
            return;
        }

        log('debug', `📊 Memória: ${memoria.usedMB}MB / ${memoria.limitMB}MB (${memoria.percent}%)`);

        // ==========================================================
        // CASO 1: MEMÓRIA NORMAL
        // ==========================================================
        if (memoria.percentNum < CONFIG.MEMORIA_ALERTA_PERCENT) {
            // Resetar contadores
            if (medicoesConsecutivasAcima > 0) {
                log('debug', '✅ Memória normalizou, resetando contadores');
            }
            medicoesConsecutivasAcima = 0;
            avisoEmitido = false;
            return;
        }

        // ==========================================================
        // CASO 2: MEMÓRIA ALTA (mas não crítica)
        // ==========================================================
        if (memoria.percentNum < CONFIG.MEMORIA_CRITICA_PERCENT) {
            medicoesConsecutivasAcima++;

            if (!avisoEmitido) {
                log('warn', `⚠️ Memória alta: ${memoria.percent}% (${memoria.usedMB}MB)`);
                avisoEmitido = true;
            }

            // Se ficar acima do limite por N medições seguidas → recarrega
            if (medicoesConsecutivasAcima >= CONFIG.MEDICOES_CONSECUTIVAS) {
                log('warn', `⚠️ Memória alta persistente por ${medicoesConsecutivasAcima} medições — Recarregando`);
                medicoesConsecutivasAcima = 0;
                avisoEmitido = false;
                recarregarPagina('Memória alta persistente');
            }
            return;
        }

        // ==========================================================
        // CASO 3: MEMÓRIA CRÍTICA
        // ==========================================================
        log('error', `🔴 Memória CRÍTICA: ${memoria.percent}% (${memoria.usedMB}MB / ${memoria.limitMB}MB)`);
        
        // Ação imediata
        medicoesConsecutivasAcima = 0;
        avisoEmitido = false;
        recarregarPagina('Memória crítica');
    }

    // ================================================================
    // INICIAR WATCHDOG
    // ================================================================
    function iniciarWatchdog() {
        // Não roda na tela de login (não precisa)
        if (estaNaTelaDeLogin()) {
            log('debug', 'Tela de login detectada — Watchdog não será iniciado');
            return;
        }

        log('info', `🐕 Watchdog de memória iniciado (verificação a cada ${CONFIG.INTERVALO_VERIFICACAO_MS / 1000}s)`);

        // Limpa o contador de recarregamentos ao entrar numa página nova
        // (mas só se passou tempo suficiente)
        const recarregamentos = obterRecarregamentosRecentes();
        if (recarregamentos.length === 0) {
            log('debug', 'Nenhum recarregamento recente — contador limpo');
        } else {
            log('debug', `${recarregamentos.length} recarregamento(s) nos últimos 5 min`);
        }

        // Primeira verificação após 30 segundos
        setTimeout(() => {
            verificarMemoria();
        }, 30000);

        // Verificações subsequentes
        setInterval(verificarMemoria, CONFIG.INTERVALO_VERIFICACAO_MS);
    }

    // ================================================================
    // LIMPEZA PERIÓDICA (opcional)
    // ================================================================
    function limparCachesGrandes() {
        log('debug', '🧹 Limpeza periódica de caches grandes...');

        let limpouAlgo = false;

        // Limpa listas grandes se existirem (não desloga, só libera memória)
        try {
            if (window.admin && Array.isArray(window.admin.usuarios) && window.admin.usuarios.length > 2000) {
                const antes = window.admin.usuarios.length;
                window.admin.usuarios = window.admin.usuarios.slice(0, 2000);
                log('debug', `Limpeza: admin.usuarios ${antes} → 2000`);
                limpouAlgo = true;
            }

            if (Array.isArray(window.provasOriginais) && window.provasOriginais.length > 500) {
                const antes = window.provasOriginais.length;
                window.provasOriginais = window.provasOriginais.slice(0, 500);
                log('debug', `Limpeza: provasOriginais ${antes} → 500`);
                limpouAlgo = true;
            }

            if (Array.isArray(window.turmasProfessor) && window.turmasProfessor.length > 100) {
                const antes = window.turmasProfessor.length;
                window.turmasProfessor = window.turmasProfessor.slice(0, 100);
                log('debug', `Limpeza: turmasProfessor ${antes} → 100`);
                limpouAlgo = true;
            }

            if (Array.isArray(window.provasPendentes) && window.provasPendentes.length > 500) {
                const antes = window.provasPendentes.length;
                window.provasPendentes = window.provasPendentes.slice(0, 500);
                log('debug', `Limpeza: provasPendentes ${antes} → 500`);
                limpouAlgo = true;
            }
        } catch (e) {
            console.warn('Erro na limpeza:', e);
        }

        if (!limpouAlgo) {
            log('debug', 'Nenhum cache grande para limpar');
        }
    }

    function iniciarLimpezaPeriodica() {
        // Não roda na tela de login
        if (estaNaTelaDeLogin()) return;

        setInterval(limparCachesGrandes, CONFIG.INTERVALO_LIMPEZA_MS);
    }

    // ================================================================
    // INICIALIZAÇÃO
    // ================================================================
    function init() {
        log('success', '🛡️ Core Security iniciado');

        // Só ativa o watchdog fora da tela de login
        if (!estaNaTelaDeLogin()) {
            iniciarWatchdog();
            iniciarLimpezaPeriodica();
        } else {
            log('debug', 'Tela de login — watchdog desativado');
        }

        log('debug', `💡 Config: alerta=${CONFIG.MEMORIA_ALERTA_PERCENT}% | crítico=${CONFIG.MEMORIA_CRITICA_PERCENT}% | maxRecarregamentos=${CONFIG.MAX_RECARREGAMENTOS}`);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ================================================================
    // API PÚBLICA (APENAS PARA DEBUG)
    // ================================================================
    window.coreSecurity = {
        // Ver status atual
        status: function() {
            const memoria = obterUsoMemoria();
            
            if (!memoria) {
                return {
                    suportado: false,
                    mensagem: 'Navegador não suporta API de memória (só Chrome/Edge)',
                    recarregamentosRecentes: obterRecarregamentosRecentes().length
                };
            }

            return {
                suportado: true,
                memoria: `${memoria.usedMB}MB / ${memoria.limitMB}MB`,
                percent: `${memoria.percent}%`,
                alerta: memoria.percentNum >= CONFIG.MEMORIA_ALERTA_PERCENT ? '⚠️ SIM' : '✅ não',
                critico: memoria.percentNum >= CONFIG.MEMORIA_CRITICA_PERCENT ? '🔴 SIM' : '✅ não',
                recarregamentosRecentes: obterRecarregamentosRecentes().length,
                maxRecarregamentos: CONFIG.MAX_RECARREGAMENTOS
            };
        },

        // Desativar o watchdog (útil para testar)
        desativar: function() {
            CONFIG.MEMORIA_ALERTA_PERCENT = 999;
            CONFIG.MEMORIA_CRITICA_PERCENT = 999;
            log('success', '🛑 Watchdog desativado manualmente');
        },

        // Limpar contador de recarregamentos
        limparContadorRecarregamentos: function() {
            limparRecarregamentos();
            log('success', '🧹 Contador de recarregamentos limpo');
        },

        // Ver config
        config: CONFIG,

        // Forçar logout manual (útil para testes)
        forcarLogout: forcarLogoutPorMemoriaCritica
    };

    log('debug', '💡 Use window.coreSecurity.status() para ver a saúde da página');

})();