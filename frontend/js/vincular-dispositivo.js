// ============================================================
// VINCULAR DISPOSITIVO - JavaScript
// ============================================================
// Responsável por:
// 1. Ler o playerId da URL
// 2. Verificar se o usuário está logado
// 3. Enviar o vínculo para o backend
// 4. Redirecionar para o painel correto
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
    
    // ============ ELEMENTOS DOM ============
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
    
    function inicializar() {
        // 1. Ler playerId da URL
        const urlParams = new URLSearchParams(window.location.search);
        playerId = urlParams.get('playerId');
        
        console.log('🎯 PlayerId recebido:', playerId);
        
        // 2. Validar playerId
        if (!playerId) {
            mostrarErroSemPlayerId();
            return;
        }
        
        // 3. Mostrar playerId na tela
        elementos.playerIdBox.textContent = playerId.substring(0, 30) + '...';
        
        // 4. Verificar se veio de um redirect de login
        verificarRetornoDeLogin();
    }
    
    // ============ VALIDAÇÃO INICIAL ============
    function mostrarErroSemPlayerId() {
        elementos.playerIdBox.textContent = '❌ Nenhum playerId informado';
        elementos.btnVincular.disabled = true;
        elementos.icon.className = 'icon error';
        elementos.icon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
        elementos.titulo.textContent = 'Link Inválido';
        elementos.subTitulo.textContent = 'Abra esta página através da notificação push.';
        mostrarStatus('Link inválido. Por favor, abra pelo botão da notificação.', 'error');
    }
    
    // ============ VERIFICAR SE VOLTOU DO LOGIN ============
    function verificarRetornoDeLogin() {
        const token = localStorage.getItem('auth_token');
        const playerIdSalvo = sessionStorage.getItem('vincular_playerId');
        
        // Se veio de um redirect e tem token, vincula automaticamente
        if (token && playerIdSalvo === playerId) {
            console.log('🔄 Retornando do login, vinculando automaticamente...');
            sessionStorage.removeItem('vincular_playerId');
            
            // Aguarda um pouco para o backend estar pronto
            setTimeout(() => {
                vincular();
            }, 500);
        }
    }
    
    // ============ FUNÇÃO PRINCIPAL DE VÍNCULO ============
    window.vincular = async function() {
        if (estaVinculando) {
            console.log('⏳ Já está vinculando...');
            return;
        }
        
        estaVinculando = true;
        
        try {
            // 1. Verificar se está logado
            const token = localStorage.getItem('auth_token');
            
            if (!token) {
                return redirecionarParaLogin();
            }
            
            // 2. Verificar se o token ainda é válido
            const tokenValido = await verificarToken(token);
            
            if (!tokenValido) {
                return redirecionarParaLogin();
            }
            
            // 3. Fazer o vínculo
            await fazerVinculo(token);
            
        } catch (error) {
            console.error('❌ Erro no vínculo:', error);
            mostrarStatus('❌ Erro inesperado: ' + error.message, 'error');
            elementos.btnVincular.disabled = false;
            estaVinculando = false;
        }
    };
    
    // ============ VERIFICAR TOKEN ============
    async function verificarToken(token) {
        try {
            const response = await fetch(`${API_BASE}/api/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            return response.ok;
        } catch (error) {
            console.warn('⚠️ Erro ao verificar token:', error);
            return false;
        }
    }
    
    // ============ REDIRECIONAR PARA LOGIN ============
    function redirecionarParaLogin() {
        console.log('🔐 Não está logado, redirecionando para login...');
        
        // Salva o playerId para recuperar após o login
        sessionStorage.setItem('vincular_playerId', playerId);
        
        mostrarStatus(
            '🔐 Você precisa fazer login para vincular este dispositivo.<br><strong>Redirecionando...</strong>',
            'loading'
        );
        
        elementos.icon.className = 'icon loading';
        elementos.icon.innerHTML = '<i class="fas fa-user-lock"></i>';
        
        // Redireciona após um pequeno delay
        setTimeout(() => {
            window.location.href = '/login.html?redirect=vincular';
        }, 1500);
    }
    
    // ============ FAZER O VÍNCULO ============
    async function fazerVinculo(token) {
        console.log('🔄 Enviando vínculo para o backend...');
        
        // Mostrar estado de loading
        mostrarStatus('🔄 Vinculando dispositivo...', 'loading');
        elementos.btnVincular.disabled = true;
        elementos.icon.className = 'icon loading';
        elementos.icon.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        
        try {
            const response = await fetch(`${API_BASE}/api/onesignal/vincular-por-link`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
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
            console.error('❌ Erro na requisição:', error);
            mostrarFalha('Erro de conexão. Verifique sua internet e tente novamente.');
        }
    }
    
    // ============ MOSTRAR SUCESSO ============
    function mostrarSucesso(usuario) {
        console.log('✅ Vínculo realizado com sucesso!', usuario);
        
        // Atualizar ícone
        elementos.icon.className = 'icon';
        elementos.icon.innerHTML = '<i class="fas fa-check"></i>';
        
        // Atualizar textos
        elementos.titulo.textContent = 'Vinculado!';
        elementos.subTitulo.innerHTML = 
            `Olá <strong>${usuario.nome}</strong>!<br><br>` +
            `Você receberá notificações push neste dispositivo.`;
        
        // Mostrar status de sucesso
        mostrarStatus(
            `✅ <strong>Dispositivo vinculado!</strong><br>` +
            `Conta: ${usuario.email}<br>` +
            `Perfil: ${traduzirRole(usuario.role)}`,
            'success'
        );
        
        // Esconder botão de vincular
        elementos.btnVincular.style.display = 'none';
        
        // Atualizar botão secundário para "Ir para o painel"
        if (elementos.btnCancelar) {
            elementos.btnCancelar.innerHTML = '<i class="fas fa-home"></i><span>Ir para o Painel</span>';
            elementos.btnCancelar.onclick = irParaPainel;
        }
        
        // Redirecionar automaticamente após 3 segundos
        setTimeout(irParaPainel, 3000);
    }
    
    // ============ MOSTRAR FALHA ============
    function mostrarFalha(mensagem) {
        console.error('❌ Falha no vínculo:', mensagem);
        
        elementos.icon.className = 'icon error';
        elementos.icon.innerHTML = '<i class="fas fa-times"></i>';
        
        mostrarStatus('❌ ' + mensagem, 'error');
        
        elementos.btnVincular.disabled = false;
        estaVinculando = false;
    }
    
    // ============ IR PARA O PAINEL ============
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
            
            const destino = redirectMap[role] || '/';
            console.log(`🔄 Redirecionando para: ${destino}`);
            window.location.href = destino;
            
        } catch (error) {
            console.error('❌ Erro ao redirecionar:', error);
            window.location.href = '/';
        }
    }
    
    // ============ CANCELAR ============
    window.cancelar = function() {
        console.log('🚫 Vínculo cancelado pelo usuário');
        window.location.href = '/';
    };
    
    // ============ UTILITÁRIOS ============
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