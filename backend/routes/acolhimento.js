// backend/routes/acolhimento.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Acolhedor = require('../models/Acolhedor');
const ConfiguracaoProtagonismo = require('../models/ConfiguracaoProtagonismo');

// ============================================
// MIDDLEWARES
// ============================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ success: false, error: 'Token não fornecido.' });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ success: false, error: 'Token inválido.' });
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.userNome = decoded.nome;
    next();
  });
};

const verificarProtagonismo = (req, res, next) => {
  const allowedRoles = ['protagonismo', 'super_admin', 'admin', 'gestao_geral'];
  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({ success: false, error: 'Acesso permitido apenas para Protagonismo' });
  }
  next();
};

// ============================================
// RATE LIMITING
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
      return res.status(429).json({ success: false, error: 'Muitas tentativas. Aguarde alguns minutos.' });
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
  res.json({ success: true, status: 'online', service: 'Acolhimento' });
});

// ============================================
// ROTAS PÚBLICAS
// ============================================

// Status público (com verificação de datas)
// backend/routes/acolhimento.js

router.get('/status-publico', async (req, res) => {
  try {
    const config = await ConfiguracaoProtagonismo.getConfig();
    const agora = new Date();
    let dentroDoPrazo = true;

    if (config.dataAberturaAcolhimento) {
      const abertura = new Date(config.dataAberturaAcolhimento);
      if (agora < abertura) dentroDoPrazo = false;
    }

    if (config.dataFechamentoAcolhimento) {
      const fechamento = new Date(config.dataFechamentoAcolhimento);
      if (agora > fechamento) dentroDoPrazo = false;
    }

    const acolhimentoAberto = config.acolhimentoAberto === true && dentroDoPrazo;

    let avisoFinal = config.avisoAcolhimento || '';
    if (!acolhimentoAberto && config.acolhimentoAberto === true) {
      if (config.dataAberturaAcolhimento && agora < new Date(config.dataAberturaAcolhimento)) {
        avisoFinal = `As inscrições para acolhedor abrirão em ${new Date(config.dataAberturaAcolhimento).toLocaleString('pt-BR')}.`;
      } else if (config.dataFechamentoAcolhimento && agora > new Date(config.dataFechamentoAcolhimento)) {
        avisoFinal = 'O prazo para se inscrever como acolhedor foi encerrado.';
      }
    }

    // 🆕 Envia as datas formatadas para o frontend
    res.json({
      success: true,
      acolhimentoAberto: acolhimentoAberto,
      avisoAcolhimento: avisoFinal,
      dataAbertura: config.dataAberturaAcolhimento || null,
      dataFechamento: config.dataFechamentoAcolhimento || null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Turmas e cursos
router.get('/publico/turmas-cursos', async (req, res) => {
  try {
    const [turmas, cursos] = await Promise.all([
      User.distinct('turma', { role: 'aluno', ativo: true, turma: { $nin: [null, '', 'Não informada'] } }),
      User.distinct('curso', { role: 'aluno', ativo: true, curso: { $nin: [null, '', 'Não informado'] } })
    ]);
    res.json({ success: true, turmas: turmas.sort(), cursos: cursos.sort() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Buscar alunos
router.get('/publico/alunos', rateLimit(30, 5), async (req, res) => {
  try {
    const config = await ConfiguracaoProtagonismo.getConfig();
    const agora = new Date();
    let dentroDoPrazo = true;
    if (config.dataAberturaAcolhimento && agora < new Date(config.dataAberturaAcolhimento)) dentroDoPrazo = false;
    if (config.dataFechamentoAcolhimento && agora > new Date(config.dataFechamentoAcolhimento)) dentroDoPrazo = false;

    if (!config.acolhimentoAberto || !dentroDoPrazo) {
      return res.status(400).json({ success: false, error: 'O acolhimento está fechado ou fora do prazo.' });
    }

    const { turma, curso, busca } = req.query;
    const query = { role: 'aluno', ativo: true };
    if (turma) query.turma = turma;
    if (curso) query.curso = curso;
    if (busca && busca.trim().length >= 3) query.nome = { $regex: busca.trim(), $options: 'i' };

    const alunos = await User.find(query).select('nome matricula turma curso fotoPerfil').sort({ nome: 1 }).limit(50);

    res.json({
      success: true,
      total: alunos.length,
      alunos: alunos.map(a => ({
        id: a._id, nome: a.nome, matricula: a.matricula || '',
        turma: a.turma || '', curso: a.curso || '', fotoPerfil: a.fotoPerfil || ''
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Inscrever-se como acolhedor
router.post('/publico/inscrever', rateLimit(5, 5), async (req, res) => {
  try {
    const config = await ConfiguracaoProtagonismo.getConfig();
    const agora = new Date();
    let dentroDoPrazo = true;
    if (config.dataAberturaAcolhimento && agora < new Date(config.dataAberturaAcolhimento)) dentroDoPrazo = false;
    if (config.dataFechamentoAcolhimento && agora > new Date(config.dataFechamentoAcolhimento)) dentroDoPrazo = false;

    if (!config.acolhimentoAberto || !dentroDoPrazo) {
      return res.status(400).json({ success: false, error: 'As inscrições de acolhedores estão fechadas ou fora do prazo.' });
    }

    const {
      alunoId, nomeCompleto, dataNascimento, matricula, turma, curso, fotoPerfil,
      email, telefone, whatsapp,
      menorDeIdade, responsavelNome, responsavelTelefone, responsavelParentesco,
      porqueSerAcolhedor, disponibilidade,
      aceitaTermos, aceitaLgpd,
      assinaturaAluno, assinaturaResponsavel
    } = req.body;

    if (!nomeCompleto || !dataNascimento || !turma || !curso) {
      return res.status(400).json({ success: false, error: 'Nome, data de nascimento, turma e curso são obrigatórios.' });
    }
    if (!aceitaTermos || !aceitaLgpd) {
      return res.status(400).json({ success: false, error: 'É necessário aceitar os termos e a LGPD.' });
    }
    if (!assinaturaAluno) {
      return res.status(400).json({ success: false, error: 'A assinatura do aluno é obrigatória.' });
    }

    const dataNasc = new Date(dataNascimento);
    if (isNaN(dataNasc.getTime())) return res.status(400).json({ success: false, error: 'Data de nascimento inválida.' });

    const hoje = new Date();
    const idade = Math.floor((hoje - dataNasc) / (365.25 * 24 * 60 * 60 * 1000));
    if (idade < 10 || idade > 100) return res.status(400).json({ success: false, error: 'Data inválida.' });

    const ehMenor = idade < 18 || menorDeIdade === true;
    if (ehMenor) {
      if (!responsavelNome || !responsavelTelefone) {
        return res.status(400).json({ success: false, error: 'Para menores, os dados do responsável são obrigatórios.' });
      }
      if (!assinaturaResponsavel) {
        return res.status(400).json({ success: false, error: 'A assinatura do responsável é obrigatória.' });
      }
    }

    if (alunoId) {
      const ja = await Acolhedor.jaInscrito(alunoId);
      if (ja) return res.status(400).json({ success: false, error: `Você já possui uma inscrição (${Acolhedor.getStatusLabel(ja.status)}).` });
    } else {
      const jaNome = await Acolhedor.findOne({
        nomeCompleto: { $regex: new RegExp(`^${nomeCompleto.trim()}$`, 'i') },
        dataNascimento: dataNasc, turma, status: { $in: ['pendente', 'aprovado'] }
      });
      if (jaNome) return res.status(400).json({ success: false, error: 'Já existe uma inscrição com esses dados.' });
    }

    const acolhedor = new Acolhedor({
      alunoId: alunoId || null, nomeCompleto: nomeCompleto.trim(), dataNascimento: dataNasc,
      matricula: matricula || '', turma, curso, fotoPerfil: fotoPerfil || '',
      email: email || '', telefone: telefone || '', whatsapp: whatsapp || '',
      menorDeIdade: ehMenor, responsavelNome: responsavelNome || '', responsavelTelefone: responsavelTelefone || '',
      responsavelParentesco: responsavelParentesco || '', porqueSerAcolhedor: porqueSerAcolhedor || '',
      disponibilidade: Array.isArray(disponibilidade) ? disponibilidade : [],
      aceitaTermos: true, aceitaLgpd: true,
      assinatura: { aluno: assinaturaAluno, responsavel: assinaturaResponsavel || '', dataAssinatura: new Date() },
      status: 'pendente', origem: 'publico',
      ipRegistro: req.ip || req.headers['x-forwarded-for'] || '', userAgent: req.headers['user-agent'] || ''
    });

    await acolhedor.save();
    res.json({ success: true, message: 'Inscrição enviada!', acolhedor: { id: acolhedor._id, nomeCompleto: acolhedor.nomeCompleto, turma: acolhedor.turma, curso: acolhedor.curso, status: acolhedor.status, createdAt: acolhedor.createdAt } });
  } catch (error) {
    console.error('Erro ao inscrever:', error);
    res.status(500).json({ success: false, error: 'Erro ao processar inscrição.' });
  }
});

// Consultar status
router.post('/publico/consultar', rateLimit(20, 5), async (req, res) => {
  try {
    const { nomeCompleto, dataNascimento } = req.body;
    if (!nomeCompleto || !dataNascimento) return res.status(400).json({ success: false, error: 'Nome e data são obrigatórios.' });

    const dataNasc = new Date(dataNascimento);
    if (isNaN(dataNasc.getTime())) return res.status(400).json({ success: false, error: 'Data inválida.' });

    const acolhedor = await Acolhedor.findOne({
      nomeCompleto: { $regex: new RegExp(`^${nomeCompleto.trim()}$`, 'i') },
      dataNascimento: dataNasc
    }).sort({ createdAt: -1 });

    if (!acolhedor) return res.json({ success: true, inscrito: false });

    res.json({
      success: true, inscrito: true,
      acolhedor: { id: acolhedor._id, nomeCompleto: acolhedor.nomeCompleto, turma: acolhedor.turma, curso: acolhedor.curso, status: acolhedor.status, statusLabel: Acolhedor.getStatusLabel(acolhedor.status), motivoRejeicao: acolhedor.motivoRejeicao, createdAt: acolhedor.createdAt }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ROTAS AUTENTICADAS
// ============================================
router.get('/', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const { status, turma, curso, busca, limit = 300 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (turma) query.turma = turma;
    if (curso) query.curso = curso;
    if (busca) query.$or = [{ nomeCompleto: { $regex: busca, $options: 'i' } }, { matricula: { $regex: busca, $options: 'i' } }];

    const acolhedores = await Acolhedor.find(query).sort({ createdAt: -1 }).limit(parseInt(limit));

    res.json({
      success: true, total: acolhedores.length,
      acolhedores: acolhedores.map(a => ({
        id: a._id, alunoId: a.alunoId, nomeCompleto: a.nomeCompleto, dataNascimento: a.dataNascimento, matricula: a.matricula, turma: a.turma, curso: a.curso, fotoPerfil: a.fotoPerfil, email: a.email, telefone: a.telefone, whatsapp: a.whatsapp, menorDeIdade: a.menorDeIdade, responsavelNome: a.responsavelNome, responsavelTelefone: a.responsavelTelefone, responsavelParentesco: a.responsavelParentesco, porqueSerAcolhedor: a.porqueSerAcolhedor, disponibilidade: a.disponibilidade, aceitaTermos: a.aceitaTermos, aceitaLgpd: a.aceitaLgpd, assinatura: a.assinatura, status: a.status, statusLabel: Acolhedor.getStatusLabel(a.status), aprovadoPorNome: a.aprovadoPorNome, aprovadoEm: a.aprovadoEm, motivoRejeicao: a.motivoRejeicao, origem: a.origem, createdAt: a.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/estatisticas', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const [total, pendentes, aprovados, rejeitados, porTurma] = await Promise.all([
      Acolhedor.countDocuments(),
      Acolhedor.countDocuments({ status: 'pendente' }),
      Acolhedor.countDocuments({ status: 'aprovado' }),
      Acolhedor.countDocuments({ status: 'rejeitado' }),
      Acolhedor.aggregate([{ $match: { status: 'aprovado' } }, { $group: { _id: '$turma', total: { $sum: 1 } } }, { $sort: { total: -1 } }])
    ]);
    res.json({ success: true, estatisticas: { total, pendentes, aprovados, rejeitados, porTurma } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/:id', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const acolhedor = await Acolhedor.findById(req.params.id);
    if (!acolhedor) return res.status(404).json({ success: false, error: 'Acolhedor não encontrado' });
    res.json({ success: true, acolhedor });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const {
      alunoId, nomeCompleto, dataNascimento, matricula, turma, curso, fotoPerfil,
      email, telefone, whatsapp,
      menorDeIdade, responsavelNome, responsavelTelefone, responsavelParentesco,
      porqueSerAcolhedor, disponibilidade,
      aceitaTermos, aceitaLgpd,
      assinaturaAluno, assinaturaResponsavel
    } = req.body;

    if (!nomeCompleto || !dataNascimento || !turma || !curso) {
      return res.status(400).json({ success: false, error: 'Nome, data de nascimento, turma e curso são obrigatórios.' });
    }

    const dataNasc = new Date(dataNascimento);
    if (isNaN(dataNasc.getTime())) return res.status(400).json({ success: false, error: 'Data inválida.' });

    if (alunoId) {
      const ja = await Acolhedor.jaInscrito(alunoId);
      if (ja) return res.status(400).json({ success: false, error: `Este aluno já possui inscrição (${Acolhedor.getStatusLabel(ja.status)}).` });
    }

    const acolhedor = new Acolhedor({
      alunoId: alunoId || null, nomeCompleto: nomeCompleto.trim(), dataNascimento: dataNasc,
      matricula: matricula || '', turma, curso, fotoPerfil: fotoPerfil || '',
      email: email || '', telefone: telefone || '', whatsapp: whatsapp || '',
      menorDeIdade: menorDeIdade === true, responsavelNome: responsavelNome || '', responsavelTelefone: responsavelTelefone || '',
      responsavelParentesco: responsavelParentesco || '', porqueSerAcolhedor: porqueSerAcolhedor || '',
      disponibilidade: Array.isArray(disponibilidade) ? disponibilidade : [],
      aceitaTermos: aceitaTermos !== false, aceitaLgpd: aceitaLgpd !== false,
      assinatura: { aluno: assinaturaAluno || '', responsavel: assinaturaResponsavel || '', dataAssinatura: (assinaturaAluno || assinaturaResponsavel) ? new Date() : null },
      status: 'pendente', origem: 'painel',
      ipRegistro: req.ip || req.headers['x-forwarded-for'] || '', userAgent: req.headers['user-agent'] || ''
    });

    await acolhedor.save();
    res.json({ success: true, message: 'Acolhedor cadastrado', acolhedor });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/:id', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const acolhedor = await Acolhedor.findById(req.params.id);
    if (!acolhedor) return res.status(404).json({ success: false, error: 'Acolhedor não encontrado' });

    const campos = ['nomeCompleto', 'matricula', 'turma', 'curso', 'fotoPerfil', 'email', 'telefone', 'whatsapp', 'menorDeIdade', 'responsavelNome', 'responsavelTelefone', 'responsavelParentesco', 'porqueSerAcolhedor', 'disponibilidade'];
    campos.forEach(c => { if (req.body[c] !== undefined) acolhedor[c] = req.body[c]; });

    if (req.body.dataNascimento) {
      const d = new Date(req.body.dataNascimento);
      if (!isNaN(d.getTime())) acolhedor.dataNascimento = d;
    }
    if (req.body.assinaturaAluno !== undefined || req.body.assinaturaResponsavel !== undefined) {
      acolhedor.assinatura.aluno = req.body.assinaturaAluno ?? acolhedor.assinatura.aluno;
      acolhedor.assinatura.responsavel = req.body.assinaturaResponsavel ?? acolhedor.assinatura.responsavel;
      acolhedor.assinatura.dataAssinatura = new Date();
    }
    acolhedor.updatedAt = new Date();
    await acolhedor.save();
    res.json({ success: true, message: 'Acolhedor atualizado', acolhedor });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/aprovar', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const acolhedor = await Acolhedor.findById(req.params.id);
    if (!acolhedor) return res.status(404).json({ success: false, error: 'Acolhedor não encontrado' });
    await acolhedor.aprovar(req.userId, req.userNome);
    res.json({ success: true, message: 'Acolhedor aprovado!', acolhedor });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:id/rejeitar', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const acolhedor = await Acolhedor.findById(req.params.id);
    if (!acolhedor) return res.status(404).json({ success: false, error: 'Acolhedor não encontrado' });
    await acolhedor.rejeitar(req.userId, req.userNome, req.body.motivo || '');
    res.json({ success: true, message: 'Acolhedor rejeitado.', acolhedor });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:id', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const acolhedor = await Acolhedor.findByIdAndDelete(req.params.id);
    if (!acolhedor) return res.status(404).json({ success: false, error: 'Acolhedor não encontrado' });
    res.json({ success: true, message: 'Acolhedor excluído' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;