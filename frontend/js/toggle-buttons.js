// js/toggle-buttons.js
// Script para controlar visibilidade dos ícones de acessibilidade e chatbot

(function() {
    'use strict';

    console.log('🔘 Inicializando botão de controle de ícones...');

    // ============================================
    // CONFIGURAÇÕES
    // ============================================
    const CONFIG = {
        buttonColor: 'transparent',    // Agora transparente
        buttonSize: '40px',             // Tamanho do botão
        buttonPosition: 'left: 20px',   // Posição
        animationDuration: 300,          // Duração da animação em ms
        defaultHidden: false,            // Começar com ícones escondidos? (false = mostrados)
        rememberState: true              // Lembrar estado ao recarregar a página
    };

    // ============================================
    // CRIAR O BOTÃO
    // ============================================
    function criarBotao() {
        // Verificar se já existe
        if (document.getElementById('toggle-buttons-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'toggle-buttons-btn';
        btn.setAttribute('aria-label', 'Mostrar/esconder ícones de acessibilidade e chatbot');
        btn.setAttribute('title', 'Mostrar/esconder ícones de acessibilidade e chatbot');
        
        // Estilo do botão - TRANSPARENTE
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '825px',
            left: '30px',
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

        // Ícone de controle (🎮)
        btn.innerHTML = '🎮';

        // Evento de hover
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
    // LISTA DE ÍCONES A CONTROLAR
    // ============================================
    function getIcones() {
        const icones = [];

        // VLibras - várias formas de selecionar
        const vlibras = document.querySelector('div[vw], [vw-access-button], [vw-plugin-wrapper]');
        if (vlibras) icones.push(vlibras);

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
        const outros = document.querySelectorAll('.hide-on-toggle');
        outros.forEach(el => icones.push(el));

        return icones;
    }

    // ============================================
    // MOSTRAR/ESCONDER ÍCONES (AGORA EXPORTADA)
    // ============================================
    let iconesVisiveis = !CONFIG.defaultHidden;

    function toggleIcones(mostrar = null) {
        const icones = getIcones();
        
        if (mostrar !== null) {
            iconesVisiveis = mostrar;
        } else {
            iconesVisiveis = !iconesVisiveis;
        }

        // Atualizar botão
        const btn = document.getElementById('toggle-buttons-btn');
        if (btn) {
            btn.innerHTML = '🎮';
            btn.style.color = iconesVisiveis ? '#0D6EFD' : '#6c757d';
            btn.style.background = 'transparent';
        }

        // Mostrar/esconder cada ícone com animação
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
                icon.style.visibility = 'hidden';
            }
        });

        // Salvar estado se configurado
        if (CONFIG.rememberState) {
            localStorage.setItem('iconesVisiveis', iconesVisiveis ? 'true' : 'false');
        }

        console.log(`🎮 Ícones ${iconesVisiveis ? 'visíveis' : 'escondidos'}`);
    }

    // ============================================
    // EXPORTAR A FUNÇÃO PARA O ESCOPO GLOBAL
    // ============================================
    window.toggleIcones = toggleIcones;

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
                icon.style.visibility = iconesVisiveis ? 'visible' : 'hidden';
                
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

        btn.addEventListener('click', () => toggleIcones());

        toggleIcones(iconesVisiveis);

        observarMudancas();

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'H') {
                e.preventDefault();
                toggleIcones();
            }
        });

        console.log('✅ Botão de controle de ícones inicializado (🎮 transparente)');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();