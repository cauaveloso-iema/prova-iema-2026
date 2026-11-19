/* ============================================================================
   lgpd-inscricoes.js — Termo de consentimento LGPD (iframe do formulário)
   ============================================================================ */
'use strict';

(function () {
    const VERSAO = '1.0';

    const conteudo = document.getElementById('conteudoLGPD');
    const aviso = document.getElementById('avisoScroll');
    const status = document.getElementById('statusLeitura');
    const btnAceitar = document.getElementById('btnAceitar');
    const btnCancelar = document.getElementById('btnCancelar');
    const btnFecharX = document.getElementById('btnFecharX');

    // Data e versão
    const dataEl = document.getElementById('dataAtualizacao');
    if (dataEl) dataEl.textContent = new Date().toLocaleDateString('pt-BR');

    const versaoEl = document.getElementById('versaoTermo');
    if (versaoEl) {
        try {
            const params = new URLSearchParams(window.location.search);
            versaoEl.textContent = params.get('v') || VERSAO;
        } catch (_) {
            versaoEl.textContent = VERSAO;
        }
    }

    // ---------------------------------------------------------------- Leitura
    let liberado = false;

    function liberar() {
        if (liberado) return;
        liberado = true;

        if (btnAceitar) btnAceitar.disabled = false;
        if (aviso) aviso.classList.add('escondido');
        if (status) {
            status.classList.add('ok');
            status.innerHTML = '<i class="fas fa-circle-check"></i> Leitura concluída. Você já pode aceitar.';
        }
    }

    function verificarScroll() {
        if (!conteudo) return;
        const restante = conteudo.scrollHeight - conteudo.scrollTop - conteudo.clientHeight;
        if (restante <= 40) liberar();
    }

    if (conteudo) {
        conteudo.addEventListener('scroll', verificarScroll);
        setTimeout(verificarScroll, 400);
        setTimeout(() => {
            // Documento curto (cabe na tela) → libera direto
            if (conteudo.scrollHeight <= conteudo.clientHeight + 40) liberar();
        }, 700);
    }

    // ---------------------------------------------------------------- Ações
    function avisarPai(payload) {
        try {
            if (window.parent && window.parent !== window) {
                window.parent.postMessage(payload, '*');
            }
        } catch (_) { /* ignora */ }
    }

    function fechar() {
        avisarPai({ tipo: 'lgpd-inscricoes', fechar: true });
        try {
            if (window.parent === window) window.close();
        } catch (_) { /* ignora */ }
    }

    if (btnAceitar) {
        btnAceitar.addEventListener('click', () => {
            if (!liberado) return;

            const payload = {
                tipo: 'lgpd-inscricoes',
                aceito: true,
                versao: VERSAO,
                em: new Date().toISOString()
            };

            try {
                localStorage.setItem('inscricoes_lgpd_aceite', JSON.stringify(payload));
            } catch (_) { /* modo privado */ }

            avisarPai(payload);

            if (status) {
                status.classList.add('ok');
                status.innerHTML = '<i class="fas fa-circle-check"></i> Termo aceito com sucesso.';
            }
            btnAceitar.disabled = true;
            btnAceitar.innerHTML = '<i class="fas fa-check-double"></i> Aceito';

            setTimeout(fechar, 500);
        });
    }

    if (btnCancelar) btnCancelar.addEventListener('click', fechar);
    if (btnFecharX) btnFecharX.addEventListener('click', fechar);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') fechar();
    });
})();