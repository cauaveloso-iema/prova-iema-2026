// js/toggle-buttons.js
// Script para controlar visibilidade dos ícones de acessibilidade e chatbot

(function() {
    'use strict';

    console.log('🔘 Inicializando botão de controle de ícones...');

    // ============================================
    // CONFIGURAÇÕES
    // ============================================
    const CONFIG = {
        buttonColor: '#0D6EFD',      // Cor do botão (azul)
        buttonSize: '30px',           // Tamanho do botão
        buttonPosition: 'left: 20px', // Posição (pode ser 'left' ou 'right')
        animationDuration: 300,        // Duração da animação em ms
        defaultHidden: false,          // Começar com ícones escondidos? (false = mostrados)
        rememberState: true            // Lembrar estado ao recarregar a página
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
        
        // Estilo do botão
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '100px',
            left: '30px',  // Pode mudar para 'right' se quiser
            width: CONFIG.buttonSize,
            height: CONFIG.buttonSize,
            borderRadius: '50%',
            background: CONFIG.buttonColor,
            color: 'white',
            border: '2px solid white',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            cursor: 'pointer',
            zIndex: '10000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '24px',
            transition: 'all 0.3s ease',
            outline: 'none'
        });

        // Ícone inicial (olho aberto = mostrando ícones)
        btn.innerHTML = '👁️';

        // Evento de hover
        btn.addEventListener('mouseenter', () => {
            btn.style.transform = 'scale(1.1)';
            btn.style.boxShadow = '0 6px 16px rgba(13,110,253,0.4)';
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'scale(1)';
            btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
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
    // MOSTRAR/ESCONDER ÍCONES
    // ============================================
    let iconesVisiveis = !CONFIG.defaultHidden; // true = visíveis, false = escondidos

    function toggleIcones(mostrar = null) {
        const icones = getIcones();
        
        if (mostrar !== null) {
            iconesVisiveis = mostrar;
        } else {
            iconesVisiveis = !iconesVisiveis; // alterna
        }

        // Atualizar botão
        const btn = document.getElementById('toggle-buttons-btn');
        if (btn) {
            btn.innerHTML = iconesVisiveis ? '👁️' : '👁️‍🗨️';
            btn.style.background = iconesVisiveis ? CONFIG.buttonColor : '#6c757d';
        }

        // Mostrar/esconder cada ícone com animação
        icones.forEach(icon => {
            if (!icon) return;

            if (iconesVisiveis) {
                // Mostrar
                icon.style.transition = `opacity ${CONFIG.animationDuration}ms ease, transform ${CONFIG.animationDuration}ms ease`;
                icon.style.opacity = '1';
                icon.style.transform = 'scale(1)';
                icon.style.pointerEvents = 'auto';
                icon.style.visibility = 'visible';
            } else {
                // Esconder
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

        console.log(`🔘 Ícones ${iconesVisiveis ? 'visíveis' : 'escondidos'}`);
    }

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
    // OBSERVAR MUDANÇAS NO DOM (para elementos que carregam depois)
    // ============================================
    function observarMudancas() {
        const observer = new MutationObserver(() => {
            // Quando novos elementos aparecerem, aplicar o estado atual
            const icones = getIcones();
            icones.forEach(icon => {
                if (!icon) return;
                
                // Aplicar estado atual sem animação
                icon.style.transition = 'none';
                icon.style.opacity = iconesVisiveis ? '1' : '0';
                icon.style.transform = iconesVisiveis ? 'scale(1)' : 'scale(0.5)';
                icon.style.pointerEvents = iconesVisiveis ? 'auto' : 'none';
                icon.style.visibility = iconesVisiveis ? 'visible' : 'hidden';
                
                // Restaurar transição após um pequeno delay
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
        // Carregar estado salvo
        carregarEstadoSalvo();

        // Criar e adicionar botão
        const btn = criarBotao();
        document.body.appendChild(btn);

        // Evento de clique
        btn.addEventListener('click', () => toggleIcones());

        // Aplicar estado inicial
        toggleIcones(iconesVisiveis);

        // Observar mudanças no DOM
        observarMudancas();

        // Adicionar tecla de atalho (Ctrl+Shift+H)
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'H') {
                e.preventDefault();
                toggleIcones();
            }
        });

        console.log('✅ Botão de controle de ícones inicializado');
    }

    // Executar quando a página carregar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();