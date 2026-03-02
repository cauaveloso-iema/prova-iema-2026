// js/toggle-buttons.js - VERSÃO SEM FUNDO (APENAS O ÍCONE)
(function() {
    'use strict';

    console.log('🎮 Inicializando botão de controle de ícones...');

    // ============================================
    // CONFIGURAÇÕES
    // ============================================
    const CONFIG = {
        buttonColor: 'transparent',  // Fundo transparente
        buttonSize: '40px',           // Tamanho um pouco maior para o ícone
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
        
        // Estilo do botão - SEM FUNDO
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '100px',
            left: '30px',
            width: CONFIG.buttonSize,
            height: CONFIG.buttonSize,
            borderRadius: '50%',
            background: 'transparent',  // Fundo transparente
            color: '#0D6EFD',           // Ícone azul
            border: 'none',              // Sem borda
            boxShadow: 'none',           // Sem sombra
            cursor: 'pointer',
            zIndex: '10000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '32px',            // Ícone maior
            transition: 'transform 0.2s ease, color 0.2s ease',
            outline: 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            padding: '0',                // Sem padding
            margin: '0'                  // Sem margem
        });

        // Ícone de controle
        btn.innerHTML = '🎮';

        // Efeito hover sutil (apenas no ícone)
        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'scale(1.1)';
            btn.style.color = '#4f46e5';  // Roxo no hover
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'scale(1)';
            btn.style.color = '#0D6EFD';  // Volta ao azul
        });

        return btn;
    }

    // ============================================
    // LISTA DE ÍCONES A CONTROLAR
    // ============================================
    function getIcones() {
        const icones = [];

        const vlibrasBtn = document.querySelector('[vw-access-button]');
        if (vlibrasBtn) icones.push(vlibrasBtn);

        const acessibilidadeBtn = document.querySelector('.accessibility-toggle, #accessibilityToggle');
        if (acessibilidadeBtn) icones.push(acessibilidadeBtn);

        const painelAcessibilidade = document.querySelector('.accessibility-panel, #accessibilityPanel');
        if (painelAcessibilidade) icones.push(painelAcessibilidade);

        const chatbotBtn = document.querySelector('.chatbot-toggle, #chatbotToggle');
        if (chatbotBtn) icones.push(chatbotBtn);

        const chatbotContainer = document.querySelector('.chatbot-container, #chatbotContainer');
        if (chatbotContainer) icones.push(chatbotContainer);

        return icones;
    }

    // ============================================
    // MOSTRAR/ESCONDER ÍCONES
    // ============================================
    let iconesVisiveis = !CONFIG.defaultHidden;

    window.toggleIcones = function(mostrar = null) {
        const icones = getIcones();
        
        if (mostrar !== null) {
            iconesVisiveis = mostrar;
        } else {
            iconesVisiveis = !iconesVisiveis;
        }

        const btn = document.getElementById('toggle-buttons-btn');
        if (btn) {
            // Muda apenas a cor do ícone baseado no estado
            btn.style.color = iconesVisiveis ? '#0D6EFD' : '#6c757d';
            // Opcional: muda o ícone se quiser
            // btn.innerHTML = iconesVisiveis ? '🎮' : '🎯';
        }

        icones.forEach(icon => {
            if (!icon) return;

            if (iconesVisiveis) {
                icon.style.transition = `opacity ${CONFIG.animationDuration}ms ease, transform ${CONFIG.animationDuration}ms ease`;
                icon.style.opacity = '1';
                icon.style.transform = 'scale(1)';
                icon.style.pointerEvents = 'auto';
                icon.style.visibility = 'visible';
            } else {
                icon.style.transition = `opacity ${CONFIG.animationDuration}ms ease, transform ${CONFIG.animationDuration}ms ease`;
                icon.style.opacity = '0';
                icon.style.transform = 'scale(0.5)';
                icon.style.pointerEvents = 'none';
                icon.style.visibility = 'visible';
            }
        });

        if (CONFIG.rememberState) {
            localStorage.setItem('iconesVisiveis', iconesVisiveis ? 'true' : 'false');
        }

        console.log(`🎮 Ícones ${iconesVisiveis ? 'visíveis' : 'escondidos'}`);
    };

    // ============================================
    // CARREGAR ESTADO SALVO
    // ============================================
    function carregarEstadoSalvo() {
        if (!CONFIG.rememberState) return;

        const salvo = localStorage.getItem('iconesVisiveis');
        if (salvo !== null) {
            iconesVisiveis = salvo === 'true';
        }
    }

    // ============================================
    // OBSERVAR MUDANÇAS NO DOM
    // ============================================
    function observarMudancas() {
        const observer = new MutationObserver(() => {
            const icones = getIcones();
            icones.forEach(icon => {
                if (!icon) return;
                
                icon.style.transition = 'none';
                icon.style.opacity = iconesVisiveis ? '1' : '0';
                icon.style.transform = iconesVisiveis ? 'scale(1)' : 'scale(0.5)';
                icon.style.pointerEvents = iconesVisiveis ? 'auto' : 'none';
                icon.style.visibility = 'visible';
                
                setTimeout(() => {
                    icon.style.transition = `opacity ${CONFIG.animationDuration}ms ease, transform ${CONFIG.animationDuration}ms ease`;
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
        carregarEstadoSalvo();

        const btn = criarBotao();
        document.body.appendChild(btn);

        btn.addEventListener('click', () => {
            window.toggleIcones();
        });

        window.toggleIcones(iconesVisiveis);

        observarMudancas();

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'H') {
                e.preventDefault();
                window.toggleIcones();
            }
        });

        console.log('✅ Botão de controle inicializado - SEM FUNDO, apenas ícone');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();