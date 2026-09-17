// ============================================
// ACOMPANHAMENTO COMPARTILHADO - FRONTEND
// ============================================
(function() {
  let __acompAlunosBrutos = [];
  let __acompFiltroSetor = null;

  // ====== CARREGAR TUDO ======
  async function carregarAcompanhamento() {
    const turma = document.getElementById('acompFiltroTurma')?.value || '';
    const dataInicio = document.getElementById('acompDataInicio')?.value || '';
    const dataFim = document.getElementById('acompDataFim')?.value || '';
    const busca = document.getElementById('acompBusca')?.value || '';

    const params = new URLSearchParams();
    if (turma) params.append('turma', turma);
    if (dataInicio) params.append('dataInicio', dataInicio);
    if (dataFim) params.append('dataFim', dataFim);
    if (busca) params.append('busca', busca);

    const container = document.getElementById('acompListaAlunos');
    container.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-primary" role="status"></div>
        <p class="text-muted mt-3">Carregando...</p>
      </div>`;

    try {
      const token = localStorage.getItem('auth_token');
      const [resumoRes, alunosRes] = await Promise.all([
        fetch('/api/acompanhamento-compartilhado/resumo-dia', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/acompanhamento-compartilhado/alunos?${params.toString()}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      const resumoData = await resumoRes.json();
      const alunosData = await alunosRes.json();

      if (resumoData.success) renderizarResumoDia(resumoData.resumo);
      if (alunosData.success) {
        __acompAlunosBrutos = alunosData.alunos;
        renderizarLista(__acompAlunosBrutos);
      }
    } catch (error) {
      console.error('Erro:', error);
      container.innerHTML = `
        <div class="alert alert-danger">
          <i class="fas fa-exclamation-triangle"></i> Erro ao carregar acompanhamento.
        </div>`;
    }
  }

  // ====== RENDER RESUMO DO DIA ======
  function renderizarResumoDia(resumo) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    const setMotivos = (id, arr) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!arr || arr.length === 0) { el.textContent = 'Nenhum registro'; return; }
      el.textContent = arr.map(m => `${m.label} (${m.count})`).join(' • ');
    };

    set('resumoGestaoTotal', resumo.gestao.total);
    set('resumoASTotal', resumo.assistente_social.total);
    set('resumoPsicoTotal', resumo.psicologia.total);
    set('resumoSupervisaoTotal', resumo.supervisao.total);

    setMotivos('resumoGestaoMotivos', resumo.gestao.motivos);
    setMotivos('resumoASTipos', resumo.assistente_social.tipos);
    setMotivos('resumoPsicoTipos', resumo.psicologia.tipos);
    setMotivos('resumoSupervisaoMotivos', resumo.supervisao.motivos);
  }

  // ====== RENDER LISTA DE ALUNOS ======
  function renderizarLista(alunos) {
    const container = document.getElementById('acompListaAlunos');
    if (!container) return;

    // Filtro por setor (ao clicar nos cards do topo)
    let lista = alunos;
    if (__acompFiltroSetor) {
      lista = alunos.filter(a => (a[__acompFiltroSetor]?.total || 0) > 0);
    }

    if (lista.length === 0) {
      container.innerHTML = `
        <div class="text-center py-5 text-muted">
          <i class="fas fa-search fa-3x mb-3" style="color:#cbd5e1;"></i>
          <p>Nenhum aluno encontrado com os filtros aplicados.</p>
        </div>`;
      return;
    }

    container.innerHTML = lista.map(a => `
      <div class="card-acompanhamento-aluno mb-3" onclick="abrirDetalheAluno('${a.alunoId}')">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
          <div class="d-flex align-items-center gap-3">
            <div class="avatar-acomp">${(a.alunoNome || '?').charAt(0).toUpperCase()}</div>
            <div>
              <h6 class="mb-0">${escapeHTML(a.alunoNome)}</h6>
              <small class="text-muted">
                <i class="fas fa-id-card"></i> ${escapeHTML(a.alunoMatricula || 'Sem matrícula')}
                • <i class="fas fa-graduation-cap"></i> ${escapeHTML(a.alunoTurma || 'Sem turma')}
                ${a.alunoCurso ? ` • ${escapeHTML(a.alunoCurso)}` : ''}
              </small>
            </div>
          </div>
          <div class="total-badge">
            <span class="total-num">${a.totalGeral}</span>
            <small>ocorrências</small>
          </div>
        </div>

        <div class="setores-grid mt-3">
          ${renderSetorCard('gestao', a.gestao, 'clock', 'Gestão', 'motivos')}
          ${renderSetorCard('assistente_social', a.assistente_social, 'hands-helping', 'Assist. Social', 'tipos')}
          ${renderSetorCard('psicologia', a.psicologia, 'brain', 'Psicologia', 'tipos')}
          ${renderSetorCard('supervisao', a.supervisao, 'shield-alt', 'Supervisão', 'motivos')}
        </div>
      </div>
    `).join('');
  }

  function renderSetorCard(setorKey, data, icon, label, campoMotivos) {
    const total = data?.total || 0;
    const motivosObj = data?.[campoMotivos] || {};
    const motivosArr = Object.entries(motivosObj)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (total === 0) {
      return `
        <div class="setor-card setor-${setorKey} vazio">
          <div class="setor-icon"><i class="fas fa-${icon}"></i></div>
          <div class="setor-info">
            <span class="setor-label">${label}</span>
            <span class="setor-total">0</span>
          </div>
        </div>`;
    }

    return `
      <div class="setor-card setor-${setorKey}">
        <div class="setor-icon"><i class="fas fa-${icon}"></i></div>
        <div class="setor-info">
          <span class="setor-label">${label}</span>
          <span class="setor-total">${total}</span>
          <div class="setor-motivos">
            ${motivosArr.map(([m, c]) => `<span class="motivo-tag">${escapeHTML(m)}: ${c}</span>`).join('')}
          </div>
        </div>
      </div>`;
  }

  // ====== DETALHE DO ALUNO (MODAL) ======
  async function abrirDetalheAluno(alunoId) {
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`/api/acompanhamento-compartilhado/aluno/${alunoId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (!data.success) { alert('Erro ao carregar'); return; }

      const a = data.aluno;
      const old = document.getElementById('modalDetalheAcomp');
      if (old) old.remove();

      const modalHtml = `
        <div class="modal fade" id="modalDetalheAcomp" tabindex="-1">
          <div class="modal-dialog modal-xl modal-dialog-scrollable">
            <div class="modal-content">
              <div class="modal-header bg-primary text-white">
                <h5 class="modal-title"><i class="fas fa-user-graduate"></i> ${escapeHTML(a.alunoNome)}</h5>
                <button class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <div class="mb-3 p-3 bg-light rounded">
                  <small><strong>Matrícula:</strong> ${escapeHTML(a.alunoMatricula || '-')} •
                  <strong>Turma:</strong> ${escapeHTML(a.alunoTurma)} •
                  <strong>Curso:</strong> ${escapeHTML(a.alunoCurso)}</small>
                </div>

                ${renderSecaoDetalhe('Gestão (Atrasos)', 'clock', 'gestao', a.gestao, 'motivos')}
                ${renderSecaoDetalhe('Assistente Social', 'hands-helping', 'assistente_social', a.assistente_social, 'tipos')}
                ${renderSecaoDetalhe('Psicologia', 'brain', 'psicologia', a.psicologia, 'tipos')}
                ${renderSecaoDetalhe('Supervisão', 'shield-alt', 'supervisao', a.supervisao, 'motivos')}
              </div>
            </div>
          </div>
        </div>`;

      document.body.insertAdjacentHTML('beforeend', modalHtml);
      new bootstrap.Modal(document.getElementById('modalDetalheAcomp')).show();
    } catch (e) {
      console.error(e);
      alert('Erro ao carregar detalhes');
    }
  }

function renderSecaoDetalhe(titulo, icon, setorKey, data, campoMotivos) {
    const total = data?.total || 0;
    if (total === 0) {
        return `
            <div class="secao-detalhe vazia mb-3">
                <h6><i class="fas fa-${icon}"></i> ${titulo} <span class="badge bg-secondary">0</span></h6>
                <p class="text-muted small mb-0">Nenhum registro</p>
            </div>`;
    }

    const registros = data.registros || [];
    const labelColuna = setorKey === 'gestao' ? 'Motivo' : 'Tipo';

    return `
      <div class="secao-detalhe mb-3">
        <h6><i class="fas fa-${icon}"></i> ${titulo} <span class="badge bg-primary">${total}</span></h6>
        <div class="table-responsive">
          <table class="table table-sm">
            <thead>
              <tr>
                <th>Data</th>
                <th>${labelColuna}</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${registros.slice(0, 20).map(r => `
                <tr>
                  <td>${r.data ? new Date(r.data).toLocaleString('pt-BR') : '-'}</td>
                  <td>${escapeHTML(r.motivoLabel || r.tipoTarefaLabel || '-')}</td>
                  <td>${r.status ? `<span class="badge bg-info">${escapeHTML(r.status)}</span>` : '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${registros.length > 20 ? `<small class="text-muted">Mostrando 20 de ${registros.length} registros</small>` : ''}
        </div>
      </div>`;
}

  // ====== FILTRO POR SETOR (cards topo) ======
  function filtrarPorSetor(setor) {
    __acompFiltroSetor = (__acompFiltroSetor === setor) ? null : setor;
    renderizarLista(__acompAlunosBrutos);
  }

  // ====== LIMPAR FILTROS ======
  function limparFiltrosAcompanhamento() {
    ['acompFiltroTurma', 'acompDataInicio', 'acompDataFim', 'acompBusca'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    __acompFiltroSetor = null;
    carregarAcompanhamento();
  }

  // ====== CARREGAR TURMAS ======
  async function carregarTurmasAcompanhamento() {
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch('/api/acompanhamento-compartilhado/turmas', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.turmas)) {
        const sel = document.getElementById('acompFiltroTurma');
        if (sel) {
          sel.innerHTML = '<option value="">Todas as turmas</option>';
          data.turmas.forEach(t => {
            sel.innerHTML += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`;
          });
        }
      }
    } catch (e) { console.error(e); }
  }

  // ====== UTIL ======
  function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ====== EXPOR GLOBAIS ======
  window.carregarAcompanhamento = carregarAcompanhamento;
  window.filtrarPorSetor = filtrarPorSetor;
  window.limparFiltrosAcompanhamento = limparFiltrosAcompanhamento;
  window.abrirDetalheAluno = abrirDetalheAluno;
  window.carregarTurmasAcompanhamento = carregarTurmasAcompanhamento;

  // ====== AUTO-INIT quando a aba é aberta ======
  document.addEventListener('DOMContentLoaded', () => {
    const aba = document.getElementById('acompanhamento-tab') || document.getElementById('acompanhamentoCompartilhado-tab');
    if (aba) {
      aba.addEventListener('shown.bs.tab', () => {
        carregarTurmasAcompanhamento();
        carregarAcompanhamento();
      });
    }
  });
})();