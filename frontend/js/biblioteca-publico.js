// ============================================
// BIBLIOTECA PÚBLICA - JS
// ============================================

// ============================================
// 🚫 BLOQUEAR ALERTS NATIVOS (KODULAR/WEBVIEW)
// ============================================
// Sobrescreve window.alert para usar toast customizado
window.alert = function(mensagem) {
    console.warn('⚠️ alert() nativo bloqueado. Use mostrarToast()');
    if (typeof mostrarToast === 'function') {
        mostrarToast(String(mensagem), 'info', 4000);
    }
};

// Sobrescreve window.confirm (assíncrono)
window.confirm = function(mensagem) {
    console.warn('⚠️ confirm() nativo bloqueado. Use await confirmar()');
    // Retorna true automaticamente para não quebrar o fluxo
    // (melhor trocar por confirmar() manualmente)
    return true;
};

window.prompt = function(mensagem, valorPadrao) {
    console.warn('⚠️ prompt() nativo bloqueado.');
    return null;
};


let statusSistema = {};
let cursos = [];
let turmas = [];
let vinculosCursoTurma = {};
let alunoSelecionado = { entrada: null, saida: null };
let motivoSelecionado = null;
let scannerEntrada = null;
let scannerSaida = null;
let alunosLista = { entrada: [], saida: [] };

// ========== HELPERS ==========
function safeGet(id) { return document.getElementById(id); }
function escapeHTML(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function gerarAvatarSVG(nome) {
  const inicial = (nome || '?').charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0ea5e9"/><stop offset="100%" stop-color="#0284c7"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/><text x="50" y="50" font-family="Arial" font-size="45" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${inicial}</text></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', async () => {
  await carregarStatus();
  await carregarCursosTurmas();
  preencherSelects();
});

async function carregarStatus() {
  try {
    const r = await fetch('/api/biblioteca-publica/status');
    const d = await r.json();
    if (d.success) {
      statusSistema = d.status;
      const pill = safeGet('statusInfo');
      if (pill) {
        pill.classList.add('active');
        pill.innerHTML = `<i class="fas fa-circle"></i> ${d.status.visitasHoje} visita(s) hoje • ${d.status.emVisita} em visita agora`;
      }
    }
  } catch (e) {}
}

async function carregarCursosTurmas() {
  try {
    const r = await fetch('/api/biblioteca-publica/cursos-turmas');
    const d = await r.json();
    if (d.success) {
      cursos = d.cursos || [];
      turmas = d.turmas || [];
      vinculosCursoTurma = d.vinculosCursoTurma || {};
    }
  } catch (e) {}
}

function preencherSelects() {
  ['entradaCurso', 'saidaCurso'].forEach(id => {
    const s = safeGet(id);
    if (s) {
      s.innerHTML = '<option value="">Selecione o curso...</option>';
      cursos.forEach(c => s.innerHTML += `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`);
    }
  });
}

// ========== NAVEGAÇÃO ==========
function mostrarSecao(secao) {
  document.querySelectorAll('.section-content').forEach(s => s.classList.remove('active'));
  safeGet('actionGrid').style.display = 'none';
  document.querySelector('.hero-section').style.display = 'none';
  
  const mapa = { entrada: 'secaoEntrada', saida: 'secaoSaida' };
  if (mapa[secao]) {
    safeGet(mapa[secao]).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  
  if (secao === 'entrada') setModoPublico('entrada', 'automatico');
  if (secao === 'saida') setModoPublico('saida', 'automatico');
}

function voltarHome() {
  document.querySelectorAll('.section-content').forEach(s => s.classList.remove('active'));
  safeGet('actionGrid').style.display = 'grid';
  document.querySelector('.hero-section').style.display = 'block';
  
  // Parar scanners
  pararScanner('entrada');
  pararScanner('saida');
  
  // Reset
  resetEntrada();
  resetSaida();
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetEntrada() {
  alunoSelecionado.entrada = null;
  motivoSelecionado = null;
  safeGet('alunoInfoPublico').style.display = 'none';
  safeGet('formEntradaPublico').style.display = 'none';
  safeGet('motivoPublicoSelecionado').value = '';
  safeGet('motivoOutrosPublico').value = '';
  safeGet('campoOutrosPublico').style.display = 'none';
  document.querySelectorAll('#formEntradaPublico .motivo-card').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('#formEntradaPublico .atividades-grid input').forEach(c => c.checked = false);
}

function resetSaida() {
  alunoSelecionado.saida = null;
  safeGet('alunoInfoSaida').style.display = 'none';
  safeGet('formSaidaPublico').style.display = 'none';
  safeGet('observacoesSaidaPublico').value = '';
}

// ========== MODO ==========
async function setModoPublico(secao, modo) {
  const prefixo = secao === 'entrada' ? 'Entrada' : 'Saida';
  
  if (modo === 'automatico') {
    safeGet(`modoAuto${prefixo}Btn`).classList.add('active');
    safeGet(`modoManual${prefixo}Btn`).classList.remove('active');
    safeGet(`modoAuto${prefixo}`).style.display = 'block';
    safeGet(`modoManual${prefixo}`).style.display = 'none';
    await iniciarScanner(secao);
  } else {
    safeGet(`modoManual${prefixo}Btn`).classList.add('active');
    safeGet(`modoAuto${prefixo}Btn`).classList.remove('active');
    safeGet(`modoAuto${prefixo}`).style.display = 'none';
    safeGet(`modoManual${prefixo}`).style.display = 'block';
    await pararScanner(secao);
  }
}

// ========== SCANNER ==========
async function iniciarScanner(secao) {
  const containerId = `qr-reader-publico-${secao}`;
  const container = safeGet(containerId);
  if (!container) return;
  
  const inst = secao === 'entrada' ? scannerEntrada : scannerSaida;
  if (inst) return;
  
  container.innerHTML = `<div id="${containerId}-new" style="width:100%;"></div>`;
  
  if (!navigator.mediaDevices?.getUserMedia) {
    container.innerHTML = '<div class="alert alert-warning">Câmera não disponível. Use a busca por turma.</div>';
    return;
  }
  
  try {
    const scanner = new Html5Qrcode(`${containerId}-new`);
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (text) => onScanPublico(secao, text),
      () => {}
    );
    
    if (secao === 'entrada') scannerEntrada = scanner;
    else scannerSaida = scanner;
  } catch (e) {
    container.innerHTML = '<div class="alert alert-warning">Erro ao acessar câmera.</div>';
  }
}

async function pararScanner(secao) {
  const inst = secao === 'entrada' ? scannerEntrada : scannerSaida;
  if (inst) {
    try { await inst.stop(); } catch (e) {}
    if (secao === 'entrada') scannerEntrada = null;
    else scannerSaida = null;
  }
}

function extrairAlunoId(text) {
  if (!text) return null;
  if (text.match(/^[a-f0-9]{24}$/i)) return text;
  const m = text.match(/[?&]aluno=([a-f0-9]{24})/i);
  return m ? m[1] : null;
}

async function onScanPublico(secao, text) {
  const id = extrairAlunoId(text);
  if (!id) return;
  await pararScanner(secao);
  await buscarAlunoPublico(secao, id);
}

// ========== BUSCA POR TURMA ==========
async function carregarTurmasPorCursoPublico() {
  const curso = safeGet('entradaCurso').value;
  const sel = safeGet('entradaTurma');
  if (!curso) {
    sel.innerHTML = '<option value="">Selecione o curso primeiro</option>';
    sel.disabled = true;
    return;
  }
  const ts = vinculosCursoTurma[curso] || [];
  sel.innerHTML = '<option value="">Selecione a turma...</option>';
  ts.forEach(t => sel.innerHTML += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`);
  sel.disabled = false;
}

async function carregarTurmasPorCursoPublicoSaida() {
  const curso = safeGet('saidaCurso').value;
  const sel = safeGet('saidaTurma');
  if (!curso) {
    sel.innerHTML = '<option value="">Selecione o curso primeiro</option>';
    sel.disabled = true;
    return;
  }
  const ts = vinculosCursoTurma[curso] || [];
  sel.innerHTML = '<option value="">Selecione a turma...</option>';
  ts.forEach(t => sel.innerHTML += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`);
  sel.disabled = false;
}

async function carregarAlunosPublico() {
  const turma = safeGet('entradaTurma').value;
  if (!turma) return;
  
  safeGet('listaAlunosPublico').innerHTML = '<div class="text-center py-3"><i class="fas fa-spinner fa-spin"></i></div>';
  
  try {
    const r = await fetch(`/api/biblioteca-publica/alunos-por-turma?turma=${encodeURIComponent(turma)}`);
    const d = await r.json();
    if (d.success) {
      alunosLista.entrada = d.alunos;
      filtrarAlunosPublico();
    }
  } catch (e) {}
}

async function carregarAlunosPublicoSaida() {
  const turma = safeGet('saidaTurma').value;
  if (!turma) return;
  
  safeGet('listaAlunosPublicoSaida').innerHTML = '<div class="text-center py-3"><i class="fas fa-spinner fa-spin"></i></div>';
  
  try {
    const r = await fetch(`/api/biblioteca-publica/alunos-por-turma?turma=${encodeURIComponent(turma)}`);
    const d = await r.json();
    if (d.success) {
      alunosLista.saida = d.alunos;
      filtrarAlunosPublicoSaida();
    }
  } catch (e) {}
}

function filtrarAlunosPublico() {
  const busca = (safeGet('entradaBusca').value || '').toLowerCase();
  let lista = alunosLista.entrada;
  if (busca) lista = lista.filter(a => (a.nome || '').toLowerCase().includes(busca));
  renderLista('listaAlunosPublico', lista, 'entrada');
}

function filtrarAlunosPublicoSaida() {
  const busca = (safeGet('saidaBusca').value || '').toLowerCase();
  let lista = alunosLista.saida;
  if (busca) lista = lista.filter(a => (a.nome || '').toLowerCase().includes(busca));
  renderLista('listaAlunosPublicoSaida', lista, 'saida');
}

function renderLista(containerId, lista, secao) {
  const c = safeGet(containerId);
  if (lista.length === 0) {
    c.innerHTML = '<div class="text-center py-3 text-muted">Nenhum aluno</div>';
    return;
  }
  c.innerHTML = lista.map(a => `
    <div class="list-group-item d-flex justify-content-between align-items-center" data-aluno-id="${a.id}" style="cursor:pointer;">
      <div>
        <strong>${escapeHTML(a.nome)}</strong><br>
        <small class="text-muted">${escapeHTML(a.matricula || '')} • ${escapeHTML(a.curso || '')}</small>
      </div>
      <i class="fas fa-hand-pointer fa-2x" style="color:#0ea5e9;"></i>
    </div>
  `).join('');
  
  c.querySelectorAll('[data-aluno-id]').forEach(el => {
    el.addEventListener('click', () => buscarAlunoPublico(secao, el.getAttribute('data-aluno-id')));
  });
}

// ========== BUSCAR ALUNO ==========
async function buscarAlunoPublico(secao, id) {
  try {
    await pararScanner(secao);
    const r = await fetch(`/api/biblioteca-publica/aluno/${id}`);
    const d = await r.json();
    
    if (!d.success) {
      mostrarErro('Erro', d.error || 'Aluno não encontrado');
      return;
    }
    
    if (secao === 'entrada') {
      if (d.emVisita) {
        mostrarErro('Já registrado', 'Você já está registrado na biblioteca. Registre a saída primeiro.');
        return;
      }
      alunoSelecionado.entrada = d.aluno;
      exibirAlunoPublico('entrada', d.aluno);
      safeGet('formEntradaPublico').style.display = 'block';
    } else {
      if (!d.emVisita) {
        mostrarErro('Sem visita', 'Você não está registrado como em visita.');
        return;
      }
      alunoSelecionado.saida = d.aluno;
      exibirAlunoPublico('saida', d.aluno, d.visitaAtiva);
      safeGet('formSaidaPublico').style.display = 'block';
    }
  } catch (e) {
    mostrarErro('Erro', 'Erro ao buscar aluno');
  }
}

function exibirAlunoPublico(secao, aluno, visita = null) {
  if (secao === 'entrada') {
    safeGet('alunoFotoPublico').src = aluno.fotoPerfil || gerarAvatarSVG(aluno.nome);
    safeGet('alunoNomePublico').textContent = aluno.nome;
    safeGet('alunoTurmaPublico').textContent = aluno.turma || '-';
    safeGet('alunoMatriculaPublico').textContent = aluno.matricula || '-';
    safeGet('alunoInfoPublico').style.display = 'block';
  } else {
    safeGet('alunoFotoSaida').src = aluno.fotoPerfil || gerarAvatarSVG(aluno.nome);
    safeGet('alunoNomeSaida').textContent = aluno.nome;
    safeGet('alunoTurmaSaida').textContent = aluno.turma || '-';
    if (visita) {
      safeGet('alunoEntradaSaida').textContent = new Date(visita.dataHoraEntrada).toLocaleString('pt-BR');
    }
    safeGet('alunoInfoSaida').style.display = 'block';
  }
}

// ========== MOTIVO ==========
function selecionarMotivoPublico(motivo) {
  motivoSelecionado = motivo;
  safeGet('motivoPublicoSelecionado').value = motivo;
  document.querySelectorAll('#formEntradaPublico .motivo-card').forEach(c => c.classList.remove('selected'));
  const card = document.querySelector(`#formEntradaPublico .motivo-card[data-motivo="${motivo}"]`);
  if (card) card.classList.add('selected');
  safeGet('campoOutrosPublico').style.display = motivo === 'outros' ? 'block' : 'none';
}

// ========== CONFIRMAR ENTRADA ==========
async function confirmarEntradaPublico() {
  if (!motivoSelecionado) { mostrarErro('Atenção', 'Selecione o motivo da visita'); return; }
  if (motivoSelecionado === 'outros' && !safeGet('motivoOutrosPublico').value.trim()) {
    mostrarErro('Atenção', 'Especifique o motivo'); return;
  }
  if (!alunoSelecionado.entrada) { mostrarErro('Atenção', 'Nenhum aluno selecionado'); return; }
  
  const atividades = Array.from(document.querySelectorAll('#formEntradaPublico .atividades-grid input:checked')).map(c => c.value);
  
  try {
    const r = await fetch('/api/biblioteca-publica/entrada', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alunoId: alunoSelecionado.entrada.id,
        motivoVisita: motivoSelecionado,
        motivoOutros: safeGet('motivoOutrosPublico').value,
        atividades
      })
    });
    const d = await r.json();
    if (d.success) {
      mostrarSucesso('Entrada Registrada!', `Bem-vindo(a), ${alunoSelecionado.entrada.nome}!`);
    } else {
      mostrarErro('Erro', d.error);
    }
  } catch (e) {
    mostrarErro('Erro', 'Erro de conexão');
  }
}

// ========== CONFIRMAR SAÍDA ==========
async function confirmarSaidaPublico() {
  if (!alunoSelecionado.saida) { mostrarErro('Atenção', 'Nenhum aluno selecionado'); return; }
  
  try {
    const r = await fetch('/api/biblioteca-publica/saida', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alunoId: alunoSelecionado.saida.id,
        observacoes: safeGet('observacoesSaidaPublico').value
      })
    });
    const d = await r.json();
    if (d.success) {
      mostrarSucesso('Saída Registrada!', `Até logo, ${alunoSelecionado.saida.nome}! Duração: ${d.atendimento.duracaoMinutos} min`);
    } else {
      mostrarErro('Erro', d.error);
    }
  } catch (e) {
    mostrarErro('Erro', 'Erro de conexão');
  }
}

// ========== MODAIS ==========
function mostrarSucesso(titulo, msg) {
  safeGet('modalTitulo').textContent = titulo;
  safeGet('modalMensagem').textContent = msg;
  safeGet('modalSucesso').classList.add('active');
}
function fecharModalSucesso() {
  safeGet('modalSucesso').classList.remove('active');
  voltarHome();
}
function mostrarErro(titulo, msg) {
  safeGet('modalErroTitulo').textContent = titulo;
  safeGet('modalErroMensagem').textContent = msg;
  safeGet('modalErro').classList.add('active');
}
function fecharModalErro() {
  safeGet('modalErro').classList.remove('active');
}

// ========== EXPORTAR ==========
window.mostrarSecao = mostrarSecao;
window.voltarHome = voltarHome;
window.setModoPublico = setModoPublico;
window.carregarTurmasPorCursoPublico = carregarTurmasPorCursoPublico;
window.carregarTurmasPorCursoPublicoSaida = carregarTurmasPorCursoPublicoSaida;
window.carregarAlunosPublico = carregarAlunosPublico;
window.carregarAlunosPublicoSaida = carregarAlunosPublicoSaida;
window.filtrarAlunosPublico = filtrarAlunosPublico;
window.filtrarAlunosPublicoSaida = filtrarAlunosPublicoSaida;
window.selecionarMotivoPublico = selecionarMotivoPublico;
window.confirmarEntradaPublico = confirmarEntradaPublico;
window.confirmarSaidaPublico = confirmarSaidaPublico;
window.fecharModalSucesso = fecharModalSucesso;
window.fecharModalErro = fecharModalErro;