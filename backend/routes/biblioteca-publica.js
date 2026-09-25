const express = require('express');
const router = express.Router();
const User = require('../models/User');
const AtendimentoBiblioteca = require('../models/AtendimentoBiblioteca');

// ============================================
// RATE LIMITING SIMPLES (por IP)
// ============================================
const tentativasPorIP = new Map();

function rateLimit(maxTentativas = 10, janelaMinutos = 5) {
  return (req, res, next) => {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const agora = Date.now();
    const janela = janelaMinutos * 60 * 1000;

    if (!tentativasPorIP.has(ip)) tentativasPorIP.set(ip, []);
    const tentativas = tentativasPorIP.get(ip).filter(t => agora - t < janela);
    tentativas.push(agora);
    tentativasPorIP.set(ip, tentativas);

    if (tentativas.length > maxTentativas) {
      return res.status(429).json({
        success: false,
        error: 'Muitas tentativas. Aguarde alguns minutos.'
      });
    }
    next();
  };
}

setInterval(() => {
  const agora = Date.now();
  const janela = 10 * 60 * 1000;
  for (const [ip, tentativas] of tentativasPorIP.entries()) {
    const validas = tentativas.filter(t => agora - t < janela);
    if (validas.length === 0) tentativasPorIP.delete(ip);
    else tentativasPorIP.set(ip, validas);
  }
}, 5 * 60 * 1000);

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({ success: true, status: 'online', service: 'Biblioteca - Público' });
});

// ============================================
// STATUS
// ============================================
router.get('/status', async (req, res) => {
  try {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const visitasHoje = await AtendimentoBiblioteca.countDocuments({
      'entrada.dataHora': { $gte: hoje }
    });
    const emVisita = await AtendimentoBiblioteca.countDocuments({ status: 'em_visita' });

    res.json({
      success: true,
      status: {
        bibliotecaAberta: true,
        visitasHoje,
        emVisita
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CURSOS E TURMAS
// ============================================
router.get('/cursos-turmas', async (req, res) => {
  try {
    const [cursos, turmas] = await Promise.all([
      User.distinct('curso', {
        role: 'aluno', ativo: true,
        curso: { $nin: [null, '', 'Não informado'] }
      }),
      User.distinct('turma', {
        role: 'aluno', ativo: true,
        turma: { $nin: [null, '', 'Não informada'] }
      })
    ]);

    const vinculos = {};
    for (const curso of cursos) {
      const turmasDoCurso = await User.distinct('turma', {
        role: 'aluno', ativo: true, curso,
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

// ============================================
// ALUNOS POR TURMA
// ============================================
router.get('/alunos-por-turma', async (req, res) => {
  try {
    const { turma } = req.query;
    if (!turma) return res.status(400).json({ success: false, error: 'Turma é obrigatória' });

    const alunos = await User.find({ role: 'aluno', ativo: true, turma })
      .select('nome matricula turma curso fotoPerfil')
      .sort({ nome: 1 });

    res.json({
      success: true,
      total: alunos.length,
      alunos: alunos.map(a => ({
        id: a._id,
        nome: a.nome,
        matricula: a.matricula,
        turma: a.turma,
        curso: a.curso,
        fotoPerfil: a.fotoPerfil
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// BUSCAR ALUNO
// ============================================
router.get('/aluno/:id', async (req, res) => {
  try {
    const aluno = await User.findById(req.params.id)
      .select('nome matricula turma curso fotoPerfil role ativo');

    if (!aluno || aluno.role !== 'aluno' || !aluno.ativo) {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }

    const visitaAtiva = await AtendimentoBiblioteca.getVisitaAtiva(aluno._id);

    res.json({
      success: true,
      aluno: {
        id: aluno._id,
        nome: aluno.nome,
        matricula: aluno.matricula,
        turma: aluno.turma,
        curso: aluno.curso,
        fotoPerfil: aluno.fotoPerfil
      },
      emVisita: !!visitaAtiva,
      visitaAtiva: visitaAtiva ? {
        id: visitaAtiva._id,
        dataHoraEntrada: visitaAtiva.entrada.dataHora,
        motivoVisita: visitaAtiva.motivoVisita,
        motivoVisitaLabel: AtendimentoBiblioteca.getMotivoLabel(visitaAtiva.motivoVisita)
      } : null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// REGISTRAR ENTRADA
// ============================================
router.post('/entrada', rateLimit(10, 5), async (req, res) => {
  try {
    const {
      alunoId,
      motivoVisita,
      motivoOutros,
      atividades,
      atividadesOutros,
      observacoes,
      visitanteExterno,
      visitanteNome,
      visitanteDocumento,
      visitanteInstituicao
    } = req.body;

    if (!motivoVisita) {
      return res.status(400).json({ success: false, error: 'Motivo da visita é obrigatório' });
    }
    if (motivoVisita === 'outros' && !motivoOutros) {
      return res.status(400).json({ success: false, error: 'Especifique o motivo "Outros"' });
    }

    let alunoData = null;
    if (alunoId && !visitanteExterno) {
      alunoData = await User.findById(alunoId);
      if (!alunoData || alunoData.role !== 'aluno') {
        return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
      }
      const visitaAtiva = await AtendimentoBiblioteca.getVisitaAtiva(alunoId);
      if (visitaAtiva) {
        return res.status(400).json({
          success: false,
          error: 'Você já está registrado na biblioteca. Registre a saída primeiro.'
        });
      }
    } else if (visitanteExterno && !visitanteNome) {
      return res.status(400).json({ success: false, error: 'Nome do visitante é obrigatório' });
    } else if (!alunoId && !visitanteExterno) {
      return res.status(400).json({ success: false, error: 'Aluno ou visitante é obrigatório' });
    }

    const atendimento = new AtendimentoBiblioteca({
      alunoId: alunoData ? alunoData._id : null,
      alunoNome: alunoData ? alunoData.nome : visitanteNome,
      alunoMatricula: alunoData ? (alunoData.matricula || '') : (visitanteDocumento || ''),
      alunoTurma: alunoData ? (alunoData.turma || '') : '',
      alunoCurso: alunoData ? (alunoData.curso || '') : '',
      alunoFoto: alunoData ? (alunoData.fotoPerfil || '') : '',
      visitanteExterno: !!visitanteExterno,
      visitanteDocumento: visitanteDocumento || '',
      visitanteInstituicao: visitanteInstituicao || '',
      motivoVisita,
      motivoOutros: motivoOutros || '',
      atividades: Array.isArray(atividades) ? atividades : [],
      atividadesOutros: atividadesOutros || '',
      entrada: {
        dataHora: new Date(),
        registradoPorNome: 'Auto-registro (Público)',
        observacoes: observacoes || ''
      },
      status: 'em_visita'
    });

    await atendimento.save();

    res.json({
      success: true,
      message: 'Entrada registrada com sucesso!',
      atendimento: {
        id: atendimento._id,
        alunoNome: atendimento.alunoNome,
        motivoVisita: AtendimentoBiblioteca.getMotivoLabel(atendimento.motivoVisita),
        dataHoraEntrada: atendimento.entrada.dataHora
      }
    });
  } catch (error) {
    console.error('Erro ao registrar entrada (público):', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// REGISTRAR SAÍDA
// ============================================
router.post('/saida', rateLimit(10, 5), async (req, res) => {
  try {
    const { alunoId, atendimentoId, observacoes } = req.body;

    let atendimento = null;
    if (atendimentoId) atendimento = await AtendimentoBiblioteca.findById(atendimentoId);
    else if (alunoId) atendimento = await AtendimentoBiblioteca.getVisitaAtiva(alunoId);

    if (!atendimento) {
      return res.status(404).json({ success: false, error: 'Nenhuma visita ativa encontrada' });
    }
    if (atendimento.status !== 'em_visita') {
      return res.status(400).json({ success: false, error: 'Esta visita já foi finalizada' });
    }

    await atendimento.finalizarVisita({
      registradoPorNome: 'Auto-registro (Público)',
      observacoes: observacoes || ''
    });

    res.json({
      success: true,
      message: 'Saída registrada com sucesso!',
      atendimento: {
        id: atendimento._id,
        alunoNome: atendimento.alunoNome,
        duracaoMinutos: atendimento.duracaoMinutos,
        dataHoraSaida: atendimento.saida.dataHora
      }
    });
  } catch (error) {
    console.error('Erro ao registrar saída (público):', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;