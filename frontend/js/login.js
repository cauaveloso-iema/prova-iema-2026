// ============================================================================
// LOGIN - EducaPleno (Frontend)
// ============================================================================
// Descrição: Lógica do cliente para autenticação (tradicional + social)
// Autor: Equipe de Desenvolvimento
// ============================================================================

// ============================================================
// VARIÁVEIS GLOBAIS
// ============================================================
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
console.log('🌐 API URL:', API_BASE_URL);

// ============================================================
// 🔥 CONFIGURAÇÃO DO LOGIN SOCIAL
// ============================================================
const GOOGLE_CLIENT_ID = '586967190920-inmmc78d5o67hjje1qk2qvsafmpp9d3g.apps.googleusercontent.com';
const MICROSOFT_CLIENT_ID = 'SEU_MICROSOFT_CLIENT_ID';
const MICROSOFT_TENANT_ID = 'common';
const MICROSOFT_REDIRECT_URI = window.location.origin + '/login.html';

// ============================================================
// 🔥 MOSTRAR/OCULTAR SENHA
// ============================================================
(function () {
    const wrapper = document.getElementById('passwordWrapper');
    const toggleBtn = document.getElementById('togglePassword');
    const passwordInput = document.getElementById('loginPassword');
    const toggleIcon = document.getElementById('togglePasswordIcon');

    if (!wrapper || !toggleBtn || !passwordInput || !toggleIcon) {
        console.warn('⚠️ Elementos do toggle de senha não encontrados');
        return;
    }

    function atualizarVisibilidadeBotao() {
        if (passwordInput.value && passwordInput.value.length > 0) {
            wrapper.classList.add('tem-texto');
        } else {
            wrapper.classList.remove('tem-texto');
            if (passwordInput.type === 'text') {
                passwordInput.type = 'password';
                toggleIcon.classList.remove('fa-eye-slash');
                toggleIcon.classList.add('fa-eye');
                toggleBtn.classList.remove('ativo');
                toggleBtn.setAttribute('aria-label', 'Mostrar senha');
                toggleBtn.setAttribute('title', 'Mostrar senha');
            }
        }
    }

    passwordInput.addEventListener('input', atualizarVisibilidadeBotao);
    passwordInput.addEventListener('change', atualizarVisibilidadeBotao);

    toggleBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();

        const estaOculta = passwordInput.type === 'password';

        if (estaOculta) {
            passwordInput.type = 'text';
            toggleIcon.classList.remove('fa-eye');
            toggleIcon.classList.add('fa-eye-slash');
            toggleBtn.classList.add('ativo');
            toggleBtn.setAttribute('aria-label', 'Ocultar senha');
            toggleBtn.setAttribute('title', 'Ocultar senha');
        } else {
            passwordInput.type = 'password';
            toggleIcon.classList.remove('fa-eye-slash');
            toggleIcon.classList.add('fa-eye');
            toggleBtn.classList.remove('ativo');
            toggleBtn.setAttribute('aria-label', 'Mostrar senha');
            toggleBtn.setAttribute('title', 'Mostrar senha');
        }

        passwordInput.focus();
    });

    window.atualizarVisibilidadeBotaoSenha = atualizarVisibilidadeBotao;
    atualizarVisibilidadeBotao();
})();

// ============================================================
// FUNÇÕES DE FORMATAÇÃO
// ============================================================
function detectarTipoIdentificador(identificador) {
    identificador = identificador.trim();
    if (identificador.includes('@')) return 'email';
    const apenasNumeros = identificador.replace(/\D/g, '');
    if (apenasNumeros.length === 11) return 'cpf';
    if (identificador.match(/[a-zA-Z]/)) return 'email';
    return 'cpf';
}

// ============================================================
// ALERTA
// ============================================================
function mostrarAlerta(mensagem, tipo = 'error') {
    const alerta = document.getElementById('alert');
    if (!alerta) return;
    alerta.textContent = mensagem;
    alerta.className = `alert alert-${tipo}`;
    alerta.style.display = 'block';
    alerta.scrollIntoView({ behavior: 'smooth', block: 'center' });
    clearTimeout(window.alertTimeout);
    window.alertTimeout = setTimeout(() => {
        alerta.style.display = 'none';
    }, 6000);
}

// ============================================================
// 🔥 FUNÇÕES "LEMBRAR DE MIM"
// ============================================================
function salvarLembrar(identificador, senha) {
    try {
        localStorage.setItem('remembered_identifier', identificador);
        const senhaCodificada = btoa(senha);
        localStorage.setItem('remembered_password', senhaCodificada);
        localStorage.setItem('remember_me', 'true');
        localStorage.setItem('remember_me_timestamp', Date.now().toString());
        console.log('✅ "Lembrar de mim" salvo');
        return true;
    } catch (e) {
        console.error('❌ Erro ao salvar "Lembrar de mim":', e);
        return false;
    }
}

function carregarLembrar() {
    try {
        const rememberMe = localStorage.getItem('remember_me');
        const identifier = localStorage.getItem('remembered_identifier');
        const senhaCodificada = localStorage.getItem('remembered_password');
        const timestamp = localStorage.getItem('remember_me_timestamp');

        if (rememberMe === 'true' && identifier) {
            if (timestamp) {
                const diasPassados = (Date.now() - parseInt(timestamp)) / (1000 * 60 * 60 * 24);
                if (diasPassados > 30) {
                    console.log('⚠️ "Lembrar de mim" expirado');
                    limparLembrar();
                    return false;
                }
            }

            document.getElementById('loginIdentifier').value = identifier;

            if (senhaCodificada) {
                try {
                    const senha = atob(senhaCodificada);
                    document.getElementById('loginPassword').value = senha;
                } catch (e) {
                    console.error('❌ Erro ao decodificar senha:', e);
                    document.getElementById('loginPassword').value = senhaCodificada;
                }
            }

            document.getElementById('rememberMe').checked = true;

            if (typeof window.atualizarVisibilidadeBotaoSenha === 'function') {
                window.atualizarVisibilidadeBotaoSenha();
            }

            return true;
        }
        return false;
    } catch (e) {
        console.error('❌ Erro ao carregar "Lembrar de mim":', e);
        return false;
    }
}

function limparLembrar() {
    try {
        localStorage.removeItem('remembered_identifier');
        localStorage.removeItem('remembered_password');
        localStorage.removeItem('remember_me');
        localStorage.removeItem('remember_me_timestamp');
        localStorage.removeItem('sdp_remember_identifier');
        localStorage.removeItem('sdp_remember_flag');
        localStorage.removeItem('sdp_remember_timestamp');

        if (typeof window.atualizarVisibilidadeBotaoSenha === 'function') {
            window.atualizarVisibilidadeBotaoSenha();
        }
        return true;
    } catch (e) {
        console.error('❌ Erro ao remover "Lembrar de mim":', e);
        return false;
    }
}

// ============================================================
// 🔥 CONTROLE DE REDIRECIONAMENTO - EVITA LOOP
// ============================================================
const REDIRECT_KEY = 'login_redirect_count';
const REDIRECT_MAX = 3;
const REDIRECT_WINDOW = 5000;

function incrementarRedirectCount() {
    const now = Date.now();
    const lastRedirect = parseInt(sessionStorage.getItem('login_redirect_last') || '0');

    if (now - lastRedirect > REDIRECT_WINDOW) {
        sessionStorage.setItem(REDIRECT_KEY, '0');
    }

    const count = parseInt(sessionStorage.getItem(REDIRECT_KEY) || '0') + 1;
    sessionStorage.setItem(REDIRECT_KEY, count.toString());
    sessionStorage.setItem('login_redirect_last', now.toString());
    return count;
}

function resetarRedirectCount() {
    sessionStorage.removeItem(REDIRECT_KEY);
    sessionStorage.removeItem('login_redirect_last');
}

function isEmLoop() {
    const count = parseInt(sessionStorage.getItem(REDIRECT_KEY) || '0');
    const lastRedirect = parseInt(sessionStorage.getItem('login_redirect_last') || '0');
    const now = Date.now();

    if (now - lastRedirect > REDIRECT_WINDOW) {
        resetarRedirectCount();
        return false;
    }
    return count >= REDIRECT_MAX;
}

function obterDestinoPorPerfil(role) {
    const redirectMap = {
        'super_admin': '/admin.html',
        'admin': '/admin-simples.html',
        'professor': '/index.html',
        'setor_pedagogico': '/setor-pedagogico.html',
        'coordenacao_patio': '/coordenacao-patio.html',
        'cozinha': '/cozinha-dashboard.html',
        'gestao_geral': '/gestao-geral.html',
        'enfermaria': '/enfermaria.html',
        'supervisao': '/supervisao.html',
        'biblioteca': '/biblioteca.html',
        'psicologia': '/psicologia.html',
        'assistente-social': '/assistente-social.html',
        'protagonismo': '/protagonismo.html',
        'aluno': '/aluno.html'
    };
    return redirectMap[role] || '/login.html';
}

// ============================================================
// 🔥 FUNÇÃO DE LOGIN TRADICIONAL
// ============================================================
document.getElementById('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const identificador = document.getElementById('loginIdentifier').value.trim();
    const senha = document.getElementById('loginPassword').value;
    const rememberMe = document.getElementById('rememberMe').checked;

    if (!identificador || !senha) {
        mostrarAlerta('Preencha todos os campos', 'error');
        return;
    }

    resetarRedirectCount();

    const btn = document.getElementById('btnLogin');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Entrando...';
    btn.disabled = true;

    try {
        const tipo = detectarTipoIdentificador(identificador);
        let dadosLogin = { password: senha, rememberMe: rememberMe };

        if (tipo === 'email') {
            dadosLogin.email = identificador.toLowerCase();
        } else {
            dadosLogin.cpf = identificador.replace(/\D/g, '');
        }

        const resposta = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosLogin)
        });

        const dados = await resposta.json();

        // ---------- 2FA ----------
        if (dados.requiresTwoFactor) {
            if (rememberMe) {
                salvarLembrar(identificador, senha);
            } else {
                limparLembrar();
            }

            sessionStorage.setItem('2fa_token', dados.token);
            sessionStorage.setItem('2fa_userId', dados.userId);
            sessionStorage.setItem('2fa_message', dados.message || 'Código 2FA necessário');

            mostrarAlerta('🔐 ' + (dados.message || 'Código 2FA necessário'), 'info');

            setTimeout(() => {
                window.location.href = '/validar-2fa.html';
            }, 1500);
            return;
        }

        // ---------- LOGIN COM SUCESSO ----------
        if (dados.success) {
            if (rememberMe) {
                salvarLembrar(identificador, senha);
            } else {
                limparLembrar();
            }

            mostrarAlerta('✅ Login realizado! Redirecionando...', 'success');

            localStorage.setItem('auth_token', dados.token);
            localStorage.setItem('user_data', JSON.stringify(dados.user));

            if (rememberMe) {
                sessionStorage.setItem('auth_token', dados.token);
                sessionStorage.setItem('user_data', JSON.stringify(dados.user));
            }

            const destino = dados.redirectTo || obterDestinoPorPerfil(dados.user.role);

            resetarRedirectCount();
            setTimeout(() => {
                window.location.href = destino;
            }, 1000);

        } else {
            mostrarAlerta('❌ Erro: ' + (dados.error || 'Erro no login'), 'error');
            if (dados.error && dados.error.toLowerCase().includes('credenciais')) {
                limparLembrar();
                document.getElementById('rememberMe').checked = false;
            }
        }

    } catch (erro) {
        console.error('Erro no login:', erro);
        mostrarAlerta('❌ Erro de conexão com o servidor', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
});

// ============================================================
// 🔥 VERIFICAR LOGIN AUTOMÁTICO
// ============================================================
function verificarLoginAutomatico() {
    if (isEmLoop()) {
        resetarRedirectCount();
        mostrarAlerta('⚠️ Detectamos um loop de redirecionamento. Faça login novamente.', 'error');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');
        sessionStorage.removeItem('auth_token');
        sessionStorage.removeItem('user_data');
        return;
    }

    const token = localStorage.getItem('auth_token');
    const userDataRaw = localStorage.getItem('user_data');

    if (!token || !userDataRaw) {
        carregarLembrar();
        return;
    }

    try {
        const userData = JSON.parse(userDataRaw);
        const count = incrementarRedirectCount();
        console.log(`🔄 Tentativa de redirecionamento #${count}`);

        fetch(`${API_BASE_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(response => {
                if (response.status === 200) {
                    const destino = obterDestinoPorPerfil(userData.role);
                    resetarRedirectCount();
                    window.location.href = destino;
                } else {
                    localStorage.removeItem('auth_token');
                    localStorage.removeItem('user_data');
                    sessionStorage.removeItem('auth_token');
                    sessionStorage.removeItem('user_data');
                    resetarRedirectCount();
                    carregarLembrar();
                }
            })
            .catch(() => {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('user_data');
                sessionStorage.removeItem('auth_token');
                sessionStorage.removeItem('user_data');
                resetarRedirectCount();
                carregarLembrar();
            });

    } catch (e) {
        localStorage.removeItem('user_data');
        localStorage.removeItem('auth_token');
        sessionStorage.removeItem('auth_token');
        sessionStorage.removeItem('user_data');
        resetarRedirectCount();
        carregarLembrar();
    }
}

// ============================================================
// 🔥 LOGIN SOCIAL - GOOGLE
// ============================================================
function inicializarGoogleLogin() {
    if (typeof google === 'undefined' || !google.accounts) {
        console.warn('⚠️ Google Identity Services não carregou ainda');
        return;
    }

    if (window._googleInited) {
        console.log('ℹ️ Google já estava inicializado');
        return;
    }

    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true
    });

    window._googleInited = true;
    console.log('✅ Google Identity Services inicializado');
}

async function handleGoogleCredentialResponse(response) {
    if (!response.credential) {
        mostrarAlerta('❌ Não foi possível obter credenciais do Google', 'error');
        return;
    }
    await processarLoginSocial('google', response.credential);
}

document.getElementById('btnGoogleLogin')?.addEventListener('click', function () {
    if (typeof google === 'undefined' || !google.accounts) {
        mostrarAlerta('⚠️ Google ainda carregando. Tente novamente em instantes.', 'info');
        return;
    }

    google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            const client = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: 'openid email profile',
                callback: async (tokenResponse) => {
                    if (tokenResponse.access_token) {
                        await processarLoginSocial('google', null, tokenResponse.access_token);
                    }
                }
            });
            client.requestAccessToken();
        }
    });
});

// ============================================================
// 🔥 LOGIN SOCIAL - MICROSOFT
// ============================================================
let msalInstance = null;

function inicializarMicrosoftLogin() {
    if (typeof msal === 'undefined') {
        console.warn('⚠️ MSAL não carregou ainda');
        return;
    }

    if (msalInstance) {
        console.log('ℹ️ MSAL já estava inicializado');
        return;
    }

    msalInstance = new msal.PublicClientApplication({
        auth: {
            clientId: MICROSOFT_CLIENT_ID,
            authority: `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}`,
            redirectUri: MICROSOFT_REDIRECT_URI
        },
        cache: {
            cacheLocation: 'sessionStorage',
            storeAuthStateInCookie: false
        }
    });
    console.log('✅ Microsoft MSAL inicializado');
}

document.getElementById('btnMicrosoftLogin')?.addEventListener('click', async function () {
    if (!msalInstance) {
        inicializarMicrosoftLogin();
    }
    if (!msalInstance) {
        mostrarAlerta('⚠️ Microsoft ainda carregando. Tente novamente em instantes.', 'info');
        return;
    }

    try {
        const loginResponse = await msalInstance.loginPopup({
            scopes: ['openid', 'profile', 'email', 'User.Read']
        });

        if (loginResponse.idToken) {
            await processarLoginSocial('microsoft', loginResponse.idToken);
        } else {
            mostrarAlerta('❌ Não foi possível obter credenciais da Microsoft', 'error');
        }
    } catch (error) {
        console.error('❌ Erro no login Microsoft:', error);
        if (error.errorCode !== 'user_cancelled') {
            mostrarAlerta('❌ Erro ao entrar com Microsoft', 'error');
        }
    }
});

// ============================================================
// 🔥 PROCESSAMENTO COMUM DO LOGIN SOCIAL
// ============================================================
async function processarLoginSocial(provider, idToken, accessToken = null) {
    const btn = document.getElementById(provider === 'google' ? 'btnGoogleLogin' : 'btnMicrosoftLogin');
    const originalHTML = btn?.innerHTML;

    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
        btn.disabled = true;
    }

    try {
        console.log(`🔐 Processando login social: ${provider}`);

        const resposta = await fetch(`${API_BASE_URL}/login-social/${provider}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken, accessToken })
        });

        const dados = await resposta.json();
        console.log('📦 Resposta do servidor:', dados);

        // ============================================================
        // 🔥 EMAIL NÃO INSTITUCIONAL
        // ============================================================
        if (dados.codigo === 'EMAIL_NAO_INSTITUCIONAL') {
            mostrarAlerta(
                `⚠️ Apenas emails institucionais (@iemasaoluiscentro.net) são permitidos. ` +
                `A conta "${dados.email}" não pode ser usada para entrar no EducaPleno.`,
                'error'
            );
            return;
        }

        // ============================================================
        // 🔥 REQUER 2FA (super_admin, admin)
        // ============================================================
        if (dados.requiresTwoFactor) {
            console.log(`🔐 2FA necessário após login social (motivo: ${dados.motivo2FA || 'não especificado'})`);

            sessionStorage.setItem('2fa_token', dados.token);
            sessionStorage.setItem('2fa_userId', dados.userId);
            sessionStorage.setItem('2fa_message', dados.message || 'Código 2FA necessário');
            sessionStorage.setItem('2fa_from_social', provider);
            sessionStorage.setItem('2fa_user_nome', dados.user?.nome || '');
            sessionStorage.setItem('2fa_user_role', dados.user?.role || '');

            mostrarAlerta('🔐 ' + (dados.message || 'Código 2FA necessário'), 'info');

            setTimeout(() => {
                window.location.href = '/validar-2fa.html';
            }, 1500);
            return;
        }

        // ---------- NÃO CADASTRADO → REDIRECIONA PARA CADASTRO ----------
        if (dados.precisaCadastrar) {
            sessionStorage.setItem('social_signup_email', dados.email || '');
            sessionStorage.setItem('social_signup_nome', dados.nome || '');
            sessionStorage.setItem('social_signup_provider', provider);
            sessionStorage.setItem('social_signup_picture', dados.picture || '');

            mostrarAlerta('📝 Vamos completar seu cadastro!', 'info');

            setTimeout(() => {
                const params = new URLSearchParams({
                    email: dados.email || '',
                    nome: dados.nome || '',
                    provider: provider,
                    social: 'true'
                });
                window.location.href = `/cadastro-etapas.html?${params.toString()}`;
            }, 1200);
            return;
        }

        // ---------- LOGIN OK ----------
        if (dados.success) {
            mostrarAlerta('✅ Login realizado! Redirecionando...', 'success');

            localStorage.setItem('auth_token', dados.token);
            localStorage.setItem('user_data', JSON.stringify(dados.user));

            const destino = dados.redirectTo || obterDestinoPorPerfil(dados.user.role);

            resetarRedirectCount();
            setTimeout(() => {
                window.location.href = destino;
            }, 1000);
            return;
        }

        mostrarAlerta('❌ ' + (dados.error || 'Erro ao fazer login'), 'error');

    } catch (erro) {
        console.error(`❌ Erro no login ${provider}:`, erro);
        mostrarAlerta('❌ Erro de conexão com o servidor', 'error');
    } finally {
        if (btn && originalHTML) {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }
    }
}

// ============================================================
// PULL-TO-REFRESH
// ============================================================
let touchStartY = 0;
let touchCurrentY = 0;
let isPulling = false;
const PULL_THRESHOLD = 200;
const TOP_TOLERANCE = 100;

document.addEventListener('touchstart', function (e) {
    if (window.scrollY <= TOP_TOLERANCE) {
        touchStartY = e.touches[0].clientY;
        isPulling = true;
    }
}, { passive: true });

document.addEventListener('touchmove', function (e) {
    if (!isPulling) return;
    touchCurrentY = e.touches[0].clientY;
    const pullDistance = touchCurrentY - touchStartY;
    if (pullDistance > 50) mostrarIndicadorPull(pullDistance);
    if (pullDistance > PULL_THRESHOLD) {
        e.preventDefault();
        atualizarPagina();
    }
}, { passive: false });

document.addEventListener('touchend', function () {
    if (!isPulling) return;
    const pullDistance = touchCurrentY - touchStartY;
    if (pullDistance < PULL_THRESHOLD) esconderIndicadorPull();
    isPulling = false;
    touchStartY = 0;
    touchCurrentY = 0;
}, { passive: true });

function atualizarPagina() {
    mostrarMensagem('Atualizando página...');
    document.body.style.opacity = '0.7';
    document.body.style.transition = 'opacity 0.3s';
    setTimeout(() => location.reload(), 500);
}

function mostrarIndicadorPull(distancia) {
    let indicador = document.getElementById('pull-indicator');
    if (!indicador) {
        indicador = document.createElement('div');
        indicador.id = 'pull-indicator';
        indicador.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0;
            background: #4f46e5; color: white; text-align: center;
            padding: 10px; font-size: 14px; z-index: 9999;
            transform: translateY(-100%); transition: transform 0.2s;
        `;
        indicador.innerHTML = '↓ Solte para atualizar';
        document.body.appendChild(indicador);
    }
    if (distancia > 50) indicador.style.transform = 'translateY(0)';
}

function esconderIndicadorPull() {
    const indicador = document.getElementById('pull-indicator');
    if (indicador) indicador.style.transform = 'translateY(-100%)';
}

function mostrarMensagem(texto) {
    const msg = document.createElement('div');
    msg.style.cssText = `
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        background: #10b981; color: white;
        padding: 15px 30px; border-radius: 10px;
        font-weight: bold; z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    `;
    msg.textContent = texto;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 1500);
}

// ============================================================
// ESCALONAMENTO MOBILE
// ============================================================
(function () {
    if (window.innerWidth > 768) return;
    console.log('📐 Inicializando escalonamento mobile...');

    function calcularEscalaMobile() {
        const width = window.innerWidth;
        if (width <= 320) return 0.55;
        if (width <= 360) return 0.6;
        if (width <= 400) return 0.65;
        if (width <= 500) return 0.75;
        if (width <= 600) return 0.85;
        if (width <= 700) return 0.95;
        return 1;
    }

    function aplicarEscalaMobile() {
        if (window.innerWidth > 768) return;
        const escala = calcularEscalaMobile();
        document.documentElement.style.setProperty('--scale-ratio', escala);
        document.documentElement.style.setProperty('--current-width', window.innerWidth);
    }

    aplicarEscalaMobile();

    let timeout;
    window.addEventListener('resize', function () {
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            if (window.innerWidth <= 768) {
                aplicarEscalaMobile();
            } else {
                document.documentElement.style.setProperty('--scale-ratio', '1');
            }
        }, 100);
    });

    window.addEventListener('orientationchange', function () {
        setTimeout(() => {
            if (window.innerWidth <= 768) aplicarEscalaMobile();
        }, 200);
    });
})();

// ============================================================
// 🔥 INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
    console.log('🚀 EducaPleno - Login carregado!');

    carregarLembrar();

    setTimeout(() => {
        if (typeof window.atualizarVisibilidadeBotaoSenha === 'function') {
            window.atualizarVisibilidadeBotaoSenha();
        }
    }, 100);

    setTimeout(function () {
        verificarLoginAutomatico();
    }, 300);

    setTimeout(() => {
        inicializarGoogleLogin();
        inicializarMicrosoftLogin();
    }, 500);

    setTimeout(() => {
        inicializarGoogleLogin();
        inicializarMicrosoftLogin();
    }, 1500);
});