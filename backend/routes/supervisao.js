// routes/supervisao.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const AtendimentoSupervisao = require('../models/AtendimentoSupervisao');
const SessaoAssinatura = require('../models/SessaoAssinatura');
const Notificacao = require('../models/Notificacao');
const PerfilParticipante = require('../models/PerfilParticipante');

const MASCARA_TEXTO = '🔒 Conteúdo protegido (visível apenas para o profissional responsável)';
const ROLES_MASCARADOS = ['super_admin'];

// ============================================
// MÁSCARA — CORRIGIDA
// ============================================
function mascararParaAdmin(dados, req) {
  if (!req?.userRole || !ROLES_MASCARADOS.includes(req.userRole)) return dados;
  if (Array.isArray(dados)) return dados.map(item => mascararItem(item, req));
  return mascararItem(dados, req);
}

function mascararItem(item, req) {
  if (!item) return item;
  
  let obj;
  if (item.toObject) {
    obj = item.toObject({ getters: true, virtuals: false });
  } else {
    obj = JSON.parse(JSON.stringify(item));
  }
  
  const adminId = req.userId?.toString();
  const criadorId = (
    obj.entrada?.registradoPor ||
    obj.registradoPorId ||
    obj.registradoPor ||
    obj.criadoPor
  )?.toString();
  
  // Se NÃO é super_admin, NUNCA mascara
  if (!ROLES_MASCARADOS.includes(req.userRole)) {
    obj._mascarado = false;
    obj._criadoPorMim = criadorId === adminId;
    return obj;
  }
  
  // super_admin que criou: NÃO mascara
  if (criadorId && adminId && criadorId === adminId) {
    obj._mascarado = false;
    obj._criadoPorMim = true;
    return obj;
  }
  
  // super_admin que NÃO criou: mascara
  obj._mascarado = true;
  obj._criadoPorMim = false;
  
  if (obj.entrada) {
    if (obj.entrada.descricao) obj.entrada.descricao = MASCARA_TEXTO;
    if (obj.entrada.observacoes) obj.entrada.observacoes = MASCARA_TEXTO;
    if (obj.entrada.assinaturaBase64) obj.entrada.assinaturaBase64 = null;
    
    if (Array.isArray(obj.entrada.participantes)) {
      obj.entrada.participantes = obj.entrada.participantes.map(p => ({
        ...p,
        assinaturaBase64: null
      }));
    }
  }
  if (obj.descricao) obj.descricao = MASCARA_TEXTO;
  if (obj.saida) {
    if (obj.saida.resultadoTexto) obj.saida.resultadoTexto = MASCARA_TEXTO;
    if (obj.saida.observacoesFinais) obj.saida.observacoesFinais = MASCARA_TEXTO;
  }
  if (obj.detalhes && typeof obj.detalhes === 'object') {
    Object.keys(obj.detalhes).forEach(chave => {
      if (chave === 'tiposTarefaAdicionais') return;
      const valor = obj.detalhes[chave];
      if (Array.isArray(valor)) obj.detalhes[chave] = [MASCARA_TEXTO];
      else if (valor !== undefined && valor !== null && valor !== '') obj.detalhes[chave] = MASCARA_TEXTO;
    });
  }
  if (Array.isArray(obj.remarcacoes)) {
    obj.remarcacoes = obj.remarcacoes.map(rem => {
      const nova = { ...rem };
      if (nova.motivoRemarcacao) nova.motivoRemarcacao = MASCARA_TEXTO;
      if (nova.observacoesRemarcacao) nova.observacoesRemarcacao = MASCARA_TEXTO;
      return nova;
    });
  }
  return obj;
}

function adminPodeModificar(atendimento, req) {
  if (!ROLES_MASCARADOS.includes(req.userRole)) return { permitido: true };
  const adminId = req.userId?.toString();
  const criadorId = atendimento?.entrada?.registradoPor?.toString();
  if (criadorId === adminId) return { permitido: true };
  return {
    permitido: false,
    motivo: 'Você não pode editar/excluir atendimentos criados por outros profissionais.'
  };
}

function formatarTempoAtendimento(dataEntrada) {
  if (!dataEntrada) return { minutos: 0, texto: '0 min', nivel: 'normal' };
  const agora = new Date();
  const entrada = new Date(dataEntrada);
  const minutosTotal = Math.floor((agora - entrada) / 60000);
  if (minutosTotal < 0) return { minutos: 0, texto: 'agora', nivel: 'normal' };
  if (minutosTotal < 60) {
    return { minutos: minutosTotal, texto: `${minutosTotal} min`, nivel: minutosTotal >= 45 ? 'atencao' : 'normal' };
  }
  if (minutosTotal < 1440) {
    const horas = Math.floor(minutosTotal / 60);
    const mins = minutosTotal % 60;
    const texto = mins > 0 ? `${horas}h ${mins}min` : `${horas}h`;
    return { minutos: minutosTotal, texto, nivel: minutosTotal >= 720 ? 'alerta' : 'atencao' };
  }
  const dias = Math.floor(minutosTotal / 1440);
  const horasRestantes = Math.floor((minutosTotal % 1440) / 60);
  const minsRestantes = minutosTotal % 60;
  let texto = `${dias}d`;
  if (horasRestantes > 0) texto += ` ${horasRestantes}h`;
  if (minsRestantes > 0) texto += ` ${minsRestantes}min`;
  return { minutos: minutosTotal, texto, nivel: 'critico' };
}

async function criarNotificacaoInterna({ usuarioId, titulo, mensagem, tipo, link, icone, cor, metadata }) {
  const TIPOS_VALIDOS = ['resultado_liberado', 'resultado_editado', 'prova_corrigida', 'sistema', 'cancelamento'];
  const tipoFinal = TIPOS_VALIDOS.includes(tipo) ? tipo : 'sistema';
  const notif = new Notificacao({
    usuarioId, titulo, mensagem,
    tipo: tipoFinal,
    link: link || '/supervisao.html',
    icone: icone || '⏰',
    cor: cor || '#f59e0b',
    lida: false,
    metadata: metadata || {}
  });
  await notif.save();
  return notif;
}

async function processarAlertas24h() {
  const atendimentos = await AtendimentoSupervisao.buscarAtendimentosParaAlerta();
  if (atendimentos.length === 0) return { processados: 0, pulados: 0 };
  
  let processados = 0;
  let pulados = 0;
  const agora = new Date();
  const INTERVALO_MINIMO_MS = 24 * 60 * 60 * 1000;
  
  for (const atendimento of atendimentos) {
    const registradoPor = atendimento.entrada?.registradoPor;
    if (!registradoPor) continue;
    
    if (atendimento.ultimoAlerta24h) {
      const diff = agora - new Date(atendimento.ultimoAlerta24h);
      if (diff < INTERVALO_MINIMO_MS) {
        pulados++;
        continue;
      }
    }
    
    const tempo = formatarTempoAtendimento(atendimento.entrada.dataHora);
    const tipoLabel = AtendimentoSupervisao.getTipoTarefaLabel(atendimento.tipoTarefa);
    const totalAlertas = (atendimento.totalAlertas24h || 0) + 1;
    const nivelLabel = totalAlertas === 1 
      ? '24h' 
      : totalAlertas === 2 
        ? '48h' 
        : totalAlertas === 3 
          ? '72h' 
          : `${totalAlertas * 24}h`;
    
    try {
      await criarNotificacaoInterna({
        usuarioId: registradoPor._id || registradoPor,
        titulo: `⏰ Ocorrência em Supervisão há mais de ${nivelLabel}`,
        mensagem: `A ocorrência de ${atendimento.alunoNome} (${tipoLabel}) está em andamento há ${tempo.texto}. Verifique se precisa de desfecho.`,
        tipo: 'sistema',
        link: `/supervisao.html?verificar=${atendimento._id}`,
        icone: '⏰',
        cor: '#dc2626',
        metadata: {
          atendimentoId: atendimento._id.toString(),
          alunoId: atendimento.alunoId.toString(),
          alunoNome: atendimento.alunoNome,
          minutosEmAndamento: tempo.minutos,
          textoTexto: tempo.texto,
          nivelAlerta: nivelLabel
        }
      });
      
      atendimento.ultimoAlerta24h = agora;
      atendimento.totalAlertas24h = totalAlertas;
      await atendimento.save();
      
      processados++;
    } catch (e) {
      console.error(`[ALERTA 24H] Falha para ${atendimento.alunoNome}:`, e.message);
    }
  }
  
  return { processados, pulados };
}

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

const verificarSupervisao = (req, res, next) => {
  const allowedRoles = ['supervisao', 'super_admin'];
  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({ success: false, error: 'Acesso permitido apenas para Supervisão' });
  }
  next();
};

const apenasSuperAdmin = (req, res, next) => {
  if (req.userRole !== 'super_admin') {
    return res.status(403).json({ success: false, error: 'Acesso restrito ao super_admin' });
  }
  next();
};

function inicioDoDiaBrasil(dataStr) { return new Date(dataStr + 'T00:00:00.000-03:00'); }
function fimDoDiaBrasil(dataStr) { return new Date(dataStr + 'T23:59:59.999-03:00'); }

// ============================================
// HELPERS DE TIPOS MÚLTIPLOS
// ============================================
function extrairTiposTarefa(atendimento) {
  const adicionais = atendimento?.detalhes?.tiposTarefaAdicionais || [];
  const tipos = [atendimento?.tipoTarefa, ...adicionais].filter(Boolean);
  return [...new Set(tipos)];
}

function labelTiposTarefa(tipos) {
  return tipos.map(t => AtendimentoSupervisao.getTipoTarefaLabel(t)).join(' + ');
}

// ============================================
// HELPER: LÊ detalhes com getters aplicados (descriptografado)
// ============================================
function lerDetalhesLimpos(atendimento) {
  if (!atendimento || !atendimento.detalhes) return {};
  try {
    const obj = atendimento.detalhes.toObject 
      ? atendimento.detalhes.toObject({ getters: true }) 
      : JSON.parse(JSON.stringify(atendimento.detalhes));
    
    const limpo = { ...obj };
    delete limpo.tiposTarefaAdicionais;
    return limpo;
  } catch (e) {
    console.error('[lerDetalhesLimpos] erro:', e);
    return {};
  }
}

// ============================================
// SEED INICIAL
// ============================================
PerfilParticipante.seedInicial().catch(err =>
  console.error('❌ [SEED PERFIS] Erro:', err.message)
);

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({ success: true, status: 'online', service: 'Supervisão', versao: '4.2-multi-tipos' });
});

// ============================================
// MIGRAÇÃO
// ============================================
router.post('/admin/migrar-alertas-24h', async (req, res) => {
  try {
    const resultado = await AtendimentoSupervisao.updateMany(
      { status: 'em_andamento', alerta24hReconhecido: { $exists: false } },
      { $set: { ultimoAlerta24h: null, alerta24hReconhecido: false, totalAlertas24h: 0 } }
    );
    res.json({ success: true, modified: resultado.modifiedCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// PERFIS DISPONÍVEIS PARA PARTICIPANTES
// ============================================
router.get('/perfis-participantes', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const perfis = await PerfilParticipante.listarAtivos();
    res.json({ success: true, perfis });
  } catch (error) {
    console.error('Erro ao buscar perfis:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// CRUD DE PERFIS (apenas super_admin)
// ============================================
router.get('/admin/perfis', authenticateToken, apenasSuperAdmin, async (req, res) => {
  try {
    const perfis = await PerfilParticipante.listarTodos();
    res.json({ success: true, perfis });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/admin/perfis', authenticateToken, apenasSuperAdmin, async (req, res) => {
  try {
    const userInfo = { userId: req.userId, nome: req.userNome };
    const novo = await PerfilParticipante.criar(req.body, userInfo);
    res.json({ success: true, perfil: novo, message: 'Perfil criado' });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'Já existe um perfil com este valor' });
    }
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/admin/perfis/:id', authenticateToken, apenasSuperAdmin, async (req, res) => {
  try {
    const userInfo = { userId: req.userId, nome: req.userNome };
    const perfil = await PerfilParticipante.atualizar(req.params.id, req.body, userInfo);
    res.json({ success: true, perfil, message: 'Perfil atualizado' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete('/admin/perfis/:id', authenticateToken, apenasSuperAdmin, async (req, res) => {
  try {
    const userInfo = { userId: req.userId, nome: req.userNome };
    const perfil = await PerfilParticipante.desativar(req.params.id, userInfo);
    res.json({ success: true, message: 'Perfil desativado', perfil });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/admin/perfis/:id/reativar', authenticateToken, apenasSuperAdmin, async (req, res) => {
  try {
    const userInfo = { userId: req.userId, nome: req.userNome };
    const perfil = await PerfilParticipante.reativar(req.params.id, userInfo);
    res.json({ success: true, message: 'Perfil reativado', perfil });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.delete('/admin/perfis/:id/permanente', authenticateToken, apenasSuperAdmin, async (req, res) => {
  try {
    await PerfilParticipante.excluirPermanentemente(req.params.id);
    res.json({ success: true, message: 'Perfil excluído permanentemente' });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/admin/perfis/seed', authenticateToken, apenasSuperAdmin, async (req, res) => {
  try {
    const { force } = req.body;
    
    if (force) {
      await PerfilParticipante.deleteMany({});
      console.log('🗑️  [SEED FORCE] Perfis antigos removidos');
    }
    
    await PerfilParticipante.seedInicial();
    const total = await PerfilParticipante.countDocuments();
    
    res.json({
      success: true,
      message: `${total} perfis cadastrados`,
      total
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// EIXOS DISPONÍVEIS
// ============================================
router.get('/eixos', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const eixos = await User.distinct('eixo', { 
      role: 'professor', 
      ativo: true, 
      eixo: { $nin: [null, '', 'Não informado'] } 
    });
    res.json({ success: true, eixos: eixos.filter(Boolean).sort() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// PROFESSORES POR EIXO
// ============================================
router.get('/professores-por-eixo', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const { eixo } = req.query;
    if (!eixo) return res.status(400).json({ success: false, error: 'Eixo é obrigatório' });
    
    const professores = await User.find({ 
      role: 'professor', 
      ativo: true, 
      eixo: eixo 
    }).select('nome matricula eixo fotoPerfil').sort({ nome: 1 });
    
    res.json({
      success: true,
      total: professores.length,
      usuarios: professores.map(u => ({
        id: u._id,
        nome: u.nome,
        matricula: u.matricula || '',
        eixo: u.eixo || '',
        fotoPerfil: u.fotoPerfil || null
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// TURMAS DISPONÍVEIS
// ============================================
router.get('/turmas', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const turmas = await User.distinct('turma', { 
      role: 'aluno', ativo: true, turma: { $nin: [null, '', 'Não informada'] } 
    });
    res.json({ success: true, turmas: turmas.filter(Boolean).sort() });
  } catch (error) { 
    res.status(500).json({ success: false, error: error.message }); 
  }
});

// ============================================
// ALUNOS POR TURMA
// ============================================
router.get('/alunos-por-turma', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const { turma } = req.query;
    if (!turma) return res.status(400).json({ success: false, error: 'Turma é obrigatória' });
    
    const alunos = await User.find({ 
      role: 'aluno', ativo: true, turma 
    }).select('nome matricula turma curso fotoPerfil').sort({ nome: 1 });
    
    const lista = alunos.map(a => ({
      id: a._id, nome: a.nome, matricula: a.matricula,
      turma: a.turma, curso: a.curso, fotoPerfil: a.fotoPerfil
    }));
    
    res.json({
      success: true, 
      total: alunos.length,
      usuarios: lista,
      alunos: lista
    });
  } catch (error) { 
    res.status(500).json({ success: false, error: error.message }); 
  }
});

// ============================================
// USUÁRIOS POR PERFIL
// ============================================
router.get('/usuarios-por-perfil', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const { perfil } = req.query;
    if (!perfil) {
      return res.status(400).json({ success: false, error: 'Perfil é obrigatório' });
    }
    
    const perfilLower = perfil.toLowerCase().trim();
    
    const perfilConfig = await PerfilParticipante.buscarPorValor(perfilLower);
    if (!perfilConfig) {
      console.warn(`[USUARIOS-PERFIL] Perfil não cadastrado: "${perfilLower}"`);
      return res.status(400).json({ 
        success: false, 
        error: `Perfil "${perfilLower}" não cadastrado. Cadastre em /admin/perfis` 
      });
    }
    
    if (perfilConfig.temFiltro) {
      return res.status(400).json({
        success: false,
        error: `Este perfil requer filtro por ${perfilConfig.filtroLabel}. Use o endpoint específico.`
      });
    }
    
    const usuarios = await User.find({ 
      role: perfilLower, 
      ativo: true 
    }).select('nome matricula fotoPerfil').sort({ nome: 1 }).lean();
    
    console.log(`[USUARIOS-PERFIL] role="${perfilLower}" → ${usuarios.length} usuário(s)`);
    
    res.json({
      success: true,
      total: usuarios.length,
      usuarios: usuarios.map(u => ({
        id: u._id,
        nome: u.nome,
        matricula: u.matricula || '',
        fotoPerfil: u.fotoPerfil || null
      }))
    });
  } catch (error) {
    console.error('[USUARIOS-PERFIL] Erro:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// BUSCAR ALUNO POR ID
// ============================================
router.get('/aluno/:id', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const aluno = await User.findOne({ _id: req.params.id, ativo: true })
      .select('nome email matricula curso turma fotoPerfil role');
    if (!aluno) return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    if (aluno.role !== 'aluno') return res.status(400).json({ success: false, error: 'Usuário não é aluno' });
    
    const atendimentosAtivos = await AtendimentoSupervisao.find({
      alunoId: aluno._id, status: 'em_andamento'
    }).sort({ createdAt: -1 });
    const historicoRecente = await AtendimentoSupervisao.find({
      alunoId: aluno._id, status: 'finalizado'
    }).sort({ createdAt: -1 }).limit(5);
    
    res.json({
      success: true,
      aluno: {
        id: aluno._id, nome: aluno.nome, matricula: aluno.matricula,
        turma: aluno.turma, curso: aluno.curso, fotoPerfil: aluno.fotoPerfil || null
      },
      atendimentosAtivos: atendimentosAtivos.map(a => {
        const tipos = extrairTiposTarefa(a);
        return {
          id: a._id, 
          tipoTarefa: a.tipoTarefa,
          tiposTarefa: tipos,
          tipoTarefaLabel: labelTiposTarefa(tipos),
          descricao: a.entrada.descricao, 
          dataHoraEntrada: a.entrada.dataHora, 
          prioridade: a.prioridade
        };
      }),
      historicoRecente: historicoRecente.map(a => {
        const tipos = extrairTiposTarefa(a);
        return {
          id: a._id, 
          tipoTarefa: a.tipoTarefa,
          tiposTarefa: tipos,
          tipoTarefaLabel: labelTiposTarefa(tipos),
          descricao: a.entrada.descricao, 
          dataHora: a.entrada.dataHora, 
          resultado: a.saida?.resultado
        };
      })
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// BUSCAR ALUNO POR NOME/MATRÍCULA
// ============================================
router.get('/buscar-aluno', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const { termo } = req.query;
    if (!termo || termo.length < 2) {
      return res.status(400).json({ success: false, error: 'Digite pelo menos 2 caracteres' });
    }
    const alunos = await User.find({
      role: 'aluno', ativo: true,
      $or: [
        { nome: { $regex: termo, $options: 'i' } },
        { matricula: { $regex: termo, $options: 'i' } }
      ]
    }).select('nome matricula turma curso fotoPerfil').limit(20).sort({ nome: 1 });
    res.json({
      success: true, total: alunos.length,
      alunos: alunos.map(a => ({
        id: a._id, nome: a.nome, matricula: a.matricula,
        turma: a.turma, curso: a.curso, fotoPerfil: a.fotoPerfil
      }))
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// REGISTRAR ATENDIMENTO (MÚLTIPLOS TIPOS)
// ============================================
router.post('/registrar', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const { 
      alunoId, 
      tiposTarefa = [],
      tipoTarefa,
      descricao, observacoes, gravidade, prioridade, 
      detalhes, assinaturaBase64, precisaAssinatura = false,
      participantes = []
    } = req.body;
    
    let tiposFinal = Array.isArray(tiposTarefa) && tiposTarefa.length > 0
      ? tiposTarefa
      : (tipoTarefa ? [tipoTarefa] : []);
    
    tiposFinal = [...new Set(tiposFinal.filter(Boolean))];
    
    if (tiposFinal.length === 0) {
      return res.status(400).json({ success: false, error: 'Selecione pelo menos um tipo de tarefa' });
    }
    
    if (!descricao || descricao.trim() === '') {
      return res.status(400).json({ success: false, error: 'A descrição é obrigatória' });
    }
    
    const tiposValidos = [
      'advertencia_verbal', 'advertencia_escrita', 'atendimento_aluno',
      'atendimento_responsavel', 'atendimento_professor', 'suspensao', 'encaminhamento', 'outros'
    ];
    for (const t of tiposFinal) {
      if (!tiposValidos.includes(t)) {
        return res.status(400).json({ success: false, error: `Tipo de tarefa inválido: ${t}` });
      }
    }
    
    const aluno = await User.findById(alunoId);
    if (!aluno || aluno.role !== 'aluno') {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }
    
    const supervisor = await User.findById(req.userId).select('nome');
    let assinaturaValida = '';
    if (assinaturaBase64 && typeof assinaturaBase64 === 'string') {
      if (assinaturaBase64.startsWith('data:image/') && assinaturaBase64.length < 500000) {
        assinaturaValida = assinaturaBase64;
      }
    }
    
    const statusAssinatura = precisaAssinatura && !assinaturaValida
      ? 'pendente'
      : (assinaturaValida.length > 100 ? 'assinada' : 'nao_necessaria');
    
    const participantesProcessados = (Array.isArray(participantes) ? participantes : [])
      .filter(p => p && p.usuarioId && p.usuarioNome)
      .map(p => {
        let assinaturaPartValida = '';
        if (p.assinaturaBase64 && typeof p.assinaturaBase64 === 'string') {
          if (p.assinaturaBase64.startsWith('data:image/') && p.assinaturaBase64.length < 500000) {
            assinaturaPartValida = p.assinaturaBase64;
          }
        }
        return {
          usuarioId: p.usuarioId,
          usuarioNome: p.usuarioNome,
          usuarioMatricula: p.usuarioMatricula || null,
          usuarioFoto: p.usuarioFoto || null,
          tipo: p.tipo || 'outros',
          tipoLabel: p.tipoLabel || p.tipo || 'Outros',
          turma: p.turma || null,
          eixo: p.eixo || null,
          filtroValor: p.filtroValor || '',
          precisaAssinatura: !!p.precisaAssinatura,
          assinaturaBase64: assinaturaPartValida,
          temAssinatura: assinaturaPartValida.length > 100,
          assinadaEm: assinaturaPartValida.length > 100 ? new Date() : null,
          assinadaPorNome: assinaturaPartValida.length > 100 ? p.usuarioNome : null,
          sessaoAssinaturaId: p.sessaoId || null
        };
      });
    
    const tipoPrincipal = tiposFinal[0];
    const detalhesFinal = { ...(detalhes || {}) };
    if (tiposFinal.length > 1) {
      detalhesFinal.tiposTarefaAdicionais = tiposFinal.slice(1);
    }
    
    const atendimento = new AtendimentoSupervisao({
      alunoId: aluno._id, alunoNome: aluno.nome, alunoMatricula: aluno.matricula,
      alunoTurma: aluno.turma || 'Não informada', alunoCurso: aluno.curso || 'Não informado',
      alunoFoto: aluno.fotoPerfil, 
      tipoTarefa: tipoPrincipal,
      entrada: {
        dataHora: new Date(),
        descricao: descricao.trim(),
        observacoes: observacoes || '',
        gravidade: gravidade || 'media',
        registradoPor: req.userId,
        registradoPorNome: supervisor?.nome || req.userNome || 'Supervisor',
        assinaturaBase64: assinaturaValida,
        temAssinatura: assinaturaValida.length > 100,
        statusAssinatura: statusAssinatura,
        assinadaEm: assinaturaValida.length > 100 ? new Date() : null,
        assinadaPor: assinaturaValida.length > 100 ? req.userId : null,
        assinadaPorNome: assinaturaValida.length > 100 ? (supervisor?.nome || req.userNome) : null,
        participantes: participantesProcessados
      },
      detalhes: detalhesFinal,
      prioridade: prioridade || 'normal',
      status: 'em_andamento',
      ultimoAlerta24h: null,
      alerta24hReconhecido: false,
      totalAlertas24h: 0
    });
    
    await atendimento.save();
    
    const labelTiposStr = labelTiposTarefa(tiposFinal);
    
    res.json({
      success: true,
      message: `${labelTiposStr} registrado para ${aluno.nome}`,
      atendimento: {
        id: atendimento._id,
        tipoTarefa: atendimento.tipoTarefa,
        tiposTarefa: tiposFinal,
        tiposTarefaLabel: labelTiposStr,
        tipoTarefaLabel: labelTiposStr,
        status: atendimento.status,
        dataHora: atendimento.entrada.dataHora,
        temAssinatura: atendimento.entrada.temAssinatura,
        statusAssinatura: atendimento.entrada.statusAssinatura,
        totalParticipantes: participantesProcessados.length
      }
    });
  } catch (error) { 
    console.error('Erro ao registrar:', error);
    res.status(500).json({ success: false, error: error.message }); 
  }
});

// ============================================
// APLICAR ASSINATURA DO RESPONSÁVEL
// ============================================
router.post('/aplicar-assinatura', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const { atendimentoId, sessaoId } = req.body;
    if (!atendimentoId || !sessaoId) {
      return res.status(400).json({ success: false, error: 'atendimentoId e sessaoId são obrigatórios' });
    }
    
    const sessao = await SessaoAssinatura.findOne({ sessaoId });
    if (!sessao) return res.status(404).json({ success: false, error: 'Sessão não encontrada' });
    if (sessao.status !== 'assinado') return res.status(400).json({ success: false, error: 'Sessão ainda não foi assinada' });
    if (!sessao.assinaturaBase64) return res.status(400).json({ success: false, error: 'Sessão não contém assinatura' });
    
    const atendimento = await AtendimentoSupervisao.findById(atendimentoId);
    if (!atendimento) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    
    atendimento.entrada.assinaturaBase64 = sessao.assinaturaBase64;
    atendimento.entrada.temAssinatura = true;
    atendimento.entrada.statusAssinatura = 'assinada';
    atendimento.entrada.assinadaEm = sessao.assinadaEm;
    atendimento.entrada.assinadaPor = sessao.assinadaPor;
    atendimento.entrada.assinadaPorNome = sessao.assinadaPorNome;
    atendimento.entrada.sessaoAssinaturaId = sessaoId;
    atendimento.updatedAt = new Date();
    await atendimento.save();
    
    res.json({
      success: true,
      message: 'Assinatura aplicada com sucesso!',
      atendimento: {
        id: atendimento._id,
        temAssinatura: true,
        statusAssinatura: 'assinada'
      }
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// APLICAR ASSINATURA DE PARTICIPANTE
// ============================================
router.post('/aplicar-assinatura-participante', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const { atendimentoId, participanteId, sessaoId } = req.body;
    if (!atendimentoId || !participanteId || !sessaoId) {
      return res.status(400).json({ success: false, error: 'atendimentoId, participanteId e sessaoId são obrigatórios' });
    }
    
    const sessao = await SessaoAssinatura.findOne({ sessaoId });
    if (!sessao) return res.status(404).json({ success: false, error: 'Sessão não encontrada' });
    if (sessao.status !== 'assinado') return res.status(400).json({ success: false, error: 'Sessão ainda não foi assinada' });
    
    const atendimento = await AtendimentoSupervisao.findById(atendimentoId);
    if (!atendimento) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    
    const participante = atendimento.entrada.participantes.id(participanteId);
    if (!participante) return res.status(404).json({ success: false, error: 'Participante não encontrado' });
    
    participante.assinaturaBase64 = sessao.assinaturaBase64;
    participante.temAssinatura = true;
    participante.assinadaEm = sessao.assinadaEm;
    participante.assinadaPorNome = sessao.assinadaPorNome;
    participante.sessaoAssinaturaId = sessaoId;
    atendimento.updatedAt = new Date();
    await atendimento.save();
    
    res.json({
      success: true,
      message: 'Assinatura do participante aplicada com sucesso!',
      participante: {
        id: participante._id,
        usuarioNome: participante.usuarioNome,
        temAssinatura: true
      }
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// FINALIZAR
// ============================================
router.post('/finalizar', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const { atendimentoId, resultado, resultadoTexto, observacoesFinais } = req.body;
    const resultadosValidos = ['resolvido', 'em_acompanhamento', 'reincidente', 'encaminhado', 'pendente'];
    if (!resultadosValidos.includes(resultado)) {
      return res.status(400).json({ success: false, error: 'Resultado inválido' });
    }
    
    const atendimento = await AtendimentoSupervisao.findById(atendimentoId);
    if (!atendimento) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    if (atendimento.status === 'finalizado') {
      return res.status(400).json({ success: false, error: 'Atendimento já finalizado' });
    }
    
    const check = adminPodeModificar(atendimento, req);
    if (!check.permitido) {
      return res.status(403).json({ success: false, error: check.motivo, code: 'ADMIN_NAO_CRIADOR' });
    }
    
    const supervisor = await User.findById(req.userId).select('nome');
    atendimento.saida = {
      dataHora: new Date(),
      resultado,
      resultadoTexto: resultadoTexto || '',
      observacoesFinais: observacoesFinais || '',
      registradoPor: req.userId,
      registradoPorNome: supervisor?.nome || req.userNome || 'Supervisor'
    };
    atendimento.status = 'finalizado';
    atendimento.alerta24hReconhecido = true;
    atendimento.updatedAt = new Date();
    await atendimento.save();
    
    res.json({
      success: true,
      message: `Atendimento finalizado`,
      atendimento: {
        id: atendimento._id, status: atendimento.status,
        resultado, dataHoraSaida: atendimento.saida.dataHora
      }
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// REMARCAR
// ============================================
router.post('/remarcar', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const { atendimentoId, dataRemarcacao, horarioRemarcacao, motivoRemarcacao, observacoesRemarcacao } = req.body;
    if (!atendimentoId || !dataRemarcacao || !horarioRemarcacao || !motivoRemarcacao) {
      return res.status(400).json({ success: false, error: 'Preencha todos os campos obrigatórios' });
    }
    
    const atendimento = await AtendimentoSupervisao.findById(atendimentoId);
    if (!atendimento) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    
    const check = adminPodeModificar(atendimento, req);
    if (!check.permitido) {
      return res.status(403).json({ success: false, error: check.motivo, code: 'ADMIN_NAO_CRIADOR' });
    }
    
    const dataObj = new Date(dataRemarcacao + 'T00:00:00');
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    if (dataObj < hoje) {
      return res.status(400).json({ success: false, error: 'A data deve ser hoje ou futura' });
    }
    
    const supervisor = await User.findById(req.userId).select('nome');
    const remarcacao = {
      id: new mongoose.Types.ObjectId(),
      dataRemarcacao, horarioRemarcacao, motivoRemarcacao,
      observacoesRemarcacao: observacoesRemarcacao || '',
      status: 'pendente',
      criadaEm: new Date(),
      criadaPor: req.userId,
      criadaPorNome: supervisor?.nome || req.userNome || 'Supervisor'
    };
    
    if (!atendimento.remarcacoes) atendimento.remarcacoes = [];
    atendimento.remarcacoes.push(remarcacao);
    atendimento.temRemarcacaoPendente = true;
    atendimento.updatedAt = new Date();
    await atendimento.save();
    
    res.json({
      success: true,
      message: `Atendimento remarcado para ${dataObj.toLocaleDateString('pt-BR')}`,
      remarcacao: {
        id: remarcacao.id, atendimentoId: atendimento._id,
        dataRemarcacao, horarioRemarcacao, motivoRemarcacao,
        observacoesRemarcacao: remarcacao.observacoesRemarcacao,
        status: 'pendente'
      }
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// REMARCAÇÕES PENDENTES
// ============================================
router.get('/remarcacoes/pendentes', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const atendimentos = await AtendimentoSupervisao.find({
      'remarcacoes.status': 'pendente', status: { $ne: 'cancelado' }
    }).sort({ 'remarcacoes.dataRemarcacao': 1 });
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const remarcacoes = [];
    
    atendimentos.forEach(atendimento => {
      const tipos = extrairTiposTarefa(atendimento);
      (atendimento.remarcacoes || []).forEach(rem => {
        if (rem.status !== 'pendente') return;
        const dataRem = new Date(rem.dataRemarcacao + 'T00:00:00');
        remarcacoes.push({
          id: rem.id.toString(), atendimentoId: atendimento._id,
          alunoId: atendimento.alunoId, alunoNome: atendimento.alunoNome,
          alunoTurma: atendimento.alunoTurma, alunoFoto: atendimento.alunoFoto,
          tipoTarefa: atendimento.tipoTarefa,
          tiposTarefa: tipos,
          tipoTarefaLabel: labelTiposTarefa(tipos),
          dataRemarcacao: rem.dataRemarcacao, horarioRemarcacao: rem.horarioRemarcacao,
          motivoRemarcacao: rem.motivoRemarcacao,
          observacoesRemarcacao: rem.observacoesRemarcacao,
          status: rem.status,
          atrasado: dataRem < hoje,
          hoje: dataRem.getTime() === hoje.getTime(),
          criadaEm: rem.criadaEm, criadaPorNome: rem.criadaPorNome
        });
      });
    });
    
    remarcacoes.sort((a, b) => {
      if (a.atrasado && !b.atrasado) return -1;
      if (!a.atrasado && b.atrasado) return 1;
      if (a.hoje && !b.hoje) return -1;
      if (!a.hoje && b.hoje) return 1;
      return new Date(a.dataRemarcacao) - new Date(b.dataRemarcacao);
    });
    
    res.json({ success: true, total: remarcacoes.length, remarcacoes });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// BUSCAR REMARCAÇÃO POR ID
// ============================================
router.get('/remarcacoes/:id', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const atendimento = await AtendimentoSupervisao.findOne({ 'remarcacoes.id': req.params.id });
    if (!atendimento) return res.status(404).json({ success: false, error: 'Remarcação não encontrada' });
    const remarcacao = atendimento.remarcacoes.find(r => r.id.toString() === req.params.id);
    if (!remarcacao) return res.status(404).json({ success: false, error: 'Remarcação não encontrada' });
    res.json({
      success: true,
      remarcacao: {
        id: remarcacao.id.toString(), atendimentoId: atendimento._id,
        alunoId: atendimento.alunoId, alunoNome: atendimento.alunoNome,
        alunoTurma: atendimento.alunoTurma,
        dataRemarcacao: remarcacao.dataRemarcacao,
        horarioRemarcacao: remarcacao.horarioRemarcacao,
        motivoRemarcacao: remarcacao.motivoRemarcacao,
        observacoesRemarcacao: remarcacao.observacoesRemarcacao,
        status: remarcacao.status, criadaEm: remarcacao.criadaEm
      }
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// FINALIZAR REMARCAÇÃO
// ============================================
router.post('/remarcacoes/finalizar', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const { remarcacaoId, acao } = req.body;
    if (!remarcacaoId) return res.status(400).json({ success: false, error: 'ID obrigatório' });
    if (!['realizado', 'cancelado'].includes(acao)) {
      return res.status(400).json({ success: false, error: 'Ação inválida' });
    }
    
    const atendimento = await AtendimentoSupervisao.findOne({ 'remarcacoes.id': remarcacaoId });
    if (!atendimento) return res.status(404).json({ success: false, error: 'Remarcação não encontrada' });
    
    const check = adminPodeModificar(atendimento, req);
    if (!check.permitido) {
      return res.status(403).json({ success: false, error: check.motivo, code: 'ADMIN_NAO_CRIADOR' });
    }
    
    const remarcacao = atendimento.remarcacoes.find(r => r.id.toString() === remarcacaoId);
    if (!remarcacao) return res.status(404).json({ success: false, error: 'Remarcação não encontrada' });
    
    remarcacao.status = acao === 'realizado' ? 'realizado' : 'cancelado';
    remarcacao.finalizadaEm = new Date();
    remarcacao.finalizadaPor = req.userId;
    const temPendente = (atendimento.remarcacoes || []).some(r => r.status === 'pendente');
    atendimento.temRemarcacaoPendente = temPendente;
    
    if (acao === 'realizado' && atendimento.status === 'em_andamento') {
      atendimento.status = 'finalizado';
      atendimento.alerta24hReconhecido = true;
      atendimento.saida = {
        dataHora: new Date(), resultado: 'resolvido',
        resultadoTexto: 'Atendimento remarcado e realizado',
        observacoesFinais: `Remarcação realizada em ${new Date().toLocaleString('pt-BR')}`,
        registradoPor: req.userId, registradoPorNome: req.userNome
      };
    }
    
    atendimento.updatedAt = new Date();
    await atendimento.save();
    res.json({ success: true, message: acao === 'realizado' ? '✅ Realizada!' : '❌ Cancelada.' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// ATENDIMENTOS +24H
// ============================================
router.get('/atendimentos-antigos', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const agora = new Date();
    const limite24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
    
    const atendimentos = await AtendimentoSupervisao.find({
      status: 'em_andamento',
      $or: [
        { alerta24hReconhecido: false },
        { alerta24hReconhecido: { $exists: false } }
      ],
      'entrada.dataHora': { $lte: limite24h }
    }).sort({ 'entrada.dataHora': 1 });
    
    const lista = atendimentos.map(a => {
      const tempo = formatarTempoAtendimento(a.entrada.dataHora);
      const tipos = extrairTiposTarefa(a);
      return {
        id: a._id,
        alunoId: a.alunoId,
        alunoNome: a.alunoNome,
        alunoMatricula: a.alunoMatricula,
        alunoTurma: a.alunoTurma,
        alunoFoto: a.alunoFoto,
        tipoTarefa: a.tipoTarefa,
        tiposTarefa: tipos,
        tipoTarefaLabel: labelTiposTarefa(tipos),
        descricao: a.entrada.descricao,
        gravidade: a.entrada.gravidade,
        prioridade: a.prioridade,
        dataHoraEntrada: a.entrada.dataHora,
        tempoTexto: tempo.texto,
        minutosEmAndamento: tempo.minutos,
        nivelAlerta: tempo.nivel,
        registradoPorNome: a.entrada.registradoPorNome,
        registradoPor: a.entrada.registradoPor,
        ultimoAlerta24h: a.ultimoAlerta24h,
        totalAlertas24h: a.totalAlertas24h || 0,
        alerta24hReconhecido: a.alerta24hReconhecido || false,
        _criadorNome: a.entrada?.registradoPorNome || 'Desconhecido',
        entrada: {
          descricao: a.entrada.descricao,
          observacoes: a.entrada.observacoes,
          registradoPor: a.entrada.registradoPor
        }
      };
    });
    
    const listaMascarada = mascararParaAdmin(lista, req);
    res.json({ success: true, total: listaMascarada.length, atendimentos: listaMascarada });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// VERIFICAR ATENDIMENTO +24H
// ============================================
router.post('/atendimento/:id/verificar-24h', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const { acao, resultado, observacoes } = req.body;
    const atendimentoId = req.params.id;
    
    if (!['ja_encerrou', 'manter_aberto'].includes(acao)) {
      return res.status(400).json({ success: false, error: 'Ação inválida' });
    }
    
    const atendimento = await AtendimentoSupervisao.findById(atendimentoId);
    if (!atendimento) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    if (atendimento.status !== 'em_andamento') {
      return res.status(400).json({ success: false, error: 'Atendimento não está em andamento' });
    }
    
    const check = adminPodeModificar(atendimento, req);
    if (!check.permitido) {
      return res.status(403).json({ success: false, error: check.motivo, code: 'ADMIN_NAO_CRIADOR' });
    }
    
    const supervisor = await User.findById(req.userId).select('nome');
    const nomeResponsavel = supervisor?.nome || req.userNome || 'Supervisão';
    
    if (acao === 'ja_encerrou') {
      const resultadosValidos = ['resolvido', 'em_acompanhamento', 'reincidente', 'encaminhado', 'pendente'];
      const resultadoFinal = resultadosValidos.includes(resultado) ? resultado : 'resolvido';
      
      atendimento.saida = {
        dataHora: new Date(),
        resultado: resultadoFinal,
        resultadoTexto: 'Encerrado após verificação de ocorrência antiga (>24h)',
        observacoesFinais: observacoes || `Verificado e encerrado por ${nomeResponsavel} em ${new Date().toLocaleString('pt-BR')}`,
        registradoPor: req.userId, registradoPorNome: nomeResponsavel
      };
      atendimento.status = 'finalizado';
      atendimento.alerta24hReconhecido = true;
      atendimento.updatedAt = new Date();
      await atendimento.save();
      
      return res.json({
        success: true, message: 'Atendimento encerrado com sucesso!',
        atendimento: {
          id: atendimento._id, status: 'finalizado',
          resultado: resultadoFinal, dataHoraSaida: atendimento.saida.dataHora
        }
      });
    }
    
    const proximoAlerta = new Date(Date.now() + 20 * 60 * 1000);
    atendimento.ultimoAlerta24h = proximoAlerta;
    atendimento.updatedAt = new Date();
    await atendimento.save();
    
    res.json({
      success: true,
      message: 'Atendimento mantido aberto. Você será lembrado novamente em 20 minutos.',
      proximoAlerta,
      atendimento: { id: atendimento._id, status: 'em_andamento', proximoAlerta }
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

router.post('/processar-alertas-24h', async (req, res) => {
  try {
    const resultado = await processarAlertas24h();
    res.json({ success: true, ...resultado });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// DASHBOARD
// ============================================
router.get('/dashboard', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const hoje = new Date();
    const hojeStr = hoje.toISOString().split('T')[0];
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimos30Dias = new Date();
    ultimos30Dias.setDate(ultimos30Dias.getDate() - 30);
    
    const [atendimentosHoje, atendimentosSemana, atendimentosMes, total] = await Promise.all([
      AtendimentoSupervisao.countDocuments({
        'entrada.dataHora': { $gte: inicioDoDiaBrasil(hojeStr), $lte: fimDoDiaBrasil(hojeStr) }
      }),
      AtendimentoSupervisao.countDocuments({ 'entrada.dataHora': { $gte: inicioSemana } }),
      AtendimentoSupervisao.countDocuments({ 'entrada.dataHora': { $gte: inicioMes } }),
      AtendimentoSupervisao.countDocuments()
    ]);
    
    const emAndamento = await AtendimentoSupervisao.countDocuments({ status: 'em_andamento' });
    const finalizadosHoje = await AtendimentoSupervisao.countDocuments({
      status: 'finalizado',
      'saida.dataHora': { $gte: inicioDoDiaBrasil(hojeStr), $lte: fimDoDiaBrasil(hojeStr) }
    });
    
    const limite24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const atendimentosAntigos = await AtendimentoSupervisao.countDocuments({
      status: 'em_andamento',
      $or: [{ alerta24hReconhecido: false }, { alerta24hReconhecido: { $exists: false } }],
      'entrada.dataHora': { $lte: limite24h }
    });
    
    const porTipo = await AtendimentoSupervisao.aggregate([
      { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: '$tipoTarefa', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const porGravidade = await AtendimentoSupervisao.aggregate([
      { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: '$entrada.gravidade', count: { $sum: 1 } } }
    ]);
    
    const resultados = await AtendimentoSupervisao.aggregate([
      { $match: { status: 'finalizado', 'saida.resultado': { $exists: true }, 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: '$saida.resultado', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const ultimos7Dias = [];
    for (let i = 6; i >= 0; i--) {
      const data = new Date();
      data.setDate(data.getDate() - i);
      const dataStr = data.toISOString().split('T')[0];
      const count = await AtendimentoSupervisao.countDocuments({
        'entrada.dataHora': { $gte: inicioDoDiaBrasil(dataStr), $lte: fimDoDiaBrasil(dataStr) }
      });
      ultimos7Dias.push({
        data: dataStr,
        dia: data.toLocaleDateString('pt-BR', { weekday: 'short' }),
        atendimentos: count
      });
    }
    
    const porTurma = await AtendimentoSupervisao.aggregate([
      { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: '$alunoTurma', count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: 8 }
    ]);
    
    const alunosReincidentes = await AtendimentoSupervisao.aggregate([
      { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: {
        _id: '$alunoId',
        alunoNome: { $first: '$alunoNome' },
        alunoTurma: { $first: '$alunoTurma' },
        count: { $sum: 1 }
      }},
      { $match: { count: { $gte: 2 } } },
      { $sort: { count: -1 } }, { $limit: 10 }
    ]);
    
    const porHora = await AtendimentoSupervisao.aggregate([
      { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: { $hour: '$entrada.dataHora' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    const horasDistribuicao = Array(24).fill(0);
    porHora.forEach(h => { horasDistribuicao[h._id] = h.count; });
    
    res.json({
      success: true,
      metricas: { hoje: atendimentosHoje, semana: atendimentosSemana, mes: atendimentosMes, total, emAndamento, finalizadosHoje, atendimentosAntigos },
      porTipo: porTipo.map(t => ({
        tipo: t._id, label: AtendimentoSupervisao.getTipoTarefaLabel(t._id), count: t.count
      })),
      porGravidade: porGravidade.map(g => ({ gravidade: g._id, count: g.count })),
      resultados: resultados.map(r => ({
        resultado: r._id,
        label: {
          'resolvido': 'Resolvido', 'em_acompanhamento': 'Em Acompanhamento',
          'reincidente': 'Reincidente', 'encaminhado': 'Encaminhado', 'pendente': 'Pendente'
        }[r._id] || r._id,
        count: r.count
      })),
      tendencias: {
        ultimos7Dias,
        porTurma: porTurma.map(t => ({ turma: t._id || 'Sem turma', count: t.count })),
        alunosReincidentes,
        distribuicaoHoraria: horasDistribuicao
      }
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// ATENDIMENTOS ATIVOS
// ============================================
router.get('/atendimentos-ativos', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const atendimentos = await AtendimentoSupervisao.find({ status: 'em_andamento' })
      .sort({ prioridade: -1, 'entrada.dataHora': -1 });
    
    const lista = atendimentos.map(a => {
      const tempo = formatarTempoAtendimento(a.entrada.dataHora);
      const tipos = extrairTiposTarefa(a);
      return {
        id: a._id, alunoId: a.alunoId, alunoNome: a.alunoNome,
        alunoTurma: a.alunoTurma, alunoFoto: a.alunoFoto,
        tipoTarefa: a.tipoTarefa,
        tiposTarefa: tipos,
        tipoTarefaLabel: labelTiposTarefa(tipos),
        descricao: a.entrada.descricao, gravidade: a.entrada.gravidade, prioridade: a.prioridade,
        dataHoraEntrada: a.entrada.dataHora,
        tempoAtendimento: tempo.minutos, tempoTexto: tempo.texto, nivelTempo: tempo.nivel,
        alerta24hAtivo: tempo.minutos >= 1440 && !a.alerta24hReconhecido,
        totalAlertas24h: a.totalAlertas24h || 0,
        temRemarcacaoPendente: a.temRemarcacaoPendente || false,
        temAssinatura: !!(a.entrada?.assinaturaBase64),
        statusAssinatura: a.entrada?.statusAssinatura || 'nao_necessaria',
        totalParticipantes: (a.entrada?.participantes || []).length,
        participantesComAssinatura: (a.entrada?.participantes || []).filter(p => p.temAssinatura).length,
        entrada: {
          descricao: a.entrada.descricao, observacoes: a.entrada.observacoes,
          registradoPor: a.entrada.registradoPor,
          registradoPorNome: a.entrada.registradoPorNome
        },
        _criadorNome: a.entrada?.registradoPorNome || 'Desconhecido'
      };
    });
    
    const listaMascarada = mascararParaAdmin(lista, req);
    res.json({ success: true, total: listaMascarada.length, atendimentos: listaMascarada });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// LISTAR ATENDIMENTOS (COM FILTROS E PAGINAÇÃO)
// ============================================
router.get('/atendimentos', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const { limit = 100, page = 1, tipo, status, turma, dataInicio, dataFim, busca, resultado } = req.query;
    
    let query = {};
    if (tipo && tipo !== 'todos') query.tipoTarefa = tipo;
    if (status && status !== 'todos') query.status = status;
    if (turma && turma !== 'todas') query.alunoTurma = turma;
    
    if (dataInicio || dataFim) {
      query['entrada.dataHora'] = {};
      if (dataInicio) query['entrada.dataHora'].$gte = inicioDoDiaBrasil(dataInicio);
      if (dataFim) query['entrada.dataHora'].$lte = fimDoDiaBrasil(dataFim);
    }
    
    if (busca && busca.trim() !== '') {
      const termo = busca.trim();
      query.$or = [
        { alunoNome: { $regex: termo, $options: 'i' } },
        { alunoMatricula: { $regex: termo, $options: 'i' } }
      ];
    }
    
    if (resultado && resultado !== 'todos' && resultado !== '') {
      query['saida.resultado'] = resultado;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [atendimentos, total] = await Promise.all([
      AtendimentoSupervisao.find(query).sort({ 'entrada.dataHora': -1 }).skip(skip).limit(parseInt(limit)),
      AtendimentoSupervisao.countDocuments(query)
    ]);
    
    const turmasAtendimento = await AtendimentoSupervisao.distinct('alunoTurma');
    const turmasAlunos = await User.distinct('turma', { 
      role: 'aluno', ativo: true, turma: { $nin: [null, '', 'Não informada'] } 
    });
    const turmasDisponiveis = [...new Set([
      ...turmasAtendimento.filter(t => t && t !== 'Não informada'),
      ...turmasAlunos
    ])].sort();
    
    const lista = atendimentos.map(a => {
      const tempo = formatarTempoAtendimento(a.entrada.dataHora);
      const tipos = extrairTiposTarefa(a);
      return {
        id: a._id, alunoId: a.alunoId, alunoNome: a.alunoNome,
        alunoMatricula: a.alunoMatricula, alunoTurma: a.alunoTurma, alunoCurso: a.alunoCurso,
        tipoTarefa: a.tipoTarefa,
        tiposTarefa: tipos,
        tipoTarefaLabel: labelTiposTarefa(tipos),
        descricao: a.entrada.descricao, gravidade: a.entrada.gravidade, prioridade: a.prioridade,
        status: a.status, dataEntrada: a.entrada.dataHora,
        dataEntradaFormatada: new Date(a.entrada.dataHora).toLocaleString('pt-BR'),
        tempoTexto: tempo.texto, tempoMinutos: tempo.minutos,
        registradoPor: a.entrada.registradoPorNome, registradoPorId: a.entrada.registradoPor,
        temAssinatura: !!(a.entrada?.assinaturaBase64),
        statusAssinatura: a.entrada?.statusAssinatura || 'nao_necessaria',
        totalParticipantes: (a.entrada?.participantes || []).length,
        saida: a.saida ? {
          dataHora: a.saida.dataHora,
          dataHoraFormatada: new Date(a.saida.dataHora).toLocaleString('pt-BR'),
          resultado: a.saida.resultado,
          resultadoTexto: {
            'resolvido': 'Resolvido', 'em_acompanhamento': 'Em Acompanhamento',
            'reincidente': 'Reincidente', 'encaminhado': 'Encaminhado', 'pendente': 'Pendente'
          }[a.saida.resultado] || a.saida.resultado,
          observacoesFinais: a.saida.observacoesFinais,
          registradoPor: a.saida.registradoPorNome
        } : null,
        createdAt: a.createdAt,
        entrada: {
          descricao: a.entrada.descricao, observacoes: a.entrada.observacoes,
          registradoPor: a.entrada.registradoPor
        },
        _criadorNome: a.entrada?.registradoPorNome || 'Desconhecido'
      };
    });
    
    const listaMascarada = mascararParaAdmin(lista, req);
    res.json({
      success: true, total,
      page: parseInt(page), limit: parseInt(limit),
      totalPages: Math.ceil(total / parseInt(limit)),
      turmasDisponiveis,
      atendimentos: listaMascarada
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// BUSCAR ATENDIMENTO POR ID (TODOS OS CAMPOS)
// ============================================
router.get('/atendimento/:id', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const atendimento = await AtendimentoSupervisao.findById(req.params.id);
    if (!atendimento) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    
    const tempo = formatarTempoAtendimento(atendimento.entrada.dataHora);
    const tipos = extrairTiposTarefa(atendimento);
    const detalhesLimpos = lerDetalhesLimpos(atendimento);
    
    const payload = {
      id: atendimento._id, alunoId: atendimento.alunoId, alunoNome: atendimento.alunoNome,
      alunoMatricula: atendimento.alunoMatricula, alunoTurma: atendimento.alunoTurma,
      alunoCurso: atendimento.alunoCurso,
      tipoTarefa: atendimento.tipoTarefa,
      tiposTarefa: tipos,
      tipoTarefaLabel: labelTiposTarefa(tipos),
      entrada: {
        dataHora: atendimento.entrada.dataHora,
        dataHoraFormatada: new Date(atendimento.entrada.dataHora).toLocaleString('pt-BR'),
        descricao: atendimento.entrada.descricao,
        observacoes: atendimento.entrada.observacoes,
        gravidade: atendimento.entrada.gravidade,
        registradoPor: atendimento.entrada.registradoPor,
        registradoPorNome: atendimento.entrada.registradoPorNome,
        temAssinatura: !!(atendimento.entrada?.assinaturaBase64),
        statusAssinatura: atendimento.entrada?.statusAssinatura || 'nao_necessaria',
        assinaturaBase64: atendimento.entrada?.assinaturaBase64 || null,
        assinadaEm: atendimento.entrada?.assinadaEm || null,
        assinadaPorNome: atendimento.entrada?.assinadaPorNome || null,
        sessaoAssinaturaId: atendimento.entrada?.sessaoAssinaturaId || null,
        participantes: (atendimento.entrada?.participantes || []).map(p => ({
          id: p._id,
          usuarioId: p.usuarioId,
          usuarioNome: p.usuarioNome,
          usuarioMatricula: p.usuarioMatricula,
          usuarioFoto: p.usuarioFoto,
          tipo: p.tipo,
          tipoLabel: p.tipoLabel,
          turma: p.turma,
          eixo: p.eixo,
          filtroValor: p.filtroValor,
          precisaAssinatura: p.precisaAssinatura,
          temAssinatura: p.temAssinatura,
          assinaturaBase64: p.assinaturaBase64 || null,
          assinadaEm: p.assinadaEm,
          assinadaPorNome: p.assinadaPorNome
        }))
      },
      detalhes: detalhesLimpos,
      saida: atendimento.saida ? {
        dataHora: atendimento.saida.dataHora,
        dataHoraFormatada: new Date(atendimento.saida.dataHora).toLocaleString('pt-BR'),
        resultado: atendimento.saida.resultado,
        resultadoTexto: atendimento.saida.resultadoTexto,
        observacoesFinais: atendimento.saida.observacoesFinais,
        registradoPor: atendimento.saida.registradoPorNome
      } : null,
      status: atendimento.status, prioridade: atendimento.prioridade,
      remarcacoes: atendimento.remarcacoes || [],
      temRemarcacaoPendente: atendimento.temRemarcacaoPendente || false,
      anexos: atendimento.anexos, createdAt: atendimento.createdAt,
      tempoTexto: tempo.texto, tempoMinutos: tempo.minutos, nivelTempo: tempo.nivel,
      alerta24hAtivo: tempo.minutos >= 1440 && !atendimento.alerta24hReconhecido,
      totalAlertas24h: atendimento.totalAlertas24h || 0,
      alerta24hReconhecido: atendimento.alerta24hReconhecido || false,
      ultimoAlerta24h: atendimento.ultimoAlerta24h || null
    };
    
    const payloadMascarado = mascararParaAdmin(payload, req);
    res.json({ success: true, atendimento: payloadMascarado });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// EDITAR (MÚLTIPLOS TIPOS E TODOS OS CAMPOS)
// ============================================
router.put('/atendimento/:id', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const atendimento = await AtendimentoSupervisao.findById(req.params.id);
    if (!atendimento) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    
    const check = adminPodeModificar(atendimento, req);
    if (!check.permitido) {
      return res.status(403).json({ success: false, error: check.motivo, code: 'ADMIN_NAO_CRIADOR' });
    }
    
    const { 
      tiposTarefa, tipoTarefa, descricao, observacoes, gravidade, prioridade, 
      detalhes, status, saida, participantes
    } = req.body;
    
    // ============================================================
    // 1) TIPOS
    // ============================================================
    let tiposFinal = null;
    if (Array.isArray(tiposTarefa) && tiposTarefa.length > 0) {
      tiposFinal = [...new Set(tiposTarefa.filter(Boolean))];
    } else if (tipoTarefa) {
      tiposFinal = [tipoTarefa];
    }
    
    // Lê detalhes atuais com getters (descriptografado)
    const detalhesAtuaisLimpos = lerDetalhesLimpos(atendimento);
    
    // Preserva tipos adicionais (campo interno não criptografado)
    const tiposAdicionaisAtuais = atendimento.detalhes?.tiposTarefaAdicionais 
      ? [...atendimento.detalhes.tiposTarefaAdicionais]
      : [];
    
    let tiposAdicionaisFinal = tiposAdicionaisAtuais;
    if (tiposFinal && tiposFinal.length > 0) {
      atendimento.tipoTarefa = tiposFinal[0];
      tiposAdicionaisFinal = tiposFinal.length > 1 ? tiposFinal.slice(1) : [];
    }
    
    // ============================================================
    // 2) CAMPOS SIMPLES
    // ============================================================
    if (descricao !== undefined) atendimento.entrada.descricao = descricao;
    if (observacoes !== undefined) atendimento.entrada.observacoes = observacoes;
    if (gravidade) atendimento.entrada.gravidade = gravidade;
    if (prioridade) atendimento.prioridade = prioridade;
    
    // ============================================================
    // 3) DETALHES (merge com os que vieram do front)
    // ============================================================
    const detalhesParaSalvar = { ...detalhesAtuaisLimpos };
    
    if (detalhes && typeof detalhes === 'object') {
      Object.entries(detalhes).forEach(([k, v]) => {
        if (k === 'tiposTarefaAdicionais') return;
        if (v === undefined) return;
        detalhesParaSalvar[k] = v;
      });
    }
    
    // Recoloca os tipos adicionais (campo interno)
    detalhesParaSalvar.tiposTarefaAdicionais = tiposAdicionaisFinal;
    
    // 🎯 CORREÇÃO CRÍTICA: aplicar campo a campo via .set()
    // Atribuição direta em subdocumento NÃO dispara setters (criptografar).
    if (!atendimento.detalhes) {
      atendimento.detalhes = {};
    }
    
    Object.entries(detalhesParaSalvar).forEach(([k, v]) => {
      if (v === undefined) return;
      
      if (k === 'testemunhas' && Array.isArray(v)) {
        atendimento.detalhes.set('testemunhas', v.map(x => x || ''));
        return;
      }
      
      if (k === 'tiposTarefaAdicionais') {
        atendimento.detalhes.set('tiposTarefaAdicionais', v);
        return;
      }
      
      if (v instanceof Date || typeof v === 'boolean' || typeof v === 'number') {
        atendimento.detalhes.set(k, v);
        return;
      }
      
      atendimento.detalhes.set(k, v);
    });
    
    atendimento.markModified('detalhes');
    
    // ============================================================
    // 4) STATUS
    // ============================================================
    if (status) atendimento.status = status;
    
    // ============================================================
    // 5) PARTICIPANTES
    // ============================================================
    if (Array.isArray(participantes)) {
      const participantesProcessados = participantes
        .filter(p => p && p.usuarioId && p.usuarioNome)
        .map(p => {
          let assinaturaPartValida = '';
          if (p.assinaturaBase64 && typeof p.assinaturaBase64 === 'string') {
            if (p.assinaturaBase64.startsWith('data:image/') && p.assinaturaBase64.length < 500000) {
              assinaturaPartValida = p.assinaturaBase64;
            }
          }
          return {
            _id: p._id || undefined,
            usuarioId: p.usuarioId,
            usuarioNome: p.usuarioNome,
            usuarioMatricula: p.usuarioMatricula || null,
            usuarioFoto: p.usuarioFoto || null,
            tipo: p.tipo || 'outros',
            tipoLabel: p.tipoLabel || p.tipo || 'Outros',
            turma: p.turma || null,
            eixo: p.eixo || null,
            filtroValor: p.filtroValor || '',
            precisaAssinatura: !!p.precisaAssinatura,
            assinaturaBase64: assinaturaPartValida,
            temAssinatura: assinaturaPartValida.length > 100,
            assinadaEm: assinaturaPartValida.length > 100 ? (p.assinadaEm || new Date()) : null,
            assinadaPorNome: assinaturaPartValida.length > 100 ? (p.assinadaPorNome || p.usuarioNome) : null,
            sessaoAssinaturaId: p.sessaoId || p.sessaoAssinaturaId || null
          };
        });
      
      atendimento.entrada.participantes = participantesProcessados;
    }
    
    // ============================================================
    // 6) SAÍDA
    // ============================================================
    if (saida) {
      atendimento.saida = { 
        ...atendimento.saida, ...saida,
        registradoPor: req.userId, registradoPorNome: req.userNome 
      };
      if (atendimento.status === 'finalizado') {
        atendimento.alerta24hReconhecido = true;
      }
    }
    
    atendimento.updatedAt = new Date();
    await atendimento.save();
    
    const tiposFinais = extrairTiposTarefa(atendimento);
    
    res.json({ 
      success: true, 
      message: 'Atualizado', 
      atendimento: { 
        id: atendimento._id,
        tiposTarefa: tiposFinais,
        totalParticipantes: (atendimento.entrada.participantes || []).length
      } 
    });
  } catch (error) { 
    console.error('[PUT atendimento] Erro:', error);
    res.status(500).json({ success: false, error: error.message }); 
  }
});

// ============================================
// EXCLUIR
// ============================================
router.delete('/atendimento/:id', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const atendimento = await AtendimentoSupervisao.findById(req.params.id);
    if (!atendimento) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    
    const check = adminPodeModificar(atendimento, req);
    if (!check.permitido) {
      return res.status(403).json({ success: false, error: check.motivo, code: 'ADMIN_NAO_CRIADOR' });
    }
    
    await AtendimentoSupervisao.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Excluído com sucesso' });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// EXCLUSÃO EM MASSA
// ============================================
router.post('/atendimentos/exclusao-massa', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    if (req.userRole === 'super_admin') {
      return res.status(403).json({ success: false, error: 'Apenas a Supervisão', code: 'ADMIN_SEM_PERMISSAO_MASSA' });
    }
    const { dataCorte, status = 'finalizado', confirmacao } = req.body;
    if (confirmacao !== 'CONFIRMAR') {
      return res.status(400).json({ success: false, error: 'Confirmação inválida' });
    }
    if (!dataCorte) return res.status(400).json({ success: false, error: 'Data obrigatória' });
    
    const dataObj = fimDoDiaBrasil(dataCorte);
    if (isNaN(dataObj.getTime())) return res.status(400).json({ success: false, error: 'Data inválida' });
    
    const filtro = { status, 'saida.dataHora': { $lt: dataObj } };
    const totalAntes = await AtendimentoSupervisao.countDocuments(filtro);
    if (totalAntes === 0) {
      return res.json({ success: true, message: 'Nenhum', excluidos: 0 });
    }
    const resultado = await AtendimentoSupervisao.deleteMany(filtro);
    res.json({ success: true, message: `${resultado.deletedCount} excluído(s)`, excluidos: resultado.deletedCount, dataCorte, status });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// RELATÓRIO POR ALUNO
// ============================================
router.get('/relatorio/aluno/:alunoId', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;
    let query = { alunoId: req.params.alunoId };
    if (dataInicio || dataFim) {
      query['entrada.dataHora'] = {};
      if (dataInicio) query['entrada.dataHora'].$gte = inicioDoDiaBrasil(dataInicio);
      if (dataFim) query['entrada.dataHora'].$lte = fimDoDiaBrasil(dataFim);
    }
    const atendimentos = await AtendimentoSupervisao.find(query).sort({ 'entrada.dataHora': -1 });
    const aluno = await User.findById(req.params.alunoId).select('nome matricula turma curso');
    const porTipo = {};
    const porGravidade = {};
    
    atendimentos.forEach(a => {
      porTipo[a.tipoTarefa] = (porTipo[a.tipoTarefa] || 0) + 1;
      porGravidade[a.entrada.gravidade] = (porGravidade[a.entrada.gravidade] || 0) + 1;
    });
    
    res.json({
      success: true,
      aluno: { id: aluno._id, nome: aluno.nome, matricula: aluno.matricula, turma: aluno.turma, curso: aluno.curso },
      periodo: { dataInicio, dataFim },
      estatisticas: {
        totalAtendimentos: atendimentos.length,
        porTipo: Object.entries(porTipo).map(([tipo, count]) => ({
          tipo, label: AtendimentoSupervisao.getTipoTarefaLabel(tipo), count
        })),
        porGravidade,
        emAndamento: atendimentos.filter(a => a.status === 'em_andamento').length,
        finalizados: atendimentos.filter(a => a.status === 'finalizado').length
      },
      atendimentos: atendimentos.map(a => {
        const tempo = formatarTempoAtendimento(a.entrada.dataHora);
        const tipos = extrairTiposTarefa(a);
        return {
          id: a._id, tipoTarefa: a.tipoTarefa,
          tiposTarefa: tipos,
          tipoTarefaLabel: labelTiposTarefa(tipos),
          dataEntrada: a.entrada.dataHora, descricao: a.entrada.descricao,
          gravidade: a.entrada.gravidade, status: a.status,
          dataSaida: a.saida?.dataHora || null, resultado: a.saida?.resultado || null,
          tempoTexto: tempo.texto,
          temAssinatura: !!(a.entrada?.assinaturaBase64),
          assinaturaBase64: a.entrada?.assinaturaBase64 || null,
          totalParticipantes: (a.entrada?.participantes || []).length
        };
      })
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// RELATÓRIO POR TURMA
// ============================================
router.get('/relatorio/turma/:turma', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;
    let query = { alunoTurma: req.params.turma };
    if (dataInicio || dataFim) {
      query['entrada.dataHora'] = {};
      if (dataInicio) query['entrada.dataHora'].$gte = inicioDoDiaBrasil(dataInicio);
      if (dataFim) query['entrada.dataHora'].$lte = fimDoDiaBrasil(dataFim);
    }
    const atendimentos = await AtendimentoSupervisao.find(query).sort({ 'entrada.dataHora': -1 });
    const porAluno = {};
    const porTipo = {};
    
    atendimentos.forEach(a => {
      const key = a.alunoId.toString();
      if (!porAluno[key]) {
        porAluno[key] = { 
          alunoId: a.alunoId, alunoNome: a.alunoNome,
          alunoMatricula: a.alunoMatricula, total: 0, tipos: {} 
        };
      }
      porAluno[key].total++;
      porAluno[key].tipos[a.tipoTarefa] = (porAluno[key].tipos[a.tipoTarefa] || 0) + 1;
      porTipo[a.tipoTarefa] = (porTipo[a.tipoTarefa] || 0) + 1;
    });
    
    res.json({
      success: true, turma: req.params.turma,
      periodo: { dataInicio, dataFim },
      estatisticas: {
        totalAtendimentos: atendimentos.length,
        totalAlunosAtendidos: Object.keys(porAluno).length,
        porTipo: Object.entries(porTipo).map(([tipo, count]) => ({
          tipo, label: AtendimentoSupervisao.getTipoTarefaLabel(tipo), count
        }))
      },
      porAluno: Object.values(porAluno).sort((a, b) => b.total - a.total),
      atendimentos: atendimentos.map(a => {
        const tempo = formatarTempoAtendimento(a.entrada.dataHora);
        const tipos = extrairTiposTarefa(a);
        return {
          id: a._id, alunoNome: a.alunoNome,
          tipoTarefa: a.tipoTarefa,
          tiposTarefa: tipos,
          tipoTarefaLabel: labelTiposTarefa(tipos),
          dataEntrada: a.entrada.dataHora, descricao: a.entrada.descricao,
          gravidade: a.entrada.gravidade, status: a.status,
          tempoTexto: tempo.texto
        };
      })
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// RELATÓRIO GERAL
// ============================================
router.get('/relatorio/geral', authenticateToken, verificarSupervisao, async (req, res) => {
  try {
    const { dataInicio, dataFim, turma, tipo } = req.query;
    let query = {};
    if (turma && turma !== 'todas') query.alunoTurma = turma;
    if (tipo && tipo !== 'todos') query.tipoTarefa = tipo;
    
    if (dataInicio || dataFim) {
      query['entrada.dataHora'] = {};
      if (dataInicio) query['entrada.dataHora'].$gte = inicioDoDiaBrasil(dataInicio);
      if (dataFim) query['entrada.dataHora'].$lte = fimDoDiaBrasil(dataFim);
    }
    
    const [atendimentos, total, comAssinatura] = await Promise.all([
      AtendimentoSupervisao.find(query).sort({ 'entrada.dataHora': -1 }).limit(1000),
      AtendimentoSupervisao.countDocuments(query),
      AtendimentoSupervisao.countDocuments({ ...query, 'entrada.temAssinatura': true })
    ]);
    
    const porTurma = {};
    const porTipo = {};
    const porGravidade = {};
    
    atendimentos.forEach(a => {
      if (!porTurma[a.alunoTurma]) {
        porTurma[a.alunoTurma] = { turma: a.alunoTurma, total: 0, alunos: new Set() };
      }
      porTurma[a.alunoTurma].total++;
      porTurma[a.alunoTurma].alunos.add(a.alunoId.toString());
      porTipo[a.tipoTarefa] = (porTipo[a.tipoTarefa] || 0) + 1;
      porGravidade[a.entrada.gravidade] = (porGravidade[a.entrada.gravidade] || 0) + 1;
    });
    
    Object.values(porTurma).forEach(t => {
      t.totalAlunos = t.alunos.size;
      delete t.alunos;
    });
    
    const turmasAtendimento = await AtendimentoSupervisao.distinct('alunoTurma');
    const turmasAlunos = await User.distinct('turma', { 
      role: 'aluno', ativo: true, turma: { $nin: [null, '', 'Não informada'] } 
    });
    const turmas = [...new Set([
      ...turmasAtendimento.filter(t => t && t !== 'Não informada'),
      ...turmasAlunos
    ])].sort();
    
    res.json({
      success: true,
      filtros: { dataInicio, dataFim, turma, tipo },
      turmasDisponiveis: turmas,
      totalAtendimentos: total,
      comAssinatura,
      porTurma: Object.values(porTurma).sort((a, b) => b.total - a.total),
      porTipo: Object.entries(porTipo).map(([t, count]) => ({
        tipo: t, label: AtendimentoSupervisao.getTipoTarefaLabel(t), count
      })).sort((a, b) => b.count - a.count),
      porGravidade,
      registros: atendimentos.map(a => {
        const tempo = formatarTempoAtendimento(a.entrada.dataHora);
        const tipos = extrairTiposTarefa(a);
        return {
          id: a._id, alunoNome: a.alunoNome, alunoMatricula: a.alunoMatricula,
          alunoTurma: a.alunoTurma, tipoTarefa: a.tipoTarefa,
          tiposTarefa: tipos,
          tipoTarefaLabel: labelTiposTarefa(tipos),
          dataEntrada: a.entrada.dataHora,
          dataFormatada: new Date(a.entrada.dataHora).toLocaleDateString('pt-BR'),
          descricao: a.entrada.descricao, gravidade: a.entrada.gravidade,
          prioridade: a.prioridade, status: a.status,
          tempoTexto: tempo.texto,
          temAssinatura: !!(a.entrada?.assinaturaBase64),
          assinaturaBase64: a.entrada?.assinaturaBase64 || null,
          registradoPorNome: a.entrada?.registradoPorNome,
          totalParticipantes: (a.entrada?.participantes || []).length
        };
      }),
      atendimentos: atendimentos.slice(0, 100).map(a => {
        const tempo = formatarTempoAtendimento(a.entrada.dataHora);
        const tipos = extrairTiposTarefa(a);
        return {
          id: a._id, alunoNome: a.alunoNome, alunoTurma: a.alunoTurma,
          tipoTarefa: a.tipoTarefa,
          tiposTarefa: tipos,
          tipoTarefaLabel: labelTiposTarefa(tipos),
          dataEntrada: a.entrada.dataHora,
          descricao: a.entrada.descricao.substring(0, 100),
          gravidade: a.entrada.gravidade, status: a.status,
          tempoTexto: tempo.texto,
          temAssinatura: !!(a.entrada?.assinaturaBase64),
          assinaturaBase64: a.entrada?.assinaturaBase64 || null
        };
      })
    });
  } catch (error) { res.status(500).json({ success: false, error: error.message }); }
});

// ============================================
// SCHEDULER
// ============================================
let schedulerInterval = null;

function iniciarSchedulerAlertas24h() {
  if (schedulerInterval) clearInterval(schedulerInterval);
  setTimeout(async () => { await processarAlertas24h(); }, 30000);
  schedulerInterval = setInterval(async () => { await processarAlertas24h(); }, 5 * 60 * 1000);
  console.log('⏰ [SCHEDULER SUP] Agendador iniciado');
}

iniciarSchedulerAlertas24h();

router.pararScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
};

module.exports = router;