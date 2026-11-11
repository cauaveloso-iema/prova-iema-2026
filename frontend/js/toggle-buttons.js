// js/toggle-buttons.js
// Script para controlar visibilidade dos ícones de acessibilidade e chatbot
// + Controle do VLibras (corrigido)
// ✅ Estado inicial: ESCONDIDO — ícones só aparecem ao clicar no botão

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
        defaultHidden: true,        // ✅ padrão = ESCONDIDO
        rememberState: false        // ✅ não lembrar entre sessões
    };

    // ============================================
    // ESTADO INICIAL: SEMPRE ESCONDIDO
    // ============================================
    let iconesVisiveis = false;   // ✅ começa ESCONDIDO

    // ✅ Limpa qualquer estado salvo antigo
    try {
        localStorage.removeItem('iconesVisiveis');
        console.log('🧹 Estado antigo do localStorage removido');
    } catch (e) {
        console.warn('Não foi possível limpar localStorage:', e);
    }

    // ============================================
    // CRIAR O BOTÃO
    // ============================================
    function criarBotao() {
        if (document.getElementById('toggle-buttons-btn')) return null;

        const btn = document.createElement('button');
        btn.id = 'toggle-buttons-btn';
        btn.setAttribute('aria-label', 'Mostrar/esconder ícones de acessibilidade e chatbot');
        btn.setAttribute('title', 'Clique para mostrar os ícones');
        btn.setAttribute('data-icones-visiveis', 'false'); // ✅ começa escondido

        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '620px',
            left: '110px',
            width: CONFIG.buttonSize,
            height: CONFIG.buttonSize,
            borderRadius: '50%',
            background: 'transparent',
            color: '#6c757d',           // ✅ cinza = desativado
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
            btn.style.color = iconesVisiveis ? '#0D6EFD' : '#6c757d';
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
    // ESCONDER VLIBRAS
    // ============================================
    function esconderVLibras() {
        console.log('🙈 Escondendo VLibras...');
        let totalEscondido = 0;

        VLIBRAS_SELETORES.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                if (!el) return;

                if (el.dataset.vlibrasOriginalDisplay === undefined) {
                    el.dataset.vlibrasOriginalDisplay = el.style.display || '';
                }

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
    // MOSTRAR VLIBRAS
    // ============================================
    function mostrarVLibras() {
        console.log('🙉 Mostrando VLibras...');
        let totalMostrado = 0;

        VLIBRAS_SELETORES.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                if (!el) return;

                const displayOriginal = el.dataset.vlibrasOriginalDisplay || '';
                el.style.setProperty('display', displayOriginal, 'important');
                el.style.removeProperty('opacity');
                el.style.removeProperty('visibility');
                el.style.removeProperty('pointer-events');

                delete el.dataset.vlibrasOriginalDisplay;
                totalMostrado++;
            });
        });

        const divVw = document.querySelector('div[vw]');
        if (divVw) {
            divVw.style.setProperty('display', 'block', 'important');
        }

        console.log(`✅ VLibras mostrado! (${totalMostrado} elementos)`);
        return totalMostrado;
    }

    // ============================================
    // LISTA DE ÍCONES A CONTROLAR
    // ============================================
    function getIcones() {
        const icones = [];

        const acessibilidade = document.querySelector(
            '.acessibilidade-btn, .btn-acessibilidade, .accessibility-toggle, #accessibilityBtn, [class*="acessibilidade"] button, [class*="accessibility"] button'
        );
        if (acessibilidade) icones.push(acessibilidade);

        const painelAcessibilidade = document.querySelector(
            '.acessibilidade-panel, .accessibility-panel, [class*="acessibilidade-panel"], [class*="accessibility-panel"]'
        );
        if (painelAcessibilidade) icones.push(painelAcessibilidade);

        const chatbotBtn = document.querySelector('.chatbot-button, #chatbotBtn, [class*="chatbot-button"]');
        if (chatbotBtn) icones.push(chatbotBtn);

        const chatbotContainer = document.querySelector('.chatbot-container, #chatbotContainer, [class*="chatbot-container"]');
        if (chatbotContainer) icones.push(chatbotContainer);

        document.querySelectorAll('.hide-on-toggle').forEach(el => icones.push(el));

        return icones;
    }

    // ============================================
    // MOSTRAR/ESCONDER ÍCONES
    // ============================================
    function toggleIcones(mostrar = null) {
        // ✅ Se mostrar === null → clique real, inverte
        // ✅ Se mostrar for passado → respeita (usado na inicialização)
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

            icon.style.transition = `opacity ${CONFIG.animationDuration}ms ease, transform ${CONFIG.animationDuration}ms ease, visibility ${CONFIG.animationDuration}ms ease`;

            if (esconder) {
                icon.style.opacity = '0';
                icon.style.transform = 'scale(0.5)';
                icon.style.pointerEvents = 'none';
                icon.style.visibility = 'hidden';
            } else {
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
            // ✅ Azul = visível (ativado), cinza = escondido (desativado)
            btn.style.color = iconesVisiveis ? '#0D6EFD' : '#6c757d';
            btn.style.background = 'transparent';
            btn.setAttribute('data-icones-visiveis', iconesVisiveis ? 'true' : 'false');
            btn.setAttribute('title', iconesVisiveis
                ? 'Clique para esconder os ícones'
                : 'Clique para mostrar os ícones'
            );
        }

        // ❌ Não salva no localStorage (para não persistir entre sessões)

        console.log(`🎮 Ícones ${iconesVisiveis ? 'visíveis' : 'escondidos'}`);
    }

    // ============================================
    // EXPORTAR FUNÇÕES
    // ============================================
    window.toggleIcones = toggleIcones;
    window.esconderVLibras = esconderVLibras;
    window.mostrarVLibras = mostrarVLibras;

    // ============================================
    // OBSERVAR MUDANÇAS NO DOM
    // ============================================
    function observarMudancas() {
        const observer = new MutationObserver(() => {
            // Se os ícones estão escondidos, garante que continuem escondidos
            if (!iconesVisiveis) {
                const vlibras = document.querySelector('div[vw]');
                if (vlibras && vlibras.style.display !== 'none') {
                    console.log('🔄 VLibras detectado visível, escondendo...');
                    esconderVLibras();
                }
            }

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
    // INICIALIZAR (ESTADO INICIAL = ESCONDIDO)
    // ============================================
    function init() {
        console.log('🚀 Inicializando sistema...');

        const btn = criarBotao();
        if (btn) {
            document.body.appendChild(btn);
            btn.addEventListener('click', () => {
                console.log('🖱️ Botão de controle clicado');
                toggleIcones();  // ← clique real, inverte estado
            });
            console.log('✅ Botão de controle criado');
        }

        // ✅ Estado inicial: SEMPRE ESCONDIDO
        setTimeout(() => {
            console.log('📌 Aplicando estado inicial: ESCONDIDO (ícones ocultos)');
            toggleIcones(false);  // ← força ESCONDIDO
        }, 200);

        // 🔁 Re-aplica após VLibras e chatbot carregarem
        setTimeout(() => {
            console.log('🔁 Re-aplicando estado ESCONDIDO (pós-carregamento)');
            toggleIcones(false);
        }, 1500);

        setTimeout(() => {
            console.log('🔁 Re-aplicando estado ESCONDIDO (pós-VLibras)');
            toggleIcones(false);
        }, 3000);

        observarMudancas();

        // Atalho Ctrl+Shift+H
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'H') {
                e.preventDefault();
                toggleIcones();
            }
        });

        console.log('✅ Botão de controle de ícones inicializado');
        console.log('💡 Estado inicial: ESCONDIDO (ícones não aparecem)');
        console.log('💡 Clique no botão 🎮 para MOSTRAR os ícones');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();