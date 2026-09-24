// ============================================================
// VINCULAR DISPOSITIVO - JavaScript (Opção A + B)
// ============================================================
// Estratégia:
// 1. Tenta pegar playerId da URL (Opção A)
// 2. Se não tiver, tenta detectar via OneSignal (Opção B)
// 3. Se não tiver, tenta detectar via localStorage (Opção B)
// 4. Se não tiver, tenta ler via CustomWebView (Kodular)
// ============================================================

(function() {
    'use strict';
    
    // ============ CONFIGURAÇÃO ============
    const IS_LOCALHOST = window.location.hostname === 'localhost' || 
                        window.location.hostname === '127.0.0.1';
    const API_BASE = IS_LOCALHOST ? 'http://localhost:3000' : '';
    
    // ============ ESTADO ============
    let playerId = null;
    let estaVinculando = false;
    let tentativasDeteccao = 0;
    const MAX_TENTATIVAS = 15;
    
    // ============ ELEMENTOS ============
    const elementos = {
        icon: document.getElementById('icon'),
        titulo: document.getElementById('titulo'),
        subTitulo: document.getElementById('subTitulo'),
        playerIdBox: document.getElementById('playerIdBox'),
        status: document.getElementById('status'),
        btnVincular: document.getElementById('btnVincular'),
        btnCancelar: document.querySelector('.btn-secondary')
    };
    
    // ============ INICIALIZAÇÃO ============
    document.addEventListener('DOMContentLoaded', function() {
        console.log('🚀 Página de vínculo carregada');
        inicializar();
    });
    
    async function inicializar() {
        console.log('%c🎯 INICIALIZANDO VÍNCULO', 'background: #10b981; color: white; padding: 4px 8px;');
        
        // 1. OPÇÃO A: Tentar pegar playerId da URL
        const urlParams = new URLSearchParams(window.location.search);
        playerId = urlParams.get('playerId');
        
        if (playerId) {
            console.log('✅ [OPÇÃO A] PlayerId da URL:', playerId.substring(0, 30) + '...');
            elementos.playerIdBox.textContent = playerId.substring(0, 30) + '...';
            verificarRetornoDeLogin();
            return;
        }
        
        // 2. OPÇÃO B: Detectar automaticamente
        console.log('⚠️ PlayerId não veio na URL, iniciando detecção automática (Opção B)...');
        await detectarPlayerId();
    }
    
    // ============================================================
    // OPÇÃO B: DETECÇÃO AUTOMÁTICA DO PLAYER ID
    // ============================================================
    async function detectarPlayerId() {
        elementos.playerIdBox.textContent = '⏳ Detectando seu dispositivo...';
        elementos.status.className = 'status loading';
        elementos.status.innerHTML = '🔍 Detectando dispositivo automaticamente...';
        
        // Tentar detectar imediatamente
        const detectado = await tentarDetectar();
        
        if (detectado) {
            return;
        }
        
        // Se não conseguiu, tentar várias vezes
        console.log('🔄 Iniciando tentativas de detecção...');
        
        const intervalo = setInterval(async () => {
            tentativasDeteccao++;
            
            elementos.status.innerHTML = `🔍 Detectando dispositivo... (tentativa ${tentativasDeteccao}/${MAX_TENTATIVAS})`;
            console.log(`🔄 Tentativa ${tentativasDeteccao}/${MAX_TENTATIVAS}...`);
            
            const detectado = await tentarDetectar();
            
            if (detectado) {
                clearInterval(intervalo);
                return;
            }
            
            if (tentativasDeteccao >= MAX_TENTATIVAS) {
                clearInterval(intervalo);
                mostrarErroDeteccao();
            }
        }, 1000);
    }
    
    // Tentar detectar de várias fontes
    async function tentarDetectar() {
        // 1. Tentar via OneSignal SDK (Web)
        try {
            if (window.OneSignal && window.OneSignal.User && window.OneSignal.User.PushSubscription) {
                const osPlayerId = await window.OneSignal.User.PushSubscription.getId();
                
                if (osPlayerId) {
                    playerId = osPlayerId;
                    console.log('✅ [OPÇÃO B] PlayerId via OneSignal SDK:', playerId.substring(0, 30) + '...');
                    atualizarUIComPlayerId();
                    return true;
                }
            }
        } catch (e) {
            // Silenciar erro
        }
        
        // 2. Tentar via localStorage (salvo pelo Kodular/WebView)
        const playerIdLocalStorage = localStorage.getItem('onesignal_player_id');
        if (playerIdLocalStorage) {
            playerId = playerIdLocalStorage;
            console.log('✅ [OPÇÃO B] PlayerId via localStorage:', playerId.substring(0, 30) + '...');
            atualizarUIComPlayerId();
            return true;
        }
        
        // 3. Tentar via TinyDB (Kodular - se estiver salvo via WebView)
        const playerIdTinyDB = sessionStorage.getItem('onesignal_player_id');
        if (playerIdTinyDB) {
            playerId = playerIdTinyDB;
            console.log('✅ [OPÇÃO B] PlayerId via sessionStorage:', playerId.substring(0, 30) + '...');
            atualizarUIComPlayerId();
            return true;
        }
        
        return false;
    }
    
    function atualizarUIComPlayerId() {
        elementos.playerIdBox.textContent = playerId.substring(0, 30) + '...';
        elementos.status.className = 'status';
        elementos.status.innerHTML = '';
        
        console.log('✅ PlayerId definido:', playerId);
        console.log('👤 Verificando se o usuário está logado...');
        
        verificarRetornoDeLogin();
    }
    
    function mostrarErroDeteccao() {
        elementos.playerIdBox.textContent = '❌ Não foi possível detectar o dispositivo';
        elementos.btnVincular.disabled = true;
        elementos.icon.className = 'icon error';
        elementos.icon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
        elementos.titulo.textContent = 'Dispositivo não detectado';
        elementos.subTitulo.textContent = 'Abra esta página através da notificação push ou do aplicativo Kodular.';
        mostrarStatus(
            '❌ <strong>Não foi possível detectar seu dispositivo.</strong><br><br>' +
            'Por favor:<br>' +
            '1. Abra o <strong>aplicativo Kodular</strong><br>' +
            '2. Ou clique no <strong>link da notificação push</strong><br>' +
            '3. Ou permita notificações neste navegador',
            'error'
        );
    }
    
    // ============================================================
    // VERIFICAR RETORNO DE LOGIN
    // ============================================================
    function verificarRetornoDeLogin() {
        const token = localStorage.getItem('auth_token');
        const playerIdSalvo = sessionStorage.getItem('vincular_playerId');
        
        console.log('🔐 Token existe?', token ? 'SIM' : 'NÃO');
        
        // Se já está logado, vincular automaticamente
        if (token) {
            console.log('✅ Usuário já está logado, vinculando automaticamente...');
            
            // Se veio de um redirect de login, vincular imediatamente
            if (playerIdSalvo === playerId) {
                sessionStorage.removeItem('vincular_playerId');
            }
            
            setTimeout(() => {
                vincular();
            }, 500);
        } else {
            console.log('⚠️ Usuário NÃO está logado, aguardando clique...');
            // O botão "Confirmar Vínculo" vai redirecionar para login
        }
    }
    
    // ============================================================
    // FUNÇÃO PRINCIPAL DE VÍNCULO
    // ============================================================
    window.vincular = async function() {
        if (estaVinculando) {
            console.log('⏳ Já está vinculando...');
            return;
        }
        
        estaVinculando = true;
        
        try {
            // Verificar se tem playerId
            if (!playerId) {
                // Tentar detectar novamente
                const detectado = await tentarDetectar();
                if (!detectado) {
                    mostrarStatus('❌ Dispositivo não detectado. Tente novamente.', 'error');
                    estaVinculando = false;
                    return;
                }
            }
            
            // Verificar se está logado
            const token = localStorage.getItem('auth_token');
            
            if (!token) {
                return redirecionarParaLogin();
            }
            
            // Verificar token válido
            const tokenValido = await verificarToken(token);
            
            if (!tokenValido) {
                return redirecionarParaLogin();
            }
            
            // Fazer o vínculo
            await fazerVinculo(token);
            
        } catch (error) {
            console.error('❌ Erro no vínculo:', error);
            mostrarStatus('❌ Erro inesperado: ' + error.message, 'error');
            elementos.btnVincular.disabled = false;
            estaVinculando = false;
        }
    };
    
    async function verificarToken(token) {
        try {
            const response = await fetch(`${API_BASE}/api/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }
    
    function redirecionarParaLogin() {
        console.log('🔐 Redirecionando para login...');
        
        // Salva o playerId para recuperar depois
        if (playerId) {
            sessionStorage.setItem('vincular_playerId', playerId);
        }
        
        mostrarStatus(
            '🔐 Você precisa fazer login para vincular este dispositivo.<br><strong>Redirecionando...</strong>',
            'loading'
        );
        
        elementos.icon.className = 'icon loading';
        elementos.icon.innerHTML = '<i class="fas fa-user-lock"></i>';
        
        setTimeout(() => {
            window.location.href = '/login.html?redirect=vincular';
        }, 1500);
    }
    
    async function fazerVinculo(token) {
        console.log('🔄 Enviando vínculo para o backend...');
        
        mostrarStatus('🔄 Vinculando dispositivo...', 'loading');
        elementos.btnVincular.disabled = true;
        elementos.icon.className = 'icon loading';
        elementos.icon.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        try {
            const response = await fetch(`${API_BASE}/api/onesignal/vincular-por-link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playerId: playerId,
                    token: token
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                mostrarSucesso(data.usuario);
            } else {
                mostrarFalha(data.error);
            }
            
        } catch (error) {
            console.error('❌ Erro:', error);
            mostrarFalha('Erro de conexão. Verifique sua internet e tente novamente.');
        }
    }
    
    function mostrarSucesso(usuario) {
        console.log('✅ Vínculo realizado!', usuario);
        
        elementos.icon.className = 'icon';
        elementos.icon.innerHTML = '<i class="fas fa-check"></i>';
        
        elementos.titulo.textContent = 'Vinculado!';
        elementos.subTitulo.innerHTML = 
            `Olá <strong>${usuario.nome}</strong>!<br><br>` +
            `Você receberá notificações push neste dispositivo.`;
        
        mostrarStatus(
            `✅ <strong>Dispositivo vinculado!</strong><br>` +
            `Conta: ${usuario.email}<br>` +
            `Perfil: ${traduzirRole(usuario.role)}`,
            'success'
        );
        
        elementos.btnVincular.style.display = 'none';
        
        if (elementos.btnCancelar) {
            elementos.btnCancelar.innerHTML = '<i class="fas fa-home"></i><span>Ir para o Painel</span>';
            elementos.btnCancelar.onclick = irParaPainel;
        }
        
        setTimeout(irParaPainel, 3000);
    }
    
    function mostrarFalha(mensagem) {
        console.error('❌ Falha:', mensagem);
        
        elementos.icon.className = 'icon error';
        elementos.icon.innerHTML = '<i class="fas fa-times"></i>';
        
        mostrarStatus('❌ ' + mensagem, 'error');
        
        elementos.btnVincular.disabled = false;
        estaVinculando = false;
    }
    
    function irParaPainel() {
        try {
            const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
            const role = userData.role || 'aluno';
            
            const redirectMap = {
                'super_admin': '/admin.html',
                'admin': '/admin-simples.html',
                'professor': '/index.html',
                'aluno': '/aluno.html',
                'setor_pedagogico': '/setor-pedagogico.html',
                'coordenacao_patio': '/coordenacao-patio.html',
                'cozinha': '/cozinha-dashboard.html',
                'gestao_geral': '/gestao-geral.html',
                'enfermaria': '/enfermaria.html',
                'supervisao': '/supervisao.html',
                'psicologia': '/psicologia.html',
                'assistente-social': '/assistente-social.html',
                'protagonismo': '/protagonismo.html'
            };
            
            window.location.href = redirectMap[role] || '/';
            
        } catch (error) {
            window.location.href = '/';
        }
    }
    
    window.cancelar = function() {
        window.location.href = '/';
    };
    
    function mostrarStatus(mensagem, tipo) {
        elementos.status.innerHTML = mensagem;
        elementos.status.className = 'status ' + tipo;
    }
    
    function traduzirRole(role) {
        const mapa = {
            'super_admin': 'Super Admin',
            'admin': 'Administrador',
            'professor': 'Professor',
            'aluno': 'Aluno',
            'setor_pedagogico': 'Setor Pedagógico',
            'coordenacao_patio': 'Coordenação de Pátio',
            'cozinha': 'Cozinha',
            'gestao_geral': 'Gestão Geral',
            'enfermaria': 'Enfermaria',
            'supervisao': 'Supervisão',
            'psicologia': 'Psicologia',
            'assistente-social': 'Assistente Social',
            'protagonismo': 'Protagonismo'
        };
        return mapa[role] || role;
    }
    
})();