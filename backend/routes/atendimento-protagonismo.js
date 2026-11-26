// backend/routes/atendimento-protagonismo.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RegistroAtendimentoProtagonismo = require('../models/RegistroAtendimentoProtagonismo');

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
    return res.status(403).json({ success: false, error: 'Acesso negado.' });
  }
  next();
};

// ============================================
// HELPERS DE DATA
// ============================================
function inicioDoDia(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function fimDoDia(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function inicioDaSemana(d) {
  // Segunda-feira como início da semana
  const x = inicioDoDia(d);
  const dia = x.getDay(); // 0=dom, 1=seg...
  const diff = dia === 0 ? 6 : dia - 1;
  x.setDate(x.getDate() - diff);
  return x;
}
function inicioDoMes(d) {
  const x = new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), 1, 0, 0, 0, 0);
}

// ============================================
// LISTAR TURMAS DISPONÍVEIS (para o select)
// ============================================
router.get('/turmas', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const turmas = await User.distinct('turma', { role: 'aluno', ativo: true });
    const turmasValidas = (turmas || [])
      .filter(t => t && String(t).trim() !== '')
      .map(t => String(t).trim())
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));

    res.json({ success: true, turmas: turmasValidas });
  } catch (error) {
    console.error('[atendimento-protagonismo/turmas]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// LISTAR CURSOS DISPONÍVEIS (para o select)
// ============================================
router.get('/cursos', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const cursos = await User.distinct('curso', { role: 'aluno', ativo: true });
    const cursosValidos = (cursos || [])
      .filter(c => c && String(c).trim() !== '')
      .map(c => String(c).trim())
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));

    res.json({ success: true, cursos: cursosValidos });
  } catch (error) {
    console.error('[atendimento-protagonismo/cursos]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// BUSCAR ALUNOS (Para o Autocomplete — legado, mantido)
// ============================================
router.get('/buscar-alunos', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const { termoBusca } = req.query;
    let query = { role: 'aluno', ativo: true };

    if (termoBusca && termoBusca.trim().length >= 3) {
      query.$or = [
        { nome: { $regex: termoBusca.trim(), $options: 'i' } },
        { matricula: { $regex: termoBusca.trim(), $options: 'i' } }
      ];
    }

    const alunos = await User.find(query)
      .select('nome matricula turma curso fotoPerfil')
      .limit(20)
      .sort({ nome: 1 });

    res.json({ success: true, alunos });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// BUSCAR ALUNOS POR TURMA / CURSO / TERMO
// ============================================
router.get('/alunos-por-turma', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const { turma, curso, termo } = req.query;

    const query = { role: 'aluno', ativo: true };

    if (turma && String(turma).trim() !== '') {
      query.turma = String(turma).trim();
    }
    if (curso && String(curso).trim() !== '') {
      query.curso = String(curso).trim();
    }
    if (termo && String(termo).trim().length >= 2) {
      const regex = new RegExp(String(termo).trim(), 'i');
      query.$or = [
        { nome: regex },
        { matricula: regex }
      ];
    }

    const alunos = await User.find(query)
      .select('nome matricula turma curso fotoPerfil')
      .sort({ nome: 1 })
      .limit(500)
      .lean();

    res.json({ success: true, alunos });
  } catch (error) {
    console.error('[atendimento-protagonismo/alunos-por-turma]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// REGISTRAR ATENDIMENTO
// ============================================
router.post('/registrar', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const {
      alunoId, alunoNome, alunoMatricula, alunoTurma, alunoCurso,
      dataAtendimento, categoriaAtendimento, categoriaOutrosDescricao,
      motivoPrincipal, encaminhamentoRealizado, observacoesAdicionais,
      assinaturaDigitalBase64, assinadoPorNome
    } = req.body;

    if (!alunoNome || !dataAtendimento || !categoriaAtendimento || !motivoPrincipal) {
      return res.status(400).json({ success: false, error: 'Preencha os campos obrigatórios.' });
    }

    // Gerar Código (Ex: ATP-20261126-001)
    const dataStr = new Date(dataAtendimento).toISOString().slice(0, 10).replace(/-/g, '');
    const countHoje = await RegistroAtendimentoProtagonismo.countDocuments({
      dataAtendimento: {
        $gte: inicioDoDia(dataAtendimento),
        $lte: fimDoDia(dataAtendimento)
      }
    });
    const codigoProtocolo = `ATP-${dataStr}-${String(countHoje + 1).padStart(3, '0')}`;

    const registro = new RegistroAtendimentoProtagonismo({
      codigoProtocolo,
      registradoPor: req.userId,
      registradoPorNome: req.userNome,
      alunoId: alunoId || null,
      alunoNome,
      alunoMatricula: alunoMatricula || '',
      alunoTurma: alunoTurma || '',
      alunoCurso: alunoCurso || '',
      dataAtendimento: new Date(dataAtendimento),
      categoriaAtendimento,
      categoriaOutrosDescricao: categoriaAtendimento === 'outros' ? categoriaOutrosDescricao : '',
      motivoPrincipal,
      encaminhamentoRealizado: encaminhamentoRealizado || '',
      observacoesAdicionais: observacoesAdicionais || '',
      assinaturaDigitalBase64: assinaturaDigitalBase64 || null,
      assinadoPorNome: assinadoPorNome || '',
      assinadoEm: assinaturaDigitalBase64 ? new Date() : null
    });

    await registro.save();

    res.json({ success: true, message: 'Atendimento registrado com sucesso!', registro });
  } catch (error) {
    console.error('Erro ao registrar atendimento:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// LISTAR ATENDIMENTOS
// ============================================
router.get('/listar', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const { paginaAtual = 1, limiteRegistros = 15, termoBusca = '', mesReferencia = '' } = req.query;
    const skip = (parseInt(paginaAtual) - 1) * parseInt(limiteRegistros);

    let query = {};

    if (termoBusca) {
      query.$or = [
        { alunoNome: { $regex: termoBusca, $options: 'i' } },
        { codigoProtocolo: { $regex: termoBusca, $options: 'i' } }
      ];
    }

    if (mesReferencia) {
      const [ano, mesNum] = mesReferencia.split('-');
      const inicio = new Date(parseInt(ano), parseInt(mesNum) - 1, 1);
      const fim = new Date(parseInt(ano), parseInt(mesNum), 0, 23, 59, 59);
      query.dataAtendimento = { $gte: inicio, $lte: fim };
    }

    const totalRegistros = await RegistroAtendimentoProtagonismo.countDocuments(query);
    const registros = await RegistroAtendimentoProtagonismo.find(query)
      .sort({ dataAtendimento: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limiteRegistros));

    res.json({
      success: true,
      registros,
      paginacao: {
        paginaAtual: parseInt(paginaAtual),
        limiteRegistros: parseInt(limiteRegistros),
        totalRegistros,
        totalPaginas: Math.ceil(totalRegistros / parseInt(limiteRegistros))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 🆕 DASHBOARD — métricas + séries para os gráficos
// ============================================
router.get('/dashboard', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const agora = new Date();
    const inicioHoje = inicioDoDia(agora);
    const inicioSemana = inicioDaSemana(agora);
    const inicioMes = inicioDoMes(agora);

    // Totais rápidos em paralelo
    const [totalHoje, totalSemana, totalMes, totalGeral] = await Promise.all([
      RegistroAtendimentoProtagonismo.countDocuments({ dataAtendimento: { $gte: inicioHoje } }),
      RegistroAtendimentoProtagonismo.countDocuments({ dataAtendimento: { $gte: inicioSemana } }),
      RegistroAtendimentoProtagonismo.countDocuments({ dataAtendimento: { $gte: inicioMes } }),
      RegistroAtendimentoProtagonismo.countDocuments({})
    ]);

    // Por categoria
    const porCategoriaRaw = await RegistroAtendimentoProtagonismo.aggregate([
      {
        $group: {
          _id: '$categoriaAtendimento',
          total: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } }
    ]);

    // Por mês — últimos 6 meses (incluindo o atual)
    const seisMesesAtras = new Date(agora.getFullYear(), agora.getMonth() - 5, 1);
    const porMesRaw = await RegistroAtendimentoProtagonismo.aggregate([
      { $match: { dataAtendimento: { $gte: seisMesesAtras } } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m', date: '$dataAtendimento' }
          },
          total: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Por turma
    const porTurmaRaw = await RegistroAtendimentoProtagonismo.aggregate([
      { $match: { alunoTurma: { $ne: '', $exists: true } } },
      {
        $group: {
          _id: '$alunoTurma',
          total: { $sum: 1 }
        }
      },
      { $sort: { total: -1 } },
      { $limit: 15 }
    ]);

    // Alunos reincidentes (3+ atendimentos) — prioriza por matrícula; se não tiver, por nome
    const reincidentesRaw = await RegistroAtendimentoProtagonismo.aggregate([
      { $match: { alunoNome: { $ne: '', $exists: true } } },
      {
        $group: {
          _id: {
            alunoMatricula: { $ifNull: ['$alunoMatricula', ''] },
            alunoNome: '$alunoNome'
          },
          alunoNome: { $first: '$alunoNome' },
          alunoTurma: { $first: '$alunoTurma' },
          alunoMatricula: { $first: '$alunoMatricula' },
          total: { $sum: 1 }
        }
      },
      { $match: { total: { $gte: 3 } } },
      { $sort: { total: -1 } },
      { $limit: 20 }
    ]);

    res.json({
      success: true,
      dashboard: {
        totalHoje,
        totalSemana,
        totalMes,
        totalGeral,
        porCategoria: porCategoriaRaw.map(c => ({
          _id: c._id || 'outros',
          total: c.total
        })),
        porMes: porMesRaw.map(m => ({
          _id: m._id,
          total: m.total
        })),
        porTurma: porTurmaRaw.map(t => ({
          _id: t._id,
          total: t.total
        })),
        reincidentes: reincidentesRaw.map(r => ({
          alunoNome: r.alunoNome,
          alunoTurma: r.alunoTurma,
          alunoMatricula: r.alunoMatricula,
          total: r.total
        }))
      }
    });
  } catch (error) {
    console.error('[atendimento-protagonismo/dashboard]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 🆕 RELATÓRIO — lista filtrada, sem paginação (para exportar)
// ============================================
router.get('/relatorio', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const {
      dataInicio = '',
      dataFim = '',
      categoria = '',
      turma = '',
      curso = '',
      busca = ''
    } = req.query;

    const query = {};

    if (dataInicio || dataFim) {
      query.dataAtendimento = {};
      if (dataInicio) query.dataAtendimento.$gte = inicioDoDia(dataInicio);
      if (dataFim) query.dataAtendimento.$lte = fimDoDia(dataFim);
    }

    if (categoria && String(categoria).trim() !== '') {
      query.categoriaAtendimento = String(categoria).trim();
    }
    if (turma && String(turma).trim() !== '') {
      query.alunoTurma = String(turma).trim();
    }
    if (curso && String(curso).trim() !== '') {
      query.alunoCurso = String(curso).trim();
    }
    if (busca && String(busca).trim() !== '') {
      const regex = new RegExp(String(busca).trim(), 'i');
      query.$or = [
        { alunoNome: regex },
        { alunoMatricula: regex },
        { codigoProtocolo: regex }
      ];
    }

    // Limite de segurança para não estourar memória em relatórios gigantes
    const LIMITE_SEGURANCA = 5000;

    const registros = await RegistroAtendimentoProtagonismo.find(query)
      .sort({ dataAtendimento: -1, createdAt: -1 })
      .limit(LIMITE_SEGURANCA)
      .lean();

    res.json({
      success: true,
      registros,
      total: registros.length,
      truncado: registros.length === LIMITE_SEGURANCA
    });
  } catch (error) {
    console.error('[atendimento-protagonismo/relatorio]', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 🆕 DETALHAR ATENDIMENTO (usado pelo "Verificar" e "Editar")
// ============================================
router.get('/detalhar/:id', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const registro = await RegistroAtendimentoProtagonismo.findById(req.params.id);
    if (!registro) return res.status(404).json({ success: false, error: 'Atendimento não encontrado.' });
    res.json({ success: true, registro });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 🆕 ATUALIZAR ATENDIMENTO (Editar)
// ============================================
router.put('/:id', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const {
      alunoNome, alunoMatricula, alunoTurma, alunoCurso,
      dataAtendimento, categoriaAtendimento, categoriaOutrosDescricao,
      motivoPrincipal, encaminhamentoRealizado, observacoesAdicionais,
      assinaturaDigitalBase64, assinadoPorNome
    } = req.body;

    if (!alunoNome || !dataAtendimento || !categoriaAtendimento || !motivoPrincipal) {
      return res.status(400).json({ success: false, error: 'Preencha os campos obrigatórios.' });
    }

    const registro = await RegistroAtendimentoProtagonismo.findById(req.params.id);
    if (!registro) return res.status(404).json({ success: false, error: 'Atendimento não encontrado.' });

    registro.alunoNome = alunoNome;
    registro.alunoMatricula = alunoMatricula || '';
    registro.alunoTurma = alunoTurma || '';
    registro.alunoCurso = alunoCurso || '';
    registro.dataAtendimento = new Date(dataAtendimento);
    registro.categoriaAtendimento = categoriaAtendimento;
    registro.categoriaOutrosDescricao = categoriaAtendimento === 'outros' ? (categoriaOutrosDescricao || '') : '';
    registro.motivoPrincipal = motivoPrincipal;
    registro.encaminhamentoRealizado = encaminhamentoRealizado || '';
    registro.observacoesAdicionais = observacoesAdicionais || '';

    // Assinatura: só atualiza se vier uma nova; se vier null, mantém a existente
    if (assinaturaDigitalBase64) {
      registro.assinaturaDigitalBase64 = assinaturaDigitalBase64;
      registro.assinadoPorNome = assinadoPorNome || registro.assinadoPorNome || 'Aluno';
      registro.assinadoEm = new Date();
    }

    registro.atualizadoEm = new Date();
    registro.atualizadoPor = req.userId;
    registro.atualizadoPorNome = req.userNome;

    await registro.save();

    res.json({ success: true, message: 'Atendimento atualizado com sucesso!', registro });
  } catch (error) {
    console.error('Erro ao atualizar atendimento:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// 🆕 EXCLUIR ATENDIMENTO
// ============================================
router.delete('/:id', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const registro = await RegistroAtendimentoProtagonismo.findByIdAndDelete(req.params.id);
    if (!registro) return res.status(404).json({ success: false, error: 'Atendimento não encontrado.' });
    res.json({ success: true, message: 'Atendimento excluído com sucesso!' });
  } catch (error) {
    console.error('Erro ao excluir atendimento:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// DETALHAR ATENDIMENTO (legado — mantido para compatibilidade)
// ⚠️ Deve ser a ÚLTIMA rota GET /:id para não capturar as demais
// ============================================
router.get('/:id', authenticateToken, verificarProtagonismo, async (req, res) => {
  try {
    const registro = await RegistroAtendimentoProtagonismo.findById(req.params.id);
    if (!registro) return res.status(404).json({ success: false, error: 'Atendimento não encontrado.' });
    res.json({ success: true, registro });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;