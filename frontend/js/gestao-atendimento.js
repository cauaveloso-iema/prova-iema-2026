// ============================================
// js/gestao-atendimento.js
// MÓDULO: ATENDIMENTOS - GESTÃO GERAL
// Atendimento ao Aluno + Atendimento aos Pais/Responsáveis
// ============================================

// ============================================
// ESTADO DO MÓDULO
// ============================================
const atendimentoState = {
  modoBusca: 'automatico',
  scanner: null,
  scannerAtivo: false,
  alunoAtual: null,
  tipoAtendimento: 'aluno',
  motivoSelecionado: null,
  providenciaSelecionada: null,
  sessaoAssinaturaResponsavel: {
    sessaoId: null, assinaturaCapturada: null, qrCodeDataUrl: null,
    monitoramentoInterval: null, modalInstance: null
  },
  sessaoAssinaturaAluno: {
    sessaoId: null, assinaturaCapturada: null, qrCodeDataUrl: null,
    monitoramentoInterval: null, modalInstance: null
  },
  paginacao: { paginaAtual: 1, porPagina: 10, totalRegistros: 0, totalPaginas: 0 },
  turmasDisponiveis: [],
  alunosPorTurma: [],
  relatorioAtual: null,
  charts: { motivos: null, atendimentos: null, turmas: null },
  autocompleteAlunos: { alunos: [], filtrados: [], indice: -1, carregado: false, carregando: false }
};

// ============================================
// LABELS
// ============================================
const ATENDIMENTO_MOTIVOS = [
  { valor: 'comportamento', label: 'Comportamento', icone: 'fas fa-users-slash' },
  { valor: 'desempenho_academico', label: 'Desempenho Acadêmico', icone: 'fas fa-chart-line' },
  { valor: 'frequencia', label: 'Frequência', icone: 'fas fa-calendar-check' },
  { valor: 'relacionamento', label: 'Relacionamento', icone: 'fas fa-handshake' },
  { valor: 'saude', label: 'Saúde', icone: 'fas fa-heartbeat' },
  { valor: 'familia', label: 'Família', icone: 'fas fa-home' },
  { valor: 'disciplina', label: 'Disciplina', icone: 'fas fa-gavel' },
  { valor: 'orientacao', label: 'Orientação', icone: 'fas fa-comments' },
  { valor: 'outros', label: 'Outros', icone: 'fas fa-ellipsis-h' }
];

const ATENDIMENTO_PROVIDENCIAS = [
  { valor: 'orientacao_verbal', label: 'Orientação Verbal', icone: 'fas fa-comment' },
  { valor: 'advertencia_verbal', label: 'Advertência Verbal', icone: 'fas fa-exclamation-circle' },
  { valor: 'advertencia_escrita', label: 'Advertência Escrita', icone: 'fas fa-file-signature' },
  { valor: 'notificacao_responsavel', label: 'Notificação ao Responsável', icone: 'fas fa-bell' },
  { valor: 'reuniao_responsavel', label: 'Reunião com Responsável', icone: 'fas fa-handshake' },
  { valor: 'encaminhamento_psicologia', label: 'Encaminhamento à Psicologia', icone: 'fas fa-brain' },
  { valor: 'encaminhamento_assistente_social', label: 'Encaminhamento à Assistência Social', icone: 'fas fa-hands-helping' },
  { valor: 'acompanhamento_pedagogico', label: 'Acompanhamento Pedagógico', icone: 'fas fa-book-reader' },
  { valor: 'suspensao', label: 'Suspensão', icone: 'fas fa-ban' },
  { valor: 'outros', label: 'Outros', icone: 'fas fa-ellipsis-h' }
];

function getAtendimentoMotivoLabel(valor) {
  const m = ATENDIMENTO_MOTIVOS.find(x => x.valor === valor);
  return m ? m.label : valor;
}
function getAtendimentoProvidenciaLabel(valor) {
  const p = ATENDIMENTO_PROVIDENCIAS.find(x => x.valor === valor);
  return p ? p.label : valor;
}

// ============================================
// HELPERS
// ============================================
function safeGetAtendimento(id) { return document.getElementById(id); }
function getTokenAtendimento() { return localStorage.getItem('auth_token'); }

function getDataLocalISOAtendimento(dateObj) {
  const d = dateObj || new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function gerarAvatarSVGAtendimento(nome) {
  const inicial = (nome || '?').charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1e3c72"/><stop offset="100%" stop-color="#2a5298"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/><text x="50" y="50" font-family="Arial,sans-serif" font-size="45" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${inicial}</text></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

function escapeHTMLAtendimento(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function safeSetTextAtendimento(id, valor) {
  const el = safeGetAtendimento(id);
  if (el) el.textContent = valor;
}

// ============================================
// INICIALIZAÇÃO
// ============================================
function inicializarModuloAtendimentos() {
  console.log('📋 [Atendimentos] Inicializando módulo...');

  const abaAtendimentos = document.getElementById('aba-atendimentos');
  if (abaAtendimentos) {
    abaAtendimentos.addEventListener('shown.bs.tab', () => {
      carregarListaAtendimentos(1);
      setTimeout(() => {
        if (atendimentoState.modoBusca === 'automatico' && !atendimentoState.scannerAtivo) {
          iniciarScannerAtendimento();
        }
      }, 300);
    });
  }

  const subRegistrar = document.getElementById('atendimento-registrar-tab');
  if (subRegistrar) {
    subRegistrar.addEventListener('shown.bs.tab', () => {
      setTimeout(() => {
        if (atendimentoState.modoBusca === 'automatico' && !atendimentoState.scannerAtivo) {
          iniciarScannerAtendimento();
        }
      }, 300);
    });
  }

  // 🆕 Dashboard — escuta TODOS os IDs possíveis para garantir
  ['atendimento-dashboard-tab', 'atendimentoDashboardTab', 'tab-dashboard-atendimento']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('shown.bs.tab', () => {
          console.log('📊 [Atendimentos] Aba dashboard ativada — carregando...');
          carregarDashboardAtendimentos();
        });
      }
    });

  const subRelatorios = document.getElementById('atendimento-relatorios-tab');
  if (subRelatorios) {
    subRelatorios.addEventListener('shown.bs.tab', () => {
      carregarTurmasFiltroAtendimento();
    });
  }

  safeGetAtendimento('modoAutomaticoAtendimentoBtn')?.addEventListener('click', () => setModoBuscaAtendimento('automatico'));
  safeGetAtendimento('modoManualAtendimentoBtn')?.addEventListener('click', () => setModoBuscaAtendimento('manual'));

  safeGetAtendimento('filtroTurmaManualAtendimento')?.addEventListener('change', () => carregarAlunosTurmaAtendimento());
  safeGetAtendimento('filtroBuscaManualAtendimento')?.addEventListener('input', () => filtrarAlunosManualAtendimento());

  safeGetAtendimento('tipoAtendimentoAlunoRadio')?.addEventListener('change', () => {
    atendimentoState.tipoAtendimento = 'aluno';
    atualizarUIPorTipoAtendimento();
  });
  safeGetAtendimento('tipoAtendimentoResponsavelRadio')?.addEventListener('change', () => {
    atendimentoState.tipoAtendimento = 'responsavel';
    atualizarUIPorTipoAtendimento();
  });

  configurarFiltrosListaAtendimentos();
  carregarTurmasManualAtendimento();

  const dataEl = safeGetAtendimento('atendimentoData');
  if (dataEl) dataEl.value = getDataLocalISOAtendimento();

  console.log('✅ [Atendimentos] Módulo inicializado');
}

// ============================================
// MODO DE BUSCA
// ============================================
async function setModoBuscaAtendimento(modo) {
  atendimentoState.modoBusca = modo;
  const infoEl = safeGetAtendimento('atendimentoAlunoInfo');
  const formEl = safeGetAtendimento('formAtendimento');
  if (infoEl) infoEl.style.display = 'none';
  if (formEl) formEl.style.display = 'none';
  atendimentoState.alunoAtual = null;

  if (modo === 'automatico') {
    safeGetAtendimento('modoAutomaticoAtendimentoBtn')?.classList.add('active');
    safeGetAtendimento('modoManualAtendimentoBtn')?.classList.remove('active');
    safeGetAtendimento('modoAutomaticoAtendimento').style.display = 'block';
    safeGetAtendimento('modoManualAtendimento').style.display = 'none';
    await iniciarScannerAtendimento();
  } else {
    safeGetAtendimento('modoManualAtendimentoBtn')?.classList.add('active');
    safeGetAtendimento('modoAutomaticoAtendimentoBtn')?.classList.remove('active');
    safeGetAtendimento('modoAutomaticoAtendimento').style.display = 'none';
    safeGetAtendimento('modoManualAtendimento').style.display = 'block';
    await pararScannerAtendimento();
    const turma = safeGetAtendimento('filtroTurmaManualAtendimento')?.value;
    if (turma) await carregarAlunosTurmaAtendimento();
  }
}

// ============================================
// SCANNER QR CODE
// ============================================
async function iniciarScannerAtendimento() {
  const container = safeGetAtendimento('qr-reader-atendimento');
  if (!container) return;
  if (atendimentoState.scannerAtivo) return;

  const innerId = 'qr-reader-atendimento-new';
  container.innerHTML = `<div id="${innerId}" style="width: 100%;"></div>`;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    container.innerHTML = `
      <div class="alert alert-warning m-3" style="border-radius: 12px;">
        <i class="fas fa-video-slash" style="font-size: 32px; display: block; margin-bottom: 10px;"></i>
        <strong>Câmera não disponível</strong><br>
        Use o <strong>Modo Manual</strong>.
        <button class="btn btn-sm btn-primary mt-3" onclick="setModoBuscaAtendimento('manual')" style="border-radius: 30px;">
          <i class="fas fa-users"></i> Modo Manual
        </button>
      </div>`;
    return;
  }

  try {
    atendimentoState.scanner = new Html5Qrcode(innerId);
    const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
    await atendimentoState.scanner.start({ facingMode: 'environment' }, config,
      (text) => onScanSuccessAtendimento(text), () => {});
    atendimentoState.scannerAtivo = true;
    console.log('✅ [Atendimentos] Scanner iniciado');
  } catch (err) {
    console.error('❌ [Atendimentos] Erro no scanner:', err);
    container.innerHTML = `
      <div class="alert alert-warning m-3" style="border-radius: 12px;">
        <i class="fas fa-video-slash" style="font-size: 32px; display: block; margin-bottom: 10px;"></i>
        <strong>Câmera indisponível</strong><br>
        <button class="btn btn-sm btn-primary mt-3" onclick="setModoBuscaAtendimento('manual')" style="border-radius: 30px;">
          <i class="fas fa-users"></i> Modo Manual
        </button>
      </div>`;
    atendimentoState.scannerAtivo = false;
    atendimentoState.scanner = null;
  }
}

async function pararScannerAtendimento() {
  if (atendimentoState.scanner && atendimentoState.scannerAtivo) {
    try { await atendimentoState.scanner.stop(); } catch (e) {}
  }
  atendimentoState.scannerAtivo = false;
  atendimentoState.scanner = null;
}

async function onScanSuccessAtendimento(decodedText) {
  const alunoId = extrairAlunoIdAtendimento(decodedText);
  if (!alunoId) { notificar('QR Code inválido'); return; }
  await pararScannerAtendimento();
  await buscarAlunoAtendimento(alunoId);
}

function extrairAlunoIdAtendimento(decodedText) {
  if (!decodedText || typeof decodedText !== 'string') return null;
  if (decodedText.match(/^[a-f0-9]{24}$/i)) return decodedText;
  const m1 = decodedText.match(/[?&]aluno=([a-f0-9]{24})/i);
  if (m1) return m1[1];
  const m2 = decodedText.match(/[?&]id=([a-f0-9]{24})/i);
  if (m2) return m2[1];
  return null;
}

// ============================================
// LISTA DE TURMAS / ALUNOS (MODO MANUAL)
// ============================================
async function carregarTurmasManualAtendimento() {
  try {
    const r = await fetch('/api/gestao-atendimento/turmas', {
      headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` }
    });
    const d = await r.json();
    if (d.success && Array.isArray(d.turmas)) {
      atendimentoState.turmasDisponiveis = d.turmas;
      const select = safeGetAtendimento('filtroTurmaManualAtendimento');
      if (select && select.options.length <= 1) {
        select.innerHTML = '<option value="">Selecione uma turma...</option>';
        d.turmas.forEach(t => {
          select.innerHTML += `<option value="${escapeHTMLAtendimento(t)}">${escapeHTMLAtendimento(t)}</option>`;
        });
      }
    }
  } catch (e) { console.error(e); }
}

async function carregarAlunosTurmaAtendimento() {
  const turma = safeGetAtendimento('filtroTurmaManualAtendimento')?.value;
  const lista = safeGetAtendimento('listaAlunosManualAtendimento');
  if (!turma) {
    if (lista) lista.innerHTML = '<div class="text-center py-3">Selecione uma turma</div>';
    return;
  }
  if (lista) lista.innerHTML = '<div class="text-center py-3"><div class="loading-spinner"></div><p>Carregando...</p></div>';

  try {
    const r = await fetch(`/api/gestao-atendimento/alunos-por-turma?turma=${encodeURIComponent(turma)}`, {
      headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` }
    });
    const d = await r.json();
    if (d.success) {
      atendimentoState.alunosPorTurma = d.alunos;
      filtrarAlunosManualAtendimento();
    }
  } catch (e) { console.error(e); }
}

function filtrarAlunosManualAtendimento() {
  const busca = (safeGetAtendimento('filtroBuscaManualAtendimento')?.value || '').toLowerCase();
  let filtrados = atendimentoState.alunosPorTurma;
  if (busca) filtrados = filtrados.filter(a => (a.nome || '').toLowerCase().includes(busca));
  filtrados.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

  const c = safeGetAtendimento('listaAlunosManualAtendimento');
  if (!c) return;
  if (filtrados.length === 0) {
    c.innerHTML = '<div class="text-center text-muted py-3">Nenhum aluno encontrado</div>';
    return;
  }
  c.innerHTML = '<div class="list-group">' + filtrados.map(a => `
    <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
         data-aluno-id="${a.id}" data-aluno-nome="${escapeHTMLAtendimento(a.nome)}" style="cursor:pointer;">
      <div>
        <strong>${escapeHTMLAtendimento(a.nome)}</strong><br>
        <small class="text-muted">${escapeHTMLAtendimento(a.matricula || 'Sem matrícula')} • ${escapeHTMLAtendimento(a.curso || '')}</small>
      </div>
      <i class="fas fa-hand-pointer fa-2x text-primary"></i>
    </div>
  `).join('') + '</div>';

  c.querySelectorAll('.list-group-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-aluno-id');
      const nome = item.getAttribute('data-aluno-nome');
      selecionarAlunoManualAtendimento(id, nome, item);
    });
  });
}

async function selecionarAlunoManualAtendimento(alunoId, alunoNome, itemEl) {
  if (itemEl) {
    itemEl.style.background = '#dbeafe';
    itemEl.style.borderColor = '#1e3c72';
    itemEl.style.pointerEvents = 'none';
    itemEl.innerHTML = `
      <div><strong>${escapeHTMLAtendimento(alunoNome)}</strong><br><small style="color: #1e3c72;">Processando...</small></div>
      <i class="fas fa-spinner fa-spin fa-2x" style="color: #1e3c72;"></i>`;
  }
  try { await buscarAlunoAtendimento(alunoId); } catch (e) { console.error(e); }
}

// ============================================
// BUSCAR / EXIBIR ALUNO
// ============================================
async function buscarAlunoAtendimento(alunoId) {
  try {
    await pararScannerAtendimento();
    const r = await fetch(`/api/gestao-atendimento/aluno/${alunoId}`, {
      headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` }
    });
    const d = await r.json();

    if (d.success && d.aluno) {
      atendimentoState.alunoAtual = d.aluno;
      exibirAlunoAtendimento(d);
      mostrarFormAtendimento();
    } else {
      notificar(d.error || 'Aluno não encontrado');
      if (atendimentoState.modoBusca === 'automatico') reiniciarScannerAtendimento();
      else carregarAlunosTurmaAtendimento();
    }
  } catch (e) {
    console.error(e);
    notificar('Erro ao buscar aluno');
  }
}

function exibirAlunoAtendimento(data) {
  const aluno = data.aluno;

  const foto = safeGetAtendimento('atendimentoAlunoFoto');
  if (foto) {
    foto.onerror = null;
    foto.src = aluno.fotoPerfil || gerarAvatarSVGAtendimento(aluno.nome);
    foto.onerror = function () { this.onerror = null; this.src = gerarAvatarSVGAtendimento(aluno.nome); };
  }

  safeSetTextAtendimento('atendimentoAlunoNome', aluno.nome || '-');
  safeSetTextAtendimento('atendimentoAlunoMatricula', aluno.matricula || 'Não informada');
  safeSetTextAtendimento('atendimentoAlunoTurma', aluno.turma || 'Não informada');
  safeSetTextAtendimento('atendimentoAlunoCurso', aluno.curso || 'Não informado');

  const hist = safeGetAtendimento('atendimentoHistoricoAluno');
  if (hist) {
    if (data.historicoRecente?.length > 0) {
      hist.innerHTML = `
        <h6 class="text-muted mt-3 mb-2"><i class="fas fa-history"></i> Últimos Atendimentos (${data.estatisticas?.totalAtendimentos || 0} no total)</h6>
        ${data.historicoRecente.map(h => `
          <div class="p-2 mb-2" style="background: #f8fafc; border-radius: 8px; font-size: 13px;">
            <span class="badge ${h.tipoAtendimento === 'aluno' ? 'bg-primary' : 'bg-success'}" style="font-size: 10px;">
              ${h.tipoAtendimento === 'aluno' ? 'Aluno' : 'Responsável'}
            </span>
            <strong>${escapeHTMLAtendimento(h.motivoLabel)}</strong>
            <br><small class="text-muted">${new Date(h.dataAtendimento).toLocaleDateString('pt-BR')}</small>
          </div>`).join('')}`;
    } else {
      hist.innerHTML = '<p class="text-muted mt-2"><i class="fas fa-info-circle"></i> Nenhum atendimento anterior</p>';
    }
  }

  if (data.ultimoResponsavel) {
    const respNomeEl = safeGetAtendimento('atendimentoResponsavelNome');
    const respCPFEl = safeGetAtendimento('atendimentoResponsavelCPF');
    const respTelEl = safeGetAtendimento('atendimentoResponsavelTelefone');
    const respParentEl = safeGetAtendimento('atendimentoResponsavelParentesco');
    if (respNomeEl && !respNomeEl.value) respNomeEl.value = data.ultimoResponsavel.nome || '';
    if (respCPFEl && !respCPFEl.value) respCPFEl.value = data.ultimoResponsavel.cpf || '';
    if (respTelEl && !respTelEl.value) respTelEl.value = data.ultimoResponsavel.telefone || '';
    if (respParentEl && !respParentEl.value) respParentEl.value = data.ultimoResponsavel.parentesco || '';
  }

  safeGetAtendimento('atendimentoAlunoInfo').style.display = 'block';
  safeGetAtendimento('atendimentoAlunoInfo').scrollIntoView({ behavior: 'smooth' });
}

// ============================================
// FORMULÁRIO
// ============================================
function mostrarFormAtendimento() {
  safeGetAtendimento('formAtendimento').style.display = 'block';

  atendimentoState.motivoSelecionado = null;
  atendimentoState.providenciaSelecionada = null;
  document.querySelectorAll('#formAtendimento .tipo-card').forEach(c => c.classList.remove('selected'));

  const descMotivo = safeGetAtendimento('atendimentoDescricaoMotivo');
  const descProv = safeGetAtendimento('atendimentoDescricaoProvidencias');
  const obs = safeGetAtendimento('atendimentoObservacoes');
  if (descMotivo) descMotivo.value = '';
  if (descProv) descProv.value = '';
  if (obs) obs.value = '';

  const dataEl = safeGetAtendimento('atendimentoData');
  if (dataEl) dataEl.value = getDataLocalISOAtendimento();

  limparSessaoResponsavelAtendimento();
  limparSessaoAlunoAtendimento();

  const checkResp = safeGetAtendimento('atendimentoNecessitaAssinatura');
  if (checkResp) checkResp.checked = false;
  const checkAluno = safeGetAtendimento('atendimentoNecessitaAssinaturaAluno');
  if (checkAluno) checkAluno.checked = false;

  const blocoResp = safeGetAtendimento('atendimentoBlocoAssinaturaInfo');
  if (blocoResp) { blocoResp.style.display = 'none'; blocoResp.innerHTML = ''; }
  const blocoAluno = safeGetAtendimento('atendimentoBlocoAssinaturaAlunoInfo');
  if (blocoAluno) { blocoAluno.style.display = 'none'; blocoAluno.innerHTML = ''; }

  atualizarUIPorTipoAtendimento();
  setTimeout(() => safeGetAtendimento('atendimentoData')?.focus(), 100);
}

function atualizarUIPorTipoAtendimento() {
  const tipo = atendimentoState.tipoAtendimento;

  const blocoResp = safeGetAtendimento('blocoDadosResponsavelAtendimento');
  if (blocoResp) blocoResp.style.display = tipo === 'responsavel' ? 'block' : 'none';

  const tituloForm = safeGetAtendimento('atendimentoTituloForm');
  if (tituloForm) {
    tituloForm.innerHTML = tipo === 'aluno'
      ? '<i class="fas fa-user-graduate"></i> Atendimento ao Aluno'
      : '<i class="fas fa-user-friends"></i> Atendimento aos Pais/Responsáveis';
  }

  const blocoAssinaturaAluno = safeGetAtendimento('blocoAssinaturaAlunoAtendimento');
  if (blocoAssinaturaAluno) {
    blocoAssinaturaAluno.style.display = tipo === 'aluno' ? 'block' : 'none';
    if (tipo !== 'aluno') {
      const checkAluno = safeGetAtendimento('atendimentoNecessitaAssinaturaAluno');
      if (checkAluno) checkAluno.checked = false;
      limparSessaoAlunoAtendimento();
      const blocoInfo = safeGetAtendimento('atendimentoBlocoAssinaturaAlunoInfo');
      if (blocoInfo) { blocoInfo.style.display = 'none'; blocoInfo.innerHTML = ''; }
    }
  }
}

// ============================================
// SELEÇÃO DE MOTIVO / PROVIDÊNCIA
// ============================================
function selecionarMotivoAtendimento(motivo) {
  atendimentoState.motivoSelecionado = motivo;
  document.querySelectorAll('#campoMotivoAtendimento .tipo-card').forEach(c => c.classList.remove('selected'));
  const card = document.querySelector(`#campoMotivoAtendimento .tipo-card[data-motivo="${motivo}"]`);
  if (card) card.classList.add('selected');
}

function selecionarProvidenciaAtendimento(providencia) {
  atendimentoState.providenciaSelecionada = providencia;
  document.querySelectorAll('#campoProvidenciasAtendimento .tipo-card').forEach(c => c.classList.remove('selected'));
  const card = document.querySelector(`#campoProvidenciasAtendimento .tipo-card[data-providencia="${providencia}"]`);
  if (card) card.classList.add('selected');
}

// ============================================
// REGISTRAR ATENDIMENTO
// ============================================
async function registrarAtendimento() {
  if (!atendimentoState.motivoSelecionado) { notificar('Selecione o motivo do atendimento', 'error'); return; }
  if (!atendimentoState.providenciaSelecionada) { notificar('Selecione as providências tomadas', 'error'); return; }

  const descricaoMotivo = (safeGetAtendimento('atendimentoDescricaoMotivo')?.value || '').trim();
  if (!descricaoMotivo) { notificar('Descreva o motivo do atendimento', 'error'); return; }

  const descricaoProvidencias = (safeGetAtendimento('atendimentoDescricaoProvidencias')?.value || '').trim();
  if (!descricaoProvidencias) { notificar('Descreva as providências tomadas', 'error'); return; }

  const dataAtendimento = safeGetAtendimento('atendimentoData')?.value;
  if (!dataAtendimento) { notificar('Informe a data do atendimento', 'error'); return; }

  if (!atendimentoState.alunoAtual || !atendimentoState.alunoAtual.id) {
    notificar('Nenhum aluno selecionado', 'error'); return;
  }

  const tipo = atendimentoState.tipoAtendimento;
  let responsavelNome = '', responsavelCPF = '', responsavelTelefone = '', responsavelParentesco = '';

  if (tipo === 'responsavel') {
    responsavelNome = (safeGetAtendimento('atendimentoResponsavelNome')?.value || '').trim();
    responsavelCPF = (safeGetAtendimento('atendimentoResponsavelCPF')?.value || '').trim();
    responsavelTelefone = (safeGetAtendimento('atendimentoResponsavelTelefone')?.value || '').trim();
    responsavelParentesco = (safeGetAtendimento('atendimentoResponsavelParentesco')?.value || '').trim();

    if (!responsavelNome) {
      notificar('Informe o nome do responsável', 'error');
      safeGetAtendimento('atendimentoResponsavelNome')?.focus(); return;
    }

    if (responsavelCPF) {
      const validacao = validarCPFClienteAtendimento(responsavelCPF);
      if (!validacao.valido) {
        notificar(`⚠️ CPF inválido!\n\n${validacao.erro}`, 'error', 5000);
        safeGetAtendimento('atendimentoResponsavelCPF')?.focus(); return;
      }
    }
  }

  const precisaAssinatura = safeGetAtendimento('atendimentoNecessitaAssinatura')?.checked || false;
  const assinaturaBase64 = atendimentoState.sessaoAssinaturaResponsavel.assinaturaCapturada || '';
  const sessaoAssinaturaId = atendimentoState.sessaoAssinaturaResponsavel.sessaoId || null;

  if (precisaAssinatura && !assinaturaBase64) {
    notificar('⚠️ Aguardando assinatura do responsável!', 'warning', 5000);
    reabrirModalAssinaturaResponsavelAtendimento(); return;
  }

  const precisaAssinaturaAluno = safeGetAtendimento('atendimentoNecessitaAssinaturaAluno')?.checked || false;
  const assinaturaAlunoBase64 = atendimentoState.sessaoAssinaturaAluno.assinaturaCapturada || '';
  const sessaoAssinaturaAlunoId = atendimentoState.sessaoAssinaturaAluno.sessaoId || null;

  if (precisaAssinaturaAluno && !assinaturaAlunoBase64) {
    notificar('⚠️ Aguardando assinatura do aluno!', 'warning', 5000);
    reabrirModalAssinaturaAlunoAtendimento(); return;
  }

  const btn = document.querySelector('#formAtendimento .btn-primary-custom');
  if (btn) btn.disabled = true;

  try {
    const body = {
      tipoAtendimento: tipo,
      alunoId: atendimentoState.alunoAtual.id,
      responsavelNome, responsavelCPF, responsavelTelefone, responsavelParentesco,
      dataAtendimento,
      motivo: atendimentoState.motivoSelecionado,
      descricaoMotivo,
      providencias: atendimentoState.providenciaSelecionada,
      descricaoProvidencias,
      observacoes: safeGetAtendimento('atendimentoObservacoes')?.value || '',
      precisaAssinatura, assinaturaBase64, sessaoAssinaturaId,
      precisaAssinaturaAluno, assinaturaAlunoBase64, sessaoAssinaturaAlunoId
    };

    const r = await fetch('/api/gestao-atendimento/registrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getTokenAtendimento()}` },
      body: JSON.stringify(body)
    });
    const d = await r.json();

    if (!d.success) { notificar('❌ ' + (d.error || 'Erro'), 'error'); return; }

    console.log('✅ Atendimento registrado:', d.atendimento.id);

    limparSessaoResponsavelAtendimento(true);
    limparSessaoAlunoAtendimento(true);

    notificar(`✅ ${d.message}`, 'success');

    const imprimir = await confirm('Deseja IMPRIMIR agora?');
    if (imprimir) imprimirAtendimento(d.atendimento.id);

    limparTelaAtendimento();
    carregarListaAtendimentos(1);

    if (atendimentoState.modoBusca === 'automatico') reiniciarScannerAtendimento();
  } catch (e) {
    console.error(e);
    notificar('Erro ao registrar atendimento', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function validarCPFClienteAtendimento(cpf) {
  if (typeof window.validarCPFCliente === 'function') return window.validarCPFCliente(cpf);
  const cpfLimpo = cpf.replace(/\D/g, '');
  if (cpfLimpo.length !== 11) return { valido: false, erro: 'CPF deve ter 11 dígitos' };
  if (/^(\d)\1{10}$/.test(cpfLimpo)) return { valido: false, erro: 'CPF inválido' };
  return { valido: true, cpfLimpo };
}

function limparTelaAtendimento() {
  safeGetAtendimento('atendimentoAlunoInfo').style.display = 'none';
  safeGetAtendimento('formAtendimento').style.display = 'none';
  atendimentoState.alunoAtual = null;
  atendimentoState.motivoSelecionado = null;
  atendimentoState.providenciaSelecionada = null;

  limparSessaoResponsavelAtendimento(true);
  limparSessaoAlunoAtendimento(true);

  const checkResp = safeGetAtendimento('atendimentoNecessitaAssinatura');
  if (checkResp) checkResp.checked = false;
  const blocoResp = safeGetAtendimento('atendimentoBlocoAssinaturaInfo');
  if (blocoResp) { blocoResp.style.display = 'none'; blocoResp.innerHTML = ''; }

  const checkAluno = safeGetAtendimento('atendimentoNecessitaAssinaturaAluno');
  if (checkAluno) checkAluno.checked = false;
  const blocoAluno = safeGetAtendimento('atendimentoBlocoAssinaturaAlunoInfo');
  if (blocoAluno) { blocoAluno.style.display = 'none'; blocoAluno.innerHTML = ''; }
}

function reiniciarScannerAtendimento() {
  setTimeout(() => {
    if (!atendimentoState.scannerAtivo && atendimentoState.modoBusca === 'automatico') {
      iniciarScannerAtendimento();
    }
  }, 1000);
}

// ============================================
// SESSÕES DE ASSINATURA (Responsável)
// ============================================
function gerarUUIDAtendimento() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function toggleNecessitaAssinaturaAtendimento() {
  const check = safeGetAtendimento('atendimentoNecessitaAssinatura');
  if (!check) return;

  if (check.checked) {
    if (!atendimentoState.alunoAtual?.id) {
      notificar('⚠️ Selecione um aluno antes de marcar a assinatura', 'warning');
      check.checked = false; return;
    }

    const snapshot = montarSnapshotAtendimento();
    const sessaoId = gerarUUIDAtendimento();
    atendimentoState.sessaoAssinaturaResponsavel.sessaoId = sessaoId;
    atendimentoState.sessaoAssinaturaResponsavel.assinaturaCapturada = null;

    try {
      const response = await fetch('/api/gestao-geral/sessoes-assinatura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getTokenAtendimento()}` },
        body: JSON.stringify({ sessaoId, tipo: 'atendimento', dadosAtendimento: snapshot })
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Erro ao criar sessão');

      const urlAssinatura = `${window.location.origin}/gestao-geral.html?assinatura=${sessaoId}`;

      try {
        const qrResponse = await fetch('/api/qrcode/gerar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getTokenAtendimento()}` },
          body: JSON.stringify({ url: urlAssinatura })
        });
        const qrData = await qrResponse.json();
        if (qrData.success && qrData.qrCode) {
          atendimentoState.sessaoAssinaturaResponsavel.qrCodeDataUrl = qrData.qrCode;
        } else {
          atendimentoState.sessaoAssinaturaResponsavel.qrCodeDataUrl =
            `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
        }
      } catch (e) {
        atendimentoState.sessaoAssinaturaResponsavel.qrCodeDataUrl =
          `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
      }

      abrirModalAssinaturaResponsavelAtendimento(urlAssinatura);
      iniciarMonitoramentoResponsavelAtendimento(sessaoId);
      notificar('📱 QR Code do responsável gerado!', 'info');
    } catch (e) {
      console.error(e);
      notificar('❌ Erro ao criar sessão de assinatura', 'error');
      check.checked = false;
      atendimentoState.sessaoAssinaturaResponsavel.sessaoId = null;
    }
  } else {
    await cancelarSessaoResponsavelAtendimento();
  }
}

function montarSnapshotAtendimento() {
  const aluno = atendimentoState.alunoAtual || {};
  return {
    alunoId: aluno.id, alunoNome: aluno.nome, alunoMatricula: aluno.matricula,
    alunoTurma: aluno.turma, alunoCurso: aluno.curso, alunoFoto: aluno.fotoPerfil,
    tipoAtendimento: atendimentoState.tipoAtendimento,
    motivo: atendimentoState.motivoSelecionado,
    motivoLabel: getAtendimentoMotivoLabel(atendimentoState.motivoSelecionado),
    providencias: atendimentoState.providenciaSelecionada,
    providenciasLabel: getAtendimentoProvidenciaLabel(atendimentoState.providenciaSelecionada),
    descricaoMotivo: safeGetAtendimento('atendimentoDescricaoMotivo')?.value || '',
    descricaoProvidencias: safeGetAtendimento('atendimentoDescricaoProvidencias')?.value || '',
    observacoes: safeGetAtendimento('atendimentoObservacoes')?.value || '',
    responsavelNome: safeGetAtendimento('atendimentoResponsavelNome')?.value || '',
    responsavelCPF: safeGetAtendimento('atendimentoResponsavelCPF')?.value || '',
    data: safeGetAtendimento('atendimentoData')?.value || ''
  };
}

function abrirModalAssinaturaResponsavelAtendimento(urlAssinatura) {
  const antigo = safeGetAtendimento('modalAssinaturaResponsavelAtendimento');
  if (antigo) antigo.remove();

  const qrUrl = atendimentoState.sessaoAssinaturaResponsavel.qrCodeDataUrl ||
    `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;

  const modalHtml = `
    <div class="modal fade" id="modalAssinaturaResponsavelAtendimento" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content" style="border-radius:20px;border:none;overflow:hidden;">
          <div class="modal-header" style="background:linear-gradient(135deg,#1e3c72,#2a5298);color:white;border:none;padding:20px 25px;">
            <h5 class="modal-title"><i class="fas fa-signature"></i> Aguardando Assinatura do Responsável</h5>
            <button type="button" class="btn-close btn-close-white" onclick="fecharModalAssinaturaResponsavelAtendimento()"></button>
          </div>
          <div class="modal-body" style="padding:30px;text-align:center;">
            <div style="background:#fef3c7;border-radius:12px;padding:14px;display:flex;align-items:center;gap:12px;text-align:left;margin-bottom:20px;">
              <div style="width:40px;height:40px;border-radius:50%;border:4px solid #f59e0b;border-top-color:transparent;animation:spin 1s linear infinite;flex-shrink:0;"></div>
              <div>
                <strong style="color:#92400e;">Aguardando assinatura...</strong>
                <p style="margin:3px 0 0;font-size:13px;color:#78350f;">Peça para o responsável escanear o QR Code</p>
              </div>
            </div>
            <div style="background:white;border:2px solid #e2e8f0;border-radius:16px;padding:20px;display:inline-block;">
              <img src="${qrUrl}" alt="QR Code" style="width:260px;height:260px;display:block;" id="qrCodeResponsavelAtendimentoImg">
              <p style="margin:12px 0 0;font-size:13px;color:#64748b;"><i class="fas fa-mobile-alt"></i> Aponte a câmera</p>
            </div>
            <div style="margin-top:16px;">
              <button onclick="copiarLinkAssinaturaAtendimento('${urlAssinatura}')" class="btn-copiar-link">
                <i class="fas fa-link"></i> Copiar link de assinatura
              </button>
            </div>
          </div>
          <div class="modal-footer" style="border-top:1px solid #e5e7eb;padding:15px 25px;justify-content:space-between;">
            <button type="button" class="btn btn-outline-secondary" onclick="fecharModalAssinaturaResponsavelAtendimento()" style="border-radius:10px;">
              <i class="fas fa-eye-slash"></i> Ocultar
            </button>
            <button type="button" class="btn btn-danger" onclick="cancelarSessaoResponsavelAtendimento(true)" style="border-radius:10px;">
              <i class="fas fa-times"></i> Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  atendimentoState.sessaoAssinaturaResponsavel.modalInstance = new bootstrap.Modal(
    safeGetAtendimento('modalAssinaturaResponsavelAtendimento')
  );
  atendimentoState.sessaoAssinaturaResponsavel.modalInstance.show();
}

function fecharModalAssinaturaResponsavelAtendimento() {
  if (atendimentoState.sessaoAssinaturaResponsavel.modalInstance) {
    atendimentoState.sessaoAssinaturaResponsavel.modalInstance.hide();
  }
  const el = safeGetAtendimento('modalAssinaturaResponsavelAtendimento');
  if (el) setTimeout(() => el.remove(), 300);
  mostrarBlocoCompactoResponsavelAtendimento();
}

function mostrarBlocoCompactoResponsavelAtendimento() {
  let bloco = safeGetAtendimento('atendimentoBlocoAssinaturaInfo');
  if (!bloco) {
    bloco = document.createElement('div');
    bloco.id = 'atendimentoBlocoAssinaturaInfo';
    const check = safeGetAtendimento('atendimentoNecessitaAssinatura');
    if (check && check.parentElement) check.parentElement.parentElement.appendChild(bloco);
  }
  bloco.style.display = 'block';
  bloco.innerHTML = `
    <div class="alert alert-warning" style="font-size:13px;border-radius:10px;border-left:4px solid #f59e0b;margin-top:10px;">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <i class="fas fa-clock"></i>
        <div style="flex:1;">
          <strong>Aguardando assinatura do responsável...</strong>
          <p style="margin:3px 0 0;font-size:12px;">O responsável precisa escanear o QR Code</p>
        </div>
        <button type="button" class="btn btn-sm btn-warning" onclick="reabrirModalAssinaturaResponsavelAtendimento()" style="border-radius:8px;">
          <i class="fas fa-qrcode"></i> Mostrar QR
        </button>
      </div>
    </div>`;
}

function reabrirModalAssinaturaResponsavelAtendimento() {
  const sessaoId = atendimentoState.sessaoAssinaturaResponsavel.sessaoId;
  if (!sessaoId) { notificar('⚠️ Nenhuma sessão ativa', 'warning'); return; }
  const url = `${window.location.origin}/gestao-geral.html?assinatura=${sessaoId}`;
  abrirModalAssinaturaResponsavelAtendimento(url);
}

function iniciarMonitoramentoResponsavelAtendimento(sessaoId) {
  pararMonitoramentoResponsavelAtendimento();
  console.log('👀 Monitorando sessão (responsável):', sessaoId);

  const id = setInterval(async () => {
    try {
      const response = await fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoId}`);
      if (!response.ok) {
        if (response.status === 404) {
          pararMonitoramentoResponsavelAtendimento();
          atendimentoState.sessaoAssinaturaResponsavel.sessaoId = null;
          const check = safeGetAtendimento('atendimentoNecessitaAssinatura');
          if (check) check.checked = false;
          const bloco = safeGetAtendimento('atendimentoBlocoAssinaturaInfo');
          if (bloco) bloco.style.display = 'none';
          notificar('⚠️ Sessão de assinatura expirou', 'warning');
        }
        return;
      }
      const data = await response.json();
      if (!data.success) return;

      if (data.sessao.status === 'assinado') {
        atendimentoState.sessaoAssinaturaResponsavel.assinaturaCapturada = data.sessao.assinaturaBase64;
        atualizarStatusAssinadoResponsavelAtendimento(data.sessao);
        pararMonitoramentoResponsavelAtendimento();
        if (atendimentoState.sessaoAssinaturaResponsavel.modalInstance) {
          atendimentoState.sessaoAssinaturaResponsavel.modalInstance.hide();
        }
        const el = safeGetAtendimento('modalAssinaturaResponsavelAtendimento');
        if (el) setTimeout(() => el.remove(), 300);
        notificar(`✅ Assinatura capturada por ${data.sessao.assinadaPorNome || 'Responsável'}!`, 'success');
      } else if (data.sessao.status === 'cancelado') {
        pararMonitoramentoResponsavelAtendimento();
        atendimentoState.sessaoAssinaturaResponsavel.sessaoId = null;
        const check = safeGetAtendimento('atendimentoNecessitaAssinatura');
        if (check) check.checked = false;
        const bloco = safeGetAtendimento('atendimentoBlocoAssinaturaInfo');
        if (bloco) bloco.style.display = 'none';
      }
    } catch (e) { console.warn(e); }
  }, 3000);

  atendimentoState.sessaoAssinaturaResponsavel.monitoramentoInterval = id;
}

function pararMonitoramentoResponsavelAtendimento() {
  const id = atendimentoState.sessaoAssinaturaResponsavel?.monitoramentoInterval;
  if (id) { clearInterval(id); atendimentoState.sessaoAssinaturaResponsavel.monitoramentoInterval = null; }
}

function atualizarStatusAssinadoResponsavelAtendimento(sessao) {
  let bloco = safeGetAtendimento('atendimentoBlocoAssinaturaInfo');
  if (!bloco) {
    bloco = document.createElement('div');
    bloco.id = 'atendimentoBlocoAssinaturaInfo';
    const check = safeGetAtendimento('atendimentoNecessitaAssinatura');
    if (check && check.parentElement) check.parentElement.parentElement.appendChild(bloco);
  }
  bloco.style.display = 'block';
  bloco.innerHTML = `
    <div style="margin-top:10px;background:#f0fdf4;border:2px solid #10b981;border-radius:12px;padding:14px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <i class="fas fa-check-circle" style="color:#10b981;font-size:22px;"></i>
        <div style="flex:1;">
          <strong style="color:#065f46;">✓ Assinatura do responsável capturada!</strong>
          <p style="margin:3px 0 0;font-size:12px;color:#047857;">
            ${escapeHTMLAtendimento(sessao.assinadaPorNome || '')}
            ${sessao.assinadaEm ? ` em ${new Date(sessao.assinadaEm).toLocaleString('pt-BR')}` : ''}
          </p>
        </div>
      </div>
      <div style="background:white;border-radius:8px;padding:8px;text-align:center;">
        <img src="${sessao.assinaturaBase64}" style="max-width:100%;max-height:100px;" alt="Assinatura">
      </div>
      <button type="button" onclick="refazerAssinaturaResponsavelAtendimento()" class="btn btn-sm btn-outline-danger w-100 mt-2" style="border-radius:8px;">
        <i class="fas fa-redo"></i> Refazer Assinatura
      </button>
    </div>`;
}

async function cancelarSessaoResponsavelAtendimento(silencioso = false) {
  if (!silencioso) {
    const ok = await confirm('Cancelar a assinatura do responsável?');
    if (!ok) {
      const check = safeGetAtendimento('atendimentoNecessitaAssinatura');
      if (check) check.checked = true;
      return;
    }
  }
  const sessaoId = atendimentoState.sessaoAssinaturaResponsavel.sessaoId;
  if (sessaoId) {
    try {
      await fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` }
      });
    } catch (e) { console.warn(e); }
  }
  pararMonitoramentoResponsavelAtendimento();
  if (atendimentoState.sessaoAssinaturaResponsavel.modalInstance) {
    atendimentoState.sessaoAssinaturaResponsavel.modalInstance.hide();
  }
  const el = safeGetAtendimento('modalAssinaturaResponsavelAtendimento');
  if (el) setTimeout(() => el.remove(), 300);

  atendimentoState.sessaoAssinaturaResponsavel = {
    sessaoId: null, assinaturaCapturada: null, qrCodeDataUrl: null,
    monitoramentoInterval: null, modalInstance: null
  };

  const check = safeGetAtendimento('atendimentoNecessitaAssinatura');
  if (check) check.checked = false;
  const bloco = safeGetAtendimento('atendimentoBlocoAssinaturaInfo');
  if (bloco) bloco.style.display = 'none';
  if (!silencioso) notificar('Sessão do responsável cancelada', 'info');
}

function limparSessaoResponsavelAtendimento(removerDaAPI = false) {
  const sessaoId = atendimentoState.sessaoAssinaturaResponsavel.sessaoId;
  if (sessaoId && removerDaAPI) {
    fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` }
    }).catch(e => console.warn(e));
  }
  pararMonitoramentoResponsavelAtendimento();
  atendimentoState.sessaoAssinaturaResponsavel = {
    sessaoId: null, assinaturaCapturada: null, qrCodeDataUrl: null,
    monitoramentoInterval: null, modalInstance: null
  };
}

async function refazerAssinaturaResponsavelAtendimento() {
  const ok = await confirm('Refazer a assinatura do responsável?');
  if (!ok) return;
  const sessaoId = atendimentoState.sessaoAssinaturaResponsavel.sessaoId;
  if (sessaoId) {
    try {
      await fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` }
      });
    } catch (e) { console.warn(e); }
  }
  limparSessaoResponsavelAtendimento();
  const bloco = safeGetAtendimento('atendimentoBlocoAssinaturaInfo');
  if (bloco) bloco.style.display = 'none';
  const check = safeGetAtendimento('atendimentoNecessitaAssinatura');
  if (check) { check.checked = false; check.checked = true; await toggleNecessitaAssinaturaAtendimento(); }
}

// ============================================
// SESSÕES DE ASSINATURA (Aluno)
// ============================================
async function toggleNecessitaAssinaturaAlunoAtendimento() {
  const check = safeGetAtendimento('atendimentoNecessitaAssinaturaAluno');
  if (!check) return;

  if (check.checked) {
    if (!atendimentoState.alunoAtual?.id) {
      notificar('⚠️ Selecione um aluno antes de marcar a assinatura', 'warning');
      check.checked = false; return;
    }

    const snapshot = montarSnapshotAtendimento();
    const sessaoId = gerarUUIDAtendimento();
    atendimentoState.sessaoAssinaturaAluno.sessaoId = sessaoId;
    atendimentoState.sessaoAssinaturaAluno.assinaturaCapturada = null;

    try {
      const response = await fetch('/api/gestao-geral/sessoes-assinatura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getTokenAtendimento()}` },
        body: JSON.stringify({ sessaoId, tipo: 'atendimento_aluno', dadosAtendimento: { ...snapshot, tipoAssinante: 'aluno' } })
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Erro ao criar sessão');

      const urlAssinatura = `${window.location.origin}/gestao-geral.html?assinatura=${sessaoId}`;

      try {
        const qrResponse = await fetch('/api/qrcode/gerar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getTokenAtendimento()}` },
          body: JSON.stringify({ url: urlAssinatura })
        });
        const qrData = await qrResponse.json();
        if (qrData.success && qrData.qrCode) {
          atendimentoState.sessaoAssinaturaAluno.qrCodeDataUrl = qrData.qrCode;
        } else {
          atendimentoState.sessaoAssinaturaAluno.qrCodeDataUrl =
            `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
        }
      } catch (e) {
        atendimentoState.sessaoAssinaturaAluno.qrCodeDataUrl =
          `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
      }

      abrirModalAssinaturaAlunoAtendimento(urlAssinatura);
      iniciarMonitoramentoAlunoAtendimento(sessaoId);
      notificar('📱 QR Code do aluno gerado!', 'info');
    } catch (e) {
      console.error(e);
      notificar('❌ Erro ao criar sessão de assinatura do aluno', 'error');
      check.checked = false;
      atendimentoState.sessaoAssinaturaAluno.sessaoId = null;
    }
  } else {
    await cancelarSessaoAlunoAtendimento();
  }
}

function abrirModalAssinaturaAlunoAtendimento(urlAssinatura) {
  const antigo = safeGetAtendimento('modalAssinaturaAlunoAtendimento');
  if (antigo) antigo.remove();

  const qrUrl = atendimentoState.sessaoAssinaturaAluno.qrCodeDataUrl ||
    `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;

  const modalHtml = `
    <div class="modal fade" id="modalAssinaturaAlunoAtendimento" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content" style="border-radius:20px;border:none;overflow:hidden;">
          <div class="modal-header" style="background:linear-gradient(135deg,#059669,#10b981);color:white;border:none;padding:20px 25px;">
            <h5 class="modal-title"><i class="fas fa-user-graduate"></i> Aguardando Assinatura do Aluno</h5>
            <button type="button" class="btn-close btn-close-white" onclick="fecharModalAssinaturaAlunoAtendimento()"></button>
          </div>
          <div class="modal-body" style="padding:30px;text-align:center;">
            <div style="background:#fef3c7;border-radius:12px;padding:14px;display:flex;align-items:center;gap:12px;text-align:left;margin-bottom:20px;">
              <div style="width:40px;height:40px;border-radius:50%;border:4px solid #f59e0b;border-top-color:transparent;animation:spin 1s linear infinite;flex-shrink:0;"></div>
              <div>
                <strong style="color:#92400e;">Aguardando assinatura do aluno...</strong>
                <p style="margin:3px 0 0;font-size:13px;color:#78350f;">Peça para o aluno escanear o QR Code</p>
              </div>
            </div>
            <div style="background:white;border:2px solid #e2e8f0;border-radius:16px;padding:20px;display:inline-block;">
              <img src="${qrUrl}" alt="QR Code" style="width:260px;height:260px;display:block;" id="qrCodeAlunoAtendimentoImg">
              <p style="margin:12px 0 0;font-size:13px;color:#64748b;"><i class="fas fa-mobile-alt"></i> Aponte a câmera</p>
            </div>
            <div style="margin-top:16px;">
              <button onclick="copiarLinkAssinaturaAtendimento('${urlAssinatura}')" class="btn-copiar-link">
                <i class="fas fa-link"></i> Copiar link de assinatura
              </button>
            </div>
          </div>
          <div class="modal-footer" style="border-top:1px solid #e5e7eb;padding:15px 25px;justify-content:space-between;">
            <button type="button" class="btn btn-outline-secondary" onclick="fecharModalAssinaturaAlunoAtendimento()" style="border-radius:10px;">
              <i class="fas fa-eye-slash"></i> Ocultar
            </button>
            <button type="button" class="btn btn-danger" onclick="cancelarSessaoAlunoAtendimento(true)" style="border-radius:10px;">
              <i class="fas fa-times"></i> Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
  atendimentoState.sessaoAssinaturaAluno.modalInstance = new bootstrap.Modal(
    safeGetAtendimento('modalAssinaturaAlunoAtendimento')
  );
  atendimentoState.sessaoAssinaturaAluno.modalInstance.show();
}

function fecharModalAssinaturaAlunoAtendimento() {
  if (atendimentoState.sessaoAssinaturaAluno.modalInstance) {
    atendimentoState.sessaoAssinaturaAluno.modalInstance.hide();
  }
  const el = safeGetAtendimento('modalAssinaturaAlunoAtendimento');
  if (el) setTimeout(() => el.remove(), 300);
  mostrarBlocoCompactoAlunoAtendimento();
}

function mostrarBlocoCompactoAlunoAtendimento() {
  let bloco = safeGetAtendimento('atendimentoBlocoAssinaturaAlunoInfo');
  if (!bloco) {
    bloco = document.createElement('div');
    bloco.id = 'atendimentoBlocoAssinaturaAlunoInfo';
    const check = safeGetAtendimento('atendimentoNecessitaAssinaturaAluno');
    if (check && check.parentElement) check.parentElement.parentElement.appendChild(bloco);
  }
  bloco.style.display = 'block';
  bloco.innerHTML = `
    <div class="alert alert-warning" style="font-size:13px;border-radius:10px;border-left:4px solid #f59e0b;margin-top:10px;">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <i class="fas fa-clock"></i>
        <div style="flex:1;">
          <strong>Aguardando assinatura do aluno...</strong>
          <p style="margin:3px 0 0;font-size:12px;">O aluno precisa escanear o QR Code</p>
        </div>
        <button type="button" class="btn btn-sm btn-warning" onclick="reabrirModalAssinaturaAlunoAtendimento()" style="border-radius:8px;">
          <i class="fas fa-qrcode"></i> Mostrar QR
        </button>
      </div>
    </div>`;
}

function reabrirModalAssinaturaAlunoAtendimento() {
  const sessaoId = atendimentoState.sessaoAssinaturaAluno.sessaoId;
  if (!sessaoId) { notificar('⚠️ Nenhuma sessão ativa', 'warning'); return; }
  const url = `${window.location.origin}/gestao-geral.html?assinatura=${sessaoId}`;
  abrirModalAssinaturaAlunoAtendimento(url);
}

function iniciarMonitoramentoAlunoAtendimento(sessaoId) {
  pararMonitoramentoAlunoAtendimento();
  console.log('👀 Monitorando sessão (aluno):', sessaoId);

  const id = setInterval(async () => {
    try {
      const response = await fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoId}`);
      if (!response.ok) {
        if (response.status === 404) {
          pararMonitoramentoAlunoAtendimento();
          atendimentoState.sessaoAssinaturaAluno.sessaoId = null;
          const check = safeGetAtendimento('atendimentoNecessitaAssinaturaAluno');
          if (check) check.checked = false;
          const bloco = safeGetAtendimento('atendimentoBlocoAssinaturaAlunoInfo');
          if (bloco) bloco.style.display = 'none';
          notificar('⚠️ Sessão de assinatura do aluno expirou', 'warning');
        }
        return;
      }
      const data = await response.json();
      if (!data.success) return;

      if (data.sessao.status === 'assinado') {
        atendimentoState.sessaoAssinaturaAluno.assinaturaCapturada = data.sessao.assinaturaBase64;
        atualizarStatusAssinadoAlunoAtendimento(data.sessao);
        pararMonitoramentoAlunoAtendimento();
        if (atendimentoState.sessaoAssinaturaAluno.modalInstance) {
          atendimentoState.sessaoAssinaturaAluno.modalInstance.hide();
        }
        const el = safeGetAtendimento('modalAssinaturaAlunoAtendimento');
        if (el) setTimeout(() => el.remove(), 300);
        notificar('✅ Assinatura do aluno capturada!', 'success');
      } else if (data.sessao.status === 'cancelado') {
        pararMonitoramentoAlunoAtendimento();
        atendimentoState.sessaoAssinaturaAluno.sessaoId = null;
        const check = safeGetAtendimento('atendimentoNecessitaAssinaturaAluno');
        if (check) check.checked = false;
        const bloco = safeGetAtendimento('atendimentoBlocoAssinaturaAlunoInfo');
        if (bloco) bloco.style.display = 'none';
      }
    } catch (e) { console.warn(e); }
  }, 3000);

  atendimentoState.sessaoAssinaturaAluno.monitoramentoInterval = id;
}

function pararMonitoramentoAlunoAtendimento() {
  const id = atendimentoState.sessaoAssinaturaAluno?.monitoramentoInterval;
  if (id) { clearInterval(id); atendimentoState.sessaoAssinaturaAluno.monitoramentoInterval = null; }
}

function atualizarStatusAssinadoAlunoAtendimento(sessao) {
  let bloco = safeGetAtendimento('atendimentoBlocoAssinaturaAlunoInfo');
  if (!bloco) {
    bloco = document.createElement('div');
    bloco.id = 'atendimentoBlocoAssinaturaAlunoInfo';
    const check = safeGetAtendimento('atendimentoNecessitaAssinaturaAluno');
    if (check && check.parentElement) check.parentElement.parentElement.appendChild(bloco);
  }
  bloco.style.display = 'block';
  bloco.innerHTML = `
    <div style="margin-top:10px;background:#f0fdf4;border:2px solid #10b981;border-radius:12px;padding:14px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <i class="fas fa-check-circle" style="color:#10b981;font-size:22px;"></i>
        <div style="flex:1;">
          <strong style="color:#065f46;">✓ Assinatura do aluno capturada!</strong>
          <p style="margin:3px 0 0;font-size:12px;color:#047857;">
            ${sessao.assinadaEm ? `em ${new Date(sessao.assinadaEm).toLocaleString('pt-BR')}` : ''}
          </p>
        </div>
      </div>
      <div style="background:white;border-radius:8px;padding:8px;text-align:center;">
        <img src="${sessao.assinaturaBase64}" style="max-width:100%;max-height:100px;" alt="Assinatura do Aluno">
      </div>
      <button type="button" onclick="refazerAssinaturaAlunoAtendimento()" class="btn btn-sm btn-outline-danger w-100 mt-2" style="border-radius:8px;">
        <i class="fas fa-redo"></i> Refazer Assinatura do Aluno
      </button>
    </div>`;
}

async function cancelarSessaoAlunoAtendimento(silencioso = false) {
  if (!silencioso) {
    const ok = await confirm('Cancelar a assinatura do aluno?');
    if (!ok) {
      const check = safeGetAtendimento('atendimentoNecessitaAssinaturaAluno');
      if (check) check.checked = true;
      return;
    }
  }
  const sessaoId = atendimentoState.sessaoAssinaturaAluno.sessaoId;
  if (sessaoId) {
    try {
      await fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` }
      });
    } catch (e) { console.warn(e); }
  }
  pararMonitoramentoAlunoAtendimento();
  if (atendimentoState.sessaoAssinaturaAluno.modalInstance) {
    atendimentoState.sessaoAssinaturaAluno.modalInstance.hide();
  }
  const el = safeGetAtendimento('modalAssinaturaAlunoAtendimento');
  if (el) setTimeout(() => el.remove(), 300);

  atendimentoState.sessaoAssinaturaAluno = {
    sessaoId: null, assinaturaCapturada: null, qrCodeDataUrl: null,
    monitoramentoInterval: null, modalInstance: null
  };

  const check = safeGetAtendimento('atendimentoNecessitaAssinaturaAluno');
  if (check) check.checked = false;
  const bloco = safeGetAtendimento('atendimentoBlocoAssinaturaAlunoInfo');
  if (bloco) bloco.style.display = 'none';
  if (!silencioso) notificar('Sessão do aluno cancelada', 'info');
}

function limparSessaoAlunoAtendimento(removerDaAPI = false) {
  const sessaoId = atendimentoState.sessaoAssinaturaAluno.sessaoId;
  if (sessaoId && removerDaAPI) {
    fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` }
    }).catch(e => console.warn(e));
  }
  pararMonitoramentoAlunoAtendimento();
  atendimentoState.sessaoAssinaturaAluno = {
    sessaoId: null, assinaturaCapturada: null, qrCodeDataUrl: null,
    monitoramentoInterval: null, modalInstance: null
  };
}

async function refazerAssinaturaAlunoAtendimento() {
  const ok = await confirm('Refazer a assinatura do aluno?');
  if (!ok) return;
  const sessaoId = atendimentoState.sessaoAssinaturaAluno.sessaoId;
  if (sessaoId) {
    try {
      await fetch(`/api/gestao-geral/sessoes-assinatura/${sessaoId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` }
      });
    } catch (e) { console.warn(e); }
  }
  limparSessaoAlunoAtendimento();
  const bloco = safeGetAtendimento('atendimentoBlocoAssinaturaAlunoInfo');
  if (bloco) bloco.style.display = 'none';
  const check = safeGetAtendimento('atendimentoNecessitaAssinaturaAluno');
  if (check) { check.checked = false; check.checked = true; await toggleNecessitaAssinaturaAlunoAtendimento(); }
}

function copiarLinkAssinaturaAtendimento(url) {
  try {
    navigator.clipboard.writeText(url).then(() => notificar('✅ Link copiado!', 'success'));
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = url; document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); document.body.removeChild(ta);
    notificar('✅ Link copiado!', 'success');
  }
}

// ============================================
// LISTAGEM
// ============================================
async function carregarListaAtendimentos(pagina = null) {
  const container = safeGetAtendimento('listaAtendimentos');
  if (!container) return;

  const pag = atendimentoState.paginacao;
  if (pagina === null) pagina = pag.paginaAtual;
  pag.paginaAtual = pagina;

  await carregarOpcoesFiltroListaAtendimento();

  const alunoNome = safeGetAtendimento('filtroListaAtendimentoAluno')?.value || '';
  const turma = safeGetAtendimento('filtroListaAtendimentoTurma')?.value || '';
  const motivo = safeGetAtendimento('filtroListaAtendimentoMotivo')?.value || '';
  const tipo = safeGetAtendimento('filtroListaAtendimentoTipo')?.value || '';
  const dataInicio = safeGetAtendimento('filtroListaAtendimentoDataInicio')?.value || '';
  const dataFim = safeGetAtendimento('filtroListaAtendimentoDataFim')?.value || '';

  let url = `/api/gestao-atendimento/listar?limit=${pag.porPagina}&page=${pagina}`;
  if (alunoNome) url += `&alunoNome=${encodeURIComponent(alunoNome)}`;
  if (turma) url += `&turma=${encodeURIComponent(turma)}`;
  if (motivo) url += `&motivo=${encodeURIComponent(motivo)}`;
  if (tipo) url += `&tipoAtendimento=${encodeURIComponent(tipo)}`;
  if (dataInicio) url += `&dataInicio=${dataInicio}`;
  if (dataFim) url += `&dataFim=${dataFim}`;

  container.innerHTML = `<div class="text-center py-3"><div class="loading-spinner"></div><p>Carregando atendimentos...</p></div>`;

  try {
    const r = await fetch(url, { headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();

    if (!d.success || !d.atendimentos || d.atendimentos.length === 0) {
      container.innerHTML = `<p class="text-muted text-center py-3">
        <i class="fas fa-inbox" style="font-size:32px;color:#cbd5e1;display:block;margin-bottom:10px;"></i>
        Nenhum atendimento encontrado.
      </p>`;
      pag.totalRegistros = 0;
      pag.totalPaginas = 0;
      return;
    }

    pag.totalRegistros = d.total || 0;
    pag.totalPaginas = d.totalPages || 1;

    container.innerHTML = `
      <div class="table-responsive">
        <table class="table table-hover">
          <thead>
            <tr>
              <th>Data</th>
              <th>Tipo</th>
              <th>Aluno</th>
              <th>Turma</th>
              <th>Responsável</th>
              <th>Motivo</th>
              <th>Providências</th>
              <th>Assinaturas</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${d.atendimentos.map(a => `
              <tr>
                <td>${a.dataFormatada}</td>
                <td>
                  <span class="badge ${a.tipoAtendimento === 'aluno' ? 'bg-primary' : 'bg-success'}">
                    ${a.tipoAtendimento === 'aluno' ? '<i class="fas fa-user-graduate"></i> Aluno' : '<i class="fas fa-user-friends"></i> Responsável'}
                  </span>
                </td>
                <td><strong>${escapeHTMLAtendimento(a.alunoNome)}</strong></td>
                <td>${escapeHTMLAtendimento(a.alunoTurma)}</td>
                <td>${a.responsavelNome ? escapeHTMLAtendimento(a.responsavelNome) : '-'}</td>
                <td><span class="badge bg-info text-dark">${escapeHTMLAtendimento(a.motivoLabel)}</span></td>
                <td><span class="badge bg-secondary">${escapeHTMLAtendimento(a.providenciasLabel)}</span></td>
                <td>
                  ${a.temAssinatura ? '<span class="badge bg-success" title="Responsável"><i class="fas fa-signature"></i> R</span>' : ''}
                  ${a.temAssinaturaAluno ? '<span class="badge bg-primary ms-1" title="Aluno"><i class="fas fa-signature"></i> A</span>' : ''}
                  ${!a.temAssinatura && !a.temAssinaturaAluno ? '<span class="text-muted">-</span>' : ''}
                </td>
                <td>
                  <button class="btn btn-sm btn-info" onclick="verAtendimento('${a.id}')" title="Visualizar" style="padding: 4px 8px;">
                    <i class="fas fa-eye"></i>
                  </button>
                  <button class="btn btn-sm btn-primary" onclick="imprimirAtendimento('${a.id}')" title="Imprimir" style="padding: 4px 8px;">
                    <i class="fas fa-print"></i>
                  </button>
                  <button class="btn btn-sm btn-warning" onclick="abrirEditarAtendimento('${a.id}')" title="Editar" style="padding: 4px 8px;">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button class="btn btn-sm btn-danger" onclick="excluirAtendimento('${a.id}')" title="Excluir" style="padding: 4px 8px;">
                    <i class="fas fa-trash"></i>
                  </button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${renderizarPaginacaoAtendimentos()}`;
  } catch (e) {
    console.error(e);
    container.innerHTML = `<div class="text-center py-3">
      <p class="text-danger"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar.</p>
      <button class="btn btn-sm btn-outline-primary" onclick="carregarListaAtendimentos(1)">
        <i class="fas fa-sync-alt"></i> Tentar novamente
      </button>
    </div>`;
  }
}

// ============================================
// 👁️ VER DETALHES DO ATENDIMENTO (NOVO)
// ============================================
async function verAtendimento(id) {
  if (!id) return;

  try {
    const r = await fetch(`/api/gestao-atendimento/${id}`, {
      headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` }
    });
    const d = await r.json();

    if (!d.success || !d.atendimento) {
      notificar('Erro ao carregar atendimento', 'error');
      return;
    }

    const a = d.atendimento;
    const old = safeGetAtendimento('modalVerAtendimento');
    if (old) old.remove();

    const tipoLabel = a.tipoAtendimento === 'aluno' ? 'Atendimento ao Aluno' : 'Atendimento aos Pais/Responsáveis';
    const tipoBadgeClass = a.tipoAtendimento === 'aluno' ? 'bg-primary' : 'bg-success';
    const dataFmt = a.dataFormatada || new Date(a.dataAtendimento).toLocaleDateString('pt-BR');

    // Bloco do responsável (só aparece se tipo responsavel)
    let blocoResponsavel = '';
    if (a.tipoAtendimento === 'responsavel' && (a.responsavelNome || a.responsavelCPF || a.responsavelTelefone || a.responsavelParentesco)) {
      blocoResponsavel = `
        <div class="card mb-3" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
          <div class="card-body p-3">
            <h6 style="color: #1e3c72; margin-bottom: 12px; font-size: 13px; text-transform: uppercase; font-weight: 700;">
              <i class="fas fa-user-shield"></i> Dados do Responsável
            </h6>
            <div class="row g-2">
              ${a.responsavelNome ? `<div class="col-md-6"><small class="text-muted d-block" style="font-size: 11px;">Nome</small><strong style="font-size: 14px;">${escapeHTMLAtendimento(a.responsavelNome)}</strong></div>` : ''}
              ${a.responsavelCPF ? `<div class="col-md-3"><small class="text-muted d-block" style="font-size: 11px;">CPF</small><strong style="font-size: 14px;">${escapeHTMLAtendimento(a.responsavelCPF)}</strong></div>` : ''}
              ${a.responsavelTelefone ? `<div class="col-md-3"><small class="text-muted d-block" style="font-size: 11px;">Telefone</small><strong style="font-size: 14px;">${escapeHTMLAtendimento(a.responsavelTelefone)}</strong></div>` : ''}
              ${a.responsavelParentesco ? `<div class="col-md-6"><small class="text-muted d-block" style="font-size: 11px;">Parentesco</small><strong style="font-size: 14px;">${escapeHTMLAtendimento(a.responsavelParentesco)}</strong></div>` : ''}
            </div>
          </div>
        </div>`;
    }

    // Bloco de assinatura do responsável
    let assinaturaRespHTML = '';
    if (a.temAssinatura && a.assinaturaBase64) {
      assinaturaRespHTML = `
        <div class="mb-3">
          <label class="text-muted small fw-bold d-block mb-2" style="font-size: 11px;">ASSINATURA DO RESPONSÁVEL</label>
          <div style="background: #f0fdf4; border: 2px solid #10b981; border-radius: 12px; padding: 12px; text-align: center;">
            <img src="${a.assinaturaBase64}" style="max-width: 100%; max-height: 120px; object-fit: contain;" alt="Assinatura do Responsável">
            ${a.assinadaPorNome ? `<p class="mb-0 mt-2" style="font-size: 12px; color: #065f46;"><i class="fas fa-check-circle"></i> Assinado por: <strong>${escapeHTMLAtendimento(a.assinadaPorNome)}</strong></p>` : ''}
            ${a.assinadaEm ? `<p class="mb-0" style="font-size: 11px; color: #047857;">Em: ${new Date(a.assinadaEm).toLocaleString('pt-BR')}</p>` : ''}
          </div>
        </div>`;
    } else if (a.precisaAssinatura) {
      assinaturaRespHTML = `
        <div class="mb-3">
          <label class="text-muted small fw-bold d-block mb-2" style="font-size: 11px;">ASSINATURA DO RESPONSÁVEL</label>
          <div style="background: #fef3c7; border: 2px dashed #f59e0b; border-radius: 12px; padding: 12px; text-align: center; color: #92400e;">
            <i class="fas fa-clock fa-2x mb-2"></i>
            <p class="mb-0" style="font-size: 13px; font-weight: 600;">Aguardando assinatura</p>
          </div>
        </div>`;
    }

    // Bloco de assinatura do aluno
    let assinaturaAlunoHTML = '';
    if (a.temAssinaturaAluno && a.assinaturaAlunoBase64) {
      assinaturaAlunoHTML = `
        <div class="mb-3">
          <label class="text-muted small fw-bold d-block mb-2" style="font-size: 11px;">ASSINATURA DO ALUNO</label>
          <div style="background: #f0fdf4; border: 2px solid #10b981; border-radius: 12px; padding: 12px; text-align: center;">
            <img src="${a.assinaturaAlunoBase64}" style="max-width: 100%; max-height: 120px; object-fit: contain;" alt="Assinatura do Aluno">
            ${a.assinadaPorNomeAluno ? `<p class="mb-0 mt-2" style="font-size: 12px; color: #065f46;"><i class="fas fa-check-circle"></i> Assinado por: <strong>${escapeHTMLAtendimento(a.assinadaPorNomeAluno)}</strong></p>` : ''}
            ${a.assinadaEmAluno ? `<p class="mb-0" style="font-size: 11px; color: #047857;">Em: ${new Date(a.assinadaEmAluno).toLocaleString('pt-BR')}</p>` : ''}
          </div>
        </div>`;
    } else if (a.precisaAssinaturaAluno) {
      assinaturaAlunoHTML = `
        <div class="mb-3">
          <label class="text-muted small fw-bold d-block mb-2" style="font-size: 11px;">ASSINATURA DO ALUNO</label>
          <div style="background: #fef3c7; border: 2px dashed #f59e0b; border-radius: 12px; padding: 12px; text-align: center; color: #92400e;">
            <i class="fas fa-clock fa-2x mb-2"></i>
            <p class="mb-0" style="font-size: 13px; font-weight: 600;">Aguardando assinatura</p>
          </div>
        </div>`;
    }

    const modalHtml = `
      <div class="modal fade" id="modalVerAtendimento" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
          <div class="modal-content" style="border-radius: 16px; border: none; overflow: hidden;">

            <div class="modal-header" style="background: linear-gradient(135deg, #1e3c72, #2a5298); color: white; border: none; padding: 20px 25px;">
              <h5 class="modal-title" style="display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-eye"></i> Detalhes do Atendimento
              </h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>

            <div class="modal-body" style="padding: 25px; background: #f8fafc;">

              <!-- Card do Aluno -->
              <div class="d-flex align-items-center gap-3 p-3 mb-4" style="background: white; border-radius: 12px; border-left: 4px solid #1e3c72; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
                <img src="${gerarAvatarSVGAtendimento(a.alunoNome)}" style="width: 60px; height: 60px; border-radius: 50%; border: 2px solid #1e3c72;" alt="">
                <div style="flex: 1;">
                  <h5 style="margin: 0; color: #1e3c72; font-weight: 700;">${escapeHTMLAtendimento(a.alunoNome)}</h5>
                  <p style="margin: 2px 0 0; font-size: 13px; color: #64748b;">
                    <i class="fas fa-id-card"></i> ${escapeHTMLAtendimento(a.alunoMatricula || 'Sem matrícula')} •
                    <i class="fas fa-graduation-cap"></i> ${escapeHTMLAtendimento(a.alunoTurma || '-')}
                    ${a.alunoCurso ? ` • ${escapeHTMLAtendimento(a.alunoCurso)}` : ''}
                  </p>
                </div>
                <span class="badge ${tipoBadgeClass}" style="font-size: 12px; padding: 6px 12px;">
                  ${a.tipoAtendimento === 'aluno' ? '<i class="fas fa-user-graduate"></i> Aluno' : '<i class="fas fa-user-friends"></i> Responsável'}
                </span>
              </div>

              <!-- Grid de Informações -->
              <div class="row g-3 mb-3">
                <div class="col-md-4">
                  <div class="p-3 bg-white rounded" style="border: 1px solid #e2e8f0;">
                    <label class="text-muted small fw-bold d-block mb-1" style="font-size: 11px;">DATA DO ATENDIMENTO</label>
                    <span style="font-size: 15px; font-weight: 600; color: #1e293b;">${dataFmt}</span>
                  </div>
                </div>
                <div class="col-md-4">
                  <div class="p-3 bg-white rounded" style="border: 1px solid #e2e8f0;">
                    <label class="text-muted small fw-bold d-block mb-1" style="font-size: 11px;">MOTIVO</label>
                    <span class="badge bg-info text-dark" style="font-size: 13px; padding: 6px 12px;">${escapeHTMLAtendimento(a.motivoLabel)}</span>
                  </div>
                </div>
                <div class="col-md-4">
                  <div class="p-3 bg-white rounded" style="border: 1px solid #e2e8f0;">
                    <label class="text-muted small fw-bold d-block mb-1" style="font-size: 11px;">PROVIDÊNCIAS</label>
                    <span class="badge bg-secondary" style="font-size: 13px; padding: 6px 12px;">${escapeHTMLAtendimento(a.providenciasLabel)}</span>
                  </div>
                </div>
              </div>

              ${blocoResponsavel}

              <!-- Descrição do Motivo -->
              <div class="mb-3">
                <label class="text-muted small fw-bold d-block mb-2" style="font-size: 11px;">DESCRIÇÃO DO MOTIVO</label>
                <div class="p-3 bg-white rounded" style="border: 1px solid #e2e8f0; font-size: 13px; color: #475569; white-space: pre-line;">
                  ${escapeHTMLAtendimento(a.descricaoMotivo || '-')}
                </div>
              </div>

              <!-- Descrição das Providências -->
              <div class="mb-3">
                <label class="text-muted small fw-bold d-block mb-2" style="font-size: 11px;">DESCRIÇÃO DAS PROVIDÊNCIAS</label>
                <div class="p-3 bg-white rounded" style="border: 1px solid #e2e8f0; font-size: 13px; color: #475569; white-space: pre-line;">
                  ${escapeHTMLAtendimento(a.descricaoProvidencias || '-')}
                </div>
              </div>

              ${a.observacoes ? `
                <div class="mb-3">
                  <label class="text-muted small fw-bold d-block mb-2" style="font-size: 11px;">OBSERVAÇÕES</label>
                  <div class="p-3 bg-white rounded" style="border: 1px solid #e2e8f0; font-size: 13px; color: #475569; white-space: pre-line;">
                    ${escapeHTMLAtendimento(a.observacoes)}
                  </div>
                </div>
              ` : ''}

              ${assinaturaRespHTML}
              ${assinaturaAlunoHTML}

              <div class="mt-4 text-end">
                <small class="text-muted" style="font-size: 11px;">
                  Registrado por: <strong>${escapeHTMLAtendimento(a.registradoPor || 'Sistema')}</strong>
                </small>
              </div>

            </div>

            <div class="modal-footer" style="background: white; border-top: 1px solid #e2e8f0; padding: 15px 25px;">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal" style="border-radius: 8px;">Fechar</button>
              <button type="button" class="btn btn-primary" onclick="imprimirAtendimento('${a.id}')" style="border-radius: 8px;">
                <i class="fas fa-print"></i> Imprimir Documento
              </button>
            </div>

          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    new bootstrap.Modal(safeGetAtendimento('modalVerAtendimento')).show();

  } catch (e) {
    console.error('Erro ao ver atendimento:', e);
    notificar('Erro ao carregar detalhes do atendimento', 'error');
  }
}

function renderizarPaginacaoAtendimentos() {
  const { paginaAtual, totalPaginas, totalRegistros, porPagina } = atendimentoState.paginacao;

  if (totalPaginas <= 1) {
    return `<p class="text-muted text-end mt-2"><small>${totalRegistros} registro(s) encontrado(s)</small></p>`;
  }

  const maxBotoes = 5;
  let inicio = Math.max(1, paginaAtual - Math.floor(maxBotoes / 2));
  let fim = Math.min(totalPaginas, inicio + maxBotoes - 1);
  if (fim - inicio + 1 < maxBotoes) inicio = Math.max(1, fim - maxBotoes + 1);

  let botoes = '';
  botoes += paginaAtual > 1
    ? `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault();carregarListaAtendimentos(1)"><i class="fas fa-angle-double-left"></i></a></li>`
    : `<li class="page-item disabled"><span class="page-link"><i class="fas fa-angle-double-left"></i></span></li>`;
  botoes += paginaAtual > 1
    ? `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault();carregarListaAtendimentos(${paginaAtual - 1})"><i class="fas fa-angle-left"></i></a></li>`
    : `<li class="page-item disabled"><span class="page-link"><i class="fas fa-angle-left"></i></span></li>`;
  if (inicio > 1) botoes += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
  for (let i = inicio; i <= fim; i++) {
    botoes += i === paginaAtual
      ? `<li class="page-item active"><span class="page-link">${i}</span></li>`
      : `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault();carregarListaAtendimentos(${i})">${i}</a></li>`;
  }
  if (fim < totalPaginas) botoes += `<li class="page-item disabled"><span class="page-link">…</span></li>`;
  botoes += paginaAtual < totalPaginas
    ? `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault();carregarListaAtendimentos(${paginaAtual + 1})"><i class="fas fa-angle-right"></i></a></li>`
    : `<li class="page-item disabled"><span class="page-link"><i class="fas fa-angle-right"></i></span></li>`;
  botoes += paginaAtual < totalPaginas
    ? `<li class="page-item"><a class="page-link" href="#" onclick="event.preventDefault();carregarListaAtendimentos(${totalPaginas})"><i class="fas fa-angle-double-right"></i></a></li>`
    : `<li class="page-item disabled"><span class="page-link"><i class="fas fa-angle-double-right"></i></span></li>`;

  const de = (paginaAtual - 1) * porPagina + 1;
  const ate = Math.min(paginaAtual * porPagina, totalRegistros);

  return `<div class="paginacao-modulo" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;">
    <small class="text-muted">Mostrando <strong>${de}</strong>–<strong>${ate}</strong> de <strong>${totalRegistros}</strong></small>
    <nav><ul class="pagination pagination-sm mb-0" style="gap:2px;">${botoes}</ul></nav>
  </div>`;
}

async function carregarOpcoesFiltroListaAtendimento() {
  const selTurma = safeGetAtendimento('filtroListaAtendimentoTurma');
  if (selTurma && selTurma.options.length <= 1) {
    try {
      const r = await fetch('/api/gestao-atendimento/turmas', {
        headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` }
      });
      const d = await r.json();
      if (d.success) {
        d.turmas.forEach(t => {
          selTurma.innerHTML += `<option value="${escapeHTMLAtendimento(t)}">${escapeHTMLAtendimento(t)}</option>`;
        });
      }
    } catch (e) { console.warn(e); }
  }

  const selMotivo = safeGetAtendimento('filtroListaAtendimentoMotivo');
  if (selMotivo && selMotivo.options.length <= 1) {
    ATENDIMENTO_MOTIVOS.forEach(m => {
      selMotivo.innerHTML += `<option value="${m.valor}">${m.label}</option>`;
    });
  }
}

function configurarFiltrosListaAtendimentos() {
  const debounce = (fn, delay = 500) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
  };

  safeGetAtendimento('filtroListaAtendimentoAluno')?.addEventListener('input', debounce(() => carregarListaAtendimentos(1)));
  safeGetAtendimento('filtroListaAtendimentoTurma')?.addEventListener('change', () => carregarListaAtendimentos(1));
  safeGetAtendimento('filtroListaAtendimentoMotivo')?.addEventListener('change', () => carregarListaAtendimentos(1));
  safeGetAtendimento('filtroListaAtendimentoTipo')?.addEventListener('change', () => carregarListaAtendimentos(1));
  safeGetAtendimento('filtroListaAtendimentoDataInicio')?.addEventListener('change', () => carregarListaAtendimentos(1));
  safeGetAtendimento('filtroListaAtendimentoDataFim')?.addEventListener('change', () => carregarListaAtendimentos(1));
}

function aplicarFiltrosListaAtendimento() {
  carregarListaAtendimentos(1);
}

// ============================================
// IMPRESSÃO
// ============================================
async function imprimirAtendimento(id) {
  try {
    const r = await fetch(`/api/gestao-atendimento/${id}`, {
      headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` }
    });
    const d = await r.json();
    if (!d.success) { notificar('Erro ao carregar atendimento'); return; }

    const a = d.atendimento;

    let qr = '';
    try {
      const qrR = await fetch(`/api/aluno/qrcode/${a.alunoId}`, {
        headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` }
      });
      if (qrR.ok) {
        const qrD = await qrR.json();
        if (qrD.success && qrD.qrCode) qr = qrD.qrCode;
      }
    } catch (e) { console.info('Sem QR'); }

    const win = window.open('', '_blank');
    win.document.write(gerarHTMLImpressaoAtendimento(a, qr));
    win.document.close();
    win.onload = () => setTimeout(() => win.print(), 500);
  } catch (e) {
    console.error(e);
    notificar('Erro ao imprimir');
  }
}

function gerarHTMLImpressaoAtendimento(a, qrCodeUrl) {
  const logo = '/uploads/logo-iema.png';
  const carimbo = '/icons/assinatura_gestao.ico';
  const dataGeracao = new Date().toLocaleString('pt-BR');
  const tipoLabel = a.tipoAtendimento === 'aluno' ? 'Atendimento ao Aluno' : 'Atendimento aos Pais/Responsáveis';
  const dataExt = a.dataAtendimento
    ? new Date(a.dataAtendimento).toLocaleDateString('pt-BR')
    : '-';

  let blocoResponsavelHTML = '';
  if (a.tipoAtendimento === 'responsavel' && (a.responsavelNome || a.responsavelCPF || a.responsavelTelefone || a.responsavelParentesco)) {
    blocoResponsavelHTML = `
      <div class="section-title">👤 Dados do Responsável</div>
      <div class="info-grid">
        ${a.responsavelNome ? `<div class="info-item"><span class="info-label">Nome:</span><span class="info-value">${escapeHTMLAtendimento(a.responsavelNome)}</span></div>` : ''}
        ${a.responsavelCPF ? `<div class="info-item"><span class="info-label">CPF:</span><span class="info-value">${escapeHTMLAtendimento(a.responsavelCPF)}</span></div>` : ''}
        ${a.responsavelTelefone ? `<div class="info-item"><span class="info-label">Telefone:</span><span class="info-value">${escapeHTMLAtendimento(a.responsavelTelefone)}</span></div>` : ''}
        ${a.responsavelParentesco ? `<div class="info-item"><span class="info-label">Parentesco:</span><span class="info-value">${escapeHTMLAtendimento(a.responsavelParentesco)}</span></div>` : ''}
      </div>`;
  }

  const temResp = !!(a.assinaturaBase64 && a.assinaturaBase64.length > 100);
  const temAluno = !!(a.assinaturaAlunoBase64 && a.assinaturaAlunoBase64.length > 100);
  const precisaResp = !!a.precisaAssinatura;
  const precisaAluno = !!a.precisaAssinaturaAluno;
  const mostrarResp = precisaResp || (!precisaResp && !precisaAluno);
  const mostrarAluno = precisaAluno;

  const assinaturaRespHTML = temResp
    ? `<img class="assinatura-img" src="${a.assinaturaBase64}" alt="Assinatura Responsável">`
    : `<span style="color:#999;font-size:8pt;">_________________________________</span>`;
  const assinaturaAlunoHTML = temAluno
    ? `<img class="assinatura-img" src="${a.assinaturaAlunoBase64}" alt="Assinatura Aluno">`
    : `<span style="color:#999;font-size:8pt;">_________________________________</span>`;

  const nomeAlunoAssinante = a.assinadaPorNomeAluno
    ? `<div style="font-size:7pt;color:#047857;margin-top:1mm;">${escapeHTMLAtendimento(a.assinadaPorNomeAluno)}</div>`
    : '';

  let assinaturasHTML = '';
  if (mostrarResp && mostrarAluno) {
    assinaturasHTML = `
      <div class="assinaturas">
        <div class="assinatura">
          <div class="assinatura-container">${assinaturaRespHTML}</div>
          <div class="assinatura-linha">Assinatura do Responsável</div>
        </div>
        <div class="assinatura">
          <div class="assinatura-container">${assinaturaAlunoHTML}${nomeAlunoAssinante}</div>
          <div class="assinatura-linha">Assinatura do Aluno</div>
        </div>
        <div class="assinatura">
          <div class="assinatura-container"><img class="carimbo-overlay" src="${carimbo}" onerror="this.style.display='none'"></div>
          <div class="assinatura-linha">Coordenação / Gestão Geral</div>
        </div>
      </div>`;
  } else if (mostrarAluno && !mostrarResp) {
    assinaturasHTML = `
      <div class="assinaturas">
        <div class="assinatura">
          <div class="assinatura-container">${assinaturaAlunoHTML}${nomeAlunoAssinante}</div>
          <div class="assinatura-linha">Assinatura do Aluno</div>
        </div>
        <div class="assinatura">
          <div class="assinatura-container"><img class="carimbo-overlay" src="${carimbo}" onerror="this.style.display='none'"></div>
          <div class="assinatura-linha">Coordenação / Gestão Geral</div>
        </div>
      </div>`;
  } else {
    assinaturasHTML = `
      <div class="assinaturas">
        <div class="assinatura">
          <div class="assinatura-container">${assinaturaRespHTML}</div>
          <div class="assinatura-linha">Assinatura do Responsável</div>
        </div>
        <div class="assinatura">
          <div class="assinatura-container"><img class="carimbo-overlay" src="${carimbo}" onerror="this.style.display='none'"></div>
          <div class="assinatura-linha">Coordenação / Gestão Geral</div>
        </div>
      </div>`;
  }

  return `<!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <title>${tipoLabel} - ${escapeHTMLAtendimento(a.alunoNome)}</title>
    <style>
      @page { size: A4 portrait; margin: 8mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Times New Roman', Times, serif; font-size: 9.5pt; line-height: 1.25; color: #000; }
      .header { text-align: center; border-bottom: 1.5px double #000; padding-bottom: 4px; margin-bottom: 6px; }
      .header img { max-width: 100%; max-height: 14mm; object-fit: contain; display: block; margin: 0 auto 2px; }
      .header h1 { font-size: 10pt; text-transform: uppercase; font-weight: bold; margin: 2px 0 0; }
      .header p { font-size: 8pt; margin: 1px 0 0; }
      .titulo { text-align: center; font-size: 11pt; font-weight: bold; background: #eef2ff; padding: 4px 8px; border: 1.5px solid #000; margin: 6px 0 3px; text-transform: uppercase; letter-spacing: 0.5px; }
      .aluno-box { display: flex; align-items: center; gap: 8px; padding: 5px 8px; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 5px; margin-bottom: 6px; }
      .aluno-foto { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 1.5px solid #1e3c72; flex-shrink: 0; }
      .aluno-info { flex: 1; }
      .aluno-nome { font-size: 10pt; font-weight: bold; color: #1e3c72; margin-bottom: 1px; }
      .aluno-detalhes { font-size: 8pt; color: #374151; }
      .section-title { font-size: 9pt; font-weight: bold; background: #e8e8e8; padding: 2px 6px; border-left: 3px solid #1e3c72; margin: 5px 0 3px; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 3px 12px; margin: 3px 0 5px; font-size: 8.5pt; }
      .info-item { display: flex; gap: 4px; }
      .info-label { font-weight: bold; white-space: nowrap; }
      .info-value { flex: 1; }
      .motivo-box { background: #f5f5f5; border: 1px solid #000; padding: 5px 8px; margin: 5px 0; border-radius: 4px; }
      .motivo-box strong { font-size: 9pt; }
      .descricao-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 4px; padding: 5px 8px; font-size: 8.5pt; line-height: 1.3; min-height: 30px; max-height: 120px; overflow: hidden; word-wrap: break-word; }
      .assinaturas { display: flex; justify-content: space-around; margin-top: 18px; gap: 15px; }
      .assinatura { flex: 1; text-align: center; font-size: 7.5pt; position: relative; }
      .assinatura-container { position: relative; border-bottom: 1px solid #000; min-height: 14mm; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 2px; }
      .assinatura-img { max-height: 13mm; max-width: 100%; object-fit: contain; position: relative; z-index: 2; margin-bottom: 1mm; }
      .carimbo-overlay { max-height: 13mm; max-width: 55%; object-fit: contain; opacity: 0.85; }
      .assinatura-linha { padding-top: 2px; font-size: 7.5pt; margin-top: 2px; font-weight: bold; }
      .qr-code { text-align: center; margin-top: 6px; }
      .qr-code img { width: 25mm; height: 25mm; border: 1.5px solid #000; padding: 2px; display: block; margin: 0 auto; }
      .qr-code p { font-size: 8pt; margin: 3px 0 0 0; color: #444; font-weight: bold; }
      .footer { text-align: center; margin-top: 5px; padding-top: 3px; border-top: 1px solid #ccc; font-size: 6.5pt; color: #666; }
      .footer p { margin: 1px 0; }
      .btn-print { display: block; margin: 10px auto; padding: 8px 20px; background: #1e3c72; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; font-family: Arial, sans-serif; }
      .btn-print:hover { background: #2a5298; }
      @media print { .no-print { display: none !important; } body { padding: 0; } }
    </style>
  </head>
  <body>
    <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>

    <div class="header">
      <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
      <h1>IEMA Pleno: São Luís - Centro</h1>
      <p>Sistema de Atendimentos — Gestão Geral</p>
    </div>

    <div class="titulo">📋 ${tipoLabel}</div>

    <div class="aluno-box">
      <img class="aluno-foto" src="${gerarAvatarSVGAtendimento(a.alunoNome)}" alt="${escapeHTMLAtendimento(a.alunoNome)}">
      <div class="aluno-info">
        <div class="aluno-nome">${escapeHTMLAtendimento(a.alunoNome)}</div>
        <div class="aluno-detalhes">
          <strong>Matrícula:</strong> ${escapeHTMLAtendimento(a.alunoMatricula || 'Não informada')} •
          <strong>Turma:</strong> ${escapeHTMLAtendimento(a.alunoTurma || '-')}
          ${a.alunoCurso ? ` • <strong>Curso:</strong> ${escapeHTMLAtendimento(a.alunoCurso)}` : ''}
        </div>
      </div>
    </div>

    <div class="section-title">📌 Dados do Atendimento</div>
    <div class="info-grid">
      <div class="info-item"><span class="info-label">Data:</span><span class="info-value">${dataExt}</span></div>
      <div class="info-item"><span class="info-label">Registrado por:</span><span class="info-value">${escapeHTMLAtendimento(a.registradoPor || '-')}</span></div>
    </div>

    ${blocoResponsavelHTML}

    <div class="section-title">📝 Motivo</div>
    <div class="motivo-box"><strong>${escapeHTMLAtendimento(a.motivoLabel || '-')}</strong></div>
    <div class="section-title">Descrição do Motivo</div>
    <div class="descricao-box">${escapeHTMLAtendimento(a.descricaoMotivo || '-').replace(/\n/g, '<br>')}</div>

    <div class="section-title">⚖️ Providências / Acordos</div>
    <div class="motivo-box"><strong>${escapeHTMLAtendimento(a.providenciasLabel || '-')}</strong></div>
    <div class="section-title">Descrição das Providências</div>
    <div class="descricao-box">${escapeHTMLAtendimento(a.descricaoProvidencias || '-').replace(/\n/g, '<br>')}</div>

    ${a.observacoes ? `
      <div class="section-title">💬 Observações</div>
      <div class="descricao-box" style="min-height:20px;max-height:60px;">${escapeHTMLAtendimento(a.observacoes).replace(/\n/g, '<br>')}</div>
    ` : ''}

    ${assinaturasHTML}

    ${qrCodeUrl ? `
      <div class="qr-code">
        <img src="${qrCodeUrl}" alt="QR Code">
        <p>Identificação do Aluno</p>
      </div>
    ` : ''}

    <div class="footer">
      <p>Documento gerado em <strong>${dataGeracao}</strong> — EducaPleno — Gestão Geral — ${tipoLabel}</p>
    </div>
  </body>
  </html>`;
}

// ============================================
// EDITAR
// ============================================
async function abrirEditarAtendimento(id) {
  try {
    const r = await fetch(`/api/gestao-atendimento/${id}`, {
      headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` }
    });
    const d = await r.json();
    if (!d.success || !d.atendimento) { notificar('Erro ao carregar'); return; }

    const a = d.atendimento;
    const old = safeGetAtendimento('modalEditarAtendimento');
    if (old) old.remove();

    const motivosOpts = ATENDIMENTO_MOTIVOS.map(m =>
      `<option value="${m.valor}" ${a.motivo === m.valor ? 'selected' : ''}>${m.label}</option>`
    ).join('');
    const providenciasOpts = ATENDIMENTO_PROVIDENCIAS.map(p =>
      `<option value="${p.valor}" ${a.providencias === p.valor ? 'selected' : ''}>${p.label}</option>`
    ).join('');

    let dataInput = '';
    if (a.dataAtendimento) {
      dataInput = getDataLocalISOAtendimento(new Date(a.dataAtendimento));
    }

    const blocoResp = a.tipoAtendimento === 'responsavel' ? `
      <div class="card mb-3" style="background:#f8fafc;border:1px solid #e2e8f0;">
        <div class="card-body">
          <h6 style="margin-bottom:15px;color:#1e3c72;"><i class="fas fa-user-shield"></i> Dados do Responsável</h6>
          <div class="row">
            <div class="col-md-6 mb-3">
              <label class="form-label">Nome do Responsável <span class="text-danger">*</span></label>
              <input type="text" id="editAtendResponsavelNome" class="form-control" value="${escapeHTMLAtendimento(a.responsavelNome || '')}">
            </div>
            <div class="col-md-3 mb-3">
              <label class="form-label">CPF</label>
              <input type="text" id="editAtendResponsavelCPF" class="form-control" value="${escapeHTMLAtendimento(a.responsavelCPF || '')}" maxlength="14" oninput="formatarCPF(this)">
            </div>
            <div class="col-md-3 mb-3">
              <label class="form-label">Telefone</label>
              <input type="text" id="editAtendResponsavelTelefone" class="form-control" value="${escapeHTMLAtendimento(a.responsavelTelefone || '')}" maxlength="15" oninput="formatarTelefone(this)">
            </div>
            <div class="col-md-6 mb-3">
              <label class="form-label">Parentesco</label>
              <input type="text" id="editAtendResponsavelParentesco" class="form-control" value="${escapeHTMLAtendimento(a.responsavelParentesco || '')}" placeholder="Ex: Mãe, Pai, Avó...">
            </div>
          </div>
        </div>
      </div>` : '';

    const modalHtml = `
      <div class="modal fade" id="modalEditarAtendimento" tabindex="-1">
        <div class="modal-dialog modal-lg modal-dialog-scrollable">
          <div class="modal-content">
            <div class="modal-header" style="background:linear-gradient(135deg,#1e3c72,#2a5298);color:white;">
              <h5 class="modal-title"><i class="fas fa-edit"></i> Editar Atendimento</h5>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
              <input type="hidden" id="editAtendId" value="${a.id}">
              <input type="hidden" id="editAtendTipo" value="${a.tipoAtendimento}">

              <div style="display:flex;align-items:center;gap:12px;padding:12px;background:#eef2ff;border-radius:10px;margin-bottom:16px;">
                <img src="${gerarAvatarSVGAtendimento(a.alunoNome)}" style="width:50px;height:50px;border-radius:50%;" alt="">
                <div style="flex:1;">
                  <h5 style="margin:0;color:#1e3c72;">${escapeHTMLAtendimento(a.alunoNome)}</h5>
                  <small style="color:#6b7280;">
                    <i class="fas fa-id-card"></i> ${escapeHTMLAtendimento(a.alunoMatricula || '-')} •
                    <i class="fas fa-graduation-cap"></i> ${escapeHTMLAtendimento(a.alunoTurma || '-')}
                  </small>
                </div>
                <span class="badge ${a.tipoAtendimento === 'aluno' ? 'bg-primary' : 'bg-success'}">
                  ${a.tipoAtendimento === 'aluno' ? 'Aluno' : 'Responsável'}
                </span>
              </div>

              <div class="mb-3">
                <label class="form-label">Data do Atendimento <span class="text-danger">*</span></label>
                <input type="date" id="editAtendData" class="form-control" value="${dataInput}">
              </div>

              ${blocoResp}

              <div class="mb-3">
                <label class="form-label">Motivo <span class="text-danger">*</span></label>
                <select id="editAtendMotivo" class="form-select">${motivosOpts}</select>
              </div>

              <div class="mb-3">
                <label class="form-label">Descrição do Motivo <span class="text-danger">*</span></label>
                <textarea id="editAtendDescricaoMotivo" class="form-control" rows="3">${escapeHTMLAtendimento(a.descricaoMotivo || '')}</textarea>
              </div>

              <div class="mb-3">
                <label class="form-label">Providências <span class="text-danger">*</span></label>
                <select id="editAtendProvidencias" class="form-select">${providenciasOpts}</select>
              </div>

              <div class="mb-3">
                <label class="form-label">Descrição das Providências <span class="text-danger">*</span></label>
                <textarea id="editAtendDescricaoProvidencias" class="form-control" rows="3">${escapeHTMLAtendimento(a.descricaoProvidencias || '')}</textarea>
              </div>

              <div class="mb-3">
                <label class="form-label">Observações</label>
                <textarea id="editAtendObservacoes" class="form-control" rows="2">${escapeHTMLAtendimento(a.observacoes || '')}</textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><i class="fas fa-times"></i> Cancelar</button>
              <button type="button" class="btn btn-primary" onclick="salvarEdicaoAtendimento()"><i class="fas fa-save"></i> Salvar Alterações</button>
            </div>
          </div>
        </div>
      </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    new bootstrap.Modal(safeGetAtendimento('modalEditarAtendimento')).show();
  } catch (e) {
    console.error(e);
    notificar('Erro ao carregar atendimento');
  }
}

async function salvarEdicaoAtendimento() {
  const id = safeGetAtendimento('editAtendId')?.value;
  const tipo = safeGetAtendimento('editAtendTipo')?.value;
  const data = safeGetAtendimento('editAtendData')?.value;
  const motivo = safeGetAtendimento('editAtendMotivo')?.value;
  const descricaoMotivo = (safeGetAtendimento('editAtendDescricaoMotivo')?.value || '').trim();
  const providencias = safeGetAtendimento('editAtendProvidencias')?.value;
  const descricaoProvidencias = (safeGetAtendimento('editAtendDescricaoProvidencias')?.value || '').trim();
  const observacoes = safeGetAtendimento('editAtendObservacoes')?.value || '';

  if (!motivo || !descricaoMotivo || !providencias || !descricaoProvidencias || !data) {
    notificar('Preencha todos os campos obrigatórios');
    return;
  }

  const body = {
    motivo, descricaoMotivo, providencias, descricaoProvidencias, observacoes,
    dataAtendimento: data
  };

  if (tipo === 'responsavel') {
    body.responsavelNome = safeGetAtendimento('editAtendResponsavelNome')?.value || '';
    body.responsavelCPF = safeGetAtendimento('editAtendResponsavelCPF')?.value || '';
    body.responsavelTelefone = safeGetAtendimento('editAtendResponsavelTelefone')?.value || '';
    body.responsavelParentesco = safeGetAtendimento('editAtendResponsavelParentesco')?.value || '';
    if (!body.responsavelNome) { notificar('Nome do responsável é obrigatório'); return; }
  }

  try {
    const r = await fetch(`/api/gestao-atendimento/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getTokenAtendimento()}` },
      body: JSON.stringify(body)
    });
    const d = await r.json();

    if (d.success) {
      const modal = bootstrap.Modal.getInstance(safeGetAtendimento('modalEditarAtendimento'));
      if (modal) modal.hide();
      notificar('✅ Atendimento atualizado!', 'success');
      carregarListaAtendimentos(1);
    } else {
      notificar('❌ ' + (d.error || 'Erro ao salvar'));
    }
  } catch (e) {
    console.error(e);
    notificar('Erro ao salvar alterações');
  }
}

// ============================================
// EXCLUIR
// ============================================
async function excluirAtendimento(id) {
  const ok1 = await confirm('⚠️ Tem certeza que deseja EXCLUIR este atendimento?\n\nEsta ação não pode ser desfeita.');
  if (!ok1) return;
  const ok2 = await confirm('⚠️ ÚLTIMA CONFIRMAÇÃO!\n\nExcluir permanentemente?');
  if (!ok2) return;

  try {
    const r = await fetch(`/api/gestao-atendimento/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` }
    });
    const d = await r.json();
    if (d.success) {
      notificar('✅ Atendimento excluído!', 'success');
      carregarListaAtendimentos(1);
    } else {
      notificar('❌ ' + (d.error || 'Erro'));
    }
  } catch (e) {
    console.error(e);
    notificar('Erro ao excluir');
  }
}

// ============================================
// DASHBOARD
// ============================================
async function carregarDashboardAtendimentos() {
  console.log('📊 [Atendimentos] Carregando dashboard...');
  try {
    const r = await fetch('/api/gestao-atendimento/dashboard', {
      headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` }
    });
    if (!r.ok) {
      console.error('Dashboard HTTP', r.status);
      return;
    }
    const d = await r.json();
    if (!d.success) {
      console.error('Dashboard error:', d.error);
      return;
    }

    safeSetTextAtendimento('AtendimentoTotalHoje', d.metricas?.hoje || 0);
    safeSetTextAtendimento('AtendimentoTotalSemana', d.metricas?.semana || 0);
    safeSetTextAtendimento('AtendimentoTotalMes', d.metricas?.mes || 0);
    safeSetTextAtendimento('AtendimentoTotalGeral', d.metricas?.total || 0);

    // Chart: por motivo
    const ctxMotivos = safeGetAtendimento('AtendimentoChartMotivos');
    if (ctxMotivos && d.porMotivo && typeof Chart !== 'undefined') {
      if (atendimentoState.charts.motivos) {
        try { atendimentoState.charts.motivos.destroy(); } catch (e) {}
      }
      atendimentoState.charts.motivos = new Chart(ctxMotivos.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: d.porMotivo.map(m => m.label),
          datasets: [{
            data: d.porMotivo.map(m => m.count),
            backgroundColor: ['#1e3c72', '#2a5298', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#f59e0b', '#10b981']
          }]
        },
        options: { responsive: true, maintainAspectRatio: true }
      });
    } else if (!ctxMotivos) {
      console.warn('⚠️ Canvas AtendimentoChartMotivos não encontrado');
    }

    // Chart: por dia
    const ctxDia = safeGetAtendimento('AtendimentoChartAtrasos');
    if (ctxDia && d.tendencias?.ultimos7Dias && typeof Chart !== 'undefined') {
      if (atendimentoState.charts.atendimentos) {
        try { atendimentoState.charts.atendimentos.destroy(); } catch (e) {}
      }
      atendimentoState.charts.atendimentos = new Chart(ctxDia.getContext('2d'), {
        type: 'line',
        data: {
          labels: d.tendencias.ultimos7Dias.map(x => x.dia),
          datasets: [{
            label: 'Atendimentos',
            data: d.tendencias.ultimos7Dias.map(x => x.atendimentos),
            borderColor: '#1e3c72',
            backgroundColor: 'rgba(30,60,114,0.1)',
            fill: true,
            tension: 0.4
          }]
        },
        options: { responsive: true, maintainAspectRatio: true }
      });
    }

    // Chart: por turma
    const ctxTurma = safeGetAtendimento('AtendimentoChartTurmas');
    if (ctxTurma && d.tendencias?.porTurma && typeof Chart !== 'undefined') {
      if (atendimentoState.charts.turmas) {
        try { atendimentoState.charts.turmas.destroy(); } catch (e) {}
      }
      atendimentoState.charts.turmas = new Chart(ctxTurma.getContext('2d'), {
        type: 'bar',
        data: {
          labels: d.tendencias.porTurma.map(t => t.turma),
          datasets: [{
            label: 'Atendimentos',
            data: d.tendencias.porTurma.map(t => t.count),
            backgroundColor: '#2a5298',
            borderRadius: 8
          }]
        },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }
      });
    }

    // Reincidentes
    const reinc = safeGetAtendimento('AtendimentoAlunosReincidentes');
    if (reinc) {
      const lista = d.tendencias?.alunosReincidentes || [];
      if (lista.length > 0) {
        reinc.innerHTML = `
          <div class="table-responsive">
            <table class="table table-sm">
              <thead><tr><th>Aluno</th><th>Turma</th><th>Atendimentos</th></tr></thead>
              <tbody>${lista.map(a => `
                <tr>
                  <td><strong>${escapeHTMLAtendimento(a.alunoNome || '')}</strong></td>
                  <td>${escapeHTMLAtendimento(a.alunoTurma || '-')}</td>
                  <td><span class="badge bg-danger">${a.count || 0}</span></td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>`;
      } else {
        reinc.innerHTML = `<p class="text-muted text-center py-3"><i class="fas fa-check-circle text-success"></i> Nenhum aluno reincidente</p>`;
      }
    }

    console.log('✅ [Atendimentos] Dashboard renderizado');
  } catch (e) {
    console.error('Erro no dashboard de atendimentos:', e);
  }
}

// ============================================
// RELATÓRIOS
// ============================================
async function carregarTurmasFiltroAtendimento() {
  const sel = safeGetAtendimento('AtendimentoFiltroTurma');
  if (!sel || sel.options.length > 1) return;
  try {
    const r = await fetch('/api/gestao-atendimento/turmas', {
      headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` }
    });
    const d = await r.json();
    if (d.success) {
      sel.innerHTML = '<option value="">Selecione...</option>';
      d.turmas.forEach(t => {
        sel.innerHTML += `<option value="${escapeHTMLAtendimento(t)}">${escapeHTMLAtendimento(t)}</option>`;
      });
    }
  } catch (e) { console.warn(e); }
}

function toggleRelatorioFiltrosAtendimento() {
  const tipo = safeGetAtendimento('AtendimentoTipoRelatorio')?.value;
  const divTurma = safeGetAtendimento('AtendimentoFiltroTurmaDiv');
  const divAluno = safeGetAtendimento('AtendimentoFiltroAlunoDiv');
  if (divTurma) divTurma.style.display = tipo === 'turma' ? 'block' : 'none';
  if (divAluno) divAluno.style.display = tipo === 'aluno' ? 'block' : 'none';

  const btnCSV = safeGetAtendimento('btnExportarCSVAtendimento');
  const btnPDF = safeGetAtendimento('btnExportarPDFAtendimento');
  if (btnCSV) btnCSV.disabled = true;
  if (btnPDF) btnPDF.disabled = true;
  atendimentoState.relatorioAtual = null;

  if (tipo === 'turma') carregarTurmasFiltroAtendimento();
  if (tipo === 'aluno') {
    inicializarAutocompleteAtendimento();
    if (!atendimentoState.autocompleteAlunos.carregado) carregarAlunosRelatorioAtendimento();
  }
}

function inicializarAutocompleteAtendimento() {
  const input = safeGetAtendimento('AtendimentoBuscaAlunoRelatorio');
  const listEl = safeGetAtendimento('AtendimentoAutocompleteAlunoList');
  const hidden = safeGetAtendimento('AtendimentoFiltroAluno');
  if (!input || !listEl || !hidden) return;
  if (input.dataset.autocompleteInit === 'true') return;
  input.dataset.autocompleteInit = 'true';

  input.addEventListener('input', (e) => {
    const termo = e.target.value.trim();
    hidden.value = '';
    const info = safeGetAtendimento('AtendimentoAlunoSelecionadoInfo');
    if (info) info.textContent = '';
    if (termo.length < 1) { listEl.style.display = 'none'; return; }
    filtrarAutocompleteAtendimento(termo);
  });
  input.addEventListener('focus', () => {
    const termo = input.value.trim();
    if (termo.length >= 1) filtrarAutocompleteAtendimento(termo);
  });
  input.addEventListener('keydown', (e) => {
    const st = atendimentoState.autocompleteAlunos;
    if (listEl.style.display === 'none') return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      st.indice = Math.min(st.indice + 1, st.filtrados.length - 1);
      destacarItemAutocompleteAtendimento();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      st.indice = Math.max(st.indice - 1, -1);
      destacarItemAutocompleteAtendimento();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (st.indice >= 0 && st.filtrados[st.indice]) {
        selecionarAlunoAutocompleteAtendimento(st.filtrados[st.indice]);
      }
    } else if (e.key === 'Escape') {
      listEl.style.display = 'none';
    }
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !listEl.contains(e.target)) listEl.style.display = 'none';
  });

  if (!atendimentoState.autocompleteAlunos.carregado) carregarAlunosRelatorioAtendimento();
}

async function carregarAlunosRelatorioAtendimento() {
  const st = atendimentoState.autocompleteAlunos;
  if (st.carregado || st.carregando) return;
  st.carregando = true;

  try {
    const turmasRes = await fetch('/api/gestao-atendimento/turmas', {
      headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` }
    });
    const turmasData = await turmasRes.json();
    if (!turmasData.success) { st.carregando = false; return; }

    const todos = [];
    for (const turma of turmasData.turmas) {
      try {
        const res = await fetch(`/api/gestao-atendimento/alunos-por-turma?turma=${encodeURIComponent(turma)}`, {
          headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` }
        });
        const data = await res.json();
        if (data.success && data.alunos) {
          data.alunos.forEach(a => todos.push({
            id: a.id, nome: a.nome, matricula: a.matricula || '',
            turma: a.turma || turma, curso: a.curso || ''
          }));
        }
      } catch (e) { console.warn(e); }
    }
    todos.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    st.alunos = todos;
    st.carregado = true;
  } catch (e) {
    console.error(e);
  } finally {
    st.carregando = false;
  }
}

function filtrarAutocompleteAtendimento(termo) {
  const listEl = safeGetAtendimento('AtendimentoAutocompleteAlunoList');
  const st = atendimentoState.autocompleteAlunos;
  if (!listEl) return;

  if (!st.carregado) {
    listEl.innerHTML = `<div class="autocomplete-aluno-loading">Carregando...</div>`;
    listEl.style.display = 'block';
    carregarAlunosRelatorioAtendimento().then(() => {
      if (st.carregado) filtrarAutocompleteAtendimento(termo);
    });
    return;
  }

  const termoLower = termo.toLowerCase();
  st.filtrados = st.alunos.filter(a =>
    (a.nome || '').toLowerCase().includes(termoLower) ||
    (a.matricula || '').toLowerCase().includes(termoLower)
  ).slice(0, 10);
  st.indice = -1;

  if (st.filtrados.length === 0) {
    listEl.innerHTML = `<div class="autocomplete-aluno-empty">Nenhum aluno encontrado</div>`;
    listEl.style.display = 'block';
    return;
  }

  listEl.innerHTML = st.filtrados.map((aluno, i) => {
    const mat = aluno.matricula ? `<span class="aluno-matricula">${escapeHTMLAtendimento(aluno.matricula)}</span>` : '';
    return `<div class="autocomplete-aluno-item" data-index="${i}">
      <div class="aluno-nome">${escapeHTMLAtendimento(aluno.nome)}</div>
      <div class="aluno-info">
        <span class="aluno-turma">${escapeHTMLAtendimento(aluno.turma || 'Sem turma')}</span>
        ${mat}
      </div>
    </div>`;
  }).join('');

  listEl.querySelectorAll('.autocomplete-aluno-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const i = parseInt(item.getAttribute('data-index'));
      if (st.filtrados[i]) selecionarAlunoAutocompleteAtendimento(st.filtrados[i]);
    });
    item.addEventListener('mouseenter', () => {
      st.indice = parseInt(item.getAttribute('data-index'));
      destacarItemAutocompleteAtendimento();
    });
  });

  listEl.style.display = 'block';
}

function destacarItemAutocompleteAtendimento() {
  const listEl = safeGetAtendimento('AtendimentoAutocompleteAlunoList');
  const st = atendimentoState.autocompleteAlunos;
  if (!listEl) return;
  listEl.querySelectorAll('.autocomplete-aluno-item').forEach((item, i) => {
    if (i === st.indice) { item.classList.add('selected'); item.scrollIntoView({ block: 'nearest' }); }
    else item.classList.remove('selected');
  });
}

function selecionarAlunoAutocompleteAtendimento(aluno) {
  if (!aluno) return;
  const input = safeGetAtendimento('AtendimentoBuscaAlunoRelatorio');
  const hidden = safeGetAtendimento('AtendimentoFiltroAluno');
  const listEl = safeGetAtendimento('AtendimentoAutocompleteAlunoList');
  const info = safeGetAtendimento('AtendimentoAlunoSelecionadoInfo');
  if (input) input.value = aluno.nome;
  if (hidden) hidden.value = aluno.id;
  if (listEl) listEl.style.display = 'none';
  if (info) {
    const mat = aluno.matricula ? ` • ${aluno.matricula}` : '';
    info.innerHTML = `✅ <strong>${escapeHTMLAtendimento(aluno.nome)}</strong>${mat} — Turma ${escapeHTMLAtendimento(aluno.turma || '-')}`;
    info.style.color = '#1e3c72';
  }
}

async function carregarRelatorioAtendimento() {
  const tipo = safeGetAtendimento('AtendimentoTipoRelatorio')?.value || 'geral';
  const dataInicio = safeGetAtendimento('AtendimentoDataInicio')?.value || '';
  const dataFim = safeGetAtendimento('AtendimentoDataFim')?.value || '';
  const tipoAtend = safeGetAtendimento('AtendimentoFiltroTipo')?.value || '';

  let url = '';
  if (tipo === 'geral') {
    url = `/api/gestao-atendimento/relatorio/geral?`;
    if (dataInicio) url += `dataInicio=${dataInicio}&`;
    if (dataFim) url += `dataFim=${dataFim}&`;
    if (tipoAtend) url += `tipoAtendimento=${tipoAtend}&`;
  } else if (tipo === 'turma') {
    const turma = safeGetAtendimento('AtendimentoFiltroTurma')?.value;
    if (!turma) { notificar('Selecione uma turma', 'warning'); return; }
    url = `/api/gestao-atendimento/relatorio/turma/${encodeURIComponent(turma)}?`;
    if (dataInicio) url += `dataInicio=${dataInicio}&`;
    if (dataFim) url += `dataFim=${dataFim}&`;
    if (tipoAtend) url += `tipoAtendimento=${tipoAtend}&`;
  } else if (tipo === 'aluno') {
    const alunoId = safeGetAtendimento('AtendimentoFiltroAluno')?.value;
    if (!alunoId) { notificar('Selecione um aluno', 'warning'); return; }
    url = `/api/gestao-atendimento/relatorio/aluno/${alunoId}?`;
    if (dataInicio) url += `dataInicio=${dataInicio}&`;
    if (dataFim) url += `dataFim=${dataFim}&`;
    if (tipoAtend) url += `tipoAtendimento=${tipoAtend}&`;
  }

  try {
    const r = await fetch(url, { headers: { 'Authorization': `Bearer ${getTokenAtendimento()}` } });
    const d = await r.json();

    if (d.success) {
      atendimentoState.relatorioAtual = d;
      exibirRelatorioAtendimento(d, tipo);

      const btnCSV = safeGetAtendimento('btnExportarCSVAtendimento');
      const btnPDF = safeGetAtendimento('btnExportarPDFAtendimento');
      if (btnCSV) btnCSV.disabled = false;
      if (btnPDF) btnPDF.disabled = false;

      const total = d.totalRegistros || 0;
      if (total === 0) {
        notificar('⚠️ Nenhum atendimento encontrado. Verifique os filtros.', 'warning');
      }
    } else {
      notificar('Erro ao carregar relatório: ' + (d.error || ''), 'error');
    }
  } catch (e) {
    console.error(e);
    notificar('Erro ao carregar relatório', 'error');
  }
}

function exibirRelatorioAtendimento(data, tipo) {
  const container = safeGetAtendimento('AtendimentoResultadoRelatorio');
  if (!container) return;

  if (tipo === 'geral') {
    container.innerHTML = `
      <div class="card"><div class="card-body">
        <h5><i class="fas fa-chart-bar"></i> Relatório Geral de Atendimentos</h5>
        <p>Total: <strong>${data.totalRegistros || 0}</strong></p>

        <h6 class="mt-4">Por Tipo de Atendimento</h6>
        <div class="row">${(data.porTipo || []).map(t => `
          <div class="col-md-4 mb-2">
            <div class="p-2" style="background:#dbeafe;border-radius:8px;">
              <strong>${escapeHTMLAtendimento(t.label)}</strong>: ${t.count}
            </div>
          </div>`).join('')}</div>

        <h6 class="mt-4">Por Motivo</h6>
        <div class="row">${(data.porMotivo || []).map(m => `
          <div class="col-md-4 mb-2">
            <div class="p-2" style="background:#f0fdf4;border-radius:8px;">
              <strong>${escapeHTMLAtendimento(m.label)}</strong>: ${m.count}
            </div>
          </div>`).join('')}</div>

        <h6 class="mt-4">Por Providência</h6>
        <div class="row">${(data.porProvidencia || []).map(p => `
          <div class="col-md-4 mb-2">
            <div class="p-2" style="background:#fef3c7;border-radius:8px;">
              <strong>${escapeHTMLAtendimento(p.label)}</strong>: ${p.count}
            </div>
          </div>`).join('')}</div>

        <h6 class="mt-4">Por Turma</h6>
        <div class="table-responsive">
          <table class="table table-sm">
            <thead><tr><th>Turma</th><th>Total</th><th>Alunos</th></tr></thead>
            <tbody>${(data.porTurma || []).map(t => `
              <tr><td>${escapeHTMLAtendimento(t.turma)}</td><td>${t.total}</td><td>${t.totalAlunos}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div></div>`;
  } else if (tipo === 'turma') {
    container.innerHTML = `
      <div class="card"><div class="card-body">
        <h5>Relatório da Turma: ${escapeHTMLAtendimento(data.turma || '')}</h5>
        <p>Total: <strong>${data.estatisticas?.totalRegistros || 0}</strong></p>
        <p>Alunos: <strong>${data.estatisticas?.totalAlunos || 0}</strong></p>

        <h6 class="mt-4">Por Aluno</h6>
        <div class="table-responsive">
          <table class="table table-sm">
            <thead><tr><th>Aluno</th><th>Matrícula</th><th>Total</th></tr></thead>
            <tbody>${(data.porAluno || []).map(a => `
              <tr>
                <td>${escapeHTMLAtendimento(a.alunoNome)}</td>
                <td>${escapeHTMLAtendimento(a.alunoMatricula || '-')}</td>
                <td><span class="badge bg-primary">${a.total}</span></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div></div>`;
  } else if (tipo === 'aluno') {
    container.innerHTML = `
      <div class="card"><div class="card-body">
        <h5>Relatório: ${escapeHTMLAtendimento(data.aluno?.nome || '')}</h5>
        <p>Turma: ${escapeHTMLAtendimento(data.aluno?.turma || 'N/A')} | Matrícula: ${escapeHTMLAtendimento(data.aluno?.matricula || 'N/A')}</p>
        <p>Total: <strong>${data.estatisticas?.totalRegistros || 0}</strong></p>

        <h6 class="mt-4">Histórico</h6>
        <div class="table-responsive">
          <table class="table table-sm">
            <thead>
              <tr><th>Data</th><th>Tipo</th><th>Motivo</th><th>Providências</th></tr>
            </thead>
            <tbody>${(data.registros || []).map(a => `
              <tr>
                <td>${a.dataFormatada}</td>
                <td><span class="badge ${a.tipoAtendimento === 'aluno' ? 'bg-primary' : 'bg-success'}">${a.tipoAtendimento === 'aluno' ? 'Aluno' : 'Responsável'}</span></td>
                <td>${escapeHTMLAtendimento(a.motivoLabel)}</td>
                <td>${escapeHTMLAtendimento(a.providenciasLabel)}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div></div>`;
  }
}

function exportarCSVAtendimento() {
  const data = atendimentoState.relatorioAtual;
  if (!data) { notificar('⚠️ Gere um relatório primeiro', 'warning'); return; }
  const registros = data.registros || [];
  if (registros.length === 0) { notificar('⚠️ Nenhum registro para exportar', 'warning'); return; }

  if (typeof gerarBaixarCSV === 'function') {
    const colunas = [
      { label: 'Data', key: 'dataFormatada' },
      { label: 'Tipo', format: (a) => a.tipoAtendimento === 'aluno' ? 'Aluno' : 'Responsável' },
      { label: 'Aluno', key: 'alunoNome' },
      { label: 'Turma', key: 'alunoTurma' },
      { label: 'Responsável', key: 'responsavelNome' },
      { label: 'Motivo', key: 'motivoLabel' },
      { label: 'Providências', key: 'providenciasLabel' },
      { label: 'Registrado por', key: 'registradoPor' },
      { label: 'Assinatura Responsável', format: (a) => a.temAssinatura ? 'Sim' : 'Não' },
      { label: 'Assinatura Aluno', format: (a) => a.temAssinaturaAluno ? 'Sim' : 'Não' }
    ];
    const filtros = [];
    const di = safeGetAtendimento('AtendimentoDataInicio')?.value;
    const df = safeGetAtendimento('AtendimentoDataFim')?.value;
    if (di) filtros.push({ label: 'Data inicial', valor: di });
    if (df) filtros.push({ label: 'Data final', valor: df });

    const ok = gerarBaixarCSV({
      titulo: 'Relatório de Atendimentos',
      subtitulo: data.turma ? `Turma: ${data.turma}` : (data.aluno?.nome ? `Aluno: ${data.aluno.nome}` : 'Geral'),
      setor: 'Gestão Geral',
      colunas, registros, filtros,
      nomeArquivo: 'relatorio-atendimentos',
      observacoes: `${registros.length} atendimento(s)`
    });
    if (ok) notificar(`✅ Relatório exportado (${registros.length})!`, 'success');
  } else {
    notificar('⚠️ Helper de CSV não encontrado', 'error');
  }
}

function exportarPDFAtendimento() {
  const data = atendimentoState.relatorioAtual;
  if (!data) { notificar('⚠️ Gere um relatório primeiro', 'warning'); return; }
  const win = window.open('', '_blank');
  win.document.write(gerarHTMLRelatorioAtendimento(data));
  win.document.close();
  win.onload = () => setTimeout(() => win.print(), 500);
}

function gerarHTMLRelatorioAtendimento(data) {
  const logo = '/uploads/logo-iema.png';
  const carimbo = '/icons/assinatura_gestao.ico';
  const dataGeracao = new Date().toLocaleString('pt-BR');
  const tipo = data.aluno ? 'aluno' : (data.turma ? 'turma' : 'geral');
  let titulo = 'Relatório de Atendimentos';
  let subtitulo = '';
  if (tipo === 'turma') { titulo = 'Relatório de Atendimentos por Turma'; subtitulo = `Turma: ${data.turma || ''}`; }
  else if (tipo === 'aluno') { titulo = 'Relatório Individual de Atendimentos'; subtitulo = `${data.aluno?.nome || ''} — ${data.aluno?.turma || ''}`; }
  else { subtitulo = 'Visão consolidada'; }

  const registros = data.registros || [];
  let tabelaHTML = '';
  if (registros.length > 0) {
    tabelaHTML = `
      <div class="section-title">📋 Registros (${registros.length})</div>
      <table>
        <thead>
          <tr><th>Data</th><th>Tipo</th><th>Aluno</th><th>Motivo</th><th>Providências</th><th>Registrado por</th></tr>
        </thead>
        <tbody>
          ${registros.map(a => `
            <tr>
              <td>${a.dataFormatada || '-'}</td>
              <td>${a.tipoAtendimento === 'aluno' ? 'Aluno' : 'Responsável'}</td>
              <td><strong>${escapeHTMLAtendimento(a.alunoNome || '')}</strong><br><small>${escapeHTMLAtendimento(a.alunoTurma || '')}</small></td>
              <td>${escapeHTMLAtendimento(a.motivoLabel || '')}</td>
              <td>${escapeHTMLAtendimento(a.providenciasLabel || '')}</td>
              <td>${escapeHTMLAtendimento(a.registradoPor || '')}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  let assinaturaDigital = null;
  const comAssinatura = registros.find(a => a.temAssinatura && a.assinaturaBase64);
  if (comAssinatura) assinaturaDigital = comAssinatura.assinaturaBase64;

  return `<!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <title>${titulo}</title>
    <style>
      @page { size: A4 portrait; margin: 8mm; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Times New Roman', Times, serif; font-size: 9.5pt; line-height: 1.25; color: #000; }
      .header { text-align: center; border-bottom: 1.5px double #000; padding-bottom: 4px; margin-bottom: 6px; }
      .header img { max-width: 100%; max-height: 14mm; object-fit: contain; display: block; margin: 0 auto 2px; }
      .header h1 { font-size: 10pt; text-transform: uppercase; font-weight: bold; margin: 2px 0 0; }
      .header p { font-size: 8pt; margin: 1px 0 0; }
      .titulo { text-align: center; font-size: 11pt; font-weight: bold; background: #dbeafe; padding: 4px 8px; border: 1.5px solid #000; margin: 6px 0 3px; text-transform: uppercase; letter-spacing: 0.5px; }
      .subtitulo { text-align: center; font-size: 9pt; margin: 0 0 6px; font-style: italic; }
      .section-title { font-size: 9pt; font-weight: bold; background: #e8e8e8; padding: 2px 6px; border-left: 3px solid #1e3c72; margin: 6px 0 3px; }
      table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 6px; }
      th { background: #1e3c72; color: white; padding: 4px 5px; text-align: left; border: 1px solid #152a52; font-size: 8pt; }
      td { padding: 3px 5px; border: 1px solid #ddd; vertical-align: top; }
      tr:nth-child(even) { background: #f9fafb; }
      .assinaturas { display: flex; justify-content: center; margin-top: 25px; gap: 30px; }
      .assinatura { flex: 0 0 60%; text-align: center; }
      .assinatura-container-relatorio { position: relative; min-height: 18mm; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 0; }
      .assinatura-container-relatorio::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; border-bottom: 1px solid #000; }
      .assinatura-img { max-height: 14mm; max-width: 100%; object-fit: contain; position: relative; z-index: 2; margin-bottom: 1mm; }
      .carimbo-overlay { position: absolute; bottom: 1mm; left: 50%; transform: translateX(-50%); max-height: 15mm; max-width: 55mm; object-fit: contain; opacity: 0.95; pointer-events: none; z-index: 1; }
      .assinatura-linha { padding-top: 3px; font-size: 8pt; margin-top: 2px; }
      .footer { text-align: center; margin-top: 8px; padding-top: 3px; border-top: 1px solid #ccc; font-size: 6.5pt; color: #666; }
      .footer p { margin: 1px 0; }
      .btn-print { display: block; margin: 10px auto; padding: 8px 20px; background: #1e3c72; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; font-family: Arial, sans-serif; }
      .btn-print:hover { background: #2a5298; }
      @media print { .no-print { display: none !important; } body { padding: 0; } }
    </style>
  </head>
  <body>
    <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
    <div class="header">
      <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
      <h1>IEMA Pleno: São Luís - Centro</h1>
      <p>Sistema de Atendimentos — Gestão Geral</p>
    </div>
    <div class="titulo">📋 ${titulo}</div>
    ${subtitulo ? `<div class="subtitulo">${escapeHTMLAtendimento(subtitulo)}</div>` : ''}
    ${tabelaHTML}
    <div class="assinaturas">
      <div class="assinatura">
        <div class="assinatura-container-relatorio">
          ${assinaturaDigital ? `<img class="assinatura-img" src="${assinaturaDigital}" alt="Assinatura">` : ''}
          <img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
        </div>
        <div class="assinatura-linha">Assinatura do Responsável / Gestão Geral</div>
      </div>
    </div>
    <div class="footer">
      <p>Documento gerado em <strong>${dataGeracao}</strong> — EducaPleno — Gestão Geral</p>
    </div>
  </body>
  </html>`;
}

// ============================================
// EXPOSIÇÃO GLOBAL (para onclick inline no HTML)
// ============================================
window.setModoBuscaAtendimento = setModoBuscaAtendimento;
window.selecionarMotivoAtendimento = selecionarMotivoAtendimento;
window.selecionarProvidenciaAtendimento = selecionarProvidenciaAtendimento;
window.registrarAtendimento = registrarAtendimento;
window.limparTelaAtendimento = limparTelaAtendimento;
window.toggleNecessitaAssinaturaAtendimento = toggleNecessitaAssinaturaAtendimento;
window.toggleNecessitaAssinaturaAlunoAtendimento = toggleNecessitaAssinaturaAlunoAtendimento;
window.abrirModalAssinaturaResponsavelAtendimento = abrirModalAssinaturaResponsavelAtendimento;
window.fecharModalAssinaturaResponsavelAtendimento = fecharModalAssinaturaResponsavelAtendimento;
window.reabrirModalAssinaturaResponsavelAtendimento = reabrirModalAssinaturaResponsavelAtendimento;
window.cancelarSessaoResponsavelAtendimento = cancelarSessaoResponsavelAtendimento;
window.refazerAssinaturaResponsavelAtendimento = refazerAssinaturaResponsavelAtendimento;
window.abrirModalAssinaturaAlunoAtendimento = abrirModalAssinaturaAlunoAtendimento;
window.fecharModalAssinaturaAlunoAtendimento = fecharModalAssinaturaAlunoAtendimento;
window.reabrirModalAssinaturaAlunoAtendimento = reabrirModalAssinaturaAlunoAtendimento;
window.cancelarSessaoAlunoAtendimento = cancelarSessaoAlunoAtendimento;
window.refazerAssinaturaAlunoAtendimento = refazerAssinaturaAlunoAtendimento;
window.copiarLinkAssinaturaAtendimento = copiarLinkAssinaturaAtendimento;
window.carregarListaAtendimentos = carregarListaAtendimentos;
window.imprimirAtendimento = imprimirAtendimento;
window.verAtendimento = verAtendimento;      // 🆕
window.abrirEditarAtendimento = abrirEditarAtendimento;
window.salvarEdicaoAtendimento = salvarEdicaoAtendimento;
window.excluirAtendimento = excluirAtendimento;
window.carregarDashboardAtendimentos = carregarDashboardAtendimentos;
window.toggleRelatorioFiltrosAtendimento = toggleRelatorioFiltrosAtendimento;
window.carregarRelatorioAtendimento = carregarRelatorioAtendimento;
window.exportarCSVAtendimento = exportarCSVAtendimento;
window.exportarPDFAtendimento = exportarPDFAtendimento;
window.aplicarFiltrosListaAtendimento = aplicarFiltrosListaAtendimento;
window.selecionarAlunoAutocompleteAtendimento = selecionarAlunoAutocompleteAtendimento;