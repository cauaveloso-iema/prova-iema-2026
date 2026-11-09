/* ============================================================
   Página LGPD — Termo de Privacidade (EducaPleno)
   Funciona tanto aberta direto quanto em modal/iframe.
   ============================================================ */

(function () {
    'use strict';

    // ------------------------------------------------------------
    // Data de atualização
    // ------------------------------------------------------------
    const elData = document.getElementById('dataAtualizacao');
    if (elData) elData.textContent = new Date().toLocaleDateString('pt-BR');

    // ------------------------------------------------------------
    // Modo embed (quando aberta via iframe ?embed=1)
    // Esconde o botão X do cabeçalho
    // ------------------------------------------------------------
    const params = new URLSearchParams(location.search);
    const embed = params.get('embed') === '1';
    if (embed) document.body.classList.add('modo-embed');

    // ------------------------------------------------------------
    // Scroll obrigatório
    // ------------------------------------------------------------
    const conteudo = document.getElementById('conteudoLGPD');
    const avisoScroll = document.getElementById('avisoScroll');
    const statusLeitura = document.getElementById('statusLeitura');
    const btnAceitar = document.getElementById('btnAceitar');
    let jaLiberou = false;

    function liberarBotao() {
        if (jaLiberou) return;
        jaLiberou = true;

        if (btnAceitar) {
            btnAceitar.disabled = false;
            btnAceitar.classList.add('ativo');
        }

        if (avisoScroll) {
            avisoScroll.classList.add('liberado');
            avisoScroll.innerHTML = '<i class="fas fa-check-circle"></i><span>Você chegou ao final do documento. Agora pode aceitar os termos.</span>';
        }

        if (statusLeitura) {
            statusLeitura.classList.add('liberado');
            statusLeitura.innerHTML = '<i class="fas fa-check-circle"></i> Leitura concluída. Você pode aceitar os termos.';
        }
    }

    function verificarScroll() {
        if (!conteudo) return;

        // Se o conteúdo é menor que a área visível, já libera
        if (conteudo.scrollHeight <= conteudo.clientHeight + 10) {
            liberarBotao();
            return;
        }

        // Se chegou ao final
        const chegouAoFinal = conteudo.scrollTop + conteudo.clientHeight >= conteudo.scrollHeight - 20;
        if (chegouAoFinal) liberarBotao();
    }

    if (conteudo) {
        conteudo.addEventListener('scroll', verificarScroll);
    }

    // Verifica no load (caso o texto seja curto)
    setTimeout(verificarScroll, 200);

    // Fallback: libera após 10s se o usuário não rolar (para não travar)
    setTimeout(() => {
        if (!jaLiberou) liberarBotao();
    }, 10000);

    // ------------------------------------------------------------
    // Aceitar / Fechar
    // ------------------------------------------------------------
    function confirmarLeitura() {
        if (!jaLiberou) {
            alert('Role até o final do documento antes de aceitar.');
            return;
        }

        const dados = {
            aceito: true,
            dataAceite: new Date().toISOString(),
            versaoTermo: '1.0',
            url: location.href
        };

        // Se estiver em modal (iframe), avisa a janela principal
        if (window.parent && window.parent !== window) {
            try {
                window.parent.postMessage({ tipo: 'lgpd_aceita', dados }, '*');
            } catch (e) {
                console.warn('Não foi possível enviar mensagem para a janela principal:', e);
            }
        }

        // Persiste em localStorage (chave usada pelo frontend de inscrição)
        try {
            localStorage.setItem('lgpd_eventos_aceito', '1');
            localStorage.setItem('lgpd_aceite', JSON.stringify(dados));
        } catch (e) {}

        // Feedback visual
        alert('✅ Termos LGPD aceitos com sucesso!');

        // Fecha a janela (se for popup)
        fecharJanela();
    }

    function fecharJanela() {
        // Se estiver em modal, avisa o parent para fechar
        if (window.parent && window.parent !== window) {
            try {
                window.parent.postMessage({ tipo: 'lgpd_fechar' }, '*');
            } catch (e) {}
        }

        // Tenta fechar como popup
        setTimeout(() => {
            try { window.close(); } catch (e) {}
        }, 100);
    }

    // ------------------------------------------------------------
    // Bind dos botões (substitui onclick inline)
    // ------------------------------------------------------------
    const btnFecharX = document.getElementById('btnFecharX');
    const btnCancelar = document.getElementById('btnCancelar');

    if (btnFecharX) btnFecharX.addEventListener('click', fecharJanela);
    if (btnCancelar) btnCancelar.addEventListener('click', fecharJanela);
    if (btnAceitar) btnAceitar.addEventListener('click', confirmarLeitura);

    // ------------------------------------------------------------
    // API pública para o parent (opcional)
    // ------------------------------------------------------------
    window.LGPDEventos = {
        confirmarLeitura,
        fecharJanela,
        jaLiberou: () => jaLiberou
    };
})();