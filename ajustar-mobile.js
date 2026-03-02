// adicionar-mobile.js
const fs = require('fs');
const path = require('path');

console.log('='.repeat(60));
console.log('📱 ADICIONANDO CSS MOBILE EM TODAS AS PÁGINAS');
console.log('='.repeat(60));

// Lista das suas páginas (corrigida)
const paginas = [
    'validar-2fa.html',
    'trocar-senha.html',
    'resultados.html',
    'recuperar-senha.html',
    'realizar-prova.html',
    'prova.html',
    'notificacoes.html',
    'manutencao.html',
    'login.html',
    'index.html',  // Verifique se é index.html
    'resultado-aluno.html',
    'calendario.html',
    'aluno.html',
    'admin.html'
];

// CSS que será adicionado (APENAS UMA VEZ)
const mobileCSS = `
    <!-- ===== MOBILE OPTIMIZATION ===== -->
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes">
    <link rel="stylesheet" href="css/mobile.css">
`;

// Função para adicionar CSS
function adicionarMobile(arquivo) {
    const caminho = path.join(__dirname, 'frontend', arquivo);
    
    try {
        // Verificar se arquivo existe
        if (!fs.existsSync(caminho)) {
            console.log(`❌ Arquivo não encontrado: ${arquivo}`);
            return;
        }
        
        // Ler conteúdo
        let conteudo = fs.readFileSync(caminho, 'utf8');
        
        // Verificar se já tem
        if (conteudo.includes('mobile.css')) {
            console.log(`⏭️  ${arquivo} já tem mobile.css`);
            return;
        }
        
        // Verificar se tem viewport
        if (!conteudo.includes('viewport')) {
            // Adicionar antes de </head>
            if (conteudo.includes('</head>')) {
                let novoConteudo = conteudo.replace('</head>', mobileCSS + '\n</head>');
                fs.writeFileSync(caminho, novoConteudo, 'utf8');
                console.log(`✅ ${arquivo} - ATUALIZADO!`);
            } else {
                console.log(`⚠️  ${arquivo} não tem </head>`);
            }
        } else {
            // Já tem viewport, só adicionar o link se não tiver
            if (conteudo.includes('</head>')) {
                let novoConteudo = conteudo.replace('</head>', 
                    '    <link rel="stylesheet" href="css/mobile.css">\n</head>');
                fs.writeFileSync(caminho, novoConteudo, 'utf8');
                console.log(`✅ ${arquivo} - CSS adicionado!`);
            }
        }
        
    } catch (error) {
        console.error(`❌ Erro em ${arquivo}:`, error.message);
    }
}

// Verificar se o CSS existe
const cssPath = path.join(__dirname, 'frontend', 'css', 'mobile.css');
if (!fs.existsSync(cssPath)) {
    console.log('\n❌ ERRO: mobile.css não encontrado!');
    console.log('Crie o arquivo primeiro: frontend/css/mobile.css');
    process.exit(1);
}

console.log('\n📁 Processando páginas...\n');

// Processar cada página
paginas.forEach(pagina => {
    adicionarMobile(pagina);
});

console.log('\n' + '='.repeat(60));
console.log('✅ PROCESSO CONCLUÍDO!');
console.log('='.repeat(60));