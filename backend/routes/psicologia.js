// routes/psicologia.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const AtendimentoPsicologia = require('../models/AtendimentoPsicologia');
const SessaoAssinatura = require('../models/SessaoAssinatura');
const Notificacao = require('../models/Notificacao');

// ============================================
// MASCARAR DADOS SENSÍVEIS
// ============================================
const MASCARA_TEXTO = '🔒 Conteúdo protegido (visível apenas para o profissional responsável)';
const ROLES_MASCARADOS = ['super_admin'];

function mascararParaAdmin(dados, req) {
  if (!req?.userRole || !ROLES_MASCARADOS.includes(req.userRole)) return dados;
  if (Array.isArray(dados)) return dados.map(item => mascararItem(item, req));
  return mascararItem(dados, req);
}

function mascararItem(item, req) {
  if (!item) return item;
  const obj = item.toObject ? item.toObject() : JSON.parse(JSON.stringify(item));
  const adminId = req.userId?.toString();
  const criadorId = (obj.entrada?.registradoPor || obj.registradoPorId || obj.criadoPor)?.toString();
  
  if (criadorId && adminId && criadorId === adminId) {
    obj._mascarado = false;
    obj._criadoPorMim = true;
    return obj;
  }
  
  obj._mascarado = true;
  obj._criadoPorMim = false;
  
  if (obj.entrada) {
    if (obj.entrada.descricao) obj.entrada.descricao = MASCARA_TEXTO;
    if (obj.entrada.observacoes) obj.entrada.observacoes = MASCARA_TEXTO;
    if (obj.entrada.assinaturaBase64) obj.entrada.assinaturaBase64 = null;
  }
  if (obj.descricao) obj.descricao = MASCARA_TEXTO;
  if (obj.saida) {
    if (obj.saida.resultadoTexto) obj.saida.resultadoTexto = MASCARA_TEXTO;
    if (obj.saida.observacoesFinais) obj.saida.observacoesFinais = MASCARA_TEXTO;
  }
  if (obj.detalhes && typeof obj.detalhes === 'object') {
    Object.keys(obj.detalhes).forEach(chave => {
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

// ============================================
// FORMATAR TEMPO
// ============================================
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

// ============================================
// NOTIFICAÇÃO INTERNA
// ============================================
async function criarNotificacaoInterna({ usuarioId, titulo, mensagem, tipo, link, icone, cor, metadata }) {
  const TIPOS_VALIDOS = ['resultado_liberado', 'resultado_editado', 'prova_corrigida', 'sistema', 'cancelamento'];
  const tipoFinal = TIPOS_VALIDOS.includes(tipo) ? tipo : 'sistema';
  
  const notif = new Notificacao({
    usuarioId,
    titulo,
    mensagem,
    tipo: tipoFinal,
    link: link || '/psicologia.html',
    icone: icone || '⏰',
    cor: cor || '#f59e0b',
    lida: false,
    metadata: metadata || {}
  });
  await notif.save();
  return notif;
}

// ============================================
// PROCESSAR ALERTAS 24H
// Envia 1 notificação por dia por atendimento
// ============================================
async function processarAlertas24h() {
  const atendimentos = await AtendimentoPsicologia.buscarAtendimentosParaAlerta();
  if (atendimentos.length === 0) return { processados: 0, pulados: 0 };
  
  let processados = 0;
  let pulados = 0;
  const agora = new Date();
  const INTERVALO_MINIMO_MS = 24 * 60 * 60 * 1000; // 24 horas entre alertas
  
  for (const atendimento of atendimentos) {
    const registradoPor = atendimento.entrada?.registradoPor;
    if (!registradoPor) continue;
    
    // 🛡️ Só envia se passou 24h desde o último alerta
    if (atendimento.ultimoAlerta24h) {
      const diff = agora - new Date(atendimento.ultimoAlerta24h);
      if (diff < INTERVALO_MINIMO_MS) {
        pulados++;
        continue;
      }
    }
    
    const tempo = formatarTempoAtendimento(atendimento.entrada.dataHora);
    const tipoLabel = AtendimentoPsicologia.getTipoTarefaLabel(atendimento.tipoTarefa);
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
        titulo: `⏰ Atendimento há mais de ${nivelLabel} em andamento`,
        mensagem: `O atendimento de ${atendimento.alunoNome} (${tipoLabel}) está em andamento há ${tempo.texto}. Verifique se já foi encerrado.`,
        tipo: 'sistema',
        link: `/psicologia.html?verificar=${atendimento._id}`,
        icone: '⏰',
        cor: '#dc2626',
        metadata: {
          atendimentoId: atendimento._id.toString(),
          alunoId: atendimento.alunoId.toString(),
          alunoNome: atendimento.alunoNome,
          minutosEmAndamento: tempo.minutos,
          tempoTexto: tempo.texto,
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

const verificarPsicologia = (req, res, next) => {
  const allowedRoles = ['psicologia', 'super_admin'];
  if (!allowedRoles.includes(req.userRole)) {
    return res.status(403).json({ success: false, error: 'Acesso permitido apenas para Psicologia' });
  }
  next();
};

function inicioDoDiaBrasil(dataStr) {
  return new Date(dataStr + 'T00:00:00.000-03:00');
}
function fimDoDiaBrasil(dataStr) {
  return new Date(dataStr + 'T23:59:59.999-03:00');
}

// ============================================
// HEALTH CHECK
// Retorna status do serviço (online/versão/timestamp)
// ============================================
router.get('/health', (req, res) => {
  res.json({ 
    success: true, 
    status: 'online', 
    service: 'Psicologia',
    versao: '2.0-alertas-24h',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// MIGRAÇÃO
// Inicializa campos de alerta 24h em atendimentos existentes
// ============================================
router.post('/admin/migrar-alertas-24h', async (req, res) => {
  try {
    const resultado = await AtendimentoPsicologia.updateMany(
      { status: 'em_andamento', alerta24hReconhecido: { $exists: false } },
      { $set: { ultimoAlerta24h: null, alerta24hReconhecido: false, totalAlertas24h: 0 } }
    );
    res.json({ success: true, modified: resultado.modifiedCount });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// TURMAS E ALUNOS
// ============================================

// Lista todas as turmas distintas de alunos ativos
router.get('/turmas', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const turmas = await User.distinct('turma', { 
      role: 'aluno', ativo: true, turma: { $nin: [null, '', 'Não informada'] } 
    });
    res.json({ success: true, turmas: turmas.sort() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Lista alunos de uma turma específica
router.get('/alunos-por-turma', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const { turma } = req.query;
    if (!turma) return res.status(400).json({ success: false, error: 'Turma é obrigatória' });
    
    const alunos = await User.find({ role: 'aluno', ativo: true, turma })
      .select('nome matricula turma curso fotoPerfil').sort({ nome: 1 });
    
    res.json({
      success: true, total: alunos.length,
      alunos: alunos.map(a => ({
        id: a._id, nome: a.nome, matricula: a.matricula,
        turma: a.turma, curso: a.curso, fotoPerfil: a.fotoPerfil
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Busca dados completos de um aluno (atendimentos ativos + histórico recente)
router.get('/aluno/:id', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const aluno = await User.findOne({ _id: req.params.id, ativo: true })
      .select('nome email matricula curso turma fotoPerfil role');
    
    if (!aluno) return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    if (aluno.role !== 'aluno') return res.status(400).json({ success: false, error: 'Usuário não é aluno' });
    
    const atendimentosAtivos = await AtendimentoPsicologia.find({
      alunoId: aluno._id, status: 'em_andamento'
    }).sort({ createdAt: -1 });
    
    const historicoRecente = await AtendimentoPsicologia.find({
      alunoId: aluno._id, status: 'finalizado'
    }).sort({ createdAt: -1 }).limit(5);
    
    res.json({
      success: true,
      aluno: {
        id: aluno._id, nome: aluno.nome, matricula: aluno.matricula,
        turma: aluno.turma, curso: aluno.curso, fotoPerfil: aluno.fotoPerfil || null
      },
      atendimentosAtivos: atendimentosAtivos.map(a => ({
        id: a._id, tipoTarefa: a.tipoTarefa,
        tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(a.tipoTarefa),
        descricao: a.entrada.descricao, dataHoraEntrada: a.entrada.dataHora, prioridade: a.prioridade
      })),
      historicoRecente: historicoRecente.map(a => ({
        id: a._id, tipoTarefa: a.tipoTarefa,
        tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(a.tipoTarefa),
        descricao: a.entrada.descricao, dataHora: a.entrada.dataHora, resultado: a.saida?.resultado
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Busca alunos por nome ou matrícula (mínimo 2 caracteres)
router.get('/buscar-aluno', authenticateToken, verificarPsicologia, async (req, res) => {
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
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// REGISTRAR ATENDIMENTO
// Cria um novo atendimento psicológico (assinatura opcional)
// ============================================
router.post('/registrar', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const { 
      alunoId, tipoTarefa, descricao, observacoes, gravidade, prioridade, detalhes,
      precisaAssinatura = false
    } = req.body;
    
    if (!descricao || descricao.trim() === '') {
      return res.status(400).json({ success: false, error: 'A descrição é obrigatória' });
    }
    
    const tiposValidos = [
      'escuta_acolhimento', 'manejo_crises_emocionais', 'atividades_grupos',
      'acoes_atividades_saude', 'acoes_socioemocionais_culturais', 'outros'
    ];
    
    if (!tiposValidos.includes(tipoTarefa)) {
      return res.status(400).json({ success: false, error: 'Tipo de tarefa inválido' });
    }
    
    const aluno = await User.findById(alunoId);
    if (!aluno || aluno.role !== 'aluno') {
      return res.status(404).json({ success: false, error: 'Aluno não encontrado' });
    }
    
    const psicologo = await User.findById(req.userId).select('nome');
    const statusAssinatura = precisaAssinatura ? 'pendente' : 'nao_necessaria';
    
    const atendimento = new AtendimentoPsicologia({
      alunoId: aluno._id,
      alunoNome: aluno.nome,
      alunoMatricula: aluno.matricula,
      alunoTurma: aluno.turma || 'Não informada',
      alunoCurso: aluno.curso || 'Não informado',
      alunoFoto: aluno.fotoPerfil,
      tipoTarefa,
      entrada: {
        dataHora: new Date(),
        descricao: descricao.trim(),
        observacoes: observacoes || '',
        gravidade: gravidade || 'media',
        registradoPor: req.userId,
        registradoPorNome: psicologo?.nome || req.userNome || 'Psicologia',
        assinaturaBase64: '',
        temAssinatura: false,
        statusAssinatura: statusAssinatura,
        assinadaEm: null,
        assinadaPor: null,
        assinadaPorNome: null,
        sessaoAssinaturaId: null
      },
      detalhes: detalhes || {},
      prioridade: prioridade || 'normal',
      status: 'em_andamento',
      ultimoAlerta24h: null,
      alerta24hReconhecido: false,
      totalAlertas24h: 0
    });
    
    await atendimento.save();
    
    res.json({
      success: true,
      message: `${AtendimentoPsicologia.getTipoTarefaLabel(tipoTarefa)} registrado para ${aluno.nome}${statusAssinatura === 'pendente' ? ' — aguardando assinatura' : ''}`,
      atendimento: {
        id: atendimento._id,
        tipoTarefa: atendimento.tipoTarefa,
        tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(tipoTarefa),
        status: atendimento.status,
        dataHora: atendimento.entrada.dataHora,
        temAssinatura: atendimento.entrada.temAssinatura,
        statusAssinatura: atendimento.entrada.statusAssinatura
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// APLICAR ASSINATURA
// Aplica assinatura capturada via QR Code em um atendimento
// ============================================
router.post('/aplicar-assinatura', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const { atendimentoId, sessaoId } = req.body;
    if (!atendimentoId || !sessaoId) {
      return res.status(400).json({ success: false, error: 'atendimentoId e sessaoId são obrigatórios' });
    }
    
    const sessao = await SessaoAssinatura.findOne({ sessaoId });
    if (!sessao) return res.status(404).json({ success: false, error: 'Sessão não encontrada' });
    if (sessao.status !== 'assinado') return res.status(400).json({ success: false, error: 'Sessão ainda não foi assinada' });
    if (!sessao.assinaturaBase64) return res.status(400).json({ success: false, error: 'Sessão não contém assinatura' });
    
    const atendimento = await AtendimentoPsicologia.findById(atendimentoId);
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
        statusAssinatura: 'assinada',
        assinadaEm: atendimento.entrada.assinadaEm,
        assinadaPorNome: atendimento.entrada.assinadaPorNome
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// FINALIZAR
// Finaliza um atendimento com resultado e observações finais
// ============================================
router.post('/finalizar', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const { atendimentoId, resultado, resultadoTexto, observacoesFinais } = req.body;
    
    const resultadosValidos = ['resolvido', 'em_acompanhamento', 'reincidente', 'encaminhado', 'pendente'];
    if (!resultadosValidos.includes(resultado)) {
      return res.status(400).json({ success: false, error: 'Resultado inválido' });
    }
    
    const atendimento = await AtendimentoPsicologia.findById(atendimentoId);
    if (!atendimento) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    if (atendimento.status === 'finalizado') {
      return res.status(400).json({ success: false, error: 'Atendimento já finalizado' });
    }
    
    const check = adminPodeModificar(atendimento, req);
    if (!check.permitido) {
      return res.status(403).json({ success: false, error: check.motivo, code: 'ADMIN_NAO_CRIADOR' });
    }
    
    const psicologo = await User.findById(req.userId).select('nome');
    
    atendimento.saida = {
      dataHora: new Date(),
      resultado,
      resultadoTexto: resultadoTexto || '',
      observacoesFinais: observacoesFinais || '',
      registradoPor: req.userId,
      registradoPorNome: psicologo?.nome || req.userNome || 'Psicologia'
    };
    atendimento.status = 'finalizado';
    atendimento.updatedAt = new Date();
    atendimento.alerta24hReconhecido = true;
    
    await atendimento.save();
    
    const resultadoLabel = {
      'resolvido': 'Resolvido', 'em_acompanhamento': 'Em Acompanhamento',
      'reincidente': 'Reincidente', 'encaminhado': 'Encaminhado', 'pendente': 'Pendente'
    }[resultado];
    
    res.json({
      success: true,
      message: `Atendimento finalizado. Resultado: ${resultadoLabel}`,
      atendimento: {
        id: atendimento._id, status: atendimento.status,
        resultado: resultadoLabel, dataHoraSaida: atendimento.saida.dataHora
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// REMARCAR
// Adiciona uma remarcação a um atendimento existente
// ============================================
router.post('/remarcar', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const { atendimentoId, dataRemarcacao, horarioRemarcacao, motivoRemarcacao, observacoesRemarcacao } = req.body;
    
    if (!atendimentoId) return res.status(400).json({ success: false, error: 'ID obrigatório' });
    if (!dataRemarcacao) return res.status(400).json({ success: false, error: 'Data obrigatória' });
    if (!horarioRemarcacao) return res.status(400).json({ success: false, error: 'Horário obrigatório' });
    if (!motivoRemarcacao) return res.status(400).json({ success: false, error: 'Motivo obrigatório' });
    
    const atendimento = await AtendimentoPsicologia.findById(atendimentoId);
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
    
    const psicologo = await User.findById(req.userId).select('nome');
    
    const remarcacao = {
      id: new mongoose.Types.ObjectId(),
      dataRemarcacao, horarioRemarcacao, motivoRemarcacao,
      observacoesRemarcacao: observacoesRemarcacao || '',
      status: 'pendente',
      criadaEm: new Date(),
      criadaPor: req.userId,
      criadaPorNome: psicologo?.nome || req.userNome || 'Psicologia'
    };
    
    if (!atendimento.remarcacoes) atendimento.remarcacoes = [];
    atendimento.remarcacoes.push(remarcacao);
    atendimento.temRemarcacaoPendente = true;
    atendimento.updatedAt = new Date();
    
    await atendimento.save();
    
    res.json({
      success: true,
      message: `Atendimento remarcado para ${dataObj.toLocaleDateString('pt-BR')} às ${horarioRemarcacao}`,
      remarcacao: {
        id: remarcacao.id,
        atendimentoId: atendimento._id,
        dataRemarcacao, horarioRemarcacao, motivoRemarcacao,
        observacoesRemarcacao: remarcacao.observacoesRemarcacao,
        status: 'pendente'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// REMARCAÇÕES PENDENTES
// Lista todas as remarcações com status pendente
// ============================================
router.get('/remarcacoes/pendentes', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const atendimentos = await AtendimentoPsicologia.find({
      'remarcacoes.status': 'pendente', status: { $ne: 'cancelado' }
    }).sort({ 'remarcacoes.dataRemarcacao': 1 });
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const remarcacoes = [];
    
    atendimentos.forEach(atendimento => {
      (atendimento.remarcacoes || []).forEach(rem => {
        if (rem.status !== 'pendente') return;
        const dataRem = new Date(rem.dataRemarcacao + 'T00:00:00');
        remarcacoes.push({
          id: rem.id.toString(),
          atendimentoId: atendimento._id,
          alunoId: atendimento.alunoId,
          alunoNome: atendimento.alunoNome,
          alunoTurma: atendimento.alunoTurma,
          alunoFoto: atendimento.alunoFoto,
          tipoTarefa: atendimento.tipoTarefa,
          tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(atendimento.tipoTarefa),
          dataRemarcacao: rem.dataRemarcacao,
          horarioRemarcacao: rem.horarioRemarcacao,
          motivoRemarcacao: rem.motivoRemarcacao,
          observacoesRemarcacao: rem.observacoesRemarcacao,
          status: rem.status,
          atrasado: dataRem < hoje,
          hoje: dataRem.getTime() === hoje.getTime(),
          criadaEm: rem.criadaEm,
          criadaPorNome: rem.criadaPorNome
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
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Busca uma remarcação específica pelo ID
router.get('/remarcacoes/:id', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const atendimento = await AtendimentoPsicologia.findOne({ 'remarcacoes.id': req.params.id });
    if (!atendimento) return res.status(404).json({ success: false, error: 'Remarcação não encontrada' });
    
    const remarcacao = atendimento.remarcacoes.find(r => r.id.toString() === req.params.id);
    if (!remarcacao) return res.status(404).json({ success: false, error: 'Remarcação não encontrada' });
    
    res.json({
      success: true,
      remarcacao: {
        id: remarcacao.id.toString(),
        atendimentoId: atendimento._id,
        alunoId: atendimento.alunoId,
        alunoNome: atendimento.alunoNome,
        alunoTurma: atendimento.alunoTurma,
        dataRemarcacao: remarcacao.dataRemarcacao,
        horarioRemarcacao: remarcacao.horarioRemarcacao,
        motivoRemarcacao: remarcacao.motivoRemarcacao,
        observacoesRemarcacao: remarcacao.observacoesRemarcacao,
        status: remarcacao.status,
        criadaEm: remarcacao.criadaEm
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Finaliza uma remarcação (realizado ou cancelado)
router.post('/remarcacoes/finalizar', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const { remarcacaoId, acao } = req.body;
    if (!remarcacaoId) return res.status(400).json({ success: false, error: 'ID obrigatório' });
    if (!['realizado', 'cancelado'].includes(acao)) {
      return res.status(400).json({ success: false, error: 'Ação inválida' });
    }
    
    const atendimento = await AtendimentoPsicologia.findOne({ 'remarcacoes.id': remarcacaoId });
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
        dataHora: new Date(),
        resultado: 'resolvido',
        resultadoTexto: 'Atendimento remarcado e realizado',
        observacoesFinais: `Remarcação realizada em ${new Date().toLocaleString('pt-BR')}`,
        registradoPor: req.userId,
        registradoPorNome: req.userNome
      };
    }
    
    atendimento.updatedAt = new Date();
    await atendimento.save();
    
    res.json({
      success: true,
      message: acao === 'realizado' ? '✅ Remarcação marcada como realizada!' : '❌ Remarcação cancelada.'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ATENDIMENTOS COM +24H
// Lista atendimentos em andamento há mais de 24h (com máscara para super_admin)
// ============================================
router.get('/atendimentos-antigos', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const agora = new Date();
    const limite24h = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
    
    const atendimentos = await AtendimentoPsicologia.find({
      status: 'em_andamento',
      $or: [
        { alerta24hReconhecido: false },
        { alerta24hReconhecido: { $exists: false } }
      ],
      'entrada.dataHora': { $lte: limite24h }
    }).sort({ 'entrada.dataHora': 1 });
    
    const lista = atendimentos.map(a => {
      const tempo = formatarTempoAtendimento(a.entrada.dataHora);
      return {
        id: a._id,
        alunoId: a.alunoId,
        alunoNome: a.alunoNome,
        alunoMatricula: a.alunoMatricula,
        alunoTurma: a.alunoTurma,
        alunoFoto: a.alunoFoto,
        tipoTarefa: a.tipoTarefa,
        tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(a.tipoTarefa),
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
    
    // 🔒 APLICA A MÁSCARA PARA SUPER_ADMIN
    const listaMascarada = mascararParaAdmin(lista, req);
    
    res.json({ success: true, total: listaMascarada.length, atendimentos: listaMascarada });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// VERIFICAR ATENDIMENTO +24H
// Permite encerrar ou manter aberto um atendimento com +24h
// ============================================
router.post('/atendimento/:id/verificar-24h', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const { acao, resultado, observacoes } = req.body;
    const atendimentoId = req.params.id;
    
    if (!['ja_encerrou', 'manter_aberto'].includes(acao)) {
      return res.status(400).json({ success: false, error: 'Ação inválida' });
    }
    
    const atendimento = await AtendimentoPsicologia.findById(atendimentoId);
    if (!atendimento) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    if (atendimento.status !== 'em_andamento') {
      return res.status(400).json({ success: false, error: 'Atendimento não está em andamento' });
    }
    
    const check = adminPodeModificar(atendimento, req);
    if (!check.permitido) {
      return res.status(403).json({ success: false, error: check.motivo, code: 'ADMIN_NAO_CRIADOR' });
    }
    
    const psicologo = await User.findById(req.userId).select('nome');
    const nomeResponsavel = psicologo?.nome || req.userNome || 'Psicologia';
    
    if (acao === 'ja_encerrou') {
      const resultadosValidos = ['resolvido', 'em_acompanhamento', 'reincidente', 'encaminhado', 'pendente'];
      const resultadoFinal = resultadosValidos.includes(resultado) ? resultado : 'resolvido';
      
      atendimento.saida = {
        dataHora: new Date(),
        resultado: resultadoFinal,
        resultadoTexto: 'Encerrado após verificação de atendimento antigo (>24h)',
        observacoesFinais: observacoes || `Verificado e encerrado por ${nomeResponsavel} em ${new Date().toLocaleString('pt-BR')}`,
        registradoPor: req.userId,
        registradoPorNome: nomeResponsavel
      };
      atendimento.status = 'finalizado';
      atendimento.alerta24hReconhecido = true;
      atendimento.updatedAt = new Date();
      await atendimento.save();
      
      return res.json({
        success: true,
        message: 'Atendimento encerrado com sucesso!',
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
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Processa manualmente os alertas de +24h (usado para testes)
router.post('/processar-alertas-24h', async (req, res) => {
  try {
    const resultado = await processarAlertas24h();
    res.json({ success: true, ...resultado });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// DASHBOARD
// Retorna métricas, gráficos e tendências dos atendimentos
// ============================================
router.get('/dashboard', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const hoje = new Date();
    const hojeStr = hoje.toISOString().split('T')[0];
    const inicioSemana = new Date(hoje);
    inicioSemana.setDate(hoje.getDate() - hoje.getDay());
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimos30Dias = new Date();
    ultimos30Dias.setDate(ultimos30Dias.getDate() - 30);
    
    const [atendimentosHoje, atendimentosSemana, atendimentosMes, total] = await Promise.all([
      AtendimentoPsicologia.countDocuments({
        'entrada.dataHora': { $gte: inicioDoDiaBrasil(hojeStr), $lte: fimDoDiaBrasil(hojeStr) }
      }),
      AtendimentoPsicologia.countDocuments({ 'entrada.dataHora': { $gte: inicioSemana } }),
      AtendimentoPsicologia.countDocuments({ 'entrada.dataHora': { $gte: inicioMes } }),
      AtendimentoPsicologia.countDocuments()
    ]);
    
    const emAndamento = await AtendimentoPsicologia.countDocuments({ status: 'em_andamento' });
    const finalizadosHoje = await AtendimentoPsicologia.countDocuments({
      status: 'finalizado',
      'saida.dataHora': { $gte: inicioDoDiaBrasil(hojeStr), $lte: fimDoDiaBrasil(hojeStr) }
    });
    
    const limite24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const atendimentosAntigos = await AtendimentoPsicologia.countDocuments({
      status: 'em_andamento',
      $or: [{ alerta24hReconhecido: false }, { alerta24hReconhecido: { $exists: false } }],
      'entrada.dataHora': { $lte: limite24h }
    });
    
    const porTipo = await AtendimentoPsicologia.aggregate([
      { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: '$tipoTarefa', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const porGravidade = await AtendimentoPsicologia.aggregate([
      { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: '$entrada.gravidade', count: { $sum: 1 } } }
    ]);
    
    const resultados = await AtendimentoPsicologia.aggregate([
      { $match: { status: 'finalizado', 'saida.resultado': { $exists: true }, 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: '$saida.resultado', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    const ultimos7Dias = [];
    for (let i = 6; i >= 0; i--) {
      const data = new Date();
      data.setDate(data.getDate() - i);
      const dataStr = data.toISOString().split('T')[0];
      const count = await AtendimentoPsicologia.countDocuments({
        'entrada.dataHora': { $gte: inicioDoDiaBrasil(dataStr), $lte: fimDoDiaBrasil(dataStr) }
      });
      ultimos7Dias.push({
        data: dataStr,
        dia: data.toLocaleDateString('pt-BR', { weekday: 'short' }),
        atendimentos: count
      });
    }
    
    const porTurma = await AtendimentoPsicologia.aggregate([
      { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: '$alunoTurma', count: { $sum: 1 } } },
      { $sort: { count: -1 } }, { $limit: 8 }
    ]);
    
    const alunosReincidentes = await AtendimentoPsicologia.aggregate([
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
    
    const porHora = await AtendimentoPsicologia.aggregate([
      { $match: { 'entrada.dataHora': { $gte: ultimos30Dias } } },
      { $group: { _id: { $hour: '$entrada.dataHora' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    
    const horasDistribuicao = Array(24).fill(0);
    porHora.forEach(h => { horasDistribuicao[h._id] = h.count; });
    
    res.json({
      success: true,
      metricas: {
        hoje: atendimentosHoje, semana: atendimentosSemana, mes: atendimentosMes,
        total, emAndamento, finalizadosHoje, atendimentosAntigos
      },
      porTipo: porTipo.map(t => ({
        tipo: t._id, label: AtendimentoPsicologia.getTipoTarefaLabel(t._id), count: t.count
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
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ATENDIMENTOS ATIVOS
// Lista todos os atendimentos em andamento (com máscara para super_admin)
// ============================================
router.get('/atendimentos-ativos', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const atendimentos = await AtendimentoPsicologia.find({ status: 'em_andamento' })
      .sort({ prioridade: -1, 'entrada.dataHora': -1 });
    
    const lista = atendimentos.map(a => {
      const tempo = formatarTempoAtendimento(a.entrada.dataHora);
      return {
        id: a._id, alunoId: a.alunoId, alunoNome: a.alunoNome,
        alunoTurma: a.alunoTurma, alunoFoto: a.alunoFoto,
        tipoTarefa: a.tipoTarefa,
        tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(a.tipoTarefa),
        descricao: a.entrada.descricao, gravidade: a.entrada.gravidade, prioridade: a.prioridade,
        dataHoraEntrada: a.entrada.dataHora,
        tempoAtendimento: tempo.minutos, tempoTexto: tempo.texto, nivelTempo: tempo.nivel,
        alerta24hAtivo: tempo.minutos >= 1440 && !a.alerta24hReconhecido,
        totalAlertas24h: a.totalAlertas24h || 0,
        temRemarcacaoPendente: a.temRemarcacaoPendente || false,
        temAssinatura: !!(a.entrada?.assinaturaBase64),
        statusAssinatura: a.entrada?.statusAssinatura || 'nao_necessaria',
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
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// LISTAR ATENDIMENTOS
// Lista atendimentos com filtros e paginação (com máscara para super_admin)
// ============================================
router.get('/atendimentos', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const { 
      limit = 100, page = 1, tipo, status, turma, 
      dataInicio, dataFim, busca, resultado
    } = req.query;
    
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
      AtendimentoPsicologia.find(query).sort({ 'entrada.dataHora': -1 }).skip(skip).limit(parseInt(limit)),
      AtendimentoPsicologia.countDocuments(query)
    ]);
    
    const turmasAtendimento = await AtendimentoPsicologia.distinct('alunoTurma');
    const turmasAlunos = await User.distinct('turma', { 
      role: 'aluno', ativo: true, turma: { $nin: [null, '', 'Não informada'] } 
    });
    const turmasDisponiveis = [...new Set([
      ...turmasAtendimento.filter(t => t && t !== 'Não informada'),
      ...turmasAlunos
    ])].sort();
    
    const lista = atendimentos.map(a => {
      const tempo = formatarTempoAtendimento(a.entrada.dataHora);
      return {
        id: a._id, alunoId: a.alunoId, alunoNome: a.alunoNome,
        alunoMatricula: a.alunoMatricula, alunoTurma: a.alunoTurma, alunoCurso: a.alunoCurso,
        tipoTarefa: a.tipoTarefa,
        tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(a.tipoTarefa),
        descricao: a.entrada.descricao, gravidade: a.entrada.gravidade, prioridade: a.prioridade,
        status: a.status,
        dataEntrada: a.entrada.dataHora,
        dataEntradaFormatada: new Date(a.entrada.dataHora).toLocaleString('pt-BR'),
        tempoTexto: tempo.texto, tempoMinutos: tempo.minutos,
        registradoPor: a.entrada.registradoPorNome, registradoPorId: a.entrada.registradoPor,
        temAssinatura: !!(a.entrada?.assinaturaBase64),
        statusAssinatura: a.entrada?.statusAssinatura || 'nao_necessaria',
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
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// BUSCAR ATENDIMENTO POR ID
// Retorna um atendimento específico (com máscara para super_admin)
// ============================================
router.get('/atendimento/:id', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const atendimento = await AtendimentoPsicologia.findById(req.params.id);
    if (!atendimento) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    
    const tempo = formatarTempoAtendimento(atendimento.entrada.dataHora);
    
    const payload = {
      id: atendimento._id, alunoId: atendimento.alunoId, alunoNome: atendimento.alunoNome,
      alunoMatricula: atendimento.alunoMatricula, alunoTurma: atendimento.alunoTurma,
      alunoCurso: atendimento.alunoCurso,
      tipoTarefa: atendimento.tipoTarefa,
      tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(atendimento.tipoTarefa),
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
        sessaoAssinaturaId: atendimento.entrada?.sessaoAssinaturaId || null
      },
      detalhes: atendimento.detalhes,
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
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// EDITAR
// Atualiza um atendimento (com verificação de permissão para super_admin)
// ============================================
router.put('/atendimento/:id', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const atendimento = await AtendimentoPsicologia.findById(req.params.id);
    if (!atendimento) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    
    const check = adminPodeModificar(atendimento, req);
    if (!check.permitido) {
      return res.status(403).json({ success: false, error: check.motivo, code: 'ADMIN_NAO_CRIADOR' });
    }
    
    const { descricao, observacoes, gravidade, prioridade, detalhes, status, saida, tipoTarefa } = req.body;
    
    if (tipoTarefa && [
      'escuta_acolhimento', 'manejo_crises_emocionais', 'atividades_grupos',
      'acoes_atividades_saude', 'acoes_socioemocionais_culturais', 'outros'
    ].includes(tipoTarefa)) {
      atendimento.tipoTarefa = tipoTarefa;
    }
    
    if (descricao) atendimento.entrada.descricao = descricao;
    if (observacoes !== undefined) atendimento.entrada.observacoes = observacoes;
    if (gravidade) atendimento.entrada.gravidade = gravidade;
    if (prioridade) atendimento.prioridade = prioridade;
    if (detalhes) atendimento.detalhes = { ...atendimento.detalhes, ...detalhes };
    if (status) atendimento.status = status;
    
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
    
    res.json({ success: true, message: 'Atendimento atualizado com sucesso', atendimento: { id: atendimento._id } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// EXCLUIR
// Exclui um atendimento (com verificação de permissão para super_admin)
// ============================================
router.delete('/atendimento/:id', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const atendimento = await AtendimentoPsicologia.findById(req.params.id);
    if (!atendimento) return res.status(404).json({ success: false, error: 'Atendimento não encontrado' });
    
    const check = adminPodeModificar(atendimento, req);
    if (!check.permitido) {
      return res.status(403).json({ success: false, error: check.motivo, code: 'ADMIN_NAO_CRIADOR' });
    }
    
    await AtendimentoPsicologia.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Atendimento excluído com sucesso' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// EXCLUSÃO EM MASSA
// Exclui atendimentos finalizados antes de uma data (bloqueado para super_admin)
// ============================================
router.post('/atendimentos/exclusao-massa', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    if (req.userRole === 'super_admin') {
      return res.status(403).json({ 
        success: false, 
        error: 'Apenas a Psicologia pode excluir em massa.',
        code: 'ADMIN_SEM_PERMISSAO_MASSA'
      });
    }
    
    const { dataCorte, status = 'finalizado', confirmacao } = req.body;
    if (confirmacao !== 'CONFIRMAR') {
      return res.status(400).json({ success: false, error: 'Confirmação inválida' });
    }
    if (!dataCorte) return res.status(400).json({ success: false, error: 'Data de corte é obrigatória' });

    const dataObj = fimDoDiaBrasil(dataCorte);
    if (isNaN(dataObj.getTime())) {
      return res.status(400).json({ success: false, error: 'Data de corte inválida' });
    }

    const filtro = { status, 'saida.dataHora': { $lt: dataObj } };
    const totalAntes = await AtendimentoPsicologia.countDocuments(filtro);

    if (totalAntes === 0) {
      return res.json({ success: true, message: 'Nenhum atendimento encontrado', excluidos: 0 });
    }

    const resultado = await AtendimentoPsicologia.deleteMany(filtro);

    res.json({
      success: true,
      message: `${resultado.deletedCount} atendimento(s) excluído(s)`,
      excluidos: resultado.deletedCount,
      dataCorte, status
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// RELATÓRIOS
// ============================================

// Relatório individual de um aluno
router.get('/relatorio/aluno/:alunoId', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;
    let query = { alunoId: req.params.alunoId };
    if (dataInicio || dataFim) {
      query['entrada.dataHora'] = {};
      if (dataInicio) query['entrada.dataHora'].$gte = inicioDoDiaBrasil(dataInicio);
      if (dataFim) query['entrada.dataHora'].$lte = fimDoDiaBrasil(dataFim);
    }
    
    const atendimentos = await AtendimentoPsicologia.find(query).sort({ 'entrada.dataHora': -1 });
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
          tipo, label: AtendimentoPsicologia.getTipoTarefaLabel(tipo), count
        })),
        porGravidade,
        emAndamento: atendimentos.filter(a => a.status === 'em_andamento').length,
        finalizados: atendimentos.filter(a => a.status === 'finalizado').length
      },
      atendimentos: atendimentos.map(a => {
        const tempo = formatarTempoAtendimento(a.entrada.dataHora);
        return {
          id: a._id, tipoTarefa: a.tipoTarefa,
          tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(a.tipoTarefa),
          dataEntrada: a.entrada.dataHora, descricao: a.entrada.descricao,
          gravidade: a.entrada.gravidade, status: a.status,
          dataSaida: a.saida?.dataHora || null, resultado: a.saida?.resultado || null,
          tempoTexto: tempo.texto,
          temAssinatura: !!(a.entrada?.assinaturaBase64),
          assinaturaBase64: a.entrada?.assinaturaBase64 || null
        };
      })
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Relatório por turma
router.get('/relatorio/turma/:turma', authenticateToken, verificarPsicologia, async (req, res) => {
  try {
    const { dataInicio, dataFim } = req.query;
    let query = { alunoTurma: req.params.turma };
    if (dataInicio || dataFim) {
      query['entrada.dataHora'] = {};
      if (dataInicio) query['entrada.dataHora'].$gte = inicioDoDiaBrasil(dataInicio);
      if (dataFim) query['entrada.dataHora'].$lte = fimDoDiaBrasil(dataFim);
    }
    
    const atendimentos = await AtendimentoPsicologia.find(query).sort({ 'entrada.dataHora': -1 });
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
          tipo, label: AtendimentoPsicologia.getTipoTarefaLabel(tipo), count
        }))
      },
      porAluno: Object.values(porAluno).sort((a, b) => b.total - a.total),
      atendimentos: atendimentos.map(a => {
        const tempo = formatarTempoAtendimento(a.entrada.dataHora);
        return {
          id: a._id, alunoNome: a.alunoNome,
          tipoTarefa: a.tipoTarefa,
          tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(a.tipoTarefa),
          dataEntrada: a.entrada.dataHora, descricao: a.entrada.descricao,
          gravidade: a.entrada.gravidade, status: a.status,
          tempoTexto: tempo.texto
        };
      })
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Relatório geral com filtros
router.get('/relatorio/geral', authenticateToken, verificarPsicologia, async (req, res) => {
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
      AtendimentoPsicologia.find(query).sort({ 'entrada.dataHora': -1 }).limit(1000),
      AtendimentoPsicologia.countDocuments(query),
      AtendimentoPsicologia.countDocuments({ ...query, 'entrada.temAssinatura': true })
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
    
    const turmasAtendimento = await AtendimentoPsicologia.distinct('alunoTurma');
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
        tipo: t, label: AtendimentoPsicologia.getTipoTarefaLabel(t), count
      })).sort((a, b) => b.count - a.count),
      porGravidade,
      registros: atendimentos.map(a => {
        const tempo = formatarTempoAtendimento(a.entrada.dataHora);
        return {
          id: a._id, alunoNome: a.alunoNome, alunoMatricula: a.alunoMatricula,
          alunoTurma: a.alunoTurma, tipoTarefa: a.tipoTarefa,
          tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(a.tipoTarefa),
          dataEntrada: a.entrada.dataHora,
          dataFormatada: new Date(a.entrada.dataHora).toLocaleDateString('pt-BR'),
          descricao: a.entrada.descricao, gravidade: a.entrada.gravidade,
          prioridade: a.prioridade, status: a.status,
          tempoTexto: tempo.texto,
          temAssinatura: !!(a.entrada?.assinaturaBase64),
          assinaturaBase64: a.entrada?.assinaturaBase64 || null,
          registradoPorNome: a.entrada?.registradoPorNome
        };
      }),
      atendimentos: atendimentos.slice(0, 100).map(a => {
        const tempo = formatarTempoAtendimento(a.entrada.dataHora);
        return {
          id: a._id, alunoNome: a.alunoNome, alunoTurma: a.alunoTurma,
          tipoTarefa: a.tipoTarefa,
          tipoTarefaLabel: AtendimentoPsicologia.getTipoTarefaLabel(a.tipoTarefa),
          dataEntrada: a.entrada.dataHora,
          descricao: a.entrada.descricao.substring(0, 100),
          gravidade: a.entrada.gravidade, status: a.status,
          tempoTexto: tempo.texto,
          temAssinatura: !!(a.entrada?.assinaturaBase64),
          assinaturaBase64: a.entrada?.assinaturaBase64 || null
        };
      })
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// SCHEDULER
// Executa alertas de +24h a cada 5 minutos
// ============================================
let schedulerInterval = null;

function iniciarSchedulerAlertas24h() {
  if (schedulerInterval) clearInterval(schedulerInterval);
  
  setTimeout(async () => {
    await processarAlertas24h();
  }, 30000);
  
  schedulerInterval = setInterval(async () => {
    await processarAlertas24h();
  }, 5 * 60 * 1000);
  
  console.log('⏰ [SCHEDULER PSI] Agendador iniciado');
}

iniciarSchedulerAlertas24h();

router.pararScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
};

module.exports = router;