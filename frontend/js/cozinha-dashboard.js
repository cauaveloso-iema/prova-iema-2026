// ============================================
// 🍽️ COZINHA - DASHBOARD INTELIGENTE
// ============================================

let token = localStorage.getItem('auth_token');
let userData = {};
let dashboardData = {};
let chartPerfil = null;
let chartTurmas = null;
let todosFeedbacks = [];
let feedbacksFiltrados = [];

let analiseTurmasCompleta = [];
let analiseTurmasFiltrada = [];

let _ultimaAtualizacao = null;

// ============================================
// 🔎 LEITURA DE FILTROS DA ANÁLISE
// ============================================
function lerFiltrosAnalise() {
    try {
        const raw = localStorage.getItem('cozinha_filtros_analise');
        if (!raw) return null;
        const f = JSON.parse(raw);
        if (typeof f !== 'object' || f === null) return null;
        return {
            turma:    f.turma    || 'todas',
            curso:    f.curso    || 'todos',
            periodo:  f.periodo  || 'hoje',
            data:     f.data     || '',
            refeicao: f.refeicao || 'todas'
        };
    } catch (e) {
        return null;
    }
}

// ============================================
// 🛡️ PROTEÇÃO CONTRA alert() NATIVO (Kodular)
// ============================================
(function protegerContraAlertNativo() {
    let __emProgresso = false;
    window.mostrarToastCozinha = function(mensagem) {
        if (__emProgresso) return;
        __emProgresso = true;
        try {
            const isWebView = /wv|WebView|Android.*Version\/[\d.]+.*Chrome/i.test(navigator.userAgent) ||
                            (typeof window.AppInventor !== 'undefined');
            if (typeof window.mostrarToastCozinha === 'function') {
                window.mostrarToastCozinha(String(mensagem), 'info');
                return;
            }
            if (!isWebView) return;
            const modal = document.createElement('div');
            modal.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
                background:rgba(0,0,0,0.6);display:flex;align-items:center;
                justify-content:center;z-index:999999;padding:20px;box-sizing:border-box;`;
            modal.innerHTML = `
                <div style="background:white;border-radius:16px;padding:25px;max-width:380px;
                            width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center;">
                    <div style="font-size:48px;margin-bottom:15px;">ℹ️</div>
                    <p style="margin:0 0 20px;color:#374151;font-size:15px;
                            line-height:1.5;white-space:pre-line;">${String(mensagem)}</p>
                    <button onclick="this.closest('div').parentElement.remove()"
                            style="width:100%;padding:12px;background:#0d6efd;color:white;
                                border:none;border-radius:10px;font-size:14px;
                                font-weight:600;cursor:pointer;">OK</button>
                </div>
            `;
            document.body.appendChild(modal);
        } finally { __emProgresso = false; }
    };
})();

// ============================================
// 🍞 TOAST CUSTOMIZADO
// ============================================
function mostrarToastCozinha(mensagem, tipo = 'info', duracao = 3500) {
    const anterior = document.getElementById('toastCozinha');
    if (anterior) anterior.remove();

    const cores = {
        success: { bg: '#10b981', icone: 'fa-check-circle' },
        error:   { bg: '#ef4444', icone: 'fa-exclamation-circle' },
        warning: { bg: '#f59e0b', icone: 'fa-exclamation-triangle' },
        info:    { bg: '#0d6efd', icone: 'fa-info-circle' }
    };
    const cor = cores[tipo] || cores.info;

    const toast = document.createElement('div');
    toast.id = 'toastCozinha';
    toast.style.cssText = `
        position: fixed; top: 20px; left: 50%;
        transform: translateX(-50%) translateY(-100px);
        background: ${cor.bg}; color: white; padding: 14px 22px;
        border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,0.2);
        z-index: 99999; display: flex; align-items: center; gap: 10px;
        font-family: -apple-system, sans-serif; font-size: 14px; font-weight: 500;
        max-width: 90%; transition: transform 0.3s ease;
    `;
    const icone = document.createElement('i');
    icone.className = `fas ${cor.icone}`;
    icone.style.fontSize = '18px';
    const span = document.createElement('span');
    span.textContent = mensagem;
    toast.appendChild(icone);
    toast.appendChild(span);
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.transform = 'translateX(-50%) translateY(0)'; }, 50);
    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(-100px)';
        setTimeout(() => toast.remove(), 300);
    }, duracao);
}
window.mostrarToastCozinha = mostrarToastCozinha;

// ============================================
// 🔐 ESCAPE HTML
// ============================================
function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============================================
// 📄 UTILITÁRIO: GERADOR DE CSV PROFISSIONAL
// ============================================
/**
 * Gera CSV profissional com cabeçalho institucional, metadados, tabela e rodapé.
 *
 * @param {Object} opts
 * @param {string}   opts.titulo        - Título do relatório
 * @param {string}  [opts.subtitulo]    - Subtítulo
 * @param {string}  [opts.setor]        - Setor (default: "Cozinha")
 * @param {Array}    opts.colunas       - [{ label, key, format? }]
 * @param {Array}    opts.registros     - Dados
 * @param {Array<{label, valor}>} [opts.filtros] - Filtros aplicados
 * @param {string}   opts.nomeArquivo   - Nome do arquivo (sem extensão)
 * @param {string}  [opts.observacoes]  - Observações extras
 * @param {Object}  [opts.metricas]     - { label: valor } extras
 */
function gerarBaixarCSV(opts) {
    const {
        titulo = 'Relatório',
        subtitulo = '',
        setor = 'Cozinha',
        colunas = [],
        registros = [],
        filtros = [],
        nomeArquivo = 'relatorio',
        observacoes = '',
        metricas = null
    } = opts || {};

    if (!Array.isArray(colunas) || colunas.length === 0) {
        mostrarToastCozinha('⚠️ Nenhuma coluna definida para exportação', 'warning');
        return false;
    }
    if (!Array.isArray(registros) || registros.length === 0) {
        mostrarToastCozinha('⚠️ Nenhum registro para exportar', 'warning');
        return false;
    }

    const agora = new Date();
    const dataGeracao = agora.toLocaleString('pt-BR');
    const dataArquivo = agora.toISOString().split('T')[0];

    const esc = (v) => {
        if (v === null || v === undefined) return '""';
        let s = String(v)
            .replace(/\r\n|\r|\n/g, ' ')
            .replace(/"/g, '""')
            .trim();
        return `"${s}"`;
    };

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

    if (observacoes) L.push(linhaUnica(`Observações: ${observacoes}`));

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
        mostrarToastCozinha('❌ Erro ao gerar CSV', 'error');
        return false;
    }
}

// ============================================
// 🆕 HELPERS DE LOADING E UPDATE INFO
// ============================================
function setCardsLoading(loading) {
    document.querySelectorAll('[data-statcard]').forEach(el => {
        el.classList.toggle('loading', !!loading);
    });
}

function atualizarUpdateInfo() {
    const el = document.getElementById('updateInfoTxt');
    const wrap = document.getElementById('updateInfo');
    if (!el || !wrap) return;

    if (!_ultimaAtualizacao) { el.textContent = '—'; return; }

    const diff = Math.floor((Date.now() - _ultimaAtualizacao) / 1000);
    let txt;
    if (diff < 30) txt = 'Agora';
    else if (diff < 60) txt = `Há ${diff}s`;
    else if (diff < 3600) txt = `Há ${Math.floor(diff / 60)}min`;
    else txt = `Há ${Math.floor(diff / 3600)}h`;

    el.textContent = txt;
    wrap.classList.toggle('stale', diff > 120);
}

// ============================================
// 🚀 INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    if (!token) { window.location.href = '/login.html'; return; }

    const userStorage = JSON.parse(localStorage.getItem('user_data') || '{}');
    userData = userStorage;

    document.getElementById('userName').textContent = userStorage.nome || 'Usuário';
    document.getElementById('userRole').textContent = 'Cozinha';

    if (!['cozinha', 'super_admin', 'admin'].includes(userStorage.role)) {
        mostrarToastCozinha('Acesso negado. Perfil não autorizado.');
        window.location.href = '/login.html';
        return;
    }

    await carregarFotoPerfil();
    await carregarDashboard(false);

    atualizarRelogio();
    setInterval(atualizarRelogio, 1000);
    setInterval(atualizarUpdateInfo, 10000);

    // 🆕 Auto-refresh respeita o filtro
    setInterval(() => {
        const f = lerFiltrosAnalise();
        const periodo = f?.periodo || 'hoje';
        if (!f?.data && (periodo === 'hoje' || periodo === 'ontem')) {
            carregarDashboard(false);
        }
    }, 30000);

    const filtroTurmaEl = document.getElementById('filtroTurmaTexto') || document.getElementById('filtroTurma');
    if (filtroTurmaEl) filtroTurmaEl.addEventListener('input', filtrarTabela);
});

// ============================================
// 👤 FOTO DE PERFIL
// ============================================
async function carregarFotoPerfil() {
    try {
        const response = await fetch('/api/perfil/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success && data.perfil && data.perfil.fotoPerfil) {
            const avatar = document.getElementById('userAvatar');
            if (avatar) avatar.innerHTML = `<img src="${data.perfil.fotoPerfil}" alt="Foto">`;
        }
    } catch (error) { console.error('Erro ao carregar foto:', error); }
}

// ============================================
// 🕐 RELÓGIO
// ============================================
function atualizarRelogio() {
    const agora = new Date();
    const elData = document.getElementById('dataAtual');
    const elHora = document.getElementById('horaAtual');
    if (elData) elData.textContent = agora.toLocaleDateString('pt-BR');
    if (elHora) elHora.textContent = agora.toLocaleTimeString('pt-BR');
}

// ============================================
// 📅 HELPER DE PERÍODO PARA O DASHBOARD
// ============================================
function periodoParaQuery(filtros) {
    if (!filtros) return { periodo: 'hoje' };
    if (filtros.data) return { data: filtros.data };
    if (filtros.periodo === 'todos') return { todos: 'true' };
    return { periodo: filtros.periodo || 'hoje' };
}

// ============================================
// 📊 DASHBOARD
// ============================================
async function carregarDashboard(manual = false) {
    const btn = document.getElementById('btnAtualizarDashboard');
    if (btn) { btn.disabled = true; }
    setCardsLoading(true);

    try {
        const filtros = lerFiltrosAnalise();
        const qs = new URLSearchParams(periodoParaQuery(filtros)).toString();
        const url = '/api/cozinha/dashboard' + (qs ? `?${qs}` : '');

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            dashboardData = data;
            _ultimaAtualizacao = Date.now();
            atualizarUpdateInfo();

            const setTxt = (id, v) => {
                const el = document.getElementById(id);
                if (el) el.textContent = v;
            };
            const setHTML = (id, v) => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = v;
            };

            const labelPeriodo = data.infoData?.label || 'Hoje';

            setTxt('totalPessoas', data.perfis?.total || 0);
            setHTML('detalhePerfis',
                `👍 ${data.perfis?.sempre || 0} | ⚠️ ${data.perfis?.as_vezes || 0} | ❌ ${data.perfis?.nunca || 0}`);
            setTxt('pessoasQueComeram', data.registrosReais?.pessoasUnicas || 0);
            setHTML('percentualGeral',
                `${data.analiseAdesao?.taxaAdesao || 0}% — ${labelPeriodo}`);
            setTxt('taxaAdesao', `${data.analiseAdesao?.taxaAdesao || 0}%`);
            setTxt('refeicaoHoje', data.registrosReais?.total || 0);

            setTxt('contManha', data.registrosReais?.manha || 0);
            setTxt('contAlmoco', data.registrosReais?.almoco || 0);
            setTxt('contTarde', data.registrosReais?.tarde || 0);

            setTxt('prevManha', data.previsao?.manha?.pessoas || 0);
            setTxt('prevAlmoco', data.previsao?.almoco?.pessoas || 0);
            setTxt('prevTarde', data.previsao?.tarde?.pessoas || 0);

            setTxt('kgManha', data.previsao?.manha?.kg || 0);
            setTxt('kgAlmoco', data.previsao?.almoco?.kg || 0);
            setTxt('kgTarde', data.previsao?.tarde?.kg || 0);

            if (data.sugestaoAtual) {
                const sugestaoDiv = document.getElementById('sugestaoPreparo');
                if (sugestaoDiv) {
                    let cls = 'mostrarToastCozinha-info';
                    const msg = String(data.sugestaoAtual.mensagem || '');
                    if (msg.includes('⚠️')) cls = 'mostrarToastCozinha-warning';
                    else if (msg.includes('✅')) cls = 'mostrarToastCozinha-success';
                    else if (msg.includes('URGENTE')) cls = 'mostrarToastCozinha-danger';
                    sugestaoDiv.className = `mostrarToastCozinha ${cls} mt-3 mb-0`;
                    sugestaoDiv.innerHTML = `<i class="fas fa-lightbulb me-2"></i> ${data.sugestaoAtual.mensagem}<br><small>${data.sugestaoAtual.acao || ''}</small>`;
                }
            }

            const refeicaoBadge = document.getElementById('refeicaoAtualBadge');
            if (refeicaoBadge) {
                if (data.refeicaoAtual === 'manha') refeicaoBadge.innerHTML = '<span class="badge bg-warning">🌅 Lanche da Manhã</span>';
                else if (data.refeicaoAtual === 'almoco') refeicaoBadge.innerHTML = '<span class="badge bg-danger">🍽️ Almoço</span>';
                else if (data.refeicaoAtual === 'tarde') refeicaoBadge.innerHTML = '<span class="badge bg-info">🌙 Lanche da Tarde</span>';
                else refeicaoBadge.innerHTML = '<span class="badge bg-secondary">⏰ Fora do horário</span>';
            }

            if (data.perfis) {
                setTxt('perfilSempre',       data.perfis.sempre || 0);
                setTxt('perfilAsVezes',      data.perfis.as_vezes || 0);
                setTxt('perfilNunca',        data.perfis.nunca || 0);
                setTxt('perfilNaoInformado', data.perfis.nao_informado || 0);
                atualizarGraficoPerfil(data.perfis);
            }

            if (data.insights && data.insights.length > 0) {
                const container = document.getElementById('insightsContainer');
                if (container) {
                    container.innerHTML = data.insights.map(insight => `
                        <div class="insight-card ${insight.tipo}">
                            <div class="d-flex justify-content-between align-items-start">
                                <div>
                                    <strong><i class="fas ${
                                        insight.tipo === 'danger' ? 'fa-exclamation-triangle' :
                                        insight.tipo === 'warning' ? 'fa-clock' :
                                        insight.tipo === 'success' ? 'fa-check-circle' :
                                        'fa-info-circle'
                                    } me-2"></i> ${escapeHTML(insight.titulo || '')}</strong>
                                    <p class="mb-1 mt-1">${escapeHTML(insight.mensagem || '')}</p>
                                    <small class="text-muted"><i class="fas fa-lightbulb"></i> Sugestão: ${escapeHTML(insight.acao || '')}</small>
                                </div>
                            </div>
                        </div>
                    `).join('');
                }
            } else {
                const container = document.getElementById('insightsContainer');
                if (container) {
                    container.innerHTML = '<div class="text-center text-muted py-3">Nenhum insight no momento</div>';
                }
            }

            if (data.analisePorTurma && data.analisePorTurma.length > 0) {
                analiseTurmasCompleta = data.analisePorTurma;
                window.turmasData = data.analisePorTurma;
                if (filtros) {
                    await carregarAnaliseTurmas(filtros);
                } else {
                    analiseTurmasFiltrada = data.analisePorTurma;
                    atualizarTabelaTurmas(data.analisePorTurma);
                    atualizarGraficoTurmas(data.analisePorTurma);
                }
            } else {
                const tbody = document.getElementById('tabelaTurmas');
                if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum dado de turma disponível</td></tr>';
                analiseTurmasCompleta = [];
                analiseTurmasFiltrada = [];
                atualizarGraficoTurmas([]);
            }

            await carregarFeedbacks();

            if (manual) mostrarToastCozinha('✅ Dashboard atualizado!', 'success', 1800);
        }
    } catch (error) {
        console.error('Erro ao carregar dashboard:', error);
        const container = document.getElementById('insightsContainer');
        if (container) {
            container.innerHTML = '<div class="mostrarToastCozinha mostrarToastCozinha-danger">Erro ao carregar dados. Tente novamente.</div>';
        }
        if (manual) mostrarToastCozinha('❌ Erro ao atualizar. Tente novamente.', 'error');
    } finally {
        setCardsLoading(false);
        if (btn) { btn.disabled = false; }
    }
}

// ============================================
// 🎯 FILTROS DA ANÁLISE DETALHADA POR TURMA
// ============================================
async function carregarAnaliseTurmas(filtros) {
    if (!filtros) filtros = lerFiltrosAnalise();

    try {
        const qs = new URLSearchParams();
        if (filtros) {
            if (filtros.turma && filtros.turma !== 'todas')       qs.append('turma', filtros.turma);
            if (filtros.curso && filtros.curso !== 'todos')       qs.append('curso', filtros.curso);
            if (filtros.refeicao && filtros.refeicao !== 'todas') qs.append('refeicao', filtros.refeicao);
            if (filtros.data) {
                qs.append('data', filtros.data);
            } else if (filtros.periodo && filtros.periodo !== 'hoje') {
                if (filtros.periodo === 'todos') qs.append('todos', 'true');
                else qs.append('periodo', filtros.periodo);
            }
        }
        const url = '/api/cozinha/analise-turmas' + (qs.toString() ? `?${qs}` : '');

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success && Array.isArray(data.analisePorTurma)) {
                analiseTurmasFiltrada = data.analisePorTurma;
                atualizarTabelaTurmas(analiseTurmasFiltrada);
                atualizarGraficoTurmas(analiseTurmasFiltrada);
                return;
            }
        }
    } catch (err) {
        console.warn('[carregarAnaliseTurmas] falha no endpoint:', err.message);
    }

    aplicarFiltrosLocaisAnalise(filtros);
}

function aplicarFiltrosLocaisAnalise(filtros) {
    let dados = Array.isArray(analiseTurmasCompleta) ? [...analiseTurmasCompleta] : [];

    if (filtros) {
        if (filtros.turma && filtros.turma !== 'todas') {
            dados = dados.filter(t => t.turma === filtros.turma);
        }
        if (filtros.curso && filtros.curso !== 'todos') {
            dados = dados.filter(t => {
                if (Array.isArray(t.cursos) && t.cursos.includes(filtros.curso)) return true;
                if (t.curso === filtros.curso) return true;
                return false;
            });
        }
    }

    analiseTurmasFiltrada = dados;
    atualizarTabelaTurmas(dados);
    atualizarGraficoTurmas(dados);
}

// ============================================
// 📈 GRÁFICOS
// ============================================
function atualizarGraficoPerfil(perfis) {
    const canvas = document.getElementById('perfilChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartPerfil) chartPerfil.destroy();

    chartPerfil = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Sempre', 'Às vezes', 'Nunca', 'Não informado'],
            datasets: [{
                data: [perfis.sempre || 0, perfis.as_vezes || 0, perfis.nunca || 0, perfis.nao_informado || 0],
                backgroundColor: ['#10b981', '#f59e0b', '#ef4444', '#6b7280'],
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: { legend: { position: 'bottom' } }
        }
    });
}

function atualizarGraficoTurmas(turmas) {
    const canvas = document.getElementById('turmasChart');
    const vazio = document.getElementById('turmasChartVazio');
    if (!canvas) return;

    if (!turmas || turmas.length === 0) {
        if (chartTurmas) { chartTurmas.destroy(); chartTurmas = null; }
        canvas.style.display = 'none';
        if (vazio) vazio.style.display = '';
        return;
    }

    canvas.style.display = '';
    if (vazio) vazio.style.display = 'none';

    const ctx = canvas.getContext('2d');
    if (chartTurmas) chartTurmas.destroy();

    chartTurmas = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: turmas.map(t => t.turma),
            datasets: [
                { label: 'Dizem que comem', data: turmas.map(t => t.dizemQueComem || 0), backgroundColor: '#f59e0b', borderRadius: 8 },
                { label: 'Comeram', data: turmas.map(t => t.comeramHoje || 0), backgroundColor: '#10b981', borderRadius: 8 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Número de Pessoas' } } },
            plugins: { legend: { position: 'top' } }
        }
    });
}

// ============================================
// 📋 TABELA DE TURMAS
// ============================================
function atualizarTabelaTurmas(turmas) {
    const tbody = document.getElementById('tabelaTurmas');
    if (!tbody) return;

    if (!turmas || turmas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhuma turma encontrada com os filtros aplicados</td></tr>';
        return;
    }

    tbody.innerHTML = turmas.map(t => {
        let situacao = '';
        let situacaoClass = '';
        if (t.taxaAdesao >= 70) { situacao = '✅ Boa adesão'; situacaoClass = 'text-success'; }
        else if (t.taxaAdesao >= 40) { situacao = '⚠️ Adesão média'; situacaoClass = 'text-warning'; }
        else { situacao = '❌ Baixa adesão'; situacaoClass = 'text-danger'; }

        const barColor = t.taxaAdesao >= 70 ? 'high' : (t.taxaAdesao >= 40 ? 'medium' : 'low');

        return `
            <tr data-turma="${escapeHTML(t.turma || '')}">
                <td><strong>${escapeHTML(t.turma || '')}</strong></td>
                <td class="text-center">${t.totalAlunos || 0}</td>
                <td class="text-center">${t.dizemQueComem || 0}</td>
                <td class="text-center"><span class="badge bg-success">${t.comeramHoje || 0}</span></td>
                <td class="text-center" style="min-width: 100px;">
                    <div class="progress-bar-custom">
                        <div class="progress-fill ${barColor}" style="width: ${t.taxaAdesao || 0}%"></div>
                    </div>
                    <small>${t.taxaAdesao || 0}%</small>
                </td>
                <td class="text-center">${t.faltantes || 0}</td>
                <td class="text-center ${situacaoClass}">${situacao}</td>
            </tr>
        `;
    }).join('');
}

function filtrarTabela() {
    const el = document.getElementById('filtroTurmaTexto') || document.getElementById('filtroTurma');
    if (!el) return;
    const filtro = el.value.toLowerCase();
    const linhas = document.querySelectorAll('#tabelaTurmas tr');
    linhas.forEach(linha => {
        const turma = linha.getAttribute('data-turma');
        if (turma && turma.toLowerCase().includes(filtro)) linha.style.display = '';
        else if (turma) linha.style.display = 'none';
    });
}

// ============================================
// ⭐ FEEDBACKS
// ============================================
let timeoutBusca;

function aplicarFiltrosFeedbackDebounce() {
    clearTimeout(timeoutBusca);
    timeoutBusca = setTimeout(() => aplicarFiltrosFeedback(), 500);
}

function aplicarFiltrosFeedback() {
    const elRefeicao = document.getElementById('filtroRefeicaoFeedback');
    const elTurma    = document.getElementById('filtroTurmaFeedback');
    const elCurso    = document.getElementById('filtroCursoFeedback');
    const elNota     = document.getElementById('filtroNotaMin');
    const elGostou   = document.getElementById('filtroGostou');
    const elAnonimo  = document.getElementById('filtroAnonimo');
    const elBusca    = document.getElementById('filtroBuscaFeedback');

    const refeicao = elRefeicao ? elRefeicao.value : 'todas';
    const turma    = elTurma    ? elTurma.value    : 'todas';
    const curso    = elCurso    ? elCurso.value    : 'todos';
    const notaMin  = elNota     ? parseInt(elNota.value) || 1 : 1;
    const gostou   = elGostou   ? elGostou.value   : 'todos';
    const anonimo  = elAnonimo  ? elAnonimo.value  : 'todos';
    const busca    = (elBusca   ? elBusca.value    : '').toLowerCase();

    feedbacksFiltrados = todosFeedbacks.filter(f => {
        if (refeicao !== 'todas' && f.tipoRefeicao !== refeicao) return false;
        if (turma    !== 'todas' && f.alunoTurma  !== turma)      return false;
        if (curso    !== 'todos' && f.alunoCurso  !== curso)      return false;
        if (f.nota < notaMin) return false;
        if (gostou !== 'todos' && f.gostou !== gostou) return false;
        if (anonimo !== 'todos') {
            const isAnonimo = anonimo === 'sim';
            if (!!f.anonimo !== isAnonimo) return false;
        }
        if (busca) {
            const nomeMatch       = (f.alunoNome   || '').toLowerCase().includes(busca);
            const turmaMatch      = (f.alunoTurma  || '').toLowerCase().includes(busca);
            const cursoMatch      = (f.alunoCurso  || '').toLowerCase().includes(busca);
            const comentarioMatch = (f.comentario  || '').toLowerCase().includes(busca);
            if (!nomeMatch && !turmaMatch && !cursoMatch && !comentarioMatch) return false;
        }
        return true;
    });

    atualizarListaFeedbacks();
    atualizarFiltrosAtivos();

    const elFiltrados = document.getElementById('feedbacksFiltrados');
    if (elFiltrados) elFiltrados.textContent = feedbacksFiltrados.length;
}

function atualizarListaFeedbacks() {
    const tbody = document.getElementById('listaFeedbacks');
    if (!tbody) return;

    if (feedbacksFiltrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhum feedback encontrado com os filtros aplicados</td></tr>';
        const elCount = document.getElementById('feedbacksCount');
        if (elCount) elCount.textContent = '0';
        return;
    }

    const elCount = document.getElementById('feedbacksCount');
    if (elCount) elCount.textContent = feedbacksFiltrados.length;

    tbody.innerHTML = feedbacksFiltrados.map(f => {
        let notaClass = '';
        if (f.nota >= 4) notaClass = 'alta';
        else if (f.nota >= 2.5) notaClass = 'media';
        else notaClass = 'baixa';

        const notaNum = parseInt(f.nota) || 0;

        return `
            <tr>
                <td>${escapeHTML(f.alunoNome || '')}${f.anonimo ? ' <i class="fas fa-user-secret text-muted" title="Anônimo"></i>' : ''}</td>
                <td>${escapeHTML(f.alunoTurma || '-')}</td>
                <td>${escapeHTML(f.alunoCurso || '-')}</td>
                <td><span class="badge ${f.tipoRefeicao === 'manha' ? 'badge-manha' : f.tipoRefeicao === 'almoco' ? 'badge-almoco' : 'badge-tarde'}">${
                    f.tipoRefeicao === 'manha' ? '🌅 Manhã' :
                    f.tipoRefeicao === 'almoco' ? '🍽️ Almoço' : '🌙 Tarde'
                }</span></td>
                <td><span class="nota-badge ${notaClass}">${'★'.repeat(notaNum)}${'☆'.repeat(5 - notaNum)}</span></td>
                <td><small>${f.comentario
                    ? (f.comentario.length > 60
                        ? escapeHTML(f.comentario.substring(0, 60)) + '...'
                        : escapeHTML(f.comentario))
                    : '-'}</small></td>
                <td><small>${new Date(f.createdAt).toLocaleString()}</small></td>
            </tr>
        `;
    }).join('');
}

function atualizarFiltrosAtivos() {
    const container = document.getElementById('filtrosAtivosContainer');
    if (!container) return;

    const elRefeicao = document.getElementById('filtroRefeicaoFeedback');
    const elTurma    = document.getElementById('filtroTurmaFeedback');
    const elCurso    = document.getElementById('filtroCursoFeedback');
    const elNota     = document.getElementById('filtroNotaMin');
    const elGostou   = document.getElementById('filtroGostou');
    const elAnonimo  = document.getElementById('filtroAnonimo');
    const elBusca    = document.getElementById('filtroBuscaFeedback');

    const refeicao = elRefeicao ? elRefeicao.value : 'todas';
    const turma    = elTurma    ? elTurma.value    : 'todas';
    const curso    = elCurso    ? elCurso.value    : 'todos';
    const notaMin  = elNota     ? elNota.value     : '1';
    const gostou   = elGostou   ? elGostou.value   : 'todos';
    const anonimo  = elAnonimo  ? elAnonimo.value  : 'todos';
    const busca    = elBusca    ? elBusca.value    : '';

    let ativos = [];

    if (refeicao !== 'todas') {
        const nomes = { manha: '🌅 Manhã', almoco: '🍽️ Almoço', tarde: '🌙 Tarde' };
        ativos.push({ label: `Refeição: ${nomes[refeicao] || refeicao}`, tipo: 'refeicao' });
    }
    if (turma !== 'todas') ativos.push({ label: `Turma: ${turma}`, tipo: 'turma' });
    if (curso !== 'todos') ativos.push({ label: `Curso: ${curso}`, tipo: 'curso' });
    if (notaMin !== '1')   ativos.push({ label: `Nota ≥ ${notaMin}`, tipo: 'nota' });
    if (gostou !== 'todos') {
        const nomes = { sim: '👍 Adoraram', mais_ou_menos: '😐 Mais ou menos', nao: '👎 Não gostaram' };
        ativos.push({ label: `Opinião: ${nomes[gostou] || gostou}`, tipo: 'gostou' });
    }
    if (anonimo !== 'todos') ativos.push({ label: anonimo === 'sim' ? '🔒 Anônimos' : '✅ Identificados', tipo: 'anonimo' });
    if (busca) ativos.push({ label: `Busca: "${busca}"`, tipo: 'busca' });

    if (ativos.length === 0) {
        container.innerHTML = '<span class="text-muted small">Nenhum filtro ativo</span>';
        return;
    }

    container.innerHTML = ativos.map(a => `
        <span class="filtro-tag">
            ${escapeHTML(a.label)}
            <i class="fas fa-times" onclick="removerFiltro('${a.tipo}')"></i>
        </span>
    `).join('');
}

function removerFiltro(tipo) {
    const setVal = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.value = v;
    };
    if (tipo === 'refeicao') setVal('filtroRefeicaoFeedback', 'todas');
    if (tipo === 'turma')    setVal('filtroTurmaFeedback',    'todas');
    if (tipo === 'curso')    setVal('filtroCursoFeedback',    'todos');
    if (tipo === 'nota')     setVal('filtroNotaMin',          '1');
    if (tipo === 'gostou')   setVal('filtroGostou',           'todos');
    if (tipo === 'anonimo')  setVal('filtroAnonimo',          'todos');
    if (tipo === 'busca')    setVal('filtroBuscaFeedback',    '');
    aplicarFiltrosFeedback();
}

function limparFiltrosFeedback() {
    const setVal = (id, v) => {
        const el = document.getElementById(id);
        if (el) el.value = v;
    };
    setVal('filtroRefeicaoFeedback', 'todas');
    setVal('filtroTurmaFeedback',    'todas');
    setVal('filtroCursoFeedback',    'todos');
    setVal('filtroNotaMin',          '1');
    setVal('filtroGostou',           'todos');
    setVal('filtroAnonimo',          'todos');
    setVal('filtroBuscaFeedback',    '');
    aplicarFiltrosFeedback();
}

async function carregarFeedbacks() {
    try {
        const response = await fetch('/api/feedback-cozinha/estatisticas', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success) {
            todosFeedbacks = data.ultimosFeedbacks || [];
            feedbacksFiltrados = [...todosFeedbacks];

            const stats = data.estatisticas || {};

            const setTxt = (id, v) => {
                const el = document.getElementById(id);
                if (el) el.textContent = v;
            };
            const setHTML = (id, v) => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = v;
            };

            setTxt('totalFeedbacks',     stats.total || 0);
            setTxt('mediaNotas',         stats.mediaNotas || 0);
            setTxt('feedbacksFiltrados', stats.total || 0);

            const media = parseFloat(stats.mediaNotas) || 0;
            setHTML('estrelasMedia', gerarEstrelas(media));

            const dist = stats.distribuicaoNotas || {};
            const maxNota = Math.max(...Object.values(dist), 1);
            for (let i = 1; i <= 5; i++) {
                const count = dist[i] || 0;
                const percent = (count / maxNota) * 100;
                const bar = document.getElementById(`bar${i}`);
                if (bar) bar.style.width = `${percent}%`;
                const cnt = document.getElementById(`count${i}`);
                if (cnt) cnt.textContent = count;
            }

            setTxt('gostaramSim',       stats.gostouStats?.sim || 0);
            setTxt('gostaramMaisMenos', stats.gostouStats?.mais_ou_menos || 0);
            setTxt('gostaramNao',       stats.gostouStats?.nao || 0);

            const totalGostou = (stats.gostouStats?.sim || 0) + (stats.gostouStats?.mais_ou_menos || 0);
            const aprovacao = stats.total > 0 ? Math.round((totalGostou / stats.total) * 100) : 0;
            setTxt('gostaram',      `${aprovacao}%`);
            setTxt('mediaDetalhada', stats.mediaNotas || 0);

            atualizarListaFeedbacks();
        }
    } catch (error) {
        console.error('Erro ao carregar feedbacks:', error);
        const tbody = document.getElementById('listaFeedbacks');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar feedbacks</td></tr>';
    }
}

function gerarEstrelas(nota) {
    const cheias = Math.floor(nota);
    const meia = nota % 1 >= 0.5;
    let html = '';
    for (let i = 0; i < cheias; i++) html += '<i class="fas fa-star text-warning"></i>';
    if (meia) html += '<i class="fas fa-star-half-alt text-warning"></i>';
    for (let i = cheias + (meia ? 1 : 0); i < 5; i++) html += '<i class="far fa-star text-warning"></i>';
    return html;
}

// ============================================
// 📱 QR CODE
// ============================================
function mostrarQRCodeFeedback() {
    const url = `${window.location.origin}/feedback-cozinha.html`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
    const img = document.getElementById('qrCodeImage');
    if (img) img.innerHTML = `<img src="${qrUrl}" alt="QR Code" style="width: 200px;">`;
    const linkEl = document.getElementById('linkFeedback');
    if (linkEl) linkEl.textContent = url;
    const modal = document.getElementById('modalQRCode');
    if (modal) modal.classList.add('show');
}

function fecharModalQRCode() {
    const modal = document.getElementById('modalQRCode');
    if (modal) modal.classList.remove('show');
}

function toggleDropdown() {
    const menu = document.getElementById('dropdownMenu');
    if (menu) menu.classList.toggle('show');
}

document.addEventListener('click', function(event) {
    const menu = document.getElementById('dropdownMenu');
    const avatar = document.getElementById('userAvatar');
    if (menu && avatar && !menu.contains(event.target) && !avatar.contains(event.target)) {
        menu.classList.remove('show');
    }
});

async function logout() {
    const confirmar = await confirm('Tem certeza que deseja sair do sistema?');
    if (confirmar) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        window.location.href = '/login.html';
    }
}

// ============================================
// 📄 PDF
// ============================================
function gerarRelatorioPDF() {
    if (!dashboardData || !analiseTurmasFiltrada || analiseTurmasFiltrada.length === 0) {
        if (typeof mostrarNotificacaoInterna === 'function') {
            mostrarNotificacaoInterna('⚠️ Nenhum dado carregado. Aguarde o dashboard carregar.', 'warning');
        } else {
            mostrarToastCozinha('⚠️ Nenhum dado carregado. Aguarde o dashboard carregar.');
        }
        return;
    }

    const dadosParaRelatorio = { ...dashboardData, analisePorTurma: analiseTurmasFiltrada };
    const html = gerarHTMLRelatorioCozinha(dadosParaRelatorio);

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.onload = () => setTimeout(() => win.print(), 500);
}

function gerarHTMLRelatorioCozinha(data) {
    const logo = '/uploads/logo-iema.png';
    const carimbo = '/icons/assinatura_cozinha.ico';
    const dataGeracao = new Date().toLocaleString('pt-BR');
    const dataRef = new Date().toLocaleDateString('pt-BR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const labelPeriodo = data.infoData?.label || 'Hoje';

    const statsHTML = `
        <div class="stats">
            <div class="stat"><div class="stat-value">${data.perfis?.total || 0}</div><div class="stat-label">Total de Pessoas</div></div>
            <div class="stat"><div class="stat-value">${data.registrosReais?.pessoasUnicas || 0}</div><div class="stat-label">Comeram (${labelPeriodo})</div></div>
            <div class="stat"><div class="stat-value">${data.analiseAdesao?.taxaAdesao || 0}%</div><div class="stat-label">Taxa de Adesão</div></div>
            <div class="stat"><div class="stat-value">${data.registrosReais?.total || 0}</div><div class="stat-label">Refeições Servidas</div></div>
        </div>
    `;

    const refeicoesHTML = `
        <div class="section-title">🍽️ Contagem por Refeição (${labelPeriodo})</div>
        <table>
            <thead><tr><th>Refeição</th><th style="width:120px;text-align:center;">Previsto</th><th style="width:120px;text-align:center;">Servido</th><th style="width:120px;text-align:center;">Previsão (kg)</th></tr></thead>
            <tbody>
                <tr><td><strong>🌅 Lanche da Manhã</strong></td><td style="text-align:center;">${data.previsao?.manha?.pessoas || 0}</td><td style="text-align:center;">${data.registrosReais?.manha || 0}</td><td style="text-align:center;">${data.previsao?.manha?.kg || 0} kg</td></tr>
                <tr><td><strong>🍽️ Almoço</strong></td><td style="text-align:center;">${data.previsao?.almoco?.pessoas || 0}</td><td style="text-align:center;">${data.registrosReais?.almoco || 0}</td><td style="text-align:center;">${data.previsao?.almoco?.kg || 0} kg</td></tr>
                <tr><td><strong>🌙 Lanche da Tarde</strong></td><td style="text-align:center;">${data.previsao?.tarde?.pessoas || 0}</td><td style="text-align:center;">${data.registrosReais?.tarde || 0}</td><td style="text-align:center;">${data.previsao?.tarde?.kg || 0} kg</td></tr>
            </tbody>
        </table>
    `;

    const perfisHTML = `
        <div class="section-title">📊 Perfil Alimentar dos Usuários</div>
        <table>
            <thead><tr><th>Perfil</th><th style="width:120px;text-align:center;">Quantidade</th><th style="width:120px;text-align:center;">%</th></tr></thead>
            <tbody>
                <tr><td><strong>👍 Sempre come</strong></td><td style="text-align:center;">${data.perfis?.sempre || 0}</td><td style="text-align:center;">${data.perfis?.total > 0 ? Math.round(((data.perfis.sempre || 0) / data.perfis.total) * 100) : 0}%</td></tr>
                <tr><td><strong>⚠️ Às vezes come</strong></td><td style="text-align:center;">${data.perfis?.as_vezes || 0}</td><td style="text-align:center;">${data.perfis?.total > 0 ? Math.round(((data.perfis.as_vezes || 0) / data.perfis.total) * 100) : 0}%</td></tr>
                <tr><td><strong>❌ Nunca come</strong></td><td style="text-align:center;">${data.perfis?.nunca || 0}</td><td style="text-align:center;">${data.perfis?.total > 0 ? Math.round(((data.perfis.nunca || 0) / data.perfis.total) * 100) : 0}%</td></tr>
                <tr><td><strong>❔ Não informado</strong></td><td style="text-align:center;">${data.perfis?.nao_informado || 0}</td><td style="text-align:center;">${data.perfis?.total > 0 ? Math.round(((data.perfis.nao_informado || 0) / data.perfis.total) * 100) : 0}%</td></tr>
            </tbody>
        </table>
    `;

    let turmasHTML = '';
    if (data.analisePorTurma && data.analisePorTurma.length > 0) {
        turmasHTML = `
            <div class="section-title">🏫 Análise Detalhada por Turma (${labelPeriodo})</div>
            <table>
                <thead>
                    <tr>
                        <th>Turma</th>
                        <th style="width:80px;text-align:center;">Total</th>
                        <th style="width:100px;text-align:center;">Dizem que Comem</th>
                        <th style="width:100px;text-align:center;">Comeram</th>
                        <th style="width:80px;text-align:center;">Adesão</th>
                        <th style="width:80px;text-align:center;">Faltantes</th>
                        <th style="width:100px;text-align:center;">Situação</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.analisePorTurma.map(t => {
                        let situacao = '❌ Baixa';
                        if (t.taxaAdesao >= 70) situacao = '✅ Boa';
                        else if (t.taxaAdesao >= 40) situacao = '⚠️ Média';
                        return `
                            <tr>
                                <td><strong>${escapeHTML(t.turma || '')}</strong></td>
                                <td style="text-align:center;">${t.totalAlunos || 0}</td>
                                <td style="text-align:center;">${t.dizemQueComem || 0}</td>
                                <td style="text-align:center;">${t.comeramHoje || 0}</td>
                                <td style="text-align:center;">${t.taxaAdesao || 0}%</td>
                                <td style="text-align:center;">${t.faltantes || 0}</td>
                                <td style="text-align:center;">${situacao}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    let insightsHTML = '';
    if (data.insights && data.insights.length > 0) {
        insightsHTML = `
            <div class="section-title">💡 Insights e Recomendações</div>
            <div class="insights-block">
                ${data.insights.map(insight => `
                    <div class="insight-item">
                        <strong>${escapeHTML(insight.titulo || '')}</strong>
                        <p>${escapeHTML(insight.mensagem || '')}</p>
                        ${insight.acao ? `<p style="font-size:9pt;color:#666;"><em>Sugestão: ${escapeHTML(insight.acao)}</em></p>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    return `<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
        <meta charset="UTF-8">
        <title>Relatório Cozinha - ${dataRef}</title>
        <style>
            @page { size: A4 portrait; margin: 8mm; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Times New Roman', Times, serif; font-size: 9.5pt; line-height: 1.25; color: #000; }
            .header { text-align: center; border-bottom: 1.5px double #000; padding-bottom: 4px; margin-bottom: 6px; }
            .header img { max-width: 100%; max-height: 14mm; object-fit: contain; display: block; margin: 0 auto 2px; }
            .header h1 { font-size: 10pt; text-transform: uppercase; font-weight: bold; margin: 2px 0 0; }
            .header p { font-size: 8pt; margin: 1px 0 0; }
            .titulo { text-align: center; font-size: 11pt; font-weight: bold; background: #e0f2fe; padding: 4px 8px; border: 1.5px solid #000; margin: 6px 0 3px; text-transform: uppercase; letter-spacing: 0.5px; }
            .subtitulo { text-align: center; font-size: 9pt; margin: 0 0 6px; font-style: italic; }
            .stats { display: flex; gap: 8px; margin: 6px 0 8px; padding: 6px 8px; background: #eff6ff; border-radius: 5px; border: 1px solid #bfdbfe; }
            .stat { text-align: center; flex: 1; border-right: 1px solid #bfdbfe; }
            .stat:last-child { border-right: none; }
            .stat-value { font-size: 13pt; font-weight: bold; color: #0d6efd; line-height: 1; }
            .stat-label { font-size: 7.5pt; color: #666; margin-top: 2px; }
            .section-title { font-size: 9pt; font-weight: bold; background: #e8e8e8; padding: 2px 6px; border-left: 3px solid #0d6efd; margin: 6px 0 3px; }
            table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 6px; }
            th { background: #0d6efd; color: white; padding: 4px 5px; text-align: left; border: 1px solid #0b5ed7; font-size: 8pt; }
            td { padding: 3px 5px; border: 1px solid #ddd; vertical-align: top; }
            tr:nth-child(even) { background: #f9fafb; }
            .insights-block { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 5px; padding: 6px 8px; }
            .insight-item { padding: 4px 0; border-bottom: 1px solid #e5e7eb; }
            .insight-item:last-child { border-bottom: none; }
            .insight-item strong { display: block; margin-bottom: 2px; color: #0d6efd; }
            .insight-item p { font-size: 8.5pt; margin-bottom: 2px; }
            .assinaturas { display: flex; justify-content: center; margin-top: 25px; gap: 30px; }
            .assinatura { flex: 0 0 60%; text-align: center; }
            .assinatura-container-relatorio { position: relative; min-height: 18mm; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 0; }
            .assinatura-container-relatorio::after { content: ''; position: absolute; bottom: 0; left: 0; right: 0; border-bottom: 1px solid #000; }
            .carimbo-overlay { position: absolute; bottom: 1mm; left: 50%; transform: translateX(-50%); max-height: 15mm; max-width: 55mm; object-fit: contain; opacity: 0.95; pointer-events: none; z-index: 1; }
            .assinatura-linha { padding-top: 3px; font-size: 8pt; margin-top: 2px; }
            .footer { text-align: center; margin-top: 8px; padding-top: 3px; border-top: 1px solid #ccc; font-size: 6.5pt; color: #666; }
            .footer p { margin: 1px 0; }
            .registro-info { font-size: 7.5pt; color: #666; margin-top: 6px; text-align: center; }
            .btn-print { display: block; margin: 10px auto; padding: 8px 20px; background: #0d6efd; color: white; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 12px; font-family: Arial, sans-serif; }
            .btn-print:hover { background: #0b5ed7; }
            @media print { .no-print { display: none !important; } body { padding: 0; } }
        </style>
    </head>
    <body>
        <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
        <div class="header">
            <img src="${logo}" alt="IEMA" onerror="this.style.display='none'">
            <h1>IEMA Pleno: São Luís - Centro</h1>
            <p>Sistema de Monitoramento — Cozinha Inteligente</p>
        </div>
        <div class="titulo">🍽️ Relatório de Monitoramento de Refeições</div>
        <div class="subtitulo">${dataRef} — Período: ${labelPeriodo}</div>
        ${statsHTML}
        ${refeicoesHTML}
        ${perfisHTML}
        ${turmasHTML}
        ${insightsHTML}
        <div class="assinaturas">
            <div class="assinatura">
                <div class="assinatura-container-relatorio">
                    <img class="carimbo-overlay" src="${carimbo}" alt="Carimbo" onerror="this.style.display='none'">
                </div>
                <div class="assinatura-linha">Responsável pela Cozinha</div>
            </div>
        </div>
        <div class="registro-info">Relatório gerado em <strong>${dataGeracao}</strong></div>
        <div class="footer">
            <p>Documento gerado automaticamente pelo EducaPleno</p>
            <p>Setor: Cozinha Inteligente</p>
        </div>
    </body>
    </html>`;
}

// ============================================
// 📥 CSV
// ============================================
function exportarCSV() {
    const dados = analiseTurmasFiltrada && analiseTurmasFiltrada.length > 0
        ? analiseTurmasFiltrada
        : (dashboardData.analisePorTurma || []);

    if (!dados || dados.length === 0) {
        mostrarToastCozinha('⚠️ Nenhum dado para exportar', 'warning');
        return;
    }

    const filtros = lerFiltrosAnalise();
    const labelPeriodo = dashboardData.infoData?.label || 'Hoje';

    // ============================================
    // TÍTULO / SUBTÍTULO
    // ============================================
    const titulo = 'Análise de Adesão por Turma';
    const subtitulo = `Período: ${labelPeriodo}`;

    // ============================================
    // COLUNAS
    // ============================================
    const colunas = [
        { label: 'Turma', format: (t) => t.turma || '' },
        { label: 'Total de Alunos', format: (t) => t.totalAlunos || 0 },
        { label: 'Dizem que Comem', format: (t) => t.dizemQueComem || 0 },
        { label: 'Comeram', format: (t) => t.comeramHoje || 0 },
        {
            label: 'Taxa de Adesão',
            format: (t) => `${t.taxaAdesao || 0}%`
        },
        {
            label: 'Faltantes',
            format: (t) => t.faltantes || 0
        },
        {
            label: 'Situação',
            format: (t) => {
                if (t.taxaAdesao >= 70) return 'Boa adesão';
                if (t.taxaAdesao >= 40) return 'Adesão média';
                return 'Baixa adesão';
            }
        }
    ];

    // ============================================
    // FILTROS APLICADOS
    // ============================================
    const filtrosList = [];
    if (filtros) {
        if (filtros.turma && filtros.turma !== 'todas') filtrosList.push({ label: 'Turma', valor: filtros.turma });
        if (filtros.curso && filtros.curso !== 'todos') filtrosList.push({ label: 'Curso', valor: filtros.curso });
        if (filtros.periodo && filtros.periodo !== 'hoje') filtrosList.push({ label: 'Período', valor: filtros.periodo });
        if (filtros.data) filtrosList.push({ label: 'Data específica', valor: filtros.data });
        if (filtros.refeicao && filtros.refeicao !== 'todas') {
            const nomes = { manha: 'Lanche da Manhã', almoco: 'Almoço', tarde: 'Lanche da Tarde' };
            filtrosList.push({ label: 'Refeição', valor: nomes[filtros.refeicao] || filtros.refeicao });
        }
    }

    // ============================================
    // MÉTRICAS GERAIS
    // ============================================
    const totalAlunos = dados.reduce((acc, t) => acc + (t.totalAlunos || 0), 0);
    const totalComeram = dados.reduce((acc, t) => acc + (t.comeramHoje || 0), 0);
    const totalFaltantes = dados.reduce((acc, t) => acc + (t.faltantes || 0), 0);
    const taxaGeral = totalAlunos > 0 ? Math.round((totalComeram / totalAlunos) * 100) : 0;

    const metricas = {
        'Total de turmas': dados.length,
        'Total de alunos': totalAlunos,
        'Comeram': totalComeram,
        'Faltantes': totalFaltantes,
        'Taxa de adesão geral': `${taxaGeral}%`,
        'Pessoas (geral)': dashboardData.perfis?.total || 0,
        'Refeições servidas': dashboardData.registrosReais?.total || 0
    };

    // ============================================
    // GERA E BAIXA
    // ============================================
    const ok = gerarBaixarCSV({
        titulo,
        subtitulo,
        setor: 'Cozinha',
        colunas,
        registros: dados,
        filtros: filtrosList,
        metricas,
        nomeArquivo: 'analise-adesao-turmas',
        observacoes: `${dados.length} turma(s) listada(s)`
    });

    if (ok) {
        mostrarToastCozinha(`✅ CSV exportado (${dados.length} turma(s))!`, 'success');
    }
}

// ============================================
// 👥 MODAL DE FALTANTES
// ============================================
async function abrirModalFaltantes() {
    const modal = document.getElementById('modalFaltantes');
    const listaDiv = document.getElementById('listaFaltantes');
    const infoSpan = document.getElementById('modalInfo');
    if (!modal || !listaDiv) return;

    modal.classList.add('show');
    listaDiv.innerHTML = '<div class="loading-spinner"></div> Carregando...';

    try {
        const filtros = lerFiltrosAnalise();
        const qs = new URLSearchParams(periodoParaQuery(filtros)).toString();
        const url = `/api/cozinha/faltantes${qs ? '?' + qs : ''}`;

        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        if (data.success && data.faltantes && data.faltantes.length > 0) {
            const labelPeriodo = data.infoData?.label || 'hoje';
            if (infoSpan) infoSpan.innerHTML = `${data.totalFaltantes} pessoas que disseram que comeriam mas não vieram (${labelPeriodo}).`;
            listaDiv.innerHTML = data.faltantes.map(f => `
                <div class="d-flex justify-content-between align-items-center p-2 border-bottom">
                    <div>
                        <strong>${escapeHTML(f.nome || '')}</strong>
                        <br>
                        <small class="text-muted">${escapeHTML(f.turma || '')} • Perfil: ${f.perfil === 'sempre' ? 'Sempre' : 'Às vezes'}</small>
                    </div>
                    <span class="badge bg-secondary">não comeu</span>
                </div>
            `).join('');
        } else {
            if (infoSpan) infoSpan.innerHTML = 'Nenhum faltante no período! Todos que disseram que comeriam vieram. 🎉';
            listaDiv.innerHTML = '<div class="text-center text-success py-3"><i class="fas fa-check-circle fa-2x"></i><br>Todos compareceram!</div>';
        }
    } catch (error) {
        console.error('Erro ao carregar faltantes:', error);
        listaDiv.innerHTML = '<div class="mostrarToastCozinha mostrarToastCozinha-danger">Erro ao carregar lista de faltantes</div>';
    }
}

function fecharModalFaltantes() {
    const modal = document.getElementById('modalFaltantes');
    if (modal) modal.classList.remove('show');
}

// ============================================
// 🔔 SISTEMA DE NOTIFICAÇÕES (SINO)
// ============================================
(function() {
    let notificacoesInterval = null;
    let __notificacoesCache = [];

    function isWebViewNotif() {
        return /wv|WebView|Android.*Version\/[\d.]+.*Chrome/i.test(navigator.userAgent) ||
               (typeof window.AppInventor !== 'undefined');
    }

    function escapeHTMLNotif(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function mostrarNotificacaoInterna(mensagem, tipo = 'info') {
        if (!isWebViewNotif()) { mostrarToastCozinha(mensagem); return; }
        const modal = document.createElement('div');
        modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;
            z-index: 999999; padding: 20px; box-sizing: border-box;`;
        const icones = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        const cores = { success: '#10b981', error: '#dc2626', warning: '#f59e0b', info: '#0d6efd' };
        modal.innerHTML = `
            <div style="background: white; border-radius: 16px; padding: 25px; max-width: 380px; width: 100%;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center;">
                <div style="font-size: 48px; margin-bottom: 15px;">${icones[tipo] || 'ℹ️'}</div>
                <p style="margin: 0 0 20px; color: #374151; font-size: 15px; line-height: 1.5; white-space: pre-line;">${mensagem}</p>
                <button onclick="this.closest('div').parentElement.remove()"
                        style="width: 100%; padding: 12px; background: ${cores[tipo] || cores.info};
                               color: white; border: none; border-radius: 10px; font-size: 14px;
                               font-weight: 600; cursor: pointer;">OK</button>
            </div>`;
        document.body.appendChild(modal);
    }

    function confirmarInternoNotif(mensagem) {
        return new Promise((resolve) => {
            const old = document.getElementById('confirmInternoModalNotif');
            if (old) old.remove();
            const modalHtml = `
                <div class="modal fade" id="confirmInternoModalNotif" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header" style="background: linear-gradient(135deg, #0d6efd, #0b5ed7); color: white;">
                                <h5 class="modal-title"><i class="fas fa-question-circle"></i> Confirmação</h5>
                            </div>
                            <div class="modal-body" style="white-space: pre-line; font-size: 15px;">${escapeHTMLNotif(mensagem)}</div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" id="btnCancelarConfirmInternoNotif"><i class="fas fa-times"></i> Cancelar</button>
                                <button type="button" class="btn btn-danger" id="btnConfirmarConfirmInternoNotif"><i class="fas fa-check"></i> Confirmar</button>
                            </div>
                        </div>
                    </div>
                </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            const modalEl = document.getElementById('confirmInternoModalNotif');
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
            const finalizar = (r) => {
                modal.hide();
                setTimeout(() => modalEl.remove(), 300);
                resolve(r);
            };
            document.getElementById('btnConfirmarConfirmInternoNotif').addEventListener('click', () => finalizar(true));
            document.getElementById('btnCancelarConfirmInternoNotif').addEventListener('click', () => finalizar(false));
        });
    }

    function iniciarSistemaNotificacoes() {
        if (!document.getElementById('notificacoesBtn')) return;
        carregarTudo();
        if (notificacoesInterval) clearInterval(notificacoesInterval);
        notificacoesInterval = setInterval(carregarTudo, 30000);
        document.addEventListener('click', function(event) {
            const dropdown = document.getElementById('notificacoesDropdown');
            const btn = document.getElementById('notificacoesBtn');
            if (dropdown && btn && !btn.contains(event.target) && !dropdown.contains(event.target)) {
                dropdown.classList.remove('show');
            }
        });
    }

    async function carregarTudo() {
        await carregarNotificacoesSistema();
        renderizarSino();
        atualizarBadge();
    }

    async function carregarNotificacoesSistema() {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return;
            const response = await fetch('/api/notificacoes?apenasNaoLidas=false&limite=20', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) __notificacoesCache = data.notificacoes || [];
        } catch (error) { console.error('Erro ao carregar notificações:', error); }
    }

    function renderizarSino() {
        const lista = document.getElementById('notificacoesLista');
        if (!lista) return;
        if (__notificacoesCache.length === 0) {
            lista.innerHTML = `<div class="notificacoes-vazio"><i class="fas fa-bell-slash"></i><p>Nenhuma notificação</p></div>`;
            return;
        }
        let html = `
            <div class="notificacoes-secao">
                <div class="notificacoes-secao-titulo">
                    <i class="fas fa-bell"></i>
                    <span>Notificações</span>
                    <span class="badge-count">${__notificacoesCache.filter(n => !n.lida).length} não lidas</span>
                </div>`;
        __notificacoesCache.forEach(notif => {
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
            html += `
                <div class="notificacao-item ${classeLida}"
                     data-notif-id="${notif._id}"
                     data-notif-link="${escapeHTMLNotif(notif.link || '#')}"
                     style="cursor: pointer;">
                    <div class="notificacao-icone" style="background: ${notif.cor || '#0d6efd'};">${notif.icone || '📋'}</div>
                    <div class="notificacao-conteudo">
                        <div class="notificacao-titulo">${escapeHTMLNotif(notif.titulo || '')}</div>
                        <div class="notificacao-mensagem">${escapeHTMLNotif(notif.mensagem || '')}</div>
                        <div class="notificacao-tempo"><i class="far fa-clock"></i> ${tempoTexto}</div>
                    </div>
                </div>`;
        });
        html += `</div>`;
        lista.innerHTML = html;
        lista.querySelectorAll('.notificacao-item').forEach(item => {
            item.addEventListener('click', () => {
                const id = item.getAttribute('data-notif-id');
                const link = item.getAttribute('data-notif-link');
                abrirNotificacao(id, link);
            });
        });
    }

    function atualizarBadge() {
        const badge = document.getElementById('notificacoesBadge');
        const btn = document.getElementById('notificacoesBtn');
        if (!badge || !btn) return;
        const total = __notificacoesCache.filter(n => !n.lida).length;
        if (total > 0) {
            badge.textContent = total > 99 ? '99+' : total;
            badge.style.display = 'inline-flex';
            btn.classList.remove('tem-notificacao');
            badge.style.background = '#ef4444';
        } else {
            badge.style.display = 'none';
            btn.classList.remove('tem-notificacao');
        }
    }

    function abrirNotificacoes() {
        const dropdown = document.getElementById('notificacoesDropdown');
        if (!dropdown) return;
        dropdown.classList.toggle('show');
        if (dropdown.classList.contains('show')) carregarTudo();
    }

    function fecharNotificacoes() {
        document.getElementById('notificacoesDropdown')?.classList.remove('show');
    }

    async function abrirNotificacao(id, link) {
        try {
            const token = localStorage.getItem('auth_token');
            await fetch(`/api/notificacoes/${id}/lida`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            fecharNotificacoes();
            if (link && link !== '#') window.location.href = link;
            carregarTudo();
        } catch (error) { console.error('Erro ao abrir notificação:', error); }
    }

    async function marcarTodasLidas() {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/notificacoes/marcar-todas-lidas', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.success) {
                await carregarTudo();
                mostrarNotificacaoInterna('Notificações marcadas como lidas!', 'success');
            }
        } catch (error) { console.error('Erro ao marcar todas como lidas:', error); }
    }

    async function limparMinhasNotificacoes(event) {
        try {
            const token = localStorage.getItem('auth_token');
            const confirmacao = await confirmarInternoNotif('🗑️ Deseja excluir TODAS as suas notificações?\n\nEsta ação não pode ser desfeita.');
            if (!confirmacao) return;
            const response = await fetch('/api/notificacoes/limpar-minhas', {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            if (data.success) {
                __notificacoesCache = [];
                await carregarTudo();
                mostrarNotificacaoInterna('Notificações excluídas com sucesso!', 'success');
            } else {
                throw new Error(data.error || 'Erro ao excluir');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            mostrarNotificacaoInterna(error.message, 'error');
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => iniciarSistemaNotificacoes(), 500);
    });
    window.addEventListener('beforeunload', () => {
        if (notificacoesInterval) clearInterval(notificacoesInterval);
    });

    window.abrirNotificacoes = abrirNotificacoes;
    window.abrirNotificacao = abrirNotificacao;
    window.marcarTodasLidas = marcarTodasLidas;
    window.limparMinhasNotificacoes = limparMinhasNotificacoes;
    window.fecharNotificacoes = fecharNotificacoes;
    window.mostrarNotificacaoInterna = mostrarNotificacaoInterna;
    window.confirmarInternoNotif = confirmarInternoNotif;
})();

// ============================================
// 🌐 EXPORTAR FUNÇÕES GLOBAIS
// ============================================
window.toggleDropdown = toggleDropdown;
window.logout = logout;
window.carregarDashboard = carregarDashboard;
window.carregarAnaliseTurmas = carregarAnaliseTurmas;
window.gerarRelatorioPDF = gerarRelatorioPDF;
window.exportarCSV = exportarCSV;
window.abrirModalFaltantes = abrirModalFaltantes;
window.fecharModalFaltantes = fecharModalFaltantes;
window.mostrarQRCodeFeedback = mostrarQRCodeFeedback;
window.fecharModalQRCode = fecharModalQRCode;
window.carregarFeedbacks = carregarFeedbacks;
window.aplicarFiltrosFeedback = aplicarFiltrosFeedback;
window.limparFiltrosFeedback = limparFiltrosFeedback;
window.removerFiltro = removerFiltro;
window.aplicarFiltrosFeedbackDebounce = aplicarFiltrosFeedbackDebounce;