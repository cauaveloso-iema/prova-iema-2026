// adicionar-mobile.js
const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('📱 ADICIONANDO CSS MOBILE EM TODAS AS PÁGINAS');
console.log('='.repeat(60));

// Lista das suas páginas (CORRIGIDA - removi resultado-aluno sem extensão)
const PAGINAS = [
    'validar-2fa.html',
    'trocar-senha.html',
    'resultados.html',
    'recuperar-senha.html',
    'realizar-prova.html',
    'prova.html',
    'notificacoes.html',
    'manutencao.html',
    'login.html',
    'calendario.html',
    'aluno.html',
    'resultado-aluno.html',
    'admin.html'
];

// CÓDIGO QUE SERÁ ADICIONADO ANTES DO </body>
const codigoAdicionar = `
    <!-- ===== MOBILE OPTIMIZATION ===== -->
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes">
    <link rel="stylesheet" href="css/mobile.css">
    <script src="js/toggle-buttons.js"></script>
`;

// ============================================
// CRIAR ARQUIVOS SE NÃO EXISTIREM
// ============================================

// Criar pasta frontend/css se não existir
const cssDir = path.join(__dirname, 'frontend', 'css');
if (!fs.existsSync(cssDir)) {
    fs.mkdirSync(cssDir, { recursive: true });
    console.log('📁 Pasta criada: frontend/css/');
}

// Criar pasta frontend/js se não existir
const jsDir = path.join(__dirname, 'frontend', 'js');
if (!fs.existsSync(jsDir)) {
    fs.mkdirSync(jsDir, { recursive: true });
    console.log('📁 Pasta criada: frontend/js/');
}

// Caminhos completos
const cssPath = path.join(cssDir, 'mobile.css');
const jsPath = path.join(jsDir, 'toggle-buttons.js');

// CONTEÚDO DO ARQUIVO CSS
const cssConteudo = `/* frontend/css/mobile.css */
@media screen and (max-width: 768px) {
    body {
        font-size: 14px;
        padding: 10px;
    }
    
    input, button, select, textarea {
        width: 100%;
        min-height: 44px;
        font-size: 16px;
    }
    
    table {
        display: block;
        overflow-x: auto;
    }
}`;

// CONTEÚDO DO ARQUIVO JS (versão simplificada)
const jsConteudo = `// frontend/js/toggle-buttons.js
// Botão para controlar visibilidade dos ícones de acessibilidade

(function() {
    'use strict';
    
    console.log('🔘 Botão de controle de ícones carregado');
    
    // Criar botão
    const btn = document.createElement('button');
    btn.id = 'toggle-buttons-btn';
    btn.innerHTML = '👁️';
    btn.setAttribute('title', 'Mostrar/esconder ícones');
    
    // Estilo do botão
    Object.assign(btn.style, {
        position: 'fixed',
        bottom: '120px',
        left: '20px',
        width: '56px',
        height: '56px',
        borderRadius: '50%',
        background: '#0D6EFD',
        color: 'white',
        border: '2px solid white',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        cursor: 'pointer',
        zIndex: '10000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '24px',
        transition: 'all 0.3s'
    });
    
    document.body.appendChild(btn);
    
    // Estado dos ícones
    let iconesVisiveis = true;
    
    // Função para encontrar ícones
    function encontrarIcones() {
        const icones = [];
        
        // VLibras
        const vlibras = document.querySelector('div[vw], [vw-access-button]');
        if (vlibras) icones.push(vlibras);
        
        // Botão de acessibilidade
        const acessibilidade = document.querySelector(
            '.acessibilidade-btn, .btn-acessibilidade, #accessibilityBtn, #btnAcessibilidadeProva'
        );
        if (acessibilidade) icones.push(acessibilidade);
        
        // Chatbot
        const chatbot = document.querySelector('.chatbot-button, #chatbotBtn, .chatbot-container');
        if (chatbot) icones.push(chatbot);
        
        return icones;
    }
    
    // Função para alternar visibilidade
    function toggleIcones() {
        iconesVisiveis = !iconesVisiveis;
        
        const icones = encontrarIcones();
        
        icones.forEach(icon => {
            if (iconesVisiveis) {
                icon.style.opacity = '1';
                icon.style.visibility = 'visible';
                icon.style.pointerEvents = 'auto';
            } else {
                icon.style.opacity = '0';
                icon.style.visibility = 'hidden';
                icon.style.pointerEvents = 'none';
            }
        });
        
        btn.innerHTML = iconesVisiveis ? '👁️' : '👁️‍🗨️';
        btn.style.background = iconesVisiveis ? '#0D6EFD' : '#6c757d';
        
        console.log(\`🔘 Ícones \${iconesVisiveis ? 'visíveis' : 'escondidos'}\`);
    }
    
    // Evento de clique
    btn.addEventListener('click', toggleIcones);
    
    // Observar novos elementos
    const observer = new MutationObserver(() => {
        if (!iconesVisiveis) {
            const icones = encontrarIcones();
            icones.forEach(icon => {
                icon.style.opacity = '0';
                icon.style.visibility = 'hidden';
                icon.style.pointerEvents = 'none';
            });
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
})();`;

// CRIAR OS ARQUIVOS
console.log('\n📁 Verificando/Criando arquivos necessários...');

if (!fs.existsSync(cssPath)) {
    fs.writeFileSync(cssPath, cssConteudo, 'utf8');
    console.log('✅ mobile.css criado com sucesso!');
} else {
    console.log('✅ mobile.css já existe');
}

if (!fs.existsSync(jsPath)) {
    fs.writeFileSync(jsPath, jsConteudo, 'utf8');
    console.log('✅ toggle-buttons.js criado com sucesso!');
} else {
    console.log('✅ toggle-buttons.js já existe');
}

// ============================================
// PROCESSAR AS PÁGINAS
// ============================================

console.log('\n📄 Processando páginas...\n');

let totalModificadas = 0;
let totalExistentes = 0;

PAGINAS.forEach(pagina => {
    const caminhoPagina = path.join(__dirname, 'frontend', pagina);
    
    try {
        if (!fs.existsSync(caminhoPagina)) {
            console.log(`❌ ${pagina} - não encontrada`);
            return;
        }
        
        totalExistentes++;
        let conteudo = fs.readFileSync(caminhoPagina, 'utf8');
        let precisaAdicionar = false;
        
        // Verificar o que já existe
        const temViewport = conteudo.includes('viewport');
        const temCss = conteudo.includes('mobile.css');
        const temJs = conteudo.includes('toggle-buttons.js');
        
        if (!temViewport || !temCss || !temJs) {
            precisaAdicionar = true;
            console.log(`   ${pagina}:`);
            if (!temViewport) console.log(`     - viewport: ❌ faltando`);
            if (!temCss) console.log(`     - mobile.css: ❌ faltando`);
            if (!temJs) console.log(`     - toggle-buttons.js: ❌ faltando`);
        }
        
        if (!precisaAdicionar) {
            console.log(`⏭️  ${pagina} - já tem tudo (ignorado)`);
            return;
        }
        
        // 🔥 ADICIONAR ANTES DO </body>
        if (conteudo.includes('</body>')) {
            conteudo = conteudo.replace('</body>', codigoAdicionar + '\n</body>');
            fs.writeFileSync(caminhoPagina, conteudo, 'utf8');
            console.log(`✅ ${pagina} - código adicionado antes de </body>`);
            totalModificadas++;
        } else if (conteudo.includes('</html>')) {
            conteudo = conteudo.replace('</html>', codigoAdicionar + '\n</html>');
            fs.writeFileSync(caminhoPagina, conteudo, 'utf8');
            console.log(`✅ ${pagina} - código adicionado antes de </html>`);
            totalModificadas++;
        } else {
            console.log(`⚠️  ${pagina} - não tem </body> nem </html>`);
        }
        
    } catch (error) {
        console.error(`❌ Erro em ${pagina}:`, error.message);
    }
});

console.log('\n' + '='.repeat(60));
console.log('📊 RESUMO FINAL');
console.log('='.repeat(60));
console.log(`📁 Arquivos criados/verificados:`);
console.log(`   - frontend/css/mobile.css`);
console.log(`   - frontend/js/toggle-buttons.js`);
console.log(`📄 Total de páginas encontradas: ${totalExistentes}`);
console.log(`✅ Páginas modificadas: ${totalModificadas}`);
console.log('='.repeat(60));
console.log('🎯 Código adicionado antes de </body> em todas as páginas!');
console.log('='.repeat(60));