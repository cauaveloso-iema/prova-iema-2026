// services/visita-lembretes-service.js
// ============================================================================
// SERVIÇO DE LEMBRETES DE VISITA
// ----------------------------------------------------------------------------
// A cada 1 minuto, verifica se existe alguma visita de HOJE que começa em
// EXATAMENTE 5 minutos (janela de 60s) e envia notificação para:
//   - Quem criou o termo (criadoPor)
//   - Todos os professores associados (professores[].professorId)
// Informando: quantidade de alunos assinados / total de alunos.
//
// 🚀 Otimizado: busca APENAS os termos do dia (não pega histórico nem futuros)
// ============================================================================

const TermoVisita = require('../models/TermoVisita');
const NotificacaoVisita = require('../models/NotificacaoVisita');

// Controle de duplicidade em memória (evita reenvio do mesmo termo)
const lembretesEnviados = new Set();

// ============================================
// Utilitários
// ============================================
function normalizarId(id) {
  if (!id) return '';
  if (typeof id === 'string') return id.trim();
  if (id._id) return id._id.toString().trim();
  if (id.toString) return id.toString().trim();
  return '';
}

/**
 * Converte "HH:MM" ou "HH:MM às HH:MM" em horas/minutos do INÍCIO.
 * Ex.: "14:00" -> {h:14, m:0} | "14:00 às 17:00" -> {h:14, m:0}
 */
function extrairHoraInicio(horario) {
  if (!horario) return null;
  const match = String(horario).match(/(\d{1,2})\s*[:hH]\s*(\d{2})/);
  if (!match) return null;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

// ============================================
// Janela do dia (fuso local — America/Sao_Paulo já setado no server.js)
// ============================================
function intervaloDoDia(agora = new Date()) {
  const inicioHoje = new Date(agora);
  inicioHoje.setHours(0, 0, 0, 0);

  const inicioAmanha = new Date(inicioHoje);
  inicioAmanha.setDate(inicioAmanha.getDate() + 1);

  return { inicioHoje, inicioAmanha };
}

// ============================================
// Monta lista única de destinatários (criador + professores)
// ============================================
function montarDestinatarios(termo) {
  const set = new Set();

  if (termo.criadoPor) {
    set.add(normalizarId(termo.criadoPor));
  }

  (termo.professores || []).forEach(p => {
    const pid = normalizarId(p.professorId) || normalizarId(p._id);
    if (pid) set.add(pid);
  });

  return Array.from(set).filter(Boolean);
}

// ============================================
// Envia lembrete para um termo
// ============================================
async function enviarLembrete(termo, minutosAntes) {
  try {
    const totalAlunos = (termo.alunos || []).length;
    const totalAutorizados = (termo.responsaveis || []).filter(r => r.status === 'autorizado').length;

    const destinatarios = montarDestinatarios(termo);

    if (destinatarios.length === 0) {
      console.warn(`⚠️ Lembrete ignorado (sem destinatários): ${termo.codigo}`);
      return { ok: false, motivo: 'sem destinatarios' };
    }

    const titulo = `⏰ Visita em ${minutosAntes} minutos`;
    const mensagem =
      `A visita "${termo.atividade}" (${termo.codigo}) começa em ${minutosAntes} minutos. ` +
      `Alunos assinados: ${totalAutorizados}/${totalAlunos}.`;

    // 1) Notificação no banco
    for (const usuarioId of destinatarios) {
      try {
        await new NotificacaoVisita({
          usuarioId,
          tipo: 'lembrete',
          titulo,
          mensagem,
          termoId: termo._id
        }).save();
      } catch (err) {
        console.warn(`⚠️ Erro ao salvar lembrete para ${usuarioId}:`, err.message);
      }
    }

    // 2) Push OneSignal
    try {
      const OneSignalService = require('./onesignal-service');
      const oneSignal = new OneSignalService();

      const dadosPush = {
        tipo: 'lembrete_visita',
        termoId: termo._id.toString(),
        codigo: termo.codigo,
        minutosAntes,
        totalAlunos,
        totalAutorizados
      };

      for (const usuarioId of destinatarios) {
        try {
          await oneSignal.enviarPush(usuarioId, titulo, mensagem, dadosPush);
        } catch (err) {
          console.warn(`⚠️ Erro no push de lembrete para ${usuarioId}:`, err.message);
        }
      }
    } catch (err) {
      console.warn('⚠️ OneSignalService indisponível para lembrete:', err.message);
    }

    console.log(
      `🔔 Lembrete enviado: ${termo.codigo} | ${totalAutorizados}/${totalAlunos} alunos | ` +
      `${destinatarios.length} destinatário(s)`
    );

    return { ok: true, totalAlunos, totalAutorizados, destinatarios };
  } catch (error) {
    console.error(`❌ Erro em enviarLembrete(${termo.codigo}):`, error.message);
    return { ok: false, erro: error.message };
  }
}

// ============================================
// Verifica e envia lembretes pendentes
// ============================================
async function verificarLembretes(minutosAntes = 5) {
  try {
    const agora = new Date();
    const { inicioHoje, inicioAmanha } = intervaloDoDia(agora);

    // 🚀 Busca APENAS termos de HOJE (otimizado — não puxa histórico)
    const termos = await TermoVisita.find({
      ativo: true,
      dataVisita: { $gte: inicioHoje, $lt: inicioAmanha }
    })
      .select('codigo atividade dataVisita horario professores criadoPor alunos responsaveis status')
      .lean();

    if (termos.length === 0) {
      return { ok: true, enviados: 0 };
    }

    let enviados = 0;

    for (const termo of termos) {
      if (!termo.dataVisita) continue;

      const chaveDedup = `${termo._id.toString()}_${minutosAntes}`;
      if (lembretesEnviados.has(chaveDedup)) continue;

      const horaInicio = extrairHoraInicio(termo.horario);
      if (!horaInicio) continue;

      // Monta o Date exato do início (fuso do servidor: America/Sao_Paulo)
      const inicio = new Date(termo.dataVisita);
      inicio.setHours(horaInicio.h, horaInicio.m, 0, 0);

      // Diferença em minutos
      const diffMin = Math.round((inicio.getTime() - agora.getTime()) / 60000);

      // Janela de disparo: entre 0 e `minutosAntes` (inclusive)
      if (diffMin >= 0 && diffMin <= minutosAntes) {
        console.log(`⏰ [LEMBRETE] ${termo.codigo} em ${diffMin}min — disparando`);
        const result = await enviarLembrete(termo, minutosAntes);

        // Marca dedup mesmo se falhar, para não entrar em loop
        lembretesEnviados.add(chaveDedup);

        if (result.ok) enviados++;
      }
    }

    return { ok: true, enviados };
  } catch (error) {
    console.error('❌ Erro em verificarLembretes:', error.message);
    return { ok: false, erro: error.message };
  }
}

// ============================================
// Limpa o Set de dedup (para não crescer infinito)
// ============================================
function limparDedupAntigos() {
  lembretesEnviados.clear();
  console.log('🧹 [LEMBRETES] Set de deduplicação limpo');
}

// ============================================
// Inicia o agendador (a cada 60s)
// ============================================
let intervalId = null;

function iniciarAgendador(minutosAntes = 5, intervaloMs = 60 * 1000) {
  if (intervalId) {
    console.log('⚠️ Agendador de lembretes já em execução');
    return intervalId;
  }

  console.log(
    `🚀 Agendador de lembretes de visita iniciado ` +
    `(a cada ${intervaloMs / 1000}s, ${minutosAntes}min antes, somente termos do dia)`
  );

  // Primeira verificação após 15s (dá tempo do Mongo conectar)
  setTimeout(() => {
    verificarLembretes(minutosAntes).catch(err =>
      console.error('❌ [LEMBRETES] erro na 1ª verificação:', err.message)
    );
  }, 15 * 1000);

  intervalId = setInterval(() => {
    verificarLembretes(minutosAntes).catch(err =>
      console.error('❌ [LEMBRETES] erro na verificação periódica:', err.message)
    );
  }, intervaloMs);

  // Limpa dedup todos os dias à meia-noite
  const agora = new Date();
  const msAteMeiaNoite =
    new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1).getTime() - agora.getTime();

  setTimeout(() => {
    limparDedupAntigos();
    setInterval(limparDedupAntigos, 24 * 60 * 60 * 1000);
  }, msAteMeiaNoite);

  return intervalId;
}

function pararAgendador() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('🛑 Agendador de lembretes de visita parado');
  }
}

// ============================================
// EXPORTS
// ============================================
module.exports = {
  iniciarAgendador,
  pararAgendador,
  verificarLembretes,
  enviarLembrete,
  getIntervalId: () => intervalId
};