require('dotenv').config();

console.log('🔑 Testando configuração do OpenRouter:');
console.log('Chave carregada:', process.env.OPENROUTER_API_KEY ? '✅ SIM' : '❌ NÃO');

if (process.env.OPENROUTER_API_KEY) {
    console.log('Primeiros 10 chars:', process.env.OPENROUTER_API_KEY.substring(0, 10) + '...');
    console.log('Comprimento:', process.env.OPENROUTER_API_KEY.length);
} else {
    console.log('❌ ERRO: Chave não encontrada no .env');
    console.log('💡 Verifique:');
    console.log('1. O arquivo .env existe na pasta backend/');
    console.log('2. O arquivo tem exatamente este nome: .env (sem extensão)');
    console.log('3. O conteúdo está correto: OPENROUTER_API_KEY=sua_chave_aqui');
}