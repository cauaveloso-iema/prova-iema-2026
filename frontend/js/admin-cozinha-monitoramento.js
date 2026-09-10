// ============================================
// ADMIN COZINHA - MONITORAMENTO EM TEMPO REAL
// Versão corrigida e otimizada
// ============================================

class MonitoramentoTempoReal {
  constructor() {
    this.eventSource = null;
    this.dados = null;
    this.atualizacaoTimer = null;
    this.graficos = {};
    this.todosFeedbacks = [];
    this.feedbacksFiltrados = [];
    this.paginaCarregada = false;
    
    // Dados originais (backup para filtros)
    this.ultimosRegistrosOriginais = [];
    this.refeicoesPorTurmaOriginais = [];
    
    // Estado dos filtros
    this.filtroRegistroData = 'hoje';
    this.filtroRegistroTurma = 'todas';
    this.filtroRegistroRefeicao = 'todas';
    
    this.filtroTurmasData = 'hoje';
    this.filtroTurmasTurma = 'todas';
    this.filtroTurmasTurno = 'todas';
    
    // Controle
    this.carregando = false;
    this.cacheDados = new Map();
  }
  
  // ============================================
  // CARREGAMENTO PRINCIPAL
  // ============================================
  async carregar() {
    console.log('📊 Carregando Monitoramento em Tempo Real...');
    this.paginaCarregada = true;
    this.carregarFiltrosSalvos();
    await this.carregarDadosCompleto();
    await this.carregarFeedbacksCompleto();
    this.iniciarEventosSSE();
    this.iniciarAtualizacaoAutomatica();
  }
  
  // ============================================
  // PERSISTÊNCIA DOS FILTROS
  // ============================================
  salvarFiltros() {
    const filtros = {
      registroData: this.filtroRegistroData,
      registroTurma: this.filtroRegistroTurma,
      registroTipo: this.filtroRegistroRefeicao,
      turmasData: this.filtroTurmasData,
      turmasTurma: this.filtroTurmasTurma,
      turmasTurno: this.filtroTurmasTurno,
      timestamp: new Date().toISOString()
    };
    try {
      localStorage.setItem('monitoramento_filtros', JSON.stringify(filtros));
    } catch (e) {
      console.warn('Não foi possível salvar filtros:', e);
    }
  }
  
  carregarFiltrosSalvos() {
    const salvos = localStorage.getItem('monitoramento_filtros');
    if (!salvos) return;
    
    try {
      const filtros = JSON.parse(salvos);
      this.filtroRegistroData = filtros.registroData || 'hoje';
      this.filtroRegistroTurma = filtros.registroTurma || 'todas';
      this.filtroRegistroRefeicao = filtros.registroTipo || 'todas';
      this.filtroTurmasData = filtros.turmasData || 'hoje';
      this.filtroTurmasTurma = filtros.turmasTurma || 'todas';
      this.filtroTurmasTurno = filtros.turmasTurno || 'todas';
    } catch (e) {
      console.warn('Erro ao carregar filtros salvos:', e);
    }
  }
  
  aplicarFiltrosSalvosNosSelects() {
    const aplicar = (id, valor) => {
      const select = document.getElementById(id);
      if (select) select.value = valor;
    };
    
    aplicar('filtroRegistroData', this.filtroRegistroData);
    aplicar('filtroRegistroTurma', this.filtroRegistroTurma);
    aplicar('filtroRegistroTipo', this.filtroRegistroRefeicao);
    aplicar('filtroTurmasRefeicaoData', this.filtroTurmasData);
    aplicar('filtroTurmasRefeicaoTurma', this.filtroTurmasTurma);
    aplicar('filtroTurmasRefeicaoTurno', this.filtroTurmasTurno);
  }
  
  // ============================================
  // UTILITÁRIOS
  // ============================================
  getDataPorPeriodo(periodo) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    switch(periodo) {
      case 'ontem': {
        const ontem = new Date(hoje);
        ontem.setDate(ontem.getDate() - 1);
        return ontem.toISOString().split('T')[0];
      }
      case 'semana': {
        const semana = new Date(hoje);
        semana.setDate(semana.getDate() - 7);
        return semana.toISOString().split('T')[0];
      }
      case 'mes': {
        const mes = new Date(hoje);
        mes.setMonth(mes.getMonth() - 1);
        return mes.toISOString().split('T')[0];
      }
      default:
        return null;
    }
  }
  
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  gerarEstrelasMini(nota) {
    const cheias = Math.floor(nota);
    let html = '';
    for (let i = 0; i < cheias; i++) html += '<i class="fas fa-star text-warning"></i>';
    for (let i = cheias; i < 5; i++) html += '<i class="far fa-star text-warning"></i>';
    return html;
  }
  
  showToastMessage(mensagem, tipo = 'info') {
    if (typeof admin !== 'undefined' && admin.showToast) {
      admin.showToast(mensagem, tipo);
      return;
    }
    
    const container = document.getElementById('toastContainer');
    if (!container) {
      alert(mensagem);
      return;
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    const icones = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      info: 'fa-info-circle',
      warning: 'fa-exclamation-triangle'
    };
    toast.innerHTML = `<i class="fas ${icones[tipo] || 'fa-info-circle'}"></i><span>${mensagem}</span>`;
    toast.style.cssText = `
      position: fixed; bottom: 20px; right: 20px;
      background: ${tipo === 'success' ? '#10b981' : tipo === 'error' ? '#ef4444' : tipo === 'warning' ? '#f59e0b' : '#3b82f6'};
      color: white; padding: 12px 20px; border-radius: 8px;
      display: flex; align-items: center; gap: 10px; z-index: 10000;
      animation: slideIn 0.3s ease; max-width: 400px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }
  
  mostrarLoadingIndicators(mostrar) {
    if (mostrar) {
      const registrosContainer = document.querySelector('.registros-list');
      if (registrosContainer) {
        registrosContainer.innerHTML = `
          <div class="loading-state" style="text-align: center; padding: 40px;">
            <i class="fas fa-spinner fa-spin"></i> Carregando registros...
          </div>
        `;
      }
      
      const turmasBody = document.querySelector('#tabelaRefeicoesTurmas tbody');
      if (turmasBody) {
        turmasBody.innerHTML = `
          <tr><td colspan="6" class="text-center">
            <i class="fas fa-spinner fa-spin"></i> Carregando...
          </td></tr>
        `;
      }
    }
  }
  
  // ============================================
  // CARREGAR DADOS
  // ============================================
  async carregarDadosCompleto(dataParam = null, usarCache = true) {
    if (this.carregando) {
      console.log('⏳ Já carregando...');
      return;
    }
    
    this.carregando = true;
    this.mostrarLoadingIndicators(true);
    
    try {
      const token = localStorage.getItem('auth_token');
      
      let dataParaBuscar = dataParam;
      if (!dataParaBuscar && this.filtroRegistroData !== 'hoje' && this.filtroRegistroData !== 'todos') {
        dataParaBuscar = this.getDataPorPeriodo(this.filtroRegistroData);
      }
      
      const cacheKey = dataParaBuscar || (this.filtroRegistroData === 'todos' ? 'todos' : 'hoje');
      
      if (usarCache && this.cacheDados.has(cacheKey)) {
        console.log(`📦 Usando cache: ${cacheKey}`);
        this.dados = this.cacheDados.get(cacheKey);
        this.processarDadosAposCarregamento();
        return;
      }
      
      let url = '/api/monitoramento-cozinha/dashboard';
      if (dataParaBuscar && this.filtroRegistroData !== 'todos') {
        url += `?data=${dataParaBuscar}`;
      }
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      if (data.success) {
        this.cacheDados.set(cacheKey, data);
        if (this.cacheDados.size > 5) {
          const firstKey = this.cacheDados.keys().next().value;
          this.cacheDados.delete(firstKey);
        }
        this.dados = data;
        this.processarDadosAposCarregamento();
      } else {
        this.renderizarErro(data.error);
      }
    } catch (error) {
      console.error('Erro:', error);
      this.renderizarErro(error.message);
    } finally {
      this.mostrarLoadingIndicators(false);
      this.carregando = false;
    }
  }
  
  processarDadosAposCarregamento() {
    if (!this.dados) return;
    
    this.ultimosRegistrosOriginais = [...(this.dados.cozinha?.ultimosRegistros || [])];
    this.refeicoesPorTurmaOriginais = [...(this.dados.cozinha?.refeicoesPorTurma || [])];
    
    const precisaRenderizar = !document.querySelector('.monitoramento-dashboard');
    
    if (precisaRenderizar) {
      this.renderizar(this.dados);
    } else {
      this.atualizarElementosExistentes(this.dados);
    }
    
    this.atualizarGraficos(this.dados);
    this.atualizarTimestamp(this.dados.timestamp);
    
    setTimeout(() => {
      this.popularFiltrosTurmas();
      this.aplicarFiltrosSalvosNosSelects();
      this.configurarEventosFiltros();
      this.filtrarRegistrosAtuais(this.filtroRegistroTurma, this.filtroRegistroRefeicao);
      this.filtrarRefeicoesTurmasAtuais(this.filtroTurmasTurma, this.filtroTurmasTurno);
    }, 100);
  }
  
  async carregarDados() {
    if (!this.paginaCarregada) return;
    
    const contentArea = document.getElementById('contentArea');
    if (!contentArea || !contentArea.querySelector('.monitoramento-dashboard')) {
      return;
    }
    
    if (this.carregando) return;
    
    try {
      const token = localStorage.getItem('auth_token');
      
      let dataParaBuscar = null;
      if (this.filtroRegistroData !== 'hoje' && this.filtroRegistroData !== 'todos') {
        dataParaBuscar = this.getDataPorPeriodo(this.filtroRegistroData);
      }
      
      let url = '/api/monitoramento-cozinha/dashboard';
      if (dataParaBuscar) url += `?data=${dataParaBuscar}`;
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      if (data.success) {
        this.dados = data;
        this.ultimosRegistrosOriginais = [...(data.cozinha?.ultimosRegistros || [])];
        this.refeicoesPorTurmaOriginais = [...(data.cozinha?.refeicoesPorTurma || [])];
        
        this.filtrarRegistrosAtuais(this.filtroRegistroTurma, this.filtroRegistroRefeicao);
        this.filtrarRefeicoesTurmasAtuais(this.filtroTurmasTurma, this.filtroTurmasTurno);
        this.atualizarElementosExistentes(data);
        this.atualizarGraficos(data);
        this.atualizarTimestamp(data.timestamp);
      }
    } catch (error) {
      console.error('Erro ao atualizar dados:', error);
    }
  }
  
  // ============================================
  // FILTROS - POPULAR TURMAS
  // ============================================
  popularFiltrosTurmas() {
    const turmasRegistros = [...new Set(
      this.ultimosRegistrosOriginais.map(r => r.alunoTurma).filter(Boolean)
    )];
    const turmasRefeicoes = [...new Set(
      this.refeicoesPorTurmaOriginais.map(t => t.turma).filter(Boolean)
    )];
    const todasTurmas = [...new Set([...turmasRegistros, ...turmasRefeicoes])].sort();
    
    const atualizarSelect = (selectId, turmas) => {
      const select = document.getElementById(selectId);
      if (!select) return;
      
      const valorAtual = select.value;
      select.innerHTML = '<option value="todas">Todas as turmas</option>';
      turmas.forEach(turma => {
        select.innerHTML += `<option value="${this.escapeHtml(turma)}">${this.escapeHtml(turma)}</option>`;
      });
      
      if (valorAtual !== 'todas' && turmas.includes(valorAtual)) {
        select.value = valorAtual;
      }
    };
    
    atualizarSelect('filtroRegistroTurma', todasTurmas);
    atualizarSelect('filtroTurmasRefeicaoTurma', todasTurmas);
    atualizarSelect('filtroRodizioTurma', todasTurmas);
  }
  
  // ============================================
  // FILTROS - REGISTROS
  // ============================================
  async aplicarFiltrosRegistros() {
    const novaData = document.getElementById('filtroRegistroData')?.value || 'hoje';
    const novaTurma = document.getElementById('filtroRegistroTurma')?.value || 'todas';
    const novoTipo = document.getElementById('filtroRegistroTipo')?.value || 'todas';
    
    const mudouData = novaData !== this.filtroRegistroData;
    
    this.filtroRegistroData = novaData;
    this.filtroRegistroTurma = novaTurma;
    this.filtroRegistroRefeicao = novoTipo;
    
    this.salvarFiltros();
    
    try {
      if (mudouData && novaData !== 'todos') {
        const dataParaBuscar = novaData !== 'hoje' ? this.getDataPorPeriodo(novaData) : null;
        await this.carregarDadosCompleto(dataParaBuscar, true);
      }
      
      this.filtrarRegistrosAtuais(novaTurma, novoTipo);
    } catch (error) {
      console.error('Erro ao aplicar filtros:', error);
    }
  }
  
  filtrarRegistrosAtuais(turma, tipo) {
    const registros = this.ultimosRegistrosOriginais;
    
    if (!registros || registros.length === 0) {
      this.atualizarListaRegistros([]);
      this.atualizarContadorRegistros(0);
      return;
    }
    
    const filtrados = registros.filter(r => {
      if (turma !== 'todas' && r.alunoTurma !== turma) return false;
      if (tipo !== 'todas' && r.tipoRefeicao !== tipo) return false;
      return true;
    });
    
    this.atualizarListaRegistros(filtrados);
    this.atualizarContadorRegistros(filtrados.length);
  }
  
  atualizarContadorRegistros(total) {
    const contador = document.getElementById('registrosFiltradosCount');
    if (contador) contador.textContent = `${total} registros`;
  }
  
  atualizarListaRegistros(registros) {
    const container = document.querySelector('.registros-list');
    if (!container) return;
    
    if (!registros || registros.length === 0) {
      container.innerHTML = '<div class="empty-state">Nenhum registro encontrado com os filtros selecionados</div>';
      return;
    }
    
    container.innerHTML = registros.map(r => {
      const tipoTexto = r.tipoRefeicao === 'manha' ? '🌅 Manhã' : 
                        r.tipoRefeicao === 'almoco' ? '🍽️ Almoço' : '🌙 Tarde';
      
      return `
        <div class="registro-item">
          <div class="registro-info">
            <div class="registro-nome"><strong>${this.escapeHtml(r.alunoNome)}</strong></div>
            <div class="registro-turma">${this.escapeHtml(r.alunoTurma)}</div>
            <div class="registro-detalhes">
              <span class="refeicao-badge ${r.tipoRefeicao}">${tipoTexto}</span>
              <span class="registro-horario"><i class="far fa-clock"></i> ${new Date(r.horario).toLocaleTimeString()}</span>
              <span class="registro-data"><i class="far fa-calendar-alt"></i> ${new Date(r.horario).toLocaleDateString()}</span>
            </div>
          </div>
          <div class="action-buttons">
            <button class="btn-icon" onclick="admin.verDetalhesRegistro('${r.id}')" title="Ver detalhes">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn-icon edit" onclick="admin.editarRegistroRefeicao('${r.id}')" title="Editar registro">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon danger" onclick="admin.excluirRegistroRefeicao('${r.id}', '${this.escapeHtml(r.alunoNome)}', '${r.tipoRefeicao}')" title="Excluir">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }
  
  limparFiltrosRegistros() {
    this.filtroRegistroData = 'hoje';
    this.filtroRegistroTurma = 'todas';
    this.filtroRegistroRefeicao = 'todas';
    this.salvarFiltros();
    
    const turmaSelect = document.getElementById('filtroRegistroTurma');
    const tipoSelect = document.getElementById('filtroRegistroTipo');
    const dataSelect = document.getElementById('filtroRegistroData');
    
    if (turmaSelect) turmaSelect.value = 'todas';
    if (tipoSelect) tipoSelect.value = 'todas';
    if (dataSelect) dataSelect.value = 'hoje';
    
    this.carregarDadosCompleto(null, false);
  }
  
  // ============================================
  // FILTROS - REFEIÇÕES POR TURMA
  // ============================================
  async aplicarFiltrosRefeicoesTurmas() {
    const novaData = document.getElementById('filtroTurmasRefeicaoData')?.value || 'hoje';
    const novaTurma = document.getElementById('filtroTurmasRefeicaoTurma')?.value || 'todas';
    const novoTurno = document.getElementById('filtroTurmasRefeicaoTurno')?.value || 'todas';
    
    const mudouData = novaData !== this.filtroTurmasData;
    
    this.filtroTurmasData = novaData;
    this.filtroTurmasTurma = novaTurma;
    this.filtroTurmasTurno = novoTurno;
    
    this.salvarFiltros();
    
    try {
      if (mudouData && novaData !== 'todos') {
        const dataParaBuscar = novaData !== 'hoje' ? this.getDataPorPeriodo(novaData) : null;
        await this.carregarDadosCompleto(dataParaBuscar, true);
      }
      
      this.filtrarRefeicoesTurmasAtuais(novaTurma, novoTurno);
    } catch (error) {
      console.error('Erro:', error);
    }
  }
  
  filtrarRefeicoesTurmasAtuais(turma, turno) {
    if (!this.refeicoesPorTurmaOriginais || this.refeicoesPorTurmaOriginais.length === 0) {
      this.atualizarTabelaRefeicoesTurmas([]);
      this.atualizarContadorTurmas(0);
      return;
    }
    
    let dados = [...this.refeicoesPorTurmaOriginais];
    
    if (turma !== 'todas') {
      dados = dados.filter(t => t.turma === turma);
    }
    
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
    
    this.atualizarTabelaRefeicoesTurmas(dados);
    this.atualizarContadorTurmas(dados.length);
  }
  
  atualizarContadorTurmas(total) {
    const contador = document.getElementById('turmasFiltradosCount');
    if (contador) {
      contador.textContent = `${total} ${total === 1 ? 'turma' : 'turmas'}`;
    }
  }
  
  atualizarTabelaRefeicoesTurmas(dados) {
    const tbody = document.querySelector('#tabelaRefeicoesTurmas tbody');
    if (!tbody) return;
    
    if (!dados || dados.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center empty-state">Nenhuma turma encontrada</td></tr>';
      return;
    }
    
    tbody.innerHTML = dados.map(t => `
      <tr>
        <td><strong>${this.escapeHtml(t.turma)}</strong></td>
        <td class="text-center">${t.manha || 0}</td>
        <td class="text-center">${t.almoco || 0}</td>
        <td class="text-center">${t.tarde || 0}</td>
        <td class="text-center"><strong>${t.total || 0}</strong></td>
        <td class="text-center">${t.alunosQueComeram || 0}</td>
      </tr>
    `).join('');
  }
  
  limparFiltrosRefeicoesTurmas() {
    this.filtroTurmasData = 'hoje';
    this.filtroTurmasTurma = 'todas';
    this.filtroTurmasTurno = 'todas';
    this.salvarFiltros();
    
    const turmaSelect = document.getElementById('filtroTurmasRefeicaoTurma');
    const turnoSelect = document.getElementById('filtroTurmasRefeicaoTurno');
    const dataSelect = document.getElementById('filtroTurmasRefeicaoData');
    
    if (turmaSelect) turmaSelect.value = 'todas';
    if (turnoSelect) turnoSelect.value = 'todas';
    if (dataSelect) dataSelect.value = 'hoje';
    
    this.carregarDadosCompleto(null, false);
  }
  
  // ============================================
  // FILTROS - RODÍZIO
  // ============================================
  aplicarFiltrosRodizio() {
    const turma = document.getElementById('filtroRodizioTurma')?.value || 'todas';
    const tipo = document.getElementById('filtroRodizioTipo')?.value || 'todos';
    
    const linhas = document.querySelectorAll('#tabelaRodizio tbody tr');
    let visiveis = 0;
    
    linhas.forEach(linha => {
      const turmaLinha = linha.getAttribute('data-turma') || '';
      const tipoLinha = linha.getAttribute('data-tipo') || '';
      
      let mostrar = true;
      if (turma !== 'todas' && turmaLinha !== turma) mostrar = false;
      if (tipo !== 'todos' && tipoLinha !== tipo) mostrar = false;
      
      linha.style.display = mostrar ? '' : 'none';
      if (mostrar) visiveis++;
    });
    
    const contador = document.getElementById('rodizioFiltradosCount');
    if (contador) contador.textContent = `${visiveis} rodízios`;
  }
  
  limparFiltrosRodizio() {
    const turmaSelect = document.getElementById('filtroRodizioTurma');
    const tipoSelect = document.getElementById('filtroRodizioTipo');
    
    if (turmaSelect) turmaSelect.value = 'todas';
    if (tipoSelect) tipoSelect.value = 'todos';
    
    const linhas = document.querySelectorAll('#tabelaRodizio tbody tr');
    linhas.forEach(linha => linha.style.display = '');
    
    const contador = document.getElementById('rodizioFiltradosCount');
    if (contador) contador.textContent = `${linhas.length} rodízios`;
  }
  
  // ============================================
  // FILTROS - FEEDBACK
  // ============================================
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
        const isAnonimo = anonimo === 'sim';
        if (f.anonimo !== isAnonimo) return false;
      }
      
      if (busca) {
        const nomeMatch = (f.alunoNome || '').toLowerCase().includes(busca);
        const turmaMatch = (f.alunoTurma || '').toLowerCase().includes(busca);
        const comentarioMatch = (f.comentario || '').toLowerCase().includes(busca);
        if (!nomeMatch && !turmaMatch && !comentarioMatch) return false;
      }
      
      return true;
    });
    
    this.atualizarListaFeedbacks();
    const filtradosEl = document.getElementById('feedbacksFiltrados');
    if (filtradosEl) filtradosEl.textContent = this.feedbacksFiltrados.length;
  }
  
  limparFiltrosFeedback() {
    const refeicaoSelect = document.getElementById('filtroRefeicaoFeedback');
    const notaSelect = document.getElementById('filtroNotaMin');
    const gostouSelect = document.getElementById('filtroGostou');
    const anonimoSelect = document.getElementById('filtroAnonimo');
    const buscaInput = document.getElementById('filtroBuscaFeedback');
    
    if (refeicaoSelect) refeicaoSelect.value = 'todas';
    if (notaSelect) notaSelect.value = '1';
    if (gostouSelect) gostouSelect.value = 'todos';
    if (anonimoSelect) anonimoSelect.value = 'todos';
    if (buscaInput) buscaInput.value = '';
    
    this.aplicarFiltrosFeedback();
  }
  
  atualizarListaFeedbacks() {
    const tbody = document.getElementById('listaFeedbacksAdmin');
    if (!tbody) return;
    
    if (this.feedbacksFiltrados.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum feedback encontrado</td></tr>';
      return;
    }
    
    tbody.innerHTML = this.feedbacksFiltrados.map(f => {
      let notaClass = 'baixa';
      if (f.nota >= 4) notaClass = 'alta';
      else if (f.nota >= 2.5) notaClass = 'media';
      
      const tipoTexto = f.tipoRefeicao === 'manha' ? '🌅 Manhã' :
                        f.tipoRefeicao === 'almoco' ? '🍽️ Almoço' : '🌙 Tarde';
      
      return `
        <tr>
          <td>${this.escapeHtml(f.alunoNome)}${f.anonimo ? ' <i class="fas fa-user-secret text-muted"></i>' : ''}</td>
          <td>${this.escapeHtml(f.alunoTurma || '-')}</td>
          <td><span class="refeicao-badge ${f.tipoRefeicao}">${tipoTexto}</span></td>
          <td><span class="feedback-nota-badge ${notaClass}">${'★'.repeat(f.nota)}${'☆'.repeat(5 - f.nota)}</span></td>
          <td><small>${f.comentario ? (f.comentario.length > 50 ? this.escapeHtml(f.comentario.substring(0, 50)) + '...' : this.escapeHtml(f.comentario)) : '-'}</small></td>
          <td><small>${new Date(f.createdAt).toLocaleString()}</small></td>
        </tr>
      `;
    }).join('');
  }
  
  // ============================================
  // EVENTOS DOS FILTROS
  // ============================================
  configurarEventosFiltros() {
    console.log('🔧 Configurando eventos dos filtros...');
    
    const bind = (id, handler) => {
      const el = document.getElementById(id);
      if (el) el.onchange = handler;
    };
    
    // Registros
    const aplicarRegistros = () => this.aplicarFiltrosRegistros();
    bind('filtroRegistroTipo', aplicarRegistros);
    bind('filtroRegistroData', aplicarRegistros);
    bind('filtroRegistroTurma', aplicarRegistros);
    
    // Refeições por Turma
    const aplicarTurmas = () => this.aplicarFiltrosRefeicoesTurmas();
    bind('filtroTurmasRefeicaoTurma', aplicarTurmas);
    bind('filtroTurmasRefeicaoTurno', aplicarTurmas);
    bind('filtroTurmasRefeicaoData', aplicarTurmas);
    
    // Rodízio
    const aplicarRodizio = () => this.aplicarFiltrosRodizio();
    bind('filtroRodizioTurma', aplicarRodizio);
    bind('filtroRodizioTipo', aplicarRodizio);
    
    // Feedback
    const aplicarFeedback = () => this.aplicarFiltrosFeedback();
    bind('filtroRefeicaoFeedback', aplicarFeedback);
    bind('filtroNotaMin', aplicarFeedback);
    bind('filtroGostou', aplicarFeedback);
    bind('filtroAnonimo', aplicarFeedback);
    
    const buscaInput = document.getElementById('filtroBuscaFeedback');
    if (buscaInput) buscaInput.oninput = aplicarFeedback;
    
    console.log('✅ Eventos configurados');
  }
  
  // ============================================
  // FEEDBACKS
  // ============================================
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
        this.atualizarFeedbacksNoDOM(data);
      }
    } catch (error) {
      console.error('Erro ao carregar feedbacks:', error);
    }
  }
  
  async carregarFeedbacks() {
    if (!this.paginaCarregada) return;
    
    const contentArea = document.getElementById('contentArea');
    if (!contentArea || !contentArea.querySelector('.monitoramento-dashboard')) return;
    
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/feedback-cozinha/estatisticas', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (data.success) {
        this.todosFeedbacks = data.ultimosFeedbacks || [];
        this.feedbacksFiltrados = [...this.todosFeedbacks];
        this.atualizarFeedbacksNoDOM(data);
      }
    } catch (error) {
      console.error('Erro ao carregar feedbacks:', error);
    }
  }
  
  atualizarFeedbacksNoDOM(data) {
    const stats = data.estatisticas || {};
    
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
    
    setText('totalFeedbacks', stats.total || 0);
    setText('totalFeedbacksBadge', stats.total || 0);
    setText('mediaNotas', stats.mediaNotas || 0);
    setText('feedbacksFiltrados', stats.total || 0);
    setText('feedbacksCount', this.todosFeedbacks.length);
    
    const estrelasMedia = document.getElementById('estrelasMedia');
    if (estrelasMedia) {
      estrelasMedia.innerHTML = this.gerarEstrelasMini(parseFloat(stats.mediaNotas) || 0);
    }
    
    const maxNota = Math.max(...Object.values(stats.distribuicaoNotas || {}), 1);
    for (let i = 1; i <= 5; i++) {
      const count = (stats.distribuicaoNotas || {})[i] || 0;
      const percent = (count / maxNota) * 100;
      const bar = document.getElementById(`bar${i}`);
      const countSpan = document.getElementById(`count${i}`);
      if (bar) bar.style.width = `${percent}%`;
      if (countSpan) countSpan.textContent = count;
    }
    
    setText('gostaramSim', stats.gostouStats?.sim || 0);
    setText('gostaramMaisMenos', stats.gostouStats?.mais_ou_menos || 0);
    setText('gostaramNao', stats.gostouStats?.nao || 0);
    setText('mediaDetalhada', `${stats.mediaNotas || 0}/5`);
    
    const totalGostou = (stats.gostouStats?.sim || 0) + (stats.gostouStats?.mais_ou_menos || 0);
    const aprovacao = stats.total > 0 ? Math.round((totalGostou / stats.total) * 100) : 0;
    setText('gostaram', `${aprovacao}%`);
    
    this.atualizarListaFeedbacks();
  }
  
  // ============================================
  // ATUALIZAÇÕES E ELEMENTOS
  // ============================================
  atualizarElementosExistentes(data) {
    const cozinha = data.cozinha || {};
    const gestao = data.gestaoGeral || {};
    const contagem = cozinha.contagemRefeicoes || { manha: 0, almoco: 0, tarde: 0, total: 0, pessoasUnicas: 0 };
    const perfis = cozinha.perfisAlimentares || { sempre: 0, as_vezes: 0, nunca: 0 };
    const previsao = cozinha.previsaoComida || { manha: 0, almoco: 0, tarde: 0, total: 0 };
    const adesao = cozinha.totalPessoas ? ((contagem.pessoasUnicas / cozinha.totalPessoas) * 100).toFixed(0) : 0;
    
    // Atualiza métricas principais
    const metricValues = document.querySelectorAll('.metric-value');
    if (metricValues.length >= 3) {
      metricValues[0].textContent = cozinha.totalPessoas || 0;
      metricValues[1].textContent = contagem.total;
      metricValues[2].textContent = `${adesao}%`;
    }
    
    const metricDetails = document.querySelectorAll('.metric-detail');
    if (metricDetails.length >= 1) {
      metricDetails[0].textContent = `${contagem.pessoasUnicas} pessoas únicas`;
    }
    
    // Períodos
    const periodoValues = document.querySelectorAll('.periodo-value');
    if (periodoValues.length >= 3) {
      periodoValues[0].textContent = contagem.manha;
      periodoValues[1].textContent = contagem.almoco;
      periodoValues[2].textContent = contagem.tarde;
    }
    
    // Previsão
    const previsaoValues = document.querySelectorAll('.previsao-value');
    if (previsaoValues.length >= 4) {
      previsaoValues[0].textContent = previsao.manha;
      previsaoValues[1].textContent = previsao.almoco;
      previsaoValues[2].textContent = previsao.tarde;
      previsaoValues[3].textContent = previsao.total;
    }
    
    // Legenda
    const legendValues = document.querySelectorAll('.legend-item strong');
    if (legendValues.length >= 3) {
      legendValues[0].textContent = perfis.sempre;
      legendValues[1].textContent = perfis.as_vezes;
      legendValues[2].textContent = perfis.nunca;
    }
    
    // Rodízio stats
    const statNumbers = document.querySelectorAll('.rodizio-stat .stat-number');
    if (statNumbers.length >= 3) {
      statNumbers[0].textContent = gestao.totalRodizios || 0;
      statNumbers[1].textContent = gestao.turmasComRodizio || 0;
      statNumbers[2].textContent = gestao.turmasSemRodizio || 0;
    }
    
    // Info footer
    const infoFooter = document.querySelector('.info-footer');
    if (infoFooter && gestao.hoje) {
      infoFooter.innerHTML = `
        <i class="fas fa-calendar-day"></i>
        Hoje: ${gestao.hoje.data || ''} - ${gestao.hoje.diaSemana || ''} 
        (Dia ${gestao.hoje.diaMes || ''} do mês, ${gestao.hoje.semanaMes || ''}ª semana)
      `;
    }
    
    // Tabela rodízio
    const rodizioBody = document.querySelector('#tabelaRodizio tbody');
    if (rodizioBody && gestao.rodizios) {
      rodizioBody.innerHTML = gestao.rodizios.map(r => {
        let diasTexto = '';
        if (r.tipo === 'semanal') {
          diasTexto = (r.diasSemana || []).join(', ');
        } else if (r.tipo === 'mensal') {
          diasTexto = `${r.semanasMes?.map(s => `${s}ª`).join(', ') || ''} semana(s)`;
        } else {
          diasTexto = 'Ambos sistemas';
        }
        
        return `
          <tr data-turma="${r.turma}" data-tipo="${r.tipo}">
            <td><strong>${r.turma}</strong></td>
            <td><span class="tipo-badge ${r.tipo}">${r.tipo === 'semanal' ? 'Semanal' : r.tipo === 'mensal' ? 'Mensal' : 'Ambos'}</span></td>
            <td class="dias-cell">${diasTexto || '-'}</td>
            <td>${r.horario || '-'}</td>
            <td><span class="status-badge ${r.podeHoje ? 'active' : 'inactive'}">${r.podeHoje ? '✅ Permitido' : '❌ Não permitido'}</span></td>
            <td>
              <div class="action-buttons">
                <button class="btn-icon" onclick="admin.editarRodizioGestao('${r.turma}')" title="Editar">
                  <i class="fas fa-edit"></i>
                </button>
                <button class="btn-icon delete" onclick="admin.excluirRodizioGestao('${r.turma}')" title="Excluir">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
  }
  
  atualizarGraficos(data) {
    if (this.graficos.perfil) {
      const perfis = data.cozinha?.perfisAlimentares || {};
      this.graficos.perfil.data.datasets[0].data = [
        perfis.sempre || 0,
        perfis.as_vezes || 0,
        perfis.nunca || 0
      ];
      this.graficos.perfil.update();
    }
  }
  
  atualizarTimestamp(timestamp) {
    const el = document.getElementById('ultimaAtualizacao');
    if (el) el.textContent = new Date(timestamp).toLocaleTimeString('pt-BR');
  }
  
  // ============================================
  // SSE - SERVER SENT EVENTS
  // ============================================
  iniciarEventosSSE() {
    const token = localStorage.getItem('auth_token');
    this.eventSource = new EventSource(`/api/monitoramento-cozinha/eventos?token=${encodeURIComponent(token)}`);
    
    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'nova-refeicao') {
          this.carregarFeedbacks();
          this.carregarDados();
        }
        
        if (data.type === 'heartbeat') {
          const statusEl = document.getElementById('statusConexao');
          if (statusEl) {
            statusEl.innerHTML = '<i class="fas fa-circle"></i> Conectado';
            statusEl.className = 'status-badge online';
          }
        }
      } catch (e) {
        console.error('Erro ao processar evento:', e);
      }
    };
    
    this.eventSource.onerror = () => {
      const statusEl = document.getElementById('statusConexao');
      if (statusEl) {
        statusEl.innerHTML = '<i class="fas fa-circle"></i> Reconectando...';
        statusEl.className = 'status-badge offline';
      }
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
      console.log('🔄 Atualização automática...');
      this.carregarDados();
      this.carregarFeedbacks();
    }, 60000);
  }
  
  // ============================================
  // AÇÕES E UTILITÁRIOS
  // ============================================
  async atualizarForcado() {
    console.log('🔄 Atualização forçada...');
    
    const dataAtual = this.filtroRegistroData !== 'hoje' && this.filtroRegistroData !== 'todos' ? 
      this.getDataPorPeriodo(this.filtroRegistroData) : 
      (this.filtroRegistroData === 'todos' ? 'todos' : 'hoje');
    this.cacheDados.delete(dataAtual);
    
    const btnRefresh = document.querySelector('.btn-refresh');
    if (btnRefresh) {
      const originalHtml = btnRefresh.innerHTML;
      btnRefresh.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Atualizando...';
      btnRefresh.disabled = true;
      
      await this.carregarDadosCompleto(null, false);
      
      btnRefresh.innerHTML = originalHtml;
      btnRefresh.disabled = false;
    } else {
      await this.carregarDadosCompleto(null, false);
    }
    
    this.showToastMessage('✅ Dados atualizados!', 'success');
  }
  
  adicionarNotificacao(mensagem) {
    const container = document.querySelector('.alertas-grid');
    if (!container) return;
    
    const notif = document.createElement('div');
    notif.className = 'alerta-card info';
    notif.style.animation = 'slideIn 0.3s ease';
    notif.innerHTML = `
      <div class="alerta-icon"><i class="fas fa-bell"></i></div>
      <div class="alerta-content">
        <div class="alerta-title">🔔 Nova Atualização</div>
        <div class="alerta-message">${mensagem}</div>
      </div>
    `;
    container.prepend(notif);
    setTimeout(() => notif.remove(), 5000);
  }
  
  // ============================================
  // LIMPEZA DE REGISTROS
  // ============================================
  async verificarEstatisticasRegistros() {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/monitoramento-cozinha/estatisticas-registros', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) return null;
      const data = await response.json();
      return data.success ? data.estatisticas : null;
    } catch (error) {
      console.error('❌ Erro:', error);
      return null;
    }
  }
  
  async executarLimpezaRegistros(meses = 1) {
    let confirmado = false;
    
    if (typeof admin !== 'undefined' && admin.confirmar) {
      confirmado = await admin.confirmar(
        '🗑️ Limpeza de Registros Antigos',
        `Tem certeza que deseja remover registros com mais de <strong>${meses} mês(es)</strong>?<br><br>
        <span style="color: #dc3545;">⚠️ Esta ação não pode ser desfeita!</span>`
      );
    } else {
      confirmado = confirm(`⚠️ Remover registros com mais de ${meses} mês(es)?`);
    }
    
    if (!confirmado) return;
    
    try {
      this.showToastMessage('🔄 Executando limpeza...', 'info');
      
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/monitoramento-cozinha/limpar-registros-antigos', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ meses })
      });
      
      const data = await response.json();
      
      if (data.success) {
        this.showToastMessage(`✅ ${data.deletados} registros removidos!`, 'success');
        await this.carregarDadosCompleto(null, false);
      } else {
        throw new Error(data.error || 'Erro na limpeza');
      }
    } catch (error) {
      console.error('❌ Erro:', error);
      this.showToastMessage('❌ ' + error.message, 'error');
    }
  }
  
  async abrirModalLimpezaRegistros() {
    const modalBody = document.getElementById('modalBody');
    if (!modalBody) {
      this.showToastMessage('Erro: Modal não encontrado', 'error');
      return;
    }
    
    modalBody.innerHTML = `
      <div style="padding: 20px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="width: 70px; height: 70px; background: #fee2e2; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto;">
            <i class="fas fa-trash-alt" style="font-size: 30px; color: #dc2626;"></i>
          </div>
          <h3 style="margin: 15px 0 5px;">Limpeza de Registros Antigos</h3>
          <p style="color: #6b7280;">Remova registros de refeições antigos</p>
        </div>
        
        <div id="estatisticasContainer" style="background: #f8fafc; border-radius: 12px; padding: 15px; margin-bottom: 20px;">
          <p style="text-align: center;">Carregando estatísticas...</p>
        </div>
        
        <div class="form-group" style="margin-bottom: 20px;">
          <label style="display: block; margin-bottom: 8px; font-weight: 600;">
            <i class="fas fa-calendar-alt"></i> Período para manter
          </label>
          <select id="periodoLimpeza" style="width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #ddd;">
            <option value="1">Manter apenas 1 mês (recomendado)</option>
            <option value="2">Manter 2 meses</option>
            <option value="3">Manter 3 meses</option>
            <option value="6">Manter 6 meses</option>
            <option value="12">Manter 1 ano</option>
          </select>
        </div>
        
        <div style="background: #fef3c7; padding: 12px; border-radius: 8px; margin-bottom: 20px;">
          <i class="fas fa-info-circle"></i>
          <strong>💡 Dica:</strong> A limpeza é irreversível. Faça backup antes.
        </div>
        
        <div style="display: flex; gap: 10px;">
          <button onclick="admin.closeModal()" style="flex: 1; padding: 12px; background: #6c757d; color: white; border: none; border-radius: 8px; cursor: pointer;">
            Cancelar
          </button>
          <button onclick="monitoramentoTempoReal.confirmarLimpezaRegistros()" style="flex: 1; padding: 12px; background: #dc2626; color: white; border: none; border-radius: 8px; cursor: pointer;">
            <i class="fas fa-trash"></i> Executar Limpeza
          </button>
        </div>
      </div>
    `;
    
    const modalTitle = document.getElementById('modalTitle');
    if (modalTitle) modalTitle.innerHTML = '<i class="fas fa-trash-alt"></i> Limpeza de Registros';
    
    const modalSaveBtn = document.getElementById('modalSaveBtn');
    if (modalSaveBtn) modalSaveBtn.style.display = 'none';
    
    if (typeof admin !== 'undefined' && admin.openModal) {
      admin.openModal();
    } else {
      const modal = document.getElementById('modal');
      if (modal) modal.style.display = 'flex';
    }
    
    await this.carregarEstatisticasLimpeza();
  }
  
  async carregarEstatisticasLimpeza() {
    const container = document.getElementById('estatisticasContainer');
    if (!container) return;
    
    try {
      const stats = await this.verificarEstatisticasRegistros();
      if (stats) {
        container.innerHTML = `
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
            <div style="text-align: center;">
              <div style="font-size: 24px; font-weight: bold;">${stats.total}</div>
              <div style="font-size: 12px; color: #64748b;">Total</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 24px; font-weight: bold; color: #10b981;">${stats.ultimoMes}</div>
              <div style="font-size: 12px; color: #64748b;">Último mês</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 24px; font-weight: bold; color: #f59e0b;">${stats.anteriores}</div>
              <div style="font-size: 12px; color: #64748b;">Mais antigos</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 12px; font-weight: bold;">${stats.ultimaData ? `Até ${new Date(stats.ultimaData).toLocaleDateString()}` : 'Sem dados'}</div>
              <div style="font-size: 11px; color: #94a3b8;">Último registro</div>
            </div>
          </div>
        `;
      }
    } catch (error) {
      container.innerHTML = '<p style="text-align: center; color: #dc2626;">Erro ao carregar</p>';
    }
  }
  
  async confirmarLimpezaRegistros() {
    const periodo = document.getElementById('periodoLimpeza')?.value || 1;
    
    if (typeof admin !== 'undefined' && admin.closeModal) {
      admin.closeModal();
    } else {
      const modal = document.getElementById('modal');
      if (modal) modal.style.display = 'none';
    }
    
    await this.executarLimpezaRegistros(parseInt(periodo));
  }
  
  // ============================================
  // RENDERIZAÇÃO DE ERRO
  // ============================================
  renderizarErro(mensagem) {
    const container = document.getElementById('contentArea');
    if (!container) return;
    container.innerHTML = `
      <div class="error-state" style="text-align: center; padding: 60px; background: white; border-radius: 20px;">
        <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #dc2626; margin-bottom: 16px;"></i>
        <h3 style="margin-bottom: 8px; color: #1e293b;">Erro ao carregar dados</h3>
        <p style="color: #64748b; margin-bottom: 20px;">${this.escapeHtml(mensagem)}</p>
        <button class="btn-primary" onclick="monitoramentoTempoReal.carregarDadosCompleto()" 
                style="padding: 10px 24px; background: #1e3c72; color: white; border: none; border-radius: 8px; cursor: pointer;">
          <i class="fas fa-sync-alt"></i> Tentar novamente
        </button>
      </div>
    `;
  }
  
  // ============================================
  // RENDERIZAÇÃO PRINCIPAL
  // ============================================
  renderizar(data) {
    const container = document.getElementById('contentArea');
    if (!container) return;
    
    const cozinha = data.cozinha || {};
    const gestao = data.gestaoGeral || {};
    const contagem = cozinha.contagemRefeicoes || { manha: 0, almoco: 0, tarde: 0, total: 0, pessoasUnicas: 0 };
    const perfis = cozinha.perfisAlimentares || { sempre: 0, as_vezes: 0, nunca: 0 };
    const previsao = cozinha.previsaoComida || { manha: 0, almoco: 0, tarde: 0, total: 0 };
    const adesao = cozinha.totalPessoas ? ((contagem.pessoasUnicas / cozinha.totalPessoas) * 100).toFixed(0) : 0;
    
    const turmasUnicas = [...new Set((cozinha.refeicoesPorTurma || []).map(t => t.turma))].filter(Boolean);
    
    container.innerHTML = `
      <div class="monitoramento-dashboard" style="padding: 24px; max-width: 1400px; margin: 0 auto;">
        <div class="dashboard-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
          <div class="header-title" style="display: flex; align-items: center; gap: 16px;">
            <i class="fas fa-chart-line" style="font-size: 32px; color: #1e3c72; background: #e8f0fe; padding: 12px; border-radius: 16px;"></i>
            <div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #1e293b;">Monitoramento em Tempo Real</h1>
              <p style="margin: 4px 0 0; font-size: 14px; color: #64748b;">Dados da Coordenação de Pátio e Cozinha</p>
            </div>
          </div>
          <div class="header-status" style="display: flex; align-items: center; gap: 12px;">
            <span class="status-badge online" id="statusConexao" style="padding: 8px 16px; border-radius: 40px; font-size: 13px; background: #d1fae5; color: #065f46; display: flex; align-items: center; gap: 8px;">
              <i class="fas fa-circle" style="font-size: 8px; color: #10b981;"></i> Conectado
            </span>
            <button class="btn-refresh" onclick="monitoramentoTempoReal.atualizarForcado()" 
                    style="background: #f1f5f9; border: none; padding: 8px 16px; border-radius: 40px; font-size: 13px; font-weight: 500; color: #475569; cursor: pointer; display: flex; align-items: center; gap: 8px;">
              <i class="fas fa-sync-alt"></i> Atualizar
            </button>
            <button class="btn-refresh" onclick="monitoramentoTempoReal.abrirModalLimpezaRegistros()" 
                    style="background: #dc2626; color: white; border: none; padding: 8px 16px; border-radius: 40px; font-size: 13px; font-weight: 500; cursor: pointer;">
              <i class="fas fa-trash-alt"></i> Limpar Registros
            </button>
          </div>
        </div>

        ${(data.alertas || []).length > 0 ? `
          <div class="alertas-grid" style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px;">
            ${(data.alertas || []).map(a => `
              <div class="alerta-card ${a.tipo}" style="display: flex; gap: 16px; padding: 16px 20px; border-radius: 16px; background: ${a.tipo === 'warning' ? '#fffbeb' : '#eff6ff'}; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border-left: 4px solid ${a.tipo === 'warning' ? '#f59e0b' : '#3b82f6'};">
                <div class="alerta-icon"><i class="fas ${a.tipo === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}" style="font-size: 24px; color: ${a.tipo === 'warning' ? '#f59e0b' : '#3b82f6'};"></i></div>
                <div class="alerta-content" style="flex: 1;">
                  <div class="alerta-title" style="font-weight: 600; font-size: 14px; margin-bottom: 4px;">${a.titulo}</div>
                  <div class="alerta-message" style="font-size: 13px; color: #475569;">${a.mensagem}</div>
                  ${a.sugestao ? `<div class="alerta-sugestao" style="margin-top: 8px; font-size: 12px; color: #64748b;"><i class="fas fa-lightbulb"></i> ${a.sugestao}</div>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- MÉTRICAS -->
        <div class="metrics-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 20px; margin-bottom: 24px;">
          <div class="metric-card purple" style="background: white; border-radius: 20px; padding: 20px; display: flex; align-items: center; gap: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div class="metric-icon" style="width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: white; background: linear-gradient(135deg, #667eea, #764ba2);">
              <i class="fas fa-users"></i>
            </div>
            <div class="metric-info" style="flex: 1;">
              <div class="metric-value" style="font-size: 28px; font-weight: 700; color: #1e293b;">${cozinha.totalPessoas || 0}</div>
              <div class="metric-label" style="font-size: 13px; color: #64748b;">Total de Pessoas</div>
            </div>
          </div>
          <div class="metric-card green" style="background: white; border-radius: 20px; padding: 20px; display: flex; align-items: center; gap: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div class="metric-icon" style="width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: white; background: linear-gradient(135deg, #10b981, #059669);">
              <i class="fas fa-utensils"></i>
            </div>
            <div class="metric-info" style="flex: 1;">
              <div class="metric-value" style="font-size: 28px; font-weight: 700; color: #1e293b;">${contagem.total}</div>
              <div class="metric-label" style="font-size: 13px; color: #64748b;">Refeições Hoje</div>
              <div class="metric-detail" style="font-size: 11px; color: #94a3b8;">${contagem.pessoasUnicas} pessoas únicas</div>
            </div>
          </div>
          <div class="metric-card orange" style="background: white; border-radius: 20px; padding: 20px; display: flex; align-items: center; gap: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div class="metric-icon" style="width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: white; background: linear-gradient(135deg, #f59e0b, #d97706);">
              <i class="fas fa-chart-pie"></i>
            </div>
            <div class="metric-info" style="flex: 1;">
              <div class="metric-value" style="font-size: 28px; font-weight: 700; color: #1e293b;">${adesao}%</div>
              <div class="metric-label" style="font-size: 13px; color: #64748b;">Taxa de Adesão</div>
              <div class="metric-detail" style="font-size: 11px; color: #94a3b8;">do total</div>
            </div>
          </div>
          <div class="metric-card blue" style="background: white; border-radius: 20px; padding: 20px; display: flex; align-items: center; gap: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div class="metric-icon" style="width: 56px; height: 56px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: white; background: linear-gradient(135deg, #3b82f6, #2563eb);">
              <i class="fas fa-clock"></i>
            </div>
            <div class="metric-info" style="flex: 1;">
              <div class="metric-value" id="ultimaAtualizacao" style="font-size: 28px; font-weight: 700; color: #1e293b;">--:--:--</div>
              <div class="metric-label" style="font-size: 13px; color: #64748b;">Última Atualização</div>
            </div>
          </div>
        </div>

        <!-- PERÍODOS -->
        <div class="card" style="background: white; border-radius: 20px; margin-bottom: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div class="card-header" style="padding: 16px 20px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 10px; font-weight: 600; color: #1e293b;">
            <i class="fas fa-chart-bar" style="color: #1e3c72;"></i>
            <span>Refeições por Período</span>
          </div>
          <div class="card-body" style="padding: 20px;">
            <div class="periodos-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;">
              <div class="periodo-card manha" style="display: flex; align-items: center; gap: 16px; padding: 16px; border-radius: 16px; background: #f8fafc; border-bottom: 3px solid #f59e0b;">
                <div class="periodo-icon" style="font-size: 32px;">🌅</div>
                <div class="periodo-info" style="flex: 1;">
                  <div class="periodo-value" style="font-size: 32px; font-weight: 700; color: #1e293b;">${contagem.manha}</div>
                  <div class="periodo-label" style="font-size: 13px; color: #475569;">Lanche da Manhã</div>
                  <div class="periodo-time" style="font-size: 11px; color: #94a3b8;">08:00 - 10:00</div>
                </div>
              </div>
              <div class="periodo-card almoco" style="display: flex; align-items: center; gap: 16px; padding: 16px; border-radius: 16px; background: #f8fafc; border-bottom: 3px solid #ef4444;">
                <div class="periodo-icon" style="font-size: 32px;">🍽️</div>
                <div class="periodo-info" style="flex: 1;">
                  <div class="periodo-value" style="font-size: 32px; font-weight: 700; color: #1e293b;">${contagem.almoco}</div>
                  <div class="periodo-label" style="font-size: 13px; color: #475569;">Almoço</div>
                  <div class="periodo-time" style="font-size: 11px; color: #94a3b8;">11:00 - 13:00</div>
                </div>
              </div>
              <div class="periodo-card tarde" style="display: flex; align-items: center; gap: 16px; padding: 16px; border-radius: 16px; background: #f8fafc; border-bottom: 3px solid #06b6d4;">
                <div class="periodo-icon" style="font-size: 32px;">🌙</div>
                <div class="periodo-info" style="flex: 1;">
                  <div class="periodo-value" style="font-size: 32px; font-weight: 700; color: #1e293b;">${contagem.tarde}</div>
                  <div class="periodo-label" style="font-size: 13px; color: #475569;">Lanche da Tarde</div>
                  <div class="periodo-time" style="font-size: 11px; color: #94a3b8;">14:00 - 16:00</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- PREVISÃO E PERFIL -->
        <div class="two-columns" style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px;">
          <div class="card" style="background: white; border-radius: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div class="card-header" style="padding: 16px 20px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 10px; font-weight: 600; color: #1e293b;">
              <i class="fas fa-chart-line" style="color: #1e3c72;"></i>
              <span>Previsão de Consumo</span>
            </div>
            <div class="card-body" style="padding: 20px;">
              <div class="previsao-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
                <div class="previsao-item" style="text-align: center; padding: 16px; background: #f8fafc; border-radius: 12px;">
                  <span class="previsao-label" style="display: block; font-size: 12px; color: #64748b; margin-bottom: 8px;">🌅 Manhã</span>
                  <strong class="previsao-value" style="font-size: 24px; font-weight: 700; color: #1e293b; display: block;">${previsao.manha}</strong>
                  <small style="font-size: 11px; color: #94a3b8;">kg</small>
                </div>
                <div class="previsao-item" style="text-align: center; padding: 16px; background: #f8fafc; border-radius: 12px;">
                  <span class="previsao-label" style="display: block; font-size: 12px; color: #64748b; margin-bottom: 8px;">🍽️ Almoço</span>
                  <strong class="previsao-value" style="font-size: 24px; font-weight: 700; color: #1e293b; display: block;">${previsao.almoco}</strong>
                  <small style="font-size: 11px; color: #94a3b8;">kg</small>
                </div>
                <div class="previsao-item" style="text-align: center; padding: 16px; background: #f8fafc; border-radius: 12px;">
                  <span class="previsao-label" style="display: block; font-size: 12px; color: #64748b; margin-bottom: 8px;">🌙 Tarde</span>
                  <strong class="previsao-value" style="font-size: 24px; font-weight: 700; color: #1e293b; display: block;">${previsao.tarde}</strong>
                  <small style="font-size: 11px; color: #94a3b8;">kg</small>
                </div>
                <div class="previsao-item total" style="text-align: center; padding: 16px; background: #e0e7ff; border-radius: 12px;">
                  <span class="previsao-label" style="display: block; font-size: 12px; color: #64748b; margin-bottom: 8px;">📊 Total</span>
                  <strong class="previsao-value" style="font-size: 24px; font-weight: 700; color: #1e293b; display: block;">${previsao.total}</strong>
                  <small style="font-size: 11px; color: #94a3b8;">kg</small>
                </div>
              </div>
            </div>
          </div>

          <div class="card" style="background: white; border-radius: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
            <div class="card-header" style="padding: 16px 20px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 10px; font-weight: 600; color: #1e293b;">
              <i class="fas fa-chart-pie" style="color: #1e3c72;"></i>
              <span>Perfil Alimentar</span>
            </div>
            <div class="card-body perfil-body" style="padding: 20px; display: flex; align-items: center; justify-content: center; gap: 32px;">
              <div class="grafico-container" style="background: #f8fafc; border-radius: 50%; padding: 8px;">
                <canvas id="graficoPerfilAlimentar" width="100" height="100"></canvas>
              </div>
              <div class="perfil-legend" style="display: flex; flex-direction: column; gap: 12px;">
                <div class="legend-item" style="display: flex; align-items: center; gap: 10px; font-size: 14px;">
                  <span class="dot green" style="width: 12px; height: 12px; border-radius: 50%; background: #10b981;"></span> Sempre <strong style="margin-left: auto;">${perfis.sempre}</strong>
                </div>
                <div class="legend-item" style="display: flex; align-items: center; gap: 10px; font-size: 14px;">
                  <span class="dot orange" style="width: 12px; height: 12px; border-radius: 50%; background: #f59e0b;"></span> Às vezes <strong style="margin-left: auto;">${perfis.as_vezes}</strong>
                </div>
                <div class="legend-item" style="display: flex; align-items: center; gap: 10px; font-size: 14px;">
                  <span class="dot red" style="width: 12px; height: 12px; border-radius: 50%; background: #ef4444;"></span> Nunca <strong style="margin-left: auto;">${perfis.nunca}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TABELA REFEIÇÕES POR TURMA -->
        <div class="card" style="background: white; border-radius: 20px; margin-bottom: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div class="card-header" style="padding: 16px 20px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 10px; font-weight: 600; color: #1e293b;">
            <i class="fas fa-table" style="color: #1e3c72;"></i>
            <span>Refeições por Turma</span>
          </div>
          <div class="card-body" style="padding: 20px;">
            <div class="turmas-filtros" style="background: #f8fafc; border-radius: 12px; padding: 15px; margin-bottom: 20px;">
              <div style="display: flex; gap: 15px; flex-wrap: wrap; align-items: flex-end;">
                <div style="flex: 1; min-width: 150px;">
                  <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 5px;">
                    <i class="fas fa-school"></i> Turma
                  </label>
                  <select id="filtroTurmasRefeicaoTurma" style="width: 100%; padding: 8px 12px; border: 1px solid #dee2e6; border-radius: 8px;">
                    <option value="todas">Todas as turmas</option>
                  </select>
                </div>
                <div style="flex: 1; min-width: 150px;">
                  <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 5px;">
                    <i class="fas fa-utensils"></i> Turno
                  </label>
                  <select id="filtroTurmasRefeicaoTurno" style="width: 100%; padding: 8px 12px; border: 1px solid #dee2e6; border-radius: 8px;">
                    <option value="todas">Todos os turnos</option>
                    <option value="manha">🌅 Manhã</option>
                    <option value="almoco">🍽️ Almoço</option>
                    <option value="tarde">🌙 Tarde</option>
                  </select>
                </div>
                <div style="flex: 1; min-width: 150px;">
                  <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 5px;">
                    <i class="fas fa-calendar-alt"></i> Período
                  </label>
                  <select id="filtroTurmasRefeicaoData" style="width: 100%; padding: 8px 12px; border: 1px solid #dee2e6; border-radius: 8px;">
                    <option value="hoje">📅 Hoje</option>
                    <option value="ontem">📆 Ontem</option>
                    <option value="semana">📊 Esta semana</option>
                    <option value="mes">📈 Este mês</option>
                    <option value="todos">🗓️ Todos</option>
                  </select>
                </div>
                <div>
                  <button onclick="monitoramentoTempoReal.limparFiltrosRefeicoesTurmas()" 
                          style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 8px; cursor: pointer;">
                    <i class="fas fa-eraser"></i> Limpar
                  </button>
                </div>
                <div style="margin-left: auto;">
                  <span id="turmasFiltradosCount" style="background: #e9ecef; padding: 5px 12px; border-radius: 20px; font-size: 12px;">
                    ${(cozinha.refeicoesPorTurma || []).length} turmas
                  </span>
                </div>
              </div>
            </div>
            
            <div class="table-responsive" style="overflow-x: auto;">
              <table class="data-table" id="tabelaRefeicoesTurmas" style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                  <tr style="background: #f8fafc; border-bottom: 1px solid #e5e7eb;">
                    <th style="padding: 12px 16px; text-align: left; font-weight: 600; color: #475569;">Turma</th>
                    <th class="text-center" style="padding: 12px 16px; text-align: center; font-weight: 600; color: #475569;">🌅 Manhã</th>
                    <th class="text-center" style="padding: 12px 16px; text-align: center; font-weight: 600; color: #475569;">🍽️ Almoço</th>
                    <th class="text-center" style="padding: 12px 16px; text-align: center; font-weight: 600; color: #475569;">🌙 Tarde</th>
                    <th class="text-center" style="padding: 12px 16px; text-align: center; font-weight: 600; color: #475569;">Total</th>
                    <th class="text-center" style="padding: 12px 16px; text-align: center; font-weight: 600; color: #475569;">Alunos</th>
                  </tr>
                </thead>
                <tbody>
                  ${(cozinha.refeicoesPorTurma || []).map(t => `
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                      <td style="padding: 12px 16px;"><strong>${this.escapeHtml(t.turma)}</strong></td>
                      <td class="text-center" style="padding: 12px 16px; text-align: center;">${t.manha || 0}</td>
                      <td class="text-center" style="padding: 12px 16px; text-align: center;">${t.almoco || 0}</td>
                      <td class="text-center" style="padding: 12px 16px; text-align: center;">${t.tarde || 0}</td>
                      <td class="text-center" style="padding: 12px 16px; text-align: center;"><strong>${t.total || 0}</strong></td>
                      <td class="text-center" style="padding: 12px 16px; text-align: center;">${t.alunosQueComeram || 0}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- ÚLTIMOS REGISTROS -->
        <div class="card" style="background: white; border-radius: 20px; margin-bottom: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div class="card-header" style="padding: 16px 20px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 10px; font-weight: 600; color: #1e293b;">
            <i class="fas fa-history" style="color: #1e3c72;"></i>
            <span>Últimos Registros</span>
          </div>
          <div class="card-body" style="padding: 20px;">
            <div class="registros-filtros" style="background: #f8fafc; border-radius: 12px; padding: 15px; margin-bottom: 20px;">
              <div style="display: flex; gap: 15px; flex-wrap: wrap; align-items: flex-end;">
                <div style="flex: 1; min-width: 150px;">
                  <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 5px;">
                    <i class="fas fa-school"></i> Turma
                  </label>
                  <select id="filtroRegistroTurma" style="width: 100%; padding: 8px 12px; border: 1px solid #dee2e6; border-radius: 8px;">
                    <option value="todas">Todas as turmas</option>
                  </select>
                </div>
                <div style="flex: 1; min-width: 150px;">
                  <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 5px;">
                    <i class="fas fa-utensils"></i> Refeição
                  </label>
                  <select id="filtroRegistroTipo" style="width: 100%; padding: 8px 12px; border: 1px solid #dee2e6; border-radius: 8px;">
                    <option value="todas">Todos os tipos</option>
                    <option value="manha">🌅 Manhã</option>
                    <option value="almoco">🍽️ Almoço</option>
                    <option value="tarde">🌙 Tarde</option>
                  </select>
                </div>
                <div style="flex: 1; min-width: 150px;">
                  <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 5px;">
                    <i class="fas fa-calendar-alt"></i> Período
                  </label>
                  <select id="filtroRegistroData" style="width: 100%; padding: 8px 12px; border: 1px solid #dee2e6; border-radius: 8px;">
                    <option value="hoje">📅 Hoje</option>
                    <option value="ontem">📆 Ontem</option>
                    <option value="semana">📊 Esta semana</option>
                    <option value="mes">📈 Este mês</option>
                    <option value="todos">🗓️ Todos</option>
                  </select>
                </div>
                <div>
                  <button onclick="monitoramentoTempoReal.limparFiltrosRegistros()" 
                          style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 8px; cursor: pointer;">
                    <i class="fas fa-eraser"></i> Limpar
                  </button>
                </div>
                <div style="margin-left: auto;">
                  <span id="registrosFiltradosCount" style="background: #e9ecef; padding: 5px 12px; border-radius: 20px; font-size: 12px;">
                    ${(cozinha.ultimosRegistros || []).length} registros
                  </span>
                </div>
              </div>
            </div>
            
            <div class="registros-list" style="display: flex; flex-direction: column;">
              ${(cozinha.ultimosRegistros || []).slice(0, 50).map(r => `
                <div class="registro-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                  <div class="registro-info" style="flex: 1;">
                    <div class="registro-nome" style="font-weight: 600; color: #1e293b;">${this.escapeHtml(r.alunoNome)}</div>
                    <div class="registro-turma" style="font-size: 12px; color: #94a3b8; margin-top: 2px;">${this.escapeHtml(r.alunoTurma)}</div>
                    <div class="registro-detalhes" style="display: flex; align-items: center; gap: 12px; margin-top: 5px;">
                      <span class="refeicao-badge ${r.tipoRefeicao}" style="padding: 4px 12px; border-radius: 30px; font-size: 11px; background: ${r.tipoRefeicao === 'manha' ? '#fef3c7' : r.tipoRefeicao === 'almoco' ? '#fee2e2' : '#d1fae5'}; color: ${r.tipoRefeicao === 'manha' ? '#d97706' : r.tipoRefeicao === 'almoco' ? '#dc2626' : '#059669'};">
                        ${r.tipoRefeicao === 'manha' ? '🌅 Manhã' : r.tipoRefeicao === 'almoco' ? '🍽️ Almoço' : '🌙 Tarde'}
                      </span>
                      <span class="registro-horario" style="font-size: 12px; color: #64748b;">
                        <i class="far fa-clock"></i> ${new Date(r.horario).toLocaleTimeString()}
                      </span>
                      <span class="registro-data" style="font-size: 11px; color: #94a3b8;">
                        <i class="far fa-calendar-alt"></i> ${new Date(r.horario).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div class="action-buttons" style="display: flex; gap: 8px;">
                    <button class="btn-icon" onclick="admin.verDetalhesRegistro('${r.id}')" title="Ver detalhes" style="background: transparent; border: none; padding: 6px; border-radius: 8px; cursor: pointer; color: #64748b;">
                      <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon edit" onclick="admin.editarRegistroRefeicao('${r.id}')" title="Editar" style="background: transparent; border: none; padding: 6px; border-radius: 8px; cursor: pointer; color: #64748b;">
                      <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon danger" onclick="admin.excluirRegistroRefeicao('${r.id}', '${this.escapeHtml(r.alunoNome)}', '${r.tipoRefeicao}')" title="Excluir" style="background: transparent; border: none; padding: 6px; border-radius: 8px; cursor: pointer; color: #64748b;">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- FEEDBACKS -->
        <div class="card" style="background: white; border-radius: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
          <div class="card-header" style="padding: 16px 20px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 10px; font-weight: 600; color: #1e293b; justify-content: space-between; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <i class="fas fa-star" style="color: #1e3c72;"></i>
              <span>Avaliações dos Alunos</span>
              <span style="background: #10b981; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px;" id="totalFeedbacksBadge">0</span>
            </div>
            <button onclick="monitoramentoTempoReal.carregarFeedbacksCompleto()" 
                    style="background: #1e3c72; color: white; border: none; padding: 8px 16px; border-radius: 30px; cursor: pointer; font-size: 13px;">
              <i class="fas fa-sync-alt"></i> Atualizar
            </button>
          </div>
          <div class="card-body" style="padding: 20px;">
            <div class="feedback-stats-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px;">
              <div class="feedback-stat-card" style="background: white; border-radius: 20px; padding: 16px 20px; display: flex; align-items: center; gap: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); border: 1px solid #eef2f6;">
                <div class="feedback-stat-icon" style="width: 52px; height: 52px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: white; background: linear-gradient(135deg, #8b5cf6, #7c3aed);">
                  <i class="fas fa-comment-dots"></i>
                </div>
                <div class="feedback-stat-info" style="flex: 1;">
                  <span class="feedback-stat-value" id="totalFeedbacks" style="display: block; font-size: 28px; font-weight: 700; color: #1e293b;">0</span>
                  <span class="feedback-stat-label" style="font-size: 12px; color: #64748b;">Total de Avaliações</span>
                </div>
              </div>
              <div class="feedback-stat-card" style="background: white; border-radius: 20px; padding: 16px 20px; display: flex; align-items: center; gap: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); border: 1px solid #eef2f6;">
                <div class="feedback-stat-icon" style="width: 52px; height: 52px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: white; background: linear-gradient(135deg, #f59e0b, #d97706);">
                  <i class="fas fa-star"></i>
                </div>
                <div class="feedback-stat-info" style="flex: 1;">
                  <span class="feedback-stat-value" id="mediaNotas" style="display: block; font-size: 28px; font-weight: 700; color: #1e293b;">0</span>
                  <span class="feedback-stat-label" style="font-size: 12px; color: #64748b;">Média de Notas</span>
                  <div id="estrelasMedia" style="margin-top: 4px; font-size: 11px;"></div>
                </div>
              </div>
              <div class="feedback-stat-card" style="background: white; border-radius: 20px; padding: 16px 20px; display: flex; align-items: center; gap: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); border: 1px solid #eef2f6;">
                <div class="feedback-stat-icon" style="width: 52px; height: 52px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: white; background: linear-gradient(135deg, #10b981, #059669);">
                  <i class="fas fa-smile-wink"></i>
                </div>
                <div class="feedback-stat-info" style="flex: 1;">
                  <span class="feedback-stat-value" id="gostaram" style="display: block; font-size: 28px; font-weight: 700; color: #1e293b;">0%</span>
                  <span class="feedback-stat-label" style="font-size: 12px; color: #64748b;">Aprovação</span>
                </div>
              </div>
              <div class="feedback-stat-card" style="background: white; border-radius: 20px; padding: 16px 20px; display: flex; align-items: center; gap: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); border: 1px solid #eef2f6;">
                <div class="feedback-stat-icon" style="width: 52px; height: 52px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 24px; color: white; background: linear-gradient(135deg, #3b82f6, #2563eb);">
                  <i class="fas fa-filter"></i>
                </div>
                <div class="feedback-stat-info" style="flex: 1;">
                  <span class="feedback-stat-value" id="feedbacksFiltrados" style="display: block; font-size: 28px; font-weight: 700; color: #1e293b;">0</span>
                  <span class="feedback-stat-label" style="font-size: 12px; color: #64748b;">Resultados Filtrados</span>
                </div>
              </div>
            </div>

            <div class="feedback-filters" style="background: #f8fafc; border-radius: 20px; padding: 20px; margin-bottom: 24px; border: 1px solid #eef2f6;">
              <div class="feedback-filters-row" style="display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 16px;">
                <div class="feedback-filter-group" style="flex: 1; min-width: 140px;">
                  <label style="display: block; font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 6px; text-transform: uppercase;">
                    <i class="fas fa-utensils"></i> Refeição
                  </label>
                  <select id="filtroRefeicaoFeedback" style="width: 100%; padding: 10px 12px; border: 2px solid #e2e8f0; border-radius: 12px; font-size: 13px; background: white;">
                    <option value="todas">Todas</option>
                    <option value="manha">🌅 Manhã</option>
                    <option value="almoco">🍽️ Almoço</option>
                    <option value="tarde">🌙 Tarde</option>
                  </select>
                </div>
                <div class="feedback-filter-group" style="flex: 1; min-width: 140px;">
                  <label style="display: block; font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 6px; text-transform: uppercase;">
                    <i class="fas fa-star"></i> Nota Mín.
                  </label>
                  <select id="filtroNotaMin" style="width: 100%; padding: 10px 12px; border: 2px solid #e2e8f0; border-radius: 12px; font-size: 13px; background: white;">
                    <option value="1">1★ ou mais</option>
                    <option value="2">2★ ou mais</option>
                    <option value="3">3★ ou mais</option>
                    <option value="4">4★ ou mais</option>
                    <option value="5">5★</option>
                  </select>
                </div>
                <div class="feedback-filter-group" style="flex: 1; min-width: 140px;">
                  <label style="display: block; font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 6px; text-transform: uppercase;">
                    <i class="fas fa-smile"></i> Opinião
                  </label>
                  <select id="filtroGostou" style="width: 100%; padding: 10px 12px; border: 2px solid #e2e8f0; border-radius: 12px; font-size: 13px; background: white;">
                    <option value="todos">Todos</option>
                    <option value="sim">👍 Adoraram</option>
                    <option value="mais_ou_menos">😐 Mais ou menos</option>
                    <option value="nao">👎 Não gostaram</option>
                  </select>
                </div>
                <div class="feedback-filter-group" style="flex: 1; min-width: 140px;">
                  <label style="display: block; font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 6px; text-transform: uppercase;">
                    <i class="fas fa-user-secret"></i> Anonimato
                  </label>
                  <select id="filtroAnonimo" style="width: 100%; padding: 10px 12px; border: 2px solid #e2e8f0; border-radius: 12px; font-size: 13px; background: white;">
                    <option value="todos">Todos</option>
                    <option value="nao">✅ Identificados</option>
                    <option value="sim">🔒 Anônimos</option>
                  </select>
                </div>
                <div class="feedback-filter-group search" style="flex: 1.5; min-width: 200px;">
                  <label style="display: block; font-size: 11px; font-weight: 600; color: #475569; margin-bottom: 6px; text-transform: uppercase;">
                    <i class="fas fa-search"></i> Buscar
                  </label>
                  <input type="text" id="filtroBuscaFeedback" placeholder="Nome, turma ou comentário..." 
                         style="width: 100%; padding: 10px 12px; border: 2px solid #e2e8f0; border-radius: 12px; font-size: 13px; background: white;">
                </div>
              </div>
              <div class="feedback-filters-actions" style="display: flex; justify-content: flex-end; gap: 12px; padding-top: 8px;">
                <button onclick="monitoramentoTempoReal.limparFiltrosFeedback()" 
                        style="background: #e2e8f0; border: none; padding: 8px 20px; border-radius: 30px; font-size: 12px; font-weight: 500; color: #475569; cursor: pointer;">
                  <i class="fas fa-eraser"></i> Limpar filtros
                </button>
                <button onclick="monitoramentoTempoReal.aplicarFiltrosFeedback()" 
                        style="background: linear-gradient(135deg, #1e3c72, #2a5298); border: none; padding: 8px 24px; border-radius: 30px; font-size: 12px; font-weight: 500; color: white; cursor: pointer;">
                  <i class="fas fa-search"></i> Aplicar
                </button>
              </div>
            </div>

            <div class="feedback-charts" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px;">
              <div class="feedback-chart-card" style="background: #f8fafc; border-radius: 20px; padding: 20px; border: 1px solid #eef2f6;">
                <div class="feedback-chart-title" style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #e2e8f0; display: flex; align-items: center; gap: 8px;">
                  <i class="fas fa-chart-bar" style="color: #1e3c72;"></i> Distribuição das Notas
                </div>
                <div class="feedback-rating-bars">
                  ${[1,2,3,4,5].map(i => `
                    <div class="rating-bar" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                      <span class="rating-label" style="width: 35px; font-size: 12px; font-weight: 600; color: #475569;">★ ${i}</span>
                      <div class="rating-bar-bg" style="flex: 1; height: 8px; background: #e2e8f0; border-radius: 10px; overflow: hidden;">
                        <div id="bar${i}" class="rating-bar-fill" style="height: 100%; border-radius: 10px; transition: width 0.5s ease; width: 0%; background: ${i <= 2 ? '#ef4444' : i === 3 ? '#3b82f6' : '#10b981'};"></div>
                      </div>
                      <span class="rating-count" id="count${i}" style="width: 35px; font-size: 12px; font-weight: 600; color: #1e293b; text-align: right;">0</span>
                    </div>
                  `).join('')}
                </div>
              </div>
              <div class="feedback-chart-card" style="background: #f8fafc; border-radius: 20px; padding: 20px; border: 1px solid #eef2f6;">
                <div class="feedback-chart-title" style="font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #e2e8f0; display: flex; align-items: center; gap: 8px;">
                  <i class="fas fa-smile" style="color: #1e3c72;"></i> Resumo das Opiniões
                </div>
                <div class="opinion-summary" style="display: flex; flex-direction: column; gap: 12px;">
                  <div class="opinion-item" style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: white; border-radius: 12px;">
                    <div class="opinion-icon" style="width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; background: #d1fae5; color: #10b981;">
                      <i class="fas fa-smile-wink"></i>
                    </div>
                    <div class="opinion-info" style="flex: 1; display: flex; justify-content: space-between; align-items: center;">
                      <span class="opinion-label" style="font-size: 13px; font-weight: 500; color: #475569;">Adoraram</span>
                      <span class="opinion-value" id="gostaramSim" style="font-size: 18px; font-weight: 700; color: #1e293b;">0</span>
                    </div>
                  </div>
                  <div class="opinion-item" style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: white; border-radius: 12px;">
                    <div class="opinion-icon" style="width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; background: #fef3c7; color: #f59e0b;">
                      <i class="fas fa-meh"></i>
                    </div>
                    <div class="opinion-info" style="flex: 1; display: flex; justify-content: space-between; align-items: center;">
                      <span class="opinion-label" style="font-size: 13px; font-weight: 500; color: #475569;">Mais ou menos</span>
                      <span class="opinion-value" id="gostaramMaisMenos" style="font-size: 18px; font-weight: 700; color: #1e293b;">0</span>
                    </div>
                  </div>
                  <div class="opinion-item" style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: white; border-radius: 12px;">
                    <div class="opinion-icon" style="width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; background: #fee2e2; color: #ef4444;">
                      <i class="fas fa-frown"></i>
                    </div>
                    <div class="opinion-info" style="flex: 1; display: flex; justify-content: space-between; align-items: center;">
                      <span class="opinion-label" style="font-size: 13px; font-weight: 500; color: #475569;">Não gostaram</span>
                      <span class="opinion-value" id="gostaramNao" style="font-size: 18px; font-weight: 700; color: #1e293b;">0</span>
                    </div>
                  </div>
                  <div style="height: 1px; background: #e2e8f0; margin: 8px 0;"></div>
                  <div class="opinion-item" style="display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: white; border-radius: 12px;">
                    <div class="opinion-icon" style="width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; background: #e0e7ff; color: #1e3c72;">
                      <i class="fas fa-star"></i>
                    </div>
                    <div class="opinion-info" style="flex: 1; display: flex; justify-content: space-between; align-items: center;">
                      <span class="opinion-label" style="font-size: 13px; font-weight: 500; color: #475569;">Média Geral</span>
                      <span class="opinion-value" id="mediaDetalhada" style="font-size: 18px; font-weight: 700; color: #1e293b;">0/5</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="feedback-list-header" style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #eef2f6;">
              <i class="fas fa-list" style="font-size: 16px; color: #1e3c72;"></i>
              <span style="font-size: 14px; font-weight: 600; color: #1e293b;">Últimas Avaliações</span>
              <span class="feedback-list-count" id="feedbacksCount" style="background: #e2e8f0; padding: 2px 10px; border-radius: 30px; font-size: 11px; font-weight: 600; color: #475569;">0</span>
            </div>
            <div class="feedback-table-container" style="overflow-x: auto; border-radius: 16px; border: 1px solid #eef2f6;">
              <table class="feedback-table" style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                  <tr>
                    <th style="padding: 14px 16px; text-align: left; font-weight: 600; color: #475569; background: #f8fafc; border-bottom: 1px solid #eef2f6;">Aluno</th>
                    <th style="padding: 14px 16px; text-align: left; font-weight: 600; color: #475569; background: #f8fafc; border-bottom: 1px solid #eef2f6;">Turma</th>
                    <th style="padding: 14px 16px; text-align: left; font-weight: 600; color: #475569; background: #f8fafc; border-bottom: 1px solid #eef2f6;">Refeição</th>
                    <th style="padding: 14px 16px; text-align: left; font-weight: 600; color: #475569; background: #f8fafc; border-bottom: 1px solid #eef2f6;">Nota</th>
                    <th style="padding: 14px 16px; text-align: left; font-weight: 600; color: #475569; background: #f8fafc; border-bottom: 1px solid #eef2f6;">Comentário</th>
                    <th style="padding: 14px 16px; text-align: left; font-weight: 600; color: #475569; background: #f8fafc; border-bottom: 1px solid #eef2f6;">Data</th>
                  </tr>
                </thead>
                <tbody id="listaFeedbacksAdmin">
                  <tr><td colspan="6" style="padding: 12px 16px; text-align: center;">Carregando avaliações...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- RODÍZIO -->
        <div class="card" style="background: white; border-radius: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); margin-top: 24px;">
          <div class="card-header" style="padding: 16px 20px; background: #f8fafc; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 10px; font-weight: 600; color: #1e293b;">
            <i class="fas fa-calendar-alt" style="color: #1e3c72;"></i>
            <span>Gestão de Rodízio</span>
            <button onclick="admin.abrirModalRodizioGestao()" 
                    style="margin-left: auto; background: linear-gradient(135deg, #1e3c72, #2a5298); color: white; border: none; padding: 6px 16px; border-radius: 30px; font-size: 12px; font-weight: 500; cursor: pointer;">
              <i class="fas fa-plus"></i> Novo Rodízio
            </button>
          </div>
          <div class="card-body" style="padding: 20px;">
            <div class="rodizio-filtros" style="background: #f8fafc; border-radius: 12px; padding: 15px; margin-bottom: 20px;">
              <div style="display: flex; gap: 15px; flex-wrap: wrap; align-items: flex-end;">
                <div style="flex: 1; min-width: 150px;">
                  <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 5px;">
                    <i class="fas fa-school"></i> Turma
                  </label>
                  <select id="filtroRodizioTurma" style="width: 100%; padding: 8px 12px; border: 1px solid #dee2e6; border-radius: 8px;">
                    <option value="todas">Todas as turmas</option>
                  </select>
                </div>
                <div style="flex: 1; min-width: 150px;">
                  <label style="display: block; font-size: 12px; color: #6c757d; margin-bottom: 5px;">
                    <i class="fas fa-chart-line"></i> Tipo
                  </label>
                  <select id="filtroRodizioTipo" style="width: 100%; padding: 8px 12px; border: 1px solid #dee2e6; border-radius: 8px;">
                    <option value="todos">Todos</option>
                    <option value="semanal">📅 Semanal</option>
                    <option value="mensal">📆 Mensal</option>
                    <option value="ambos">🔄 Ambos</option>
                  </select>
                </div>
                <div>
                  <button onclick="monitoramentoTempoReal.limparFiltrosRodizio()" 
                          style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 8px; cursor: pointer;">
                    <i class="fas fa-eraser"></i> Limpar
                  </button>
                </div>
                <div style="margin-left: auto;">
                  <span id="rodizioFiltradosCount" style="background: #e9ecef; padding: 5px 12px; border-radius: 20px; font-size: 12px;">
                    ${(gestao.rodizios || []).length} rodízios
                  </span>
                </div>
              </div>
            </div>
            
            <div class="table-responsive" style="overflow-x: auto;">
              <table class="data-table compact" id="tabelaRodizio" style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <thead>
                  <tr>
                    <th style="padding: 8px 12px; text-align: left; font-weight: 600; color: #475569; background: #f8fafc;">Turma</th>
                    <th style="padding: 8px 12px; text-align: left; font-weight: 600; color: #475569; background: #f8fafc;">Tipo</th>
                    <th style="padding: 8px 12px; text-align: left; font-weight: 600; color: #475569; background: #f8fafc;">Dias/Semanas</th>
                    <th style="padding: 8px 12px; text-align: left; font-weight: 600; color: #475569; background: #f8fafc;">Horário</th>
                    <th style="padding: 8px 12px; text-align: left; font-weight: 600; color: #475569; background: #f8fafc;">Status Hoje</th>
                    <th width="80" style="padding: 8px 12px; text-align: left; font-weight: 600; color: #475569; background: #f8fafc;">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  ${(gestao.rodizios || []).map(r => {
                    let diasTexto = '';
                    if (r.tipo === 'semanal') {
                      diasTexto = (r.diasSemana || []).join(', ');
                    } else if (r.tipo === 'mensal') {
                      diasTexto = `${r.semanasMes?.map(s => `${s}ª`).join(', ') || ''} semana(s)`;
                    } else {
                      diasTexto = 'Ambos sistemas';
                    }
                    return `
                      <tr data-turma="${r.turma}" data-tipo="${r.tipo}" style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 8px 12px;"><strong>${r.turma}</strong></td>
                        <td style="padding: 8px 12px;"><span class="tipo-badge ${r.tipo}" style="padding: 4px 12px; border-radius: 30px; font-size: 11px; background: ${r.tipo === 'semanal' ? '#dbeafe' : r.tipo === 'mensal' ? '#fef3c7' : '#e0e7ff'}; color: ${r.tipo === 'semanal' ? '#1e40af' : r.tipo === 'mensal' ? '#92400e' : '#3730a3'};">${r.tipo === 'semanal' ? 'Semanal' : r.tipo === 'mensal' ? 'Mensal' : 'Ambos'}</span></td>
                        <td class="dias-cell" style="padding: 8px 12px; max-width: 180px; font-size: 12px; color: #475569;">${diasTexto || '-'}</td>
                        <td style="padding: 8px 12px;">${r.horario || '-'}</td>
                        <td style="padding: 8px 12px;"><span class="status-badge ${r.podeHoje ? 'active' : 'inactive'}" style="padding: 4px 12px; border-radius: 30px; font-size: 11px; background: ${r.podeHoje ? '#d1fae5' : '#fee2e2'}; color: ${r.podeHoje ? '#065f46' : '#991b1b'};">${r.podeHoje ? '✅ Permitido' : '❌ Não permitido'}</span></td>
                        <td style="padding: 8px 12px;">
                          <div class="action-buttons" style="display: flex; gap: 8px;">
                            <button class="btn-icon" onclick="admin.editarRodizioGestao('${r.turma}')" title="Editar" style="background: transparent; border: none; padding: 6px; border-radius: 8px; cursor: pointer; color: #64748b;">
                              <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn-icon delete" onclick="admin.excluirRodizioGestao('${r.turma}')" title="Excluir" style="background: transparent; border: none; padding: 6px; border-radius: 8px; cursor: pointer; color: #64748b;">
                              <i class="fas fa-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
            
            <div class="info-footer" style="margin-top: 20px; padding: 12px 16px; background: #eff6ff; border-radius: 12px; font-size: 12px; color: #1e40af; display: flex; align-items: center; gap: 8px;">
              <i class="fas fa-calendar-day"></i>
              Hoje: ${gestao.hoje?.data || ''} - ${gestao.hoje?.diaSemana || ''} 
              (Dia ${gestao.hoje?.diaMes || ''} do mês, ${gestao.hoje?.semanaMes || ''}ª semana)
            </div>
          </div>
        </div>
      </div>
    `;
    
    // Inicializa o gráfico
    this.inicializarGraficos(data);
  }
  
  inicializarGraficos(data) {
    const canvas = document.getElementById('graficoPerfilAlimentar');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (this.graficos.perfil) {
      try { this.graficos.perfil.destroy(); } catch(e) {}
    }
    
    const perfis = data.cozinha?.perfisAlimentares || {};
    canvas.width = 100;
    canvas.height = 100;
    
    this.graficos.perfil = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Sempre', 'Às vezes', 'Nunca'],
        datasets: [{
          data: [perfis.sempre || 0, perfis.as_vezes || 0, perfis.nunca || 0],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
          borderWidth: 0,
          cutout: '65%'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${ctx.raw}`
            }
          }
        }
      }
    });
  }
  
  parar() {
    if (this.eventSource) this.eventSource.close();
    if (this.atualizacaoTimer) clearInterval(this.atualizacaoTimer);
  }
}

// ============================================
// INICIALIZAÇÃO GLOBAL
// ============================================
let monitoramentoTempoReal = null;

document.addEventListener('DOMContentLoaded', () => {
  monitoramentoTempoReal = new MonitoramentoTempoReal();
  window.monitoramentoTempoReal = monitoramentoTempoReal;
});