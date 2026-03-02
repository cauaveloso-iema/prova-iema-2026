// js/draggable.js - VERSÃO COM MÃOZINHA NOS PAINÉIS (VOLTA À POSIÇÃO ORIGINAL)
(function() {
    'use strict';

    console.log('🎯 Configurando botões arrastáveis...');

    // ============================================
    // CONFIGURAÇÃO DOS BOTÕES
    // ============================================
    const botoes = [
        {
            nome: 'Controle',
            seletor: '#toggle-buttons-btn',
            elemento: null,
            configurado: false,
            toggleFn: function() {
                if (window.toggleIcones) {
                    window.toggleIcones();
                    console.log('🎮 toggleIcones chamado');
                }
            }
        },
        {
            nome: 'Acessibilidade',
            seletor: '#accessibilityToggle, .accessibility-toggle',
            elemento: null,
            configurado: false,
            container: '#accessibilityPanel, .accessibility-panel',
            toggleFn: function() {
                if (window.acessibilidade && window.acessibilidade.togglePanel) {
                    window.acessibilidade.togglePanel();
                    console.log('♿ togglePanel chamado');
                    
                    setTimeout(() => {
                        const btn = document.querySelector('#accessibilityToggle, .accessibility-toggle');
                        const painel = document.querySelector('#accessibilityPanel, .accessibility-panel');
                        if (btn && painel && painel.style.display !== 'none') {
                            const btnRect = btn.getBoundingClientRect();
                            painel.style.position = 'fixed';
                            painel.style.left = btnRect.left + 'px';
                            painel.style.top = (btnRect.top - painel.offsetHeight - 10) + 'px';
                            adicionarMaozinhaPainel(painel);
                        }
                    }, 50);
                }
            }
        }
    ];

    // ============================================
    // FUNÇÃO PARA ADICIONAR MÃOZINHA NO PAINEL
    // ============================================
    function adicionarMaozinhaPainel(painel) {
        if (!painel || painel._temMaozinha) return;
        
        const cabecalho = painel.querySelector('.panel-header, .modal-header, .card-header, header');
        
        if (cabecalho) {
            cabecalho.style.cursor = 'grab';
            cabecalho.style.userSelect = 'none';
            cabecalho.setAttribute('title', 'Arraste para mover o painel');
            
            const indicador = document.createElement('div');
            indicador.style.cssText = `
                position: absolute;
                top: 5px;
                right: 40px;
                font-size: 12px;
                color: #6b7280;
                background: rgba(255,255,255,0.9);
                padding: 2px 8px;
                border-radius: 12px;
                border: 1px solid #e5e7eb;
                pointer-events: none;
                z-index: 10000;
            `;
            indicador.innerHTML = '🖐️ Arraste';
            indicador.className = 'painel-arrasto-indicador';
            
            const antigo = painel.querySelector('.painel-arrasto-indicador');
            if (antigo) antigo.remove();
            
            painel.style.position = 'relative';
            cabecalho.appendChild(indicador);
            
            setTimeout(() => {
                indicador.style.transition = 'opacity 0.5s';
                indicador.style.opacity = '0';
                setTimeout(() => indicador.remove(), 500);
            }, 3000);
            
            painel._temMaozinha = true;
            console.log('🖐️ Mãozinha adicionada ao painel');
            
            tornarPainelArrastavel(painel, cabecalho);
        } else {
            painel.style.cursor = 'grab';
            painel.style.userSelect = 'none';
            painel.setAttribute('title', 'Arraste para mover o painel');
            tornarPainelArrastavel(painel, painel);
        }
    }

    // ============================================
    // FUNÇÃO PARA TORNAR O PAINEL ARRASTÁVEL
    // ============================================
    function tornarPainelArrastavel(painel, elementoArrasto) {
        if (painel._arrastavelPainel) return;
        
        painel._arrastavelPainel = true;
        
        let arrastando = false;
        let inicioX, inicioY;
        let offsetX, offsetY;
        
        function iniciar(e) {
            if (e.button !== 0 && e.type !== 'touchstart') return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const clientX = e.clientX ?? (e.touches?.[0]?.clientX ?? 0);
            const clientY = e.clientY ?? (e.touches?.[0]?.clientY ?? 0);
            
            const rect = painel.getBoundingClientRect();
            offsetX = clientX - rect.left;
            offsetY = clientY - rect.top;
            
            inicioX = clientX;
            inicioY = clientY;
            arrastando = true;
            
            elementoArrasto.style.cursor = 'grabbing';
            painel.style.transition = 'none';
            painel.style.zIndex = '1000001';
        }
        
        function mover(e) {
            if (!arrastando) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const clientX = e.clientX ?? (e.touches?.[0]?.clientX ?? 0);
            const clientY = e.clientY ?? (e.touches?.[0]?.clientY ?? 0);
            
            let novaX = clientX - offsetX;
            let novaY = clientY - offsetY;
            
            novaX = Math.max(0, Math.min(novaX, window.innerWidth - painel.offsetWidth));
            novaY = Math.max(0, Math.min(novaY, window.innerHeight - painel.offsetHeight));
            
            painel.style.left = novaX + 'px';
            painel.style.top = novaY + 'px';
        }
        
        function finalizar(e) {
            if (!arrastando) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            arrastando = false;
            elementoArrasto.style.cursor = 'grab';
            painel.style.transition = '';
            painel.style.zIndex = '999999';
        }
        
        elementoArrasto.addEventListener('mousedown', iniciar);
        elementoArrasto.addEventListener('touchstart', iniciar);
        
        window.addEventListener('mousemove', mover);
        window.addEventListener('touchmove', mover);
        window.addEventListener('mouseup', finalizar);
        window.addEventListener('touchend', finalizar);
        
        console.log('🖐️ Painel configurado para arrasto');
    }

    // ============================================
    // FUNÇÃO PARA TORNAR UM BOTÃO ARRASTÁVEL
    // ============================================
    function tornarArrastavel(config) {
        const elemento = config.elemento;
        if (!elemento || elemento._arrastavel) return;

        console.log(`🔧 Configurando ${config.nome}...`);

        // ============================================
        // 1. CLONAR E SUBSTITUIR PARA REMOVER EVENTOS ANTIGOS
        // ============================================
        const novoBtn = elemento.cloneNode(true);
        elemento.parentNode.replaceChild(novoBtn, elemento);
        
        // Atualizar referência
        config.elemento = novoBtn;
        const btn = novoBtn;

        // Marcar como configurado
        btn._arrastavel = true;
        config.configurado = true;
        btn.setAttribute('data-arrastavel', config.nome);

        // ============================================
        // 2. CONFIGURAR ESTILOS
        // ============================================
        btn.style.cursor = 'grab';
        btn.style.userSelect = 'none';
        btn.style.webkitUserSelect = 'none';
        btn.style.touchAction = 'none';

        // Garantir position fixed (necessário para arrasto)
        btn.style.position = 'fixed';

        // ============================================
        // 3. USAR A POSIÇÃO ATUAL DO CSS (NÃO CARREGAR POSIÇÃO SALVA)
        // ============================================
        const rect = btn.getBoundingClientRect();
        btn.style.left = rect.left + 'px';
        btn.style.top = rect.top + 'px';
        btn.style.right = 'auto';
        btn.style.bottom = 'auto';
        
        console.log(`📌 Posição inicial de ${config.nome}: (${rect.left}px, ${rect.top}px)`);

        // ============================================
        // 4. REMOVER QUALQUER POSIÇÃO SALVA DO LOCALSTORAGE
        // ============================================
        // Comentado para não apagar, mas não usar
        // localStorage.removeItem(`${config.nome}_posicao`);

        // ============================================
        // 5. REMOVER QUALQUER EVENTO DE CLIQUE
        // ============================================
        btn.onclick = null;

        // ============================================
        // 6. VARIÁVEIS DE CONTROLE
        // ============================================
        let arrastando = false;
        let moveu = false;
        let inicioX, inicioY;
        let offsetX, offsetY;
        let distanciaMovimento = 0;

        // ============================================
        // 7. INÍCIO DO ARRASTO
        // ============================================
        function iniciar(e) {
            if (e.button !== 0 && e.type !== 'touchstart') return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const clientX = e.clientX ?? (e.touches?.[0]?.clientX ?? 0);
            const clientY = e.clientY ?? (e.touches?.[0]?.clientY ?? 0);
            
            inicioX = clientX;
            inicioY = clientY;
            distanciaMovimento = 0;
            
            const rect = btn.getBoundingClientRect();
            offsetX = clientX - rect.left;
            offsetY = clientY - rect.top;
            
            arrastando = true;
            moveu = false;
            
            btn.style.cursor = 'grabbing';
            btn.style.transform = 'scale(0.95)';
            btn.style.transition = 'none';
        }

        // ============================================
        // 8. DURANTE O ARRASTO (COM LIMITES)
        // ============================================
        function mover(e) {
            if (!arrastando) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            const clientX = e.clientX ?? (e.touches?.[0]?.clientX ?? 0);
            const clientY = e.clientY ?? (e.touches?.[0]?.clientY ?? 0);
            
            const diffX = Math.abs(clientX - inicioX);
            const diffY = Math.abs(clientY - inicioY);
            distanciaMovimento = Math.max(diffX, diffY);
            
            if (distanciaMovimento > 8) {
                moveu = true;
            }
            
            if (!moveu) return;
            
            let novaX = clientX - offsetX;
            let novaY = clientY - offsetY;
            
            novaX = Math.max(0, Math.min(novaX, window.innerWidth - btn.offsetWidth));
            novaY = Math.max(0, Math.min(novaY, window.innerHeight - btn.offsetHeight));
            
            btn.style.left = novaX + 'px';
            btn.style.top = novaY + 'px';
            btn.style.right = 'auto';
            btn.style.bottom = 'auto';
        }

        // ============================================
        // 9. FINAL DO ARRASTO
        // ============================================
        function finalizar(e) {
            if (!arrastando) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            arrastando = false;
            
            btn.style.cursor = 'grab';
            btn.style.transform = 'scale(1)';
            btn.style.transition = 'transform 0.2s ease';
            
            if (moveu) {
                console.log(`✅ ${config.nome} movido (${distanciaMovimento.toFixed(0)}px)`);
                
                // NÃO SALVAR A POSIÇÃO PARA QUE VOLTE AO ORIGINAL
                // try {
                //     localStorage.setItem(`${config.nome}_posicao`, JSON.stringify({
                //         left: btn.style.left,
                //         top: btn.style.top
                //     }));
                // } catch (erro) {}
                
                return;
            }
            
            // SE NÃO MOVEU: executar toggle UMA VEZ
            console.log(`🖱️ ${config.nome} clicado (sem movimento)`);
            
            if (config.toggleFn) {
                config.toggleFn();
            }
        }

        // ============================================
        // 10. ADICIONAR EVENTOS DE ARRASTO
        // ============================================
        btn.addEventListener('mousedown', iniciar);
        btn.addEventListener('touchstart', iniciar, { passive: false });
        
        window.addEventListener('mousemove', mover);
        window.addEventListener('touchmove', mover, { passive: false });
        window.addEventListener('mouseup', finalizar);
        window.addEventListener('touchend', finalizar);
        window.addEventListener('touchcancel', finalizar);

        console.log(`✅ ${config.nome} configurado!`);
    }

    // ============================================
    // PROCURAR E CONFIGURAR TODOS
    // ============================================
    function configurarTodos() {
        console.log('🔍 Procurando botões...');
        
        botoes.forEach(botao => {
            if (botao.configurado) return;
            
            const elemento = document.querySelector(botao.seletor);
            if (elemento) {
                botao.elemento = elemento;
                tornarArrastavel(botao);
            }
        });
    }

    // ============================================
    // INICIAR
    // ============================================
    function iniciar() {
        console.log('🚀 Iniciando sistema de arrasto...');
        
        // Primeiro, garantir que todos os botões estejam usando left/top
        document.querySelectorAll('#toggle-buttons-btn, #accessibilityToggle, .accessibility-toggle').forEach(btn => {
            const rect = btn.getBoundingClientRect();
            btn.style.left = rect.left + 'px';
            btn.style.top = rect.top + 'px';
            btn.style.right = 'auto';
            btn.style.bottom = 'auto';
        });
        
        configurarTodos();
        
        const observer = new MutationObserver(() => {
            configurarTodos();
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        [1000, 2000, 3000].forEach(tempo => {
            setTimeout(configurarTodos, tempo);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }

    // Utilitários
    window.arrasto = {
        status: () => botoes.map(b => ({
            nome: b.nome,
            configurado: b.configurado,
            elemento: b.elemento
        })),
        resetar: () => {
            botoes.forEach(b => {
                localStorage.removeItem(`${b.nome}_posicao`);
            });
            console.log('✅ Posições resetadas (recarregue a página)');
        }
    };
})();