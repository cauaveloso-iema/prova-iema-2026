// backend/models/PerfilParticipante.js
const mongoose = require('mongoose');

// ============================================
// SCHEMA PRINCIPAL
// ============================================
const PerfilParticipanteSchema = new mongoose.Schema({
  // Identificador do perfil (ex: 'professor', 'aluno', 'supervisao')
  valor: {
    type: String,
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    trim: true
  },

  // Nome amigável para exibição no dropdown
  label: {
    type: String,
    required: true,
    trim: true
  },

  // Tipo de filtro intermediário (se houver)
  // 'eixo'  → professor precisa escolher eixo antes do professor
  // 'turma' → aluno precisa escolher turma antes do aluno
  // null    → vai direto para lista de usuários do role
  temFiltro: {
    type: String,
    enum: ['eixo', 'turma', null],
    default: null
  },

  // Label do filtro (ex: 'Eixo', 'Turma')
  filtroLabel: {
    type: String,
    default: null,
    trim: true
  },

  // Ordem de exibição no dropdown
  ordem: {
    type: Number,
    default: 0
  },

  // Descrição do que esse perfil representa
  descricao: {
    type: String,
    default: '',
    trim: true
  },

  // Status do perfil
  ativo: {
    type: Boolean,
    default: true,
    index: true
  },

  // Auditoria
  ultimaModificacaoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  ultimaModificacaoNome: {
    type: String,
    default: null
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  collection: 'perfis_participantes',
  toJSON: { getters: true },
  toObject: { getters: true }
});

// ============================================
// ÍNDICES
// ============================================
PerfilParticipanteSchema.index({ ativo: 1, ordem: 1 });

// ============================================
// MIDDLEWARE: PRE-SAVE
// ============================================
PerfilParticipanteSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  if (this.valor) {
    this.valor = this.valor.toLowerCase().trim();
  }
  next();
});

// ============================================
// MÉTODOS ESTÁTICOS
// ============================================

/**
 * Perfis que NUNCA podem ser usados como participante
 */
PerfilParticipanteSchema.statics.PERFIS_ADMIN_PROIBIDOS = [
  'super_admin',
  'admin',
  'administrador',
  'root'
];

/**
 * Lista perfis ativos para uso no dropdown
 * (exclui automaticamente perfis administrativos)
 */
PerfilParticipanteSchema.statics.listarAtivos = async function() {
  return await this.find({
    ativo: true,
    valor: { $nin: this.PERFIS_ADMIN_PROIBIDOS }
  })
    .sort({ ordem: 1, label: 1 })
    .select('valor label temFiltro filtroLabel descricao -_id')
    .lean();
};

/**
 * Lista TODOS os perfis (incluindo inativos) - apenas para admin
 */
PerfilParticipanteSchema.statics.listarTodos = async function() {
  return await this.find()
    .sort({ ordem: 1, label: 1 })
    .lean();
};

/**
 * Busca um perfil pelo valor, garantindo que não seja admin
 */
PerfilParticipanteSchema.statics.buscarPorValor = async function(valor) {
  if (!valor || typeof valor !== 'string') return null;

  const valorLimpo = valor.trim().toLowerCase();
  if (!valorLimpo) return null;

  // 🛡️ Bloqueia perfis administrativos
  if (this.PERFIS_ADMIN_PROIBIDOS.includes(valorLimpo)) {
    return null;
  }

  return await this.findOne({ valor: valorLimpo, ativo: true });
};

/**
 * Verifica se um perfil existe e está ativo (sem bloquear admins)
 */
PerfilParticipanteSchema.statics.existeAtivo = async function(valor) {
  if (!valor || typeof valor !== 'string') return false;
  const valorLimpo = valor.trim().toLowerCase();
  const existe = await this.findOne({ valor: valorLimpo, ativo: true });
  return !!existe;
};

/**
 * Busca perfil por valor, criando se não existir
 */
PerfilParticipanteSchema.statics.buscarOuCriar = async function(valor, label, extras = {}) {
  const valorLimpo = valor.trim().toLowerCase();

  let perfil = await this.findOne({ valor: valorLimpo });

  if (!perfil) {
    perfil = await this.create({
      valor: valorLimpo,
      label: label || valor,
      temFiltro: extras.temFiltro || null,
      filtroLabel: extras.filtroLabel || null,
      ordem: extras.ordem || 0,
      descricao: extras.descricao || ''
    });
    console.log(`✅ Perfil de participante criado: ${valorLimpo}`);
  }

  return perfil;
};

/**
 * Cria um novo perfil (com auditoria e bloqueio de admin)
 */
PerfilParticipanteSchema.statics.criar = async function(dados, userInfo) {
  if (!dados.valor || !dados.label) {
    throw new Error('valor e label são obrigatórios');
  }

  const valorLimpo = dados.valor.trim().toLowerCase().replace(/\s+/g, '_');

  // 🛡️ Bloqueia perfis administrativos
  if (this.PERFIS_ADMIN_PROIBIDOS.includes(valorLimpo)) {
    throw new Error('Este perfil não pode ser usado como participante do atendimento');
  }

  const novo = new this({
    valor: valorLimpo,
    label: dados.label.trim(),
    temFiltro: dados.temFiltro || null,
    filtroLabel: dados.filtroLabel || null,
    ordem: Number(dados.ordem) || 0,
    descricao: dados.descricao || '',
    ativo: dados.ativo !== false,
    ultimaModificacaoPor: userInfo?.userId || null,
    ultimaModificacaoNome: userInfo?.nome || null
  });

  await novo.save();
  return novo;
};

/**
 * Atualiza um perfil existente (com auditoria)
 */
PerfilParticipanteSchema.statics.atualizar = async function(id, dados, userInfo) {
  const update = {};

  if (dados.label !== undefined) update.label = dados.label.trim();
  if (dados.temFiltro !== undefined) update.temFiltro = dados.temFiltro || null;
  if (dados.filtroLabel !== undefined) update.filtroLabel = dados.filtroLabel || null;
  if (dados.ordem !== undefined) update.ordem = Number(dados.ordem) || 0;
  if (dados.descricao !== undefined) update.descricao = dados.descricao;
  if (dados.ativo !== undefined) update.ativo = dados.ativo;

  update.ultimaModificacaoPor = userInfo?.userId || null;
  update.ultimaModificacaoNome = userInfo?.nome || null;
  update.updatedAt = new Date();

  const perfil = await this.findByIdAndUpdate(id, update, {
    new: true,
    runValidators: true
  });

  if (!perfil) throw new Error('Perfil não encontrado');
  return perfil;
};

/**
 * Desativa um perfil (soft delete) com auditoria
 */
PerfilParticipanteSchema.statics.desativar = async function(id, userInfo) {
  const perfil = await this.findByIdAndUpdate(
    id,
    {
      ativo: false,
      ultimaModificacaoPor: userInfo?.userId || null,
      ultimaModificacaoNome: userInfo?.nome || null,
      updatedAt: new Date()
    },
    { new: true }
  );

  if (!perfil) throw new Error('Perfil não encontrado');
  return perfil;
};

/**
 * Reativa um perfil com auditoria
 */
PerfilParticipanteSchema.statics.reativar = async function(id, userInfo) {
  const perfil = await this.findByIdAndUpdate(
    id,
    {
      ativo: true,
      ultimaModificacaoPor: userInfo?.userId || null,
      ultimaModificacaoNome: userInfo?.nome || null,
      updatedAt: new Date()
    },
    { new: true }
  );

  if (!perfil) throw new Error('Perfil não encontrado');
  return perfil;
};

/**
 * Exclui permanentemente (hard delete)
 */
PerfilParticipanteSchema.statics.excluirPermanentemente = async function(id) {
  const perfil = await this.findByIdAndDelete(id);
  if (!perfil) throw new Error('Perfil não encontrado');
  return perfil;
};

/**
 * Popula perfis padrão se a collection estiver vazia
 * ⚠️ O 'valor' DEVE ser idêntico ao 'role' do User.js
 */
PerfilParticipanteSchema.statics.seedInicial = async function() {
  try {
    const count = await this.countDocuments();
    if (count > 0) {
      console.log(`ℹ️  [SEED PERFIS] Já existem ${count} perfis cadastrados`);
      return;
    }

    await this.insertMany([
      // ═══════════════════════════════════════════════════════════
      // PERFIS COM FILTRO INTERMEDIÁRIO
      // ═══════════════════════════════════════════════════════════
      {
        valor: 'professor',
        label: 'Professor',
        temFiltro: 'eixo',
        filtroLabel: 'Eixo',
        ordem: 1,
        descricao: 'Professores da instituição'
      },
      {
        valor: 'aluno',
        label: 'Aluno',
        temFiltro: 'turma',
        filtroLabel: 'Turma',
        ordem: 2,
        descricao: 'Alunos matriculados'
      },

      // ═══════════════════════════════════════════════════════════
      // PERFIS SEM FILTRO (acesso direto à lista de usuários)
      // ⚠️  O 'valor' DEVE ser idêntico ao 'role' do User.js
      // ═══════════════════════════════════════════════════════════
      { valor: 'supervisao',        label: 'Supervisão',           ordem: 3,  descricao: 'Equipe de supervisão' },
      { valor: 'gestao_geral',      label: 'Gestão Geral',         ordem: 4,  descricao: 'Equipe de gestão' },
      { valor: 'psicologia',        label: 'Psicologia',           ordem: 5,  descricao: 'Setor de psicologia' },
      { valor: 'assistente-social', label: 'Assistente Social',    ordem: 6,  descricao: 'Serviço social' },
      { valor: 'biblioteca',        label: 'Biblioteca',           ordem: 7,  descricao: 'Equipe da biblioteca' },
      { valor: 'recepcao',          label: 'Recepção',             ordem: 8,  descricao: 'Equipe de recepção' },
      { valor: 'secretaria',        label: 'Secretaria',           ordem: 9,  descricao: 'Secretaria acadêmica' },
      { valor: 'protagonismo',      label: 'Protagonismo',         ordem: 10, descricao: 'Equipe de protagonismo' },
      { valor: 'setor_pedagogico',  label: 'Setor Pedagógico',     ordem: 11, descricao: 'Setor pedagógico' },
      { valor: 'coordenacao_patio', label: 'Coordenação de Pátio', ordem: 12, descricao: 'Coordenação de pátio' },
      { valor: 'enfermaria',        label: 'Enfermaria',           ordem: 13, descricao: 'Setor de enfermaria' },
      { valor: 'cozinha',           label: 'Cozinha',              ordem: 14, descricao: 'Equipe da cozinha' }
    ]);

    console.log(`✅ [SEED PERFIS] ${await this.countDocuments()} perfis de participantes criados`);
  } catch (error) {
    console.error('❌ [SEED PERFIS] Erro:', error.message);
  }
};

// ============================================
// EXPORT
// ============================================
module.exports = mongoose.model('PerfilParticipante', PerfilParticipanteSchema);