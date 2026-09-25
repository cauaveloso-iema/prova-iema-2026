// ============================================
// BIBLIOTECA - ADMIN JS
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


let token = localStorage.getItem('auth_token');
let currentAluno = null;
let currentAtendimento = null;
let relatorioData = null;
let dashboardCharts = {};

let scannerAuto = null;
let scannerAutoAtivo = false;
let modoAtual = 'automatico';
let turmasDisponiveis = [];
let alunosPorTurma = [];
let motivoSelecionado = null;
let modalQRCode = null;

// ========== PROTEÇÃO CONTRA alert() ==========
(function() {
  const original = window.alert.bind(window);
  window.alert = function(msg) {
    const isWebView = /wv|WebView|Android.*Version\/[\d.]+.*Chrome/i.test(navigator.userAgent) ||
                      (typeof window.AppInventor !== 'undefined');
    if (!isWebView) {
      console.log('[ALERT]', msg);
      return;
    }
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:999999;padding:20px;';
    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:25px;max-width:380px;width:100%;text-align:center;">
        <div style="font-size:48px;margin-bottom:15px;">ℹ️</div>
        <p style="color:#374151;margin-bottom:20px;white-space:pre-line;">${String(msg)}</p>
        <button onclick="this.closest('div').parentElement.remove()" style="width:100%;padding:12px;background:#0ea5e9;color:white;border:none;border-radius:10px;font-weight:600;cursor:pointer;">OK</button>
      </div>`;
    document.body.appendChild(modal);
  };
})();

// ========== HELPERS ==========
function safeGet(id) { return document.getElementById(id); }
function safeSetText(id, v) { const el = safeGet(id); if (el) el.textContent = v; }
function escapeHTML(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function gerarAvatarSVG(nome) {
  const inicial = (nome || '?').charAt(0).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#0ea5e9"/><stop offset="100%" stop-color="#0284c7"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/><text x="50" y="50" font-family="Arial" font-size="45" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${inicial}</text></svg>`;
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

function mostrarToast(msg, tipo = 'info') {
  const cores = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
  const toast = document.createElement('div');
  toast.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-100px);
    background:${cores[tipo]};color:white;padding:14px 22px;border-radius:10px;
    box-shadow:0 6px 24px rgba(0,0,0,0.2);z-index:99999;font-weight:500;font-size:14px;
    transition:transform 0.3s;`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.style.transform = 'translateX(-50%) translateY(0)', 50);
  setTimeout(() => {
    toast.style.transform = 'translateX(-50%) translateY(-100px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', async () => {
  if (!token) { window.location.href = '/login.html'; return; }
  
  const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
  const allowed = ['biblioteca', 'super_admin', 'admin'];
  if (!allowed.includes(userData.role)) {
    window.location.href = '/login.html';
    return;
  }
  
  safeSetText('userName', userData.nome || 'Biblioteca');
  safeSetText('dataAtual', new Date().toLocaleDateString('pt-BR'));
  
  // Data de hoje no formulário
  const agora = new Date();
  const offset = agora.getTimezoneOffset() * 60000;
  const dataLocal = new Date(agora.getTime() - offset);
  if (safeGet('dataEntrada')) safeGet('dataEntrada').value = dataLocal.toISOString().slice(0, 16);
  
  modalQRCode = new bootstrap.Modal(safeGet('modalQRCode'));
  
  await Promise.all([
    carregarFotoPerfil(),
    carregarTurmasManual(),
    carregarTurmasRelatorio()
  ]);
  
  await iniciarScannerAutomatico();
  await carregarAtendimentosAtivos();
  
  // Tabs
  safeGet('ativos-tab')?.addEventListener('shown.bs.tab', carregarAtendimentosAtivos);
  safeGet('dashboard-tab')?.addEventListener('shown.bs.tab', carregarDashboard);
  safeGet('relatorios-tab')?.addEventListener('shown.bs.tab', carregarTurmasRelatorio);
  safeGet('registro-tab')?.addEventListener('shown.bs.tab', () => {
    if (modoAtual === 'automatico') iniciarScannerAutomatico();
  });
  
  // Eventos
  safeGet('filtroTurmaManual')?.addEventListener('change', carregarAlunosPorTurma);
  safeGet('filtroBuscaManual')?.addEventListener('input', filtrarAlunosManual);
  
  setInterval(() => {
    if (safeGet('ativos-tab')?.classList.contains('active')) carregarAtendimentosAtivos();
  }, 30000);
});

// ========== FOTO PERFIL ==========
async function carregarFotoPerfil() {
  try {
    const r = await fetch('/api/perfil/me', { headers: { 'Authorization': `Bearer ${token}` } });
    const d = await r.json();
    if (d.success && d.perfil?.fotoPerfil) {
      const av = safeGet('userAvatar');
      if (av) av.innerHTML = `<img src="${d.perfil.fotoPerfil}">`;
    }
  } catch (e) {}
}

// ========== SCANNER ==========
async function iniciarScannerAutomatico() {
  const qrContainer = safeGet('qr-reader-auto');
  if (!qrContainer || scannerAutoAtivo) return;
  
  qrContainer.innerHTML = '<div id="qr-reader-auto-new" style="width:100%;"></div>';
  
  if (!navigator.mediaDevices?.getUserMedia) {
    qrContainer.innerHTML = '<div class="alert alert-warning m-3">Câmera não disponível. Use o modo Manual.</div>';
    return;
  }
  
  try {
    scannerAuto = new Html5Qrcode("qr-reader-auto-new");
    await scannerAuto.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onScanSuccess,
      () => {}
    );
    scannerAutoAtivo = true;
  } catch (err) {
    console.error(err);
    qrContainer.innerHTML = '<div class="alert alert-warning m-3">Erro ao acessar a câmera. Use o modo Manual.</div>';
  }
}

async function pararScanner() {
  if (scannerAuto && scannerAutoAtivo) {
    try { await scannerAuto.stop(); } catch (e) {}
  }
  scannerAutoAtivo = false;
  scannerAuto = null;
}

function extrairAlunoId(text) {
  if (!text) return null;
  if (text.match(/^[a-f0-9]{24}$/i)) return text;
  const m = text.match(/[?&]aluno=([a-f0-9]{24})/i);
  return m ? m[1] : null;
}

async function onScanSuccess(text) {
  const id = extrairAlunoId(text);
  if (!id) return;
  await pararScanner();
  await buscarAluno(id);
}

// ========== MODO ==========
async function setModo(modo) {
  modoAtual = modo;
  safeGet('alunoInfo').style.display = 'none';
  safeGet('formEntrada').style.display = 'none';
  safeGet('formSaida').style.display = 'none';
  currentAluno = null;
  
  if (modo === 'automatico') {
    safeGet('modoAutomaticoBtn').classList.add('active');
    safeGet('modoManualBtn').classList.remove('active');
    safeGet('modoAutomatico').style.display = 'block';
    safeGet('modoManual').style.display = 'none';
    await iniciarScannerAutomatico();
  } else {
    safeGet('modoManualBtn').classList.add('active');
    safeGet('modoAutomaticoBtn').classList.remove('active');
    safeGet('modoAutomatico').style.display = 'none';
    safeGet('modoManual').style.display = 'block';
    await pararScanner();
    const t = safeGet('filtroTurmaManual').value;
    if (t) await carregarAlunosPorTurma();
  }
}

// ========== TURMAS ==========
async function carregarTurmasManual() {
  try {
    const r = await fetch('/api/biblioteca/turmas', { headers: { 'Authorization': `Bearer ${token}` } });
    const d = await r.json();
    if (d.success) {
      turmasDisponiveis = d.turmas;
      const sel = safeGet('filtroTurmaManual');
      if (sel) {
        sel.innerHTML = '<option value="">Selecione a turma...</option>';
        d.turmas.forEach(t => sel.innerHTML += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`);
      }
    }
  } catch (e) { console.error(e); }
}

async function carregarTurmasRelatorio() {
  try {
    const r = await fetch('/api/biblioteca/relatorio/geral', { headers: { 'Authorization': `Bearer ${token}` } });
    const d = await r.json();
    if (d.success && d.turmasDisponiveis) {
      const sel = safeGet('filtroTurma');
      if (sel) {
        sel.innerHTML = '<option value="">Selecione...</option>';
        d.turmasDisponiveis.forEach(t => sel.innerHTML += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`);
      }
    }
  } catch (e) {}
}

// ========== ALUNOS ==========
async function carregarAlunosPorTurma() {
  const turma = safeGet('filtroTurmaManual')?.value;
  if (!turma) {
    safeGet('listaAlunosManual').innerHTML = '<div class="text-center py-3">Selecione uma turma</div>';
    return;
  }
  safeGet('listaAlunosManual').innerHTML = '<div class="text-center py-3"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';
  
  try {
    const r = await fetch(`/api/biblioteca/alunos-por-turma?turma=${encodeURIComponent(turma)}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const d = await r.json();
    if (d.success) {
      alunosPorTurma = d.alunos;
      filtrarAlunosManual();
    }
  } catch (e) {
    safeGet('listaAlunosManual').innerHTML = '<div class="alert alert-danger">Erro ao carregar</div>';
  }
}

function filtrarAlunosManual() {
  const busca = (safeGet('filtroBuscaManual')?.value || '').toLowerCase();
  let filtrados = alunosPorTurma;
  if (busca) filtrados = filtrados.filter(a => (a.nome || '').toLowerCase().includes(busca));
  filtrados = [...filtrados].sort((a,b) => (a.nome||'').localeCompare(b.nome||''));
  
  const container = safeGet('listaAlunosManual');
  if (filtrados.length === 0) {
    container.innerHTML = '<div class="text-center text-muted py-3">Nenhum aluno encontrado</div>';
    return;
  }
  
  container.innerHTML = '<div class="list-group">' + filtrados.map(a => `
    <div class="list-group-item d-flex justify-content-between align-items-center" 
         data-aluno-id="${a.id}" style="cursor:pointer;">
      <div>
        <strong>${escapeHTML(a.nome)}</strong><br>
        <small class="text-muted">${escapeHTML(a.matricula||'')} • ${escapeHTML(a.curso||'')}</small>
      </div>
      <i class="fas fa-hand-pointer fa-2x" style="color:#0ea5e9;"></i>
    </div>
  `).join('') + '</div>';
  
  container.querySelectorAll('[data-aluno-id]').forEach(el => {
    el.addEventListener('click', () => buscarAluno(el.getAttribute('data-aluno-id')));
  });
}

// ========== BUSCAR ALUNO ==========
async function buscarAluno(id) {
  try {
    await pararScanner();
    const r = await fetch(`/api/biblioteca/aluno/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
    const d = await r.json();
    
    if (!d.success) {
      mostrarToast(d.error || 'Erro ao buscar', 'error');
      if (modoAtual === 'automatico') reiniciarScanner();
      return;
    }
    
    currentAluno = d.aluno;
    
    // Foto
    const foto = safeGet('alunoFoto');
    if (foto) {
      foto.onerror = null;
      foto.src = d.aluno.fotoPerfil || gerarAvatarSVG(d.aluno.nome);
      foto.onerror = function() { this.onerror = null; this.src = gerarAvatarSVG(d.aluno.nome); };
    }
    
    safeSetText('alunoNome', d.aluno.nome);
    safeSetText('alunoMatricula', d.aluno.matricula || 'Não informada');
    safeSetText('alunoTurma', d.aluno.turma || 'Não informada');
    safeSetText('alunoCurso', d.aluno.curso || 'Não informado');
    
    const status = safeGet('statusAtendimento');
    if (status) {
      if (d.emVisita && d.visitaAtiva) {
        currentAtendimento = d.visitaAtiva;
        status.innerHTML = `
          <div class="alert alert-warning">
            <i class="fas fa-clock"></i> Em visita desde ${new Date(d.visitaAtiva.dataHoraEntrada).toLocaleString('pt-BR')}
            <br><strong>Motivo:</strong> ${escapeHTML(d.visitaAtiva.motivoVisitaLabel)}
          </div>`;
        mostrarFormSaida();
      } else {
        currentAtendimento = null;
        status.innerHTML = '<div class="alert alert-info"><i class="fas fa-info-circle"></i> Não está em visita.</div>';
        mostrarFormEntrada();
      }
    }
    
    safeGet('alunoInfo').style.display = 'block';
    safeGet('alunoInfo').scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    mostrarToast('Erro ao buscar aluno', 'error');
  }
}

function mostrarFormEntrada() {
  safeGet('formEntrada').style.display = 'block';
  safeGet('formSaida').style.display = 'none';
  safeGet('motivoSelecionado').value = '';
  safeGet('motivoOutros').value = '';
  safeGet('observacoesEntrada').value = '';
  safeGet('campoOutros').style.display = 'none';
  motivoSelecionado = null;
  document.querySelectorAll('#formEntrada .motivo-card').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('#formEntrada .atividades-grid input[type="checkbox"]').forEach(c => c.checked = false);
}

function mostrarFormSaida() {
  safeGet('formEntrada').style.display = 'none';
  safeGet('formSaida').style.display = 'block';
  safeGet('observacoesSaida').value = '';
  safeGet('livrosConsultados').value = '';
  safeGet('computadoresUsados').value = 0;
  safeGet('satisfacao').value = '';
}

function selecionarMotivo(motivo) {
  motivoSelecionado = motivo;
  safeGet('motivoSelecionado').value = motivo;
  document.querySelectorAll('#formEntrada .motivo-card').forEach(c => c.classList.remove('selected'));
  const card = document.querySelector(`#formEntrada .motivo-card[data-motivo="${motivo}"]`);
  if (card) card.classList.add('selected');
  safeGet('campoOutros').style.display = motivo === 'outros' ? 'block' : 'none';
}

// ========== REGISTRAR ENTRADA ==========
async function registrarEntrada() {
  if (!motivoSelecionado) { mostrarToast('Selecione o motivo', 'error'); return; }
  if (motivoSelecionado === 'outros' && !safeGet('motivoOutros').value.trim()) {
    mostrarToast('Especifique o motivo', 'error'); return;
  }
  if (!currentAluno) { mostrarToast('Nenhum aluno', 'error'); return; }
  
  const dataEntrada = safeGet('dataEntrada').value;
  if (!dataEntrada) { mostrarToast('Informe a data de entrada', 'error'); return; }
  
  const atividades = Array.from(document.querySelectorAll('#formEntrada .atividades-grid input:checked')).map(c => c.value);
  
  try {
    const r = await fetch('/api/biblioteca/entrada', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        alunoId: currentAluno.id,
        motivoVisita: motivoSelecionado,
        motivoOutros: safeGet('motivoOutros').value,
        atividades,
        observacoes: safeGet('observacoesEntrada').value,
        dataEntrada: new Date(dataEntrada).toISOString()
      })
    });
    const d = await r.json();
    if (d.success) {
      mostrarToast('✅ ' + d.message, 'success');
      limparTela();
      if (modoAtual === 'automatico') reiniciarScanner();
      carregarAtendimentosAtivos();
    } else {
      mostrarToast('❌ ' + d.error, 'error');
    }
  } catch (e) {
    mostrarToast('Erro ao registrar', 'error');
  }
}

// ========== REGISTRAR SAÍDA ==========
async function registrarSaida() {
  if (!currentAluno) { mostrarToast('Nenhum aluno', 'error'); return; }
  
  try {
    const r = await fetch('/api/biblioteca/saida', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        alunoId: currentAluno.id,
        observacoes: safeGet('observacoesSaida').value,
        livrosConsultados: safeGet('livrosConsultados').value.split(',').map(s => s.trim()).filter(Boolean),
        computadoresUsados: parseInt(safeGet('computadoresUsados').value) || 0,
        satisfacao: safeGet('satisfacao').value || null
      })
    });
    const d = await r.json();
    if (d.success) {
      mostrarToast(`✅ ${d.message} (${d.atendimento.duracaoMinutos} min)`, 'success');
      limparTela();
      if (modoAtual === 'automatico') reiniciarScanner();
      carregarAtendimentosAtivos();
    } else {
      mostrarToast('❌ ' + d.error, 'error');
    }
  } catch (e) {
    mostrarToast('Erro ao registrar', 'error');
  }
}

function limparTela() {
  safeGet('alunoInfo').style.display = 'none';
  safeGet('formEntrada').style.display = 'none';
  safeGet('formSaida').style.display = 'none';
  currentAluno = null;
  currentAtendimento = null;
}

function reiniciarScanner() {
  setTimeout(() => { if (modoAtual === 'automatico') iniciarScannerAutomatico(); }, 1000);
}

// ========== ATIVOS ==========
async function carregarAtendimentosAtivos() {
  const c = safeGet('listaAtendimentosAtivos');
  if (!c) return;
  
  try {
    const r = await fetch('/api/biblioteca/atendimentos-ativos', { headers: { 'Authorization': `Bearer ${token}` } });
    const d = await r.json();
    
    if (d.success && d.atendimentos.length > 0) {
      c.innerHTML = d.atendimentos.map(a => `
        <div class="list-group-item">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div class="d-flex align-items-center gap-3">
              <img src="${a.alunoFoto || gerarAvatarSVG(a.alunoNome)}" 
                   style="width:50px;height:50px;border-radius:50%;object-fit:cover;"
                   onerror="this.onerror=null;this.src='${gerarAvatarSVG(a.alunoNome)}'">
              <div>
                <strong>${escapeHTML(a.alunoNome)}</strong><br>
                <small class="text-muted">${escapeHTML(a.alunoTurma || '-')}</small><br>
                <small class="text-muted"><i class="fas fa-clock"></i> ${a.tempoAtendimento} min</small><br>
                <span class="badge bg-info">${escapeHTML(a.motivoLabel)}</span>
              </div>
            </div>
            <div class="d-flex gap-1 flex-wrap">
              <button class="btn btn-sm btn-warning" onclick="editarAtendimento('${a.id}')"><i class="fas fa-edit"></i></button>
              <button class="btn btn-sm btn-success" onclick="finalizarAtendimentoAtivo('${a.alunoId}')"><i class="fas fa-check"></i></button>
              <button class="btn btn-sm btn-danger" onclick="excluirAtendimento('${a.id}', '${escapeHTML(a.alunoNome)}')"><i class="fas fa-trash"></i></button>
            </div>
          </div>
          ${a.queixa ? `<div class="mt-2 p-2" style="background:#f0f9ff;border-radius:8px;font-size:13px;">${escapeHTML(a.queixa)}</div>` : ''}
        </div>
      `).join('');
    } else {
      c.innerHTML = '<div class="text-center py-5 text-muted"><i class="fas fa-check-circle fa-3x mb-3" style="color:#10b981;"></i><p>Nenhum aluno em visita</p></div>';
    }
  } catch (e) {
    c.innerHTML = '<div class="alert alert-danger">Erro ao carregar</div>';
  }
}

async function finalizarAtendimentoAtivo(alunoId) {
  const r = await fetch(`/api/biblioteca/aluno/${alunoId}`, { headers: { 'Authorization': `Bearer ${token}` } });
  const d = await r.json();
  if (d.success) {
    currentAluno = d.aluno;
    new bootstrap.Tab(safeGet('registro-tab')).show();
    await buscarAluno(alunoId);
  }
}

async function excluirAtendimento(id, nome) {
  if (!confirm(`Excluir atendimento de "${nome}"?`)) return;
  try {
    const r = await fetch(`/api/biblioteca/atendimento/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const d = await r.json();
    if (d.success) {
      mostrarToast('✅ Excluído', 'success');
      carregarAtendimentosAtivos();
    }
  } catch (e) {}
}

async function editarAtendimento(id) {
  mostrarToast('Função de edição em desenvolvimento', 'info');
}

// ========== DASHBOARD ==========
async function carregarDashboard() {
  try {
    const r = await fetch('/api/biblioteca/dashboard', { headers: { 'Authorization': `Bearer ${token}` } });
    const d = await r.json();
    if (!d.success) return;
    
    safeSetText('totalHoje', d.metricas.hoje);
    safeSetText('totalSemana', d.metricas.semana);
    safeSetText('totalMes', d.metricas.mes);
    safeSetText('totalGeral', d.metricas.total);
    
    // Chart Visitas
    const ctxV = safeGet('chartVisitas');
    if (ctxV && d.tendencias.ultimos7Dias) {
      if (dashboardCharts.visitas) try { dashboardCharts.visitas.destroy(); } catch(e){}
      dashboardCharts.visitas = new Chart(ctxV, {
        type: 'bar',
        data: {
          labels: d.tendencias.ultimos7Dias.map(x => x.dia),
          datasets: [{
            label: 'Visitas',
            data: d.tendencias.ultimos7Dias.map(x => x.visitas),
            backgroundColor: '#0ea5e9',
            borderRadius: 8
          }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
      });
    }
    
    // Chart Motivos
    const ctxM = safeGet('chartMotivos');
    if (ctxM && d.tendencias.porMotivo) {
      if (dashboardCharts.motivos) try { dashboardCharts.motivos.destroy(); } catch(e){}
      dashboardCharts.motivos = new Chart(ctxM, {
        type: 'doughnut',
        data: {
          labels: d.tendencias.porMotivo.map(x => x.label),
          datasets: [{
            data: d.tendencias.porMotivo.map(x => x.count),
            backgroundColor: ['#0ea5e9','#10b981','#f59e0b','#8b5cf6','#6b7280']
          }]
        },
        options: { responsive: true }
      });
    }
    
    // Chart Horário
    const ctxH = safeGet('chartHorario');
    if (ctxH && d.tendencias.distribuicaoHoraria) {
      if (dashboardCharts.horario) try { dashboardCharts.horario.destroy(); } catch(e){}
      dashboardCharts.horario = new Chart(ctxH, {
        type: 'line',
        data: {
          labels: Array.from({length:24}, (_,i) => `${i}h`),
          datasets: [{
            label: 'Visitas',
            data: d.tendencias.distribuicaoHoraria,
            borderColor: '#0ea5e9',
            backgroundColor: 'rgba(14,165,233,0.1)',
            fill: true,
            tension: 0.4
          }]
        },
        options: { responsive: true, plugins: { legend: { display: false } } }
      });
    }
    
    // Alunos Frequentes
    const af = safeGet('alunosFrequentes');
    if (af && d.tendencias.alunosFrequentes) {
      if (d.tendencias.alunosFrequentes.length > 0) {
        af.innerHTML = d.tendencias.alunosFrequentes.map(a => `
          <div class="d-flex justify-content-between p-2 mb-2" style="background:#f0f9ff;border-radius:8px;">
            <div>
              <strong>${escapeHTML(a.alunoNome)}</strong><br>
              <small class="text-muted">${escapeHTML(a.alunoTurma || '')}</small>
            </div>
            <span class="badge bg-primary">${a.count} visitas</span>
          </div>
        `).join('');
      } else {
        af.innerHTML = '<p class="text-muted text-center">Sem dados</p>';
      }
    }
  } catch (e) { console.error(e); }
}

// ========== RELATÓRIOS ==========
function toggleRelatorioFiltros() {
  const tipo = safeGet('tipoRelatorio').value;
  safeGet('filtroTurmaDiv').style.display = tipo === 'turma' ? 'block' : 'none';
  safeGet('filtroAlunoDiv').style.display = tipo === 'aluno' ? 'block' : 'none';
  if (tipo === 'aluno') carregarAlunosRelatorio();
}

async function carregarAlunosRelatorio() {
  try {
    const r = await fetch('/api/biblioteca/turmas', { headers: { 'Authorization': `Bearer ${token}` } });
    const d = await r.json();
    if (!d.success) return;
    // Aqui poderíamos carregar todos os alunos — simplificado
    safeGet('filtroAluno').innerHTML = '<option value="">Use o QR Code para buscar</option>';
  } catch (e) {}
}

async function carregarRelatorio() {
  const tipo = safeGet('tipoRelatorio').value;
  const dataInicio = safeGet('dataInicio').value;
  const dataFim = safeGet('dataFim').value;
  let url = '';
  
  if (tipo === 'geral') {
    url = `/api/biblioteca/relatorio/geral?dataInicio=${dataInicio}&dataFim=${dataFim}`;
  } else if (tipo === 'turma') {
    const t = safeGet('filtroTurma').value;
    if (!t) { mostrarToast('Selecione a turma', 'warning'); return; }
    url = `/api/biblioteca/relatorio/turma/${encodeURIComponent(t)}?dataInicio=${dataInicio}&dataFim=${dataFim}`;
  } else if (tipo === 'aluno') {
    const a = safeGet('filtroAluno').value;
    if (!a) { mostrarToast('Selecione o aluno', 'warning'); return; }
    url = `/api/biblioteca/relatorio/aluno/${a}?dataInicio=${dataInicio}&dataFim=${dataFim}`;
  }
  
  try {
    const r = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    const d = await r.json();
    if (d.success) {
      relatorioData = d;
      exibirRelatorio(d, tipo);
    }
  } catch (e) { mostrarToast('Erro ao carregar', 'error'); }
}

function exibirRelatorio(d, tipo) {
  const c = safeGet('resultadoRelatorio');
  
  if (tipo === 'geral') {
    c.innerHTML = `
      <div class="card"><div class="card-body">
        <h5>Relatório Geral</h5>
        <p><strong>Total:</strong> ${d.totalAtendimentos || 0}</p>
        <h6>Por Motivo</h6>
        ${(d.porMotivo || []).map(m => `<div class="d-flex justify-content-between p-2 mb-1" style="background:#f0f9ff;border-radius:6px;"><span>${escapeHTML(m.label)}</span><strong>${m.count}</strong></div>`).join('')}
        <h6 class="mt-3">Por Turma</h6>
        <table class="table table-sm">
          <thead><tr><th>Turma</th><th>Total</th></tr></thead>
          <tbody>${(d.porTurma||[]).map(t => `<tr><td>${escapeHTML(t.turma)}</td><td>${t.total}</td></tr>`).join('')}</tbody>
        </table>
      </div></div>`;
  } else if (tipo === 'turma') {
    c.innerHTML = `
      <div class="card"><div class="card-body">
        <h5>Turma: ${escapeHTML(d.turma)}</h5>
        <p>Total: ${d.estatisticas.totalAtendimentos}</p>
        <table class="table table-sm">
          <thead><tr><th>Aluno</th><th>Total</th></tr></thead>
          <tbody>${(d.porAluno||[]).map(a => `<tr><td>${escapeHTML(a.alunoNome)}</td><td>${a.total}</td></tr>`).join('')}</tbody>
        </table>
      </div></div>`;
  } else {
    c.innerHTML = `
      <div class="card"><div class="card-body">
        <h5>${escapeHTML(d.aluno?.nome || '')}</h5>
        <p>Turma: ${escapeHTML(d.aluno?.turma || '')} | Total: ${d.estatisticas.totalAtendimentos}</p>
        <table class="table table-sm">
          <thead><tr><th>Data</th><th>Motivo</th><th>Duração</th></tr></thead>
          <tbody>${(d.atendimentos||[]).map(a => `
            <tr>
              <td>${new Date(a.dataEntrada).toLocaleString('pt-BR')}</td>
              <td>${escapeHTML(a.motivo)}</td>
              <td>${a.duracao || 0} min</td>
            </tr>`).join('')}</tbody>
        </table>
      </div></div>`;
  }
}

function exportarCSV() {
  if (!relatorioData) { mostrarToast('Gere um relatório primeiro', 'warning'); return; }
  let csv = "Data,Aluno,Turma,Motivo,Duração\n";
  
  const atendimentos = relatorioData.atendimentos || relatorioData.ultimosAtendimentos || [];
  atendimentos.forEach(a => {
    const data = a.dataEntrada || a.entrada?.dataHora;
    csv += `${data ? new Date(data).toLocaleString('pt-BR') : ''},"${a.alunoNome||''}","${a.alunoTurma||''}","${a.motivo||a.motivoLabel||''}","${a.duracao||a.duracaoMinutos||0}"\n`;
  });
  
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `biblioteca_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
}

// ============ EXPORTAR PDF (VERSÃO COMPLETA COM DADOS) ============
function exportarPDF() {
    if (!relatorioData) { 
        mostrarToast('⚠️ Gere um relatório primeiro', 'warning'); 
        return; 
    }
    
    mostrarToast('📄 Gerando PDF...', 'info');
    
    const d = relatorioData;
    const tipo = d.aluno ? 'aluno' : (d.turma ? 'turma' : 'geral');
    
    // ============================================
    // TÍTULO DINÂMICO
    // ============================================
    let titulo = 'Relatório Geral de Atendimentos';
    let subtitulo = '';
    if (tipo === 'turma') {
        titulo = 'Relatório de Atendimentos por Turma';
        subtitulo = `Turma: ${d.turma}`;
    } else if (tipo === 'aluno') {
        titulo = 'Relatório de Atendimentos Individual';
        subtitulo = `${d.aluno?.nome || ''} — ${d.aluno?.turma || ''}`;
    } else {
        subtitulo = 'Relatório Geral';
    }
    
    const dataGeracao = new Date().toLocaleString('pt-BR');
    const logoIema = '/uploads/logo-iema.png';
    
    // ============================================
    // ESTATÍSTICAS
    // ============================================
    let statsHTML = '';
    if (tipo === 'geral') {
        statsHTML = `
            <div class="stats">
                <div class="stat">
                    <div class="stat-value">${d.totalAtendimentos || 0}</div>
                    <div class="stat-label">Total de Atendimentos</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${(d.porTurma || []).length}</div>
                    <div class="stat-label">Turmas com Registro</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${(d.porMotivo || []).length}</div>
                    <div class="stat-label">Motivos Diferentes</div>
                </div>
            </div>
        `;
    } else if (tipo === 'turma') {
        statsHTML = `
            <div class="stats">
                <div class="stat">
                    <div class="stat-value">${d.estatisticas?.totalAtendimentos || 0}</div>
                    <div class="stat-label">Total de Atendimentos</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${d.estatisticas?.totalAlunosAtendidos || 0}</div>
                    <div class="stat-label">Alunos Atendidos</div>
                </div>
            </div>
        `;
    } else if (tipo === 'aluno') {
        statsHTML = `
            <div class="stats">
                <div class="stat">
                    <div class="stat-value">${d.estatisticas?.totalAtendimentos || 0}</div>
                    <div class="stat-label">Total de Atendimentos</div>
                </div>
                <div class="stat">
                    <div class="stat-value">${(d.porMotivo || []).length}</div>
                    <div class="stat-label">Motivos Diferentes</div>
                </div>
            </div>
        `;
    }
    
    // ============================================
    // TABELAS COM DADOS
    // ============================================
    let tabelaHTML = '';
    
    // ---- RELATÓRIO GERAL ----
    if (tipo === 'geral') {
        tabelaHTML = `
            <div class="section-title">📊 Distribuição por Motivo</div>
            <table>
                <thead>
                    <tr>
                        <th>Motivo</th>
                        <th style="width:120px;text-align:center;">Quantidade</th>
                    </tr>
                </thead>
                <tbody>
                    ${(d.porMotivo || []).length > 0 
                        ? (d.porMotivo || []).map(m => `
                            <tr>
                                <td><strong>${escapeHTML(m.label || '')}</strong></td>
                                <td style="text-align:center;">${m.count || 0}</td>
                            </tr>
                        `).join('') 
                        : '<tr><td colspan="2" style="text-align:center;">Nenhum dado disponível</td></tr>'}
                </tbody>
            </table>
            
            <div class="section-title">🏫 Distribuição por Turma</div>
            <table>
                <thead>
                    <tr>
                        <th>Turma</th>
                        <th style="width:120px;text-align:center;">Total</th>
                        <th style="width:120px;text-align:center;">Alunos</th>
                    </tr>
                </thead>
                <tbody>
                    ${(d.porTurma || []).length > 0 
                        ? (d.porTurma || []).map(t => `
                            <tr>
                                <td><strong>${escapeHTML(t.turma || '')}</strong></td>
                                <td style="text-align:center;">${t.total || 0}</td>
                                <td style="text-align:center;">${t.totalAlunos || 0}</td>
                            </tr>
                        `).join('') 
                        : '<tr><td colspan="3" style="text-align:center;">Nenhum dado disponível</td></tr>'}
                </tbody>
            </table>
            
            <div class="section-title">📋 Últimos Atendimentos</div>
            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Aluno</th>
                        <th>Turma</th>
                        <th>Motivo</th>
                        <th style="width:90px;text-align:center;">Duração</th>
                    </tr>
                </thead>
                <tbody>
                    ${(d.ultimosAtendimentos || []).length > 0 
                        ? (d.ultimosAtendimentos || []).map(a => `
                            <tr>
                                <td>${new Date(a.dataEntrada).toLocaleString('pt-BR')}</td>
                                <td><strong>${escapeHTML(a.alunoNome || '')}</strong></td>
                                <td>${escapeHTML(a.alunoTurma || '')}</td>
                                <td>${escapeHTML(a.motivoLabel || '')}</td>
                                <td style="text-align:center;">${a.duracao || 0} min</td>
                            </tr>
                        `).join('') 
                        : '<tr><td colspan="5" style="text-align:center;">Nenhum atendimento registrado</td></tr>'}
                </tbody>
            </table>
        `;
    }
    
    // ---- RELATÓRIO POR TURMA ----
    else if (tipo === 'turma') {
        tabelaHTML = `
            <div class="section-title">👥 Atendimentos por Aluno</div>
            <table>
                <thead>
                    <tr>
                        <th>Aluno</th>
                        <th>Matrícula</th>
                        <th style="width:100px;text-align:center;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${(d.porAluno || []).length > 0 
                        ? (d.porAluno || []).map(a => `
                            <tr>
                                <td><strong>${escapeHTML(a.alunoNome || '')}</strong></td>
                                <td>${escapeHTML(a.alunoMatricula || '-')}</td>
                                <td style="text-align:center;">${a.total || 0}</td>
                            </tr>
                        `).join('') 
                        : '<tr><td colspan="3" style="text-align:center;">Nenhum dado</td></tr>'}
                </tbody>
            </table>
            
            <div class="section-title">📋 Últimos Atendimentos</div>
            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Aluno</th>
                        <th>Motivo</th>
                        <th style="width:90px;text-align:center;">Duração</th>
                    </tr>
                </thead>
                <tbody>
                    ${(d.ultimosAtendimentos || []).length > 0 
                        ? (d.ultimosAtendimentos || []).map(a => `
                            <tr>
                                <td>${new Date(a.dataEntrada).toLocaleString('pt-BR')}</td>
                                <td><strong>${escapeHTML(a.alunoNome || '')}</strong></td>
                                <td>${escapeHTML(a.motivo || '')}</td>
                                <td style="text-align:center;">${a.duracao || 0} min</td>
                            </tr>
                        `).join('') 
                        : '<tr><td colspan="4" style="text-align:center;">Nenhum atendimento</td></tr>'}
                </tbody>
            </table>
        `;
    }
    
    // ---- RELATÓRIO POR ALUNO ----
    else if (tipo === 'aluno') {
        tabelaHTML = `
            <div class="section-title">📊 Distribuição por Motivo</div>
            <table>
                <thead>
                    <tr>
                        <th>Motivo</th>
                        <th style="width:120px;text-align:center;">Quantidade</th>
                    </tr>
                </thead>
                <tbody>
                    ${(d.porMotivo || []).length > 0 
                        ? (d.porMotivo || []).map(m => `
                            <tr>
                                <td><strong>${escapeHTML(m.label || '')}</strong></td>
                                <td style="text-align:center;">${m.count || 0}</td>
                            </tr>
                        `).join('') 
                        : '<tr><td colspan="2" style="text-align:center;">Nenhum dado</td></tr>'}
                </tbody>
            </table>
            
            <div class="section-title">📋 Histórico de Atendimentos</div>
            <table>
                <thead>
                    <tr>
                        <th>Data Entrada</th>
                        <th>Data Saída</th>
                        <th>Motivo</th>
                        <th>Atividades</th>
                        <th style="width:80px;text-align:center;">Duração</th>
                    </tr>
                </thead>
                <tbody>
                    ${(d.atendimentos || []).length > 0 
                        ? (d.atendimentos || []).map(a => `
                            <tr>
                                <td>${new Date(a.dataEntrada).toLocaleString('pt-BR')}</td>
                                <td>${a.dataSaida ? new Date(a.dataSaida).toLocaleString('pt-BR') : '-'}</td>
                                <td>${escapeHTML(a.motivo || '')}</td>
                                <td>${escapeHTML((a.atividades || []).join(', '))}</td>
                                <td style="text-align:center;">${a.duracao || 0} min</td>
                            </tr>
                        `).join('') 
                        : '<tr><td colspan="5" style="text-align:center;">Nenhum atendimento</td></tr>'}
                </tbody>
            </table>
        `;
    }
    
    // ============================================
    // MONTAR HTML FINAL
    // ============================================
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>${titulo}</title>
        <style>
            @page { size: A4 portrait; margin: 12mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.4; color: #000; }
            
            .header { text-align: center; border-bottom: 2px double #000; padding-bottom: 10px; margin-bottom: 15px; }
            .header img { max-width: 100%; max-height: 25mm; object-fit: contain; display: block; margin: 0 auto 5px; }
            .header h1 { font-size: 13pt; text-transform: uppercase; font-weight: bold; margin: 5px 0 0; }
            
            .titulo { 
                text-align: center; 
                font-size: 14pt; 
                font-weight: bold; 
                background: #e0f2fe; 
                padding: 10px; 
                border: 2px solid #000; 
                margin: 15px 0; 
                text-transform: uppercase; 
                letter-spacing: 1px; 
            }
            .subtitulo { text-align: center; font-size: 12pt; margin: -10px 0 15px; font-style: italic; }
            
            .stats { 
                display: flex; 
                gap: 15px; 
                margin: 15px 0 20px; 
                padding: 15px; 
                background: #f0f9ff; 
                border-radius: 8px; 
                border: 1px solid #bae6fd; 
            }
            .stat { text-align: center; flex: 1; border-right: 1px solid #bae6fd; }
            .stat:last-child { border-right: none; }
            .stat-value { font-size: 22pt; font-weight: bold; color: #0ea5e9; line-height: 1; }
            .stat-label { font-size: 9pt; color: #666; margin-top: 5px; }
            
            .section-title { 
                font-size: 11pt; 
                font-weight: bold; 
                background: #e8e8e8; 
                padding: 6px 10px; 
                border-left: 4px solid #0ea5e9; 
                margin: 20px 0 10px; 
            }
            
            table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 15px; }
            th { 
                background: #0ea5e9; 
                color: white; 
                padding: 8px 6px; 
                text-align: left; 
                border: 1px solid #0284c7; 
                font-size: 9pt; 
            }
            td { padding: 6px; border: 1px solid #ddd; vertical-align: top; }
            tr:nth-child(even) { background: #f9fafb; }
            
            .assinaturas { display: flex; justify-content: space-around; margin-top: 50px; gap: 40px; }
            .assinatura { flex: 1; text-align: center; }
            .assinatura-linha { border-top: 1px solid #000; padding-top: 5px; font-size: 10pt; }
            
            .footer { 
                text-align: center; 
                margin-top: 30px; 
                padding-top: 10px; 
                border-top: 1px solid #ccc; 
                font-size: 8pt; 
                color: #666; 
            }
            .footer p { margin: 2px 0; }
            
            .btn-print { 
                display: block; 
                margin: 20px auto; 
                padding: 12px 30px; 
                background: #0ea5e9; 
                color: white; 
                border: none; 
                border-radius: 8px; 
                font-weight: bold; 
                cursor: pointer; 
                font-size: 14px; 
                font-family: Arial, sans-serif; 
            }
            .btn-print:hover { background: #0284c7; }
            
            @media print { 
                .no-print { display: none !important; } 
                body { padding: 0; } 
            }
        </style>
    </head>
    <body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
        
        <div class="header">
            <img src="${logoIema}" alt="IEMA" onerror="this.style.display='none'">
            <h1>IEMA Pleno: São Luís - Centro</h1>
            <p style="font-size: 10pt; margin: 5px 0 0;">Sistema de Atendimentos — Biblioteca</p>
        </div>
        
        <div class="titulo">📚 ${titulo}</div>
        ${subtitulo ? `<div class="subtitulo">${escapeHTML(subtitulo)}</div>` : ''}
        
        ${statsHTML}
        ${tabelaHTML}
        
        <div class="assinaturas">
            <div class="assinatura">
                <div class="assinatura-linha">Biblioteca</div>
            </div>
            <div class="assinatura">
                <div class="assinatura-linha">Coordenação / Gestão</div>
            </div>
        </div>
        
        <div class="footer">
            <p>Relatório gerado em <strong>${dataGeracao}</strong></p>
            <p>EducaPleno — Sistema de Atendimentos Biblioteca</p>
        </div>
    </body>
    </html>`);
    win.document.close();
    win.onload = () => setTimeout(() => win.print(), 500);
}

// ========== IMPRIMIR ATIVOS ==========
async function imprimirAtendimentosAtivos() {
  try {
    const r = await fetch('/api/biblioteca/atendimentos-ativos', { headers: { 'Authorization': `Bearer ${token}` } });
    const d = await r.json();
    if (!d.success || d.atendimentos.length === 0) {
      mostrarToast('Nenhum aluno em visita', 'warning'); return;
    }
    
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Alunos em Visita</title>
      <style>
        @page { size: A4; margin: 12mm; }
        body { font-family: 'Times New Roman', serif; }
        .header { text-align: center; border-bottom: 2px double #000; padding-bottom: 10px; margin-bottom: 15px; }
        .header h1 { font-size: 13pt; text-transform: uppercase; }
        .titulo { text-align: center; font-size: 14pt; background: #fef3c7; padding: 10px; border: 2px solid #000; margin: 15px 0; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; font-size: 10pt; }
        th { background: #f59e0b; color: white; padding: 8px; text-align: left; border: 1px solid #d97706; }
        td { padding: 8px; border: 1px solid #ddd; }
        .btn-print { display: block; margin: 20px auto; padding: 12px 30px; background: #059669; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; }
        @media print { .btn-print { display: none; } }
      </style></head><body>
      <button class="btn-print" onclick="window.print()">🖨️ Imprimir</button>
      <div class="header"><h1>IEMA Pleno: São Luís - Centro</h1><p>Biblioteca</p></div>
      <div class="titulo">⏳ Alunos em Visita — ${new Date().toLocaleDateString('pt-BR')}</div>
      <table>
        <thead><tr><th>#</th><th>Aluno</th><th>Turma</th><th>Motivo</th><th>Tempo</th></tr></thead>
        <tbody>${d.atendimentos.map((a,i) => `
          <tr>
            <td>${i+1}</td>
            <td><strong>${escapeHTML(a.alunoNome)}</strong></td>
            <td>${escapeHTML(a.alunoTurma||'')}</td>
            <td>${escapeHTML(a.motivoLabel)}</td>
            <td>${a.tempoAtendimento} min</td>
          </tr>`).join('')}</tbody>
      </table>
      </body></html>`);
    win.document.close();
    win.onload = () => setTimeout(() => win.print(), 500);
  } catch (e) {}
}

// ========== QR CODE ==========
function abrirModalQRCode() {
  const url = window.location.origin + '/biblioteca-publico.html';
  safeGet('qrCodeUrlTexto').textContent = url;
  safeGet('qrCodeImg').src = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=10&data=${encodeURIComponent(url)}`;
  modalQRCode.show();
}

function baixarQRCode() {
  const url = window.location.origin + '/biblioteca-publico.html';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&margin=20&data=${encodeURIComponent(url)}`;
  window.open(qrUrl, '_blank');
}

function imprimirQRCode() {
  const url = window.location.origin + '/biblioteca-publico.html';
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=20&data=${encodeURIComponent(url)}`;
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>QR Code Biblioteca</title>
    <style>body { display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; font-family: Arial; }
    .card { text-align: center; padding: 40px; border: 4px dashed #0ea5e9; border-radius: 30px; }
    h1 { color: #0284c7; font-size: 32px; } img { max-width: 400px; margin: 20px 0; }
    p { color: #666; font-size: 16px; }</style></head><body>
    <div class="card">
      <h1>📚 Biblioteca Laura Rosa</h1>
      <p>Escaneie o QR Code para registrar sua visita</p>
      <img src="${qrUrl}">
      <p>EducaPleno • 2026</p>
    </div></body></html>`);
  win.document.close();
  win.onload = () => setTimeout(() => win.print(), 500);
}

// ========== NOTIFICAÇÕES ==========
function abrirNotificacoes() {
  const d = safeGet('notificacoesDropdown');
  d.style.display = d.style.display === 'block' ? 'none' : 'block';
  if (d.style.display === 'block') carregarNotificacoes();
}
function fecharNotificacoes() { safeGet('notificacoesDropdown').style.display = 'none'; }

async function carregarNotificacoes() {
  try {
    const r = await fetch('/api/notificacoes?limite=20', { headers: { 'Authorization': `Bearer ${token}` } });
    const d = await r.json();
    const c = safeGet('notificacoesLista');
    if (d.success && d.notificacoes?.length > 0) {
      c.innerHTML = d.notificacoes.map(n => `<div style="padding:12px;border-bottom:1px solid #eee;"><strong>${escapeHTML(n.titulo||'')}</strong><br><small>${escapeHTML(n.mensagem||'')}</small></div>`).join('');
    } else {
      c.innerHTML = '<div style="padding:30px;text-align:center;color:#999;">Sem notificações</div>';
    }
  } catch (e) {}
}

// ========== LOGOUT ==========
async function logout() {
  if (confirm('Deseja sair do sistema?')) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    window.location.href = '/login.html';
  }
}

// ========== EXPORTAR ==========
window.setModo = setModo;
window.selecionarMotivo = selecionarMotivo;
window.registrarEntrada = registrarEntrada;
window.registrarSaida = registrarSaida;
window.limparTela = limparTela;
window.carregarRelatorio = carregarRelatorio;
window.toggleRelatorioFiltros = toggleRelatorioFiltros;
window.exportarCSV = exportarCSV;
window.exportarPDF = exportarPDF;
window.editarAtendimento = editarAtendimento;
window.excluirAtendimento = excluirAtendimento;
window.finalizarAtendimentoAtivo = finalizarAtendimentoAtivo;
window.imprimirAtendimentosAtivos = imprimirAtendimentosAtivos;
window.abrirModalQRCode = abrirModalQRCode;
window.baixarQRCode = baixarQRCode;
window.imprimirQRCode = imprimirQRCode;
window.abrirNotificacoes = abrirNotificacoes;
window.fecharNotificacoes = fecharNotificacoes;
window.logout = logout;