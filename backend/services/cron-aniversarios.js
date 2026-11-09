// services/cron-aniversarios.js
const cron = require('node-cron');
const Aniversario = require('../models/Aniversario');
const Notificacao = require('../models/Notificacao');
const ConfiguracaoProtagonismo = require('../models/ConfiguracaoProtagonismo');
const User = require('../models/User');

function agoraBrasil() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
}

async function dispararNotificacoesAniversario() {
  const agora = agoraBrasil();
  const mes = agora.getMonth() + 1;
  const dia = agora.getDate();

  const config = await ConfiguracaoProtagonismo.getConfig();
  const cfg = config.aniversarios || {};

  const aniversariantes = await Aniversario.find({ ativo: true, mes, dia });
  if (aniversariantes.length === 0) return { total: 0, aniversariantes: 0 };

  let enviadas = 0;

  for (const a of aniversariantes) {
    const mensagem = (cfg.mensagemPadrao || '🎉 Feliz aniversário, {nome}!')
      .replace(/\{nome\}/g, a.nome);

    // No dia
    if (cfg.avisarNoDia && !a.lembretesEnviados?.dia) {
      if (cfg.notificarAniversariante && a.usuarioId) {
        const n = new Notificacao({
          usuarioId: a.usuarioId,
          tipo: 'aniversario',
          titulo: '🎂 Feliz Aniversário!',
          mensagem,
          dados: { aniversarioId: a._id },
          link: '/editar-perfil.html',
          icone: '🎂',
          cor: '#ec4899',
          prioridade: 5
        });
        await n.save();
        enviadas++;
      }

      if (cfg.notificarProtagonistas) {
        const protagonistas = await User.find({
          role: { $in: ['protagonismo', 'super_admin', 'admin'] },
          ativo: true
        }).select('_id');

        for (const p of protagonistas) {
          const n = new Notificacao({
            usuarioId: p._id,
            tipo: 'aniversario_equipe',
            titulo: '🎂 Aniversariante do dia',
            mensagem: `Hoje é aniversário de ${a.nome}${a.turma ? ` (${a.turma})` : ''}!`,
            dados: { aniversarioId: a._id, nome: a.nome },
            link: '/protagonismo.html',
            icone: '🎂',
            cor: '#ec4899',
            prioridade: 4
          });
          await n.save();
          enviadas++;
        }
      }

      a.lembretesEnviados = a.lembretesEnviados || {};
      a.lembretesEnviados.dia = true;
      a.lembretesEnviados.ultimoEnvio = new Date();
      await a.save();
    }
  }

  console.log(`🎂 [Aniversários] ${enviadas} notificações enviadas para ${aniversariantes.length} aniversariantes`);
  return { total: enviadas, aniversariantes: aniversariantes.length };
}

function iniciarCronAniversarios() {
  // Roda a cada 30 minutos
  cron.schedule('*/30 * * * *', async () => {
    try {
      const cfg = await ConfiguracaoProtagonismo.getConfig();
      const anivCfg = cfg.aniversarios || {};
      if (!anivCfg.avisarNoDia && !anivCfg.avisarAntecedencia) return;

      const agora = agoraBrasil();
      const horarioBase = anivCfg.horarioEnvioNoDia || '08:00';
      const [hBase, mBase] = horarioBase.split(':').map(Number);

      if (agora.getHours() < hBase) return;
      if (agora.getHours() === hBase && agora.getMinutes() < mBase) return;

      await dispararNotificacoesAniversario();
    } catch (err) {
      console.error('❌ Erro no cron de aniversários:', err.message);
    }
  });
  
}

module.exports = { iniciarCronAniversarios, dispararNotificacoesAniversario };