const mongoose = require('mongoose');

// ============================================
// MODEL: ATENDIMENTO BIBLIOTECA
// Registro de frequência e atividades dos usuários
// ============================================

const AtendimentoBibliotecaSchema = new mongoose.Schema({
  // ============================================
  // DADOS DO USUÁRIO
  // ============================================
  alunoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  alunoNome: { type: String, required: true },
  alunoMatricula: { type: String, default: '' },
  alunoTurma: { type: String, default: '' },
  alunoCurso: { type: String, default: '' },
  alunoFoto: { type: String, default: '' },

  // Visitante externo
  visitanteExterno: { type: Boolean, default: false },
  visitanteDocumento: { type: String, default: '' },
  visitanteInstituicao: { type: String, default: '' },

  // ============================================
  // MOTIVO DA VISITA (checkbox único, conforme foto)
  // ============================================
  motivoVisita: {
    type: String,
    enum: [
      'ler_livro',
      'pegar_livro_emprestado',
      'participar_atividade_leitura',
      'fazer_pesquisa',
      'outros'
    ],
    required: true
  },
  motivoOutros: { type: String, default: '' },

  // ============================================
  // ATIVIDADES ADICIONAIS
  // ============================================
  atividades: {
    type: [String],
    default: []
  },
  atividadesOutros: { type: String, default: '' },

  // ============================================
  // ENTRADA
  // ============================================
  entrada: {
    dataHora: { type: Date, default: Date.now, required: true },
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    registradoPorNome: { type: String, default: '' },
    observacoes: { type: String, default: '' },

    editadoEm: { type: Date, default: null },
    editadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    editadoPorNome: { type: String, default: '' }
  },

  // ============================================
  // SAÍDA
  // ============================================
  saida: {
    dataHora: { type: Date, default: null },
    registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    registradoPorNome: { type: String, default: '' },
    observacoes: { type: String, default: '' },
    livrosConsultados: { type: [String], default: [] },
    livrosEmprestados: { type: [String], default: [] },
    computadoresUsados: { type: Number, default: 0 },
    satisfacao: {
      type: String,
      enum: ['muito_bom', 'bom', 'regular', 'ruim', null],
      default: null
    }
  },

  // ============================================
  // STATUS
  // ============================================
  status: {
    type: String,
    enum: ['em_visita', 'finalizado', 'cancelado'],
    default: 'em_visita'
  },
  duracaoMinutos: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// ============================================
// ÍNDICES
// ============================================
AtendimentoBibliotecaSchema.index({ alunoId: 1, status: 1 });
AtendimentoBibliotecaSchema.index({ alunoTurma: 1, createdAt: -1 });
AtendimentoBibliotecaSchema.index({ 'entrada.dataHora': -1 });
AtendimentoBibliotecaSchema.index({ status: 1, createdAt: -1 });
AtendimentoBibliotecaSchema.index({ motivoVisita: 1, createdAt: -1 });

// ============================================
// MÉTODOS ESTÁTICOS
// ============================================
AtendimentoBibliotecaSchema.statics.alunoEmVisita = async function(alunoId) {
  const visita = await this.findOne({ alunoId, status: 'em_visita' });
  return !!visita;
};

AtendimentoBibliotecaSchema.statics.getVisitaAtiva = async function(alunoId) {
  return await this.findOne({ alunoId, status: 'em_visita' })
    .sort({ 'entrada.dataHora': -1 });
};

AtendimentoBibliotecaSchema.statics.getMotivoLabel = function(motivo) {
  const labels = {
    'ler_livro': 'Ler um Livro',
    'pegar_livro_emprestado': 'Pegar um Livro Emprestado',
    'participar_atividade_leitura': 'Participar de uma Atividade de Leitura',
    'fazer_pesquisa': 'Fazer Pesquisa',
    'outros': 'Outros'
  };
  return labels[motivo] || motivo;
};

AtendimentoBibliotecaSchema.statics.getAtividadeLabel = function(atividade) {
  const labels = {
    'leitura_individual': 'Leitura Individual',
    'leitura_grupo': 'Leitura em Grupo',
    'pesquisa_internet': 'Pesquisa na Internet',
    'pesquisa_livros': 'Pesquisa em Livros',
    'estudo_dirigido': 'Estudo Dirigido',
    'producao_texto': 'Produção de Texto',
    'emprestimo_livro': 'Empréstimo de Livro',
    'devolucao_livro': 'Devolução de Livro',
    'atividade_pedagogica': 'Atividade Pedagógica',
    'outros': 'Outros'
  };
  return labels[atividade] || atividade;
};

// ============================================
// MÉTODO DE INSTÂNCIA
// ============================================
AtendimentoBibliotecaSchema.methods.finalizarVisita = async function(dadosSaida) {
  this.saida = {
    dataHora: new Date(),
    registradoPor: dadosSaida.registradoPor || null,
    registradoPorNome: dadosSaida.registradoPorNome || '',
    observacoes: dadosSaida.observacoes || '',
    livrosConsultados: dadosSaida.livrosConsultados || [],
    livrosEmprestados: dadosSaida.livrosEmprestados || [],
    computadoresUsados: dadosSaida.computadoresUsados || 0,
    satisfacao: dadosSaida.satisfacao || null
  };

  const entrada = new Date(this.entrada.dataHora);
  this.duracaoMinutos = Math.round((new Date() - entrada) / 60000);

  this.status = 'finalizado';
  this.updatedAt = new Date();

  return this.save();
};

module.exports = mongoose.model('AtendimentoBiblioteca', AtendimentoBibliotecaSchema);