// backend/patch-gaxios.js
const fs = require('fs');
const path = require('path');

console.log('🔧 Procurando gaxios para aplicar patch...');
console.log('📂 Diretório atual (__dirname):', __dirname);

// Como o script está em /backend/, o node_modules correto é o do próprio backend
const caminhosPossiveis = [
    path.join(__dirname, 'node_modules', 'gaxios', 'build', 'cjs', 'src', 'gaxios.js'),
    path.join(__dirname, '..', 'node_modules', 'gaxios', 'build', 'cjs', 'src', 'gaxios.js'),
    '/opt/render/project/src/backend/node_modules/gaxios/build/cjs/src/gaxios.js',
];

let gaxiosPath = null;
for (const caminho of caminhosPossiveis) {
    if (fs.existsSync(caminho)) {
        gaxiosPath = caminho;
        console.log(`✅ gaxios encontrada em: ${caminho}`);
        break;
    }
}

if (!gaxiosPath) {
    console.log('❌ gaxios não encontrada. Pulando patch.');
    process.exit(0);
}

try {
    let content = fs.readFileSync(gaxiosPath, 'utf8');

    const padroes = [
        ": (await import('node-fetch')).default;",
        ': (await import("node-fetch")).default;'
    ];

    const patch = ": (typeof globalThis.fetch === 'function' ? globalThis.fetch : (await import('node-fetch')).default);";

    let aplicado = false;
    for (const padrao of padroes) {
        if (content.includes(padrao)) {
            content = content.replace(padrao, patch);
            aplicado = true;
            console.log(`✅ Patch aplicado!`);
            break;
        }
    }

    if (aplicado) {
        fs.writeFileSync(gaxiosPath, content, 'utf8');
        console.log('✅ Patch salvo com sucesso!');
    } else if (content.includes('globalThis.fetch')) {
        console.log('ℹ️ Patch já estava aplicado anteriormente.');
    } else {
        console.log('⚠️ Padrão de código não encontrado. A gaxios pode ter sido atualizada.');
        console.log('💡 Procure manualmente no arquivo:');
        console.log(`   ${gaxiosPath}`);
        console.log('   Por: await import(\'node-fetch\')');
    }
} catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(0);
}