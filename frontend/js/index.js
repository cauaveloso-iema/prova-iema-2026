// ============================================
// 🛡️ PROTEÇÃO CONTRA alert() E confirm() NATIVOS
// ============================================
(function protegerContraAlertEConfirmNativos() {
    let __mostrarAlertaGeralaEmProgresso = false;
    
    window.mostrarAlertaGeral = function(mensagem) {
        if (__mostrarAlertaGeralaEmProgresso) return;
        __mostrarAlertaGeralaEmProgresso = true;
        
        try {
            const isWebView = /wv|WebView|Android.*Version\/[\d.]+.*Chrome/i.test(navigator.userAgent) ||
                            (typeof window.AppInventor !== 'undefined');
            
            if (typeof window.mostrarAlertaGeral === 'function') {
                window.mostrarAlertaGeral(String(mensagem), 'info');
                return;
            }
            if (typeof window.mostrarAlerta === 'function') {
                window.mostrarAlerta('mostrarAlertaGeralGeral', String(mensagem), 'info');
                return;
            }
            
            if (!isWebView) {
                console.log('%c[ALERT] ' + mensagem, 'background:#4f46e5;color:white;padding:4px 8px;border-radius:4px;');
                return;
            }
            
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
                            style="width:100%;padding:12px;background:#4f46e5;color:white;
                                border:none;border-radius:10px;font-size:14px;
                                font-weight:600;cursor:pointer;">OK</button>
                </div>
            `;
            document.body.appendChild(modal);
        } finally {
            __mostrarAlertaGeralaEmProgresso = false;
        }
    };
    
    const confirmOriginal = window.confirm;
    const jaSobrescrito = !confirmOriginal.toString().includes('[native code]');
    
    if (!jaSobrescrito) {
        window.confirm = function(mensagem) {
            console.warn('⚠️ confirm() nativo — usando fallback');
            return true;
        };
    }
    
    console.log('🛡️ [Proteção] mostrarAlertaGeral() e confirm() blindados (professor)');
})();

// ============================================
// SERVICE WORKER
// ============================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('✅ Service Worker registrado:', registration.scope);
      })
      .catch(error => {
        console.log('❌ Service Worker falhou:', error);
      });
  });
}

// ============================================
// SISTEMA DE NOTIFICAÇÕES DO PROFESSOR
// ============================================
let notificacoesInterval;

document.addEventListener('DOMContentLoaded', function() {
    iniciarNotificacoes();
    
    document.addEventListener('click', function(event) {
        const dropdown = document.getElementById('notificacoesDropdown');
        const btn = document.getElementById('notificacoesBtn');
        
        if (dropdown && btn && !btn.contains(event.target) && !dropdown.contains(event.target)) {
            dropdown.classList.remove('show');
        }
    });
});

function iniciarNotificacoes() {
    carregarNotificacoes();
    notificacoesInterval = setInterval(carregarNotificacoes, 30000);
}

function pararNotificacoes() {
    if (notificacoesInterval) {
        clearInterval(notificacoesInterval);
    }
}

async function carregarNotificacoes() {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        
        const countResponse = await fetch('/api/notificacoes/nao-lidas/contador', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const countData = await countResponse.json();
        
        if (countData.success) {
            const badge = document.getElementById('notificacoesBadge');
            if (countData.count > 0) {
                badge.textContent = countData.count > 99 ? '99+' : countData.count;
                badge.style.display = 'inline';
                
                document.getElementById('notificacoesBtn').classList.add('tem-notificacao');
            } else {
                badge.style.display = 'none';
                document.getElementById('notificacoesBtn').classList.remove('tem-notificacao');
            }
        }
        
        const dropdown = document.getElementById('notificacoesDropdown');
        if (dropdown && dropdown.classList.contains('show')) {
            await carregarListaNotificacoes();
        }
        
    } catch (error) {
        console.error('Erro ao carregar notificações:', error);
    }
}

async function carregarListaNotificacoes() {
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch('/api/notificacoes?apenasNaoLidas=false&limite=20', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderizarNotificacoes(data.notificacoes);
        }
        
    } catch (error) {
        console.error('Erro ao carregar lista:', error);
    }
}

function renderizarNotificacoes(notificacoes) {
    const lista = document.getElementById('notificacoesLista');
    if (!lista) return;
    
    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
    const isAdmin = userData.role === 'admin' || userData.role === 'super_admin';
    
    if (notificacoes.length === 0) {
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
        
        html += `
            <div class="notificacao-item ${classeLida}" style="position: relative; padding-right: ${isAdmin ? '40px' : '15px'};">
                <div onclick="abrirNotificacao('${notif._id}', '${notif.link || '#'}')" style="display: flex; gap: 12px; flex: 1; cursor: pointer;">
                    <div class="notificacao-icone" style="background: ${notif.cor || '#0d6efd'};">
                        ${notif.icone || '📋'}
                    </div>
                    <div class="notificacao-conteudo">
                        <div class="notificacao-titulo">${notif.titulo}</div>
                        <div class="notificacao-mensagem">${notif.mensagem}</div>
                        <div class="notificacao-tempo">
                            <i class="far fa-clock"></i> ${tempoTexto}
                        </div>
                    </div>
                </div>
                
                ${isAdmin ? `
                <button onclick="if(window.admin) admin.excluirNotificacao('${notif._id}')" style="
                    position: absolute;
                    top: 50%;
                    right: 10px;
                    transform: translateY(-50%);
                    background: #fee2e2;
                    color: #dc2626;
                    border: none;
                    border-radius: 6px;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    font-size: 1rem;
                    opacity: 0.6;
                    transition: all 0.2s;
                " onmouseover="this.style.opacity='1'; this.style.background='#fecaca'" 
                   onmouseout="this.style.opacity='0.6'; this.style.background='#fee2e2'"
                   title="Excluir notificação">
                    <i class="fas fa-trash"></i>
                </button>
                ` : ''}
            </div>
        `;
    });
    
    lista.innerHTML = html;
}

async function limparMinhasNotificacoes() {
    const btn = document.querySelector('.notificacao-footer button');
    
    try {
        const token = localStorage.getItem('auth_token');
        
        const confirmacao = await confirm('🗑️ Deseja excluir TODAS as suas notificações?\n\nEsta ação não pode ser desfeita.');
        
        if (!confirmacao) return;
        
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
            
            document.getElementById('notificacoesBadge').style.display = 'none';
            document.getElementById('notificacoesBtn').classList.remove('tem-notificacao');
            
            if (typeof showToast === 'function') {
                showToast(`✅ ${data.message || 'Notificações excluídas com sucesso!'}`, 'success');
            } else {
                console.log(`✅ ${data.message || 'Notificações excluídas com sucesso!'}`);
            }
        } else {
            throw new Error(data.error || 'Erro ao excluir notificações');
        }
        
    } catch (error) {
        console.error('❌ Erro:', error);
        if (typeof showToast === 'function') {
            showToast('❌ ' + error.message, 'error');
        } else {
            console.error('❌ ' + error.message);
        }
    } finally {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-trash"></i> Limpar todas';
            btn.disabled = false;
        }
    }
}

function abrirNotificacoes() {
    const dropdown = document.getElementById('notificacoesDropdown');
    dropdown.classList.toggle('show');
    
    if (dropdown.classList.contains('show')) {
        carregarListaNotificacoes();
    }
}

async function abrirNotificacao(id, link) {
    try {
        const token = localStorage.getItem('auth_token');
        
        await fetch(`/api/notificacoes/${id}/lida`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        document.getElementById('notificacoesDropdown').classList.remove('show');
        
        if (link && link !== '#') {
            window.location.href = link;
        }
        
        carregarNotificacoes();
        
    } catch (error) {
        console.error('Erro ao abrir notificação:', error);
    }
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
            await carregarListaNotificacoes();
            document.getElementById('notificacoesBadge').style.display = 'none';
            document.getElementById('notificacoesBtn').classList.remove('tem-notificacao');
        }
        
    } catch (error) {
        console.error('Erro ao marcar todas como lidas:', error);
    }
}

function verTodasNotificacoes(event) {
    event.preventDefault();
    event.stopPropagation();
    
    console.log('🔍 Redirecionando para página de notificações...');
    
    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
    const role = userData.role || 'aluno';
    
    window.location.href = 'notificacoes.html';
}

window.addEventListener('beforeunload', function() {
    if (notificacoesInterval) {
        clearInterval(notificacoesInterval);
    }
});

// ============================================
// BOTÃO SCROLL TO BOTTOM
// ============================================
function scrollToBottom() {
    const btn = document.getElementById('btnScrollToBottom');
    
    btn.style.transform = 'scale(0.9)';
    btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
    
    setTimeout(() => {
        btn.style.transform = 'scale(1.1)';
    }, 200);
    
    setTimeout(() => {
        btn.style.transform = 'scale(1)';
        btn.style.background = 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)';
    }, 400);
    
    window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
    });
}

window.addEventListener('scroll', function() {
    const btn = document.getElementById('btnScrollToBottom');
    if (!btn) return;
    
    if ((window.innerHeight + window.scrollY) >= document.body.scrollHeight - 100) {
        btn.style.opacity = '0';
        btn.style.pointerEvents = 'none';
        btn.style.transform = 'translateY(20px)';
    } else {
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.style.transform = 'translateY(0)';
    }
});

// ============================================
// DETECTAR SUPORTE A TEXT GRADIENT
// ============================================
function detectTextGradient() {
    const el = document.createElement('div');
    el.style.background = 'linear-gradient(black, black) text';
    const style = el.style;
    const supports = style.backgroundClip && style.backgroundClip.includes('text') ||
                   style.webkitBackgroundClip && style.webkitBackgroundClip.includes('text');
    
    if (!supports) {
        document.body.classList.add('no-textgradient');
    }
}

document.addEventListener('DOMContentLoaded', detectTextGradient);

// ============================================
// VARIÁVEIS GLOBAIS
// ============================================
let usuario = null;
let turmasProfessor = [];
let provaGerada = null;
let turmaParaExcluir = null;
let arquivosOriginaisParaRegeneracao = [];

let arquivosOriginaisBackup = [];
let editoresCKEditor = {};
let questaoAtualIndex = 0;

let provaParaCorrigir = null;
let alunoParaCorrigir = null;
let gabaritoProva = null;
let respostasAluno = null;

let provasOriginais = [];
let filtrosAtivos = {
    status: 'todos',
    dificuldade: 'todas',
    tipo: 'todos',
    turma: 'todas',
    busca: ''
};

// ============================================
// APLICAR FILTROS DAS PROVAS
// ============================================
function aplicarFiltrosProvas() {
    console.log('🔍 Aplicando filtros...');
    
    const status = document.getElementById('filtroStatus')?.value || 'todos';
    const dificuldade = document.getElementById('filtroDificuldade')?.value || 'todas';
    const tipo = document.getElementById('filtroTipo')?.value || 'todos';
    const periodo = document.getElementById('filtroPeriodoProvas')?.value || 'todos';
    const turma = document.getElementById('filtroTurmaProvas')?.value || 'todas';
    const busca = document.getElementById('buscaProva')?.value.toLowerCase() || '';
    
    console.log('📊 Filtros selecionados:', { status, dificuldade, tipo, periodo, turma, busca });
    
    if (!provasOriginais || provasOriginais.length === 0) {
        console.log('⚠️ Nenhuma prova cadastrada');
        
        const contador = document.getElementById('resultadosFiltrados');
        if (contador) contador.textContent = '0 resultados';
        
        const container = document.getElementById('listaProvas');
        if (container) {
            container.innerHTML = `
                <div style="
                    background: white;
                    border-radius: 24px;
                    padding: 60px 30px;
                    text-align: center;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
                    border: 1px solid #f0f0f0;
                    width: 100%;
                    box-sizing: border-box;
                    animation: fadeIn 0.5s ease-out;
                ">
                    <div style="
                        width: 100px;
                        height: 100px;
                        background: linear-gradient(135deg, #f3f4f6, #e5e7eb);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto 25px;
                        font-size: 40px;
                        color: #9ca3af;
                    ">
                        <i class="fas fa-file-alt"></i>
                    </div>
                    
                    <h3 style="
                        color: #1f2937;
                        font-size: 1.8rem;
                        margin-bottom: 15px;
                        font-weight: 600;
                    ">
                        Nenhuma prova encontrada
                    </h3>
                    
                    <p style="
                        color: #6b7280;
                        max-width: 400px;
                        margin: 0 auto 25px;
                        font-size: 1rem;
                        line-height: 1.6;
                    ">
                        Você ainda não criou nenhuma prova. 
                        Comece criando sua primeira prova na aba 
                        <strong>"Nova Prova"</strong>.
                    </p>
                    
                    <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap;">
                        <button onclick="mostrarTab('nova-prova')" style="
                            padding: 14px 28px;
                            background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                            color: white;
                            border: none;
                            border-radius: 40px;
                            font-weight: 600;
                            font-size: 1rem;
                            cursor: pointer;
                            display: inline-flex;
                            align-items: center;
                            gap: 10px;
                            transition: all 0.3s;
                            box-shadow: 0 10px 20px -5px rgba(59, 130, 246, 0.3);
                        ">
                            <i class="fas fa-plus-circle"></i>
                            Criar Primeira Prova
                        </button>
                        
                        <button onclick="recarregarProvas()" style="
                            padding: 14px 28px;
                            background: white;
                            color: #3b82f6;
                            border: 2px solid #3b82f620;
                            border-radius: 40px;
                            font-weight: 600;
                            font-size: 1rem;
                            cursor: pointer;
                            display: inline-flex;
                            align-items: center;
                            gap: 10px;
                            transition: all 0.3s;
                        ">
                            <i class="fas fa-sync-alt"></i>
                            Recarregar
                        </button>
                    </div>
                    
                    <div style="
                        margin-top: 30px;
                        padding: 20px;
                        background: #f9fafb;
                        border-radius: 16px;
                        max-width: 400px;
                        margin-left: auto;
                        margin-right: auto;
                    ">
                        <h4 style="color: #4b5563; margin-bottom: 10px; font-size: 0.95rem;">
                            <i class="fas fa-lightbulb" style="color: #f59e0b;"></i>
                            Dica Rápida
                        </h4>
                        <p style="color: #6b7280; font-size: 0.9rem; margin: 0;">
                            Use a IA para gerar provas automaticamente! 
                            Basta descrever o tema e escolher a quantidade de questões.
                        </p>
                    </div>
                </div>
                
                <style>
                    @keyframes fadeIn {
                        from {
                            opacity: 0;
                            transform: translateY(20px);
                        }
                        to {
                            opacity: 1;
                            transform: translateY(0);
                        }
                    }
                </style>
            `;
        }
        
        atualizarContadoresVazios();
        return;
    }
    
    let provasFiltradas = [...provasOriginais];
    
    if (status !== 'todos') {
        provasFiltradas = provasFiltradas.filter(p => {
            if (status === 'ativas') return p.status === 'ativa' && p.publicada === true;
            if (status === 'concluidas') return p.status === 'concluida' || p.cancelada === true;
            if (status === 'rascunhos') return p.publicada === false;
            if (status === 'canceladas') return p.cancelada === true;
            return true;
        });
    }
    
    if (dificuldade !== 'todas') {
        provasFiltradas = provasFiltradas.filter(p => 
            p.dificuldade === dificuldade
        );
    }
    
    if (tipo !== 'todos') {
        provasFiltradas = provasFiltradas.filter(p => {
            const tipoProva = p.tipoProva || (p.adaptada ? 'adaptada' : 'simples');
            if (tipo === 'adaptada') return tipoProva === 'adaptada' || p.adaptada === true;
            return tipoProva === tipo;
        });
    }
    
    if (periodo !== 'todos') {
        provasFiltradas = provasFiltradas.filter(p => 
            p.periodo === periodo || 
            (p.periodo && p.periodo.toString() === periodo)
        );
    }
    
    if (turma !== 'todas') {
        provasFiltradas = provasFiltradas.filter(p => {
            const turmaId = p.turma?.id || p.turmaId || '';
            return turmaId === turma;
        });
    }
    
    if (busca) {
        provasFiltradas = provasFiltradas.filter(p => {
            const titulo = (p.titulo || '').toLowerCase();
            const conteudo = (p.conteudo || '').toLowerCase();
            return titulo.includes(busca) || conteudo.includes(busca);
        });
    }
    
    console.log(`✅ ${provasFiltradas.length} provas encontradas`);
    
    const contador = document.getElementById('resultadosFiltrados');
    if (contador) contador.textContent = `${provasFiltradas.length} resultado${provasFiltradas.length !== 1 ? 's' : ''}`;
    
    if (provasFiltradas.length === 0) {
        const container = document.getElementById('listaProvas');
        if (container) {
            container.innerHTML = `
                <div style="
                    background: white;
                    border-radius: 24px;
                    padding: 50px 30px;
                    text-align: center;
                    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.05);
                    border: 1px solid #f0f0f0;
                ">
                    <div style="
                        width: 80px;
                        height: 80px;
                        background: #f3f4f6;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto 20px;
                        font-size: 32px;
                        color: #9ca3af;
                    ">
                        <i class="fas fa-filter"></i>
                    </div>
                    
                    <h3 style="color: #1f2937; font-size: 1.4rem; margin-bottom: 10px;">
                        Nenhuma prova corresponde aos filtros
                    </h3>
                    
                    <p style="color: #6b7280; max-width: 400px; margin: 0 auto 20px;">
                        Tente ajustar os filtros selecionados ou 
                        <button onclick="limparFiltrosProvas()" style="
                            background: none;
                            border: none;
                            color: #3b82f6;
                            text-decoration: underline;
                            cursor: pointer;
                            font-weight: 600;
                        ">limpar todos os filtros</button>.
                    </p>
                    
                    <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                        <button onclick="limparFiltrosProvas()" style="
                            padding: 12px 24px;
                            background: #3b82f6;
                            color: white;
                            border: none;
                            border-radius: 30px;
                            font-weight: 600;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                        ">
                            <i class="fas fa-eraser"></i> Limpar Filtros
                        </button>
                        
                        <button onclick="mostrarTab('nova-prova')" style="
                            padding: 12px 24px;
                            background: #10b981;
                            color: white;
                            border: none;
                            border-radius: 30px;
                            font-weight: 600;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                        ">
                            <i class="fas fa-plus-circle"></i> Nova Prova
                        </button>
                    </div>
                </div>
            `;
        }
        return;
    }
    
    if (typeof atualizarListaProvas === 'function') {
        atualizarListaProvas(provasFiltradas);
    }
}

function inicializarFiltrosCompletos() {
    console.log('🔧 Inicializando filtros de provas...');
    
    const filtros = [
        { id: 'filtroStatus', evento: 'change' },
        { id: 'filtroDificuldade', evento: 'change' },
        { id: 'filtroTipo', evento: 'change' },
        { id: 'filtroTurmaProvas', evento: 'change' },
        { id: 'buscaProva', evento: 'keyup' }
    ];
    
    filtros.forEach(filtro => {
        const elemento = document.getElementById(filtro.id);
        if (elemento) {
            elemento.removeEventListener(filtro.evento, window.aplicarFiltrosProvas);
            elemento.addEventListener(filtro.evento, window.aplicarFiltrosProvas);
            console.log(`   ✅ Listener ${filtro.evento} adicionado a #${filtro.id}`);
        }
    });
    
    if (typeof window.aplicarFiltrosProvas === 'function') {
        const originalFn = window.aplicarFiltrosProvas;
        window.aplicarFiltrosProvas = function() {
            originalFn();
            
            const contador = document.getElementById('resultadosFiltrados');
            if (contador) {
                contador.style.transition = 'all 0.3s';
                contador.style.transform = 'scale(1.1)';
                setTimeout(() => {
                    contador.style.transform = 'scale(1)';
                }, 200);
            }
        };
    }
}

function atualizarContadoresVazios() {
    const total = document.getElementById('totalProvasCount');
    const ativas = document.getElementById('ativasCount');
    const concluidas = document.getElementById('concluidasCount');
    const rascunhos = document.getElementById('rascunhosCount');
    
    if (total) total.textContent = '0';
    if (ativas) ativas.textContent = '0';
    if (concluidas) concluidas.textContent = '0';
    if (rascunhos) rascunhos.textContent = '0';
}

function recarregarProvas() {
    if (typeof carregarProvasProfessor === 'function') {
        carregarProvasProfessor();
    }
}

function limparFormularioTurma() {
    document.getElementById('formNovaTurma').reset();
    const btn = document.querySelector('button[onclick="limparFormularioTurma()"]');
    btn.style.backgroundColor = '#e5e7eb';
    setTimeout(() => {
        btn.style.backgroundColor = '#f3f4f6';
    }, 200);
}

function atualizarContadoresProvas() {
    const total = document.getElementById('totalProvasCount');
    const ativas = document.getElementById('ativasCount');
    const concluidas = document.getElementById('concluidasCount');
    const rascunhos = document.getElementById('rascunhosCount');
    
    if (total) total.textContent = provasOriginais.length;
    if (ativas) ativas.textContent = provasOriginais.filter(p => p.status === 'ativa' && p.publicada).length;
    if (concluidas) concluidas.textContent = provasOriginais.filter(p => p.status === 'concluida' || p.cancelada).length;
    if (rascunhos) rascunhos.textContent = provasOriginais.filter(p => !p.publicada).length;
}

function limparFiltrosProvas() {
    console.log('🧹 Limpando filtros...');
    
    document.getElementById('filtroStatus').value = 'todos';
    document.getElementById('filtroDificuldade').value = 'todas';
    document.getElementById('filtroTipo').value = 'todos';
    document.getElementById('filtroTurmaProvas').value = 'todas';
    document.getElementById('buscaProva').value = '';
    
    aplicarFiltrosProvas();
}

async function carregarProvasProfessor() {
    try {
        console.log('📚 Carregando provas do professor...');
        const token = localStorage.getItem('auth_token');
        
        const response = await fetch('/api/professor/provas', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            provasOriginais = data.provas || [];
            
            provasOriginais = provasOriginais.map(prova => ({
                ...prova,
                periodo: prova.periodo || '1'
            }));
            
            console.log(`✅ ${provasOriginais.length} provas carregadas`);
            console.log('📊 Distribuição por período:', 
                provasOriginais.reduce((acc, p) => {
                    acc[p.periodo] = (acc[p.periodo] || 0) + 1;
                    return acc;
                }, {})
            );
            
            const filtroTurma = document.getElementById('filtroTurmaProvas');
            if (filtroTurma) {
                while (filtroTurma.options.length > 1) {
                    filtroTurma.remove(1);
                }
                
                const turmasMap = new Map();
                provasOriginais.forEach(p => {
                    if (p.turma?.id && p.turma?.nome && !turmasMap.has(p.turma.id)) {
                        turmasMap.set(p.turma.id, p.turma.nome);
                    }
                });
                
                turmasMap.forEach((nome, id) => {
                    const option = document.createElement('option');
                    option.value = id;
                    option.textContent = nome;
                    filtroTurma.appendChild(option);
                });
            }
            
            atualizarContadoresProvas();
            aplicarFiltrosProvas();
        }
    } catch (error) {
        console.error('❌ Erro ao carregar provas:', error);
    }
}

// ============================================
// PROVA CORRIGIDA
// ============================================
window.gerarProvaCorrigida = async function(provaId, alunoId, alunoNome) {
    try {
        const token = localStorage.getItem('auth_token');
        
        console.log(`📝 Gerando prova corrigida: Prova ${provaId}, Aluno ${alunoNome}`);
        
        const modalContent = `
            <div style="padding: 40px; text-align: center;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: #f59e0b; margin-bottom: 15px;"></i>
                <h3 style="color: #4b5563; margin-bottom: 10px;">Gerando Prova Corrigida...</h3>
                <p style="color: #6b7280;">Buscando gabarito e respostas do aluno...</p>
            </div>
        `;
        
        let modal = document.getElementById('modalProvaCorrigida');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'modalProvaCorrigida';
            modal.innerHTML = `
                <div class="modal-content modal-prova-corrigida">
                    <div class="modal-header">
                        <h3 style="margin: 0; color: var(--gray-800); display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-file-check" style="color: #f59e0b;"></i> Prova Corrigida
                        </h3>
                        <button class="modal-close" onclick="fecharModal('modalProvaCorrigida')">&times;</button>
                    </div>
                    <div id="provaCorrigidaConteudo" class="prova-corrigida-container">
                        ${modalContent}
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        } else {
            document.getElementById('provaCorrigidaConteudo').innerHTML = modalContent;
        }
        
        modal.style.display = 'flex';
        
        provaParaCorrigir = provaId;
        alunoParaCorrigir = alunoId;
        
        const respostaProva = await fetch(`/api/provas/${provaId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!respostaProva.ok) {
            throw new Error(`Erro ${respostaProva.status}: Não foi possível carregar a prova`);
        }
        
        const dadosProva = await respostaProva.json();
        
        if (!dadosProva.success) {
            throw new Error(dadosProva.error || 'Erro ao carregar dados da prova');
        }
        
        gabaritoProva = {
            titulo: dadosProva.prova.titulo,
            questoes: dadosProva.questoes.map((q, index) => ({
                numero: index + 1,
                pergunta: q.pergunta,
                opcoes: q.opcoes,
                respostaCorreta: q.respostaCorreta,
                respostaCorretaLetra: String.fromCharCode(65 + q.respostaCorreta),
                explicacao: q.explicacao
            }))
        };
        
        let respostasEncontradas = null;
        
        const respostaResultado = await fetch(`/api/provas/${provaId}/resultados?alunoId=${alunoId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (respostaResultado.ok) {
            const dadosResultado = await respostaResultado.json();
            if (dadosResultado.success && dadosResultado.resultados && dadosResultado.resultados.length > 0) {
                const resultadoAluno = dadosResultado.resultados.find(r => 
                    r.alunoId === alunoId || (r.userId && r.userId.toString() === alunoId)
                );
                
                if (resultadoAluno && resultadoAluno.respostas) {
                    respostasEncontradas = resultadoAluno.respostas;
                }
            }
        }
        
        if (!respostasEncontradas) {
            try {
                const respostaProvaRealizada = await fetch(`/api/provas/${provaId}/correcao`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                if (respostaProvaRealizada.ok) {
                    const dadosCorrecao = await respostaProvaRealizada.json();
                    if (dadosCorrecao.success && dadosCorrecao.alunos) {
                        const provaAluno = dadosCorrecao.alunos.find(a => a.alunoId === alunoId);
                        if (provaAluno && provaAluno.respostas) {
                            respostasEncontradas = provaAluno.respostas;
                        }
                    }
                }
            } catch (error) {
                console.warn('Não foi possível buscar na rota de correção:', error.message);
            }
        }
        
        if (!respostasEncontradas) {
            throw new Error('Não foi possível encontrar as respostas do aluno');
        }
        
        respostasAluno = respostasEncontradas;
        
        const provaCorrigidaHTML = criarHTMLProvaCorrigida(gabaritoProva, respostasAluno, alunoNome);
        
        document.getElementById('provaCorrigidaConteudo').innerHTML = provaCorrigidaHTML;
        
        console.log('✅ Prova corrigida gerada com sucesso');
        
    } catch (error) {
        console.error('❌ Erro ao gerar prova corrigida:', error);
        
        const errorHTML = `
            <div style="padding: 40px; text-align: center;">
                <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #ef4444; margin-bottom: 15px;"></i>
                <h3 style="color: #7f1d1d; margin-bottom: 10px;">Erro ao Gerar Prova Corrigida</h3>
                <p style="color: #6b7280; margin-bottom: 20px;">${error.message}</p>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button onclick="fecharModal('modalProvaCorrigida')" style="padding: 10px 20px; background: #4f46e5; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        Fechar
                    </button>
                    <button onclick="gerarProvaCorrigida('${provaParaCorrigir}', '${alunoParaCorrigir}', '${alunoNome || 'Aluno'}')" style="padding: 10px 20px; background: #f59e0b; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        Tentar Novamente
                    </button>
                </div>
            </div>
        `;
        
        document.getElementById('provaCorrigidaConteudo').innerHTML = errorHTML;
    }
};

function criarHTMLProvaCorrigida(gabarito, respostas, alunoNome) {
    let acertos = 0;
    const questoesCorrigidas = [];
    
    gabarito.questoes.forEach((questao, index) => {
        const respostaAluno = respostas[index];
        const respostaAlunoLetra = respostaAluno ? respostaAluno.toUpperCase().trim() : null;
        const respostaCorretaLetra = questao.respostaCorretaLetra;
        const isCorreta = respostaAlunoLetra === respostaCorretaLetra;
        
        if (isCorreta) acertos++;
        
        let textoRespostaAluno = 'Não respondida';
        if (respostaAlunoLetra) {
            const indiceResposta = respostaAlunoLetra.charCodeAt(0) - 65;
            if (questao.opcoes[indiceResposta]) {
                textoRespostaAluno = questao.opcoes[indiceResposta];
            } else {
                textoRespostaAluno = `Opção ${respostaAlunoLetra} (não encontrada)`;
            }
        }
        
        const textoRespostaCorreta = questao.opcoes[questao.respostaCorreta];
        
        questoesCorrigidas.push({
            numero: questao.numero,
            pergunta: questao.pergunta,
            respostaAluno: respostaAlunoLetra,
            textoRespostaAluno: textoRespostaAluno,
            respostaCorreta: respostaCorretaLetra,
            textoRespostaCorreta: textoRespostaCorreta,
            isCorreta: isCorreta,
            explicacao: questao.explicacao
        });
    });
    
    const totalQuestoes = gabarito.questoes.length;
    const porcentagemAcertos = ((acertos / totalQuestoes) * 100).toFixed(1);
    const notaCalculada = ((acertos / totalQuestoes) * 10).toFixed(1);
    
    let html = `
        <div class="correcao-stats">
            <div class="stat-item">
                <div class="stat-number">${alunoNome.split(' ')[0]}</div>
                <div class="stat-label">Aluno</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${acertos}/${totalQuestoes}</div>
                <div class="stat-label">Acertos</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${porcentagemAcertos}%</div>
                <div class="stat-label">Taxa de Acerto</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">${notaCalculada}</div>
                <div class="stat-label">Nota Calculada</div>
            </div>
        </div>
        
        <div style="margin-bottom: 20px;">
            <h4 style="color: #4b5563; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-list-check"></i> Correção Detalhada (${totalQuestoes} questões)
            </h4>
            <p style="color: #6b7280; font-size: 0.9rem; margin-bottom: 20px;">
                Comparação entre as respostas do aluno e o gabarito oficial da prova.
            </p>
        </div>
        
        <div id="questoesCorrigidas">
    `;
    
    questoesCorrigidas.forEach(q => {
        html += `
            <div class="resposta-item ${q.isCorreta ? 'correta' : 'incorreta'}">
                <div class="questao-numero">
                    <i class="fas ${q.isCorreta ? 'fa-check-circle' : 'fa-times-circle'}"></i>
                    Questão ${q.numero}
                    <span class="badge-correcao ${q.isCorreta ? 'badge-corrigido' : 'badge-erro'}" style="margin-left: auto;">
                        ${q.isCorreta ? 'Correta' : 'Incorreta'}
                    </span>
                </div>
                
                <div class="pergunta">${q.pergunta}</div>
                
                <div class="resposta-detalhes">
                    <div class="resposta-info">
                        <h5><i class="fas fa-user-graduate"></i> Resposta do Aluno</h5>
                        <div class="resposta-texto aluno">${q.textoRespostaAluno}</div>
                        <small style="color: #6b7280;">Opção selecionada: ${q.respostaAluno || 'Não respondida'}</small>
                    </div>
                    
                    <div class="resposta-info">
                        <h5><i class="fas fa-check-circle"></i> Resposta Correta</h5>
                        <div class="resposta-texto ${q.isCorreta ? 'correta' : 'incorreta'}">${q.textoRespostaCorreta}</div>
                        <small style="color: #6b7280;">Opção correta: ${q.respostaCorreta}</small>
                    </div>
                </div>
                
                ${q.explicacao ? `
                <div class="explicacao">
                    <h6><i class="fas fa-lightbulb"></i> Explicação</h6>
                    <p>${q.explicacao}</p>
                </div>
                ` : ''}
            </div>
        `;
    });
    
    html += `
        </div>
        
        <div class="correcao-actions">
            <button class="btn-imprimir-correcao" onclick="imprimirProvaCorrigida()">
                <i class="fas fa-print"></i> Imprimir Correção
            </button>
            <button class="btn-enviar-correcao" onclick="enviarProvaCorrigida()">
                <i class="fas fa-paper-plane"></i> Enviar para Aluno
            </button>
        </div>
    `;
    
    return html;
}

async function enviarProvaCorrigida() {
    if (!provaParaCorrigir || !alunoParaCorrigir) {
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', '❌ Nenhum aluno selecionado para enviar a correção', 'error');
        return;
    }
    
    try {
        const token = localStorage.getItem('auth_token');
        const confirmacao = await confirm('Enviar esta correção para o aluno? O aluno poderá visualizar a prova corrigida.');
        
        if (!confirmacao) return;
        
        let nota = 0;
        if (gabaritoProva && respostasAluno) {
            let acertos = 0;
            gabaritoProva.questoes.forEach((questao, index) => {
                const respostaAluno = respostasAluno[index];
                const respostaCorretaLetra = String.fromCharCode(65 + questao.respostaCorreta);
                
                if (respostaAluno && respostaAluno.toUpperCase().trim() === respostaCorretaLetra) {
                    acertos++;
                }
            });
            
            nota = (acertos / gabaritoProva.questoes.length) * 10;
        }
        
        const resposta = await fetch(`/api/professor/provas/${provaParaCorrigir}/corrigir`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                alunoId: alunoParaCorrigir,
                nota: nota.toFixed(2),
                liberarNota: true
            })
        });
        
        const dados = await resposta.json();
        
        if (dados.success) {
            mostrarAlerta('mostrarAlertaGeralMinhasProvas', `✅ Prova corrigida enviada para o aluno! Nota: ${nota.toFixed(2)}`, 'success');
            fecharModal('modalProvaCorrigida');
            
            setTimeout(() => {
                carregarProvasProfessor();
            }, 2000);
        } else {
            throw new Error(dados.error || 'Erro ao enviar correção');
        }
        
    } catch (error) {
        console.error('❌ Erro ao enviar prova corrigida:', error);
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', `❌ Erro ao enviar correção: ${error.message}`, 'error');
    }
}

function imprimirProvaCorrigida() {
    const modal = document.getElementById('modalProvaCorrigida');
    if (!modal) return;
    
    const printContent = document.getElementById('provaCorrigidaConteudo').innerHTML;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Prova Corrigida - EducaPleno</title>
            <style>
                @media print {
                    body { 
                        margin: 0; 
                        padding: 20px; 
                        font-family: Arial, sans-serif; 
                        font-size: 12px;
                    }
                    .no-print { display: none !important; }
                    .correcao-actions, .correcao-stats { 
                        background: #f8f9fa !important; 
                        color: #000 !important; 
                        padding: 15px;
                        border: 1px solid #ddd;
                        margin-bottom: 15px;
                    }
                    .resposta-item { 
                        page-break-inside: avoid; 
                        border: 1px solid #ddd !important; 
                        margin-bottom: 10px;
                        padding: 10px;
                        background: #fff !important;
                    }
                    .resposta-item.correta { border-left: 3px solid #28a745 !important; }
                    .resposta-item.incorreta { border-left: 3px solid #dc3545 !important; }
                    .badge-correcao { 
                        display: inline-block;
                        padding: 2px 8px;
                        border-radius: 10px;
                        font-size: 10px;
                        margin-left: 10px;
                    }
                    .badge-corrigido { background: #d4edda !important; color: #155724 !important; }
                    .badge-erro { background: #f8d7da !important; color: #721c24 !important; }
                    h3, h4, h5 { color: #000 !important; }
                    .explicacao { background: #f8f9fa !important; padding: 8px; }
                }
                body { font-family: Arial, sans-serif; }
                .header-print { 
                    text-align: center; 
                    margin-bottom: 20px; 
                    border-bottom: 2px solid #000; 
                    padding-bottom: 15px;
                }
                .info-aluno { 
                    display: flex; 
                    justify-content: space-between; 
                    margin-bottom: 15px;
                }
                .questao-corrigida { margin-bottom: 15px; }
                .resposta-comparacao { 
                    display: grid; 
                    grid-template-columns: 1fr 1fr; 
                    gap: 15px; 
                    margin-top: 10px;
                }
                @media (max-width: 768px) {
                    .resposta-comparacao { grid-template-columns: 1fr; }
                }
            </style>
        </head>
        <body>
            <div class="header-print">
                <h1>PROVA CORRIGIDA</h1>
                <h2>${gabaritoProva?.titulo || 'Prova'}</h2>
                <p>EducaPleno - ${new Date().toLocaleDateString('pt-BR')}</p>
            </div>
            
            ${printContent}
            
            <div style="text-align: center; margin-top: 30px; font-size: 10px; color: #666;">
                EducaPleno - Corrigido em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
    
    setTimeout(() => {
        printWindow.print();
        printWindow.onafterprint = function() {
            printWindow.close();
        };
    }, 500);
}

async function buscarResultadosProva(provaId) {
    try {
        const token = localStorage.getItem('auth_token');
        
        console.log(`📊 Buscando resultados da prova ${provaId}...`);
        
        const response = await fetch(`/api/provas/${provaId}/resultados`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            const resultadosUnicos = [];
            const alunosProcessados = new Set();
            
            data.resultados.forEach(resultado => {
                const alunoId = resultado.alunoId || resultado.userId;
                if (alunoId && !alunosProcessados.has(alunoId)) {
                    alunosProcessados.add(alunoId);
                    resultadosUnicos.push(resultado);
                }
            });
            
            console.log(`📈 Resultados encontrados: ${resultadosUnicos.length} alunos únicos`);
            
            return resultadosUnicos;
        } else {
            throw new Error(data.error || 'Erro ao buscar resultados');
        }
        
    } catch (error) {
        console.error('❌ Erro ao buscar resultados:', error);
        return [];
    }
}

// ============================================
// RESULTADOS GERAIS
// ============================================
let resultadosGerais = {
    turmas: [],
    alunos: [],
    disciplinas: []
};

window.mostrarTabResultados = function(tabId) {
    document.querySelectorAll('.tab-interna').forEach(tab => {
        tab.classList.remove('active');
    });
    
    event.currentTarget.classList.add('active');
    
    document.querySelectorAll('.conteudo-resultados').forEach(content => {
        content.style.display = 'none';
    });
    
    document.getElementById(`conteudo-${tabId}`).style.display = 'block';
};

async function carregarResultadosGerais() {
    try {
        const token = localStorage.getItem('auth_token');
        
        console.log('📊 Carregando resultados gerais...');
        
        const containerTurmas = document.getElementById('listaTurmasResultados');
        const containerAlunos = document.getElementById('listaAlunosResultados');
        const containerDisciplinas = document.getElementById('listaDisciplinasResultados');
        
        if (!containerTurmas || !containerAlunos || !containerDisciplinas) {
            console.warn('⚠️ Containers de resultados não encontrados no DOM');
            return;
        }
        
        containerTurmas.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: #4f46e5; margin-bottom: 15px;"></i>
                <p style="color: #6b7280;">Carregando resultados por turma...</p>
            </div>
        `;
        
        containerAlunos.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: #4f46e5; margin-bottom: 15px;"></i>
                <p style="color: #6b7280;">Carregando resultados por aluno...</p>
            </div>
        `;
        
        containerDisciplinas.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: #4f46e5; margin-bottom: 15px;"></i>
                <p style="color: #6b7280;">Carregando resultados por disciplina...</p>
            </div>
        `;
        
        const response = await fetch('/api/professor/resultados', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('📥 Dados recebidos:', data);
        
        if (data.success) {
            atualizarEstatisticasGerais(data.estatisticas || {});
            
            const resultados = data.resultados || [];
            
            window.resultadosGerais = {
                turmas: processarResultadosPorTurma(resultados),
                alunos: processarResultadosPorAluno(resultados),
                disciplinas: processarResultadosPorDisciplina(resultados)
            };
            
            console.log('✅ Dados armazenados globalmente:', window.resultadosGerais);
            
            atualizarListaTurmasResultados(window.resultadosGerais.turmas);
            atualizarListaAlunosResultados(window.resultadosGerais.alunos);
            atualizarListaDisciplinasResultados(window.resultadosGerais.disciplinas);
            
            preencherFiltros(window.resultadosGerais.turmas, window.resultadosGerais.disciplinas);
            
            configurarFiltrosResultados();
            
            console.log('✅ Resultados carregados com sucesso');
            
        } else {
            throw new Error(data.error || 'Erro ao carregar resultados');
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar resultados gerais:', error);
        
        const containers = ['listaTurmasResultados', 'listaAlunosResultados', 'listaDisciplinasResultados'];
        
        containers.forEach(containerId => {
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-exclamation-triangle" style="font-size: 3rem; margin-bottom: 15px; color: #ef4444;"></i>
                        <h3 style="color: #7f1d1d;">Erro ao carregar dados</h3>
                        <p style="color: #6b7280;">${error.message}</p>
                        <button onclick="carregarResultadosGerais()" style="
                            margin-top: 15px;
                            padding: 10px 20px;
                            background: #4f46e5;
                            color: white;
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                            font-weight: 600;
                        ">
                            <i class="fas fa-redo"></i> Tentar novamente
                        </button>
                    </div>
                `;
            }
        });
    }
}

async function abrirProvaCorrigida(provaId) {
    try {
        const token = localStorage.getItem('auth_token');
        
        console.log(`📝 Abrindo prova corrigida para prova ${provaId}`);
        
        const response = await fetch(`/api/provas/${provaId}/resultados`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Erro ao buscar resultados');
        }
        
        const resultados = data.resultados || [];
        
        if (resultados.length === 0) {
            mostrarAlerta('mostrarAlertaGeralMinhasProvas', '❌ Nenhum aluno realizou esta prova ainda', 'info');
            return;
        }
        
        let modal = document.getElementById('modalSelecionarAluno');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'modalSelecionarAluno';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header">
                        <h3 style="margin: 0; color: var(--gray-800); display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-user-check"></i> Selecionar Aluno para Correção
                        </h3>
                        <button class="modal-close" onclick="fecharModal('modalSelecionarAluno')">&times;</button>
                    </div>
                    <div id="listaAlunosCorrecao" style="max-height: 400px; overflow-y: auto; padding: 20px;">
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        
        const listaHTML = resultados.map(aluno => {
            const nota = aluno.nota !== null && aluno.nota !== undefined ? aluno.nota.toFixed(1) : 'Não corrigida';
            const status = aluno.notaLiberada ? 'Nota liberada' : 'Aguardando correção';
            const statusClass = aluno.notaLiberada ? 'badge-corrigido' : 'badge-pendente';
            
            return `
                <div style="padding: 15px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 600; color: #1f2937; margin-bottom: 5px;">${aluno.alunoNome}</div>
                        <div style="font-size: 0.85rem; color: #6b7280;">
                            ${aluno.alunoEmail || ''}
                            ${aluno.alunoMatricula ? ` • Matrícula: ${aluno.alunoMatricula}` : ''}
                        </div>
                        <div style="margin-top: 8px;">
                            <span class="badge-correcao ${statusClass}" style="font-size: 0.8rem;">${status}</span>
                            ${aluno.nota !== null ? `<span style="margin-left: 10px; font-weight: 600; color: ${aluno.nota >= 7 ? '#10b981' : aluno.nota >= 5 ? '#f59e0b' : '#ef4444'}">Nota: ${nota}</span>` : ''}
                        </div>
                    </div>
                    <div>
                        <button onclick="gerarProvaCorrigida('${provaId}', '${aluno.alunoId}', '${aluno.alunoNome.replace(/'/g, "\\'")}')" 
                                style="padding: 8px 16px; background: #f59e0b; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 5px; font-size: 0.9rem;">
                            <i class="fas fa-file-check"></i> Ver Correção
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        document.getElementById('listaAlunosCorrecao').innerHTML = listaHTML || '<p style="text-align: center; color: #6b7280; padding: 40px;">Nenhum aluno encontrado</p>';
        
        mostrarModal('modalSelecionarAluno');
        
    } catch (error) {
        console.error('❌ Erro ao abrir prova corrigida:', error);
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', `❌ Erro: ${error.message}`, 'error');
    }
}

async function liberarTodasNotas(provaId, provaTitulo) {
    try {
        const token = localStorage.getItem('auth_token');
        
        const resultados = await buscarResultadosProva(provaId);
        
        if (resultados.length === 0) {
            mostrarAlerta('mostrarAlertaGeralMinhasProvas', '❌ Nenhum aluno realizou esta prova ainda', 'info');
            return;
        }
        
        const confirmacao = await confirm(
            `Deseja liberar TODAS as notas da prova "${provaTitulo}"?\n\n` +
            `• ${resultados.length} aluno(s) realizaram a prova\n` +
            `• Esta ação enviará a prova corrigida para cada aluno`
        );
        
        if (!confirmacao) return;
        
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', `🔧 Liberando notas para ${resultados.length} aluno(s)...`, 'info');
        
        const response = await fetch(`/api/provas/${provaId}/liberar-notas-todos`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const alunosProcessados = data.alunosProcessados || resultados.length;
            mostrarAlerta('mostrarAlertaGeralMinhasProvas', 
                `✅ Notas liberadas para ${alunosProcessados} aluno(s)! (Correções enviadas)`, 
                'success'
            );
            
            setTimeout(() => {
                carregarProvasProfessor();
            }, 2000);
            
        } else {
            throw new Error(data.error || 'Erro ao liberar notas');
        }
        
    } catch (error) {
        console.error('❌ Erro ao liberar notas:', error);
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', `❌ Erro: ${error.message}`, 'error');
    }
}

// ============================================
// EXCLUIR PROVA
// ============================================
let provaParaExcluir = null;

window.solicitarExclusaoProva = function(provaId, provaTitulo) {
    provaParaExcluir = provaId;
    
    let modal = document.getElementById('modalExcluirProva');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'modalExcluirProva';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <div class="modal-header">
                    <h3 style="margin: 0; color: var(--gray-800);">
                        <i class="fas fa-exclamation-triangle"></i> Excluir Prova
                    </h3>
                    <button class="modal-close" onclick="fecharModal('modalExcluirProva')">&times;</button>
                </div>
                <div id="modalExcluirProvaConteudo" style="margin: 1.5rem 0; line-height: 1.6;">
                </div>
                <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
                    <button class="btn btn-danger" onclick="confirmarExclusaoProva()" style="flex: 1;">
                        <i class="fas fa-trash"></i> Excluir Prova
                    </button>
                    <button class="btn" onclick="fecharModal('modalExcluirProva')" style="flex: 1; background: var(--gray-200); color: var(--gray-700);">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    document.getElementById('modalExcluirProvaConteudo').innerHTML = `
        <p>Tem certeza que deseja excluir a prova <strong>"${provaTitulo}"</strong>?</p>
        <div style="margin-top: 15px; padding: 15px; background: #fef2f2; border-radius: 8px; border-left: 4px solid #ef4444;">
            <i class="fas fa-exclamation-circle" style="color: #ef4444; margin-right: 10px;"></i>
            <div style="display: inline-block; vertical-align: middle;">
                <strong style="color: #7f1d1d;">Atenção:</strong> Esta ação não pode ser desfeita.
                <ul style="margin: 10px 0 0 20px; color: #7f1d1d;">
                    <li>Todos os dados da prova serão permanentemente removidos</li>
                    <li>Os resultados dos alunos serão perdidos</li>
                    <li>As questões associadas serão excluídas</li>
                    <li>Os alunos não poderão mais acessar esta prova</li>
                </ul>
            </div>
        </div>
    `;
    
    mostrarModal('modalExcluirProva');
};

async function confirmarExclusaoProva() {
    if (!provaParaExcluir) {
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', '❌ Nenhuma prova selecionada para exclusão', 'error');
        return;
    }
    
    try {
        const token = localStorage.getItem('auth_token');
        
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', '🗑️ Excluindo prova...', 'info');
        
        const response = await fetch(`/api/professor/provas/${provaParaExcluir}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlerta('mostrarAlertaGeralMinhasProvas', `✅ ${data.message || 'Prova excluída com sucesso!'}`, 'success');
            fecharModal('modalExcluirProva');
            
            setTimeout(() => {
                carregarProvasProfessor();
            }, 2000);
            
        } else {
            throw new Error(data.error || 'Erro ao excluir prova');
        }
        
    } catch (error) {
        console.error('❌ Erro ao excluir prova:', error);
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', `❌ Erro: ${error.message}`, 'error');
    }
    
    provaParaExcluir = null;
}

async function liberarNotaAluno(provaId, alunoId, alunoNome, notaAtual) {
    try {
        const token = localStorage.getItem('auth_token');
        
        const confirmacao = await confirm(`Liberar nota para o aluno ${alunoNome}?\nNota: ${notaAtual !== undefined ? notaAtual.toFixed(1) : 'N/A'}`);
        
        if (!confirmacao) return;
        
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', `🔧 Liberando nota para ${alunoNome}...`, 'info');
        
        const response = await fetch(`/api/professor/provas/${provaId}/corrigir`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                alunoId: alunoId,
                nota: notaAtual || 0,
                liberarNota: true
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlerta('mostrarAlertaGeralMinhasProvas', `✅ Nota liberada para ${alunoNome}!`, 'success');
            
            setTimeout(() => {
                carregarProvasProfessor();
            }, 2000);
        } else {
            throw new Error(data.error || 'Erro ao liberar nota');
        }
        
    } catch (error) {
        console.error('❌ Erro ao liberar nota:', error);
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', `❌ Erro: ${error.message}`, 'error');
    }
}

function processarResultadosPorTurma(resultados) {
    const turmasMap = new Map();
    
    resultados.forEach(resultado => {
        const turmaId = resultado.turmaId || 'sem-turma';
        const turmaNome = resultado.turmaNome || 'Turma sem nome';
        const turmaDisciplina = resultado.turmaDisciplina || 'Geral';
        const periodoProva = resultado.periodo || '1';
        
        if (!turmasMap.has(turmaId)) {
            turmasMap.set(turmaId, {
                id: turmaId,
                nome: turmaNome,
                disciplina: turmaDisciplina,
                periodo: periodoProva,
                alunos: new Set(),
                provas: new Set(),
                notas: [],
                acertos: 0,
                totalQuestoes: 0
            });
        }
        
        const turma = turmasMap.get(turmaId);
        
        if (resultado.alunoId) turma.alunos.add(resultado.alunoId);
        if (resultado.provaId) turma.provas.add(resultado.provaId);
        
        if (resultado.nota !== undefined && resultado.nota !== null) {
            turma.notas.push(resultado.nota);
            turma.acertos += resultado.acertos || 0;
            turma.totalQuestoes += resultado.total || 0;
        }
    });
    
    return Array.from(turmasMap.values()).map(turma => ({
        ...turma,
        totalAlunos: turma.alunos.size,
        totalProvas: turma.provas.size,
        mediaNotas: turma.notas.length > 0 
            ? parseFloat((turma.notas.reduce((a, b) => a + b, 0) / turma.notas.length).toFixed(1))
            : 0,
        taxaAcerto: turma.totalQuestoes > 0 
            ? parseFloat(((turma.acertos / turma.totalQuestoes) * 100).toFixed(1))
            : 0
    }));
}

async function buscarNotasAlunos(filtros) {
    try {
        console.log('🔍 Buscando notas dos alunos com filtros:', filtros);
        
        const token = localStorage.getItem('auth_token');
        let url = '/api/professor/resultados/notas-alunos';
        
        const params = new URLSearchParams();
        if (filtros.turma) params.append('turmaId', filtros.turma);
        if (filtros.disciplina) params.append('disciplina', filtros.disciplina);
        if (filtros.periodo) params.append('periodo', filtros.periodo);
        if (filtros.status) params.append('status', filtros.status);
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        console.log('📡 URL da requisição:', url);
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            console.log(`✅ ${data.resultados.length} resultados encontrados`);
            return data.resultados;
        } else {
            throw new Error(data.error || 'Erro ao buscar notas');
        }
        
    } catch (error) {
        console.error('❌ Erro ao buscar notas:', error);
        mostrarAlerta('mostrarAlertaGeralResultados', `❌ Erro ao carregar notas: ${error.message}`, 'error');
        return [];
    }
}

// ============================================
// EXPORTAR NOTAS DOS ALUNOS (VERSÃO CORRETA COM PERÍODO)
// ============================================
async function exportarNotasAlunosExcel() {
    try {
        console.log('%c📊 EXPORTANDO NOTAS DOS ALUNOS', 'font-size: 14px; font-weight: bold; color: #10b981;');
        
        const filtroStatus = document.getElementById('filtroStatus');
        const statusSelecionado = filtroStatus ? filtroStatus.value : 'todos';
        const statusTexto = filtroStatus && filtroStatus.selectedIndex >= 0 ? 
            filtroStatus.options[filtroStatus.selectedIndex]?.text.replace(/[▶️✅✏️❌📋]/g, '').trim() : 
            'Todos';
        
        const filtroDificuldade = document.getElementById('filtroDificuldade');
        const dificuldadeSelecionada = filtroDificuldade ? filtroDificuldade.value : 'todas';
        const dificuldadeTexto = filtroDificuldade && filtroDificuldade.selectedIndex >= 0 ? 
            filtroDificuldade.options[filtroDificuldade.selectedIndex]?.text.replace(/[⚖️🟢🟡🔴]/g, '').trim() : 
            'Todas';
        
        const filtroTipo = document.getElementById('filtroTipo');
        const tipoSelecionado = filtroTipo ? filtroTipo.value : 'todos';
        const tipoTexto = filtroTipo && filtroTipo.selectedIndex >= 0 ? 
            filtroTipo.options[filtroTipo.selectedIndex]?.text.replace(/[📚📄🎯♿]/g, '').trim() : 
            'Todos';
        
        const filtroPeriodo = document.getElementById('filtroPeriodoProvas');
        const periodoSelecionado = filtroPeriodo ? filtroPeriodo.value : 'todos';
        let periodoTexto = 'Todos os períodos';
        let periodoSelecionadoFlag = false;
        
        if (filtroPeriodo && filtroPeriodo.selectedIndex >= 0) {
            const selectedOption = filtroPeriodo.options[filtroPeriodo.selectedIndex];
            periodoTexto = selectedOption ? selectedOption.text.replace('📅', '').trim() : 'Todos os períodos';
            periodoSelecionadoFlag = periodoSelecionado && periodoSelecionado !== 'todos';
        }
        
        const filtroTurma = document.getElementById('filtroTurmaProvas');
        let turmaId = '';
        let turmaNome = 'Todas as turmas';
        
        if (filtroTurma && filtroTurma.selectedIndex >= 0) {
            turmaId = filtroTurma.value;
            const selectedOption = filtroTurma.options[filtroTurma.selectedIndex];
            turmaNome = selectedOption ? selectedOption.text.replace('🏫', '').trim() : 'Todas as turmas';
        }
        
        const buscaInput = document.getElementById('buscaProva');
        const buscaTexto = buscaInput ? buscaInput.value.toLowerCase() : '';
        
        console.log('📋 FILTROS APLICADOS:', {
            status: statusSelecionado,
            dificuldade: dificuldadeSelecionada,
            tipo: tipoSelecionado,
            periodo: periodoSelecionado,
            turmaId: turmaId || 'todas',
            turmaNome: turmaNome,
            busca: buscaTexto || 'vazio'
        });
        
        const token = localStorage.getItem('auth_token');
        if (!token) {
            throw new Error('Token de autenticação não encontrado. Faça login novamente.');
        }
        
        mostrarAlerta('mostrarAlertaGeralResultados', '🔍 Buscando provas...', 'info');
        
        const responseProvas = await fetch('/api/professor/provas', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!responseProvas.ok) {
            throw new Error(`Erro ${responseProvas.status} ao buscar provas`);
        }
        
        const dataProvas = await responseProvas.json();
        let provas = dataProvas.provas || [];
        
        if (turmaId && turmaId !== 'todas') {
            provas = provas.filter(p => p.turma?.id === turmaId);
        }
        
        if (dificuldadeSelecionada !== 'todas') {
            provas = provas.filter(p => p.dificuldade === dificuldadeSelecionada);
        }
        
        if (tipoSelecionado !== 'todos') {
            provas = provas.filter(p => {
                const tipoProva = p.tipoProva || (p.adaptada ? 'adaptada' : 'simples');
                if (tipoSelecionado === 'adaptada') return tipoProva === 'adaptada' || p.adaptada === true;
                return tipoProva === tipoSelecionado;
            });
        }
        
        if (periodoSelecionado !== 'todos') {
            provas = provas.filter(p => 
                p.periodo === periodoSelecionado || 
                p.periodo?.toString() === periodoSelecionado
            );
        }
        
        console.log(`📚 Total de provas após filtros: ${provas.length}`);
        
        if (provas.length === 0) {
            mostrarAlerta('mostrarAlertaGeralResultados', '⚠️ Nenhuma prova encontrada com os filtros selecionados', 'info');
            return;
        }
        
        mostrarAlerta('mostrarAlertaGeralResultados', `🔍 Buscando resultados dos alunos...`, 'info');
        
        let todosResultados = [];
        
        for (const prova of provas) {
            try {
                const response = await fetch(`/api/provas/${prova.id}/resultados`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    
                    if (data.success && data.resultados) {
                        console.log(`   📝 Prova "${prova.titulo}" (Período: ${prova.periodo || '1'}): ${data.resultados.length} resultados`);
                        
                        const resultadosComInfo = data.resultados.map(r => ({
                            alunoId: r.alunoId,
                            alunoNome: r.alunoNome || r.userNome || 'Aluno',
                            alunoMatricula: r.alunoMatricula || 'N/A',
                            alunoEmail: r.alunoEmail || 'N/A',
                            provaId: prova.id,
                            provaTitulo: prova.titulo,
                            provaPeriodo: prova.periodo || '1',
                            provaConteudo: prova.conteudo,
                            provaDificuldade: prova.dificuldade,
                            turmaId: prova.turma?.id,
                            turmaNome: prova.turma?.nome,
                            turmaDisciplina: prova.turma?.disciplina,
                            nota: r.nota,
                            acertos: r.acertos,
                            total: r.total,
                            status: r.status || (r.notaLiberada ? 'Concluído' : (r.cancelada ? 'Cancelado' : 'Pendente')),
                            notaLiberada: r.notaLiberada || false,
                            dataRealizacao: r.dataRealizacao || r.createdAt,
                            cancelada: r.cancelada || false
                        }));
                        
                        todosResultados.push(...resultadosComInfo);
                    }
                }
            } catch (error) {
                console.warn(`⚠️ Erro ao buscar resultados da prova ${prova.id}:`, error.message);
            }
        }
        
        console.log(`📊 TOTAL DE RESULTADOS ENCONTRADOS: ${todosResultados.length}`);
        
        if (todosResultados.length === 0) {
            mostrarAlerta('mostrarAlertaGeralResultados', '⚠️ Nenhum resultado encontrado. Os alunos ainda não realizaram as provas.', 'info');
            return;
        }
        
        const alunosMap = new Map();
        
        todosResultados.forEach(item => {
            const alunoId = item.alunoId;
            if (!alunoId) return;
            
            if (!alunosMap.has(alunoId)) {
                alunosMap.set(alunoId, {
                    id: alunoId,
                    nome: item.alunoNome,
                    matricula: item.alunoMatricula,
                    email: item.alunoEmail,
                    turma: item.turmaNome || turmaNome,
                    disciplina: item.turmaDisciplina || 'N/A',
                    provas: [],
                    somaNotas: 0,
                    quantidadeNotas: 0
                });
            }
            
            const aluno = alunosMap.get(alunoId);
            
            aluno.provas.push({
                provaTitulo: item.provaTitulo,
                provaPeriodo: item.provaPeriodo,
                data: item.dataRealizacao ? new Date(item.dataRealizacao).toLocaleDateString('pt-BR') : 'N/A',
                nota: item.nota !== null && item.nota !== undefined ? Number(item.nota).toFixed(1) : 'N/A',
                acertos: item.acertos || 0,
                total: item.total || 0,
                status: item.status,
                notaLiberada: item.notaLiberada ? 'Sim' : 'Não',
                cancelada: item.cancelada ? 'Sim' : 'Não'
            });
            
            if (item.nota !== null && item.nota !== undefined) {
                aluno.somaNotas += item.nota;
                aluno.quantidadeNotas++;
            }
        });
        
        const alunosArray = Array.from(alunosMap.values()).map(aluno => {
            const media = aluno.quantidadeNotas > 0 ? 
                (aluno.somaNotas / aluno.quantidadeNotas).toFixed(1) : 'N/A';
            
            let statusGeral = 'N/A';
            if (media !== 'N/A') {
                const mediaNum = parseFloat(media);
                statusGeral = mediaNum >= 7 ? 'Aprovado' : 
                            (mediaNum >= 5 ? 'Recuperação' : 'Reprovado');
            }
            
            return {
                nome: aluno.nome,
                matricula: aluno.matricula,
                email: aluno.email,
                turma: aluno.turma,
                disciplina: aluno.disciplina,
                totalProvas: aluno.provas.length,
                media: media,
                statusGeral: statusGeral,
                provas: aluno.provas
            };
        });
        
        const dadosResumo = alunosArray.map((aluno, index) => ({
            '#': index + 1,
            'Aluno': aluno.nome,
            'Matrícula': aluno.matricula,
            'Email': aluno.email,
            'Turma': aluno.turma,
            'Disciplina': aluno.disciplina,
            'Total Provas': aluno.totalProvas,
            'Média': aluno.media,
            'Status': aluno.statusGeral
        }));
        
        const dadosDetalhados = [];
        alunosArray.forEach(aluno => {
            aluno.provas.forEach(prova => {
                dadosDetalhados.push({
                    'Aluno': aluno.nome,
                    'Matrícula': aluno.matricula,
                    'Turma': aluno.turma,
                    'Disciplina': aluno.disciplina,
                    'Prova': prova.provaTitulo,
                    'Período': prova.provaPeriodo ? prova.provaPeriodo + 'º' : '1º',
                    'Data': prova.data,
                    'Nota': prova.nota,
                    'Acertos': `${prova.acertos}/${prova.total}`,
                    'Status': prova.status,
                    'Nota Liberada': prova.notaLiberada,
                    'Cancelada': prova.cancelada
                });
            });
        });
        
        const totalAlunos = alunosArray.length;
        const totalProvas = provas.length;
        const totalResultados = todosResultados.length;
        
        const notasValidas = todosResultados.filter(r => r.nota !== null && r.nota !== undefined);
        const mediaGeral = notasValidas.length > 0 ? 
            (notasValidas.reduce((acc, r) => acc + r.nota, 0) / notasValidas.length).toFixed(1) : 'N/A';
        
        const aprovados = alunosArray.filter(a => a.media !== 'N/A' && parseFloat(a.media) >= 7).length;
        const recuperacao = alunosArray.filter(a => a.media !== 'N/A' && parseFloat(a.media) >= 5 && parseFloat(a.media) < 7).length;
        const reprovados = alunosArray.filter(a => a.media !== 'N/A' && parseFloat(a.media) < 5).length;
        
        const estatisticas = [
            ['📊 ESTATÍSTICAS GERAIS'],
            ['Descrição', 'Valor'],
            ['Total de Alunos', totalAlunos],
            ['Total de Provas', totalProvas],
            ['Total de Resultados', totalResultados],
            ['Média Geral', mediaGeral],
            ['Período Selecionado', periodoTexto],
            [''],
            ['📈 DISTRIBUIÇÃO DE DESEMPENHO'],
            ['Situação', 'Quantidade', 'Percentual'],
            ['Aprovados (≥ 7.0)', aprovados, totalAlunos > 0 ? ((aprovados/totalAlunos)*100).toFixed(1) + '%' : '0%'],
            ['Recuperação (5.0 - 6.9)', recuperacao, totalAlunos > 0 ? ((recuperacao/totalAlunos)*100).toFixed(1) + '%' : '0%'],
            ['Reprovados (< 5.0)', reprovados, totalAlunos > 0 ? ((reprovados/totalAlunos)*100).toFixed(1) + '%' : '0%']
        ];
        
        if (typeof XLSX === 'undefined') {
            mostrarAlerta('mostrarAlertaGeralResultados', '⚠️ Carregando biblioteca do Excel...', 'info');
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
            script.onload = () => {
                mostrarAlerta('mostrarAlertaGeralResultados', '✅ Biblioteca carregada! Clique novamente.', 'success');
            };
            document.head.appendChild(script);
            return;
        }
        
        const wb = XLSX.utils.book_new();
        
        const wsResumo = XLSX.utils.json_to_sheet(dadosResumo);
        const wsDetalhes = XLSX.utils.json_to_sheet(dadosDetalhados);
        const wsEstatisticas = XLSX.utils.aoa_to_sheet(estatisticas);
        
        wsResumo['!cols'] = [
            { wch: 5 },
            { wch: 30 },
            { wch: 15 },
            { wch: 30 },
            { wch: 25 },
            { wch: 20 },
            { wch: 12 },
            { wch: 8 },
            { wch: 15 }
        ];
        
        wsDetalhes['!cols'] = [
            { wch: 30 },
            { wch: 15 },
            { wch: 25 },
            { wch: 20 },
            { wch: 40 },
            { wch: 10 },
            { wch: 15 },
            { wch: 8 },
            { wch: 12 },
            { wch: 15 },
            { wch: 15 },
            { wch: 10 }
        ];
        
        XLSX.utils.book_append_sheet(wb, wsEstatisticas, 'Estatísticas');
        XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo por Aluno');
        XLSX.utils.book_append_sheet(wb, wsDetalhes, 'Detalhamento');
        
        const dataAtual = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
        const periodoArquivo = periodoSelecionadoFlag ? `-periodo-${periodoSelecionado}` : '';
        const nomeArquivo = `notas-${turmaNome.replace(/\s+/g, '-').toLowerCase()}${periodoArquivo}-${dataAtual}.xlsx`;
        
        XLSX.writeFile(wb, nomeArquivo);
        
        mostrarAlerta('mostrarAlertaGeralResultados', 
            `✅ Relatório gerado com sucesso!\n` +
            `📊 ${totalAlunos} alunos • ${totalResultados} notas\n` +
            `📁 Período: ${periodoTexto}\n` +
            `📁 ${nomeArquivo}`, 
            'success');
        
        console.log('✅ Exportação concluída:', {
            alunos: totalAlunos,
            resultados: totalResultados,
            periodo: periodoTexto,
            mediaGeral: mediaGeral
        });
        
    } catch (error) {
        console.error('❌ Erro na exportação:', error);
        mostrarAlerta('mostrarAlertaGeralResultados', `❌ Erro ao exportar: ${error.message}`, 'error');
    }
}

function processarResultadosPorAluno(resultados) {
    const alunosMap = new Map();
    
    resultados.forEach(resultado => {
        const alunoId = resultado.alunoId || resultado.userId;
        if (!alunoId) return;

        const periodoProva = resultado.periodo || '1';
        
        if (!alunosMap.has(alunoId)) {
            alunosMap.set(alunoId, {
                id: alunoId,
                nome: resultado.alunoNome || 'Aluno',
                matricula: resultado.alunoMatricula || '',
                email: resultado.alunoEmail || '',
                periodo: periodoProva,
                turmas: new Set(),
                provas: new Set(),
                notas: [],
                acertos: 0,
                totalQuestoes: 0
            });
        }
        
        const aluno = alunosMap.get(alunoId);
        
        if (resultado.turmaNome) aluno.turmas.add(resultado.turmaNome);
        if (resultado.provaId) aluno.provas.add(resultado.provaId);
        
        if (resultado.nota !== undefined && resultado.nota !== null) {
            aluno.notas.push(resultado.nota);
            aluno.acertos += resultado.acertos || 0;
            aluno.totalQuestoes += resultado.total || 0;
        }
    });
    
    return Array.from(alunosMap.values()).map(aluno => ({
        ...aluno,
        totalTurmas: aluno.turmas.size,
        totalProvas: aluno.provas.size,
        mediaNotas: aluno.notas.length > 0 
            ? parseFloat((aluno.notas.reduce((a, b) => a + b, 0) / aluno.notas.length).toFixed(1))
            : 0,
        taxaAcerto: aluno.totalQuestoes > 0 
            ? parseFloat(((aluno.acertos / aluno.totalQuestoes) * 100).toFixed(1))
            : 0
    })).sort((a, b) => b.mediaNotas - a.mediaNotas);
}

function processarResultadosPorDisciplina(resultados) {
    const disciplinasMap = new Map();
    
    resultados.forEach(resultado => {
        const disciplina = resultado.disciplina || resultado.turmaDisciplina || 'Geral';
        const periodoProva = resultado.periodo || '1';
        
        if (!disciplinasMap.has(disciplina)) {
            disciplinasMap.set(disciplina, {
                nome: disciplina,
                periodo: periodoProva,
                turmas: new Set(),
                alunos: new Set(),
                provas: new Set(),
                notas: [],
                acertos: 0,
                totalQuestoes: 0
            });
        }
        
        const disc = disciplinasMap.get(disciplina);
        
        if (resultado.turmaNome) disc.turmas.add(resultado.turmaNome);
        if (resultado.alunoId) disc.alunos.add(resultado.alunoId);
        if (resultado.provaId) disc.provas.add(resultado.provaId);
        
        if (resultado.nota !== undefined && resultado.nota !== null) {
            disc.notas.push(resultado.nota);
            disc.acertos += resultado.acertos || 0;
            disc.totalQuestoes += resultado.total || 0;
        }
    });
    
    return Array.from(disciplinasMap.values()).map(disc => ({
        ...disc,
        totalTurmas: disc.turmas.size,
        totalAlunos: disc.alunos.size,
        totalProvas: disc.provas.size,
        mediaNotas: disc.notas.length > 0 
            ? parseFloat((disc.notas.reduce((a, b) => a + b, 0) / disc.notas.length).toFixed(1))
            : 0,
        taxaAcerto: disc.totalQuestoes > 0 
            ? parseFloat(((disc.acertos / disc.totalQuestoes) * 100).toFixed(1))
            : 0
    })).sort((a, b) => b.mediaNotas - a.mediaNotas);
}

function atualizarEstatisticasGerais(estatisticas) {
    const totalAlunos = document.getElementById('statTotalAlunos');
    const totalProvas = document.getElementById('statTotalProvas');
    const mediaGeral = document.getElementById('statMediaGeral');
    const taxaConclusao = document.getElementById('statTaxaConclusao');
    
    if (totalAlunos) totalAlunos.textContent = estatisticas.totalAlunos || 0;
    if (totalProvas) totalProvas.textContent = estatisticas.totalProvas || 0;
    if (mediaGeral) mediaGeral.textContent = estatisticas.mediaGeral || '0.0';
    if (taxaConclusao) taxaConclusao.textContent = (estatisticas.taxaConclusao || '0') + '%';
}

function preencherFiltros(turmas, disciplinas) {
    const filtroTurma = document.getElementById('filtroTurma');
    const filtroDisciplina = document.getElementById('filtroDisciplina');
    
    if (filtroTurma) {
        filtroTurma.innerHTML = '<option value="">Todas as turmas</option>';
        turmas.forEach(turma => {
            const option = document.createElement('option');
            option.value = turma.nome;
            option.textContent = turma.nome;
            filtroTurma.appendChild(option);
        });
    }
    
    if (filtroDisciplina) {
        filtroDisciplina.innerHTML = '<option value="">Todas as disciplinas</option>';
        disciplinas.forEach(disc => {
            const option = document.createElement('option');
            option.value = disc.nome;
            option.textContent = disc.nome;
            filtroDisciplina.appendChild(option);
        });
    }
}

window.filtrarResultados = function() {
    console.log('🔍 Aplicando filtros nos resultados...');
    
    const filtroTurma = document.getElementById('filtroTurma')?.value || '';
    const filtroDisciplina = document.getElementById('filtroDisciplina')?.value || '';
    const filtroPeriodo = document.getElementById('filtroPeriodoResultados')?.value || '';
    
    console.log('📊 Filtros selecionados:', { 
        turma: filtroTurma || 'Todas', 
        disciplina: filtroDisciplina || 'Todas',
        periodo: filtroPeriodo || 'Todos'
    });
    
    if (!window.resultadosGerais || !window.resultadosGerais.turmas) {
        console.log('⚠️ Dados não encontrados, recarregando...');
        carregarResultadosGerais();
        return;
    }
    
    let turmasFiltradas = window.resultadosGerais.turmas;
    let alunosFiltrados = window.resultadosGerais.alunos;
    let disciplinasFiltradas = window.resultadosGerais.disciplinas;
    
    if (filtroTurma) {
        turmasFiltradas = turmasFiltradas.filter(t => t.nome === filtroTurma);
        
        alunosFiltrados = alunosFiltrados.filter(a => 
            a.turmas && Array.from(a.turmas).includes(filtroTurma)
        );
        
        disciplinasFiltradas = disciplinasFiltradas.filter(d => 
            d.turmas && Array.from(d.turmas).includes(filtroTurma)
        );
    }
    
    if (filtroDisciplina && filtroDisciplina !== 'Todas' && filtroDisciplina !== '') {
        turmasFiltradas = turmasFiltradas.filter(t => t.disciplina === filtroDisciplina);
        
        if (turmasFiltradas.length > 0) {
            const turmasNomes = new Set(turmasFiltradas.map(t => t.nome));
            alunosFiltrados = alunosFiltrados.filter(a => 
                a.turmas && Array.from(a.turmas).some(turma => turmasNomes.has(turma))
            );
        } else {
            alunosFiltrados = [];
        }
        
        disciplinasFiltradas = disciplinasFiltradas.filter(d => d.nome === filtroDisciplina);
    }
    
    if (filtroPeriodo) {
        turmasFiltradas = turmasFiltradas.filter(t => 
            t.periodo === filtroPeriodo || t.periodo?.toString() === filtroPeriodo
        );
        
        alunosFiltrados = alunosFiltrados.filter(a => 
            a.periodo === filtroPeriodo || a.periodo?.toString() === filtroPeriodo
        );
        
        disciplinasFiltradas = disciplinasFiltradas.filter(d => 
            d.periodo === filtroPeriodo || d.periodo?.toString() === filtroPeriodo
        );
    }
    
    console.log(`✅ Mostrando ${turmasFiltradas.length} turmas, ${alunosFiltrados.length} alunos, ${disciplinasFiltradas.length} disciplinas`);
    
    if (typeof atualizarListaTurmasResultados === 'function') {
        atualizarListaTurmasResultados(turmasFiltradas);
    }
    if (typeof atualizarListaAlunosResultados === 'function') {
        atualizarListaAlunosResultados(alunosFiltrados);
    }
    if (typeof atualizarListaDisciplinasResultados === 'function') {
        atualizarListaDisciplinasResultados(disciplinasFiltradas);
    }
};

window.filtrarAlunos = function() {
    const busca = document.getElementById('buscaAluno')?.value.toLowerCase() || '';
    console.log('🔍 Buscando alunos:', busca);
    
    if (!window.resultadosGerais || !window.resultadosGerais.alunos) return;
    
    if (!busca) {
        window.filtrarResultados();
        return;
    }
    
    const filtroTurma = document.getElementById('filtroTurma')?.value || '';
    let alunosBase = window.resultadosGerais.alunos;
    
    if (filtroTurma) {
        alunosBase = alunosBase.filter(a => 
            a.turmas && Array.from(a.turmas).includes(filtroTurma)
        );
    }
    
    const alunosFiltrados = alunosBase.filter(a => 
        a.nome.toLowerCase().includes(busca) || 
        (a.matricula && a.matricula.toLowerCase().includes(busca))
    );
    
    if (typeof atualizarListaAlunosResultados === 'function') {
        atualizarListaAlunosResultados(alunosFiltrados);
    }
};

function configurarFiltrosResultados() {
    console.log('🔧 Configurando event listeners dos filtros...');
    
    const filtroTurma = document.getElementById('filtroTurma');
    const filtroDisciplina = document.getElementById('filtroDisciplina');
    const filtroPeriodo = document.getElementById('filtroPeriodo');
    const buscaAluno = document.getElementById('buscaAluno');
    
    if (filtroTurma) {
        filtroTurma.removeEventListener('change', window.filtrarResultados);
        filtroTurma.addEventListener('change', window.filtrarResultados);
    }
    
    if (filtroDisciplina) {
        filtroDisciplina.removeEventListener('change', window.filtrarResultados);
        filtroDisciplina.addEventListener('change', window.filtrarResultados);
    }
    
    if (filtroPeriodo) {
        filtroPeriodo.removeEventListener('change', window.filtrarResultados);
        filtroPeriodo.addEventListener('change', window.filtrarResultados);
    }
    
    if (buscaAluno) {
        buscaAluno.removeEventListener('keyup', window.filtrarAlunos);
        buscaAluno.addEventListener('keyup', window.filtrarAlunos);
    }
    
    console.log('✅ Listeners configurados');
}

function atualizarListaTurmasResultados(turmas) {
    const container = document.getElementById('listaTurmasResultados');
    if (!container) return;
    
    if (!turmas || turmas.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-school" style="font-size: 3rem; margin-bottom: 15px;"></i>
                <h3>Nenhum resultado encontrado</h3>
                <p>Não há dados de desempenho para turmas.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = turmas.map(turma => `
        <div class="desempenho-card" style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 15px; box-shadow: 0 3px 10px rgba(0,0,0,0.08); border-left: 4px solid #4f46e5;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                <div>
                    <h4 style="margin: 0; color: #1f2937;">${turma.nome}</h4>
                    <p style="margin: 5px 0; color: #6b7280; font-size: 0.9rem;">${turma.disciplina}</p>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: #4f46e5;">${turma.mediaNotas}</div>
                    <small style="color: #6b7280;">Média</small>
                </div>
            </div>
            
            <div style="margin: 15px 0;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span style="font-size: 0.9rem; color: #6b7280;">Taxa de acerto</span>
                    <span style="font-weight: 600; color: #4f46e5;">${turma.taxaAcerto}%</span>
                </div>
                <div style="height: 10px; background: #e5e7eb; border-radius: 5px; overflow: hidden;">
                    <div style="height: 100%; background: linear-gradient(90deg, #4f46e5, #7c3aed); width: ${turma.taxaAcerto}%"></div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 0.9rem; color: #6b7280;">
                <div style="text-align: center;">
                    <div style="font-weight: 600; color: #4f46e5;">${turma.totalAlunos}</div>
                    <div>Alunos</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-weight: 600; color: #10b981;">${turma.totalProvas}</div>
                    <div>Provas</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-weight: 600; color: ${turma.mediaNotas >= 7 ? '#10b981' : turma.mediaNotas >= 5 ? '#f59e0b' : '#ef4444'}">
                        ${turma.mediaNotas >= 7 ? 'Bom' : turma.mediaNotas >= 5 ? 'Médio' : 'Baixo'}
                    </div>
                    <div>Desempenho</div>
                </div>
            </div>
        </div>
    `).join('');
}

function atualizarListaAlunosResultados(alunos) {
    const container = document.getElementById('listaAlunosResultados');
    if (!container) return;
    
    if (!alunos || alunos.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-user-graduate" style="font-size: 3rem; margin-bottom: 15px;"></i>
                <h3>Nenhum aluno encontrado</h3>
                <p>Não há dados de desempenho para alunos.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = alunos.map(aluno => `
        <div class="desempenho-card" style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 15px; box-shadow: 0 3px 10px rgba(0,0,0,0.08); border-left: 4px solid #4f46e5;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                <div>
                    <h4 style="margin: 0; color: #1f2937;">${aluno.nome}</h4>
                    <p style="margin: 5px 0; color: #6b7280; font-size: 0.9rem;">
                        ${aluno.matricula || ''} ${aluno.email ? '• ' + aluno.email : ''}
                    </p>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: #4f46e5;">${aluno.mediaNotas}</div>
                    <small style="color: #6b7280;">Média</small>
                </div>
            </div>
            
            <div style="margin: 15px 0;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span style="font-size: 0.9rem; color: #6b7280;">Taxa de acerto</span>
                    <span style="font-weight: 600; color: #4f46e5;">${aluno.taxaAcerto}%</span>
                </div>
                <div style="height: 10px; background: #e5e7eb; border-radius: 5px; overflow: hidden;">
                    <div style="height: 100%; background: linear-gradient(90deg, #4f46e5, #7c3aed); width: ${aluno.taxaAcerto}%"></div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 0.9rem; color: #6b7280;">
                <div style="text-align: center;">
                    <div style="font-weight: 600; color: #4f46e5;">${aluno.totalTurmas}</div>
                    <div>Turmas</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-weight: 600; color: #10b981;">${aluno.totalProvas}</div>
                    <div>Provas</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-weight: 600; color: ${aluno.mediaNotas >= 7 ? '#10b981' : aluno.mediaNotas >= 5 ? '#f59e0b' : '#ef4444'}">
                        ${aluno.mediaNotas >= 7 ? 'Bom' : aluno.mediaNotas >= 5 ? 'Médio' : 'Baixo'}
                    </div>
                    <div>Desempenho</div>
                </div>
            </div>
        </div>
    `).join('');
}

function atualizarListaDisciplinasResultados(disciplinas) {
    const container = document.getElementById('listaDisciplinasResultados');
    if (!container) return;
    
    if (!disciplinas || disciplinas.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-book" style="font-size: 3rem; margin-bottom: 15px;"></i>
                <h3>Nenhuma disciplina encontrada</h3>
                <p>Não há dados de desempenho para disciplinas.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = disciplinas.map(disciplina => `
        <div class="desempenho-card" style="background: white; border-radius: 12px; padding: 20px; margin-bottom: 15px; box-shadow: 0 3px 10px rgba(0,0,0,0.08); border-left: 4px solid #4f46e5;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                <div>
                    <h4 style="margin: 0; color: #1f2937;">${disciplina.nome}</h4>
                    <p style="margin: 5px 0; color: #6b7280; font-size: 0.9rem;">
                        ${disciplina.totalTurmas} turma(s) • ${disciplina.totalAlunos} aluno(s)
                    </p>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: #4f46e5;">${disciplina.mediaNotas}</div>
                    <small style="color: #6b7280;">Média</small>
                </div>
            </div>
            
            <div style="margin: 15px 0;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                    <span style="font-size: 0.9rem; color: #6b7280;">Taxa de acerto</span>
                    <span style="font-weight: 600; color: #4f46e5;">${disciplina.taxaAcerto}%</span>
                </div>
                <div style="height: 10px; background: #e5e7eb; border-radius: 5px; overflow: hidden;">
                    <div style="height: 100%; background: linear-gradient(90deg, #4f46e5, #7c3aed); width: ${disciplina.taxaAcerto}%"></div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 0.9rem; color: #6b7280;">
                <div style="text-align: center;">
                    <div style="font-weight: 600; color: #4f46e5;">${disciplina.totalProvas}</div>
                    <div>Provas</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-weight: 600; color: #10b981;">${disciplina.taxaAcerto}%</div>
                    <div>Acertos</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-weight: 600; color: ${disciplina.mediaNotas >= 7 ? '#10b981' : disciplina.mediaNotas >= 5 ? '#f59e0b' : '#ef4444'}">
                        ${disciplina.mediaNotas >= 7 ? 'Bom' : disciplina.mediaNotas >= 5 ? 'Médio' : 'Baixo'}
                    </div>
                    <div>Desempenho</div>
                </div>
            </div>
        </div>
    `).join('');
}

function filtrarTurmas() {
    const filtroTurma = document.getElementById('filtroTurma').value;
    const filtroDisciplina = document.getElementById('filtroDisciplina').value;
    const filtroPeriodo = document.getElementById('filtroPeriodo').value;
    
    return resultadosGerais.turmas.filter(turma => {
        if (filtroTurma && turma.nome !== filtroTurma) return false;
        if (filtroDisciplina && turma.disciplina !== filtroDisciplina) return false;
        return true;
    });
}

function filtrarAlunosLista() {
    const busca = document.getElementById('buscaAluno')?.value.toLowerCase() || '';
    const filtroTurma = document.getElementById('filtroTurma').value;
    const filtroDisciplina = document.getElementById('filtroDisciplina').value;
    
    return resultadosGerais.alunos.filter(aluno => {
        if (busca) {
            const nomeMatch = aluno.nome.toLowerCase().includes(busca);
            const matriculaMatch = aluno.matricula?.toLowerCase().includes(busca) || false;
            if (!nomeMatch && !matriculaMatch) return false;
        }
        if (filtroTurma && !aluno.turmas.includes(filtroTurma)) return false;
        return true;
    });
}

function filtrarDisciplinas() {
    const filtroTurma = document.getElementById('filtroTurma').value;
    const filtroDisciplina = document.getElementById('filtroDisciplina').value;
    
    return resultadosGerais.disciplinas.filter(disciplina => {
        if (filtroDisciplina && disciplina.nome !== filtroDisciplina) return false;
        if (filtroTurma && !disciplina.turmas.includes(filtroTurma)) return false;
        return true;
    });
}

window.verDetalhesTurma = function(turmaId) {
    window.location.href = `detalhes-turma.html?id=${turmaId}`;
};

window.verDetalhesAlunoResultado = function(alunoId) {
    window.location.href = `detalhes-aluno.html?id=${alunoId}`;
};

window.verDetalhesDisciplina = function(disciplinaNome) {
    mostrarAlertaGeral(`Detalhes da disciplina "${disciplinaNome}" - Funcionalidade em desenvolvimento`);
};

function esconderLoading() {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.style.opacity = '0';
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
        }, 300);
    }
}

function mostrarLoading(mensagem = 'Carregando...') {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
        loadingOverlay.style.opacity = '1';
        loadingOverlay.querySelector('p').textContent = mensagem;
    }
}

async function verificarAutenticacao() {
    const token = localStorage.getItem('auth_token');
    const userData = localStorage.getItem('user_data');
    
    if (!token) {
        console.log('❌ Nenhum token encontrado, redirecionando para login...');
        window.location.href = 'login.html';
        return false;
    }
    
    try {
        const response = await fetch('/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.status === 401) {
            console.log('❌ Token inválido ou expirado');
            localStorage.clear();
            window.location.href = 'login.html';
            return false;
        }
        
        const data = await response.json();
        
        if (data.success) {
            usuario = data.user;
            localStorage.setItem('user_data', JSON.stringify(data.user));
            
            if (usuario.role !== 'professor' && usuario.role !== 'admin') {
                console.log('❌ Acesso negado - Não é professor');
                window.location.href = usuario.role === 'aluno' ? 'aluno.html' : 'login.html';
                return false;
            }
            
            return true;
        } else {
            throw new Error(data.error || 'Erro na autenticação');
        }
        
    } catch (error) {
        console.error('Erro na verificação de autenticação:', error);
        localStorage.clear();
        window.location.href = 'login.html';
        return false;
    }
}

async function carregarDadosProfessor() {
    try {
        mostrarLoading('Verificando autenticação...');
        const autenticado = await verificarAutenticacao();
        if (!autenticado) return;
        
        atualizarInterfaceProfessor();
        await carregarTurmasProfessor();
        
        esconderLoading();
        
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        mostrarAlerta('mostrarAlertaGeralProva', '❌ Erro ao carregar dados. Tente recarregar a página.', 'error');
        esconderLoading();
    }
}

async function carregarEixosParaSelect() {
    try {
        console.log('📥 Carregando eixos do banco...');
        
        const response = await fetch('/api/eixos');
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Erro ao carregar eixos');
        }
        
        const selectEixo = document.getElementById('eixoTurma');
        if (!selectEixo) return;
        
        selectEixo.innerHTML = '<option value="">Selecione um eixo...</option>';
        
        data.eixos.forEach(eixo => {
            const option = document.createElement('option');
            option.value = eixo.nome;
            option.textContent = eixo.label;
            option.style.borderLeft = `3px solid ${eixo.cor || '#667eea'}`;
            option.style.padding = '5px 10px';
            option.style.marginBottom = '2px';
            selectEixo.appendChild(option);
        });
        
        console.log(`✅ ${data.eixos.length} eixos carregados do banco`);
        
    } catch (error) {
        console.error('❌ Erro ao carregar eixos:', error);
        
        const selectEixo = document.getElementById('eixoTurma');
        if (selectEixo) {
            selectEixo.innerHTML = `
                <option value="">Selecione um eixo...</option>
                <option value="natureza">🔬 Natureza e Matemática</option>
                <option value="humanas">🏛️ Humanas</option>
                <option value="linguagens">🎭 Linguagens</option>
                <option value="desenvolvimento">💻 Desenvolvimento de Sistemas</option>
                <option value="redes">🌐 Redes de Computadores</option>
                <option value="gestao">📊 Gestão e Negócios</option>
                <option value="producao">🎬 Produção Cultural e Design</option>
                <option value="turismo">✈️ Turismo, Hospitalidade e Lazer</option>
                <option value="ambiente">🌱 Ambiente e Saúde</option>
            `;
        }
    }
}

function atualizarInterfaceProfessor() {
    try {
        const professorNomeEl = document.getElementById('professorNome');
        if (professorNomeEl) {
            professorNomeEl.textContent = usuario.nome;
        }
        
        const professorEmailEl = document.getElementById('professorEmail');
        if (professorEmailEl) {
            professorEmailEl.textContent = usuario.email;
        }
        
        const professorEixoEl = document.getElementById('professorEixo');
        if (professorEixoEl) {
            console.log('🎯 Eixo detectado:', usuario.eixo);
            
            const eixoConfig = {
                'natureza': { 
                    texto: '🔬 Eixo Natureza e Matemática',
                    classe: 'eixo-natureza'
                },
                'humanas': { 
                    texto: '🏛️ Eixo Humanas',
                    classe: 'eixo-humanas'
                },
                'linguagens': { 
                    texto: '🎭 Eixo Linguagens',
                    classe: 'eixo-linguagens'
                },
                'desenvolvimento': { 
                    texto: '💻 Desenvolvimento de Sistemas',
                    classe: 'eixo-desenvolvimento'
                },
                'redes': { 
                    texto: '🌐 Redes de Computadores',
                    classe: 'eixo-redes'
                },
                'gestao': { 
                    texto: '📊 Gestão e Negócios',
                    classe: 'eixo-gestao'
                },
                'producao': { 
                    texto: '🎬 Produção Cultural e Design',
                    classe: 'eixo-producao'
                },
                'turismo': { 
                    texto: '✈️ Turismo, Hospitalidade e Lazer',
                    classe: 'eixo-turismo'
                },
                'ambiente': { 
                    texto: '🌱 Ambiente e Saúde',
                    classe: 'eixo-ambiente'
                }
            };
            
            if (usuario.eixo && eixoConfig[usuario.eixo]) {
                const config = eixoConfig[usuario.eixo];
                professorEixoEl.textContent = config.texto;
                professorEixoEl.className = `eixo-badge ${config.classe}`;
                console.log('✅ Eixo atualizado:', config.texto, 'com classe', config.classe);
            } else if (usuario.eixo) {
                professorEixoEl.textContent = `📌 Eixo ${usuario.eixo}`;
                professorEixoEl.className = 'eixo-badge eixo-generico';
            } else {
                professorEixoEl.textContent = '❓ Eixo não definido';
                professorEixoEl.className = 'eixo-badge eixo-generico';
            }
        }
        
    } catch (error) {
        console.error('❌ Erro ao atualizar interface:', error);
    }
}

async function carregarTurmasProfessor() {
    try {
        const token = localStorage.getItem('auth_token');
        
        console.log('📚 Carregando turmas do professor...');
        
        const response = await fetch('/api/turmas', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            turmasProfessor = data.turmas || [];
            atualizarSelectTurmas();
            atualizarListaTurmas();
            atualizarEstatisticasTurmas();
        } else {
            throw new Error(data.error || 'Erro ao carregar turmas');
        }
        
    } catch (error) {
        console.error('Erro ao carregar turmas:', error);
        
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            mostrarAlerta('mostrarAlertaGeralMinhasTurmas', '❌ Erro de conexão com o servidor. Verifique sua internet.', 'error');
        } else {
            mostrarAlerta('mostrarAlertaGeralMinhasTurmas', '❌ Erro ao carregar turmas: ' + error.message, 'error');
        }
    }
}

function atualizarListaProvas(provas) {
    const listaProvas = document.getElementById('listaProvas');
    const mostrarAlertaGerala = document.getElementById('mostrarAlertaGeralMinhasProvas');
    
    if (!listaProvas) return;
    
    const botaoRascunhos = `
        <div style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; color: var(--gray-700);">
                <i class="fas fa-file-alt"></i> Minhas Provas
            </h3>
            <button onclick="alternarRascunhos()" id="btnToggleRascunhos" style="
                padding: 8px 16px;
                background: #f3f4f6;
                color: #6b7280;
                border: 1px solid #d1d5db;
                border-radius: 6px;
                cursor: pointer;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 5px;
                font-size: 0.9rem;
            ">
                <i class="fas fa-eye-slash"></i> Mostrar Rascunhos
            </button>
        </div>
    `;
    
    if (mostrarAlertaGerala) {
        mostrarAlertaGerala.style.display = 'none';
    }
    
    if (!provas || provas.length === 0) {
        listaProvas.innerHTML = botaoRascunhos + `
            <div class="empty-state">
                <i class="fas fa-file-alt" style="font-size: 3rem; margin-bottom: 15px;"></i>
                <h3>Nenhuma prova criada</h3>
                <p>Você ainda não criou nenhuma prova. Crie sua primeira prova na aba "Nova Prova".</p>
            </div>
        `;
        return;
    }
    
    listaProvas.innerHTML = botaoRascunhos + provas.map(prova => {
        let statusClass = 'status-ativa';
        let statusText = 'Ativa';
        let statusIcon = 'fa-check-circle';
        
        if (prova.status === 'inativa') {
            statusClass = 'status-inativa';
            statusText = 'Inativa';
            statusIcon = 'fa-times-circle';
        } else if (prova.dataLimite && new Date(prova.dataLimite) < new Date()) {
            statusClass = 'status-concluida';
            statusText = 'Concluída';
            statusIcon = 'fa-check-double';
        }
        
        let dificuldadeColor = '#4f46e5';
        if (prova.dificuldade === 'facil') {
            dificuldadeColor = '#10b981';
        } else if (prova.dificuldade === 'dificil') {
            dificuldadeColor = '#ef4444';
        }
        
        const isAdaptada = prova.tipoProva === 'adaptada' || prova.adaptada === true;
        
        let badgeAdaptada = '';
        if (isAdaptada) {
            badgeAdaptada = `
                <span style="
                    background: linear-gradient(135deg, #2563eb, #1e40af);
                    color: white;
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 0.75rem;
                    font-weight: 600;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    margin-left: 10px;
                    border: 1px solid rgba(255,255,255,0.2);
                ">
                    <i class="fas fa-universal-access"></i>
                    Adaptada (3 alternativas)
                </span>
            `;
        }
        
        const formatarData = (dataString) => {
            if (!dataString) return 'Não disponível';
            try {
                const data = new Date(dataString);
                if (isNaN(data.getTime())) return 'Data inválida';
                return data.toLocaleDateString('pt-BR');
            } catch (error) {
                return 'Data inválida';
            }
        };
        
        const obterNomeTurma = () => {
            if (!prova.turma) return 'Sem turma';
            if (typeof prova.turma === 'string') return prova.turma;
            if (typeof prova.turma === 'object' && prova.turma !== null) {
                return prova.turma.nome || prova.turma.Nome || 'Turma sem nome';
            }
            return 'Sem turma';
        };
        
        const dataCriacao = formatarData(prova.dataCriacao);
        const dataLimite = formatarData(prova.dataLimite);
        const nomeTurma = obterNomeTurma();
        
        const mediaNotas = prova.mediaNotas || prova.mediaNotas === 0 ? 
            (typeof prova.mediaNotas === 'number' ? prova.mediaNotas.toFixed(1) : prova.mediaNotas) : 
            '0.0';
        
        const alunosRealizaram = prova.alunosRealizaram || prova.totalRealizados || 0;
        const totalAlunos = prova.totalAlunos || prova.totalAlunosTurma || 0;
        
        return `
            <div class="prova-card" style="
                background: white; 
                border-radius: 12px; 
                padding: 20px; 
                margin-bottom: 15px; 
                box-shadow: 0 3px 10px rgba(0,0,0,0.08); 
                border-left: 4px solid ${dificuldadeColor};
                ${isAdaptada ? 'background: linear-gradient(to right, #f0f9ff, white);' : ''}
            ">
                <div class="prova-header" style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                    <div>
                        <h3 class="prova-titulo" style="
                            font-size: 1.2rem; 
                            font-weight: 600; 
                            color: ${isAdaptada ? '#1e40af' : '#1f2937'}; 
                            margin: 0;
                            display: flex;
                            align-items: center;
                            flex-wrap: wrap;
                        ">
                            ${prova.titulo || 'Sem título'}
                            ${badgeAdaptada}
                        </h3>
                        <p style="color: #6b7280; margin: 5px 0; font-size: 0.9rem;">
                            ${prova.conteudo ? (prova.conteudo.length > 100 ? prova.conteudo.substring(0, 100) + '...' : prova.conteudo) : 'Sem conteúdo'}
                        </p>
                    </div>
                    <div>
                        <span class="prova-status ${statusClass}" style="
                            display: inline-flex; 
                            align-items: center; 
                            gap: 5px; 
                            padding: 5px 10px; 
                            border-radius: 20px; 
                            font-size: 0.85rem; 
                            font-weight: 600; 
                            background: ${statusClass === 'status-ativa' ? '#d1fae5' : 
                                        statusClass === 'status-concluida' ? '#fef3c7' : 
                                        '#f3f4f6'}; 
                            color: ${statusClass === 'status-ativa' ? '#065f46' : 
                                    statusClass === 'status-concluida' ? '#92400e' : 
                                    '#6b7280'};
                        ">
                            <i class="fas ${statusIcon}"></i> ${statusText}
                        </span>
                    </div>
                </div>
                
                <div class="prova-info" style="
                    display: grid; 
                    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); 
                    gap: 10px; 
                    margin-bottom: 15px; 
                    font-size: 0.9rem; 
                    color: #6b7280;
                ">
                    <div class="prova-info-item" style="display: flex; align-items: center; gap: 5px;">
                        <i class="fas fa-question-circle"></i>
                        <span><strong>${prova.quantidadeQuestoes || 0}</strong> questões</span>
                    </div>
                    
                    <div class="prova-info-item" style="display: flex; align-items: center; gap: 5px;">
                        <i class="fas fa-calendar-week"></i>
                        <span><strong>${prova.periodo ? prova.periodo + 'º Período' : '1º Período'}</strong></span>
                    </div>
                    
                    <div class="prova-info-item" style="display: flex; align-items: center; gap: 5px;">
                        <i class="fas fa-school"></i>
                        <span>${nomeTurma}</span>
                    </div>
                    <div class="prova-info-item" style="display: flex; align-items: center; gap: 5px;">
                        <i class="fas fa-users"></i>
                        <span><strong>${alunosRealizaram}/${totalAlunos}</strong> alunos</span>
                    </div>
                    <div class="prova-info-item" style="display: flex; align-items: center; gap: 5px;">
                        <i class="fas fa-chart-line"></i>
                        <span>Média: <strong>${mediaNotas}</strong></span>
                    </div>
                    ${isAdaptada ? `
                    <div class="prova-info-item" style="display: flex; align-items: center; gap: 5px;">
                        <i class="fas fa-list-ol" style="color: #2563eb;"></i>
                        <span><strong>3</strong> alternativas</span>
                    </div>
                    ` : ''}
                </div>
                
                <div class="prova-datas" style="
                    display: flex; 
                    justify-content: space-between; 
                    font-size: 0.8rem; 
                    color: #6b7280; 
                    margin-bottom: 15px;
                ">
                    <div>
                        <i class="fas fa-calendar-plus"></i> Criada: ${dataCriacao}
                    </div>
                    <div>
                        <i class="fas fa-calendar-times"></i> Limite: ${dataLimite}
                    </div>
                </div>
                
                <div style="
                    margin-bottom: 15px;
                    padding: 12px;
                    background: #f3f4f6;
                    border-radius: 8px;
                    font-size: 0.85rem;
                    color: #4b5563;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    border-left: 3px solid #6b7280;
                ">
                    <i class="fas fa-calendar-week" style="color: #4b5563;"></i>
                    <span>
                        <strong>Período letivo:</strong> ${prova.periodo ? prova.periodo + 'º Período' : '1º Período'}
                    </span>
                </div>
                
                ${isAdaptada ? `
                <div style="
                    margin-bottom: 15px;
                    padding: 12px;
                    background: #dbeafe;
                    border-radius: 8px;
                    font-size: 0.85rem;
                    color: #1e40af;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    border-left: 3px solid #2563eb;
                ">
                    <i class="fas fa-universal-access"></i>
                    <span>
                        <strong>Prova adaptada:</strong> Será enviada apenas para alunos com necessidades de acessibilidade.
                        ${prova.totalAlunosAlvo ? `${prova.totalAlunosAlvo} aluno(s) nesta turma.` : ''}
                    </span>
                </div>
                ` : ''}
                
                <div class="prova-actions" style="display: flex; gap: 10px; margin-top: 15px; flex-wrap: wrap;">
                    <button class="btn-ver-prova" onclick="verResultadosProva('${prova.id}')" style="
                        background: #4f46e5; 
                        color: white; 
                        border: none; 
                        padding: 8px 16px; 
                        border-radius: 6px; 
                        cursor: pointer; 
                        font-weight: 600; 
                        display: flex; 
                        align-items: center; 
                        gap: 5px; 
                        font-size: 0.9rem;
                    ">
                        <i class="fas fa-chart-bar"></i> Ver Resultados
                    </button>
                    
                    <button class="btn-visualizar-prova" onclick="visualizarProva('${prova.id}')" style="
                        background: #10b981; 
                        color: white; 
                        border: none; 
                        padding: 8px 16px; 
                        border-radius: 6px; 
                        cursor: pointer; 
                        font-weight: 600; 
                        display: flex; 
                        align-items: center; 
                        gap: 5px; 
                        font-size: 0.9rem;
                    ">
                        <i class="fas fa-eye"></i> Visualizar
                    </button>
                    
                    <button class="btn-editar-prova" onclick="editarProvaProfessor('${prova.id}')" style="
                        background: #f59e0b; 
                        color: white; 
                        border: none; 
                        padding: 8px 16px; 
                        border-radius: 6px; 
                        cursor: pointer; 
                        font-weight: 600; 
                        display: flex; 
                        align-items: center; 
                        gap: 5px; 
                        font-size: 0.9rem;
                    ">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    
                    ${prova.codigo ? `
                    <button class="btn-compartilhar-prova" onclick="compartilharProva('${prova.codigo}')" style="
                        background: #8b5cf6; 
                        color: white; 
                        border: none; 
                        padding: 8px 16px; 
                        border-radius: 6px; 
                        cursor: pointer; 
                        font-weight: 600; 
                        display: flex; 
                        align-items: center; 
                        gap: 5px; 
                        font-size: 0.9rem;
                    ">
                        <i class="fas fa-share-alt"></i> Código: ${prova.codigo}
                    </button>
                    ` : ''}
                    
                    ${prova.alunosRealizaram > 0 ? `
                    <button class="btn-liberar-notas" onclick="liberarTodasNotas('${prova.id}', '${prova.titulo.replace(/'/g, "\\'")}')" style="
                        background: #f59e0b; 
                        color: white; 
                        border: none; 
                        padding: 8px 16px; 
                        border-radius: 6px; 
                        cursor: pointer; 
                        font-weight: 600; 
                        display: flex; 
                        align-items: center; 
                        gap: 5px; 
                        font-size: 0.9rem;
                    ">
                        <i class="fas fa-unlock"></i> Liberar Notas
                    </button>
                    <button class="btn-prova-corrigida" onclick="abrirProvaCorrigida('${prova.id}')" style="
                        background: #f59e0b; 
                        color: white; 
                        border: none; 
                        padding: 8px 16px; 
                        border-radius: 6px; 
                        cursor: pointer; 
                        font-weight: 600; 
                        display: flex; 
                        align-items: center; 
                        gap: 5px; 
                        font-size: 0.9rem;
                    ">
                        <i class="fas fa-file-check"></i> Prova Corrigida
                    </button>
                    ` : ''}
                    
                    <button class="btn-excluir-prova" onclick="solicitarExclusaoProva('${prova.id}', '${prova.titulo.replace(/'/g, "\\'")}')" style="
                        background: #ef4444; 
                        color: white; 
                        border: none; 
                        padding: 8px 16px; 
                        border-radius: 6px; 
                        cursor: pointer; 
                        font-weight: 600; 
                        display: flex; 
                        align-items: center; 
                        gap: 5px; 
                        font-size: 0.9rem;
                    ">
                        <i class="fas fa-trash"></i> Excluir
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

window.filtrarProvasAdaptadas = function() {
    const listaProvas = document.getElementById('listaProvas');
    const cards = document.querySelectorAll('.prova-card, .prova-card-adaptada');
    let count = 0;
    
    cards.forEach(card => {
        const isAdaptada = card.classList.contains('prova-card-adaptada') || 
                        card.querySelector('.prova-adaptada-badge');
        
        if (isAdaptada) {
            card.style.display = 'block';
            count++;
        } else {
            card.style.display = 'none';
        }
    });
    
    if (count === 0) {
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', '📋 Nenhuma prova adaptada encontrada', 'info');
    }
    
    const btn = document.getElementById('btnFiltrarAdaptadas');
    if (btn) {
        btn.innerHTML = '<i class="fas fa-universal-access"></i> Mostrando Adaptadas';
        btn.onclick = mostrarTodasProvas;
    }
};

window.mostrarTodasProvas = function() {
    const cards = document.querySelectorAll('.prova-card, .prova-card-adaptada');
    cards.forEach(card => {
        card.style.display = 'block';
    });
    
    const btn = document.getElementById('btnFiltrarAdaptadas');
    if (btn) {
        btn.innerHTML = '<i class="fas fa-universal-access"></i> Ver Adaptadas';
        btn.onclick = filtrarProvasAdaptadas;
    }
};

window.verResultadosProva = function(provaId) {
    window.location.href = `resultados.html?provaId=${provaId}&tipo=professor`;
};

window.visualizarProva = async function(provaId) {
    try {
        const token = localStorage.getItem('auth_token');
        
        const modalContent = `
            <div class="modal-header">
                <h3><i class="fas fa-eye"></i> Visualizar Prova</h3>
                <button class="modal-close" onclick="fecharModal('modalVisualizarProva')">&times;</button>
            </div>
            <div style="padding: 20px; text-align: center;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: #4f46e5;"></i>
                <p>Carregando detalhes da prova...</p>
            </div>
        `;
        
        let modal = document.getElementById('modalVisualizarProva');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'modalVisualizarProva';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 800px; max-height: 80vh; overflow-y: auto;">
                    ${modalContent}
                </div>
            `;
            document.body.appendChild(modal);
        } else {
            modal.querySelector('.modal-content').innerHTML = modalContent;
        }
        
        modal.style.display = 'flex';
        
        const response = await fetch(`/api/provas/${provaId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}: Não foi possível carregar a prova`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            const prova = data.prova;
            const questoes = data.questoes || [];
        
            let duracaoTexto = 'Não definida';
            let duracaoMinutos = 0;
            
            if (prova.duracao) {
                duracaoTexto = prova.duracao;
                duracaoMinutos = parseInt(prova.duracao) || 0;
            } else if (prova.duracaoMinutos) {
                duracaoMinutos = prova.duracaoMinutos;
                if (duracaoMinutos >= 60) {
                    const horas = Math.floor(duracaoMinutos / 60);
                    const minutos = duracaoMinutos % 60;
                    duracaoTexto = minutos > 0 ? `${horas}h ${minutos}min` : `${horas}h`;
                } else {
                    duracaoTexto = `${duracaoMinutos}min`;
                }
            } else if (prova.horarioInicio && prova.horarioTermino) {
                const [h1, m1] = prova.horarioInicio.split(':').map(Number);
                const [h2, m2] = prova.horarioTermino.split(':').map(Number);
                duracaoMinutos = (h2 * 60 + m2) - (h1 * 60 + m1);
                
                if (duracaoMinutos >= 60) {
                    const horas = Math.floor(duracaoMinutos / 60);
                    const minutos = duracaoMinutos % 60;
                    duracaoTexto = minutos > 0 ? `${horas}h ${minutos}min` : `${horas}h`;
                } else {
                    duracaoTexto = `${duracaoMinutos}min`;
                }
            }
            
            let questoesHTML = '';
            
            if (questoes.length === 0) {
                questoesHTML = `
                    <div style="text-align: center; padding: 40px; color: #6b7280;">
                        <i class="fas fa-question-circle" style="font-size: 3rem; margin-bottom: 15px;"></i>
                        <h3>Nenhuma questão disponível</h3>
                        <p>Esta prova não possui questões ou elas não puderam ser carregadas.</p>
                    </div>
                `;
            } else {
                questoesHTML = questoes.map((questao, index) => {
                    const respostaCorreta = questao.respostaCorreta;
                    const letras = ['A', 'B', 'C', 'D', 'E'];
                    const letraCorreta = letras[respostaCorreta];
                    
                    const opcoes = questao.opcoes || [];
                    
                    return `
                        <div class="questao-completa" style="margin-bottom: 30px; padding: 20px; background: #f9fafb; border-radius: 10px; border-left: 4px solid #4f46e5;">
                            <div class="questao-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                                <h4 style="margin: 0; color: #1f2937;">
                                    <span style="background: #4f46e5; color: white; padding: 2px 10px; border-radius: 12px; font-size: 0.9rem; margin-right: 10px;">
                                        ${index + 1}
                                    </span>
                                    Questão ${index + 1}
                                </h4>
                                <span style="font-size: 0.85rem; padding: 5px 10px; border-radius: 20px; background: #d1fae5; color: #065f46; font-weight: 600;">
                                    <i class="fas fa-check-circle"></i> Resposta: ${letraCorreta}
                                </span>
                            </div>
                            
                            <div class="questao-texto" style="margin-bottom: 20px; padding: 15px; background: white; border-radius: 8px;">
                                <p style="margin: 0; font-size: 1.1rem; line-height: 1.6;">${questao.pergunta || 'Pergunta não disponível'}</p>
                            </div>
                            
                            <div class="opcoes-container" style="margin-bottom: 20px;">
                                ${opcoes.map((opcao, opcaoIndex) => {
                                    const letra = letras[opcaoIndex];
                                    const isCorreta = opcaoIndex === respostaCorreta;
                                    
                                    return `
                                        <div class="opcao-item" style="
                                            display: flex; 
                                            align-items: center; 
                                            gap: 10px; 
                                            padding: 12px 15px; 
                                            margin-bottom: 8px; 
                                            background: ${isCorreta ? '#d1fae5' : 'white'};
                                            border: 2px solid ${isCorreta ? '#10b981' : '#e5e7eb'};
                                            border-radius: 8px;
                                            transition: all 0.3s;
                                        ">
                                            <span style="
                                                width: 30px; 
                                                height: 30px; 
                                                display: flex; 
                                                align-items: center; 
                                                justify-content: center; 
                                                border-radius: 50%; 
                                                background: ${isCorreta ? '#10b981' : '#f3f4f6'}; 
                                                color: ${isCorreta ? 'white' : '#4b5563'}; 
                                                font-weight: 600;
                                            ">
                                                ${letra}
                                            </span>
                                            <span style="flex: 1; ${isCorreta ? 'color: #065f46; font-weight: 600;' : 'color: #4b5563;'}">
                                                ${opcao || 'Opção não disponível'}
                                            </span>
                                            ${isCorreta ? 
                                                '<span style="color: #10b981;"><i class="fas fa-check-circle"></i> Correta</span>' : 
                                                '<span style="color: #9ca3af;"><i class="fas fa-circle"></i></span>'
                                            }
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                            
                            ${questao.explicacao ? `
                            <div class="explicacao" style="
                                margin-top: 15px; 
                                padding: 15px; 
                                background: #f0fdf4; 
                                border-radius: 8px; 
                                border-left: 3px solid #10b981;
                            ">
                                <h5 style="margin: 0 0 10px 0; color: #065f46; display: flex; align-items: center; gap: 8px;">
                                    <i class="fas fa-lightbulb"></i> Explicação
                                </h5>
                                <p style="margin: 0; color: #065f46; line-height: 1.5;">
                                    ${questao.explicacao}
                                </p>
                            </div>
                            ` : ''}
                            
                            <div class="questao-metadata" style="
                                margin-top: 15px; 
                                padding-top: 15px; 
                                border-top: 1px solid #e5e7eb; 
                                display: flex; 
                                justify-content: space-between; 
                                font-size: 0.85rem; 
                                color: #6b7280;
                            ">
                                <span>
                                    <i class="fas fa-hashtag"></i> ID: ${questao.id || 'N/A'}
                                </span>
                                <span>
                                    <i class="fas fa-star"></i> Dificuldade: ${questao.dificuldade || 'Média'}
                                </span>
                            </div>
                        </div>
                    `;
                }).join('');
            }
            
            const dataCriacao = prova.dataCriacao ? new Date(prova.dataCriacao).toLocaleDateString('pt-BR') : 'Não disponível';
            const dataLimite = prova.dataLimite ? new Date(prova.dataLimite).toLocaleDateString('pt-BR') : 'Sem limite';
            
            const modalFinalContent = `
                <div class="modal-header">
                    <h3><i class="fas fa-eye"></i> Visualizar Prova</h3>
                    <button class="modal-close" onclick="fecharModal('modalVisualizarProva')">&times;</button>
                </div>
                
                <div style="padding: 25px;">
                    <div class="prova-header" style="
                        background: linear-gradient(135deg, #4f46e5, #7c3aed); 
                        color: white; 
                        padding: 25px; 
                        border-radius: 12px; 
                        margin-bottom: 25px;
                    ">
                        <h2 style="margin: 0 0 10px 0;">${prova.titulo || 'Prova sem título'}</h2>
                        <p style="margin: 0; opacity: 0.9;">${prova.conteudo || 'Conteúdo não especificado'}</p>
                        
                        <div style="
                            display: grid; 
                            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); 
                            gap: 15px; 
                            margin-top: 20px;
                        ">
                            <div>
                                <div style="font-size: 0.9rem; opacity: 0.8;">Data de Criação</div>
                                <div style="font-weight: 600;">${dataCriacao}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.9rem; opacity: 0.8;">Data Limite</div>
                                <div style="font-weight: 600;">${dataLimite}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.9rem; opacity: 0.8;">Questões</div>
                                <div style="font-weight: 600;">${questoes.length}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.9rem; opacity: 0.8;">Duração</div>
                                <div style="font-weight: 600;">${duracaoTexto}</div>
                            </div>
                        </div>
                        
                        ${prova.horarioInicio && prova.horarioTermino ? `
                        <div style="
                            margin-top: 15px;
                            padding-top: 15px;
                            border-top: 1px solid rgba(255,255,255,0.2);
                            display: flex;
                            gap: 20px;
                        ">
                            <div>
                                <div style="font-size: 0.9rem; opacity: 0.8;">Horário Início</div>
                                <div style="font-weight: 600;">${prova.horarioInicio}</div>
                            </div>
                            <div>
                                <div style="font-size: 0.9rem; opacity: 0.8;">Horário Término</div>
                                <div style="font-weight: 600;">${prova.horarioTermino}</div>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                    
                    <div style="margin-bottom: 25px;">
                        <h3 style="color: #4b5563; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                            <i class="fas fa-list-ol"></i> Questões
                            <span style="font-size: 0.9rem; background: #e5e7eb; padding: 2px 10px; border-radius: 12px; color: #6b7280;">
                                ${questoes.length} questões
                            </span>
                        </h3>
                        
                        ${questoesHTML}
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-top: 30px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
                        <button onclick="imprimirProva('${provaId}')" style="
                            flex: 1; 
                            padding: 12px; 
                            background: #3b82f6; 
                            color: white; 
                            border: none; 
                            border-radius: 8px; 
                            cursor: pointer; 
                            font-weight: 600; 
                            display: flex; 
                            align-items: center; 
                            justify-content: center; 
                            gap: 8px;
                        ">
                            <i class="fas fa-print"></i> Imprimir
                        </button>
                        <button onclick="compartilharProva('${prova.codigo || ''}')" style="
                            flex: 1; 
                            padding: 12px; 
                            background: #10b981; 
                            color: white; 
                            border: none; 
                            border-radius: 8px; 
                            cursor: pointer; 
                            font-weight: 600; 
                            display: flex; 
                            align-items: center; 
                            justify-content: center; 
                            gap: 8px;
                        ">
                            <i class="fas fa-share-alt"></i> Compartilhar
                        </button>
                        <button onclick="fecharModal('modalVisualizarProva')" style="
                            flex: 1; 
                            padding: 12px; 
                            background: #6b7280; 
                            color: white; 
                            border: none; 
                            border-radius: 8px; 
                            cursor: pointer; 
                            font-weight: 600; 
                            display: flex; 
                            align-items: center; 
                            justify-content: center; 
                            gap: 8px;
                        ">
                            <i class="fas fa-times"></i> Fechar
                        </button>
                    </div>
                </div>
            `;
            
            modal.querySelector('.modal-content').innerHTML = modalFinalContent;
            
        } else {
            throw new Error(data.error || 'Erro ao carregar detalhes da prova');
        }
        
    } catch (error) {
        console.error('Erro ao visualizar prova:', error);
        
        const modal = document.getElementById('modalVisualizarProva');
        if (modal) {
            modal.querySelector('.modal-content').innerHTML = `
                <div class="modal-header">
                    <h3><i class="fas fa-exclamation-triangle"></i> Erro</h3>
                    <button class="modal-close" onclick="fecharModal('modalVisualizarProva')">&times;</button>
                </div>
                <div style="padding: 30px; text-align: center;">
                    <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #ef4444; margin-bottom: 15px;"></i>
                    <h3 style="color: #7f1d1d;">Erro ao carregar a prova</h3>
                    <p style="color: #6b7280;">${error.message}</p>
                    <button onclick="fecharModal('modalVisualizarProva')" style="
                        margin-top: 20px;
                        padding: 10px 20px;
                        background: #4f46e5;
                        color: white;
                        border: none;
                        border-radius: 6px;
                        cursor: pointer;
                        font-weight: 600;
                    ">
                        <i class="fas fa-times"></i> Fechar
                    </button>
                </div>
            `;
        }
    }
};

window.verTurma = async function(turmaId) {
    try {
        console.log(`🔍 Buscando detalhes da turma: ${turmaId}`);
        
        const token = localStorage.getItem('auth_token');
        
        const loadingHTML = `
            <div class="modal-header">
                <h3><i class="fas fa-school"></i> Detalhes da Turma</h3>
                <button class="modal-close" onclick="fecharModal('modalDetalhesTurma')">&times;</button>
            </div>
            <div style="padding: 40px; text-align: center;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: #8b5cf6; margin-bottom: 15px;"></i>
                <p style="color: #6b7280;">Carregando informações da turma...</p>
            </div>
        `;
        
        let modal = document.getElementById('modalDetalhesTurma');
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = 'modalDetalhesTurma';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 650px; max-height: 85vh; overflow-y: auto; padding: 0; border-radius: 24px;">
                    ${loadingHTML}
                </div>
            `;
            document.body.appendChild(modal);
        } else {
            modal.querySelector('.modal-content').innerHTML = loadingHTML;
        }
        
        modal.style.display = 'flex';
        
        const response = await fetch(`/api/turmas/${turmaId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            const turma = data.turma;
            
            console.log('✅ Dados da API:', turma);
            
            let dataCriacao = 'Não disponível';
            
            if (turma.dataCriacao && turma.dataCriacao.$date) {
                try {
                    const date = new Date(turma.dataCriacao.$date);
                    if (!isNaN(date.getTime())) {
                        dataCriacao = date.toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        console.log('✅ Data extraída do formato $date:', dataCriacao);
                    }
                } catch (e) {
                    console.warn('Erro ao processar $date:', e);
                }
            }
            else if (turma.dataCriacao && typeof turma.dataCriacao === 'string') {
                try {
                    const date = new Date(turma.dataCriacao);
                    if (!isNaN(date.getTime())) {
                        dataCriacao = date.toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        console.log('✅ Data extraída da string ISO:', dataCriacao);
                    }
                } catch (e) {
                    console.warn('Erro ao processar string ISO:', e);
                }
            }
            else if (turma.dataCriacao && typeof turma.dataCriacao === 'number') {
                try {
                    const date = new Date(turma.dataCriacao);
                    if (!isNaN(date.getTime())) {
                        dataCriacao = date.toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        });
                        console.log('✅ Data extraída do timestamp:', dataCriacao);
                    }
                } catch (e) {
                    console.warn('Erro ao processar timestamp:', e);
                }
            }
            
            if (dataCriacao === 'Não disponível') {
                const outrasPropriedades = [
                    turma.createdAt,
                    turma.criadoEm,
                    turma.created_at
                ];
                
                for (const prop of outrasPropriedades) {
                    if (prop) {
                        try {
                            let dateValue = prop;
                            if (prop.$date) dateValue = prop.$date;
                            
                            const date = new Date(dateValue);
                            if (!isNaN(date.getTime())) {
                                dataCriacao = date.toLocaleDateString('pt-BR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                });
                                console.log('✅ Data extraída de outra propriedade:', dataCriacao);
                                break;
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                }
            }
            
            let eixoColor = '#8b5cf6';
            let eixoIcon = 'globe';
            let eixoBg = '#f3e8ff';
            let eixoText = 'Geral';
            
            if (turma.eixo === 'natureza') {
                eixoColor = '#10b981';
                eixoIcon = 'leaf';
                eixoBg = '#d1fae5';
                eixoText = 'Natureza';
            } else if (turma.eixo === 'humanas') {
                eixoColor = '#8b5cf6';
                eixoIcon = 'scroll';
                eixoBg = '#ede9fe';
                eixoText = 'Humanas';
            } else if (turma.eixo === 'linguagens') {
                eixoColor = '#f59e0b';
                eixoIcon = 'language';
                eixoBg = '#fef3c7';
                eixoText = 'Linguagens';
            }
            
            const provasAtivas = turma.provas ? turma.provas.filter(p => p.status === 'ativa').length : 0;
            
            const professorNome = turma.professor?.nome || 
                                turma.professorNome || 
                                turma.nomeProfessor || 
                                'Não informado';
            
            let alunosHTML = '';
            if (turma.alunos && turma.alunos.length > 0) {
                alunosHTML = turma.alunos.slice(0, 5).map(aluno => `
                    <div style="
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        padding: 12px;
                        background: white;
                        border-radius: 12px;
                        margin-bottom: 8px;
                        border: 1px solid #e5e7eb;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.02);
                        transition: all 0.2s;
                    ">
                        <div style="
                            width: 40px;
                            height: 40px;
                            background: ${eixoColor}20;
                            border-radius: 12px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: ${eixoColor};
                            font-weight: 600;
                            font-size: 1.2rem;
                        ">
                            ${aluno.nome ? aluno.nome.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; color: #1f2937;">${aluno.nome || 'Nome não disponível'}</div>
                            <div style="font-size: 0.8rem; color: #6b7280; display: flex; gap: 10px; margin-top: 2px;">
                                <span><i class="fas fa-envelope"></i> ${aluno.email || 'Sem email'}</span>
                                <span><i class="fas fa-id-card"></i> ${aluno.matricula || 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                `).join('');
                
                if (turma.alunos.length > 5) {
                    alunosHTML += `
                        <div style="
                            text-align: center;
                            margin-top: 10px;
                            padding: 10px;
                            background: #f3f4f6;
                            border-radius: 10px;
                            font-size: 0.9rem;
                            color: #6b7280;
                        ">
                            <i class="fas fa-ellipsis-h"></i> +${turma.alunos.length - 5} alunos
                        </div>
                    `;
                }
            } else {
                alunosHTML = `
                    <div style="
                        text-align: center;
                        padding: 30px;
                        background: #f9fafb;
                        border-radius: 16px;
                        color: #6b7280;
                        border: 1px dashed #e5e7eb;
                    ">
                        <i class="fas fa-users-slash" style="font-size: 2rem; margin-bottom: 10px; color: #9ca3af;"></i>
                        <p>Nenhum aluno matriculado</p>
                    </div>
                `;
            }
            
            let provasHTML = '';
            if (turma.provas && turma.provas.length > 0) {
                provasHTML = turma.provas.slice(0, 5).map(prova => {
                    const statusColor = prova.status === 'ativa' ? '#10b981' : '#6b7280';
                    const statusBg = prova.status === 'ativa' ? '#d1fae5' : '#f3f4f6';
                    
                    return `
                        <div style="
                            display: flex;
                            align-items: center;
                            justify-content: space-between;
                            padding: 12px;
                            background: white;
                            border-radius: 12px;
                            margin-bottom: 8px;
                            border: 1px solid #e5e7eb;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.02);
                        ">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="
                                    width: 36px;
                                    height: 36px;
                                    background: ${statusBg};
                                    border-radius: 10px;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    color: ${statusColor};
                                ">
                                    <i class="fas fa-file-alt"></i>
                                </div>
                                <div>
                                    <div style="font-weight: 600; color: #1f2937;">${prova.titulo || 'Sem título'}</div>
                                    <div style="font-size: 0.75rem; color: #6b7280; display: flex; gap: 10px;">
                                        <span><i class="fas fa-question-circle"></i> ${prova.quantidadeQuestoes || 0} questões</span>
                                        ${prova.dataLimite ? `<span><i class="fas fa-calendar"></i> ${new Date(prova.dataLimite).toLocaleDateString('pt-BR')}</span>` : ''}
                                    </div>
                                </div>
                            </div>
                            <span style="
                                padding: 4px 10px;
                                border-radius: 30px;
                                font-size: 0.7rem;
                                font-weight: 600;
                                background: ${statusBg};
                                color: ${statusColor};
                            ">
                                ${prova.status === 'ativa' ? 'Ativa' : prova.status || 'Rascunho'}
                            </span>
                        </div>
                    `;
                }).join('');
                
                if (turma.provas.length > 5) {
                    provasHTML += `
                        <div style="
                            text-align: center;
                            margin-top: 10px;
                            padding: 10px;
                            background: #f3f4f6;
                            border-radius: 10px;
                            font-size: 0.9rem;
                            color: #6b7280;
                        ">
                            <i class="fas fa-ellipsis-h"></i> +${turma.provas.length - 5} provas
                        </div>
                    `;
                }
            } else {
                provasHTML = `
                    <div style="
                        text-align: center;
                        padding: 30px;
                        background: #f9fafb;
                        border-radius: 16px;
                        color: #6b7280;
                        border: 1px dashed #e5e7eb;
                    ">
                        <i class="fas fa-file-alt" style="font-size: 2rem; margin-bottom: 10px; color: #9ca3af;"></i>
                        <p>Nenhuma prova criada</p>
                    </div>
                `;
            }
            
            const modalHTML = `
                <div style="
                    position: sticky;
                    top: 0;
                    background: white;
                    z-index: 10;
                    padding: 20px 25px;
                    border-bottom: 1px solid #e5e7eb;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="
                            width: 50px;
                            height: 50px;
                            background: linear-gradient(135deg, ${eixoColor}, ${eixoColor}80);
                            border-radius: 16px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: white;
                            font-size: 24px;
                        ">
                            <i class="fas fa-school"></i>
                        </div>
                        <div>
                            <h2 style="margin: 0; color: #1f2937; font-size: 1.4rem;">${turma.nome}</h2>
                            <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 0.9rem;">
                                ${turma.disciplina} • Código: <span style="font-family: monospace; font-weight: 600;">${turma.codigo || 'N/A'}</span>
                            </p>
                        </div>
                    </div>
                    <button onclick="fecharModal('modalDetalhesTurma')" style="
                        background: none;
                        border: none;
                        font-size: 1.8rem;
                        cursor: pointer;
                        color: #9ca3af;
                        width: 40px;
                        height: 40px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 10px;
                        transition: all 0.2s;
                    " onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='none'">
                        &times;
                    </button>
                </div>
                
                <div style="padding: 25px;">
                    <div style="
                        display: grid;
                        grid-template-columns: repeat(4, 1fr);
                        gap: 10px;
                        margin-bottom: 25px;
                    ">
                        <div style="
                            background: ${eixoBg};
                            padding: 15px 5px;
                            border-radius: 16px;
                            text-align: center;
                        ">
                            <div style="font-size: 1.6rem; font-weight: 700; color: ${eixoColor};">${turma.alunos?.length || 0}</div>
                            <div style="font-size: 0.75rem; color: #6b7280;">Alunos</div>
                        </div>
                        <div style="
                            background: ${eixoBg};
                            padding: 15px 5px;
                            border-radius: 16px;
                            text-align: center;
                        ">
                            <div style="font-size: 1.6rem; font-weight: 700; color: ${eixoColor};">${turma.provas?.length || 0}</div>
                            <div style="font-size: 0.75rem; color: #6b7280;">Provas</div>
                        </div>
                        <div style="
                            background: ${eixoBg};
                            padding: 15px 5px;
                            border-radius: 16px;
                            text-align: center;
                        ">
                            <div style="font-size: 1.6rem; font-weight: 700; color: ${eixoColor};">${provasAtivas}</div>
                            <div style="font-size: 0.75rem; color: #6b7280;">Ativas</div>
                        </div>
                        <div style="
                            background: ${eixoBg};
                            padding: 15px 5px;
                            border-radius: 16px;
                            text-align: center;
                        ">
                            <div style="font-size: 1.1rem; font-weight: 600; color: ${eixoColor};">${eixoText}</div>
                            <div style="font-size: 0.75rem; color: #6b7280;">Eixo</div>
                        </div>
                    </div>
                    
                    <div style="
                        background: #f9fafb;
                        border-radius: 20px;
                        padding: 20px;
                        margin-bottom: 25px;
                    ">
                        <h4 style="margin: 0 0 15px 0; color: #374151; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-info-circle" style="color: ${eixoColor};"></i>
                            Informações da Turma
                        </h4>
                        
                        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                            <div>
                                <div style="font-size: 0.8rem; color: #6b7280;">Código</div>
                                <div style="font-family: monospace; font-weight: 600; color: #1f2937; background: white; padding: 8px 12px; border-radius: 10px; border: 1px solid #e5e7eb; margin-top: 4px;">
                                    ${turma.codigo || 'N/A'}
                                </div>
                            </div>
                            <div>
                                <div style="font-size: 0.8rem; color: #6b7280;">Status</div>
                                <div style="margin-top: 4px;">
                                    <span style="
                                        display: inline-block;
                                        padding: 8px 16px;
                                        border-radius: 30px;
                                        font-size: 0.8rem;
                                        font-weight: 600;
                                        background: ${turma.ativa !== false ? '#d1fae5' : '#fee2e2'};
                                        color: ${turma.ativa !== false ? '#065f46' : '#991b1b'};
                                    ">
                                        <i class="fas fa-${turma.ativa !== false ? 'check-circle' : 'times-circle'}"></i>
                                        ${turma.ativa !== false ? 'Ativa' : 'Inativa'}
                                    </span>
                                </div>
                            </div>
                            <div>
                                <div style="font-size: 0.8rem; color: #6b7280;">Data de Criação</div>
                                <div style="font-weight: 500; color: #1f2937; background: white; padding: 8px 12px; border-radius: 10px; border: 1px solid #e5e7eb; margin-top: 4px;">
                                    <i class="far fa-calendar-alt" style="color: ${eixoColor}; margin-right: 5px;"></i>
                                    ${dataCriacao}
                                </div>
                            </div>
                            <div>
                                <div style="font-size: 0.8rem; color: #6b7280;">Professor</div>
                                <div style="font-weight: 500; color: #1f2937; background: white; padding: 8px 12px; border-radius: 10px; border: 1px solid #e5e7eb; margin-top: 4px;">
                                    <i class="fas fa-chalkboard-teacher" style="color: ${eixoColor}; margin-right: 5px;"></i>
                                    ${professorNome}
                                </div>
                            </div>
                        </div>
                        
                        ${turma.descricao ? `
                        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                            <div style="font-size: 0.8rem; color: #6b7280; margin-bottom: 8px;">Descrição</div>
                            <div style="
                                background: white;
                                padding: 15px;
                                border-radius: 12px;
                                border: 1px solid #e5e7eb;
                                color: #4b5563;
                                font-size: 0.9rem;
                                line-height: 1.5;
                            ">
                                <i class="fas fa-quote-left" style="color: ${eixoColor}; opacity: 0.5; margin-right: 5px;"></i>
                                ${turma.descricao}
                            </div>
                        </div>
                        ` : ''}
                    </div>
                    
                    <div style="
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 20px;
                        margin-bottom: 25px;
                    ">
                        <div>
                            <h4 style="margin: 0 0 15px 0; color: #374151; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-users" style="color: ${eixoColor};"></i>
                                Alunos Matriculados
                                <span style="
                                    background: ${eixoBg};
                                    color: ${eixoColor};
                                    padding: 2px 8px;
                                    border-radius: 30px;
                                    font-size: 0.75rem;
                                    font-weight: 600;
                                    margin-left: 5px;
                                ">${turma.alunos?.length || 0}</span>
                            </h4>
                            <div style="max-height: 300px; overflow-y: auto; padding-right: 5px;">
                                ${alunosHTML}
                            </div>
                        </div>
                        
                        <div>
                            <h4 style="margin: 0 0 15px 0; color: #374151; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-file-alt" style="color: ${eixoColor};"></i>
                                Provas da Turma
                                <span style="
                                    background: ${eixoBg};
                                    color: ${eixoColor};
                                    padding: 2px 8px;
                                    border-radius: 30px;
                                    font-size: 0.75rem;
                                    font-weight: 600;
                                    margin-left: 5px;
                                ">${turma.provas?.length || 0}</span>
                            </h4>
                            <div style="max-height: 300px; overflow-y: auto; padding-right: 5px;">
                                ${provasHTML}
                            </div>
                        </div>
                    </div>
                    
                    <div style="
                        display: flex;
                        gap: 15px;
                        justify-content: flex-end;
                        padding-top: 20px;
                        border-top: 2px solid #f3f4f6;
                    ">
                        <button onclick="criarProvaParaTurma('${turmaId}')" style="
                            padding: 12px 28px;
                            background: linear-gradient(135deg, #10b981, #059669);
                            color: white;
                            border: none;
                            border-radius: 40px;
                            font-weight: 600;
                            font-size: 0.95rem;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 10px;
                            transition: all 0.2s;
                            box-shadow: 0 4px 6px rgba(16, 185, 129, 0.2);
                        ">
                            <i class="fas fa-plus-circle"></i> Nova Prova
                        </button>
                        <button onclick="fecharModal('modalDetalhesTurma')" style="
                            padding: 12px 28px;
                            background: white;
                            color: #4b5563;
                            border: 2px solid #e5e7eb;
                            border-radius: 40px;
                            font-weight: 600;
                            font-size: 0.95rem;
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 10px;
                            transition: all 0.2s;
                        ">
                            <i class="fas fa-times"></i> Fechar
                        </button>
                    </div>
                </div>
            `;
            
            modal.querySelector('.modal-content').innerHTML = modalHTML;
            
        } else {
            throw new Error(data.error || 'Erro ao carregar turma');
        }
        
    } catch (error) {
        console.error('❌ Erro:', error);
        
        const modal = document.getElementById('modalDetalhesTurma');
        if (modal) {
            modal.querySelector('.modal-content').innerHTML = `
                <div style="padding: 30px; text-align: center;">
                    <i class="fas fa-exclamation-circle" style="font-size: 3rem; color: #ef4444; margin-bottom: 15px;"></i>
                    <h3 style="color: #7f1d1d;">Erro ao carregar detalhes</h3>
                    <p style="color: #6b7280;">${error.message}</p>
                    <button onclick="fecharModal('modalDetalhesTurma')" style="
                        margin-top: 20px;
                        padding: 10px 20px;
                        background: #4f46e5;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                    ">
                        <i class="fas fa-times"></i> Fechar
                    </button>
                </div>
            `;
        } else {
            mostrarAlertaGeral(`Erro: ${error.message}`);
        }
    }
};

window.criarProvaParaTurma = function(turmaId) {
    fecharModal('modalDetalhesTurma');
    mostrarTab('nova-prova');
    setTimeout(() => {
        const select = document.getElementById('turmaProva');
        if (select) {
            select.value = turmaId;
        }
    }, 500);
};

// ============================================
// IMPRESSÃO DA PROVA (COM FLUXO DE ADAPTAÇÃO)
// ============================================
window.imprimirProva = async function(provaId) {
    console.log('🖨️ Preparando impressão da prova:', provaId);
    
    try {
        const token = localStorage.getItem('auth_token');
        
        const IS_LOCALHOST = window.location.hostname === 'localhost' || 
                            window.location.hostname === '127.0.0.1';
        const IS_RENDER = window.location.hostname.includes('render.com') || 
                        window.location.hostname.includes('sistema-avaliativo');
        
        let API_BASE_URL;
        if (IS_LOCALHOST) {
            API_BASE_URL = 'http://localhost:3000/api';
            console.log('🔧 Modo: DESENVOLVIMENTO LOCAL');
        } else if (IS_RENDER) {
            API_BASE_URL = window.location.origin + '/api';
            console.log('🚀 Modo: PRODUÇÃO (Render)');
        } else {
            API_BASE_URL = '/api';
            console.log('⚙️ Modo: FALLBACK');
        }
        
        const response = await fetch(`${API_BASE_URL}/provas/${provaId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('Erro ao carregar dados da prova');
        
        const data = await response.json();
        if (!data.success) throw new Error(data.error || 'Erro ao carregar prova');
        
        const prova = data.prova;
        const questoes = data.questoes || [];
        
        let qrCodeDataUrl = '';
        try {
            const correcaoUrl = `${window.location.origin}/corrigir-prova.html?prova=${provaId}`;
            
            const qrResponse = await fetch(`${API_BASE_URL}/qrcode/gerar`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ url: correcaoUrl })
            });
            
            const qrData = await qrResponse.json();
            if (qrData.success && qrData.qrCode) {
                qrCodeDataUrl = qrData.qrCode;
                console.log('✅ QR Code gerado com sucesso');
            }
        } catch (qrError) {
            console.error('❌ Erro ao buscar QR Code:', qrError);
            qrCodeDataUrl = '';
        }
        
        window.provaParaImpressao = { prova, questoes, qrCodeDataUrl, API_BASE_URL, token };
        
        mostrarModalPerguntaAdaptacao();
        
    } catch (error) {
        console.error('❌ Erro ao preparar impressão:', error);
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', `❌ Erro: ${error.message}`, 'error');
    }
};

function gerarHTMLProva(prova, questoes, qrCodeDataUrl, opcoesAdaptacao, qrCodeAlunoUrl) {
    const provaTitulo = prova.titulo || 'Prova sem título';
    const logoIema = '/uploads/logo-iema.png';
    
    const dataAtual = new Date();
    const dataFormatada = dataAtual.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    
    const totalQuestoes = questoes.length;
    const turmaNome = prova.turma?.nome || 'Turma não especificada';
    const disciplina = prova.turma?.disciplina || 'Disciplina não especificada';
    const professorNome = prova.professor?.nome || 'Professor';
    const periodo = prova.periodo ? `${prova.periodo}º Período` : '1º Período';
    
    const isAdaptada = prova.tipoProva === 'adaptada' || prova.adaptada === true;
    const letrasUsadas = isAdaptada ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D', 'E'];
    
    let adaptacoesTexto = '';
    const temAdaptacoes = opcoesAdaptacao.fonteAmpliada || opcoesAdaptacao.negrito || 
                        opcoesAdaptacao.altoContraste || opcoesAdaptacao.layoutSimplificado;
    
    if (temAdaptacoes) {
        const adaptacoesSelecionadas = [];
        if (opcoesAdaptacao.fonteAmpliada) adaptacoesSelecionadas.push('Fonte Ampliada');
        if (opcoesAdaptacao.negrito) adaptacoesSelecionadas.push('Texto em Negrito');
        if (opcoesAdaptacao.altoContraste) adaptacoesSelecionadas.push('Alto Contraste');
        if (opcoesAdaptacao.layoutSimplificado) adaptacoesSelecionadas.push('Layout Simplificado');
        
        adaptacoesTexto = `
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 8px 12px; margin: 10px 0; border-radius: 8px;">
                <p style="margin: 0; font-size: 0.85rem; color: #92400e;">
                    <i class="fas fa-universal-access"></i> <strong>Prova Adaptada</strong> - Esta impressão inclui as seguintes adaptações: ${adaptacoesSelecionadas.join(', ')}.
                </p>
            </div>
        `;
    }
    
    let questoesHTML = '';
    
    questoes.forEach((questao, index) => {
        const opcoes = questao.opcoes || [];
        
        const opcoesFormatadas = opcoes.map((opcao, optIndex) => {
            const letra = letrasUsadas[optIndex];
            let opcaoLimpa = opcao || 'Opção não disponível';
            if (opcaoLimpa.startsWith(`${letra})`) || opcaoLimpa.startsWith(`${letra}.`)) {
                opcaoLimpa = opcaoLimpa.substring(2).trim();
            }
            return { letra, texto: opcaoLimpa };
        });
        
        questoesHTML += `
            <div class="questao-print">
                <div class="questao-numero">
                    Questão ${index + 1} ${isAdaptada ? '(Prova Adaptada - 3 alternativas)' : ''}
                </div>
                <div class="questao-texto">
                    <strong>${questao.pergunta || 'Pergunta não disponível'}</strong>
                </div>
                <div class="opcoes-print">
                    ${opcoesFormatadas.map(op => `
                        <div class="opcao-linha">
                            <span class="opcao-letra">${op.letra})</span>
                            <span class="opcao-texto">${op.texto}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="rascunho-area">
                    <small>Espaço para rascunho</small>
                    <div class="rascunho-linhas"></div>
                </div>
            </div>
        `;
    });
    
    const gerarCartaoResposta = () => {
        const IS_LOCALHOST = window.location.hostname === 'localhost' || 
                            window.location.hostname === '127.0.0.1';
        const IS_RENDER = window.location.hostname.includes('render.com') || 
                        window.location.hostname.includes('sistema-avaliativo');
        
        let API_BASE_URL;
        if (IS_LOCALHOST) {
            API_BASE_URL = 'http://localhost:3000';
        } else if (IS_RENDER) {
            API_BASE_URL = window.location.origin;
        } else {
            API_BASE_URL = window.location.origin;
        }
        
        const qrCodeArea = qrCodeDataUrl ? `
            <div style="text-align: center; margin-top: 10px; padding: 8px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; display: inline-block; width: auto;">
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
                    <img src="${qrCodeDataUrl}" style="width: 85px; height: auto; border: 1px solid #ccc; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" alt="QR Code">
                    <div style="font-size: 9px; color: #666; text-align: center;">
                        <strong>📱 Correção Automática</strong><br>
                        Escaneie este QR Code
                    </div>
                </div>
            </div>
        ` : '';
        
        const qrCodeAlunoArea = qrCodeAlunoUrl ? `
            <div style="text-align: center; margin-top: 10px; padding: 8px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px; display: inline-block; width: auto;">
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
                    <img src="${qrCodeAlunoUrl}" style="width: 85px; height: auto; border: 1px solid #ccc; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);" alt="QR Code do Aluno">
                    <div style="font-size: 9px; color: #666; text-align: center;">
                        <strong>👤 Identificação do Aluno</strong><br>
                        ${window.alunoSelecionadoNome || 'Aluno'}
                    </div>
                </div>
            </div>
        ` : '';
        
        return `
            <div style="text-align: center;">
                <div class="cartao-header" style="margin-bottom: 8px;">
                    <h4 style="margin: 0 0 5px 0; font-size: 11pt; font-weight: bold; text-align: center;">📝 CARTÃO-RESPOSTA</h4>
                    <div class="instrucoes-cartao" style="font-size: 8pt; color: #333; text-align: center; padding: 8px; background: #fef3c7; border-radius: 6px;">
                        <p style="margin: 0;"><strong>INSTRUÇÕES PARA PREENCHIMENTO DO CARTÃO-RESPOSTA</strong></p>
                        <p style="margin: 5px 0 0 0;">Ao marcar a alternativa correta no cartão-resposta (Gabarito), use caneta esferográfica de tinta azul ou preta. Será anulada a questão que contiver rasura ou, ainda, a que apresentar mais de uma alternativa assinalada no cartão-resposta (Gabarito).</p>
                    </div>
                </div>
                
                <div class="cartao-resposta" style="position: relative; margin: 8px auto; border: 2px solid #000; padding: 15px 12px 12px 12px; background: #fff; display: inline-block; width: 85%; box-sizing: border-box; max-width: 650px;">
                    <div style="position: absolute; top: 5px; left: 5px; width: 25px; height: 25px; background: #000 !important; border: 1px solid #000 !important; z-index: 5; print-color-adjust: exact;"></div>
                    <div style="position: absolute; top: 5px; right: 5px; width: 25px; height: 25px; background: #000 !important; border: 1px solid #000 !important; z-index: 5; print-color-adjust: exact;"></div>
                    <div style="position: absolute; bottom: 5px; left: 5px; width: 25px; height: 25px; background: #000 !important; border: 1px solid #000 !important; z-index: 5; print-color-adjust: exact;"></div>
                    <div style="position: absolute; bottom: 5px; right: 5px; width: 25px; height: 25px; background: #000 !important; border: 1px solid #000 !important; z-index: 5; print-color-adjust: exact;"></div>
                    
                    <table style="width: 100%; border-collapse: collapse; border: 1px solid #000;">
                        <thead>
                            <tr style="background: #e8e8e8;">
                                <th style="border: 1px solid #000; padding: 6px 3px; text-align: center; font-weight: bold; font-size: 8pt; width: 35px;">Q</th>
                                ${letrasUsadas.map(letra => `<th style="border: 1px solid #000; padding: 6px 3px; text-align: center; font-weight: bold; font-size: 8pt; width: 35px;">${letra}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${Array.from({ length: totalQuestoes }, (_, i) => {
                                const num = i + 1;
                                return `
                                    <tr>
                                        <td style="border: 1px solid #000; padding: 5px 3px; text-align: center; font-weight: bold; font-size: 8pt;">${num}</td>
                                        ${letrasUsadas.map(() => `
                                            <td style="border: 1px solid #000; padding: 5px 3px; text-align: center;">
                                                <div style="width: 12px; height: 12px; border: 1.5px solid #000; border-radius: 50%; margin: 0 auto;"></div>
                                            </td>
                                        `).join('')}
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div style="display: flex; justify-content: center; align-items: center; gap: 40px; margin-top: 15px; flex-wrap: wrap;">
                    ${qrCodeArea}
                    ${qrCodeAlunoArea}
                </div>
            </div>
        `;
    };
    
    let cssAdaptacoes = '';

    if (opcoesAdaptacao.caixaAlta) {
        cssAdaptacoes += `
            body, .questao-texto, .opcao-linha, .instrucoes-cartao, .questao-numero, 
            .cartao-header h4, .print-header h1, .print-prova-info h3, .label, .campo-label,
            .instrucoes-box h4, .info-label, .info-linha, .instrucoes-box li, .print-footer,
            .student-item, .campo-item, .cartao-resposta td, .cartao-resposta th,
            .rascunho-area small, .instrucoes-box ul, .instrucoes-box p,
            .student-item .label, .campo-item .campo-label, .info-linha .info-item,
            .print-prova-info .info-linha span, .questao-print, .opcoes-print,
            .opcao-linha .opcao-letra, .opcao-linha .opcao-texto, .print-header .student-row {
                text-transform: uppercase !important;
            }
        `;
    }

    if (opcoesAdaptacao.fontePersonalizada && opcoesAdaptacao.tamanhoFonte) {
        const tamanho = opcoesAdaptacao.tamanhoFonte;
        cssAdaptacoes += `
            body { font-size: ${tamanho}pt !important; }
            .questao-texto { font-size: ${tamanho}pt !important; }
            .opcao-linha { font-size: ${tamanho - 2}pt !important; }
            .instrucoes-cartao { font-size: ${tamanho - 5}pt !important; }
            .rascunho-area small { font-size: ${tamanho - 5}pt !important; }
            .questao-numero { font-size: ${tamanho - 2}pt !important; }
            .print-header h1 { font-size: ${tamanho + 4}pt !important; }
            .print-prova-info h3 { font-size: ${tamanho + 2}pt !important; }
            .campos-box .campo-label, .student-item .label { font-size: ${tamanho - 2}pt !important; }
            .instrucoes-box li, .instrucoes-box h4, .info-linha, .info-item { font-size: ${tamanho - 4}pt !important; }
            .cartao-resposta th, .cartao-resposta td { font-size: ${tamanho - 4}pt !important; }
            .instrucoes-cartao p { font-size: ${tamanho - 4}pt !important; }
            .print-footer { font-size: ${tamanho - 4.5}pt !important; }
        `;
    } 
    else if (opcoesAdaptacao.fonteAmpliada && !opcoesAdaptacao.fontePersonalizada) {
        cssAdaptacoes += `
            body { font-size: 16pt !important; }
            .questao-texto { font-size: 16pt !important; }
            .opcao-linha { font-size: 14pt !important; }
            .instrucoes-cartao { font-size: 11pt !important; }
            .rascunho-area small { font-size: 10pt !important; }
            .questao-numero { font-size: 14pt !important; }
            .print-header h1 { font-size: 18pt !important; }
            .print-prova-info h3 { font-size: 16pt !important; }
            .campos-box .campo-label, .student-item .label { font-size: 12pt !important; }
            .instrucoes-box li, .instrucoes-box h4, .info-linha, .info-item { font-size: 11pt !important; }
        `;
    }
    
    if (opcoesAdaptacao.negrito) {
        cssAdaptacoes += `
            body, .questao-texto, .opcao-linha, .instrucoes-cartao, .questao-numero, 
            .cartao-header h4, .print-header h1, .print-prova-info h3, .label, .campo-label,
            .instrucoes-box h4, .info-label, .info-linha, .instrucoes-box li, .print-footer {
                font-weight: bold !important;
            }
        `;
    }
    
    if (opcoesAdaptacao.altoContraste) {
        cssAdaptacoes += `
            body { background: #000000 !important; color: #ffffff !important; }
            .print-header, .campos-box, .instrucoes-box, .print-prova-info, 
            .cartao-resposta, .questao-print, .rascunho-area, .info-linha {
                background: #000000 !important;
                color: #ffffff !important;
                border-color: #ffffff !important;
            }
        `;
    }
    
    if (opcoesAdaptacao.layoutSimplificado) {
        cssAdaptacoes += `
            .print-logo, .logo-iema { display: none !important; }
            .campos-box { border: 1px solid #000 !important; }
            .instrucoes-box { border: 1px solid #000 !important; background: #fefefe !important; }
            .print-header { border-bottom: 1px solid #000 !important; }
        `;
    }
    
    return `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Prova - ${provaTitulo}</title>
            <style>
                @media print {
                    body { margin: 0; padding: 0; }
                    .questao-print { page-break-inside: avoid; }
                    .cartao-resposta { page-break-inside: avoid; }
                    .questoes-container { page-break-before: always; margin-top: 0; }
                }
                
                body {
                    font-family: 'Times New Roman', Times, serif;
                    font-size: 12pt;
                    line-height: 1.3;
                    margin: 0;
                    padding: 0.4in;
                    background: white;
                    color: black;
                }
                
                .print-header {
                    text-align: center;
                    margin-bottom: 6px;
                    padding-bottom: 6px;
                    border-bottom: 2px solid #000;
                }
                
                .print-logo {
                    max-width: 999px;
                    width: 100%;
                    height: auto;
                    display: block;
                    margin: 0 auto 3px auto;
                }
                
                .print-header h1 {
                    font-size: 14pt;
                    font-weight: bold;
                    margin: 0 0 5px 0;
                }
                
                .student-row {
                    display: flex;
                    justify-content: space-between;
                    margin: 4px 0;
                    gap: 15px;
                }
                
                .student-item {
                    flex: 1;
                    display: flex;
                    align-items: baseline;
                    gap: 6px;
                }
                
                .label {
                    font-weight: bold;
                    min-width: 65px;
                    font-size: 10pt;
                }
                
                .underline {
                    border-bottom: 1px dotted #000;
                    flex: 1;
                    height: 16px;
                }
                
                .campos-box {
                    margin: 6px 0;
                    border: 2px solid #000;
                    padding: 5px 12px;
                    display: flex;
                    justify-content: space-between;
                    gap: 20px;
                }
                
                .campo-item {
                    flex: 1;
                    display: flex;
                    align-items: baseline;
                    gap: 6px;
                }
                
                .campo-label {
                    font-weight: bold;
                    min-width: 35px;
                    font-size: 10pt;
                }
                
                .campo-underline {
                    border-bottom: 1px dotted #000;
                    flex: 1;
                    height: 16px;
                }
                
                .instrucoes-box {
                    margin: 6px 0;
                    border: 1px solid #ccc;
                    padding: 8px 12px;
                    background: #fefefe;
                    border-radius: 4px;
                }
                
                .instrucoes-box h4 {
                    margin: 0 0 5px 0;
                    font-size: 10pt;
                    font-weight: bold;
                    color: #4f46e5;
                    text-align: center;
                }
                
                .instrucoes-box ul {
                    margin: 0;
                    padding-left: 20px;
                }
                
                .instrucoes-box li {
                    margin-bottom: 3px;
                    font-size: 8.5pt;
                    line-height: 1.3;
                }
                
                .print-prova-info {
                    margin: 8px 0;
                    padding: 5px 8px;
                    border: 1px solid #ddd;
                    background: #fafafa;
                }
                
                .print-prova-info h3 {
                    margin: 0 0 3px 0;
                    font-size: 11pt;
                    text-align: center;
                    font-weight: bold;
                }
                
                .info-linha {
                    display: flex;
                    justify-content: space-between;
                    flex-wrap: wrap;
                    gap: 8px;
                    font-size: 8pt;
                    border-top: 1px solid #eee;
                    padding-top: 4px;
                    margin-top: 4px;
                }
                
                .questao-print {
                    margin-bottom: 20px;
                }
                
                .questao-numero {
                    font-weight: bold;
                    margin-bottom: 6px;
                    border-bottom: 1px solid #ccc;
                    padding-bottom: 3px;
                    font-size: 10pt;
                }
                
                .questao-texto {
                    margin-bottom: 10px;
                    margin-left: 8px;
                    line-height: 1.4;
                    font-size: 11pt;
                }
                
                .opcao-linha {
                    margin: 6px 0 6px 18px;
                    display: flex;
                    font-size: 10pt;
                }
                
                .opcao-letra {
                    min-width: 22px;
                    font-weight: 500;
                }
                
                .rascunho-area {
                    margin-top: 8px;
                    border-top: 1px dashed #ccc;
                    padding-top: 5px;
                }
                
                .rascunho-area small {
                    font-size: 7pt;
                }
                
                .rascunho-linhas {
                    min-height: 35px;
                    background: repeating-linear-gradient(transparent, transparent 16px, #eee 16px, #eee 18px);
                }
                
                .print-footer {
                    margin-top: 25px;
                    text-align: center;
                    font-size: 7.5pt;
                    color: #666;
                    border-top: 1px solid #ccc;
                    padding-top: 8px;
                }
                
                ${cssAdaptacoes}
            </style>
        </head>
        <body>
            <div class="print-header">
                <img src="${logoIema}" class="print-logo" alt="IEMA" onerror="this.style.display='none'">
                <h1>IEMA PLENO: SÃO LUÍS - CENTRO</h1>
                
                <div class="student-row">
                    <div class="student-item">
                        <span class="label">ESTUDANTE:</span>
                        <span class="underline"></span>
                    </div>
                </div>
                
                <div class="student-row">
                    <div class="student-item">
                        <span class="label">CURSO:</span>
                        <span class="underline"></span>
                    </div>
                    <div class="student-item">
                        <span class="label">TURMA:</span>
                        <span class="underline"></span>
                    </div>
                </div>
            </div>
            
            <div class="campos-box">
                <div class="campo-item"><span class="campo-label">Nota:</span><span class="campo-underline"></span></div>
                <div class="campo-item"><span class="campo-label">Ass.:</span><span class="campo-underline"></span></div>
                <div class="campo-item"><span class="campo-label">Data:</span><span class="campo-underline"></span></div>
            </div>
            
            <div class="instrucoes-box">
                <h4>📋 INSTRUÇÕES GERAIS</h4>
                <ul>
                    <li>Escreva seu nome de registro legível e não esqueça de assinar a lista de frequência.</li>
                    <li>Todas as anotações e cálculos devem ser feitos no caderno de prova.</li>
                    <li>Os celulares <strong>deverão ser desligados</strong> durante todo o período de realização da prova.</li>
                    <li>Cada questão contém apenas uma alternativa correta.</li>
                    <li>Leia e siga as instruções de preenchimento do cartão-resposta (GABARITO) abaixo.</li>
                </ul>
            </div>
            
            ${adaptacoesTexto}
            
            <div class="print-prova-info">
                <h3>${provaTitulo}</h3>
                <div class="info-linha">
                    <span class="info-item">Período: ${periodo}</span>
                    <span class="info-item">Turma: ${turmaNome}</span>
                    <span class="info-item">Disciplina: ${disciplina}</span>
                    <span class="info-item">Professor: ${professorNome}</span>
                    <span class="info-item">Questões: ${totalQuestoes}</span>
                </div>
            </div>
            
            ${gerarCartaoResposta()}
            
            <div class="questoes-container">
                ${questoesHTML}
            </div>
            
            <div class="print-footer">
                <p>EducaPleno - ${dataFormatada}</p>
                <p>📱 Escaneie o QR Code para correção automática</p>
                <p style="font-size: 6pt;">Aluno: ${window.alunoSelecionadoNome || '_________________'} | Turma: ${turmaNome} | Código: ${prova.codigo || 'N/A'}</p>
            </div>
            
            <div style="page-break-after: always;"></div>
        </body>
        </html>
    `;
}

function mostrarModalPerguntaAdaptacao() {
    let modal = document.getElementById('modalPerguntaAdaptacao');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'modalPerguntaAdaptacao';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px; border-radius: 24px; padding: 0;">
            <div class="modal-header" style="background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 20px 25px; border-radius: 24px 24px 0 0;">
                <h3 style="margin: 0; display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-print"></i> Imprimir Prova
                </h3>
                <button class="modal-close" onclick="fecharModal('modalPerguntaAdaptacao')" style="color: white;">&times;</button>
            </div>
            
            <div style="padding: 25px;">
                <p style="color: #4b5563; margin-bottom: 20px; text-align: center; font-size: 1rem;">
                    Deseja adaptar esta prova para acessibilidade?
                </p>
                
                <div style="margin-bottom: 20px; padding: 15px; background: #f8fafc; border-radius: 16px;">
                    <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; margin-bottom: 12px;">
                        <input type="radio" name="tipoImpressao" value="individual" checked onchange="toggleOpcaoAlunos()">
                        <span><strong>👤 Imprimir para um aluno específico</strong></span>
                    </label>
                    
                    <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                        <input type="radio" name="tipoImpressao" value="todos" onchange="toggleOpcaoAlunos()">
                        <span><strong>👥 Imprimir para todos os alunos da turma</strong></span>
                    </label>
                    
                    <div id="selectAlunosContainer" style="margin-top: 15px;">
                        <label style="display: block; margin-bottom: 8px; font-weight: 500; color: #374151;">
                            <i class="fas fa-user-graduate"></i> Selecione o aluno:
                        </label>
                        <select id="selectAlunoImpressao" class="form-control" style="width: 100%;">
                            <option value="">Carregando alunos...</option>
                        </select>
                    </div>
                    
                    <div style="margin-top: 12px; padding: 10px; background: #e0f2fe; border-radius: 8px; font-size: 0.85rem; color: #0369a1;">
                        <i class="fas fa-info-circle"></i>
                        <span id="infoImpressao">Ao selecionar "Imprimir para todos", será gerado um documento único com todos os alunos, cada um com seu QR Code individual.</span>
                    </div>
                </div>
                
                <div style="display: flex; gap: 15px; margin-top: 20px;">
                    <button onclick="fecharModal('modalPerguntaAdaptacao'); gerarImpressaoNormal()" style="
                        flex: 1;
                        padding: 14px;
                        background: #6b7280;
                        color: white;
                        border: none;
                        border-radius: 12px;
                        font-weight: 600;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                    ">
                        <i class="fas fa-times"></i> Não, imprimir normal
                    </button>
                    
                    <button onclick="fecharModal('modalPerguntaAdaptacao'); mostrarModalOpcoesAdaptacao()" style="
                        flex: 1;
                        padding: 14px;
                        background: linear-gradient(135deg, #10b981, #059669);
                        color: white;
                        border: none;
                        border-radius: 12px;
                        font-weight: 600;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                    ">
                        <i class="fas fa-universal-access"></i> Sim, adaptar
                    </button>
                </div>
            </div>
        </div>
    `;

    mostrarModal('modalPerguntaAdaptacao');
    carregarAlunosParaImpressao();
}

let alunosDaTurma = [];

async function carregarAlunosParaImpressao() {
    try {
        const { prova } = window.provaParaImpressao || {};
        
        console.log('🔍 Verificando dados da prova:', prova);
        
        if (!prova) {
            console.log('⚠️ Nenhuma prova encontrada');
            const select = document.getElementById('selectAlunoImpressao');
            if (select) {
                select.innerHTML = '<option value="">Nenhuma prova carregada</option>';
                select.disabled = true;
            }
            return;
        }
        
        let turmaId = prova.turmaId || prova.turma?.id || prova.turma;
        
        if (!turmaId) {
            console.log('⚠️ Nenhuma turma associada à prova');
            const select = document.getElementById('selectAlunoImpressao');
            if (select) {
                select.innerHTML = '<option value="">Nenhuma turma associada</option>';
                select.disabled = true;
            }
            return;
        }
        
        console.log('📚 Carregando turma ID:', turmaId);
        
        const tokenLocal = localStorage.getItem('auth_token');
        
        const response = await fetch(`/api/turmas/${turmaId}`, {
            headers: { 'Authorization': `Bearer ${tokenLocal}` }
        });
        
        console.log('📡 Resposta da API (GET /api/turmas/:id):', response.status);
        
        if (!response.ok) {
            throw new Error(`Erro ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📦 Dados da turma recebidos:', data);
        
        let alunosRaw = [];
        
        if (data.success && data.turma && data.turma.alunos) {
            alunosRaw = data.turma.alunos;
        } else if (data.turma && data.turma.alunos) {
            alunosRaw = data.turma.alunos;
        } else if (data.alunos) {
            alunosRaw = data.alunos;
        }
        
        console.log(`📊 Alunos brutos encontrados: ${alunosRaw.length}`);
        
        const alunosUnicos = new Map();
        
        for (const aluno of alunosRaw) {
            const alunoId = aluno._id || aluno.id || aluno.alunoId;
            
            if (alunoId && !alunosUnicos.has(alunoId.toString())) {
                alunosUnicos.set(alunoId.toString(), {
                    id: alunoId,
                    nome: aluno.nome || aluno.alunoNome || 'Aluno',
                    email: aluno.email || aluno.alunoEmail || '',
                    matricula: aluno.matricula || ''
                });
            }
        }
        
        alunosDaTurma = Array.from(alunosUnicos.values());
        
        console.log(`✅ Alunos únicos após remoção de duplicatas: ${alunosDaTurma.length}`);
        
        if (alunosDaTurma.length === 0) {
            const select = document.getElementById('selectAlunoImpressao');
            if (select) {
                select.innerHTML = '<option value="">Nenhum aluno encontrado nesta turma</option>';
                select.disabled = true;
            }
            return;
        }
        
        const select = document.getElementById('selectAlunoImpressao');
        if (select) {
            select.innerHTML = '<option value="">Selecione um aluno...</option>' + 
                alunosDaTurma.map(aluno => `
                    <option value="${aluno.id}">
                        ${aluno.nome} ${aluno.matricula ? `(${aluno.matricula})` : ''}
                    </option>
                `).join('');
            select.disabled = false;
            console.log(`✅ Select preenchido com ${alunosDaTurma.length} alunos únicos`);
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar alunos:', error);
        const select = document.getElementById('selectAlunoImpressao');
        if (select) {
            select.innerHTML = '<option value="">Erro ao carregar alunos. Tente novamente.</option>';
            select.disabled = true;
        }
    }
}

function toggleOpcaoAlunos() {
    const tipoImpressao = document.querySelector('input[name="tipoImpressao"]:checked')?.value;
    const selectContainer = document.getElementById('selectAlunosContainer');
    const infoSpan = document.getElementById('infoImpressao');
    
    if (tipoImpressao === 'individual') {
        if (selectContainer) {
            selectContainer.style.display = 'block';
        }
        if (infoSpan) {
            infoSpan.innerHTML = 'Será gerada uma prova com QR Code específico para o aluno selecionado.';
        }
    } else {
        if (selectContainer) {
            selectContainer.style.display = 'none';
        }
        if (infoSpan) {
            infoSpan.innerHTML = 'Será gerado um documento único com todos os alunos da turma. Cada aluno terá seu próprio QR Code e haverá quebra de página entre eles.';
        }
    }
    
    console.log(`🔄 Tipo de impressão alterado para: ${tipoImpressao === 'individual' ? 'Individual' : 'Todos os alunos'}`);
}

function mostrarModalOpcoesAdaptacao() {
    if (!window.provaParaImpressao || !window.provaParaImpressao.prova) {
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', '❌ Dados da prova não encontrados.', 'error');
        return;
    }
    
    const modalPergunta = document.getElementById('modalPerguntaAdaptacao');
    if (modalPergunta) modalPergunta.style.display = 'none';
    
    let modalOpcoes = document.getElementById('modalOpcoesAdaptacao');
    if (modalOpcoes) modalOpcoes.remove();
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'modalOpcoesAdaptacao';
    modal.style.display = 'flex';
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modal.style.zIndex = '10002';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    
    const { prova } = window.provaParaImpressao;
    const isAdaptada = prova?.tipoProva === 'adaptada' || prova?.adaptada === true;
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 580px; width: 90%; background: white; border-radius: 24px; padding: 0; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header" style="background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 20px 25px; border-radius: 24px 24px 0 0; display: flex; justify-content: space-between; position: sticky; top: 0; z-index: 10;">
                <h3 style="margin: 0;"><i class="fas fa-universal-access"></i> Opções de Adaptação</h3>
                <button onclick="fecharModalOpcoesAdaptacao()" style="background: none; border: none; color: white; font-size: 28px; cursor: pointer;">&times;</button>
            </div>
            <div style="padding: 25px;">
                ${isAdaptada ? `<div style="background: #dbeafe; padding: 10px; margin-bottom: 15px; border-radius: 8px;"><i class="fas fa-info-circle"></i> Prova originalmente adaptada - 3 alternativas</div>` : ''}
                
                <div style="display: flex; flex-direction: column; gap: 15px;">
                    <div style="background: #f8fafc; padding: 15px; border-radius: 16px; border: 2px solid #e5e7eb;">
                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer; margin-bottom: 10px;">
                            <input type="checkbox" id="optFonteDinamica" style="width: 20px; height: 20px;">
                            <div>
                                <strong style="font-size: 1rem;">🔍 Fonte Dinâmica</strong>
                                <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Amplie o tamanho da fonte conforme sua necessidade</p>
                            </div>
                        </label>
                        <div id="sliderContainer" style="display: none; margin-top: 15px; padding-top: 10px; border-top: 1px solid #e5e7eb;">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                <span style="font-size: 12px;">Normal (12pt)</span>
                                <span style="font-size: 12px; font-weight: bold;" id="tamanhoFonteAtual">12pt</span>
                                <span style="font-size: 12px;">Máximo (48pt)</span>
                            </div>
                            <input type="range" id="fonteSlider" min="12" max="48" step="1" value="12" style="width: 100%; margin: 10px 0;">
                            <div style="display: flex; justify-content: space-between; gap: 10px; margin-top: 10px;">
                                <button type="button" onclick="ajustarFonteRapido(12)" style="flex: 1; padding: 6px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Normal</button>
                                <button type="button" onclick="ajustarFonteRapido(18)" style="flex: 1; padding: 6px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Médio</button>
                                <button type="button" onclick="ajustarFonteRapido(24)" style="flex: 1; padding: 6px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Grande</button>
                                <button type="button" onclick="ajustarFonteRapido(36)" style="flex: 1; padding: 6px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Muito Grande</button>
                                <button type="button" onclick="ajustarFonteRapido(48)" style="flex: 1; padding: 6px; background: #e5e7eb; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">Máximo</button>
                            </div>
                            <div style="margin-top: 10px; padding: 8px; background: #f1f5f9; border-radius: 8px; text-align: center; font-size: 12px; color: #475569;">
                                <i class="fas fa-mouse-pointer"></i> <strong>Pré-visualização:</strong>
                                <span id="previewFonte" style="font-size: 12px; display: inline-block; margin-left: 8px;">Texto exemplo</span>
                            </div>
                        </div>
                    </div>
                    
                    <div style="background: #f8fafc; padding: 15px; border-radius: 16px; border: 2px solid #e5e7eb;">
                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                            <input type="checkbox" id="optCaixaAlta" style="width: 20px; height: 20px;">
                            <div>
                                <strong style="font-size: 1rem;">🔠 CAIXA ALTA (Maiúsculas)</strong>
                                <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Converte todo o texto para letras maiúsculas</p>
                            </div>
                        </label>
                        <div id="caixaAltaPreview" style="margin-top: 10px; padding: 8px; background: #fff; border-radius: 8px; font-size: 12px; color: #64748b; border: 1px solid #e5e7eb;">
                            <i class="fas fa-eye"></i> Pré-visualização: <span id="previewCaixaAlta">Exemplo de texto em maiúsculas</span>
                        </div>
                    </div>
                    
                    <div style="background: #f8fafc; padding: 15px; border-radius: 16px; border: 2px solid #e5e7eb;">
                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                            <input type="checkbox" id="optNegrito" style="width: 20px; height: 20px;">
                            <div>
                                <strong style="font-size: 1rem;">🔤 Texto em Negrito</strong>
                                <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Aplicar negrito em todo o texto da prova</p>
                            </div>
                        </label>
                    </div>
                    
                    <div style="background: #f8fafc; padding: 15px; border-radius: 16px; border: 2px solid #e5e7eb;">
                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                            <input type="checkbox" id="optAltoContraste" style="width: 20px; height: 20px;">
                            <div>
                                <strong style="font-size: 1rem;">🎨 Alto Contraste</strong>
                                <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Fundo escuro com texto claro para melhor visualização</p>
                            </div>
                        </label>
                    </div>
                    
                    <div style="background: #f8fafc; padding: 15px; border-radius: 16px; border: 2px solid #e5e7eb;">
                        <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                            <input type="checkbox" id="optLayoutSimplificado" style="width: 20px; height: 20px;">
                            <div>
                                <strong style="font-size: 1rem;">📄 Layout Simplificado</strong>
                                <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Remover elementos decorativos, manter apenas o essencial</p>
                            </div>
                        </label>
                    </div>
                </div>
                
                <div style="margin-top: 20px; padding: 12px; background: #fef3c7; border-radius: 12px;">
                    <p style="margin: 0; font-size: 0.85rem;"><i class="fas fa-lightbulb"></i> <strong>Dica:</strong> Você pode combinar várias opções conforme a necessidade do aluno.</p>
                </div>
                
                <div style="display: flex; gap: 12px; margin-top: 25px;">
                    <button type="button" onclick="gerarImpressaoAdaptada()" style="flex: 1; padding: 14px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Imprimir com Adaptações</button>
                    <button type="button" onclick="fecharModalOpcoesAdaptacao()" style="flex: 1; padding: 14px; background: #6b7280; color: white; border: none; border-radius: 12px; font-weight: 600; cursor: pointer;">Cancelar</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    setTimeout(() => {
        const fonteDinamicaCheckbox = document.getElementById('optFonteDinamica');
        const sliderContainer = document.getElementById('sliderContainer');
        const fonteSlider = document.getElementById('fonteSlider');
        const tamanhoAtual = document.getElementById('tamanhoFonteAtual');
        const previewFonte = document.getElementById('previewFonte');
        
        const caixaAltaCheckbox = document.getElementById('optCaixaAlta');
        const previewCaixaAlta = document.getElementById('previewCaixaAlta');
        
        if (caixaAltaCheckbox && previewCaixaAlta) {
            caixaAltaCheckbox.addEventListener('change', function() {
                if (this.checked) {
                    previewCaixaAlta.style.textTransform = 'uppercase';
                    previewCaixaAlta.style.fontWeight = 'bold';
                    previewCaixaAlta.style.color = '#10b981';
                    previewCaixaAlta.innerHTML = 'EXEMPLO DE TEXTO EM MAIÚSCULAS';
                } else {
                    previewCaixaAlta.style.textTransform = 'none';
                    previewCaixaAlta.style.fontWeight = 'normal';
                    previewCaixaAlta.style.color = '#64748b';
                    previewCaixaAlta.innerHTML = 'Exemplo de texto em maiúsculas';
                }
            });
        }
        
        if (fonteDinamicaCheckbox) {
            fonteDinamicaCheckbox.addEventListener('change', function() {
                sliderContainer.style.display = this.checked ? 'block' : 'none';
            });
        }
        
        if (fonteSlider) {
            fonteSlider.addEventListener('input', function() {
                const tamanho = this.value;
                tamanhoAtual.textContent = tamanho + 'pt';
                previewFonte.style.fontSize = tamanho + 'pt';
                previewFonte.style.fontWeight = 'bold';
            });
            fonteSlider.dispatchEvent(new Event('input'));
        }
    }, 100);
}

function fecharModalOpcoesAdaptacao() {
    const modal = document.getElementById('modalOpcoesAdaptacao');
    if (modal) modal.style.display = 'none';
}

function ajustarFonteRapido(tamanho) {
    const slider = document.getElementById('fonteSlider');
    const tamanhoAtual = document.getElementById('tamanhoFonteAtual');
    const previewFonte = document.getElementById('previewFonte');
    
    if (slider) {
        slider.value = tamanho;
        if (tamanhoAtual) tamanhoAtual.textContent = tamanho + 'pt';
        if (previewFonte) previewFonte.style.fontSize = tamanho + 'pt';
        
        const checkbox = document.getElementById('optFonteDinamica');
        if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
            const sliderContainer = document.getElementById('sliderContainer');
            if (sliderContainer) sliderContainer.style.display = 'block';
        }
    }
}

async function gerarImpressaoNormal() {
    const { prova, questoes, qrCodeDataUrl } = window.provaParaImpressao || {};
    if (!prova) {
        console.error('❌ Dados da prova não encontrados');
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', '❌ Erro: dados da prova não encontrados', 'error');
        return;
    }
    
    const tipoImpressao = document.querySelector('input[name="tipoImpressao"]:checked')?.value;
    const selectAluno = document.getElementById('selectAlunoImpressao');
    const alunoId = selectAluno?.value;
    const alunoNome = selectAluno?.options[selectAluno.selectedIndex]?.text.split('(')[0].trim();
    
    const modalPergunta = document.getElementById('modalPerguntaAdaptacao');
    if (modalPergunta) modalPergunta.style.display = 'none';
    
    if (tipoImpressao === 'todos') {
        const alunos = window.alunosDaTurma || [];
        if (alunos.length === 0) {
            mostrarAlerta('mostrarAlertaGeralMinhasProvas', '⚠️ Nenhum aluno encontrado nesta turma', 'info');
            return;
        }
        await gerarImpressaoTodosAlunos(prova, questoes, qrCodeDataUrl, {}, alunos);
        return;
    }
    
    if (!alunoId) {
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', '⚠️ Selecione um aluno', 'info');
        mostrarModalPerguntaAdaptacao();
        return;
    }
    
    let qrCodeAlunoUrl = null;
    try {
        const token = localStorage.getItem('auth_token');
        console.log(`📱 Buscando QR Code do aluno ${alunoId} no banco...`);
        
        const response = await fetch(`/api/aluno/qrcode/${alunoId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success && data.qrCode) {
            qrCodeAlunoUrl = data.qrCode;
            window.alunoSelecionadoNome = alunoNome;
            console.log(`✅ QR Code do aluno ${alunoNome} obtido do banco (gerado em ${data.geradoEm})`);
        } else {
            console.warn('⚠️ QR Code não encontrado no banco para o aluno:', alunoId);
            mostrarAlerta('mostrarAlertaGeralMinhasProvas', '⚠️ QR Code do aluno não encontrado. Peça para o aluno atualizar o cadastro.', 'warning');
        }
    } catch (error) {
        console.error('❌ Erro ao buscar QR Code do aluno no banco:', error);
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', '❌ Erro ao buscar QR Code do aluno', 'error');
    }
    
    await gerarHTMLImpressao(prova, questoes, qrCodeDataUrl, {}, qrCodeAlunoUrl);
}

async function gerarHTMLImpressao(prova, questoes, qrCodeDataUrl, opcoesAdaptacao = {}, qrCodeAlunoUrl = null) {
    mostrarAlerta('mostrarAlertaGeralMinhasProvas', '🖨️ Preparando impressão...', 'info');
    
    try {
        const printHTML = gerarHTMLProva(prova, questoes, qrCodeDataUrl, opcoesAdaptacao, qrCodeAlunoUrl);
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(printHTML);
        printWindow.document.close();
        
        printWindow.onload = function() {
            printWindow.print();
            printWindow.onafterprint = function() {
                printWindow.close();
            };
        };
        
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', '✅ Impressão preparada!', 'success');
        
    } catch (error) {
        console.error('❌ Erro:', error);
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', `❌ Erro: ${error.message}`, 'error');
    }
}

async function gerarImpressaoTodosAlunos(prova, questoes, qrCodeDataUrl, opcoesAdaptacao, alunos) {
    mostrarAlerta('mostrarAlertaGeralMinhasProvas', `🖨️ Gerando prova para ${alunos.length} aluno(s)...`, 'info');
    
    try {
        const token = localStorage.getItem('auth_token');
        
        const IS_LOCALHOST = window.location.hostname === 'localhost' || 
                            window.location.hostname === '127.0.0.1';
        const IS_RENDER = window.location.hostname.includes('render.com') || 
                        window.location.hostname.includes('sistema-avaliativo');
        
        let BASE_URL;
        if (IS_LOCALHOST) {
            BASE_URL = 'http://localhost:3000';
            console.log('🔧 Modo: DESENVOLVIMENTO LOCAL - QR Codes com localhost');
        } else if (IS_RENDER) {
            BASE_URL = window.location.origin;
            console.log('🚀 Modo: PRODUÇÃO (Render) - QR Codes com domínio do Render');
        } else {
            BASE_URL = window.location.origin;
            console.log('⚙️ Modo: FALLBACK - Usando origem atual');
        }
        
        const alunosComQRCode = await Promise.all(alunos.map(async (aluno) => {
            const alunoId = aluno.id || aluno._id;
            const alunoNome = aluno.nome || aluno.alunoNome || 'Aluno';
            
            console.log(`📱 Buscando QR Code do aluno ${alunoNome} no banco...`);
            
            let qrCodeAlunoUrl = '';
            try {
                const response = await fetch(`/api/aluno/qrcode/${alunoId}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                const data = await response.json();
                if (data.success && data.qrCode) {
                    qrCodeAlunoUrl = data.qrCode;
                    console.log(`✅ QR Code do aluno ${alunoNome} obtido do banco`);
                } else {
                    console.warn(`⚠️ QR Code não encontrado para ${alunoNome}`);
                }
            } catch (error) {
                console.error(`❌ Erro ao buscar QR Code para ${alunoNome}:`, error);
            }
            
            return { 
                ...aluno, 
                qrCodeDataUrl: qrCodeAlunoUrl,
                id: alunoId,
                nome: alunoNome
            };
        }));
        
        let htmlCompleto = '';
        
        for (let i = 0; i < alunosComQRCode.length; i++) {
            const aluno = alunosComQRCode[i];
            
            console.log(`📄 Gerando prova para: ${aluno.nome} (${i + 1}/${alunosComQRCode.length})`);
            
            window.alunoSelecionadoNome = aluno.nome;
            
            const htmlAluno = gerarHTMLProva(prova, questoes, qrCodeDataUrl, opcoesAdaptacao, aluno.qrCodeDataUrl);
            
            htmlCompleto += htmlAluno;
            
            if (i < alunosComQRCode.length - 1) {
                htmlCompleto += `<div style="page-break-before: always; break-before: page;"></div>`;
            }
        }
        
        const printWindow = window.open('', '_blank');
        printWindow.document.write(htmlCompleto);
        printWindow.document.close();
        
        printWindow.onload = function() {
            setTimeout(() => {
                printWindow.print();
                printWindow.onafterprint = function() {
                    printWindow.close();
                };
            }, 500);
        };
        
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', `✅ Impressão preparada para ${alunosComQRCode.length} aluno(s)!`, 'success');
        
    } catch (error) {
        console.error('❌ Erro:', error);
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', `❌ Erro: ${error.message}`, 'error');
    }
}

async function gerarImpressaoAdaptada() {
    const { prova, questoes, qrCodeDataUrl } = window.provaParaImpressao || {};
    if (!prova) {
        console.error('❌ Dados da prova não encontrados');
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', '❌ Erro: dados da prova não encontrados', 'error');
        return;
    }

    const fonteDinamicaHabilitada = document.getElementById('optFonteDinamica')?.checked || false;
    const tamanhoFonte = fonteDinamicaHabilitada ? (document.getElementById('fonteSlider')?.value || 12) : 12;
    
    const opcoes = {
        fonteAmpliada: fonteDinamicaHabilitada ? tamanhoFonte : false,
        fontePersonalizada: fonteDinamicaHabilitada ? tamanhoFonte : false,
        negrito: document.getElementById('optNegrito')?.checked || false,
        altoContraste: document.getElementById('optAltoContraste')?.checked || false,
        layoutSimplificado: document.getElementById('optLayoutSimplificado')?.checked || false,
        tamanhoFonte: parseInt(tamanhoFonte),
        caixaAlta: document.getElementById('optCaixaAlta')?.checked || false
    };
    
    console.log('🎨 Opções de adaptação selecionadas:', opcoes);
    
    const tipoImpressao = document.querySelector('input[name="tipoImpressao"]:checked')?.value || 'individual';
    const alunoSelecionadoId = document.getElementById('selectAlunoImpressao')?.value;
    
    const nenhumaOpcao = !opcoes.fontePersonalizada && !opcoes.negrito && !opcoes.altoContraste && !opcoes.layoutSimplificado && !opcoes.caixaAlta;
    
    if (nenhumaOpcao) {
        const confirmar = await confirm('Nenhuma opção de adaptação foi selecionada. Deseja imprimir a prova normalmente?');
        if (confirmar) {
            await gerarImpressaoNormal();
        } else {
            mostrarModalOpcoesAdaptacao();
        }
        return;
    }
    
    const modalOpcoes = document.getElementById('modalOpcoesAdaptacao');
    const modalPergunta = document.getElementById('modalPerguntaAdaptacao');
    if (modalOpcoes) modalOpcoes.style.display = 'none';
    if (modalPergunta) modalPergunta.style.display = 'none';
    
    let qrCodeAlunoUrl = null;
    let alunoNome = null;
    
    if (tipoImpressao === 'individual') {
        if (!alunoSelecionadoId) {
            mostrarAlerta('mostrarAlertaGeralMinhasProvas', '⚠️ Selecione um aluno para imprimir a prova individual', 'info');
            mostrarModalPerguntaAdaptacao();
            return;
        }
        
        const selectAluno = document.getElementById('selectAlunoImpressao');
        alunoNome = selectAluno?.options[selectAluno.selectedIndex]?.text.split('(')[0].trim() || 'Aluno';
        
        try {
            const token = localStorage.getItem('auth_token');
            console.log(`📱 Buscando QR Code do aluno ${alunoSelecionadoId} no banco...`);
            
            const response = await fetch(`/api/aluno/qrcode/${alunoSelecionadoId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success && data.qrCode) {
                qrCodeAlunoUrl = data.qrCode;
                window.alunoSelecionadoNome = alunoNome;
                console.log(`✅ QR Code do aluno ${alunoNome} obtido do banco`);
            } else {
                console.warn('⚠️ QR Code não encontrado no banco para o aluno:', alunoSelecionadoId);
                mostrarAlerta('mostrarAlertaGeralMinhasProvas', '⚠️ QR Code do aluno não encontrado. Peça para o aluno atualizar o cadastro.', 'warning');
            }
        } catch (error) {
            console.error('❌ Erro ao buscar QR Code do aluno no banco:', error);
        }
        
        const alunoSelecionado = alunosDaTurma.find(a => (a.id || a._id) === alunoSelecionadoId);
        if (alunoSelecionado) {
            await gerarHTMLImpressao(prova, questoes, qrCodeDataUrl, opcoes, qrCodeAlunoUrl);
        } else {
            mostrarAlerta('mostrarAlertaGeralMinhasProvas', '❌ Aluno não encontrado', 'error');
        }
    } else {
        if (alunosDaTurma.length === 0) {
            mostrarAlerta('mostrarAlertaGeralMinhasProvas', '⚠️ Nenhum aluno encontrado nesta turma', 'info');
            return;
        }
        await gerarImpressaoTodosAlunos(prova, questoes, qrCodeDataUrl, opcoes, alunosDaTurma);
    }
}

function fecharModalVisualizarProva() {
    const modal = document.getElementById('modalVisualizarProva');
    if (modal) {
        modal.style.display = 'none';
    }
}

window.compartilharProva = function(codigoProva) {
    if (!codigoProva || codigoProva === '') {
        mostrarAlertaGeral('Esta prova não tem código disponível');
        return;
    }
    
    navigator.clipboard.writeText(codigoProva)
        .then(() => {
            mostrarAlertaGeral(`✅ Código ${codigoProva} copiado para a área de transferência!`);
        })
        .catch(err => {
            mostrarAlertaGeral(`📋 Código: ${codigoProva}`);
        });
};

let mostrandoRascunhos = false;

function alternarRascunhos() {
    mostrandoRascunhos = !mostrandoRascunhos;
    
    const btn = document.getElementById('btnToggleRascunhos');
    if (btn) {
        if (mostrandoRascunhos) {
            btn.innerHTML = '<i class="fas fa-eye"></i> Ocultar Rascunhos';
            btn.style.background = '#dbeafe';
            btn.style.color = '#1e40af';
            btn.style.borderColor = '#93c5fd';
        } else {
            btn.innerHTML = '<i class="fas fa-eye-slash"></i> Mostrar Rascunhos';
            btn.style.background = '#f3f4f6';
            btn.style.color = '#6b7280';
            btn.style.borderColor = '#d1d5db';
        }
    }
    
    carregarProvasComFiltro();
}

async function carregarProvasComFiltro() {
    try {
        const token = localStorage.getItem('auth_token');
        const url = `/api/professor/provas${mostrandoRascunhos ? '?rascunhos=true' : ''}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            atualizarListaProvas(data.provas);
        }
    } catch (error) {
        console.error('Erro ao carregar provas:', error);
    }
}

async function editarProvaProfessor(provaId) {
    console.log('✏️ Professor editando prova:', provaId);
    
    try {
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', '📝 Carregando dados da prova...', 'info');
        
        const token = localStorage.getItem('auth_token');
        
        const response = await fetch(`/api/provas/${provaId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Erro ao carregar dados da prova');
        }
        
        const prova = data.prova;
        const questoes = data.questoes || [];
        
        console.log('📦 Dados da prova:', prova);
        
        let dataLimiteStr = '';
        if (prova.dataLimite) {
            const dataLimite = new Date(prova.dataLimite);
            const ano = dataLimite.getFullYear();
            const mes = String(dataLimite.getMonth() + 1).padStart(2, '0');
            const dia = String(dataLimite.getDate()).padStart(2, '0');
            dataLimiteStr = `${ano}-${mes}-${dia}`;
        }
        
        const horarioInicio = prova.horarioInicio || '08:00';
        const horarioTermino = prova.horarioTermino || '09:30';
        
        criarModalEdicaoProva(provaId, prova, questoes, dataLimiteStr, horarioInicio, horarioTermino);
        
    } catch (error) {
        console.error('❌ Erro ao carregar prova para edição:', error);
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', '❌ Erro: ' + error.message, 'error');
    }
}

function criarModalEdicaoProva(provaId, prova, questoes, dataLimiteStr, horarioInicio, horarioTermino) {
    let modal = document.getElementById('modalEditarProvaProfessor');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'modalEditarProvaProfessor';
        document.body.appendChild(modal);
    }
    
    let questoesHTML = '';
    questoes.forEach((q, index) => {
        const opcoes = q.opcoes || ['', '', '', '', ''];
        
        questoesHTML += `
            <div style="margin-bottom: 30px; padding: 20px; background: #f8fafc; border-radius: 12px; border-left: 4px solid #4f46e5;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h4 style="margin: 0; display: flex; align-items: center; gap: 10px;">
                        <span style="background: #4f46e5; color: white; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 50%;">
                            ${index + 1}
                        </span>
                        Questão ${index + 1}
                    </h4>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Pergunta</label>
                    <textarea id="edit-pergunta-${index}" rows="3" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">${q.pergunta || ''}</textarea>
                </div>
                
                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Opções</label>
                    ${opcoes.map((opcao, optIdx) => {
                        const letra = String.fromCharCode(65 + optIdx);
                        const isCorreta = optIdx === q.respostaCorreta;
                        return `
                        <div style="display: flex; gap: 10px; margin-bottom: 8px; align-items: center;">
                            <span style="font-weight: 600; min-width: 30px;">${letra})</span>
                            <input type="text" id="edit-opcao-${index}-${optIdx}" value="${opcao}" style="flex: 1; padding: 8px; border: 2px solid #e5e7eb; border-radius: 6px;">
                            <div style="display: flex; align-items: center; gap: 5px;">
                                <input type="radio" name="resposta-correta-${index}" value="${optIdx}" ${isCorreta ? 'checked' : ''} onchange="marcarRespostaCorretaProfessor(${index}, ${optIdx})">
                                <span>Correta</span>
                            </div>
                        </div>
                    `}).join('')}
                </div>
                
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Explicação</label>
                    <textarea id="edit-explicacao-${index}" rows="2" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">${q.explicacao || ''}</textarea>
                </div>
            </div>
        `;
    });
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header" style="background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 20px;">
                <h3 style="margin: 0; display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-edit"></i> Editar Prova
                </h3>
                <button class="modal-close" onclick="fecharModal('modalEditarProvaProfessor')" style="color: white;">&times;</button>
            </div>
            
            <div style="padding: 25px;">
                <div style="background: #f8fafc; padding: 20px; border-radius: 12px; margin-bottom: 25px;">
                    <h4 style="margin: 0 0 15px 0;">Informações Básicas</h4>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px;">
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Título</label>
                            <input type="text" id="edit-titulo" value="${prova.titulo || ''}" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                        </div>
                        
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Conteúdo</label>
                            <input type="text" id="edit-conteudo" value="${prova.conteudo || ''}" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                        </div>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Data Limite</label>
                            <input type="date" id="edit-data-limite" value="${dataLimiteStr}" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                        </div>
                        
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Horário Início</label>
                            <input type="time" id="edit-horario-inicio" value="${horarioInicio}" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                        </div>
                        
                        <div>
                            <label style="display: block; margin-bottom: 5px; font-weight: 600;">Horário Término</label>
                            <input type="time" id="edit-horario-termino" value="${horarioTermino}" style="width: 100%; padding: 10px; border: 2px solid #e5e7eb; border-radius: 8px;">
                        </div>
                    </div>
                </div>
                
                <h4 style="margin: 0 0 15px 0;">Questões (${questoes.length})</h4>
                <div id="questoes-edit-container">
                    ${questoesHTML}
                </div>
                
                <input type="hidden" id="questoes-count" value="${questoes.length}">
                
                <div style="display: flex; gap: 10px; margin-top: 25px;">
                    <button onclick="salvarEdicaoProvaProfessor('${provaId}')" style="flex: 1; padding: 12px; background: #10b981; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
                        <i class="fas fa-save"></i> Salvar Alterações
                    </button>
                    <button onclick="fecharModal('modalEditarProvaProfessor')" style="flex: 1; padding: 12px; background: #6b7280; color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">
                        <i class="fas fa-times"></i> Cancelar
                    </button>
                </div>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

window.marcarRespostaCorretaProfessor = function(questaoIndex, opcaoIndex) {
    console.log(`✅ Questão ${questaoIndex} - Resposta correta: ${opcaoIndex}`);
};

async function salvarEdicaoProvaProfessor(provaId) {
    try {
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', '💾 Salvando alterações...', 'info');
        
        const token = localStorage.getItem('auth_token');
        
        const dados = {
            titulo: document.getElementById('edit-titulo')?.value,
            conteudo: document.getElementById('edit-conteudo')?.value,
            dataLimite: document.getElementById('edit-data-limite')?.value,
            horarioInicio: document.getElementById('edit-horario-inicio')?.value,
            horarioTermino: document.getElementById('edit-horario-termino')?.value,
            questoes: []
        };
        
        const totalQuestoes = parseInt(document.getElementById('questoes-count')?.value || '0');
        
        for (let i = 0; i < totalQuestoes; i++) {
            const pergunta = document.getElementById(`edit-pergunta-${i}`)?.value;
            const explicacao = document.getElementById(`edit-explicacao-${i}`)?.value;
            
            const opcoes = [];
            let respostaCorreta = 0;
            
            const radios = document.getElementsByName(`resposta-correta-${i}`);
            for (let r of radios) {
                if (r.checked) {
                    respostaCorreta = parseInt(r.value);
                    break;
                }
            }
            
            for (let j = 0; j < 5; j++) {
                const opcao = document.getElementById(`edit-opcao-${i}-${j}`)?.value;
                if (opcao) {
                    opcoes.push(opcao);
                }
            }
            
            dados.questoes.push({
                pergunta,
                opcoes,
                respostaCorreta,
                explicacao
            });
        }
        
        console.log('📤 Enviando dados para:', `/api/professor/provas/${provaId}`);
        console.log('📦 Dados:', dados);
        
        const response = await fetch(`/api/professor/provas/${provaId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dados)
        });
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('❌ Resposta não é JSON:', text.substring(0, 200));
            throw new Error('Resposta do servidor não é JSON');
        }
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlerta('mostrarAlertaGeralMinhasProvas', '✅ Prova atualizada com sucesso!', 'success');
            fecharModal('modalEditarProvaProfessor');
            
            setTimeout(() => {
                if (typeof carregarProvasProfessor === 'function') {
                    carregarProvasProfessor();
                }
            }, 1500);
            
        } else {
            throw new Error(data.error || 'Erro ao salvar');
        }
        
    } catch (error) {
        console.error('❌ Erro:', error);
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', '❌ ' + error.message, 'error');
    }
}

function atualizarSelectTurmas() {
    const selectTurma = document.getElementById('turmaProva');
    if (!selectTurma) return;
    
    selectTurma.innerHTML = '<option value="">Selecione uma turma...</option>';
    
    if (turmasProfessor.length === 0) {
        selectTurma.innerHTML += `
            <option value="" disabled>
                ⚠️ Nenhuma turma disponível. Crie uma turma primeiro.
            </option>
        `;
        selectTurma.disabled = true;
        return;
    }
    
    turmasProfessor.forEach(turma => {
        const option = document.createElement('option');
        option.value = turma.id;
        option.textContent = `📚 ${turma.nome} - ${turma.disciplina} (${turma.totalAlunos || 0} alunos)`;
        
        if (turma.eixo === usuario.eixo) {
            option.style.fontWeight = 'bold';
            option.textContent += ` [${turma.eixo === 'natureza' ? '🌿 Natureza' : '📖 Humanas'}]`;
        }
        
        selectTurma.appendChild(option);
    });
    
    selectTurma.disabled = false;
}

function atualizarListaTurmas() {
    const listaTurmas = document.getElementById('listaTurmas');
    const heroTotalAlunos = document.getElementById('heroTotalAlunos');
    const heroTurmasAtivas = document.getElementById('heroTurmasAtivas');
    const heroTotalTurmas = document.getElementById('heroTotalTurmas');
    
    if (!listaTurmas) return;
    
    if (turmasProfessor.length === 0) {
        listaTurmas.innerHTML = `
            <div style="
                background: white;
                border-radius: 24px;
                padding: 60px 30px;
                text-align: center;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
                border: 1px solid #f3f4f6;
                width: 100%;
                box-sizing: border-box;
            ">
                <div style="
                    width: 80px;
                    height: 80px;
                    background: linear-gradient(135deg, #f3f4f6, #e5e7eb);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 20px;
                    font-size: 32px;
                    color: #9ca3af;
                ">
                    <i class="fas fa-school"></i>
                </div>
                <h3 style="color: #1f2937; font-size: 1.5rem; margin-bottom: 10px;">
                    Nenhuma turma criada
                </h3>
                <p style="color: #6b7280; max-width: 400px; margin: 0 auto 20px;">
                    Você ainda não criou nenhuma turma. Crie sua primeira turma na aba "Nova Turma".
                </p>
                <button onclick="mostrarTab('nova-turma')" style="
                    padding: 12px 24px;
                    background: linear-gradient(135deg, #8b5cf6, #6d28d9);
                    color: white;
                    border: none;
                    border-radius: 12px;
                    font-weight: 600;
                    font-size: 1rem;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    transition: all 0.3s;
                    box-shadow: 0 4px 6px rgba(139, 92, 246, 0.2);
                ">
                    <i class="fas fa-plus-circle"></i> Criar Primeira Turma
                </button>
            </div>
        `;
        
        if (heroTotalAlunos) heroTotalAlunos.textContent = '0';
        if (heroTurmasAtivas) heroTurmasAtivas.textContent = '0';
        if (heroTotalTurmas) heroTotalTurmas.textContent = '0';
        return;
    }
    
    const totalAlunos = turmasProfessor.reduce((sum, turma) => sum + (turma.totalAlunos || 0), 0);
    const turmasAtivas = turmasProfessor.filter(t => t.ativa !== false).length;
    
    if (heroTotalAlunos) heroTotalAlunos.textContent = totalAlunos;
    if (heroTurmasAtivas) heroTurmasAtivas.textContent = turmasAtivas;
    if (heroTotalTurmas) heroTotalTurmas.textContent = turmasProfessor.length;
    
    listaTurmas.innerHTML = `
        <div class="turmas-grid">
            ${turmasProfessor.map((turma, index) => {
                let eixoColor = '#8b5cf6';
                let eixoBg = '#f3e8ff';
                let eixoText = 'Geral';
                let eixoIcon = 'globe';
                
                if (turma.eixo === 'natureza') {
                    eixoColor = '#10b981';
                    eixoBg = '#d1fae5';
                    eixoText = 'Natureza';
                    eixoIcon = 'leaf';
                } else if (turma.eixo === 'humanas') {
                    eixoColor = '#8b5cf6';
                    eixoBg = '#ede9fe';
                    eixoText = 'Humanas';
                    eixoIcon = 'scroll';
                } else if (turma.eixo === 'linguagens') {
                    eixoColor = '#f59e0b';
                    eixoBg = '#fef3c7';
                    eixoText = 'Linguagens';
                    eixoIcon = 'language';
                }
                
                const status = turma.ativa !== false ? 'ativa' : 'inativa';
                const dataCriacao = turma.dataCriacao ? new Date(turma.dataCriacao).toLocaleDateString('pt-BR') : 'Data não disponível';
                
                return `
                    <div class="turma-card" style="
                        background: white;
                        border-radius: 12px;
                        overflow: hidden;
                        box-shadow: 0 3px 10px rgba(0, 0, 0, 0.08);
                        border-left: 4px solid ${eixoColor};
                        transition: all 0.3s;
                        width: 100%;
                        box-sizing: border-box;
                    ">
                        <div style="padding: 20px;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 15px;">
                                <div style="flex: 1;">
                                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;">
                                        <span class="badge-eixo" style="
                                            background: ${eixoBg};
                                            color: ${eixoColor};
                                            padding: 4px 12px;
                                            border-radius: 30px;
                                            font-size: 0.75rem;
                                            font-weight: 600;
                                            border: 1px solid ${eixoColor}30;
                                        ">
                                            <i class="fas fa-${eixoIcon}"></i> ${eixoText}
                                        </span>
                                        <span style="
                                            padding: 4px 12px;
                                            border-radius: 30px;
                                            font-size: 0.75rem;
                                            font-weight: 600;
                                            background: ${status === 'ativa' ? '#d1fae5' : '#fee2e2'};
                                            color: ${status === 'ativa' ? '#065f46' : '#991b1b'};
                                            display: inline-flex;
                                            align-items: center;
                                            gap: 4px;
                                        ">
                                            <i class="fas fa-${status === 'ativa' ? 'check-circle' : 'times-circle'}"></i>
                                            ${status === 'ativa' ? 'Ativa' : 'Inativa'}
                                        </span>
                                    </div>
                                    <h3 style="margin: 0; font-size: 1.2rem; font-weight: 600; color: #1f2937; word-break: break-word;">
                                        ${turma.nome}
                                    </h3>
                                    <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 0.9rem; word-break: break-word;">
                                        ${turma.disciplina}
                                    </p>
                                </div>
                                <div style="
                                    background: #f3f4f6;
                                    padding: 6px 12px;
                                    border-radius: 6px;
                                    font-family: 'Monaco', monospace;
                                    font-weight: 600;
                                    color: ${eixoColor};
                                    font-size: 0.85rem;
                                    flex-shrink: 0;
                                ">
                                    <i class="fas fa-hashtag" style="font-size: 0.8rem; opacity: 0.5;"></i> ${turma.codigo || 'N/A'}
                                </div>
                            </div>
                            
                            ${turma.descricao ? `
                                <div style="
                                    margin-top: 15px;
                                    padding: 12px;
                                    background: #f9fafb;
                                    border-radius: 8px;
                                    border-left: 3px solid ${eixoColor};
                                ">
                                    <p style="margin: 0; color: #4b5563; font-size: 0.9rem; line-height: 1.5;">
                                        ${turma.descricao}
                                    </p>
                                </div>
                            ` : ''}
                            
                            <div style="
                                display: flex;
                                gap: 15px;
                                margin-top: 15px;
                                font-size: 0.9rem;
                                color: #6b7280;
                                flex-wrap: wrap;
                            ">
                                <div style="display: flex; align-items: center; gap: 5px;">
                                    <i class="fas fa-users" style="color: ${eixoColor};"></i>
                                    <span><strong>${turma.totalAlunos || 0}</strong> alunos</span>
                                </div>
                                
                                <div style="display: flex; align-items: center; gap: 5px;">
                                    <i class="fas fa-file-alt" style="color: ${eixoColor};"></i>
                                    <span><strong>${turma.totalProvas || 0}</strong> provas</span>
                                </div>
                                
                                <div style="display: flex; align-items: center; gap: 5px;">
                                    <i class="fas fa-calendar" style="color: ${eixoColor};"></i>
                                    <span>${dataCriacao}</span>
                                </div>
                            </div>
                        </div>
                        
                        <div style="
                            display: flex;
                            gap: 8px;
                            padding: 15px 20px;
                            background: #f9fafb;
                            border-top: 1px solid #e5e7eb;
                        ">
                            <button onclick="verTurma('${turma.id}')" style="
                                flex: 1;
                                padding: 10px;
                                background: white;
                                color: ${eixoColor};
                                border: 1px solid ${eixoColor}30;
                                border-radius: 8px;
                                cursor: pointer;
                                font-weight: 600;
                                font-size: 0.9rem;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                gap: 5px;
                                transition: all 0.2s;
                            "
                            onmouseover="this.style.background='${eixoColor}10'; this.style.borderColor='${eixoColor}'"
                            onmouseout="this.style.background='white'; this.style.borderColor='${eixoColor}30'">
                                <i class="fas fa-eye"></i> Detalhes
                            </button>
                            
                            <button onclick="solicitarExclusaoTurma('${turma.id}', '${turma.nome.replace(/'/g, "\\'")}')" style="
                                padding: 10px 15px;
                                background: #fee2e2;
                                color: #dc2626;
                                border: none;
                                border-radius: 8px;
                                cursor: pointer;
                                font-weight: 600;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                transition: all 0.2s;
                            "
                            onmouseover="this.style.background='#fecaca'; this.style.color='#b91c1c'"
                            onmouseout="this.style.background='#fee2e2'; this.style.color='#dc2626'">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

// ============================================
// FUNÇÕES PARA ANEXOS
// ============================================
let anexos = [];
let arquivosParaUpload = [];

function inicializarTabsAnexos() {
    const tabs = document.querySelectorAll('.anexo-tab');
    
    tabs.forEach(tab => {
        tab.removeAttribute('onclick');
        
        tab.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const tipo = this.getAttribute('data-tipo');
            if (tipo) {
                mostrarTipoAnexo(tipo);
            }
        });
    });
}

function mostrarTipoAnexo(tipo) {
    console.log(`📎 Mostrando tab de anexos: ${tipo}`);
    
    document.querySelectorAll('.anexo-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-anexo-content').forEach(content => {
        content.style.display = 'none';
    });
    
    const tabAtiva = document.querySelector(`.anexo-tab[data-tipo="${tipo}"]`);
    if (tabAtiva) {
        tabAtiva.classList.add('active');
    }
    
    const conteudo = document.getElementById(`tab-${tipo}`);
    if (conteudo) {
        conteudo.style.display = 'block';
    }
}

function mudarTipoProva() {
    const tipoProva = document.getElementById('tipoProva').value;
    const secaoAnexos = document.getElementById('secaoAnexos');
    
    if (tipoProva === 'enem') {
        secaoAnexos.style.display = 'block';
        setTimeout(() => {
            if (typeof mostrarTabAnexo === 'function') {
                mostrarTabAnexo('upload');
            }
        }, 100);
    } else {
        secaoAnexos.style.display = 'none';
        anexos = [];
        arquivosParaUpload = [];
        atualizarListaAnexos();
    }
    
    if (tipoProva === 'adaptada') {
        mostrarAlerta('mostrarAlertaGeralProva', 
            '🎯 Modo Prova Adaptada ativado! As questões terão apenas 3 alternativas e serão enviadas exclusivamente para alunos com necessidades de acessibilidade.', 
            'info'
        );
        
        const dificuldadeSelect = document.getElementById('dificuldade');
        if (dificuldadeSelect && dificuldadeSelect.value === 'dificil') {
            dificuldadeSelect.value = 'media';
            mostrarAlerta('mostrarAlertaGeralProva', 'ℹ️ Dificuldade ajustada para "Médio" (recomendado para prova adaptada)', 'info');
        }
    }
}

function adicionarTexto() {
    const titulo = document.getElementById('textoTitulo').value.trim();
    const conteudo = document.getElementById('textoConteudo').value.trim();
    
    if (!titulo) {
        mostrarAlerta('mostrarAlertaGeralProva', '⚠️ Digite um título para o texto', 'info');
        return;
    }
    
    if (!conteudo) {
        mostrarAlerta('mostrarAlertaGeralProva', '⚠️ Digite o conteúdo do texto', 'info');
        return;
    }
    
    if (conteudo.length > 10000) {
        mostrarAlerta('mostrarAlertaGeralProva', '⚠️ O texto é muito longo (máx: 10,000 caracteres)', 'error');
        return;
    }
    
    const novoAnexo = {
        tipo: 'texto',
        titulo: titulo,
        conteudo: conteudo,
        descricao: document.getElementById('textoDescricao').value.trim(),
        data: new Date().toISOString()
    };
    
    anexos.push(novoAnexo);
    atualizarListaAnexos();
    
    document.getElementById('textoTitulo').value = '';
    document.getElementById('textoConteudo').value = '';
    document.getElementById('textoDescricao').value = '';
    document.getElementById('charCount').textContent = '10000';
    
    mostrarAlerta('mostrarAlertaGeralProva', `✅ Texto "${titulo}" adicionado!`, 'success');
}

function adicionarLink() {
    const titulo = document.getElementById('linkTitulo').value.trim();
    const url = document.getElementById('linkURL').value.trim();
    
    if (!titulo) {
        mostrarAlerta('mostrarAlertaGeralProva', '⚠️ Digite um título para o link', 'info');
        return;
    }
    
    if (!url) {
        mostrarAlerta('mostrarAlertaGeralProva', '⚠️ Digite a URL do link', 'info');
        return;
    }
    
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        mostrarAlerta('mostrarAlertaGeralProva', '⚠️ Digite uma URL válida (comece com http:// ou https://)', 'error');
        return;
    }
    
    const novoAnexo = {
        tipo: 'link',
        titulo: titulo,
        url: url,
        descricao: document.getElementById('linkDescricao').value.trim(),
        data: new Date().toISOString()
    };
    
    anexos.push(novoAnexo);
    atualizarListaAnexos();
    
    document.getElementById('linkTitulo').value = '';
    document.getElementById('linkURL').value = '';
    document.getElementById('linkDescricao').value = '';
    
    mostrarAlerta('mostrarAlertaGeralProva', `✅ Link "${titulo}" adicionado!`, 'success');
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    console.log(`📁 ${files.length} arquivo(s) selecionado(s)`);
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        
        if (file.size > 10 * 1024 * 1024) {
            mostrarAlerta('mostrarAlertaGeralProva', `⚠️ Arquivo "${file.name}" muito grande (máx: 10MB)`, 'error');
            continue;
        }
        
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'text/plain', 
                            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        const allowedExtensions = /\.(pdf|jpg|jpeg|png|gif|txt|doc|docx)$/i;
        
        if (!allowedTypes.includes(file.type) && !file.name.match(allowedExtensions)) {
            mostrarAlerta('mostrarAlertaGeralProva', `⚠️ Tipo de arquivo não permitido: "${file.name}"`, 'error');
            continue;
        }
        
        const arquivoExistente = arquivosParaUpload.find(f => 
            f.name === file.name && f.size === file.size
        );
        
        if (arquivoExistente) {
            console.log(`📄 Arquivo duplicado ignorado: ${file.name}`);
            continue;
        }
        
        arquivosParaUpload.push(file);
        console.log(`✅ Arquivo adicionado: ${file.name} (${formatFileSize(file.size)})`);
        
        mostrarPreviewArquivo(file);
    }
    
    atualizarContadorAnexos();
    
    console.log('📊 Estado atual dos arquivos para upload:', {
        total: arquivosParaUpload.length,
        arquivos: arquivosParaUpload.map(f => ({ name: f.name, size: f.size, type: f.type }))
    });
    
    e.target.value = '';
}

function handleFiles(files) {
    Array.from(files).forEach(file => {
        if (file.size > 10 * 1024 * 1024) {
            mostrarAlerta('mostrarAlertaGeralProva', `⚠️ Arquivo "${file.name}" muito grande (máx: 10MB)`, 'error');
            return;
        }
        
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'text/plain', 
                            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        
        if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|jpg|jpeg|png|gif|txt|doc|docx)$/i)) {
            mostrarAlerta('mostrarAlertaGeralProva', `⚠️ Tipo de arquivo não permitido: "${file.name}"`, 'error');
            return;
        }
        
        arquivosParaUpload.push(file);
        mostrarPreviewArquivo(file);
    });
    
    document.getElementById('fileInput').value = '';
}

function mostrarPreviewArquivo(file) {
    const listaAnexos = document.getElementById('listaAnexos');
    const emptyAnexos = document.getElementById('emptyAnexos');
    
    if (emptyAnexos) {
        emptyAnexos.style.display = 'none';
    }
    
    let iconClass = 'fa-file';
    let iconColor = 'other';
    
    if (file.type === 'application/pdf') {
        iconClass = 'fa-file-pdf';
        iconColor = 'pdf';
    } else if (file.type.startsWith('image/')) {
        iconClass = 'fa-file-image';
        iconColor = 'image';
    } else if (file.type === 'text/plain') {
        iconClass = 'fa-file-alt';
        iconColor = 'text';
    } else if (file.type.includes('word')) {
        iconClass = 'fa-file-word';
        iconColor = 'text';
    }
    
    const fileSize = formatFileSize(file.size);
    const fileId = 'file-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    const fileHTML = `
        <div class="file-preview" id="${fileId}">
            <div class="file-info">
                <div class="file-icon ${iconColor}">
                    <i class="fas ${iconClass}"></i>
                </div>
                <div class="file-details">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${fileSize}</div>
                    <div style="margin-top: 5px; font-size: 0.8rem; color: #6b7280;">
                        <i class="fas fa-clock"></i> Será enviado ao gerar a prova
                    </div>
                </div>
                <button onclick="removerArquivoPreview('${fileId}', '${file.name}')" style="
                    background: #ef4444; 
                    color: white; 
                    border: none; 
                    width: 30px; 
                    height: 30px; 
                    border-radius: 50%; 
                    cursor: pointer; 
                    display: flex; 
                    align-items: center; 
                    justify-content: center;
                ">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `;
    
    listaAnexos.insertAdjacentHTML('afterbegin', fileHTML);
    atualizarContadorAnexos();
}

async function removerArquivoPreview(fileId, fileName) {
    const confirmar = await confirm(`Remover o arquivo "${fileName}" da lista?`);
    if (confirmar) {
        const element = document.getElementById(fileId);
        if (element) {
            element.remove();
        }
        
        arquivosParaUpload = arquivosParaUpload.filter(f => f.name !== fileName);
        atualizarContadorAnexos();
        
        if (arquivosParaUpload.length === 0 && anexos.length === 0) {
            const emptyAnexos = document.getElementById('emptyAnexos');
            if (emptyAnexos) {
                emptyAnexos.style.display = 'block';
            }
        }
    }
}

function atualizarListaAnexos() {
    const listaAnexos = document.getElementById('listaAnexos');
    const emptyAnexos = document.getElementById('emptyAnexos');
    
    if (anexos.length === 0 && arquivosParaUpload.length === 0) {
        if (emptyAnexos) {
            emptyAnexos.style.display = 'block';
        }
        listaAnexos.innerHTML = '';
        return;
    }
    
    if (emptyAnexos) {
        emptyAnexos.style.display = 'none';
    }
    
    let html = '';
    
    anexos.forEach((anexo, index) => {
        let icon, colorClass, tipoTexto;
        
        switch(anexo.tipo) {
            case 'texto':
                icon = 'fa-file-alt';
                colorClass = 'anexo-texto';
                tipoTexto = 'Texto';
                break;
            case 'link':
                icon = 'fa-link';
                colorClass = 'anexo-link';
                tipoTexto = 'Link';
                break;
            default:
                icon = 'fa-file';
                colorClass = 'anexo-outro';
                tipoTexto = 'Arquivo';
        }
        
        html += `
            <div class="anexo-card ${colorClass}">
                <div class="anexo-info">
                    <div class="anexo-titulo">
                        <i class="fas ${icon}"></i>
                        ${anexo.titulo}
                        <span style="font-size: 0.8rem; background: #e5e7eb; padding: 2px 8px; border-radius: 10px; color: #6b7280;">
                            ${tipoTexto}
                        </span>
                    </div>
                    
                    ${anexo.descricao ? `
                    <div class="anexo-descricao">${anexo.descricao}</div>
                    ` : ''}
                    
                    <div class="anexo-metadata">
                        ${anexo.url && anexo.tipo === 'link' ? 
                            `<span><i class="fas fa-external-link-alt"></i> <a href="${anexo.url}" target="_blank" style="color: #3b82f6;">Abrir link</a></span>` : 
                        anexo.conteudo ? 
                            `<span><i class="fas fa-text-height"></i> ${anexo.conteudo.length} caracteres</span>` : ''}
                    </div>
                </div>
                
                <div class="anexo-acoes">
                    <button onclick="removerAnexo(${index})" style="
                        background: #ef4444; 
                        color: white; 
                        border: none; 
                        width: 32px; 
                        height: 32px; 
                        border-radius: 50%; 
                        cursor: pointer; 
                        display: flex; 
                        align-items: center; 
                        justify-content: center;
                    ">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    listaAnexos.innerHTML = html;
    atualizarContadorAnexos();
}

async function removerAnexo(index) {
    const confirmar = await confirm('Remover este material?');
    if (confirmar) {
        anexos.splice(index, 1);
        atualizarListaAnexos();
    }
}

function configurarContadorTexto() {
    const textarea = document.getElementById('textoConteudo');
    if (textarea) {
        textarea.addEventListener('input', function() {
            const charCount = 10000 - this.value.length;
            const charCountElement = document.getElementById('charCount');
            if (charCountElement) {
                charCountElement.textContent = charCount;
                
                if (charCount < 0) {
                    charCountElement.style.color = '#ef4444';
                } else if (charCount < 100) {
                    charCountElement.style.color = '#f59e0b';
                } else {
                    charCountElement.style.color = '#6b7280';
                }
            }
        });
    }
}

function atualizarContadorAnexos() {
    const totalAnexos = anexos.length + arquivosParaUpload.length;
    const contadorElement = document.getElementById('contadorAnexos');
    if (contadorElement) {
        contadorElement.textContent = totalAnexos;
        
        if (arquivosParaUpload.length > 0) {
            contadorElement.style.background = '#f59e0b';
            contadorElement.title = `${arquivosParaUpload.length} arquivo(s) aguardando upload`;
        } else {
            contadorElement.style.background = '';
            contadorElement.title = '';
        }
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function uploadArquivosPendentes() {
    const resultados = [];
    
    for (const file of arquivosParaUpload) {
        try {
            const resultado = await uploadArquivoIndividual(file);
            resultados.push(resultado);
        } catch (error) {
            console.error(`Erro ao fazer upload de ${file.name}:`, error);
            throw error;
        }
    }
    
    return resultados;
}

async function uploadArquivoIndividual(file) {
    const formData = new FormData();
    formData.append('arquivo', file);
    
    const token = localStorage.getItem('auth_token');
    
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    if (response.success) {
                        resolve({
                            tipo: response.file.tipo || 'arquivo',
                            titulo: response.file.nome || file.name,
                            nomeArquivo: response.file.nomeArquivo || file.name,
                            tamanho: response.file.tamanho || file.size,
                            url: response.file.url,
                            mimetype: file.type
                        });
                    } else {
                        reject(new Error(response.error || `Erro no upload de ${file.name}`));
                    }
                } catch (e) {
                    reject(new Error(`Resposta inválida do servidor para ${file.name}`));
                }
            } else {
                reject(new Error(`Erro HTTP ${xhr.status}: ${xhr.statusText}`));
            }
        });
        
        xhr.addEventListener('error', () => {
            reject(new Error(`Erro de rede ao fazer upload de ${file.name}`));
        });
        
        xhr.open('POST', '/api/upload/temp');
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
    });
}

async function limparTodosAnexos() {
    const confirmar = await confirm('Tem certeza que deseja remover todos os materiais adicionados?');
    if (confirmar) {
        anexos = [];
        arquivosParaUpload = [];
        
        const listaAnexos = document.getElementById('listaAnexos');
        if (listaAnexos) {
            listaAnexos.innerHTML = '';
        }
        
        const emptyAnexos = document.getElementById('emptyAnexos');
        if (emptyAnexos) {
            emptyAnexos.style.display = 'block';
        }
        
        document.getElementById('textoTitulo').value = '';
        document.getElementById('textoConteudo').value = '';
        document.getElementById('textoDescricao').value = '';
        document.getElementById('linkTitulo').value = '';
        document.getElementById('linkURL').value = '';
        document.getElementById('linkDescricao').value = '';
        document.getElementById('fileInput').value = '';
        
        atualizarContadorAnexos();
        mostrarAlerta('mostrarAlertaGeralProva', '✅ Todos os materiais foram removidos', 'success');
    }
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
        dropZone.classList.add('drop-zone-active');
    }
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
        dropZone.classList.remove('drop-zone-active');
    }
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
        dropZone.classList.remove('drop-zone-active');
    }
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFiles(files);
    }
}

async function uploadArquivo(file, fileId) {
    const formData = new FormData();
    formData.append('arquivo', file);
    
    const token = localStorage.getItem('auth_token');
    
    try {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                const progressBar = document.getElementById(`progress-${fileId}`);
                if (progressBar) {
                    progressBar.style.width = percentComplete + '%';
                }
            }
        });
        
        xhr.addEventListener('load', () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                if (response.success) {
                    const anexo = {
                        tipo: response.file.tipo,
                        titulo: response.file.nome,
                        nomeArquivo: response.file.nomeArquivo,
                        tamanho: response.file.tamanho,
                        url: response.file.url,
                        mimetype: file.type,
                        status: 'uploaded'
                    };
                    
                    if (response.file.tipo === 'texto' && response.file.conteudo) {
                        anexo.conteudo = response.file.conteudo;
                    }
                    
                    anexos.push(anexo);
                    atualizarContadorAnexos();
                    
                    const progressBar = document.getElementById(`progress-${fileId}`);
                    if (progressBar) {
                        progressBar.style.background = '#10b981';
                    }
                    
                    arquivosParaUpload = arquivosParaUpload.filter(f => f.name !== file.name);
                }
            }
        });
        
        xhr.addEventListener('error', () => {
            mostrarAlerta('mostrarAlertaGeralProva', `❌ Erro ao fazer upload de "${file.name}"`, 'error');
            
            const progressBar = document.getElementById(`progress-${fileId}`);
            if (progressBar) {
                progressBar.style.background = '#ef4444';
            }
        });
        
        xhr.open('POST', '/api/upload/temp');
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
        
    } catch (error) {
        console.error('Erro no upload:', error);
        mostrarAlerta('mostrarAlertaGeralProva', `❌ Erro ao fazer upload: ${error.message}`, 'error');
    }
}

async function removerArquivoUpload(fileId, fileName) {
    const confirmar = await confirm(`Remover o arquivo "${fileName}"?`);
    if (confirmar) {
        const element = document.getElementById(fileId);
        if (element) {
            element.remove();
        }
        
        arquivosParaUpload = arquivosParaUpload.filter(f => f.name !== fileName);
        anexos = anexos.filter(a => a.nomeArquivo !== fileName);
        atualizarContadorAnexos();
        
        if (anexos.length === 0 && arquivosParaUpload.length === 0) {
            const emptyAnexos = document.getElementById('emptyAnexos');
            if (emptyAnexos) {
                emptyAnexos.style.display = 'block';
            }
        }
    }
}

async function processarAnexosParaEnvio() {
    const todosAnexos = [];
    
    console.log(`📦 Processando anexos para envio:`);
    console.log(`   - Textos/Links: ${anexos.length}`);
    console.log(`   - Arquivos para upload: ${arquivosParaUpload.length}`);
    
    anexos.forEach(anexo => {
        console.log(`   ↳ Anexo já existente: ${anexo.tipo} - "${anexo.titulo}"`);
        
        const anexoCopia = { ...anexo };
        todosAnexos.push(anexoCopia);
    });
    
    if (arquivosParaUpload.length > 0) {
        console.log(`📤 Iniciando upload de ${arquivosParaUpload.length} arquivo(s)`);
        
        const token = localStorage.getItem('auth_token');
        if (!token) {
            console.error('❌ Token de autenticação não encontrado');
            return todosAnexos;
        }
        
        const uploadPromises = arquivosParaUpload.map(async (file, index) => {
            try {
                console.log(`⬆️ Uploading arquivo ${index + 1}/${arquivosParaUpload.length}: ${file.name} (${formatFileSize(file.size)})`);
                
                const formData = new FormData();
                formData.append('arquivo', file);
                
                const response = await fetch('/api/upload/temp', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    },
                    body: formData
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }
                
                const result = await response.json();
                
                if (result.success && result.file) {
                    console.log(`✅ Upload concluído: ${file.name}`);
                    
                    return {
                        tipo: result.file.tipo || 'arquivo',
                        titulo: result.file.nome || file.name,
                        nomeArquivo: result.file.nomeArquivo || file.name,
                        tamanho: result.file.tamanho || file.size,
                        url: result.file.url,
                        mimetype: file.type,
                        data: new Date().toISOString()
                    };
                } else {
                    throw new Error(result.error || `Upload falhou para ${file.name}`);
                }
                
            } catch (error) {
                console.error(`❌ Erro ao processar arquivo ${file.name}:`, error);
                return null;
            }
        });
        
        try {
            const resultados = await Promise.all(uploadPromises);
            
            const anexosArquivos = resultados.filter(r => r !== null);
            todosAnexos.push(...anexosArquivos);
            
            console.log(`✅ ${anexosArquivos.length}/${arquivosParaUpload.length} arquivos processados com sucesso`);
            
        } catch (error) {
            console.error('❌ Erro geral no upload de arquivos:', error);
        }
    }
    
    console.log(`📤 Total de anexos para envio: ${todosAnexos.length}`);
    console.log('📝 Lista completa de anexos:', todosAnexos.map(a => ({
        tipo: a.tipo,
        titulo: a.titulo,
        tamanho: a.tamanho || 'N/A',
        url: a.url || 'N/A'
    })));
    
    return todosAnexos;
}

function mostrarTabAnexo(tipo) {
    console.log(`📎 Mostrando tab de anexos: ${tipo}`);
    
    document.querySelectorAll('.anexo-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-anexo-content').forEach(content => {
        content.style.display = 'none';
    });
    
    const tabAtiva = document.querySelector(`.anexo-tab[onclick*="${tipo}"]`);
    if (tabAtiva) {
        tabAtiva.classList.add('active');
    }
    
    const conteudo = document.getElementById(`tab-${tipo}`);
    if (conteudo) {
        conteudo.style.display = 'block';
    }
}

function atualizarEstatisticasTurmas() {
    try {
        const totalTurmas = turmasProfessor.length;
        const totalAlunos = turmasProfessor.reduce((sum, turma) => sum + (turma.totalAlunos || 0), 0);
        const totalProvas = turmasProfessor.reduce((sum, turma) => sum + (turma.totalProvas || 0), 0);
        const turmasAtivas = turmasProfessor.filter(t => t.ativa !== false).length;
        const mediaAlunos = totalTurmas > 0 ? Math.round(totalAlunos / totalTurmas) : 0;
        
        console.log('📊 Atualizando estatísticas:', {
            totalTurmas,
            totalAlunos,
            totalProvas,
            turmasAtivas,
            mediaAlunos
        });
        
        const headerTotalTurmas = document.getElementById('totalTurmas');
        const headerTotalAlunos = document.getElementById('totalAlunos');
        
        if (headerTotalTurmas) headerTotalTurmas.textContent = totalTurmas;
        if (headerTotalAlunos) headerTotalAlunos.textContent = totalAlunos;
        
        const statTurmasAtivasEl = document.getElementById('statTurmasAtivas');
        const statTotalProvasEl = document.getElementById('statTotalProvas');
        const statMediaAlunosEl = document.getElementById('statMediaAlunos');
        const turmaStatsEl = document.getElementById('turmaStats');
        
        if (statTurmasAtivasEl) statTurmasAtivasEl.textContent = turmasAtivas;
        if (statTotalProvasEl) statTotalProvasEl.textContent = totalProvas;
        if (statMediaAlunosEl) statMediaAlunosEl.textContent = mediaAlunos;
        
        if (turmaStatsEl) {
            turmaStatsEl.style.display = totalTurmas > 0 ? 'flex' : 'none';
        }
        
    } catch (error) {
        console.error('❌ Erro em atualizarEstatisticasTurmas:', error);
    }
}

function mostrarAlerta(elementId, mensagem, tipo = 'info') {
    const mostrarAlertaGerala = document.getElementById(elementId);
    if (!mostrarAlertaGerala) {
        console.error('Elemento de mostrarAlertaGerala não encontrado:', elementId);
        return;
    }
    
    mostrarAlertaGerala.innerHTML = `
        <div style="display: flex; align-items: flex-start; gap: 10px;">
            <i class="fas fa-${tipo === 'success' ? 'check-circle' : tipo === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <div>
                <strong>${tipo === 'success' ? 'Sucesso!' : tipo === 'error' ? 'Erro!' : 'Informação'}</strong>
                <p style="margin: 5px 0 0 0;">${mensagem}</p>
            </div>
        </div>
    `;
    
    mostrarAlertaGerala.className = `mostrarAlertaGeral mostrarAlertaGeral-${tipo}`;
    mostrarAlertaGerala.style.display = 'block';
    
    if (tipo !== 'error') {
        setTimeout(() => {
            mostrarAlertaGerala.style.display = 'none';
        }, 5000);
    }
}

async function criarNovaTurma(dadosTurma) {
    try {
        const token = localStorage.getItem('auth_token');
        
        console.log('🏫 Criando nova turma:', dadosTurma);
        
        const response = await fetch('/api/turmas', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dadosTurma)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Erro HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            return { 
                success: true, 
                data: data,
                mensagem: '✅ Turma criada com sucesso!' 
            };
        } else {
            throw new Error(data.error || 'Erro desconhecido');
        }
        
    } catch (error) {
        console.error('Erro ao criar turma:', error);
        return { 
            success: false, 
            error: '❌ Erro ao criar turma: ' + error.message 
        };
    }
}

async function excluirTurma(turmaId) {
    try {
        const token = localStorage.getItem('auth_token');
        
        console.log('🗑️ Excluindo turma:', turmaId);
        
        const response = await fetch(`/api/turmas/${turmaId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Erro HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            return { 
                success: true, 
                mensagem: '✅ Turma excluída com sucesso!' 
            };
        } else {
            throw new Error(data.error || 'Erro desconhecido');
        }
        
    } catch (error) {
        console.error('Erro ao excluir turma:', error);
        return { 
            success: false, 
            error: '❌ Erro ao excluir turma: ' + error.message 
        };
    }
}

function solicitarExclusaoTurma(turmaId, turmaNome) {
    turmaParaExcluir = { id: turmaId, nome: turmaNome };
    
    const modalConteudo = document.getElementById('modalExcluirConteudo');
    if (modalConteudo) {
        modalConteudo.innerHTML = `
            <p>Tem certeza que deseja excluir a turma <strong>"${turmaNome}"</strong>?</p>
            <div style="margin-top: 15px; padding: 15px; background: #fef2f2; border-radius: 8px; border-left: 4px solid #ef4444;">
                <i class="fas fa-exclamation-circle" style="color: #ef4444; margin-right: 10px;"></i>
                <div style="display: inline-block; vertical-align: middle;">
                    <strong style="color: #7f1d1d;">Atenção:</strong> 
                    <ul style="margin: 10px 0 0 20px; color: #7f1d1d;">
                        <li>Se houver provas, a exclusão será bloqueada</li>
                        <li>Exclua as provas primeiro ou peça para um admin</li>
                        <li>Alunos serão removidos da turma</li>
                    </ul>
                </div>
            </div>
        `;
    }
    
    mostrarModal('modalExcluirTurma');
}

async function testarRotaExclusao() {
    try {
        const token = localStorage.getItem('auth_token');
        const testeId = 'teste';
        
        console.log('🔍 Testando rota de exclusão...');
        
        const response = await fetch(`/api/professor/provas/${testeId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Status da resposta:', response.status);
        console.log('Headers:', Object.fromEntries(response.headers.entries()));
        
        const text = await response.text();
        console.log('Conteúdo da resposta:', text);
        
        try {
            const json = JSON.parse(text);
            console.log('JSON parseado:', json);
        } catch (e) {
            console.log('Resposta não é JSON válido:', e.message);
        }
        
    } catch (error) {
        console.error('Erro no teste:', error);
    }
}

function mostrarModal(id) {
    document.getElementById(id).style.display = 'flex';
}

function fecharModal(id) {
    document.getElementById(id).style.display = 'none';
}

async function gerarProvaComIA(dadosProva) {
    try {
        const token = localStorage.getItem('auth_token');
        
        console.log('🤖 Enviando dados para gerar prova:', dadosProva);
        
        let response;
        
        if (dadosProva.tipoProva === 'enem' && dadosProva.anexos && dadosProva.anexos.length > 0) {
            const formDataObj = new FormData();
            
            for (const key in dadosProva) {
                if (key !== 'anexos' && key !== 'turmaId') {
                    formDataObj.append(key, dadosProva[key]);
                }
            }
            
            formDataObj.append('anexosData', JSON.stringify(dadosProva.anexos));
            
            response = await fetch(`/api/turmas/${dadosProva.turmaId}/prova-v2`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formDataObj
            });
        } else {
            response = await fetch(`/api/turmas/${dadosProva.turmaId}/prova-v2`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dadosProva)
            });
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            return { 
                success: true, 
                data: data,
                mensagem: data.mensagem || '✅ Prova gerada com sucesso!' 
            };
        } else {
            throw new Error(data.error || 'Erro desconhecido');
        }
        
    } catch (error) {
        console.error('❌ Erro ao gerar prova:', error);
        return { 
            success: false, 
            error: '❌ Erro ao gerar prova: ' + error.message 
        };
    }
}

async function confirmarExclusaoTurma() {
    if (!turmaParaExcluir) {
        mostrarAlerta('mostrarAlertaGeralMinhasTurmas', '❌ Nenhuma turma selecionada para exclusão', 'error');
        fecharModal('modalExcluirTurma');
        return;
    }
    
    try {
        const token = localStorage.getItem('auth_token');
        const turmaId = turmaParaExcluir.id || turmaParaExcluir;
        const turmaNome = turmaParaExcluir.nome;
        
        document.getElementById('modalExcluirConteudo').innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: #4f46e5; margin-bottom: 15px;"></i>
                <p>Excluindo turma...</p>
                <p style="font-size: 0.9rem; color: #6b7280;">Por favor, aguarde.</p>
            </div>
        `;
        
        const buttons = document.querySelectorAll('#modalExcluirTurma button');
        buttons.forEach(btn => btn.disabled = true);
        
        const response = await fetch(`/api/turmas/${turmaId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        let data;
        if (response.headers.get('content-type')?.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            data = { success: response.ok, message: text || 'Turma excluída' };
        }
        
        if (data.success) {
            mostrarAlerta('mostrarAlertaGeralMinhasTurmas', `✅ ${data.message || 'Turma excluída com sucesso!'}`, 'success');
            
            turmasProfessor = turmasProfessor.filter(t => t.id !== turmaId);
            
            atualizarListaTurmas();
            atualizarEstatisticasTurmas();
            atualizarSelectTurmas();
            
            fecharModal('modalExcluirTurma');
            
        } else {
            throw new Error(data.error || data.message || `Erro ${response.status}: ${response.statusText}`);
        }
        
    } catch (error) {
        console.error('❌ Erro ao excluir turma:', error);
        
        document.getElementById('modalExcluirConteudo').innerHTML = `
            <div style="text-align: center; padding: 20px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: #ef4444; margin-bottom: 15px;"></i>
                <h3 style="color: #7f1d1d;">Erro ao excluir turma</h3>
                <p style="color: #6b7280;">${error.message}</p>
                <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
                    <button onclick="confirmarExclusaoTurma()" style="padding: 10px 20px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        Tentar novamente
                    </button>
                    <button onclick="fecharModal('modalExcluirTurma')" style="padding: 10px 20px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        Cancelar
                    </button>
                </div>
            </div>
        `;
    } finally {
        const buttons = document.querySelectorAll('#modalExcluirTurma button');
        buttons.forEach(btn => btn.disabled = false);
    }
}

async function exportarDadosProvasPDF() {
    try {
        console.log('📊 Exportando relatório de provas em PDF...');
        
        if (!provasOriginais || provasOriginais.length === 0) {
            mostrarAlerta('mostrarAlertaGeralMinhasProvas', '⚠️ Não há dados de provas para exportar', 'info');
            return;
        }

        const totalAtivas = provasOriginais.filter(p => p.status === 'ativa' && p.publicada).length;
        const totalConcluidas = provasOriginais.filter(p => p.status === 'concluida' || p.cancelada).length;
        const totalRascunhos = provasOriginais.filter(p => !p.publicada).length;
        const mediaGeral = (provasOriginais.reduce((acc, p) => acc + (p.mediaNotas || 0), 0) / provasOriginais.length).toFixed(1);

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Relatório de Provas</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        margin: 30px;
                        color: #333;
                    }
                    .header { 
                        text-align: center; 
                        margin-bottom: 30px;
                        padding: 20px;
                        background: linear-gradient(135deg, #4f46e5, #7c3aed);
                        color: white;
                        border-radius: 10px;
                    }
                    .header h1 { margin: 0; font-size: 24px; }
                    .header p { margin: 5px 0 0; opacity: 0.9; }
                    .stats-container {
                        display: flex;
                        justify-content: space-between;
                        margin: 30px 0;
                        gap: 15px;
                    }
                    .stat-card {
                        flex: 1;
                        background: #f8fafc;
                        padding: 20px;
                        border-radius: 10px;
                        text-align: center;
                        border-left: 4px solid #4f46e5;
                    }
                    .stat-number {
                        font-size: 28px;
                        font-weight: bold;
                        color: #4f46e5;
                    }
                    .stat-label {
                        font-size: 14px;
                        color: #64748b;
                        margin-top: 5px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 20px 0;
                        font-size: 12px;
                    }
                    th {
                        background: #4f46e5;
                        color: white;
                        padding: 12px;
                        text-align: left;
                    }
                    td {
                        padding: 10px;
                        border-bottom: 1px solid #e2e8f0;
                    }
                    tr:nth-child(even) {
                        background: #f8fafc;
                    }
                    .status-ativa { color: #10b981; font-weight: bold; }
                    .status-concluida { color: #f59e0b; font-weight: bold; }
                    .status-rascunho { color: #6b7280; font-weight: bold; }
                    .badge {
                        padding: 4px 8px;
                        border-radius: 12px;
                        font-size: 11px;
                        font-weight: bold;
                    }
                    .badge-facil { background: #d1fae5; color: #065f46; }
                    .badge-media { background: #fef3c7; color: #92400e; }
                    .badge-dificil { background: #fee2e2; color: #991b1b; }
                    .footer {
                        margin-top: 30px;
                        text-align: center;
                        color: #64748b;
                        font-size: 11px;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>📚 Relatório de Provas</h1>
                    <p>Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</p>
                </div>

                <div class="stats-container">
                    <div class="stat-card">
                        <div class="stat-number">${provasOriginais.length}</div>
                        <div class="stat-label">Total de Provas</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${totalAtivas}</div>
                        <div class="stat-label">Ativas</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${totalConcluidas}</div>
                        <div class="stat-label">Concluídas</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${mediaGeral}</div>
                        <div class="stat-label">Média Geral</div>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Título</th>
                            <th>Turma</th>
                            <th>Tipo</th>
                            <th>Dificuldade</th>
                            <th>Questões</th>
                            <th>Status</th>
                            <th>Alunos</th>
                            <th>Média</th>
                            <th>Data Limite</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${provasOriginais.map(prova => {
                            const tipo = prova.tipoProva === 'enem' ? 'ENEM' : 
                                    (prova.adaptada ? 'Adaptada' : 'Simples');
                            const dificuldadeClass = prova.dificuldade === 'facil' ? 'badge-facil' : 
                                                    (prova.dificuldade === 'dificil' ? 'badge-dificil' : 'badge-media');
                            const statusClass = prova.publicada ? 
                                (prova.cancelada ? 'status-concluida' : 
                                (prova.dataLimite && new Date(prova.dataLimite) < new Date() ? 'status-concluida' : 'status-ativa')) 
                                : 'status-rascunho';
                            const statusText = prova.publicada ? 
                                (prova.cancelada ? 'Cancelada' : 
                                (prova.dataLimite && new Date(prova.dataLimite) < new Date() ? 'Concluída' : 'Ativa')) 
                                : 'Rascunho';
                            
                            return `
                                <tr>
                                    <td><strong>${prova.titulo || 'Sem título'}</strong></td>
                                    <td>${prova.turma?.nome || prova.turma || 'N/A'}</td>
                                    <td>${tipo}</td>
                                    <td><span class="badge ${dificuldadeClass}">${prova.dificuldade || 'Médio'}</span></td>
                                    <td>${prova.quantidadeQuestoes || 0}</td>
                                    <td class="${statusClass}">${statusText}</td>
                                    <td>${prova.alunosRealizaram || 0}/${prova.totalAlunos || 0}</td>
                                    <td><strong>${(prova.mediaNotas || 0).toFixed(1)}</strong></td>
                                    <td>${prova.dataLimite ? new Date(prova.dataLimite).toLocaleDateString('pt-BR') : 'N/A'}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>

                <div class="footer">
                    <p>Relatório gerado automaticamente pelo EducaPleno</p>
                    <p>Total de ${provasOriginais.length} provas • ${provasOriginais.reduce((acc, p) => acc + (p.quantidadeQuestoes || 0), 0)} questões</p>
                </div>
            </body>
            </html>
        `;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        
        printWindow.focus();
        
        setTimeout(() => {
            printWindow.print();
        }, 500);

        mostrarAlerta('mostrarAlertaGeralMinhasProvas', '✅ PDF gerado! Clique em "Salvar" ou "Imprimir" para baixar.', 'success');

    } catch (error) {
        console.error('❌ Erro ao exportar PDF:', error);
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', `❌ Erro ao exportar: ${error.message}`, 'error');
    }
}

window.mostrarOpcoesExportacao = function() {
    console.log('📋 Abrindo modal de exportação com TODOS os filtros');
    
    const filtroStatus = document.getElementById('filtroStatus');
    const statusSelecionado = filtroStatus ? filtroStatus.value : 'todos';
    const statusTexto = filtroStatus && filtroStatus.selectedIndex >= 0 ? 
        filtroStatus.options[filtroStatus.selectedIndex]?.text.replace(/[▶️✅✏️❌📋]/g, '').trim() : 
        'Todos';
    
    const filtroDificuldade = document.getElementById('filtroDificuldade');
    const dificuldadeSelecionada = filtroDificuldade ? filtroDificuldade.value : 'todas';
    const dificuldadeTexto = filtroDificuldade && filtroDificuldade.selectedIndex >= 0 ? 
        filtroDificuldade.options[filtroDificuldade.selectedIndex]?.text.replace(/[⚖️🟢🟡🔴]/g, '').trim() : 
        'Todas';
    
    const filtroTipo = document.getElementById('filtroTipo');
    const tipoSelecionado = filtroTipo ? filtroTipo.value : 'todos';
    const tipoTexto = filtroTipo && filtroTipo.selectedIndex >= 0 ? 
        filtroTipo.options[filtroTipo.selectedIndex]?.text.replace(/[📚📄🎯♿]/g, '').trim() : 
        'Todos';
    
    const filtroPeriodo = document.getElementById('filtroPeriodoProvas');
    const periodoSelecionado = filtroPeriodo ? filtroPeriodo.value : 'todos';
    let periodoTexto = 'Todos os períodos';
    let periodoSelecionadoFlag = false;
    
    if (filtroPeriodo && filtroPeriodo.selectedIndex >= 0) {
        const selectedOption = filtroPeriodo.options[filtroPeriodo.selectedIndex];
        periodoTexto = selectedOption ? selectedOption.text.replace('📅', '').trim() : 'Todos os períodos';
        periodoSelecionadoFlag = periodoSelecionado && periodoSelecionado !== 'todos';
    }
    
    const filtroTurma = document.getElementById('filtroTurmaProvas');
    let turmaId = '';
    let turmaNome = 'Todas as turmas';
    let turmaSelecionada = false;
    
    if (filtroTurma) {
        turmaId = filtroTurma.value;
        if (filtroTurma.selectedIndex >= 0) {
            const selectedOption = filtroTurma.options[filtroTurma.selectedIndex];
            turmaNome = selectedOption ? selectedOption.text.replace('🏫', '').trim() : 'Todas as turmas';
        }
        turmaSelecionada = turmaId && turmaId !== 'todas' && turmaId !== '';
    }
    
    const buscaInput = document.getElementById('buscaProva');
    const buscaTexto = buscaInput ? buscaInput.value : '';
    const temBusca = buscaTexto && buscaTexto.trim() !== '';
    
    console.log('📋 FILTROS DETECTADOS:', {
        status: statusTexto,
        dificuldade: dificuldadeTexto,
        tipo: tipoTexto,
        periodo: periodoTexto,
        turma: turmaNome,
        busca: buscaTexto || 'vazio'
    });
    
    let totalRegistros = 0;
    if (window.dadosNotas && window.dadosNotas.length > 0) {
        let dadosFiltrados = [...window.dadosNotas];
        
        if (turmaId && turmaId !== 'todas') {
            dadosFiltrados = dadosFiltrados.filter(d => d.turmaId === turmaId);
        }
        
        totalRegistros = dadosFiltrados.length;
    }
    
    let modal = document.getElementById('modalExportacao');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'modalExportacao';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 650px; border-radius: 24px;">
            <div class="modal-header" style="padding: 20px 25px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; color: #1f2937; display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-file-export" style="color: #4f46e5;"></i> 
                    Exportar Relatórios
                </h3>
                <button class="modal-close" onclick="this.closest('.modal').style.display='none'" style="background: none; border: none; font-size: 24px; cursor: pointer;">&times;</button>
            </div>
            
            <div style="padding: 25px;">
                <div style="margin-bottom: 25px; background: #f8fafc; border-radius: 16px; padding: 20px; border: 1px solid #e5e7eb;">
                    <h4 style="margin: 0 0 15px 0; color: #1f2937; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-sliders-h" style="color: #4f46e5;"></i>
                        Filtros Ativos na Aba "Minhas Provas"
                    </h4>
                    
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px;">
                        <div style="background: white; padding: 12px; border-radius: 12px; border-left: 4px solid ${statusSelecionado !== 'todos' ? '#4f46e5' : '#9ca3af'};">
                            <div style="font-size: 0.8rem; color: #6b7280; margin-bottom: 4px;">Status</div>
                            <div style="font-weight: 600; color: ${statusSelecionado !== 'todos' ? '#1f2937' : '#6b7280'};">
                                ${statusTexto}
                            </div>
                        </div>
                        
                        <div style="background: white; padding: 12px; border-radius: 12px; border-left: 4px solid ${dificuldadeSelecionada !== 'todas' ? '#f59e0b' : '#9ca3af'};">
                            <div style="font-size: 0.8rem; color: #6b7280; margin-bottom: 4px;">Dificuldade</div>
                            <div style="font-weight: 600; color: ${dificuldadeSelecionada !== 'todas' ? '#1f2937' : '#6b7280'};">
                                ${dificuldadeTexto}
                            </div>
                        </div>
                        
                        <div style="background: white; padding: 12px; border-radius: 12px; border-left: 4px solid ${tipoSelecionado !== 'todos' ? '#10b981' : '#9ca3af'};">
                            <div style="font-size: 0.8rem; color: #6b7280; margin-bottom: 4px;">Tipo de Prova</div>
                            <div style="font-weight: 600; color: ${tipoSelecionado !== 'todos' ? '#1f2937' : '#6b7280'};">
                                ${tipoTexto}
                            </div>
                        </div>
                        
                        <div style="background: white; padding: 12px; border-radius: 12px; border-left: 4px solid ${periodoSelecionadoFlag ? '#f97316' : '#9ca3af'};">
                            <div style="font-size: 0.8rem; color: #6b7280; margin-bottom: 4px;">
                                <i class="fas fa-calendar-week" style="color: #f97316;"></i> Período Letivo
                            </div>
                            <div style="font-weight: 600; color: ${periodoSelecionadoFlag ? '#1f2937' : '#6b7280'};">
                                ${periodoTexto}
                            </div>
                        </div>
                        
                        <div style="background: white; padding: 12px; border-radius: 12px; border-left: 4px solid ${turmaSelecionada ? '#8b5cf6' : '#9ca3af'};">
                            <div style="font-size: 0.8rem; color: #6b7280; margin-bottom: 4px;">Turma</div>
                            <div style="font-weight: 600; color: ${turmaSelecionada ? '#1f2937' : '#6b7280'};">
                                ${turmaNome}
                            </div>
                        </div>
                    </div>
                    
                    ${temBusca ? `
                    <div style="margin-top: 15px; background: white; padding: 12px; border-radius: 12px; border-left: 4px solid #3b82f6;">
                        <div style="font-size: 0.8rem; color: #6b7280; margin-bottom: 4px;">Busca por texto</div>
                        <div style="font-weight: 600; color: #1f2937;">
                            "${buscaTexto}"
                        </div>
                    </div>
                    ` : ''}
                    
                    <div style="margin-top: 15px; padding: 10px; background: #e0f2fe; border-radius: 10px; color: #0369a1; font-size: 0.9rem;">
                        <i class="fas fa-info-circle"></i>
                        <strong>Resumo:</strong> 
                        ${statusSelecionado !== 'todos' ? `Status: ${statusTexto} • ` : ''}
                        ${dificuldadeSelecionada !== 'todas' ? `Dificuldade: ${dificuldadeTexto} • ` : ''}
                        ${tipoSelecionado !== 'todos' ? `Tipo: ${tipoTexto} • ` : ''}
                        ${periodoSelecionadoFlag ? `Período: ${periodoTexto} • ` : ''}
                        ${turmaSelecionada ? `Turma: ${turmaNome}` : 'Todas as turmas'}
                        ${temBusca ? ` • Buscando: "${buscaTexto}"` : ''}
                    </div>
                    
                    ${totalRegistros > 0 ? `
                    <div style="margin-top: 10px; text-align: right; font-size: 0.85rem; color: #4b5563;">
                        <i class="fas fa-database"></i> ${totalRegistros} registro(s) com estes filtros
                    </div>
                    ` : ''}
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 20px;">
                    <div style="background: #f8fafc; border-radius: 16px; padding: 15px;">
                        <h4 style="margin: 0 0 10px 0; color: #4b5563; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-file-alt" style="color: #3b82f6;"></i> Relatório de Provas
                        </h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <button onclick="exportarDadosProvasPDF(); this.closest('.modal').style.display='none'" 
                                    style="padding: 12px; background: #ef4444; color: white; border: none; border-radius: 10px; cursor: pointer; font-weight: 600;">
                                <i class="fas fa-file-pdf"></i> PDF
                            </button>
                            <button onclick="exportarDadosProvasExcel(); this.closest('.modal').style.display='none'" 
                                    style="padding: 12px; background: #10b981; color: white; border: none; border-radius: 10px; cursor: pointer; font-weight: 600;">
                                <i class="fas fa-file-excel"></i> Excel
                            </button>
                        </div>
                    </div>
                    
                    <div style="background: #f8fafc; border-radius: 16px; padding: 15px;">
                        <h4 style="margin: 0 0 10px 0; color: #4b5563; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-school" style="color: #8b5cf6;"></i> Relatório de Turmas
                        </h4>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <button onclick="exportarDadosTurmasPDF(); this.closest('.modal').style.display='none'" 
                                    style="padding: 12px; background: #8b5cf6; color: white; border: none; border-radius: 10px; cursor: pointer; font-weight: 600;">
                                <i class="fas fa-file-pdf"></i> PDF
                            </button>
                            <button onclick="exportarTurmasExcel(); this.closest('.modal').style.display='none'" 
                                    style="padding: 12px; background: #8b5cf6; color: white; border: none; border-radius: 10px; cursor: pointer; font-weight: 600;">
                                <i class="fas fa-file-excel"></i> Excel
                            </button>
                        </div>
                    </div>
                    
                    <div style="background: linear-gradient(135deg, #fef3c7, #fde68a); border-radius: 16px; padding: 15px; border: 2px solid #f59e0b;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                            <div style="width: 40px; height: 40px; background: #f59e0b; border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white;">
                                <i class="fas fa-chart-line"></i>
                            </div>
                            <div>
                                <h4 style="margin: 0; color: #92400e;">📊 Notas dos Alunos</h4>
                                <p style="margin: 5px 0 0 0; font-size: 0.85rem; color: #92400e;">
                                    Exportação considerará TODOS os filtros acima
                                </p>
                            </div>
                        </div>
                        
                        <button onclick="exportarNotasAlunosExcel(); this.closest('.modal').style.display='none'" 
                                style="width: 100%; padding: 15px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; border: none; border-radius: 12px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 10px; justify-content: center; font-size: 1rem;">
                            <i class="fas fa-file-excel" style="font-size: 20px;"></i>
                            <div>
                                <div>Exportar Notas dos Alunos (Excel)</div>
                                <small style="opacity: 0.9;">
                                    Usando: 
                                    ${statusSelecionado !== 'todos' ? `Status: ${statusTexto} ` : ''}
                                    ${dificuldadeSelecionada !== 'todas' ? `• Dificuldade: ${dificuldadeTexto} ` : ''}
                                    ${tipoSelecionado !== 'todos' ? `• Tipo: ${tipoTexto} ` : ''}
                                    ${periodoSelecionadoFlag ? `• Período: ${periodoTexto} ` : ''}
                                    ${turmaSelecionada ? `• Turma: ${turmaNome} ` : ''}
                                    ${temBusca ? `• Busca: "${buscaTexto}"` : ''}
                                </small>
                            </div>
                        </button>
                    </div>
                </div>
                
                <div style="margin-top: 20px; padding: 15px; background: #f3f4f6; border-radius: 10px;">
                    <div style="display: flex; justify-content: space-between; color: #4b5563;">
                        <span><strong>📊 Resumo:</strong></span>
                        <span>${provasOriginais?.length || 0} provas</span>
                        <span>${turmasProfessor?.length || 0} turmas</span>
                        <span>${totalRegistros || 0} registros</span>
                    </div>
                </div>
                
                <div style="margin-top: 15px; text-align: center; color: #6b7280; font-size: 0.8rem;">
                    <i class="fas fa-info-circle"></i> Os relatórios respeitam TODOS os filtros selecionados na aba "Minhas Provas"
                </div>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
};

function exportarDadosProvasExcel() {
    try {
        console.log('📊 Exportando relatório de provas em Excel...');
        
        if (!provasOriginais || provasOriginais.length === 0) {
            mostrarAlerta('mostrarAlertaGeralMinhasProvas', '⚠️ Não há dados de provas para exportar', 'info');
            return;
        }

        if (typeof XLSX === 'undefined') {
            mostrarAlerta('mostrarAlertaGeralMinhasProvas', '⚠️ Carregando biblioteca do Excel. Tente novamente...', 'info');
            
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
            script.onload = function() {
                mostrarAlerta('mostrarAlertaGeralMinhasProvas', '✅ Biblioteca carregada! Clique novamente em Exportar.', 'success');
            };
            document.head.appendChild(script);
            return;
        }

        const dadosDetalhados = provasOriginais.map((prova, index) => {
            const nomeTurma = prova.turma?.nome || prova.turma || 'Sem turma';
            const dataCriacao = prova.dataCriacao ? new Date(prova.dataCriacao).toLocaleDateString('pt-BR') : 'N/A';
            const dataLimite = prova.dataLimite ? new Date(prova.dataLimite).toLocaleDateString('pt-BR') : 'N/A';
            const status = prova.publicada ? 
                (prova.cancelada ? 'Cancelada' : 
                (prova.dataLimite && new Date(prova.dataLimite) < new Date() ? 'Concluída' : 'Ativa')) 
                : 'Rascunho';
            const tipo = prova.tipoProva === 'enem' ? 'ENEM' : 
                        (prova.adaptada ? 'Adaptada' : 'Simples');
            const dificuldade = prova.dificuldade === 'facil' ? 'Fácil' :
                            (prova.dificuldade === 'dificil' ? 'Difícil' : 'Médio');
            
            return {
                'ID': index + 1,
                'Título': prova.titulo || 'Sem título',
                'Período': prova.periodo ? prova.periodo + 'º' : '1º',
                'Turma': nomeTurma,
                'Disciplina': prova.turma?.disciplina || 'N/A',
                'Tipo': tipo,
                'Dificuldade': dificuldade,
                'Questões': prova.quantidadeQuestoes || 0,
                'Status': status,
                'Alunos Realizaram': prova.alunosRealizaram || 0,
                'Total Alunos': prova.totalAlunos || 0,
                '% Participação': prova.totalAlunos ? 
                    Number(((prova.alunosRealizaram || 0) / prova.totalAlunos * 100).toFixed(1)) : 0,
                'Média': Number((prova.mediaNotas || 0).toFixed(1)),
                'Data Criação': dataCriacao,
                'Data Limite': dataLimite,
                'Código': prova.codigo || 'N/A'
            };
        });

        const totalAtivas = provasOriginais.filter(p => p.status === 'ativa' && p.publicada).length;
        const totalConcluidas = provasOriginais.filter(p => p.status === 'concluida' || p.cancelada).length;
        const totalRascunhos = provasOriginais.filter(p => !p.publicada).length;
        const totalQuestoes = provasOriginais.reduce((acc, p) => acc + (p.quantidadeQuestoes || 0), 0);
        const totalAlunosEnvolvidos = provasOriginais.reduce((acc, p) => acc + (p.totalAlunos || 0), 0);
        const totalRealizacoes = provasOriginais.reduce((acc, p) => acc + (p.alunosRealizaram || 0), 0);
        const mediaGeral = Number((provasOriginais.reduce((acc, p) => acc + (p.mediaNotas || 0), 0) / provasOriginais.length).toFixed(1));

        const faceis = provasOriginais.filter(p => p.dificuldade === 'facil').length;
        const medias = provasOriginais.filter(p => p.dificuldade === 'media' || !p.dificuldade).length;
        const dificeis = provasOriginais.filter(p => p.dificuldade === 'dificil').length;

        const dadosResumo = [
            ['📊 RELATÓRIO DE PROVAS - EDUCAPLENO'],
            [`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`],
            [''],
            ['📈 RESUMO ESTATÍSTICO'],
            ['Métrica', 'Valor'],
            ['Total de Provas', provasOriginais.length],
            ['Provas Ativas', totalAtivas],
            ['Provas Concluídas', totalConcluidas],
            ['Rascunhos', totalRascunhos],
            ['Total de Questões', totalQuestoes],
            ['Média Geral das Provas', mediaGeral],
            ['Total de Alunos (único)', '=SUM(F2:F' + (provasOriginais.length + 1) + ')'],
            ['Total de Realizações', totalRealizacoes],
            [''],
            ['📊 DISTRIBUIÇÃO POR DIFICULDADE'],
            ['Dificuldade', 'Quantidade', 'Percentual'],
            ['Fácil', faceis, `=${faceis}/${provasOriginais.length}*100`],
            ['Médio', medias, `=${medias}/${provasOriginais.length}*100`],
            ['Difícil', dificeis, `=${dificeis}/${provasOriginais.length}*100`],
            [''],
            ['📋 LEGENDA'],
            ['Status:', ''],
            ['Ativa', 'Prova disponível para os alunos'],
            ['Concluída', 'Data limite passada'],
            ['Rascunho', 'Prova não publicada'],
            ['Cancelada', 'Prova cancelada']
        ];

        const sheetDetalhes = XLSX.utils.json_to_sheet(dadosDetalhados);

        sheetDetalhes['!cols'] = [
            { wch: 5 },
            { wch: 40 },
            { wch: 8 },
            { wch: 25 },
            { wch: 20 },
            { wch: 10 },
            { wch: 10 },
            { wch: 8 },
            { wch: 12 },
            { wch: 15 },
            { wch: 12 },
            { wch: 12 },
            { wch: 8 },
            { wch: 15 },
            { wch: 15 },
            { wch: 15 }
        ];

        const wb = XLSX.utils.book_new();
        
        const wsResumo = XLSX.utils.aoa_to_sheet(dadosResumo);
        wsResumo['!cols'] = [
            { wch: 30 },
            { wch: 20 }
        ];
        
        XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');
        XLSX.utils.book_append_sheet(wb, sheetDetalhes, 'Detalhamento');

        const dataAtual = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
        const nomeArquivo = `relatorio-provas-${dataAtual}.xlsx`;
        
        XLSX.writeFile(wb, nomeArquivo);

        console.log('✅ Excel gerado com sucesso!');
        console.log('📊 Resumo:', {
            'Total Provas': provasOriginais.length,
            'Total Questões': totalQuestoes,
            'Média Geral': mediaGeral,
            'Alunos Envolvidos': totalAlunosEnvolvidos
        });

        mostrarAlerta('mostrarAlertaGeralMinhasProvas', 
            `✅ Arquivo Excel gerado com sucesso!\n` +
            `📊 ${provasOriginais.length} provas • ${totalQuestoes} questões\n` +
            `📁 Nome: ${nomeArquivo}`, 
            'success');

    } catch (error) {
        console.error('❌ Erro ao exportar Excel:', error);
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', `❌ Erro ao exportar: ${error.message}`, 'error');
    }
}

function exportarTurmasExcel() {
    try {
        if (!turmasProfessor || turmasProfessor.length === 0) {
            mostrarAlerta('mostrarAlertaGeralMinhasTurmas', '⚠️ Não há dados de turmas para exportar', 'info');
            return;
        }

        if (typeof XLSX === 'undefined') {
            mostrarAlerta('mostrarAlertaGeralMinhasTurmas', '⚠️ Carregando biblioteca do Excel...', 'info');
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
            script.onload = () => mostrarAlerta('mostrarAlertaGeralMinhasTurmas', '✅ Pronto! Clique novamente.', 'success');
            document.head.appendChild(script);
            return;
        }

        const dadosTurmas = turmasProfessor.map((turma, index) => ({
            'ID': index + 1,
            'Nome': turma.nome || 'N/A',
            'Disciplina': turma.disciplina || 'N/A',
            'Eixo': turma.eixo === 'natureza' ? 'Natureza' : 
                (turma.eixo === 'humanas' ? 'Humanas' : 'Geral'),
            'Código': turma.codigo || 'N/A',
            'Status': turma.ativa !== false ? 'Ativa' : 'Inativa',
            'Alunos': turma.totalAlunos || 0,
            'Provas': turma.totalProvas || 0,
            'Data Criação': turma.dataCriacao ? new Date(turma.dataCriacao).toLocaleDateString('pt-BR') : 'N/A'
        }));

        const totalAlunos = turmasProfessor.reduce((acc, t) => acc + (t.totalAlunos || 0), 0);
        const totalProvas = turmasProfessor.reduce((acc, t) => acc + (t.totalProvas || 0), 0);
        const turmasAtivas = turmasProfessor.filter(t => t.ativa !== false).length;

        const dadosResumo = [
            ['🏫 RELATÓRIO DE TURMAS'],
            [`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`],
            [''],
            ['📊 RESUMO'],
            ['Total de Turmas', turmasProfessor.length],
            ['Turmas Ativas', turmasAtivas],
            ['Total de Alunos', totalAlunos],
            ['Total de Provas', totalProvas],
            ['Média Alunos/Turma', Number((totalAlunos / turmasProfessor.length).toFixed(1))]
        ];

        const wb = XLSX.utils.book_new();
        
        const wsResumo = XLSX.utils.aoa_to_sheet(dadosResumo);
        const wsDetalhes = XLSX.utils.json_to_sheet(dadosTurmas);
        
        wsDetalhes['!cols'] = [
            { wch: 5 },
            { wch: 30 },
            { wch: 20 },
            { wch: 10 },
            { wch: 15 },
            { wch: 10 },
            { wch: 8 },
            { wch: 8 },
            { wch: 15 }
        ];

        XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');
        XLSX.utils.book_append_sheet(wb, wsDetalhes, 'Turmas');

        const dataAtual = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
        XLSX.writeFile(wb, `relatorio-turmas-${dataAtual}.xlsx`);

        mostrarAlerta('mostrarAlertaGeralMinhasTurmas', '✅ Relatório de turmas exportado!', 'success');

    } catch (error) {
        console.error('❌ Erro:', error);
        mostrarAlerta('mostrarAlertaGeralMinhasTurmas', `❌ Erro: ${error.message}`, 'error');
    }
}

async function exportarDadosTurmasPDF() {
    try {
        if (!turmasProfessor || turmasProfessor.length === 0) {
            mostrarAlerta('mostrarAlertaGeralMinhasTurmas', '⚠️ Não há dados de turmas para exportar', 'info');
            return;
        }

        const totalAlunos = turmasProfessor.reduce((acc, t) => acc + (t.totalAlunos || 0), 0);
        const totalProvas = turmasProfessor.reduce((acc, t) => acc + (t.totalProvas || 0), 0);
        const turmasAtivas = turmasProfessor.filter(t => t.ativa !== false).length;

        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Relatório de Turmas</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 30px; color: #333; }
                    .header { 
                        text-align: center; 
                        margin-bottom: 30px;
                        padding: 20px;
                        background: linear-gradient(135deg, #10b981, #059669);
                        color: white;
                        border-radius: 10px;
                    }
                    .stats-container {
                        display: flex;
                        justify-content: space-between;
                        margin: 30px 0;
                        gap: 15px;
                    }
                    .stat-card {
                        flex: 1;
                        background: #f8fafc;
                        padding: 20px;
                        border-radius: 10px;
                        text-align: center;
                        border-left: 4px solid #10b981;
                    }
                    .stat-number {
                        font-size: 28px;
                        font-weight: bold;
                        color: #10b981;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 20px 0;
                    }
                    th {
                        background: #10b981;
                        color: white;
                        padding: 12px;
                        text-align: left;
                    }
                    td {
                        padding: 10px;
                        border-bottom: 1px solid #e2e8f0;
                    }
                    .eixo-natureza { color: #10b981; }
                    .eixo-humanas { color: #8b5cf6; }
                    .eixo-geral { color: #6b7280; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>🏫 Relatório de Turmas</h1>
                    <p>Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}</p>
                </div>

                <div class="stats-container">
                    <div class="stat-card">
                        <div class="stat-number">${turmasProfessor.length}</div>
                        <div class="stat-label">Total de Turmas</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${turmasAtivas}</div>
                        <div class="stat-label">Turmas Ativas</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${totalAlunos}</div>
                        <div class="stat-label">Total de Alunos</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-number">${totalProvas}</div>
                        <div class="stat-label">Total de Provas</div>
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>Disciplina</th>
                            <th>Eixo</th>
                            <th>Código</th>
                            <th>Status</th>
                            <th>Alunos</th>
                            <th>Provas</th>
                            <th>Data Criação</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${turmasProfessor.map(turma => {
                            const eixoClass = turma.eixo === 'natureza' ? 'eixo-natureza' : 
                                            (turma.eixo === 'humanas' ? 'eixo-humanas' : 'eixo-geral');
                            return `
                                <tr>
                                    <td><strong>${turma.nome || 'N/A'}</strong></td>
                                    <td>${turma.disciplina || 'N/A'}</td>
                                    <td class="${eixoClass}">${turma.eixo || 'Geral'}</td>
                                    <td><code>${turma.codigo || 'N/A'}</code></td>
                                    <td>${turma.ativa !== false ? 'Ativa' : 'Inativa'}</td>
                                    <td>${turma.totalAlunos || 0}</td>
                                    <td>${turma.totalProvas || 0}</td>
                                    <td>${turma.dataCriacao ? new Date(turma.dataCriacao).toLocaleDateString('pt-BR') : 'N/A'}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </body>
            </html>
        `;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        
        setTimeout(() => {
            printWindow.print();
        }, 500);

        mostrarAlerta('mostrarAlertaGeralMinhasTurmas', '✅ PDF gerado com sucesso!', 'success');

    } catch (error) {
        console.error('❌ Erro ao exportar PDF:', error);
        mostrarAlerta('mostrarAlertaGeralMinhasTurmas', `❌ Erro: ${error.message}`, 'error');
    }
}

function mostrarPreviewQuestoes(questoes) {
    const previewContainer = document.getElementById('previewQuestoes');
    const questoesContainer = document.getElementById('questoesPreview');
    
    if (!previewContainer || !questoesContainer) return;
    
    if (!questoes || questoes.length === 0) {
        questoesContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #6b7280;">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 10px;"></i>
                <p>Não foi possível carregar as questões geradas</p>
            </div>
        `;
        return;
    }
    
    const questoesHTML = questoes.map((questao, index) => {
        if (questao.tipo === 'enem') {
            return `
                <div class="questao-preview" style="margin-bottom: 25px; padding: 20px; background: #f0f9ff; border-radius: 10px; border-left: 4px solid #3b82f6;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                        <span style="background: #3b82f6; color: white; padding: 2px 10px; border-radius: 12px; font-size: 0.9rem; font-weight: 600;">
                            ENEM
                        </span>
                        <strong style="color: #1e40af;">Questão ${index + 1}</strong>
                    </div>
                    
                    ${questao.contexto ? `
                    <div class="contexto" style="margin-bottom: 15px; padding: 15px; background: #e0f2fe; border-radius: 8px; font-style: italic;">
                        <p style="margin: 0; color: #0369a1;">${questao.contexto}</p>
                    </div>
                    ` : ''}
                    
                    <div class="questao-texto" style="margin-bottom: 15px; font-weight: 600; color: #1e40af;">
                        ${questao.pergunta}
                    </div>
                    
                    <div class="opcoes-preview">
                        ${questao.opcoes.map((opcao, opcaoIndex) => `
                            <div class="opcao-item ${opcaoIndex === questao.respostaCorreta ? 'opcao-correta' : ''}" 
                                style="padding: 10px; margin-bottom: 8px; border-radius: 6px; border: 2px solid ${opcaoIndex === questao.respostaCorreta ? '#10b981' : '#d1d5db'}; background: ${opcaoIndex === questao.respostaCorreta ? '#d1fae5' : 'white'};">
                                <span>${opcao}</span>
                                ${opcaoIndex === questao.respostaCorreta ? '<i class="fas fa-check-circle" style="color: #10b981; float: right;"></i>' : ''}
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="explicacao-preview" style="margin-top: 15px; padding: 15px; background: #f0fdf4; border-radius: 8px; border-left: 3px solid #10b981;">
                        <strong><i class="fas fa-lightbulb"></i> Explicação:</strong> ${questao.explicacao}
                        
                        ${questao.competencia ? `
                        <div style="margin-top: 10px; font-size: 0.9rem;">
                            <strong>Competência:</strong> ${questao.competencia}
                        </div>
                        ` : ''}
                        
                        ${questao.habilidade ? `
                        <div style="margin-top: 5px; font-size: 0.9rem;">
                            <strong>Habilidade:</strong> ${questao.habilidade}
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        } else {
            return `
                <div class="questao-preview" style="margin-bottom: 25px; padding: 20px; background: #f9fafb; border-radius: 10px; border-left: 4px solid #10b981;">
                    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 15px;">
                        <span style="background: #10b981; color: white; padding: 2px 10px; border-radius: 12px; font-size: 0.9rem; font-weight: 600;">
                            SIMPLES
                        </span>
                        <strong style="color: #065f46;">Questão ${index + 1}</strong>
                    </div>
                    
                    <div class="questao-texto" style="margin-bottom: 15px; font-weight: 600; color: #065f46;">
                        ${questao.pergunta}
                    </div>
                    
                    <div class="opcoes-preview">
                        ${questao.opcoes.map((opcao, opcaoIndex) => `
                            <div class="opcao-item ${opcaoIndex === questao.respostaCorreta ? 'opcao-correta' : ''}" 
                                style="padding: 10px; margin-bottom: 8px; border-radius: 6px; border: 2px solid ${opcaoIndex === questao.respostaCorreta ? '#10b981' : '#d1d5db'}; background: ${opcaoIndex === questao.respostaCorreta ? '#d1fae5' : 'white'};">
                                <span>${opcao}</span>
                                ${opcaoIndex === questao.respostaCorreta ? '<i class="fas fa-check-circle" style="color: #10b981; float: right;"></i>' : ''}
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="explicacao-preview" style="margin-top: 15px; padding: 15px; background: #f0fdf4; border-radius: 8px; border-left: 3px solid #10b981;">
                        <strong><i class="fas fa-lightbulb"></i> Explicação:</strong> ${questao.explicacao}
                    </div>
                </div>
            `;
        }
    }).join('');
    
    questoesContainer.innerHTML = `
        <div style="margin-bottom: 20px;">
            <h3 style="color: #4b5563; margin-bottom: 20px; display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-check-circle" style="color: #10b981;"></i> 
                Questões Geradas
                <span style="font-size: 0.9rem; background: #e5e7eb; padding: 2px 10px; border-radius: 12px; color: #6b7280;">
                    ${questoes.length} questões
                </span>
            </h3>
            <p style="color: #6b7280; font-size: 0.9rem; margin-bottom: 20px;">
                A prova foi gerada com sucesso! Revise as questões abaixo.
            </p>
        </div>
        ${questoesHTML}
    `;
    
    previewContainer.style.display = 'block';
}

async function publicarProva() {
    if (!provaGerada || !provaGerada.id) {
        mostrarAlerta('mostrarAlertaGeralProva', '⚠️ Nenhuma prova válida para publicar', 'info');
        return;
    }

    try {
        const token = localStorage.getItem('auth_token');
        
        const btnPublicar = document.querySelector('#previewQuestoes button.btn-success');
        const originalText = btnPublicar.innerHTML;
        btnPublicar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publicando...';
        btnPublicar.disabled = true;
        
        console.log('📤 Publicando prova ID:', provaGerada.id);
        
        const responseProva = await fetch(`/api/provas/${provaGerada.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const dataProva = await responseProva.json();
        const provaCompleta = dataProva.success ? dataProva.prova : null;
        
        const response = await fetch(`/api/professor/provas/${provaGerada.id}/publicar`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarAlerta('mostrarAlertaGeralProva', '✅ Prova publicada com sucesso! Agora está visível para os alunos.', 'success');
            
            if (provaCompleta && provaCompleta.turmaId) {
                try {
                    const turmaRes = await fetch(`/api/turmas/${provaCompleta.turmaId}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    
                    const turmaData = await turmaRes.json();
                    const turma = turmaData.success ? turmaData.turma : null;
                    
                    if (turma && turma.alunos && turma.alunos.length > 0) {
                        const alunos = turma.alunos;
                        console.log(`📢 Notificando ${alunos.length} alunos sobre nova prova...`);
                        
                        const configRes = await fetch('/api/admin/configuracoes', {
                            headers: { 'Authorization': `Bearer ${token}` }
                        }).catch(() => ({ json: () => ({ configuracoes: { notificacoes: { push: false } } }) }));
                        
                        const configData = await configRes.json();
                        const pushAtivado = configData.configuracoes?.notificacoes?.push === true;
                        
                        let notificacoesEnviadas = 0;
                        
                        for (const aluno of alunos) {
                            try {
                                const alunoId = aluno._id || aluno.id;
                                
                                await fetch('/api/notificacoes', {
                                    method: 'POST',
                                    headers: {
                                        'Authorization': `Bearer ${token}`,
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        usuarioId: alunoId,
                                        tipo: 'sistema',
                                        titulo: '📝 Nova Prova Publicada',
                                        mensagem: `A prova "${provaGerada.titulo}" foi publicada na turma ${turma.nome}.`,
                                        icone: '📚',
                                        cor: '#10b981',
                                        link: `/aluno.html`,
                                        prioridade: 3,
                                        dados: {
                                            provaId: provaGerada.id,
                                            provaTitulo: provaGerada.titulo,
                                            turmaId: turma._id,
                                            turmaNome: turma.nome,
                                            tipo: 'nova_prova'
                                        }
                                    })
                                });
                                
                                if (pushAtivado) {
                                    await enviarPushParaUsuario(
                                        alunoId,
                                        '📝 Nova Prova',
                                        `Prova "${provaGerada.titulo}" publicada em ${turma.nome}`,
                                        {
                                            tipo: 'nova_prova',
                                            provaId: provaGerada.id,
                                            provaTitulo: provaGerada.titulo
                                        }
                                    );
                                }
                                
                                notificacoesEnviadas++;
                                
                            } catch (alunoError) {
                                console.error(`Erro ao notificar aluno:`, alunoError);
                            }
                        }
                        
                        console.log(`✅ ${notificacoesEnviadas} alunos notificados sobre nova prova`);
                        mostrarAlerta('mostrarAlertaGeralProva', `📢 ${notificacoesEnviadas} alunos notificados!`, 'info');
                    }
                } catch (notifError) {
                    console.error('❌ Erro ao notificar alunos:', notifError);
                }
            }
            
            document.getElementById('formNovaProva').reset();
            document.getElementById('previewQuestoes').style.display = 'none';
            
            arquivosOriginaisParaRegeneracao = [];
            arquivosParaUpload = [];
            anexos = [];
            atualizarListaAnexos();
            provaGerada = null;
            
            setTimeout(() => {
                if (typeof carregarProvasProfessor === 'function') {
                    carregarProvasProfessor();
                }
            }, 2000);
            
        } else {
            throw new Error(data.error || 'Erro ao publicar prova');
        }
        
    } catch (error) {
        console.error('❌ Erro ao publicar prova:', error);
        mostrarAlerta('mostrarAlertaGeralProva', `❌ Erro: ${error.message}`, 'error');
    } finally {
        const btnPublicar = document.querySelector('#previewQuestoes button.btn-success');
        if (btnPublicar) {
            btnPublicar.innerHTML = '<i class="fas fa-paper-plane"></i> Publicar para a Turma';
            btnPublicar.disabled = false;
        }
    }
}

async function enviarPushParaUsuario(usuarioId, titulo, mensagem, dados = {}) {
    try {
        const token = localStorage.getItem('auth_token');
        
        if (!token) {
            console.error('❌ Token não encontrado');
            return false;
        }
        
        console.log(`📱 Enviando push para usuário ${usuarioId}: ${titulo}`);
        
        const response = await fetch('/api/usuario/enviar-push', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                usuarioId: usuarioId,
                titulo: titulo,
                mensagem: mensagem,
                dados: {
                    ...dados,
                    timestamp: Date.now(),
                    origem: 'professor'
                }
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log('✅ Push enviado com sucesso! ID:', data.notificationId);
            return true;
        } else {
            console.log('⚠️ Push não enviado:', data.error);
            return false;
        }
    } catch (error) {
        console.error('❌ Erro ao enviar push:', error);
        return false;
    }
}

async function regenerarProva() {
    if (!provaGerada) {
        mostrarAlerta('mostrarAlertaGeralProva', '⚠️ Nenhuma prova para regenerar', 'info');
        return;
    }

    const periodoProva = document.getElementById('periodoProva').value;

    const questoesPreview = document.getElementById('questoesPreview');
    if (questoesPreview) {
        questoesPreview.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <i class="fas fa-spinner fa-spin" style="font-size: 2rem; color: #4f46e5; margin-bottom: 15px;"></i>
                <p style="color: #6b7280;">Regenerando prova com IA...</p>
                <p style="font-size: 0.9rem; color: #6b7280;">Por favor, aguarde enquanto criamos novas questões.</p>
            </div>
        `;
    }

    const btnPublicar = document.querySelector('#previewQuestoes button.btn-success');
    const btnRegenerar = document.querySelector('#previewQuestoes button.btn-danger');

    if (btnPublicar) btnPublicar.disabled = true;
    if (btnRegenerar) btnRegenerar.disabled = true;

    try {
        const turmaId = document.getElementById('turmaProva').value;
        const titulo = document.getElementById('tituloProva').value;
        const tema = document.getElementById('temaProva').value;
        const quantidadeQuestoes = document.getElementById('quantidadeQuestoes').value;
        const dificuldade = document.getElementById('dificuldade').value;
        const dataLimiteInput = document.getElementById('dataLimite').value;
        const tipoProva = document.getElementById('tipoProva').value;

        if (!turmaId) {
            throw new Error('Selecione uma turma primeiro');
        }

        let dataLimiteEnviar = null;
        if (dataLimiteInput) {
            const partes = dataLimiteInput.split('-');
            const ano = parseInt(partes[0]);
            const mes = parseInt(partes[1]) - 1;
            const dia = parseInt(partes[2]);
            
            const dataLimiteFimDia = new Date(ano, mes, dia, 23, 59, 59, 999);
            dataLimiteEnviar = dataLimiteFimDia.toISOString();
        }

        const dadosProva = {
            turmaId: turmaId,
            titulo: titulo,
            conteudo: tema,
            tipoProva: tipoProva,
            periodo: periodoProva,
            quantidadeQuestoes: parseInt(quantidadeQuestoes),
            dificuldade: dificuldade,
            dataLimite: dataLimiteEnviar,
            horarioInicio: document.getElementById('horarioInicio').value,
            horarioTermino: document.getElementById('horarioTermino').value,
            anexos: tipoProva === 'enem' ? [] : []
        };

        console.log('🔄 Dados para regeneração:', dadosProva);

        const token = localStorage.getItem('auth_token');

        let response;

        if (tipoProva === 'enem') {
            console.log('🔄 Preparando regeneração para prova ENEM...');
            
            console.log('📊 Estado dos arquivos para regeneração:');
            console.log('   - arquivosOriginaisBackup:', arquivosOriginaisBackup.length);
            console.log('   - arquivosParaUpload:', arquivosParaUpload.length);
            console.log('   - anexos:', anexos.length);
            
            let arquivosParaProcessar = [];
            let todosAnexos = [];
            
            if (arquivosOriginaisBackup.length > 0) {
                console.log('📁 Usando arquivos do backup original:', arquivosOriginaisBackup.length);
                arquivosParaProcessar = [...arquivosOriginaisBackup];
            }
            else if (arquivosParaUpload.length > 0) {
                console.log('📁 Usando arquivos atuais:', arquivosParaUpload.length);
                arquivosParaProcessar = [...arquivosParaUpload];
            }
            
            if (arquivosParaProcessar.length > 0) {
                console.log('🔧 Processando arquivos para regeneração...');
                
                const arquivosAtuaisBackup = [...arquivosParaUpload];
                const anexosAtuaisBackup = [...anexos];
                
                arquivosParaUpload = [...arquivosParaProcessar];
                anexos = [];
                
                try {
                    todosAnexos = await processarAnexosParaEnvio();
                    console.log('✅ Arquivos processados para regeneração:', todosAnexos.length);
                } catch (error) {
                    console.error('❌ Erro ao processar arquivos para regeneração:', error);
                } finally {
                    arquivosParaUpload = [...arquivosAtuaisBackup];
                    anexos = [...anexosAtuaisBackup];
                }
            }
            
            if (todosAnexos.length === 0 && provaGerada && provaGerada.id) {
                console.log('🔍 Buscando anexos da prova original ID:', provaGerada.id);
                
                try {
                    const responseProva = await fetch(`/api/provas/${provaGerada.id}`, {
                        headers: {
                            'Authorization': `Bearer ${token}`
                        }
                    });
                    
                    if (responseProva.ok) {
                        const dataProva = await responseProva.json();
                        if (dataProva.success && dataProva.prova && dataProva.prova.anexos) {
                            todosAnexos = dataProva.prova.anexos;
                            console.log('✅ Anexos recuperados da prova original:', todosAnexos.length);
                        }
                    }
                } catch (error) {
                    console.warn('⚠️ Não foi possível recuperar anexos da prova original:', error.message);
                }
            }
            
            const formDataObj = new FormData();

            formDataObj.append('titulo', dadosProva.titulo);
            formDataObj.append('conteudo', dadosProva.conteudo);
            formDataObj.append('tipoProva', dadosProva.tipoProva);
            formDataObj.append('quantidadeQuestoes', dadosProva.quantidadeQuestoes);
            formDataObj.append('dificuldade', dadosProva.dificuldade);
            formDataObj.append('dataLimite', dadosProva.dataLimite || '');
            formDataObj.append('horarioInicio', dadosProva.horarioInicio);
            formDataObj.append('horarioTermino', dadosProva.horarioTermino);
            
            if (todosAnexos.length > 0) {
                formDataObj.append('anexos', JSON.stringify(todosAnexos));
                console.log(`📎 Anexos incluídos na regeneração: ${todosAnexos.length}`);
            } else {
                console.log('ℹ️ Nenhum anexo para enviar na regeneração');
                formDataObj.append('anexos', '[]');
            }
            
            arquivosParaProcessar.forEach((file, index) => {
                formDataObj.append(`arquivos`, file);
            });

            console.log('📋 Conteúdo do FormData para regeneração:');
            for (let pair of formDataObj.entries()) {
                console.log(`${pair[0]}: ${typeof pair[1] === 'string' ? pair[1].substring(0, 100) : pair[1].name || 'File'}`);
            }

            response = await fetch(`/api/turmas/${turmaId}/prova-v2`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formDataObj
            });
        } else {
            response = await fetch(`/api/turmas/${turmaId}/prova-v2`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(dadosProva)
            });
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (data.success) {
            provaGerada = {
                id: data.provaId || data.prova?.id,
                titulo: data.prova?.titulo || titulo,
                ...data.prova,
                questoes: data.questoes || []
            };

            console.log('✅ Prova regenerada:', provaGerada);

            if (data.questoes && data.questoes.length > 0) {
                mostrarPreviewQuestoes(data.questoes);
            } else if (provaGerada.questoes && provaGerada.questoes.length > 0) {
                mostrarPreviewQuestoes(provaGerada.questoes);
            }

            mostrarAlerta('mostrarAlertaGeralProva', '✅ Prova regenerada com sucesso!', 'success');

        } else {
            throw new Error(data.error || 'Erro ao regenerar prova');
        }

    } catch (error) {
        console.error('❌ Erro ao regenerar prova:', error);

        const questoesPreview = document.getElementById('questoesPreview');
        if (questoesPreview) {
            questoesPreview.innerHTML = `
                <div style="text-align: center; padding: 40px;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: #ef4444; margin-bottom: 15px;"></i>
                    <h3 style="color: #7f1d1d;">Erro ao regenerar prova</h3>
                    <p style="color: #6b7280;">${error.message}</p>
                    <button onclick="regenerarProva()" style="
                        margin-top: 15px; 
                        padding: 10px 20px; 
                        background: #4f46e5; 
                        color: white; 
                        border: none; 
                        border-radius: 6px; 
                        cursor: pointer;
                    ">
                        <i class="fas fa-redo"></i> Tentar novamente
                    </button>
                </div>
            `;
        }

        mostrarAlerta('mostrarAlertaGeralProva', `❌ Erro: ${error.message}`, 'error');

    } finally {
        if (btnPublicar) {
            btnPublicar.disabled = false;
            btnPublicar.innerHTML = '<i class="fas fa-paper-plane"></i> Publicar para a Turma';
        }

        if (btnRegenerar) {
            btnRegenerar.disabled = false;
            btnRegenerar.innerHTML = '<i class="fas fa-redo"></i> Regenerar Prova';
        }
    }
}

// ============================================================================
// FUNÇÕES DE ADAPTAÇÃO DE DOCUMENTOS COM GOOGLE DOCS API
// ============================================================================

let arquivoSelecionadoProfessor = null;

window.abrirModalUploadAdaptarDocumento = async function() {
    console.log('📂 Abrindo modal de adaptação de documentos...');
    
    let modal = document.getElementById('modalAdaptacaoDocumento');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'modalAdaptacaoDocumento';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px; width: 90%; max-height: 85vh; background: white; border-radius: 24px; display: flex; flex-direction: column; overflow: hidden;">
            <div class="modal-header" style="background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; padding: 20px 25px; border-radius: 24px 24px 0 0; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
                <h3 style="margin: 0; display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-universal-access"></i> Adaptar Documento
                </h3>
                <button onclick="fecharModalAdaptacao()" style="background: none; border: none; color: white; font-size: 28px; cursor: pointer; line-height: 1;">&times;</button>
            </div>
            
            <div style="flex: 1; overflow-y: auto; padding: 25px;">
                <div class="upload-area" 
                    onclick="document.getElementById('fileInputAdaptarProfessor').click()"
                    ondrop="handleDropAdaptarProfessor(event)"
                    ondragover="handleDragOverAdaptarProfessor(event)"
                    style="
                        background: #f8fafc;
                        border: 3px dashed #cbd5e0;
                        border-radius: 16px;
                        padding: 40px;
                        text-align: center;
                        cursor: pointer;
                        transition: all 0.3s;
                    ">
                    <i class="fas fa-cloud-upload-alt" style="font-size: 48px; color: #8b5cf6; margin-bottom: 15px;"></i>
                    <h4 style="margin: 0 0 5px;">Arraste ou clique para enviar</h4>
                    <p style="margin: 0; color: #718096;">PDF, DOCX, DOC (até 10MB)</p>
                    <p style="margin-top: 10px; font-size: 12px; color: #f59e0b;">
                        <i class="fas fa-info-circle"></i> O documento mantém 100% da formatação original
                    </p>
                </div>
                <input type="file" id="fileInputAdaptarProfessor" style="display: none;" accept=".pdf,.docx,.doc" onchange="handleFileSelectAdaptarProfessor(event)">
                
                <div id="previewArquivoProfessor" style="display: none; margin-top: 20px; padding: 15px; background: #f1f5f9; border-radius: 12px;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <i id="fileIconProfessor" class="fas fa-file-word" style="font-size: 40px; color: #2b5797;"></i>
                        <div style="flex: 1;">
                            <div><strong id="nomeArquivoProfessor">-</strong></div>
                            <div><small id="tamanhoArquivoProfessor">-</small></div>
                        </div>
                        <button onclick="removerArquivoAdaptarProfessor()" style="background: #fee2e2; border: none; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; color: #dc2626;">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>
                
                <div id="opcoesAdaptacaoProfessor" style="display: none; margin-top: 20px;">
                    <div style="background: #f8fafc; border-radius: 16px; padding: 20px; border: 2px solid #e5e7eb;">
                        <h3 style="margin: 0 0 15px; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-universal-access" style="color: #10b981;"></i>
                            Opções de Acessibilidade
                        </h3>
                        
                        <div style="display: flex; flex-direction: column; gap: 15px;">
                            <div style="background: #f1f5f9; padding: 15px; border-radius: 12px;">
                                <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                    <input type="checkbox" id="optFonteAmpliadaProf" onchange="toggleSliderFonteProfessor()" style="width: 18px; height: 18px;">
                                    <div>
                                        <strong style="font-size: 1rem;">🔍 Fonte Ampliada</strong>
                                        <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Aumenta o tamanho da fonte</p>
                                    </div>
                                </label>
                                <div id="sliderFonteProf" style="display: none; margin-top: 15px; padding-top: 10px; border-top: 1px solid #e5e7eb;">
                                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                                        <span>Normal (12pt)</span>
                                        <span id="fonteValueProf">18pt</span>
                                        <span>Grande (24pt)</span>
                                    </div>
                                    <input type="range" id="fonteSliderProf" min="12" max="24" step="1" value="18" style="width: 100%;">
                                </div>
                            </div>
                            
                            <div style="background: #f1f5f9; padding: 15px; border-radius: 12px;">
                                <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                    <input type="checkbox" id="optCaixaAltaProf" style="width: 18px; height: 18px;">
                                    <div>
                                        <strong style="font-size: 1rem;">🔠 CAIXA ALTA (Maiúsculas)</strong>
                                        <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Converte todo o texto para maiúsculas</p>
                                    </div>
                                </label>
                            </div>
                            
                            <div style="background: #f1f5f9; padding: 15px; border-radius: 12px;">
                                <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                    <input type="checkbox" id="optNegritoProf" style="width: 18px; height: 18px;">
                                    <div>
                                        <strong style="font-size: 1rem;">🔤 Negrito</strong>
                                        <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Deixa o texto em negrito</p>
                                    </div>
                                </label>
                            </div>
                            
                            <div style="background: #f1f5f9; padding: 15px; border-radius: 12px;">
                                <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                    <input type="checkbox" id="optAltoContrasteProf" style="width: 18px; height: 18px;">
                                    <div>
                                        <strong style="font-size: 1rem;">🎨 Alto Contraste</strong>
                                        <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Fundo escuro com texto claro</p>
                                    </div>
                                </label>
                            </div>
                            
                            <div style="background: #f1f5f9; padding: 15px; border-radius: 12px;">
                                <label style="display: flex; align-items: center; gap: 12px; cursor: pointer;">
                                    <input type="checkbox" id="optFonteDislexiaProf" style="width: 18px; height: 18px;">
                                    <div>
                                        <strong style="font-size: 1rem;">📖 Fonte para Dislexia</strong>
                                        <p style="margin: 5px 0 0; font-size: 0.85rem; color: #6b7280;">Utiliza fonte OpenDyslexic</p>
                                    </div>
                                </label>
                            </div>
                        </div>
                        
                        <div style="margin-top: 20px; padding: 12px; background: #fef3c7; border-radius: 12px;">
                            <p style="margin: 0; font-size: 0.85rem;">
                                <i class="fas fa-lightbulb"></i> 
                                <strong>Processado pelo Google Docs!</strong> Mantém 100% da formatação original.
                            </p>
                        </div>
                    </div>
                </div>
                
                <div id="processandoMsgProf" style="display: none; margin-top: 20px; padding: 15px; background: #e6f7ff; border-radius: 12px; text-align: center;">
                    <i class="fas fa-spinner fa-spin" style="font-size: 20px; color: #1890ff;"></i>
                    <span style="margin-left: 10px;">Processando documento no Google Docs...</span>
                    <div style="font-size: 12px; color: #666; margin-top: 8px;">Isso pode levar alguns segundos</div>
                </div>
            </div>
            
            <div class="modal-footer" style="padding: 15px 20px; border-top: 1px solid #dee2e6; display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0;">
                <button class="btn-cancel" onclick="fecharModalAdaptacao()" style="padding: 8px 20px; background: #e9ecef; color: #666; border: none; border-radius: 5px; cursor: pointer;">Cancelar</button>
                <button class="btn-save" id="btnAplicarAdaptacoesProf" onclick="aplicarAdaptacoesComGoogleProfessor()" style="padding: 8px 20px; background: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer;">
                    <i class="fas fa-magic"></i> Aplicar Adaptações
                </button>
            </div>
        </div>
    `;
    
    arquivoSelecionadoProfessor = null;
    
    const fonteCheckbox = document.getElementById('optFonteAmpliadaProf');
    const slider = document.getElementById('fonteSliderProf');
    const fonteValue = document.getElementById('fonteValueProf');
    
    if (fonteCheckbox) {
        fonteCheckbox.addEventListener('change', () => {
            const sliderDiv = document.getElementById('sliderFonteProf');
            if (sliderDiv) sliderDiv.style.display = fonteCheckbox.checked ? 'block' : 'none';
        });
    }
    
    if (slider) {
        slider.addEventListener('input', () => {
            if (fonteValue) fonteValue.textContent = slider.value + 'pt';
        });
    }
    
    modal.style.display = 'flex';
};

window.fecharModalAdaptacao = function() {
    const modal = document.getElementById('modalAdaptacaoDocumento');
    if (modal) modal.style.display = 'none';
    arquivoSelecionadoProfessor = null;
};

window.handleDropAdaptarProfessor = function(e) {
    e.preventDefault();
    const area = e.currentTarget;
    area.style.background = '';
    area.style.borderColor = '#cbd5e0';
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processarArquivoAdaptarProfessor(files[0]);
    }
};

window.handleDragOverAdaptarProfessor = function(e) {
    e.preventDefault();
    const area = e.currentTarget;
    area.style.background = '#f0f9ff';
    area.style.borderColor = '#8b5cf6';
};

window.handleFileSelectAdaptarProfessor = function(e) {
    const files = e.target.files;
    if (files.length > 0) {
        processarArquivoAdaptarProfessor(files[0]);
    }
};

function processarArquivoAdaptarProfessor(file) {
    const extensoes = ['pdf', 'docx', 'doc'];
    const ext = file.name.split('.').pop().toLowerCase();
    
    if (!extensoes.includes(ext)) {
        mostrarAlertaGeral('❌ Tipo de arquivo não suportado', 'error');
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        mostrarAlertaGeral('❌ Arquivo muito grande. Máximo 10MB.', 'error');
        return;
    }
    
    arquivoSelecionadoProfessor = file;
    
    const fileIcon = document.getElementById('fileIconProfessor');
    if (fileIcon) {
        if (ext === 'pdf') {
            fileIcon.className = 'fas fa-file-pdf';
            fileIcon.style.color = '#dc2626';
        } else {
            fileIcon.className = 'fas fa-file-word';
            fileIcon.style.color = '#2b5797';
        }
    }
    
    document.getElementById('previewArquivoProfessor').style.display = 'block';
    document.getElementById('nomeArquivoProfessor').textContent = file.name;
    document.getElementById('tamanhoArquivoProfessor').textContent = `${(file.size / 1024).toFixed(2)} KB`;
    document.getElementById('opcoesAdaptacaoProfessor').style.display = 'block';
}

window.removerArquivoAdaptarProfessor = function() {
    arquivoSelecionadoProfessor = null;
    document.getElementById('previewArquivoProfessor').style.display = 'none';
    document.getElementById('opcoesAdaptacaoProfessor').style.display = 'none';
    document.getElementById('fileInputAdaptarProfessor').value = '';
};

window.toggleSliderFonteProfessor = function() {
    const slider = document.getElementById('sliderFonteProf');
    if (slider) {
        slider.style.display = document.getElementById('optFonteAmpliadaProf').checked ? 'block' : 'none';
    }
};

window.aplicarAdaptacoesComGoogleProfessor = async function() {
    console.log('🚀 Aplicando adaptações...');
    
    if (!arquivoSelecionadoProfessor) {
        mostrarAlertaGeral('❌ Nenhum arquivo selecionado', 'error');
        return;
    }
    
    const opcoes = {
        caixa_alta: document.getElementById('optCaixaAltaProf')?.checked || false,
        negrito: document.getElementById('optNegritoProf')?.checked || false,
        alto_contraste: document.getElementById('optAltoContrasteProf')?.checked || false,
        fonte_dislexia: document.getElementById('optFonteDislexiaProf')?.checked || false,
        tamanho_fonte: document.getElementById('optFonteAmpliadaProf')?.checked 
            ? parseInt(document.getElementById('fonteSliderProf')?.value) || 18 
            : 12
    };
    
    const nenhumaOpcao = !opcoes.caixa_alta && !opcoes.negrito && 
                        !opcoes.alto_contraste && !opcoes.fonte_dislexia && 
                        opcoes.tamanho_fonte === 12;
    
    if (nenhumaOpcao) {
        const confirmar = await confirm('Nenhuma opção de acessibilidade foi selecionada. Deseja apenas converter o documento?');
        if (!confirmar) return;
    }
    
    const processandoDiv = document.getElementById('processandoMsgProf');
    const btnSalvar = document.getElementById('btnAplicarAdaptacoesProf');
    
    if (processandoDiv) processandoDiv.style.display = 'block';
    if (btnSalvar) {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
    }
    
    try {
        const token = localStorage.getItem('auth_token');
        const formData = new FormData();
        formData.append('arquivo', arquivoSelecionadoProfessor);
        formData.append('opcoes', JSON.stringify(opcoes));
        
        const response = await fetch('/api/adaptar-documento', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            const byteCharacters = atob(data.pdf);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            
            const novaJanela = window.open(url, '_blank');
            if (novaJanela) {
                novaJanela.onload = () => {
                    setTimeout(() => novaJanela.print(), 1000);
                };
                fecharModalAdaptacao();
                mostrarAlertaGeral('✅ Documento adaptado! Aguardando impressão...', 'success');
            } else {
                mostrarAlertaGeral('⚠️ Permita pop-ups para abrir o documento', 'warning');
            }
        } else {
            throw new Error(data.error || 'Erro ao processar documento');
        }
        
    } catch (error) {
        console.error('❌ Erro:', error);
        mostrarAlertaGeral('❌ ' + error.message, 'error');
    } finally {
        if (processandoDiv) processandoDiv.style.display = 'none';
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = '<i class="fas fa-magic"></i> Aplicar Adaptações';
        }
    }
};

function mostrarAlertaGeral(mensagem, tipo = 'info') {
    const mostrarAlertaGerala = document.getElementById('mostrarAlertaGeralGeral');
    if (mostrarAlertaGerala) {
        mostrarAlertaGerala.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-${tipo === 'success' ? 'check-circle' : tipo === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <div>${mensagem}</div>
            </div>
        `;
        mostrarAlertaGerala.className = `mostrarAlertaGeral mostrarAlertaGeral-${tipo}`;
        mostrarAlertaGerala.style.display = 'block';
        
        setTimeout(() => {
            mostrarAlertaGerala.style.display = 'none';
        }, 5000);
    } else {
        mostrarAlertaGeral(mensagem);
    }
}

function mostrarTab(tabId) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    console.log(`📋 Mudando para tab: ${tabId}`);
    
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    const tabElement = document.getElementById(tabId);
    if (tabElement) {
        tabElement.classList.add('active');
    }
    
    document.querySelectorAll('.content-tabs .content-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.sidebar .nav-item').forEach(tab => {
        tab.classList.remove('active');
    });
    
    const sidebarTab = document.querySelector(`.sidebar .nav-item[onclick*="${tabId}"]`);
    if (sidebarTab) {
        sidebarTab.classList.add('active');
    }
    
    const headerTab = document.querySelector(`.content-tabs .content-tab[onclick*="${tabId}"]`);
    if (headerTab) {
        headerTab.classList.add('active');
    }
    
    if (tabId === 'turmas') {
        setTimeout(() => {
            carregarTurmasProfessor();
        }, 100);
    } else if (tabId === 'minhas-provas') {
        setTimeout(() => {
            carregarProvasProfessor();
        }, 100);
    } else if (tabId === 'resultados-gerais') {
        setTimeout(() => {
            carregarResultadosGerais();
        }, 100);
    }
}

function logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('user_data');
    window.location.href = 'login.html';
}

function calcularDuracao() {
    const inicio = document.getElementById('horarioInicio').value;
    const termino = document.getElementById('horarioTermino').value;
    
    if (!inicio || !termino) return;
    
    const [h1, m1] = inicio.split(':').map(Number);
    const [h2, m2] = termino.split(':').map(Number);
    
    const totalMinutos = (h2 * 60 + m2) - (h1 * 60 + m1);
    
    if (totalMinutos <= 0) {
        document.getElementById('duracaoCalculada').innerHTML = 
        '<span style="color: #ef4444;">Horário inválido</span>';
        return null;
    }
    
    const horas = Math.floor(totalMinutos / 60);
    const minutos = totalMinutos % 60;
    
    let duracaoTexto = '';
    if (horas > 0) {
        duracaoTexto += `${horas} hora${horas > 1 ? 's' : ''}`;
    }
    if (minutos > 0) {
        if (horas > 0) duracaoTexto += ' e ';
        duracaoTexto += `${minutos} minuto${minutos > 1 ? 's' : ''}`;
    }
    
    document.getElementById('duracaoCalculada').innerHTML = 
        `<strong>${duracaoTexto}</strong> (${totalMinutos} minutos)`;
    
    return totalMinutos;
}

window.mostrarTab = mostrarTab;
window.publicarProva = publicarProva;
window.regenerarProva = regenerarProva;
window.solicitarExclusaoTurma = solicitarExclusaoTurma;
window.confirmarExclusaoTurma = confirmarExclusaoTurma;
window.fecharModal = fecharModal;

// ============ EDITOR AVANÇADO DE QUESTÕES ============
let questoesParaEditar = [];
let editoresAtivos = {}; 
let imagensCarregadas = {};

async function abrirEdicaoQuestoesPreview() {
    if (!provaGerada || !provaGerada.questoes || provaGerada.questoes.length === 0) {
        mostrarAlerta('mostrarAlertaGeralProva', '⚠️ Nenhuma prova gerada para editar', 'info');
        return;
    }
    
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`/api/provas/${provaGerada.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.success && data.prova.publicada) {
                mostrarAlerta('mostrarAlertaGeralProva', 
                    '❌ Esta prova já foi publicada e não pode ser editada.\n' +
                    'Crie uma nova prova para fazer alterações.', 
                    'error');
                return;
            }
        }
    } catch (error) {
        console.warn('Não foi possível verificar status da prova:', error);
    }
    
    console.log('✅ Abrindo editor avançado de questões...');
    
    questoesParaEditar = JSON.parse(JSON.stringify(provaGerada.questoes));
    
    questoesParaEditar = questoesParaEditar.map((questao, index) => ({
        ...questao,
        pergunta: questao.pergunta || '<p>Digite aqui a pergunta da questão...</p>',
        opcoes: questao.opcoes || [
            '<p>Resposta correta</p>',
            '<p>Resposta incorreta</p>',
            '<p>Resposta incorreta</p>',
            '<p>Resposta incorreta</p>',
            '<p>Resposta incorreta</p>'
        ],
        respostaCorreta: questao.respostaCorreta !== undefined ? questao.respostaCorreta : 0,
        explicacao: questao.explicacao || '<p>Explique por que esta resposta está correta...</p>',
        dificuldade: questao.dificuldade || 'media',
        tags: questao.tags || [],
        imagens: questao.imagens || [],
        temLatex: questao.temLatex || false,
        tipo: questao.tipo || 'manual',
        _id: questao._id || `temp-${index}`
    }));
    
    console.log('📝 Preparando editor com', questoesParaEditar.length, 'questões');
    
    let modal = document.getElementById('modalEditorAvancado');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'modalEditorAvancado';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 1000px; max-height: 95vh; width: 95%; padding: 0; overflow: hidden;">
            <div class="modal-header" style="position: sticky; top: 0; background: white; z-index: 100; border-bottom: 1px solid #e5e7eb; padding: 15px 20px;">
                <h3 style="margin: 0; color: var(--gray-800); display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-edit" style="color: #f59e0b;"></i> 
                    <div>
                        <div>Editor Avançado de Questões</div>
                        <div style="font-size: 0.9rem; font-weight: normal; color: #6b7280; margin-top: 5px;">
                            "${provaGerada.titulo || 'Prova Gerada'}" • Suporte a imagens, fórmulas e tabelas
                        </div>
                    </div>
                </h3>
                <button class="modal-close" onclick="fecharEditorAvancado()" style="font-size: 1.5rem; background: none; border: none; cursor: pointer;">&times;</button>
            </div>
            
            <div style="padding: 0; height: calc(95vh - 70px); display: flex; flex-direction: column;">
                <div style="background: #f8fafc; padding: 15px 20px; border-bottom: 1px solid #e5e7eb; display: flex; gap: 10px; flex-wrap: wrap;">
                    <button onclick="adicionarNovaQuestaoEditor()" 
                            style="padding: 8px 16px; background: #4f46e5; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-plus-circle"></i> Nova Questão
                    </button>
                    
                    <button onclick="visualizarProvaEditada()" 
                            style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-eye"></i> Visualizar
                    </button>
                    
                    <div style="margin-left: auto; display: flex; gap: 10px;">
                        <button onclick="fecharEditorAvancado()" 
                                style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                            Cancelar
                        </button>
                        <button onclick="salvarQuestoesEditadasAvancado()" 
                                style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                            <i class="fas fa-save"></i> Salvar Tudo
                        </button>
                    </div>
                </div>
                
                <div id="mostrarAlertaGeralEditorAvancado" class="mostrarAlertaGeral" style="display: none; margin: 0; border-radius: 0;"></div>
                
                <div style="background: #f1f5f9; padding: 10px 20px; border-bottom: 1px solid #e5e7eb;">
                    <div style="display: flex; align-items: center; gap: 15px; overflow-x: auto;">
                        <span style="font-weight: 600; color: #4b5563; white-space: nowrap;">Navegar:</span>
                        <div id="navegacaoQuestoes" style="display: flex; gap: 5px;">
                        </div>
                    </div>
                </div>
                
                <div id="containerEditorQuestoes" style="flex: 1; overflow-y: auto; padding: 20px;">
                </div>
            </div>
        </div>
    `;
    
    carregarNavegacaoQuestoes();
    await carregarQuestoesEditorAvancado();
    
    modal.style.display = 'flex';
}

function carregarNavegacaoQuestoes() {
    const container = document.getElementById('navegacaoQuestoes');
    if (!container) return;
    
    let html = '';
    
    questoesParaEditar.forEach((questao, index) => {
        const temImagem = questao.imagens && questao.imagens.length > 0;
        const temLatex = questao.temLatex;
        
        html += `
            <button onclick="mostrarQuestaoEditor(${index})" 
                    class="btn-navegacao-questao" 
                    data-index="${index}"
                    style="padding: 8px 12px; background: white; border: 2px solid #e5e7eb; border-radius: 6px; cursor: pointer; font-weight: 600; color: #4b5563; min-width: 40px; display: flex; align-items: center; gap: 5px; white-space: nowrap;">
                ${index + 1}
                ${temImagem ? '<i class="fas fa-image" style="color: #8b5cf6; font-size: 0.8rem;"></i>' : ''}
                ${temLatex ? '<i class="fas fa-square-root-alt" style="color: #ef4444; font-size: 0.8rem;"></i>' : ''}
            </button>
        `;
    });
    
    html += `
        <button onclick="adicionarNovaQuestaoEditor()" 
                style="padding: 8px 12px; background: #4f46e5; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 5px; white-space: nowrap;">
            <i class="fas fa-plus"></i> Nova
        </button>
    `;
    
    container.innerHTML = html;
    
    if (questoesParaEditar.length > 0) {
        setTimeout(() => mostrarQuestaoEditor(0), 100);
    }
}

async function carregarQuestoesEditorAvancado() {
    const container = document.getElementById('containerEditorQuestoes');
    if (!container) return;
    
    if (!questoesParaEditar || questoesParaEditar.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #6b7280;">
                <i class="fas fa-question-circle" style="font-size: 2rem; margin-bottom: 10px;"></i>
                <p>Nenhuma questão para editar</p>
                <button onclick="adicionarNovaQuestaoEditor()" 
                        style="margin-top: 15px; padding: 10px 20px; background: #4f46e5; color: white; border: none; border-radius: 6px; cursor: pointer;">
                    Criar Primeira Questão
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div style="text-align: center; padding: 20px; color: #6b7280;">
            <i class="fas fa-spinner fa-spin"></i>
            <p>Carregando editor...</p>
        </div>
    `;
    
    await mostrarQuestaoEditor(0);
}

async function mostrarQuestaoEditor(index) {
    if (!questoesParaEditar[index]) return;
    
    const container = document.getElementById('containerEditorQuestoes');
    if (!container) return;
    
    const questao = questoesParaEditar[index];
    const questaoId = `questao-${index}`;
    
    document.querySelectorAll('.btn-navegacao-questao').forEach(btn => {
        btn.style.background = 'white';
        btn.style.borderColor = '#e5e7eb';
        btn.style.color = '#4b5563';
    });
    
    const btnAtivo = document.querySelector(`.btn-navegacao-questao[data-index="${index}"]`);
    if (btnAtivo) {
        btnAtivo.style.background = '#4f46e5';
        btnAtivo.style.borderColor = '#4f46e5';
        btnAtivo.style.color = 'white';
    }
    
    const html = `
        <div id="${questaoId}" class="editor-questao-container" style="max-width: 900px; margin: 0 auto;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; padding-bottom: 15px; border-bottom: 2px solid #e5e7eb;">
                <div>
                    <h3 style="margin: 0; color: #4b5563; display: flex; align-items: center; gap: 10px;">
                        <span style="background: #4f46e5; color: white; padding: 2px 12px; border-radius: 12px; font-size: 1rem;">
                            Questão ${index + 1}
                        </span>
                        <span style="font-size: 0.9rem; color: #6b7280;">
                            (${index + 1} de ${questoesParaEditar.length})
                        </span>
                    </h3>
                </div>
                
                <div style="display: flex; gap: 10px;">
                    <button onclick="removerQuestaoEditor(${index})" 
                            style="padding: 8px 12px; background: #fee2e2; color: #dc2626; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 5px;">
                        <i class="fas fa-trash"></i> Remover
                    </button>
                    
                    ${index > 0 ? `
                        <button onclick="moverQuestaoEditor(${index}, 'cima')" 
                                style="padding: 8px 12px; background: #e5e7eb; color: #4b5563; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                            <i class="fas fa-arrow-up"></i>
                        </button>
                    ` : ''}
                    
                    ${index < questoesParaEditar.length - 1 ? `
                        <button onclick="moverQuestaoEditor(${index}, 'baixo')" 
                                style="padding: 8px 12px; background: #e5e7eb; color: #4b5563; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                            <i class="fas fa-arrow-down"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
            
            <div style="margin-bottom: 30px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <label style="font-weight: 700; color: #4b5563; font-size: 1.1rem;">
                        <i class="fas fa-question-circle"></i> Texto da Pergunta:
                    </label>
                    
                    <div style="display: flex; gap: 10px;">
                        <button onclick="inserirFormulaMatematica(${index})" 
                                style="padding: 6px 12px; background: #fef3c7; color: #92400e; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 5px; font-size: 0.85rem;">
                            <i class="fas fa-square-root-alt"></i> Fórmula
                        </button>
                        
                        <button onclick="inserirImagemQuestao(${index}, 'pergunta')" 
                                style="padding: 6px 12px; background: #e0e7ff; color: #3730a3; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 5px; font-size: 0.85rem;">
                            <i class="fas fa-image"></i> Imagem
                        </button>
                        
                        <button onclick="inserirTabelaQuestao(${index})" 
                                style="padding: 6px 12px; background: #d1fae5; color: #065f46; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 5px; font-size: 0.85rem;">
                            <i class="fas fa-table"></i> Tabela
                        </button>
                    </div>
                </div>
                
                <div id="editor-pergunta-${index}" class="editor-ckeditor" style="min-height: 150px; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden;">
                    ${questao.pergunta || '<p>Digite aqui a pergunta da questão...</p>'}
                </div>
            </div>
            
            <div style="margin-bottom: 30px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <label style="font-weight: 700; color: #4b5563; font-size: 1.1rem;">
                        <i class="fas fa-list-ul"></i> Opções de Resposta:
                    </label>
                    
                    <button onclick="adicionarOpcaoAvancada(${index})" 
                            style="padding: 8px 16px; background: #4f46e5; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 5px;">
                        <i class="fas fa-plus"></i> Nova Opção
                    </button>
                </div>
                
                <div id="container-opcoes-${index}" style="display: flex; flex-direction: column; gap: 15px;">
                    ${(questao.opcoes || []).map((opcao, opcaoIndex) => `
                        <div class="opcao-editor" data-opcao-index="${opcaoIndex}" style="border: 2px solid ${opcaoIndex === questao.respostaCorreta ? '#10b981' : '#e5e7eb'}; border-radius: 8px; overflow: hidden; background: ${opcaoIndex === questao.respostaCorreta ? '#f0fdf4' : 'white'}; transition: all 0.3s;">
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; background: ${opcaoIndex === questao.respostaCorreta ? '#d1fae5' : '#f8fafc'}; border-bottom: 1px solid ${opcaoIndex === questao.respostaCorreta ? '#10b981' : '#e5e7eb'};">
                                <div style="display: flex; align-items: center; gap: 15px;">
                                    <span style="font-weight: 700; font-size: 1.2rem; color: ${opcaoIndex === questao.respostaCorreta ? '#065f46' : '#4b5563'};">
                                        ${String.fromCharCode(65 + opcaoIndex)}
                                    </span>
                                    
                                    <div style="display: flex; gap: 8px;">
                                        <button onclick="marcarOpcaoCorreta(${index}, ${opcaoIndex})" 
                                                style="padding: 6px 12px; background: ${opcaoIndex === questao.respostaCorreta ? '#10b981' : '#e5e7eb'}; color: ${opcaoIndex === questao.respostaCorreta ? 'white' : '#4b5563'}; border: none; border-radius: 6px; cursor: pointer; font-weight: ${opcaoIndex === questao.respostaCorreta ? 'bold' : 'normal'}; display: flex; align-items: center; gap: 5px;">
                                            ${opcaoIndex === questao.respostaCorreta ? '<i class="fas fa-check-circle"></i> Correta' : 'Marcar como correta'}
                                        </button>
                                        
                                        <button onclick="inserirImagemQuestao(${index}, 'opcao', ${opcaoIndex})" 
                                                style="padding: 6px 12px; background: #e0e7ff; color: #3730a3; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 5px;">
                                            <i class="fas fa-image"></i>
                                        </button>
                                    </div>
                                </div>
                                
                                <div style="display: flex; gap: 8px;">
                                    ${opcaoIndex >= 2 ? `
                                        <button onclick="removerOpcaoAvancada(${index}, ${opcaoIndex})" 
                                                style="padding: 6px 10px; background: #fee2e2; color: #dc2626; border: none; border-radius: 6px; cursor: pointer;">
                                            <i class="fas fa-times"></i>
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                            
                            <div id="editor-opcao-${index}-${opcaoIndex}" class="editor-ckeditor-opcao" style="min-height: 100px; padding: 15px;">
                                ${opcao || `<p>Texto da opção ${String.fromCharCode(65 + opcaoIndex)}...</p>`}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <label style="font-weight: 700; color: #4b5563; font-size: 1.1rem; display: block; margin-bottom: 15px;">
                    <i class="fas fa-lightbulb"></i> Explicação da Resposta (Opcional):
                </label>
                
                <div id="editor-explicacao-${index}" class="editor-ckeditor" style="min-height: 120px; border: 1px solid #d1d5db; border-radius: 8px; overflow: hidden;">
                    ${questao.explicacao || '<p>Explique por que esta resposta está correta...</p>'}
                </div>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px;">
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #4b5563;">
                            <i class="fas fa-chart-line"></i> Dificuldade:
                        </label>
                        <select id="dificuldade-questao-${index}" class="form-control" style="width: 100%;">
                            <option value="facil" ${questao.dificuldade === 'facil' ? 'selected' : ''}>Fácil</option>
                            <option value="media" ${!questao.dificuldade || questao.dificuldade === 'media' ? 'selected' : ''}>Médio</option>
                            <option value="dificil" ${questao.dificuldade === 'dificil' ? 'selected' : ''}>Difícil</option>
                        </select>
                    </div>
                    
                    <div>
                        <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #4b5563;">
                            <i class="fas fa-tags"></i> Tópicos (separados por vírgula):
                        </label>
                        <input type="text" 
                            id="tags-questao-${index}" 
                            class="form-control" 
                            value="${questao.tags ? questao.tags.join(', ') : ''}"
                            placeholder="Ex: matemática, álgebra, equações">
                    </div>
                </div>
            </div>
            
            ${questao.imagens && questao.imagens.length > 0 ? `
                <div style="margin-top: 25px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                    <h4 style="color: #4b5563; margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
                        <i class="fas fa-images"></i> Imagens desta Questão
                    </h4>
                    
                    <div id="galeria-imagens-${index}" style="display: flex; flex-wrap: wrap; gap: 15px;">
                        ${questao.imagens.map((img, imgIndex) => `
                            <div style="position: relative; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; width: 120px;">
                                <img src="${img.url || img}" 
                                    style="width: 100%; height: 80px; object-fit: cover;">
                                <div style="padding: 8px; background: #f8fafc; font-size: 0.8rem; color: #6b7280; word-break: break-all;">
                                    ${img.nome || `Imagem ${imgIndex + 1}`}
                                </div>
                                <button onclick="removerImagemQuestao(${index}, ${imgIndex})" 
                                        style="position: absolute; top: 5px; right: 5px; background: rgba(239, 68, 68, 0.9); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.8rem;">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            <div style="display: flex; justify-content: space-between; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                ${index > 0 ? `
                    <button onclick="mostrarQuestaoEditor(${index - 1})" 
                            style="padding: 10px 20px; background: #e5e7eb; color: #4b5563; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                        <i class="fas fa-arrow-left"></i> Questão Anterior
                    </button>
                ` : '<div></div>'}
                
                ${index < questoesParaEditar.length - 1 ? `
                    <button onclick="mostrarQuestaoEditor(${index + 1})" 
                            style="padding: 10px 20px; background: #4f46e5; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 8px;">
                        Próxima Questão <i class="fas fa-arrow-right"></i>
                    </button>
                ` : '<div></div>'}
            </div>
        </div>
    `;
    
    container.innerHTML = html;
    
    await inicializarEditoresQuestao(index);
    
    if (typeof MathJax !== 'undefined') {
        MathJax.typesetPromise();
    }
}

async function inicializarEditoresQuestao(index) {
    try {
        console.log(`🔧 Inicializando editores SIMPLES para questão ${index + 1}`);
        
        const questao = questoesParaEditar[index];
        if (!questao) {
            console.error(`Questão ${index} não encontrada`);
            return;
        }
        
        const perguntaEditorId = `editor-pergunta-${index}`;
        const perguntaElement = document.getElementById(perguntaEditorId);
        
        if (perguntaElement) {
            console.log(`✅ Configurando editor de pergunta: ${perguntaEditorId}`);
            
            perguntaElement.setAttribute('contenteditable', 'true');
            perguntaElement.style.cssText = `
                min-height: 150px;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                padding: 15px;
                background: white;
                outline: none;
                overflow-y: auto;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 1rem;
                line-height: 1.5;
            `;
            
            perguntaElement.addEventListener('input', function() {
                questao.pergunta = this.innerHTML;
                console.log(`Pergunta atualizada: ${this.innerHTML.substring(0, 50)}...`);
            });
            
            adicionarBarraFerramentas(perguntaElement, index, 'pergunta');
        }
        
        const opcoes = questao.opcoes || [];
        console.log(`🔧 Configurando ${opcoes.length} editores de opção`);
        
        for (let opcaoIndex = 0; opcaoIndex < opcoes.length; opcaoIndex++) {
            const opcaoEditorId = `editor-opcao-${index}-${opcaoIndex}`;
            const opcaoElement = document.getElementById(opcaoEditorId);
            
            if (opcaoElement) {
                opcaoElement.setAttribute('contenteditable', 'true');
                opcaoElement.style.cssText = `
                    min-height: 100px;
                    padding: 15px;
                    outline: none;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    font-size: 0.95rem;
                    line-height: 1.5;
                `;
                
                opcaoElement.addEventListener('input', function() {
                    if (questao.opcoes && questao.opcoes[opcaoIndex] !== undefined) {
                        questao.opcoes[opcaoIndex] = this.innerHTML;
                        console.log(`Opção ${opcaoIndex + 1} atualizada`);
                    }
                });
            }
        }
        
        const explicacaoEditorId = `editor-explicacao-${index}`;
        const explicacaoElement = document.getElementById(explicacaoEditorId);
        
        if (explicacaoElement) {
            explicacaoElement.setAttribute('contenteditable', 'true');
            explicacaoElement.style.cssText = `
                min-height: 120px;
                border: 1px solid #d1d5db;
                border-radius: 8px;
                padding: 15px;
                background: white;
                outline: none;
                overflow-y: auto;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 0.95rem;
                line-height: 1.5;
            `;
            
            explicacaoElement.addEventListener('input', function() {
                questao.explicacao = this.innerHTML;
                console.log(`Explicação atualizada: ${this.innerHTML.substring(0, 50)}...`);
            });
            
            adicionarBarraFerramentas(explicacaoElement, index, 'explicacao');
        }
        
        configurarControlesQuestao(index);
        
        console.log(`✅ Editores da questão ${index + 1} configurados com sucesso!`);
        
    } catch (error) {
        console.error('❌ Erro ao inicializar editores SIMPLES:', error);
        mostrarAlertaEditor('⚠️ Editores configurados em modo básico. Recursos avançados limitados.', 'warning');
    }
}

function adicionarBarraFerramentas(elementoEditor, questaoIndex, tipo) {
    const toolbarId = `toolbar-${tipo}-${questaoIndex}`;
    const toolbar = document.createElement('div');
    toolbar.id = toolbarId;
    toolbar.style.cssText = `
        display: flex;
        gap: 5px;
        padding: 8px;
        background: #f8fafc;
        border-bottom: 1px solid #e5e7eb;
        border-radius: 8px 8px 0 0;
        flex-wrap: wrap;
    `;
    
    const botoes = [
        { icon: 'bold', title: 'Negrito', cmd: 'bold' },
        { icon: 'italic', title: 'Itálico', cmd: 'italic' },
        { icon: 'underline', title: 'Sublinhado', cmd: 'underline' },
        { icon: 'list-ul', title: 'Lista', cmd: 'insertUnorderedList' },
        { icon: 'list-ol', title: 'Lista numerada', cmd: 'insertOrderedList' },
        { icon: 'link', title: 'Link', cmd: 'createLink' },
        { icon: 'image', title: 'Imagem', onclick: () => inserirImagemQuestao(questaoIndex, tipo) }
    ];
    
    botoes.forEach(botao => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.title = botao.title;
        btn.innerHTML = `<i class="fas fa-${botao.icon}"></i>`;
        btn.style.cssText = `
            width: 32px;
            height: 32px;
            border: 1px solid #d1d5db;
            background: white;
            border-radius: 4px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #4b5563;
            transition: all 0.2s;
        `;
        
        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#f3f4f6';
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'white';
        });
        
        if (botao.onclick) {
            btn.addEventListener('click', botao.onclick);
        } else {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                elementoEditor.focus();
                document.execCommand(botao.cmd, false, null);
            });
        }
        
        toolbar.appendChild(btn);
    });
    
    elementoEditor.parentNode.insertBefore(toolbar, elementoEditor);
    
    elementoEditor.addEventListener('focus', () => {
        toolbar.style.display = 'flex';
    });
    
    elementoEditor.addEventListener('blur', () => {
        setTimeout(() => {
            if (!toolbar.contains(document.activeElement) && 
                document.activeElement !== elementoEditor) {
                toolbar.style.display = 'none';
            }
        }, 200);
    });
    
    toolbar.style.display = 'none';
}

function configurarControlesQuestao(index) {
    const selectDificuldade = document.getElementById(`dificuldade-questao-${index}`);
    if (selectDificuldade) {
        selectDificuldade.addEventListener('change', function() {
            if (questoesParaEditar[index]) {
                questoesParaEditar[index].dificuldade = this.value;
                console.log(`Dificuldade da questão ${index + 1} alterada para: ${this.value}`);
            }
        });
    }
    
    const inputTags = document.getElementById(`tags-questao-${index}`);
    if (inputTags) {
        inputTags.addEventListener('input', function() {
            if (questoesParaEditar[index]) {
                const tags = this.value.split(',').map(tag => tag.trim()).filter(tag => tag);
                questoesParaEditar[index].tags = tags;
            }
        });
    }
}

function destruirEditoresQuestao(index) {
    console.log(`🗑️ Removendo referências da questão ${index + 1}`);
    
    const perguntaEditor = document.getElementById(`editor-pergunta-${index}`);
    if (perguntaEditor) {
        perguntaEditor.removeEventListener('input', perguntaEditor._listener);
    }
    
    const explicacaoEditor = document.getElementById(`editor-explicacao-${index}`);
    if (explicacaoEditor) {
        explicacaoEditor.removeEventListener('input', explicacaoEditor._listener);
    }
}

function adicionarNovaQuestaoEditor() {
    const novaQuestao = {
        pergunta: '<p>Digite aqui a nova pergunta...</p>',
        opcoes: [
            '<p>Resposta correta</p>',
            '<p>Resposta incorreta</p>',
            '<p>Resposta incorreta</p>',
            '<p>Resposta incorreta</p>',
            '<p>Resposta incorreta</p>'
        ],
        respostaCorreta: 0,
        explicacao: '<p>Explique por que esta resposta está correta...</p>',
        dificuldade: 'media',
        tags: [],
        imagens: [],
        tipo: 'manual',
        temLatex: false
    };
    
    questoesParaEditar.push(novaQuestao);
    
    carregarNavegacaoQuestoes();
    
    const novoIndex = questoesParaEditar.length - 1;
    mostrarQuestaoEditor(novoIndex);
    
    const container = document.getElementById('containerEditorQuestoes');
    if (container) {
        container.scrollTop = 0;
    }
    
    console.log('✅ Nova questão adicionada com 5 alternativas');
}

async function removerQuestaoEditor(index) {
    console.log(`🗑️ Tentando remover questão ${index + 1}...`);
    
    if (!questoesParaEditar || questoesParaEditar.length === 0) {
        console.error('❌ Não há questões para remover');
        mostrarAlertaEditor('❌ Não há questões para remover', 'error');
        return;
    }
    
    if (index < 0 || index >= questoesParaEditar.length) {
        console.error(`❌ Índice ${index} inválido. Total de questões: ${questoesParaEditar.length}`);
        mostrarAlertaEditor(`❌ Índice da questão inválido`, 'error');
        return;
    }
    
    if (questoesParaEditar.length <= 1) {
        mostrarAlertaEditor('❌ A prova deve ter pelo menos uma questão.', 'error');
        return;
    }
    
    const confirmacao = await confirm(`Tem certeza que deseja remover a Questão ${index + 1}?\n\nEsta ação não pode ser desfeita.`);
    if (!confirmacao) {
        console.log('❌ Remoção cancelada pelo usuário');
        return;
    }
    
    console.log(`✅ Confirmado remoção da questão ${index + 1}`);
    
    try {
        const questaoRemovida = questoesParaEditar[index];
        const tituloQuestao = questaoRemovida.pergunta 
            ? questaoRemovida.pergunta.replace(/<[^>]*>/g, '').substring(0, 50) + '...'
            : `Questão ${index + 1}`;
        
        limparEditoresQuestao(index);
        
        questoesParaEditar.splice(index, 1);
        console.log(`✅ Questão removida. Restam: ${questoesParaEditar.length} questões`);
        
        atualizarNavegacaoQuestoes();
        
        let novaQuestaoIndex;
        if (index > 0) {
            novaQuestaoIndex = index - 1;
        } else if (questoesParaEditar.length > 0) {
            novaQuestaoIndex = 0;
        } else {
            mostrarAlertaEditor('❌ Todas as questões foram removidas. Fechando editor...', 'error');
            setTimeout(() => {
                fecharEditorAvancado();
            }, 2000);
            return;
        }
        
        if (novaQuestaoIndex !== undefined) {
            console.log(`🔄 Mostrando questão ${novaQuestaoIndex + 1} após remoção`);
            mostrarQuestaoEditor(novaQuestaoIndex);
        }
        
        mostrarAlertaEditor(`✅ Questão removida com sucesso!`, 'success');
        
        if (window.provaGerada && window.provaGerada.questoes) {
            window.provaGerada.questoes = [...questoesParaEditar];
            console.log('✅ provaGerada atualizada após remoção');
        }
        
    } catch (error) {
        console.error('❌ Erro ao remover questão:', error);
        mostrarAlertaEditor(`❌ Erro ao remover questão: ${error.message}`, 'error');
    }
}

function atualizarNavegacaoQuestoes() {
    console.log('🔄 Atualizando navegação de questões...');
    
    const container = document.getElementById('navegacaoQuestoes');
    if (!container) {
        console.error('❌ Container de navegação não encontrado');
        return;
    }
    
    let html = '';
    
    questoesParaEditar.forEach((questao, index) => {
        const temImagem = questao.imagens && questao.imagens.length > 0;
        const temLatex = questao.temLatex;
        
        html += `
            <button onclick="mostrarQuestaoEditor(${index})" 
                    class="btn-navegacao-questao" 
                    data-index="${index}"
                    style="padding: 8px 12px; background: white; border: 2px solid #e5e7eb; border-radius: 6px; cursor: pointer; font-weight: 600; color: #4b5563; min-width: 40px; display: flex; align-items: center; gap: 5px; white-space: nowrap;">
                ${index + 1}
                ${temImagem ? '<i class="fas fa-image" style="color: #8b5cf6; font-size: 0.8rem;"></i>' : ''}
                ${temLatex ? '<i class="fas fa-square-root-alt" style="color: #ef4444; font-size: 0.8rem;"></i>' : ''}
            </button>
        `;
    });
    
    html += `
        <button onclick="adicionarNovaQuestaoEditor()" 
                style="padding: 8px 12px; background: #4f46e5; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; display: flex; align-items: center; gap: 5px; white-space: nowrap;">
            <i class="fas fa-plus"></i> Nova
        </button>
    `;
    
    container.innerHTML = html;
    
    const questaoAtiva = document.querySelector('.editor-questao-container');
    if (questaoAtiva && questaoAtiva.id) {
        const match = questaoAtiva.id.match(/questao-(\d+)/);
        if (match) {
            const indexAtivo = parseInt(match[1]);
            const btnAtivo = container.querySelector(`[data-index="${indexAtivo}"]`);
            if (btnAtivo) {
                btnAtivo.style.background = '#4f46e5';
                btnAtivo.style.borderColor = '#4f46e5';
                btnAtivo.style.color = 'white';
            }
        }
    }
    
    console.log(`✅ Navegação atualizada: ${questoesParaEditar.length} questões`);
}

function limparEditoresQuestao(index) {
    console.log(`🧹 Limpando editores da questão ${index + 1}...`);
    
    const ids = [
        `editor-pergunta-${index}`,
        `editor-explicacao-${index}`,
        `toolbar-pergunta-${index}`,
        `toolbar-explicacao-${index}`
    ];
    
    const questao = questoesParaEditar[index];
    if (questao && questao.opcoes) {
        for (let i = 0; i < questao.opcoes.length; i++) {
            ids.push(`editor-opcao-${index}-${i}`);
        }
    }
    
    ids.forEach(id => {
        const elemento = document.getElementById(id);
        if (elemento) {
            const clone = elemento.cloneNode(false);
            if (elemento.parentNode) {
                elemento.parentNode.replaceChild(clone, elemento);
            }
            console.log(`  - Limpou: ${id}`);
        }
    });
    
    const controles = [
        `dificuldade-questao-${index}`,
        `tags-questao-${index}`
    ];
    
    controles.forEach(id => {
        const controle = document.getElementById(id);
        if (controle) {
            controle.replaceWith(controle.cloneNode(true));
        }
    });
    
    console.log(`✅ Editores da questão ${index + 1} limpos`);
}

function moverQuestaoEditor(index, direcao) {
    if (direcao === 'cima' && index > 0) {
        destruirEditoresQuestao(index);
        destruirEditoresQuestao(index - 1);
        
        const temp = questoesParaEditar[index];
        questoesParaEditar[index] = questoesParaEditar[index - 1];
        questoesParaEditar[index - 1] = temp;
        
        carregarNavegacaoQuestoes();
        mostrarQuestaoEditor(index - 1);
        
    } else if (direcao === 'baixo' && index < questoesParaEditar.length - 1) {
        destruirEditoresQuestao(index);
        destruirEditoresQuestao(index + 1);
        
        const temp = questoesParaEditar[index];
        questoesParaEditar[index] = questoesParaEditar[index + 1];
        questoesParaEditar[index + 1] = temp;
        
        carregarNavegacaoQuestoes();
        mostrarQuestaoEditor(index + 1);
    }
}

function marcarOpcaoCorreta(questaoIndex, opcaoIndex) {
    if (questoesParaEditar[questaoIndex]) {
        questoesParaEditar[questaoIndex].respostaCorreta = opcaoIndex;
        
        const opcaoElement = document.querySelector(`.opcao-editor[data-opcao-index="${opcaoIndex}"]`);
        if (opcaoElement) {
            document.querySelectorAll(`#container-opcoes-${questaoIndex} .opcao-editor`).forEach(el => {
                el.style.borderColor = '#e5e7eb';
                el.style.background = 'white';
                el.querySelector('button').style.background = '#e5e7eb';
                el.querySelector('button').style.color = '#4b5563';
                el.querySelector('button').innerHTML = 'Marcar como correta';
            });
            
            opcaoElement.style.borderColor = '#10b981';
            opcaoElement.style.background = '#f0fdf4';
            const btnCorreta = opcaoElement.querySelector('button');
            btnCorreta.style.background = '#10b981';
            btnCorreta.style.color = 'white';
            btnCorreta.innerHTML = '<i class="fas fa-check-circle"></i> Correta';
        }
    }
}

function adicionarOpcaoAvancada(questaoIndex) {
    if (questoesParaEditar[questaoIndex]) {
        const numOpcoes = questoesParaEditar[questaoIndex].opcoes.length;
        if (numOpcoes >= 5) {
            mostrarAlertaEditor('❌ Limite de 5 opções por questão.', 'error');
            return;
        }
        
        const novaLetra = String.fromCharCode(65 + numOpcoes);
        questoesParaEditar[questaoIndex].opcoes.push(`<p>Texto da opção ${novaLetra}...</p>`);
        
        destruirEditoresQuestao(questaoIndex);
        mostrarQuestaoEditor(questaoIndex);
    }
}

function removerOpcaoAvancada(questaoIndex, opcaoIndex) {
    if (questoesParaEditar[questaoIndex] && questoesParaEditar[questaoIndex].opcoes.length > 2) {
        if (opcaoIndex === questoesParaEditar[questaoIndex].respostaCorreta) {
            questoesParaEditar[questaoIndex].respostaCorreta = 0;
        }
        else if (opcaoIndex < questoesParaEditar[questaoIndex].respostaCorreta) {
            questoesParaEditar[questaoIndex].respostaCorreta--;
        }
        
        if (editoresCKEditor[`opcao-${questaoIndex}-${opcaoIndex}`]) {
            editoresCKEditor[`opcao-${questaoIndex}-${opcaoIndex}`].destroy();
            delete editoresCKEditor[`opcao-${questaoIndex}-${opcaoIndex}`];
        }
        
        questoesParaEditar[questaoIndex].opcoes.splice(opcaoIndex, 1);
        
        mostrarQuestaoEditor(questaoIndex);
    }
}

function inserirFormulaMatematica(questaoIndex) {
    const formula = prompt('Digite a fórmula matemática em LaTeX (ex: \\frac{a}{b} ou x^2 + y^2 = z^2):');
    if (formula) {
        const editor = editoresCKEditor[`pergunta-${questaoIndex}`];
        if (editor) {
            editor.model.change(writer => {
                const insertPosition = editor.model.document.selection.getFirstPosition();
                writer.insertText(`\\(${formula}\\)`, insertPosition);
            });
        }
    }
}

function inserirImagemQuestao(questaoIndex, tipo, opcaoIndex = null) {
    console.log(`📸 Inserindo imagem - Questão: ${questaoIndex}, Tipo: ${tipo}, Opção: ${opcaoIndex}`);
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.jpg,.jpeg,.png,.gif,.webp';
    input.style.display = 'none';
    document.body.appendChild(input);
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) {
            input.remove();
            return;
        }
        
        console.log(`📁 Arquivo selecionado: ${file.name} (${file.size} bytes, ${file.type})`);
        
        if (file.size > 5 * 1024 * 1024) {
            mostrarAlertaEditor('❌ A imagem deve ter no máximo 5MB.', 'error');
            input.remove();
            return;
        }
        
        const tiposPermitidos = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!tiposPermitidos.includes(file.type)) {
            mostrarAlertaEditor('❌ Tipo de imagem não suportado. Use JPEG, PNG, GIF ou WebP.', 'error');
            input.remove();
            return;
        }
        
        try {
            mostrarAlertaEditor('📤 Enviando imagem...', 'info');
            
            const token = localStorage.getItem('auth_token');
            if (!token) {
                throw new Error('Token de autenticação não encontrado');
            }
            
            const formData = new FormData();
            formData.append('imagem', file);
            
            console.log('📤 Enviando para /api/upload/imagem...');
            
            const response = await fetch('/api/upload/imagem', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Erro ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log('✅ Resposta do upload:', data);
            
            if (!data.success) {
                throw new Error(data.error || 'Erro ao enviar imagem');
            }
            
            let editorElement;
            if (tipo === 'pergunta') {
                editorElement = document.getElementById(`editor-pergunta-${questaoIndex}`);
            } else if (tipo === 'opcao' && opcaoIndex !== null) {
                editorElement = document.getElementById(`editor-opcao-${questaoIndex}-${opcaoIndex}`);
            } else if (tipo === 'explicacao') {
                editorElement = document.getElementById(`editor-explicacao-${questaoIndex}`);
            }
            
            if (!editorElement) {
                throw new Error('Editor não encontrado');
            }
            
            editorElement.focus();
            
            const imgElement = document.createElement('img');
            imgElement.src = data.url;
            imgElement.alt = data.nome;
            imgElement.style.maxWidth = '100%';
            imgElement.style.maxHeight = '300px';
            imgElement.style.display = 'block';
            imgElement.style.margin = '10px 0';
            imgElement.style.borderRadius = '4px';
            imgElement.style.border = '1px solid #e5e7eb';
            imgElement.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            
            editorElement.appendChild(imgElement);
            
            const br = document.createElement('br');
            editorElement.appendChild(br);
            
            const questao = questoesParaEditar[questaoIndex];
            if (!questao.imagens) {
                questao.imagens = [];
            }
            
            questao.imagens.push({
                url: data.url,
                nome: data.nome,
                nomeArquivo: data.nomeArquivo,
                tamanho: data.tamanho,
                tipo: data.tipo,
                dataUpload: data.dataUpload,
                posicao: tipo,
                opcaoIndex: opcaoIndex
            });
            
            atualizarGaleriaImagens(questaoIndex);
            
            mostrarAlertaEditor('✅ Imagem adicionada com sucesso!', 'success');
            
        } catch (error) {
            console.error('❌ Erro no upload:', error);
            mostrarAlertaEditor(`❌ Erro: ${error.message}`, 'error');
        } finally {
            setTimeout(() => {
                if (input.parentNode) {
                    input.remove();
                }
            }, 100);
        }
    };
    
    input.click();
}

function getEditorId(questaoIndex, tipo, opcaoIndex = null) {
    if (tipo === 'pergunta') {
        return `editor-pergunta-${questaoIndex}`;
    } else if (tipo === 'opcao' && opcaoIndex !== null) {
        return `editor-opcao-${questaoIndex}-${opcaoIndex}`;
    } else if (tipo === 'explicacao') {
        return `editor-explicacao-${questaoIndex}`;
    }
    return null;
}

async function removerImagemQuestao(questaoIndex, imgIndex) {
    const confirmar = await confirm('🗑️ Remover esta imagem da questão?');
    if (!confirmar) {
        return;
    }
    
    const questao = questoesParaEditar[questaoIndex];
    if (!questao || !questao.imagens || !questao.imagens[imgIndex]) {
        return;
    }
    
    try {
        const imagemRemovida = questao.imagens[imgIndex];
        
        console.log('🗑️ Removendo imagem:', imagemRemovida);
        
        questao.imagens.splice(imgIndex, 1);
        
        const editores = [
            document.getElementById(`editor-pergunta-${questaoIndex}`),
            document.getElementById(`editor-explicacao-${questaoIndex}`)
        ];
        
        if (questao.opcoes) {
            for (let i = 0; i < questao.opcoes.length; i++) {
                const opcaoEditor = document.getElementById(`editor-opcao-${questaoIndex}-${i}`);
                if (opcaoEditor) editores.push(opcaoEditor);
            }
        }
        
        editores.forEach(editor => {
            if (editor) {
                const imagens = editor.querySelectorAll('img');
                imagens.forEach(img => {
                    if (img.src.includes(imagemRemovida.url) || 
                        img.src.endsWith(imagemRemovida.nomeArquivo) ||
                        img.src.includes(imagemRemovida.nome)) {
                        img.remove();
                        console.log('✅ Imagem removida do editor');
                    }
                });
            }
        });
        
        atualizarGaleriaImagens(questaoIndex);
        
        mostrarAlertaEditor('🗑️ Imagem removida com sucesso!', 'success');
        
    } catch (error) {
        console.error('❌ Erro ao remover imagem:', error);
        mostrarAlertaEditor('❌ Erro ao remover imagem', 'error');
    }
}

function atualizarGaleriaImagens(questaoIndex) {
    const questao = questoesParaEditar[questaoIndex];
    if (!questao) return;
    
    let galeria = document.getElementById(`galeria-imagens-${questaoIndex}`);
    
    if (!galeria) {
        const container = document.getElementById(`questao-${questaoIndex}`);
        if (container) {
            const divImagens = document.createElement('div');
            divImagens.id = `galeria-imagens-${questaoIndex}`;
            divImagens.style.cssText = 'display: flex; flex-wrap: wrap; gap: 15px; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb;';
            
            const titulo = document.createElement('h4');
            titulo.style.cssText = 'color: #4b5563; margin-bottom: 15px; display: flex; align-items: center; gap: 10px; width: 100%;';
            titulo.innerHTML = '<i class="fas fa-images"></i> Imagens desta Questão';
            
            container.appendChild(titulo);
            container.appendChild(divImagens);
            galeria = divImagens;
        }
    }
    
    if (!galeria) return;
    
    if (!questao.imagens || questao.imagens.length === 0) {
        const containerImagens = document.querySelector(`#questao-${questaoIndex} h4`);
        if (containerImagens) containerImagens.style.display = 'none';
        galeria.style.display = 'none';
        galeria.innerHTML = '';
        return;
    }
    
    galeria.style.display = 'flex';
    const titulo = document.querySelector(`#questao-${questaoIndex} h4`);
    if (titulo) titulo.style.display = 'flex';
    
    let html = '';
    questao.imagens.forEach((img, imgIndex) => {
        const nomeExibicao = img.nome || `Imagem ${imgIndex + 1}`;
        const nomeTruncado = nomeExibicao.length > 15 ? 
            nomeExibicao.substring(0, 15) + '...' : nomeExibicao;
        
        let badge = '';
        if (img.posicao === 'pergunta') badge = '<span style="background: #3b82f6; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem;">Pergunta</span>';
        else if (img.posicao === 'opcao') badge = `<span style="background: #8b5cf6; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem;">Opção ${String.fromCharCode(65 + (img.opcaoIndex || 0))}</span>`;
        else if (img.posicao === 'explicacao') badge = '<span style="background: #10b981; color: white; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem;">Explicação</span>';
        
        html += `
            <div style="position: relative; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; width: 140px; background: #f8fafc; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <div style="position: relative; height: 100px; background: #f1f5f9; display: flex; align-items: center; justify-content: center;">
                    <img src="${img.url}" 
                        style="max-width: 100%; max-height: 100px; object-fit: contain;"
                        alt="${nomeExibicao}">
                </div>
                <div style="padding: 8px;">
                    <div style="font-size: 0.8rem; color: #4b5563; font-weight: 600; margin-bottom: 4px; word-break: break-all;">
                        ${nomeTruncado}
                    </div>
                    <div style="margin-bottom: 8px;">
                        ${badge}
                    </div>
                    <div style="display: flex; gap: 4px;">
                        <button onclick="removerImagemQuestao(${questaoIndex}, ${imgIndex})" 
                                style="flex: 1; padding: 4px 8px; background: #ef4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.75rem; display: flex; align-items: center; justify-content: center; gap: 4px;">
                            <i class="fas fa-trash"></i> Remover
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    
    galeria.innerHTML = html;
}

function inserirTabelaQuestao(questaoIndex) {
    const linhas = parseInt(prompt('Número de linhas:', '3')) || 3;
    const colunas = parseInt(prompt('Número de colunas:', '2')) || 2;
    
    const editor = editoresCKEditor[`pergunta-${questaoIndex}`];
    if (editor) {
        editor.execute('insertTable', {
            rows: linhas,
            columns: colunas,
            headingRows: 1
        });
    }
}

function visualizarProvaEditada() {
    coletarDadosQuestoesEditadas();
    
    let modal = document.getElementById('modalVisualizacaoEditada');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'modalVisualizacaoEditada';
        document.body.appendChild(modal);
    }
    
    let htmlVisualizacao = '<div style="max-width: 800px; margin: 0 auto; padding: 20px;">';
    htmlVisualizacao += '<h2 style="color: #4b5563; margin-bottom: 20px;">Pré-visualização da Prova Editada</h2>';
    
    questoesParaEditar.forEach((questao, index) => {
        htmlVisualizacao += `
            <div style="margin-bottom: 30px; padding: 20px; border: 1px solid #e5e7eb; border-radius: 10px; background: white;">
                <h3 style="color: #4b5563; margin-bottom: 15px;">
                    <span style="background: #4f46e5; color: white; padding: 2px 10px; border-radius: 12px; margin-right: 10px;">
                        ${index + 1}
                    </span>
                    ${questao.pergunta ? questao.pergunta.replace(/<[^>]*>/g, '').substring(0, 100) + '...' : 'Pergunta'}
                </h3>
                
                <div style="margin: 15px 0;">
                    <strong>Opções:</strong>
                    <ul style="margin: 10px 0 0 20px;">
                        ${(questao.opcoes || []).slice(0, 3).map((opcao, opcaoIndex) => `
                            <li style="color: ${opcaoIndex === questao.respostaCorreta ? '#10b981' : '#6b7280'};">
                                ${String.fromCharCode(65 + opcaoIndex)}: ${opcao ? opcao.replace(/<[^>]*>/g, '').substring(0, 50) + '...' : ''}
                                ${opcaoIndex === questao.respostaCorreta ? ' ✓' : ''}
                            </li>
                        `).join('')}
                        ${(questao.opcoes || []).length > 3 ? '<li>...</li>' : ''}
                    </ul>
                </div>
                
                ${questao.imagens && questao.imagens.length > 0 ? `
                    <div style="margin: 10px 0; font-size: 0.9rem; color: #8b5cf6;">
                        <i class="fas fa-image"></i> ${questao.imagens.length} imagem(ns)
                    </div>
                ` : ''}
                
                <div style="font-size: 0.9rem; color: #6b7280; margin-top: 10px;">
                    Dificuldade: <span style="font-weight: 600; color: #4b5563;">${questao.dificuldade || 'Médio'}</span>
                </div>
            </div>
        `;
    });
    
    htmlVisualizacao += '</div>';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
            <div class="modal-header">
                <h3 style="margin: 0; color: var(--gray-800); display: flex; align-items: center; gap: 10px;">
                    <i class="fas fa-eye"></i> Visualização da Prova Editada
                </h3>
                <button class="modal-close" onclick="fecharModal('modalVisualizacaoEditada')">&times;</button>
            </div>
            ${htmlVisualizacao}
            <div style="padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                <button onclick="fecharModal('modalVisualizacaoEditada')" 
                        style="padding: 10px 30px; background: #4f46e5; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                    Fechar Visualização
                </button>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
}

function coletarDadosQuestoesEditadas() {
    console.log('💾 Coletando dados das questões editadas...');
    
    questoesParaEditar.forEach((questao, index) => {
        const perguntaElement = document.getElementById(`editor-pergunta-${index}`);
        if (perguntaElement) {
            questao.pergunta = perguntaElement.innerHTML;
        }
        
        const opcoes = questao.opcoes || [];
        for (let opcaoIndex = 0; opcaoIndex < opcoes.length; opcaoIndex++) {
            const opcaoElement = document.getElementById(`editor-opcao-${index}-${opcaoIndex}`);
            if (opcaoElement) {
                questao.opcoes[opcaoIndex] = opcaoElement.innerHTML;
            }
        }
        
        const explicacaoElement = document.getElementById(`editor-explicacao-${index}`);
        if (explicacaoElement) {
            questao.explicacao = explicacaoElement.innerHTML;
        }
        
        const selectDificuldade = document.getElementById(`dificuldade-questao-${index}`);
        if (selectDificuldade) {
            questao.dificuldade = selectDificuldade.value;
        }
        
        const inputTags = document.getElementById(`tags-questao-${index}`);
        if (inputTags) {
            questao.tags = inputTags.value.split(',').map(tag => tag.trim()).filter(tag => tag);
        }
        
        console.log(`✅ Questão ${index + 1} coletada: ${questao.pergunta.substring(0, 50)}...`);
    });
}

async function verificarProvaEditavel(provaId) {
    try {
        const token = localStorage.getItem('auth_token');
        
        const response = await fetch(`/api/provas/${provaId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            return { editavel: false, error: 'Não foi possível verificar a prova' };
        }
        
        const data = await response.json();
        
        if (data.success) {
            return {
                editavel: !data.prova.publicada,
                publicada: data.prova.publicada,
                prova: data.prova
            };
        }
        
        return { editavel: false, publicada: false };
        
    } catch (error) {
        console.error('Erro ao verificar prova:', error);
        return { editavel: false, publicada: false, error: error.message };
    }
}

async function duplicarProvaParaEdicao(provaId) {
    try {
        const token = localStorage.getItem('auth_token');
        
        const response = await fetch(`/api/provas/${provaId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Erro ao carregar prova');
        }
        
        const provaOriginal = data.prova;
        const questoes = data.questoes || [];
        
        const novaProva = {
            turmaId: provaOriginal.turmaId,
            titulo: `${provaOriginal.titulo} (cópia)`,
            conteudo: provaOriginal.conteudo,
            tipoProva: provaOriginal.tipoProva || 'simples',
            quantidadeQuestoes: questoes.length,
            dificuldade: provaOriginal.dificuldade,
            questoesManuais: questoes,
            publicada: false
        };
        
        const createResponse = await fetch(`/api/turmas/${provaOriginal.turmaId}/prova-v2`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(novaProva)
        });
        
        const result = await createResponse.json();
        
        if (result.success) {
            mostrarAlerta('mostrarAlertaGeralMinhasProvas', '✅ Cópia da prova criada com sucesso! Agora você pode editá-la.', 'success');
            
            setTimeout(() => {
                carregarProvasProfessor();
            }, 2000);
            
            return result.provaId;
        }
        
        throw new Error(result.error || 'Erro ao duplicar prova');
        
    } catch (error) {
        console.error('Erro ao duplicar prova:', error);
        mostrarAlerta('mostrarAlertaGeralMinhasProvas', `❌ Erro ao duplicar: ${error.message}`, 'error');
        return null;
    }
}

async function salvarQuestoesEditadasAvancado() {
    try {
        coletarDadosQuestoesEditadas();
        
        for (let i = 0; i < questoesParaEditar.length; i++) {
            const questao = questoesParaEditar[i];
            
            if (!questao.pergunta || questao.pergunta.replace(/<[^>]*>/g, '').trim().length < 5) {
                mostrarAlertaEditor(`❌ A questão ${i + 1} precisa de uma pergunta válida (mínimo 5 caracteres).`, 'error');
                mostrarQuestaoEditor(i);
                return;
            }
            
            if (!questao.opcoes || questao.opcoes.length < 2) {
                mostrarAlertaEditor(`❌ A questão ${i + 1} precisa de pelo menos 2 opções.`, 'error');
                mostrarQuestaoEditor(i);
                return;
            }
            
            for (let j = 0; j < questao.opcoes.length; j++) {
                if (!questao.opcoes[j] || questao.opcoes[j].replace(/<[^>]*>/g, '').trim().length === 0) {
                    mostrarAlertaEditor(`❌ A opção ${String.fromCharCode(65 + j)} da questão ${i + 1} está vazia.`, 'error');
                    mostrarQuestaoEditor(i);
                    return;
                }
            }
            
            if (questao.respostaCorreta < 0 || questao.respostaCorreta >= questao.opcoes.length) {
                mostrarAlertaEditor(`❌ A questão ${i + 1} tem uma resposta correta inválida.`, 'error');
                mostrarQuestaoEditor(i);
                return;
            }
        }
        
        if (!provaGerada || !provaGerada.id) {
            throw new Error('Prova não encontrada para atualização');
        }
        
        mostrarAlertaEditor('💾 Salvando alterações no servidor...', 'info');
        
        const token = localStorage.getItem('auth_token');
        
        console.log('🔄 Enviando edições para:', `/api/provas/${provaGerada.id}/questoes`);
        console.log('📝 Questões:', questoesParaEditar.length);
        
        const response = await fetch(`/api/provas/${provaGerada.id}/questoes`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                questoes: questoesParaEditar
            })
        });
        
        let data;
        try {
            data = await response.json();
        } catch (e) {
            throw new Error(`Resposta inválida do servidor: ${response.status}`);
        }
        
        if (!response.ok) {
            throw new Error(data.error || `Erro ${response.status}: ${response.statusText}`);
        }
        
        if (data.success) {
            console.log('✅ Servidor confirmou atualização:', data);
            
            provaGerada.questoes = [...questoesParaEditar];
            
            mostrarPreviewQuestoes(provaGerada.questoes);
            
            arquivosOriginaisBackup = [...arquivosParaUpload];
            
            mostrarAlertaEditor('✅ Questões atualizadas com sucesso no servidor!', 'success');
            
            setTimeout(() => {
                fecharEditorAvancado();
                mostrarAlerta('mostrarAlertaGeralProva', '✅ Questões editadas com sucesso! A prova foi atualizada.', 'success');
            }, 1500);
            
        } else {
            throw new Error(data.error || 'Erro ao atualizar questões');
        }
        
    } catch (error) {
        console.error('❌ Erro ao salvar questões:', error);
        mostrarAlertaEditor(`❌ Erro ao salvar: ${error.message}`, 'error');
    }
}

function mostrarAlertaEditor(mensagem, tipo = 'info') {
    const mostrarAlertaGerala = document.getElementById('mostrarAlertaGeralEditorAvancado');
    if (mostrarAlertaGerala) {
        mostrarAlertaGerala.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <i class="fas fa-${tipo === 'success' ? 'check-circle' : tipo === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
                <div>${mensagem}</div>
            </div>
        `;
        mostrarAlertaGerala.className = `mostrarAlertaGeral mostrarAlertaGeral-${tipo}`;
        mostrarAlertaGerala.style.display = 'block';
        
        if (tipo !== 'error') {
            setTimeout(() => {
                mostrarAlertaGerala.style.display = 'none';
            }, 3000);
        }
    }
}

function processarConteudoQuestao(conteudo) {
    if (!conteudo) return '';
    
    let processado = conteudo.replace(/\\\(([^)]+)\\\)/g, '<span class="math-inline">\\($1\\)</span>');
    processado = processado.replace(/\\\[([^\]]+)\\\]/g, '<div class="math-display">\\[$1\\]</div>');
    
    return processado;
}

function fecharEditorAvancado() {
    console.log('🚪 Fechando editor avançado...');
    
    const editores = document.querySelectorAll('[contenteditable="true"]');
    editores.forEach(editor => {
        editor.setAttribute('contenteditable', 'false');
    });
    
    document.removeEventListener('focusin', handleFocusIn);
    document.removeEventListener('keydown', handleKeyDown);
    
    const modal = document.getElementById('modalEditorAvancado');
    if (modal) {
        modal.style.transition = 'opacity 0.2s ease-out';
        modal.style.opacity = '0';
        
        setTimeout(() => {
            modal.style.display = 'none';
            modal.style.opacity = '1';
            modal.style.transition = '';
            modal.remove();
        }, 200);
    }
    
    questoesParaEditar = [];
    console.log('✅ Editor avançado fechado');
}

function handleFocusIn(e) {
}

function handleKeyDown(e) {
}

// ============================================
// PULL-TO-REFRESH
// ============================================
let touchStartY = 0;
let touchCurrentY = 0;
let isPulling = false;
const PULL_THRESHOLD = 600;
const TOP_TOLERANCE = 100;

document.addEventListener('touchstart', function(e) {
    if (window.scrollY <= TOP_TOLERANCE) {
        touchStartY = e.touches[0].clientY;
        isPulling = true;
    }
}, { passive: true });

document.addEventListener('touchmove', function(e) {
    if (!isPulling) return;
    
    touchCurrentY = e.touches[0].clientY;
    const pullDistance = touchCurrentY - touchStartY;
    
    if (pullDistance > 0) {
        if (pullDistance > 50) {
            mostrarIndicadorPull(pullDistance);
        }
        
        if (pullDistance > PULL_THRESHOLD) {
            e.preventDefault();
            atualizarPagina();
        }
    }
}, { passive: true });

document.addEventListener('touchend', function(e) {
    if (!isPulling) return;
    
    const pullDistance = touchCurrentY - touchStartY;
    
    if (pullDistance < PULL_THRESHOLD) {
        esconderIndicadorPull();
    }
    
    isPulling = false;
    touchStartY = 0;
    touchCurrentY = 0;
}, { passive: true });

function atualizarPagina() {
    mostrarMensagem('Atualizando página...');
    
    document.body.style.opacity = '0.7';
    document.body.style.transition = 'opacity 0.3s';
    
    setTimeout(() => {
        location.reload();
    }, 500);
}

function mostrarIndicadorPull(distancia) {
    let indicador = document.getElementById('pull-indicator');
    
    if (!indicador) {
        indicador = document.createElement('div');
        indicador.id = 'pull-indicator';
        indicador.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            background: #4f46e5;
            color: white;
            text-align: center;
            padding: 10px;
            font-size: 14px;
            z-index: 9999;
            transform: translateY(-100%);
            transition: transform 0.2s;
        `;
        indicador.innerHTML = '↓ Solte para atualizar';
        document.body.appendChild(indicador);
    }
    
    if (distancia > 50) {
        indicador.style.transform = 'translateY(0)';
    }
}

function esconderIndicadorPull() {
    const indicador = document.getElementById('pull-indicator');
    if (indicador) {
        indicador.style.transform = 'translateY(-100%)';
    }
}

function mostrarMensagem(texto) {
    const msg = document.createElement('div');
    msg.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #10b981;
        color: white;
        padding: 15px 30px;
        border-radius: 10px;
        font-weight: bold;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    `;
    msg.textContent = texto;
    document.body.appendChild(msg);
    
    setTimeout(() => msg.remove(), 1500);
}

// ============================================
// NOTIFICAÇÕES PUSH PARA CELULAR
// ============================================
(function() {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('📱 Push não suportado neste navegador');
        return;
    }

    console.log('📱 Push notifications disponível');

    if (Notification.permission === 'granted') {
        console.log('✅ Notificações já permitidas');
        registrarPushSubscription();
    } else if (Notification.permission === 'default') {
        setTimeout(solicitarPermissaoNotificacao, 3000);
    } else {
        setTimeout(mostrarBotaoAtivarNotificacoes, 5000);
    }
})();

async function solicitarPermissaoNotificacao() {
    try {
        console.log('📱 Solicitando permissão de notificação...');
        const permission = await Notification.requestPermission();
        
        console.log('📋 Resposta:', permission);
        
        if (permission === 'granted') {
            console.log('✅ Permissão concedida!');
            await registrarPushSubscription();
            mostrarNotificacaoBoasVindas();
        } else {
            console.log('❌ Permissão negada');
        }
    } catch (error) {
        console.error('❌ Erro ao solicitar permissão:', error);
    }
}

async function registrarPushSubscription() {
    try {
        const registration = await navigator.serviceWorker.ready;
        
        let subscription = await registration.pushManager.getSubscription();
        
        if (!subscription) {
            console.log('🆕 Criando nova inscrição push...');
            
            const vapidPublicKey = urlBase64ToUint8Array('BFV6eF6W3rqy3VZ4yK3VW9QjJp8nQrqy3VZ4yK3VW9QjJp8nQrqy3VZ4yK3VW9QjJp8nQ');
            
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: vapidPublicKey
            });
            
            console.log('✅ Inscrição criada:', subscription);
            
            await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                },
                body: JSON.stringify(subscription)
            });
            
            console.log('✅ Inscrição enviada ao servidor');
            
        } else {
            console.log('✅ Já inscrito em push');
            
            try {
                await fetch('/api/push/check-subscription', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
                    }
                });
            } catch (e) {
                console.log('⚠️ Erro ao verificar inscrição:', e.message);
            }
        }
    } catch (error) {
        console.error('❌ Erro ao registrar push:', error);
    }
}

function mostrarNotificacaoBoasVindas() {
    if (Notification.permission === 'granted') {
        new Notification('📱 Notificações ativadas!', {
            body: 'Você receberá mostrarAlertaGeralas de provas, resultados e mensagens importantes',
            icon: '/icons/favicon.ico',
            badge: '/icons/favicon.ico',
            vibrate: [200, 100, 200],
            tag: 'boas-vindas-push',
            silent: false,
            requireInteraction: false
        });
    }
}

function mostrarBotaoAtivarNotificacoes() {
    if (document.getElementById('push-banner')) return;
    
    const banner = document.createElement('div');
    banner.id = 'push-banner';
    banner.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        right: 20px;
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: white;
        padding: 20px;
        border-radius: 16px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 10000;
        animation: slideUp 0.3s ease;
        max-width: 400px;
        margin: 0 auto;
    `;
    
    banner.innerHTML = `
        <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
            <div style="
                width: 50px;
                height: 50px;
                background: rgba(255,255,255,0.2);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
            ">
                <i class="fas fa-bell-slash"></i>
            </div>
            <div style="flex: 1;">
                <strong style="font-size: 16px;">🔕 Notificações bloqueadas</strong>
                <p style="margin: 5px 0 0; font-size: 13px; opacity: 0.9;">
                    Você não está recebendo mostrarAlertaGeralas de provas e resultados
                </p>
            </div>
            <button onclick="this.parentElement.parentElement.remove()" style="
                background: none;
                border: none;
                color: white;
                font-size: 20px;
                cursor: pointer;
                opacity: 0.7;
            ">×</button>
        </div>
        
        <div style="background: rgba(255,255,255,0.15); border-radius: 12px; padding: 15px; margin-bottom: 15px;">
            <p style="margin: 0 0 10px; font-size: 14px;">
                <i class="fas fa-lock"></i> 
                <strong>Como ativar no Microsoft Edge:</strong>
            </p>
            <ol style="margin: 0; padding-left: 20px; font-size: 13px;">
                <li>Clique no <strong>cadeado 🔒</strong> ao lado da URL</li>
                <li>Vá em <strong>"Permissões para este site"</strong></li>
                <li>Em <strong>"Notificações"</strong>, escolha <strong>"Permitir"</strong></li>
                <li>Recarregue a página</li>
            </ol>
        </div>
        
        <button onclick="window.location.reload()" style="
            width: 100%;
            padding: 12px;
            background: white;
            color: #667eea;
            border: none;
            border-radius: 30px;
            font-weight: bold;
            font-size: 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        ">
            <i class="fas fa-sync-alt"></i>
            Já permiti - Recarregar
        </button>
    `;
    
    document.body.appendChild(banner);
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideUp {
            from { transform: translateY(100px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
    `;
    document.head.appendChild(style);
}

function urlBase64ToUint8Array(base64String) {
    while (base64String.length % 4 !== 0) {
        base64String += '=';
    }
    base64String = base64String.replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64String);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

window.testarNotificacao = function() {
    if (Notification.permission === 'granted') {
        new Notification('🔔 Teste manual', {
            body: 'Notificação de teste',
            icon: '/icons/favicon.ico'
        });
        console.log('✅ Notificação enviada');
    } else {
        console.log('❌ Sem permissão');
        solicitarPermissaoNotificacao();
    }
};

// ============================================
// SISTEMA DE ESCALONAMENTO PROPORCIONAL - APENAS MOBILE
// ============================================
(function() {
    if (window.innerWidth > 768) {
        console.log('📐 Desktop detectado - escalonamento desativado');
        return;
    }
    
    console.log('📐 Inicializando sistema de escalonamento proporcional (mobile)...');
    
    function calcularEscalaMobile() {
        const width = window.innerWidth;
        const baseWidth = 768;
        let escala = Math.max(0.5, Math.min(1, width / baseWidth));
        
        if (width <= 320) escala = 0.55;
        else if (width <= 360) escala = 0.6;
        else if (width <= 400) escala = 0.65;
        else if (width <= 500) escala = 0.75;
        else if (width <= 600) escala = 0.85;
        else if (width <= 700) escala = 0.95;
        else escala = 1;
        
        return escala;
    }
    
    function aplicarEscalaMobile() {
        if (window.innerWidth > 768) return;
        
        const escala = calcularEscalaMobile();
        
        document.documentElement.style.setProperty('--scale-ratio', escala);
        document.documentElement.style.setProperty('--current-width', window.innerWidth);
        
        console.log(`📐 Mobile: escala ${escala.toFixed(2)} | largura: ${window.innerWidth}px`);
    }
    
    aplicarEscalaMobile();
    
    let timeout;
    window.addEventListener('resize', function() {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            if (window.innerWidth <= 768) {
                aplicarEscalaMobile();
            } else {
                document.documentElement.style.setProperty('--scale-ratio', '1');
                console.log('📐 Modo desktop - escala resetada');
            }
        }, 100);
    });
    
    window.addEventListener('orientationchange', function() {
        setTimeout(() => {
            if (window.innerWidth <= 768) {
                aplicarEscalaMobile();
            }
        }, 200);
    });
    
    console.log('✅ Sistema de escalonamento mobile ativo!');
    
})();

// ============================================
// SERVICE WORKER E CONEXÃO
// ============================================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('✅ Service Worker ativo'))
            .catch(err => console.log('❌ Erro:', err));
    });
}

window.addEventListener('online', () => console.log('🌐 Online'));
window.addEventListener('offline', () => console.log('📴 Offline'));

// ============================================
// CARREGAR FOTO DE PERFIL NA SIDEBAR
// ============================================
async function carregarFotoPerfilSidebar() {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            console.log('❌ Token não encontrado');
            return;
        }
        
        console.log('🔍 Buscando foto de perfil...');
        
        const response = await fetch('/api/perfil/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            console.error('❌ Erro ao buscar perfil:', response.status);
            return;
        }
        
        const data = await response.json();
        
        console.log('📸 Dados do perfil recebidos:', {
            temFoto: !!data.perfil?.fotoPerfil,
            fotoLength: data.perfil?.fotoPerfil?.length || 0
        });
        
        if (data.success && data.perfil) {
            const imgElement = document.getElementById('professorFotoPerfil');
            const iconElement = document.getElementById('professorAvatarIcon');
            
            if (imgElement && iconElement) {
                if (data.perfil.fotoPerfil && data.perfil.fotoPerfil.startsWith('data:image')) {
                    imgElement.src = data.perfil.fotoPerfil;
                    imgElement.style.display = 'block';
                    iconElement.style.display = 'none';
                    console.log('✅ Foto de perfil carregada com sucesso!');
                } else {
                    imgElement.style.display = 'none';
                    iconElement.style.display = 'block';
                    console.log('📸 Nenhuma foto cadastrada, usando ícone padrão');
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar foto:', error);
    }
}

async function atualizarDadosProfessor() {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        
        const response = await fetch('/api/auth/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const usuario = data.user;
            
            document.getElementById('professorNome').textContent = usuario.nome;
            document.getElementById('professorEmail').textContent = usuario.email;
            
            const eixoConfig = {
                'natureza': { texto: '🔬 Eixo Natureza e Matemática', classe: 'eixo-natureza' },
                'humanas': { texto: '🏛️ Eixo Humanas', classe: 'eixo-humanas' },
                'linguagens': { texto: '🎭 Eixo Linguagens', classe: 'eixo-linguagens' },
                'desenvolvimento': { texto: '💻 Desenvolvimento de Sistemas', classe: 'eixo-desenvolvimento' },
                'gestao': { texto: '📊 Gestão e Negócios', classe: 'eixo-gestao' },
                'producao': { texto: '🎬 Produção Cultural e Design', classe: 'eixo-producao' },
                'turismo': { texto: '✈️ Turismo, Hospitalidade e Lazer', classe: 'eixo-turismo' },
                'ambiente': { texto: '🌱 Ambiente e Saúde', classe: 'eixo-ambiente' }
            };
            
            const eixoElement = document.getElementById('professorEixo');
            if (usuario.eixo && eixoConfig[usuario.eixo]) {
                eixoElement.textContent = eixoConfig[usuario.eixo].texto;
                eixoElement.className = `eixo-badge ${eixoConfig[usuario.eixo].classe}`;
            }
        }
        
    } catch (error) {
        console.error('Erro ao atualizar dados:', error);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    atualizarDadosProfessor();
    
    setTimeout(() => {
        carregarFotoPerfilSidebar();
    }, 500);
});

// ============================================
// MOVER BOTÕES PARA O MENU MOBILE
// ============================================
(function() {
    function isMobile() {
        return window.innerWidth < 768;
    }
    
    function moverBotoesParaMenuMobile() {
        const mobile = isMobile();
        
        const btnAdaptar = document.querySelector('button[onclick*="abrirModalUploadAdaptarDocumento"]');
        const btnBaixarApp = document.querySelector('a[href*="drive.google.com"]');
        
        const menuContainer = document.querySelector('.professor-mobile-menu-items');
        
        if (!menuContainer) {
            console.log('⚠️ Menu mobile não encontrado');
            return;
        }
        
        if (mobile) {
            const jaExisteAdaptar = menuContainer.querySelector('.mobile-menu-item[data-original="adaptar"]');
            const jaExisteBaixar = menuContainer.querySelector('.mobile-menu-item[data-original="baixar"]');
            
            if (btnAdaptar && !jaExisteAdaptar) {
                const menuItemAdaptar = document.createElement('a');
                menuItemAdaptar.href = '#';
                menuItemAdaptar.className = 'mobile-menu-item';
                menuItemAdaptar.setAttribute('data-original', 'adaptar');
                menuItemAdaptar.innerHTML = `
                    <i class="fas fa-universal-access"></i>
                    <span>Adaptar Documento</span>
                `;
                menuItemAdaptar.onclick = function(e) {
                    e.preventDefault();
                    if (typeof abrirModalUploadAdaptarDocumento === 'function') {
                        abrirModalUploadAdaptarDocumento();
                    }
                    fecharMenuMobile();
                };
                
                const logoutBtn = menuContainer.querySelector('.mobile-logout-btn, .logout-item');
                if (logoutBtn) {
                    menuContainer.insertBefore(menuItemAdaptar, logoutBtn);
                } else {
                    menuContainer.appendChild(menuItemAdaptar);
                }
                
                btnAdaptar.style.display = 'none';
                console.log('📱 Botão "Adaptar Documento" movido para o menu mobile');
            }
            
            if (btnBaixarApp && !jaExisteBaixar) {
                const menuItemBaixar = document.createElement('a');
                menuItemBaixar.href = btnBaixarApp.href;
                menuItemBaixar.target = '_blank';
                menuItemBaixar.className = 'mobile-menu-item';
                menuItemBaixar.setAttribute('data-original', 'baixar');
                menuItemBaixar.innerHTML = `
                    <i class="fas fa-download"></i>
                    <span>Baixar App</span>
                `;
                menuItemBaixar.onclick = function() {
                    fecharMenuMobile();
                };
                
                const logoutBtn = menuContainer.querySelector('.mobile-logout-btn, .logout-item');
                if (logoutBtn) {
                    menuContainer.insertBefore(menuItemBaixar, logoutBtn);
                } else {
                    menuContainer.appendChild(menuItemBaixar);
                }
                
                btnBaixarApp.style.display = 'none';
                console.log('📱 Botão "Baixar App" movido para o menu mobile');
            }
            
        } else {
            if (btnAdaptar) {
                btnAdaptar.style.display = 'inline-flex';
            }
            
            if (btnBaixarApp) {
                btnBaixarApp.style.display = 'inline-flex';
            }
            
            const menuAdaptar = document.querySelector('.mobile-menu-item[data-original="adaptar"]');
            const menuBaixar = document.querySelector('.mobile-menu-item[data-original="baixar"]');
            
            if (menuAdaptar) menuAdaptar.remove();
            if (menuBaixar) menuBaixar.remove();
            
            console.log('💻 Botões restaurados no cabeçalho (desktop)');
        }
    }
    
    function fecharMenuMobile() {
        const mobileSidebar = document.getElementById('professorMobileSidebar');
        const mobileOverlay = document.getElementById('professorMobileOverlay');
        
        if (mobileSidebar) mobileSidebar.classList.remove('active');
        if (mobileOverlay) mobileOverlay.classList.remove('active');
        if (document.body) document.body.classList.remove('menu-aberto');
    }
    
    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(moverBotoesParaMenuMobile, 500);
    });
    
    window.addEventListener('resize', function() {
        setTimeout(moverBotoesParaMenuMobile, 200);
    });
    
    window.addEventListener('load', function() {
        setTimeout(moverBotoesParaMenuMobile, 100);
    });
    
    window.fecharMenuMobile = fecharMenuMobile;
    
})();

// ============================================
// ORGANIZAÇÃO CRIATIVA DO FORMULÁRIO NO MOBILE
// ============================================
(function() {
    function isMobile() {
        return window.innerWidth < 768;
    }
    
    function organizarFormularioMobile() {
        if (!isMobile()) {
            restaurarFormularioOriginal();
            return;
        }
        
        console.log('📱 Organizando formulário de prova para mobile...');
        
        const formContainer = document.querySelector('#formNovaProva');
        if (!formContainer) return;
        
        if (formContainer.hasAttribute('data-mobile-organized')) return;
        formContainer.setAttribute('data-mobile-organized', 'true');
        
        const camposPrincipais = document.createElement('div');
        camposPrincipais.className = 'mobile-form-sections';
        camposPrincipais.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 12px;
        `;
        
        const secoes = [
            {
                titulo: '📝 Informações Básicas',
                icone: 'fa-info-circle',
                cor: '#4f46e5',
                campos: [
                    { id: 'temaProva', label: 'Tema da Prova', tipo: 'textarea' },
                    { id: 'tituloProva', label: 'Título da Prova', tipo: 'input' },
                    { id: 'periodoProva', label: 'Período Letivo', tipo: 'select' },
                    { id: 'tipoProva', label: 'Tipo de Prova', tipo: 'select' }
                ]
            },
            {
                titulo: '⚙️ Configurações',
                icone: 'fa-sliders-h',
                cor: '#10b981',
                campos: [
                    { id: 'quantidadeQuestoes', label: 'Quantidade de Questões', tipo: 'select' },
                    { id: 'dificuldade', label: 'Dificuldade', tipo: 'select' },
                    { id: 'turmaProva', label: 'Turma', tipo: 'select' }
                ]
            },
            {
                titulo: '📅 Data e Horário',
                icone: 'fa-calendar-alt',
                cor: '#f59e0b',
                campos: [
                    { id: 'dataLimite', label: 'Data Limite', tipo: 'date' },
                    { id: 'horarioInicio', label: 'Horário Início', tipo: 'time' },
                    { id: 'horarioTermino', label: 'Horário Término', tipo: 'time' }
                ]
            },
            {
                titulo: '⏱️ Duração da Prova',
                icone: 'fa-hourglass-half',
                cor: '#8b5cf6',
                campos: [
                    { id: 'duracaoCalculada', label: 'Duração Calculada', tipo: 'custom', isReadonly: true }
                ]
            }
        ];
        
        secoes.forEach((secao, index) => {
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'mobile-form-section';
            sectionDiv.style.cssText = `
                background: white;
                border-radius: 16px;
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                border-left: 4px solid ${secao.cor};
            `;
            
            const header = document.createElement('div');
            header.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 15px;
                background: ${secao.cor}10;
                color: ${secao.cor};
                cursor: pointer;
                font-weight: 600;
                transition: all 0.3s;
            `;
            header.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="fas ${secao.icone}" style="color: ${secao.cor};"></i>
                    <span>${secao.titulo}</span>
                    ${secao.titulo === '⏱️ Duração da Prova' ? 
                        `<span style="background: ${secao.cor}20; color: ${secao.cor}; padding: 2px 8px; border-radius: 20px; font-size: 0.7rem;">Automático</span>` : ''}
                </div>
                <i class="fas fa-chevron-down" style="transition: transform 0.3s; color: ${secao.cor};"></i>
            `;
            
            const body = document.createElement('div');
            body.style.cssText = `
                padding: 0 15px;
                max-height: 0;
                overflow: hidden;
                transition: max-height 0.3s ease-out, padding 0.3s;
                background: white;
            `;
            
            let camposHTML = '';
            secao.campos.forEach(campo => {
                const elemento = document.getElementById(campo.id);
                if (elemento) {
                    if (campo.tipo === 'textarea') {
                        const clone = elemento.cloneNode(true);
                        clone.style.width = '100%';
                        clone.style.minHeight = '80px';
                        clone.style.padding = '10px';
                        clone.style.border = '2px solid #e5e7eb';
                        clone.style.borderRadius = '12px';
                        clone.style.fontSize = '14px';
                        camposHTML += `
                            <div style="margin-bottom: 15px;">
                                <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151; font-size: 0.85rem;">
                                    <i class="fas fa-${campo.id === 'temaProva' ? 'lightbulb' : 'heading'}" style="color: ${secao.cor}; margin-right: 5px;"></i>
                                    ${campo.label}
                                </label>
                                ${clone.outerHTML}
                            </div>
                        `;
                    } 
                    else if (campo.id === 'duracaoCalculada') {
                        const duracaoElement = document.getElementById('duracaoCalculada');
                        if (duracaoElement) {
                            camposHTML += `
                                <div style="margin-bottom: 15px;">
                                    <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151; font-size: 0.85rem;">
                                        <i class="fas fa-hourglass-half" style="color: ${secao.cor}; margin-right: 5px;"></i>
                                        ${campo.label}
                                    </label>
                                    <div id="duracaoCalculadaMobile" style="
                                        background: ${secao.cor}10;
                                        padding: 15px;
                                        border-radius: 12px;
                                        text-align: center;
                                        font-weight: bold;
                                        color: ${secao.cor};
                                        border: 2px solid ${secao.cor}30;
                                        font-size: 1.1rem;
                                    ">
                                        ${duracaoElement.innerHTML}
                                    </div>
                                </div>
                            `;
                            
                            const observer = new MutationObserver(function() {
                                const original = document.getElementById('duracaoCalculada');
                                const mobile = document.getElementById('duracaoCalculadaMobile');
                                if (original && mobile) {
                                    mobile.innerHTML = original.innerHTML;
                                }
                            });
                            observer.observe(duracaoElement, { childList: true, subtree: true, characterData: true });
                        }
                    }
                    else {
                        const clone = elemento.cloneNode(true);
                        clone.style.width = '100%';
                        clone.style.padding = '12px';
                        clone.style.border = '2px solid #e5e7eb';
                        clone.style.borderRadius = '12px';
                        clone.style.fontSize = '14px';
                        camposHTML += `
                            <div style="margin-bottom: 15px;">
                                <label style="display: block; margin-bottom: 8px; font-weight: 600; color: #374151; font-size: 0.85rem;">
                                    <i class="fas ${campo.id === 'dataLimite' ? 'fa-calendar' : campo.id === 'horarioInicio' || campo.id === 'horarioTermino' ? 'fa-clock' : 'fa-list'}" style="color: ${secao.cor}; margin-right: 5px;"></i>
                                    ${campo.label}
                                </label>
                                ${clone.outerHTML}
                            </div>
                        `;
                    }
                }
            });
            
            body.innerHTML = camposHTML;
            
            header.addEventListener('click', () => {
                const isOpen = body.style.maxHeight !== '0px';
                const icon = header.querySelector('.fa-chevron-down');
                
                if (isOpen) {
                    body.style.maxHeight = '0px';
                    body.style.padding = '0 15px';
                    if (icon) icon.style.transform = 'rotate(0deg)';
                } else {
                    body.style.maxHeight = body.scrollHeight + 'px';
                    body.style.padding = '15px';
                    if (icon) icon.style.transform = 'rotate(180deg)';
                    
                    if (secao.titulo === '📅 Data e Horário') {
                        if (typeof calcularDuracao === 'function') {
                            setTimeout(calcularDuracao, 100);
                        }
                    }
                }
            });
            
            sectionDiv.appendChild(header);
            sectionDiv.appendChild(body);
            camposPrincipais.appendChild(sectionDiv);
        });
        
        const botoesDiv = document.createElement('div');
        botoesDiv.style.cssText = `
            margin-top: 20px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;
        
        const btnGerar = document.querySelector('#btnGerarProva');
        if (btnGerar) {
            const btnClone = btnGerar.cloneNode(true);
            btnClone.style.cssText = `
                width: 100%;
                padding: 14px;
                font-size: 16px;
                margin: 0;
                border-radius: 40px;
            `;
            botoesDiv.appendChild(btnClone);
            btnGerar.style.display = 'none';
        }
        
        camposPrincipais.appendChild(botoesDiv);
        
        const formGrid = formContainer.querySelector('.form-grid');
        if (formGrid) {
            formGrid.style.display = 'none';
            formGrid.parentNode.insertBefore(camposPrincipais, formGrid.nextSibling);
        }
        
        const style = document.createElement('style');
        style.textContent = `
            @media (max-width: 768px) {
                .mobile-section-header:active {
                    opacity: 0.9;
                    transform: scale(0.99);
                }
                
                .mobile-form-section {
                    animation: fadeInUp 0.4s ease-out;
                }
                
                @keyframes fadeInUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                .mobile-section-body .form-control,
                .mobile-section-body select,
                .mobile-section-body input,
                .mobile-section-body textarea {
                    width: 100% !important;
                    font-size: 14px;
                    padding: 10px 12px;
                    box-sizing: border-box;
                }
                
                .mobile-help-btn {
                    position: fixed;
                    bottom: 20px;
                    left: 20px;
                    width: 44px;
                    height: 44px;
                    background: #4f46e5;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.4);
                    cursor: pointer;
                    z-index: 1000;
                    border: 2px solid white;
                }
            }
        `;
        document.head.appendChild(style);
        
        if (!document.querySelector('.mobile-help-btn')) {
            const helpBtn = document.createElement('div');
            helpBtn.className = 'mobile-help-btn';
            helpBtn.innerHTML = '<i class="fas fa-question"></i>';
            helpBtn.title = 'Dicas para preencher a prova';
            helpBtn.onclick = () => {
                mostrarAlertaGeral('💡 DICAS:\n\n• Clique em cada seção para expandir\n• Preencha todos os campos necessários\n• A duração é calculada automaticamente\n• Após preencher, clique em "Gerar Prova com IA"');
            };
            document.body.appendChild(helpBtn);
        }
        
        console.log('✅ Formulário organizado para mobile com todas as seções!');
    }
    
    function restaurarFormularioOriginal() {
        const formContainer = document.querySelector('#formNovaProva');
        if (!formContainer) return;
        
        formContainer.removeAttribute('data-mobile-organized');
        
        const formGrid = formContainer.querySelector('.form-grid');
        if (formGrid) {
            formGrid.style.display = '';
        }
        
        const mobileSections = formContainer.querySelector('.mobile-form-sections');
        if (mobileSections) mobileSections.remove();
        
        const btnGerar = document.querySelector('#btnGerarProva');
        if (btnGerar) btnGerar.style.display = '';
        
        const helpBtn = document.querySelector('.mobile-help-btn');
        if (helpBtn) helpBtn.remove();
        
        console.log('💻 Formulário restaurado para desktop');
    }
    
    document.addEventListener('DOMContentLoaded', () => setTimeout(organizarFormularioMobile, 500));
    window.addEventListener('resize', () => setTimeout(organizarFormularioMobile, 200));
    
    const observer = new MutationObserver(() => {
        const novaProvaTab = document.getElementById('nova-prova');
        if (novaProvaTab && novaProvaTab.classList.contains('active')) {
            setTimeout(organizarFormularioMobile, 100);
        }
    });
    const novaProvaTab = document.getElementById('nova-prova');
    if (novaProvaTab) observer.observe(novaProvaTab, { attributes: true });
    
})();

// ============================================
// ORGANIZAÇÃO DOS FILTROS - VERSÃO SIMPLES E FUNCIONAL
// ============================================
(function() {
    let filtrosOrganizados = false;
    
    function isMobile() {
        return window.innerWidth < 768;
    }
    
    function organizarFiltrosMobile() {
        if (!isMobile()) {
            restaurarFiltrosOriginal();
            return;
        }
        
        if (filtrosOrganizados) return;
        
        console.log('📱 Criando filtros mobile...');
        
        let filtrosCard = null;
        
        const possiveisCards = document.querySelectorAll('#minhas-provas > div');
        for (let card of possiveisCards) {
            if (card.querySelector('#filtroStatus') || 
                card.querySelector('#filtroDificuldade') ||
                card.innerHTML.includes('Filtros Inteligentes')) {
                filtrosCard = card;
                break;
            }
        }
        
        if (!filtrosCard) {
            console.log('⚠️ Card não encontrado, criando novo...');
            filtrosCard = document.createElement('div');
            filtrosCard.style.cssText = `
                background: white;
                border-radius: 24px;
                padding: 20px;
                margin: 20px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.05);
            `;
            
            const heroSection = document.querySelector('#minhas-provas .provas-hero');
            if (heroSection) {
                heroSection.insertAdjacentElement('afterend', filtrosCard);
            } else {
                document.querySelector('#minhas-provas').insertBefore(filtrosCard, document.querySelector('#minhas-provas').firstChild);
            }
        }
        
        if (!window.originalFiltrosHTML) {
            window.originalFiltrosHTML = filtrosCard.innerHTML;
        }
        
        const filtroStatus = document.getElementById('filtroStatus');
        const filtroDificuldade = document.getElementById('filtroDificuldade');
        const filtroTipo = document.getElementById('filtroTipo');
        const filtroPeriodo = document.getElementById('filtroPeriodoProvas');
        const filtroTurma = document.getElementById('filtroTurmaProvas');
        const buscaInput = document.getElementById('buscaProva');
        
        filtrosCard.innerHTML = '';
        filtrosCard.style.padding = '16px';
        
        const contador = document.getElementById('resultadosFiltrados');
        const contadorValor = contador ? contador.textContent : '0';
        
        filtrosCard.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #e5e7eb;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-filter" style="color: #4f46e5;"></i>
                    <span style="font-weight: 700;">Filtros</span>
                    <span id="mobileContadorFiltros" style="background: #4f46e5; color: white; padding: 2px 10px; border-radius: 20px; font-size: 12px;">${contadorValor}</span>
                </div>
                <button id="refreshFiltrosBtn" style="background: none; border: none; color: #6b7280; cursor: pointer;">
                    <i class="fas fa-sync-alt"></i>
                </button>
            </div>
            
            <div class="filtro-mobile-item" data-filtro="status" style="margin-bottom: 12px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                <div class="filtro-mobile-header" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8fafc; cursor: pointer;">
                    <div><i class="fas fa-circle" style="color: #3b82f6;"></i> <strong>Status da Prova</strong></div>
                    <i class="fas fa-chevron-down" style="transition: transform 0.3s;"></i>
                </div>
                <div class="filtro-mobile-body" style="padding: 0 12px; max-height: 0; overflow: hidden; transition: max-height 0.3s;">
                    <div id="status-wrapper" style="padding: 12px 0;"></div>
                </div>
            </div>
            
            <div class="filtro-mobile-item" data-filtro="dificuldade" style="margin-bottom: 12px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                <div class="filtro-mobile-header" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8fafc; cursor: pointer;">
                    <div><i class="fas fa-chart-line" style="color: #f59e0b;"></i> <strong>Dificuldade</strong></div>
                    <i class="fas fa-chevron-down" style="transition: transform 0.3s;"></i>
                </div>
                <div class="filtro-mobile-body" style="padding: 0 12px; max-height: 0; overflow: hidden; transition: max-height 0.3s;">
                    <div id="dificuldade-wrapper" style="padding: 12px 0;"></div>
                </div>
            </div>
            
            <div class="filtro-mobile-item" data-filtro="tipo" style="margin-bottom: 12px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                <div class="filtro-mobile-header" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8fafc; cursor: pointer;">
                    <div><i class="fas fa-file-alt" style="color: #10b981;"></i> <strong>Tipo de Prova</strong></div>
                    <i class="fas fa-chevron-down" style="transition: transform 0.3s;"></i>
                </div>
                <div class="filtro-mobile-body" style="padding: 0 12px; max-height: 0; overflow: hidden; transition: max-height 0.3s;">
                    <div id="tipo-wrapper" style="padding: 12px 0;"></div>
                </div>
            </div>
            
            <div class="filtro-mobile-item" data-filtro="periodo" style="margin-bottom: 12px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                <div class="filtro-mobile-header" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8fafc; cursor: pointer;">
                    <div><i class="fas fa-calendar-week" style="color: #8b5cf6;"></i> <strong>Período</strong></div>
                    <i class="fas fa-chevron-down" style="transition: transform 0.3s;"></i>
                </div>
                <div class="filtro-mobile-body" style="padding: 0 12px; max-height: 0; overflow: hidden; transition: max-height 0.3s;">
                    <div id="periodo-wrapper" style="padding: 12px 0;"></div>
                </div>
            </div>
            
            <div class="filtro-mobile-item" data-filtro="turma" style="margin-bottom: 12px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                <div class="filtro-mobile-header" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8fafc; cursor: pointer;">
                    <div><i class="fas fa-school" style="color: #ec4899;"></i> <strong>Turma</strong></div>
                    <i class="fas fa-chevron-down" style="transition: transform 0.3s;"></i>
                </div>
                <div class="filtro-mobile-body" style="padding: 0 12px; max-height: 0; overflow: hidden; transition: max-height 0.3s;">
                    <div id="turma-wrapper" style="padding: 12px 0;"></div>
                </div>
            </div>
            
            <div class="filtro-mobile-item" data-filtro="busca" style="margin-bottom: 12px; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
                <div class="filtro-mobile-header" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #f8fafc; cursor: pointer;">
                    <div><i class="fas fa-search" style="color: #6b7280;"></i> <strong>Busca Rápida</strong></div>
                    <i class="fas fa-chevron-down" style="transition: transform 0.3s;"></i>
                </div>
                <div class="filtro-mobile-body" style="padding: 0 12px; max-height: 0; overflow: hidden; transition: max-height 0.3s;">
                    <div id="busca-wrapper" style="padding: 12px 0;"></div>
                </div>
            </div>
            
            <div style="margin-top: 16px; display: flex; gap: 10px;">
                <button id="limparFiltrosMobileBtn" style="flex: 1; padding: 12px; background: #f3f4f6; border: none; border-radius: 30px; font-weight: 600; cursor: pointer;">
                    <i class="fas fa-eraser"></i> Limpar
                </button>
                <button id="exportarFiltrosMobileBtn" style="flex: 1; padding: 12px; background: linear-gradient(135deg, #10b981, #059669); color: white; border: none; border-radius: 30px; font-weight: 600; cursor: pointer;">
                    <i class="fas fa-download"></i> Exportar
                </button>
            </div>
        `;
        
        if (filtroStatus) document.getElementById('status-wrapper').appendChild(filtroStatus.cloneNode(true));
        if (filtroDificuldade) document.getElementById('dificuldade-wrapper').appendChild(filtroDificuldade.cloneNode(true));
        if (filtroTipo) document.getElementById('tipo-wrapper').appendChild(filtroTipo.cloneNode(true));
        if (filtroPeriodo) document.getElementById('periodo-wrapper').appendChild(filtroPeriodo.cloneNode(true));
        if (filtroTurma) document.getElementById('turma-wrapper').appendChild(filtroTurma.cloneNode(true));
        if (buscaInput) {
            const buscaClone = buscaInput.cloneNode(true);
            buscaClone.style.width = '100%';
            buscaClone.style.padding = '10px';
            buscaClone.style.border = '2px solid #e5e7eb';
            buscaClone.style.borderRadius = '8px';
            document.getElementById('busca-wrapper').appendChild(buscaClone);
        }
        
        document.querySelectorAll('.filtro-mobile-item').forEach(item => {
            const header = item.querySelector('.filtro-mobile-header');
            const body = item.querySelector('.filtro-mobile-body');
            const icon = header.querySelector('.fa-chevron-down');
            
            header.addEventListener('click', () => {
                const isOpen = body.style.maxHeight !== '0px';
                if (isOpen) {
                    body.style.maxHeight = '0px';
                    body.style.padding = '0 12px';
                    if (icon) icon.style.transform = 'rotate(0deg)';
                } else {
                    body.style.maxHeight = body.scrollHeight + 'px';
                    body.style.padding = '12px';
                    if (icon) icon.style.transform = 'rotate(180deg)';
                }
            });
        });
        
        const novosSelects = filtrosCard.querySelectorAll('select');
        novosSelects.forEach(novoSelect => {
            const nomeOriginal = novoSelect.id;
            if (nomeOriginal) {
                const original = document.getElementById(nomeOriginal);
                if (original) {
                    novoSelect.value = original.value;
                    novoSelect.addEventListener('change', function() {
                        original.value = this.value;
                        if (typeof aplicarFiltrosProvas === 'function') {
                            aplicarFiltrosProvas();
                        }
                    });
                }
            }
        });
        
        const novaBusca = filtrosCard.querySelector('#buscaProva');
        if (novaBusca && buscaInput) {
            novaBusca.value = buscaInput.value;
            novaBusca.addEventListener('input', function() {
                buscaInput.value = this.value;
                if (typeof aplicarFiltrosProvas === 'function') {
                    aplicarFiltrosProvas();
                }
            });
        }
        
        document.getElementById('limparFiltrosMobileBtn')?.addEventListener('click', () => {
            if (typeof limparFiltrosProvas === 'function') {
                limparFiltrosProvas();
            }
        });
        
        document.getElementById('exportarFiltrosMobileBtn')?.addEventListener('click', () => {
            if (typeof mostrarOpcoesExportacao === 'function') {
                mostrarOpcoesExportacao();
            }
        });
        
        document.getElementById('refreshFiltrosBtn')?.addEventListener('click', () => {
            if (typeof carregarProvasProfessor === 'function') {
                carregarProvasProfessor();
            }
        });
        
        function atualizarContador() {
            const contadorOriginal = document.getElementById('resultadosFiltrados');
            const mobileContador = document.getElementById('mobileContadorFiltros');
            if (contadorOriginal && mobileContador) {
                mobileContador.textContent = contadorOriginal.textContent;
            }
        }
        
        const observer = new MutationObserver(atualizarContador);
        const contadorElement = document.getElementById('resultadosFiltrados');
        if (contadorElement) {
            observer.observe(contadorElement, { childList: true, subtree: true, characterData: true });
        }
        
        filtrosOrganizados = true;
        console.log('✅ Filtros mobile criados com sucesso!');
    }
    
    function restaurarFiltrosOriginal() {
        if (!isMobile() && window.originalFiltrosHTML) {
            const aba = document.getElementById('minhas-provas');
            if (aba) {
                const card = aba.querySelector('.filtros-card, div[style*="border-radius: 24px"][style*="padding: 20px"]');
                if (card && window.originalFiltrosHTML) {
                    card.innerHTML = window.originalFiltrosHTML;
                    filtrosOrganizados = false;
                    console.log('💻 Filtros restaurados para desktop');
                }
            }
        }
    }
    
    document.addEventListener('DOMContentLoaded', () => setTimeout(organizarFiltrosMobile, 1000));
    window.addEventListener('resize', () => setTimeout(() => {
        if (isMobile()) {
            if (!filtrosOrganizados) organizarFiltrosMobile();
        } else {
            restaurarFiltrosOriginal();
        }
    }, 200));
    
    const observerAba = new MutationObserver(() => {
        const aba = document.getElementById('minhas-provas');
        if (aba && aba.classList.contains('active')) {
            setTimeout(organizarFiltrosMobile, 500);
        }
    });
    const aba = document.getElementById('minhas-provas');
    if (aba) observerAba.observe(aba, { attributes: true });
    
})();

// ============================================================================
// MÓDULO DE ACOMPANHAMENTO DE ALUNOS - VERSÃO FINAL CORRIGIDA
// ============================================================================

window.acompanhamentoInterval = null;
window.acompanhamentoUltimaConsulta = null;
window.acompanhamentoAtendimentosConhecidos = new Set();
window.acompanhamentoPrimeiraExecucao = true;

function iniciarAcompanhamento() {
    console.log('👥 Iniciando módulo de acompanhamento...');
    
    carregarAcompanhamento();
    
    if (window.acompanhamentoInterval) {
        clearInterval(window.acompanhamentoInterval);
    }
    
    window.acompanhamentoInterval = setInterval(() => {
        const abaAtiva = document.getElementById('acompanhamento')?.classList.contains('active');
        if (abaAtiva) {
            carregarAcompanhamento();
        }
        verificarNovosAtendimentos();
    }, 30000);
    
    console.log('✅ Acompanhamento iniciado (polling 30s)');
}

async function carregarAcompanhamento() {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            console.warn('⚠️ Sem token de autenticação');
            return;
        }
        
        const params = new URLSearchParams();
        const turma = document.getElementById('acompanhamentoFiltroTurma')?.value;
        const setor = document.getElementById('acompanhamentoFiltroSetor')?.value;
        const busca = document.getElementById('acompanhamentoFiltroBusca')?.value;
        
        if (turma) params.append('turmaId', turma);
        if (setor && setor !== 'todos') params.append('setor', setor);
        if (busca) params.append('busca', busca);
        
        const response = await fetch(`/api/acompanhamento/ativos?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Erro ao carregar');
        }
        
        window.acompanhamentoUltimaConsulta = data.timestamp;
        renderizarAcompanhamento(data);
        atualizarStatusAcompanhamento('online', `${data.total} aluno(s) em atendimento`);
        
        if (typeof popularFiltroTurmasAcompanhamento === 'function') {
            popularFiltroTurmasAcompanhamento(data.turmas);
        }
        
    } catch (error) {
        console.error('❌ Erro no acompanhamento:', error);
        atualizarStatusAcompanhamento('erro', 'Erro ao carregar');
        
        const lista = document.getElementById('acompanhamentoLista');
        if (lista) {
            lista.innerHTML = `
                <div class="acompanhamento-empty acompanhamento-empty-erro">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>Erro ao carregar. Tentando novamente...</p>
                </div>
            `;
        }
    }
}

function renderizarAcompanhamento(data) {
    const lista = document.getElementById('acompanhamentoLista');
    const totalEl = document.getElementById('acompanhamentoTotal');
    const setorEl = document.getElementById('acompanhamentoPorSetor');
    
    if (totalEl) totalEl.textContent = data.total || 0;
    if (setorEl) setorEl.textContent = Object.keys(data.estatisticas?.porSetor || {}).length;
    
    atualizarBadgeAcompanhamento(data.total || 0);
    
    if (!lista) return;
    
    if (data.total === 0) {
        lista.innerHTML = `
            <div class="acompanhamento-empty">
                <i class="fas fa-check-circle" style="color: #10b981;"></i>
                <h3>Nenhum aluno em atendimento</h3>
                <p>Todos os seus alunos estão em sala de aula.</p>
            </div>
        `;
        return;
    }
    
    const atendimentos = data.atendimentos || [];
    
    const porSetor = {};
    atendimentos.forEach(a => {
        const setor = a.setor || 'outros';
        if (!porSetor[setor]) {
            porSetor[setor] = [];
        }
        porSetor[setor].push(a);
    });
    
    let html = '';
    
    const ordemSetores = ['enfermaria', 'psicologia', 'biblioteca', 'gestao_geral', 'supervisao', 'assistente_social'];
    
    ordemSetores.forEach(setorKey => {
        if (!porSetor[setorKey] || porSetor[setorKey].length === 0) return;
        
        const config = getSetorConfig(setorKey);
        const atendimentosSetor = porSetor[setorKey];
        
        if (Object.keys(porSetor).length > 1) {
            html += `
                <div class="acompanhamento-grupo-header" style="
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 12px 15px;
                    margin: 20px 0 10px;
                    background: ${config.corBg};
                    border-radius: 12px;
                    border-left: 4px solid ${config.cor};
                ">
                    <span style="font-size: 1.3rem;">${config.icone}</span>
                    <strong style="color: ${config.cor};">${config.label}</strong>
                    <span style="
                        background: ${config.cor};
                        color: white;
                        padding: 2px 10px;
                        border-radius: 20px;
                        font-size: 0.75rem;
                        font-weight: 600;
                    ">${atendimentosSetor.length}</span>
                </div>
            `;
        }
        
        atendimentosSetor.forEach(a => {
            const tempoClass = a.tempoMinutos > 60 ? 'acompanhamento-tempo-mostrarAlertaGerala' : '';
            const nomeSeguro = escapeHtmlAcompanhamento(a.alunoNome || 'Aluno');
            const turmaSegura = escapeHtmlAcompanhamento(a.turmaPrincipal || 'Sem turma');
            
            const setorConfig = getSetorConfig(a.setor);
            const setorCor = a.setorCor || setorConfig.cor;
            const setorIcone = a.setorIcone || setorConfig.icone;
            const setorLabel = a.setorLabel || setorConfig.label;
            
            let infoExtra = '';
            if (a.setor === 'biblioteca') {
                const motivo = a.motivoLabel || a.motivo || 'Consulta';
                const atividades = a.atividades && a.atividades.length > 0 
                    ? a.atividades.slice(0, 2).join(', ') 
                    : '';
                
                infoExtra = `
                    <div class="acompanhamento-card-extra" style="
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin-top: 8px;
                        padding: 8px 12px;
                        background: ${setorConfig.corBg};
                        border-radius: 8px;
                        font-size: 0.8rem;
                        color: ${setorCor};
                    ">
                        <i class="fas fa-book-open"></i>
                        <span><strong>Motivo:</strong> ${escapeHtmlAcompanhamento(motivo)}</span>
                        ${atividades ? `
                            <span style="margin-left: auto; opacity: 0.8;">
                                <i class="fas fa-tasks"></i> ${escapeHtmlAcompanhamento(atividades)}
                            </span>
                        ` : ''}
                    </div>
                `;
            }
            
            html += `
                <div class="acompanhamento-card" data-atendimento-id="${a.atendimentoId}" style="
                    border-left: 4px solid ${setorCor};
                ">
                    <div class="acompanhamento-card-avatar" style="background: ${setorCor};">
                        ${(a.alunoNome || 'A').charAt(0).toUpperCase()}
                    </div>
                    
                    <div class="acompanhamento-card-content">
                        <div class="acompanhamento-card-header">
                            <div>
                                <h4 class="acompanhamento-card-nome">${nomeSeguro}</h4>
                                <div class="acompanhamento-card-turma">
                                    <i class="fas fa-users"></i> ${turmaSegura}
                                    ${a.alunoMatricula ? `• ${escapeHtmlAcompanhamento(a.alunoMatricula)}` : ''}
                                </div>
                            </div>
                            
                            <div class="acompanhamento-card-setor" style="
                                background: ${setorCor}20; 
                                color: ${setorCor}; 
                                border: 1px solid ${setorCor}40;
                            ">
                                <span>${setorIcone}</span>
                                <span>${escapeHtmlAcompanhamento(setorLabel)}</span>
                            </div>
                        </div>
                        
                        <div class="acompanhamento-card-info">
                            <div class="acompanhamento-card-tempo ${tempoClass}">
                                <i class="fas fa-clock"></i>
                                <span>Há ${a.tempoFormatado || a.tempoMinutos + ' min'}</span>
                            </div>
                            
                            ${infoExtra}
                        </div>
                    </div>
                </div>
            `;
        });
    });
    
    Object.keys(porSetor).forEach(setorKey => {
        if (ordemSetores.includes(setorKey)) return;
        
        const config = getSetorConfig(setorKey);
        porSetor[setorKey].forEach(a => {
            const nomeSeguro = escapeHtmlAcompanhamento(a.alunoNome || 'Aluno');
            const turmaSegura = escapeHtmlAcompanhamento(a.turmaPrincipal || 'Sem turma');
            
            html += `
                <div class="acompanhamento-card" data-atendimento-id="${a.atendimentoId}">
                    <div class="acompanhamento-card-avatar" style="background: ${config.cor};">
                        ${(a.alunoNome || 'A').charAt(0).toUpperCase()}
                    </div>
                    
                    <div class="acompanhamento-card-content">
                        <div class="acompanhamento-card-header">
                            <div>
                                <h4 class="acompanhamento-card-nome">${nomeSeguro}</h4>
                                <div class="acompanhamento-card-turma">
                                    <i class="fas fa-users"></i> ${turmaSegura}
                                </div>
                            </div>
                            
                            <div class="acompanhamento-card-setor" style="
                                background: ${config.cor}20; 
                                color: ${config.cor}; 
                                border: 1px solid ${config.cor}40;
                            ">
                                <span>${config.icone}</span>
                                <span>${config.label}</span>
                            </div>
                        </div>
                        
                        <div class="acompanhamento-card-info">
                            <div class="acompanhamento-card-tempo">
                                <i class="fas fa-clock"></i>
                                <span>Há ${a.tempoFormatado || a.tempoMinutos + ' min'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
    });
    
    lista.innerHTML = html;
}

async function verificarNovosAtendimentos() {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        
        const params = new URLSearchParams();
        if (window.acompanhamentoUltimaConsulta) {
            params.append('desde', window.acompanhamentoUltimaConsulta);
        }
        
        const response = await fetch(`/api/acompanhamento/notificacoes?${params}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (!data.success) return;
        
        (data.novos || []).forEach(novo => {
            if (window.acompanhamentoAtendimentosConhecidos.has(novo.atendimentoId)) {
                return;
            }
            
            window.acompanhamentoAtendimentosConhecidos.add(novo.atendimentoId);
            
            if (novo.setor === 'biblioteca') {
                novo.setorLabel = 'Biblioteca';
                novo.setorIcone = '📚';
                novo.setorCor = '#0ea5e9';
            }
            
            mostrarNotificacaoAcompanhamento(novo);
            enviarNotificacaoNavegador(novo);
        });
        
    } catch (error) {
        console.debug('Erro ao verificar novos atendimentos:', error.message);
    }
}

function mostrarNotificacaoAcompanhamento(novo) {
    const existente = document.querySelector(`[data-toast-atendimento="${novo.atendimentoId}"]`);
    if (existente) return;
    
    const toast = document.createElement('div');
    toast.className = 'acompanhamento-toast';
    toast.setAttribute('data-toast-atendimento', novo.atendimentoId);
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: white;
        border-radius: 16px;
        padding: 16px 20px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        gap: 15px;
        z-index: 10000;
        max-width: 400px;
        border-left: 4px solid ${novo.setorCor};
        animation: slideInRight 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        cursor: pointer;
    `;
    
    toast.innerHTML = `
        <div style="
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: ${novo.setorCor};
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 22px;
            flex-shrink: 0;
            color: white;
        ">
            ${novo.setorIcone}
        </div>
        <div style="flex: 1; min-width: 0;">
            <div style="font-size: 12px; color: ${novo.setorCor}; font-weight: 600; margin-bottom: 4px;">
                🚨 NOVO ATENDIMENTO • ${escapeHtmlAcompanhamento(novo.setorLabel)}
            </div>
            <div style="font-weight: 600; color: #1f2937; margin-bottom: 4px; font-size: 14px;">
                ${escapeHtmlAcompanhamento(novo.alunoNome)}
            </div>
            <div style="font-size: 12px; color: #6b7280;">
                <i class="fas fa-users"></i> ${escapeHtmlAcompanhamento(novo.turmaPrincipal || 'Sem turma')}
            </div>
        </div>
        <button style="
            background: none;
            border: none;
            font-size: 20px;
            color: #9ca3af;
            cursor: pointer;
            padding: 0 5px;
            flex-shrink: 0;
        " onclick="event.stopPropagation(); this.parentElement.remove();">
            &times;
        </button>
    `;
    
    toast.onclick = () => {
        mostrarTab('acompanhamento');
        toast.remove();
    };
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.animation = 'slideOutRight 0.4s ease';
            setTimeout(() => toast.remove(), 400);
        }
    }, 10000);
    
    if (!document.getElementById('acompanhamentoAnimacoes')) {
        const style = document.createElement('style');
        style.id = 'acompanhamentoAnimacoes';
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOutRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
}

function enviarNotificacaoNavegador(novo) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    
    try {
        const titulo = `${novo.setorIcone} Novo atendimento - ${novo.setorLabel}`;
        const corpo = `${novo.alunoNome} (${novo.turmaPrincipal || 'Sem turma'})`;
        
        const notif = new Notification(titulo, {
            body: corpo,
            icon: '/icons/favicon.ico',
            badge: '/icons/favicon.ico',
            tag: `acompanhamento-${novo.atendimentoId}`,
            requireInteraction: false,
            silent: false,
            vibrate: [200, 100, 200]
        });
        
        notif.onclick = () => {
            window.focus();
            mostrarTab('acompanhamento');
            notif.close();
        };
        
        setTimeout(() => {
            try { notif.close(); } catch(e) {}
        }, 8000);
        
    } catch (e) {
        console.warn('Erro ao enviar notificação do navegador:', e);
    }
}

function atualizarBadgeAcompanhamento(total) {
    const badge = document.getElementById('badgeAcompanhamento');
    if (badge) {
        if (total > 0) {
            badge.textContent = total > 99 ? '99+' : total;
            badge.style.display = 'inline-flex';
        } else {
            badge.style.display = 'none';
        }
    }
    
    const badgeTopo = document.getElementById('badgeAcompanhamentoTopo');
    if (badgeTopo) {
        if (total > 0) {
            badgeTopo.textContent = total > 99 ? '99+' : total;
            badgeTopo.style.display = 'inline-flex';
            badgeTopo.style.animation = 'pulse-notification 2s infinite';
        } else {
            badgeTopo.style.display = 'none';
            badgeTopo.style.animation = 'none';
        }
    }
}

function atualizarStatusAcompanhamento(status, texto) {
    const el = document.getElementById('acompanhamentoStatusTexto');
    const dot = document.querySelector('.acompanhamento-status .status-dot');
    
    if (!el) return;
    el.textContent = texto;
    
    if (dot) {
        if (status === 'online') {
            dot.style.background = '#10b981';
            dot.style.animation = 'pulse-dot 2s infinite';
        } else if (status === 'erro') {
            dot.style.background = '#ef4444';
            dot.style.animation = 'none';
        }
    }
}

function aplicarFiltrosAcompanhamento() {
    carregarAcompanhamento();
}

async function popularFiltroTurmasAcompanhamento(turmasDaAPI) {
    const select = document.getElementById('acompanhamentoFiltroTurma');
    if (!select) {
        console.warn('⚠️ Select #acompanhamentoFiltroTurma não encontrado');
        return;
    }
    
    console.log('📚 Populando filtro de turmas do acompanhamento...');
    
    const valorAtual = select.value;
    
    let listaTurmas = [];
    
    if (turmasDaAPI && Array.isArray(turmasDaAPI) && turmasDaAPI.length > 0) {
        listaTurmas = turmasDaAPI.map(t => {
            if (typeof t === 'string') {
                return { id: t, nome: t };
            }
            return {
                id: t.id || t._id || t.nome,
                nome: t.nome || t
            };
        });
        console.log(`   ✅ ${listaTurmas.length} turmas da API de acompanhamento`);
    }
    
    if (listaTurmas.length === 0) {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/turmas', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && Array.isArray(data.turmas)) {
                    listaTurmas = data.turmas.map(t => ({
                        id: t.id || t._id,
                        nome: t.nome
                    }));
                    console.log(`   ✅ ${listaTurmas.length} turmas da API /api/turmas`);
                }
            }
        } catch (error) {
            console.warn('⚠️ Erro ao buscar turmas:', error.message);
        }
    }
    
    if (listaTurmas.length === 0) {
        console.warn('⚠️ Nenhuma turma disponível para o filtro');
        select.innerHTML = '<option value="">🏫 Todas as turmas</option>';
        return;
    }
    
    listaTurmas.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    
    let html = '<option value="">🏫 Todas as turmas</option>';
    
    listaTurmas.forEach(t => {
        const nome = typeof escapeHtmlAcompanhamento === 'function' 
            ? escapeHtmlAcompanhamento(t.nome || 'Turma sem nome')
            : (t.nome || 'Turma sem nome');
        
        html += `<option value="${t.id}">${nome}</option>`;
    });
    
    select.innerHTML = html;
    
    if (valorAtual) {
        const existe = Array.from(select.options).some(opt => opt.value === valorAtual);
        if (existe) select.value = valorAtual;
    }
    
    console.log(`✅ Filtro populado com ${listaTurmas.length} turmas`);
}

function escapeHtmlAcompanhamento(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

window.iniciarAcompanhamento = iniciarAcompanhamento;
window.carregarAcompanhamento = carregarAcompanhamento;
window.renderizarAcompanhamento = renderizarAcompanhamento;
window.verificarNovosAtendimentos = verificarNovosAtendimentos;
window.mostrarNotificacaoAcompanhamento = mostrarNotificacaoAcompanhamento;
window.enviarNotificacaoNavegador = enviarNotificacaoNavegador;
window.atualizarBadgeAcompanhamento = atualizarBadgeAcompanhamento;
window.atualizarStatusAcompanhamento = atualizarStatusAcompanhamento;
window.aplicarFiltrosAcompanhamento = aplicarFiltrosAcompanhamento;
window.popularFiltroTurmasAcompanhamento = popularFiltroTurmasAcompanhamento;
window.escapeHtmlAcompanhamento = escapeHtmlAcompanhamento;

console.log('✅ Funções de acompanhamento expostas globalmente');

(function gerenciarBotaoAcompanhamento() {
    const isMobile = () => window.innerWidth < 768;
    
    function gerenciar() {
        const btnHeader = document.getElementById('btnAcompanhamentoTopo');
        const menuContainer = document.querySelector('.professor-mobile-menu-items');
        
        if (!btnHeader) {
            console.warn('⚠️ Botão #btnAcompanhamentoTopo não encontrado no header');
            return;
        }
        
        const mobile = isMobile();
        
        if (mobile && menuContainer) {
            const jaExisteNoMenu = menuContainer.querySelector('.mobile-menu-item[data-original="acompanhamento"]');
            
            if (!jaExisteNoMenu) {
                const menuItem = document.createElement('a');
                menuItem.href = '#';
                menuItem.className = 'mobile-menu-item';
                menuItem.setAttribute('data-original', 'acompanhamento');
                menuItem.innerHTML = `
                    <i class="fas fa-user-clock"></i>
                    <span>Acompanhamento</span>
                `;
                menuItem.onclick = function(e) {
                    e.preventDefault();
                    mostrarTab('acompanhamento');
                    if (typeof fecharMenuMobile === 'function') fecharMenuMobile();
                };
                
                const logoutBtn = menuContainer.querySelector('.mobile-logout-btn, .logout-item');
                if (logoutBtn) {
                    menuContainer.insertBefore(menuItem, logoutBtn);
                } else {
                    menuContainer.appendChild(menuItem);
                }
                
                console.log('📱 Botão Acompanhamento adicionado ao menu mobile');
            }
            
            btnHeader.style.display = 'none';
            
        } else {
            btnHeader.style.display = 'inline-flex';
            
            const itemNoMenu = menuContainer?.querySelector('.mobile-menu-item[data-original="acompanhamento"]');
            if (itemNoMenu) {
                itemNoMenu.remove();
            }
        }
    }
    
    const tentar = () => {
        if (document.querySelector('.professor-mobile-menu-items') || document.getElementById('btnAcompanhamentoTopo')) {
            gerenciar();
        } else {
            setTimeout(tentar, 300);
        }
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tentar);
    } else {
        tentar();
    }
    
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(gerenciar, 200);
    });
    
    window.gerenciarBotaoAcompanhamento = gerenciar;
})();

(function inicializarAcompanhamentoSeguro() {
    const iniciar = () => {
        console.log('🚀 Inicializando acompanhamento...');
        setTimeout(() => {
            iniciarAcompanhamento();
        }, 1000);
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();

(function wrapperMostrarTab() {
    const tentarWrapper = () => {
        if (typeof window.mostrarTab === 'function' && !window.mostrarTab._wrapped) {
            const originalMostrarTab = window.mostrarTab;
            
            window.mostrarTab = function(tabId) {
                originalMostrarTab.apply(this, arguments);
                
                if (tabId === 'acompanhamento') {
                    console.log('📊 Aba acompanhamento ativada - carregando dados...');
                    setTimeout(async () => {
                        if (typeof popularFiltroTurmasAcompanhamento === 'function') {
                            await popularFiltroTurmasAcompanhamento();
                        }
                        
                        if (typeof carregarAcompanhamento === 'function') {
                            carregarAcompanhamento();
                        }
                        
                        if (!window.acompanhamentoInterval && typeof iniciarAcompanhamento === 'function') {
                            iniciarAcompanhamento();
                        }
                    }, 100);
                }
            };
            
            window.mostrarTab._wrapped = true;
            console.log('✅ mostrarTab envolvida para carregar acompanhamento automaticamente');
            
        } else if (!window.mostrarTab) {
            setTimeout(tentarWrapper, 200);
        }
    };
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tentarWrapper);
    } else {
        tentarWrapper();
    }
})();

window.addEventListener('beforeunload', function() {
    if (window.acompanhamentoInterval) {
        clearInterval(window.acompanhamentoInterval);
        console.log('🛑 Polling de acompanhamento interrompido');
    }
});

const SETORES_CONFIG = {
    'enfermaria': { label: 'Enfermaria', icone: '🏥', cor: '#10b981', corBg: '#d1fae5' },
    'psicologia': { label: 'Psicologia', icone: '🧠', cor: '#14b8a6', corBg: '#ccfbf1' },
    'assistente_social': { label: 'Assistente Social', icone: '🤝', cor: '#7c3aed', corBg: '#ede9fe' },
    'supervisao': { label: 'Supervisão', icone: '🛡️', cor: '#1e3a8a', corBg: '#dbeafe' },
    'biblioteca': { label: 'Biblioteca', icone: '📚', cor: '#0ea5e9', corBg: '#e0f2fe' }
};

function getSetorConfig(setor) {
    return SETORES_CONFIG[setor] || {
        label: setor || 'Setor',
        icone: '📍',
        cor: '#6b7280',
        corBg: '#f3f4f6'
    };
}

// ============================================
// INICIALIZAÇÃO PRINCIPAL
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(inicializarFiltrosCompletos, 500);
    console.log('🚀 Dashboard do Professor - Carregando...');
    
    const dataLimiteInput = document.getElementById('dataLimite');
    if (dataLimiteInput) {
        const hoje = new Date();
        const offset = hoje.getTimezoneOffset() * 60000;
        const localDate = new Date(hoje.getTime() - offset);
        const hojeFormatado = localDate.toISOString().split('T')[0];
        
        console.log('📅 Data configurada:');
        console.log('   Hoje (UTC):', hoje.toISOString());
        console.log('   Hoje (local):', localDate.toISOString());
        console.log('   Formato input:', hojeFormatado);
        
        dataLimiteInput.min = hojeFormatado;
        dataLimiteInput.value = hojeFormatado;
        
        dataLimiteInput.addEventListener('change', function() {
            console.log('📅 Data limite alterada:', this.value);
            const dataSelecionada = new Date(this.value);
            console.log('   Como Date:', dataSelecionada);
            console.log('   ISO String:', dataSelecionada.toISOString());
            console.log('   Local BR:', dataSelecionada.toLocaleString('pt-BR'));
            console.log('   UTC:', dataSelecionada.toUTCString());
            
            const ano = dataSelecionada.getFullYear();
            const mes = String(dataSelecionada.getMonth() + 1).padStart(2, '0');
            const dia = String(dataSelecionada.getDate()).padStart(2, '0');
            const dataFormatada = `${ano}-${mes}-${dia}`;
            console.log('   Formatada para envio:', dataFormatada);
        });
    }

    const filtroPeriodoResultados = document.getElementById('filtroPeriodoResultados');
    if (filtroPeriodoResultados) {
        filtroPeriodoResultados.addEventListener('change', filtrarResultados);
    }

    const inicioInput = document.getElementById('horarioInicio');
    const terminoInput = document.getElementById('horarioTermino');
    
    if (inicioInput && terminoInput) {
        inicioInput.addEventListener('change', calcularDuracao);
        terminoInput.addEventListener('change', calcularDuracao);
        
        setTimeout(calcularDuracao, 500);
    }
    
    setTimeout(() => {
        const secaoAnexos = document.getElementById('secaoAnexos');
        if (secaoAnexos) {
            console.log('🔧 Corrigindo todos os botões na seção de anexos...');
            
            secaoAnexos.querySelectorAll('.anexo-tab').forEach(tab => {
                tab.type = 'button';
                const onclick = tab.getAttribute('onclick');
                if (onclick) {
                    tab.onclick = null;
                    tab.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        const match = onclick.match(/mostrarTabAnexo\('([^']+)'\)/);
                        if (match && typeof mostrarTabAnexo === 'function') {
                            mostrarTabAnexo(match[1]);
                        }
                    });
                }
            });
            
            secaoAnexos.querySelectorAll('button').forEach(btn => {
                if (!btn.closest('.anexo-tab')) {
                    btn.type = 'button';
                    
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        
                        if (btn.closest('form')) {
                            e.preventDefault();
                        }
                    });
                }
            });
            
            const btnLimpar = secaoAnexos.querySelector('button[onclick*="limparTodosAnexos"]');
            if (btnLimpar) {
                btnLimpar.type = 'button';
                const limparOnclick = btnLimpar.getAttribute('onclick');
                if (limparOnclick) {
                    btnLimpar.onclick = null;
                    btnLimpar.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        if (typeof limparTodosAnexos === 'function') {
                            limparTodosAnexos();
                        }
                    });
                }
            }
            
            const btnAdicionarTexto = secaoAnexos.querySelector('button[onclick*="adicionarTexto"]');
            if (btnAdicionarTexto) {
                btnAdicionarTexto.type = 'button';
                btnAdicionarTexto.addEventListener('click', function(e) {
                    e.stopPropagation();
                    e.preventDefault();
                });
            }
            
            const btnAdicionarLink = secaoAnexos.querySelector('button[onclick*="adicionarLink"]');
            if (btnAdicionarLink) {
                btnAdicionarLink.type = 'button';
                btnAdicionarLink.addEventListener('click', function(e) {
                    e.stopPropagation();
                    e.preventDefault();
                });
            }
        }
    }, 200);
            
    const formNovaProva = document.getElementById('formNovaProva');
    if (formNovaProva) {
        formNovaProva.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const tema = document.getElementById('temaProva').value.trim();
            const titulo = document.getElementById('tituloProva').value.trim();
            const turmaId = document.getElementById('turmaProva').value;
            const periodoProva = document.getElementById('periodoProva').value;
            
            if (!tema) {
                mostrarAlerta('mostrarAlertaGeralProva', '⚠️ Digite o tema da prova', 'info');
                document.getElementById('temaProva').focus();
                return;
            }
            
            if (!titulo) {
                mostrarAlerta('mostrarAlertaGeralProva', '⚠️ Digite o título da prova', 'info');
                document.getElementById('tituloProva').focus();
                return;
            }
            
            if (!turmaId) {
                mostrarAlerta('mostrarAlertaGeralProva', '⚠️ Selecione uma turma', 'info');
                document.getElementById('turmaProva').focus();
                return;
            }
            
            if (!periodoProva) {
                mostrarAlerta('mostrarAlertaGeralProva', '⚠️ Selecione o período letivo', 'info');
                document.getElementById('periodoProva').focus();
                return;
            }
            
            const turmaSelecionada = turmasProfessor.find(t => t.id === turmaId);
            if (!turmaSelecionada) {
                mostrarAlerta('mostrarAlertaGeralProva', '⚠️ Turma selecionada não encontrada', 'error');
                return;
            }
            
            if (turmaSelecionada.totalAlunos === 0) {
                mostrarAlerta('mostrarAlertaGeralProva', '⚠️ Esta turma não tem alunos. Adicione alunos primeiro.', 'warning');
                return;
            }
            
            let dataLimiteEnviar = null;
            const dataLimiteInput = document.getElementById('dataLimite').value;
            
            if (dataLimiteInput) {
                const partes = dataLimiteInput.split('-');
                const ano = parseInt(partes[0]);
                const mes = parseInt(partes[1]) - 1;
                const dia = parseInt(partes[2]);
                
                const dataLimiteFimDia = new Date(ano, mes, dia, 23, 59, 59, 999);
                dataLimiteEnviar = dataLimiteFimDia.toISOString();
            }
            
            const btn = document.getElementById('btnGerarProva');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando prova com IA...';
            btn.disabled = true;
            
            const token = localStorage.getItem('auth_token');
            if (!token) {
                mostrarAlerta('mostrarAlertaGeralProva', '❌ Sessão expirada. Faça login novamente.', 'error');
                window.location.href = 'login.html';
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
            }
            
            const tipoProva = document.getElementById('tipoProva').value;
            
            const dadosProva = {
                turmaId: turmaId,
                titulo: titulo,
                conteudo: tema,
                tipoProva: tipoProva,
                periodo: periodoProva,
                quantidadeQuestoes: parseInt(document.getElementById('quantidadeQuestoes').value),
                dificuldade: document.getElementById('dificuldade').value,
                dataLimite: dataLimiteEnviar,
                horarioInicio: document.getElementById('horarioInicio').value,
                horarioTermino: document.getElementById('horarioTermino').value,
                anexos: tipoProva === 'enem' ? anexos : []
            };

            if (tipoProva === 'adaptada') {
                dadosProva.adaptada = true;
                dadosProva.alternativas = 3;
                dadosProva.formato = 'acessibilidade';
                dadosProva.recursosAcessibilidade = [
                    'fonte_ampliada',
                    'alto_contraste',
                    'leitor_tela',
                    'tempo_adicional'
                ];
                
                dadosProva.publicoAlvo = 'alunos_acessibilidade';
                
                console.log('🎯 Prova ADAPTADA configurada com 3 alternativas');
            }
            
            console.log('📤 Preparando envio da prova:', dadosProva);
            
            try {
                let response;
                
                if (tipoProva === 'enem') {
                    arquivosOriginaisBackup = [...arquivosParaUpload];
                    console.log('📁 Backup de arquivos criado para regeneração:', arquivosOriginaisBackup.length);
                    
                    const todosAnexos = await processarAnexosParaEnvio();
                    
                    const formDataObj = new FormData();
                    
                    formDataObj.append('titulo', dadosProva.titulo);
                    formDataObj.append('conteudo', dadosProva.conteudo);
                    formDataObj.append('tipoProva', dadosProva.tipoProva);
                    formDataObj.append('quantidadeQuestoes', dadosProva.quantidadeQuestoes);
                    formDataObj.append('dificuldade', dadosProva.dificuldade);
                    formDataObj.append('dataLimite', dadosProva.dataLimite || '');
                    formDataObj.append('horarioInicio', dadosProva.horarioInicio);
                    formDataObj.append('horarioTermino', dadosProva.horarioTermino);
                    
                    if (todosAnexos.length > 0) {
                        formDataObj.append('anexosData', JSON.stringify(todosAnexos));
                        console.log(`📎 Anexos incluídos no FormData: ${todosAnexos.length}`);
                    } else {
                        console.log('ℹ️ Nenhum anexo para enviar');
                        formDataObj.append('anexosData', '[]');
                    }
                    
                    console.log('📋 Conteúdo do FormData:');
                    for (let pair of formDataObj.entries()) {
                        if (pair[0] === 'anexosData') {
                            console.log(`${pair[0]}: JSON com ${JSON.parse(pair[1]).length} anexos`);
                        } else {
                            console.log(`${pair[0]}: ${pair[1]}`);
                        }
                    }
                    
                    response = await fetch(`/api/turmas/${turmaId}/prova-v2`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        },
                        body: formDataObj
                    });
                
                } else {
                    response = await fetch(`/api/turmas/${turmaId}/prova-v2`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(dadosProva)
                    });
                }
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('❌ Erro na resposta:', errorText);
                    throw new Error(`Erro HTTP ${response.status}: ${errorText}`);
                }
                
                const data = await response.json();
                console.log('✅ Resposta do servidor:', data);
                
                if (data.success) {
                    mostrarAlerta('mostrarAlertaGeralProva', data.mensagem || '✅ Prova criada com sucesso!', 'success');
                    
                    provaGerada = {
                        ...data.prova,
                        questoes: data.questoes || []
                    };
                    
                    if (data.questoes && data.questoes.length > 0) {
                        mostrarPreviewQuestoes(data.questoes);
                    } else if (provaGerada.questoes && provaGerada.questoes.length > 0) {
                        mostrarPreviewQuestoes(provaGerada.questoes);
                    }
                    
                    anexos = [];
                    atualizarListaAnexos();
                    
                } else {
                    throw new Error(data.error || 'Erro ao criar prova');
                }
                
            } catch (error) {
                console.error('❌ Erro ao gerar prova:', error);
                mostrarAlerta('mostrarAlertaGeralProva', `❌ Erro: ${error.message}`, 'error');
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        });
    }
    
    const formNovaTurma = document.getElementById('formNovaTurma');
    if (formNovaTurma) {
        formNovaTurma.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const nome = document.getElementById('nomeTurma').value.trim();
            const disciplina = document.getElementById('disciplinaTurma').value.trim();
            const eixo = document.getElementById('eixoTurma').value;
            const descricao = document.getElementById('descricaoTurma').value.trim();
            
            if (!nome) {
                mostrarAlerta('mostrarAlertaGeralTurma', '⚠️ Digite o nome da turma', 'info');
                document.getElementById('nomeTurma').focus();
                return;
            }
            
            if (!disciplina) {
                mostrarAlerta('mostrarAlertaGeralTurma', '⚠️ Digite a disciplina', 'info');
                document.getElementById('disciplinaTurma').focus();
                return;
            }
            
            const btn = document.getElementById('btnCriarTurma');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando turma...';
            btn.disabled = true;
            
            const dadosTurma = {
                nome: nome,
                disciplina: disciplina,
                eixo: eixo,
                descricao: descricao || undefined
            };
            
            const resultado = await criarNovaTurma(dadosTurma);
            
            btn.innerHTML = originalText;
            btn.disabled = false;
            
            if (resultado.success) {
                mostrarAlerta('mostrarAlertaGeralTurma', resultado.mensagem, 'success');
                formNovaTurma.reset();
                
                await carregarTurmasProfessor();
                
                setTimeout(() => {
                    document.querySelector('[onclick="mostrarTab(\'turmas\')"]').click();
                }, 1500);
            } else {
                mostrarAlerta('mostrarAlertaGeralTurma', resultado.error, 'error');
            }
        });
    }
    
    const temaInput = document.getElementById('temaProva');
    const tituloInput = document.getElementById('tituloProva');
    
    if (temaInput && tituloInput) {
        temaInput.addEventListener('input', function() {
            if (this.value.trim().length > 0 && (!tituloInput.value || tituloInput.value.startsWith('Prova: '))) {
                const tema = this.value.trim();
                if (tema.length > 50) {
                    tituloInput.value = `Prova: ${tema.substring(0, 50)}...`;
                } else {
                    tituloInput.value = `Prova: ${tema}`;
                }
            }
        });
    }
    
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', logout);
    }
    
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.getAttribute('onclick').match(/'([^']+)'/)[1];
            mostrarTab(tabId);
        });
    });
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                this.style.display = 'none';
            }
        });
    });
    
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', function() {
            this.closest('.modal').style.display = 'none';
        });
    });
    
    carregarDadosProfessor();

    setTimeout(() => {
        carregarEixosParaSelect();
    }, 1000);
    
    setTimeout(esconderLoading, 5000);
    
    const tabResultadosGerais = document.querySelector('[onclick="mostrarTab(\'resultados-gerais\')"]');
    if (tabResultadosGerais) {
        tabResultadosGerais.addEventListener('click', function() {
            setTimeout(() => {
                carregarResultadosGerais();
            }, 100);
        });
    }
});

setInterval(async () => {
    const token = localStorage.getItem('auth_token');
    if (token) {
        try {
            await fetch('/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (error) {
            console.log('Sessão expirada');
        }
    }
}, 5 * 60 * 1000);

window.mostrarTab = mostrarTab;
window.publicarProva = publicarProva;
window.regenerarProva = regenerarProva;
window.solicitarExclusaoTurma = solicitarExclusaoTurma;
window.confirmarExclusaoTurma = confirmarExclusaoTurma;
window.fecharModal = fecharModal;

// ============================================
// VERIFICAR STATUS DO PUSH
// ============================================
document.addEventListener('DOMContentLoaded', async function() {
    const indicator = document.getElementById('pushIndicatorContainer');
    if (!indicator) return;
    
    async function verificarPush() {
        try {
            const response = await fetch('/api/push/status');
            const data = await response.json();
            
            if (data.success && !data.pushAtivado) {
                indicator.style.display = 'block';
                console.log('🔕 Push desativado - mostrando indicador');
            } else {
                indicator.style.display = 'none';
                console.log('🔔 Push ativado - indicador oculto');
            }
        } catch (error) {
            console.error('❌ Erro ao verificar push:', error);
        }
    }
    
    await verificarPush();
    setInterval(verificarPush, 30000);
});

// ============================================
// MENU MOBILE
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    const menuToggle = document.getElementById('professorMobileMenuToggle');
    const mobileSidebar = document.getElementById('professorMobileSidebar');
    const mobileOverlay = document.getElementById('professorMobileOverlay');
    const mobileClose = document.getElementById('professorMobileClose');
    
    if (menuToggle && mobileSidebar && mobileOverlay) {
        menuToggle.addEventListener('click', function() {
            mobileSidebar.classList.add('active');
            mobileOverlay.classList.add('active');
            document.body.classList.add('menu-aberto');
        });
        
        mobileOverlay.addEventListener('click', function() {
            mobileSidebar.classList.remove('active');
            mobileOverlay.classList.remove('active');
            document.body.classList.remove('menu-aberto');
        });
        
        if (mobileClose) {
            mobileClose.addEventListener('click', function() {
                mobileSidebar.classList.remove('active');
                mobileOverlay.classList.remove('active');
                document.body.classList.remove('menu-aberto');
            });
        }
    }
    
    function atualizarMenuMobile() {
        const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
        const mobileNome = document.getElementById('mobileProfessorNome');
        const mobileEmail = document.getElementById('mobileProfessorEmail');
        
        if (mobileNome) mobileNome.textContent = userData.nome || 'Professor';
        if (mobileEmail) mobileEmail.textContent = userData.email || 'carregando...';
    }
    
    atualizarMenuMobile();
    
    window.addEventListener('storage', function(e) {
        if (e.key === 'user_data') {
            atualizarMenuMobile();
        }
    });
});

function mostrarTabMobile(tabId) {
    const mobileSidebar = document.getElementById('professorMobileSidebar');
    const mobileOverlay = document.getElementById('professorMobileOverlay');
    
    if (mobileSidebar && mobileOverlay) {
        mobileSidebar.classList.remove('active');
        mobileOverlay.classList.remove('active');
        document.body.classList.remove('menu-aberto');
    }
    
    if (typeof mostrarTab === 'function') {
        mostrarTab(tabId);
    }
}