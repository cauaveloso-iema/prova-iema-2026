const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Refeicao = require('../models/Refeicao');

// ============================================
// 📊 DASHBOARD PRINCIPAL COM ANÁLISE INTELIGENTE
// ============================================
router.get('/dashboard', async (req, res) => {
  try {
    const allowedRoles = ['cozinha', 'super_admin', 'admin'];
    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }
    
    const hoje = new Date().toISOString().split('T')[0];
    const agora = new Date();
    const horaAtual = agora.getHours();
    
    let refeicaoAtual = null;
    if (horaAtual >= 8 && horaAtual <= 10) refeicaoAtual = 'manha';
    else if (horaAtual >= 11 && horaAtual <= 13) refeicaoAtual = 'almoco';
    else if (horaAtual >= 14 && horaAtual <= 16) refeicaoAtual = 'tarde';
    
    // ============================================
    // 1. PERFIL ALIMENTAR DOS USUÁRIOS
    // ============================================
    const perfis = {
      sempre: await User.countDocuments({ ativo: true, perfilAlimentar: 'sempre' }),
      as_vezes: await User.countDocuments({ ativo: true, perfilAlimentar: 'as_vezes' }),
      nunca: await User.countDocuments({ ativo: true, perfilAlimentar: 'nunca' }),
      nao_informado: await User.countDocuments({ 
        ativo: true, 
        $or: [
          { perfilAlimentar: 'nao_informado' },
          { perfilAlimentar: { $exists: false } },
          { perfilAlimentar: null }
        ]
      })
    };
    
    perfis.total = perfis.sempre + perfis.as_vezes + perfis.nunca + perfis.nao_informado;
    perfis.que_comem = perfis.sempre + perfis.as_vezes; // Potencial de consumo
    
    // ============================================
    // 2. REGISTROS REAIS DE HOJE
    // ============================================
    const refeicoesHoje = await Refeicao.find({ data: hoje });
    
    const registrosReais = {
      manha: refeicoesHoje.filter(r => r.tipoRefeicao === 'manha').length,
      almoco: refeicoesHoje.filter(r => r.tipoRefeicao === 'almoco').length,
      tarde: refeicoesHoje.filter(r => r.tipoRefeicao === 'tarde').length,
      total: refeicoesHoje.length,
      pessoasUnicas: new Set(refeicoesHoje.map(r => r.alunoId.toString())).size
    };
    
    // ============================================
    // 3. ANÁLISE DE ADESÃO (Quem disse que ia vs quem veio)
    // ============================================
    
    // Buscar usuários que disseram que iam comer (sempre + as_vezes)
    const usuariosQueDisseramQueComem = await User.find({
      ativo: true,
      perfilAlimentar: { $in: ['sempre', 'as_vezes'] }
    }).select('_id nome perfilAlimentar refeicoesQueParticipa');
    
    // Buscar quem realmente comeu hoje
    const usuariosQueComeramHoje = new Set(refeicoesHoje.map(r => r.alunoId.toString()));
    
    // Análise de fidelidade
    let aderentes = 0;
    let faltantes = 0;
    const faltantesLista = [];
    
    for (const usuario of usuariosQueDisseramQueComem) {
      const id = usuario._id.toString();
      if (usuariosQueComeramHoje.has(id)) {
        aderentes++;
      } else {
        faltantes++;
        faltantesLista.push({
          id: usuario._id,
          nome: usuario.nome,
          perfil: usuario.perfilAlimentar
        });
      }
    }
    
    const taxaAdesao = usuariosQueDisseramQueComem.length > 0 
      ? (aderentes / usuariosQueDisseramQueComem.length) * 100 
      : 0;
    
    // ============================================
    // 4. ANÁLISE POR TURMA
    // ============================================
    const turmas = await User.distinct('turma', { 
      role: 'aluno', 
      ativo: true, 
      turma: { $ne: null, $ne: '' } 
    });
    
    const analisePorTurma = [];
    for (const turma of turmas) {
      // Alunos da turma
      const alunosTurma = await User.find({ 
        role: 'aluno', 
        ativo: true, 
        turma 
      }).select('_id nome perfilAlimentar refeicoesQueParticipa');
      
      // Alunos que disseram que comem
      const dizemQueComem = alunosTurma.filter(a => 
        a.perfilAlimentar === 'sempre' || a.perfilAlimentar === 'as_vezes'
      ).length;
      
      // Alunos que realmente comeram hoje
      const comeramHoje = alunosTurma.filter(a => 
        usuariosQueComeramHoje.has(a._id.toString())
      ).length;
      
      // Taxa de adesão da turma
      const taxaTurma = dizemQueComem > 0 ? (comeramHoje / dizemQueComem) * 100 : 0;
      
      analisePorTurma.push({
        turma,
        totalAlunos: alunosTurma.length,
        dizemQueComem,
        comeramHoje,
        taxaAdesao: Math.round(taxaTurma),
        faltantes: dizemQueComem - comeramHoje
      });
    }
    
    analisePorTurma.sort((a, b) => a.taxaAdesao - b.taxaAdesao);
    
    // ============================================
    // 5. PREVISÃO INTELIGENTE PARA PRÓXIMAS REFEIÇÕES
    // ============================================
    
    // Buscar histórico das últimas 4 semanas (mesmo dia da semana)
    const dataAtual = new Date(hoje);
    const diaSemana = dataAtual.getDay();
    const datasHistorico = [];
    for (let i = 1; i <= 4; i++) {
      const dataHist = new Date(dataAtual);
      dataHist.setDate(dataAtual.getDate() - (7 * i));
      datasHistorico.push(dataHist.toISOString().split('T')[0]);
    }
    
    // Calcular média histórica para cada refeição
    const historicoManha = await Refeicao.countDocuments({
      data: { $in: datasHistorico },
      tipoRefeicao: 'manha'
    });
    const historicoAlmoco = await Refeicao.countDocuments({
      data: { $in: datasHistorico },
      tipoRefeicao: 'almoco'
    });
    const historicoTarde = await Refeicao.countDocuments({
      data: { $in: datasHistorico },
      tipoRefeicao: 'tarde'
    });
    
    const mediaHistorica = {
      manha: Math.round(historicoManha / 4),
      almoco: Math.round(historicoAlmoco / 4),
      tarde: Math.round(historicoTarde / 4)
    };
    
    // Previsão baseada em perfil + histórico
    const pesoPorRefeicao = 0.3; // 300g
    
    let previsao = {
      manha: {
        pessoas: Math.round((perfis.sempre * 0.3) + (perfis.as_vezes * 0.1)),
        kg: 0
      },
      almoco: {
        pessoas: Math.round((perfis.sempre * 0.9) + (perfis.as_vezes * 0.5)),
        kg: 0
      },
      tarde: {
        pessoas: Math.round((perfis.sempre * 0.2) + (perfis.as_vezes * 0.05)),
        kg: 0
      }
    };
    
    // Ajustar pela média histórica (70% previsão atual, 30% histórico)
    if (mediaHistorica.manha > 0) {
      previsao.manha.pessoas = Math.round((previsao.manha.pessoas * 0.7) + (mediaHistorica.manha * 0.3));
    }
    if (mediaHistorica.almoco > 0) {
      previsao.almoco.pessoas = Math.round((previsao.almoco.pessoas * 0.7) + (mediaHistorica.almoco * 0.3));
    }
    if (mediaHistorica.tarde > 0) {
      previsao.tarde.pessoas = Math.round((previsao.tarde.pessoas * 0.7) + (mediaHistorica.tarde * 0.3));
    }
    
    // Calcular kg com margem de segurança
    previsao.manha.kg = Math.ceil(previsao.manha.pessoas * pesoPorRefeicao * 1.1);
    previsao.almoco.kg = Math.ceil(previsao.almoco.pessoas * pesoPorRefeicao * 1.15);
    previsao.tarde.kg = Math.ceil(previsao.tarde.pessoas * pesoPorRefeicao * 1.1);
    
    // ============================================
    // 6. INSIGHTS E RECOMENDAÇÕES
    // ============================================
    const insights = [];
    
    // Insight 1: Taxa de adesão
    if (taxaAdesao < 50) {
      insights.push({
        tipo: 'warning',
        titulo: '⚠️ Baixa adesão às refeições',
        mensagem: `Apenas ${Math.round(taxaAdesao)}% das pessoas que disseram que comem realmente vieram. Verifique se há problemas com a qualidade da comida ou horários.`,
        acao: 'Conversar com coordenação de pátio'
      });
    } else if (taxaAdesao > 80) {
      insights.push({
        tipo: 'success',
        titulo: '✅ Alta adesão às refeições',
        mensagem: `${Math.round(taxaAdesao)}% das pessoas que disseram que comem realmente vieram. A comida está sendo bem aceita!`,
        acao: 'Manter o padrão atual'
      });
    }
    
    // Insight 2: Turmas com menor adesão
    const pioresTurmas = analisePorTurma.filter(t => t.taxaAdesao < 50 && t.dizemQueComem > 0);
    if (pioresTurmas.length > 0) {
      insights.push({
        tipo: 'danger',
        titulo: '📉 Turmas com baixa adesão',
        mensagem: pioresTurmas.map(t => `${t.turma} (${t.taxaAdesao}%)`).join(', '),
        acao: 'Conversar com os professores destas turmas'
      });
    }
    
    // Insight 3: Faltantes frequentes
    if (faltantesLista.length > 10) {
      insights.push({
        tipo: 'info',
        titulo: '👤 Pessoas que não vieram hoje',
        mensagem: `${faltantesLista.length} pessoas que disseram que comeriam não vieram hoje.`,
        acao: 'Verificar se estão presentes na escola'
      });
    }
    
    // Insight 4: Previsão vs Real (se já houver registros hoje)
    if (refeicaoAtual === 'manha' && registrosReais.manha > 0) {
      const diferenca = registrosReais.manha - previsao.manha.pessoas;
      if (Math.abs(diferenca) > 20) {
        insights.push({
          tipo: diferenca > 0 ? 'info' : 'warning',
          titulo: diferenca > 0 ? '📈 Demanda acima do esperado' : '📉 Demanda abaixo do esperado',
          mensagem: `${Math.abs(diferenca)} pessoas a ${diferenca > 0 ? 'mais' : 'menos'} do que o previsto para o lanche da manhã.`,
          acao: diferenca > 0 ? 'Preparar comida extra' : 'Reduzir preparo para próximo dia'
        });
      }
    }
    
    if (refeicaoAtual === 'almoco' && registrosReais.almoco > 0) {
      const diferenca = registrosReais.almoco - previsao.almoco.pessoas;
      if (Math.abs(diferenca) > 30) {
        insights.push({
          tipo: diferenca > 0 ? 'danger' : 'warning',
          titulo: diferenca > 0 ? '🔴 ALERTA: Demanda muito alta no almoço' : '⚠️ Demanda muito baixa no almoço',
          mensagem: `${Math.abs(diferenca)} pessoas a ${diferenca > 0 ? 'mais' : 'menos'} do que o previsto.`,
          acao: diferenca > 0 ? 'Correr para preparar comida extra URGENTE' : 'Reduzir desperdício nos próximos dias'
        });
      }
    }
    
    // Insight 5: Tendência semanal
    const tendencia = {
      manha: mediaHistorica.manha > previsao.manha.pessoas ? 'diminuindo' : (mediaHistorica.manha < previsao.manha.pessoas ? 'crescendo' : 'estavel'),
      almoco: mediaHistorica.almoco > previsao.almoco.pessoas ? 'diminuindo' : (mediaHistorica.almoco < previsao.almoco.pessoas ? 'crescendo' : 'estavel'),
      tarde: mediaHistorica.tarde > previsao.tarde.pessoas ? 'diminuindo' : (mediaHistorica.tarde < previsao.tarde.pessoas ? 'crescendo' : 'estavel')
    };
    
    if (tendencia.almoco === 'crescendo') {
      insights.push({
        tipo: 'info',
        titulo: '📈 Tendência de crescimento',
        mensagem: 'A demanda pelo almoço está aumentando nas últimas semanas.',
        acao: 'Aumentar gradativamente a quantidade preparada'
      });
    }
    
    // ============================================
    // 7. RESPOSTA FINAL
    // ============================================
    res.json({
      success: true,
      data: hoje,
      horaAtual,
      refeicaoAtual,
      
      // Perfis alimentares
      perfis,
      
      // Registros reais
      registrosReais,
      
      // Análise de adesão
      analiseAdesao: {
        totalQueDisseramQueComem: usuariosQueDisseramQueComem.length,
        compareceram: aderentes,
        faltaram: faltantes,
        taxaAdesao: Math.round(taxaAdesao),
        faltantesLista: faltantesLista.slice(0, 10) // Top 10 faltantes
      },
      
      // Análise por turma
      analisePorTurma,
      
      // Previsão inteligente
      previsao,
      
      // Médias históricas
      mediaHistorica,
      
      // Tendências
      tendencia,
      
      // Insights
      insights,
      
      // Sugestão para a refeição atual
      sugestaoAtual: (() => {
        if (!refeicaoAtual) return { mensagem: 'Fora do horário de refeição', acao: 'Prepare-se para o próximo horário' };
        
        const previsaoAtual = previsao[refeicaoAtual];
        const realAtual = registrosReais[refeicaoAtual];
        
        if (realAtual > 0) {
          const percentualReal = (realAtual / previsaoAtual.pessoas) * 100;
          if (percentualReal > 110) return { mensagem: `⚠️ Demanda ${Math.round(percentualReal - 100)}% acima do previsto`, acao: 'Prepare comida extra imediatamente' };
          if (percentualReal < 70) return { mensagem: `📉 Demanda ${Math.round(100 - percentualReal)}% abaixo do previsto`, acao: 'Reduza o preparo para evitar desperdício' };
          return { mensagem: `✅ Demanda dentro do esperado (${Math.round(percentualReal)}%)`, acao: 'Continue no ritmo atual' };
        }
        
        return { mensagem: `📊 Previsto: ${previsaoAtual.pessoas} pessoas`, acao: `Prepare ${previsaoAtual.kg}kg de comida` };
      })(),
      
      horariosRefeicoes: {
        manha: '8h - 10h',
        almoco: '11h - 13h',
        tarde: '14h - 16h'
      }
    });
    
  } catch (error) {
    console.error('Erro no dashboard:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 📊 RELATÓRIO DETALHADO DE FALTANTES
// ============================================
router.get('/faltantes', async (req, res) => {
  try {
    const allowedRoles = ['cozinha', 'super_admin', 'admin'];
    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }
    
    const { data, turma } = req.query;
    const dataConsulta = data || new Date().toISOString().split('T')[0];
    
    // Buscar quem disse que come
    let query = {
      ativo: true,
      perfilAlimentar: { $in: ['sempre', 'as_vezes'] }
    };
    if (turma) query.turma = turma;
    
    const usuariosQueDisseramQueComem = await User.find(query)
      .select('_id nome turma perfilAlimentar refeicoesQueParticipa');
    
    // Buscar quem realmente comeu
    const refeicoes = await Refeicao.find({ data: dataConsulta });
    const quemComeu = new Set(refeicoes.map(r => r.alunoId.toString()));
    
    // Listar faltantes
    const faltantes = [];
    for (const user of usuariosQueDisseramQueComem) {
      if (!quemComeu.has(user._id.toString())) {
        faltantes.push({
          id: user._id,
          nome: user.nome,
          turma: user.turma || 'N/A',
          perfil: user.perfilAlimentar,
          refeicoesQueParticipa: user.refeicoesQueParticipa || []
        });
      }
    }
    
    res.json({
      success: true,
      data: dataConsulta,
      turma: turma || 'Todas',
      totalQueDisseramQueComem: usuariosQueDisseramQueComem.length,
      totalQueComeram: quemComeu.size,
      totalFaltantes: faltantes.length,
      faltantes
    });
    
  } catch (error) {
    console.error('Erro ao listar faltantes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 📊 ANÁLISE SEMANAL
// ============================================
router.get('/analise-semanal', async (req, res) => {
  try {
    const allowedRoles = ['cozinha', 'super_admin', 'admin'];
    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }
    
    const hoje = new Date();
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
    const fimSemana = new Date(inicioSemana);
    fimSemana.setDate(inicioSemana.getDate() + 6);
    
    const dataInicio = inicioSemana.toISOString().split('T')[0];
    const dataFim = fimSemana.toISOString().split('T')[0];
    
    // Buscar registros da semana
    const registros = await Refeicao.find({
      data: { $gte: dataInicio, $lte: dataFim }
    }).sort({ data: 1 });
    
    // Agrupar por dia e refeição
    const analiseDiaria = {};
    for (let i = 0; i < 7; i++) {
      const dia = new Date(inicioSemana);
      dia.setDate(inicioSemana.getDate() + i);
      const dataStr = dia.toISOString().split('T')[0];
      analiseDiaria[dataStr] = { manha: 0, almoco: 0, tarde: 0, total: 0 };
    }
    
    registros.forEach(r => {
      if (analiseDiaria[r.data]) {
        analiseDiaria[r.data][r.tipoRefeicao]++;
        analiseDiaria[r.data].total++;
      }
    });
    
    // Calcular totais
    const totais = {
      manha: registros.filter(r => r.tipoRefeicao === 'manha').length,
      almoco: registros.filter(r => r.tipoRefeicao === 'almoco').length,
      tarde: registros.filter(r => r.tipoRefeicao === 'tarde').length,
      total: registros.length
    };
    
    // Dia com mais refeições
    let diaPico = null;
    let maxRefeicoes = 0;
    for (const [data, valores] of Object.entries(analiseDiaria)) {
      if (valores.total > maxRefeicoes) {
        maxRefeicoes = valores.total;
        diaPico = data;
      }
    }
    
    res.json({
      success: true,
      semana: { inicio: dataInicio, fim: dataFim },
      analiseDiaria,
      totais,
      diaPico,
      mediaDiaria: totais.total / 7
    });
    
  } catch (error) {
    console.error('Erro na análise semanal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 🏥 HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    service: 'Cozinha - Análise Inteligente',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;