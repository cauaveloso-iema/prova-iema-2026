// services/retencao-visitas.js
const cron = require('node-cron');
const TermoVisita = require('../models/TermoVisita');

/**
 * Anonimiza termos expirados
 */
async function anonimizarTermosExpirados() {
  const agora = new Date();
  console.log('🧹 Iniciando anonimização de termos expirados...');
  
  const termos = await TermoVisita.find({
    expiraEm: { $lte: agora },
    anonimizado: false,
    ativo: true
  });
  
  if (termos.length === 0) {
    console.log('✅ Nenhum termo para anonimizar');
    return { total: 0, anonimizados: 0, erros: 0 };
  }
  
  let anonimizados = 0;
  let erros = 0;
  
  for (const termo of termos) {
    try {
      if (typeof termo.anonimizar === 'function') {
        termo.anonimizar();
      } else {
        termo.responsaveis.forEach(r => {
          r.nome = 'ANONIMIZADO';
          r.rg = null;
          r.cpf = null;
          r.cpfHash = null;
          r.telefone = null;
          r.email = null;
          r.assinaturaBase64 = null;
          r.localizacaoAssinatura = null;
        });
        termo.assinaturaGestor = null;
        termo.anonimizado = true;
        termo.anonimizadoEm = new Date();
      }
      await termo.save();
      anonimizados++;
      console.log(`   ✅ Termo ${termo.codigo} anonimizado`);
    } catch (err) {
      console.error(`   ❌ Erro em ${termo.codigo}:`, err.message);
      erros++;
    }
  }
  
  console.log(`✅ Anonimização: ${anonimizados} sucesso(s), ${erros} erro(s)`);
  return { total: termos.length, anonimizados, erros };
}

/**
 * Relatório de retenção
 */
async function relatorioRetencao() {
  const agora = new Date();
  
  const [totalAtivos, expirados, anonimizados] = await Promise.all([
    TermoVisita.countDocuments({ ativo: true, anonimizado: false }),
    TermoVisita.countDocuments({ 
      expiraEm: { $lte: agora }, 
      anonimizado: false,
      ativo: true 
    }),
    TermoVisita.countDocuments({ anonimizado: true })
  ]);
  
  return {
    totalAtivos,
    expiradosNaoAnonimizados: expirados,
    anonimizados,
    proximaVerificacao: 'Diariamente às 03:00'
  };
}

/**
 * Inicia cron jobs
 */
function iniciarCronJobs() {
  try {
    cron.schedule('0 3 * * *', async () => {
      try {
        await anonimizarTermosExpirados();
      } catch (err) {
        console.error('❌ Erro no cron de anonimização:', err.message);
      }
    }, { timezone: 'America/Fortaleza' });
    
    console.log('⏰ Cron job LGPD agendado para 03:00 (America/Fortaleza)');
  } catch (err) {
    console.warn('⚠️ Não foi possível agendar cron:', err.message);
  }
}

module.exports = {
  anonimizarTermosExpirados,
  relatorioRetencao,
  iniciarCronJobs
};