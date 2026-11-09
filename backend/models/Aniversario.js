// backend/models/Aniversario.js
const mongoose = require('mongoose');

const AniversarioSchema = new mongoose.Schema({
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  nome: { type: String, required: true, trim: true },
  dataNascimento: { type: Date, required: true },
  
  // 🔥 Removido o required daqui (o middleware abaixo preenche)
  mes: { type: Number, min: 1, max: 12 },
  dia: { type: Number, min: 1, max: 31 },

  email: { type: String, default: '' },
  telefone: { type: String, default: '' },
  turma: { type: String, default: '' },
  curso: { type: String, default: '' },
  fotoPerfil: { type: String, default: '' },
  role: { type: String, default: 'aluno' },

  origem: {
    type: String,
    enum: ['auto', 'manual'],
    default: 'auto'
  },

  lembretesEnviados: {
    dia: { type: Boolean, default: false },
    antecedencia: { type: Boolean, default: false },
    ultimoEnvio: { type: Date, default: null }
  },

  ativo: { type: Boolean, default: true },
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

AniversarioSchema.index({ mes: 1, dia: 1 });
AniversarioSchema.index({ usuarioId: 1 }, { unique: true, sparse: true });

// 🔥 TROCADO PARA 'validate' para rodar ANTES de checar os obrigatórios
AniversarioSchema.pre('validate', function (next) {
  if (this.dataNascimento) {
    const d = new Date(this.dataNascimento);
    this.mes = d.getUTCMonth() + 1;
    this.dia = d.getUTCDate();
  }
  this.updatedAt = new Date();
  next();
});

/**
 * Sincroniza aniversários de TODOS os usuários ativos
 */
AniversarioSchema.statics.sincronizarDoBanco = async function () {
  const User = mongoose.model('User');

  const usuarios = await User.find({
    ativo: true,
    dataNascimento: { $ne: null, $exists: true }
  }).select('nome dataNascimento email telefone turma curso fotoPerfil role');

  console.log(`🔍 [Sincronização] Encontrados ${usuarios.length} usuários com dataNascimento`);

  let criados = 0;
  let atualizados = 0;
  let ignorados = 0;

  for (const u of usuarios) {
    if (!u.dataNascimento) { ignorados++; continue; }

    const existente = await this.findOne({ usuarioId: u._id });

    const dados = {
      nome: u.nome,
      dataNascimento: u.dataNascimento,
      email: u.email || '',
      telefone: u.telefone || '',
      turma: u.turma || '',
      curso: u.curso || '',
      fotoPerfil: u.fotoPerfil || '',
      role: u.role || 'aluno',
      origem: 'auto'
    };

    if (existente) {
      if (existente.origem === 'auto') {
        Object.assign(existente, dados);
        await existente.save();
        atualizados++;
      } else {
        ignorados++;
      }
    } else {
      await this.create({ ...dados, usuarioId: u._id });
      criados++;
    }
  }

  console.log(`✅ [Sincronização] Criados: ${criados} | Atualizados: ${atualizados} | Ignorados (manuais): ${ignorados}`);

  return { criados, atualizados, ignorados, total: usuarios.length };
};

module.exports = mongoose.model('Aniversario', AniversarioSchema);