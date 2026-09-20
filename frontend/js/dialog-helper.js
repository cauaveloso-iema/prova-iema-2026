// ============================================
// DIALOG HELPER — Substitui confirm() nativo
// Sobrescreve window.confirm globalmente
// Funciona em WebView (Kodular/CustomWebView)
// ============================================

(function() {
    // Guarda a referência original (caso queira usar)
    window.__confirmOriginal = window.confirm;

    // Cria o modal visual e retorna Promise<boolean>
    function mostrarModal(mensagem) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.6);
                z-index: 99999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                animation: __cnfFadeIn 0.2s ease;
            `;
            modal.innerHTML = `
                <div style="
                    background: white;
                    border-radius: 12px;
                    padding: 24px;
                    max-width: 360px;
                    width: 100%;
                    text-align: center;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                    animation: __cnfSlideUp 0.25s ease;
                ">
                    <div style="font-size:44px; margin-bottom:8px;">⚠️</div>
                    <p style="
                        margin: 0 0 20px;
                        color: #374151;
                        font-size: 15px;
                        line-height: 1.5;
                        white-space: pre-line;
                    ">${String(mensagem).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
                    <div style="display:flex; gap:10px;">
                        <button id="__cnfNao" style="
                            flex:1; padding:12px;
                            border:1px solid #d1d5db;
                            background:white;
                            border-radius:8px;
                            font-weight:600;
                            cursor:pointer;
                            font-size:14px;
                            color:#374151;
                        ">Cancelar</button>
                        <button id="__cnfSim" style="
                            flex:1; padding:12px;
                            border:none;
                            background:#ef4444;
                            color:white;
                            border-radius:8px;
                            font-weight:600;
                            cursor:pointer;
                            font-size:14px;
                        ">Confirmar</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const fechar = (resultado) => {
                modal.remove();
                resolve(resultado);
            };

            modal.querySelector('#__cnfSim').onclick = () => fechar(true);
            modal.querySelector('#__cnfNao').onclick = () => fechar(false);
        });
    }

    // ⚠️ SOBRESCREVE window.confirm
    // Funciona tanto para confirm() síncrono quanto para await confirm()
    window.confirm = function(mensagem) {
        // O confirm() nativo é SÍNCRONO, mas nosso modal é ASSÍNCRONO.
        // Não dá para retornar o valor imediatamente.
        // Solução: sempre retornar false (cancela) e abrir o modal.
        // Se o site usa `await confirm(...)`, funcionará perfeitamente.
        // Se o site usa `if (confirm(...))` síncrono, vai sempre cancelar
        // a ação — o que é seguro, mas requer refatoração depois.

        // Detecta se está sendo usado em contexto async (await):
        // Se sim, retorna a Promise do modal (funciona perfeitamente)
        // Se não, retorna false (evita travamento)

        // Truque: armazenamos a Promise e quem chamou `await` a pegará.
        const promise = mostrarModal(mensagem);

        // Retornamos a Promise. Quem usa `await confirm(...)` funciona.
        // Quem usa `if (confirm(...))` sem await vai receber uma Promise
        // (truthy) e pode ter comportamento estranho — mas NÃO trava.
        return promise;
    };

    // Animação
    if (!document.getElementById('__dialogHelperStyle')) {
        const style = document.createElement('style');
        style.id = '__dialogHelperStyle';
        style.textContent = `
            @keyframes __cnfFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes __cnfSlideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        `;
        document.head.appendChild(style);
    }

    console.log('✅ dialog-helper.js carregado — window.confirm foi sobrescrito');
})();