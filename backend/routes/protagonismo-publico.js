const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Clube = require('../models/Clube');
const InscricaoClube = require('../models/InscricaoClube');
const Tutor = require('../models/Tutor');
const Candidato = require('../models/Candidato');
const Voto = require('../models/Voto');
const ConfiguracaoProtagonismo = require('../models/ConfiguracaoProtagonismo');

// ============================================
// RATE LIMITING SIMPLES (por IP)
// ============================================
const tentativasPorIP = new Map();

function rateLimit(maxTentativas = 10, janelaMinutos = 5) {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const agora = Date.now();
    const janela = janelaMinutos * 60 * 1000;

    if (!tentativasPorIP.has(ip)) {
      tentativasPorIP.set(ip, []);
    }

    const tentativas = tentativasPorIP.get(ip).filter(t => agora - t < janela);
    tentativas.push(agora);
    tentativasPorIP.set(ip, tentativas);

    if (tentativas.length > maxTentativas) {
      return res.status(429).json({
        success: false,
        error: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
      });
    }

    next();
  };
}

// Limpeza periódica do rate limit
setInterval(() => {
  const agora = Date.now();
  const janela = 10 * 60 * 1000;
  for (const [ip, tentativas] of tentativasPorIP.entries()) {
    const validas = tentativas.filter(t => agora - t < janela);
    if (validas.length === 0) {
      tentativasPorIP.delete(ip);
    } else {
      tentativasPorIP.set(ip, validas);
    }
  }
}, 5 * 60 * 1000);

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({ success: true, status: 'online', service: 'Protagonismo - Público' });
});

// ============================================
// STATUS GERAL (para a página pública)
// ============================================
router.get('/status', async (req, res) => {
  try {
    const config = await ConfiguracaoProtagonismo.getConfig();

    // Verifica se está dentro dos prazos (se definidos)
    const agora = new Date();
    let inscricoesDentroDoPrazo = true;
    let eleicaoDentroDoPrazo = true;

    if (config.dataAberturaInscricoes && config.dataFechamentoInscricoes) {
      inscricoesDentroDoPrazo =
        agora >= config.dataAberturaInscricoes && agora <= config.dataFechamentoInscricoes;
    }

    if (config.dataAberturaEleicao && config.dataFechamentoEleicao) {
      eleicaoDentroDoPrazo =
        agora >= config.dataAberturaEleicao && agora <= config.dataFechamentoEleicao;
    }

    res.json({
      success: true,
      status: {
        inscricoesClubesAbertas: config.inscricoesClubesAbertas && inscricoesDentroDoPrazo,
        eleicaoLiderAberta: config.eleicaoLiderAberta && eleicaoDentroDoPrazo,
        tutoriaVisivel: config.tutoriaVisivel,
        avisoPublico: config.avisoPublico || ''
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CLUBES DISPONÍVEIS
// ============================================
router.get('/clubes', async (req, res) => {
  try {
    const config = await ConfiguracaoProtagonismo.getConfig();

    if (!config.inscricoesClubesAbertas) {
      return res.json({
        success: true,
        inscricoesAbertas: false,
        mensagem: 'As inscrições ainda não foram abertas.',
        clubes: []
      });
    }

    // Somente clubes ativos com inscrições abertas
    const clubes = await Clube.find({
      ativo: true,
      inscricoesAbertas: true
    }).sort({ nome: 1 });

    const clubesComInfo = await Promise.all(clubes.map(async (c) => {
      const inscricoesAtivas = await InscricaoClube.countDocuments({
        clubeId: c._id,
        status: 'ativa'
      });
      const vagasRestantes = Math.max(0, c.vagas - inscricoesAtivas);

      return {
        id: c._id,
        nome: c.nome,
        descricao: c.descricao,
        lider: c.lider?.nome || '',
        viceLider: c.viceLider?.nome || '',
        vagas: c.vagas,
        vagasRestantes,
        local: c.local,
        horario: c.horario,
        diaSemana: c.diaSemana,
        cor: c.cor,
        esgotado: vagasRestantes <= 0
      };
    }));

    res.json({
      success: true,
      inscricoesAbertas: true,
      total: clubesComInfo.length,
      clubes: clubesComInfo
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// INSCRIÇÃO EM CLUBE
// ============================================
router.post('/inscricao', rateLimit(5, 5), async (req, res) => {
  try {
    const config = await ConfiguracaoProtagonismo.getConfig();

    if (!config.inscricoesClubesAbertas) {
      return res.status(400).json({
        success: false,
        error: 'As inscrições estão fechadas.'
      });
    }

    const {
      nomeCompleto,
      dataNascimento,
      curso,
      turma,
      clubeId,
      matricula
    } = req.body;

    // Validações básicas
    if (!nomeCompleto || !dataNascimento || !curso || !turma || !clubeId) {
      return res.status(400).json({
        success: false,
        error: 'Todos os campos são obrigatórios.'
      });
    }

    if (nomeCompleto.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: 'Nome completo muito curto.'
      });
    }

    // Validar data de nascimento
    const dataNasc = new Date(dataNascimento);
    if (isNaN(dataNasc.getTime())) {
      return res.status(400).json({ success: false, error: 'Data de nascimento inválida' });
    }

    const hoje = new Date();
    const idade = Math.floor((hoje - dataNasc) / (365.25 * 24 * 60 * 60 * 1000));
    if (idade < 5 || idade > 100) {
      return res.status(400).json({ success: false, error: 'Data de nascimento inválida' });
    }

    // Verificar se já está inscrito (mesma pessoa)
    const jaInscrito = await InscricaoClube.pessoaJaInscrita(
      nomeCompleto.trim(),
      dataNasc
    );

    if (jaInscrito) {
      const inscricaoExistente = await InscricaoClube.findOne({
        nomeCompleto: { $regex: new RegExp(`^${nomeCompleto.trim()}$`, 'i') },
        dataNascimento: dataNasc,
        status: 'ativa'
      });

      return res.status(400).json({
        success: false,
        error: `Você já está inscrito no clube "${inscricaoExistente.clubeNome}". Cada aluno pode se inscrever em apenas 1 clube.`
      });
    }

    // Buscar clube
    const clube = await Clube.findById(clubeId);

    if (!clube || !clube.ativo || !clube.inscricoesAbertas) {
      return res.status(404).json({
        success: false,
        error: 'Clube não encontrado ou com inscrições fechadas.'
      });
    }

    // Verificar vagas
    const inscricoesAtivas = await InscricaoClube.countDocuments({
      clubeId: clube._id,
      status: 'ativa'
    });

    if (inscricoesAtivas >= clube.vagas) {
      return res.status(400).json({
        success: false,
        error: `O clube "${clube.nome}" está lotado. Escolha outro clube.`
      });
    }

    // Criar inscrição
    const inscricao = new InscricaoClube({
      nomeCompleto: nomeCompleto.trim(),
      dataNascimento: dataNasc,
      curso,
      turma,
      matricula: matricula || '',
      clubeId: clube._id,
      clubeNome: clube.nome,
      status: 'ativa',
      ipInscricao: req.ip || req.headers['x-forwarded-for'] || '',
      userAgent: req.headers['user-agent'] || ''
    });

    await inscricao.save();

    // Incrementa vaga no clube
    await Clube.incrementarVaga(clube._id);

    res.json({
      success: true,
      message: `Inscrição confirmada no clube "${clube.nome}"!`,
      inscricao: {
        id: inscricao._id,
        nomeCompleto: inscricao.nomeCompleto,
        clubeNome: clube.nome,
        turma: inscricao.turma,
        criadoEm: inscricao.createdAt
      }
    });
  } catch (error) {
    console.error('Erro ao inscrever:', error);
    res.status(500).json({ success: false, error: 'Erro ao processar inscrição.' });
  }
});

// ============================================
// VERIFICAR INSCRIÇÃO
// ============================================
router.post('/verificar-inscricao', rateLimit(20, 5), async (req, res) => {
  try {
    const { nomeCompleto, dataNascimento } = req.body;

    if (!nomeCompleto || !dataNascimento) {
      return res.status(400).json({ success: false, error: 'Nome e data são obrigatórios' });
    }

    const inscricao = await InscricaoClube.findOne({
      nomeCompleto: { $regex: new RegExp(`^${nomeCompleto.trim()}$`, 'i') },
      dataNascimento: new Date(dataNascimento),
      status: 'ativa'
    }).populate('clubeId', 'nome cor');

    if (inscricao) {
      res.json({
        success: true,
        inscrito: true,
        inscricao: {
          clubeNome: inscricao.clubeId?.nome || inscricao.clubeNome,
          clubeCor: inscricao.clubeId?.cor || '#f97316',
          turma: inscricao.turma,
          criadoEm: inscricao.createdAt
        }
      });
    } else {
      res.json({ success: true, inscrito: false });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CANDIDATOS (para votação)
// ============================================
router.get('/candidatos', async (req, res) => {
  try {
    const config = await ConfiguracaoProtagonismo.getConfig();

    if (!config.eleicaoLiderAberta) {
      return res.json({
        success: true,
        eleicaoAberta: false,
        mensagem: 'A eleição ainda não foi aberta.',
        turmas: []
      });
    }

    const { turma } = req.query;

    let query = { ativo: true };
    if (turma) query.turma = turma;

    const candidatos = await Candidato.find(query).sort({ turma: 1, cargo: 1, nome: 1 });

    // Agrupar por turma
    const porTurma = {};
    candidatos.forEach(c => {
      if (!porTurma[c.turma]) {
        porTurma[c.turma] = { turma: c.turma, lider: [], vice_lider: [] };
      }
      porTurma[c.turma][c.cargo].push({
        id: c._id,
        nome: c.nome,
        fotoPerfil: c.fotoPerfil,
        matricula: c.matricula,
        slogan: c.slogan,
        proposta: c.proposta
      });
    });

    res.json({
      success: true,
      eleicaoAberta: true,
      total: candidatos.length,
      turmas: Object.values(porTurma).sort((a, b) => a.turma.localeCompare(b.turma))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// VOTAR
// ============================================
router.post('/voto', rateLimit(10, 5), async (req, res) => {
  try {
    const config = await ConfiguracaoProtagonismo.getConfig();

    if (!config.eleicaoLiderAberta) {
      return res.status(400).json({
        success: false,
        error: 'A eleição está fechada.'
      });
    }

    const {
      eleitorNome,
      eleitorDataNascimento,
      eleitorTurma,
      candidatoLiderId,
      candidatoViceId
    } = req.body;

    // Validações
    if (!eleitorNome || !eleitorDataNascimento || !eleitorTurma) {
      return res.status(400).json({
        success: false,
        error: 'Nome, data de nascimento e turma são obrigatórios.'
      });
    }

    if (!candidatoLiderId && !candidatoViceId) {
      return res.status(400).json({
        success: false,
        error: 'Você deve votar em pelo menos um candidato.'
      });
    }

    const dataNasc = new Date(eleitorDataNascimento);
    if (isNaN(dataNasc.getTime())) {
      return res.status(400).json({ success: false, error: 'Data de nascimento inválida.' });
    }

    // Verificar se já votou para líder
    if (candidatoLiderId) {
      const jaVotouLider = await Voto.jaVotou(eleitorNome.trim(), dataNasc, 'lider');
      if (jaVotouLider) {
        return res.status(400).json({
          success: false,
          error: 'Você já votou para líder.'
        });
      }
    }

    // Verificar se já votou para vice
    if (candidatoViceId) {
      const jaVotouVice = await Voto.jaVotou(eleitorNome.trim(), dataNasc, 'vice_lider');
      if (jaVotouVice) {
        return res.status(400).json({
          success: false,
          error: 'Você já votou para vice-líder.'
        });
      }
    }

    const votosRegistrados = [];

    // Registrar voto em líder
    if (candidatoLiderId) {
      const candidatoLider = await Candidato.findById(candidatoLiderId);

      if (!candidatoLider) {
        return res.status(404).json({ success: false, error: 'Candidato a líder não encontrado.' });
      }

      if (candidatoLider.cargo !== 'lider') {
        return res.status(400).json({ success: false, error: 'Candidato não é líder.' });
      }

      // Validar que o candidato é da mesma turma do eleitor
      if (candidatoLider.turma !== eleitorTurma) {
        return res.status(400).json({
          success: false,
          error: `Você só pode votar em candidatos da sua turma (${eleitorTurma}).`
        });
      }

      const votoLider = new Voto({
        eleitorNome: eleitorNome.trim(),
        eleitorDataNascimento: dataNasc,
        eleitorTurma,
        candidatoId: candidatoLider._id,
        candidatoNome: candidatoLider.nome,
        cargo: 'lider',
        ipVoto: req.ip || req.headers['x-forwarded-for'] || '',
        userAgent: req.headers['user-agent'] || ''
      });

      await votoLider.save();
      await Candidato.registrarVoto(candidatoLider._id);

      votosRegistrados.push({
        cargo: 'lider',
        candidato: candidatoLider.nome
      });
    }

    // Registrar voto em vice
    if (candidatoViceId) {
      const candidatoVice = await Candidato.findById(candidatoViceId);

      if (!candidatoVice) {
        return res.status(404).json({ success: false, error: 'Candidato a vice-líder não encontrado.' });
      }

      if (candidatoVice.cargo !== 'vice_lider') {
        return res.status(400).json({ success: false, error: 'Candidato não é vice-líder.' });
      }

      if (candidatoVice.turma !== eleitorTurma) {
        return res.status(400).json({
          success: false,
          error: `Você só pode votar em candidatos da sua turma (${eleitorTurma}).`
        });
      }

      const votoVice = new Voto({
        eleitorNome: eleitorNome.trim(),
        eleitorDataNascimento: dataNasc,
        eleitorTurma,
        candidatoId: candidatoVice._id,
        candidatoNome: candidatoVice.nome,
        cargo: 'vice_lider',
        ipVoto: req.ip || req.headers['x-forwarded-for'] || '',
        userAgent: req.headers['user-agent'] || ''
      });

      await votoVice.save();
      await Candidato.registrarVoto(candidatoVice._id);

      votosRegistrados.push({
        cargo: 'vice_lider',
        candidato: candidatoVice.nome
      });
    }

    res.json({
      success: true,
      message: 'Voto(s) registrado(s) com sucesso!',
      votos: votosRegistrados
    });
  } catch (error) {
    console.error('Erro ao votar:', error);
    res.status(500).json({ success: false, error: 'Erro ao registrar voto.' });
  }
});

// ============================================
// VERIFICAR SE JÁ VOTOU
// ============================================
router.post('/verificar-voto', rateLimit(20, 5), async (req, res) => {
  try {
    const { eleitorNome, eleitorDataNascimento } = req.body;

    if (!eleitorNome || !eleitorDataNascimento) {
      return res.status(400).json({ success: false, error: 'Nome e data são obrigatórios.' });
    }

    const dataNasc = new Date(eleitorDataNascimento);

    const [jaVotouLider, jaVotouVice] = await Promise.all([
      Voto.jaVotou(eleitorNome.trim(), dataNasc, 'lider'),
      Voto.jaVotou(eleitorNome.trim(), dataNasc, 'vice_lider')
    ]);

    res.json({
      success: true,
      jaVotouLider,
      jaVotouVice,
      jaVotouCompleto: jaVotouLider && jaVotouVice
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// TUTORES (VISÍVEL)
// ============================================
router.get('/tutores', async (req, res) => {
  try {
    const config = await ConfiguracaoProtagonismo.getConfig();

    if (!config.tutoriaVisivel) {
      return res.json({
        success: true,
        visivel: false,
        tutores: []
      });
    }

    const tutores = await Tutor.find({ ativo: true }).sort({ turma: 1, nomeProfessor: 1 });

    // Agrupar por turma
    const porTurma = {};
    tutores.forEach(t => {
      if (!porTurma[t.turma]) porTurma[t.turma] = [];
      porTurma[t.turma].push({
        nome: t.nomeProfessor,
        area: t.area,
        curso: t.curso,
        turma: t.turma
      });
    });

    res.json({
      success: true,
      visivel: true,
      total: tutores.length,
      porTurma
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// LISTAS AUXILIARES PARA O FORMULÁRIO
// ============================================
router.get('/cursos-turmas', async (req, res) => {
  try {
    const [cursos, turmas] = await Promise.all([
      User.distinct('curso', {
        role: 'aluno',
        ativo: true,
        curso: { $nin: [null, '', 'Não informado'] }
      }),
      User.distinct('turma', {
        role: 'aluno',
        ativo: true,
        turma: { $nin: [null, '', 'Não informada'] }
      })
    ]);

    // Vincular turmas a cursos
    const vinculos = {};
    for (const curso of cursos) {
      const turmasDoCurso = await User.distinct('turma', {
        role: 'aluno',
        ativo: true,
        curso,
        turma: { $nin: [null, '', 'Não informada'] }
      });
      vinculos[curso] = turmasDoCurso.sort();
    }

    res.json({
      success: true,
      cursos: cursos.sort(),
      turmas: turmas.sort(),
      vinculosCursoTurma: vinculos
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;