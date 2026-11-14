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
// 🚀 CACHE EM MEMÓRIA (5 min) — evita reconsultas pesadas ao Atlas
// ============================================
const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function _cacheGet(key) {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > CACHE_TTL) {
        _cache.delete(key);
        return null;
    }
    return entry.data;
}

function _cacheSet(key, data) {
    _cache.set(key, { data, ts: Date.now() });
    // Limita tamanho para evitar memory leak
    if (_cache.size > 50) {
        const primeiro = _cache.keys().next().value;
        _cache.delete(primeiro);
    }
}

function _cacheClear() {
    _cache.clear();
}

// ============================================
// 🆕 HELPER — invalida TODO o cache de /termos
// ============================================
function _invalidateTermosCache() {
    const keys = [..._cache.keys()];
    keys.forEach(k => {
        if (k.startsWith('visitas:termos:')) _cache.delete(k);
    });
}

// ============================================
// 🆕 HELPERS DE FUSO HORÁRIO BRASÍLIA (UTC-3)
// ============================================
function getDataHojeBR() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
}

/**
 * Converte "YYYY-MM-DD" em Date no MEIO-DIA BRT (evita virada de dia)
 */
function meioDiaBR(dataStr) {
    if (!dataStr) return null;
    if (dataStr instanceof Date) return dataStr;
    const base = String(dataStr).includes('T') ? String(dataStr).split('T')[0] : String(dataStr);
    return new Date(base + 'T12:00:00.000-03:00');
}

// ============================================
// 🆕 HELPER — normaliza arrays de turmas/cursos
// ============================================
function extrairTurmasCursos(alunosData) {
  const turmas = [...new Set((alunosData || []).map(a => a.turma).filter(Boolean))];
  const cursos = [...new Set((alunosData || []).map(a => a.curso).filter(Boolean))];
  return {
    turmas,
    cursos,
    turmaPrincipal: turmas[0] || '',
    cursoPrincipal: cursos[0] || ''
  };
}

// ============================================
// 🆕 HELPER — normaliza horário recebido do frontend
//   Aceita: "14:00", "14:00 às 17:00", "14:00 - 17:00", "14:00às17:00"
//   Retorna SEMPRE "HH:MM às HH:MM" (ou "HH:MM" se só veio um)
//   Se não conseguir, retorna null (frontend deve validar antes)
// ============================================
function normalizarHorario(horario) {
  if (!horario) return null;
  const texto = String(horario).trim();
  if (!texto) return null;

  // Extrai todos os pares HH:MM
  const matches = [...texto.matchAll(/(\d{1,2})\s*:\s*(\d{2})/g)];
  if (matches.length === 0) return null;

  const horarios = matches.map(m => {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }).filter(Boolean);

  if (horarios.length === 0) return null;
  if (horarios.length === 1) return horarios[0];

  const [inicio, ...rest] = horarios;
  const fim = rest[rest.length - 1];
  return `${inicio} às ${fim}`;
}

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
  res.json({
    success: true,
    status: 'online',
    service: 'Autorizacao de Visitas',
    versao: '3.2-cache-select-otimizado',
    cacheSize: _cache.size,
    _debug: {
      hojeBR: getDataHojeBR(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }
  });
});

// ============================================
// AUXILIARES (com cache)
// ============================================
router.get('/turmas', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    const cached = _cacheGet('visitas:turmas');
    if (cached) {
      return res.json(cached);
    }

    // 🚀 1 única query: distinct em User
    const turmasDosAlunos = await User.distinct('turma', {
      role: 'aluno',
      ativo: true,
      turma: { $nin: [null, '', 'Não informada'] }
    });

    // 🚀 1 única query: Turma collection
    let turmasColl = [];
    try {
      turmasColl = await Turma.find({ ativa: true }).select('nome').lean();
    } catch (e) {
      console.warn('⚠️ Erro ao buscar da collection Turma:', e.message);
    }

    const todasTurmas = [
      ...new Set([
        ...turmasDosAlunos,
        ...turmasColl.map(t => t.nome)
      ].filter(Boolean))
    ].sort();

    const response = {
      success: true,
      turmas: todasTurmas.map(nome => ({
        id: nome,
        nome: nome,
        disciplina: '',
        codigo: ''
      })),
      total: todasTurmas.length
    };

    _cacheSet('visitas:turmas', response);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`✅ ${todasTurmas.length} turmas em cache`);
    }

    res.json(response);
  } catch (error) {
    console.error('❌ Erro ao buscar turmas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/cursos', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    const cached = _cacheGet('visitas:cursos');
    if (cached) {
      return res.json(cached);
    }

    const cursos = await User.distinct('curso', {
      role: 'aluno',
      ativo: true,
      curso: { $nin: [null, '', 'Não informado'] }
    });

    const response = { success: true, cursos: cursos.sort() };
    _cacheSet('visitas:cursos', response);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`✅ ${cursos.length} cursos em cache`);
    }

    res.json(response);
  } catch (error) {
    console.error('❌ Erro ao buscar cursos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Buscar alunos por turma/curso (aceita múltiplas turmas via vírgula)
router.get('/alunos-por-turma', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    const { turma, turmas, curso } = req.query;
    
    // 🔥 Validação: sem turma e sem curso = erro 400 (evita full scan de 700+ alunos)
    const listaTurmas = (turmas || turma || '')
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    
    if (listaTurmas.length === 0 && (!curso || curso.trim() === '')) {
      return res.status(400).json({
        success: false,
        error: 'Informe pelo menos o parâmetro "turma" ou "curso" (evita full scan).'
      });
    }
    
    let query = { role: 'aluno', ativo: true };
    
    if (listaTurmas.length === 1) {
      query.turma = listaTurmas[0];
    } else if (listaTurmas.length > 1) {
      query.turma = { $in: listaTurmas };
    }
    
    if (curso && curso.trim() !== '') {
      query.curso = curso;
    }
    
    const alunos = await User.find(query)
      .select('nome matricula turma curso fotoPerfil email')
      .sort({ turma: 1, nome: 1 })
      .lean();
    
    res.json({
      success: true,
      total: alunos.length,
      turmasFiltradas: listaTurmas,
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
    const cached = _cacheGet('visitas:professores');
    if (cached) {
      return res.json(cached);
    }

    const professores = await User.find({ 
      role: 'professor', 
      ativo: true 
    })
      .select('nome email matricula eixo')
      .sort({ nome: 1 })
      .lean();
    
    const response = {
      success: true,
      professores: professores.map(p => ({
        id: p._id,
        nome: p.nome,
        email: p.email || '',
        matricula: p.matricula || '',
        eixo: p.eixo || ''
      }))
    };

    _cacheSet('visitas:professores', response);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`✅ ${professores.length} professores em cache`);
    }

    res.json(response);
  } catch (error) {
    console.error('❌ Erro ao buscar professores:', error);
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

// Listar todos os termos (🚀 OTIMIZADO COM $facet + CACHE + SELECT ENXUTO)
router.get('/termos', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    const { status, turma, search, page = 1, limit = 20 } = req.query;

    // 🔥 Cache só quando NÃO há busca textual (search é dinâmico, não cacheia)
    const cacheKey = search ? null : `visitas:termos:${status || 'todos'}:${turma || 'todas'}:${page}:${limit}`;
    if (cacheKey) {
      const cached = _cacheGet(cacheKey);
      if (cached) {
        return res.json(cached);
      }
    }
    
    let query = { ativo: true };
    
    if (status && status !== 'todos') {
      query.status = status;
    }
    
    if (turma && turma !== 'todas') {
      query.$or = [
        { turmaPrincipal: turma },
        { turmas: turma }
      ];
    }
    
    if (search) {
      const searchOr = [
        { 'alunos.nome': { $regex: search, $options: 'i' } },
        { 'alunos.matricula': { $regex: search, $options: 'i' } },
        { codigo: { $regex: search, $options: 'i' } },
        { 'professores.nome': { $regex: search, $options: 'i' } },
        { atividade: { $regex: search, $options: 'i' } }
      ];
      
      if (query.$or) {
        query.$and = [
          { $or: query.$or },
          { $or: searchOr }
        ];
        delete query.$or;
      } else {
        query.$or = searchOr;
      }
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const lim = parseInt(limit);
    
    // ============================================
    // 🚀 OTIMIZAÇÃO CRÍTICA: 1 única pipeline com $facet
    //    Retorna dados + total + estatísticas em 1 ida ao banco
    //    E com SELECT ENXUTO (sem fotoPerfil base64, sem arrays inteiros)
    // ============================================
    const [resultado] = await TermoVisita.aggregate([
      { $match: query },
      {
        $facet: {
          // 1) Dados paginados (com select via $project)
          termos: [
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: lim },
            {
              $project: {
                codigo: 1,
                atividade: 1,
                descricaoAtividade: 1,
                turmas: 1,
                turmaPrincipal: 1,
                cursoPrincipal: 1,
                periodo: 1,
                horario: 1,
                local: 1,
                localizacao: 1,
                dataVisita: 1,
                cidade: 1,
                status: 1,
                statusData: 1,
                criadoPor: 1,
                createdAt: 1,
                updatedAt: 1,

                // ✅ ALUNOS: só o essencial (SEM fotoPerfil base64)
                'alunos.alunoId': 1,
                'alunos.nome': 1,
                'alunos.matricula': 1,
                'alunos.turma': 1,
                'alunos.curso': 1,

                // ✅ PROFESSORES: só o essencial
                'professores.professorId': 1,
                'professores.nome': 1,
                'professores.matricula': 1,
                'professores.eixo': 1,

                // ✅ RESPONSÁVEIS: só o essencial (sem base64/CPF/RG/telefone)
                'responsaveis.alunoId': 1,
                'responsaveis.alunoNome': 1,
                'responsaveis.nome': 1,
                'responsaveis.status': 1,
                'responsaveis.lgpdAceito': 1,
                'responsaveis.lgpdAceitoData': 1
              }
            }
          ],
          // 2) Total (respeitando o filtro)
          total: [{ $count: 'count' }],
          // 3) Estatísticas por status (respeitando o filtro)
          stats: [
            { $group: { _id: '$status', count: { $sum: 1 } } }
          ]
        }
      }
    ]);

    const termosRaw = resultado.termos || [];
    const total = resultado.total[0]?.count || 0;
    const statsMap = (resultado.stats || []).reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});
    
    const estatisticas = {
      total: Object.values(statsMap).reduce((a, b) => a + b, 0),
      pendentes: statsMap['pendente'] || 0,
      autorizados: statsMap['autorizado'] || 0,
      parcialmente_autorizado: statsMap['parcialmente_autorizado'] || 0,
      recusados: statsMap['recusado'] || 0
    };
    
    const termos = termosRaw.map(t => {
      const primeiroAluno = t.alunos?.[0];
      const nomeAluno = t.alunos?.length > 1 
        ? `${primeiroAluno?.nome || 'Aluno'} + ${t.alunos.length - 1}`
        : (primeiroAluno?.nome || 'Aluno');
      
      const primeiroProf = t.professores?.[0];
      const nomeProfessor = t.professores?.length > 1
        ? `${primeiroProf?.nome || 'Professor'} + ${t.professores.length - 1}`
        : (primeiroProf?.nome || 'Professor');
      
      const turmasDoTermo = (t.turmas && t.turmas.length > 0)
        ? t.turmas
        : (t.turmaPrincipal ? [t.turmaPrincipal] : []);
      
      return {
        _id: t._id,
        id: t._id,
        codigo: t.codigo,
        atividade: t.atividade,
        descricaoAtividade: t.descricaoAtividade || '',
        
        alunoNome: nomeAluno,
        alunoTurma: turmasDoTermo.length > 1 
          ? turmasDoTermo.join(', ') 
          : (turmasDoTermo[0] || 'N/A'),
        turmas: turmasDoTermo,
        totalTurmas: turmasDoTermo.length,
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
    
    const response = {
      success: true,
      termos,
      total,
      paginacao: {
        page: parseInt(page),
        limit: lim,
        pages: Math.ceil(total / lim)
      },
      estatisticas
    };

    if (cacheKey) _cacheSet(cacheKey, response);

    res.json(response);
    
  } catch (error) {
    console.error('❌ Erro ao listar termos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Buscar termo por ID (🚀 OTIMIZADO COM SELECT — mantém fotoPerfil)
router.get('/termos/:id', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    const termo = await TermoVisita.findById(req.params.id)
      .select('-responsaveis.assinaturaBase64 -responsaveis.cpf -responsaveis.rg -responsaveis.telefone -assinaturaGestor.base64')
      .lean();
    
    if (!termo) return res.status(404).json({ success: false, error: 'Termo não encontrado' });
    
    const primeiroAluno = termo.alunos?.[0];
    const primeiroProf = termo.professores?.[0];
    
    const turmasDoTermo = (termo.turmas && termo.turmas.length > 0)
      ? termo.turmas
      : (termo.turmaPrincipal ? [termo.turmaPrincipal] : []);
    
    const normalizado = {
      _id: termo._id,
      id: termo._id,
      codigo: termo.codigo,
      atividade: termo.atividade,
      descricaoAtividade: termo.descricaoAtividade || '',
      
      alunoNome: termo.alunos?.length > 1 
        ? `${primeiroAluno?.nome || 'Aluno'} + ${termo.alunos.length - 1}`
        : (primeiroAluno?.nome || 'Aluno'),
      alunoTurma: turmasDoTermo.length > 1 
        ? turmasDoTermo.join(', ') 
        : (turmasDoTermo[0] || 'N/A'),
      turmas: turmasDoTermo,
      totalTurmas: turmasDoTermo.length,
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
      descricaoAtividade,
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

    // 🆕 Normaliza e valida o horário
    const horarioNormalizado = normalizarHorario(horario);
    if (!horarioNormalizado) {
      return res.status(400).json({
        success: false,
        error: 'Horário inválido. Use o formato "HH:MM às HH:MM" (ex: "14:00 às 17:00").'
      });
    }
    
    console.log(`📝 Criando termo: ${alunos.length} aluno(s), ${professores.length} professor(es) | horário: ${horarioNormalizado}`);
    
    const alunosData = await User.find({ 
      _id: { $in: alunos },
      role: 'aluno'
    }).select('nome matricula turma curso fotoPerfil').lean();
    
    if (alunosData.length === 0) {
      return res.status(404).json({ success: false, error: 'Nenhum aluno válido encontrado' });
    }
    
    const professoresData = await User.find({
      _id: { $in: professores },
      role: 'professor'
    }).select('nome matricula eixo').lean();
    
    if (professoresData.length === 0) {
      return res.status(404).json({ success: false, error: 'Nenhum professor válido encontrado' });
    }
    
    const { turmas, cursos, turmaPrincipal, cursoPrincipal } = extrairTurmasCursos(alunosData);
    
    const codigo = await TermoVisita.gerarCodigo();
    
    const responsaveisIniciais = alunosData.map(aluno => ({
      alunoId: aluno._id,
      alunoNome: aluno.nome,
      status: 'pendente'
    }));
    
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
      
      turmas,
      cursos,
      turmaPrincipal,
      cursoPrincipal,
      
      atividade: atividade.trim(),
      descricaoAtividade: (descricaoAtividade || '').trim(),
      
      professores: professoresData.map(p => ({
        professorId: p._id,
        nome: p.nome,
        matricula: p.matricula || '',
        eixo: p.eixo || ''
      })),
      
      periodo,
      horario: horarioNormalizado,
      
      local: local.trim(),
      localizacao: localizacao || {},
      
      dataVisita: meioDiaBR(dataVisita),
      cidade: cidade || 'São Luís',
      
      responsaveis: responsaveisIniciais,
      
      criadoPor: req.userId,
      status: 'pendente'
    });
    
    await termo.save();
    
    // 🔥 Invalida cache de termos (novo termo criado)
    _invalidateTermosCache();
    
    console.log(`✅ Termo criado: ${codigo} | Turmas: ${turmas.join(', ')} | Horário: ${horarioNormalizado}`);
    
    try {
      const notificacao = new NotificacaoVisita({
        usuarioId: req.userId,
        tipo: 'solicitacao',
        titulo: '📋 Termo Criado',
        mensagem: `Termo "${codigo}" criado para ${alunosData.length} aluno(s) de ${turmas.length} turma(s). Aguardando autorização dos responsáveis.`,
        termoId: termo._id
      });
      await notificacao.save();
    } catch (notifError) {
      console.warn('⚠️ Erro ao criar notificação:', notifError.message);
    }
    
    res.status(201).json({
      success: true,
      message: `Termo criado com ${alunosData.length} aluno(s), ${turmas.length} turma(s) e ${professoresData.length} professor(es)!`,
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
    
    delete updates.codigo;
    delete updates.responsaveis;
    delete updates.assinaturaGestor;
    delete updates.status;
    delete updates.statusData;
    
    const termo = await TermoVisita.findById(id);
    if (!termo) return res.status(404).json({ success: false, error: 'Termo não encontrado' });
    
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
      
      const { turmas, cursos, turmaPrincipal, cursoPrincipal } = extrairTurmasCursos(alunosData);
      termo.turmas = turmas;
      termo.cursos = cursos;
      termo.turmaPrincipal = turmaPrincipal;
      termo.cursoPrincipal = cursoPrincipal;
      
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
    
    if (updates.atividade) termo.atividade = updates.atividade.trim();
    if (updates.descricaoAtividade !== undefined) termo.descricaoAtividade = (updates.descricaoAtividade || '').trim();
    if (updates.periodo) termo.periodo = updates.periodo;

    if (updates.horario !== undefined) {
      const horarioNormalizado = normalizarHorario(updates.horario);
      if (!horarioNormalizado) {
        return res.status(400).json({
          success: false,
          error: 'Horário inválido. Use o formato "HH:MM às HH:MM" (ex: "14:00 às 17:00").'
        });
      }
      termo.horario = horarioNormalizado;
    }

    if (updates.local) termo.local = updates.local.trim();
    if (updates.localizacao) termo.localizacao = updates.localizacao;
    if (updates.dataVisita) termo.dataVisita = meioDiaBR(updates.dataVisita);
    if (updates.cidade) termo.cidade = updates.cidade;
    
    await termo.save();
    
    // 🔥 Invalida cache de termos (termo atualizado)
    _invalidateTermosCache();
    
    console.log(`✏️ Termo ${termo.codigo} atualizado | Turmas: ${(termo.turmas || []).join(', ')} | Horário: ${termo.horario}`);
    
    res.json({
      success: true,
      message: 'Termo atualizado!',
      termo
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar termo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/termos/:id', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    const termo = await TermoVisita.findByIdAndDelete(req.params.id);
    if (!termo) return res.status(404).json({ success: false, error: 'Termo não encontrado' });
    
    // 🔥 Invalida cache de termos
    _invalidateTermosCache();
    
    console.log(`🗑️ Termo ${termo.codigo} excluído`);
    
    res.json({ success: true, message: 'Termo excluído!' });
  } catch (error) {
    console.error('❌ Erro ao excluir termo:', error);
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
    
    // 🔥 Invalida cache
    _invalidateTermosCache();
    
    res.json({ success: true, message: 'Assinatura adicionada!', termo });
  } catch (error) {
    console.error('❌ Erro ao assinar termo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CONFIGURAÇÕES (com cache)
// ============================================
router.get('/configuracao', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    const cached = _cacheGet('visitas:configuracao');
    if (cached) {
      return res.json(cached);
    }

    const config = await ConfiguracaoVisita.getConfig();
    const response = { success: true, configuracao: config };
    _cacheSet('visitas:configuracao', response);

    res.json(response);
  } catch (error) {
    console.error('❌ Erro ao buscar configuração:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/configuracao', authenticateToken, verificarPermissaoVisitas, async (req, res) => {
  try {
    const { visitasAbertas, dataAbertura, dataFechamento, avisoPublico } = req.body;
    const config = await ConfiguracaoVisita.getConfig();
    
    if (typeof visitasAbertas === 'boolean') config.visitasAbertas = visitasAbertas;
    if (dataAbertura !== undefined) config.dataAbertura = dataAbertura ? meioDiaBR(dataAbertura) : null;
    if (dataFechamento !== undefined) config.dataFechamento = dataFechamento ? meioDiaBR(dataFechamento) : null;
    if (avisoPublico !== undefined) config.avisoPublico = avisoPublico;
    
    config.atualizadoPor = req.userId;
    config.updatedAt = new Date();
    await config.save();
    
    // 🔥 Invalida cache de configuração
    _cache.delete('visitas:configuracao');
    
    console.log(`⚙️ Configuração atualizada: visitasAbertas=${config.visitasAbertas}`);
    
    res.json({ success: true, message: 'Configuração atualizada', configuracao: config });
  } catch (error) {
    console.error('❌ Erro ao atualizar configuração:', error);
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
      { 
        $project: {
          turmasEfetivas: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ['$turmas', []] } }, 0] },
              '$turmas',
              { $cond: [
                { $ne: ['$turmaPrincipal', null] },
                ['$turmaPrincipal'],
                []
              ]}
            ]
          }
        }
      },
      { $unwind: '$turmasEfetivas' },
      { $group: { _id: '$turmasEfetivas', total: { $sum: 1 } } },
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
    console.error('❌ Erro ao calcular estatísticas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;