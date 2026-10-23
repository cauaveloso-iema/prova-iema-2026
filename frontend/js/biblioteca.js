// ============================================
// BIBLIOTECA - ADMIN JS
// ============================================

// ============================================
// 🚫 BLOQUEAR ALERTS NATIVOS (KODULAR/WEBVIEW)
// ============================================
window.alert = function(mensagem) {
    console.warn('⚠️ alert() nativo bloqueado. Use mostrarToast()');
    if (typeof mostrarToast === 'function') {
        mostrarToast(String(mensagem), 'info', 4000);
    }
};

window.confirm = function(mensagem) {
    console.warn('⚠️ confirm() nativo bloqueado. Use await confirmar()');
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

// ========== PAGINAÇÃO DASHBOARD ==========
let dashboardPaginaAtual = 1;
let dashboardTotalPaginas = 1;
let dashboardFiltros = {
    alunoNome: '',
    turma: '',
    motivo: '',
    status: '',
    dataInicio: '',
    dataFim: ''
};

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

// ============================================
// 📄 UTILITÁRIO: GERADOR DE CSV PROFISSIONAL
// ============================================
/**
 * Gera CSV profissional com cabeçalho institucional, metadados, tabela e rodapé.
 *
 * @param {Object} opts
 * @param {string}   opts.titulo        - Título do relatório
 * @param {string}  [opts.subtitulo]    - Subtítulo (ex: "Turma: 3º Ano A")
 * @param {string}  [opts.setor]        - Setor (default: "Biblioteca")
 * @param {Array}    opts.colunas       - [{ label, key, format? }]
 * @param {Array}    opts.registros     - Dados
 * @param {Array<{label, valor}>} [opts.filtros] - Filtros aplicados
 * @param {string}   opts.nomeArquivo   - Nome do arquivo (sem extensão)
 * @param {string}  [opts.observacoes]  - Observações extras
 * @param {Object}  [opts.metricas]     - { label: valor } extras (opcional)
 */
function gerarBaixarCSV(opts) {
    const {
        titulo = 'Relatório',
        subtitulo = '',
        setor = 'Biblioteca',
        colunas = [],
        registros = [],
        filtros = [],
        nomeArquivo = 'relatorio',
        observacoes = '',
        metricas = null
    } = opts || {};

    if (!Array.isArray(colunas) || colunas.length === 0) {
        mostrarToast('⚠️ Nenhuma coluna definida para exportação', 'warning');
        return false;
    }
    if (!Array.isArray(registros) || registros.length === 0) {
        mostrarToast('⚠️ Nenhum registro para exportar', 'warning');
        return false;
    }

    const agora = new Date();
    const dataGeracao = agora.toLocaleString('pt-BR');
    const dataArquivo = agora.toISOString().split('T')[0];

    // Escapa valor para célula CSV
    const esc = (v) => {
        if (v === null || v === undefined) return '""';
        let s = String(v)
            .replace(/\r\n|\r|\n/g, ' ')   // remove quebras internas
            .replace(/"/g, '""')            // escapa aspas
            .trim();
        return `"${s}"`;
    };

    // Linha mesclada (1 célula visível + separadores até completar colunas)
    const linhaUnica = (texto) => {
        const t = String(texto ?? '').replace(/"/g, '""');
        return `"${t}"` + ';'.repeat(Math.max(0, colunas.length - 1));
    };

    const linhaCabecalho = colunas.map(c => esc(c.label)).join(';');
    const linhasDados = registros.map(reg => {
        return colunas.map(col => {
            let v;
            try {
                v = col.format ? col.format(reg) : reg[col.key];
            } catch (e) {
                console.warn(`Erro coluna ${col.key}:`, e);
                v = '';
            }
            return esc(v);
        }).join(';');
    });

    // ============================================
    // MONTAGEM
    // ============================================
    const L = [];

    // 🏛️ Cabeçalho institucional
    L.push(linhaUnica('IEMA PLENO: SÃO LUÍS - CENTRO'));
    L.push(linhaUnica('Sistema de Atendimentos — EducaPleno'));
    L.push(linhaUnica(`Setor: ${setor}`));
    L.push(linhaUnica(''));

    // 📋 Título
    L.push(linhaUnica(titulo.toUpperCase()));
    if (subtitulo) L.push(linhaUnica(subtitulo));
    L.push(linhaUnica(''));

    // 📊 Metadados
    L.push(linhaUnica(`Data de geração: ${dataGeracao}`));
    L.push(linhaUnica(`Total de registros: ${registros.length}`));

    if (metricas && typeof metricas === 'object') {
        Object.entries(metricas).forEach(([label, valor]) => {
            if (valor !== null && valor !== undefined && valor !== '') {
                L.push(linhaUnica(`${label}: ${valor}`));
            }
        });
    }

    if (filtros.length > 0) {
        L.push(linhaUnica('Filtros aplicados:'));
        filtros.forEach(f => {
            if (f && f.valor) L.push(linhaUnica(`  • ${f.label}: ${f.valor}`));
        });
    }

    if (observacoes) {
        L.push(linhaUnica(`Observações: ${observacoes}`));
    }

    L.push(linhaUnica(''));
    L.push(linhaUnica('─'.repeat(40)));
    L.push(linhaUnica(''));

    // 📋 Tabela
    L.push(linhaCabecalho);
    L.push(...linhasDados);

    L.push(linhaUnica(''));
    L.push(linhaUnica('─'.repeat(40)));
    L.push(linhaUnica(''));

    // 🖋️ Rodapé
    L.push(linhaUnica('Documento gerado automaticamente pelo EducaPleno'));
    L.push(linhaUnica(`Setor responsável: ${setor}`));
    L.push(linhaUnica(`Gerado em: ${dataGeracao}`));
    L.push(linhaUnica('Este relatório é de uso interno e confidencial.'));

    const csv = '\uFEFF' + L.join('\r\n');

    // Download
    try {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.href = url;
        link.download = `${nomeArquivo}_${dataArquivo}.csv`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
        return true;
    } catch (e) {
        console.error('Erro ao gerar CSV:', e);
        mostrarToast('❌ Erro ao gerar CSV', 'error');
        return false;
    }
}

/**
 * 🕐 FORMATA DURAÇÃO EM MINUTOS PARA FORMATO LEGÍVEL
 * Ex: 45 → "45min"
 *     60 → "1h"
 *     90 → "1h 30min"
 *     125 → "2h 5min"
 */
function formatarDuracao(minutos) {
  if (!minutos || minutos < 0) return '0min';
  
  const mins = Math.round(minutos);
  
  if (mins < 60) {
    return `${mins}min`;
  }
  
  const horas = Math.floor(mins / 60);
  const minsRestantes = mins % 60;
  
  if (minsRestantes === 0) {
    return `${horas}h`;
  }
  
  return `${horas}h ${minsRestantes}min`;
}

/**
 * 🕐 FORMATA DURAÇÃO ABREVIADA (para badges)
 */
function formatarDuracaoCurta(minutos) {
  if (!minutos || minutos < 0) return '0m';
  
  const mins = Math.round(minutos);
  
  if (mins < 60) {
    return `${mins}m`;
  }
  
  const horas = Math.floor(mins / 60);
  const minsRestantes = mins % 60;
  
  if (minsRestantes === 0) {
    return `${horas}h`;
  }
  
  return `${horas}h${minsRestantes}m`;
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
  
  const agora = new Date();
  const offset = agora.getTimezoneOffset() * 60000;
  const dataLocal = new Date(agora.getTime() - offset);
  if (safeGet('dataEntrada')) safeGet('dataEntrada').value = dataLocal.toISOString().slice(0, 16);
  
  modalQRCode = new bootstrap.Modal(safeGet('modalQRCode'));
  
  await Promise.all([
    carregarFotoPerfil(),
    carregarTurmasManual(),
    carregarTurmasRelatorio(),
    carregarConfiguracaoBiblioteca()
  ]);
  
  await iniciarScannerAutomatico();
  await carregarAtendimentosAtivos();
  
  // Tabs
  safeGet('ativos-tab')?.addEventListener('shown.bs.tab', carregarAtendimentosAtivos);
  safeGet('dashboard-tab')?.addEventListener('shown.bs.tab', () => {
    carregarDashboard();
    carregarListaVisitasDashboard();
  });
  safeGet('relatorios-tab')?.addEventListener('shown.bs.tab', carregarTurmasRelatorio);
  safeGet('registro-tab')?.addEventListener('shown.bs.tab', () => {
    if (modoAtual === 'automatico') iniciarScannerAutomatico();
  });
  safeGet('config-tab')?.addEventListener('shown.bs.tab', carregarConfiguracaoBiblioteca);
  
  // Eventos
  safeGet('filtroTurmaManual')?.addEventListener('change', carregarAlunosPorTurma);
  safeGet('filtroBuscaManual')?.addEventListener('input', filtrarAlunosManual);
  
  // Eventos dos filtros do dashboard
  safeGet('dashboardFiltroAluno')?.addEventListener('input', debounce(() => {
    dashboardFiltros.alunoNome = safeGet('dashboardFiltroAluno').value;
    dashboardPaginaAtual = 1;
    carregarListaVisitasDashboard();
  }, 500));
  
  safeGet('dashboardFiltroTurma')?.addEventListener('change', () => {
    dashboardFiltros.turma = safeGet('dashboardFiltroTurma').value;
    dashboardPaginaAtual = 1;
    carregarListaVisitasDashboard();
  });
  
  safeGet('dashboardFiltroMotivo')?.addEventListener('change', () => {
    dashboardFiltros.motivo = safeGet('dashboardFiltroMotivo').value;
    dashboardPaginaAtual = 1;
    carregarListaVisitasDashboard();
  });
  
  safeGet('dashboardFiltroStatus')?.addEventListener('change', () => {
    dashboardFiltros.status = safeGet('dashboardFiltroStatus').value;
    dashboardPaginaAtual = 1;
    carregarListaVisitasDashboard();
  });
  
  safeGet('dashboardFiltroDataInicio')?.addEventListener('change', () => {
    dashboardFiltros.dataInicio = safeGet('dashboardFiltroDataInicio').value;
    dashboardPaginaAtual = 1;
    carregarListaVisitasDashboard();
  });
  
  safeGet('dashboardFiltroDataFim')?.addEventListener('change', () => {
    dashboardFiltros.dataFim = safeGet('dashboardFiltroDataFim').value;
    dashboardPaginaAtual = 1;
    carregarListaVisitasDashboard();
  });
  
  setInterval(() => {
    if (safeGet('ativos-tab')?.classList.contains('active')) carregarAtendimentosAtivos();
  }, 30000);
    
  if (safeGet('notificacoesBtn')) {
      iniciarNotificacoes();

      // ✅ Força atualização dos badges do avatar logo após o boot
      setTimeout(async () => {
          try { await carregarNotificacoes(); } catch (e) { /* silencioso */ }
      }, 1200);
  }
});

// Debounce helper
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

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

// ============================================
// 1. RELÓGIO EM TEMPO REAL
// ============================================
function atualizarRelogio() {
    const elTempo = document.getElementById('relogioTempoReal');
    const elData = document.getElementById('relogioData');
    if (!elTempo) return;

    const agora = new Date();
    const horas = String(agora.getHours()).padStart(2, '0');
    const minutos = String(agora.getMinutes()).padStart(2, '0');
    const segundos = String(agora.getSeconds()).padStart(2, '0');

    elTempo.textContent = `${horas}:${minutos}:${segundos}`;

    if (elData) {
        const dataFormatada = agora.toLocaleDateString('pt-BR', {
            weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
        });
        elData.textContent = dataFormatada.replace(/\./g, '').replace(/,/g, ' •');
    }
}
setInterval(atualizarRelogio, 1000);
atualizarRelogio();

// ============================================
// 2. MENU DO USUÁRIO (Avatar)
// ============================================
function toggleUserMenu(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('userDropdown');
    const chevron = document.getElementById('userChevron');

    if (dropdown) {
        const isShowing = dropdown.classList.contains('show');
        if (isShowing) {
            dropdown.classList.remove('show');
            if (chevron) chevron.style.transform = 'rotate(0deg)';
        } else {
            dropdown.classList.add('show');
            if (chevron) chevron.style.transform = 'rotate(180deg)';
        }
    }
}

document.addEventListener('click', function (event) {
    const container = document.getElementById('userMenuContainer');
    const dropdown = document.getElementById('userDropdown');
    const chevron = document.getElementById('userChevron');

    if (container && !container.contains(event.target)) {
        if (dropdown) dropdown.classList.remove('show');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
});

// ============================================
// 3. NOTIFICAÇÕES NO AVATAR (Badge + anel pulsante)
// ✅ Versão corrigida: usa variáveis LOCAIS e atualiza TODOS os badges
// ============================================
function atualizarBadgeUnificado() {
    // 1) Calcula total a partir das variáveis LOCAIS (não do window!)
    let totalNaoLidas = 0;
    let totalLembretes = 0;
    try {
        if (typeof __totalNaoLidasServidor === 'number' && __totalNaoLidasServidor >= 0) {
            totalNaoLidas = __totalNaoLidasServidor;
        } else {
            totalNaoLidas = (__notificacoesCache || []).filter(n => !n.lida).length;
        }
        // Biblioteca não tem lembretes retroativos, mas mantém compatibilidade
        totalLembretes = (typeof __lembretesCache !== 'undefined' && Array.isArray(__lembretesCache))
            ? __lembretesCache.length
            : 0;
    } catch (e) {
        console.warn('[atualizarBadgeUnificado] erro ao contar:', e);
    }
    const total = totalNaoLidas + totalLembretes;

    // 2) Badge do sino escondido (notificacoesBadge)
    const badgeSino = document.getElementById('notificacoesBadge');
    if (badgeSino) {
        if (total > 0) {
            badgeSino.textContent = total > 99 ? '99+' : total;
            badgeSino.style.display = 'flex';
        } else {
            badgeSino.style.display = 'none';
        }
    }

    // 3) Badge numérico no avatar (userNotificationBadge)
    const badgeAvatar = document.getElementById('userNotificationBadge');
    if (badgeAvatar) {
        if (total > 0) {
            badgeAvatar.textContent = total > 9 ? '9+' : String(total);
            badgeAvatar.style.display = 'flex';
        } else {
            badgeAvatar.style.display = 'none';
        }
    }

    // 4) Badge no item "Notificações" do menu dropdown
    const badgeMenu = document.getElementById('menuNotifBadge');
    if (badgeMenu) {
        if (total > 0) {
            badgeMenu.style.display = 'inline-block';
            badgeMenu.textContent = total > 99 ? '99+' : total;
        } else {
            badgeMenu.style.display = 'none';
        }
    }

    // 5) Anel pulsante no trigger do usuário
    const trigger = document.getElementById('userTrigger');
    if (trigger) {
        if (total > 0) trigger.classList.add('tem-notificacao');
        else trigger.classList.remove('tem-notificacao');
    }
}

// ============================================
// 4. BOAS-VINDAS E TURNO DINÂMICO
// ============================================
function atualizarBoasVindasETurno() {
    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
    const nomeEl = document.getElementById('headerNomeUsuario');
    if (nomeEl && userData.nome) {
        nomeEl.textContent = userData.nome.split(' ')[0];
    }

    const agora = new Date();
    const hora = agora.getHours();
    let turno = 'Matutino';
    let icone = 'fa-sun text-warning';

    if (hora >= 12 && hora < 18) {
        turno = 'Vespertino';
        icone = 'fa-cloud-sun text-warning';
    } else if (hora >= 18 || hora < 5) {
        turno = 'Noturno';
        icone = 'fa-moon text-primary';
    }

    const turnoEl = document.getElementById('headerTurno');
    const iconeEl = document.getElementById('headerTurnoIcone');

    if (turnoEl) turnoEl.textContent = turno;
    if (iconeEl) iconeEl.className = `fas ${icone} me-1`;
}

document.addEventListener('DOMContentLoaded', () => {
    atualizarBoasVindasETurno();
    setInterval(atualizarBoasVindasETurno, 60000);
});

// ============================================
// 5. ABRIR MENU DE NOTIFICAÇÕES PELO AVATAR
// ============================================
function abrirMenuNotificacoesSeguro(event) {
    if (event) event.stopPropagation();

    // 1. Fecha o menu do usuário
    const userDropdown = document.getElementById('userDropdown');
    const chevron = document.getElementById('userChevron');
    if (userDropdown) userDropdown.classList.remove('show');
    if (chevron) chevron.style.transform = 'rotate(0deg)';

    // 2. Abre o dropdown do sino
    const notifDropdown = document.getElementById('notificacoesDropdown');
    if (notifDropdown) {
        notifDropdown.classList.add('show');
        notifDropdown.style.display = 'block';
    }

    // 3. Carrega as notificações (cascata de fallbacks)
    const lista = document.getElementById('notificacoesLista');
    if (lista) {
        lista.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #6c757d;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 10px;"></i>
                <p>Carregando...</p>
            </div>
        `;
    }

    if (typeof carregarListaNotificacoes === 'function') {
        carregarListaNotificacoes().catch(err => {
            console.error('Erro ao carregar notificações:', err);
            mostrarFallbackNotificacoesBib(lista);
        });
    } else if (typeof carregarNotificacoes === 'function') {
        carregarNotificacoes().catch(err => {
            console.error('Erro ao carregar notificações:', err);
            mostrarFallbackNotificacoesBib(lista);
        });
    } else if (typeof carregarTudo === 'function') {
        try { carregarTudo(); } catch (e) {
            mostrarFallbackNotificacoesBib(lista);
        }
    } else if (typeof abrirNotificacoes === 'function') {
        try { abrirNotificacoes(); } catch (e) {
            mostrarFallbackNotificacoesBib(lista);
        }
    } else {
        mostrarFallbackNotificacoesBib(lista);
    }
}

function mostrarFallbackNotificacoesBib(lista) {
    if (!lista) return;
    lista.innerHTML = `
        <div style="text-align: center; padding: 40px; color: #6c757d;">
            <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 10px; color: #f59e0b;"></i>
            <p>Não foi possível carregar as notificações.</p>
            <button onclick="abrirMenuNotificacoesSeguro()"
                    style="margin-top: 10px; padding: 8px 16px; background: #0ea5e9; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                <i class="fas fa-sync-alt"></i> Tentar novamente
            </button>
        </div>
    `;
}

// ============================================
// 6. FECHAR O SINO (BOTÃO X)
// ============================================
function fecharNotificacoes() {
    const dropdown = document.getElementById('notificacoesDropdown');
    if (dropdown) {
        dropdown.classList.remove('show');
        dropdown.style.display = 'none';
    }

    const btn = document.getElementById('notificacoesBtn');
    if (btn) btn.classList.remove('active');
}

// Impede que o clique no X se propague
document.addEventListener('click', function (event) {
    const btnFecharSino = event.target.closest('.notificacoes-header button[onclick*="fecharNotificacoes"]');
    if (btnFecharSino) {
        event.stopPropagation();
        fecharNotificacoes();
    }
}, true);

// Fecha o sino ao clicar fora dele
document.addEventListener('click', function (event) {
    const notifDropdown = document.getElementById('notificacoesDropdown');
    const containerSino = document.getElementById('containerSinoOriginal');

    if (notifDropdown && notifDropdown.classList.contains('show')) {
        if (containerSino && !containerSino.contains(event.target)) {
            fecharNotificacoes();
        }
    }
});

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
      
      // Preencher também o filtro do dashboard
      const selDash = safeGet('dashboardFiltroTurma');
      if (selDash) {
        selDash.innerHTML = '<option value="">Todas as turmas</option>';
        d.turmas.forEach(t => selDash.innerHTML += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`);
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
      if (d.fechado) {
        mostrarToast('🔒 ' + d.error, 'warning');
      } else {
        mostrarToast('❌ ' + d.error, 'error');
      }
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
      const duracaoFormatada = formatarDuracao(d.atendimento.duracaoMinutos);
      mostrarToast(`✅ ${d.message} (${duracaoFormatada})`, 'success');
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
                <small class="text-muted"><i class="fas fa-clock"></i> ${formatarDuracao(a.tempoAtendimento)}</small><br>
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
  const confirmacao = await confirmar(`🗑️ Excluir atendimento de "${nome}"?\n\nEsta ação não pode ser desfeita.`);
  if (!confirmacao) return;
  
  try {
    const r = await fetch(`/api/biblioteca/atendimento/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const d = await r.json();
    if (d.success) {
      mostrarToast('✅ Excluído com sucesso', 'success');
      carregarAtendimentosAtivos();
      carregarListaVisitasDashboard();
      carregarDashboard();
    } else {
      mostrarToast('❌ ' + d.error, 'error');
    }
  } catch (e) {
    mostrarToast('❌ Erro ao excluir', 'error');
  }
}

async function editarAtendimento(id) {
  try {
    const r = await fetch(`/api/biblioteca/atendimento/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const d = await r.json();
    
    if (!d.success) {
      mostrarToast('Erro ao carregar atendimento', 'error');
      return;
    }
    
    const a = d.atendimento;
    
    // Preencher modal de edição
    safeGet('editAtendimentoId').value = a.id;
    safeGet('editAlunoNome').textContent = a.alunoNome;
    safeGet('editAlunoTurma').textContent = a.alunoTurma || '-';
    
    // Data/hora de entrada
    const dataEntrada = new Date(a.entrada.dataHora);
    const offset = dataEntrada.getTimezoneOffset() * 60000;
    const dataLocal = new Date(dataEntrada.getTime() - offset);
    safeGet('editDataEntrada').value = dataLocal.toISOString().slice(0, 16);
    
    // Motivo
    safeGet('editMotivoVisita').value = a.motivoVisita || '';
    safeGet('editMotivoOutros').value = a.motivoOutros || '';
    safeGet('editCampoOutros').style.display = a.motivoVisita === 'outros' ? 'block' : 'none';
    
    // Observações
    safeGet('editObservacoes').value = a.entrada.observacoes || '';
    
    // Atividades
    document.querySelectorAll('#modalEditarAtendimento .edit-atividade').forEach(chk => {
      chk.checked = a.atividades.includes(chk.value);
    });
    
    // Abrir modal
    const modal = new bootstrap.Modal(safeGet('modalEditarAtendimento'));
    modal.show();
    
  } catch (e) {
    console.error(e);
    mostrarToast('Erro ao carregar atendimento', 'error');
  }
}

async function salvarEdicaoAtendimento() {
  const id = safeGet('editAtendimentoId').value;
  const motivoVisita = safeGet('editMotivoVisita').value;
  const motivoOutros = safeGet('editMotivoOutros').value;
  const observacoes = safeGet('editObservacoes').value;
  const dataEntrada = safeGet('editDataEntrada').value;
  
  if (!motivoVisita) {
    mostrarToast('Selecione o motivo', 'error');
    return;
  }
  
  if (motivoVisita === 'outros' && !motivoOutros.trim()) {
    mostrarToast('Especifique o motivo "Outros"', 'error');
    return;
  }
  
  const atividades = Array.from(document.querySelectorAll('#modalEditarAtendimento .edit-atividade:checked')).map(c => c.value);
  
  try {
    const r = await fetch(`/api/biblioteca/atendimento/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        motivoVisita,
        motivoOutros,
        atividades,
        observacoes,
        dataEntrada: dataEntrada ? new Date(dataEntrada).toISOString() : undefined
      })
    });
    
    const d = await r.json();
    
    if (d.success) {
      mostrarToast('✅ Atendimento atualizado!', 'success');
      bootstrap.Modal.getInstance(safeGet('modalEditarAtendimento')).hide();
      carregarAtendimentosAtivos();
      carregarListaVisitasDashboard();
      carregarDashboard();
    } else {
      mostrarToast('❌ ' + d.error, 'error');
    }
  } catch (e) {
    console.error(e);
    mostrarToast('❌ Erro ao salvar', 'error');
  }
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

// ========== LISTA DE VISITAS PAGINADA (DASHBOARD) ==========
async function carregarListaVisitasDashboard(pagina = null) {
  const container = safeGet('listaVisitasDashboard');
  if (!container) return;
  
  if (pagina !== null) {
    dashboardPaginaAtual = pagina;
  }
  
  const loading = safeGet('loadingVisitasDashboard');
  if (loading) loading.style.display = 'block';
  
  try {
    const params = new URLSearchParams({
      limit: 10,
      page: dashboardPaginaAtual
    });
    
    if (dashboardFiltros.alunoNome) params.append('alunoNome', dashboardFiltros.alunoNome);
    if (dashboardFiltros.turma) params.append('turma', dashboardFiltros.turma);
    if (dashboardFiltros.motivo) params.append('motivo', dashboardFiltros.motivo);
    if (dashboardFiltros.status) params.append('status', dashboardFiltros.status);
    if (dashboardFiltros.dataInicio) params.append('dataInicio', dashboardFiltros.dataInicio);
    if (dashboardFiltros.dataFim) params.append('dataFim', dashboardFiltros.dataFim);
    
    const r = await fetch(`/api/biblioteca/listar?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const d = await r.json();
    
    if (!d.success) {
      container.innerHTML = '<div class="alert alert-danger">Erro ao carregar visitas</div>';
      return;
    }
    
    dashboardTotalPaginas = d.totalPages || 1;
    
    if (d.atendimentos.length === 0) {
      container.innerHTML = `
        <div class="text-center py-5 text-muted">
          <i class="fas fa-inbox fa-3x mb-3" style="opacity:0.3;"></i>
          <p>Nenhuma visita encontrada</p>
        </div>`;
      atualizarPaginacaoDashboard();
      return;
    }
    
    container.innerHTML = `
      <div class="table-responsive">
        <table class="table table-hover align-middle">
          <thead class="table-light">
            <tr>
              <th style="width:50px;">#</th>
              <th>Aluno</th>
              <th style="width:100px;">Turma</th>
              <th>Motivo</th>
              <th style="width:150px;">Entrada</th>
              <th style="width:150px;">Saída</th>
              <th style="width:100px;">Duração</th>
              <th style="width:90px;">Status</th>
              <th style="width:140px;">Ações</th>
            </tr>
          </thead>
          <tbody>
            ${d.atendimentos.map((a, idx) => {
              const num = ((dashboardPaginaAtual - 1) * 10) + idx + 1;
              const entradaFmt = new Date(a.dataHora).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', year: '2-digit',
                hour: '2-digit', minute: '2-digit'
              });
              const saidaFmt = a.dataHoraSaida 
                ? new Date(a.dataHoraSaida).toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                  })
                : '-';
              
              const duracaoFmt = a.duracaoMinutos ? formatarDuracaoCurta(a.duracaoMinutos) : '-';
              
              const statusBadge = a.status === 'em_visita' 
                ? '<span class="badge bg-warning text-dark"><i class="fas fa-clock"></i> Em visita</span>'
                : '<span class="badge bg-success"><i class="fas fa-check"></i> Finalizado</span>';
              
              return `
                <tr>
                  <td class="text-muted">${num}</td>
                  <td>
                    <div class="d-flex align-items-center gap-2">
                      <img src="${a.alunoFoto || gerarAvatarSVG(a.alunoNome)}" 
                           style="width:32px;height:32px;border-radius:50%;object-fit:cover;"
                           onerror="this.onerror=null;this.src='${gerarAvatarSVG(a.alunoNome)}'">
                      <div>
                        <strong>${escapeHTML(a.alunoNome)}</strong>
                        ${a.alunoMatricula ? `<br><small class="text-muted">${escapeHTML(a.alunoMatricula)}</small>` : ''}
                      </div>
                    </div>
                  </td>
                  <td>${escapeHTML(a.alunoTurma || '-')}</td>
                  <td>
                    <span class="badge bg-info">${escapeHTML(a.motivoLabel)}</span>
                    ${a.motivoOutros ? `<br><small class="text-muted">${escapeHTML(a.motivoOutros)}</small>` : ''}
                  </td>
                  <td><small>${entradaFmt}</small></td>
                  <td><small>${saidaFmt}</small></td>
                  <td><strong>${duracaoFmt}</strong></td>
                  <td>${statusBadge}</td>
                  <td>
                    <div class="btn-group btn-group-sm">
                      <button class="btn btn-outline-primary" onclick="verDetalhesAtendimento('${a.id}')" title="Ver detalhes">
                        <i class="fas fa-eye"></i>
                      </button>
                      <button class="btn btn-outline-warning" onclick="editarAtendimento('${a.id}')" title="Editar">
                        <i class="fas fa-edit"></i>
                      </button>
                      <button class="btn btn-outline-danger" onclick="excluirAtendimento('${a.id}', '${escapeHTML(a.alunoNome)}')" title="Excluir">
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
      
      <div class="d-flex justify-content-between align-items-center mt-3">
        <div class="text-muted">
          <small>Mostrando <strong>${((dashboardPaginaAtual - 1) * 10) + 1}</strong> a 
          <strong>${Math.min(dashboardPaginaAtual * 10, d.total)}</strong> de 
          <strong>${d.total}</strong> visitas</small>
        </div>
        <div id="paginacaoDashboard"></div>
      </div>
    `;
    
    atualizarPaginacaoDashboard();
    
  } catch (e) {
    console.error(e);
    container.innerHTML = '<div class="alert alert-danger">Erro de conexão</div>';
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

function atualizarPaginacaoDashboard() {
  const container = safeGet('paginacaoDashboard');
  if (!container) return;
  
  if (dashboardTotalPaginas <= 1) {
    container.innerHTML = '';
    return;
  }
  
  let html = '<nav><ul class="pagination pagination-sm mb-0">';
  
  // Botão anterior
  html += `
    <li class="page-item ${dashboardPaginaAtual === 1 ? 'disabled' : ''}">
      <a class="page-link" href="#" onclick="event.preventDefault(); carregarListaVisitasDashboard(${dashboardPaginaAtual - 1})">
        <i class="fas fa-chevron-left"></i>
      </a>
    </li>
  `;
  
  // Páginas
  const maxVisiveis = 5;
  let inicio = Math.max(1, dashboardPaginaAtual - Math.floor(maxVisiveis / 2));
  let fim = Math.min(dashboardTotalPaginas, inicio + maxVisiveis - 1);
  
  if (fim - inicio + 1 < maxVisiveis) {
    inicio = Math.max(1, fim - maxVisiveis + 1);
  }
  
  if (inicio > 1) {
    html += `
      <li class="page-item">
        <a class="page-link" href="#" onclick="event.preventDefault(); carregarListaVisitasDashboard(1)">1</a>
      </li>
    `;
    if (inicio > 2) {
      html += '<li class="page-item disabled"><span class="page-link">...</span></li>';
    }
  }
  
  for (let i = inicio; i <= fim; i++) {
    html += `
      <li class="page-item ${i === dashboardPaginaAtual ? 'active' : ''}">
        <a class="page-link" href="#" onclick="event.preventDefault(); carregarListaVisitasDashboard(${i})">${i}</a>
      </li>
    `;
  }
  
  if (fim < dashboardTotalPaginas) {
    if (fim < dashboardTotalPaginas - 1) {
      html += '<li class="page-item disabled"><span class="page-link">...</span></li>';
    }
    html += `
      <li class="page-item">
        <a class="page-link" href="#" onclick="event.preventDefault(); carregarListaVisitasDashboard(${dashboardTotalPaginas})">${dashboardTotalPaginas}</a>
      </li>
    `;
  }
  
  // Botão próximo
  html += `
    <li class="page-item ${dashboardPaginaAtual === dashboardTotalPaginas ? 'disabled' : ''}">
      <a class="page-link" href="#" onclick="event.preventDefault(); carregarListaVisitasDashboard(${dashboardPaginaAtual + 1})">
        <i class="fas fa-chevron-right"></i>
      </a>
    </li>
  `;
  
  html += '</ul></nav>';
  container.innerHTML = html;
}

function limparFiltrosDashboard() {
  dashboardFiltros = {
    alunoNome: '',
    turma: '',
    motivo: '',
    status: '',
    dataInicio: '',
    dataFim: ''
  };
  
  if (safeGet('dashboardFiltroAluno')) safeGet('dashboardFiltroAluno').value = '';
  if (safeGet('dashboardFiltroTurma')) safeGet('dashboardFiltroTurma').value = '';
  if (safeGet('dashboardFiltroMotivo')) safeGet('dashboardFiltroMotivo').value = '';
  if (safeGet('dashboardFiltroStatus')) safeGet('dashboardFiltroStatus').value = '';
  if (safeGet('dashboardFiltroDataInicio')) safeGet('dashboardFiltroDataInicio').value = '';
  if (safeGet('dashboardFiltroDataFim')) safeGet('dashboardFiltroDataFim').value = '';
  
  dashboardPaginaAtual = 1;
  carregarListaVisitasDashboard();
}

// ========== VER DETALHES DO ATENDIMENTO ==========
async function verDetalhesAtendimento(id) {
  try {
    const r = await fetch(`/api/biblioteca/atendimento/${id}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const d = await r.json();
    
    if (!d.success) {
      mostrarToast('Erro ao carregar detalhes', 'error');
      return;
    }
    
    const a = d.atendimento;
    
    const duracaoFmt = a.duracaoMinutos ? formatarDuracao(a.duracaoMinutos) : 'Em andamento';
    
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header" style="background: linear-gradient(135deg, #0ea5e9, #0284c7); color: white;">
            <h5 class="modal-title"><i class="fas fa-info-circle"></i> Detalhes do Atendimento</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <div class="row g-3">
              <div class="col-md-12">
                <div class="d-flex align-items-center gap-3 p-3" style="background:#f0f9ff;border-radius:12px;">
                  <img src="${a.alunoFoto || gerarAvatarSVG(a.alunoNome)}" 
                       style="width:64px;height:64px;border-radius:50%;object-fit:cover;"
                       onerror="this.onerror=null;this.src='${gerarAvatarSVG(a.alunoNome)}'">
                  <div>
                    <h5 class="mb-1">${escapeHTML(a.alunoNome)}</h5>
                    <p class="mb-0 text-muted">
                      <i class="fas fa-id-card"></i> ${escapeHTML(a.alunoMatricula || 'Sem matrícula')} • 
                      <i class="fas fa-users"></i> ${escapeHTML(a.alunoTurma || 'Sem turma')} • 
                      <i class="fas fa-graduation-cap"></i> ${escapeHTML(a.alunoCurso || 'Sem curso')}
                    </p>
                  </div>
                </div>
              </div>
              
              <div class="col-md-6">
                <div class="card h-100">
                  <div class="card-header bg-light"><strong><i class="fas fa-sign-in-alt text-success"></i> Entrada</strong></div>
                  <div class="card-body">
                    <p><strong>Data/Hora:</strong> ${new Date(a.entrada.dataHora).toLocaleString('pt-BR')}</p>
                    <p><strong>Registrado por:</strong> ${escapeHTML(a.entrada.registradoPorNome || '-')}</p>
                    ${a.entrada.observacoes ? `<p><strong>Observações:</strong> ${escapeHTML(a.entrada.observacoes)}</p>` : ''}
                    ${a.entrada.editadoEm ? `<p class="text-muted small"><i class="fas fa-edit"></i> Editado em ${new Date(a.entrada.editadoEm).toLocaleString('pt-BR')} por ${escapeHTML(a.entrada.editadoPorNome || '-')}</p>` : ''}
                  </div>
                </div>
              </div>
              
              <div class="col-md-6">
                <div class="card h-100">
                  <div class="card-header bg-light"><strong><i class="fas fa-sign-out-alt text-danger"></i> Saída</strong></div>
                  <div class="card-body">
                    ${a.saida ? `
                      <p><strong>Data/Hora:</strong> ${new Date(a.saida.dataHora).toLocaleString('pt-BR')}</p>
                      <p><strong>Registrado por:</strong> ${escapeHTML(a.saida.registradoPorNome || '-')}</p>
                      ${a.saida.observacoes ? `<p><strong>Observações:</strong> ${escapeHTML(a.saida.observacoes)}</p>` : ''}
                      ${a.saida.livrosConsultados?.length ? `<p><strong>Livros consultados:</strong> ${escapeHTML(a.saida.livrosConsultados.join(', '))}</p>` : ''}
                      ${a.saida.livrosEmprestados?.length ? `<p><strong>Livros emprestados:</strong> ${escapeHTML(a.saida.livrosEmprestados.join(', '))}</p>` : ''}
                      ${a.saida.computadoresUsados ? `<p><strong>Computadores usados:</strong> ${a.saida.computadoresUsados}</p>` : ''}
                      ${a.saida.satisfacao ? `<p><strong>Satisfação:</strong> ${escapeHTML(a.saida.satisfacao)}</p>` : ''}
                    ` : '<p class="text-muted"><i class="fas fa-hourglass-half"></i> Ainda em visita</p>'}
                  </div>
                </div>
              </div>
              
              <div class="col-md-6">
                <div class="card">
                  <div class="card-header bg-light"><strong><i class="fas fa-clipboard-list"></i> Motivo</strong></div>
                  <div class="card-body">
                    <span class="badge bg-info fs-6">${escapeHTML(a.motivoLabel)}</span>
                    ${a.motivoOutros ? `<p class="mt-2 mb-0">${escapeHTML(a.motivoOutros)}</p>` : ''}
                  </div>
                </div>
              </div>
              
              <div class="col-md-6">
                <div class="card">
                  <div class="card-header bg-light"><strong><i class="fas fa-tasks"></i> Atividades</strong></div>
                  <div class="card-body">
                    ${a.atividadesLabels?.length 
                      ? a.atividadesLabels.map(at => `<span class="badge bg-secondary me-1 mb-1">${escapeHTML(at)}</span>`).join('')
                      : '<p class="text-muted mb-0">Nenhuma atividade registrada</p>'}
                  </div>
                </div>
              </div>
              
              <div class="col-md-12">
                <div class="card" style="background: #fef3c7; border: 2px solid #f59e0b;">
                  <div class="card-body text-center">
                    <h4 class="mb-0"><i class="fas fa-clock text-warning"></i> Duração: <strong>${duracaoFmt}</strong></h4>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-warning" onclick="bootstrap.Modal.getInstance(this.closest('.modal')).hide(); editarAtendimento('${a.id}')">
              <i class="fas fa-edit"></i> Editar
            </button>
            <button class="btn btn-danger" onclick="bootstrap.Modal.getInstance(this.closest('.modal')).hide(); excluirAtendimento('${a.id}', '${escapeHTML(a.alunoNome)}')">
              <i class="fas fa-trash"></i> Excluir
            </button>
            <button class="btn btn-secondary" data-bs-dismiss="modal">Fechar</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    
    modal.addEventListener('hidden.bs.modal', () => modal.remove());
    
  } catch (e) {
    console.error(e);
    mostrarToast('Erro ao carregar detalhes', 'error');
  }
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
              <td>${formatarDuracao(a.duracao || 0)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div></div>`;
  }
}

function exportarCSV() {
    if (!relatorioData) {
        mostrarToast('⚠️ Gere um relatório primeiro', 'warning');
        return;
    }

    const d = relatorioData;
    const tipo = d.aluno ? 'aluno' : (d.turma ? 'turma' : 'geral');

    // ============================================
    // COLUNAS + TÍTULO + REGISTROS
    // ============================================
    let titulo = 'Relatório de Atendimentos';
    let subtitulo = '';
    let registros = [];
    let colunas = [];

    if (tipo === 'geral') {
        titulo = 'Relatório Geral de Atendimentos';
        subtitulo = 'Visão consolidada da biblioteca';
        registros = d.ultimosAtendimentos || [];

        colunas = [
            {
                label: 'Data/Hora Entrada',
                format: (a) => a.dataEntrada
                    ? new Date(a.dataEntrada).toLocaleString('pt-BR')
                    : ''
            },
            {
                label: 'Data/Hora Saída',
                format: (a) => a.dataHoraSaida
                    ? new Date(a.dataHoraSaida).toLocaleString('pt-BR')
                    : ''
            },
            {
                label: 'Aluno',
                format: (a) => a.alunoNome || ''
            },
            {
                label: 'Matrícula',
                format: (a) => a.alunoMatricula || ''
            },
            {
                label: 'Turma',
                format: (a) => a.alunoTurma || ''
            },
            {
                label: 'Curso',
                format: (a) => a.alunoCurso || ''
            },
            {
                label: 'Motivo',
                format: (a) => a.motivoLabel || a.motivo || ''
            },
            {
                label: 'Detalhe do Motivo',
                format: (a) => a.motivoOutros || ''
            },
            {
                label: 'Atividades',
                format: (a) => Array.isArray(a.atividadesLabels)
                    ? a.atividadesLabels.join(', ')
                    : (Array.isArray(a.atividades) ? a.atividades.join(', ') : '')
            },
            {
                label: 'Duração',
                format: (a) => formatarDuracao(a.duracao || a.duracaoMinutos || 0)
            },
            {
                label: 'Status',
                format: (a) => a.status === 'em_visita'
                    ? 'Em Visita'
                    : 'Finalizado'
            },
            {
                label: 'Registrado por',
                format: (a) => a.registradoPorNome || a.registradoPor || ''
            }
        ];
    } else if (tipo === 'turma') {
        titulo = 'Relatório de Atendimentos por Turma';
        subtitulo = `Turma: ${d.turma || ''}`;
        registros = d.ultimosAtendimentos
            || d.atendimentos
            || [];

        colunas = [
            {
                label: 'Data/Hora Entrada',
                format: (a) => a.dataEntrada
                    ? new Date(a.dataEntrada).toLocaleString('pt-BR')
                    : ''
            },
            {
                label: 'Data/Hora Saída',
                format: (a) => a.dataHoraSaida
                    ? new Date(a.dataHoraSaida).toLocaleString('pt-BR')
                    : ''
            },
            {
                label: 'Aluno',
                format: (a) => a.alunoNome || ''
            },
            {
                label: 'Matrícula',
                format: (a) => a.alunoMatricula || ''
            },
            {
                label: 'Motivo',
                format: (a) => a.motivoLabel || a.motivo || ''
            },
            {
                label: 'Atividades',
                format: (a) => Array.isArray(a.atividadesLabels)
                    ? a.atividadesLabels.join(', ')
                    : (Array.isArray(a.atividades) ? a.atividades.join(', ') : '')
            },
            {
                label: 'Duração',
                format: (a) => formatarDuracao(a.duracao || a.duracaoMinutos || 0)
            },
            {
                label: 'Status',
                format: (a) => a.status === 'em_visita'
                    ? 'Em Visita'
                    : 'Finalizado'
            }
        ];
    } else if (tipo === 'aluno') {
        titulo = 'Relatório Individual — Biblioteca';
        subtitulo = `${d.aluno?.nome || ''} — ${d.aluno?.turma || ''}`;
        registros = d.atendimentos || [];

        colunas = [
            {
                label: 'Data/Hora Entrada',
                format: (a) => a.dataEntrada
                    ? new Date(a.dataEntrada).toLocaleString('pt-BR')
                    : ''
            },
            {
                label: 'Data/Hora Saída',
                format: (a) => a.dataSaida
                    ? new Date(a.dataSaida).toLocaleString('pt-BR')
                    : ''
            },
            {
                label: 'Motivo',
                format: (a) => a.motivoLabel || a.motivo || ''
            },
            {
                label: 'Atividades',
                format: (a) => Array.isArray(a.atividadesLabels)
                    ? a.atividadesLabels.join(', ')
                    : (Array.isArray(a.atividades) ? a.atividades.join(', ') : '')
            },
            {
                label: 'Livros Consultados',
                format: (a) => Array.isArray(a.saida?.livrosConsultados)
                    ? a.saida.livrosConsultados.join(', ')
                    : ''
            },
            {
                label: 'Computadores Usados',
                format: (a) => a.saida?.computadoresUsados || ''
            },
            {
                label: 'Satisfação',
                format: (a) => a.saida?.satisfacao || ''
            },
            {
                label: 'Duração',
                format: (a) => formatarDuracao(a.duracao || 0)
            }
        ];
    }

    if (registros.length === 0) {
        mostrarToast('⚠️ Nenhum registro para exportar.\n\nVerifique os filtros de data.', 'warning');
        return;
    }

    // ============================================
    // FILTROS APLICADOS
    // ============================================
    const filtros = [];
    const dataIni = safeGet('dataInicio')?.value;
    const dataFimEl = safeGet('dataFim')?.value;
    if (dataIni) filtros.push({ label: 'Data inicial', valor: dataIni });
    if (dataFimEl) filtros.push({ label: 'Data final', valor: dataFimEl });
    if (d.turma) filtros.push({ label: 'Turma', valor: d.turma });
    if (d.aluno?.nome) filtros.push({ label: 'Aluno', valor: d.aluno.nome });

    // ============================================
    // MÉTRICAS
    // ============================================
    const metricas = {};
    if (tipo === 'geral') {
        metricas['Total de atendimentos'] = d.totalAtendimentos || 0;
        metricas['Turmas com registro'] = (d.porTurma || []).length;
        metricas['Motivos diferentes'] = (d.porMotivo || []).length;
    } else if (tipo === 'turma') {
        metricas['Total de atendimentos'] = d.estatisticas?.totalAtendimentos || 0;
        metricas['Alunos atendidos'] = d.estatisticas?.totalAlunosAtendidos || 0;
    } else if (tipo === 'aluno') {
        metricas['Total de atendimentos'] = d.estatisticas?.totalAtendimentos || 0;
        metricas['Motivos diferentes'] = (d.porMotivo || []).length;
    }

    // ============================================
    // GERA E BAIXA
    // ============================================
    const ok = gerarBaixarCSV({
        titulo,
        subtitulo,
        setor: 'Biblioteca',
        colunas,
        registros,
        filtros,
        metricas,
        nomeArquivo: `relatorio-biblioteca-${tipo}`,
        observacoes: `${registros.length} atendimento(s) listado(s)`
    });

    if (ok) {
        mostrarToast(`✅ Relatório exportado (${registros.length} registro(s))!`, 'success');
    }
}
// ============ EXPORTAR PDF (PADRONIZADO + CARIMBO) ============
function exportarPDF() {
    if (!relatorioData) { 
        mostrarToast('⚠️ Gere um relatório primeiro', 'warning'); 
        return; 
    }
    
    mostrarToast('📄 Gerando PDF...', 'info');
    
    const d = relatorioData;
    const tipo = d.aluno ? 'aluno' : (d.turma ? 'turma' : 'geral');
    
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
    const carimbo = '/icons/assinatura_gpeda.ico';
    
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
    
    let tabelaHTML = '';
    
    // ---- GERAL ----
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
                        <th style="width:100px;text-align:center;">Duração</th>
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
                                <td style="text-align:center;"><strong>${formatarDuracao(a.duracao || 0)}</strong></td>
                            </tr>
                        `).join('') 
                        : '<tr><td colspan="5" style="text-align:center;">Nenhum atendimento registrado</td></tr>'}
                </tbody>
            </table>
        `;
    }
    
    // ---- TURMA ----
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
                        <th style="width:100px;text-align:center;">Duração</th>
                    </tr>
                </thead>
                <tbody>
                    ${(d.ultimosAtendimentos || []).length > 0 
                        ? (d.ultimosAtendimentos || []).map(a => `
                            <tr>
                                <td>${new Date(a.dataEntrada).toLocaleString('pt-BR')}</td>
                                <td><strong>${escapeHTML(a.alunoNome || '')}</strong></td>
                                <td>${escapeHTML(a.motivo || '')}</td>
                                <td style="text-align:center;"><strong>${formatarDuracao(a.duracao || 0)}</strong></td>
                            </tr>
                        `).join('') 
                        : '<tr><td colspan="4" style="text-align:center;">Nenhum atendimento</td></tr>'}
                </tbody>
            </table>
        `;
    }
    
    // ---- ALUNO ----
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
                        <th style="width:100px;text-align:center;">Duração</th>
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
                                <td style="text-align:center;"><strong>${formatarDuracao(a.duracao || 0)}</strong></td>
                            </tr>
                        `).join('') 
                        : '<tr><td colspan="5" style="text-align:center;">Nenhum atendimento</td></tr>'}
                </tbody>
            </table>
        `;
    }
    
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html>
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
            
            .titulo {
                text-align: center; font-size: 11pt; font-weight: bold;
                background: #e0f2fe; padding: 4px 8px; border: 1.5px solid #000;
                margin: 6px 0 3px; text-transform: uppercase; letter-spacing: 0.5px;
            }
            .subtitulo { text-align: center; font-size: 9pt; margin: 0 0 6px; font-style: italic; }
            
            .stats {
                display: flex; gap: 8px; margin: 6px 0 8px; padding: 6px 8px;
                background: #f0f9ff; border-radius: 5px; border: 1px solid #bae6fd;
            }
            .stat { text-align: center; flex: 1; border-right: 1px solid #bae6fd; }
            .stat:last-child { border-right: none; }
            .stat-value { font-size: 13pt; font-weight: bold; color: #0ea5e9; line-height: 1; }
            .stat-label { font-size: 7.5pt; color: #666; margin-top: 2px; }
            
            .section-title {
                font-size: 9pt; font-weight: bold; background: #e8e8e8;
                padding: 2px 6px; border-left: 3px solid #0ea5e9; margin: 6px 0 3px;
            }
            
            table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 6px; }
            th { background: #0ea5e9; color: white; padding: 4px 5px; text-align: left; border: 1px solid #0284c7; font-size: 8pt; }
            td { padding: 3px 5px; border: 1px solid #ddd; vertical-align: top; }
            tr:nth-child(even) { background: #f0f9ff; }
            
            .assinaturas { display: flex; justify-content: space-around; margin-top: 25px; gap: 30px; }
            .assinatura { flex: 1; text-align: center; }

            .assinatura-container-relatorio {
                position: relative;
                min-height: 14mm;         
                display: flex;
                align-items: flex-end;
                justify-content: center;
                padding-bottom: 2px;
            }

            .assinatura-container-relatorio::after {
                content: '';
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                border-bottom: 1px solid #000;
            }

            .carimbo-overlay {
                position: absolute;
                top: 0;
                left: 50%;
                transform: translateX(-50%);
                max-height: 11mm;         
                max-width: 42mm;          
                object-fit: contain;
                opacity: 0.9;
                pointer-events: none;
                z-index: 1;
            }

            .assinatura-linha { padding-top: 3px; font-size: 8pt; margin-top: 2px; }
            
            .footer { text-align: center; margin-top: 8px; padding-top: 3px; border-top: 1px solid #ccc; font-size: 6.5pt; color: #666; }
            .footer p { margin: 1px 0; }
            
            .btn-print {
                display: block; margin: 10px auto; padding: 8px 20px;
                background: #0ea5e9; color: white; border: none; border-radius: 6px;
                font-weight: bold; cursor: pointer; font-size: 12px; font-family: Arial, sans-serif;
            }
            .btn-print:hover { background: #0284c7; }
            
            @media print { .no-print { display: none !important; } body { padding: 0; } }
        </style>
    </head>
    <body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
        
        <div class="header">
            <img src="${logoIema}" alt="IEMA" onerror="this.style.display='none'">
            <h1>IEMA Pleno: São Luís - Centro</h1>
            <p>Sistema de Atendimentos — Biblioteca</p>
        </div>
        
        <div class="titulo">📚 ${titulo}</div>
        ${subtitulo ? `<div class="subtitulo">${escapeHTML(subtitulo)}</div>` : ''}
        
        ${statsHTML}
        ${tabelaHTML}
        
        <div class="assinaturas">
            <div class="assinatura">
                <div class="assinatura-container-relatorio"></div>
                <div class="assinatura-linha">Biblioteca</div>
            </div>
            <div class="assinatura">
                <div class="assinatura-container-relatorio">
                    <img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
                </div>
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

// ========== IMPRIMIR ATIVOS (PADRONIZADO + CARIMBO) ==========
async function imprimirAtendimentosAtivos() {
  try {
    const r = await fetch('/api/biblioteca/atendimentos-ativos', { 
      headers: { 'Authorization': `Bearer ${token}` } 
    });
    const d = await r.json();
    
    if (!d.success || d.atendimentos.length === 0) {
      mostrarToast('⚠️ Nenhum aluno em visita no momento', 'warning'); 
      return;
    }
    
    const dataGeracao = new Date().toLocaleString('pt-BR');
    const logoIema = '/uploads/logo-iema.png';
    const carimbo = '/icons/assinatura_gpeda.ico';
    const total = d.atendimentos.length;
    
    const tempoMedioMin = Math.round(
      d.atendimentos.reduce((acc, a) => acc + (a.tempoAtendimento || 0), 0) / total
    );
    const tempoMedio = formatarDuracao(tempoMedioMin);
    
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Alunos em Visita - Biblioteca</title>
        <style>
            @page { size: A4 portrait; margin: 8mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Times New Roman', Times, serif; font-size: 9.5pt; line-height: 1.25; color: #000; }
            
            .header { text-align: center; border-bottom: 1.5px double #000; padding-bottom: 4px; margin-bottom: 6px; }
            .header img { max-width: 100%; max-height: 14mm; object-fit: contain; display: block; margin: 0 auto 2px; }
            .header h1 { font-size: 10pt; text-transform: uppercase; font-weight: bold; margin: 2px 0 0; }
            .header p { font-size: 8pt; margin: 1px 0 0; }
            
            .titulo {
                text-align: center; font-size: 11pt; font-weight: bold;
                background: #fef3c7; padding: 4px 8px; border: 1.5px solid #000;
                margin: 6px 0 3px; text-transform: uppercase; letter-spacing: 0.5px;
            }
            .subtitulo { text-align: center; font-size: 9pt; margin: 0 0 6px; font-style: italic; }
            
            .stats {
                display: flex; gap: 8px; margin: 6px 0 8px; padding: 6px 8px;
                background: #fffbeb; border-radius: 5px; border: 1px solid #fcd34d;
            }
            .stat { text-align: center; flex: 1; border-right: 1px solid #fcd34d; }
            .stat:last-child { border-right: none; }
            .stat-value { font-size: 13pt; font-weight: bold; color: #d97706; line-height: 1; }
            .stat-label { font-size: 7.5pt; color: #666; margin-top: 2px; }
            
            .section-title {
                font-size: 9pt; font-weight: bold; background: #e8e8e8;
                padding: 2px 6px; border-left: 3px solid #f59e0b; margin: 6px 0 3px;
            }
            
            table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 6px; }
            th { background: #f59e0b; color: white; padding: 4px 5px; text-align: left; border: 1px solid #d97706; font-size: 8pt; }
            td { padding: 3px 5px; border: 1px solid #ddd; vertical-align: middle; }
            tr:nth-child(even) { background: #fffbeb; }
            
            .badge-tempo {
                display: inline-block; padding: 1px 6px; border-radius: 8px;
                font-size: 7.5pt; font-weight: bold;
            }
            .badge-ok { background: #d1fae5; color: #065f46; }
            .badge-medio { background: #fef3c7; color: #92400e; }
            .badge-alto { background: #fee2e2; color: #991b1b; }
            
            .assinaturas { display: flex; justify-content: space-around; margin-top: 25px; gap: 30px; }
            .assinatura { flex: 1; text-align: center; }

            .assinatura-container-relatorio {
                position: relative;
                min-height: 14mm;        
                display: flex;
                align-items: flex-end;
                justify-content: center;
                padding-bottom: 2px;
            }

            .assinatura-container-relatorio::after {
                content: '';
                position: absolute;
                bottom: 0;
                left: 0;
                right: 0;
                border-bottom: 1px solid #000;
            }

            .carimbo-overlay {
                position: absolute;
                top: 0;
                left: 50%;
                transform: translateX(-50%);
                max-height: 11mm;         
                max-width: 42mm;          
                object-fit: contain;
                opacity: 0.9;
                pointer-events: none;
                z-index: 1;
            }

            .assinatura-linha { padding-top: 3px; font-size: 8pt; margin-top: 2px; }
            
            .footer { text-align: center; margin-top: 8px; padding-top: 3px; border-top: 1px solid #ccc; font-size: 6.5pt; color: #666; }
            .footer p { margin: 1px 0; }
            
            .btn-print {
                display: block; margin: 10px auto; padding: 8px 20px;
                background: #f59e0b; color: white; border: none; border-radius: 6px;
                font-weight: bold; cursor: pointer; font-size: 12px; font-family: Arial, sans-serif;
            }
            .btn-print:hover { background: #d97706; }
            
            @media print { .no-print { display: none !important; } body { padding: 0; } }
        </style>
    </head>
    <body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir / Salvar PDF</button>
        
        <div class="header">
            <img src="${logoIema}" alt="IEMA" onerror="this.style.display='none'">
            <h1>IEMA Pleno: São Luís - Centro</h1>
            <p>Sistema de Atendimentos — Biblioteca</p>
        </div>
        
        <div class="titulo">⏳ Alunos em Visita</div>
        <div class="subtitulo">Consulta em tempo real — ${new Date().toLocaleDateString('pt-BR')}</div>
        
        <div class="stats">
            <div class="stat">
                <div class="stat-value">${total}</div>
                <div class="stat-label">Alunos em Visita</div>
            </div>
            <div class="stat">
                <div class="stat-value">${tempoMedio}</div>
                <div class="stat-label">Tempo Médio</div>
            </div>
            <div class="stat">
                <div class="stat-value">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                <div class="stat-label">Horário do Relatório</div>
            </div>
        </div>
        
        <div class="section-title">📋 Lista de Alunos na Biblioteca</div>
        <table>
            <thead>
                <tr>
                    <th style="width:30px;text-align:center;">#</th>
                    <th>Aluno</th>
                    <th style="width:70px;">Turma</th>
                    <th>Motivo</th>
                    <th style="width:80px;text-align:center;">Entrada</th>
                    <th style="width:90px;text-align:center;">Tempo</th>
                </tr>
            </thead>
            <tbody>
                ${d.atendimentos.map((a, i) => {
                    const tempo = a.tempoAtendimento || 0;
                    let badgeClass = 'badge-ok';
                    if (tempo >= 60 && tempo < 120) badgeClass = 'badge-medio';
                    else if (tempo >= 120) badgeClass = 'badge-alto';
                    
                    const horarioEntrada = a.dataHoraEntrada 
                        ? new Date(a.dataHoraEntrada).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                        : '-';
                    
                    return `
                        <tr>
                            <td style="text-align:center;"><strong>${i + 1}</strong></td>
                            <td><strong>${escapeHTML(a.alunoNome)}</strong></td>
                            <td>${escapeHTML(a.alunoTurma || '-')}</td>
                            <td>${escapeHTML(a.motivoLabel || '-')}</td>
                            <td style="text-align:center;">${horarioEntrada}</td>
                            <td style="text-align:center;">
                                <span class="badge-tempo ${badgeClass}">${formatarDuracao(tempo)}</span>
                            </td>
                        </tr>`;
                }).join('')}
            </tbody>
        </table>
        
        <div class="assinaturas">
            <div class="assinatura">
                <div class="assinatura-container-relatorio"></div>
                <div class="assinatura-linha">Biblioteca</div>
            </div>
            <div class="assinatura">
                <div class="assinatura-container-relatorio">
                    <img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
                </div>
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
  } catch (e) {
    console.error('Erro ao imprimir ativos:', e);
    mostrarToast('❌ Erro ao gerar PDF', 'error');
  }
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

// ============================================
// ⚙️ CONFIGURAÇÃO DA BIBLIOTECA
// ============================================

let __configBiblioteca = {
    visitasAbertas: true,
    mensagemFechado: '',
    horarioAbertura: '07:00',
    horarioFechamento: '17:00'
};

async function carregarConfiguracaoBiblioteca() {
    try {
        const r = await fetch('/api/biblioteca/configuracao', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const d = await r.json();

        if (d.success) {
            __configBiblioteca = d.configuracao;

            const chk = safeGet('configVisitasAbertas');
            if (chk) chk.checked = d.configuracao.visitasAbertas;

            const msg = safeGet('configMensagemFechado');
            if (msg) msg.value = d.configuracao.mensagemFechado || '';

            const hab = safeGet('configHorarioAbertura');
            if (hab) hab.value = d.configuracao.horarioAbertura || '07:00';

            const hfe = safeGet('configHorarioFechamento');
            if (hfe) hfe.value = d.configuracao.horarioFechamento || '17:00';

            atualizarStatusBibliotecaVisual(d.configuracao.visitasAbertas);
        }
    } catch (e) {
        console.error('Erro ao carregar configuração:', e);
    }
}

function atualizarStatusBibliotecaVisual(aberta) {
    const badge = safeGet('statusConfigBadge');
    if (badge) {
        if (aberta) {
            badge.style.background = '#d1fae5';
            badge.style.color = '#065f46';
            badge.innerHTML = '<i class="fas fa-check-circle"></i> Biblioteca ABERTA para visitas';
        } else {
            badge.style.background = '#fee2e2';
            badge.style.color = '#991b1b';
            badge.innerHTML = '<i class="fas fa-times-circle"></i> Biblioteca FECHADA para visitas';
        }
    }

    const alerta = safeGet('statusBibliotecaAlerta');
    if (alerta) {
        if (aberta) {
            alerta.style.display = 'none';
        } else {
            alerta.style.display = 'block';
            alerta.innerHTML = `
                <div class="alert alert-warning" style="border-radius: 12px; border-left: 5px solid #f59e0b;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Biblioteca fechada para novas visitas</strong><br>
                    <small>Alunos não conseguem registrar entrada na página pública no momento.</small>
                    <br><br>
                    <button class="btn btn-sm btn-warning" onclick="document.getElementById('config-tab').click()">
                        <i class="fas fa-cog"></i> Abrir Configurações
                    </button>
                </div>
            `;
        }
    }
}

async function atualizarConfiguracaoBiblioteca() {
    const aberta = safeGet('configVisitasAbertas')?.checked;

    try {
        const r = await fetch('/api/biblioteca/configuracao', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ visitasAbertas: aberta })
        });
        const d = await r.json();

        if (d.success) {
            __configBiblioteca = d.configuracao;
            atualizarStatusBibliotecaVisual(aberta);

            mostrarToast(
                aberta
                    ? '✅ Biblioteca ABERTA para visitas'
                    : '🔒 Biblioteca FECHADA para visitas',
                aberta ? 'success' : 'warning'
            );
        } else {
            mostrarToast('❌ ' + (d.error || 'Erro ao atualizar'), 'error');
            const chk = safeGet('configVisitasAbertas');
            if (chk) chk.checked = !aberta;
        }
    } catch (e) {
        console.error(e);
        mostrarToast('❌ Erro de conexão', 'error');
        const chk = safeGet('configVisitasAbertas');
        if (chk) chk.checked = !aberta;
    }
}

async function salvarConfiguracaoBiblioteca() {
    try {
        const dados = {
            visitasAbertas: safeGet('configVisitasAbertas')?.checked,
            mensagemFechado: safeGet('configMensagemFechado')?.value || '',
            horarioAbertura: safeGet('configHorarioAbertura')?.value || '07:00',
            horarioFechamento: safeGet('configHorarioFechamento')?.value || '17:00'
        };

        const r = await fetch('/api/biblioteca/configuracao', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(dados)
        });
        const d = await r.json();

        if (d.success) {
            __configBiblioteca = d.configuracao;
            atualizarStatusBibliotecaVisual(d.configuracao.visitasAbertas);
            mostrarToast('✅ Configurações salvas!', 'success');
        } else {
            mostrarToast('❌ ' + (d.error || 'Erro'), 'error');
        }
    } catch (e) {
        console.error(e);
        mostrarToast('❌ Erro de conexão', 'error');
    }
}

// ============================================
// 🔔 SISTEMA DE NOTIFICAÇÕES INTERNAS
// ============================================

let notificacoesInterval;

function isWebView() {
    return /wv|WebView|Android.*Version\/[\d.]+.*Chrome/i.test(navigator.userAgent) ||
           (typeof window.AppInventor !== 'undefined');
}

function mostrarNotificacao(mensagem, tipo = 'info') {
    if (!isWebView()) {
        mostrarToast(mensagem);
        return;
    }
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        padding: 20px;
        box-sizing: border-box;
    `;
    
    const icones = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const cores = { success: '#10b981', error: '#dc2626', warning: '#f59e0b', info: '#3b82f6' };
    
    modal.innerHTML = `
        <div style="
            background: white;
            border-radius: 16px;
            padding: 25px;
            max-width: 380px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
        ">
            <div style="font-size: 48px; margin-bottom: 15px;">${icones[tipo] || 'ℹ️'}</div>
            <p style="margin: 0 0 20px; color: #374151; font-size: 15px; line-height: 1.5; white-space: pre-line;">
                ${mensagem}
            </p>
            <button onclick="this.closest('div').parentElement.remove()" style="
                width: 100%;
                padding: 12px;
                background: ${cores[tipo] || cores.info};
                color: white;
                border: none;
                border-radius: 10px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
            ">OK</button>
        </div>
    `;
    
    document.body.appendChild(modal);
}

function confirmar(mensagem) {
    return new Promise((resolve) => {
        const oldModal = document.getElementById('modalConfirmacaoCustom');
        if (oldModal) oldModal.remove();

        const modal = document.createElement('div');
        modal.id = 'modalConfirmacaoCustom';
        modal.style.cssText = `
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999999;
            padding: 20px;
            box-sizing: border-box;
        `;

        modal.innerHTML = `
            <div style="
                background: white;
                border-radius: 16px;
                padding: 25px;
                max-width: 380px;
                width: 100%;
                box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                text-align: center;
                animation: fadeIn 0.2s ease;
            ">
                <div style="font-size: 48px; margin-bottom: 15px;">⚠️</div>
                <p style="margin: 0 0 20px; color: #374151; font-size: 15px; line-height: 1.5; white-space: pre-line;">
                    ${escapeHTML(mensagem)}
                </p>
                <div style="display: flex; gap: 10px;">
                    <button id="btn-cancelar-conf" style="
                        flex: 1; padding: 12px; background: #e5e7eb; color: #374151;
                        border: none; border-radius: 10px; font-size: 14px;
                        font-weight: 600; cursor: pointer;
                    ">Cancelar</button>
                    <button id="btn-confirmar-conf" style="
                        flex: 1; padding: 12px; background: #dc2626; color: white;
                        border: none; border-radius: 10px; font-size: 14px;
                        font-weight: 600; cursor: pointer;
                    ">Confirmar</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('#btn-confirmar-conf').onclick = function() {
            modal.remove();
            resolve(true);
        };

        modal.querySelector('#btn-cancelar-conf').onclick = function() {
            modal.remove();
            resolve(false);
        };

        modal.onclick = function(e) {
            if (e.target === modal) {
                modal.remove();
                resolve(false);
            }
        };
    });
}

function iniciarNotificacoes() {
    // Carrega imediatamente
    carregarNotificacoes();

    // Polling a cada 30s
    if (notificacoesInterval) clearInterval(notificacoesInterval);
    notificacoesInterval = setInterval(carregarNotificacoes, 30000);

    // Fecha o dropdown ao clicar fora
    document.addEventListener('click', function(event) {
        const dropdown = document.getElementById('notificacoesDropdown');
        const btn = document.getElementById('notificacoesBtn');

        if (dropdown && btn && !btn.contains(event.target) && !dropdown.contains(event.target)) {
            // Não fecha se clicou em uma notificação (ela já navega)
            if (!event.target.closest('[onclick*="abrirNotificacao"]')) {
                dropdown.classList.remove('show');
                dropdown.style.display = 'none';
            }
        }
    });
}

// Cache do contador vindo direto do servidor (mais confiável)
let __totalNaoLidasServidor = null;

async function carregarNotificacoes() {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) return;

        // 1) Buscar contador (badge)
        const countResponse = await fetch('/api/notificacoes/nao-lidas/contador', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const countData = await countResponse.json();

        if (countData.success) {
            __totalNaoLidasServidor = Number(countData.count) || 0;

            // Atualiza badge do sino
            const badge = document.getElementById('notificacoesBadge');
            if (badge) {
                if (__totalNaoLidasServidor > 0) {
                    badge.textContent = __totalNaoLidasServidor > 99 ? '99+' : __totalNaoLidasServidor;
                    badge.style.display = 'inline';
                    document.getElementById('notificacoesBtn')?.classList.add('tem-notificacao');
                } else {
                    badge.style.display = 'none';
                    document.getElementById('notificacoesBtn')?.classList.remove('tem-notificacao');
                }
            }
        }

        // 2) Atualiza os badges do avatar / menu
        atualizarBadgeUnificado();

        // 3) Se o dropdown estiver aberto, recarrega a lista
        const dropdown = document.getElementById('notificacoesDropdown');
        if (dropdown && (dropdown.classList.contains('show') || dropdown.style.display === 'block')) {
            await carregarListaNotificacoes();
        }
    } catch (error) {
        console.error('Erro ao carregar notificações:', error);
    }
}

async function carregarListaNotificacoes() {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            const lista = document.getElementById('notificacoesLista');
            if (lista) {
                lista.innerHTML = '<p style="text-align:center; padding: 20px;">Faça login para ver as notificações.</p>';
            }
            return;
        }

        const response = await fetch('/api/notificacoes?apenasNaoLidas=false&limite=20', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (data.success) {
            // Atualiza o cache local para os badges
            if (Array.isArray(data.notificacoes)) {
                __notificacoesCache = data.notificacoes;
            }

            renderizarNotificacoes(data.notificacoes);

            // Atualiza contadores
            atualizarBadgeUnificado();
        }
    } catch (error) {
        console.error('Erro ao carregar lista:', error);
        const lista = document.getElementById('notificacoesLista');
        if (lista) {
            lista.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #6c757d;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 10px; color: #f59e0b;"></i>
                    <p>Erro ao carregar as notificações.</p>
                    <button onclick="carregarListaNotificacoes()" 
                            style="margin-top: 10px; padding: 8px 16px; background: #0ea5e9; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                        <i class="fas fa-sync-alt"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    }
}

function renderizarNotificacoes(notificacoes) {
    const lista = document.getElementById('notificacoesLista');
    if (!lista) return;

    if (!notificacoes || notificacoes.length === 0) {
        lista.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #6c757d;">
                <i class="fas fa-bell-slash" style="font-size: 48px; margin-bottom: 15px; opacity: 0.5;"></i>
                <p style="font-size: 1rem;">Nenhuma notificação</p>
            </div>
        `;
        return;
    }

    let html = '';
    notificacoes.forEach(notif => {
        const data = new Date(notif.createdAt);
        const agora = new Date();
        const diffMs = agora - data;
        const diffMin = Math.floor(diffMs / 60000);
        const diffHr = Math.floor(diffMs / 3600000);
        const diffDia = Math.floor(diffMs / 86400000);

        let tempoTexto;
        if (diffMin < 1) tempoTexto = 'agora mesmo';
        else if (diffMin < 60) tempoTexto = `há ${diffMin} min`;
        else if (diffHr < 24) tempoTexto = `há ${diffHr} h`;
        else tempoTexto = `há ${diffDia} d`;

        const classeLida = notif.lida ? '' : 'nao-lida';

        // ✅ Escapa o link com segurança (aspas simples e duplas)
        const linkSeguro = String(notif.link || '#')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        const idSeguro = String(notif._id).replace(/"/g, '').replace(/'/g, '');

        const temLink = notif.link
            && notif.link !== '#'
            && notif.link !== 'null'
            && notif.link !== 'undefined';

        html += `
            <div class="notificacao-item ${classeLida}" 
                 data-notif-id="${idSeguro}" 
                 data-notif-link="${linkSeguro}"
                 onclick="if(!event.target.closest('.btn-excluir-notificacao')) { abrirNotificacao('${idSeguro}', '${linkSeguro}'); }"
                 style="
                    padding: 12px 40px 12px 15px;
                    border-bottom: 1px solid #e5e7eb;
                    cursor: pointer;
                    transition: all 0.3s;
                    display: flex;
                    gap: 12px;
                    background: ${notif.lida ? 'white' : '#eff6ff'};
                    ${!notif.lida ? 'border-left: 3px solid #0ea5e9;' : ''}
                    position: relative;
                 ">
                <div class="notificacao-icone" style="
                    width: 36px;
                    height: 36px;
                    border-radius: 8px;
                    background: ${notif.cor || '#0ea5e9'};
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 1rem;
                    flex-shrink: 0;
                ">
                    ${notif.icone || '📋'}
                </div>
                <div class="notificacao-conteudo" style="flex: 1; min-width: 0;">
                    <div class="notificacao-titulo" style="font-weight: 600; margin-bottom: 3px; font-size: 0.9rem; color: #1f2937;">
                        ${escapeHTML(notif.titulo || '')}
                    </div>
                    <div class="notificacao-mensagem" style="font-size: 0.8rem; color: #6b7280; margin-bottom: 4px; line-height: 1.4;">
                        ${escapeHTML(notif.mensagem || '')}
                    </div>
                    <div class="notificacao-tempo" style="font-size: 0.65rem; color: #9ca3af; display: flex; align-items: center; gap: 4px;">
                        <i class="far fa-clock"></i> ${tempoTexto}
                        ${temLink ? `<span style="margin-left: 8px; color: #0ea5e9; font-weight: 600;"><i class="fas fa-external-link-alt"></i> Abrir</span>` : ''}
                    </div>
                </div>
                
                <button type="button"
                        class="btn-excluir-notificacao" 
                        data-excluir-id="${idSeguro}"
                        title="Excluir notificação"
                        onclick="event.stopPropagation(); event.preventDefault(); excluirNotificacao('${idSeguro}', this); return false;"
                        style="
                            position: absolute;
                            top: 50%;
                            right: 10px;
                            transform: translateY(-50%);
                            background: #fee2e2;
                            color: #dc2626;
                            border: none;
                            border-radius: 6px;
                            width: 28px;
                            height: 28px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            cursor: pointer;
                            opacity: 0.7;
                            transition: all 0.2s;
                            font-size: 12px;
                            z-index: 10;
                        ">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
    });

    lista.innerHTML = html;
}

// ============================================
// ✅ ABRIR NOTIFICAÇÃO (fecha dropdown, marca como lida, navega)
// ============================================
async function abrirNotificacao(id, link) {
    try {
        const tk = localStorage.getItem('auth_token');

        // 1) Marca como lida
        if (id) {
            try {
                await fetch(`/api/notificacoes/${id}/lida`, {
                    method: 'PUT',
                    headers: { 'Authorization': `Bearer ${tk}` }
                });
            } catch (e) {
                console.warn('[abrirNotificacao] erro ao marcar como lida:', e);
            }
        }

        // 2) Fecha o dropdown
        fecharNotificacoes();

        // 3) Atualiza badges
        await carregarNotificacoes();

        // 4) Navega se houver link válido
        if (link && link !== '#' && link !== 'null' && link !== 'undefined' && String(link).trim() !== '') {
            window.location.href = link;
        }
    } catch (error) {
        console.error('[abrirNotificacao]', error);
    }
}

async function excluirNotificacao(id, btnElement = null) {
    try {
        const confirmacao = await confirmar('🗑️ Deseja excluir esta notificação?');
        if (!confirmacao) return;

        const token = localStorage.getItem('auth_token');
        if (!token) {
            mostrarToast('❌ Sessão expirada', 'error');
            return;
        }

        if (btnElement) {
            btnElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btnElement.disabled = true;
        }

        const response = await fetch(`/api/notificacoes/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json();

        if (data.success) {
            const item = btnElement?.closest('.notificacao-item');
            if (item) {
                item.style.transition = 'all 0.3s ease';
                item.style.opacity = '0';
                item.style.transform = 'translateX(-100%)';
                setTimeout(() => item.remove(), 300);
            }

            const badge = document.getElementById('notificacoesBadge');
            if (badge && badge.style.display !== 'none') {
                const currentCount = parseInt(badge.textContent) || 0;
                if (currentCount > 1) {
                    badge.textContent = currentCount - 1;
                } else {
                    badge.style.display = 'none';
                    document.getElementById('notificacoesBtn')?.classList.remove('tem-notificacao');
                }
            }

            mostrarToast('✅ Notificação excluída', 'success');

            const lista = document.getElementById('notificacoesLista');
            if (lista && lista.children.length === 0) {
                carregarListaNotificacoes();
            }
        } else {
            throw new Error(data.error || 'Erro ao excluir');
        }

    } catch (error) {
        console.error('❌ Erro ao excluir notificação:', error);
        mostrarToast('❌ ' + error.message, 'error');
        
        if (btnElement) {
            btnElement.innerHTML = '<i class="fas fa-times"></i>';
            btnElement.disabled = false;
        }
    }
}

function abrirNotificacoes() {
    const dropdown = document.getElementById('notificacoesDropdown');
    if (!dropdown) return;
    
    if (dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
        dropdown.classList.remove('show');
    } else {
        dropdown.style.display = 'block';
        dropdown.classList.add('show');
        carregarListaNotificacoes();
    }
}

async function marcarTodasLidas(event) {
    try {
        const token = localStorage.getItem('auth_token');
        
        const btn = event?.currentTarget;
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Marcando...';
            btn.disabled = true;
        }
        
        const response = await fetch('/api/notificacoes/marcar-todas-lidas', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            await carregarListaNotificacoes();
            
            const badge = document.getElementById('notificacoesBadge');
            if (badge) badge.style.display = 'none';
            document.getElementById('notificacoesBtn')?.classList.remove('tem-notificacao');
            
            mostrarToast('✅ Todas marcadas como lidas', 'success');
        }
        
    } catch (error) {
        console.error('❌ Erro:', error);
        mostrarToast('❌ Erro ao marcar notificações', 'error');
    } finally {
        const btn = document.querySelector('.btn-marcar-todas');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-check-double"></i> Marcar todas';
            btn.disabled = false;
        }
    }
}

async function limparMinhasNotificacoes(event) {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            mostrarToast('❌ Sessão expirada', 'error');
            return;
        }

        const confirmacao = await confirmar('🗑️ Deseja excluir TODAS as suas notificações?\n\nEsta ação não pode ser desfeita.');
        if (!confirmacao) return;

        const btn = event?.currentTarget;
        if (btn) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Excluindo...';
            btn.disabled = true;
        }

        const response = await fetch('/api/notificacoes/limpar-minhas', {
            method: 'DELETE',
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            await carregarListaNotificacoes();
            const badge = document.getElementById('notificacoesBadge');
            if (badge) badge.style.display = 'none';
            document.getElementById('notificacoesBtn')?.classList.remove('tem-notificacao');
            mostrarNotificacao(data.message || 'Notificações excluídas com sucesso!', 'success');
        } else {
            throw new Error(data.error || 'Erro ao excluir notificações');
        }

    } catch (error) {
        console.error('❌ Erro:', error);
        mostrarNotificacao(error.message, 'error');
    } finally {
        const btn = document.querySelector('.notificacao-footer button');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-trash"></i> Limpar todas';
            btn.disabled = false;
        }
    }
}


window.addEventListener('beforeunload', function() {
    if (notificacoesInterval) {
        clearInterval(notificacoesInterval);
    }
});

// ========== LOGOUT ==========
async function logout() {
  const confirmacao = await confirmar('Deseja sair do sistema?');
  if (confirmacao) {
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

// Dashboard lista
window.carregarListaVisitasDashboard = carregarListaVisitasDashboard;
window.limparFiltrosDashboard = limparFiltrosDashboard;
window.verDetalhesAtendimento = verDetalhesAtendimento;
window.salvarEdicaoAtendimento = salvarEdicaoAtendimento;
window.formatarDuracao = formatarDuracao;
window.formatarDuracaoCurta = formatarDuracaoCurta;

// 🔧 CONFIGURAÇÕES
window.carregarConfiguracaoBiblioteca = carregarConfiguracaoBiblioteca;
window.atualizarConfiguracaoBiblioteca = atualizarConfiguracaoBiblioteca;
window.salvarConfiguracaoBiblioteca = salvarConfiguracaoBiblioteca;
window.atualizarStatusBibliotecaVisual = atualizarStatusBibliotecaVisual;

// Notificações
window.excluirNotificacao = excluirNotificacao;
window.abrirNotificacao = abrirNotificacao;
window.limparMinhasNotificacoes = limparMinhasNotificacoes;
window.confirmar = confirmar;
window.marcarTodasLidas = marcarTodasLidas;
window.carregarNotificacoes = carregarNotificacoes;

// Editar motivo - mostrar/ocultar campo outros
document.addEventListener('DOMContentLoaded', function() {
  const editMotivo = document.getElementById('editMotivoVisita');
  if (editMotivo) {
    editMotivo.addEventListener('change', function() {
      const campoOutros = document.getElementById('editCampoOutros');
      if (campoOutros) {
        campoOutros.style.display = this.value === 'outros' ? 'block' : 'none';
      }
    });
  }
});