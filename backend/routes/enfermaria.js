const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AtendimentoEnfermaria = require('../models/AtendimentoEnfermaria');
const { descriptografar } = require('../utils/criptografia');

// ============================================
// 🔒 HELPER: MASCARAR DADOS SENSÍVEIS
// ============================================
const MASCARA_TEXTO = '🔒 Conteúdo protegido (visível apenas para o profissional responsável)';
const ROLES_MASCARADOS = ['super_admin'];

function mascararParaAdmin(dados, req) {
  if (!req?.userRole || !ROLES_MASCARADOS.includes(req.userRole)) {
    return dados;
  }
  
  if (Array.isArray(dados)) {
    return dados.map(item => mascararItem(item, req));
  }
  
  return mascararItem(dados, req);
}

function mascararItem(item, req) {
  if (!item) return item;
  
  const obj = item.toObject ? item.toObject() : JSON.parse(JSON.stringify(item));
  
  const adminId = req.userId?.toString();
  const criadorId = (
    obj.entrada?.registradoPor || 
    obj.registradoPorId || 
    obj.criadoPor
  )?.toString();
  
  if (criadorId && adminId && criadorId === adminId) {
    obj._mascarado = false;
    obj._criadoPorMim = true;
    return obj;
  }
  
  obj._mascarado = true;
  obj._criadoPorMim = false;
  
  if (obj.entrada) {
    if (obj.entrada.queixa) obj.entrada.queixa = MASCARA_TEXTO;
    if (obj.entrada.observacoes) obj.entrada.observacoes = MASCARA_TEXTO;
  }
  
  if (obj.queixa) obj.queixa = MASCARA_TEXTO;
  
  if (obj.saida) {
    if (obj.saida.observacoes) obj.saida.observacoes = MASCARA_TEXTO;
  }
  
  return obj;
}

function adminPodeModificar(atendimento, req) {
  if (!ROLES_MASCARADOS.includes(req.userRole)) {
    return { permitido: true };
  }
  
  const adminId = req.userId?.toString();
  const criadorId = atendimento?.entrada?.registradoPor?.toString();
  
  if (criadorId === adminId) {
    return { permitido: true };
  }
  
  return {
    permitido: false,
    motivo: 'Você não pode editar/excluir atendimentos criados por outros profissionais.'
  };
}

// ============================================
// MIDDLEWARES
// ============================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Acesso negado. Token não fornecido.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Token inválido ou expirado.' });
    }
    req.userId = decoded.id;
    req.userRole = decoded.role;
    req.userNome = decoded.nome;
    next();
  });
};

const verificarEnfermaria = (req, res, next) => {
  const allowedRoles = ['enfermaria', 'super_admin', 'admin'];
  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({ success: false, error: 'Acesso permitido apenas para Enfermaria' });
  }
  next();
};

// ============================================
// 🏥 HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({ success: true, status: 'online', service: 'Enfermaria', timestamp: new Date().toISOString() });
});

// ============================================
// 📚 LISTAR TURMAS
// ============================================
router.get('/turmas', authenticateToken, verificarEnfermaria, async (req, res) => {
  try {
    const turmas = await User.distinct('turma', { 
      role: 'aluno', ativo: true, turma: { $nin: [null, '', 'Não informada'] } 
    });
    res.json({ success: true, turmas: turmas.sort() });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao listar turmas: ' + error.message });
  }
});

// ============================================
// 📋 LISTAR ALUNOS POR TURMA
// ============================================
router.get('/alunos-por-turma', authenticateToken, verificarEnfermaria, async (req, res) => {
  try {
    const { turma } = req.query;
    if (!turma) {
      return res.status(400).json({ success: false, error: 'Turma é obrigatória' });
    }
    
    const alunos = await User.find({ role: 'aluno', ativo: true, turma })
      .select('nome matricula turma curso fotoPerfil')
      .sort({ nome: 1 });
    
    res.json({
      success: true,
      total: alunos.length,
      alunos: alunos.map(a => ({
        id: a._id, nome: a.nome, matricula: a.matricula,
        turma: a.turma, curso: a.curso, fotoPerfil: a.fotoPerfil
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao listar alunos: ' + error.message });
  }
});

// ============================================
// 📋 BUSCAR DADOS DO ALUNO POR QR CODE
// ============================================
router.get('/aluno/:id', authenticateToken, verificarEnfermaria, async (req, res) => {
  try {
    const alunoId = req.params.id;
    const aluno = await User.findOne({ _id: alunoId, ativo: true })
      .select('nome email matricula curso turma fotoPerfil role');
    
    if (!aluno) return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    if (aluno.role !== 'aluno') return res.status(400).json({ success: false, error: 'Usuário não é um aluno' });
    
    const emAtendimento = await AtendimentoEnfermaria.alunoEmAtendimento(alunoId);
    const atendimentoAtivo = emAtendimento ? await AtendimentoEnfermaria.getAtendimentoAtivo(alunoId) : null;
    
    res.json({
      success: true,
      aluno: {
        id: aluno._id, nome: aluno.nome, matricula: aluno.matricula,
        turma: aluno.turma, curso: aluno.curso, fotoPerfil: aluno.fotoPerfil || null
      },
      emAtendimento,
      atendimentoAtivo: atendimentoAtivo ? {
        id: atendimentoAtivo._id,
        queixa: atendimentoAtivo.entrada.queixa,
        dataHoraEntrada: atendimentoAtivo.entrada.dataHora,
        status: atendimentoAtivo.status
      } : null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao buscar aluno: ' + error.message });
  }
});

// ============================================
// 📝 REGISTRAR ENTRADA
// ============================================
router.post('/entrada', authenticateToken, verificarEnfermaria, async (req, res) => {
  try {
    const { alunoId, queixa, observacoes, dataEntrada } = req.body;
    
    if (!queixa || queixa.trim() === '') {
      return res.status(400).json({ success: false, error: 'A queixa é obrigatória' });
    }
    
    const aluno = await User.findById(alunoId);
    if (!aluno || aluno.role !== 'aluno') {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }
    
    const emAtendimento = await AtendimentoEnfermaria.alunoEmAtendimento(alunoId);
    if (emAtendimento) {
      return res.status(400).json({ success: false, error: 'Aluno já está em atendimento. Finalize o atendimento atual primeiro.' });
    }
    
    const enfermeiro = await User.findById(req.userId).select('nome');
    
    let dataHoraEntrada = new Date();
    if (dataEntrada) {
      const dataParsed = new Date(dataEntrada);
      if (isNaN(dataParsed.getTime())) {
        return res.status(400).json({ success: false, error: 'Data de entrada inválida' });
      }
      if (dataParsed > new Date()) {
        return res.status(400).json({ success: false, error: 'Data de entrada não pode ser no futuro' });
      }
      dataHoraEntrada = dataParsed;
    }
    
    const atendimento = new AtendimentoEnfermaria({
      alunoId: aluno._id,
      alunoNome: aluno.nome,
      alunoMatricula: aluno.matricula,
      alunoTurma: aluno.turma || 'Não informada',
      alunoCurso: aluno.curso || 'Não informado',
      alunoFoto: aluno.fotoPerfil,
      entrada: {
        dataHora: dataHoraEntrada,
        queixa: queixa.trim(),
        observacoes: observacoes || '',
        registradoPor: req.userId,
        registradoPorNome: enfermeiro?.nome || req.userNome || 'Enfermeiro'
      },
      status: 'em_atendimento'
    });
    
    await atendimento.save();
    
    res.json({
      success: true,
      message: `Atendimento registrado para ${aluno.nome}`,
      atendimento: {
        id: atendimento._id, status: atendimento.status,
        queixa: atendimento.entrada.queixa, dataHora: atendimento.entrada.dataHora
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao registrar atendimento: ' + error.message });
  }
});

// ============================================
// 📤 REGISTRAR SAÍDA
// ============================================
router.post('/saida', authenticateToken, verificarEnfermaria, async (req, res) => {
  try {
    const { 
      alunoId, 
      desfecho, 
      desfechoOutrosTexto, 
      coordenadorPatioNome, 
      observacoes,
      dataSaida
    } = req.body;
    
    const desfechosValidos = ['retornou_sala', 'encaminhado_gestao', 'liberado_responsavel', 'liberado_coordenador', 'outros'];
    if (!desfechosValidos.includes(desfecho)) {
      return res.status(400).json({ success: false, error: 'Desfecho inválido' });
    }
    
    if (desfecho === 'outros' && (!desfechoOutrosTexto || desfechoOutrosTexto.trim() === '')) {
      return res.status(400).json({ success: false, error: 'Descreva o desfecho no campo "outros"' });
    }
    
    const atendimento = await AtendimentoEnfermaria.findOne({ alunoId, status: 'em_atendimento' });
    if (!atendimento) {
      return res.status(404).json({ success: false, error: 'Nenhum atendimento ativo encontrado' });
    }
    
    let dataHoraSaida = new Date();
    if (dataSaida) {
      const dataParsed = new Date(dataSaida);
      if (isNaN(dataParsed.getTime())) {
        return res.status(400).json({ success: false, error: 'Data de saída inválida' });
      }
      if (dataParsed > new Date()) {
        return res.status(400).json({ success: false, error: 'Data de saída não pode ser no futuro' });
      }
      if (dataParsed < new Date(atendimento.entrada.dataHora)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Data de saída não pode ser anterior à data de entrada' 
        });
      }
      dataHoraSaida = dataParsed;
    }
    
    const enfermeiro = await User.findById(req.userId).select('nome');
    
    atendimento.saida = {
      dataHora: dataHoraSaida,
      desfecho,
      desfechoOutrosTexto: desfecho === 'outros' ? desfechoOutrosTexto : undefined,
      coordenadorPatioNome: desfecho === 'liberado_coordenador' ? coordenadorPatioNome : undefined,
      observacoes: observacoes || '',
      registradoPor: req.userId,
      registradoPorNome: enfermeiro?.nome || req.userNome || 'Enfermeiro'
    };
    atendimento.status = 'finalizado';
    atendimento.updatedAt = new Date();
    
    await atendimento.save();
    
    const desfechoTexto = {
      'retornou_sala': 'Retornou para Sala de Aula',
      'encaminhado_gestao': 'Encaminhado para Gestão Geral',
      'liberado_responsavel': 'Liberado com o Responsável',
      'liberado_coordenador': `Liberado com o Coordenador de Pátio${coordenadorPatioNome ? ` (${coordenadorPatioNome})` : ''}`,
      'outros': `Outros: ${desfechoOutrosTexto}`
    }[desfecho];
    
    res.json({
      success: true,
      message: `Atendimento finalizado para ${atendimento.alunoNome}. Desfecho: ${desfechoTexto}`,
      atendimento: {
        id: atendimento._id, 
        status: atendimento.status,
        desfecho: desfechoTexto, 
        dataHoraSaida: atendimento.saida.dataHora
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao registrar saída: ' + error.message });
  }
});

// ============================================
// 📋 BUSCAR ATENDIMENTO POR ID (🔒 MASCARADO)
// ============================================
router.get('/atendimento/:id', authenticateToken, verificarEnfermaria, async (req, res) => {
  try {
    const atendimento = await AtendimentoEnfermaria.findById(req.params.id);
    
    if (!atendimento) {
      return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    }
    
    const desfechoTexto = atendimento.saida?.desfecho ? {
      'retornou_sala': 'Retornou para Sala de Aula',
      'encaminhado_gestao': 'Encaminhado para Gestão Geral',
      'liberado_responsavel': 'Liberado com o Responsável',
      'liberado_coordenador': `Liberado com Coordenador${atendimento.saida?.coordenadorPatioNome ? ` (${atendimento.saida.coordenadorPatioNome})` : ''}`,
      'outros': `Outros: ${atendimento.saida?.desfechoOutrosTexto || ''}`
    }[atendimento.saida.desfecho] : null;
    
    const payload = {
      id: atendimento._id,
      alunoId: atendimento.alunoId,
      alunoNome: atendimento.alunoNome,
      alunoMatricula: atendimento.alunoMatricula,
      alunoTurma: atendimento.alunoTurma,
      alunoCurso: atendimento.alunoCurso,
      alunoFoto: atendimento.alunoFoto,
      status: atendimento.status,
      entrada: {
        dataHora: atendimento.entrada.dataHora,
        dataHoraFormatada: new Date(atendimento.entrada.dataHora).toLocaleString('pt-BR'),
        queixa: atendimento.entrada.queixa,
        observacoes: atendimento.entrada.observacoes,
        registradoPor: atendimento.entrada.registradoPor,
        registradoPorNome: atendimento.entrada.registradoPorNome,
        editadoEm: atendimento.entrada.editadoEm,
        editadoPorNome: atendimento.entrada.editadoPorNome
      },
      saida: atendimento.saida ? {
        dataHora: atendimento.saida.dataHora,
        dataHoraFormatada: new Date(atendimento.saida.dataHora).toLocaleString('pt-BR'),
        desfecho: atendimento.saida.desfecho,
        desfechoTexto,
        desfechoOutrosTexto: atendimento.saida.desfechoOutrosTexto,
        coordenadorPatioNome: atendimento.saida.coordenadorPatioNome,
        observacoes: atendimento.saida.observacoes,
        registradoPorNome: atendimento.saida.registradoPorNome
      } : null,
      createdAt: atendimento.createdAt,
      updatedAt: atendimento.updatedAt
    };

    // 🔒 MASCARAR PARA SUPER_ADMIN
    const payloadMascarado = mascararParaAdmin(payload, req);
    
    res.json({
      success: true,
      atendimento: payloadMascarado
    });
  } catch (error) {
    console.error('Erro ao buscar atendimento:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar atendimento: ' + error.message });
  }
});

// ============================================
// ✏️ EDITAR ATENDIMENTO (🚫 BLOQUEIO PARA SUPER_ADMIN)
// ============================================
router.put('/atendimento/:id', authenticateToken, verificarEnfermaria, async (req, res) => {
  try {
    const { 
      queixa, 
      observacoes, 
      dataEntrada,
      dataSaida,
      desfecho,
      desfechoOutrosTexto,
      coordenadorPatioNome,
      observacoesSaida
    } = req.body;
    
    const atendimento = await AtendimentoEnfermaria.findById(req.params.id);
    
    if (!atendimento) {
      return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    }

    // 🚫 BLOQUEIO: super_admin só edita os que ele mesmo criou
    const check = adminPodeModificar(atendimento, req);
    if (!check.permitido) {
      return res.status(403).json({ 
        success: false, 
        error: check.motivo,
        code: 'ADMIN_NAO_CRIADOR'
      });
    }
    
    if (!queixa || queixa.trim() === '') {
      return res.status(400).json({ success: false, error: 'A queixa é obrigatória' });
    }
    
    const enfermeiro = await User.findById(req.userId).select('nome');
    const agora = new Date();
    
    if (dataEntrada) {
      const dataParsed = new Date(dataEntrada);
      if (isNaN(dataParsed.getTime())) {
        return res.status(400).json({ success: false, error: 'Data de entrada inválida' });
      }
      if (dataParsed > agora) {
        return res.status(400).json({ success: false, error: 'Data de entrada não pode ser no futuro' });
      }
      atendimento.entrada.dataHora = dataParsed;
    }
    
    atendimento.entrada.queixa = queixa.trim();
    atendimento.entrada.observacoes = observacoes || '';
    atendimento.entrada.editadoEm = agora;
    atendimento.entrada.editadoPor = req.userId;
    atendimento.entrada.editadoPorNome = enfermeiro?.nome || req.userNome || 'Enfermeiro';
    
    if (atendimento.status === 'finalizado' && atendimento.saida) {
      if (desfecho) {
        const desfechosValidos = ['retornou_sala', 'encaminhado_gestao', 'liberado_responsavel', 'liberado_coordenador', 'outros'];
        if (!desfechosValidos.includes(desfecho)) {
          return res.status(400).json({ success: false, error: 'Desfecho inválido' });
        }
        atendimento.saida.desfecho = desfecho;
        atendimento.saida.desfechoOutrosTexto = desfecho === 'outros' ? desfechoOutrosTexto : undefined;
        atendimento.saida.coordenadorPatioNome = desfecho === 'liberado_coordenador' ? coordenadorPatioNome : undefined;
      }
      
      if (typeof observacoesSaida === 'string') {
        atendimento.saida.observacoes = observacoesSaida;
      }
      
      if (dataSaida) {
        const dataParsed = new Date(dataSaida);
        if (isNaN(dataParsed.getTime())) {
          return res.status(400).json({ success: false, error: 'Data de saída inválida' });
        }
        if (dataParsed > agora) {
          return res.status(400).json({ success: false, error: 'Data de saída não pode ser no futuro' });
        }
        if (dataParsed < new Date(atendimento.entrada.dataHora)) {
          return res.status(400).json({ 
            success: false, 
            error: 'Data de saída não pode ser anterior à data de entrada' 
          });
        }
        atendimento.saida.dataHora = dataParsed;
      }
      
      atendimento.saida.editadoEm = agora;
      atendimento.saida.editadoPor = req.userId;
      atendimento.saida.editadoPorNome = enfermeiro?.nome || req.userNome || 'Enfermeiro';
    }
    
    atendimento.updatedAt = agora;
    await atendimento.save();
    
    res.json({
      success: true,
      message: 'Atendimento atualizado com sucesso',
      atendimento: {
        id: atendimento._id,
        queixa: atendimento.entrada.queixa,
        observacoes: atendimento.entrada.observacoes,
        dataHora: atendimento.entrada.dataHora,
        editadoEm: atendimento.entrada.editadoEm,
        saida: atendimento.saida ? {
          dataHora: atendimento.saida.dataHora,
          desfecho: atendimento.saida.desfecho,
          observacoes: atendimento.saida.observacoes
        } : null
      }
    });
  } catch (error) {
    console.error('Erro ao editar atendimento:', error);
    res.status(500).json({ success: false, error: 'Erro ao editar atendimento: ' + error.message });
  }
});

// ============================================
// 🗑️ EXCLUIR ATENDIMENTO (🚫 BLOQUEIO PARA SUPER_ADMIN)
// ============================================
router.delete('/atendimento/:id', authenticateToken, verificarEnfermaria, async (req, res) => {
  try {
    const atendimento = await AtendimentoEnfermaria.findById(req.params.id);
    
    if (!atendimento) {
      return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    }

    // 🚫 BLOQUEIO: super_admin só exclui os que ele mesmo criou
    const check = adminPodeModificar(atendimento, req);
    if (!check.permitido) {
      return res.status(403).json({ 
        success: false, 
        error: check.motivo,
        code: 'ADMIN_NAO_CRIADOR'
      });
    }
    
    await AtendimentoEnfermaria.findByIdAndDelete(req.params.id);
    
    console.log(`🗑️ Atendimento ${req.params.id} excluído por ${req.userNome || req.userId}`);
    
    res.json({
      success: true,
      message: `Atendimento de ${atendimento.alunoNome} excluído com sucesso`
    });
  } catch (error) {
    console.error('Erro ao excluir atendimento:', error);
    res.status(500).json({ success: false, error: 'Erro ao excluir atendimento: ' + error.message });
  }
});

// ============================================
// 📊 DASHBOARD
// ============================================
// ============================================
// 📊 DASHBOARD
// ============================================
router.get('/dashboard', authenticateToken, verificarEnfermaria, async (req, res) => {
  try {
    const hoje = new Date();
    const hojeStr = hoje.toISOString().split('T')[0];
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    
    const atendimentosHoje = await AtendimentoEnfermaria.countDocuments({
      'entrada.dataHora': {
        $gte: new Date(hojeStr),
        $lt: new Date(new Date(hojeStr).setDate(new Date(hojeStr).getDate() + 1))
      }
    });
    
    const atendimentosSemana = await AtendimentoEnfermaria.countDocuments({ 'entrada.dataHora': { $gte: inicioSemana } });
    const atendimentosMes = await AtendimentoEnfermaria.countDocuments({ 'entrada.dataHora': { $gte: inicioMes } });
    const totalAtendimentos = await AtendimentoEnfermaria.countDocuments();
    
    const ultimos30Dias = new Date();
    ultimos30Dias.setDate(ultimos30Dias.getDate() - 30);
    
    const desfechos = await AtendimentoEnfermaria.aggregate([
      { $match: { 'saida.desfecho': { $exists: true }, 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: '$saida.desfecho', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const ultimos7Dias = [];
    for (let i = 6; i >= 0; i--) {
      const data = new Date();
      data.setDate(data.getDate() - i);
      const dataStr = data.toISOString().split('T')[0];
      const inicio = new Date(dataStr);
      const fim = new Date(dataStr);
      fim.setDate(fim.getDate() + 1);
      
      const count = await AtendimentoEnfermaria.countDocuments({
        'entrada.dataHora': { $gte: inicio, $lt: fim }
      });
      
      ultimos7Dias.push({
        data: dataStr,
        dia: data.toLocaleDateString('pt-BR', { weekday: 'short' }),
        atendimentos: count
      });
    }
    
    const porTurma = await AtendimentoEnfermaria.aggregate([
      { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: '$alunoTurma', count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: 5 }
    ]);
    
    // ============================================
    // 🆕 QUEIXAS COMUNS - DESCRIPTOGRAFADAS
    // ============================================
    const queixasRaw = await AtendimentoEnfermaria.aggregate([
      { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: '$entrada.queixa', count: { $sum: 1 } } },
      { $sort: { count: -1 } }, 
      { $limit: 20 }
    ]);
    
    // 🔓 Descriptografa cada queixa e agrupa as que ficarem iguais
    const queixasMap = new Map();
    queixasRaw.forEach(q => {
      let texto = q._id;
      try {
        texto = descriptografar(q._id);
      } catch (e) {
        // Se falhar, mantém o valor bruto
      }
      
      // Trunca para agrupar queixas parecidas
      const textoChave = (texto || '').substring(0, 50).trim();
      
      if (queixasMap.has(textoChave)) {
        queixasMap.set(textoChave, queixasMap.get(textoChave) + q.count);
      } else {
        queixasMap.set(textoChave, q.count);
      }
    });
    
    // Ordena por count e pega as 5 mais comuns
    const queixasOrdenadas = Array.from(queixasMap.entries())
      .map(([queixa, count]) => ({ queixa, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    // 🔒 MASCARAR para super_admin
    const queixasParaEnviar = ROLES_MASCARADOS.includes(req.userRole)
      ? queixasOrdenadas.map(q => ({
          queixa: '🔒 Conteúdo protegido',
          count: q.count
        }))
      : queixasOrdenadas;
    
    const porHora = await AtendimentoEnfermaria.aggregate([
      { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: { $hour: '$entrada.dataHora' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    const horasDistribuicao = Array(24).fill(0);
    porHora.forEach(h => { horasDistribuicao[h._id] = h.count; });
    
    const tempoMedio = await AtendimentoEnfermaria.aggregate([
      { $match: { 'saida.dataHora': { $exists: true } } },
      { $project: { tempo: { $subtract: ['$saida.dataHora', '$entrada.dataHora'] } } },
      { $group: { _id: null, media: { $avg: '$tempo' } } }
    ]);
    
    const mediaMinutos = tempoMedio.length > 0 ? Math.round(tempoMedio[0].media / 60000) : 0;
    
    res.json({
      success: true,
      periodo: {
        hoje: hojeStr,
        inicioSemana: inicioSemana.toISOString().split('T')[0],
        inicioMes: inicioMes.toISOString().split('T')[0]
      },
      metricas: {
        hoje: atendimentosHoje, semana: atendimentosSemana,
        mes: atendimentosMes, total: totalAtendimentos,
        tempoMedioMinutos: mediaMinutos
      },
      desfechos: desfechos.map(d => ({
        tipo: d._id,
        label: {
          'retornou_sala': 'Retornou à Sala',
          'encaminhado_gestao': 'Encaminhado à Gestão',
          'liberado_responsavel': 'Liberado com Responsável',
          'liberado_coordenador': 'Liberado com Coordenador',
          'outros': 'Outros'
        }[d._id] || d._id,
        count: d.count
      })),
      tendencias: {
        ultimos7Dias,
        porTurma: porTurma.map(t => ({ turma: t._id || 'Sem turma', count: t.count })),
        queixasComuns: queixasParaEnviar,  // 🆕 com mascaramento
        distribuicaoHoraria: horasDistribuicao
      }
    });
  } catch (error) {
    console.error('Erro no dashboard da enfermaria:', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar estatísticas: ' + error.message });
  }
});

// ============================================
// 📊 RELATÓRIO POR ALUNO
// ============================================
router.get('/relatorio/aluno/:alunoId', authenticateToken, verificarEnfermaria, async (req, res) => {
  try {
    const { alunoId } = req.params;
    const { dataInicio, dataFim } = req.query;
    
    let query = { alunoId };
    if (dataInicio || dataFim) {
      query['entrada.dataHora'] = {};
      if (dataInicio) query['entrada.dataHora'].$gte = new Date(dataInicio);
      if (dataFim) query['entrada.dataHora'].$lte = new Date(dataFim + 'T23:59:59');
    }
    
    const atendimentos = await AtendimentoEnfermaria.find(query).sort({ 'entrada.dataHora': -1 });
    const desfechosCount = {};
    const queixasComuns = {};
    
    atendimentos.forEach(a => {
      const desfecho = a.saida?.desfecho || 'em_andamento';
      desfechosCount[desfecho] = (desfechosCount[desfecho] || 0) + 1;
      
      const palavras = a.entrada.queixa.toLowerCase().split(/\s+/);
      palavras.forEach(p => { if (p.length > 3) queixasComuns[p] = (queixasComuns[p] || 0) + 1; });
    });
    
    const aluno = await User.findById(alunoId).select('nome matricula turma curso');
    
    res.json({
      success: true,
      aluno: { id: aluno._id, nome: aluno.nome, matricula: aluno.matricula, turma: aluno.turma, curso: aluno.curso },
      periodo: { dataInicio, dataFim },
      estatisticas: {
        totalAtendimentos: atendimentos.length,
        desfechos: desfechosCount,
        principaisQueixas: Object.entries(queixasComuns).sort((a, b) => b[1] - a[1]).slice(0, 10)
          .map(([palavra, count]) => ({ palavra, count }))
      },
      atendimentos: atendimentos.map(a => ({
        id: a._id,
        dataEntrada: a.entrada.dataHora,
        queixa: a.entrada.queixa,
        observacoesEntrada: a.entrada.observacoes,
        registradoPor: a.entrada.registradoPorNome,
        dataSaida: a.saida?.dataHora || null,
        desfecho: a.saida?.desfecho || 'em_atendimento',
        desfechoTexto: a.saida?.desfecho ? {
          'retornou_sala': 'Retornou para Sala de Aula',
          'encaminhado_gestao': 'Encaminhado para Gestão Geral',
          'liberado_responsavel': 'Liberado com o Responsável',
          'liberado_coordenador': `Liberado com Coordenador${a.saida?.coordenadorPatioNome ? ` (${a.saida.coordenadorPatioNome})` : ''}`,
          'outros': `Outros: ${a.saida?.desfechoOutrosTexto}`
        }[a.saida.desfecho] : 'Em atendimento',
        observacoesSaida: a.saida?.observacoes || '',
        registradoPorSaida: a.saida?.registradoPorNome || null
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao gerar relatório: ' + error.message });
  }
});

// ============================================
// 📊 RELATÓRIO POR TURMA
// ============================================
router.get('/relatorio/turma/:turma', authenticateToken, verificarEnfermaria, async (req, res) => {
  try {
    const { turma } = req.params;
    const { dataInicio, dataFim } = req.query;
    
    let query = { alunoTurma: turma };
    if (dataInicio || dataFim) {
      query['entrada.dataHora'] = {};
      if (dataInicio) query['entrada.dataHora'].$gte = new Date(dataInicio);
      if (dataFim) query['entrada.dataHora'].$lte = new Date(dataFim + 'T23:59:59');
    }
    
    const atendimentos = await AtendimentoEnfermaria.find(query).sort({ 'entrada.dataHora': -1 });
    const porAluno = {};
    
    atendimentos.forEach(a => {
      if (!porAluno[a.alunoId]) {
        porAluno[a.alunoId] = { alunoId: a.alunoId, alunoNome: a.alunoNome, alunoMatricula: a.alunoMatricula, total: 0, desfechos: {} };
      }
      porAluno[a.alunoId].total++;
      const desfecho = a.saida?.desfecho || 'em_andamento';
      porAluno[a.alunoId].desfechos[desfecho] = (porAluno[a.alunoId].desfechos[desfecho] || 0) + 1;
    });
    
    const desfechosCount = {};
    atendimentos.forEach(a => {
      const desfecho = a.saida?.desfecho || 'em_andamento';
      desfechosCount[desfecho] = (desfechosCount[desfecho] || 0) + 1;
    });
    
    res.json({
      success: true,
      turma,
      periodo: { dataInicio, dataFim },
      estatisticas: {
        totalAtendimentos: atendimentos.length,
        totalAlunosAtendidos: Object.keys(porAluno).length,
        desfechos: desfechosCount
      },
      porAluno: Object.values(porAluno).sort((a, b) => b.total - a.total),
      ultimosAtendimentos: atendimentos.slice(0, 50).map(a => ({
        id: a._id, alunoNome: a.alunoNome,
        dataEntrada: a.entrada.dataHora,
        queixa: a.entrada.queixa,
        desfecho: a.saida?.desfecho || 'em_atendimento'
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao gerar relatório: ' + error.message });
  }
});

// ============================================
// 📊 RELATÓRIO GERAL
// ============================================
router.get('/relatorio/geral', authenticateToken, verificarEnfermaria, async (req, res) => {
  try {
    const { dataInicio, dataFim, turma } = req.query;
    
    let query = {};
    if (dataInicio || dataFim) {
      query['entrada.dataHora'] = {};
      if (dataInicio) query['entrada.dataHora'].$gte = new Date(dataInicio);
      if (dataFim) query['entrada.dataHora'].$lte = new Date(dataFim + 'T23:59:59');
    }
    if (turma) query.alunoTurma = turma;
    
    const atendimentos = await AtendimentoEnfermaria.find(query).sort({ 'entrada.dataHora': -1 });
    const porTurma = {};
    
    atendimentos.forEach(a => {
      if (!porTurma[a.alunoTurma]) {
        porTurma[a.alunoTurma] = { turma: a.alunoTurma, total: 0, alunos: new Set(), desfechos: {} };
      }
      porTurma[a.alunoTurma].total++;
      porTurma[a.alunoTurma].alunos.add(a.alunoId.toString());
      const desfecho = a.saida?.desfecho || 'em_andamento';
      porTurma[a.alunoTurma].desfechos[desfecho] = (porTurma[a.alunoTurma].desfechos[desfecho] || 0) + 1;
    });
    
    Object.values(porTurma).forEach(t => { t.totalAlunos = t.alunos.size; delete t.alunos; });
    
    const turmas = await AtendimentoEnfermaria.distinct('alunoTurma');
    
    res.json({
      success: true,
      filtros: { dataInicio, dataFim, turma },
      turmasDisponiveis: turmas.filter(t => t && t !== 'Não informada'),
      totalAtendimentos: atendimentos.length,
      porTurma: Object.values(porTurma).sort((a, b) => b.total - a.total),
      ultimosAtendimentos: atendimentos.slice(0, 30).map(a => ({
        id: a._id, alunoNome: a.alunoNome, alunoTurma: a.alunoTurma,
        dataEntrada: a.entrada.dataHora,
        queixa: a.entrada.queixa.substring(0, 50),
        status: a.status
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao gerar relatório: ' + error.message });
  }
});

// ============================================
// 📋 LISTAR ATENDIMENTOS (COM PAGINAÇÃO + BUSCA NO BACKEND)
// ============================================
router.get('/listar', authenticateToken, verificarEnfermaria, async (req, res) => {
  try {
    const { 
      turma, 
      status, 
      dataInicio, 
      dataFim, 
      busca,         // 🆕 busca por nome/matrícula
      page = 1, 
      limit = 20 
    } = req.query;
    
    let query = {};
    
    // Filtro por turma
    if (turma && turma.trim() !== '') {
      query.alunoTurma = turma;
    }
    
    // Filtro por status
    if (status && status !== 'todos') {
      query.status = status;
    }
    
    // Filtro por período
    if (dataInicio || dataFim) {
      query['entrada.dataHora'] = {};
      if (dataInicio) query['entrada.dataHora'].$gte = new Date(dataInicio);
      if (dataFim) query['entrada.dataHora'].$lte = new Date(dataFim + 'T23:59:59');
    }
    
    // 🆕 BUSCA por nome OU matrícula (no banco, em TODOS os registros)
    if (busca && busca.trim() !== '') {
      const termo = busca.trim();
      query.$or = [
        { alunoNome: { $regex: termo, $options: 'i' } },
        { alunoMatricula: { $regex: termo, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [atendimentos, total] = await Promise.all([
      AtendimentoEnfermaria.find(query)
        .sort({ 'entrada.dataHora': -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      AtendimentoEnfermaria.countDocuments(query)
    ]);
    
    const desfechoLabel = {
      'retornou_sala': 'Retornou à Sala',
      'encaminhado_gestao': 'Encaminhado à Gestão',
      'liberado_responsavel': 'Liberado com Responsável',
      'liberado_coordenador': 'Liberado com Coordenador',
      'outros': 'Outros'
    };
    
    const lista = atendimentos.map(a => ({
      id: a._id,
      alunoId: a.alunoId,
      alunoNome: a.alunoNome,
      alunoMatricula: a.alunoMatricula,
      alunoTurma: a.alunoTurma,
      alunoCurso: a.alunoCurso,
      alunoFoto: a.alunoFoto,
      status: a.status,
      entrada: {
        dataHora: a.entrada?.dataHora,
        dataHoraFormatada: a.entrada?.dataHora 
          ? new Date(a.entrada.dataHora).toLocaleString('pt-BR') 
          : '-',
        queixa: a.entrada?.queixa || '',
        observacoes: a.entrada?.observacoes || '',
        registradoPor: a.entrada?.registradoPor,
        registradoPorNome: a.entrada?.registradoPorNome || '-'
      },
      saida: a.saida ? {
        dataHora: a.saida.dataHora,
        dataHoraFormatada: new Date(a.saida.dataHora).toLocaleString('pt-BR'),
        desfecho: a.saida.desfecho,
        desfechoTexto: desfechoLabel[a.saida.desfecho] || a.saida.desfecho,
        observacoes: a.saida.observacoes || ''
      } : null,
      tempoAtendimento: a.saida?.dataHora 
        ? Math.floor((new Date(a.saida.dataHora) - new Date(a.entrada.dataHora)) / 60000)
        : (a.status === 'em_atendimento' 
            ? Math.floor((new Date() - new Date(a.entrada.dataHora)) / 60000) 
            : 0),
      createdAt: a.createdAt,
      updatedAt: a.updatedAt
    }));

    // 🔒 MASCARAR PARA SUPER_ADMIN
    const listaMascarada = mascararParaAdmin(lista, req);
    
    res.json({
      success: true,
      total,
      paginacao: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
        total
      },
      atendimentos: listaMascarada
    });
  } catch (error) {
    console.error('Erro ao listar atendimentos:', error);
    res.status(500).json({ success: false, error: 'Erro ao listar atendimentos: ' + error.message });
  }
});

// ============================================
// 📋 LISTAR ATENDIMENTOS ATIVOS (🔒 MASCARADO)
// ============================================
router.get('/atendimentos-ativos', authenticateToken, verificarEnfermaria, async (req, res) => {
  try {
    const atendimentos = await AtendimentoEnfermaria.find({ status: 'em_atendimento' }).sort({ 'entrada.dataHora': -1 });
    
    const lista = atendimentos.map(a => ({
      id: a._id,
      alunoId: a.alunoId,
      alunoNome: a.alunoNome,
      alunoTurma: a.alunoTurma,
      alunoFoto: a.alunoFoto,
      queixa: a.entrada.queixa,
      dataHoraEntrada: a.entrada.dataHora,
      tempoAtendimento: Math.floor((new Date() - new Date(a.entrada.dataHora)) / 60000),
      registradoPor: a.entrada.registradoPor,
      registradoPorNome: a.entrada.registradoPorNome,
      _criadorNome: a.entrada?.registradoPorNome || 'Desconhecido',
      entrada: {
        queixa: a.entrada.queixa,
        observacoes: a.entrada.observacoes,
        registradoPor: a.entrada.registradoPor
      }
    }));

    // 🔒 MASCARAR PARA SUPER_ADMIN
    const listaMascarada = mascararParaAdmin(lista, req);
    
    res.json({
      success: true,
      total: listaMascarada.length,
      atendimentos: listaMascarada
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao buscar atendimentos: ' + error.message });
  }
});

module.exports = router;