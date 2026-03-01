// backend/scripts/test-matriculas.js
require('dotenv').config({ path: '../.env' });
const path = require('path');

// Importar o gerenciador de matrículas
const matriculasManager = require('../matriculas/index');
const professorAuth = require('../security/professor-auth');

console.log('='.repeat(70));
console.log('🔐 TESTE DO SISTEMA DE MATRÍCULAS');
console.log('='.repeat(70));

// 1. Verificar ambiente
console.log('\n📌 AMBIENTE:');
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`   ENCRYPTED_MATRICULAS: ${process.env.ENCRYPTED_MATRICULAS ? '✅ Presente' : '❌ Ausente'}`);
console.log(`   ENCRYPTION_KEY: ${process.env.ENCRYPTION_KEY ? '✅ Presente' : '❌ Ausente'}`);
console.log(`   AUTH_ENCRYPTION_KEY: ${process.env.AUTH_ENCRYPTION_KEY ? '✅ Presente' : '❌ Ausente'}`);

// 2. Verificar matriculasManager
console.log('\n📊 MATRICULAS MANAGER:');
const todas = matriculasManager.listar();
console.log(`   Total: ${todas.length}`);

if (todas.length > 0) {
    console.log(`   Primeira: ${todas[0].matricula} - ${todas[0].nome}`);
    console.log(`   Última: ${todas[todas.length-1].matricula} - ${todas[todas.length-1].nome}`);
} else {
    console.log('   ⚠️ NENHUMA MATRÍCULA CARREGADA!');
}

// 3. Verificar professorAuth
console.log('\n👨‍🏫 PROFESSOR AUTH:');
const stats = professorAuth.getStats();
console.log(`   Total matrículas: ${stats.totalMatriculas}`);
console.log(`   Status: ${stats.systemStatus}`);
console.log(`   Tem Encryption Key: ${stats.hasEncryptionKey ? '✅' : '❌'}`);
console.log(`   Tem Encrypted Data: ${stats.hasEncryptedData ? '✅' : '❌'}`);

// 4. Testar algumas matrículas
console.log('\n🎯 TESTE DE MATRÍCULAS ESPECÍFICAS:');
const testarMatriculas = ['110102', '110103', '110006', '999999'];

testarMatriculas.forEach(mat => {
    // Teste no matriculasManager
    const autorizada = matriculasManager.verificar(mat);
    const nome = matriculasManager.obterNome(mat);
    
    // Teste no professorAuth
    const autorizadaAuth = professorAuth.isProfessorAuthorized(mat);
    
    console.log(`\n   Matrícula: ${mat}`);
    console.log(`   ├─ Manager: ${autorizada ? '✅' : '❌'} ${nome || ''}`);
    console.log(`   └─ Auth:    ${autorizadaAuth ? '✅' : '❌'}`);
});

// 5. Status final
console.log('\n📋 STATUS DO SISTEMA:');
if (todas.length > 0 && stats.systemStatus === 'active') {
    console.log(`   ✅ SISTEMA OPERACIONAL - ${todas.length} matrículas carregadas`);
} else {
    console.log(`   ❌ SISTEMA COM PROBLEMAS - Verifique o .env`);
    console.log(`      Manager: ${todas.length} matrículas`);
    console.log(`      Auth: ${stats.systemStatus}`);
}
console.log('='.repeat(70));