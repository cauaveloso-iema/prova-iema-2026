require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Resend } = require('resend');

console.log('\n🔑 DIAGNÓSTICO DA CHAVE RESEND\n');
console.log('=' .repeat(60));

const key = process.env.RESEND_API_KEY;

if (!key) {
  console.log('❌ RESEND_API_KEY não existe no .env!');
  process.exit(1);
}

console.log('Chave em análise:');
console.log('  Valor:', key);
console.log('  Prefixo:', key.substring(0, 10) + '...');
console.log('  Tamanho:', key.length, 'chars');
console.log('  Começa com "re_"?', key.startsWith('re_'));
console.log('  É a máscara "********"?', key === '********');
console.log('  Tem espaços?', key !== key.trim() ? '❌ SIM!' : '✅ não');
console.log('=' .repeat(60));

const resend = new Resend(key.trim());

(async () => {
  console.log('\n📡 Enviando email de teste...\n');
  
  try {
    const r = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: 'delivered@resend.dev',  // Email de teste oficial do Resend
      subject: 'Teste direto - diagnóstico',
      html: '<p>Se você vê isso, funcionou</p>'
    });
    
    console.log('📦 Resposta completa:');
    console.log(JSON.stringify(r, null, 2));
    
    if (r.error) {
      console.log('\n' + '=' .repeat(60));
      console.log('❌ FALHOU! Erro:', r.error.message);
      console.log('   Status:', r.error.statusCode);
      console.log('   Nome:', r.error.name);
      console.log('=' .repeat(60));
      
      if (r.error.statusCode === 401) {
        console.log('\n💡 A CHAVE FOI REVOGADA OU É INVÁLIDA.');
        console.log('   → Gere uma nova em: https://resend.com/api-keys');
      } else if (r.error.statusCode === 403) {
        console.log('\n💡 A CHAVE NÃO TEM PERMISSÃO DE ENVIO.');
        console.log('   → Verifique as permissões da chave no painel Resend.');
      }
    } else {
      console.log('\n' + '=' .repeat(60));
      console.log('✅ SUCESSO! ID:', r.data?.id);
      console.log('   → A chave é VÁLIDA. O problema está no SERVIDOR.');
      console.log('   → Reinicie o servidor e teste de novo.');
      console.log('=' .repeat(60));
    }
  } catch (err) {
    console.error('\n❌ EXCEÇÃO LANÇADA:');
    console.error('   Mensagem:', err.message);
    console.error('   Stack:', err.stack);
  }
  
  process.exit(0);
})();