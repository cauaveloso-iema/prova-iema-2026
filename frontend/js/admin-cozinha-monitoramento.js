// ============================================
// MÓDULO: MONITORAMENTO EM TEMPO REAL
// DESIGN PROFISSIONAL - ESTILO DASHBOARD MODERNO
// ============================================

class MonitoramentoTempoReal {
  constructor() {
    this.eventSource = null;
    this.dados = null;
    this.atualizacaoTimer = null;
    this.graficos = {};
    this.todosFeedbacks = [];
    this.feedbacksFiltrados = [];
    this.paginaCarregada = false; // Flag para controle
  }
  
  async carregar() {
    console.log('📊 Carregando Monitoramento em Tempo Real...');
    
    // SEMPRE carregar a página completa quando o usuário clica no menu
    this.paginaCarregada = true;
    await this.carregarDadosCompleto();
    await this.carregarFeedbacksCompleto();
    this.iniciarEventosSSE();
    this.iniciarAtualizacaoAutomatica();
  }
  
  async carregarDadosCompleto() {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/monitoramento-cozinha/dashboard', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      if (data.success) {
        this.dados = data;
        this.renderizar(data);
        this.atualizarGraficos(data);
        this.atualizarTimestamp(data.timestamp);
      } else {
        this.renderizarErro(data.error);
      }
    } catch (error) {
      console.error('Erro:', error);
      this.renderizarErro(error.message);
    }
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
        this.atualizarFeedbacksNoDOM(data);
      }
    } catch (error) {
      console.error('Erro ao carregar feedbacks:', error);
    }
  }
  
  // Método para atualização em segundo plano (sem recarregar a página)
  async carregarDados() {
    // Verificar se a página foi carregada e se o elemento existe
    if (!this.paginaCarregada) return;
    
    const contentArea = document.getElementById('contentArea');
    const isMonitoramentoAtivo = contentArea && contentArea.querySelector('.monitoramento-dashboard') !== null;
    
    if (!isMonitoramentoAtivo) {
      console.log('⏭️ Seção de monitoramento não está ativa, ignorando atualização');
      return;
    }
    
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch('/api/monitoramento-cozinha/dashboard', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      
      if (data.success) {
        this.dados = data;
        this.atualizarElementosExistentes(data);
        this.atualizarGraficos(data);
        this.atualizarTimestamp(data.timestamp);
      }
    } catch (error) {
      console.error('Erro ao atualizar dados:', error);
    }
  }
  
  // Método para atualização de feedbacks em segundo plano
  async carregarFeedbacks() {
    if (!this.paginaCarregada) return;
    
    const contentArea = document.getElementById('contentArea');
    const isMonitoramentoAtivo = contentArea && contentArea.querySelector('.monitoramento-dashboard') !== null;
    
    if (!isMonitoramentoAtivo) {
      console.log('⏭️ Seção de monitoramento não está ativa, ignorando atualização de feedbacks');
      return;
    }
    
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
  
  // NOVO MÉTODO: Atualizar apenas os elementos sem recarregar a página
  atualizarElementosExistentes(data) {
    const cozinha = data.cozinha || {};
    const gestao = data.gestaoGeral || {};
    const contagem = cozinha.contagemRefeicoes || { manha: 0, almoco: 0, tarde: 0, total: 0, pessoasUnicas: 0 };
    const perfis = cozinha.perfisAlimentares || { sempre: 0, as_vezes: 0, nunca: 0 };
    const previsao = cozinha.previsaoComida || { manha: 0, almoco: 0, tarde: 0, total: 0 };
    const adesao = cozinha.totalPessoas ? ((contagem.pessoasUnicas / cozinha.totalPessoas) * 100).toFixed(0) : 0;
    
    // Atualizar cards principais
    const metricValues = document.querySelectorAll('.metric-value');
    if (metricValues.length >= 4) {
      if (metricValues[0]) metricValues[0].textContent = cozinha.totalPessoas || 0;
      if (metricValues[1]) metricValues[1].textContent = contagem.total;
      if (metricValues[2]) metricValues[2].textContent = `${adesao}%`;
    }
    
    // Atualizar metric-detail
    const metricDetails = document.querySelectorAll('.metric-detail');
    if (metricDetails.length >= 1 && metricDetails[0]) {
      metricDetails[0].textContent = `${contagem.pessoasUnicas} pessoas únicas`;
    }
    
    // Atualizar contagem por período
    const periodoValues = document.querySelectorAll('.periodo-value');
    if (periodoValues.length >= 3) {
      if (periodoValues[0]) periodoValues[0].textContent = contagem.manha;
      if (periodoValues[1]) periodoValues[1].textContent = contagem.almoco;
      if (periodoValues[2]) periodoValues[2].textContent = contagem.tarde;
    }
    
    // Atualizar previsão de comida
    const previsaoValues = document.querySelectorAll('.previsao-value');
    if (previsaoValues.length >= 4) {
      if (previsaoValues[0]) previsaoValues[0].textContent = previsao.manha;
      if (previsaoValues[1]) previsaoValues[1].textContent = previsao.almoco;
      if (previsaoValues[2]) previsaoValues[2].textContent = previsao.tarde;
      if (previsaoValues[3]) previsaoValues[3].textContent = previsao.total;
    }
    
    // Atualizar perfil legend
    const legendValues = document.querySelectorAll('.legend-item strong');
    if (legendValues.length >= 3) {
      if (legendValues[0]) legendValues[0].textContent = perfis.sempre;
      if (legendValues[1]) legendValues[1].textContent = perfis.as_vezes;
      if (legendValues[2]) legendValues[2].textContent = perfis.nunca;
    }
    
    // Atualizar tabela de turmas
    const turmasBody = document.querySelector('.data-table tbody');
    if (turmasBody && cozinha.refeicoesPorTurma) {
      turmasBody.innerHTML = cozinha.refeicoesPorTurma.map(t => `
        <tr>
          <td><strong>${t.turma}</strong></td>
          <td class="text-center">${t.manha || 0}</td>
          <td class="text-center">${t.almoco || 0}</td>
          <td class="text-center">${t.tarde || 0}</td>
          <td class="text-center"><strong>${t.total || 0}</strong></td>
          <td class="text-center">${t.alunosQueComeram || 0}</td>
        </tr>
      `).join('');
    }
    
    // Atualizar estatísticas de rodízio
    const statNumbers = document.querySelectorAll('.rodizio-stat .stat-number');
    if (statNumbers.length >= 3) {
      if (statNumbers[0]) statNumbers[0].textContent = gestao.totalRodizios || 0;
      if (statNumbers[1]) statNumbers[1].textContent = gestao.turmasComRodizio || 0;
      if (statNumbers[2]) statNumbers[2].textContent = gestao.turmasSemRodizio || 0;
    }
    
    // Atualizar info-footer
    const infoFooter = document.querySelector('.info-footer');
    if (infoFooter && gestao.hoje) {
      infoFooter.innerHTML = `
        <i class="fas fa-calendar-day"></i>
        Hoje: ${gestao.hoje.data || ''} - ${gestao.hoje.diaSemana || ''} 
        (Dia ${gestao.hoje.diaMes || ''} do mês, ${gestao.hoje.semanaMes || ''}ª semana)
      `;
    }
    
    // Atualizar tabela de rodízios
    const rodizioTableBody = document.querySelector('.compact tbody');
    if (rodizioTableBody && gestao.rodizios) {
      rodizioTableBody.innerHTML = gestao.rodizios.map(r => {
        let diasTexto = '';
        if (r.tipo === 'semanal') {
          diasTexto = (r.diasSemana || []).map(d => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d]).join(', ');
        } else if (r.tipo === 'mensal') {
          if (r.diasMes?.length) diasTexto = `${r.diasMes.length} dias/mês`;
          else if (r.semanasMes?.length) diasTexto = `${r.semanasMes.map(s => `${s}ª`).join(', ')} semana(s)`;
        } else {
          diasTexto = 'Ambos sistemas';
        }
        return `
          <tr>
            <td><strong>${r.turma}</strong></td>
            <td><span class="tipo-badge ${r.tipo}">${r.tipo === 'semanal' ? 'Semanal' : r.tipo === 'mensal' ? 'Mensal' : 'Ambos'}</span></td>
            <td class="dias-cell">${diasTexto || '-'}</td>
            <td>${r.horario || '-'}</td>
            <td><span class="status-badge ${r.podeHoje ? 'active' : 'inactive'}">${r.podeHoje ? '✅ Permitido' : '❌ Não permitido'}</span></td>
            <td>
              <div class="action-buttons">
                <button class="btn-icon" onclick="admin.editarRodizioGestao('${r.turma}')" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-icon delete" onclick="admin.excluirRodizioGestao('${r.turma}')" title="Excluir"><i class="fas fa-trash"></i></button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    }
    
    console.log('✅ Dados atualizados em segundo plano');
  }
  
  atualizarFeedbacksNoDOM(data) {
    const stats = data.estatisticas;
    
    const totalEl = document.getElementById('totalFeedbacks');
    const mediaEl = document.getElementById('mediaNotas');
    const gostaramEl = document.getElementById('gostaram');
    const filtradosEl = document.getElementById('feedbacksFiltrados');
    const totalBadge = document.getElementById('totalFeedbacksBadge');
    
    if (totalEl) totalEl.textContent = stats.total || 0;
    if (totalBadge) totalBadge.textContent = stats.total || 0;
    if (mediaEl) mediaEl.textContent = stats.mediaNotas || 0;
    if (filtradosEl) filtradosEl.textContent = stats.total || 0;
    
    const estrelasMedia = document.getElementById('estrelasMedia');
    if (estrelasMedia) {
      const media = parseFloat(stats.mediaNotas) || 0;
      estrelasMedia.innerHTML = this.gerarEstrelasMini(media);
    }
    
    const maxNota = Math.max(...Object.values(stats.distribuicaoNotas), 1);
    for (let i = 1; i <= 5; i++) {
      const count = stats.distribuicaoNotas[i] || 0;
      const percent = (count / maxNota) * 100;
      const bar = document.getElementById(`bar${i}`);
      const countSpan = document.getElementById(`count${i}`);
      if (bar) bar.style.width = `${percent}%`;
      if (countSpan) countSpan.textContent = count;
    }
    
    const gostaramSim = document.getElementById('gostaramSim');
    const gostaramMaisMenos = document.getElementById('gostaramMaisMenos');
    const gostaramNao = document.getElementById('gostaramNao');
    const mediaDetalhada = document.getElementById('mediaDetalhada');
    
    if (gostaramSim) gostaramSim.textContent = stats.gostouStats?.sim || 0;
    if (gostaramMaisMenos) gostaramMaisMenos.textContent = stats.gostouStats?.mais_ou_menos || 0;
    if (gostaramNao) gostaramNao.textContent = stats.gostouStats?.nao || 0;
    if (mediaDetalhada) mediaDetalhada.textContent = `${stats.mediaNotas || 0}/5`;
    
    const totalGostou = (stats.gostouStats?.sim || 0) + (stats.gostouStats?.mais_ou_menos || 0);
    const aprovacao = stats.total > 0 ? Math.round((totalGostou / stats.total) * 100) : 0;
    if (gostaramEl) gostaramEl.textContent = `${aprovacao}%`;
    
    const feedbacksCount = document.getElementById('feedbacksCount');
    if (feedbacksCount) feedbacksCount.textContent = this.todosFeedbacks.length;
    
    this.atualizarListaFeedbacks();
  }
  
  atualizarListaFeedbacks() {
    const tbody = document.getElementById('listaFeedbacksAdmin');
    if (!tbody) return;
    
    if (this.feedbacksFiltrados.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum feedback encontrado</td>' + '</tr>';
      return;
    }
    
    tbody.innerHTML = this.feedbacksFiltrados.map(f => {
      let notaClass = '';
      if (f.nota >= 4) notaClass = 'alta';
      else if (f.nota >= 2.5) notaClass = 'media';
      else notaClass = 'baixa';
      
      return `
        <tr>
          <td>${f.alunoNome}${f.anonimo ? ' <i class="fas fa-user-secret text-muted" style="font-size: 11px;"></i>' : ''}</td>
          <td>${f.alunoTurma || '-'}</td>
          <td><span class="badge ${f.tipoRefeicao === 'manha' ? 'badge-manha' : f.tipoRefeicao === 'almoco' ? 'badge-almoco' : 'badge-tarde'}">${f.tipoRefeicao === 'manha' ? '🌅 Manhã' : f.tipoRefeicao === 'almoco' ? '🍽️ Almoço' : '🌙 Tarde'}</span></td>
          <td><span class="feedback-nota-badge ${notaClass}">${'★'.repeat(f.nota)}${'☆'.repeat(5-f.nota)}</span></td>
          <td><small>${f.comentario ? (f.comentario.length > 50 ? f.comentario.substring(0,50) + '...' : f.comentario) : '-'}</small></td>
          <td><small>${new Date(f.createdAt).toLocaleString()}</small></td>
        </tr>
      `;
    }).join('');
  }
  
  aplicarFiltrosFeedback() {
    const refeicao = document.getElementById('filtroRefeicaoFeedback')?.value || 'todas';
    const notaMin = parseInt(document.getElementById('filtroNotaMin')?.value || 1);
    const gostou = document.getElementById('filtroGostou')?.value || 'todos';
    const anonimo = document.getElementById('filtroAnonimo')?.value || 'todos';
    const busca = document.getElementById('filtroBuscaFeedback')?.value.toLowerCase() || '';
    
    this.feedbacksFiltrados = this.todosFeedbacks.filter(f => {
      if (refeicao !== 'todas' && f.tipoRefeicao !== refeicao) return false;
      if (f.nota < notaMin) return false;
      if (gostou !== 'todos' && f.gostou !== gostou) return false;
      if (anonimo !== 'todos') {
        const isAnonimo = anonimo === 'sim';
        if (f.anonimo !== isAnonimo) return false;
      }
      if (busca) {
        const nomeMatch = f.alunoNome?.toLowerCase().includes(busca);
        const turmaMatch = f.alunoTurma?.toLowerCase().includes(busca);
        const comentarioMatch = f.comentario?.toLowerCase().includes(busca);
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
  
  gerarEstrelasMini(nota) {
    const estrelasCheias = Math.floor(nota);
    let html = '';
    for (let i = 0; i < estrelasCheias; i++) html += '<i class="fas fa-star text-warning" style="font-size: 10px;"></i>';
    for (let i = estrelasCheias; i < 5; i++) html += '<i class="far fa-star text-warning" style="font-size: 10px;"></i>';
    return html;
  }
  
  renderizarErro(mensagem) {
    const container = document.getElementById('contentArea');
    if (!container) return;
    container.innerHTML = `
      <div class="error-state">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Erro ao carregar dados</h3>
        <p>${mensagem}</p>
        <button class="btn-primary" onclick="monitoramentoTempoReal.carregarDadosCompleto()">
          <i class="fas fa-sync-alt"></i> Tentar novamente
        </button>
      </div>
    `;
  }
  
  iniciarEventosSSE() {
    const token = localStorage.getItem('auth_token');
    this.eventSource = new EventSource(`/api/monitoramento-cozinha/eventos?token=${encodeURIComponent(token)}`);
    
    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'nova-refeicao') {
          this.atualizarContadorRefeicoes(data.total);
          this.adicionarNotificacao(`📢 Nova refeição registrada! Total: ${data.total}`);
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
    if (this.atualizacaoTimer) {
      clearInterval(this.atualizacaoTimer);
    }
    
    this.atualizacaoTimer = setInterval(() => {
      this.carregarDados();
      this.carregarFeedbacks();
    }, 30000);
  }
  
  renderizar(data) {
    const container = document.getElementById('contentArea');
    
    const cozinha = data.cozinha || {};
    const gestao = data.gestaoGeral || {};
    const contagem = cozinha.contagemRefeicoes || { manha: 0, almoco: 0, tarde: 0, total: 0, pessoasUnicas: 0 };
    const perfis = cozinha.perfisAlimentares || { sempre: 0, as_vezes: 0, nunca: 0 };
    const previsao = cozinha.previsaoComida || { manha: 0, almoco: 0, tarde: 0, total: 0 };
    const adesao = cozinha.totalPessoas ? ((contagem.pessoasUnicas / cozinha.totalPessoas) * 100).toFixed(0) : 0;
    
    container.innerHTML = `
      <div class="monitoramento-dashboard">
        <!-- Header com status -->
        <div class="dashboard-header">
          <div class="header-title">
            <i class="fas fa-chart-line"></i>
            <div>
              <h1>Monitoramento em Tempo Real</h1>
              <p>Dados da Coordenação de Pátio e Cozinha</p>
            </div>
          </div>
          <div class="header-status">
            <span class="status-badge online" id="statusConexao">
              <i class="fas fa-circle"></i> Conectado
            </span>
            <button class="btn-refresh" onclick="monitoramentoTempoReal.carregarDadosCompleto()">
              <i class="fas fa-sync-alt"></i> Atualizar
            </button>
          </div>
        </div>

        <!-- Alertas -->
        ${(data.alertas || []).length > 0 ? `
          <div class="alertas-grid">
            ${(data.alertas || []).map(a => `
              <div class="alerta-card ${a.tipo}">
                <div class="alerta-icon"><i class="fas ${a.tipo === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i></div>
                <div class="alerta-content">
                  <div class="alerta-title">${a.titulo}</div>
                  <div class="alerta-message">${a.mensagem}</div>
                  ${a.sugestao ? `<div class="alerta-sugestao"><i class="fas fa-lightbulb"></i> ${a.sugestao}</div>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <!-- Cards de Métricas -->
        <div class="metrics-grid">
          <div class="metric-card purple">
            <div class="metric-icon"><i class="fas fa-users"></i></div>
            <div class="metric-info">
              <div class="metric-value">${cozinha.totalPessoas || 0}</div>
              <div class="metric-label">Total de Pessoas</div>
            </div>
          </div>
          <div class="metric-card green">
            <div class="metric-icon"><i class="fas fa-utensils"></i></div>
            <div class="metric-info">
              <div class="metric-value">${contagem.total}</div>
              <div class="metric-label">Refeições Hoje</div>
              <div class="metric-detail">${contagem.pessoasUnicas} pessoas únicas</div>
            </div>
          </div>
          <div class="metric-card orange">
            <div class="metric-icon"><i class="fas fa-chart-pie"></i></div>
            <div class="metric-info">
              <div class="metric-value">${adesao}%</div>
              <div class="metric-label">Taxa de Adesão</div>
              <div class="metric-detail">do total de pessoas</div>
            </div>
          </div>
          <div class="metric-card blue">
            <div class="metric-icon"><i class="fas fa-clock"></i></div>
            <div class="metric-info">
              <div class="metric-value" id="ultimaAtualizacao">--:--:--</div>
              <div class="metric-label">Última Atualização</div>
            </div>
          </div>
        </div>

        <!-- Refeições por Tipo -->
        <div class="card">
          <div class="card-header">
            <i class="fas fa-chart-bar"></i>
            <span>Refeições por Período</span>
          </div>
          <div class="card-body">
            <div class="periodos-grid">
              <div class="periodo-card manha">
                <div class="periodo-icon"><i class="fas fa-sun"></i></div>
                <div class="periodo-info">
                  <div class="periodo-value">${contagem.manha}</div>
                  <div class="periodo-label">Lanche da Manhã</div>
                  <div class="periodo-time">08:00 - 10:00</div>
                </div>
              </div>
              <div class="periodo-card almoco">
                <div class="periodo-icon"><i class="fas fa-utensils"></i></div>
                <div class="periodo-info">
                  <div class="periodo-value">${contagem.almoco}</div>
                  <div class="periodo-label">Almoço</div>
                  <div class="periodo-time">11:00 - 13:00</div>
                </div>
              </div>
              <div class="periodo-card tarde">
                <div class="periodo-icon"><i class="fas fa-moon"></i></div>
                <div class="periodo-info">
                  <div class="periodo-value">${contagem.tarde}</div>
                  <div class="periodo-label">Lanche da Tarde</div>
                  <div class="periodo-time">14:00 - 16:00</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Previsão e Perfil Alimentar -->
        <div class="two-columns">
          <div class="card">
            <div class="card-header">
              <i class="fas fa-chart-line"></i>
              <span>Previsão de Consumo</span>
            </div>
            <div class="card-body">
              <div class="previsao-grid">
                <div class="previsao-item">
                  <span class="previsao-label">🌅 Manhã</span>
                  <strong class="previsao-value">${previsao.manha}</strong>
                  <small>kg</small>
                </div>
                <div class="previsao-item">
                  <span class="previsao-label">🍽️ Almoço</span>
                  <strong class="previsao-value">${previsao.almoco}</strong>
                  <small>kg</small>
                </div>
                <div class="previsao-item">
                  <span class="previsao-label">🌙 Tarde</span>
                  <strong class="previsao-value">${previsao.tarde}</strong>
                  <small>kg</small>
                </div>
                <div class="previsao-item total">
                  <span class="previsao-label">📊 Total</span>
                  <strong class="previsao-value">${previsao.total}</strong>
                  <small>kg</small>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <i class="fas fa-chart-pie"></i>
              <span>Perfil Alimentar</span>
            </div>
            <div class="card-body perfil-body">
              <div class="grafico-container">
                <canvas id="graficoPerfilAlimentar" width="100" height="100"></canvas>
              </div>
              <div class="perfil-legend">
                <div class="legend-item"><span class="dot green"></span> Sempre <strong>${perfis.sempre}</strong></div>
                <div class="legend-item"><span class="dot orange"></span> Às vezes <strong>${perfis.as_vezes}</strong></div>
                <div class="legend-item"><span class="dot red"></span> Nunca <strong>${perfis.nunca}</strong></div>
              </div>
            </div>
          </div>
        </div>

        <!-- Refeições por Turma -->
        <div class="card">
          <div class="card-header">
            <i class="fas fa-table"></i>
            <span>Refeições por Turma</span>
            <span class="card-badge">${(cozinha.refeicoesPorTurma || []).length} turmas</span>
          </div>
          <div class="card-body">
            <div class="table-responsive">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Turma</th>
                    <th class="text-center">🌅 Manhã</th>
                    <th class="text-center">🍽️ Almoço</th>
                    <th class="text-center">🌙 Tarde</th>
                    <th class="text-center">Total</th>
                    <th class="text-center">Alunos</th>
                  </tr>
                </thead>
                <tbody>
                  ${(cozinha.refeicoesPorTurma || []).map(t => `
                    <tr>
                      <td><strong>${t.turma}</strong></td>
                      <td class="text-center">${t.manha || 0}</td>
                      <td class="text-center">${t.almoco || 0}</td>
                      <td class="text-center">${t.tarde || 0}</td>
                      <td class="text-center"><strong>${t.total || 0}</strong></td>
                      <td class="text-center">${t.alunosQueComeram || 0}</td>
                    </tr>
                  `).join('')}
                  ${(cozinha.refeicoesPorTurma || []).length === 0 ? `
                    <tr><td colspan="6" class="text-center empty-state">Nenhum registro hoje</td></tr>
                  ` : ''}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Últimos Registros -->
        <div class="card">
          <div class="card-header">
            <i class="fas fa-history"></i>
            <span>Últimos Registros</span>
          </div>
          <div class="card-body">
            <div class="registros-list">
              ${(cozinha.ultimosRegistros || []).slice(0, 10).map(r => `
                <div class="registro-item" style="display: flex; justify-content: space-between; align-items: center;">
                  <div style="flex: 1;">
                    <div class="registro-info">
                      <div class="registro-nome"><strong>${r.alunoNome}</strong></div>
                      <div class="registro-turma" style="font-size: 12px; color: #6c757d;">${r.alunoTurma}</div>
                    </div>
                    <div class="registro-detalhes" style="margin-top: 5px;">
                      <span class="refeicao-badge ${r.tipoRefeicao}" style="font-size: 11px;">
                        ${r.tipoRefeicao === 'manha' ? '🌅 Manhã' : r.tipoRefeicao === 'almoco' ? '🍽️ Almoço' : '🌙 Tarde'}
                      </span>
                      <span class="registro-horario" style="font-size: 11px; margin-left: 8px;">
                        <i class="far fa-clock"></i> ${new Date(r.horario).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  <div class="action-buttons" style="display: flex; gap: 5px;">
                    <button class="btn-icon" onclick="admin.verDetalhesRegistro('${r.id}')" title="Ver detalhes">
                      <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon edit" onclick="admin.editarRegistroRefeicao('${r.id}')" title="Editar registro">
                      <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon danger" onclick="admin.excluirRegistroRefeicao('${r.id}', '${r.alunoNome}', '${r.tipoRefeicao}')" title="Excluir">
                      <i class="fas fa-trash"></i>
                    </button>
                  </div>
                </div>
              `).join('')}
              ${(cozinha.ultimosRegistros || []).length === 0 ? `
                <div class="empty-state">Nenhum registro hoje</div>
              ` : ''}
            </div>
          </div>
        </div>

        <!-- ============================================ -->
        <!-- SEÇÃO: AVALIAÇÕES DOS ALUNOS (FEEDBACKS) - VERSÃO ESTILIZADA -->
        <!-- ============================================ -->
        <div class="card">
          <div class="card-header d-flex justify-content-between align-items-center flex-wrap">
            <div>
              <i class="fas fa-star me-2"></i>
              <span>Avaliações dos Alunos</span>
              <span class="badge bg-success ms-2" id="totalFeedbacksBadge">0</span>
            </div>
            <div>
              <button class="btn-refresh me-2" onclick="monitoramentoTempoReal.carregarFeedbacksCompleto()" style="background: #1e3c72; color: white;">
                <i class="fas fa-sync-alt"></i> Atualizar
              </button>
            </div>
          </div>
          <div class="card-body">
            
            <!-- Cards de Estatísticas dos Feedbacks -->
            <div class="feedback-stats-grid">
              <div class="feedback-stat-card">
                <div class="feedback-stat-icon" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed);">
                  <i class="fas fa-comment-dots"></i>
                </div>
                <div class="feedback-stat-info">
                  <span class="feedback-stat-value" id="totalFeedbacks">0</span>
                  <span class="feedback-stat-label">Total de Avaliações</span>
                </div>
              </div>
              <div class="feedback-stat-card">
                <div class="feedback-stat-icon" style="background: linear-gradient(135deg, #f59e0b, #d97706);">
                  <i class="fas fa-star"></i>
                </div>
                <div class="feedback-stat-info">
                  <span class="feedback-stat-value" id="mediaNotas">0</span>
                  <span class="feedback-stat-label">Média de Notas</span>
                  <div id="estrelasMedia" class="feedback-stars-mini"></div>
                </div>
              </div>
              <div class="feedback-stat-card">
                <div class="feedback-stat-icon" style="background: linear-gradient(135deg, #10b981, #059669);">
                  <i class="fas fa-smile-wink"></i>
                </div>
                <div class="feedback-stat-info">
                  <span class="feedback-stat-value" id="gostaram">0%</span>
                  <span class="feedback-stat-label">Aprovação</span>
                </div>
              </div>
              <div class="feedback-stat-card">
                <div class="feedback-stat-icon" style="background: linear-gradient(135deg, #3b82f6, #2563eb);">
                  <i class="fas fa-filter"></i>
                </div>
                <div class="feedback-stat-info">
                  <span class="feedback-stat-value" id="feedbacksFiltrados">0</span>
                  <span class="feedback-stat-label">Resultados Filtrados</span>
                </div>
              </div>
            </div>

            <!-- Filtros Estilizados -->
            <div class="feedback-filters">
              <div class="feedback-filters-row">
                <div class="feedback-filter-group">
                  <label><i class="fas fa-utensils"></i> Refeição</label>
                  <select id="filtroRefeicaoFeedback" class="feedback-filter-select" onchange="monitoramentoTempoReal.aplicarFiltrosFeedback()">
                    <option value="todas">Todas</option>
                    <option value="manha">🌅 Manhã</option>
                    <option value="almoco">🍽️ Almoço</option>
                    <option value="tarde">🌙 Tarde</option>
                  </select>
                </div>
                <div class="feedback-filter-group">
                  <label><i class="fas fa-star"></i> Nota Mínima</label>
                  <select id="filtroNotaMin" class="feedback-filter-select" onchange="monitoramentoTempoReal.aplicarFiltrosFeedback()">
                    <option value="1">1★ ou mais</option>
                    <option value="2">2★ ou mais</option>
                    <option value="3">3★ ou mais</option>
                    <option value="4">4★ ou mais</option>
                    <option value="5">5★</option>
                  </select>
                </div>
                <div class="feedback-filter-group">
                  <label><i class="fas fa-smile"></i> Opinião</label>
                  <select id="filtroGostou" class="feedback-filter-select" onchange="monitoramentoTempoReal.aplicarFiltrosFeedback()">
                    <option value="todos">Todos</option>
                    <option value="sim">👍 Adoraram</option>
                    <option value="mais_ou_menos">😐 Mais ou menos</option>
                    <option value="nao">👎 Não gostaram</option>
                  </select>
                </div>
                <div class="feedback-filter-group">
                  <label><i class="fas fa-user-secret"></i> Anonimato</label>
                  <select id="filtroAnonimo" class="feedback-filter-select" onchange="monitoramentoTempoReal.aplicarFiltrosFeedback()">
                    <option value="todos">Todos</option>
                    <option value="nao">✅ Identificados</option>
                    <option value="sim">🔒 Anônimos</option>
                  </select>
                </div>
                <div class="feedback-filter-group search">
                  <label><i class="fas fa-search"></i> Buscar</label>
                  <input type="text" id="filtroBuscaFeedback" class="feedback-filter-input" placeholder="Nome, turma ou comentário..." onkeyup="monitoramentoTempoReal.aplicarFiltrosFeedback()">
                </div>
              </div>
              <div class="feedback-filters-actions">
                <button class="feedback-btn-clear" onclick="monitoramentoTempoReal.limparFiltrosFeedback()">
                  <i class="fas fa-eraser"></i> Limpar filtros
                </button>
                <button class="feedback-btn-apply" onclick="monitoramentoTempoReal.aplicarFiltrosFeedback()">
                  <i class="fas fa-search"></i> Aplicar
                </button>
              </div>
            </div>

            <!-- Distribuição de Notas e Opiniões -->
            <div class="feedback-charts">
              <div class="feedback-chart-card">
                <div class="feedback-chart-title">
                  <i class="fas fa-chart-bar"></i> Distribuição das Notas
                </div>
                <div class="feedback-rating-bars">
                  <div class="rating-bar">
                    <span class="rating-label">★ 1</span>
                    <div class="rating-bar-bg"><div id="bar1" class="rating-bar-fill" style="width: 0%; background: #ef4444;"></div></div>
                    <span class="rating-count" id="count1">0</span>
                  </div>
                  <div class="rating-bar">
                    <span class="rating-label">★ 2</span>
                    <div class="rating-bar-bg"><div id="bar2" class="rating-bar-fill" style="width: 0%; background: #f59e0b;"></div></div>
                    <span class="rating-count" id="count2">0</span>
                  </div>
                  <div class="rating-bar">
                    <span class="rating-label">★ 3</span>
                    <div class="rating-bar-bg"><div id="bar3" class="rating-bar-fill" style="width: 0%; background: #3b82f6;"></div></div>
                    <span class="rating-count" id="count3">0</span>
                  </div>
                  <div class="rating-bar">
                    <span class="rating-label">★ 4</span>
                    <div class="rating-bar-bg"><div id="bar4" class="rating-bar-fill" style="width: 0%; background: #10b981;"></div></div>
                    <span class="rating-count" id="count4">0</span>
                  </div>
                  <div class="rating-bar">
                    <span class="rating-label">★ 5</span>
                    <div class="rating-bar-bg"><div id="bar5" class="rating-bar-fill" style="width: 0%; background: #10b981;"></div></div>
                    <span class="rating-count" id="count5">0</span>
                  </div>
                </div>
              </div>
              <div class="feedback-chart-card">
                <div class="feedback-chart-title">
                  <i class="fas fa-smile"></i> Resumo das Opiniões
                </div>
                <div class="opinion-summary">
                  <div class="opinion-item">
                    <div class="opinion-icon"><i class="fas fa-smile-wink"></i></div>
                    <div class="opinion-info">
                      <span class="opinion-label">Adoraram</span>
                      <span class="opinion-value" id="gostaramSim">0</span>
                    </div>
                  </div>
                  <div class="opinion-item">
                    <div class="opinion-icon"><i class="fas fa-meh"></i></div>
                    <div class="opinion-info">
                      <span class="opinion-label">Mais ou menos</span>
                      <span class="opinion-value" id="gostaramMaisMenos">0</span>
                    </div>
                  </div>
                  <div class="opinion-item">
                    <div class="opinion-icon"><i class="fas fa-frown"></i></div>
                    <div class="opinion-info">
                      <span class="opinion-label">Não gostaram</span>
                      <span class="opinion-value" id="gostaramNao">0</span>
                    </div>
                  </div>
                  <div class="opinion-divider"></div>
                  <div class="opinion-item total">
                    <div class="opinion-icon"><i class="fas fa-star"></i></div>
                    <div class="opinion-info">
                      <span class="opinion-label">Média Geral</span>
                      <span class="opinion-value" id="mediaDetalhada">0/5</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Lista de Feedbacks -->
            <div class="feedback-list-header">
              <i class="fas fa-list"></i>
              <span>Últimas Avaliações</span>
              <span class="feedback-list-count" id="feedbacksCount">0</span>
            </div>
            <div class="feedback-table-container">
              <table class="feedback-table">
                <thead>
                  <tr>
                    <th>Aluno</th>
                    <th>Turma</th>
                    <th>Refeição</th>
                    <th>Nota</th>
                    <th>Comentário</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody id="listaFeedbacksAdmin">
                  <tr><td colspan="6" class="text-center">Carregando avaliações...</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Gestão de Rodízio -->
        <div class="card">
          <div class="card-header">
            <i class="fas fa-calendar-alt"></i>
            <span>Gestão de Rodízio</span>
            <button class="btn-add" onclick="admin.abrirModalRodizioGestao()">
              <i class="fas fa-plus"></i> Novo Rodízio
            </button>
          </div>
          <div class="card-body">
            <div class="rodizio-stats">
              <div class="rodizio-stat">
                <div class="stat-number">${gestao.totalRodizios || 0}</div>
                <div class="stat-label">Total de Rodízios</div>
              </div>
              <div class="rodizio-stat">
                <div class="stat-number success">${gestao.turmasComRodizio || 0}</div>
                <div class="stat-label">Turmas com Rodízio</div>
              </div>
              <div class="rodizio-stat">
                <div class="stat-number danger">${gestao.turmasSemRodizio || 0}</div>
                <div class="stat-label">Turmas sem Rodízio</div>
              </div>
            </div>
            
            <div class="table-responsive">
              <table class="data-table compact">
                <thead>
                  <tr>
                    <th>Turma</th>
                    <th>Tipo</th>
                    <th>Dias/Semanas</th>
                    <th>Horário</th>
                    <th>Status Hoje</th>
                    <th width="80">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  ${(gestao.rodizios || []).map(r => {
                    let diasTexto = '';
                    if (r.tipo === 'semanal') {
                      diasTexto = (r.diasSemana || []).map(d => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d]).join(', ');
                    } else if (r.tipo === 'mensal') {
                      if (r.diasMes?.length) diasTexto = `${r.diasMes.length} dias/mês`;
                      else if (r.semanasMes?.length) diasTexto = `${r.semanasMes.map(s => `${s}ª`).join(', ')} semana(s)`;
                    } else {
                      diasTexto = 'Ambos sistemas';
                    }
                    return `
                      <tr>
                        <td><strong>${r.turma}</strong></td>
                        <td><span class="tipo-badge ${r.tipo}">${r.tipo === 'semanal' ? 'Semanal' : r.tipo === 'mensal' ? 'Mensal' : 'Ambos'}</span></td>
                        <td class="dias-cell">${diasTexto || '-'}</td>
                        <td>${r.horario || '-'}</td>
                        <td><span class="status-badge ${r.podeHoje ? 'active' : 'inactive'}">${r.podeHoje ? '✅ Permitido' : '❌ Não permitido'}</span></td>
                        <td>
                          <div class="action-buttons">
                            <button class="btn-icon" onclick="admin.editarRodizioGestao('${r.turma}')" title="Editar"><i class="fas fa-edit"></i></button>
                            <button class="btn-icon delete" onclick="admin.excluirRodizioGestao('${r.turma}')" title="Excluir"><i class="fas fa-trash"></i></button>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                  ${(gestao.rodizios || []).length === 0 ? `
                    <tr><td colspan="6" class="text-center empty-state">Nenhum rodízio configurado</td></tr>
                  ` : ''}
                </tbody>
              </table>
            </div>
            
            <div class="info-footer">
              <i class="fas fa-calendar-day"></i>
              Hoje: ${gestao.hoje?.data || ''} - ${gestao.hoje?.diaSemana || ''} 
              (Dia ${gestao.hoje?.diaMes || ''} do mês, ${gestao.hoje?.semanaMes || ''}ª semana)
            </div>
          </div>
        </div>
      </div>

      <style>
        /* ============================================ */
        /* ESTILOS EXISTENTES - MANTIDOS IGUAIS */
        /* ============================================ */
        .monitoramento-dashboard {
          padding: 24px;
          max-width: 1400px;
          margin: 0 auto;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
          flex-wrap: wrap;
          gap: 16px;
        }
        .header-title {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .header-title i {
          font-size: 32px;
          color: #1e3c72;
          background: #e8f0fe;
          padding: 12px;
          border-radius: 16px;
        }
        .header-title h1 {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
          color: #1e293b;
        }
        .header-title p {
          margin: 4px 0 0;
          font-size: 14px;
          color: #64748b;
        }
        .header-status {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .status-badge {
          padding: 8px 16px;
          border-radius: 40px;
          font-size: 13px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .status-badge.online {
          background: #d1fae5;
          color: #065f46;
        }
        .status-badge.online i {
          font-size: 8px;
          color: #10b981;
        }
        .btn-refresh {
          background: #f1f5f9;
          border: none;
          padding: 8px 16px;
          border-radius: 40px;
          font-size: 13px;
          font-weight: 500;
          color: #475569;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
        }
        .btn-refresh:hover {
          background: #e2e8f0;
          transform: translateY(-1px);
        }
        .alertas-grid {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 24px;
        }
        .alerta-card {
          display: flex;
          gap: 16px;
          padding: 16px 20px;
          border-radius: 16px;
          background: white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
          border-left: 4px solid;
        }
        .alerta-card.warning { border-left-color: #f59e0b; background: #fffbeb; }
        .alerta-card.info { border-left-color: #3b82f6; background: #eff6ff; }
        .alerta-icon i { font-size: 24px; }
        .alerta-card.warning .alerta-icon i { color: #f59e0b; }
        .alerta-card.info .alerta-icon i { color: #3b82f6; }
        .alerta-content { flex: 1; }
        .alerta-title { font-weight: 600; font-size: 14px; margin-bottom: 4px; }
        .alerta-message { font-size: 13px; color: #475569; }
        .alerta-sugestao { margin-top: 8px; font-size: 12px; color: #64748b; }
        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 20px;
          margin-bottom: 24px;
        }
        .metric-card {
          background: white;
          border-radius: 20px;
          padding: 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .metric-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.1);
        }
        .metric-icon {
          width: 56px;
          height: 56px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          color: white;
        }
        .metric-card.purple .metric-icon { background: linear-gradient(135deg, #667eea, #764ba2); }
        .metric-card.green .metric-icon { background: linear-gradient(135deg, #10b981, #059669); }
        .metric-card.orange .metric-icon { background: linear-gradient(135deg, #f59e0b, #d97706); }
        .metric-card.blue .metric-icon { background: linear-gradient(135deg, #3b82f6, #2563eb); }
        .metric-info { flex: 1; }
        .metric-value { font-size: 28px; font-weight: 700; color: #1e293b; line-height: 1.2; }
        .metric-label { font-size: 13px; color: #64748b; margin-top: 4px; }
        .metric-detail { font-size: 11px; color: #94a3b8; margin-top: 2px; }
        .card {
          background: white;
          border-radius: 20px;
          margin-bottom: 24px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          overflow: hidden;
        }
        .card-header {
          padding: 16px 20px;
          background: #f8fafc;
          border-bottom: 1px solid #e5e7eb;
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 600;
          color: #1e293b;
        }
        .card-header i { color: #1e3c72; font-size: 18px; }
        .card-header .card-badge {
          margin-left: auto;
          background: #e2e8f0;
          padding: 4px 12px;
          border-radius: 30px;
          font-size: 12px;
          font-weight: 500;
        }
        .card-body { padding: 20px; }
        .periodos-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 20px;
        }
        .periodo-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          border-radius: 16px;
          background: #f8fafc;
        }
        .periodo-card.manha { border-bottom: 3px solid #f59e0b; }
        .periodo-card.almoco { border-bottom: 3px solid #ef4444; }
        .periodo-card.tarde { border-bottom: 3px solid #06b6d4; }
        .periodo-icon { font-size: 32px; }
        .periodo-info { flex: 1; }
        .periodo-value { font-size: 32px; font-weight: 700; color: #1e293b; }
        .periodo-label { font-size: 13px; color: #475569; }
        .periodo-time { font-size: 11px; color: #94a3b8; margin-top: 4px; }
        .two-columns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-bottom: 24px;
        }
        .previsao-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        .previsao-item {
          text-align: center;
          padding: 16px;
          background: #f8fafc;
          border-radius: 12px;
        }
        .previsao-item.total {
          background: #e0e7ff;
        }
        .previsao-label {
          display: block;
          font-size: 12px;
          color: #64748b;
          margin-bottom: 8px;
        }
        .previsao-value {
          font-size: 24px;
          font-weight: 700;
          color: #1e293b;
          display: block;
        }
        .previsao-item small {
          font-size: 11px;
          color: #94a3b8;
        }
        .perfil-body {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 32px;
        }
        .grafico-container {
          background: #f8fafc;
          border-radius: 50%;
          padding: 8px;
        }
        .perfil-legend {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 14px;
        }
        .legend-item .dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }
        .dot.green { background: #10b981; }
        .dot.orange { background: #f59e0b; }
        .dot.red { background: #ef4444; }
        .legend-item strong { margin-left: auto; min-width: 30px; text-align: right; }
        .table-responsive {
          overflow-x: auto;
        }
        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .data-table th {
          padding: 12px 16px;
          text-align: left;
          font-weight: 600;
          color: #475569;
          background: #f8fafc;
          border-bottom: 1px solid #e5e7eb;
        }
        .data-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #f1f5f9;
          color: #334155;
        }
        .data-table tr:hover td {
          background: #f8fafc;
        }
        .data-table.compact th,
        .data-table.compact td {
          padding: 8px 12px;
        }
        .text-center { text-align: center; }
        .empty-state {
          text-align: center;
          padding: 40px;
          color: #94a3b8;
        }
        .registros-list {
          display: flex;
          flex-direction: column;
        }
        .registro-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 0;
          border-bottom: 1px solid #f1f5f9;
        }
        .registro-item:last-child { border-bottom: none; }
        .registro-nome { font-weight: 600; color: #1e293b; }
        .registro-turma { font-size: 12px; color: #94a3b8; margin-top: 2px; }
        .registro-detalhes { display: flex; align-items: center; gap: 12px; }
        .refeicao-badge {
          padding: 4px 12px;
          border-radius: 30px;
          font-size: 11px;
          font-weight: 500;
        }
        .refeicao-badge.manha { background: #fef3c7; color: #d97706; }
        .refeicao-badge.almoco { background: #fee2e2; color: #dc2626; }
        .refeicao-badge.tarde { background: #d1fae5; color: #059669; }
        .registro-horario { font-size: 12px; color: #64748b; }
        .rodizio-stats {
          display: flex;
          gap: 20px;
          margin-bottom: 24px;
        }
        .rodizio-stat {
          flex: 1;
          text-align: center;
          padding: 16px;
          background: #f8fafc;
          border-radius: 16px;
        }
        .rodizio-stat .stat-number {
          font-size: 28px;
          font-weight: 700;
          color: #1e293b;
        }
        .rodizio-stat .stat-number.success { color: #10b981; }
        .rodizio-stat .stat-number.danger { color: #ef4444; }
        .rodizio-stat .stat-label { font-size: 13px; color: #64748b; margin-top: 4px; }
        .tipo-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 30px;
          font-size: 11px;
          font-weight: 500;
        }
        .tipo-badge.semanal { background: #dbeafe; color: #1e40af; }
        .tipo-badge.mensal { background: #fef3c7; color: #92400e; }
        .tipo-badge.ambos { background: #e0e7ff; color: #3730a3; }
        .status-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 30px;
          font-size: 11px;
          font-weight: 500;
        }
        .status-badge.active { background: #d1fae5; color: #065f46; }
        .status-badge.inactive { background: #fee2e2; color: #991b1b; }
        .action-buttons {
          display: flex;
          gap: 8px;
        }
        .btn-icon {
          background: transparent;
          border: none;
          padding: 6px;
          border-radius: 8px;
          cursor: pointer;
          color: #64748b;
          transition: all 0.2s;
        }
        .btn-icon:hover {
          background: #f1f5f9;
          color: #1e3c72;
        }
        .btn-icon.delete:hover {
          color: #dc2626;
        }
        .btn-add {
          margin-left: auto;
          background: linear-gradient(135deg, #1e3c72, #2a5298);
          color: white;
          border: none;
          padding: 6px 16px;
          border-radius: 30px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
        }
        .btn-add:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0,0,0,0.1);
        }
        .dias-cell {
          max-width: 180px;
          font-size: 12px;
          color: #475569;
        }
        .info-footer {
          margin-top: 20px;
          padding: 12px 16px;
          background: #eff6ff;
          border-radius: 12px;
          font-size: 12px;
          color: #1e40af;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .error-state {
          text-align: center;
          padding: 60px;
          background: white;
          border-radius: 20px;
        }
        .error-state i {
          font-size: 48px;
          color: #dc2626;
          margin-bottom: 16px;
        }
        .error-state h3 {
          margin-bottom: 8px;
          color: #1e293b;
        }
        .error-state p {
          color: #64748b;
          margin-bottom: 20px;
        }
        
        /* ============================================ */
        /* ESTILOS ESPECÍFICOS PARA FEEDBACKS (NOVOS) */
        /* ============================================ */
        
        .feedback-stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        
        .feedback-stat-card {
          background: white;
          border-radius: 20px;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
          border: 1px solid #eef2f6;
          transition: all 0.3s;
        }
        
        .feedback-stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.08);
        }
        
        .feedback-stat-icon {
          width: 52px;
          height: 52px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          color: white;
        }
        
        .feedback-stat-info {
          flex: 1;
        }
        
        .feedback-stat-value {
          display: block;
          font-size: 28px;
          font-weight: 700;
          color: #1e293b;
          line-height: 1.2;
        }
        
        .feedback-stat-label {
          font-size: 12px;
          color: #64748b;
        }
        
        .feedback-stars-mini {
          margin-top: 4px;
          font-size: 11px;
        }
        
        .feedback-filters {
          background: #f8fafc;
          border-radius: 20px;
          padding: 20px;
          margin-bottom: 24px;
          border: 1px solid #eef2f6;
        }
        
        .feedback-filters-row {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 16px;
        }
        
        .feedback-filter-group {
          flex: 1;
          min-width: 140px;
        }
        
        .feedback-filter-group label {
          display: block;
          font-size: 11px;
          font-weight: 600;
          color: #475569;
          margin-bottom: 6px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .feedback-filter-group label i {
          margin-right: 4px;
          font-size: 11px;
        }
        
        .feedback-filter-select,
        .feedback-filter-input {
          width: 100%;
          padding: 10px 12px;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          font-size: 13px;
          background: white;
          transition: all 0.2s;
        }
        
        .feedback-filter-select:focus,
        .feedback-filter-input:focus {
          outline: none;
          border-color: #1e3c72;
          box-shadow: 0 0 0 3px rgba(30, 60, 114, 0.1);
        }
        
        .feedback-filter-group.search {
          flex: 1.5;
        }
        
        .feedback-filters-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding-top: 8px;
        }
        
        .feedback-btn-clear {
          background: #e2e8f0;
          border: none;
          padding: 8px 20px;
          border-radius: 30px;
          font-size: 12px;
          font-weight: 500;
          color: #475569;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .feedback-btn-clear:hover {
          background: #cbd5e1;
          transform: translateY(-1px);
        }
        
        .feedback-btn-apply {
          background: linear-gradient(135deg, #1e3c72, #2a5298);
          border: none;
          padding: 8px 24px;
          border-radius: 30px;
          font-size: 12px;
          font-weight: 500;
          color: white;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .feedback-btn-apply:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(30, 60, 114, 0.3);
        }
        
        .feedback-charts {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
          margin-bottom: 24px;
        }
        
        .feedback-chart-card {
          background: #f8fafc;
          border-radius: 20px;
          padding: 20px;
          border: 1px solid #eef2f6;
        }
        
        .feedback-chart-title {
          font-size: 14px;
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 2px solid #e2e8f0;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .feedback-chart-title i {
          color: #1e3c72;
        }
        
        .rating-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        
        .rating-label {
          width: 35px;
          font-size: 12px;
          font-weight: 600;
          color: #475569;
        }
        
        .rating-bar-bg {
          flex: 1;
          height: 8px;
          background: #e2e8f0;
          border-radius: 10px;
          overflow: hidden;
        }
        
        .rating-bar-fill {
          height: 100%;
          border-radius: 10px;
          transition: width 0.5s ease;
        }
        
        .rating-count {
          width: 35px;
          font-size: 12px;
          font-weight: 600;
          color: #1e293b;
          text-align: right;
        }
        
        .opinion-summary {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .opinion-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          background: white;
          border-radius: 12px;
          transition: all 0.2s;
        }
        
        .opinion-item:hover {
          transform: translateX(4px);
        }
        
        .opinion-icon {
          width: 36px;
          height: 36px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }
        
        .opinion-item:first-child .opinion-icon { background: #d1fae5; color: #10b981; }
        .opinion-item:nth-child(2) .opinion-icon { background: #fef3c7; color: #f59e0b; }
        .opinion-item:nth-child(3) .opinion-icon { background: #fee2e2; color: #ef4444; }
        .opinion-item.total .opinion-icon { background: #e0e7ff; color: #1e3c72; }
        
        .opinion-info {
          flex: 1;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .opinion-label {
          font-size: 13px;
          font-weight: 500;
          color: #475569;
        }
        
        .opinion-value {
          font-size: 18px;
          font-weight: 700;
          color: #1e293b;
        }
        
        .opinion-divider {
          height: 1px;
          background: #e2e8f0;
          margin: 8px 0;
        }
        
        .feedback-list-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 2px solid #eef2f6;
        }
        
        .feedback-list-header i {
          font-size: 16px;
          color: #1e3c72;
        }
        
        .feedback-list-header span {
          font-size: 14px;
          font-weight: 600;
          color: #1e293b;
        }
        
        .feedback-list-count {
          background: #e2e8f0;
          padding: 2px 10px;
          border-radius: 30px;
          font-size: 11px;
          font-weight: 600;
          color: #475569;
        }
        
        .feedback-table-container {
          overflow-x: auto;
          border-radius: 16px;
          border: 1px solid #eef2f6;
        }
        
        .feedback-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        
        .feedback-table th {
          padding: 14px 16px;
          text-align: left;
          font-weight: 600;
          color: #475569;
          background: #f8fafc;
          border-bottom: 1px solid #eef2f6;
        }
        
        .feedback-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #f1f5f9;
          color: #334155;
        }
        
        .feedback-table tr:hover td {
          background: #f8fafc;
        }
        
        .feedback-nota-badge {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 4px 10px;
          border-radius: 30px;
          font-size: 11px;
          font-weight: 600;
        }
        
        .feedback-nota-badge.alta { background: #d1fae5; color: #065f46; }
        .feedback-nota-badge.media { background: #fef3c7; color: #92400e; }
        .feedback-nota-badge.baixa { background: #fee2e2; color: #991b1b; }
        
        @media (max-width: 1024px) {
          .feedback-stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .feedback-charts {
            grid-template-columns: 1fr;
          }
        }
        
        @media (max-width: 768px) {
          .feedback-stats-grid {
            grid-template-columns: 1fr;
          }
          .feedback-filters-row {
            flex-direction: column;
          }
          .feedback-filter-group.search {
            flex: auto;
          }
        }
      </style>
    `;
    
    this.inicializarGraficos(data);
  }
  
  inicializarGraficos(data) {
    const canvas = document.getElementById('graficoPerfilAlimentar');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (this.graficos.perfil) this.graficos.perfil.destroy();
    
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
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw}` } }
        }
      }
    });
  }
  
  atualizarGraficos(data) {
    if (this.graficos.perfil) {
      const perfis = data.cozinha?.perfisAlimentares || {};
      this.graficos.perfil.data.datasets[0].data = [perfis.sempre || 0, perfis.as_vezes || 0, perfis.nunca || 0];
      this.graficos.perfil.update();
    }
  }
  
  atualizarContadorRefeicoes(total) {
    const el = document.getElementById('totalRefeicoes');
    if (el) el.textContent = total;
  }
  
  atualizarTimestamp(timestamp) {
    const el = document.getElementById('ultimaAtualizacao');
    if (el) el.textContent = new Date(timestamp).toLocaleTimeString('pt-BR');
  }
  
  adicionarNotificacao(mensagem) {
    const container = document.querySelector('.alertas-grid');
    if (container) {
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
