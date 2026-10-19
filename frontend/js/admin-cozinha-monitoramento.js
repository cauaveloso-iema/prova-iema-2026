// ============================================================================
// ADMIN COZINHA - MONITORAMENTO EM TEMPO REAL
// Versão completa com filtros por período (hoje/ontem/semana/mês/ano/todos),
// paginação de registros e feedbacks, edição/impressão/exclusão.
// ============================================================================

class MonitoramentoTempoReal {
  constructor() {
    this.eventSource = null;
    this.dados = null;
    this.atualizacaoTimer = null;
    this.graficos = {};
    this.todosFeedbacks = [];
    this.feedbacksFiltrados = [];
    this.paginaCarregada = false;
    this.todasTurmasBanco = [];

    this.ultimosRegistrosOriginais = [];
    this.refeicoesPorTurmaOriginais = [];

    this.filtroRegistroData = 'semana';
    this.filtroTurmasData = 'semana';
    this.filtroRegistroRefeicao = 'todas';

    this.filtroTurmasData = 'hoje';
    this.filtroTurmasTurma = 'todas';
    this.filtroTurmasTurno = 'todas';

    // Paginação: Registros
    this.paginaRegistros = 1;
    this.itensPorPaginaRegistros = 10;
    this.registrosFiltrados = [];

    // Paginação: Feedbacks
    this.paginaFeedbacks = 1;
    this.itensPorPaginaFeedbacks = 10;

    this.carregando = false;
    this.cacheDados = new Map();
  }

  async carregar() {
    this.paginaCarregada = true;
    this.carregarFiltrosSalvos();
    this.renderizarEsqueleto();
    await this.buscarTodasTurmasDoBanco();
    await this.carregarDadosCompleto(false);
    await this.carregarFeedbacksCompleto();
    this.iniciarEventosSSE();
    this.iniciarAtualizacaoAutomatica();
  }

  async buscarTodasTurmasDoBanco() {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/admin/usuarios?role=aluno&limit=2000', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.usuarios) {
          const turmasSet = new Set();
          data.usuarios.forEach(aluno => {
            if (aluno.turma && aluno.turma.trim() !== '') turmasSet.add(aluno.turma.trim());
          });
          this.todasTurmasBanco = Array.from(turmasSet).sort();
        }
      }
    } catch (error) {}
  }

  renderizarEsqueleto() {
    const container = document.getElementById('contentArea');
    if (!container) return;
    container.innerHTML = `
      <div class="monitoramento-dashboard">
        <div class="mon-dash-header">
          <div class="mon-header-title">
            <i class="fas fa-chart-line mon-header-icon"></i>
            <div><h1>Monitoramento em Tempo Real</h1><p>Carregando...</p></div>
          </div>
        </div>
        <div style="text-align: center; padding: 60px; background: white; border-radius: 20px;">
          <div style="width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #1e3c72; border-radius: 50%; margin: 0 auto 20px; animation: spin 1s linear infinite;"></div>
          <p style="color: #64748b;">Sincronizando...</p>
        </div>
      </div>
      <style>@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
    `;
  }

  salvarFiltros() {
    try {
      localStorage.setItem('monitoramento_filtros', JSON.stringify({
        registroData: this.filtroRegistroData,
        registroTurma: this.filtroRegistroTurma,
        registroTipo: this.filtroRegistroRefeicao,
        turmasData: this.filtroTurmasData,
        turmasTurma: this.filtroTurmasTurma,
        turmasTurno: this.filtroTurmasTurno
      }));
    } catch (e) {}
  }

  carregarFiltrosSalvos() {
    const salvos = localStorage.getItem('monitoramento_filtros');
    if (!salvos) return;
    try {
      const f = JSON.parse(salvos);
      this.filtroRegistroData = f.registroData || 'hoje';
      this.filtroRegistroTurma = f.registroTurma || 'todas';
      this.filtroRegistroRefeicao = f.registroTipo || 'todas';
      this.filtroTurmasData = f.turmasData || 'hoje';
      this.filtroTurmasTurma = f.turmasTurma || 'todas';
      this.filtroTurmasTurno = f.turmasTurno || 'todas';
    } catch (e) {}
  }

  aplicarFiltrosSalvosNosSelects() {
    const aplicar = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    aplicar('filtroRegistroData', this.filtroRegistroData);
    aplicar('filtroRegistroTurma', this.filtroRegistroTurma);
    aplicar('filtroRegistroTipo', this.filtroRegistroRefeicao);
    aplicar('filtroTurmasRefeicaoData', this.filtroTurmasData);
    aplicar('filtroTurmasRefeicaoTurma', this.filtroTurmasTurma);
    aplicar('filtroTurmasRefeicaoTurno', this.filtroTurmasTurno);
  }

  // ============================================================
  // 🆕 CONVERSÃO DE PERÍODO → FILTRO DE API
  // ============================================================
  getFiltroPeriodo(periodo) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const iso = (d) => d.toISOString().split('T')[0];

    switch (periodo) {
      case 'hoje':
        return { data: iso(hoje) };
      case 'ontem': {
        const d = new Date(hoje); d.setDate(d.getDate() - 1);
        return { data: iso(d) };
      }
      case 'semana': {
        const d = new Date(hoje); d.setDate(d.getDate() - 7);
        return { dataInicio: iso(d), dataFim: iso(hoje) };
      }
      case 'mes': {
        const d = new Date(hoje); d.setMonth(d.getMonth() - 1);
        return { dataInicio: iso(d), dataFim: iso(hoje) };
      }
      case 'ano': {
        const d = new Date(hoje); d.setFullYear(d.getFullYear() - 1);
        return { dataInicio: iso(d), dataFim: iso(hoje) };
      }
      case 'todos':
        return { todos: 'true' };
      default:
        return { data: iso(hoje) };
    }
  }

  escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  escapeJs(text) {
    if (!text) return '';
    return String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
  }

  gerarEstrelasMini(nota) {
    const cheias = Math.floor(nota);
    let html = '';
    for (let i = 0; i < cheias; i++) html += '<i class="fas fa-star text-warning"></i>';
    for (let i = cheias; i < 5; i++) html += '<i class="far fa-star text-warning"></i>';
    return html;
  }

  showToastMessage(msg, tipo = 'info') {
    if (typeof admin !== 'undefined' && admin.showToast) { admin.showToast(msg, tipo); return; }
    alert(msg);
  }

  // ============================================================
  // 🆕 CARREGAMENTO — usa intervalo/todos conforme período
  // ============================================================
  async carregarDadosCompleto(usarCache = true) {
    if (this.carregando) return;
    this.carregando = true;
    try {
      const token = localStorage.getItem('auth_token');
      const filtro = this.getFiltroPeriodo(this.filtroRegistroData);

      const cacheKey = JSON.stringify(filtro);
      if (usarCache && this.cacheDados.has(cacheKey)) {
        this.dados = this.cacheDados.get(cacheKey);
        this.processarDadosAposCarregamento();
        return;
      }

      const qs = new URLSearchParams(filtro).toString();
      const url = '/api/cozinha-monitoramento/dashboard' + (qs ? `?${qs}` : '');

      const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      if (data.success) {
        this.cacheDados.set(cacheKey, data);
        if (this.cacheDados.size > 8) this.cacheDados.delete(this.cacheDados.keys().next().value);
        this.dados = data;
        this.processarDadosAposCarregamento();
      } else {
        this.renderizarErro(data.error || 'Erro');
      }
    } catch (error) {
      this.renderizarErro(error.message);
    } finally {
      this.carregando = false;
    }
  }

  processarDadosAposCarregamento() {
    if (!this.dados) return;
    this.ultimosRegistrosOriginais = [...(this.dados.cozinha?.ultimosRegistros || [])];
    this.refeicoesPorTurmaOriginais = [...(this.dados.cozinha?.refeicoesPorTurma || [])];
    this.renderizar(this.dados);
    this.atualizarTimestamp(this.dados.timestamp);
    setTimeout(() => {
      this.popularFiltrosTurmas();
      this.aplicarFiltrosSalvosNosSelects();
      this.configurarEventosFiltros();
      this.filtrarRegistrosAtuais(this.filtroRegistroTurma, this.filtroRegistroRefeicao);
      this.filtrarRefeicoesTurmasAtuais(this.filtroTurmasTurma, this.filtroTurmasTurno);
    }, 100);
  }

  popularFiltrosTurmas() {
    const turmasComRegistros = new Set([
      ...this.ultimosRegistrosOriginais.map(r => r.alunoTurma).filter(Boolean),
      ...this.refeicoesPorTurmaOriginais.map(t => t.turma).filter(Boolean)
    ]);
    const todasTurmas = [...new Set([...this.todasTurmasBanco, ...turmasComRegistros])].sort();
    const atualizarSelect = (id) => {
      const select = document.getElementById(id);
      if (!select) return;
      const valorAtual = select.value;
      select.innerHTML = '<option value="todas">Todas as turmas</option>';
      todasTurmas.forEach(t => {
        select.innerHTML += `<option value="${this.escapeHtml(t)}">${this.escapeHtml(t)}</option>`;
      });
      if (valorAtual !== 'todas' && todasTurmas.includes(valorAtual)) select.value = valorAtual;
    };
    atualizarSelect('filtroRegistroTurma');
    atualizarSelect('filtroTurmasRefeicaoTurma');
    atualizarSelect('filtroRodizioTurma');
  }

  async aplicarFiltrosRegistros() {
    const novaData = document.getElementById('filtroRegistroData')?.value || 'hoje';
    const novaTurma = document.getElementById('filtroRegistroTurma')?.value || 'todas';
    const novoTipo = document.getElementById('filtroRegistroTipo')?.value || 'todas';
    const mudouData = novaData !== this.filtroRegistroData;

    this.filtroRegistroData = novaData;
    this.filtroRegistroTurma = novaTurma;
    this.filtroRegistroRefeicao = novoTipo;
    this.paginaRegistros = 1;
    this.salvarFiltros();

    if (mudouData) {
      await this.carregarDadosCompleto(false);
    }
    this.filtrarRegistrosAtuais(novaTurma, novoTipo);
  }

  // ============================================================
  // FILTRAR REGISTROS (com paginação)
  // ============================================================
  filtrarRegistrosAtuais(turma, tipo) {
    const registros = this.ultimosRegistrosOriginais;
    const container = document.querySelector('.mon-registros-list');
    if (!container) return;

    if (!registros || registros.length === 0) {
      this.registrosFiltrados = [];
      container.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">Nenhum registro encontrado.</div>';
      return;
    }

    this.registrosFiltrados = registros.filter(r => {
      if (turma !== 'todas' && r.alunoTurma !== turma) return false;
      if (tipo !== 'todas' && r.tipoRefeicao !== tipo) return false;
      return true;
    });

    if (this.registrosFiltrados.length === 0) {
      container.innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">Nenhum registro atende aos filtros.</div>';
      return;
    }

    const totalPaginas = Math.max(1, Math.ceil(this.registrosFiltrados.length / this.itensPorPaginaRegistros));
    if (this.paginaRegistros > totalPaginas) this.paginaRegistros = totalPaginas;
    if (this.paginaRegistros < 1) this.paginaRegistros = 1;

    const inicio = (this.paginaRegistros - 1) * this.itensPorPaginaRegistros;
    const fim = inicio + this.itensPorPaginaRegistros;
    const pagina = this.registrosFiltrados.slice(inicio, fim);

    const itensHTML = pagina.map(r => {
      const tipoTexto = r.tipoRefeicao === 'manha' ? '🌅 Manhã' : r.tipoRefeicao === 'almoco' ? '🍽️ Almoço' : '🌙 Tarde';
      const horario = r.horario ? new Date(r.horario).toLocaleTimeString('pt-BR') : '-';
      const dataTxt = r.data ? new Date(r.data + 'T00:00:00').toLocaleDateString('pt-BR') : '';
      return `
        <div class="mon-registro-item">
          <div class="mon-registro-info">
            <div class="mon-registro-nome">${this.escapeHtml(r.alunoNome)}</div>
            <div class="mon-registro-turma">${this.escapeHtml(r.alunoTurma)}</div>
            <div class="mon-registro-detalhes">
              <span class="mon-badge ${r.tipoRefeicao}">${tipoTexto}</span>
              <span class="mon-registro-horario"><i class="far fa-clock"></i> ${horario}</span>
              ${dataTxt ? `<span class="mon-registro-horario"><i class="far fa-calendar"></i> ${dataTxt}</span>` : ''}
            </div>
          </div>
          <div class="mon-action-buttons">
            <button onclick="admin.verDetalhesRegistro('${r.id}')" title="Ver"><i class="fas fa-eye"></i></button>
            <button onclick="admin.editarRegistroRefeicao('${r.id}')" title="Editar"><i class="fas fa-edit"></i></button>
            <button onclick="monitoramentoTempoReal.imprimirRegistroRefeicao('${r.id}')" title="Imprimir"><i class="fas fa-print"></i></button>
            <button onclick="admin.excluirRegistroRefeicao('${r.id}', '${this.escapeJs(r.alunoNome)}', '${r.tipoRefeicao}')" class="danger" title="Excluir"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      `;
    }).join('');

    const paginadorHTML = this.renderizarPaginador(
      this.paginaRegistros,
      totalPaginas,
      this.registrosFiltrados.length,
      'irParaPaginaRegistros'
    );

    container.innerHTML = itensHTML + paginadorHTML;
  }

  // ============================================================
  // PAGINADOR GENÉRICO
  // ============================================================
  renderizarPaginador(paginaAtual, totalPaginas, totalItens, funcaoIrPara) {
    if (totalPaginas <= 1) {
      return `<div class="mon-paginacao-info">${totalItens} registro(s) — página única</div>`;
    }

    const botoes = [];
    botoes.push(`
      <button class="mon-pag-btn" ${paginaAtual === 1 ? 'disabled' : ''}
        onclick="monitoramentoTempoReal.${funcaoIrPara}(1)" title="Primeira">
        <i class="fas fa-angle-double-left"></i>
      </button>
    `);
    botoes.push(`
      <button class="mon-pag-btn" ${paginaAtual === 1 ? 'disabled' : ''}
        onclick="monitoramentoTempoReal.${funcaoIrPara}(${paginaAtual - 1})" title="Anterior">
        <i class="fas fa-angle-left"></i>
      </button>
    `);

    const janela = 2;
    const inicio = Math.max(1, paginaAtual - janela);
    const fim = Math.min(totalPaginas, paginaAtual + janela);
    if (inicio > 1) botoes.push(`<span class="mon-pag-ellipsis">...</span>`);
    for (let p = inicio; p <= fim; p++) {
      botoes.push(`
        <button class="mon-pag-btn ${p === paginaAtual ? 'active' : ''}"
          onclick="monitoramentoTempoReal.${funcaoIrPara}(${p})">${p}</button>
      `);
    }
    if (fim < totalPaginas) botoes.push(`<span class="mon-pag-ellipsis">...</span>`);

    botoes.push(`
      <button class="mon-pag-btn" ${paginaAtual === totalPaginas ? 'disabled' : ''}
        onclick="monitoramentoTempoReal.${funcaoIrPara}(${paginaAtual + 1})" title="Próxima">
        <i class="fas fa-angle-right"></i>
      </button>
    `);
    botoes.push(`
      <button class="mon-pag-btn" ${paginaAtual === totalPaginas ? 'disabled' : ''}
        onclick="monitoramentoTempoReal.${funcaoIrPara}(${totalPaginas})" title="Última">
        <i class="fas fa-angle-double-right"></i>
      </button>
    `);

    return `
      <div class="mon-paginacao-wrap">
        <div class="mon-paginacao-info">
          Página <strong>${paginaAtual}</strong> de <strong>${totalPaginas}</strong>
          — ${totalItens} registro(s)
        </div>
        <div class="mon-paginacao-botoes">${botoes.join('')}</div>
      </div>
    `;
  }

  irParaPaginaRegistros(p) {
    const totalPaginas = Math.max(1, Math.ceil(this.registrosFiltrados.length / this.itensPorPaginaRegistros));
    if (p < 1 || p > totalPaginas) return;
    this.paginaRegistros = p;
    this.filtrarRegistrosAtuais(this.filtroRegistroTurma, this.filtroRegistroRefeicao);
  }

  limparFiltrosRegistros() {
    this.filtroRegistroData = 'hoje';
    this.filtroRegistroTurma = 'todas';
    this.filtroRegistroRefeicao = 'todas';
    this.paginaRegistros = 1;
    this.salvarFiltros();
    const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setV('filtroRegistroData', 'hoje');
    setV('filtroRegistroTurma', 'todas');
    setV('filtroRegistroTipo', 'todas');
    this.carregarDadosCompleto(false);
  }

  async aplicarFiltrosRefeicoesTurmas() {
    const novaData = document.getElementById('filtroTurmasRefeicaoData')?.value || 'hoje';
    const novaTurma = document.getElementById('filtroTurmasRefeicaoTurma')?.value || 'todas';
    const novoTurno = document.getElementById('filtroTurmasRefeicaoTurno')?.value || 'todas';
    const mudouData = novaData !== this.filtroTurmasData;

    this.filtroTurmasData = novaData;
    this.filtroTurmasTurma = novaTurma;
    this.filtroTurmasTurno = novoTurno;
    this.salvarFiltros();

    if (mudouData) {
      await this.carregarDadosCompleto(false);
    }
    this.filtrarRefeicoesTurmasAtuais(novaTurma, novoTurno);
  }

  filtrarRefeicoesTurmasAtuais(turma, turno) {
    const tbody = document.querySelector('#tabelaRefeicoesTurmas tbody');
    if (!tbody) return;
    if (!this.refeicoesPorTurmaOriginais || this.refeicoesPorTurmaOriginais.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Nenhum dado</td></tr>';
      return;
    }
    let dados = [...this.refeicoesPorTurmaOriginais];
    if (turma !== 'todas') dados = dados.filter(t => t.turma === turma);
    if (turno !== 'todas') {
      dados = dados.map(t => ({
        turma: t.turma,
        manha: turno === 'manha' ? t.manha : 0,
        almoco: turno === 'almoco' ? t.almoco : 0,
        tarde: turno === 'tarde' ? t.tarde : 0,
        total: t[turno] || 0,
        alunosQueComeram: t.alunosQueComeram || 0
      }));
    }
    if (dados.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Nenhuma turma</td></tr>';
      return;
    }
    tbody.innerHTML = dados.map(t => `
      <tr>
        <td><strong>${this.escapeHtml(t.turma)}</strong></td>
        <td>${t.manha || 0}</td>
        <td>${t.almoco || 0}</td>
        <td>${t.tarde || 0}</td>
        <td><strong>${t.total || 0}</strong></td>
        <td>${t.alunosQueComeram || 0}</td>
      </tr>
    `).join('');
  }

  limparFiltrosRefeicoesTurmas() {
    this.filtroTurmasData = 'hoje';
    this.filtroTurmasTurma = 'todas';
    this.filtroTurmasTurno = 'todas';
    this.salvarFiltros();
    const setV = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    setV('filtroTurmasRefeicaoData', 'hoje');
    setV('filtroTurmasRefeicaoTurma', 'todas');
    setV('filtroTurmasRefeicaoTurno', 'todas');
    this.carregarDadosCompleto(false);
  }

  aplicarFiltrosRodizio() {
    const turma = document.getElementById('filtroRodizioTurma')?.value || 'todas';
    const tipo = document.getElementById('filtroRodizioTipo')?.value || 'todos';
    document.querySelectorAll('#tabelaRodizio tbody tr').forEach(linha => {
      const t = linha.getAttribute('data-turma') || '';
      const tp = linha.getAttribute('data-tipo') || '';
      let mostrar = true;
      if (turma !== 'todas' && t !== turma) mostrar = false;
      if (tipo !== 'todos' && tp !== tipo) mostrar = false;
      linha.style.display = mostrar ? '' : 'none';
    });
  }

  limparFiltrosRodizio() {
    const t = document.getElementById('filtroRodizioTurma'); if (t) t.value = 'todas';
    const tp = document.getElementById('filtroRodizioTipo'); if (tp) tp.value = 'todos';
    document.querySelectorAll('#tabelaRodizio tbody tr').forEach(l => l.style.display = '');
  }

  aplicarFiltrosFeedback() {
    const refeicao = document.getElementById('filtroRefeicaoFeedback')?.value || 'todas';
    const notaMin = parseInt(document.getElementById('filtroNotaMin')?.value || 1);
    const gostou = document.getElementById('filtroGostou')?.value || 'todos';
    const anonimo = document.getElementById('filtroAnonimo')?.value || 'todos';
    const busca = (document.getElementById('filtroBuscaFeedback')?.value || '').toLowerCase();

    this.feedbacksFiltrados = this.todosFeedbacks.filter(f => {
      if (refeicao !== 'todas' && f.tipoRefeicao !== refeicao) return false;
      if (f.nota < notaMin) return false;
      if (gostou !== 'todos' && f.gostou !== gostou) return false;
      if (anonimo !== 'todos') {
        const isA = anonimo === 'sim';
        if (!!f.anonimo !== isA) return false;
      }
      if (busca) {
        const n = (f.alunoNome || '').toLowerCase().includes(busca);
        const t = (f.alunoTurma || '').toLowerCase().includes(busca);
        const c = (f.comentario || '').toLowerCase().includes(busca);
        if (!n && !t && !c) return false;
      }
      return true;
    });

    this.paginaFeedbacks = 1;
    this.atualizarListaFeedbacks();
    const el = document.getElementById('feedbacksFiltrados');
    if (el) el.textContent = this.feedbacksFiltrados.length;
  }

  limparFiltrosFeedback() {
    ['filtroRefeicaoFeedback'].forEach(id => { const el = document.getElementById(id); if (el) el.value = 'todas'; });
    ['filtroNotaMin'].forEach(id => { const el = document.getElementById(id); if (el) el.value = '1'; });
    ['filtroGostou', 'filtroAnonimo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = 'todos'; });
    const b = document.getElementById('filtroBuscaFeedback'); if (b) b.value = '';
    this.aplicarFiltrosFeedback();
  }

  configurarEventosFiltros() {
    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.onchange = fn; };
    bind('filtroRegistroTipo', () => this.aplicarFiltrosRegistros());
    bind('filtroRegistroData', () => this.aplicarFiltrosRegistros());
    bind('filtroRegistroTurma', () => this.aplicarFiltrosRegistros());
    bind('filtroTurmasRefeicaoTurma', () => this.aplicarFiltrosRefeicoesTurmas());
    bind('filtroTurmasRefeicaoTurno', () => this.aplicarFiltrosRefeicoesTurmas());
    bind('filtroTurmasRefeicaoData', () => this.aplicarFiltrosRefeicoesTurmas());
    bind('filtroRodizioTurma', () => this.aplicarFiltrosRodizio());
    bind('filtroRodizioTipo', () => this.aplicarFiltrosRodizio());
    bind('filtroRefeicaoFeedback', () => this.aplicarFiltrosFeedback());
    bind('filtroNotaMin', () => this.aplicarFiltrosFeedback());
    bind('filtroGostou', () => this.aplicarFiltrosFeedback());
    bind('filtroAnonimo', () => this.aplicarFiltrosFeedback());
    const b = document.getElementById('filtroBuscaFeedback');
    if (b) b.oninput = () => this.aplicarFiltrosFeedback();
  }

  async carregarFeedbacksCompleto() {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/feedback-cozinha/estatisticas', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      if (data.success) {
        this.todosFeedbacks = data.ultimosFeedbacks || [];
        this.feedbacksFiltrados = [...this.todosFeedbacks];
        this.paginaFeedbacks = 1;
        this.atualizarFeedbacksNoDOM(data);
      } else {
        this.atualizarFeedbacksNoDOM({ estatisticas: {} });
      }
    } catch (error) {
      this.atualizarFeedbacksNoDOM({ estatisticas: {} });
    }
  }

  atualizarFeedbacksNoDOM(data) {
    const stats = data.estatisticas || {};
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setText('totalFeedbacks', stats.total || 0);
    setText('totalFeedbacksBadge', stats.total || 0);
    setText('mediaNotas', stats.mediaNotas || 0);
    setText('feedbacksFiltrados', this.feedbacksFiltrados.length || 0);
    setText('feedbacksCount', this.todosFeedbacks.length);

    const est = document.getElementById('estrelasMedia');
    if (est) est.innerHTML = this.gerarEstrelasMini(parseFloat(stats.mediaNotas) || 0);

    const maxN = Math.max(...Object.values(stats.distribuicaoNotas || {}), 1);
    for (let i = 1; i <= 5; i++) {
      const c = (stats.distribuicaoNotas || {})[i] || 0;
      const p = (c / maxN) * 100;
      const bar = document.getElementById(`bar${i}`);
      const cnt = document.getElementById(`count${i}`);
      if (bar) bar.style.width = `${p}%`;
      if (cnt) cnt.textContent = c;
    }

    setText('gostaramSim', stats.gostouStats?.sim || 0);
    setText('gostaramMaisMenos', stats.gostouStats?.mais_ou_menos || 0);
    setText('gostaramNao', stats.gostouStats?.nao || 0);
    setText('mediaDetalhada', `${stats.mediaNotas || 0}/5`);

    const totG = (stats.gostouStats?.sim || 0) + (stats.gostouStats?.mais_ou_menos || 0);
    const aprov = stats.total > 0 ? Math.round((totG / stats.total) * 100) : 0;
    setText('gostaram', `${aprov}%`);

    this.atualizarListaFeedbacks();
  }

  // ============================================================
  // LISTA DE FEEDBACKS (com paginação)
  // ============================================================
  atualizarListaFeedbacks() {
    const tbody = document.getElementById('listaFeedbacksAdmin');
    if (!tbody) return;

    if (this.feedbacksFiltrados.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">Nenhum feedback encontrado</td></tr>';
      return;
    }

    const totalPaginas = Math.max(1, Math.ceil(this.feedbacksFiltrados.length / this.itensPorPaginaFeedbacks));
    if (this.paginaFeedbacks > totalPaginas) this.paginaFeedbacks = totalPaginas;
    if (this.paginaFeedbacks < 1) this.paginaFeedbacks = 1;

    const inicio = (this.paginaFeedbacks - 1) * this.itensPorPaginaFeedbacks;
    const fim = inicio + this.itensPorPaginaFeedbacks;
    const pagina = this.feedbacksFiltrados.slice(inicio, fim);

    const linhasHTML = pagina.map(f => {
      const tipoTexto = f.tipoRefeicao === 'manha' ? '🌅 Manhã' : f.tipoRefeicao === 'almoco' ? '🍽️ Almoço' : '🌙 Tarde';
      const notaNum = parseInt(f.nota) || 0;
      return `
        <tr>
          <td>${this.escapeHtml(f.alunoNome)}${f.anonimo ? ' <i class="fas fa-user-secret text-muted"></i>' : ''}</td>
          <td>${this.escapeHtml(f.alunoTurma || '-')}</td>
          <td><span class="mon-badge ${f.tipoRefeicao}">${tipoTexto}</span></td>
          <td><span style="color: #f59e0b;">${'★'.repeat(notaNum)}${'☆'.repeat(5 - notaNum)}</span></td>
          <td><small>${f.comentario ? (f.comentario.length > 40 ? this.escapeHtml(f.comentario.substring(0, 40)) + '...' : this.escapeHtml(f.comentario)) : '-'}</small></td>
          <td><small>${new Date(f.createdAt).toLocaleString('pt-BR')}</small></td>
          <td>
            <div class="mon-action-buttons">
              <button onclick="monitoramentoTempoReal.verDetalhesFeedback('${f._id}')" title="Ver"><i class="fas fa-eye"></i></button>
              <button onclick="monitoramentoTempoReal.editarFeedback('${f._id}')" title="Editar"><i class="fas fa-edit"></i></button>
              <button onclick="monitoramentoTempoReal.imprimirFeedback('${f._id}')" title="Imprimir"><i class="fas fa-print"></i></button>
              <button onclick="monitoramentoTempoReal.excluirFeedback('${f._id}', '${this.escapeJs(f.alunoNome)}')" class="danger" title="Excluir"><i class="fas fa-trash"></i></button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    const paginadorHTML = this.renderizarPaginador(
      this.paginaFeedbacks,
      totalPaginas,
      this.feedbacksFiltrados.length,
      'irParaPaginaFeedbacks'
    );

    tbody.innerHTML = linhasHTML + `
      <tr class="mon-pag-tr">
        <td colspan="7" style="padding: 12px; background: #f8fafc; border-top: 2px solid #e2e8f0;">
          ${paginadorHTML}
        </td>
      </tr>
    `;
  }

  irParaPaginaFeedbacks(p) {
    const totalPaginas = Math.max(1, Math.ceil(this.feedbacksFiltrados.length / this.itensPorPaginaFeedbacks));
    if (p < 1 || p > totalPaginas) return;
    this.paginaFeedbacks = p;
    this.atualizarListaFeedbacks();
    const tbl = document.getElementById('tabelaFeedbacks');
    if (tbl && tbl.scrollIntoView) {
      tbl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  atualizarTimestamp(t) {
    const el = document.getElementById('ultimaAtualizacao');
    if (el) el.textContent = new Date(t).toLocaleTimeString('pt-BR');
  }

  iniciarEventosSSE() {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    this.eventSource = new EventSource(`/api/cozinha-monitoramento/eventos?token=${encodeURIComponent(token)}`);
    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'nova-refeicao') {
          this.carregarFeedbacksCompleto();
          this.carregarDadosCompleto(false);
        }
        if (data.type === 'heartbeat') {
          const el = document.getElementById('statusConexao');
          if (el) { el.innerHTML = '<i class="fas fa-circle"></i> Conectado'; el.className = 'mon-status-badge online'; }
        }
      } catch (e) {}
    };
    this.eventSource.onerror = () => {
      const el = document.getElementById('statusConexao');
      if (el) { el.innerHTML = '<i class="fas fa-circle"></i> Reconectando...'; el.className = 'mon-status-badge offline'; }
      setTimeout(() => this.reconectarEventos(), 5000);
    };
  }

  reconectarEventos() {
    if (this.eventSource) this.eventSource.close();
    this.iniciarEventosSSE();
  }

  iniciarAtualizacaoAutomatica() {
    if (this.atualizacaoTimer) clearInterval(this.atualizacaoTimer);
    this.atualizacaoTimer = setInterval(() => {
      // Só atualiza automaticamente se o filtro for "hoje" (dados antigos não mudam)
      if (this.filtroRegistroData === 'hoje') {
        this.carregarDadosCompleto(false);
      }
    }, 60000);
  }

  async atualizarForcado() {
    this.cacheDados.clear();
    await this.carregarDadosCompleto(false);
    await this.carregarFeedbacksCompleto();
    this.showToastMessage('✅ Dados atualizados!', 'success');
  }

  async verificarEstatisticasRegistros() {
    try {
      const token = localStorage.getItem('auth_token');
      const r = await fetch('/api/cozinha-monitoramento/estatisticas-registros', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!r.ok) return null;
      const d = await r.json();
      return d.success ? d.estatisticas : null;
    } catch (e) { return null; }
  }

  async executarLimpezaRegistros(meses = 1) {
    let c = false;
    if (typeof admin !== 'undefined' && admin.confirmar) {
      c = await admin.confirmar('🗑️ Limpeza', `Remover registros com mais de <strong>${meses} mês(es)</strong>?`);
    } else {
      c = await confirm(`Remover registros com mais de ${meses} mês(es)?`);
    }
    if (!c) return;
    try {
      this.showToastMessage('🔄 Limpando...', 'info');
      const token = localStorage.getItem('auth_token');
      const r = await fetch('/api/cozinha-monitoramento/limpar-registros-antigos', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ meses })
      });
      const d = await r.json();
      if (d.success) {
        this.showToastMessage(`✅ ${d.deletados} removidos!`, 'success');
        this.cacheDados.clear();
        await this.carregarDadosCompleto(false);
      } else throw new Error(d.error);
    } catch (e) { this.showToastMessage('❌ ' + e.message, 'error'); }
  }

  async abrirModalLimpezaRegistros() {
    const mb = document.getElementById('modalBody');
    if (!mb) return;
    mb.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <div style="width: 70px; height: 70px; background: #fee2e2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
          <i class="fas fa-trash-alt" style="font-size: 30px; color: #dc2626;"></i>
        </div>
        <h3 style="margin: 15px 0 5px;">Limpeza de Registros</h3>
        <div id="estatisticasContainer" style="background: #f8fafc; border-radius: 12px; padding: 15px; margin: 20px 0;">Carregando...</div>
        <select id="periodoLimpeza" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 20px;">
          <option value="1">Manter 1 mês</option>
          <option value="2">Manter 2 meses</option>
          <option value="3">Manter 3 meses</option>
          <option value="6">Manter 6 meses</option>
          <option value="12">Manter 1 ano</option>
        </select>
        <div style="display: flex; gap: 10px;">
          <button onclick="admin.closeModal()" style="flex: 1; padding: 12px; background: #6c757d; color: white; border: none; border-radius: 8px; cursor: pointer;">Cancelar</button>
          <button onclick="monitoramentoTempoReal.confirmarLimpezaRegistros()" style="flex: 1; padding: 12px; background: #dc2626; color: white; border: none; border-radius: 8px; cursor: pointer;">Limpar</button>
        </div>
      </div>
    `;
    document.getElementById('modalTitle').innerHTML = '<i class="fas fa-trash-alt"></i> Limpeza';
    document.getElementById('modalSaveBtn').style.display = 'none';
    if (typeof admin !== 'undefined' && admin.openModal) admin.openModal();
    const stats = await this.verificarEstatisticasRegistros();
    const c = document.getElementById('estatisticasContainer');
    if (stats && c) {
      c.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
          <div><div style="font-size: 20px; font-weight: bold;">${stats.total}</div><div style="font-size: 11px; color: #64748b;">Total</div></div>
          <div><div style="font-size: 20px; font-weight: bold; color: #10b981;">${stats.ultimoMes}</div><div style="font-size: 11px; color: #64748b;">Recentes</div></div>
          <div><div style="font-size: 20px; font-weight: bold; color: #f59e0b;">${stats.anteriores}</div><div style="font-size: 11px; color: #64748b;">Antigos</div></div>
        </div>
      `;
    }
  }

  async confirmarLimpezaRegistros() {
    const p = document.getElementById('periodoLimpeza')?.value || 1;
    if (typeof admin !== 'undefined' && admin.closeModal) admin.closeModal();
    await this.executarLimpezaRegistros(parseInt(p));
  }

  renderizarErro(msg) {
    const c = document.getElementById('contentArea');
    if (!c) return;
    c.innerHTML = `
      <div style="text-align: center; padding: 60px; background: white; border-radius: 20px;">
        <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #dc2626; margin-bottom: 16px;"></i>
        <h3>Erro ao carregar</h3>
        <p style="color: #64748b;">${this.escapeHtml(msg)}</p>
        <button onclick="monitoramentoTempoReal.carregar()" class="mon-btn-refresh"><i class="fas fa-sync-alt"></i> Tentar</button>
      </div>
    `;
  }

  // ============================================================
  // RENDER PRINCIPAL
  // ============================================================
  renderizar(data) {
    const container = document.getElementById('contentArea');
    if (!container) return;
    const cozinha = data.cozinha || {};
    const gestao = data.gestaoGeral || {};
    const contagem = cozinha.contagemRefeicoes || { manha: 0, almoco: 0, tarde: 0, total: 0, pessoasUnicas: 0 };
    const perfis = cozinha.perfisAlimentares || { sempre: 0, as_vezes: 0, nunca: 0 };
    const previsao = cozinha.previsaoComida || { manha: 0, almoco: 0, tarde: 0, total: 0 };
    const adesao = cozinha.totalPessoas ? ((contagem.pessoasUnicas / cozinha.totalPessoas) * 100).toFixed(0) : 0;

    // Label amigável do período atual
    const labelsPeriodo = {
      hoje: 'Hoje', ontem: 'Ontem', semana: 'Últimos 7 dias',
      mes: 'Últimos 30 dias', ano: 'Último ano', todos: 'Todo o período'
    };
    const periodoAtualLabel = labelsPeriodo[this.filtroRegistroData] || 'Hoje';

    container.innerHTML = `
      <div class="monitoramento-dashboard">
        <div class="mon-dash-header">
          <div class="mon-header-title">
            <i class="fas fa-chart-line mon-header-icon"></i>
            <div><h1>Monitoramento em Tempo Real</h1><p>Dados da Coordenação de Pátio e Cozinha</p></div>
          </div>
          <div class="mon-header-status">
            <span class="mon-status-badge online" id="statusConexao"><i class="fas fa-circle"></i> Conectado</span>
            <button class="mon-btn-refresh" onclick="monitoramentoTempoReal.atualizarForcado()"><i class="fas fa-sync-alt"></i> Atualizar</button>
            <button class="mon-btn-refresh btn-danger" onclick="monitoramentoTempoReal.abrirModalLimpezaRegistros()"><i class="fas fa-trash-alt"></i> Limpar</button>
          </div>
        </div>

        ${(data.alertas || []).length > 0 ? `
          <div class="mon-alertas-grid">
            ${(data.alertas || []).map(a => `
              <div class="mon-alerta-card ${a.tipo}">
                <div class="mon-alerta-icon"><i class="fas ${a.tipo === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i></div>
                <div class="mon-alerta-content">
                  <div class="mon-alerta-title">${a.titulo}</div>
                  <div class="mon-alerta-message">${a.mensagem}</div>
                  ${a.sugestao ? `<div class="mon-alerta-sugestao"><i class="fas fa-lightbulb"></i> ${a.sugestao}</div>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="mon-metrics-grid">
          <div class="mon-metric-card">
            <div class="mon-metric-icon purple"><i class="fas fa-users"></i></div>
            <div class="mon-metric-info"><div class="mon-metric-value">${cozinha.totalPessoas || 0}</div><div class="mon-metric-label">Total de Pessoas</div></div>
          </div>
          <div class="mon-metric-card">
            <div class="mon-metric-icon green"><i class="fas fa-utensils"></i></div>
            <div class="mon-metric-info"><div class="mon-metric-value">${contagem.total}</div><div class="mon-metric-label">Refeições (${this.escapeHtml(periodoAtualLabel)})</div><div class="mon-metric-detail">${contagem.pessoasUnicas} únicas</div></div>
          </div>
          <div class="mon-metric-card">
            <div class="mon-metric-icon orange"><i class="fas fa-chart-pie"></i></div>
            <div class="mon-metric-info"><div class="mon-metric-value">${adesao}%</div><div class="mon-metric-label">Taxa de Adesão</div></div>
          </div>
          <div class="mon-metric-card">
            <div class="mon-metric-icon blue"><i class="fas fa-clock"></i></div>
            <div class="mon-metric-info"><div class="mon-metric-value" id="ultimaAtualizacao">--:--</div><div class="mon-metric-label">Atualização</div></div>
          </div>
        </div>

        <div class="mon-card">
          <div class="mon-card-header"><i class="fas fa-chart-bar"></i> Refeições por Período</div>
          <div class="mon-card-body">
            <div class="mon-periodos-grid">
              <div class="mon-periodo-card manha"><div class="mon-periodo-icon">🌅</div><div class="mon-periodo-info"><div class="mon-periodo-value">${contagem.manha}</div><div class="mon-periodo-label">Manhã</div><div class="mon-periodo-time">08:00 - 10:00</div></div></div>
              <div class="mon-periodo-card almoco"><div class="mon-periodo-icon">🍽️</div><div class="mon-periodo-info"><div class="mon-periodo-value">${contagem.almoco}</div><div class="mon-periodo-label">Almoço</div><div class="mon-periodo-time">11:00 - 13:00</div></div></div>
              <div class="mon-periodo-card tarde"><div class="mon-periodo-icon">🌙</div><div class="mon-periodo-info"><div class="mon-periodo-value">${contagem.tarde}</div><div class="mon-periodo-label">Tarde</div><div class="mon-periodo-time">14:00 - 16:00</div></div></div>
            </div>
          </div>
        </div>

        <div class="mon-two-columns">
          <div class="mon-card">
            <div class="mon-card-header"><i class="fas fa-chart-line"></i> Previsão de Consumo</div>
            <div class="mon-card-body">
              <div class="mon-previsao-grid">
                <div class="mon-previsao-item"><span class="mon-previsao-label">🌅 Manhã</span><strong class="mon-previsao-value">${previsao.manha}</strong><small>kg</small></div>
                <div class="mon-previsao-item"><span class="mon-previsao-label">🍽️ Almoço</span><strong class="mon-previsao-value">${previsao.almoco}</strong><small>kg</small></div>
                <div class="mon-previsao-item"><span class="mon-previsao-label">🌙 Tarde</span><strong class="mon-previsao-value">${previsao.tarde}</strong><small>kg</small></div>
                <div class="mon-previsao-item total"><span class="mon-previsao-label">📊 Total</span><strong class="mon-previsao-value">${previsao.total}</strong><small>kg</small></div>
              </div>
            </div>
          </div>
          <div class="mon-card">
            <div class="mon-card-header"><i class="fas fa-chart-pie"></i> Perfil Alimentar</div>
            <div class="mon-card-body mon-perfil-body">
              <div class="mon-grafico-container"><canvas id="graficoPerfilAlimentar" width="100" height="100"></canvas></div>
              <div class="mon-perfil-legend">
                <div class="legend-item"><span class="dot green"></span> Sempre <strong>${perfis.sempre}</strong></div>
                <div class="legend-item"><span class="dot orange"></span> Às vezes <strong>${perfis.as_vezes}</strong></div>
                <div class="legend-item"><span class="dot red"></span> Nunca <strong>${perfis.nunca}</strong></div>
              </div>
            </div>
          </div>
        </div>

        <div class="mon-card">
          <div class="mon-card-header"><i class="fas fa-table"></i> Refeições por Turma</div>
          <div class="mon-card-body">
            <div class="mon-filtros-box">
              <div class="mon-filtro-group"><label>Turma</label><select id="filtroTurmasRefeicaoTurma"><option value="todas">Todas</option></select></div>
              <div class="mon-filtro-group"><label>Turno</label><select id="filtroTurmasRefeicaoTurno"><option value="todas">Todos</option><option value="manha">Manhã</option><option value="almoco">Almoço</option><option value="tarde">Tarde</option></select></div>
              <div class="mon-filtro-group"><label>Período</label>
                <select id="filtroTurmasRefeicaoData">
                  <option value="hoje">Hoje</option>
                  <option value="ontem">Ontem</option>
                  <option value="semana">Últimos 7 dias</option>
                  <option value="mes">Últimos 30 dias</option>
                  <option value="ano">Último ano</option>
                  <option value="todos">Todo o período</option>
                </select>
              </div>
              <button onclick="monitoramentoTempoReal.limparFiltrosRefeicoesTurmas()" class="mon-btn-clear"><i class="fas fa-eraser"></i> Limpar</button>
            </div>
            <div class="mon-table-responsive">
              <table class="mon-data-table" id="tabelaRefeicoesTurmas">
                <thead><tr><th>Turma</th><th>🌅 Manhã</th><th>🍽️ Almoço</th><th>🌙 Tarde</th><th>Total</th><th>Alunos</th></tr></thead>
                <tbody>${(cozinha.refeicoesPorTurma || []).map(t => `
                  <tr><td><strong>${this.escapeHtml(t.turma)}</strong></td><td>${t.manha || 0}</td><td>${t.almoco || 0}</td><td>${t.tarde || 0}</td><td><strong>${t.total || 0}</strong></td><td>${t.alunosQueComeram || 0}</td></tr>
                `).join('')}</tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="mon-card">
          <div class="mon-card-header"><i class="fas fa-history"></i> Últimos Registros</div>
          <div class="mon-card-body">
            <div class="mon-filtros-box">
              <div class="mon-filtro-group"><label>Turma</label><select id="filtroRegistroTurma"><option value="todas">Todas</option></select></div>
              <div class="mon-filtro-group"><label>Refeição</label><select id="filtroRegistroTipo"><option value="todas">Todas</option><option value="manha">Manhã</option><option value="almoco">Almoço</option><option value="tarde">Tarde</option></select></div>
              <div class="mon-filtro-group"><label>Período</label>
                <select id="filtroRegistroData">
                  <option value="hoje">Hoje</option>
                  <option value="ontem">Ontem</option>
                  <option value="semana">Últimos 7 dias</option>
                  <option value="mes">Últimos 30 dias</option>
                  <option value="ano">Último ano</option>
                  <option value="todos">Todo o período</option>
                </select>
              </div>
              <button onclick="monitoramentoTempoReal.limparFiltrosRegistros()" class="mon-btn-clear"><i class="fas fa-eraser"></i> Limpar</button>
            </div>
            <div class="mon-registros-list"></div>
          </div>
        </div>

        <div class="mon-card">
          <div class="mon-card-header">
            <i class="fas fa-calendar-alt"></i> Gestão de Rodízio
            <button onclick="admin.abrirModalRodizioGestao()" class="mon-btn-add"><i class="fas fa-plus"></i> Novo</button>
          </div>
          <div class="mon-card-body">
            <div class="mon-filtros-box">
              <div class="mon-filtro-group"><label>Turma</label><select id="filtroRodizioTurma"><option value="todas">Todas</option></select></div>
              <div class="mon-filtro-group"><label>Tipo</label><select id="filtroRodizioTipo"><option value="todos">Todos</option><option value="semanal">Semanal</option><option value="mensal">Mensal</option><option value="ambos">Ambos</option></select></div>
              <button onclick="monitoramentoTempoReal.limparFiltrosRodizio()" class="mon-btn-clear"><i class="fas fa-eraser"></i> Limpar</button>
            </div>
            <div class="mon-table-responsive">
              <table class="mon-data-table" id="tabelaRodizio">
                <thead><tr><th>Turma</th><th>Tipo</th><th>Horário</th><th>Status Hoje</th><th>Ações</th></tr></thead>
                <tbody>${(gestao.rodizios || []).map(r => `
                  <tr data-turma="${r.turma}" data-tipo="${r.tipo}">
                    <td><strong>${r.turma}</strong></td>
                    <td><span class="mon-badge ${r.tipo}">${r.tipo}</span></td>
                    <td>${r.horario || '-'}</td>
                    <td><span class="mon-status ${r.podeHoje ? 'ativo' : 'inativo'}">${r.podeHoje ? '✅ Sim' : '❌ Não'}</span></td>
                    <td><div class="mon-action-buttons">
                      <button onclick="admin.editarRodizioGestao('${r.turma}')"><i class="fas fa-edit"></i></button>
                      <button onclick="admin.excluirRodizioGestao('${r.turma}')" class="danger"><i class="fas fa-trash"></i></button>
                    </div></td>
                  </tr>
                `).join('')}</tbody>
              </table>
            </div>
          </div>
        </div>

        <div class="mon-card">
          <div class="mon-card-header" style="justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <i class="fas fa-star"></i> Avaliações dos Alunos
              <span class="mon-badge-total" id="totalFeedbacksBadge">0</span>
            </div>
            <button onclick="monitoramentoTempoReal.carregarFeedbacksCompleto()" class="mon-btn-refresh" style="font-size: 12px;"><i class="fas fa-sync-alt"></i> Atualizar</button>
          </div>
          <div class="mon-card-body">
            <div class="mon-feedback-stats">
              <div class="mon-feedback-stat"><div class="mon-feedback-icon purple"><i class="fas fa-comment-dots"></i></div><div class="mon-feedback-info"><span class="mon-feedback-value" id="totalFeedbacks">0</span><span class="mon-feedback-label">Total</span></div></div>
              <div class="mon-feedback-stat"><div class="mon-feedback-icon orange"><i class="fas fa-star"></i></div><div class="mon-feedback-info"><span class="mon-feedback-value" id="mediaNotas">0</span><span class="mon-feedback-label">Média</span><div id="estrelasMedia" class="mon-estrelas-media"></div></div></div>
              <div class="mon-feedback-stat"><div class="mon-feedback-icon green"><i class="fas fa-smile-wink"></i></div><div class="mon-feedback-info"><span class="mon-feedback-value" id="gostaram">0%</span><span class="mon-feedback-label">Aprovação</span></div></div>
              <div class="mon-feedback-stat"><div class="mon-feedback-icon blue"><i class="fas fa-filter"></i></div><div class="mon-feedback-info"><span class="mon-feedback-value" id="feedbacksFiltrados">0</span><span class="mon-feedback-label">Filtrados</span></div></div>
            </div>

            <div class="mon-filtros-box">
              <div class="mon-filtro-group"><label>Refeição</label><select id="filtroRefeicaoFeedback"><option value="todas">Todas</option><option value="manha">Manhã</option><option value="almoco">Almoço</option><option value="tarde">Tarde</option></select></div>
              <div class="mon-filtro-group"><label>Nota Mín.</label><select id="filtroNotaMin"><option value="1">1★+</option><option value="2">2★+</option><option value="3">3★+</option><option value="4">4★+</option><option value="5">5★</option></select></div>
              <div class="mon-filtro-group"><label>Opinião</label><select id="filtroGostou"><option value="todos">Todos</option><option value="sim">👍 Adoraram</option><option value="mais_ou_menos">😐 Mais ou menos</option><option value="nao">👎 Não gostaram</option></select></div>
              <div class="mon-filtro-group"><label>Anonimato</label><select id="filtroAnonimo"><option value="todos">Todos</option><option value="nao">✅ Identificados</option><option value="sim">🔒 Anônimos</option></select></div>
              <div class="mon-filtro-group" style="flex: 2;"><label>Buscar</label><input type="text" id="filtroBuscaFeedback" placeholder="Nome, turma..."></div>
              <button onclick="monitoramentoTempoReal.limparFiltrosFeedback()" class="mon-btn-clear"><i class="fas fa-eraser"></i> Limpar</button>
            </div>

            <div class="mon-two-columns">
              <div class="mon-feedback-chart-card">
                <div class="mon-feedback-chart-title"><i class="fas fa-chart-bar"></i> Distribuição das Notas</div>
                <div class="mon-rating-bars">
                  ${[1,2,3,4,5].map(i => `
                    <div class="mon-rating-bar">
                      <span class="mon-rating-label">★ ${i}</span>
                      <div class="mon-rating-bar-bg"><div id="bar${i}" class="mon-rating-bar-fill" style="background: ${i <= 2 ? '#ef4444' : i === 3 ? '#3b82f6' : '#10b981'};"></div></div>
                      <span class="mon-rating-count" id="count${i}">0</span>
                    </div>
                  `).join('')}
                </div>
              </div>
              <div class="mon-feedback-chart-card">
                <div class="mon-feedback-chart-title"><i class="fas fa-smile"></i> Resumo das Opiniões</div>
                <div class="mon-opinion-summary">
                  <div class="mon-opinion-item"><div class="mon-opinion-icon green"><i class="fas fa-smile-wink"></i></div><div class="mon-opinion-info"><span class="mon-opinion-label">Adoraram</span><span class="mon-opinion-value" id="gostaramSim">0</span></div></div>
                  <div class="mon-opinion-item"><div class="mon-opinion-icon orange"><i class="fas fa-meh"></i></div><div class="mon-opinion-info"><span class="mon-opinion-label">Mais ou menos</span><span class="mon-opinion-value" id="gostaramMaisMenos">0</span></div></div>
                  <div class="mon-opinion-item"><div class="mon-opinion-icon red"><i class="fas fa-frown"></i></div><div class="mon-opinion-info"><span class="mon-opinion-label">Não gostaram</span><span class="mon-opinion-value" id="gostaramNao">0</span></div></div>
                  <div class="mon-opinion-divider"></div>
                  <div class="mon-opinion-item"><div class="mon-opinion-icon purple"><i class="fas fa-star"></i></div><div class="mon-opinion-info"><span class="mon-opinion-label">Média</span><span class="mon-opinion-value" id="mediaDetalhada">0/5</span></div></div>
                </div>
              </div>
            </div>

            <div class="mon-feedback-list-header"><i class="fas fa-list"></i><span>Últimas Avaliações</span><span class="mon-badge-total" id="feedbacksCount">0</span></div>
            <div class="mon-table-responsive">
              <table class="mon-data-table" id="tabelaFeedbacks">
                <thead><tr><th>Aluno</th><th>Turma</th><th>Refeição</th><th>Nota</th><th>Comentário</th><th>Data</th><th>Ações</th></tr></thead>
                <tbody id="listaFeedbacksAdmin"><tr><td colspan="7" style="text-align: center; padding: 20px;">Carregando...</td></tr></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
    this.inicializarGraficos(data);
  }

  inicializarGraficos(data) {
    const canvas = document.getElementById('graficoPerfilAlimentar');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (this.graficos.perfil) { try { this.graficos.perfil.destroy(); } catch(e) {} }
    const perfis = data.cozinha?.perfisAlimentares || {};
    canvas.width = 100; canvas.height = 100;
    this.graficos.perfil = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Sempre', 'Às vezes', 'Nunca'],
        datasets: [{ data: [perfis.sempre || 0, perfis.as_vezes || 0, perfis.nunca || 0], backgroundColor: ['#10b981', '#f59e0b', '#ef4444'], borderWidth: 0, cutout: '65%' }]
      },
      options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: false } } }
    });
  }

  // ============================================================
  // AÇÕES DO FEEDBACK
  // ============================================================
  async verDetalhesFeedback(id) {
    try {
      const token = localStorage.getItem('auth_token');
      const r = await fetch(`/api/feedback-cozinha/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      const f = d.feedback;
      const tipoTxt = f.tipoRefeicao === 'manha' ? '🌅 Manhã' : f.tipoRefeicao === 'almoco' ? '🍽️ Almoço' : '🌙 Tarde';
      const notaNum = parseInt(f.nota) || 0;
      const mb = document.getElementById('modalBody');
      mb.innerHTML = `
        <div style="padding: 20px;">
          <div style="text-align: center; margin-bottom: 20px;">
            <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #f59e0b, #d97706); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
              <i class="fas fa-star" style="font-size: 36px; color: white;"></i>
            </div>
            <h2 style="margin: 15px 0 5px;">${this.escapeHtml(f.alunoNome)}</h2>
            <p style="color: #64748b;">${f.anonimo ? 'Anônimo' : (f.alunoCurso || '')}</p>
          </div>
          <div style="background: #f8fafc; border-radius: 12px; padding: 15px; margin-bottom: 15px;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
              <div><div style="font-size: 12px; color: #64748b;">Refeição</div><div style="font-weight: 600;">${tipoTxt}</div></div>
              <div><div style="font-size: 12px; color: #64748b;">Nota</div><div style="font-weight: 600; color: #f59e0b;">${'★'.repeat(notaNum)}${'☆'.repeat(5 - notaNum)}</div></div>
              <div><div style="font-size: 12px; color: #64748b;">Gostou?</div><div style="font-weight: 600;">${f.gostou === 'sim' ? '👍 Sim' : f.gostou === 'mais_ou_menos' ? '😐 Mais ou menos' : f.gostou === 'nao' ? '👎 Não' : '-'}</div></div>
              <div><div style="font-size: 12px; color: #64748b;">Data</div><div>${new Date(f.createdAt).toLocaleString('pt-BR')}</div></div>
            </div>
          </div>
          ${f.comentario ? `<div style="background: #fef3c7; border-radius: 12px; padding: 15px; margin-bottom: 15px; border-left: 4px solid #f59e0b;"><div style="font-size: 12px; color: #92400e; font-weight: 600;">💬 Comentário</div><div>${this.escapeHtml(f.comentario)}</div></div>` : ''}
          ${f.sugestao ? `<div style="background: #dbeafe; border-radius: 12px; padding: 15px; margin-bottom: 15px; border-left: 4px solid #3b82f6;"><div style="font-size: 12px; color: #1e40af; font-weight: 600;">💡 Sugestão</div><div>${this.escapeHtml(f.sugestao)}</div></div>` : ''}
          <div style="display: flex; gap: 10px; margin-top: 20px;">
            <button onclick="monitoramentoTempoReal.editarFeedback('${f._id}')" style="flex: 1; padding: 12px; background: #f59e0b; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;"><i class="fas fa-edit"></i> Editar</button>
            <button onclick="monitoramentoTempoReal.imprimirFeedback('${f._id}')" style="flex: 1; padding: 12px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;"><i class="fas fa-print"></i> Imprimir</button>
          </div>
        </div>
      `;
      document.getElementById('modalTitle').innerHTML = '<i class="fas fa-eye"></i> Detalhes do Feedback';
      document.getElementById('modalSaveBtn').style.display = 'none';
      admin.openModal();
    } catch (e) { this.showToastMessage('❌ ' + e.message, 'error'); }
  }

  async editarFeedback(id) {
    try {
      const token = localStorage.getItem('auth_token');
      const r = await fetch(`/api/feedback-cozinha/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      const f = d.feedback;
      const mb = document.getElementById('modalBody');
      mb.innerHTML = `
        <div style="padding: 20px;">
          <h3 style="margin: 0 0 20px;">Editar Feedback</h3>
          <div style="background: #f8fafc; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
            <div style="font-weight: 600;">${this.escapeHtml(f.alunoNome)}</div>
            ${f.alunoTurma ? `<div style="font-size: 12px; color: #64748b;">Turma: ${this.escapeHtml(f.alunoTurma)}</div>` : ''}
          </div>
          <div style="margin-bottom: 15px;"><label style="display: block; font-weight: 600; margin-bottom: 5px;">Refeição</label>
            <select id="editFeedbackTipo" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
              <option value="manha" ${f.tipoRefeicao === 'manha' ? 'selected' : ''}>🌅 Manhã</option>
              <option value="almoco" ${f.tipoRefeicao === 'almoco' ? 'selected' : ''}>🍽️ Almoço</option>
              <option value="tarde" ${f.tipoRefeicao === 'tarde' ? 'selected' : ''}>🌙 Tarde</option>
            </select>
          </div>
          <div style="margin-bottom: 15px;"><label style="display: block; font-weight: 600; margin-bottom: 5px;">Nota (1-5)</label>
            <input type="number" id="editFeedbackNota" min="1" max="5" value="${f.nota}" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
          </div>
          <div style="margin-bottom: 15px;"><label style="display: block; font-weight: 600; margin-bottom: 5px;">Gostou?</label>
            <select id="editFeedbackGostou" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px;">
              <option value="" ${!f.gostou ? 'selected' : ''}>-</option>
              <option value="sim" ${f.gostou === 'sim' ? 'selected' : ''}>👍 Sim</option>
              <option value="mais_ou_menos" ${f.gostou === 'mais_ou_menos' ? 'selected' : ''}>😐 Mais ou menos</option>
              <option value="nao" ${f.gostou === 'nao' ? 'selected' : ''}>👎 Não</option>
            </select>
          </div>
          <div style="margin-bottom: 15px;"><label style="display: block; font-weight: 600; margin-bottom: 5px;">Comentário</label>
            <textarea id="editFeedbackComentario" rows="3" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px;">${this.escapeHtml(f.comentario || '')}</textarea>
          </div>
          <div style="margin-bottom: 15px;"><label style="display: block; font-weight: 600; margin-bottom: 5px;">Sugestão</label>
            <textarea id="editFeedbackSugestao" rows="2" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px;">${this.escapeHtml(f.sugestao || '')}</textarea>
          </div>
        </div>
      `;
      document.getElementById('modalTitle').innerHTML = '<i class="fas fa-edit"></i> Editar Feedback';
      const saveBtn = document.getElementById('modalSaveBtn');
      saveBtn.style.display = 'inline-block';
      saveBtn.textContent = '💾 Salvar';
      saveBtn.onclick = () => this.salvarEdicaoFeedback(id);
      admin.openModal();
    } catch (e) { this.showToastMessage('❌ ' + e.message, 'error'); }
  }

  async salvarEdicaoFeedback(id) {
    try {
      const dados = {
        tipoRefeicao: document.getElementById('editFeedbackTipo').value,
        nota: parseInt(document.getElementById('editFeedbackNota').value),
        gostou: document.getElementById('editFeedbackGostou').value,
        comentario: document.getElementById('editFeedbackComentario').value,
        sugestao: document.getElementById('editFeedbackSugestao').value
      };
      if (!dados.nota || dados.nota < 1 || dados.nota > 5) {
        this.showToastMessage('❌ Nota deve ser 1 a 5', 'error');
        return;
      }
      const token = localStorage.getItem('auth_token');
      const r = await fetch(`/api/feedback-cozinha/${id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      this.showToastMessage('✅ Atualizado!', 'success');
      admin.closeModal();
      await this.carregarFeedbacksCompleto();
    } catch (e) { this.showToastMessage('❌ ' + e.message, 'error'); }
  }

  async excluirFeedback(id, nome) {
    let c = false;
    if (typeof admin !== 'undefined' && admin.confirmar) {
      c = await admin.confirmar('🗑️ Excluir Feedback', `Excluir feedback de <strong>${this.escapeHtml(nome)}</strong>?`);
    } else {
      c = await confirm(`Excluir feedback de ${nome}?`);
    }
    if (!c) return;
    try {
      const token = localStorage.getItem('auth_token');
      const r = await fetch(`/api/feedback-cozinha/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      this.showToastMessage('✅ Excluído!', 'success');
      await this.carregarFeedbacksCompleto();
    } catch (e) { this.showToastMessage('❌ ' + e.message, 'error'); }
  }

  async imprimirFeedback(id) {
    try {
      const token = localStorage.getItem('auth_token');
      const r = await fetch(`/api/feedback-cozinha/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const d = await r.json();
      if (!d.success) throw new Error(d.error);
      const f = d.feedback;
      const tipoTxt = f.tipoRefeicao === 'manha' ? 'Lanche da Manhã' : f.tipoRefeicao === 'almoco' ? 'Almoço' : 'Lanche da Tarde';
      const notaNum = parseInt(f.nota) || 0;
      const w = window.open('', '_blank');
      w.document.write(`
        <!DOCTYPE html><html><head><title>Feedback - ${this.escapeHtml(f.alunoNome)}</title>
        <style>
          body { font-family: Arial; padding: 40px; max-width: 600px; margin: 0 auto; }
          h1 { text-align: center; color: #1e3c72; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #1e3c72; padding-bottom: 20px; }
          .info { background: #f8fafc; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
          .info-item { margin-bottom: 12px; }
          .label { font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600; }
          .value { font-size: 16px; color: #1e293b; margin-top: 4px; }
          .block { margin-bottom: 20px; padding: 15px; border-radius: 10px; }
          .comentario { background: #fef3c7; border-left: 4px solid #f59e0b; }
          .sugestao { background: #dbeafe; border-left: 4px solid #3b82f6; }
          .stars { color: #f59e0b; font-size: 24px; }
          .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e5e7eb; padding-top: 20px; }
        </style></head><body>
        <div class="header"><h1>🍽️ EducaPleno - Feedback</h1><p>Relatório individual de avaliação</p></div>
        <div class="info">
          <div class="info-item"><div class="label">Aluno</div><div class="value"><strong>${this.escapeHtml(f.alunoNome)}</strong>${f.anonimo ? ' (Anônimo)' : ''}</div></div>
          ${f.alunoCurso ? `<div class="info-item"><div class="label">Curso</div><div class="value">${this.escapeHtml(f.alunoCurso)}</div></div>` : ''}
          ${f.alunoTurma ? `<div class="info-item"><div class="label">Turma</div><div class="value">${this.escapeHtml(f.alunoTurma)}</div></div>` : ''}
          <div class="info-item"><div class="label">Refeição</div><div class="value">${tipoTxt}</div></div>
          <div class="info-item"><div class="label">Nota</div><div class="value stars">${'★'.repeat(notaNum)}${'☆'.repeat(5 - notaNum)} (${notaNum}/5)</div></div>
          <div class="info-item"><div class="label">Gostou?</div><div class="value">${f.gostou === 'sim' ? '👍 Sim' : f.gostou === 'mais_ou_menos' ? '😐 Mais ou menos' : f.gostou === 'nao' ? '👎 Não' : 'Não informado'}</div></div>
          <div class="info-item"><div class="label">Data</div><div class="value">${new Date(f.createdAt).toLocaleString('pt-BR')}</div></div>
        </div>
        ${f.comentario ? `<div class="block comentario"><div class="label">💬 Comentário</div><div class="value">${this.escapeHtml(f.comentario)}</div></div>` : ''}
        ${f.sugestao ? `<div class="block sugestao"><div class="label">💡 Sugestão</div><div class="value">${this.escapeHtml(f.sugestao)}</div></div>` : ''}
        <div class="footer">Impresso em ${new Date().toLocaleString('pt-BR')} - EducaPleno</div>
        </body></html>
      `);
      w.document.close();
      setTimeout(() => w.print(), 500);
    } catch (e) { this.showToastMessage('❌ ' + e.message, 'error'); }
  }

  // ============================================================
  // IMPRIMIR REGISTRO
  // ============================================================
  async imprimirRegistroRefeicao(id) {
    try {
      const token = localStorage.getItem('auth_token');
      const r = await fetch(`/api/cozinha-monitoramento/registro/${id}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Erro ao carregar');
      const reg = d.registro;
      const tipoTxt = reg.tipoRefeicao === 'manha' ? 'Lanche da Manhã' : reg.tipoRefeicao === 'almoco' ? 'Almoço' : 'Lanche da Tarde';
      const w = window.open('', '_blank');
      w.document.write(`
        <!DOCTYPE html><html><head><title>Registro - ${this.escapeHtml(reg.alunoNome)}</title>
        <style>
          body { font-family: Arial; padding: 40px; max-width: 600px; margin: 0 auto; }
          h1 { text-align: center; color: #1e3c72; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #1e3c72; padding-bottom: 20px; }
          .info { background: #f8fafc; padding: 20px; border-radius: 10px; }
          .info-item { margin-bottom: 12px; }
          .label { font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600; }
          .value { font-size: 16px; color: #1e293b; margin-top: 4px; }
          .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e5e7eb; padding-top: 20px; }
        </style></head><body>
        <div class="header"><h1>🍽️ EducaPleno - Registro de Refeição</h1><p>Comprovante individual</p></div>
        <div class="info">
          <div class="info-item"><div class="label">Aluno</div><div class="value"><strong>${this.escapeHtml(reg.alunoNome)}</strong></div></div>
          <div class="info-item"><div class="label">Turma</div><div class="value">${this.escapeHtml(reg.alunoTurma || '-')}</div></div>
          <div class="info-item"><div class="label">Refeição</div><div class="value">${tipoTxt}</div></div>
          <div class="info-item"><div class="label">Data/Hora</div><div class="value">${new Date(reg.horario).toLocaleString('pt-BR')}</div></div>
          <div class="info-item"><div class="label">Validado por</div><div class="value">${this.escapeHtml(reg.validadoPorNome || '-')}</div></div>
          ${reg.observacao ? `<div class="info-item"><div class="label">Observação</div><div class="value">${this.escapeHtml(reg.observacao)}</div></div>` : ''}
        </div>
        <div class="footer">Impresso em ${new Date().toLocaleString('pt-BR')} - EducaPleno</div>
        </body></html>
      `);
      w.document.close();
      setTimeout(() => w.print(), 500);
    } catch (e) { this.showToastMessage('❌ ' + e.message, 'error'); }
  }

  parar() {
    if (this.eventSource) this.eventSource.close();
    if (this.atualizacaoTimer) clearInterval(this.atualizacaoTimer);
  }
}

let monitoramentoTempoReal = null;
document.addEventListener('DOMContentLoaded', () => {
  monitoramentoTempoReal = new MonitoramentoTempoReal();
  window.monitoramentoTempoReal = monitoramentoTempoReal;
});