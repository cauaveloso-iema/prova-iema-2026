const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Clube = require('../models/Clube');
const InscricaoClube = require('../models/InscricaoClube');
const Tutor = require('../models/Tutor');
const Candidato = require('../models/Candidato');
const Voto = require('../models/Voto');
const ConfiguracaoProtagonismo = require('../models/ConfiguracaoProtagonismo');

// ============================================
// MIDDLEWARES
// ============================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Token não fornecido.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Token inválido.' });
    }
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.userNome = decoded.nome;
    next();
  });
};

const verificarProtagonismo = (req, res, next) => {
  const allowedRoles = ['protagonismo', 'super_admin', 'admin'];
  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({
      success: false,
      error: 'Acesso permitido apenas para Protagonismo'
    });
  }
  next();
};

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({ success: true, status: 'online', service: 'Protagonismo' });
});

// ============================================
// AUXILIARES - CURSOS E TURMAS
// ============================================
router.get('/cursos', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const cursos = await User.distinct('curso', {
      role: 'aluno',
      ativo: true,
      curso: { $nin: [null, '', 'Não informado'] }
    });
    res.json({ success: true, cursos: cursos.sort() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/turmas', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const turmas = await User.distinct('turma', {
      role: 'aluno',
      ativo: true,
      turma: { $nin: [null, '', 'Não informada'] }
    });
    res.json({ success: true, turmas: turmas.sort() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Buscar alunos por turma (para candidatos)
router.get('/alunos-por-turma', authenticateToken, verificarProtagonismo, async (req, res) => {
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
// CONFIGURAÇÃO
// ============================================
router.get('/configuracao', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const config = await ConfiguracaoProtagonismo.getConfig();
    res.json({ success: true, configuracao: config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/configuracao', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const {
      inscricoesClubesAbertas,
      eleicaoLiderAberta,
      tutoriaVisivel,
      dataAberturaInscricoes,
      dataFechamentoInscricoes,
      dataAberturaEleicao,
      dataFechamentoEleicao,
      avisoPublico
    } = req.body;

    const config = await ConfiguracaoProtagonismo.getConfig();

    if (typeof inscricoesClubesAbertas === 'boolean')
      config.inscricoesClubesAbertas = inscricoesClubesAbertas;
    if (typeof eleicaoLiderAberta === 'boolean')
      config.eleicaoLiderAberta = eleicaoLiderAberta;
    if (typeof tutoriaVisivel === 'boolean')
      config.tutoriaVisivel = tutoriaVisivel;
    if (dataAberturaInscricoes !== undefined)
      config.dataAberturaInscricoes = dataAberturaInscricoes ? new Date(dataAberturaInscricoes) : null;
    if (dataFechamentoInscricoes !== undefined)
      config.dataFechamentoInscricoes = dataFechamentoInscricoes ? new Date(dataFechamentoInscricoes) : null;
    if (dataAberturaEleicao !== undefined)
      config.dataAberturaEleicao = dataAberturaEleicao ? new Date(dataAberturaEleicao) : null;
    if (dataFechamentoEleicao !== undefined)
      config.dataFechamentoEleicao = dataFechamentoEleicao ? new Date(dataFechamentoEleicao) : null;
    if (avisoPublico !== undefined)
      config.avisoPublico = avisoPublico;

    config.atualizadoPor = req.userId;
    config.updatedAt = new Date();

    await config.save();

    res.json({ success: true, message: 'Configuração atualizada', configuracao: config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CLUBES - CRUD
// ============================================
router.get('/clubes', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const clubes = await Clube.find().sort({ nome: 1 });

    const clubesComInfo = await Promise.all(clubes.map(async (c) => {
      const inscricoes = await InscricaoClube.countDocuments({
        clubeId: c._id,
        status: 'ativa'
      });
      return {
        ...c.toObject(),
        vagasRestantes: Math.max(0, c.vagas - inscricoes),
        inscricoesAtivas: inscricoes
      };
    }));

    res.json({ success: true, total: clubes.length, clubes: clubesComInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/clubes/:id', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const clube = await Clube.findById(req.params.id);
    if (!clube) return res.status(404).json({ success: false, error: 'Clube não encontrado' });

    const inscricoes = await InscricaoClube.find({ clubeId: clube._id, status: 'ativa' })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      clube: {
        ...clube.toObject(),
        vagasRestantes: Math.max(0, clube.vagas - inscricoes.length)
      },
      inscricoes
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/clubes', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const { nome, descricao, lider, viceLider, vagas, local, horario, diaSemana, cor, ativo, inscricoesAbertas } = req.body;

    if (!nome || !descricao) {
      return res.status(400).json({ success: false, error: 'Nome e descrição são obrigatórios' });
    }

    const clube = new Clube({
      nome: nome.trim(),
      descricao: descricao.trim(),
      lider: lider || { nome: '', alunoId: null },
      viceLider: viceLider || { nome: '', alunoId: null },
      vagas: parseInt(vagas) || 30,
      local: local || '',
      horario: horario || '',
      diaSemana: diaSemana || '',
      cor: cor || '#f97316',
      ativo: ativo !== false,
      inscricoesAbertas: inscricoesAbertas === true,
      criadoPor: req.userId
    });

    await clube.save();

    res.json({ success: true, message: 'Clube criado com sucesso', clube });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/clubes/:id', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const { nome, descricao, lider, viceLider, vagas, local, horario, diaSemana, cor, ativo, inscricoesAbertas } = req.body;

    const clube = await Clube.findById(req.params.id);
    if (!clube) return res.status(404).json({ success: false, error: 'Clube não encontrado' });

    if (nome) clube.nome = nome.trim();
    if (descricao) clube.descricao = descricao.trim();
    if (lider !== undefined) clube.lider = lider;
    if (viceLider !== undefined) clube.viceLider = viceLider;
    if (vagas !== undefined) clube.vagas = parseInt(vagas);
    if (local !== undefined) clube.local = local;
    if (horario !== undefined) clube.horario = horario;
    if (diaSemana !== undefined) clube.diaSemana = diaSemana;
    if (cor !== undefined) clube.cor = cor;
    if (typeof ativo === 'boolean') clube.ativo = ativo;
    if (typeof inscricoesAbertas === 'boolean') clube.inscricoesAbertas = inscricoesAbertas;

    clube.updatedAt = new Date();
    await clube.save();

    res.json({ success: true, message: 'Clube atualizado', clube });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/clubes/:id', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const clube = await Clube.findById(req.params.id);
    if (!clube) return res.status(404).json({ success: false, error: 'Clube não encontrado' });

    const inscricoes = await InscricaoClube.countDocuments({ clubeId: clube._id, status: 'ativa' });
    if (inscricoes > 0) {
      return res.status(400).json({
        success: false,
        error: `Não é possível excluir: há ${inscricoes} aluno(s) inscrito(s). Cancele as inscrições primeiro.`
      });
    }

    await Clube.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Clube excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// INSCRIÇÕES
// ============================================
router.get('/inscricoes', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const { clubeId, turma, status } = req.query;

    let query = {};
    if (clubeId) query.clubeId = clubeId;
    if (turma) query.turma = turma;
    if (status) query.status = status;

    const inscricoes = await InscricaoClube.find(query)
      .populate('clubeId', 'nome cor')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      total: inscricoes.length,
      inscricoes: inscricoes.map(i => ({
        id: i._id,
        nomeCompleto: i.nomeCompleto,
        dataNascimento: i.dataNascimento,
        curso: i.curso,
        turma: i.turma,
        clubeNome: i.clubeId?.nome || i.clubeNome,
        clubeCor: i.clubeId?.cor || '#f97316',
        status: i.status,
        createdAt: i.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/inscricoes/:id', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const inscricao = await InscricaoClube.findById(req.params.id);
    if (!inscricao) return res.status(404).json({ success: false, error: 'Inscrição não encontrada' });

    // Libera a vaga
    if (inscricao.status === 'ativa') {
      await Clube.decrementarVaga(inscricao.clubeId);
    }

    await InscricaoClube.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Inscrição excluída' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// TUTORIA
// ============================================
router.get('/tutores', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const { turma } = req.query;
    let query = {};
    if (turma) query.turma = turma;

    const tutores = await Tutor.find(query).sort({ turma: 1, nomeProfessor: 1 });

    // Agrupar por turma
    const porTurma = {};
    tutores.forEach(t => {
      if (!porTurma[t.turma]) porTurma[t.turma] = [];
      porTurma[t.turma].push(t);
    });

    res.json({
      success: true,
      total: tutores.length,
      tutores,
      porTurma
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/tutores', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const { nomeProfessor, area, curso, turma, observacoes } = req.body;

    if (!nomeProfessor || !area || !curso || !turma) {
      return res.status(400).json({
        success: false,
        error: 'Nome, área, curso e turma são obrigatórios'
      });
    }

    // Verifica limite de 2 por turma
    const total = await Tutor.contarTutoresTurma(turma);
    if (total >= 2) {
      return res.status(400).json({
        success: false,
        error: `Limite de 2 tutores por turma já foi atingido (${turma})`
      });
    }

    const tutor = new Tutor({
      nomeProfessor: nomeProfessor.trim(),
      area: area.trim(),
      curso,
      turma,
      observacoes: observacoes || '',
      criadoPor: req.userId
    });

    await tutor.save();

    res.json({ success: true, message: 'Tutor cadastrado', tutor });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/tutores/:id', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const { nomeProfessor, area, curso, turma, observacoes, ativo } = req.body;

    const tutor = await Tutor.findById(req.params.id);
    if (!tutor) return res.status(404).json({ success: false, error: 'Tutor não encontrado' });

    // Se mudou de turma, verifica o limite da nova turma
    if (turma && turma !== tutor.turma) {
      const total = await Tutor.contarTutoresTurma(turma);
      if (total >= 2) {
        return res.status(400).json({
          success: false,
          error: `Limite de 2 tutores por turma já foi atingido (${turma})`
        });
      }
    }

    if (nomeProfessor) tutor.nomeProfessor = nomeProfessor.trim();
    if (area) tutor.area = area.trim();
    if (curso) tutor.curso = curso;
    if (turma) tutor.turma = turma;
    if (observacoes !== undefined) tutor.observacoes = observacoes;
    if (typeof ativo === 'boolean') tutor.ativo = ativo;

    tutor.updatedAt = new Date();
    await tutor.save();

    res.json({ success: true, message: 'Tutor atualizado', tutor });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/tutores/:id', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const tutor = await Tutor.findByIdAndDelete(req.params.id);
    if (!tutor) return res.status(404).json({ success: false, error: 'Tutor não encontrado' });
    res.json({ success: true, message: 'Tutor excluído' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CANDIDATOS (LÍDERES E VICE)
// ============================================
router.get('/candidatos', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const { turma, cargo } = req.query;
    let query = {};
    if (turma) query.turma = turma;
    if (cargo) query.cargo = cargo;

    const candidatos = await Candidato.find(query).sort({ turma: 1, cargo: 1, nome: 1 });

    // Agrupar por turma e cargo
    const porTurma = {};
    candidatos.forEach(c => {
      if (!porTurma[c.turma]) porTurma[c.turma] = { lider: [], vice_lider: [] };
      porTurma[c.turma][c.cargo].push(c);
    });

    res.json({
      success: true,
      total: candidatos.length,
      candidatos,
      porTurma
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/candidatos', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const { alunoId, cargo, proposta, slogan } = req.body;

    if (!alunoId || !cargo) {
      return res.status(400).json({ success: false, error: 'Aluno e cargo são obrigatórios' });
    }

    if (!['lider', 'vice_lider'].includes(cargo)) {
      return res.status(400).json({ success: false, error: 'Cargo inválido' });
    }

    const aluno = await User.findById(alunoId);
    if (!aluno || aluno.role !== 'aluno') {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }

    // Verificar duplicata
    const jaExiste = await Candidato.findOne({
      alunoId: aluno._id,
      turma: aluno.turma,
      cargo
    });

    if (jaExiste) {
      return res.status(400).json({
        success: false,
        error: `Este aluno já é candidato a ${cargo === 'lider' ? 'líder' : 'vice-líder'}`
      });
    }

    const candidato = new Candidato({
      alunoId: aluno._id,
      nome: aluno.nome,
      matricula: aluno.matricula || '',
      fotoPerfil: aluno.fotoPerfil || '',
      turma: aluno.turma,
      curso: aluno.curso || '',
      cargo,
      proposta: proposta || '',
      slogan: slogan || '',
      criadoPor: req.userId
    });

    await candidato.save();

    res.json({ success: true, message: 'Candidato cadastrado', candidato });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'Candidato duplicado' });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/candidatos/:id', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const { proposta, slogan, ativo } = req.body;

    const candidato = await Candidato.findById(req.params.id);
    if (!candidato) return res.status(404).json({ success: false, error: 'Candidato não encontrado' });

    if (proposta !== undefined) candidato.proposta = proposta;
    if (slogan !== undefined) candidato.slogan = slogan;
    if (typeof ativo === 'boolean') candidato.ativo = ativo;

    candidato.updatedAt = new Date();
    await candidato.save();

    res.json({ success: true, message: 'Candidato atualizado', candidato });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/candidatos/:id', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const candidato = await Candidato.findByIdAndDelete(req.params.id);
    if (!candidato) return res.status(404).json({ success: false, error: 'Candidato não encontrado' });
    res.json({ success: true, message: 'Candidato excluído' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// RESULTADO DA ELEIÇÃO (APURAÇÃO)
// ============================================
router.get('/eleicao/resultados', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    // Buscar todos os votos agrupados por candidato
    const resultados = await Voto.aggregate([
      {
        $group: {
          _id: '$candidatoId',
          candidatoNome: { $first: '$candidatoNome' },
          cargo: { $first: '$cargo' },
          eleitorTurma: { $first: '$eleitorTurma' },
          totalVotos: { $sum: 1 }
        }
      },
      { $sort: { eleitorTurma: 1, cargo: 1, totalVotos: -1 } }
    ]);

    // Buscar candidatos para pegar dados completos
    const candidatosIds = resultados.map(r => r._id);
    const candidatos = await Candidato.find({ _id: { $in: candidatosIds } });
    const mapaCandidatos = new Map(candidatos.map(c => [c._id.toString(), c]));

    // Montar estrutura por turma
    const porTurma = {};

    resultados.forEach(r => {
      const c = mapaCandidatos.get(r._id.toString());
      if (!c) return;

      if (!porTurma[c.turma]) {
        porTurma[c.turma] = {
          turma: c.turma,
          lider: [],
          vice_lider: [],
          vencedorLider: null,
          vencedorVice: null
        };
      }

      const info = {
        candidatoId: c._id,
        nome: c.nome,
        fotoPerfil: c.fotoPerfil,
        slogan: c.slogan,
        proposta: c.proposta,
        votos: r.totalVotos
      };

      if (c.cargo === 'lider') {
        porTurma[c.turma].lider.push(info);
      } else {
        porTurma[c.turma].vice_lider.push(info);
      }
    });

    // Definir vencedores
    Object.values(porTurma).forEach(t => {
      if (t.lider.length > 0) t.vencedorLider = t.lider[0];
      if (t.vice_lider.length > 0) t.vencedorVice = t.vice_lider[0];
    });

    // Total geral
    const totalVotos = await Voto.countDocuments();

    res.json({
      success: true,
      totalVotos,
      porTurma: Object.values(porTurma).sort((a, b) => a.turma.localeCompare(b.turma))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ESTATÍSTICAS DO DASHBOARD
// ============================================
router.get('/estatisticas', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const [totalClubes, totalTutores, totalCandidatos, totalInscricoes, totalVotos] = await Promise.all([
      Clube.countDocuments({ ativo: true }),
      Tutor.countDocuments({ ativo: true }),
      Candidato.countDocuments({ ativo: true }),
      InscricaoClube.countDocuments({ status: 'ativa' }),
      Voto.countDocuments()
    ]);

    const config = await ConfiguracaoProtagonismo.getConfig();

    // Clubes mais procurados
    const topClubes = await InscricaoClube.aggregate([
      { $match: { status: 'ativa' } },
      { $group: { _id: '$clubeId', clubeNome: { $first: '$clubeNome' }, total: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      success: true,
      estatisticas: {
        totalClubes,
        totalTutores,
        totalCandidatos,
        totalInscricoes,
        totalVotos,
        inscricoesAbertas: config.inscricoesClubesAbertas,
        eleicaoAberta: config.eleicaoLiderAberta
      },
      topClubes
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;