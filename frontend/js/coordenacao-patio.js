// ============================================
// 🏫 COORDENAÇÃO DE PÁTIO - MODO AUTOMÁTICO E MANUAL
// Frontend JS separado do HTML
// ============================================

let token = localStorage.getItem('auth_token');
let currentAluno = null;
let scannerAuto = null;
let scannerAutoAtivo = false;
let modoAtual = 'automatico';
let turmasDisponiveis = [];
let alunosPorTurma = [];

// ============================================
// 🛡️ PROTEÇÃO CONTRA alert() NATIVO (Kodular)
// ============================================
(function protegerContraAlertNativo() {
    let __emProgresso = false;
    
    window.mostrarToastPatio = function(mensagem) {
        if (__emProgresso) {
            console.log('[ALERT-RECURSÃO-EVITADA]', mensagem);
            return;
        }
        __emProgresso = true;
        
        try {
            const isWebView = /wv|WebView|Android.*Version\/[\d.]+.*Chrome/i.test(navigator.userAgent) ||
                            (typeof window.AppInventor !== 'undefined');
            
            // Se existe toast global, usa ele
            if (typeof window.mostrarToastPatio === 'function') {
                window.mostrarToastPatio(String(mensagem), 'info');
                return;
            }
            
            // Desktop: só log
            if (!isWebView) {
                console.log('%c[ALERT] ' + mensagem, 'background:#667eea;color:white;padding:4px 8px;border-radius:4px;');
                return;
            }
            
            // WebView sem toast: modal simples
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
                            style="width:100%;padding:12px;background:#667eea;color:white;
                                border:none;border-radius:10px;font-size:14px;
                                font-weight:600;cursor:pointer;">OK</button>
                </div>
            `;
            document.body.appendChild(modal);
        } finally {
            __emProgresso = false;
        }
    };
    
    console.log('🛡️ [Proteção] window.mostrarToastPatio sobrescrito (coordenação de pátio)');
})();

// ============================================
// 🍞 TOAST CUSTOMIZADO
// ============================================
function mostrarToastPatio(mensagem, tipo = 'info', duracao = 3500) {
    // Remove toast anterior
    const anterior = document.getElementById('toastPatio');
    if (anterior) anterior.remove();
    
    const cores = {
        success: { bg: '#10b981', icone: 'fa-check-circle' },
        error:   { bg: '#ef4444', icone: 'fa-exclamation-circle' },
        warning: { bg: '#f59e0b', icone: 'fa-exclamation-triangle' },
        info:    { bg: '#667eea', icone: 'fa-info-circle' }
    };
    
    const cor = cores[tipo] || cores.info;
    
    const toast = document.createElement('div');
    toast.id = 'toastPatio';
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%) translateY(-100px);
        background: ${cor.bg};
        color: white;
        padding: 14px 22px;
        border-radius: 10px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.2);
        z-index: 99999;
        display: flex;
        align-items: center;
        gap: 10px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        font-weight: 500;
        max-width: 90%;
        transition: transform 0.3s ease;
    `;
    
    const icone = document.createElement('i');
    icone.className = `fas ${cor.icone}`;
    icone.style.fontSize = '18px';
    
    const span = document.createElement('span');
    span.textContent = mensagem;
    
    toast.appendChild(icone);
    toast.appendChild(span);
    document.body.appendChild(toast);
    
    // Animação de entrada
    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(0)';
    }, 50);
    
    // Animação de saída
    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(-100px)';
        setTimeout(() => toast.remove(), 300);
    }, duracao);
}

// Expõe globalmente
window.mostrarToastPatio = mostrarToastPatio;

// ============================================
// 🎨 UTILITÁRIOS
// ============================================
function gerarAvatarSVG(nome) {
    const inicial = (nome || '?').charAt(0).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#667eea"/><stop offset="100%" stop-color="#764ba2"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/><text x="50" y="50" font-family="Arial,sans-serif" font-size="45" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${inicial}</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============================================
// 🚀 INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    if (!token) { window.location.href = '/login.html'; return; }
    
    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
    if (userData.role !== 'coordenacao_patio' && userData.role !== 'super_admin') {
        mostrarToastPatio('Acesso negado.');
        window.location.href = '/login.html';
        return;
    }
    
    document.getElementById('userName').textContent = userData.nome || 'Usuário';
    document.getElementById('dataAtual').textContent = new Date().toLocaleDateString('pt-BR');
    
    await carregarFotoPerfil();
    await carregarContadores();
    await carregarTurmasParaManual();
    
    iniciarScannerAutomatico();
    
    setInterval(carregarContadores, 30000);
    
    document.getElementById('modoAutomaticoBtn').addEventListener('click', () => setModo('automatico'));
    document.getElementById('modoManualBtn').addEventListener('click', () => setModo('manual'));
    
    document.getElementById('filtroTurmaManual').addEventListener('change', () => carregarAlunosPorTurma());
    document.getElementById('filtroBuscaManual').addEventListener('input', () => filtrarAlunosManual());
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
            const avatarDiv = document.getElementById('userAvatar');
            if (avatarDiv) {
                avatarDiv.innerHTML = `<img src="${data.perfil.fotoPerfil}" alt="Foto de perfil">`;
            }
        }
    } catch (error) {
        console.error('Erro ao carregar foto:', error);
    }
}

// ============================================
// 📷 SCANNER AUTOMÁTICO
// ============================================
async function iniciarScannerAutomatico() {
    const qrContainer = document.getElementById('qr-reader-auto');
    qrContainer.innerHTML = '<div id="qr-reader-auto-new" style="width: 100%;"></div>';
    
    scannerAuto = new Html5Qrcode("qr-reader-auto-new");
    
    const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
    
    try {
        await scannerAuto.start({ facingMode: "environment" }, config, onScanSuccessAuto, () => {});
        scannerAutoAtivo = true;
        console.log('✅ Scanner Automático iniciado');
    } catch (err) {
        console.error('Erro ao iniciar scanner automático:', err);
        qrContainer.innerHTML = `<div class="mostrarToastPatio mostrarToastPatio-warning m-3">Não foi possível acessar a câmera.</div>`;
        scannerAutoAtivo = false;
    }
}

async function pararScannerAutomatico() {
    if (scannerAuto && scannerAutoAtivo) {
        try {
            await scannerAuto.stop();
            scannerAutoAtivo = false;
            console.log('✅ Scanner Automático parado');
        } catch (e) {
            console.log('⚠️ Erro ao parar scanner automático:', e.message);
        }
    }
    scannerAuto = null;
}

async function onScanSuccessAuto(decodedText) {
    console.log('QR Code escaneado (Automático):', decodedText);
    
    let alunoId = null;
    if (decodedText.match(/^[a-f0-9]{24}$/i)) alunoId = decodedText;
    else if (decodedText.includes('aluno=')) {
        const match = decodedText.match(/[?&]aluno=([a-f0-9]{24})/i);
        if (match) alunoId = match[1];
    } else if (decodedText.includes('id=')) {
        const match = decodedText.match(/[?&]id=([a-f0-9]{24})/i);
        if (match) alunoId = match[1];
    }
    
    if (!alunoId) { 
        mostrarToastPatio('QR Code inválido'); 
        return; 
    }
    
    await pararScannerAutomatico();
    await buscarAluno(alunoId);
}

// ============================================
// 🔄 GERENCIAMENTO DE MODOS
// ============================================
async function setModo(modo) {
    modoAtual = modo;
    
    document.getElementById('alunoInfo').style.display = 'none';
    currentAluno = null;
    
    if (modo === 'automatico') {
        document.getElementById('modoAutomaticoBtn').classList.add('active');
        document.getElementById('modoManualBtn').classList.remove('active');
        document.getElementById('modoAutomatico').style.display = 'block';
        document.getElementById('modoManual').style.display = 'none';
        
        await iniciarScannerAutomatico();
    } else {
        document.getElementById('modoManualBtn').classList.add('active');
        document.getElementById('modoAutomaticoBtn').classList.remove('active');
        document.getElementById('modoAutomatico').style.display = 'none';
        document.getElementById('modoManual').style.display = 'block';
        
        await pararScannerAutomatico();
        
        const turmaSelecionada = document.getElementById('filtroTurmaManual').value;
        if (turmaSelecionada) {
            await carregarAlunosPorTurma();
        } else {
            document.getElementById('listaAlunosManual').innerHTML = '<div class="text-center py-3">Selecione uma turma para ver os alunos</div>';
        }
    }
}

// ============================================
// 👥 MODO MANUAL - TURMAS E ALUNOS
// ============================================
async function carregarTurmasParaManual() {
    try {
        const response = await fetch('/api/coordenacao-patio/alunos', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success && data.turmas) {
            turmasDisponiveis = data.turmas;
            const turmaSelect = document.getElementById('filtroTurmaManual');
            turmaSelect.innerHTML = '<option value="">Selecione uma turma...</option>';
            data.turmas.forEach(turma => {
                turmaSelect.innerHTML += `<option value="${escapeHTML(turma)}">${escapeHTML(turma)}</option>`;
            });
        }
    } catch (error) {
        console.error('Erro ao carregar turmas:', error);
    }
}

async function carregarAlunosPorTurma() {
    const turmaSelecionada = document.getElementById('filtroTurmaManual').value;
    
    if (!turmaSelecionada) {
        document.getElementById('listaAlunosManual').innerHTML = '<div class="text-center py-3">Selecione uma turma para ver os alunos</div>';
        return;
    }
    
    document.getElementById('listaAlunosManual').innerHTML = '<div class="text-center py-3"><div class="loading"></div><p>Carregando alunos...</p></div>';
    
    try {
        const response = await fetch(`/api/coordenacao-patio/alunos?turma=${encodeURIComponent(turmaSelecionada)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success && data.alunos) {
            alunosPorTurma = data.alunos;
            filtrarAlunosManual();
        } else {
            document.getElementById('listaAlunosManual').innerHTML = '<div class="mostrarToastPatio mostrarToastPatio-warning">Nenhum aluno encontrado nesta turma</div>';
        }
    } catch (error) {
        console.error('Erro:', error);
        document.getElementById('listaAlunosManual').innerHTML = '<div class="mostrarToastPatio mostrarToastPatio-danger">Erro ao carregar alunos</div>';
    }
}

function filtrarAlunosManual() {
    if (!Array.isArray(alunosPorTurma)) return;
    
    const busca = (document.getElementById('filtroBuscaManual').value || '').toLowerCase();
    
    let alunosFiltrados = alunosPorTurma;
    if (busca) {
        alunosFiltrados = alunosFiltrados.filter(a => (a.nome || '').toLowerCase().includes(busca));
    }
    
    alunosFiltrados.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
    
    const container = document.getElementById('listaAlunosManual');
    
    if (alunosFiltrados.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-3">Nenhum aluno encontrado</div>';
        return;
    }
    
    let html = '<div class="list-group">';
    alunosFiltrados.forEach(aluno => {
        html += `
            <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" 
                 data-aluno-id="${aluno.id}"
                 data-aluno-nome="${escapeHTML(aluno.nome)}"
                 style="cursor: pointer;">
                <div>
                    <strong>${escapeHTML(aluno.nome)}</strong>
                    <br>
                    <small class="text-muted">${escapeHTML(aluno.matricula || 'Sem matrícula')} • ${escapeHTML(aluno.curso || '')}</small>
                </div>
                <i class="fas fa-hand-pointer fa-2x text-primary"></i>
            </div>
        `;
    });
    html += '</div>';
    
    container.innerHTML = html;
    
    container.querySelectorAll('.list-group-item').forEach(item => {
        item.addEventListener('click', () => {
            const id = item.getAttribute('data-aluno-id');
            const nome = item.getAttribute('data-aluno-nome');
            selecionarAluno(id, nome, item);
        });
    });
}

async function selecionarAluno(alunoId, alunoNome, itemEl) {
    console.log(`🎯 Aluno selecionado: ${alunoNome} (${alunoId})`);
    
    if (itemEl) {
        itemEl.style.background = '#ede9fe';
        itemEl.style.borderColor = '#667eea';
        itemEl.style.pointerEvents = 'none';
        itemEl.innerHTML = `
            <div>
                <strong>${escapeHTML(alunoNome)}</strong>
                <br>
                <small style="color: #667eea;">Processando...</small>
            </div>
            <i class="fas fa-spinner fa-spin fa-2x" style="color: #667eea;"></i>
        `;
    }
    
    try {
        await buscarAluno(alunoId);
    } catch (error) {
        console.error('Erro ao processar aluno:', error);
    }
}

// ============================================
// 🔍 BUSCAR ALUNO
// ============================================
async function buscarAluno(alunoId) {
    try {
        await pararScannerAutomatico();
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(`/api/coordenacao-patio/aluno/${alunoId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        
        if (data.success) {
            currentAluno = data.aluno;
            exibirAluno(data);
            await registrarRefeicaoAutomatico();
        } else {
            mostrarToastPatio('Usuário não encontrado');
            if (modoAtual === 'automatico') {
                await iniciarScannerAutomatico();
            } else {
                await carregarAlunosPorTurma();
            }
        }
    } catch (error) {
        console.error('Erro:', error);
        
        if (error.name === 'AbortError') {
            mostrarToastPatio('Tempo esgotado ao buscar aluno. Tente novamente.');
        } else {
            mostrarToastPatio('Erro ao buscar usuário');
        }
        
        if (modoAtual === 'automatico') {
            await iniciarScannerAutomatico();
        } else {
            await carregarAlunosPorTurma();
        }
    }
}

// ============================================
// 👤 EXIBIR ALUNO
// ============================================
function exibirAluno(data) {
    const aluno = data.aluno;
    const horario = data.horario;
    
    const fotoEl = document.getElementById('alunoFoto');
    if (fotoEl) {
        fotoEl.onerror = null;
        fotoEl.src = aluno.fotoPerfil || gerarAvatarSVG(aluno.nome);
        fotoEl.onerror = function() {
            this.onerror = null;
            this.src = gerarAvatarSVG(aluno.nome);
        };
    }
    
    document.getElementById('alunoNome').textContent = aluno.nome;
    document.getElementById('alunoMatricula').textContent = aluno.matricula || 'Não informada';
    document.getElementById('alunoTurma').textContent = aluno.turma || 'Não informada';
    document.getElementById('alunoCurso').textContent = aluno.curso || 'Não informado';
    
    let classeCard = 'horario-card';
    if (horario.horarioPermitido) {
        classeCard = horario.tipoRefeicao === 'almoco' ? 'horario-card obrigatorio' : 'horario-card permitido';
    }
    
    document.getElementById('horarioInfo').innerHTML = `
        <div class="${classeCard}">
            <div class="d-flex align-items-center">
                <i class="fas ${horario.tipoRefeicao === 'manha' ? 'fa-sun' : horario.tipoRefeicao === 'almoco' ? 'fa-utensils' : 'fa-moon'} fa-2x me-3"></i>
                <div>
                    <strong>${horario.mensagem}</strong>
                    <br>
                    <small>${data.mensagemRefeicao || ''}</small>
                    <br>
                    <small>Refeições hoje: ${horario.refeicoesHoje} de ${horario.limiteDiario}</small>
                </div>
            </div>
        </div>
    `;
    
    const btn = document.getElementById('btnRegistrar');
    if (horario.podeRegistrar && !horario.jaComeu) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-check-circle me-2"></i> Registrar ${horario.tipoRefeicao === 'manha' ? 'LANCHE DA MANHÃ' : horario.tipoRefeicao === 'almoco' ? 'ALMOÇO' : 'LANCHE DA TARDE'}`;
    } else {
        btn.disabled = true;
        if (horario.jaComeu) {
            btn.innerHTML = `<i class="fas fa-check-circle me-2"></i> JÁ REGISTRADO HOJE`;
        } else {
            btn.innerHTML = `<i class="fas fa-times-circle me-2"></i> FORA DO HORÁRIO`;
        }
    }
    
    document.getElementById('alunoInfo').style.display = 'block';
    document.getElementById('alunoInfo').scrollIntoView({ behavior: 'smooth' });
}

// ============================================
// ✅ REGISTRAR REFEIÇÃO
// ============================================
async function registrarRefeicaoAutomatico() {
    if (!currentAluno) return;
    
    const hora = new Date().getHours();
    let tipoRefeicao = null;
    if (hora >= 8 && hora <= 10) tipoRefeicao = 'manha';
    else if (hora >= 11 && hora <= 13) tipoRefeicao = 'almoco';
    else if (hora >= 14 && hora <= 16) tipoRefeicao = 'tarde';
    
    if (!tipoRefeicao) {
        mostrarToastPatio('Fora do horário de refeição');
        if (modoAtual === 'automatico') {
            await iniciarScannerAutomatico();
        }
        return;
    }
    
    try {
        const response = await fetch('/api/coordenacao-patio/registrar-refeicao', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ alunoId: currentAluno.id, tipoRefeicao })
        });
        const data = await response.json();
        
        if (data.success) {
            mostrarToastPatio(`✅ ${data.message}`);
            document.getElementById('alunoInfo').style.display = 'none';
            currentAluno = null;
            
            await carregarContadores();
            
            if (modoAtual === 'automatico') {
                await iniciarScannerAutomatico();
            } else {
                await carregarAlunosPorTurma();
            }
        } else {
            if (data.rodizio && !data.rodizio.pode) {
                mostrarToastPatio(`❌ ${data.error}\n\n📋 Motivo: ${data.rodizio.mensagem}`);
                
                const horarioDiv = document.getElementById('horarioInfo');
                if (horarioDiv) {
                    horarioDiv.innerHTML = `
                        <div class="horario-card" style="background: #fee2e2; border-left-color: #dc2626;">
                            <div class="d-flex align-items-center">
                                <i class="fas fa-calendar-alt fa-2x me-3 text-danger"></i>
                                <div>
                                    <strong>❌ RODÍZIO BLOQUEIA O ALMOÇO</strong>
                                    <br>
                                    <small>${data.rodizio.mensagem}</small>
                                </div>
                            </div>
                        </div>
                    `;
                }
            } else {
                mostrarToastPatio(`❌ ${data.error}`);
            }
            
            if (modoAtual === 'automatico') {
                await iniciarScannerAutomatico();
            } else {
                await carregarAlunosPorTurma();
            }
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarToastPatio('Erro ao registrar');
        if (modoAtual === 'automatico') {
            await iniciarScannerAutomatico();
        } else {
            await carregarAlunosPorTurma();
        }
    }
}

async function registrarRefeicao() {
    await registrarRefeicaoAutomatico();
}

// ============================================
// 📊 CONTADORES
// ============================================
async function carregarContadores() {
    try {
        const response = await fetch('/api/coordenacao-patio/registros-hoje', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('contManha').textContent = data.contagem.manha || 0;
            document.getElementById('contAlmoco').textContent = data.contagem.almoco || 0;
            document.getElementById('contTarde').textContent = data.contagem.tarde || 0;
            document.getElementById('totalRefeicoes').textContent = data.contagem.total || 0;
            
            if (data.registros && data.registros.length > 0) {
                document.getElementById('ultimosRegistros').innerHTML = data.registros.slice(0, 10).map(r => `
                    <div class="list-group-item d-flex justify-content-between align-items-center">
                        <div><strong>${escapeHTML(r.alunoNome)}</strong><br><small>Turma: ${escapeHTML(r.alunoTurma)}</small></div>
                        <div><span class="badge-refeicao badge-${r.tipoRefeicao}">${r.tipoRefeicao === 'manha' ? '🌅 Manhã' : r.tipoRefeicao === 'almoco' ? '🍽️ Almoço' : '🌙 Tarde'}</span><br><small>${new Date(r.horario).toLocaleTimeString()}</small></div>
                    </div>
                `).join('');
            } else {
                document.getElementById('ultimosRegistros').innerHTML = '<div class="text-center text-muted py-3">Nenhum registro hoje</div>';
            }
        }
    } catch (error) {
        console.error('Erro ao carregar contadores:', error);
    }
}

// ============================================
// 🚪 LOGOUT
// ============================================
async function logout() {
    const confirmar = await confirm('Tem certeza que deseja sair do sistema?');
    if (confirmar) {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        window.location.href = '/login.html';
    }
}

// ============================================
// ⌨️ ATALHOS DE TECLADO
// ============================================
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (currentAluno) {
            document.getElementById('alunoInfo').style.display = 'none';
            currentAluno = null;
            if (modoAtual === 'automatico') {
                iniciarScannerAutomatico();
            }
        }
    }
});

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
        if (!isWebViewNotif()) { mostrarToastPatio(mensagem); return; }
        
        const modal = document.createElement('div');
        modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;
            z-index: 999999; padding: 20px; box-sizing: border-box;`;
        const icones = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        const cores = { success: '#10b981', error: '#dc2626', warning: '#f59e0b', info: '#667eea' };
        
        modal.innerHTML = `
            <div style="background: white; border-radius: 16px; padding: 25px; max-width: 380px; width: 100%;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center;">
                <div style="font-size: 48px; margin-bottom: 15px;">${icones[tipo] || 'ℹ️'}</div>
                <p style="margin: 0 0 20px; color: #374151; font-size: 15px; line-height: 1.5; white-space: pre-line;">
                    ${mensagem}</p>
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
                            <div class="modal-header" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white;">
                                <h5 class="modal-title"><i class="fas fa-question-circle"></i> Confirmação</h5>
                            </div>
                            <div class="modal-body" style="white-space: pre-line; font-size: 15px;">${escapeHTMLNotif(mensagem)}</div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" id="btnCancelarConfirmInternoNotif">
                                    <i class="fas fa-times"></i> Cancelar</button>
                                <button type="button" class="btn btn-danger" id="btnConfirmarConfirmInternoNotif">
                                    <i class="fas fa-check"></i> Confirmar</button>
                            </div>
                        </div>
                    </div>
                </div>`;
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            
            const modalEl = document.getElementById('confirmInternoModalNotif');
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
            
            const finalizar = (resultado) => {
                modal.hide();
                setTimeout(() => modalEl.remove(), 300);
                resolve(resultado);
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
            if (data.success) {
                __notificacoesCache = data.notificacoes || [];
            }
        } catch (error) {
            console.error('Erro ao carregar notificações:', error);
        }
    }

    function renderizarSino() {
        const lista = document.getElementById('notificacoesLista');
        if (!lista) return;
        
        if (__notificacoesCache.length === 0) {
            lista.innerHTML = `
                <div class="notificacoes-vazio">
                    <i class="fas fa-bell-slash"></i>
                    <p>Nenhuma notificação</p>
                </div>`;
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
                    <div class="notificacao-icone" style="background: ${notif.cor || '#667eea'};">
                        ${notif.icone || '📋'}
                    </div>
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
        if (dropdown.classList.contains('show')) {
            carregarTudo();
        }
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
                await carregarTudo();
                mostrarNotificacaoInterna('Notificações marcadas como lidas!', 'success');
            }
        } catch (error) {
            console.error('Erro ao marcar todas como lidas:', error);
        }
    }

    async function limparMinhasNotificacoes(event) {
        try {
            const token = localStorage.getItem('auth_token');
            const confirmacao = await confirmarInternoNotif('🗑️ Deseja excluir TODAS as suas notificações?\n\nEsta ação não pode ser desfeita.');
            if (!confirmacao) return;
            
            const response = await fetch('/api/notificacoes/limpar-minhas', {
                method: 'DELETE',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
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
window.registrarRefeicao = registrarRefeicao;
window.logout = logout;
window.selecionarAluno = selecionarAluno;
window.carregarAlunosPorTurma = carregarAlunosPorTurma;
window.filtrarAlunosManual = filtrarAlunosManual;
window.setModo = setModo;