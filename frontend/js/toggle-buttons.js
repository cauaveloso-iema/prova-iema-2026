// js/toggle-buttons.js
// Script para controlar visibilidade dos ícones de acessibilidade e chatbot
// + Controle do VLibras (corrigido)

(function() {
    'use strict';

    console.log('🔘 Inicializando botão de controle de ícones...');

    // ============================================
    // CONFIGURAÇÕES
    // ============================================
    const CONFIG = {
        buttonColor: 'transparent',
        buttonSize: '40px',
        buttonPosition: 'left: 20px',
        animationDuration: 300,
        defaultHidden: false,
        rememberState: true
    };

    // ============================================
    // CRIAR O BOTÃO
    // ============================================
    function criarBotao() {
        if (document.getElementById('toggle-buttons-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'toggle-buttons-btn';
        btn.setAttribute('aria-label', 'Mostrar/esconder ícones de acessibilidade e chatbot');
        btn.setAttribute('title', 'Mostrar/esconder ícones de acessibilidade e chatbot');

        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '620px',
            left: '110px',
            width: CONFIG.buttonSize,
            height: CONFIG.buttonSize,
            borderRadius: '50%',
            background: 'transparent',
            color: '#0D6EFD',
            border: 'none',
            boxShadow: 'none',
            cursor: 'pointer',
            zIndex: '10000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '32px',
            transition: 'all 0.3s ease',
            outline: 'none',
            padding: '0',
            margin: '0'
        });

        btn.innerHTML = '🎮';

        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'scale(1.1)';
            btn.style.color = '#4f46e5';
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'scale(1)';
            btn.style.color = '#0D6EFD';
        });

        return btn;
    }

    // ============================================
    // SELETORES DO VLIBRAS
    // ============================================
    const VLIBRAS_SELETORES = [
        'div[vw]',
        '[vw-access-button]',
        '[vw-plugin-wrapper]',
        '#vlibras-access-wrapper',
        '[class*="vlibras"]',
        '[id*="vlibras"]',
        '[id*="VLibras"]'
    ];

    // ============================================
    // FUNÇÃO PARA ESCONDER VLIBRAS (CSS) - CORRIGIDA
    // ============================================
    function esconderVLibras() {
        console.log('🙈 Escondendo VLibras...');

        let totalEscondido = 0;

        VLIBRAS_SELETORES.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                if (!el) return;

                // Salvar SOMENTE o display original
                // (o resto é controlado pelo CSS do VLibras)
                if (el.dataset.vlibrasOriginalDisplay === undefined) {
                    el.dataset.vlibrasOriginalDisplay = el.style.display || '';
                }

                // Esconder APENAS com display:none
                // NÃO mexer em position / left / top (isso quebrava o VLibras)
                el.style.setProperty('display', 'none', 'important');
                el.style.setProperty('opacity', '0', 'important');
                el.style.setProperty('visibility', 'hidden', 'important');
                el.style.setProperty('pointer-events', 'none', 'important');

                totalEscondido++;
            });
        });

        console.log(`✅ VLibras escondido! (${totalEscondido} elementos)`);
        return totalEscondido;
    }

    // ============================================
    // FUNÇÃO PARA MOSTRAR VLIBRAS (CSS) - CORRIGIDA
    // ============================================
    function mostrarVLibras() {
        console.log('🙉 Mostrando VLibras...');

        let totalMostrado = 0;

        VLIBRAS_SELETORES.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                if (!el) return;

                // Restaurar display original (ou '' para voltar ao padrão do CSS do VLibras)
                const displayOriginal = el.dataset.vlibrasOriginalDisplay || '';
                el.style.setProperty('display', displayOriginal, 'important');

                // Limpar APENAS os estilos que nós aplicamos
                el.style.removeProperty('opacity');
                el.style.removeProperty('visibility');
                el.style.removeProperty('pointer-events');

                // Limpar dados salvos
                delete el.dataset.vlibrasOriginalDisplay;

                totalMostrado++;
            });
        });

        // Garantir que o wrapper principal do VLibras fique visível
        const divVw = document.querySelector('div[vw]');
        if (divVw) {
            divVw.style.setProperty('display', 'block', 'important');
        }

        console.log(`✅ VLibras mostrado! (${totalMostrado} elementos)`);
        return totalMostrado;
    }

    // ============================================
    // LISTA DE ÍCONES A CONTROLAR (SEM VLIBRAS)
    // ============================================
    function getIcones() {
        const icones = [];

        // ⚠️ NÃO incluir VLibras aqui — ele é controlado por esconderVLibras/mostrarVLibras

        // Botão de acessibilidade (várias classes possíveis)
        const acessibilidade = document.querySelector(
            '.acessibilidade-btn, .btn-acessibilidade, .accessibility-toggle, #accessibilityBtn, [class*="acessibilidade"] button, [class*="accessibility"] button'
        );
        if (acessibilidade) icones.push(acessibilidade);

        // Painel de acessibilidade (quando aberto)
        const painelAcessibilidade = document.querySelector(
            '.acessibilidade-panel, .accessibility-panel, [class*="acessibilidade-panel"], [class*="accessibility-panel"]'
        );
        if (painelAcessibilidade) icones.push(painelAcessibilidade);

        // Chatbot (botão e container)
        const chatbotBtn = document.querySelector('.chatbot-button, #chatbotBtn, [class*="chatbot-button"]');
        if (chatbotBtn) icones.push(chatbotBtn);

        const chatbotContainer = document.querySelector('.chatbot-container, #chatbotContainer, [class*="chatbot-container"]');
        if (chatbotContainer) icones.push(chatbotContainer);

        // Qualquer outro elemento que você queira controlar
        document.querySelectorAll('.hide-on-toggle').forEach(el => icones.push(el));

        return icones;
    }

    // ============================================
    // MOSTRAR/ESCONDER ÍCONES
    // ============================================
    let iconesVisiveis = !CONFIG.defaultHidden;

    function toggleIcones(mostrar = null) {
        // Determinar novo estado
        if (mostrar !== null) {
            iconesVisiveis = mostrar;
        } else {
            iconesVisiveis = !iconesVisiveis;
        }

        console.log(`🔄 ${iconesVisiveis ? 'MOSTRANDO' : 'ESCONDENDO'} ícones...`);

        // ===== CONTROLAR VLIBRAS =====
        if (!iconesVisiveis) {
            esconderVLibras();
        } else {
            mostrarVLibras();
        }

        // ===== CONTROLAR OUTROS ÍCONES =====
        const icones = getIcones();
        const esconder = !iconesVisiveis;

        icones.forEach(icon => {
            if (!icon) return;

            if (esconder) {
                icon.style.transition = `opacity ${CONFIG.animationDuration}ms ease, transform ${CONFIG.animationDuration}ms ease, visibility ${CONFIG.animationDuration}ms ease`;
                icon.style.opacity = '0';
                icon.style.transform = 'scale(0.5)';
                icon.style.pointerEvents = 'none';
                icon.style.visibility = 'hidden';
            } else {
                icon.style.transition = `opacity ${CONFIG.animationDuration}ms ease, transform ${CONFIG.animationDuration}ms ease, visibility ${CONFIG.animationDuration}ms ease`;
                icon.style.opacity = '1';
                icon.style.transform = 'scale(1)';
                icon.style.pointerEvents = 'auto';
                icon.style.visibility = 'visible';
            }
        });

        // ===== ATUALIZAR BOTÃO =====
        const btn = document.getElementById('toggle-buttons-btn');
        if (btn) {
            btn.innerHTML = '🎮';
            btn.style.color = iconesVisiveis ? '#0D6EFD' : '#6c757d';
            btn.style.background = 'transparent';
        }

        // ===== SALVAR ESTADO =====
        if (CONFIG.rememberState) {
            localStorage.setItem('iconesVisiveis', iconesVisiveis ? 'true' : 'false');
        }

        console.log(`🎮 Ícones ${iconesVisiveis ? 'visíveis' : 'escondidos'}`);
    }

    // ============================================
    // EXPORTAR FUNÇÕES PARA O ESCOPO GLOBAL
    // ============================================
    window.toggleIcones = toggleIcones;
    window.esconderVLibras = esconderVLibras;
    window.mostrarVLibras = mostrarVLibras;

    // ============================================
    // CARREGAR ESTADO SALVO
    // ============================================
    function carregarEstadoSalvo() {
        if (!CONFIG.rememberState) return;

        const salvo = localStorage.getItem('iconesVisiveis');
        if (salvo !== null) {
            iconesVisiveis = salvo === 'true';
            console.log(`📂 Estado carregado: ${iconesVisiveis ? 'visíveis' : 'escondidos'}`);

            // Se estava escondido, aplicar estado
            if (!iconesVisiveis) {
                setTimeout(() => {
                    console.log('🔄 Aplicando estado salvo (escondendo VLibras)...');
                    esconderVLibras();
                }, 300);
            }
        }
    }

    // ============================================
    // OBSERVAR MUDANÇAS NO DOM
    // ============================================
    function observarMudancas() {
        const observer = new MutationObserver(() => {
            // Se os ícones estão escondidos, garantir que VLibras fique escondido
            if (!iconesVisiveis) {
                const vlibras = document.querySelector('div[vw]');
                if (vlibras && vlibras.style.display !== 'none') {
                    console.log('🔄 VLibras detectado visível, escondendo...');
                    esconderVLibras();
                }
            }

            // Garantir que os ícones mantenham o estado correto
            const icones = getIcones();
            const esconder = !iconesVisiveis;

            icones.forEach(icon => {
                if (!icon) return;

                icon.style.transition = 'none';
                icon.style.opacity = esconder ? '0' : '1';
                icon.style.transform = esconder ? 'scale(0.5)' : 'scale(1)';
                icon.style.pointerEvents = esconder ? 'none' : 'auto';
                icon.style.visibility = esconder ? 'hidden' : 'visible';

                setTimeout(() => {
                    icon.style.transition = `opacity ${CONFIG.animationDuration}ms ease, transform ${CONFIG.animationDuration}ms ease, visibility ${CONFIG.animationDuration}ms ease`;
                }, 50);
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // ============================================
    // INICIALIZAR
    // ============================================
    function init() {
        console.log('🚀 Inicializando sistema...');

        carregarEstadoSalvo();

        const btn = criarBotao();
        document.body.appendChild(btn);

        btn.addEventListener('click', () => toggleIcones());

        // Aplicar estado inicial
        setTimeout(() => {
            if (!iconesVisiveis) {
                console.log('📌 Aplicando estado inicial (escondido)');
                toggleIcones(false);
            } else {
                console.log('📌 Aplicando estado inicial (visível)');
                toggleIcones(true);
            }
        }, 200);

        observarMudancas();

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'H') {
                e.preventDefault();
                toggleIcones();
            }
        });

        console.log('✅ Botão de controle de ícones inicializado');
        console.log('💡 Comandos: toggleIcones() | esconderVLibras() | mostrarVLibras()');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();