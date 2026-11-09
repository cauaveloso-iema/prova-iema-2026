/* ============================================================
   Minhas Avaliações — EducaPleno
   ============================================================ */

(function () {
    'use strict';

    const TOKEN = localStorage.getItem('avaliador_token');
    if (!TOKEN) {
        window.location.href = 'avaliador.html';
        return;
    }

    // Exposta globalmente porque o HTML usa onclick="logout()"
    window.logout = function () {
        localStorage.removeItem('avaliador_token');
        localStorage.removeItem('avaliador_user');
        window.location.href = 'avaliador.html';
    };

    async function carregar() {
        try {
            // Aqui você implementaria a busca das inscrições do avaliador
            // (precisa de uma rota customizada no backend se quiser listar as pendentes)
            // Para simplificar, usando a rota de relatórios que já criamos
            document.getElementById('lista-pendentes').innerHTML = `
                <div class="alert alert-info">
                    Em construção: listagem de avaliações pendentes.
                    <br><small>O backend já está pronto para receber notas via POST /api/eventos/avaliacoes.</small>
                </div>
            `;
        } catch (e) {
            console.error(e);
        }
    }

    carregar();
})();