// ============================================================================
// constants/acessibilidade.js
// Fonte única de verdade para as condições de acessibilidade do módulo AEE.
// Usado pelo Schema do User e pelas rotas do AEE para evitar divergência
// entre a validação interna da rota e o enum do Mongoose.
// ============================================================================

const CONDICOES_LISTA = [
  { valor: 'visual',               label: 'Deficiência Visual' },
  { valor: 'baixa_visao',          label: 'Baixa Visão' },
  { valor: 'cegueira',             label: 'Cegueira' },
  { valor: 'auditiva',             label: 'Deficiência Auditiva' },
  { valor: 'deficiencia_auditiva', label: 'Deficiência Auditiva' },
  { valor: 'motora',               label: 'Deficiência Motora' },
  { valor: 'deficiencia_fisica',   label: 'Deficiência Física' },
  { valor: 'intelectual',          label: 'Deficiência Intelectual' },
  { valor: 'dislexia',             label: 'Dislexia' },
  { valor: 'discalculia',          label: 'Discalculia' },
  { valor: 'tdah',                 label: 'TDAH' },
  { valor: 'tea',                  label: 'Transtorno do Espectro Autista (TEA)' },
  { valor: 'altas_habilidades',    label: 'Altas Habilidades/Superdotação' },
  { valor: 'deficiencia_multipla', label: 'Deficiência Múltipla' },
  { valor: 'surdocegueira',        label: 'Surdocegueira' },
  { valor: 'outra',                label: 'Outra Condição' }
];

// Apenas os valores (usado no enum do Mongoose e nas validações)
const CONDICOES_VALORES = CONDICOES_LISTA.map(c => c.valor);

// Mapa valor -> label (para exibição)
const CONDICOES_LABELS = CONDICOES_LISTA.reduce((acc, c) => {
  acc[c.valor] = c.label;
  return acc;
}, {});

// Aliases/labels extras que podem aparecer em documentos antigos
CONDICOES_LABELS[null] = 'Não especificada';
CONDICOES_LABELS['nao_especificada'] = 'Não especificada';

function obterLabelCondicao(c) {
  return CONDICOES_LABELS[c] || 'Condição Especial';
}

module.exports = {
  CONDICOES_LISTA,
  CONDICOES_VALORES,
  CONDICOES_LABELS,
  obterLabelCondicao
};