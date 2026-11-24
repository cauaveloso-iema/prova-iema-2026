// ============================================================================
// frontend/js/validar-2fa.js
// 2FA com suporte a passkey (WebAuthn) via /api/biometria
// + Suporte a Biometria Nativa no Kodular (Biometric_Prompt)
// + Verificação unificada: botão só aparece se houver credencial ativa
// ============================================================================
'use strict';

(function () {
    // ---------------------------------------------------------------------
    // Detecção de ambiente
    // ---------------------------------------------------------------------
    const isKodularWebView = (function () {
        const ua = navigator.userAgent || '';
        return /\bwv\b/i.test(ua)
            || /Kodular/i.test(ua)
            || (typeof window.Kodular !== 'undefined')
            || (typeof window.AppInventor !== 'undefined');
    })();

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function decodeJwtPayload(token) {
        try {
            const parts = String(token).split('.');
            if (parts.length !== 3) return null;
            const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            const json = decodeURIComponent(
                atob(base64).split('').map(c =>
                    '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
                ).join('')
            );
            return JSON.parse(json);
        } catch (_) { return null; }
    }

    function isValidObjectId(id) {
        return typeof id === 'string' && /^[a-fA-F0-9]{24}$/.test(id);
    }

    // Base64url helpers (usados apenas no fluxo WebAuthn do navegador)
    function b64urlParaBuf(b64url) {
        const s = String(b64url).replace(/-/g, '+').replace(/_/g, '/');
        const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
        const bin = atob(s + pad);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        return buf;
    }

    function bufParaB64url(buf) {
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    // ---------------------------------------------------------------------
    // Função global que o Kodular chama via EvaluateJavascript
    // ---------------------------------------------------------------------
    window.receberResultadoBiometria = function (sucesso, mensagem) {
        const instancia = window.twoFactorInstance;
        if (!instancia) return;

        if (!sucesso) {
            instancia.showAlert(mensagem || 'Biometria cancelada.', 'error');
            return;
        }

        const token2fa = sessionStorage.getItem('2fa_token');
        if (!token2fa) {
            instancia.showAlert('Sessão expirada. Faça login novamente.', 'error');
            return;
        }

        // Biometria nativa passou. Agora valida no backend.
        fetch('/api/biometria/autenticar/nativo', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token2fa}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ nativo: true })
        })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                instancia.showAlert('✅ Biometria validada!', 'success');
                instancia._finalizarLogin(data.token, data.user, data.redirectTo);
            } else {
                instancia.showAlert(data.error || 'Falha na autenticação nativa.', 'error');
            }
        })
        .catch(() => {
            instancia.showAlert('Erro ao validar biometria nativa.', 'error');
        });
    };

    // ---------------------------------------------------------------------
    // Classe principal
    // ---------------------------------------------------------------------
    class TwoFactorAuth {
        constructor() {
            this.token = sessionStorage.getItem('2fa_token');
            this.userId = sessionStorage.getItem('2fa_userId');
            this.timerInterval = null;
            this.resendCooldown = false;
            this.backupCodes = [];
            this.qrData = null;
            this.qrSecretHideTimer = null;
            this.biometriaDisponivel = false;
            this.userRoleDestino = null;

            // Estado WebAuthn do fluxo de autenticação (navegador)
            this._bioChallenge = null;
            this._bioOptions = null;
            this._bioLoading = false;

            if (!this.token || !this.userId) {
                this.showAlert('Sessão expirada. Faça login novamente.', 'error');
                setTimeout(() => window.location.href = '/login.html', 2000);
                return;
            }
            if (!isValidObjectId(this.userId)) {
                this.showAlert('Sessão inválida. Faça login novamente.', 'error');
                setTimeout(() => window.location.href = '/login.html', 2000);
                return;
            }
            const payload = decodeJwtPayload(this.token);
            if (!payload) {
                this.showAlert('Token inválido. Faça login novamente.', 'error');
                setTimeout(() => window.location.href = '/login.html', 2000);
                return;
            }
            if (payload.exp && payload.exp * 1000 < Date.now()) {
                this.showAlert('Sessão expirada. Faça login novamente.', 'error');
                setTimeout(() => window.location.href = '/login.html', 2000);
                return;
            }

            setTimeout(() => this.init(), 100);
        }

        async init() {
            this.setupEventListeners();
            await this.loadUserData();
            await this.loadBackupCodes();
            this.startTimer(300);
            await this.requestCode();
            await this.verificarBiometriaDisponivel();
        }

        // =================================================================
        // BIOMETRIA — verificar disponibilidade (Kodular ou Navegador)
        // =================================================================
        async verificarBiometriaDisponivel() {
            // =============================================================
            // 1. AMBIENTE KODULAR (Custom WebView + Biometric_Prompt nativo)
            // =============================================================
            if (isKodularWebView) {
                console.log('ℹ️ Kodular detectado — verificando se há biometria cadastrada.');

                try {
                    const resp = await fetch('/api/biometria/autenticar/iniciar', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.token}`,
                            'Content-Type': 'application/json'
                        }
                    });
                    const data = await resp.json();

                    if (!data.success) {
                        if (data.codigo === 'NO_CREDENTIALS') {
                            console.log('ℹ️ Nenhuma passkey cadastrada — botão oculto no Kodular');
                        }
                        return;
                    }

                    // Tem credencial! Mostra o botão.
                    this.biometriaDisponivel = true;

                    const secao = document.getElementById('biometricSection');
                    const btnText = document.getElementById('biometricBtnText');
                    const icon = document.getElementById('biometricIcon');

                    if (icon) icon.className = 'fas fa-fingerprint';
                    if (btnText) btnText.textContent = 'Entrar com biometria';
                    if (secao) secao.classList.remove('hidden');

                    const btn = document.getElementById('biometricBtn');
                    if (btn) {
                        // Clona o botão para remover ouvintes antigos e evitar duplicação
                        const novoBtn = btn.cloneNode(true);
                        btn.parentNode.replaceChild(novoBtn, btn);
                        novoBtn.addEventListener('click', () => this.loginComBiometriaNativa());
                    }
                    console.log('✅ Botão de biometria (nativa Kodular) exibido');
                } catch (err) {
                    console.warn('⚠️ Falha ao checar biometria no Kodular:', err);
                }
                return;
            }

            // =============================================================
            // 2. AMBIENTE NAVEGADOR NORMAL (WebAuthn puro)
            // =============================================================
            if (!window.PublicKeyCredential) {
                console.log('ℹ️ WebAuthn não suportado');
                return;
            }
            try {
                if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
                    const ok = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
                    if (!ok) {
                        console.log('ℹ️ Sem autenticador de plataforma');
                        return;
                    }
                }
            } catch (_) {}

            try {
                const resp = await fetch('/api/biometria/autenticar/iniciar', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    }
                });
                const data = await resp.json();

                if (!data.success) {
                    if (data.codigo === 'NO_CREDENTIALS') {
                        console.log('ℹ️ Nenhuma passkey cadastrada — botão oculto');
                    }
                    return;
                }

                this.biometriaDisponivel = true;
                this._bioChallenge = data._challenge;
                this._bioOptions = data.opcoes;

                const secao = document.getElementById('biometricSection');
                const icon = document.getElementById('biometricIcon');
                const btnText = document.getElementById('biometricBtnText');

                if (/iPhone|iPad|Mac/i.test(navigator.userAgent)) {
                    icon.className = 'fas fa-face-smile';
                    btnText.textContent = 'Entrar com Face ID / Touch ID';
                } else if (/Android/i.test(navigator.userAgent)) {
                    icon.className = 'fas fa-fingerprint';
                    btnText.textContent = 'Entrar com digital';
                } else {
                    icon.className = 'fas fa-fingerprint';
                    btnText.textContent = 'Entrar com Windows Hello';
                }

                if (secao) secao.classList.remove('hidden');

                const btn = document.getElementById('biometricBtn');
                if (btn) {
                    btn.addEventListener('click', () => this.loginComBiometria());
                }
                console.log('✅ Botão de biometria (WebAuthn) exibido');
            } catch (err) {
                console.warn('⚠️ Falha ao checar biometria:', err);
            }
        }

        // =================================================================
        // BIOMETRIA NATIVA (KODULAR)
        // =================================================================
        loginComBiometriaNativa() {
            if (window.AppInventor && typeof window.AppInventor.setWebViewString === 'function') {
                // Envia o comando para o app nativo abrir a biometria
                window.AppInventor.setWebViewString('SOLICITAR_BIOMETRIA');
            } else {
                this.showAlert('Biometria indisponível neste aplicativo.', 'error');
            }
        }

        // =================================================================
        // BIOMETRIA WEBAUTHN (NAVEGADOR)
        // =================================================================
        async loginComBiometria() {
            if (this._bioLoading) return;
            if (!this._bioOptions || !this._bioChallenge) {
                this.showAlert('Biometria indisponível. Use um código abaixo.', 'info');
                return;
            }

            this._bioLoading = true;
            const btn = document.getElementById('biometricBtn');
            const btnText = document.getElementById('biometricBtnText');
            const icon = document.getElementById('biometricIcon');
            const originalHTML = btn.innerHTML;

            btn.disabled = true;
            if (icon) icon.className = 'fas fa-spinner fa-spin';
            if (btnText) btnText.textContent = 'Aguardando biometria...';

            try {
                const o = this._bioOptions;
                const publicKey = {
                    challenge: b64urlParaBuf(o.challenge),
                    rpId: o.rpId,
                    timeout: o.timeout || 60000,
                    userVerification: o.userVerification || 'required',
                    allowCredentials: (o.allowCredentials || []).map(c => ({
                        id: b64urlParaBuf(c.id),
                        type: c.type,
                        transports: c.transports || []
                    }))
                };

                let cred;
                try {
                    cred = await navigator.credentials.get({ publicKey });
                } catch (err) {
                    if (err.name === 'NotAllowedError' || err.name === 'AbortError') {
                        throw new Error('Biometria cancelada. Use um código abaixo.');
                    }
                    if (err.name === 'SecurityError') {
                        throw new Error('Biometria bloqueada pelo navegador. Use um código abaixo.');
                    }
                    throw new Error(err.message || 'Falha na biometria.');
                }

                if (!cred) throw new Error('Biometria cancelada.');

                if (btnText) btnText.textContent = 'Validando...';

                // Envia ao servidor
                const resp = await fetch('/api/biometria/autenticar/concluir', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        challenge: this._bioChallenge,
                        credential: {
                            id: cred.id,
                            rawId: bufParaB64url(cred.rawId),
                            type: cred.type,
                            response: {
                                clientDataJSON: bufParaB64url(cred.response.clientDataJSON),
                                authenticatorData: bufParaB64url(cred.response.authenticatorData),
                                signature: bufParaB64url(cred.response.signature),
                                userHandle: cred.response.userHandle
                                    ? bufParaB64url(cred.response.userHandle) : null
                            }
                        }
                    })
                });

                const data = await resp.json();
                if (!data.success) {
                    if (data.codigo === 'NO_CREDENTIALS') {
                        this.showAlert('Nenhuma biometria registrada. Use um código abaixo.', 'info');
                        document.getElementById('biometricSection')?.classList.add('hidden');
                        return;
                    }
                    throw new Error(data.error || 'Falha na autenticação.');
                }

                this.showAlert('✅ Biometria validada!', 'success');
                this._finalizarLogin(data.token, data.user, data.redirectTo);
            } catch (err) {
                console.error('❌ Biometria:', err);
                this.showAlert(err.message || 'Falha na biometria.', 'error');
                btn.innerHTML = originalHTML;
                btn.disabled = false;
            } finally {
                this._bioLoading = false;
            }
        }

        // =================================================================
        // OFERECER CADASTRO DE BIOMETRIA (pós-2FA bem-sucedido)
        // =================================================================
        async oferecerCadastroBiometria(authToken, role) {
            this.userRoleDestino = role;

            if (isKodularWebView) {
                this.redirecionarFinal();
                return;
            }
            if (!window.PublicKeyCredential) {
                this.redirecionarFinal();
                return;
            }

            // Verifica se já tem passkey (se sim, não oferece de novo)
            try {
                const resp = await fetch('/api/biometria/minhas', {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                const data = await resp.json();
                if (data.success && Array.isArray(data.biometrias)) {
                    const ativas = data.biometrias.filter(b => b.ativo !== false);
                    if (ativas.length > 0) {
                        this.redirecionarFinal();
                        return;
                    }
                }
            } catch (_) {}

            const content = document.querySelector('.content');
            if (!content) { this.redirecionarFinal(); return; }

            // Esconde tudo da tela de 2FA
            ['phoneInfo', 'timer', 'firstTimeBadge', 'biometricSection',
             'appDownloadLink', 'resendBtn', 'backBtn'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('hidden');
            });
            document.querySelector('.tabs')?.classList.add('hidden');
            document.querySelectorAll('form').forEach(f => f.classList.add('hidden'));
            document.querySelector('.backup-section')?.classList.add('hidden');
            document.querySelector('.footer')?.classList.add('hidden');

            const header = document.getElementById('mainHeader');
            if (header) {
                header.innerHTML = `
                    <i class="fas fa-check-circle" style="color: #16a34a;"></i>
                    <h1>Acesso Autorizado</h1>
                    <p>Você entrou com sucesso</p>
                `;
            }

            const box = document.createElement('div');
            box.className = 'ativar-biometria-box';
            box.innerHTML = `
                <strong><i class="fas fa-fingerprint"></i> Ativar acesso rápido?</strong>
                <p style="margin-bottom: 20px; color: #166534;">
                    Da próxima vez, entre com biometria em vez de digitar o código SMS.
                </p>
                <button type="button" class="btn-ativar" id="btnAtivarBio">
                    <i class="fas fa-fingerprint"></i> Ativar biometria
                </button>
                <button type="button" class="btn-pular" id="btnPularBio" style="margin-top: 10px;">
                    Pular e ir para o painel
                </button>
            `;
            content.insertBefore(box, content.firstChild);

            document.getElementById('btnAtivarBio').addEventListener('click', async (e) => {
                const b = e.currentTarget;
                const pularBtn = document.getElementById('btnPularBio');
                const orig = b.innerHTML;
                b.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ativando...';
                b.disabled = true;
                if (pularBtn) pularBtn.disabled = true;

                try {
                    await this._registrarPasskey(authToken);
                    this.showAlert('✅ Biometria ativada!', 'success');
                    box.innerHTML = '<strong style="color:#166534;text-align:center;display:block;padding:10px;"><i class="fas fa-check-circle"></i> Biometria ativada com sucesso!</strong>';
                    setTimeout(() => this.redirecionarFinal(), 1500);
                } catch (err) {
                    console.error('❌ Erro ao registrar biometria:', err);
                    this.showAlert(err.message || 'Erro ao ativar biometria.', 'error');
                    b.innerHTML = orig;
                    b.disabled = false;
                    if (pularBtn) pularBtn.disabled = false;
                }
            });

            document.getElementById('btnPularBio').addEventListener('click', () => {
                this.redirecionarFinal();
            });
        }

        async _registrarPasskey(authToken) {
            // 1. Inicia
            const respInicio = await fetch('/api/biometria/registrar/iniciar', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                }
            });
            const dataInicio = await respInicio.json();
            if (!dataInicio.success) throw new Error(dataInicio.error || 'Falha ao iniciar cadastro.');

            const o = dataInicio.opcoes;
            const publicKey = {
                challenge: b64urlParaBuf(o.challenge),
                rp: o.rp,
                user: {
                    id: b64urlParaBuf(o.user.id),
                    name: o.user.name,
                    displayName: o.user.displayName
                },
                pubKeyCredParams: o.pubKeyCredParams,
                authenticatorSelection: o.authenticatorSelection,
                timeout: o.timeout,
                attestation: o.attestation,
                excludeCredentials: (o.excludeCredentials || []).map(c => ({
                    id: b64urlParaBuf(c.id),
                    type: c.type
                }))
            };

            let cred;
            try {
                cred = await navigator.credentials.create({ publicKey });
            } catch (err) {
                if (err.name === 'NotAllowedError') throw new Error('Cadastro cancelado.');
                if (err.name === 'InvalidStateError') throw new Error('Este dispositivo já tem passkey cadastrada.');
                throw new Error(err.message || 'Falha ao criar passkey.');
            }
            if (!cred) throw new Error('Cadastro cancelado.');

            // 2. Device label
            let deviceLabel = 'Dispositivo';
            if (/iPhone|iPad/i.test(navigator.userAgent)) deviceLabel = 'iPhone/iPad';
            else if (/Android/i.test(navigator.userAgent)) deviceLabel = 'Android';
            else if (/Mac/i.test(navigator.userAgent)) deviceLabel = 'Mac';
            else if (/Windows/i.test(navigator.userAgent)) deviceLabel = 'Windows';

            // 3. Conclui
            const respFim = await fetch('/api/biometria/registrar/concluir', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    challenge: dataInicio._challenge,
                    deviceLabel,
                    credential: {
                        id: cred.id,
                        rawId: bufParaB64url(cred.rawId),
                        type: cred.type,
                        response: {
                            clientDataJSON: bufParaB64url(cred.response.clientDataJSON),
                            attestationObject: bufParaB64url(cred.response.attestationObject),
                            transports: (cred.response.getTransports && cred.response.getTransports()) || []
                        }
                    }
                })
            });
            const dataFim = await respFim.json();
            if (!dataFim.success) throw new Error(dataFim.error || 'Falha ao salvar passkey.');
            return dataFim;
        }

        // =================================================================
        // LOGIN GENÉRICO (usado pelo verifyCode, biometria WebAuthn e Nativa)
        // =================================================================
        _finalizarLogin(token, user, redirectTo) {
            localStorage.setItem('auth_token', token);
            if (user) localStorage.setItem('user_data', JSON.stringify(user));

            sessionStorage.removeItem('2fa_token');
            sessionStorage.removeItem('2fa_userId');
            sessionStorage.removeItem('2fa_message');
            sessionStorage.removeItem('2fa_from_social');
            sessionStorage.removeItem('2fa_user_nome');
            sessionStorage.removeItem('2fa_user_role');

            const role = user?.role || this.userRoleDestino;
            let destino = redirectTo;
            if (!destino) {
                if (role === 'super_admin') destino = '/admin.html';
                else if (role === 'admin') destino = '/admin-simples.html';
                else if (role === 'professor') destino = '/index.html';
                else if (role === 'aluno') destino = '/aluno.html';
                else destino = '/login.html';
            }
            setTimeout(() => { window.location.href = destino; }, 1000);
        }

        redirecionarFinal() {
            const role = this.userRoleDestino;
            if (role === 'super_admin') window.location.href = '/admin.html';
            else if (role === 'admin') window.location.href = '/admin-simples.html';
            else if (role === 'professor') window.location.href = '/index.html';
            else if (role === 'aluno') window.location.href = '/aluno.html';
            else window.location.href = '/login.html';
        }

        // =================================================================
        // EVENTOS / CÓDIGOS / BACKUP / QR / TIMER
        // =================================================================
        setupEventListeners() {
            const addListener = (id, event, handler) => {
                const el = document.getElementById(id);
                if (el) el.addEventListener(event, handler);
            };

            addListener('tabSms', 'click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.getElementById('tabSms')?.classList.add('active');
                document.getElementById('smsForm')?.classList.remove('hidden');
                document.getElementById('backupForm')?.classList.add('hidden');
                document.getElementById('qrForm')?.classList.add('hidden');
            });
            addListener('tabBackup', 'click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.getElementById('tabBackup')?.classList.add('active');
                document.getElementById('smsForm')?.classList.add('hidden');
                document.getElementById('backupForm')?.classList.remove('hidden');
                document.getElementById('qrForm')?.classList.add('hidden');
            });
            addListener('tabQrCode', 'click', () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.getElementById('tabQrCode')?.classList.add('active');
                document.getElementById('smsForm')?.classList.add('hidden');
                document.getElementById('backupForm')?.classList.add('hidden');
                document.getElementById('qrForm')?.classList.remove('hidden');
                if (typeof this.gerarQRCode === 'function') this.gerarQRCode();
            });

            addListener('smsForm', 'submit', (e) => { e.preventDefault(); this.verifyCode('sms'); });
            addListener('backupForm', 'submit', (e) => { e.preventDefault(); this.verifyCode('backup'); });
            addListener('qrForm', 'submit', (e) => { e.preventDefault(); this.verifyCode('qr'); });
            addListener('resendBtn', 'click', () => this.resendCode());
            addListener('backBtn', 'click', () => {
                sessionStorage.removeItem('2fa_token');
                sessionStorage.removeItem('2fa_userId');
                sessionStorage.removeItem('2fa_message');
                sessionStorage.removeItem('2fa_from_social');
                sessionStorage.removeItem('2fa_user_nome');
                sessionStorage.removeItem('2fa_user_role');
                window.location.href = '/login.html';
            });

            addListener('smsCode', 'input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').substring(0, 6);
            });
            addListener('backupCode', 'input', (e) => {
                e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 8);
            });
            addListener('qrCode', 'input', (e) => {
                e.target.value = e.target.value.replace(/\D/g, '').substring(0, 6);
            });
            addListener('secretKeyDisplay', 'click', () => this.copiarChave());
        }

        async get2FAStatus() {
            try {
                const response = await fetch('/api/auth/2fa/status', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                return await response.json();
            } catch (e) {
                return { twoFactorEnabled: false };
            }
        }

        async verifyCode(type) {
            let code, btnId, endpoint;

            if (type === 'sms') {
                code = document.getElementById('smsCode')?.value;
                btnId = 'smsBtn';
                endpoint = '/api/auth/login';
            } else if (type === 'backup') {
                code = document.getElementById('backupCode')?.value;
                btnId = 'backupBtn';
                endpoint = '/api/auth/login';
            } else if (type === 'qr') {
                code = document.getElementById('qrCode')?.value;
                btnId = 'qrBtn';
                const status = await this.get2FAStatus();
                endpoint = status.twoFactorEnabled ? '/api/auth/login' : '/api/auth/2fa/verify-totp';
            }

            if (!code || (type !== 'backup' && code.length < 6) || (type === 'backup' && code.length < 8)) {
                this.showAlert('Código inválido', 'error');
                return;
            }

            const btn = document.getElementById(btnId);
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
            btn.disabled = true;

            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: this.token, twoFactorCode: code })
                });
                const data = await response.json();

                if (data.success) {
                    this.showAlert('✅ Acesso autorizado!', 'success');
                    localStorage.setItem('auth_token', data.token);

                    try {
                        const userRes = await fetch('/api/auth/me', {
                            headers: { 'Authorization': `Bearer ${data.token}` }
                        });
                        const userData = await userRes.json();
                        if (userData.success) {
                            localStorage.setItem('user_data', JSON.stringify(userData.user));
                        }
                    } catch (e) {
                        const payload = decodeJwtPayload(data.token);
                        if (payload) {
                            localStorage.setItem('user_data', JSON.stringify({
                                id: payload.id,
                                nome: payload.nome || 'Usuário',
                                role: payload.role || 'aluno'
                            }));
                        }
                    }

                    sessionStorage.removeItem('2fa_token');
                    sessionStorage.removeItem('2fa_userId');
                    sessionStorage.removeItem('2fa_message');
                    sessionStorage.removeItem('2fa_from_social');
                    sessionStorage.removeItem('2fa_user_nome');
                    sessionStorage.removeItem('2fa_user_role');

                    await this.oferecerCadastroBiometria(data.token, data.user?.role);
                } else {
                    throw new Error(data.error || 'Código inválido');
                }
            } catch (error) {
                this.showAlert(error.message, 'error');
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }

        async gerarQRCode() {
            try {
                const qrDisplay = document.getElementById('qrCodeDisplay');
                const secretDisplay = document.getElementById('secretKeyDisplay');
                if (!qrDisplay) return;

                qrDisplay.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size: 40px; color: #1e2b4f;"></i>';

                const response = await fetch('/api/auth/2fa/generate-qr', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                const data = await response.json();

                if (data.success) {
                    this.qrData = data;
                    qrDisplay.innerHTML = `<img src="${escapeHtml(data.qrCode)}" style="width: 100%; height: 100%;" alt="QR Code">`;

                    if (secretDisplay) {
                        secretDisplay.textContent = data.secret;
                        secretDisplay.style.display = 'block';
                        if (this.qrSecretHideTimer) clearTimeout(this.qrSecretHideTimer);
                        this.qrSecretHideTimer = setTimeout(() => {
                            if (secretDisplay && this.qrData?.secret) {
                                secretDisplay.textContent = '🔒 Chave oculta — clique para copiar (se necessário)';
                                secretDisplay.style.opacity = '0.6';
                            }
                        }, 30000);
                    }
                } else {
                    throw new Error(data.error || 'Erro ao gerar QR Code');
                }
            } catch (error) {
                console.error('❌ Erro ao gerar QR Code:', error);
                const qrDisplay = document.getElementById('qrCodeDisplay');
                if (qrDisplay) {
                    qrDisplay.innerHTML = `
                        <div style="color: #ef4444; text-align: center;">
                            <i class="fas fa-exclamation-triangle" style="font-size: 40px;"></i>
                            <p style="font-size: 0.8rem; margin-top: 10px;">Erro ao gerar QR Code</p>
                            <button id="qrRetryBtn" style="margin-top:10px;padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;">
                                <i class="fas fa-sync-alt"></i> Tentar novamente
                            </button>
                        </div>`;
                    document.getElementById('qrRetryBtn')?.addEventListener('click', () => this.gerarQRCode());
                }
            }
        }

        copiarChave() {
            if (this.qrData?.secret) {
                navigator.clipboard.writeText(this.qrData.secret);
                this.showAlert('✅ Chave copiada!', 'success');
                const secretDisplay = document.getElementById('secretKeyDisplay');
                if (secretDisplay) {
                    secretDisplay.textContent = this.qrData.secret;
                    secretDisplay.style.opacity = '1';
                }
            }
        }

        async loadBackupCodes() {
            try {
                const container = document.getElementById('backupCodesGrid');
                if (!container) return;
                container.innerHTML = '<div class="loading-codes"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

                const response = await fetch('/api/auth/2fa/backup-codes', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                const data = await response.json();

                if (data.success) {
                    if (data.firstTime && data.backupCodes?.length > 0) {
                        this.backupCodes = data.backupCodes;
                        this.renderBackupCodes();
                        document.getElementById('firstTimeBadge')?.classList.remove('hidden');
                        const descText = document.getElementById('backupDescriptionText');
                        if (descText) {
                            descText.innerHTML = `🔐 <strong>PRIMEIRA ATIVAÇÃO!</strong> Guarde estes ${this.backupCodes.length} códigos em local seguro.`;
                        }
                    } else if (data.total > 0) {
                        this.mostrarMensagemJaExibido(data.total);
                    } else {
                        this.mostrarMensagemJaExibido(0);
                    }
                } else {
                    this.mostrarMensagemJaExibido(data.total || 0);
                }
            } catch (error) {
                const el = document.getElementById('backupCodesGrid');
                if (el) el.innerHTML = '<div class="loading-codes" style="color:#dc3545;"><i class="fas fa-exclamation-triangle"></i> Erro ao carregar</div>';
            }
        }

        mostrarMensagemJaExibido(quantidade) {
            const container = document.getElementById('backupCodesGrid');
            if (!container) return;
            const qtd = parseInt(quantidade) || 0;
            const qtdStatus = qtd === 10 ? 'Completo' : qtd > 5 ? 'Bom' : 'Atenção';
            container.innerHTML = `
                <div class="message-card">
                    <div class="message-header">
                        <i class="fas fa-shield-alt"></i>
                        <h2>Códigos já exibidos</h2>
                        <p>Por segurança, eles só podem ser mostrados uma vez</p>
                    </div>
                    <div class="stats-grid">
                        <div class="stat-card highlight">
                            <div class="stat-value">${escapeHtml(qtd)}</div>
                            <div class="stat-label">códigos restantes</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value">${qtdStatus}</div>
                            <div class="stat-label">status</div>
                        </div>
                    </div>
                    ${qtd === 0 ? `
                        <div class="empty-state">
                            <i class="fas fa-exclamation-circle"></i>
                            <h3>Sem códigos disponíveis</h3>
                            <p>Entre em contato com o administrador</p>
                            <button class="btn-contact" id="contactAdminBtn">
                                <i class="fas fa-envelope"></i> Solicitar novos códigos
                            </button>
                        </div>` : ''}
                </div>`;
            if (qtd === 0) {
                document.getElementById('contactAdminBtn')?.addEventListener('click', () => this.contactAdmin());
            }
        }

        renderBackupCodes() {
            const container = document.getElementById('backupCodesGrid');
            if (!container) return;
            let html = '<div class="codes-grid">';
            this.backupCodes.forEach(code => {
                html += `<div class="code-item" data-code="${escapeHtml(code)}">${escapeHtml(code)}</div>`;
            });
            html += '</div><button class="btn-outline" id="downloadBackupBtn"><i class="fas fa-download"></i> Baixar Códigos</button>';
            container.innerHTML = html;

            document.querySelectorAll('.code-item').forEach(el => {
                el.addEventListener('click', (e) => {
                    const code = e.currentTarget.dataset.code;
                    navigator.clipboard.writeText(code);
                    e.currentTarget.classList.add('copied');
                    e.currentTarget.textContent = '✓ COPIADO!';
                    setTimeout(() => {
                        e.currentTarget.classList.remove('copied');
                        e.currentTarget.textContent = code;
                    }, 1500);
                    this.showAlert('✅ Código copiado!', 'success');
                });
            });
            document.getElementById('downloadBackupBtn')?.addEventListener('click', () => this.downloadBackupCodes());
        }

        async loadUserData() {
            try {
                const response = await fetch('/api/auth/me', {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                const data = await response.json();
                if (data.success && data.user.telefone) {
                    const phone = data.user.telefone;
                    const masked = phone.replace(/(\d{2})(\d{4})(\d{4})/, '($1) ****-$3');
                    const phoneEl = document.getElementById('phoneDisplay');
                    if (phoneEl) phoneEl.textContent = masked;
                    const infoEl = document.getElementById('phoneInfo');
                    if (infoEl) infoEl.style.display = 'flex';
                }
            } catch (error) {}
        }

        startTimer(seconds) {
            if (this.timerInterval) clearInterval(this.timerInterval);
            const display = document.getElementById('timerDisplay');
            if (!display) return;
            let remaining = seconds;
            this.timerInterval = setInterval(() => {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(this.timerInterval);
                    display.textContent = '00:00';
                    const timerEl = document.getElementById('timer');
                    if (timerEl) timerEl.style.color = '#dc3545';
                    return;
                }
                const mins = Math.floor(remaining / 60);
                const secs = remaining % 60;
                display.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                const timerEl = document.getElementById('timer');
                if (timerEl) timerEl.style.color = remaining <= 60 ? '#dc3545' : '';
            }, 1000);
        }

        async requestCode() {
            try {
                await fetch('/api/auth/2fa/resend', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ userId: this.userId })
                });
            } catch (error) {}
        }

        async resendCode() {
            if (this.resendCooldown) {
                this.showAlert('Aguarde 60 segundos', 'error');
                return;
            }
            this.resendCooldown = true;
            setTimeout(() => { this.resendCooldown = false; }, 60000);

            const btn = document.getElementById('resendBtn');
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
            btn.disabled = true;

            try {
                const response = await fetch('/api/auth/2fa/resend', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ userId: this.userId })
                });
                const data = await response.json();
                if (data.success) {
                    this.showAlert('✅ Código reenviado!', 'success');
                    this.startTimer(data.expiresIn || 300);
                } else {
                    throw new Error(data.error || 'Erro ao reenviar');
                }
            } catch (error) {
                this.showAlert(error.message || 'Erro ao reenviar', 'error');
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
        }

        downloadBackupCodes() {
            if (this.backupCodes.length === 0) {
                this.showAlert('Nenhum código disponível', 'error');
                return;
            }
            if (!window.confirm('Baixar os códigos de backup? Guarde o arquivo em local seguro.')) return;

            const content = [
                '='.repeat(50),
                'CÓDIGOS DE BACKUP - EDUCAPLENO',
                '='.repeat(50),
                '',
                '⚠️ Guarde estes códigos em local seguro!',
                'Cada código pode ser usado apenas UMA vez.',
                '',
                ...this.backupCodes.map(c => `📌 ${c}`),
                '',
                '='.repeat(50),
                `Gerado: ${new Date().toLocaleString('pt-BR')}`,
                '='.repeat(50)
            ].join('\n');

            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'iema-backup-codes.txt';
            a.click();
            window.URL.revokeObjectURL(url);
            this.showAlert('📥 Download iniciado!', 'success');
        }

        async contactAdmin() {
            try {
                const btn = document.getElementById('contactAdminBtn');
                if (btn) {
                    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
                    btn.disabled = true;
                }
                const response = await fetch('/api/backup/solicitar', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'Content-Type': 'application/json'
                    }
                });
                const data = await response.json();
                if (data.success) {
                    this.showAlert('✅ Solicitação enviada!', 'success');
                    setTimeout(() => {
                        if (btn) {
                            btn.innerHTML = '<i class="fas fa-envelope"></i> Solicitar novos códigos';
                            btn.disabled = false;
                        }
                    }, 30000);
                } else {
                    throw new Error(data.error || 'Erro ao enviar solicitação');
                }
            } catch (error) {
                this.showAlert(`❌ ${error.message}`, 'error');
                const btn = document.getElementById('contactAdminBtn');
                if (btn) {
                    btn.innerHTML = '<i class="fas fa-envelope"></i> Solicitar novos códigos';
                    btn.disabled = false;
                }
            }
        }

        showAlert(message, type) {
            const container = document.getElementById('alertContainer');
            if (!container) return;
            container.innerHTML = `
                <div class="alert alert-${type}">
                    <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
                    <span id="alertMessageText"></span>
                </div>`;
            const msgEl = document.getElementById('alertMessageText');
            if (msgEl) msgEl.textContent = String(message);
            setTimeout(() => { container.innerHTML = ''; }, 6000);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        window.twoFactorInstance = new TwoFactorAuth();
    });
})();