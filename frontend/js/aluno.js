/* ============================================================================
   ALUNO.JS — Todo o JavaScript que estava inline no aluno.html
   ============================================================================
   Este arquivo contém:
   1. Proteção contra alert()/confirm() nativos
   2. OneSignal (Push Notifications)
   3. Service Worker
   4. Sistema de Notificações do Aluno (desktop)
   5. Sistema de Notificações Mobile (bottom sheet)
   6. Menu Mobile (FAB)
   7. Configuração da API + Variáveis Globais
   8. Carregamento de Dados do Aluno
   9. Provas Pendentes / Concluídas / Aguardando / Canceladas
   10. Filtros por Eixo, Período e Status
   11. Turmas do Aluno
   12. Iniciar Prova (com verificação de Face ID)
   13. Verificação periódica de provas expiradas
   14. Notificações Push (browser)
   15. Escalonamento proporcional mobile
   16. Pull-to-refresh
   17. Verificação de status do push (indicador)
   18. Foto de perfil do aluno
   19. Inicialização geral

   ⚠️ NENHUMA FUNCIONALIDADE FOI ALTERADA — apenas movida para cá.
   ============================================================================ */

// ============================================
// 🛡️ PROTEÇÃO CONTRA alert() E confirm() NATIVOS
// ============================================
(function protegerContraAlertEConfirmNativos() {
    let __mostrarMensagemAlunoaEmProgresso = false;
    
    window.mostrarMensagemAluno = function(mensagem) {
        if (__mostrarMensagemAlunoaEmProgresso) {
            console.log('[ALERT-RECURSÃO-EVITADA]', mensagem);
            return;
        }
        __mostrarMensagemAlunoaEmProgresso = true;
        
        try {
            const isWebView = /wv|WebView|Android.*Version\/[\d.]+.*Chrome/i.test(navigator.userAgent) ||
                            (typeof window.AppInventor !== 'undefined');
            
            if (!isWebView) {
                console.log('%c[ALERT] ' + mensagem, 'background:#f59e0b;color:white;padding:4px 8px;border-radius:4px;');
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
                            style="width:100%;padding:12px;background:#0d6efd;color:white;
                                border:none;border-radius:10px;font-size:14px;
                                font-weight:600;cursor:pointer;">OK</button>
                </div>
            `;
            document.body.appendChild(modal);
        } finally {
            __mostrarMensagemAlunoaEmProgresso = false;
        }
    };
    
    const confirmOriginal = window.confirm;
    const jaSobrescrito = !confirmOriginal.toString().includes('[native code]');
    
    if (!jaSobrescrito) {
        window.confirm = function(mensagem) {
            console.warn('⚠️ confirm() nativo chamado — usando fallback assíncrono');
            return true;
        };
    }
    
    console.log('🛡️ [Proteção] mostrarMensagemAluno() e confirm() blindados');
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
// SISTEMA DE NOTIFICAÇÕES DO ALUNO (DESKTOP)
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
            <div class="notificacao-item ${classeLida}" style="
                padding: 12px 15px;
                border-bottom: 1px solid #e5e7eb;
                cursor: pointer;
                transition: all 0.3s;
                display: flex;
                gap: 12px;
                background: ${notif.lida ? 'white' : '#eff6ff'};
                ${!notif.lida ? 'border-left: 3px solid #3b82f6;' : ''}
            " onclick="abrirNotificacao('${notif._id}', '${notif.link || '#'}')">
                <div class="notificacao-icone" style="
                    width: 36px;
                    height: 36px;
                    border-radius: 8px;
                    background: ${notif.cor || '#0d6efd'};
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 1rem;
                    flex-shrink: 0;
                ">
                    ${notif.icone || '📋'}
                </div>
                <div class="notificacao-conteudo" style="flex: 1;">
                    <div class="notificacao-titulo" style="
                        font-weight: 600;
                        margin-bottom: 3px;
                        font-size: 0.9rem;
                        color: #1f2937;
                    ">${notif.titulo}</div>
                    <div class="notificacao-mensagem" style="
                        font-size: 0.8rem;
                        color: #6b7280;
                        margin-bottom: 4px;
                        line-height: 1.4;
                    ">${notif.mensagem}</div>
                    <div class="notificacao-tempo" style="
                        font-size: 0.65rem;
                        color: #9ca3af;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    ">
                        <i class="far fa-clock"></i> ${tempoTexto}
                    </div>
                </div>
            </div>
        `;
    });
    
    lista.innerHTML = html;
}

function abrirNotificacoes() {
    const dropdown = document.getElementById('notificacoesDropdown');
    if (!dropdown) return;
    
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

async function limparMinhasNotificacoes(event) {
    try {
        const token = localStorage.getItem('auth_token');
        
        const confirmacao = await confirm('🗑️ Deseja excluir TODAS as suas notificações?\n\nEsta ação não pode ser desfeita.');
        
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
            
            document.getElementById('notificacoesBadge').style.display = 'none';
            document.getElementById('notificacoesBtn').classList.remove('tem-notificacao');
            
            mostrarMensagemAluno(`✅ ${data.message || 'Notificações excluídas com sucesso!'}`, 'info');
            
        } else {
            throw new Error(data.error || 'Erro ao excluir notificações');
        }
        
    } catch (error) {
        console.error('❌ Erro:', error);
        mostrarMensagemAluno('❌ ' + error.message, 'info');
    } finally {
        const btn = document.querySelector('.notificacao-footer button');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-trash"></i> Limpar todas';
            btn.disabled = false;
        }
    }
}

function fecharNotificacoes() {
    const dropdown = document.getElementById('notificacoesDropdown');
    if (dropdown) {
        dropdown.classList.remove('show');
    }
}

function verTodasNotificacoes(event) {
    event.preventDefault();
    window.location.href = 'notificacoes.html';
}

window.addEventListener('beforeunload', function() {
    if (notificacoesInterval) {
        clearInterval(notificacoesInterval);
    }
});

// Adicionar estilos CSS
const style = document.createElement('style');
style.textContent = `
.notificacoes-container {
    position: relative;
    display: inline-block;
}

.notificacoes-btn:hover {
    background: rgba(255,255,255,0.25) !important;
    transform: scale(1.05);
}

.notificacoes-btn.tem-notificacao {
    animation: pulse-notification 2s infinite;
}

@keyframes pulse-notification {
    0% { box-shadow: 0 0 0 0 rgba(255,255,255,0.7); }
    70% { box-shadow: 0 0 0 10px rgba(255,255,255,0); }
    100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
}

.notificacoes-dropdown.show {
    display: block !important;
    animation: slideDown 0.3s ease;
}

@keyframes slideDown {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

.notificacao-item:hover {
    background: #f1f5f9 !important;
    transform: translateX(5px);
}

.notificacao-footer button:hover {
    color: #b91c1c !important;
    text-decoration: underline;
}

.notificacao-footer button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* Responsividade do botão calendário */
@media (max-width: 768px) {
    .btn-calendario span {
        display: none;
    }
    
    .btn-calendario {
        padding: 8px 12px !important;
    }
    
    .btn-calendario i {
        margin: 0 !important;
    }
}
`;
document.head.appendChild(style);

// Exemplo: Mostrar mensagem especial quando o aluno carregar a página
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        if (window.chatbot) {
            window.chatbot.sendSystemMessage("💡 Dica: Você pode usar o assistente para tirar dúvidas sobre suas provas!");
        }
    }, 3000);
});

// ========== FUNÇÕES DO MENU MOBILE ==========
(function() {
    function initMenuMobile() {
        const fabBtn = document.getElementById('fabMenuBtn');
        const bottomSheet = document.getElementById('bottomSheet');
        const sheetOverlay = document.getElementById('sheetOverlay');
        const closeSheetBtn = document.getElementById('closeSheetBtn');
        
        function openBottomSheet() {
            if (bottomSheet) bottomSheet.classList.add('open');
            if (sheetOverlay) sheetOverlay.classList.add('active');
        }
        
        function closeBottomSheet() {
            if (bottomSheet) bottomSheet.classList.remove('open');
            if (sheetOverlay) sheetOverlay.classList.remove('active');
        }
        
        if (fabBtn) fabBtn.addEventListener('click', openBottomSheet);
        if (closeSheetBtn) closeSheetBtn.addEventListener('click', closeBottomSheet);
        if (sheetOverlay) sheetOverlay.addEventListener('click', closeBottomSheet);
        
        console.log('✅ Menu mobile inicializado');
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMenuMobile);
    } else {
        initMenuMobile();
    }
})();

// ========== SISTEMA DE NOTIFICAÇÕES MOBILE ==========
let notificacoesMobileInterval;

function abrirNotificacoesMobile() {
    const bottomSheet = document.getElementById('bottomSheet');
    const sheetOverlay = document.getElementById('sheetOverlay');
    if (bottomSheet) bottomSheet.classList.remove('open');
    if (sheetOverlay) sheetOverlay.classList.remove('active');
    
    const modal = document.getElementById('modalNotificacoesMobile');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.add('show');
    }
    
    carregarNotificacoesMobile();
}

function fecharModalNotificacoesMobile() {
    const modal = document.getElementById('modalNotificacoesMobile');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('show');
    }
}

async function carregarNotificacoesMobile() {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        
        const response = await fetch('/api/notificacoes?apenasNaoLidas=false&limite=30', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            renderizarNotificacoesMobile(data.notificacoes);
            atualizarBadgesMobile(data.notificacoes);
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar notificações mobile:', error);
        const lista = document.getElementById('notificacoesListaMobile');
        if (lista) {
            lista.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 10px;"></i>
                    <p>Erro ao carregar notificações</p>
                    <button onclick="carregarNotificacoesMobile()" style="
                        margin-top: 15px;
                        padding: 10px 20px;
                        background: #4f46e5;
                        color: white;
                        border: none;
                        border-radius: 8px;
                        cursor: pointer;
                    ">
                        <i class="fas fa-redo"></i> Tentar novamente
                    </button>
                </div>
            `;
        }
    }
}

function renderizarNotificacoesMobile(notificacoes) {
    const lista = document.getElementById('notificacoesListaMobile');
    if (!lista) return;
    
    if (!notificacoes || notificacoes.length === 0) {
        lista.innerHTML = `
            <div style="text-align: center; padding: 50px 20px; color: #6c757d;">
                <i class="fas fa-bell-slash" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.4;"></i>
                <p style="font-size: 1rem; margin: 0;">Nenhuma notificação</p>
                <p style="font-size: 0.85rem; margin-top: 5px; opacity: 0.7;">Você está em dia! 🎉</p>
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
        else if (diffHr < 24) tempoTexto = `há ${diffHr}h`;
        else tempoTexto = `há ${diffDia}d`;
        
        const classeNaoLida = notif.lida ? '' : 'nao-lida';
        const linkSeguro = (notif.link || '').replace(/'/g, "\\'");
        
        html += `
            <div class="notificacao-item-mobile ${classeNaoLida}" 
                 onclick="abrirNotificacaoMobile('${notif._id}', '${linkSeguro}')">
                <div style="
                    width: 42px;
                    height: 42px;
                    border-radius: 12px;
                    background: ${notif.cor || '#4f46e5'};
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 1.1rem;
                    flex-shrink: 0;
                ">
                    ${notif.icone || '📋'}
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="
                        font-weight: 600;
                        margin-bottom: 4px;
                        font-size: 0.9rem;
                        color: ${!notif.lida ? '#1e40af' : '#1f2937'};
                    ">${notif.titulo}</div>
                    <div style="
                        font-size: 0.8rem;
                        color: #6b7280;
                        margin-bottom: 6px;
                        line-height: 1.4;
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                    ">${notif.mensagem}</div>
                    <div style="
                        font-size: 0.7rem;
                        color: #9ca3af;
                        display: flex;
                        align-items: center;
                        gap: 5px;
                    ">
                        <i class="far fa-clock"></i> ${tempoTexto}
                        ${!notif.lida ? '<span style="background: #3b82f6; color: white; padding: 1px 6px; border-radius: 10px; font-size: 0.6rem; margin-left: 5px;">NOVA</span>' : ''}
                    </div>
                </div>
                <div style="display: flex; align-items: center; color: #9ca3af; align-self: center;">
                    <i class="fas fa-chevron-right"></i>
                </div>
            </div>
        `;
    });
    
    lista.innerHTML = html;
}

function atualizarBadgesMobile(notificacoes) {
    const naoLidas = notificacoes ? notificacoes.filter(n => !n.lida).length : 0;
    
    const fabBadge = document.getElementById('fabNotificationBadge');
    if (fabBadge) {
        if (naoLidas > 0) {
            fabBadge.textContent = naoLidas > 99 ? '99+' : naoLidas;
            fabBadge.style.display = 'block';
        } else {
            fabBadge.style.display = 'none';
        }
    }
    
    const menuBadge = document.getElementById('menuNotificationBadge');
    if (menuBadge) {
        if (naoLidas > 0) {
            menuBadge.textContent = naoLidas > 99 ? '99+' : naoLidas;
            menuBadge.style.display = 'inline-block';
        } else {
            menuBadge.style.display = 'none';
        }
    }
    
    const modalBadge = document.getElementById('modalNotificacoesBadge');
    if (modalBadge) {
        if (naoLidas > 0) {
            modalBadge.textContent = `${naoLidas} nova${naoLidas > 1 ? 's' : ''}`;
            modalBadge.style.display = 'inline-block';
        } else {
            modalBadge.style.display = 'none';
        }
    }
}

async function abrirNotificacaoMobile(id, link) {
    try {
        const token = localStorage.getItem('auth_token');
        
        await fetch(`/api/notificacoes/${id}/lida`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        fecharModalNotificacoesMobile();
        
        if (link && link !== '' && link !== '#') {
            window.location.href = link;
        } else {
            carregarNotificacoesMobile();
            if (typeof carregarNotificacoes === 'function') {
                carregarNotificacoes();
            }
        }
        
    } catch (error) {
        console.error('❌ Erro ao abrir notificação:', error);
    }
}

async function marcarTodasLidasMobile() {
    try {
        const token = localStorage.getItem('auth_token');
        
        const response = await fetch('/api/notificacoes/marcar-todas-lidas', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            await carregarNotificacoesMobile();
            atualizarBadgesMobile([]);
            
            const desktopBadge = document.getElementById('notificacoesBadge');
            if (desktopBadge) desktopBadge.style.display = 'none';
            
            const desktopBtn = document.getElementById('notificacoesBtn');
            if (desktopBtn) desktopBtn.classList.remove('tem-notificacao');
            
            if (typeof mostrarMensagemAluno === 'function') {
                mostrarMensagemAluno('✅ Todas as notificações foram marcadas como lidas!', 'info');
            }
        }
        
    } catch (error) {
        console.error('❌ Erro ao marcar todas como lidas:', error);
        if (typeof mostrarMensagemAluno === 'function') {
            mostrarMensagemAluno('❌ Erro ao marcar notificações como lidas', 'info');
        }
    }
}

async function limparNotificacoesMobile(event) {
    try {
        const token = localStorage.getItem('auth_token');
        
        const confirmacao = await confirm('🗑️ Deseja excluir TODAS as suas notificações?\n\nEsta ação não pode ser desfeita.');
        
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
            await carregarNotificacoesMobile();
            atualizarBadgesMobile([]);
            
            const desktopBadge = document.getElementById('notificacoesBadge');
            if (desktopBadge) desktopBadge.style.display = 'none';
            
            const desktopBtn = document.getElementById('notificacoesBtn');
            if (desktopBtn) desktopBtn.classList.remove('tem-notificacao');
            
            if (typeof mostrarMensagemAluno === 'function') {
                mostrarMensagemAluno(`✅ ${data.message || 'Notificações excluídas com sucesso!'}`, 'info');
            }
        } else {
            throw new Error(data.error || 'Erro ao excluir notificações');
        }
        
    } catch (error) {
        console.error('❌ Erro:', error);
        if (typeof mostrarMensagemAluno === 'function') {
            mostrarMensagemAluno('❌ ' + error.message, 'info');
        }
    } finally {
        const btn = document.querySelector('#modalNotificacoesMobile button[onclick*="limparNotificacoesMobile"]');
        if (btn) {
            btn.innerHTML = '<i class="fas fa-trash"></i> Limpar';
            btn.disabled = false;
        }
    }
}

// Fechar modal ao clicar fora
document.addEventListener('click', function(event) {
    const modal = document.getElementById('modalNotificacoesMobile');
    if (modal && event.target === modal) {
        fecharModalNotificacoesMobile();
    }
});

// ========== INICIALIZAR SISTEMA MOBILE ==========
document.addEventListener('DOMContentLoaded', function() {
    const isMobile = window.innerWidth < 768;
    
    if (isMobile) {
        async function carregarContadorMobile() {
            try {
                const token = localStorage.getItem('auth_token');
                if (!token) return;
                
                const response = await fetch('/api/notificacoes/nao-lidas/contador', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                const data = await response.json();
                
                if (data.success) {
                    const naoLidas = data.count || 0;
                    
                    const fabBadge = document.getElementById('fabNotificationBadge');
                    if (fabBadge) {
                        if (naoLidas > 0) {
                            fabBadge.textContent = naoLidas > 99 ? '99+' : naoLidas;
                            fabBadge.style.display = 'block';
                        } else {
                            fabBadge.style.display = 'none';
                        }
                    }
                    
                    const menuBadge = document.getElementById('menuNotificationBadge');
                    if (menuBadge) {
                        if (naoLidas > 0) {
                            menuBadge.textContent = naoLidas > 99 ? '99+' : naoLidas;
                            menuBadge.style.display = 'inline-block';
                        } else {
                            menuBadge.style.display = 'none';
                        }
                    }
                }
                
            } catch (error) {
                console.error('❌ Erro ao carregar contador mobile:', error);
            }
        }
        
        carregarContadorMobile();
        notificacoesMobileInterval = setInterval(carregarContadorMobile, 30000);
    }
    
    window.addEventListener('beforeunload', function() {
        if (notificacoesMobileInterval) {
            clearInterval(notificacoesMobileInterval);
        }
    });
});

// ========== LOGOUT MOBILE ==========
const logoutMobileBtn = document.getElementById('logoutMobileBtn');
if (logoutMobileBtn) {
    logoutMobileBtn.addEventListener('click', function() {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = 'login.html';
    });
}

// ============================================
// CORREÇÃO DO MENU MOBILE - VERSÃO FUNCIONAL
// ============================================
(function() {
    function aplicarMenuMobile() {
        const isMobile = window.innerWidth < 768;
        
        const headerActions = document.querySelector('.aluno-header > div:last-child');
        const btnLogout = document.getElementById('btnLogout');
        const fabMenu = document.getElementById('fabMenuContainer');
        
        if (isMobile) {
            if (headerActions) {
                headerActions.style.setProperty('display', 'none', 'important');
            }
            if (btnLogout) {
                btnLogout.style.setProperty('display', 'none', 'important');
            }
            if (fabMenu) {
                fabMenu.style.setProperty('display', 'block', 'important');
            }
            console.log('📱 Modo mobile ativado - Header oculto, menu FAB visível (direita)');
        } else {
            if (headerActions) {
                headerActions.style.setProperty('display', 'flex', 'important');
            }
            if (btnLogout) {
                btnLogout.style.setProperty('display', 'flex', 'important');
            }
            if (fabMenu) {
                fabMenu.style.setProperty('display', 'none', 'important');
            }
            console.log('💻 Modo desktop ativado - Header visível, menu FAB oculto');
        }
    }
    
    aplicarMenuMobile();
    window.addEventListener('resize', aplicarMenuMobile);
    window.addEventListener('DOMContentLoaded', aplicarMenuMobile);
    setTimeout(aplicarMenuMobile, 100);
    setTimeout(aplicarMenuMobile, 500);
})();

// ============================================
// CONFIGURAÇÃO DA API E VARIÁVEIS GLOBAIS
// ============================================
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

console.log('📡 Host:', window.location.hostname);
console.log('🌐 API URL:', API_BASE_URL);

window.API_BASE_URL = API_BASE_URL;

// Variáveis globais
let usuario = null;
let provasPendentes = [];
let provasConcluidas = [];
let turmas = [];
let provaSelecionada = null;
let filtroPeriodoAtivo = 'todos';
let filtroPeriodoTurmasAtivo = 'todos';
let bannerFaceAtivo = false;

// Funções do modal
function mostrarModal(id) {
    document.getElementById(id).style.display = 'flex';
}

function fecharModal(id) {
    document.getElementById(id).style.display = 'none';
}

// Carregar dados do aluno
async function carregarDadosAluno() {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            window.location.href = 'login.html';
            return;
        }
        
        const userResponse = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (userResponse.status === 401) {
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user_data');
            sessionStorage.removeItem('auth_token');
            sessionStorage.removeItem('user_data');
            window.location.href = 'login.html';
            return;
        }
        
        const userData = await userResponse.json();
        
        if (userData.success) {
            usuario = userData.user;
            localStorage.setItem('user_data', JSON.stringify(usuario));
            
            if (usuario.role !== 'aluno') {
                mostrarMensagemAluno('Apenas alunos podem acessar esta página', 'info');
                window.location.href = usuario.role === 'professor' ? 'index.html' : 'login.html';
                return;
            }
            
            document.getElementById('alunoDetails').innerHTML = `
                <p><strong>${usuario.nome}</strong></p>
                <p>${usuario.curso ? usuario.curso + ' | ' : ''}${usuario.matricula || 'Sem matrícula'}</p>
                <p>${usuario.email}</p>
            `;
            
            await carregarProvasPendentes();
            await carregarTurmasAluno();
            
        } else {
            throw new Error(userData.error || 'Erro ao carregar dados do usuário');
        }
        
    } catch (error) {
        console.error('Erro ao carregar dados do aluno:', error);
        mostrarErro('Erro ao carregar dados. Verifique sua conexão.');
    }
}

function mostrarMiniBannerFacePendente() {
    if (document.getElementById('miniBannerFacePendente')) return;
    if (bannerFaceAtivo) return;
    
    bannerFaceAtivo = true;
    
    const banner = document.createElement('div');
    banner.id = 'miniBannerFacePendente';
    banner.className = 'face-pendente-banner';
    
    banner.innerHTML = `
        <div class="banner-content">
            <div class="banner-icon">
                <i class="fas fa-id-card"></i>
            </div>
            <div class="banner-text">
                <strong>📸 Cadastro de Face ID Pendente</strong>
                <p>Você ainda não cadastrou sua Face ID. Isso é necessário para acessar as provas.</p>
            </div>
        </div>
        <div class="banner-actions">
            <button class="btn-cadastrar-agora" onclick="window.location.href='capturar-face.html'">
                <i class="fas fa-camera"></i> Cadastrar Agora
            </button>
            <button class="btn-fechar-banner" onclick="fecharMiniBannerFacePendente()" title="Fechar">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    
    const container = document.querySelector('.container');
    if (container) {
        container.insertBefore(banner, container.firstChild);
    }
}

function fecharMiniBannerFacePendente() {
    const banner = document.getElementById('miniBannerFacePendente');
    if (banner) {
        banner.remove();
        bannerFaceAtivo = false;
        
        localStorage.setItem('banner_face_fechado', Date.now().toString());
    }
}

async function verificarPendenciaFace() {
    try {
        const token = localStorage.getItem('auth_token');
        const user = JSON.parse(localStorage.getItem('user_data') || '{}');
        
        if (!token || !user.id || user.role !== 'aluno') return;
        
        console.log('🔍 Verificando pendência de Face ID...');
        
        const response = await fetch(`/api/auth/verificar-face/${user.id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success && data.temFace) {
            console.log('✅ Face ID já cadastrada');
            
            const banner = document.getElementById('miniBannerFacePendente');
            if (banner) {
                banner.remove();
                bannerFaceAtivo = false;
            }
            
            if (verificacaoFaceInterval) {
                clearInterval(verificacaoFaceInterval);
                verificacaoFaceInterval = null;
            }
            return;
        }
        
        console.log('⚠️ Face ID NÃO cadastrada - mostrando banner');
        
        mostrarMiniBannerFacePendente();
        
        const hoje = new Date().toDateString();
        const ultimaNotificacao = localStorage.getItem('ultima_notificacao_face');
        
        if (ultimaNotificacao !== hoje) {
            
            const bannerFechado = localStorage.getItem('banner_face_fechado');
            if (bannerFechado) {
                const fechadoHa = Date.now() - parseInt(bannerFechado);
                if (fechadoHa < 60 * 60 * 1000) {
                    console.log('⏭️ Banner fechado recentemente, não vai notificar');
                    return;
                }
            }
            
            try {
                await fetch('/api/notificacoes', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        usuarioId: user.id,
                        tipo: 'sistema',
                        titulo: '📸 Cadastro de Face ID Pendente',
                        mensagem: 'Você ainda não cadastrou sua Face ID. Clique aqui para cadastrar agora.',
                        icone: '📸',
                        cor: '#f97316',
                        link: '/capturar-face.html',
                        prioridade: 4,
                        dados: {
                            tipo: 'lembrete_face',
                            acao: 'cadastrar_face',
                            data: new Date().toISOString()
                        }
                    })
                });
                console.log('✅ Notificação no sistema enviada');
            } catch (error) {
                console.error('❌ Erro ao enviar notificação no sistema:', error);
            }
            
            try {
                await fetch('/api/usuario/enviar-push', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        usuarioId: user.id,
                        titulo: '📸 Cadastre sua Face ID',
                        mensagem: 'Você ainda não cadastrou sua Face ID. Isso é necessário para acessar as provas.',
                        dados: {
                            tipo: 'lembrete_face',
                            url: '/capturar-face.html',
                            prioridade: 'alta'
                        }
                    })
                });
                console.log('✅ Push notification enviada');
            } catch (error) {
                console.error('❌ Erro ao enviar push:', error);
            }
            
            localStorage.setItem('ultima_notificacao_face', hoje);
        }
        
    } catch (error) {
        console.error('❌ Erro ao verificar pendência de Face ID:', error);
    }
}

// ============ CARREGAR PROVAS PENDENTES DO ALUNO ============
async function carregarProvasPendentes() {
    try {
        const token = localStorage.getItem('auth_token');
        const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
        
        const precisaAcessibilidade = userData.precisaAcessibilidade || false;
        const condicao = userData.condicaoAcessibilidade || '';
        
        console.log(`🎯 Aluno - Carregando provas...`);
        console.log(`   └─ Precisa de acessibilidade: ${precisaAcessibilidade ? 'SIM' : 'NÃO'}`);
        console.log(`   └─ Condição: ${condicao || 'Não especificada'}`);
        
        const response = await fetch(`${API_BASE_URL}/aluno/provas/pendentes`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            let todasProvas = data.provas || [];
            
            let provasFiltradas = [];
            
            if (precisaAcessibilidade) {
                provasFiltradas = todasProvas.filter(prova => {
                    const isAdaptada = prova.adaptada === true || 
                                    prova.tipoProva === 'adaptada' || 
                                    prova.adaptada === 'true' ||
                                    prova.tipoProva?.toLowerCase() === 'adaptada';
                    
                    if (isAdaptada) {
                        console.log(`✅ Prova adaptada encontrada: ${prova.titulo} (ID: ${prova.id})`);
                        return true;
                    }
                    return false;
                });
                
                console.log(`🎯 Aluno com acessibilidade: ${provasFiltradas.length} prova(s) adaptada(s) disponível(is)`);
                console.log(`🚫 Provas normais OCULTADAS: ${todasProvas.length - provasFiltradas.length}`);
                
            } else {
                provasFiltradas = todasProvas.filter(prova => {
                    const isAdaptada = prova.adaptada === true || 
                                    prova.tipoProva === 'adaptada' ||
                                    prova.adaptada === 'true' ||
                                    prova.tipoProva?.toLowerCase() === 'adaptada';
                    
                    return !isAdaptada;
                });
                
                console.log(`📚 Aluno sem acessibilidade: ${provasFiltradas.length} prova(s) normal(is) disponível(is)`);
                console.log(`🚫 Provas adaptadas OCULTADAS: ${todasProvas.length - provasFiltradas.length}`);
            }
            
            if (precisaAcessibilidade && provasFiltradas.length === 0) {
                console.log('⚠️ Aluno com acessibilidade - Nenhuma prova adaptada disponível');
                
                const container = document.getElementById('provasPendentes');
                if (container) {
                    container.innerHTML = `
                        <div class="empty-state" style="
                            background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
                            border-radius: 16px;
                            padding: 40px 20px;
                            text-align: center;
                            border: 2px solid #2563eb;
                        ">
                            <div style="
                                width: 80px;
                                height: 80px;
                                background: #2563eb;
                                border-radius: 50%;
                                display: flex;
                                align-items: center;
                                justify-content: center;
                                margin: 0 auto 20px;
                                box-shadow: 0 10px 25px rgba(37, 99, 235, 0.3);
                            ">
                                <i class="fas fa-universal-access" style="font-size: 40px; color: white;"></i>
                            </div>
                            <h3 style="color: #1e40af; font-size: 1.5rem; margin-bottom: 10px;">
                                Nenhuma Prova Adaptada
                            </h3>
                            <p style="color: #3b82f6; font-size: 1rem; max-width: 400px; margin: 0 auto;">
                                No momento não há provas adaptadas disponíveis para você.
                                Aguarde até que seu professor crie uma prova no formato acessível.
                            </p>
                            <div style="
                                margin-top: 25px;
                                padding: 15px;
                                background: rgba(37, 99, 235, 0.1);
                                border-radius: 12px;
                                display: inline-block;
                            ">
                                <span style="display: flex; align-items: center; gap: 10px; color: #1e40af;">
                                    <i class="fas fa-info-circle"></i>
                                    Modo Acessibilidade Ativado
                                </span>
                            </div>
                        </div>
                    `;
                }
                
                provasPendentes = [];
                
            } else {
                provasFiltradas.sort((a, b) => {
                    const dataA = a.dataLimite ? new Date(a.dataLimite) : new Date(9999, 11, 31);
                    const dataB = b.dataLimite ? new Date(b.dataLimite) : new Date(9999, 11, 31);
                    return dataA - dataB;
                });
                
                provasPendentes = provasFiltradas;
                atualizarListaProvas('provasPendentes', provasPendentes, 'pendente', precisaAcessibilidade);
            }
            
            await carregarProvasConcluidas();
            
        } else {
            throw new Error(data.error || 'Erro ao carregar provas pendentes');
        }
    } catch (error) {
        console.error('❌ Erro ao carregar provas pendentes:', error);
        const container = document.getElementById('provasPendentes');
        if (container) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-triangle" style="font-size: 3rem; color: #ef4444; margin-bottom: 15px;"></i>
                    <h3>Erro ao carregar provas</h3>
                    <p>${error.message || 'Tente recarregar a página'}</p>
                    <button onclick="carregarProvasPendentes()" style="
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
    }
}

// ========== VARIÁVEL GLOBAL PARA CONTROLAR O FILTRO ==========
let filtroAtivo = 'todos';
let eixoAlunoGlobal = '';

// ============ CARREGAR PROVAS CONCLUÍDAS ============
async function carregarProvasConcluidas() {
    try {
        const token = localStorage.getItem('auth_token');
        
        console.log('%c🎯 CARREGANDO PROVAS CONCLUÍDAS', 'font-weight:bold; color:blue;');
        
        const response = await fetch(`${API_BASE_URL}/aluno/provas`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const provas = data.provas || [];
            
            console.log(`📊 Total de provas: ${provas.length}`);
            
            window.provasConcluidas = provas;
            localStorage.setItem('backupProvasConcluidas', JSON.stringify(provas));
            
            await configurarFiltrosProvasBanco();
            aplicarFiltroEStatus(provas);
        }
    } catch (error) {
        console.error('❌ Erro ao carregar provas concluídas:', error);
        document.getElementById('provasConcluidas').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Erro ao carregar provas</h3>
                <p>Tente recarregar a página</p>
            </div>
        `;
    }
}

// ========== CONFIGURAR FILTROS COM DADOS DO BANCO - COM DISCIPLINAS DO CURSO ==========
async function configurarFiltrosProvasBanco() {
    const filtroSelect = document.getElementById('filtroEixoProvasConcluidas');
    if (!filtroSelect) return;
    
    try {
        const token = localStorage.getItem('auth_token');
        
        // Buscar curso completo do aluno (com eixo)
        const response = await fetch(`${API_BASE_URL}/aluno/curso-completo`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Erro ao buscar dados do aluno');
        }
        
        console.log('📚 Dados do aluno:', data);
        
        let eixoDoAluno = null;
        if (data.eixo) {
            eixoDoAluno = data.eixo.nome;
            console.log(`🎯 Eixo do aluno (do banco): ${eixoDoAluno}`);
        }
        
        // RECRIAR SELECT PARA LIMPAR LISTENERS ANTIGOS
        const novoSelect = filtroSelect.cloneNode(true);
        filtroSelect.parentNode.replaceChild(novoSelect, filtroSelect);
        
        // Limpar opções existentes
        novoSelect.innerHTML = '';
        
        // Adicionar opção "Todos"
        const optionTodos = document.createElement('option');
        optionTodos.value = 'todos';
        optionTodos.textContent = 'Todas as disciplinas';
        novoSelect.appendChild(optionTodos);
        
        // ========== EIXOS DA BNCC (sempre aparecem) ==========
        const eixosBNCC = [
            { nome: 'natureza', label: '🔬 Natureza e Matemática' },
            { nome: 'humanas', label: '🏛️ Humanas' },
            { nome: 'linguagens', label: '🎭 Linguagens' }
        ];
        
        eixosBNCC.forEach(eixo => {
            const optionEixo = document.createElement('option');
            optionEixo.value = eixo.nome;
            optionEixo.textContent = eixo.label;
            optionEixo.style.fontWeight = '600';
            novoSelect.appendChild(optionEixo);
        });
        
        // ========== EIXOS TÉCNICOS + DISCIPLINAS DO CURSO DO ALUNO ==========
        
        // Mapeamento: eixo técnico → lista de disciplinas
        const DISCIPLINAS_POR_EIXO = {
            'desenvolvimento': {
                label: '💻 Desenvolvimento de Sistemas',
                disciplinas: [
                    { nome: 'programacao',     label: '💻 Programação' },
                    { nome: 'banco_dados',     label: '🗄️ Banco de Dados' },
                    { nome: 'engenharia_software', label: '⚙️ Engenharia de Software' },
                    { nome: 'desenvolvimento_web', label: '🌐 Desenvolvimento Web' },
                    { nome: 'algoritmos',      label: '🧮 Algoritmos' }
                ]
            },
            'redes': {
                label: '🌐 Redes de Computadores',
                disciplinas: [
                    { nome: 'redes',         label: '🌐 Redes de Computadores' },
                    { nome: 'seguranca',     label: '🔒 Segurança da Informação' },
                    { nome: 'infraestrutura',label: '🖥️ Infraestrutura de TI' },
                    { nome: 'protocolos',    label: '📡 Protocolos de Rede' }
                ]
            },
            'turismo': {
                label: '✈️ Turismo, Eventos e Gastronomia',
                disciplinas: [
                    { nome: 'eventos',       label: '🎉 Eventos' },
                    { nome: 'turismo',       label: '✈️ Turismo' },
                    { nome: 'gastronomia',   label: '🍽️ Gastronomia' },
                    { nome: 'hospitalidade', label: '🏨 Hospitalidade' },
                    { nome: 'lazer',         label: '🎭 Lazer e Recreação' }
                ]
            },
            'gestao': {
                label: '📊 Gestão e Negócios',
                disciplinas: [
                    { nome: 'administracao', label: '📊 Administração' },
                    { nome: 'marketing',     label: '📈 Marketing' },
                    { nome: 'contabilidade', label: '💰 Contabilidade' },
                    { nome: 'rh',            label: '👥 Recursos Humanos' },
                    { nome: 'juridico',      label: '⚖️ Jurídico' }
                ]
            },
            'producao': {
                label: '🎬 Produção Cultural e Design',
                disciplinas: [
                    { nome: 'audio',         label: '🎵 Áudio' },
                    { nome: 'video',         label: '🎬 Vídeo' },
                    { nome: 'publicidade',   label: '📢 Publicidade' },
                    { nome: 'design',        label: '🎨 Design' },
                    { nome: 'producao_cultural', label: '🎭 Produção Cultural' }
                ]
            },
            'ambiente': {
                label: '🌱 Ambiente e Saúde',
                disciplinas: [
                    { nome: 'meio_ambiente', label: '🌱 Meio Ambiente' },
                    { nome: 'saude',         label: '🏥 Saúde' },
                    { nome: 'sustentabilidade', label: '♻️ Sustentabilidade' },
                    { nome: 'seguranca_trabalho', label: '⛑️ Segurança do Trabalho' }
                ]
            }
        };
        
        // Adicionar SEPARADOR visual
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '──────────';
        novoSelect.appendChild(separator);
        
        // Adicionar eixo técnico do aluno COM suas disciplinas
        if (eixoDoAluno && DISCIPLINAS_POR_EIXO[eixoDoAluno]) {
            const config = DISCIPLINAS_POR_EIXO[eixoDoAluno];
            
            // 1. Opção do EIXO (agrupador)
            const optionEixoAluno = document.createElement('option');
            optionEixoAluno.value = eixoDoAluno;
            optionEixoAluno.textContent = config.label;
            optionEixoAluno.style.fontWeight = '600';
            optionEixoAluno.style.backgroundColor = '#f0f9ff';
            novoSelect.appendChild(optionEixoAluno);
            
            // 2. Disciplinas do eixo (indentadas)
            config.disciplinas.forEach(disc => {
                const optionDisc = document.createElement('option');
                optionDisc.value = disc.nome;
                optionDisc.textContent = '\u00A0\u00A0\u00A0\u00A0' + disc.label;
                novoSelect.appendChild(optionDisc);
            });
            
            console.log(`✅ Eixo técnico "${eixoDoAluno}" adicionado com ${config.disciplinas.length} disciplinas`);
            
        } else if (eixoDoAluno) {
            // Fallback: se o eixo não está mapeado, adiciona apenas ele
            const optionEixoAluno = document.createElement('option');
            optionEixoAluno.value = eixoDoAluno;
            optionEixoAluno.textContent = data.eixo?.label || eixoDoAluno;
            optionEixoAluno.style.fontWeight = '600';
            optionEixoAluno.style.backgroundColor = '#f0f9ff';
            novoSelect.appendChild(optionEixoAluno);
            console.log(`✅ Eixo técnico adicionado (sem mapeamento): ${eixoDoAluno}`);
        }
        
        // ========== EVENTO DE MUDANÇA DO FILTRO ==========
        novoSelect.addEventListener('change', function() {
            filtroAtivo = this.value;
            const backup = JSON.parse(localStorage.getItem('backupProvasConcluidas') || '[]');
            aplicarFiltroEStatus(backup);
        });
        
        console.log('✅ Filtros configurados: BNCC + disciplinas do curso');
        
    } catch (error) {
        console.error('❌ Erro ao configurar filtros:', error);
        
        // Fallback - recriar select com opções básicas
        const filtroSelect = document.getElementById('filtroEixoProvasConcluidas');
        if (filtroSelect) {
            const novoSelect = filtroSelect.cloneNode(true);
            filtroSelect.parentNode.replaceChild(novoSelect, filtroSelect);
            
            novoSelect.innerHTML = `
                <option value="todos">Todas as disciplinas</option>
                <option value="natureza">🔬 Natureza e Matemática</option>
                <option value="humanas">🏛️ Humanas</option>
                <option value="linguagens">🎭 Linguagens</option>
            `;
            
            novoSelect.addEventListener('change', function() {
                filtroAtivo = this.value;
                const backup = JSON.parse(localStorage.getItem('backupProvasConcluidas') || '[]');
                aplicarFiltroEStatus(backup);
            });
        }
    }
}

// ========== FUNÇÃO PARA APLICAR FILTRO (COM STATUS) ==========
function aplicarFiltroEStatus(provas) {
    const container = document.getElementById('provasConcluidas');
    if (!container) return;
    
    const filtroEixo = document.getElementById('filtroEixoProvasConcluidas')?.value || 'todos';
    const filtroPeriodo = document.getElementById('filtroPeriodoProvas')?.value || 'todos';
    const filtroStatus = document.getElementById('filtroStatusProvas')?.value || 'todos';
    
    console.log('🔍 Aplicando filtros:', { 
        eixo: filtroEixo, 
        periodo: filtroPeriodo,
        status: filtroStatus 
    });
    
    let provasFiltradas = provas;
    
    if (filtroEixo !== 'todos') {
        provasFiltradas = provasFiltradas.filter(prova => {
            const conteudo = (prova.conteudo || '').toLowerCase();
            const titulo = (prova.titulo || '').toLowerCase();
            const eixoProva = prova.eixo || '';
            const disciplinaProva = prova.disciplina || '';
            
            if (filtroEixo === prova.eixo) {
                return true;
            }
            
            const palavrasChave = {
                'biologia': ['biologia', 'bio', 'célula', 'genética', 'evolução'],
                'fisica': ['física', 'fisica', 'mecânica', 'termodinâmica', 'óptica'],
                'quimica': ['química', 'quimica', 'átomo', 'molécula', 'reação'],
                'matematica': ['matemática', 'matematica', 'álgebra', 'geometria', 'cálculo'],
                'filosofia': ['filosofia', 'ética', 'moral', 'razão'],
                'sociologia': ['sociologia', 'sociedade', 'cultura', 'classes sociais'],
                'geografia': ['geografia', 'mapa', 'cartografia', 'clima', 'relevo'],
                'historia': ['história', 'historia', 'feudalismo', 'renascimento', 'guerra'],
                'artes': ['artes', 'arte', 'música', 'teatro', 'dança'],
                'ingles': ['inglês', 'ingles', 'english', 'vocabulary'],
                'educacao fisica': ['educação física', 'esportes', 'futebol'],
                'espanhol': ['espanhol', 'español'],
                'portugues': ['português', 'portugues', 'gramática', 'redação'],
                'desenvolvimento': ['programação', 'sistemas', 'banco de dados', 'algoritmo', 'software'],
                'redes': ['rede', 'protocolo', 'tcp/ip', 'roteador', 'switch'],
                'turismo': ['evento', 'gastronomia', 'turismo', 'guia'],
                'gestao': ['marketing', 'jurídico', 'gestão', 'negócios'],
                'producao': ['áudio', 'vídeo', 'publicidade', 'design'],
                'ambiente': ['ambiente', 'ecologia', 'sustentabilidade', 'reciclagem']
            };
            
            const palavras = palavrasChave[filtroEixo] || [filtroEixo];
            for (const palavra of palavras) {
                if (conteudo.includes(palavra) || titulo.includes(palavra) || 
                    disciplinaProva.toLowerCase().includes(palavra)) {
                    return true;
                }
            }
            return false;
        });
    }
    
    if (filtroPeriodo !== 'todos') {
        provasFiltradas = provasFiltradas.filter(prova => 
            prova.periodo === filtroPeriodo || 
            (prova.periodo && prova.periodo.toString() === filtroPeriodo)
        );
    }
    
    if (filtroStatus !== 'todos') {
        if (filtroStatus === 'concluidas') {
            provasFiltradas = provasFiltradas.filter(p => 
                !p.cancelada && p.dataRealizacao && p.notaLiberada && p.nota !== null
            );
        } else if (filtroStatus === 'aguardando') {
            provasFiltradas = provasFiltradas.filter(p =>
                !p.cancelada && p.dataRealizacao && (!p.notaLiberada || p.nota === null)
            );
        } else if (filtroStatus === 'canceladas') {
            provasFiltradas = provasFiltradas.filter(p => p.cancelada);
        }
    }
    
    const contadorSpan = document.getElementById('contadorNumerico');
    if (contadorSpan) {
        contadorSpan.innerText = provasFiltradas.length;
    }
    
    const provasConcluidas = provasFiltradas.filter(p => 
        !p.cancelada && p.dataRealizacao && p.notaLiberada && p.nota !== null
    );
    
    const provasAguardando = provasFiltradas.filter(p =>
        !p.cancelada && p.dataRealizacao && (!p.notaLiberada || p.nota === null)
    );
    
    const provasCanceladas = provasFiltradas.filter(p => p.cancelada);
    
    container.innerHTML = '';
    
    if (filtroStatus === 'canceladas') {
        if (provasCanceladas.length > 0) {
            renderizarProvasCanceladas(provasCanceladas);
        } else {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-ban" style="color: #ef4444; font-size: 3rem; margin-bottom: 15px;"></i>
                    <h3 style="color: #ef4444;">Nenhuma prova cancelada</h3>
                    <p>Não há provas canceladas com os filtros selecionados.</p>
                </div>
            `;
        }
        return;
    }
    
    if (filtroStatus === 'todos' && provasAguardando.length > 0) {
        renderizarProvasAguardandoCorrecao(provasAguardando);
    } else if (filtroStatus === 'aguardando' && provasAguardando.length > 0) {
        renderizarProvasAguardandoCorrecao(provasAguardando);
    }
    
    if (filtroStatus === 'todos' || filtroStatus === 'concluidas') {
        if (provasConcluidas.length > 0) {
            atualizarListaProvas('provasConcluidas', provasConcluidas, 'concluida');
        }
    }
    
    if (filtroStatus === 'todos' && provasCanceladas.length > 0) {
        renderizarProvasCanceladas(provasCanceladas);
    }
    
    if (provasConcluidas.length === 0 && provasAguardando.length === 0 && provasCanceladas.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-file"></i>
                <h3>Nenhuma prova encontrada</h3>
                <p>Não há provas com os filtros selecionados</p>
            </div>
        `;
    }
}

// ========== PROVAS PENDENTES - VERSÃO ESTÁVEL ==========
async function carregarProvasPendentes() {
    try {
        const token = localStorage.getItem('auth_token');
        const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
        
        const precisaAcessibilidade = userData.precisaAcessibilidade || false;
        const turmaAluno = userData.turma || '';
        
        if (!turmaAluno) {
            console.error('❌ Turma do aluno não encontrada!');
            return;
        }
        
        console.log(`🎯 Carregando provas pendentes para turma ${turmaAluno}`);
        
        const response = await fetch(`${API_BASE_URL}/aluno/provas/pendentes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const provasDaTurma = (data.provas || []).filter(prova => {
                const turmaProva = prova.turma?.codigo || prova.turma?.nome || prova.turmaId || '';
                return turmaProva === turmaAluno || 
                    turmaProva.includes(turmaAluno) ||
                    prova.turmaId?.includes(turmaAluno);
            });
            
            let provasFiltradas = provasDaTurma;
            
            if (precisaAcessibilidade) {
                provasFiltradas = provasDaTurma.filter(prova => 
                    prova.adaptada === true || 
                    prova.tipoProva === 'adaptada'
                );
            } else {
                provasFiltradas = provasDaTurma.filter(prova => 
                    !(prova.adaptada === true || prova.tipoProva === 'adaptada')
                );
            }
            
            provasPendentes = provasFiltradas;
            atualizarListaProvas('provasPendentes', provasPendentes, 'pendente', precisaAcessibilidade);
            
            await carregarProvasConcluidas();
        }
    } catch (error) {
        console.error('❌ Erro ao carregar provas pendentes:', error);
    }
}

// ========== FILTRO INTERATIVO ESTÁVEL ==========
function inicializarFiltroPorTurma(turmaAluno, eixoAluno) {
    console.log(`🔧 Inicializando filtro para turma ${turmaAluno}, eixo ${eixoAluno}`);
    
    const filtroSelect = document.getElementById('filtroEixoProvasConcluidas');
    if (!filtroSelect) return;
    
    const novoSelect = filtroSelect.cloneNode(true);
    filtroSelect.parentNode.replaceChild(novoSelect, filtroSelect);
    
    const EIXOS_BNCC = ['natureza', 'humanas', 'linguagens'];
    const DISCIPLINAS_BNCC = [
        'biologia', 'fisica', 'quimica', 'matematica',
        'filosofia', 'sociologia', 'geografia', 'historia',
        'artes', 'ingles', 'educacao fisica', 'espanhol', 'portugues'
    ];
    
    Array.from(novoSelect.options).forEach(option => {
        const valor = option.value;
        
        if (valor === 'todos') {
            option.style.display = 'block';
            return;
        }
        
        if (EIXOS_BNCC.includes(valor) || DISCIPLINAS_BNCC.includes(valor)) {
            option.style.display = 'block';
            return;
        }
        
        if (valor === eixoAluno) {
            option.style.display = 'block';
            
            const textos = {
                'desenvolvimento': '💻 Desenvolvimento de Sistemas',
                'redes': '🌐 Redes de Computadores',
                'turismo': '✈️ Turismo, Eventos e Gastronomia',
                'gestao': '📊 Gestão e Negócios',
                'producao': '🎬 Produção Cultural e Design',
                'ambiente': '🌱 Ambiente e Saúde'
            };
            option.textContent = textos[eixoAluno] || option.textContent;
        } else {
            option.style.display = 'none';
        }
    });
    
    novoSelect.addEventListener('change', function() {
        filtroAtivo = this.value;
        const backup = JSON.parse(localStorage.getItem('backupProvasConcluidas') || '[]');
        aplicarFiltroEStatus(backup);
    });
    
    setTimeout(() => {
        const backup = JSON.parse(localStorage.getItem('backupProvasConcluidas') || '[]');
        aplicarFiltroEStatus(backup);
    }, 100);
    
    console.log(`✅ Filtro inicializado para turma ${turmaAluno} (eixo: ${eixoAluno})`);
}

// ========== RENDERIZAR PROVAS AGUARDANDO CORREÇÃO ==========
function renderizarProvasAguardandoCorrecao(provas) {
    const container = document.getElementById('provasConcluidas');
    if (!container) return;
    
    const aguardandoSection = document.createElement('div');
    aguardandoSection.className = 'aguardando-correcao-section';
    aguardandoSection.style.marginTop = '20px';
    aguardandoSection.style.paddingTop = '15px';
    aguardandoSection.style.borderTop = '1px solid #e5e7eb';
    
    aguardandoSection.innerHTML = `
        <h3 style="color: #f59e0b; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-hourglass-half"></i>
            Aguardando Correção
            <span style="background: #fef3c7; color: #f59e0b; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem;">
                ${provas.length}
            </span>
        </h3>
        <div id="provasAguardandoContainer"></div>
    `;
    
    container.appendChild(aguardandoSection);
    
    const aguardandoContainer = document.getElementById('provasAguardandoContainer');
    if (aguardandoContainer) {
        aguardandoContainer.innerHTML = provas.map(prova => {
            const dataRealizacao = prova.dataRealizacao ? 
                new Date(prova.dataRealizacao).toLocaleDateString('pt-BR') + ' ' + 
                new Date(prova.dataRealizacao).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'}) : 
                'Data não informada';
            
            return `
                <div class="prova-card" style="border-left-color: #f59e0b; background: #fef3c7; margin-bottom: 10px;">
                    <div class="prova-header">
                        <h4 class="prova-titulo">${prova.titulo || 'Prova'}</h4>
                        <span class="prova-status" style="background: #fef3c7; color: #f59e0b;">
                            <i class="fas fa-hourglass-half"></i> AGUARDANDO
                        </span>
                    </div>
                    <div class="prova-info">
                        <div class="prova-info-item">
                            <i class="fas fa-book"></i>
                            <span>${prova.conteudo || 'Conteúdo não especificado'}</span>
                        </div>
                        <div class="prova-info-item">
                            <i class="fas fa-graduation-cap"></i>
                            <span>${prova.turma?.nome || prova.turma?.disciplina || 'Turma não especificada'}</span>
                        </div>
                        <div class="prova-info-item">
                            <i class="far fa-calendar-alt"></i>
                            <span>Realizada em: ${dataRealizacao}</span>
                        </div>
                    </div>
                    <div class="prova-actions">
                        <button class="btn-iniciar-prova" style="background: #f59e0b; color: #92400e;" disabled>
                            <i class="fas fa-hourglass-half"></i> Aguardando correção
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// ========== RENDERIZAR PROVAS CANCELADAS ==========
function renderizarProvasCanceladas(provas) {
    const container = document.getElementById('provasConcluidas');
    if (!container) return;
    
    const canceladasSection = document.createElement('div');
    canceladasSection.className = 'provas-canceladas-section';
    canceladasSection.style.marginTop = '20px';
    canceladasSection.style.paddingTop = '15px';
    canceladasSection.style.borderTop = '1px solid #e5e7eb';
    
    canceladasSection.innerHTML = `
        <h3 style="color: #dc2626; margin-bottom: 15px; display: flex; align-items: center; gap: 8px;">
            <i class="fas fa-exclamation-triangle"></i>
            Provas Canceladas
            <span style="background: #fee2e2; color: #dc2626; padding: 2px 8px; border-radius: 10px; font-size: 0.8rem;">
                ${provas.length}
            </span>
        </h3>
        <div id="provasCanceladasContainer"></div>
    `;
    
    container.appendChild(canceladasSection);
    
    const canceladasContainer = document.getElementById('provasCanceladasContainer');
    if (canceladasContainer) {
        canceladasContainer.innerHTML = provas.map(prova => {
            const isViolacao = prova.motivoCancelamento?.toLowerCase().includes('violação') ||
                            prova.motivoCancelamento?.toLowerCase().includes('violacao') ||
                            prova.flagViolacao;
            
            const config = isViolacao ? {
                cor: '#dc2626',
                corFundo: '#fee2e2',
                icone: 'user-slash',
                texto: 'CANCELADA - VIOLAÇÃO'
            } : {
                cor: '#f59e0b',
                corFundo: '#fef3c7',
                icone: 'clock',
                texto: 'CANCELADA - PRAZO'
            };
            
            return `
                <div class="prova-card" data-prova-id="${prova._id}" style="border-left-color: ${config.cor}; background: ${config.corFundo}; margin-bottom: 10px;">
                    <div class="prova-header">
                        <h4 class="prova-titulo">${prova.titulo || 'Prova cancelada'}</h4>
                        <span class="prova-status" style="background: ${config.corFundo}; color: ${config.cor};">
                            <i class="fas fa-${config.icone}"></i> ${config.texto}
                        </span>
                    </div>
                    <div class="prova-info">
                        <div class="prova-info-item">
                            <i class="fas fa-book"></i>
                            <span>${prova.conteudo || 'Conteúdo não especificado'}</span>
                        </div>
                        <div class="prova-info-item">
                            <i class="fas fa-graduation-cap"></i>
                            <span>${prova.turma?.nome || prova.turma?.disciplina || 'Turma não especificada'}</span>
                        </div>
                        <div class="prova-info-item">
                            <i class="fas fa-question-circle"></i>
                            <span>${prova.quantidadeQuestoes || '?'} questões</span>
                        </div>
                    </div>
                    <div class="prova-actions">
                        <button class="btn-sair-prova" onclick="verDetalhesCancelamentoCompleto('${prova._id}')">
                            <i class="fas fa-info-circle"></i> Ver Detalhes
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// MODIFICAR a função de entrar na turma para validar o código
async function entrarNaTurma() {
    const codigo = document.getElementById('codigoTurma').value.trim().toUpperCase();
    
    if (!codigo) {
        mostrarMensagemAluno('Digite o código da turma', 'info');
        return;
    }
    
    try {
        const token = localStorage.getItem('auth_token');
        const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
        const cursoAluno = userData.curso || '';
        
        const turmasPermitidas = TURMAS_POR_CURSO[cursoAluno] || [];
        
        if (turmasPermitidas.length > 0 && !turmasPermitidas.includes(codigo)) {
            mostrarMensagemAluno(`❌ Você não pode entrar na turma ${codigo}. Seu curso (${cursoAluno}) permite apenas as turmas: ${turmasPermitidas.join(', ')}`);
            return;
        }
        
        const response = await fetch(`${API_BASE_URL}/turmas/entrar`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ codigo })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarMensagemAluno('✅ Entrou na turma com sucesso!', 'info');
            fecharModal('modalEntrarTurma');
            document.getElementById('codigoTurma').value = '';
            await carregarTurmasAluno();
            await carregarProvasPendentes();
        } else {
            mostrarMensagemAluno('❌ Erro: ' + data.error, 'info');
        }
    } catch (error) {
        console.error('Erro ao entrar na turma:', error);
        mostrarMensagemAluno('❌ Erro de conexão', 'info');
    }
}

// ADICIONAR função para exibir informações do curso no painel
function atualizarInfoAluno(user) {
    document.getElementById('alunoDetails').innerHTML = `
        <p><strong>${user.nome}</strong></p>
        <p>
            <span style="background: #e0f2fe; padding: 3px 10px; border-radius: 15px; font-size: 0.85rem;">
                <i class="fas fa-graduation-cap"></i> ${user.curso || 'Curso não definido'}
            </span>
            <span style="background: #fef3c7; padding: 3px 10px; border-radius: 15px; font-size: 0.85rem; margin-left: 8px;">
                <i class="fas fa-users"></i> Turma ${user.turma || 'N/A'}
            </span>
        </p>
        <p style="margin-top: 8px;">
            ${user.email} • ${user.matricula || 'Sem matrícula'}
        </p>
    `;
}

// ADICIONE esta função para verificar o status de correção automaticamente
async function verificarStatusProva(provaId) {
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE_URL}/aluno/provas/${provaId}/status-correcao`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            if (data.notaLiberada) {
                carregarProvasConcluidas();
            }
        }
    } catch (error) {
        console.error('Erro ao verificar status da correção:', error);
    }
}

// Adicione esta função no aluno.js (logo após as variáveis globais)
function detectarTipoCancelamento(prova) {
    console.log('🔍 Analisando tipo de cancelamento:', prova);
    
    const motivo = prova.motivoCancelamento || '';
    const motivoLower = motivo.toLowerCase();
    
    const temEstatisticasViolacao = prova.estatisticasCancelamento && 
                                (prova.estatisticasCancelamento.avisos > 0 || 
                                    prova.estatisticasCancelamento.tentativasAtalho > 0 ||
                                    prova.estatisticasCancelamento.capturasTela > 0);
    
    const palavrasViolacao = [
        'violação', 'violacao', 'violou', 'viola', 'regras', 
        'multiplas', 'múltiplas', 'monitoramento', 'avançar',
        'trapaça', 'trapaca', 'fraude', 'irregular', 'conjunto de regras'
    ];
    
    let isViolacao = false;
    
    if (prova.flagViolacao === true) {
        isViolacao = true;
        console.log('✅ Detectado por flagViolacao: true');
    }
    else if (palavrasViolacao.some(palavra => motivoLower.includes(palavra))) {
        isViolacao = true;
        console.log(`✅ Detectado por palavra no motivo: "${motivo}"`);
    }
    else if (temEstatisticasViolacao) {
        isViolacao = true;
        console.log('✅ Detectado por estatísticas de violação');
    }
    else if (prova.tipoCancelamento === 'violacao' || prova.status === 'violacao') {
        isViolacao = true;
        console.log('✅ Detectado por tipoCancelamento');
    }
    else if (prova.estatisticasCancelamento && prova.estatisticasCancelamento.avisos > 0) {
        isViolacao = true;
        console.log('✅ Detectado por avisos > 0');
    }
    else {
        isViolacao = false;
        console.log('📅 Detectado como prazo expirado');
    }
    
    console.log(`🎯 Resultado: ${isViolacao ? 'VIOLAÇÃO' : 'PRAZO EXPIRADO'}`);
    return isViolacao;
}

// Função para gerar card de prova - VERSÃO COM DADOS DO LOG
function gerarCardProva(prova, isCancelada) {
    const dataLimite = prova.dataLimite ? 
        new Date(prova.dataLimite).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }) : 'Sem data limite';
    
    let isViolacao = false;
    let motivoExibicao = prova.motivoCancelamento || 'Prova cancelada';
    
    if (isCancelada) {
        isViolacao = detectarTipoCancelamento(prova);
        
        if (isViolacao) {
            motivoExibicao = prova.motivoCancelamento || 'Prova cancelada por violação das regras';
        } else {
            motivoExibicao = prova.motivoCancelamento || 'Prazo de entrega expirado';
        }
    }
    
    let statusText, statusColor, borderColor, backgroundColor, iconeStatus;
    
    if (isCancelada) {
        if (isViolacao) {
            statusText = 'CANCELADA - VIOLAÇÃO';
            statusColor = '#dc2626';
            borderColor = '#dc2626';
            backgroundColor = '#fef2f2';
            iconeStatus = '<i class="fas fa-user-slash"></i>';
        } else {
            statusText = 'CANCELADA - PRAZO';
            statusColor = '#ef4444';
            borderColor = '#ef4444';
            backgroundColor = '#fff7ed';
            iconeStatus = '<i class="fas fa-clock"></i>';
        }
    } else if (prova.status === 'aguardando_correcao') {
        statusText = 'AGUARDANDO CORREÇÃO';
        statusColor = '#f59e0b';
        borderColor = '#f59e0b';
        backgroundColor = '';
        iconeStatus = '<i class="fas fa-hourglass-half"></i>';
    } else {
        statusText = 'CONCLUÍDA';
        statusColor = '#6b7280';
        borderColor = '#6b7280';
        backgroundColor = '';
        iconeStatus = '<i class="fas fa-check-circle"></i>';
    }
    
    let botaoAcao = '';
    if (isCancelada) {
        botaoAcao = `
            <button class="btn-sair-prova" onclick="verDetalhesCancelamento('${prova._id || prova.id}')">
                <i class="fas fa-info-circle"></i> Ver Detalhes
            </button>
        `;
    } else if (prova.status === 'aguardando_correcao') {
        botaoAcao = `
            <button class="btn-iniciar-prova" style="background: #6b7280;" disabled>
                <i class="fas fa-hourglass-half"></i> Aguardando Correção
            </button>
        `;
    } else if (prova.nota !== null && prova.nota !== undefined) {
        botaoAcao = `
            <button class="btn-ver-resultado" onclick="verResultado('${prova._id || prova.id}')">
                <i class="fas fa-star"></i> Ver Nota: ${prova.nota.toFixed(1)}
            </button>
        `;
    } else {
        botaoAcao = `
            <button class="btn-iniciar-prova" style="background: #6b7280;" disabled>
                <i class="fas fa-hourglass-half"></i> Sem nota disponível
            </button>
        `;
    }
    
    const infoItems = [
        { icon: 'book', text: prova.conteudo || 'Conteúdo não especificado' },
        { icon: 'graduation-cap', text: prova.turma?.nome || prova.turma?.disciplina || 'Turma não especificada' },
        { icon: 'question-circle', text: `${prova.quantidadeQuestoes || '?'} questões` }
    ];
    
    if (prova.duracao) {
        infoItems.push({ icon: 'clock', text: `${prova.duracao} min` });
    }
    
    if (prova.dataLimite) {
        infoItems.push({ icon: 'calendar-alt', text: `Até ${dataLimite}` });
    }
    
    return `
    <div class="prova-card ${isCancelada ? 'cancelada' : 'concluida'}" 
        style="border-left-color: ${borderColor}; ${backgroundColor ? 'background: ' + backgroundColor + ';' : ''}">
        <div class="prova-header">
            <h4 class="prova-titulo">${prova.titulo || 'Prova sem título'}</h4>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="prova-status" 
                    style="background: ${isCancelada ? (isViolacao ? '#fee2e2' : '#fef3c7') : prova.status === 'aguardando_correcao' ? '#fef3c7' : '#f3f4f6'}; 
                            color: ${statusColor};
                            border: 1px solid ${statusColor}20;
                            padding: 5px 12px;
                            border-radius: 20px;
                            font-size: 0.8rem;
                            font-weight: bold;
                            display: flex;
                            align-items: center;
                            gap: 5px;">
                    ${iconeStatus}
                    ${statusText}
                </span>
            </div>
        </div>
        <div class="prova-info">
            ${infoItems.map(item => `
                <div class="prova-info-item">
                    <i class="fas fa-${item.icon}"></i>
                    <span>${item.text}</span>
                </div>
            `).join('')}
        </div>
        <div class="prova-actions">
            ${botaoAcao}
        </div>
        ${isCancelada ? `
        <div style="margin-top: 10px; padding: 8px; background: #fee2e2; border-radius: 6px; border: 1px solid #fecaca;">
            <div style="display: flex; align-items: center; gap: 5px; color: #dc2626;">
                <i class="fas fa-exclamation-circle"></i>
                <strong>Prova Cancelada</strong>
            </div>
            <div style="font-size: 0.85rem; margin-top: 5px; color: #7f1d1d;">
                Clique em "Ver Detalhes" para mais informações
            </div>
        </div>
        ` : ''}
    </div>
    `;
}

// Função para mostrar modal com detalhes completos do cancelamento
async function verDetalhesCancelamentoCompleto(provaId) {
    try {
        const token = localStorage.getItem('auth_token');
        
        mostrarLoading('Carregando detalhes do cancelamento...');
        
        const response = await fetch(`${API_BASE_URL}/aluno/provas/${provaId}/cancelamento-detailed`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        esconderLoading();
        
        if (!data.success) {
            throw new Error(data.error || 'Erro ao carregar detalhes');
        }
        
        criarModalDetalhesCancelamento(data);
        
    } catch (error) {
        esconderLoading();
        console.error('Erro ao carregar detalhes:', error);
        mostrarMensagemAluno('Não foi possível carregar os detalhes do cancelamento: ' + error.message, 'info');
    }
}

// Função para criar o modal com detalhes do cancelamento
function criarModalDetalhesCancelamento(dados) {
    const tipo = dados.tipoCancelamento;
    const config = {
        'violacao': {
            titulo: 'CANCELADA - VIOLAÇÃO DAS REGRAS',
            cor: '#dc2626',
            corFundo: '#fee2e2',
            icone: 'user-slash',
            mensagemPrincipal: 'Esta prova foi cancelada por violação das regras estabelecidas para realização da avaliação.',
            explicacao: 'O sistema de monitoramento detectou comportamentos que violam as regras da prova.'
        },
        'prazo': {
            titulo: 'CANCELADA - PRAZO EXPIRADO',
            cor: '#f59e0b',
            corFundo: '#fef3c7',
            icone: 'clock',
            mensagemPrincipal: 'Esta prova foi cancelada automaticamente por expiração do prazo de entrega.',
            explicacao: 'O tempo limite para realização da prova foi excedido.'
        },
        'outro': {
            titulo: 'PROVA CANCELADA',
            cor: '#6b7280',
            corFundo: '#f3f4f6',
            icone: 'ban',
            mensagemPrincipal: 'Esta prova foi cancelada.',
            explicacao: 'A prova foi cancelada pelo sistema.'
        }
    }[tipo] || config.outro;
    
    const dataCancelamento = new Date(dados.cancelamento.data);
    const dataFormatada = dataCancelamento.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    let estatisticasHTML = '';
    if (dados.estatisticas) {
        const stats = dados.estatisticas;
        
        estatisticasHTML = `
            <div style="margin-top: 20px; border-top: 1px solid ${config.cor}30; padding-top: 15px;">
                <h5 style="color: ${config.cor}; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-chart-bar"></i> 
                    DETALHES DO MONITORAMENTO
                </h5>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px;">
                    ${stats.avisos !== undefined ? `
                    <div style="text-align: center; padding: 10px; background: rgba(255,255,255,0.7); border-radius: 6px; border: 1px solid ${config.cor}30;">
                        <div style="font-size: 1.5rem; font-weight: bold; color: ${config.cor}">${stats.avisos}</div>
                        <div style="font-size: 0.8rem; color: ${config.cor}">Avisos Recebidos</div>
                    </div>
                    ` : ''}
                    
                    ${stats.tentativasAtalho !== undefined ? `
                    <div style="text-align: center; padding: 10px; background: rgba(255,255,255,0.7); border-radius: 6px; border: 1px solid ${config.cor}30;">
                        <div style="font-size: 1.5rem; font-weight: bold; color: ${config.cor}">${stats.tentativasAtalho}</div>
                        <div style="font-size: 0.8rem; color: ${config.cor}">Tentativas de Atalho</div>
                    </div>
                    ` : ''}
                    
                    ${stats.capturasTela !== undefined ? `
                    <div style="text-align: center; padding: 10px; background: rgba(255,255,255,0.7); border-radius: 6px; border: 1px solid ${config.cor}30;">
                        <div style="font-size: 1.5rem; font-weight: bold; color: ${config.cor}">${stats.capturasTela}</div>
                        <div style="font-size: 0.8rem; color: ${config.cor}">Capturas de Tela</div>
                    </div>
                    ` : ''}
                    
                    ${stats.tempoFora !== undefined ? `
                    <div style="text-align: center; padding: 10px; background: rgba(255,255,255,0.7); border-radius: 6px; border: 1px solid ${config.cor}30;">
                        <div style="font-size: 1.5rem; font-weight: bold; color: ${config.cor}">${stats.tempoFora}s</div>
                        <div style="font-size: 0.8rem; color: ${config.cor}">Tempo Fora da Página</div>
                    </div>
                    ` : ''}
                </div>
                
                ${stats.timestamp ? `
                <div style="margin-top: 10px; font-size: 0.8rem; color: #6b7280; text-align: center;">
                    <i class="far fa-clock"></i> 
                    Registro do sistema: ${new Date(stats.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
                ` : ''}
            </div>
        `;
    }
    
    const modalHTML = `
        <div class="modal" id="modalDetalhesCancelamentoCompleto" style="display: flex;">
            <div class="modal-content" style="max-width: 700px; max-height: 90vh; overflow-y: auto;">
                <div style="background: ${config.corFundo}; padding: 20px; border-radius: 8px 8px 0 0; border-bottom: 3px solid ${config.cor};">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="background: ${config.cor}; color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.2rem;">
                                <i class="fas fa-${config.icone}"></i>
                            </div>
                            <h3 style="margin: 0; color: ${config.cor};">
                                ${config.titulo}
                            </h3>
                        </div>
                        <button class="modal-close" onclick="fecharModal('modalDetalhesCancelamentoCompleto')" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: ${config.cor};">&times;</button>
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 15px; margin-top: 10px;">
                        <div style="flex: 1;">
                            <h4 style="margin: 0 0 5px 0; color: #374151;">${dados.prova.titulo}</h4>
                            <p style="margin: 0; color: #6b7280; font-size: 0.9rem;">
                                <i class="fas fa-book"></i> ${dados.prova.conteudo}
                            </p>
                        </div>
                        <div style="text-align: center; min-width: 100px;">
                            <div style="font-size: 2rem; font-weight: bold; color: ${config.cor}">
                                ${dados.cancelamento.nota.toFixed(1)}
                            </div>
                            <div style="font-size: 0.8rem; color: ${config.cor}">Nota Final</div>
                        </div>
                    </div>
                </div>
                
                <div style="padding: 20px;">
                    <div style="background: ${tipo === 'violacao' ? '#fee2e2' : '#fef3c7'}; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid ${config.cor};">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                            <i class="fas fa-exclamation-circle" style="color: ${config.cor}; font-size: 1.2rem;"></i>
                            <h4 style="margin: 0; color: ${config.cor};">Motivo do Cancelamento</h4>
                        </div>
                        <p style="margin: 0; color: ${tipo === 'violacao' ? '#7f1d1d' : '#92400e'}; font-size: 1rem; line-height: 1.5;">
                            <strong>"${dados.cancelamento.motivo}"</strong>
                        </p>
                        <p style="margin: 10px 0 0 0; color: ${tipo === 'violacao' ? '#7f1d1d' : '#92400e'}; font-size: 0.9rem;">
                            ${config.explicacao}
                        </p>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb;">
                            <h5 style="margin: 0 0 10px 0; color: #374151; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-info-circle" style="color: #6b7280;"></i>
                                Informações
                            </h5>
                            <p style="margin: 8px 0; color: #6b7280; font-size: 0.9rem;">
                                <strong><i class="far fa-calendar-alt"></i> Data:</strong><br>
                                ${dataFormatada}
                            </p>
                            <p style="margin: 8px 0; color: #6b7280; font-size: 0.9rem;">
                                <strong><i class="fas fa-user-graduate"></i> Aluno:</strong><br>
                                ${dados.aluno.nome}
                            </p>
                        </div>
                        
                        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e5e7eb;">
                            <h5 style="margin: 0 0 10px 0; color: #374151; display: flex; align-items: center; gap: 8px;">
                                <i class="fas fa-chart-line" style="color: #6b7280;"></i>
                                Desempenho
                            </h5>
                            <p style="margin: 8px 0; color: #6b7280; font-size: 0.9rem;">
                                <strong><i class="fas fa-stopwatch"></i> Tempo gasto:</strong><br>
                                ${Math.floor(dados.cancelamento.tempoGasto / 60)} minutos
                            </p>
                            <p style="margin: 8px 0; color: #6b7280; font-size: 0.9rem;">
                                <strong><i class="fas fa-star" style="color: ${config.cor};"></i> Status final:</strong><br>
                                <span style="color: ${config.cor}; font-weight: bold;">${config.titulo}</span>
                            </p>
                        </div>
                    </div>
                    
                    ${estatisticasHTML}
                    
                    ${dados.professor ? `
                    <div style="margin-top: 20px; padding: 15px; background: #f0f9ff; border-radius: 8px; border-left: 4px solid #0ea5e9;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                            <i class="fas fa-bell" style="color: #0ea5e9;"></i>
                            <h5 style="margin: 0; color: #0ea5e9;">Notificação enviada</h5>
                        </div>
                        <p style="margin: 0; color: #0369a1; font-size: 0.9rem;">
                            O professor <strong>${dados.professor.nome}</strong> foi notificado sobre este cancelamento em 
                            <strong>${dataFormatada}</strong>
                        </p>
                        <p style="margin: 8px 0 0 0; color: #0369a1; font-size: 0.85rem;">
                            <i class="fas fa-envelope"></i> ${dados.professor.email}
                        </p>
                    </div>
                    ` : ''}
                    
                    <div style="margin-top: 20px; padding: 15px; background: ${tipo === 'violacao' ? '#f0f9ff' : '#fefce8'}; border-radius: 8px; border: 1px dashed ${tipo === 'violacao' ? '#0ea5e9' : '#f59e0b'};">
                        <div style="display: flex; align-items: flex-start; gap: 10px;">
                            <i class="fas fa-lightbulb" style="color: ${tipo === 'violacao' ? '#0ea5e9' : '#f59e0b'}; font-size: 1.2rem; margin-top: 2px;"></i>
                            <div>
                                <h5 style="margin: 0 0 8px 0; color: ${tipo === 'violacao' ? '#0ea5e0b' : '#92400e'};">
                                    ${tipo === 'violacao' ? 'Para evitar cancelamentos futuros:' : 'Recomendação:'}
                                </h5>
                                <p style="margin: 0; color: ${tipo === 'violacao' ? '#0369a1' : '#92400e'}; font-size: 0.9rem;">
                                    ${dados.recomendacao}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div style="padding: 15px 20px; background: #f9fafb; border-top: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-size: 0.8rem; color: #6b7280;">
                        <i class="fas fa-history"></i> Última atualização: ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <button class="btn-sair-prova" onclick="fecharModal('modalDetalhesCancelamentoCompleto')">
                        <i class="fas fa-times"></i> Fechar
                    </button>
                </div>
            </div>
        </div>
    `;
    
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHTML;
    document.body.appendChild(modalContainer.firstElementChild);
}

// Função para atualizar o card da prova com informações do cancelamento
function atualizarCardProvaCancelada(provaId, dadosCancelamento) {
    const card = document.querySelector(`[data-prova-id="${provaId}"]`);
    
    if (!card) return;
    
    const tipo = dadosCancelamento.tipoCancelamento;
    const config = {
        'violacao': {
            cor: '#dc2626',
            corFundo: '#fee2e2',
            icone: 'user-slash',
            texto: 'CANCELADA - VIOLAÇÃO'
        },
        'prazo': {
            cor: '#f59e0b',
            corFundo: '#fef3c7',
            icone: 'clock',
            texto: 'CANCELADA - PRAZO'
        }
    }[tipo] || { cor: '#ef4444', corFundo: '#fef2f2', icone: 'ban', texto: 'CANCELADA' };
    
    const statusDiv = card.querySelector('.prova-status');
    if (statusDiv) {
        statusDiv.innerHTML = `
            <i class="fas fa-${config.icone}"></i> ${config.texto}
        `;
        statusDiv.style.background = config.corFundo;
        statusDiv.style.color = config.cor;
        statusDiv.style.borderColor = config.cor;
    }
}

// Nova função para carregar provas aguardando correção
async function carregarProvasAguardandoCorrecao() {
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE_URL}/aluno/provas`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            const provasAguardando = (data.provas || []).filter(prova => {
                return prova.status === 'concluida' && 
                    (prova.nota === null || prova.nota === undefined) &&
                    prova.statusCorrecao !== 'corrigida';
            });
            
            if (provasAguardando.length > 0) {
                const container = document.getElementById('provasConcluidas');
                if (container) {
                    container.insertAdjacentHTML('beforeend', `
                        <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
                            <h3 style="color: #6b7280; margin-bottom: 15px;">
                                <i class="fas fa-clock"></i> Aguardando Correção
                            </h3>
                            ${provasAguardando.map(prova => `
                                <div class="prova-card concluida" style="opacity: 0.7;">
                                    <div class="prova-header">
                                        <h4 class="prova-titulo">${prova.titulo || 'Prova sem título'}</h4>
                                        <span class="prova-status status-pendente">
                                            AGUARDANDO
                                        </span>
                                    </div>
                                    <div class="prova-info">
                                        <div class="prova-info-item">
                                            <i class="fas fa-book"></i>
                                            <span>${prova.conteudo || 'Conteúdo não especificado'}</span>
                                        </div>
                                        <div class="prova-info-item">
                                            <i class="fas fa-graduation-cap"></i>
                                            <span>${prova.turma?.nome || prova.turma?.disciplina || 'Turma não especificada'}</span>
                                        </div>
                                        <div class="prova-info-item">
                                            <i class="fas fa-question-circle"></i>
                                            <span>${prova.quantidadeQuestoes || '?'} questões</span>
                                        </div>
                                    </div>
                                    <div class="prova-actions">
                                        <button class="btn-iniciar-prova" style="background: #6b7280;" disabled>
                                            <i class="fas fa-hourglass-half"></i> Aguardando Correção
                                        </button>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `);
                }
            }
        }
    } catch (error) {
        console.error('Erro ao carregar provas aguardando correção:', error);
    }
}

// ============ FUNÇÃO PARA ATUALIZAR LISTA DE PROVAS DO ALUNO ============
function atualizarListaProvas(elementId, provas, tipo) {
    const container = document.getElementById(elementId);
    
    if (!provas || provas.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-${tipo === 'pendente' ? 'check-circle' : 'file'}"></i>
                <h3>${tipo === 'pendente' ? 'Nenhuma prova pendente' : 'Nenhuma prova concluída'}</h3>
                <p>${tipo === 'pendente' ? 'Todas as provas foram concluídas' : 'Você ainda não realizou nenhuma prova'}</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = provas.map(prova => {
        const isAdaptada = 
            prova.adaptada === true || 
            prova.adaptada === 'true' || 
            prova.tipoProva === 'adaptada' ||
            prova.tipoProva?.toLowerCase() === 'adaptada' ||
            prova.alternativas === 3 ||
            false;
        
        const alternativas = isAdaptada ? 3 : (prova.alternativas || 5);
        
        const badgeAdaptada = isAdaptada ? `
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
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            ">
                <i class="fas fa-universal-access"></i>
                Adaptada (${alternativas} alternativas)
            </span>
        ` : '';
        
        const cardStyle = isAdaptada ? 
            'border-left: 4px solid #2563eb; background: linear-gradient(to right, #f0f9ff, white);' : 
            'border-left: 4px solid #4f46e5; background: white;';
        
        const dataLimite = prova.dataLimite ? 
            new Date(prova.dataLimite).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
            }) : 'Sem data limite';
        
        let tempoInfo = '';
        if (prova.dataLimite) {
            const dataLimiteObj = new Date(prova.dataLimite);
            const hoje = new Date();
            
            const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
            const dataLimiteSemHora = new Date(dataLimiteObj.getFullYear(), dataLimiteObj.getMonth(), dataLimiteObj.getDate());
            
            const diffMs = dataLimiteSemHora - hojeSemHora;
            const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            
            if (diffDias === 0) {
                tempoInfo = `⏰ <span style="color: #dc2626; font-weight: bold;">HOJE</span>`;
            } else if (diffDias === 1) {
                tempoInfo = `⏰ <span style="color: #f59e0b;">Amanhã</span>`;
            } else if (diffDias > 1 && diffDias <= 7) {
                tempoInfo = `⏰ <span style="color: #f59e0b;">Faltam ${diffDias} dias</span>`;
            } else if (diffDias > 7) {
                tempoInfo = `⏰ <span style="color: #10b981;">Faltam ${diffDias} dias</span>`;
            }
        }
        
        let horarioStatus = '';
        let horarioColor = '#6b7280';
        let horarioIcon = 'clock';
        let horarioText = '';
        let botaoDesabilitado = false;
        let mensagemBotao = '';

        if (prova.horarioInicio && prova.horarioTermino) {
            const agora = new Date();
            
            let ano, mes, dia;
            
            if (prova.dataLimite) {
                const dataLimite = new Date(prova.dataLimite);
                ano = dataLimite.getFullYear();
                mes = String(dataLimite.getMonth() + 1).padStart(2, '0');
                dia = String(dataLimite.getDate()).padStart(2, '0');
            } else {
                ano = agora.getFullYear();
                mes = String(agora.getMonth() + 1).padStart(2, '0');
                dia = String(agora.getDate()).padStart(2, '0');
            }
            
            const inicioProva = new Date(`${ano}-${mes}-${dia}T${prova.horarioInicio}:00`);
            const terminoProva = new Date(`${ano}-${mes}-${dia}T${prova.horarioTermino}:00`);
            
            console.log('📅 VERIFICAÇÃO:', {
                dataProva: `${ano}-${mes}-${dia}`,
                inicio: inicioProva.toLocaleString('pt-BR'),
                termino: terminoProva.toLocaleString('pt-BR'),
                agora: agora.toLocaleString('pt-BR')
            });
            
            if (agora < inicioProva) {
                const diffMs = inicioProva - agora;
                const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                const horas = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutos = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                
                horarioColor = '#f59e0b';
                horarioIcon = 'hourglass-start';
                
                if (dias > 0) {
                    horarioText = `⏰ Inicia em ${dias}d ${horas}h ${minutos}min`;
                    mensagemBotao = `Disponível em ${dias}d ${horas}h ${minutos}min`;
                } else if (horas > 0) {
                    horarioText = `⏰ Inicia em ${horas}h ${minutos}min`;
                    mensagemBotao = `Disponível em ${horas}h ${minutos}min`;
                } else {
                    horarioText = `⏰ Inicia em ${minutos}min`;
                    mensagemBotao = `Disponível em ${minutos}min`;
                }
                
                botaoDesabilitado = true;
                
            } else if (agora >= inicioProva && agora <= terminoProva) {
                const diffMs = terminoProva - agora;
                const horas = Math.floor(diffMs / (1000 * 60 * 60));
                const minutos = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                
                horarioColor = '#10b981';
                horarioIcon = 'play-circle';
                
                if (horas > 0) {
                    horarioText = `✅ Termina em ${horas}h ${minutos}min`;
                } else {
                    horarioText = `✅ Termina em ${minutos}min`;
                }
                
                botaoDesabilitado = false;
                
            } else {
                horarioColor = '#ef4444';
                horarioIcon = 'ban';
                horarioText = '❌ Horário encerrado';
                mensagemBotao = 'Horário encerrado';
                botaoDesabilitado = true;
            }
        }

        const provaCancelada = prova.cancelada === true || prova.motivoCancelamento || 
                            prova.status === 'cancelada' || 
                            (prova.status === 'finalizada' && prova.nota === 0 && prova.motivoCancelamento);
        
        let statusClass = 'pendente';
        let statusText = 'PENDENTE';
        let statusColor = '#f59e0b';
        
        if (tipo === 'concluida') {
            if (provaCancelada) {
                statusClass = 'cancelada';
                statusText = 'CANCELADA';
                statusColor = '#ef4444';
            } else if (prova.status === 'aguardando_correcao') {
                statusClass = 'pendente';
                statusText = 'AGUARDANDO CORREÇÃO';
                statusColor = '#f59e0b';
            } else if (prova.status === 'concluida' || prova.status === 'finalizada' || prova.status === 'corrigida') {
                statusClass = 'concluida';
                statusText = 'CONCLUÍDA';
                statusColor = '#6b7280';
            }
        } else if (tipo === 'pendente') {
            if (provaCancelada) {
                statusClass = 'cancelada';
                statusText = 'CANCELADA';
                statusColor = '#ef4444';
            } else {
                statusClass = 'pendente';
                statusText = 'PENDENTE';
                statusColor = '#f59e0b';
            }
        }

        let horarioInfo = '';
        if (prova.horarioInicio && prova.horarioTermino) {
            const agora = new Date();
            
            let ano, mes, dia;
            
            if (prova.dataLimite) {
                const dataLimite = new Date(prova.dataLimite);
                ano = dataLimite.getFullYear();
                mes = String(dataLimite.getMonth() + 1).padStart(2, '0');
                dia = String(dataLimite.getDate()).padStart(2, '0');
            } else {
                ano = agora.getFullYear();
                mes = String(agora.getMonth() + 1).padStart(2, '0');
                dia = String(agora.getDate()).padStart(2, '0');
            }
            
            const inicioProva = new Date(`${ano}-${mes}-${dia}T${prova.horarioInicio}:00`);
            const terminoProva = new Date(`${ano}-${mes}-${dia}T${prova.horarioTermino}:00`);
            
            if (agora >= inicioProva && agora <= terminoProva) {
                const minutosRestantes = Math.floor((terminoProva - agora) / (1000 * 60));
                horarioInfo = `<span style="color: #10b981; font-size: 0.9rem;">
                    ⏰ Disponível agora (termina em ${minutosRestantes} min)
                </span>`;
            } else if (agora < inicioProva) {
                const minutosRestantes = Math.floor((inicioProva - agora) / (1000 * 60));
                horarioInfo = `<span style="color: #f59e0b; font-size: 0.9rem;">
                    ⏰ Disponível às ${prova.horarioInicio} (${minutosRestantes > 60 ? 
                        Math.floor(minutosRestantes/60) + 'h' : 
                        minutosRestantes + 'min'})
                </span>`;
            } else {
                horarioInfo = `<span style="color: #ef4444; font-size: 0.9rem;">
                    ⏰ Horário encerrado
                </span>`;
            }
        }
        
        let botaoAcao = '';
        
        if (tipo === 'pendente') {
            
            if (botaoDesabilitado) {
                botaoAcao = `
                    <button class="btn-iniciar-prova" style="background: #6b7280;" disabled>
                        <i class="fas ${horarioIcon}"></i> ${mensagemBotao || horarioText}
                    </button>
                `;
            } else {
                botaoAcao = `
                    <button class="btn-iniciar-prova" onclick="selecionarProva('${prova._id || prova.id}')" 
                        style="background: ${isAdaptada ? 'linear-gradient(135deg, #2563eb, #1e40af)' : 'linear-gradient(135deg, #4f46e5, #3730a3)'};">
                        <i class="fas ${horarioIcon}"></i> 
                        ${isAdaptada ? 'Iniciar Prova Adaptada' : 'Iniciar Prova'}
                    </button>
                `;
            }
        } else if (tipo === 'concluida') {
            if (provaCancelada) {
                botaoAcao = `
                    <button class="btn-sair-prova" onclick="verDetalhesCancelamento('${prova._id || prova.id}')">
                        <i class="fas fa-info-circle"></i> Ver Detalhes
                    </button>
                    ${prova.nota !== undefined ? `
                    <div style="margin-top: 10px; padding: 8px; background: #fee2e2; border-radius: 6px; border-left: 3px solid #ef4444;">
                        <strong style="color: #ef4444;">Nota: ${prova.nota.toFixed(1)}</strong>
                    </div>
                    ` : ''}
                `;
            } else if (prova.status === 'aguardando_correcao') {
                botaoAcao = `
                    <button class="btn-iniciar-prova" style="background: #6b7280;" disabled>
                        <i class="fas fa-hourglass-half"></i> Aguardando Correção
                    </button>
                `;
            } else if (prova.nota !== null && prova.nota !== undefined) {
                botaoAcao = `
                    <button class="btn-ver-resultado" onclick="verResultado('${prova._id || prova.id}')">
                        <i class="fas fa-star"></i> Ver Nota: ${prova.nota.toFixed(1)}
                    </button>
                `;
            } else {
                botaoAcao = `
                    <button class="btn-iniciar-prova" style="background: #6b7280;" disabled>
                        <i class="fas fa-hourglass-half"></i> Sem nota disponível
                    </button>
                `;
            }
        }

        const infoHorarioDuracao = prova.horarioInicio && prova.horarioTermino ? `
            <div style="margin: 15px 0; padding: 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #e5e7eb;">
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
                    <div style="text-align: center;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 5px; color: #4f46e5;">
                            <i class="far fa-clock"></i>
                            <strong>Horário</strong>
                        </div>
                        <div style="font-size: 0.9rem; color: #374151;">
                            ${prova.horarioInicio} às ${prova.horarioTermino}
                        </div>
                    </div>
                    
                    <div style="text-align: center;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 5px; color: #10b981;">
                            <i class="fas fa-hourglass-half"></i>
                            <strong>Duração</strong>
                        </div>
                        <div style="font-size: 0.9rem; color: #374151;">
                            ${prova.duracaoMinutos || 30} minutos
                        </div>
                    </div>
                    
                    <div style="text-align: center;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 5px; color: ${isAdaptada ? '#2563eb' : horarioColor};">
                            <i class="fas fa-${isAdaptada ? 'universal-access' : horarioIcon}"></i>
                            <strong>${isAdaptada ? 'Acessibilidade' : 'Status'}</strong>
                        </div>
                        <div style="font-size: 0.9rem; color: ${isAdaptada ? '#2563eb' : horarioColor}; font-weight: 500;">
                            ${isAdaptada ? `${alternativas} alternativas` : horarioText}
                        </div>
                    </div>
                </div>
            </div>
        ` : '';
        
        return `
        <div class="prova-card ${tipo}" style="${cardStyle} border-left-color: ${isAdaptada ? '#2563eb' : statusColor}; ${provaCancelada ? 'background: #fef2f2;' : ''}">
            <div class="prova-header">
                <h4 class="prova-titulo" style="display: flex; align-items: center; flex-wrap: wrap; gap: 8px;">
                    ${prova.titulo || 'Prova sem título'}
                    ${badgeAdaptada}
                </h4>
                <div style="display: flex; align-items: center; gap: 10px;">
                    ${tempoInfo ? `<span style="font-size: 0.8rem; font-weight: 600;">${tempoInfo}</span>` : ''}
                    <span class="prova-status status-${statusClass}" 
                        style="background: ${statusClass === 'pendente' ? '#fef3c7' : statusClass === 'concluida' ? '#f3f4f6' : '#fee2e2'}; 
                                color: ${statusColor};">
                        ${statusText}
                    </span>
                </div>
            </div>
            
            ${infoHorarioDuracao}
            
            <div class="prova-info">
                <div class="prova-info-item">
                    <i class="fas fa-book"></i>
                    <span>${prova.conteudo || 'Conteúdo não especificado'}</span>
                </div>
                <div class="prova-info-item">
                    <i class="fas fa-graduation-cap"></i>
                    <span>${prova.turma?.nome || prova.turma?.disciplina || 'Turma não especificada'}</span>
                </div>
                <div class="prova-info-item">
                    <i class="fas fa-question-circle"></i>
                    <span>${prova.quantidadeQuestoes || '?'} questões</span>
                </div>
                ${isAdaptada ? `
                <div class="prova-info-item">
                    <i class="fas fa-list-ol" style="color: #2563eb;"></i>
                    <span><strong>${alternativas}</strong> alternativas por questão</span>
                </div>
                ` : ''}
                ${prova.dataLimite ? `
                <div class="prova-info-item">
                    <i class="fas fa-calendar-alt"></i>
                    <span>Data limite: ${dataLimite}</span>
                </div>
                ` : ''}
                <div class="prova-info-item">
                    <i class="fas fa-calendar-week" style="color: ${prova.periodo === '1' ? '#10b981' : 
                                                            prova.periodo === '2' ? '#f59e0b' : 
                                                            prova.periodo === '3' ? '#8b5cf6' : 
                                                            prova.periodo === '4' ? '#ef4444' : '#6b7280'};"></i>
                    <span>${prova.periodo ? prova.periodo + 'º Período' : '1º Período'}</span>
                </div>
            </div>
            
            <div class="prova-actions">
                ${botaoAcao}
            </div>
            
            ${isAdaptada ? `
            <div style="margin-top: 15px; padding: 10px; background: #dbeafe; border-radius: 6px; border-left: 3px solid #2563eb;">
                <div style="display: flex; align-items: center; gap: 8px; color: #1e40af;">
                    <i class="fas fa-info-circle"></i>
                    <span style="font-size: 0.85rem;">
                        <strong>Prova adaptada exclusiva:</strong> Criada especialmente para alunos com necessidades de acessibilidade. 
                        Possui ${alternativas} alternativas por questão e recursos visuais otimizados.
                    </span>
                </div>
            </div>
            ` : ''}
            
            ${provaCancelada ? `
            <div style="margin-top: 10px; padding: 8px; background: #fee2e2; border-radius: 6px; border: 1px solid #fecaca;">
                <div style="display: flex; align-items: center; gap: 5px; color: #dc2626;">
                    <i class="fas fa-exclamation-circle"></i>
                    <strong>Prova Cancelada</strong>
                </div>
                <div style="font-size: 0.85rem; margin-top: 5px; color: #7f1d1d;">
                    Clique em "Ver Detalhes" para mais informações
                </div>
            </div>
            ` : ''}
        </div>
        `;
    }).join('');
}

// ============ VERIFICAR E CANCELAR PROVAS EXPIRADAS ============
async function verificarECancelarProvasExpiradas() {
    try {
        const token = localStorage.getItem('auth_token');
        const userData = localStorage.getItem('user_data');
        
        if (!token || !userData) return;
        
        const usuario = JSON.parse(userData);
        if (usuario.role !== 'aluno') return;
        
        const notificacoesExibidas = JSON.parse(localStorage.getItem('notificacoesCancelamentoExibidas') || '{}');
        
        const response = await fetch(`${API_BASE_URL}/aluno/provas/pendentes`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        if (!data.success) return;
        
        const provasPendentes = data.provas || [];
        
        const agora = new Date();
        const ano = agora.getFullYear();
        const mes = String(agora.getMonth() + 1).padStart(2, '0');
        const dia = String(agora.getDate()).padStart(2, '0');
        
        let cancelouAlguma = false;
        
        for (const prova of provasPendentes) {
            if (prova.status === 'cancelada' || prova.status === 'finalizada') {
                console.log(`⏭️ Prova "${prova.titulo}" já está ${prova.status}`);
                continue;
            }
            
            if (prova.dataLimite) {
                const dataLimiteObj = new Date(prova.dataLimite);
                const dataLimiteFimDia = new Date(dataLimiteObj);
                dataLimiteFimDia.setHours(23, 59, 59, 999);
                
                if (agora > dataLimiteFimDia) {
                    console.log(`⚠️ Prova "${prova.titulo}" expirou (data limite)! Cancelando...`);
                    
                    const cancelResponse = await fetch(`${API_BASE_URL}/provas/${prova._id}/cancelar`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            motivo: 'Prazo de entrega expirado - Cancelamento automático',
                            estatisticas: {
                                dataExpiracao: dataLimiteObj.toISOString(),
                                dataCancelamento: agora.toISOString(),
                                motivo: 'prazo_expirado'
                            },
                            respostasAtuais: [],
                            tempoTotal: 0
                        })
                    });
                    
                    const cancelData = await cancelResponse.json();
                    
                    if (cancelData.success) {
                        cancelouAlguma = true;
                        console.log(`✅ Prova cancelada: ${cancelData.message}`);
                        
                        const chaveNotificacao = `notificacao_${prova._id}`;
                        if (!notificacoesExibidas[chaveNotificacao]) {
                            mostrarNotificacaoHorarioEncerrado(prova.titulo, 'data limite');
                            notificacoesExibidas[chaveNotificacao] = new Date().toLocaleString('pt-BR');
                            localStorage.setItem('notificacoesCancelamentoExibidas', JSON.stringify(notificacoesExibidas));
                        }
                    }
                    
                    continue;
                }
            }
            
            if (prova.horarioInicio && prova.horarioTermino) {
                const terminoProva = new Date(`${ano}-${mes}-${dia}T${prova.horarioTermino}:00`);
                
                if (agora > terminoProva) {
                    console.log(`🚫 Prova "${prova.titulo}" - horário encerrado às ${prova.horarioTermino}`);
                    
                    const cancelResponse = await fetch(`${API_BASE_URL}/provas/${prova._id}/cancelar`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            motivo: `Horário da prova encerrado às ${prova.horarioTermino}`,
                            estatisticas: {
                                horarioTermino: prova.horarioTermino,
                                dataCancelamento: agora.toISOString(),
                                motivo: 'horario_encerrado'
                            },
                            respostasAtuais: [],
                            tempoTotal: 0
                        })
                    });
                    
                    const cancelData = await cancelResponse.json();
                    
                    if (cancelData.success) {
                        cancelouAlguma = true;
                        console.log(`✅ Prova cancelada (horário): ${cancelData.message}`);
                        
                        const chaveNotificacao = `notificacao_${prova._id}`;
                        if (!notificacoesExibidas[chaveNotificacao]) {
                            mostrarNotificacaoHorarioEncerrado(prova.titulo, prova.horarioTermino);
                            notificacoesExibidas[chaveNotificacao] = new Date().toLocaleString('pt-BR');
                            localStorage.setItem('notificacoesCancelamentoExibidas', JSON.stringify(notificacoesExibidas));
                        }
                    }
                }
            }
        }
        
        if (cancelouAlguma) {
            console.log('🔄 Recarregando listas após cancelamentos...');
            await carregarProvasPendentes();
            await carregarProvasConcluidas();
        }
        
    } catch (error) {
        console.error('Erro ao verificar provas expiradas:', error);
    }
}

// ============ FUNÇÃO PARA LIMPAR REGISTROS ANTIGOS ============
function limparRegistrosCancelamentoAntigos() {
    const notificacoes = JSON.parse(localStorage.getItem('notificacoesCancelamentoExibidas') || '{}');
    const umMesAtras = new Date();
    umMesAtras.setMonth(umMesAtras.getMonth() - 1);
    
    let mudou = false;
    
    Object.keys(notificacoes).forEach(chave => {
        const dataStr = notificacoes[chave];
        const data = new Date(dataStr.split(' ')[0].split('/').reverse().join('-'));
        
        if (!isNaN(data.getTime()) && data < umMesAtras) {
            delete notificacoes[chave];
            mudou = true;
        }
    });
    
    if (mudou) {
        localStorage.setItem('notificacoesCancelamentoExibidas', JSON.stringify(notificacoes));
        console.log('🧹 Registros antigos de cancelamento limpos');
    }
}

// ============ NOTIFICAÇÃO DE HORÁRIO ENCERRADO ============
function mostrarNotificacaoHorarioEncerrado(tituloProva, horarioTermino) {
    const notificacao = document.createElement('div');
    notificacao.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: linear-gradient(135deg, #f59e0b, #d97706);
        color: white;
        padding: 15px 25px;
        border-radius: 12px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 15px;
        animation: slideInRight 0.3s ease;
        max-width: 400px;
        border-left: 4px solid #fff;
    `;
    
    notificacao.innerHTML = `
        <div style="background: rgba(255,255,255,0.2); width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
            <i class="fas fa-clock" style="font-size: 1.2rem;"></i>
        </div>
        <div style="flex: 1;">
            <strong style="font-size: 1rem; display: block; margin-bottom: 5px;">⏰ Horário Encerrado</strong>
            <p style="margin: 0; font-size: 0.9rem; opacity: 0.9;">
                A prova "${tituloProva.length > 50 ? tituloProva.substring(0, 47) + '...' : tituloProva}" 
                foi cancelada porque o horário terminou às ${horarioTermino}.
            </p>
        </div>
        <button onclick="this.parentElement.remove()" style="background: none; border: none; color: white; font-size: 1.2rem; cursor: pointer; opacity: 0.7;">&times;</button>
    `;
    
    document.body.appendChild(notificacao);
    
    setTimeout(() => {
        if (notificacao.parentNode) {
            notificacao.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => notificacao.remove(), 300);
        }
    }, 8000);
}

// Função para ver detalhes completos do cancelamento
async function verDetalhesCancelamento(provaId) {
    try {
        const token = localStorage.getItem('auth_token');
        
        const response = await fetch(`${API_BASE_URL}/aluno/provas/${provaId}/resultado`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        
        if (data.success) {
            console.log('📊 Dados completos recebidos:', data);
            
            const isViolacao = detectarTipoCancelamento(data);
            let motivoExibicao = data.motivoCancelamento || 'Prova cancelada';
            
            if (isViolacao) {
                motivoExibicao = data.motivoCancelamento || 'Prova cancelada por violação das regras';
            } else {
                motivoExibicao = data.motivoCancelamento || 'Prazo de entrega expirado';
            }
            
            const tituloCancelamento = isViolacao ? 
                'CANCELADA - VIOLAÇÃO DAS REGRAS' : 
                'CANCELADA - PRAZO EXPIRADO';
            
            const corPrincipal = isViolacao ? '#dc2626' : '#ef4444';
            const corFundo = isViolacao ? '#fee2e2' : '#fef3c7';
            const corTexto = isViolacao ? '#7f1d1d' : '#991b1b';
            
            let estatisticasHtml = '';
            if (data.estatisticasCancelamento) {
                const stats = data.estatisticasCancelamento;
                estatisticasHtml = `
                    <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid ${corPrincipal}40;">
                        <h5 style="color: ${corTexto}; margin-bottom: 10px;">
                            <i class="fas fa-chart-bar"></i> DETALHES DO MONITORAMENTO
                        </h5>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px;">
                            ${stats.avisos ? `
                            <div style="text-align: center; background: rgba(255,255,255,0.7); padding: 10px; border-radius: 6px; border: 1px solid ${corPrincipal}30;">
                                <div style="font-size: 1.5rem; font-weight: bold; color: ${corPrincipal}">
                                    ${stats.avisos}
                                </div>
                                <div style="font-size: 0.8rem; color: ${corTexto}">Avisos Recebidos</div>
                            </div>
                            ` : ''}
                            
                            ${stats.tentativasAtalho !== undefined ? `
                            <div style="text-align: center; background: rgba(255,255,255,0.7); padding: 10px; border-radius: 6px; border: 1px solid ${corPrincipal}30;">
                                <div style="font-size: 1.5rem; font-weight: bold; color: ${corPrincipal}">
                                    ${stats.tentativasAtalho}
                                </div>
                                <div style="font-size: 0.8rem; color: ${corTexto}">Tentativas de Atalho</div>
                            </div>
                            ` : ''}
                            
                            ${stats.capturasTela !== undefined ? `
                            <div style="text-align: center; background: rgba(255,255,255,0.7); padding: 10px; border-radius: 6px; border: 1px solid ${corPrincipal}30;">
                                <div style="font-size: 1.5rem; font-weight: bold; color: ${corPrincipal}">
                                    ${stats.capturasTela}
                                </div>
                                <div style="font-size: 0.8rem; color: ${corTexto}">Capturas de Tela</div>
                            </div>
                            ` : ''}
                            
                            ${stats.tempoFora !== undefined ? `
                            <div style="text-align: center; background: rgba(255,255,255,0.7); padding: 10px; border-radius: 6px; border: 1px solid ${corPrincipal}30;">
                                <div style="font-size: 1.5rem; font-weight: bold; color: ${corPrincipal}">
                                    ${stats.tempoFora}s
                                </div>
                                <div style="font-size: 0.8rem; color: ${corTexto}">Tempo Fora da Página</div>
                            </div>
                            ` : ''}
                            
                            ${stats.timestamp ? `
                            <div style="text-align: center; background: rgba(255,255,255,0.7); padding: 10px; border-radius: 6px; border: 1px solid ${corPrincipal}30;">
                                <div style="font-size: 1rem; font-weight: bold; color: ${corPrincipal}">
                                    ${new Date(stats.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <div style="font-size: 0.8rem; color: ${corTexto}">Horário</div>
                            </div>
                            ` : ''}
                        </div>
                        
                        ${isViolacao ? `
                        <div style="margin-top: 15px; padding: 10px; background: rgba(220, 38, 38, 0.1); border-radius: 6px; border-left: 3px solid #dc2626;">
                            <div style="display: flex; align-items: center; gap: 8px; color: #dc2626; margin-bottom: 5px;">
                                <i class="fas fa-exclamation-triangle"></i>
                                <strong>ATENÇÃO: VIOLAÇÃO DETECTADA</strong>
                            </div>
                            <div style="font-size: 0.85rem; color: #7f1d1d;">
                                Esta prova foi cancelada automaticamente pelo sistema de monitoramento por violação das regras estabelecidas.
                            </div>
                        </div>
                        ` : ''}
                    </div>
                `;
            }
            
            const modalHTML = `
                <div class="modal" id="modalDetalhesCancelamento" style="display: flex;">
                    <div class="modal-content" style="max-width: 700px;">
                        <div class="modal-header">
                            <h3 style="color: ${corPrincipal};">
                                <i class="fas fa-ban"></i> 
                                Detalhes do Cancelamento
                            </h3>
                            <button class="modal-close" onclick="fecharModal('modalDetalhesCancelamento')">&times;</button>
                        </div>
                        
                        <div style="padding: 20px;">
                            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid ${corPrincipal};">
                                <h4 style="margin-top: 0; color: #374151; display: flex; align-items: center; gap: 10px;">
                                    <i class="fas fa-file-alt"></i>
                                    ${data.prova?.titulo || 'Prova Cancelada'}
                                </h4>
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
                                    <div>
                                        <p style="color: #6b7280; margin: 5px 0; font-size: 0.9rem;">
                                            <strong>Conteúdo:</strong> ${data.prova?.conteudo || 'Não especificado'}
                                        </p>
                                        ${data.prova?.turma ? `
                                        <p style="color: #6b7280; margin: 5px 0; font-size: 0.9rem;">
                                            <strong>Turma:</strong> ${data.prova.turma.nome || data.prova.turma.disciplina}
                                        </p>
                                        ` : ''}
                                    </div>
                                    <div>
                                        <p style="color: #6b7280; margin: 5px 0; font-size: 0.9rem;">
                                            <strong>Data do Cancelamento:</strong><br>
                                            ${new Date(data.dataEntrega || Date.now()).toLocaleDateString('pt-BR')} 
                                            ${new Date(data.dataEntrega || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            
                            <div style="background: ${corFundo}; padding: 20px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid ${corPrincipal};">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                                    <h4 style="color: ${corPrincipal}; margin: 0; display: flex; align-items: center; gap: 10px;">
                                        <i class="fas fa-exclamation-triangle"></i>
                                        ${tituloCancelamento}
                                    </h4>
                                    <div style="font-size: 2rem; font-weight: bold; color: ${corPrincipal}">0.0</div>
                                </div>
                                
                                <div style="margin-top: 15px;">
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                                        <div>
                                            <p style="color: ${corTexto}; margin: 10px 0; font-size: 0.9rem;">
                                                <strong><i class="fas fa-exclamation-circle"></i> Motivo:</strong><br>
                                                ${motivoExibicao}
                                            </p>
                                        </div>
                                        <div>
                                            <p style="color: ${corTexto}; margin: 10px 0; font-size: 0.9rem;">
                                                <strong><i class="fas fa-user"></i> Aluno:</strong><br>
                                                ${data.alunoNome || 'Não informado'}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    ${data.professorEmail ? `
                                    <div style="margin-top: 15px; padding: 10px; background: rgba(255,255,255,0.5); border-radius: 6px;">
                                        <p style="color: ${corTexto}; margin: 5px 0; font-size: 0.9rem;">
                                            <strong><i class="fas fa-chalkboard-teacher"></i> Professor Notificado:</strong><br>
                                            ${data.professorEmail}
                                        </p>
                                    </div>
                                    ` : ''}
                                </div>
                                
                                ${estatisticasHtml}
                            </div>
                            
                            <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                                <h5 style="color: #374151; margin-top: 0; display: flex; align-items: center; gap: 8px;">
                                    <i class="fas fa-info-circle"></i> Informações Importantes
                                </h5>
                                <ul style="color: #6b7280; margin: 10px 0; padding-left: 20px; font-size: 0.9rem;">
                                    <li>Esta prova foi cancelada automaticamente pelo sistema</li>
                                    <li>A nota atribuída é <strong>0.0 (zero)</strong></li>
                                    <li>O professor responsável foi notificado sobre este cancelamento</li>
                                    ${isViolacao ? 
                                        '<li><strong>Violou as regras estabelecidas:</strong> A realização da prova requer atenção e cumprimento das normas</li>' : 
                                        '<li><strong>Prazo expirado:</strong> O tempo limite para realização da prova foi excedido</li>'
                                    }
                                    <li>Em caso de dúvidas, entre em contato com o professor da disciplina</li>
                                </ul>
                            </div>
                            
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; background: #f8fafc; border-radius: 8px; border: 1px solid #e5e7eb;">
                                <div>
                                    <div style="font-size: 0.9rem; color: #6b7280;">Status Final</div>
                                    <div style="font-size: 1.1rem; font-weight: bold; color: ${corPrincipal}">
                                        ${tituloCancelamento}
                                    </div>
                                </div>
                                <div style="text-align: right;">
                                    <div style="font-size: 0.9rem; color: #6b7280;">Nota Atribuída</div>
                                    <div style="font-size: 2rem; font-weight: bold; color: ${corPrincipal}">0.0</div>
                                </div>
                            </div>
                        </div>
                        
                        <button class="btn-sair-prova" style="width: 100%; margin-top: 20px;" 
                                onclick="fecharModal('modalDetalhesCancelamento')">
                            <i class="fas fa-times"></i> Fechar
                        </button>
                    </div>
                </div>
            `;
            
            const modalContainer = document.createElement('div');
            modalContainer.innerHTML = modalHTML;
            document.body.appendChild(modalContainer.firstElementChild);
            
        } else {
            throw new Error(data.error || 'Não foi possível carregar os detalhes');
        }
        
    } catch (error) {
        console.error('Erro ao buscar detalhes:', error);
        mostrarMensagemAluno('Não foi possível carregar os detalhes do cancelamento.', 'info');
    }
}

// ============ FUNÇÃO PARA VERIFICAR PROVAS CANCELADAS NÃO NOTIFICADAS ============
async function verificarProvasCanceladasNaoNotificadas() {
    try {
        const token = localStorage.getItem('auth_token');
        const userData = localStorage.getItem('user_data');
        
        if (!token || !userData) return;
        
        const usuario = JSON.parse(userData);
        if (usuario.role !== 'aluno') return;
        
        console.log('🔍 Verificando provas canceladas não notificadas...');
        
        const notificacoesExibidas = JSON.parse(localStorage.getItem('notificacoesCancelamentoExibidas') || '{}');
        
        const response = await fetch(`${API_BASE_URL}/aluno/provas`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await response.json();
        if (!data.success) return;
        
        const todasProvas = data.provas || [];
        const provasCanceladas = todasProvas.filter(p => 
            p.cancelada === true || 
            p.status === 'cancelada' || 
            p.motivoCancelamento
        );
        
        console.log(`📊 Encontradas ${provasCanceladas.length} provas canceladas`);
        
        let notificouAlguma = false;
        
        for (const prova of provasCanceladas) {
            const chaveNotificacao = `notificacao_${prova._id}`;
            
            if (notificacoesExibidas[chaveNotificacao]) {
                continue;
            }
            
            let motivo = 'prazo expirado';
            let horarioExibicao = 'data limite';
            
            if (prova.motivoCancelamento) {
                const motivoLower = prova.motivoCancelamento.toLowerCase();
                if (motivoLower.includes('horário') || motivoLower.includes('horario')) {
                    motivo = 'horário encerrado';
                    horarioExibicao = prova.horarioTermino || 'horário limite';
                }
            }
            
            console.log(`🔔 Primeira visualização da prova cancelada: "${prova.titulo}"`);
            
            mostrarNotificacaoHorarioEncerrado(prova.titulo, horarioExibicao);
            
            notificacoesExibidas[chaveNotificacao] = new Date().toLocaleString('pt-BR');
            localStorage.setItem('notificacoesCancelamentoExibidas', JSON.stringify(notificacoesExibidas));
            
            notificouAlguma = true;
        }
        
        if (notificouAlguma) {
            console.log('✅ Notificações de provas canceladas exibidas com sucesso!');
        }
        
    } catch (error) {
        console.error('❌ Erro ao verificar provas canceladas:', error);
    }
}

// Adicionar verificação periódica de provas expiradas
function iniciarVerificacaoPeriodica() {
    console.log('🔄 Iniciando verificações periódicas (data limite + horário)...');
    
    setInterval(() => {
        console.log('⏱️ Executando verificação de expiração...');
        verificarECancelarProvasExpiradas();
    }, 30000);
    
    setTimeout(() => {
        verificarECancelarProvasExpiradas();
    }, 3000);
    
    setInterval(() => {
        console.log('⏱️ Verificando provas canceladas não notificadas...');
        verificarProvasCanceladasNaoNotificadas();
    }, 300000);
}

// ============ ADICIONAR ANIMAÇÕES (se não existirem) ============
if (!document.querySelector('#animacoesNotificacoes')) {
    const animacoesStyle = document.createElement('style');
    animacoesStyle.id = 'animacoesNotificacoes';
    animacoesStyle.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOutRight {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
    `;
    document.head.appendChild(animacoesStyle);
}

function verificarDatasProvasPendentes() {
    const hoje = new Date();
    
    provasPendentes.forEach(prova => {
        if (prova.dataLimite) {
            const dataLimite = new Date(prova.dataLimite);
            
            const dataLimiteFimDia = new Date(dataLimite);
            dataLimiteFimDia.setHours(23, 59, 59, 999);
            
            const diffMs = dataLimiteFimDia - hoje;
            const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            
            console.log(`📅 Verificação: ${prova.titulo}`);
            console.log(`   Hoje: ${hoje.toISOString()}`);
            console.log(`   Limite original: ${dataLimite.toISOString()}`);
            console.log(`   Limite fim do dia: ${dataLimiteFimDia.toISOString()}`);
            console.log(`   Diferença em dias: ${diffDias}`);
            
            if (diffDias < 0) {
                console.log(`⚠️ Prova "${prova.titulo}" expirou (data limite: ${dataLimite.toLocaleDateString('pt-BR')})`);
            }
        }
    });
}

setInterval(verificarDatasProvasPendentes, 60000);

// ============ CARREGAR TURMAS DO ALUNO ============
async function carregarTurmasAluno() {
    try {
        const token = localStorage.getItem('auth_token');
        
        console.log('%c🏫 CARREGANDO TURMAS DO ALUNO', 'font-weight:bold; color:green;');
        
        const alunoResponse = await fetch(`${API_BASE_URL}/aluno/curso-completo`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        let eixoDoAluno = null;
        if (alunoResponse.ok) {
            const alunoData = await alunoResponse.json();
            if (alunoData.success && alunoData.eixo) {
                eixoDoAluno = alunoData.eixo.nome;
                console.log(`🎯 Eixo do aluno (para turmas): ${eixoDoAluno}`);
            }
        }
        
        const response = await fetch(`${API_BASE_URL}/turmas`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success) {
            turmas = data.turmas || [];
            
            console.log(`📊 Total de turmas: ${turmas.length}`);
            
            window.turmasBackup = [...turmas];
            
            await inicializarFiltroTurmas(eixoDoAluno);
            
            const contadorSpan = document.getElementById('contadorTurmasNumerico');
            if (contadorSpan) {
                contadorSpan.innerText = turmas.length;
            }
            
            renderizarTurmas(turmas);
        } else {
            throw new Error(data.error || 'Erro ao carregar turmas');
        }
    } catch (error) {
        console.error('❌ Erro ao carregar turmas:', error);
        document.getElementById('turmasAluno').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Erro ao carregar turmas</h3>
                <p>${error.message}</p>
                <button onclick="carregarTurmasAluno()" style="
                    margin-top: 15px;
                    padding: 8px 20px;
                    background: #4f46e5;
                    color: white;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                ">
                    <i class="fas fa-sync-alt"></i> Tentar novamente
                </button>
            </div>
        `;
    }
}

// ========== RENDERIZAR TURMAS COM CORES DO EIXO ==========
function renderizarTurmas(turmasParaRenderizar) {
    const container = document.getElementById('turmasAluno');
    
    if (turmasParaRenderizar.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <h3>Nenhuma turma encontrada</h3>
                <p>Não há turmas com o filtro selecionado</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = turmasParaRenderizar.map(turma => {
        const cor = turma.eixoInfo?.cor || '#4f46e5';
        const icone = turma.eixoInfo?.icone ? `fa-${turma.eixoInfo.icone}` : 'fa-school';
        
        const professorNome = turma.professor?.nome || 'Professor não informado';
        
        const eixoDisplay = turma.eixo ? `<span style="font-size:0.7rem; color:${cor}; margin-left:5px;">(${turma.eixo})</span>` : '';
        
        return `
            <div class="turma-card" style="border-left-color: ${cor};">
                <div class="turma-info">
                    <div>
                        <h4 style="margin: 0 0 5px 0; display: flex; align-items: center; gap: 8px;">
                            <i class="fas ${icone}" style="color: ${cor};"></i>
                            ${turma.nome}
                            ${eixoDisplay}
                        </h4>
                        <p style="margin: 0; color: #6b7280; font-size: 0.9rem; display: flex; flex-wrap: wrap; gap: 10px;">
                            <span><i class="fas fa-book" style="color: ${cor};"></i> ${turma.disciplina || 'Disciplina não especificada'}</span>
                            <span><i class="fas fa-chalkboard-teacher" style="color: ${cor};"></i> ${professorNome}</span>
                            <span><i class="fas fa-users" style="color: ${cor};"></i> ${turma.totalAlunos || 0} alunos</span>
                        </p>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <button onclick="verDetalhesTurma('${turma.id}')" 
                                style="
                                    background: none;
                                    border: 1px solid ${cor}40;
                                    color: ${cor};
                                    padding: 6px 12px;
                                    border-radius: 20px;
                                    font-size: 0.8rem;
                                    cursor: pointer;
                                    display: flex;
                                    align-items: center;
                                    gap: 4px;
                                ">
                            <i class="fas fa-info-circle"></i> Detalhes
                        </button>
                        <div class="turma-codigo" style="background: ${cor}20; color: ${cor};">${turma.codigo}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Atualizar lista de turmas
function atualizarListaTurmas() {
    const container = document.getElementById('turmasAluno');
    
    if (!turmas || turmas.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users-slash"></i>
                <h3>Nenhuma turma</h3>
                <p>Entre em uma turma usando o código</p>
            </div>
        `;
        return;
    }
    
    window.turmasBackup = [...turmas];
    
    const contadorSpan = document.getElementById('contadorTurmasNumerico');
    if (contadorSpan) {
        contadorSpan.innerText = turmas.length;
    }
    
    aplicarFiltroTurmas();
}

// Entrar em uma turma
async function entrarNaTurma() {
    const codigo = document.getElementById('codigoTurma').value.trim().toUpperCase();
    
    if (!codigo) {
        mostrarMensagemAluno('Digite o código da turma', 'info');
        return;
    }
    
    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${API_BASE_URL}/turmas/entrar`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ codigo })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarMensagemAluno('✅ Entrou na turma com sucesso!', 'info');
            fecharModal('modalEntrarTurma');
            document.getElementById('codigoTurma').value = '';
            await carregarTurmasAluno();
            await carregarProvasPendentes();
        } else {
            mostrarMensagemAluno('❌ Erro: ' + data.error, 'info');
        }
    } catch (error) {
        console.error('Erro ao entrar na turma:', error);
        mostrarMensagemAluno('❌ Erro de conexão', 'info');
    }
}

// ========== FUNÇÃO PARA OBTER EIXO TÉCNICO PELO CURSO ==========
function getEixoTecnicoPorCurso(curso) {
    if (!curso) return null;
    
    const cursoLower = curso.toLowerCase();
    
    if (cursoLower.includes('eventos') || cursoLower.includes('turismo') || cursoLower.includes('gastronomia') || cursoLower.includes('guia')) {
        return 'turismo';
    } else if (cursoLower.includes('redes')) {
        return 'redes';
    } else if (cursoLower.includes('desenvolvimento') || cursoLower.includes('sistemas')) {
        return 'desenvolvimento';
    } else if (cursoLower.includes('marketing') || cursoLower.includes('jurídico') || cursoLower.includes('juridico') || cursoLower.includes('serviços')) {
        return 'gestao';
    } else if (cursoLower.includes('áudio') || cursoLower.includes('audio') || cursoLower.includes('vídeo') || cursoLower.includes('video') || cursoLower.includes('publicidade') || cursoLower.includes('produção')) {
        return 'producao';
    } else if (cursoLower.includes('meio ambiente') || cursoLower.includes('ambiente') || cursoLower.includes('saúde')) {
        return 'ambiente';
    }
    
    return null;
}

// ========== INICIALIZAR FILTRO DE TURMAS ==========
async function inicializarFiltroTurmas(eixoDoAluno) {
    const filtroSelect = document.getElementById('filtroEixoTurmas');
    if (!filtroSelect) return;
    
    try {
        console.log(`🔧 Configurando filtro de turmas com eixo: ${eixoDoAluno}`);
        
        const novoSelect = filtroSelect.cloneNode(true);
        filtroSelect.parentNode.replaceChild(novoSelect, filtroSelect);
        
        novoSelect.innerHTML = '';
        
        const optionTodos = document.createElement('option');
        optionTodos.value = 'todos';
        optionTodos.textContent = 'Todas as disciplinas';
        novoSelect.appendChild(optionTodos);
        
        const eixosBNCC = [
            { nome: 'natureza', label: '🔬 Natureza e Matemática' },
            { nome: 'humanas', label: '🏛️ Humanas' },
            { nome: 'linguagens', label: '🎭 Linguagens' }
        ];
        
        eixosBNCC.forEach(eixo => {
            const optionEixo = document.createElement('option');
            optionEixo.value = eixo.nome;
            optionEixo.textContent = eixo.label;
            optionEixo.style.fontWeight = '600';
            novoSelect.appendChild(optionEixo);
        });
        
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '──────────';
        novoSelect.appendChild(separator);
        
        if (eixoDoAluno) {
            if (!eixosBNCC.some(e => e.nome === eixoDoAluno)) {
                const optionEixoAluno = document.createElement('option');
                optionEixoAluno.value = eixoDoAluno;
                
                const labels = {
                    'desenvolvimento': '💻 Desenvolvimento de Sistemas',
                    'redes': '🌐 Redes de Computadores',
                    'turismo': '✈️ Turismo, Eventos e Gastronomia',
                    'gestao': '📊 Gestão e Negócios',
                    'producao': '🎬 Produção Cultural e Design',
                    'ambiente': '🌱 Ambiente e Saúde'
                };
                
                optionEixoAluno.textContent = labels[eixoDoAluno] || 'Eixo Técnico';
                optionEixoAluno.style.fontWeight = '600';
                optionEixoAluno.style.backgroundColor = '#f0f9ff';
                novoSelect.appendChild(optionEixoAluno);
                
                console.log(`✅ Eixo técnico adicionado ao filtro de turmas: ${eixoDoAluno}`);
            }
        } else {
            console.log('⚠️ Nenhum eixo técnico encontrado para o aluno');
        }
        
        novoSelect.addEventListener('change', function() {
            aplicarFiltroTurmas(this.value);
        });
        
        console.log('✅ Filtro de turmas configurado com sucesso');
        
    } catch (error) {
        console.error('❌ Erro ao configurar filtro de turmas:', error);
        
        const filtroSelect = document.getElementById('filtroEixoTurmas');
        if (filtroSelect) {
            const novoSelect = filtroSelect.cloneNode(true);
            filtroSelect.parentNode.replaceChild(novoSelect, filtroSelect);
            
            novoSelect.innerHTML = `
                <option value="todos">Todas as disciplinas</option>
                <option value="natureza">🔬 Natureza e Matemática</option>
                <option value="humanas">🏛️ Humanas</option>
                <option value="linguagens">🎭 Linguagens</option>
            `;
            
            novoSelect.addEventListener('change', function() {
                aplicarFiltroTurmas(this.value);
            });
        }
    }
}

// ========== APLICAR FILTRO NAS TURMAS USANDO EIXO DO BANCO ==========
function aplicarFiltroTurmas(eixoSelecionado) {
    const container = document.getElementById('turmasAluno');
    
    if (!container || !window.turmasBackup) return;
    
    console.log(`🔍 Aplicando filtro de turmas: ${eixoSelecionado}`);
    console.log('📦 Turmas disponíveis:', window.turmasBackup.map(t => ({
        nome: t.nome,
        eixo: t.eixo,
        isDoEixoDoAluno: t.isDoEixoDoAluno
    })));
    
    let turmasFiltradas = window.turmasBackup;
    
    if (eixoSelecionado && eixoSelecionado !== 'todos') {
        turmasFiltradas = window.turmasBackup.filter(turma => {
            if (!turma.eixo) return false;
            
            return turma.eixo === eixoSelecionado;
        });
        
        console.log(`📊 Após filtro: ${turmasFiltradas.length} turmas`);
    }
    
    const contadorSpan = document.getElementById('contadorTurmasNumerico');
    if (contadorSpan) {
        contadorSpan.innerText = turmasFiltradas.length;
    }
    
    renderizarTurmas(turmasFiltradas);
}

// ========== FUNÇÃO PARA VER DETALHES DA TURMA ==========
function verDetalhesTurma(turmaId) {
    const turma = turmas.find(t => t._id === turmaId || t.id === turmaId);
    
    if (!turma) {
        mostrarMensagemAluno('Turma não encontrada', 'info');
        return;
    }
    
    console.log('📋 Detalhes da turma:', turma);
    
    let dataCriacao = 'Não informada';
    
    if (turma.createdAt) {
        dataCriacao = new Date(turma.createdAt).toLocaleDateString('pt-BR');
    } else if (turma.criadoEm) {
        dataCriacao = new Date(turma.criadoEm).toLocaleDateString('pt-BR');
    } else if (turma.dataCriacao) {
        dataCriacao = new Date(turma.dataCriacao).toLocaleDateString('pt-BR');
    } else if (turma.created_at) {
        dataCriacao = new Date(turma.created_at).toLocaleDateString('pt-BR');
    } else if (turma.criado_em) {
        dataCriacao = new Date(turma.criado_em).toLocaleDateString('pt-BR');
    } else if (turma.dataCadastro) {
        dataCriacao = new Date(turma.dataCadastro).toLocaleDateString('pt-BR');
    }
    
    if (dataCriacao === 'Não informada' && turma._id && turma._id.length === 24) {
        try {
            const timestamp = parseInt(turma._id.substring(0, 8), 16) * 1000;
            if (!isNaN(timestamp)) {
                dataCriacao = new Date(timestamp).toLocaleDateString('pt-BR');
                console.log('📅 Data extraída do ObjectId:', dataCriacao);
            }
        } catch (e) {
            console.log('Não foi possível extrair data do ObjectId');
        }
    }
    
    const professor = turma.professor?.nome || 
                    turma.professorNome || 
                    turma.professor?.name || 
                    turma.nomeProfessor || 
                    'Não informado';
    
    const emailProfessor = turma.professor?.email || 
                        turma.professorEmail || 
                        turma.emailProfessor || '';
    
    let corTurma = '#4f46e5';
    let iconeTurma = 'fa-school';
    
    if (turma.disciplina) {
        const disciplina = turma.disciplina.toLowerCase();
        
        if (disciplina.includes('evento') || disciplina.includes('turismo') || disciplina.includes('gastronomia')) {
            corTurma = '#f59e0b';
            iconeTurma = 'fa-utensils';
        } else if (disciplina.includes('redes')) {
            corTurma = '#0ea5e9';
            iconeTurma = 'fa-network-wired';
        } else if (disciplina.includes('desenvolvimento') || disciplina.includes('programação')) {
            corTurma = '#8b5cf6';
            iconeTurma = 'fa-code';
        } else if (disciplina.includes('marketing') || disciplina.includes('gestão')) {
            corTurma = '#10b981';
            iconeTurma = 'fa-chart-line';
        } else if (disciplina.includes('áudio') || disciplina.includes('vídeo') || disciplina.includes('publicidade')) {
            corTurma = '#ec4899';
            iconeTurma = 'fa-video';
        }
    }
    
    const content = `
        <div style="text-align: center; margin-bottom: 20px;">
            <div style="
                width: 80px;
                height: 80px;
                background: ${corTurma}20;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 15px;
                border: 3px solid ${corTurma};
            ">
                <i class="fas ${iconeTurma}" style="font-size: 40px; color: ${corTurma};"></i>
            </div>
            <h2 style="margin: 0; color: #1f2937;">${turma.nome}</h2>
            <p style="color: ${corTurma}; font-weight: 500; margin: 5px 0 0 0;">
                <i class="fas fa-tag"></i> Código: ${turma.codigo}
            </p>
        </div>
        
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
            <div style="background: #f9fafb; padding: 15px; border-radius: 8px; border-left: 3px solid ${corTurma};">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; color: ${corTurma};">
                    <i class="fas fa-chalkboard-teacher"></i>
                    <strong>Professor</strong>
                </div>
                <p style="margin: 0; color: #374151;">${professor}</p>
                ${emailProfessor ? `<p style="margin: 5px 0 0 0; color: #6b7280; font-size: 0.85rem;">${emailProfessor}</p>` : ''}
            </div>
            
            <div style="background: #f9fafb; padding: 15px; border-radius: 8px; border-left: 3px solid ${corTurma};">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; color: ${corTurma};">
                    <i class="fas fa-calendar-alt"></i>
                    <strong>Criação</strong>
                </div>
                <p style="margin: 0; color: #374151; display: flex; align-items: center; gap: 5px;">
                    <i class="far fa-calendar-check" style="color: ${corTurma};"></i>
                    ${dataCriacao}
                </p>
                <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 0.8rem;">
                    ID: ${turma._id || turma.id || 'N/A'}
                </p>
            </div>
        </div>
        
        <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; color: ${corTurma};">
                <i class="fas fa-info-circle"></i>
                <strong>Informações da Turma</strong>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-top: 15px;">
                <div style="text-align: center;">
                    <div style="font-size: 1.8rem; font-weight: bold; color: ${corTurma};">${turma.totalAlunos || turma.quantidadeAlunos || turma.alunosCount || 0}</div>
                    <div style="font-size: 0.85rem; color: #6b7280;">Alunos</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 1.8rem; font-weight: bold; color: ${corTurma};">${turma.totalProvas || turma.quantidadeProvas || turma.provasCount || 0}</div>
                    <div style="font-size: 0.85rem; color: #6b7280;">Provas</div>
                </div>
                <div style="text-align: center;">
                    <div style="font-size: 1.8rem; font-weight: bold; color: ${corTurma};">${turma.disciplina ? '1' : '0'}</div>
                    <div style="font-size: 0.85rem; color: #6b7280;">Disciplinas</div>
                </div>
            </div>
        </div>
        
        ${turma.descricao ? `
        <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; color: ${corTurma};">
                <i class="fas fa-align-left"></i>
                <strong>Descrição</strong>
            </div>
            <p style="margin: 0; color: #4b5563; line-height: 1.6;">${turma.descricao}</p>
        </div>
        ` : ''}
        
        <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; border-left: 3px solid #0ea5e9;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; color: #0ea5e9;">
                <i class="fas fa-lightbulb"></i>
                <strong>Estatísticas da Turma</strong>
            </div>
            <ul style="margin: 0; padding-left: 20px; color: #0369a1;">
                <li>Média geral da turma: <strong>${turma.mediaGeral ? turma.mediaGeral.toFixed(1) : '--'}</strong></li>
                <li>Taxa de conclusão: <strong>${turma.taxaConclusao ? turma.taxaConclusao + '%' : '--'}</strong></li>
                <li>Próxima prova: <strong>${turma.proximaProva ? new Date(turma.proximaProva).toLocaleDateString('pt-BR') : 'Não agendada'}</strong></li>
            </ul>
        </div>
    `;
    
    document.getElementById('detalhesTurmaContent').innerHTML = content;
    mostrarModal('modalDetalhesTurma');
}

// ============ FUNÇÃO CORRIGIDA - selecionarProva ============
async function selecionarProva(provaId) {
    console.log('🎯 selecionarProva chamada com ID:', provaId);
    
    if (typeof provasPendentes === 'undefined') {
        console.error('❌ provasPendentes não está definida!');
        mostrarMensagemAluno('Erro: Lista de provas não carregada. Tente recarregar a página.', 'info');
        return;
    }
    
    provaSelecionada = provasPendentes.find(p => p._id === provaId || p.id === provaId);
    
    if (!provaSelecionada) {
        console.error('❌ Prova não encontrada. IDs disponíveis:', provasPendentes.map(p => p._id || p.id));
        mostrarMensagemAluno('Prova não encontrada', 'info');
        return;
    }
    
    console.log('✅ Prova encontrada:', provaSelecionada.titulo);
    console.log('   horarioInicio:', provaSelecionada.horarioInicio);
    console.log('   horarioTermino:', provaSelecionada.horarioTermino);
    
    try {
        const token = localStorage.getItem('auth_token');
        console.log('🔄 Buscando dados completos da prova...');
        
        const response = await fetch(`${API_BASE_URL}/provas/${provaId}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.success && data.prova) {
                const index = provasPendentes.findIndex(p => p._id === provaId || p.id === provaId);
                if (index !== -1) {
                    provasPendentes[index] = {
                        ...provasPendentes[index],
                        ...data.prova,
                        horarioInicio: data.prova.horarioInicio || provasPendentes[index].horarioInicio,
                        horarioTermino: data.prova.horarioTermino || provasPendentes[index].horarioTermino,
                        duracaoMinutos: data.prova.duracaoMinutos || provasPendentes[index].duracaoMinutos,
                        duracaoFormatada: data.prova.duracaoFormatada || provasPendentes[index].duracaoFormatada,
                        periodo: data.prova.periodo || provasPendentes[index].periodo || '1'
                    };
                    
                    provaSelecionada = provasPendentes[index];
                    
                    console.log('✅ Dados atualizados:', {
                        inicio: provaSelecionada.horarioInicio,
                        termino: provaSelecionada.horarioTermino,
                        periodo: provaSelecionada.periodo
                    });
                }
            }
        }
    } catch (error) {
        console.log('⚠️ Não foi possível buscar horários:', error.message);
    }
    
    if (provaSelecionada.horarioInicio && provaSelecionada.horarioTermino) {
        const agora = new Date();
        
        const ano = agora.getFullYear();
        const mes = String(agora.getMonth() + 1).padStart(2, '0');
        const dia = String(agora.getDate()).padStart(2, '0');
        
        const inicioProva = new Date(`${ano}-${mes}-${dia}T${provaSelecionada.horarioInicio}:00`);
        const terminoProva = new Date(`${ano}-${mes}-${dia}T${provaSelecionada.horarioTermino}:00`);
        
        console.log('📅 Verificando horário:');
        console.log('   Agora:', agora.toLocaleString('pt-BR'));
        console.log('   Início:', inicioProva.toLocaleString('pt-BR'));
        console.log('   Término:', terminoProva.toLocaleString('pt-BR'));
        
        if (agora < inicioProva) {
            const minutosRestantes = Math.floor((inicioProva - agora) / (1000 * 60));
            let mensagem = `Esta prova só estará disponível a partir das ${provaSelecionada.horarioInicio}`;
            
            if (minutosRestantes > 0) {
                if (minutosRestantes > 60) {
                    const horas = Math.floor(minutosRestantes / 60);
                    mensagem += ` (em ${horas} hora${horas > 1 ? 's' : ''})`;
                } else {
                    mensagem += ` (em ${minutosRestantes} minuto${minutosRestantes > 1 ? 's' : ''})`;
                }
            }
            
            mostrarMensagemAluno(mensagem, 'info');
            return;
        }
        
        if (agora > terminoProva) {
            mostrarMensagemAluno(`⏰ O horário para esta prova terminou às ${provaSelecionada.horarioTermino}`, 'info');
            return;
        }
        
        console.log('✅ Prova disponível! Pode iniciar.');
    }
    
    const hoje = new Date();
    const dataLimiteObj = provaSelecionada.dataLimite ? new Date(provaSelecionada.dataLimite) : null;
    
    if (dataLimiteObj && hoje > dataLimiteObj) {
        mostrarMensagemAluno('⚠️ Esta prova já passou do prazo de entrega. Você não pode mais realizá-la.', 'info');
        return;
    }
    
    const dataLimite = provaSelecionada.dataLimite ? 
        new Date(provaSelecionada.dataLimite).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        }) : 'Sem data limite';
    
    let mostrarMensagemAlunoaData = '';
    if (dataLimiteObj) {
        const hojeSemHora = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
        const dataLimiteSemHora = new Date(dataLimiteObj.getFullYear(), dataLimiteObj.getMonth(), dataLimiteObj.getDate());
        const diffMs = dataLimiteSemHora - hojeSemHora;
        const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDias === 0) {
            mostrarMensagemAlunoaData = `<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 10px; margin: 10px 0; border-radius: 4px;">
                <strong><i class="fas fa-exclamation-triangle"></i> ATENÇÃO:</strong> A data limite é <strong>HOJE!</strong>
            </div>`;
        }
    }
    
    const modalContent = `
        <h4>${provaSelecionada.titulo || 'Prova sem título'}</h4>
        ${mostrarMensagemAlunoaData}
        
        <div style="display: flex; justify-content: center; margin-bottom: 15px;">
            <span style="
                background: ${provaSelecionada.periodo === '1' ? '#10b98120' : 
                            provaSelecionada.periodo === '2' ? '#f59e0b20' : 
                            provaSelecionada.periodo === '3' ? '#8b5cf620' : 
                            provaSelecionada.periodo === '4' ? '#ef444420' : '#6b728020'};
                color: ${provaSelecionada.periodo === '1' ? '#10b981' : 
                        provaSelecionada.periodo === '2' ? '#f59e0b' : 
                        provaSelecionada.periodo === '3' ? '#8b5cf6' : 
                        provaSelecionada.periodo === '4' ? '#ef4444' : '#6b7280'};
                padding: 6px 20px;
                border-radius: 30px;
                font-size: 0.9rem;
                font-weight: 600;
                display: inline-flex;
                align-items: center;
                gap: 8px;
                border: 1px solid ${provaSelecionada.periodo === '1' ? '#10b98140' : 
                                    provaSelecionada.periodo === '2' ? '#f59e0b40' : 
                                    provaSelecionada.periodo === '3' ? '#8b5cf640' : 
                                    provaSelecionada.periodo === '4' ? '#ef444440' : '#6b728040'};
            ">
                <i class="fas fa-calendar-week"></i>
                ${provaSelecionada.periodo ? provaSelecionada.periodo + 'º Período' : '1º Período'}
            </span>
        </div>
        
        ${provaSelecionada.horarioInicio && provaSelecionada.horarioTermino ? `
            <div style="background: linear-gradient(135deg, #f0f9ff, #e0f2fe); padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #bae6fd;">
                <p style="margin: 0 0 10px 0; color: #0369a1; font-weight: bold; display: flex; align-items: center; gap: 8px;">
                    <i class="far fa-clock"></i> 
                    Horário da Prova
                </p>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                    <div style="text-align: center;">
                        <div style="font-size: 0.85rem; color: #6b7280; margin-bottom: 5px;">Início</div>
                        <div style="font-size: 1.2rem; font-weight: bold; color: #10b981;">
                            ${provaSelecionada.horarioInicio}
                        </div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.85rem; color: #6b7280; margin-bottom: 5px;">Término</div>
                        <div style="font-size: 1.2rem; font-weight: bold; color: #ef4444;">
                            ${provaSelecionada.horarioTermino}
                        </div>
                    </div>
                </div>
                <div style="text-align: center; margin-top: 10px;">
                    <div style="font-size: 0.85rem; color: #6b7280; margin-bottom: 5px;">Duração Total</div>
                    <div style="font-size: 1.3rem; font-weight: bold; color: #4f46e5;">
                        ${provaSelecionada.duracaoFormatada || (provaSelecionada.duracaoMinutos ? provaSelecionada.duracaoMinutos + ' minutos' : '60 minutos')}
                    </div>
                </div>
            </div>
        ` : `
            <div style="background: linear-gradient(135deg, #fef3c7, #fde68a); padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #fbbf24;">
                <p style="margin: 0 0 10px 0; color: #92400e; font-weight: bold; display: flex; align-items: center; gap: 8px;">
                    <i class="far fa-clock"></i> 
                    Horário da Prova
                </p>
                <div style="text-align: center; padding: 10px;">
                    <div style="font-size: 1.1rem; font-weight: bold; color: #92400e;">
                        ⏰ Horário Flexível
                    </div>
                    <p style="color: #92400e; margin: 10px 0 0 0; font-size: 0.95rem;">
                        Esta prova pode ser realizada a qualquer momento até a data limite.
                    </p>
                </div>
            </div>
        `}
        
        <p><strong>Conteúdo:</strong> ${provaSelecionada.conteudo || 'Não especificado'}</p>
        
        <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 15px 0;">
            <p><i class="fas fa-info-circle"></i> <strong>Informações da Prova:</strong></p>
            <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                <li><strong>Quantidade de questões:</strong> ${provaSelecionada.quantidadeQuestoes || '?'}</li>
                <li><strong>Turma:</strong> ${provaSelecionada.turma?.nome || provaSelecionada.turma?.disciplina || 'Não especificada'}</li>
                <li><strong>Professor:</strong> ${provaSelecionada.professor?.nome || provaSelecionada.professor || 'Não especificado'}</li>
                <li><strong>Data limite:</strong> ${dataLimite}</li>
                ${provaSelecionada.dificuldade ? `<li><strong>Dificuldade:</strong> ${provaSelecionada.dificuldade === 'facil' ? 'Fácil' : provaSelecionada.dificuldade === 'media' ? 'Média' : 'Difícil'}</li>` : ''}
                <li><strong><i class="fas fa-calendar-week"></i> Período:</strong> 
                    ${provaSelecionada.periodo ? provaSelecionada.periodo + 'º Período' : '1º Período'}
                </li>
            </ul>
        </div>
        
        <p><i class="fas fa-exclamation-triangle"></i> <strong>Atenção:</strong></p>
        <ul style="margin: 10px 0 0 0; padding-left: 20px; color: #6b7280;">
            <li>A prova começará assim que você clicar em "Iniciar Prova"</li>
            <li>O tempo será contado a partir do horário de início da prova</li>
            <li>Não recarregue a página durante a prova</li>
            <li>Após finalizar, não será possível retornar</li>
            <li>Certifique-se que a localização esteja habilitada para validar o acesso</li>
            ${mostrarMensagemAlunoaData ? '<li><strong>Esta prova precisa ser entregue HOJE!</strong></li>' : ''}
            ${provaSelecionada.horarioInicio ? 
                `<li><strong>Horário específico:</strong> Esta prova só pode ser realizada das <strong>${provaSelecionada.horarioInicio}</strong> às <strong>${provaSelecionada.horarioTermino}</strong> (${provaSelecionada.duracaoFormatada || provaSelecionada.duracaoMinutos + ' minutos'})</li>` : 
                ''}
        </ul>
    `;
    
    const modal = document.getElementById('modalIniciarProva');
    if (modal) {
        document.getElementById('modalProvaInfo').innerHTML = modalContent;
        mostrarModal('modalIniciarProva');
    } else {
        console.error('❌ Modal não encontrado');
    }
}

// Função para iniciar prova selecionada (chamada pelo modal)
function iniciarProvaSelecionada() {
    if (!provaSelecionada) {
        mostrarMensagemAluno('Nenhuma prova selecionada', 'info');
        return;
    }
    
    console.log('🔄 Iniciando prova selecionada:', provaSelecionada._id);
    
    fecharModal('modalIniciarProva');
    
    iniciarProva(provaSelecionada._id);
}

// ============ FUNÇÃO PARA INICIAR PROVA ============
async function iniciarProva(provaId) {
    console.log('🚀 Iniciando prova com ID:', provaId);
    
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            mostrarMensagemAluno('Você precisa estar logado para acessar a prova', 'info');
            window.location.href = '/login.html';
            return;
        }
        
        const userData = localStorage.getItem('user_data');
        if (!userData) {
            mostrarMensagemAluno('Dados do usuário não encontrados', 'info');
            window.location.href = '/login.html';
            return;
        }
        
        const usuario = JSON.parse(userData);
        if (usuario.role !== 'aluno') {
            mostrarMensagemAluno('Apenas alunos podem acessar provas', 'info');
            window.location.href = usuario.role === 'professor' ? '/index.html' : '/login.html';
            return;
        }
        
        mostrarLoading('Preparando acesso à prova...');
        
        const acessoResponse = await fetch(`${API_BASE_URL}/provas/${provaId}/acesso`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        const acessoData = await acessoResponse.json();
        
        if (!acessoResponse.ok || !acessoData.success) {
            throw new Error(acessoData.error || 'Erro ao acessar a prova');
        }
        
        if (!acessoData.provaToken) {
            throw new Error('Token de acesso não gerado');
        }
        
        const exigeFaceId = acessoData.exigirFaceId === true;
        console.log('🔐 API exige Face ID para esta prova?', exigeFaceId ? 'SIM ✅' : 'NÃO ❌');
        
        if (exigeFaceId) {
            console.log('🔍 Verificando Face ID do aluno...');
            
            const faceResponse = await fetch(`/api/auth/verificar-face/${usuario.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            const faceData = await faceResponse.json();
            esconderLoading();
            
            if (!faceData.success) {
                console.error('❌ Erro ao verificar face:', faceData.error);
                mostrarMensagemAluno('Erro ao verificar cadastro facial. Tente novamente.', 'info');
                return;
            }
            
            if (!faceData.temFace) {
                console.log('⚠️ Usuário sem Face ID cadastrada');
                const confirmar = await confirm('📸 Esta prova exige validação facial. Você precisa cadastrar sua Face ID antes de acessar. Deseja cadastrar agora?');
                if (confirmar) {
                    window.location.href = '/capturar-face.html';
                }
                return;
            }
            
            console.log('✅ Face ID encontrada! Redirecionando para validação facial...');
            
            localStorage.setItem('provaToken_temp', acessoData.provaToken);
            localStorage.setItem('provaId_temp', provaId);
            if (acessoData.prova) {
                localStorage.setItem('provaData_temp', JSON.stringify(acessoData.prova));
            }
            
            window.location.href = `/validar-face-prova.html?provaId=${provaId}`;
            return;
        }
        
        console.log('✅ Face ID NÃO exigido - Redirecionando direto para a prova');
        
        localStorage.setItem('provaToken', acessoData.provaToken);
        localStorage.setItem('provaAtual', provaId);
        if (acessoData.prova) {
            localStorage.setItem('provaData', JSON.stringify(acessoData.prova));
        }
        
        esconderLoading();
        window.location.href = `/realizar-prova.html?token=${acessoData.provaToken}`;
        
    } catch (error) {
        console.error('❌ Erro ao iniciar prova:', error);
        esconderLoading();
        
        localStorage.removeItem('provaToken_temp');
        localStorage.removeItem('provaData_temp');
        localStorage.removeItem('provaId_temp');
        
        let mensagem = 'Erro ao acessar a prova. ';
        
        if (error.message.includes('401') || error.message.includes('token')) {
            mensagem += 'Sua sessão expirou. Faça login novamente.';
            localStorage.clear();
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 2000);
        } else if (error.message.includes('403')) {
            mensagem += 'Você não tem permissão para acessar esta prova.';
        } else if (error.message.includes('404')) {
            mensagem += 'Prova não encontrada.';
        } else if (error.message.includes('já realizou')) {
            mensagem += 'Você já completou esta prova.';
        } else if (error.message.includes('data limite')) {
            mensagem += 'O prazo para esta prova já expirou.';
        } else {
            mensagem += error.message || 'Tente novamente.';
        }
        
        mostrarMensagemAluno(mensagem, 'info');
    }
}

// Adicionar esta função no início do código
function verificarAutenticacao() {
    const token = localStorage.getItem('auth_token');
    const userData = localStorage.getItem('user_data');
    
    if (!token || !userData) {
        window.location.href = '/login.html';
        return false;
    }
    
    try {
        const user = JSON.parse(userData);
        if (user.role !== 'aluno') {
            window.location.href = user.role === 'professor' ? '/index.html' : '/login.html';
            return false;
        }
        return true;
    } catch (e) {
        window.location.href = '/login.html';
        return false;
    }
}

// Modificar o carregarDadosAluno para usar verificação
async function carregarDadosAluno() {
    if (!verificarAutenticacao()) {
        return;
    }
    
    try {
        const token = localStorage.getItem('auth_token');
        const userData = localStorage.getItem('user_data');
        
        if (userData) {
            usuario = JSON.parse(userData);
            atualizarInfoAluno(usuario);
        }
        
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = '/login.html';
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            usuario = data.user;
            localStorage.setItem('user_data', JSON.stringify(usuario));
            atualizarInfoAluno(usuario);
            
            await carregarProvasPendentes();
            await carregarTurmasAluno();
        } else {
            throw new Error(data.error || 'Erro ao carregar dados');
        }
        
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        mostrarErro('Erro ao carregar dados. Tente recarregar a página.');
    }
}

function atualizarInfoAluno(user) {
    document.getElementById('alunoDetails').innerHTML = `
        <p><strong>${user.nome}</strong></p>
        <p>${user.curso ? user.curso + ' | ' : ''}${user.matricula || 'Sem matrícula'}</p>
        <p>${user.email}</p>
    `;
}

// Ver resultado da prova
function verResultado(provaId) {
    console.log('🔍 Prova ID recebido:', provaId);
    
    if (!provaId || provaId === 'undefined' || provaId === 'null') {
        mostrarMensagemAluno('Erro: ID da prova não encontrado. Tente recarregar a página.', 'info');
        return;
    }
    
    if (provaId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(provaId)) {
        console.error('❌ ID da prova inválido:', provaId);
        mostrarMensagemAluno('ID da prova inválido. Contate o administrador.', 'info');
        return;
    }
    
    const token = localStorage.getItem('auth_token');
    
    fetch(`${API_BASE_URL}/aluno/provas/${provaId}/resultado`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (data.status === 'corrigida' && data.nota !== null) {
                window.location.href = `resultado-aluno.html?provaId=${provaId}`;
            } else if (data.status === 'pendente') {
                mostrarMensagemAluno('⌛ Sua prova ainda está sendo corrigida pelo professor. Você receberá uma notificação quando a correção estiver disponível.', 'info');
            } else {
                mostrarMensagemAluno('ℹ️ ' + (data.mensagem || 'Status da prova não disponível.'));
            }
        } else {
            mostrarMensagemAluno('❌ ' + data.error, 'info');
        }
    })
    .catch(error => {
        console.error('Erro ao verificar status:', error);
        mostrarMensagemAluno('Erro ao verificar status da prova. Tente novamente.', 'info');
    });
}

// Função para verificar atualizações de status periodicamente
function verificarAtualizacoesStatus() {
    if (!usuario || usuario.role !== 'aluno') return;
    
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    
    setInterval(() => {
        fetch(`${API_BASE_URL}/aluno/provas`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                const provasAtualizadas = data.provas || [];
                const temNovaCorrecao = provasAtualizadas.some(p => 
                    (p.status === 'concluida' && p.nota !== null) || 
                    p.status === 'concluida'
                );
                
                if (temNovaCorrecao) {
                    console.log('🔄 Nova correção disponível, atualizando lista...');
                    carregarProvasConcluidas();
                    
                    if (!document.hidden) {
                        console.log('📬 Nova correção disponível!');
                    }
                }
            }
        })
        .catch(error => console.error('Erro ao verificar atualizações:', error));
    }, 30000);
}

// Logout
function logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_data');
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('user_data');
    window.location.href = 'login.html';
}

// Mostrar erro
function mostrarErro(mensagem) {
    const mostrarMensagemAlunoa = document.createElement('div');
    mostrarMensagemAlunoa.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ef4444;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    `;
    mostrarMensagemAlunoa.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${mensagem}`;
    document.body.appendChild(mostrarMensagemAlunoa);
    
    setTimeout(() => {
        mostrarMensagemAlunoa.remove();
    }, 5000);
}

// Funções de loading
function mostrarLoading(mensagem) {
    let loadingDiv = document.getElementById('loading-overlay');
    
    if (!loadingDiv) {
        loadingDiv = document.createElement('div');
        loadingDiv.id = 'loading-overlay';
        loadingDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 9999;
            color: white;
            font-size: 18px;
        `;
        document.body.appendChild(loadingDiv);
    }
    
    loadingDiv.innerHTML = `
        <div style="text-align: center; background: white; padding: 30px; border-radius: 10px; color: #333;">
            <div style="border: 4px solid #f3f3f3; border-top: 4px solid #3498db; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 10px;"></div>
            <h3 style="margin: 10px 0;">${mensagem}</h3>
        </div>
    `;
    
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);
    
    loadingDiv.style.display = 'flex';
}

function esconderLoading() {
    const loadingDiv = document.getElementById('loading-overlay');
    if (loadingDiv) {
        loadingDiv.style.display = 'none';
    }
}

async function carregarFotoPerfilAluno() {
    try {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        
        console.log('🔍 Buscando foto de perfil do aluno...');
        
        const response = await fetch('/api/perfil/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) {
            console.error('❌ Erro ao buscar perfil:', response.status);
            return;
        }
        
        const data = await response.json();
        
        if (data.success && data.perfil) {
            const imgElement = document.getElementById('alunoFotoPerfil');
            const placeholderIcon = document.getElementById('alunoFotoPlaceholder');
            
            if (imgElement && placeholderIcon) {
                if (data.perfil.fotoPerfil && data.perfil.fotoPerfil.startsWith('data:image')) {
                    imgElement.src = data.perfil.fotoPerfil;
                    imgElement.style.display = 'block';
                    placeholderIcon.style.display = 'none';
                    console.log('✅ Foto de perfil carregada com sucesso!');
                } else {
                    imgElement.style.display = 'none';
                    placeholderIcon.style.display = 'flex';
                    console.log('📸 Nenhuma foto cadastrada, usando ícone padrão');
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Erro ao carregar foto:', error);
    }
}

// Atualizar foto quando voltar da página de edição
window.addEventListener('pageshow', function(event) {
    if (event.persisted || (document.referrer && document.referrer.includes('editar-perfil'))) {
        console.log('🔄 Página restaurada, recarregando foto...');
        setTimeout(() => {
            carregarFotoPerfilAluno();
        }, 300);
    }
});

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('btnEntrarTurma').addEventListener('click', () => {
        mostrarModal('modalEntrarTurma');
    });
    
    document.getElementById('btnLogout').addEventListener('click', logout);
    
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    });

    const filtroStatus = document.getElementById('filtroStatusProvas');
    if (filtroStatus) {
        filtroStatus.addEventListener('change', function() {
            const backup = JSON.parse(localStorage.getItem('backupProvasConcluidas') || '[]');
            aplicarFiltroEStatus(backup);
        });
    }
    
    const filtroPeriodo = document.getElementById('filtroPeriodoProvas');
    if (filtroPeriodo) {
        filtroPeriodo.addEventListener('change', function() {
            const backup = JSON.parse(localStorage.getItem('backupProvasConcluidas') || '[]');
            aplicarFiltroEStatus(backup);
        });
    }

    const filtroPeriodoProvas = document.getElementById('filtroPeriodoProvas');
    const filtroPeriodoHeader = document.getElementById('filtroPeriodoHeader');
    
    if (filtroPeriodoProvas) {
        filtroPeriodoProvas.addEventListener('change', function() {
            const backup = JSON.parse(localStorage.getItem('backupProvasConcluidas') || '[]');
            aplicarFiltroEStatus(backup);
        });
    }
    
    if (filtroPeriodoHeader) {
        filtroPeriodoHeader.addEventListener('change', function() {
            const filtroProvas = document.getElementById('filtroPeriodoProvas');
            if (filtroProvas) {
                filtroProvas.value = this.value;
                const backup = JSON.parse(localStorage.getItem('backupProvasConcluidas') || '[]');
                aplicarFiltroEStatus(backup);
            }
        });
    }

    carregarDadosAluno().then(() => {
        verificarAtualizacoesStatus();
        iniciarVerificacaoPeriodica();
        iniciarVerificacaoPeriodicaFace();
    });
    setTimeout(() => {
        carregarFotoPerfilAluno();
    }, 500);
});

// ============================================================================
// PATCH PARA CARREGAR HORÁRIOS EM BACKGROUND
// ============================================================================
(function() {
    console.log('🔄 Iniciando patch para carregar horários...');
    
    const originalCarregarProvasPendentes = window.carregarProvasPendentes;
    
    window.carregarProvasPendentes = async function() {
        console.log('📥 Carregando provas pendentes com patch de horários...');
        
        await originalCarregarProvasPendentes.apply(this, arguments);
        
        if (provasPendentes && provasPendentes.length > 0) {
            console.log(`🔍 Buscando horários para ${provasPendentes.length} provas...`);
            
            setTimeout(async () => {
                const token = localStorage.getItem('auth_token');
                if (!token) return;
                
                for (const prova of provasPendentes) {
                    if (!prova.horarioInicio && prova._id) {
                        try {
                            const response = await fetch(`${API_BASE_URL}/provas/${prova._id}`, {
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'Content-Type': 'application/json'
                                }
                            });
                            
                            if (response.ok) {
                                const data = await response.json();
                                if (data.success && data.prova && data.prova.horarioInicio) {
                                    prova.horarioInicio = data.prova.horarioInicio;
                                    prova.horarioTermino = data.prova.horarioTermino;
                                    prova.duracaoMinutos = data.prova.duracaoMinutos;
                                    prova.duracaoFormatada = data.prova.duracaoFormatada;
                                    
                                    console.log(`✅ Horários carregados para: ${prova.titulo.substring(0, 30)}...`);
                                }
                            }
                        } catch (error) {
                        }
                    }
                }
                
                if (document.getElementById('provasPendentes') && document.getElementById('provasPendentes').innerHTML.includes('prova-card')) {
                    console.log('🔄 Atualizando interface com horários...');
                    atualizarListaProvas('provasPendentes', provasPendentes, 'pendente');
                }
            }, 1500);
        }
    };
    
    console.log('✅ Patch para horários aplicado com sucesso!');
})();

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
            body: 'Você receberá mostrarMensagemAlunoas de provas, resultados e mensagens importantes',
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
                    Você não está recebendo mostrarMensagemAlunoas de provas e resultados
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