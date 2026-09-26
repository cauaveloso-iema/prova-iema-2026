// routes/visitas.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const axios = require('axios');

const User = require('../models/User');
const Turma = require('../models/Turma');
const TermoVisita = require('../models/TermoVisita');
const ConfiguracaoVisita = require('../models/ConfiguracaoVisita');
const NotificacaoVisita = require('../models/NotificacaoVisita');

// 🔐 Utilitários de mascaramento (sem criptografia — o schema cuida)
const { mascararCPF, mascararRG, mascararTelefone } = require('../utils/crypto-utils');

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

const verificarPermissaoVisitas = async (req, res, next) => {
  try {
    if (req.userRole === 'super_admin' || req.userRole === 'admin') {
      return next();
    }
    
    try {
      const PermissaoModulo = mongoose.model('PermissaoModulo');
      const user = await User.findById(req.userId).select('email');
      
      if (!user) {
        return res.status(403).json({ success: false, error: 'Usuário não encontrado' });
      }
      
      const permissao = await PermissaoModulo.findOne({
        modulo: 'autorizacao_visitas',
        emailsAutorizados: user.email
      });
      
      if (!permissao && req.userRole !== 'setor_pedagogico') {
        return res.status(403).json({
          success: false,
          error: 'Acesso negado. Você não tem permissão para acessar este módulo.'
        });
      }
    } catch (permError) {
      if (req.userRole !== 'setor_pedagogico') {
        return res.status(403).json({ success: false, error: 'Acesso negado.' });
      }
    }
    
    next();
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ============================================
// HEALTH
// ============================================
router.get('/health', (req, res) => {
  res.json({ success: true, status: 'online', service: 'Autorizacao de Visitas' });
});

// ============================================
// AUXILIARES
// ============================================
router.get('/turmas', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    console.log('🔍 Buscando turmas a partir dos alunos...');
    
    const turmas = await User.distinct('turma', {
      role: 'aluno',
      ativo: true,
      turma: { $nin: [null, '', 'Não informada'] }
    });
    
    let turmasDaCollection = [];
    try {
      const turmasColl = await Turma.find({ ativa: true }).select('nome').lean();
      turmasDaCollection = turmasColl.map(t => t.nome).filter(Boolean);
    } catch (e) {
      console.warn('⚠️ Erro ao buscar da collection Turma:', e.message);
    }
    
    const todasTurmas = [...new Set([...turmas, ...turmasDaCollection])].sort();
    
    console.log(`✅ ${todasTurmas.length} turmas encontradas`);
    
    res.json({ 
      success: true, 
      turmas: todasTurmas.map(nome => ({
        id: nome,
        nome: nome,
        disciplina: '',
        codigo: ''
      })),
      total: todasTurmas.length
    });
  } catch (error) {
    console.error('❌ Erro ao buscar turmas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/cursos', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
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

// Buscar alunos por turma/curso
router.get('/alunos-por-turma', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    const { turma, curso } = req.query;
    
    console.log('🔍 Buscando alunos - Filtros:', { turma, curso });
    
    let query = { role: 'aluno', ativo: true };
    
    if (turma && turma.trim() !== '') {
      query.turma = turma;
    }
    
    if (curso && curso.trim() !== '') {
      query.curso = curso;
    }
    
    const alunos = await User.find(query)
      .select('nome matricula turma curso fotoPerfil email')
      .sort({ nome: 1 })
      .lean();
    
    console.log(`✅ ${alunos.length} alunos encontrados`);
    
    res.json({
      success: true,
      total: alunos.length,
      alunos: alunos.map(a => ({
        id: a._id,
        nome: a.nome,
        matricula: a.matricula || '',
        turma: a.turma || '',
        curso: a.curso || '',
        email: a.email || '',
        fotoPerfil: a.fotoPerfil || null
      }))
    });
  } catch (error) {
    console.error('❌ Erro ao buscar alunos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Buscar professores
router.get('/professores', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    const professores = await User.find({ 
      role: 'professor', 
      ativo: true 
    })
      .select('nome email matricula eixo')
      .sort({ nome: 1 })
      .lean();
    
    console.log(`✅ ${professores.length} professores encontrados`);
    
    res.json({
      success: true,
      professores: professores.map(p => ({
        id: p._id,
        nome: p.nome,
        email: p.email || '',
        matricula: p.matricula || '',
        eixo: p.eixo || ''
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// GEOCODING
// ============================================
router.get('/buscar-localizacao', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    const { query } = req.query;
    if (!query || query.length < 3) {
      return res.status(400).json({ success: false, error: 'Digite pelo menos 3 caracteres' });
    }
    
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: query,
        format: 'json',
        limit: 5,
        addressdetails: 1,
        countrycodes: 'br'
      },
      headers: { 'User-Agent': 'EducaPleno/1.0 (contato@iemasaoluiscentro.net)' },
      timeout: 10000
    });
    
    const resultados = response.data.map(item => ({
      placeId: item.place_id,
      nome: item.display_name.split(',')[0],
      enderecoCompleto: item.display_name,
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
      tipo: item.type,
      cidade: item.address?.city || item.address?.town || item.address?.village || '',
      estado: item.address?.state || '',
      cep: item.address?.postcode || ''
    }));
    
    res.json({ success: true, resultados });
  } catch (error) {
    console.error('❌ Erro ao buscar localização:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CRUD TERMOS
// ============================================

// Listar todos os termos
router.get('/termos', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    const { status, turma, search, page = 1, limit = 20 } = req.query;
    
    let query = { ativo: true };
    
    if (status && status !== 'todos') {
      query.status = status;
    }
    
    if (turma && turma !== 'todas') {
      query.turmaPrincipal = turma;
    }
    
    if (search) {
      query.$or = [
        { 'alunos.nome': { $regex: search, $options: 'i' } },
        { 'alunos.matricula': { $regex: search, $options: 'i' } },
        { codigo: { $regex: search, $options: 'i' } },
        { 'professores.nome': { $regex: search, $options: 'i' } },
        { atividade: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [termosRaw, total] = await Promise.all([
      TermoVisita.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      TermoVisita.countDocuments(query)
    ]);
    
    // Normalizar
    const termos = termosRaw.map(t => {
      const primeiroAluno = t.alunos?.[0];
      const nomeAluno = t.alunos?.length > 1 
        ? `${primeiroAluno?.nome || 'Aluno'} + ${t.alunos.length - 1}`
        : (primeiroAluno?.nome || 'Aluno');
      
      const primeiroProf = t.professores?.[0];
      const nomeProfessor = t.professores?.length > 1
        ? `${primeiroProf?.nome || 'Professor'} + ${t.professores.length - 1}`
        : (primeiroProf?.nome || 'Professor');
      
      return {
        _id: t._id,
        id: t._id,
        codigo: t.codigo,
        atividade: t.atividade,
        
        alunoNome: nomeAluno,
        alunoTurma: primeiroAluno?.turma || t.turmaPrincipal || 'N/A',
        alunoCurso: primeiroAluno?.curso || t.cursoPrincipal || 'N/A',
        alunoMatricula: primeiroAluno?.matricula || '',
        
        totalAlunos: t.alunos?.length || 1,
        todosAlunos: t.alunos || [],
        
        professorNome: nomeProfessor,
        totalProfessores: t.professores?.length || 1,
        todosProfessores: t.professores || [],
        
        periodo: t.periodo,
        horario: t.horario,
        local: t.local,
        localizacao: t.localizacao,
        dataVisita: t.dataVisita,
        cidade: t.cidade,
        status: t.status,
        statusData: t.statusData,
        
        // Responsáveis — dados sensíveis NÃO são enviados na listagem
        responsaveis: (t.responsaveis || []).map(r => ({
          alunoId: r.alunoId,
          alunoNome: r.alunoNome,
          nome: r.nome,
          status: r.status,
          lgpdAceito: r.lgpdAceito,
          lgpdAceitoData: r.lgpdAceitoData
        })),
        totalResponsaveis: t.responsaveis?.length || 0,
        responsaveisAutorizados: t.responsaveis?.filter(r => r.status === 'autorizado').length || 0,
        
        criadoPor: t.criadoPor,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt
      };
    });
    
    const estatisticas = {
      total: await TermoVisita.countDocuments({ ativo: true }),
      pendentes: await TermoVisita.countDocuments({ status: 'pendente', ativo: true }),
      autorizados: await TermoVisita.countDocuments({ status: 'autorizado', ativo: true }),
      parcialmente_autorizado: await TermoVisita.countDocuments({ status: 'parcialmente_autorizado', ativo: true }),
      recusados: await TermoVisita.countDocuments({ status: 'recusado', ativo: true })
    };
    
    res.json({
      success: true,
      termos,
      total,
      paginacao: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      },
      estatisticas
    });
    
  } catch (error) {
    console.error('❌ Erro ao listar termos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Buscar termo por ID
router.get('/termos/:id', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    const termo = await TermoVisita.findById(req.params.id).lean();
    if (!termo) return res.status(404).json({ success: false, error: 'Termo não encontrado' });
    
    const primeiroAluno = termo.alunos?.[0];
    const primeiroProf = termo.professores?.[0];
    
    const normalizado = {
      _id: termo._id,
      id: termo._id,
      codigo: termo.codigo,
      atividade: termo.atividade,
      
      alunoNome: termo.alunos?.length > 1 
        ? `${primeiroAluno?.nome || 'Aluno'} + ${termo.alunos.length - 1}`
        : (primeiroAluno?.nome || 'Aluno'),
      alunoTurma: primeiroAluno?.turma || termo.turmaPrincipal || 'N/A',
      alunoCurso: primeiroAluno?.curso || termo.cursoPrincipal || 'N/A',
      alunoMatricula: primeiroAluno?.matricula || '',
      
      totalAlunos: termo.alunos?.length || 1,
      alunos: termo.alunos || [],
      
      professorNome: termo.professores?.length > 1
        ? `${primeiroProf?.nome || 'Professor'} + ${termo.professores.length - 1}`
        : (primeiroProf?.nome || 'Professor'),
      totalProfessores: termo.professores?.length || 1,
      professores: termo.professores || [],
      
      periodo: termo.periodo,
      horario: termo.horario,
      local: termo.local,
      localizacao: termo.localizacao,
      dataVisita: termo.dataVisita,
      cidade: termo.cidade,
      status: termo.status,
      statusData: termo.statusData,
      
      // Responsáveis COM mascaramento (CPF/RG/telefone)
      responsaveis: (termo.responsaveis || []).map(r => ({
        alunoId: r.alunoId,
        alunoNome: r.alunoNome,
        nome: r.nome,
        cpf: r.cpf ? mascararCPF(r.cpf) : '',
        rg: r.rg ? mascararRG(r.rg) : '',
        telefone: r.telefone ? mascararTelefone(r.telefone) : '',
        email: r.email || '',
        status: r.status,
        autenticado: r.autenticado,
        lgpdAceito: r.lgpdAceito,
        lgpdAceitoData: r.lgpdAceitoData,
        assinaturaData: r.assinaturaData
      })),
      totalResponsaveis: termo.responsaveis?.length || 0,
      responsaveisAutorizados: termo.responsaveis?.filter(r => r.status === 'autorizado').length || 0,
      
      assinaturaGestor: termo.assinaturaGestor ? {
        nome: termo.assinaturaGestor.nome,
        cargo: termo.assinaturaGestor.cargo,
        data: termo.assinaturaGestor.data
      } : null,
      
      criadoPor: termo.criadoPor,
      createdAt: termo.createdAt,
      updatedAt: termo.updatedAt
    };
    
    res.json({ success: true, termo: normalizado });
  } catch (error) {
    console.error('❌ Erro ao buscar termo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Criar novo termo
router.post('/termos', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    const {
      alunos,
      atividade,
      professores,
      periodo,
      horario,
      local,
      localizacao,
      dataVisita,
      cidade
    } = req.body;
    
    // ============ VALIDAÇÕES ============
    if (!alunos || !Array.isArray(alunos) || alunos.length === 0) {
      return res.status(400).json({ success: false, error: 'Selecione pelo menos 1 aluno' });
    }
    
    if (!professores || !Array.isArray(professores) || professores.length === 0) {
      return res.status(400).json({ success: false, error: 'Selecione pelo menos 1 professor' });
    }
    
    if (!atividade || !periodo || !horario || !local || !dataVisita) {
      return res.status(400).json({ success: false, error: 'Preencha todos os campos obrigatórios' });
    }
    
    console.log(`📝 Criando termo: ${alunos.length} aluno(s), ${professores.length} professor(es)`);
    
    // Buscar dados dos alunos
    const alunosData = await User.find({ 
      _id: { $in: alunos },
      role: 'aluno'
    }).select('nome matricula turma curso fotoPerfil').lean();
    
    if (alunosData.length === 0) {
      return res.status(404).json({ success: false, error: 'Nenhum aluno válido encontrado' });
    }
    
    // Buscar dados dos professores
    const professoresData = await User.find({
      _id: { $in: professores },
      role: 'professor'
    }).select('nome matricula eixo').lean();
    
    if (professoresData.length === 0) {
      return res.status(404).json({ success: false, error: 'Nenhum professor válido encontrado' });
    }
    
    // Gerar código único
    const codigo = await TermoVisita.gerarCodigo();
    
    // Montar array de responsáveis
    const responsaveisIniciais = alunosData.map(aluno => ({
      alunoId: aluno._id,
      alunoNome: aluno.nome,
      status: 'pendente'
    }));
    
    // Criar termo
    const termo = new TermoVisita({
      codigo,
      
      alunos: alunosData.map(a => ({
        alunoId: a._id,
        nome: a.nome,
        matricula: a.matricula || '',
        turma: a.turma || '',
        curso: a.curso || '',
        fotoPerfil: a.fotoPerfil || null
      })),
      totalAlunos: alunosData.length,
      
      turmaPrincipal: alunosData[0].turma || '',
      cursoPrincipal: alunosData[0].curso || '',
      
      atividade: atividade.trim(),
      
      professores: professoresData.map(p => ({
        professorId: p._id,
        nome: p.nome,
        matricula: p.matricula || '',
        eixo: p.eixo || ''
      })),
      
      periodo,
      horario,
      
      local: local.trim(),
      localizacao: localizacao || {},
      
      dataVisita: new Date(dataVisita),
      cidade: cidade || 'São Luís',
      
      responsaveis: responsaveisIniciais,
      
      criadoPor: req.userId,
      status: 'pendente'
    });
    
    await termo.save();
    
    console.log(`✅ Termo criado: ${codigo}`);
    
    // Criar notificação
    try {
      const notificacao = new NotificacaoVisita({
        usuarioId: req.userId,
        tipo: 'solicitacao',
        titulo: '📋 Termo Criado',
        mensagem: `Termo "${codigo}" criado para ${alunosData.length} aluno(s). Aguardando autorização dos responsáveis.`,
        termoId: termo._id
      });
      await notificacao.save();
    } catch (notifError) {
      console.warn('⚠️ Erro ao criar notificação:', notifError.message);
    }
    
    res.status(201).json({
      success: true,
      message: `Termo criado com ${alunosData.length} aluno(s) e ${professoresData.length} professor(es)!`,
      termo
    });
    
  } catch (error) {
    console.error('❌ Erro ao criar termo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Atualizar termo
router.put('/termos/:id', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Campos que NÃO podem ser atualizados diretamente
    delete updates.codigo;
    delete updates.responsaveis;
    delete updates.assinaturaGestor;
    delete updates.status;
    delete updates.statusData;
    
    const termo = await TermoVisita.findById(id);
    if (!termo) return res.status(404).json({ success: false, error: 'Termo não encontrado' });
    
    // Se veio array de alunos
    if (updates.alunos && Array.isArray(updates.alunos)) {
      const alunosData = await User.find({
        _id: { $in: updates.alunos },
        role: 'aluno'
      }).select('nome matricula turma curso fotoPerfil').lean();
      
      termo.alunos = alunosData.map(a => ({
        alunoId: a._id,
        nome: a.nome,
        matricula: a.matricula || '',
        turma: a.turma || '',
        curso: a.curso || '',
        fotoPerfil: a.fotoPerfil || null
      }));
      termo.totalAlunos = alunosData.length;
      termo.turmaPrincipal = alunosData[0]?.turma || '';
      termo.cursoPrincipal = alunosData[0]?.curso || '';
      
      // Manter responsáveis existentes, adicionar novos
      const responsaveisExistentes = new Map(
        (termo.responsaveis || []).map(r => [r.alunoId?.toString(), r])
      );
      
      termo.responsaveis = alunosData.map(a => {
        const existente = responsaveisExistentes.get(a._id.toString());
        return existente || {
          alunoId: a._id,
          alunoNome: a.nome,
          status: 'pendente'
        };
      });
    }
    
    // Se veio array de professores
    if (updates.professores && Array.isArray(updates.professores)) {
      const professoresData = await User.find({
        _id: { $in: updates.professores },
        role: 'professor'
      }).select('nome matricula eixo').lean();
      
      termo.professores = professoresData.map(p => ({
        professorId: p._id,
        nome: p.nome,
        matricula: p.matricula || '',
        eixo: p.eixo || ''
      }));
    }
    
    // Outros campos
    if (updates.atividade) termo.atividade = updates.atividade.trim();
    if (updates.periodo) termo.periodo = updates.periodo;
    if (updates.horario) termo.horario = updates.horario;
    if (updates.local) termo.local = updates.local.trim();
    if (updates.localizacao) termo.localizacao = updates.localizacao;
    if (updates.dataVisita) termo.dataVisita = new Date(updates.dataVisita);
    if (updates.cidade) termo.cidade = updates.cidade;
    
    await termo.save();
    
    console.log(`✏️ Termo ${termo.codigo} atualizado`);
    
    res.json({
      success: true,
      message: 'Termo atualizado!',
      termo
    });
  } catch (error) {
    console.error('❌ Erro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/termos/:id', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    const termo = await TermoVisita.findByIdAndDelete(req.params.id);
    if (!termo) return res.status(404).json({ success: false, error: 'Termo não encontrado' });
    res.json({ success: true, message: 'Termo excluído!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/termos/:id/assinar-gestor', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    const { assinaturaBase64 } = req.body;
    if (!assinaturaBase64) return res.status(400).json({ success: false, error: 'Assinatura obrigatória' });
    
    const termo = await TermoVisita.findById(req.params.id);
    if (!termo) return res.status(404).json({ success: false, error: 'Termo não encontrado' });
    
    const gestor = await User.findById(req.userId).select('nome role');
    
    termo.assinaturaGestor = {
      base64: assinaturaBase64,
      nome: gestor.nome,
      cargo: 'Gestor Pedagógico',
      data: new Date()
    };
    
    await termo.save();
    res.json({ success: true, message: 'Assinatura adicionada!', termo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CONFIGURAÇÕES
// ============================================
router.get('/configuracao', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    const config = await ConfiguracaoVisita.getConfig();
    res.json({ success: true, configuracao: config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/configuracao', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    const { visitasAbertas, dataAbertura, dataFechamento, avisoPublico } = req.body;
    const config = await ConfiguracaoVisita.getConfig();
    
    if (typeof visitasAbertas === 'boolean') config.visitasAbertas = visitasAbertas;
    if (dataAbertura !== undefined) config.dataAbertura = dataAbertura ? new Date(dataAbertura) : null;
    if (dataFechamento !== undefined) config.dataFechamento = dataFechamento ? new Date(dataFechamento) : null;
    if (avisoPublico !== undefined) config.avisoPublico = avisoPublico;
    
    config.atualizadoPor = req.userId;
    config.updatedAt = new Date();
    await config.save();
    
    res.json({ success: true, message: 'Configuração atualizada', configuracao: config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ESTATÍSTICAS
// ============================================
router.get('/estatisticas', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    const [total, pendentes, autorizados, recusados] = await Promise.all([
      TermoVisita.countDocuments({ ativo: true }),
      TermoVisita.countDocuments({ status: 'pendente' }),
      TermoVisita.countDocuments({ status: 'autorizado' }),
      TermoVisita.countDocuments({ status: 'recusado' })
    ]);
    
    const porTurma = await TermoVisita.aggregate([
      { $match: { ativo: true } },
      { $group: { _id: '$turmaPrincipal', total: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 10 }
    ]);
    
    res.json({
      success: true,
      estatisticas: {
        total, pendentes, autorizados, recusados,
        taxaAutorizacao: total > 0 ? ((autorizados / total) * 100).toFixed(1) : 0
      },
      porTurma
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;