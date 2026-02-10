// frontend/js/vlibras-oficial.js
/**
 * VLibras Oficial do Governo
 * Código EXATO fornecido pelo governo
 */

// Adicionar o container VLibras
const vlibrasHTML = `
<div vw class="enabled">
  <div vw-access-button class="active"></div>
  <div vw-plugin-wrapper>
    <div class="vw-plugin-top-wrapper"></div>
  </div>
</div>
`;

// Inserir no final do body
document.addEventListener('DOMContentLoaded', function() {
    // Adicionar o HTML do VLibras
    document.body.insertAdjacentHTML('beforeend', vlibrasHTML);
    
    // Adicionar estilos para posicionamento
    const style = document.createElement('style');
    style.textContent = `
        /* Posicionar o VLibras acima do chatbot */
        [vw-access-button] {
            position: fixed !important;
            bottom: 90px !important;
            right: 20px !important;
            z-index: 9999 !important;
        }
        
        /* Responsivo */
        @media (max-width: 768px) {
            [vw-access-button] {
                bottom: 70px !important;
                right: 16px !important;
            }
        }
        
        @media (max-width: 480px) {
            [vw-access-button] {
                bottom: 60px !important;
                right: 12px !important;
            }
        }
    `;
    document.head.appendChild(style);
    
    // Carregar o script do VLibras
    const script = document.createElement('script');
    script.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
    script.onload = function() {
        // Inicializar o widget
        new window.VLibras.Widget('https://vlibras.gov.br/app');
        console.log('✅ VLibras carregado e posicionado em bottom: 90px');
    };
    script.onerror = function() {
        console.error('❌ Erro ao carregar VLibras');
    };
    document.head.appendChild(script);
});