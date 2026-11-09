// backend/routes/protagonismo.js
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
const Aniversario = require('../models/Aniversario');
const Notificacao = require('../models/Notificacao');

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
// CANDIDATOS
// ============================================
router.get('/candidatos', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const { turma, cargo } = req.query;
    let query = {};
    if (turma) query.turma = turma;
    if (cargo) query.cargo = cargo;

    const candidatos = await Candidato.find(query).sort({ turma: 1, cargo: 1, nome: 1 });

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
// RESULTADO DA ELEIÇÃO
// ============================================
router.get('/eleicao/resultados', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
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

    const candidatosIds = resultados.map(r => r._id);
    const candidatos = await Candidato.find({ _id: { $in: candidatosIds } });
    const mapaCandidatos = new Map(candidatos.map(c => [c._id.toString(), c]));

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

    Object.values(porTurma).forEach(t => {
      if (t.lider.length > 0) t.vencedorLider = t.lider[0];
      if (t.vice_lider.length > 0) t.vencedorVice = t.vice_lider[0];
    });

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
// ANIVERSÁRIOS
// ============================================

const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// 🔥 Buscar TODOS os perfis do banco
router.get('/aniversarios/buscar-perfis', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const { q, limit = 1000 } = req.query;

    const filtro = { ativo: true };

    if (q && q.trim()) {
      const termo = q.trim();
      filtro.$or = [
        { nome: { $regex: termo, $options: 'i' } },
        { email: { $regex: termo, $options: 'i' } },
        { matricula: { $regex: termo, $options: 'i' } }
      ];
    }

    const usuarios = await User.find(filtro)
      .select('nome email matricula role turma curso fotoPerfil telefone dataNascimento')
      .sort({ nome: 1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      total: usuarios.length,
      usuarios: usuarios.map(u => {
        const dn = u.dataNascimento ? new Date(u.dataNascimento) : null;
        return {
          id: u._id,
          nome: u.nome,
          email: u.email,
          matricula: u.matricula,
          role: u.role,
          turma: u.turma,
          curso: u.curso,
          fotoPerfil: u.fotoPerfil,
          telefone: u.telefone,
          dataNascimento: dn && !isNaN(dn.getTime()) ? dn.toISOString().split('T')[0] : null,
          dia: dn && !isNaN(dn.getTime()) ? dn.getUTCDate() : null,
          mes: dn && !isNaN(dn.getTime()) ? (dn.getUTCMonth() + 1) : null
        };
      })
    });
  } catch (error) {
    console.error('❌ Erro ao buscar perfis:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/aniversarios', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const { mes, busca } = req.query;
    const query = { ativo: true };
    if (mes) query.mes = parseInt(mes);

    let aniversarios = await Aniversario.find(query).sort({ mes: 1, dia: 1, nome: 1 });

    if (busca) {
      const termo = busca.toLowerCase();
      aniversarios = aniversarios.filter(a => a.nome.toLowerCase().includes(termo));
    }

    const porMes = {};
    for (let i = 1; i <= 12; i++) {
      porMes[i] = {
        mes: i,
        nomeMes: NOMES_MESES[i - 1],
        total: 0,
        aniversariantes: []
      };
    }

    aniversarios.forEach(a => {
      porMes[a.mes].aniversariantes.push({
        id: a._id,
        nome: a.nome,
        dia: a.dia,
        mes: a.mes,
        dataNascimento: a.dataNascimento,
        email: a.email,
        telefone: a.telefone,
        turma: a.turma,
        curso: a.curso,
        fotoPerfil: a.fotoPerfil,
        role: a.role,
        origem: a.origem,
        usuarioId: a.usuarioId
      });
      porMes[a.mes].total++;
    });

    Object.values(porMes).forEach(m => {
      m.aniversariantes.sort((a, b) => a.dia - b.dia);
    });

    if (mes) {
      return res.json({
        success: true,
        total: aniversarios.length,
        mes: porMes[parseInt(mes)]
      });
    }

    res.json({
      success: true,
      total: aniversarios.length,
      porMes: Object.values(porMes)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/aniversarios/proximos', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const hoje = new Date();
    const aniversarios = await Aniversario.find({ ativo: true });

    const proximos = aniversarios
      .map(a => {
        const anoAtual = hoje.getFullYear();
        let proxData = new Date(anoAtual, a.mes - 1, a.dia);
        if (proxData < hoje) proxData = new Date(anoAtual + 1, a.mes - 1, a.dia);
        const diasFaltando = Math.ceil((proxData - hoje) / (1000 * 60 * 60 * 24));
        return {
          id: a._id,
          nome: a.nome,
          dia: a.dia,
          mes: a.mes,
          nomeMes: NOMES_MESES[a.mes - 1],
          turma: a.turma,
          curso: a.curso,
          fotoPerfil: a.fotoPerfil,
          role: a.role,
          diasFaltando,
          proximaData: proxData
        };
      })
      .filter(a => a.diasFaltando >= 0 && a.diasFaltando <= 60)
      .sort((a, b) => a.diasFaltando - b.diasFaltando)
      .slice(0, 20);

    res.json({ success: true, total: proximos.length, proximos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/aniversarios/sincronizar', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    console.log('🎂 Iniciando sincronização de aniversários...');
    const resultado = await Aniversario.sincronizarDoBanco();

    let mensagem = `Sincronização concluída: `;
    mensagem += `${resultado.criados} criado(s), `;
    mensagem += `${resultado.atualizados} atualizado(s)`;
    if (resultado.ignorados > 0) {
      mensagem += `, ${resultado.ignorados} ignorado(s) (cadastros manuais preservados)`;
    }
    mensagem += ` de ${resultado.total} usuário(s) com data de nascimento.`;

    res.json({
      success: true,
      message: mensagem,
      resultado
    });
  } catch (error) {
    console.error('❌ Erro na sincronização:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/aniversarios', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const { usuarioId, nome, dataNascimento, email, telefone, turma, curso } = req.body;

    if (usuarioId) {
      const user = await User.findById(usuarioId)
        .select('nome email telefone turma curso fotoPerfil dataNascimento role');

      if (!user) {
        return res.status(404).json({ success: false, error: 'Usuário não encontrado' });
      }

      const jaExiste = await Aniversario.findOne({ usuarioId });
      if (jaExiste) {
        return res.status(400).json({
          success: false,
          error: `Já existe um aniversário cadastrado para ${user.nome}`
        });
      }

      const dn = user.dataNascimento || new Date(dataNascimento);
      if (!dn || isNaN(new Date(dn).getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Data de nascimento inválida ou ausente'
        });
      }

      const dataObj = new Date(dn);

      const aniversario = new Aniversario({
        usuarioId: user._id,
        nome: user.nome,
        dataNascimento: dataObj,
        mes: dataObj.getUTCMonth() + 1, // 🔥 Cálculo manual do mês
        dia: dataObj.getUTCDate(),      // 🔥 Cálculo manual do dia
        email: user.email || email || '',
        telefone: user.telefone || telefone || '',
        turma: user.turma || turma || '',
        curso: user.curso || curso || '',
        fotoPerfil: user.fotoPerfil || '',
        role: user.role || 'aluno',
        origem: 'auto',
        criadoPor: req.userId
      });

      await aniversario.save();
      return res.json({
        success: true,
        message: `Aniversário de ${user.nome} cadastrado`,
        aniversario
      });
    }

    if (!nome || !dataNascimento) {
      return res.status(400).json({
        success: false,
        error: 'Nome e data de nascimento são obrigatórios'
      });
    }

    const data = new Date(dataNascimento);
    if (isNaN(data.getTime())) {
      return res.status(400).json({ success: false, error: 'Data de nascimento inválida' });
    }

    const aniversario = new Aniversario({
      nome: nome.trim(),
      dataNascimento: data,
      mes: data.getUTCMonth() + 1, // 🔥 Cálculo manual do mês
      dia: data.getUTCDate(),      // 🔥 Cálculo manual do dia
      email: email || '',
      telefone: telefone || '',
      turma: turma || '',
      curso: curso || '',
      role: 'manual',
      origem: 'manual',
      criadoPor: req.userId
    });

    await aniversario.save();
    res.json({ success: true, message: 'Aniversário cadastrado manualmente', aniversario });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'Este usuário já possui aniversário cadastrado' });
    }
    console.error('Erro ao salvar aniversário:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/aniversarios/:id', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const { nome, dataNascimento, email, telefone, turma, curso, ativo } = req.body;
    const aniversario = await Aniversario.findById(req.params.id);
    if (!aniversario) return res.status(404).json({ success: false, error: 'Aniversário não encontrado' });

    if (nome) aniversario.nome = nome.trim();
    if (dataNascimento) {
      const data = new Date(dataNascimento);
      aniversario.dataNascimento = data;
      aniversario.mes = data.getUTCMonth() + 1; // 🔥 Cálculo manual do mês
      aniversario.dia = data.getUTCDate();      // 🔥 Cálculo manual do dia
    }
    if (email !== undefined) aniversario.email = email;
    if (telefone !== undefined) aniversario.telefone = telefone;
    if (turma !== undefined) aniversario.turma = turma;
    if (curso !== undefined) aniversario.curso = curso;
    if (typeof ativo === 'boolean') aniversario.ativo = ativo;

    aniversario.origem = 'manual';
    await aniversario.save();

    res.json({ success: true, message: 'Aniversário atualizado', aniversario });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/aniversarios/:id', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const aniversario = await Aniversario.findByIdAndDelete(req.params.id);
    if (!aniversario) return res.status(404).json({ success: false, error: 'Aniversário não encontrado' });
    res.json({ success: true, message: 'Aniversário removido' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/aniversarios/configuracao', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const config = await ConfiguracaoProtagonismo.getConfig();
    res.json({ success: true, aniversarios: config.aniversarios || {} });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/aniversarios/configuracao', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const {
      avisarNoDia, avisarAntecedencia, minutosAntecedencia, horarioEnvioNoDia,
      notificarAniversariante, notificarProtagonistas, notificarAdmins,
      enviarEmail, mensagemPadrao
    } = req.body;

    const config = await ConfiguracaoProtagonismo.getConfig();
    if (!config.aniversarios) config.aniversarios = {};

    if (typeof avisarNoDia === 'boolean') config.aniversarios.avisarNoDia = avisarNoDia;
    if (typeof avisarAntecedencia === 'boolean') config.aniversarios.avisarAntecedencia = avisarAntecedencia;
    if (minutosAntecedencia !== undefined) config.aniversarios.minutosAntecedencia = parseInt(minutosAntecedencia);
    if (horarioEnvioNoDia !== undefined) config.aniversarios.horarioEnvioNoDia = horarioEnvioNoDia;
    if (typeof notificarAniversariante === 'boolean') config.aniversarios.notificarAniversariante = notificarAniversariante;
    if (typeof notificarProtagonistas === 'boolean') config.aniversarios.notificarProtagonistas = notificarProtagonistas;
    if (typeof notificarAdmins === 'boolean') config.aniversarios.notificarAdmins = notificarAdmins;
    if (typeof enviarEmail === 'boolean') config.aniversarios.enviarEmail = enviarEmail;
    if (mensagemPadrao !== undefined) config.aniversarios.mensagemPadrao = mensagemPadrao;

    config.markModified('aniversarios');
    config.atualizadoPor = req.userId;
    config.updatedAt = new Date();
    await config.save();

    res.json({ success: true, message: 'Configuração de aniversários salva', aniversarios: config.aniversarios });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/aniversarios/testar', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const { aniversarioId } = req.body;
    const aniversario = await Aniversario.findById(aniversarioId);
    if (!aniversario) return res.status(404).json({ success: false, error: 'Aniversário não encontrado' });

    const config = await ConfiguracaoProtagonismo.getConfig();
    const cfg = config.aniversarios || {};
    const mensagem = (cfg.mensagemPadrao || '🎉 Feliz aniversário, {nome}!')
      .replace(/\{nome\}/g, aniversario.nome);

    const notificacoesCriadas = [];

    if (cfg.notificarAniversariante && aniversario.usuarioId) {
      const n = new Notificacao({
        usuarioId: aniversario.usuarioId,
        tipo: 'aniversario',
        titulo: '🎂 Feliz Aniversário! (Teste)',
        mensagem,
        dados: { aniversarioId: aniversario._id, nome: aniversario.nome },
        link: '/editar-perfil.html',
        icone: '🎂',
        cor: '#ec4899',
        prioridade: 5
      });
      await n.save();
      notificacoesCriadas.push(n._id);
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
          titulo: '🎂 Aniversariante do dia (Teste)',
          mensagem: `Hoje é aniversário de ${aniversario.nome}${aniversario.turma ? ` (${aniversario.turma})` : ''}!`,
          dados: { aniversarioId: aniversario._id, nome: aniversario.nome },
          link: '/protagonismo.html',
          icone: '🎂',
          cor: '#ec4899',
          prioridade: 4
        });
        await n.save();
        notificacoesCriadas.push(n._id);
      }
    }

    res.json({
      success: true,
      message: `Teste concluído: ${notificacoesCriadas.length} notificação(ões) criada(s)`,
      total: notificacoesCriadas.length
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
    const [totalClubes, totalTutores, totalCandidatos, totalInscricoes, totalVotos, totalAniversarios] = await Promise.all([
      Clube.countDocuments({ ativo: true }),
      Tutor.countDocuments({ ativo: true }),
      Candidato.countDocuments({ ativo: true }),
      InscricaoClube.countDocuments({ status: 'ativa' }),
      Voto.countDocuments(),
      Aniversario.countDocuments({ ativo: true })
    ]);

    const config = await ConfiguracaoProtagonismo.getConfig();

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
        totalAniversarios,
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