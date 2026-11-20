// ============================================================================
// frontend/inscricoes/js/vincular-biometria.js
// Página pública de vínculo de passkey para responsáveis que não cadastraram
// durante a inscrição.
// ============================================================================
'use strict';

class VincularBiometria {
    constructor() {
        this.apiBase = '/api/inscricoes';
        this.apiPasskey = '/api/inscricoes/passkeys';

        this.turmas = [];
        this.cursos = [];
        this.alunos = [];
        this.alunoSelecionado = null;

        this.etapaAtual = 0;
        this._locks = {
            buscarAlunos: false,
            selecionarAluno: false,
            cadastrarPasskey: false,
            carregarDados: false
        };
    }

    // ============================================
    // HELPERS BASE64URL
    // ============================================
    _b64urlParaBuf(b64url) {
        const s = String(b64url).replace(/-/g, '+').replace(/_/g, '/');
        const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
        const bin = atob(s + pad);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        return buf;
    }

    _bufParaB64url(buf) {
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }

    // ============================================
    // CONTROLE DE ETAPAS
    // ============================================
    _mostrarTela(id) {
        const telas = ['telaIntroducao', 'etapa1Aluno', 'etapa2Responsavel', 'etapa3Biometria', 'telaSucesso'];
        telas.forEach(t => {
            const el = document.getElementById(t);
            if (el) el.style.display = 'none';
        });
        const alvo = document.getElementById(id);
        if (alvo) alvo.style.display = 'block';
    }

    _atualizarStepper(etapa) {
        const stepper = document.getElementById('stepperGlobal');
        if (!stepper) return;

        if (etapa >= 1 && etapa <= 3) {
            stepper.style.display = 'block';
        } else {
            stepper.style.display = 'none';
        }

        const items = stepper.querySelectorAll('.stepper-item');
        items.forEach((item, idx) => {
            const stepNum = idx + 1;
            item.classList.remove('active', 'done');
            const icons = ['fa-user-graduate', 'fa-id-card', 'fa-fingerprint'];
            if (stepNum < etapa) {
                item.classList.add('done');
                item.querySelector('.stepper-dot').innerHTML = '<i class="fas fa-check"></i>';
            } else if (stepNum === etapa) {
                item.classList.add('active');
                item.querySelector('.stepper-dot').innerHTML = `<i class="fas ${icons[idx]}"></i>`;
            } else {
                item.querySelector('.stepper-dot').innerHTML = `<i class="fas ${icons[idx]}"></i>`;
            }
        });

        const fill = document.getElementById('stepperProgressFill');
        if (fill) {
            const percent = Math.max(0, ((etapa - 1) / 2) * 100);
            fill.style.width = percent + '%';
        }
    }

    irParaEtapa(etapa) {
        this.etapaAtual = etapa;
        this._atualizarStepper(etapa);

        switch (etapa) {
            case 1:
                this._mostrarTela('etapa1Aluno');
                break;
            case 2:
                this._mostrarTela('etapa2Responsavel');
                this._renderizarAlunoSelecionado();
                break;
            case 3:
                this._mostrarTela('etapa3Biometria');
                break;
            case 0:
                this._mostrarTela('telaIntroducao');
                this._atualizarStepper(0);
                break;
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    iniciarFluxo() {
        this.irParaEtapa(1);
    }

    voltarParaEtapa(etapa) {
        this.irParaEtapa(etapa);
    }

    reiniciarFluxo() {
        location.reload();
    }

    // ============================================
    // INIT
    // ============================================
    async init() {
        console.log('🚀 Iniciando página de vínculo de biometria...');
        try {
            await this.carregarDadosIniciais();
            this.configurarEventos();
            this._mostrarTela('telaIntroducao');
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('Erro ao carregar página', 'error');
        }
    }

    async carregarDadosIniciais() {
        if (this._locks.carregarDados) return;
        this._locks.carregarDados = true;

        try {
            const [turmasRes, cursosRes] = await Promise.all([
                fetch('/api/visitas-publico/turmas'),
                fetch('/api/visitas-publico/cursos')
            ]);

            const [turmasData, cursosData] = await Promise.all([
                turmasRes.json(),
                cursosRes.json()
            ]);

            if (turmasData.success && turmasData.turmas) {
                this.turmas = turmasData.turmas;
                this._preencherSelectTurmas();
            }

            if (cursosData.success && cursosData.cursos) {
                this.cursos = cursosData.cursos;
                this._preencherSelectCursos();
            }

            console.log('✅ Dados iniciais carregados');
        } catch (error) {
            console.error('❌ Erro ao carregar dados iniciais:', error);
            throw error;
        } finally {
            this._locks.carregarDados = false;
        }
    }

    _preencherSelectTurmas() {
        const select = document.getElementById('filtroTurma');
        if (!select) return;
        select.innerHTML = '<option value="">Todas as turmas</option>' +
            this.turmas.map(t => {
                const nome = t.nome || t;
                return `<option value="${this.escapeHtml(nome)}">${this.escapeHtml(nome)}</option>`;
            }).join('');
    }

    _preencherSelectCursos() {
        const select = document.getElementById('filtroCurso');
        if (!select) return;
        select.innerHTML = '<option value="">Todos os cursos</option>' +
            this.cursos.map(c => `<option value="${this.escapeHtml(c)}">${this.escapeHtml(c)}</option>`).join('');
    }

    configurarEventos() {
        const buscaInput = document.getElementById('buscaAluno');
        if (buscaInput) {
            let timeout;
            buscaInput.addEventListener('input', () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => this.buscarAlunos(), 400);
            });
        }

        const cpfInput = document.getElementById('respCPF');
        if (cpfInput) {
            cpfInput.addEventListener('input', (e) => {
                let v = e.target.value.replace(/\D/g, '').slice(0, 11);
                if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
                else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
                else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
                e.target.value = v;
            });
        }

        const telInput = document.getElementById('respTelefone');
        if (telInput) {
            telInput.addEventListener('input', (e) => {
                let v = e.target.value.replace(/\D/g, '').slice(0, 11);
                if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
                else if (v.length > 6) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
                else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
                e.target.value = v;
            });
        }
    }

    // ============================================
    // ETAPA 1 — BUSCAR E SELECIONAR ALUNO
    // ============================================
    async buscarAlunos() {
        if (this._locks.buscarAlunos) return;
        this._locks.buscarAlunos = true;

        const turma = document.getElementById('filtroTurma')?.value;
        const curso = document.getElementById('filtroCurso')?.value;
        const nome = document.getElementById('buscaAluno')?.value;

        if (!turma && !curso && !nome) {
            this._renderizarEstadoInicial();
            this._locks.buscarAlunos = false;
            return;
        }

        try {
            const params = new URLSearchParams();
            if (turma) params.append('turma', turma);
            if (curso) params.append('curso', curso);
            if (nome) params.append('nome', nome);

            const response = await fetch(`/api/visitas-publico/alunos?${params}`);
            const data = await response.json();

            if (data.success) {
                this.alunos = data.alunos || [];
                this._renderizarAlunos();
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('Erro ao buscar alunos', 'error');
        } finally {
            this._locks.buscarAlunos = false;
        }
    }

    _renderizarEstadoInicial() {
        const container = document.getElementById('listaAlunos');
        if (!container) return;

        this.alunos = [];
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #9ca3af; grid-column: 1 / -1;">
                <i class="fas fa-filter" style="font-size: 42px; margin-bottom: 15px; display: block; color: #d1d5db;"></i>
                <p style="margin: 0 0 8px; font-weight: 600; color: #6b7280;">
                    Selecione uma turma ou curso
                </p>
                <p style="margin: 0; font-size: 13px;">
                    Use os filtros acima ou busque pelo nome do aluno
                </p>
            </div>
        `;
    }

    _renderizarAlunos() {
        const container = document.getElementById('listaAlunos');
        if (!container) return;

        if (this.alunos.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #9ca3af; grid-column: 1 / -1;">
                    <i class="fas fa-search" style="font-size: 32px; margin-bottom: 10px; display: block;"></i>
                    <p style="margin: 0;">Nenhum aluno encontrado</p>
                </div>
            `;
            return;
        }

        const limite = 50;
        const lista = this.alunos.slice(0, limite);
        const temMais = this.alunos.length > limite;

        const cardsHTML = lista.map(a => `
            <div class="aluno-card" data-aluno-id="${this.escapeHtml(a.id)}">
                <h4>${this.escapeHtml(a.nome)}</h4>
                <div class="info"><i class="fas fa-id-card"></i> ${this.escapeHtml(a.matricula || 'N/A')}</div>
                <div class="info"><i class="fas fa-school"></i> ${this.escapeHtml(a.turma || 'N/A')}</div>
                <div class="info"><i class="fas fa-book"></i> ${this.escapeHtml(a.curso || 'N/A')}</div>
                <div style="margin-top: 10px; text-align: right;">
                    <span style="color: #0f766e; font-weight: 600; font-size: 12.5px;">
                        Selecionar <i class="fas fa-arrow-right"></i>
                    </span>
                </div>
            </div>
        `).join('');

        const avisoHTML = temMais ? `
            <div style="grid-column: 1 / -1; text-align: center; padding: 16px; color: #6b7280; font-size: 13px; background: #f9fafb; border-radius: 12px; border: 1px dashed #d1d5db;">
                <i class="fas fa-info-circle" style="color: #0f766e;"></i>
                Mostrando ${limite} de ${this.alunos.length} alunos. Refine os filtros para ver os demais.
            </div>
        ` : '';

        container.innerHTML = cardsHTML + avisoHTML;

        container.querySelectorAll('.aluno-card').forEach(card => {
            card.addEventListener('click', () => {
                this.selecionarAluno(card.dataset.alunoId);
            });
        });
    }

    selecionarAluno(alunoId) {
        if (this._locks.selecionarAluno) return;
        this._locks.selecionarAluno = true;

        const aluno = this.alunos.find(a => a.id === alunoId);
        if (!aluno) {
            this._locks.selecionarAluno = false;
            return;
        }

        this.alunoSelecionado = aluno;

        const nomeEl = document.getElementById('nomeAlunoEtapa2');
        if (nomeEl) nomeEl.textContent = `Aluno: ${aluno.nome}`;

        ['respNome', 'respCPF', 'respTelefone', 'respEmail'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        const lgpd = document.getElementById('lgpdCheckbox');
        if (lgpd) lgpd.checked = false;
        const btn = document.getElementById('btnProsseguirDados');
        if (btn) btn.disabled = true;

        this.irParaEtapa(2);
        this._locks.selecionarAluno = false;
    }

    _renderizarAlunoSelecionado() {
        const container = document.getElementById('alunoSelecionadoCard');
        if (!container || !this.alunoSelecionado) return;

        const a = this.alunoSelecionado;
        container.innerHTML = `
            <i class="fas fa-user-graduate"></i>
            <div>
                <strong>${this.escapeHtml(a.nome)}</strong>
                <small>${this.escapeHtml(a.turma || '')} · ${this.escapeHtml(a.curso || '')}</small>
            </div>
        `;
    }

    // ============================================
    // ETAPA 2 — LGPD
    // ============================================
    toggleBotaoLGPD(checked) {
        const btn = document.getElementById('btnProsseguirDados');
        if (btn) btn.disabled = !checked;
    }

    // ============================================
    // ETAPA 3 — CADASTRAR PASSKEY
    // ============================================
    async cadastrarPasskey() {
        if (this._locks.cadastrarPasskey) return;

        const nome = document.getElementById('respNome')?.value?.trim();
        const cpf = (document.getElementById('respCPF')?.value || '').replace(/\D/g, '');
        const telefone = (document.getElementById('respTelefone')?.value || '').replace(/\D/g, '');

        if (!nome || nome.length < 5) return this.showToast('Informe seu nome completo', 'error');
        if (cpf.length !== 11) return this.showToast('CPF inválido (11 dígitos)', 'error');
        if (telefone.length < 10) return this.showToast('Telefone inválido', 'error');

        if (!window.PublicKeyCredential) {
            return this.showToast('Este navegador não suporta passkey. Use Chrome, Safari ou Edge atualizado.', 'error');
        }

        this._locks.cadastrarPasskey = true;

        const btn = document.getElementById('btnCadastrarPasskey');
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Aguardando dispositivo...';

        const statusBox = document.getElementById('biometriaStatus');
        const statusTexto = document.getElementById('biometriaStatusTexto');
        statusBox.style.display = 'flex';
        statusTexto.textContent = 'Solicitando cadastro de passkey...';

        try {
            // 1. Inicia cadastro no servidor
            const respInicio = await fetch(`${this.apiPasskey}/registrar/iniciar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cpf, nome })
            });
            const dataInicio = await respInicio.json();

            if (!dataInicio.success) {
                throw new Error(dataInicio.error || 'Falha ao iniciar cadastro.');
            }

            const o = dataInicio.opcoes;

            // 2. Chama o navegador
            const publicKey = {
                challenge: this._b64urlParaBuf(o.challenge),
                rp: o.rp,
                user: {
                    id: this._b64urlParaBuf(o.user.id),
                    name: o.user.name,
                    displayName: o.user.displayName
                },
                pubKeyCredParams: o.pubKeyCredParams,
                authenticatorSelection: o.authenticatorSelection,
                timeout: o.timeout,
                attestation: o.attestation
            };

            statusTexto.textContent = 'Confirme com a digital, rosto ou senha do seu dispositivo...';

            let cred;
            try {
                cred = await navigator.credentials.create({ publicKey });
            } catch (err) {
                const nomeErr = err && err.name ? err.name : '';
                if (nomeErr === 'NotAllowedError') {
                    throw new Error('Cadastro cancelado ou tempo esgotado. Tente novamente.');
                }
                if (nomeErr === 'InvalidStateError') {
                    throw new Error('Este dispositivo já possui uma passkey para este CPF.');
                }
                if (nomeErr === 'ConstraintError') {
                    throw new Error('O gerenciador de passkeys do dispositivo está cheio.');
                }
                throw new Error(err.message || 'Falha ao criar passkey.');
            }

            if (!cred) throw new Error('Cadastro cancelado.');

            // 3. Envia ao servidor — 🔥 AGORA COM VÍNCULO DO ALUNO
            statusTexto.textContent = 'Salvando passkey...';

            const aluno = this.alunoSelecionado || {};
            // O aluno pode vir de "Inscrição" ou "Matrícula"
            // O campo `origem` é definido pelo endpoint /api/visitas-publico/alunos
            const origem = aluno.origem || '';
            const ehInscricao = origem === 'Inscrição';
            const ehMatricula = origem === 'Matrícula';

            const payload = {
                cpf,
                nome,
                // 🔥 Vínculo do aluno
                alunoNome: aluno.nome || '',
                alunoTurma: aluno.turma || '',
                alunoCurso: aluno.curso || '',
                alunoOrigem: origem,
                inscricaoId: ehInscricao ? aluno.id : null,
                matriculaId: ehMatricula ? aluno.id : null,
                // Credencial
                credential: {
                    id: cred.id,
                    rawId: this._bufParaB64url(cred.rawId),
                    type: cred.type,
                    response: {
                        clientDataJSON: this._bufParaB64url(cred.response.clientDataJSON),
                        attestationObject: this._bufParaB64url(cred.response.attestationObject),
                        transports: (cred.response.getTransports && cred.response.getTransports()) || []
                    }
                }
            };

            const respFim = await fetch(`${this.apiPasskey}/registrar/concluir`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const dataFim = await respFim.json();

            if (!dataFim.success) {
                throw new Error(dataFim.error || 'Falha ao salvar passkey.');
            }

            // 4. Sucesso
            statusBox.style.display = 'none';
            const previewBox = document.getElementById('biometriaPreviewBox');
            previewBox.classList.add('sucesso');
            document.getElementById('biometriaPreviewIcon').innerHTML = '<i class="fas fa-check"></i>';
            document.getElementById('biometriaPreviewTitulo').textContent = 'Passkey cadastrada!';
            document.getElementById('biometriaPreviewTexto').textContent = 'Sua biometria foi vinculada com sucesso.';

            btn.innerHTML = '<i class="fas fa-check"></i> Cadastrada';
            btn.style.background = 'linear-gradient(135deg, #10b981, #059669)';

            this.showToast('✅ Passkey cadastrada com sucesso!', 'success');

            setTimeout(() => this._mostrarSucesso(dataFim.credentialId), 1200);

        } catch (err) {
            console.error('❌ Erro:', err);
            statusBox.style.display = 'none';
            this.showToast('❌ ' + (err.message || 'Falha ao cadastrar passkey'), 'error');
            btn.disabled = false;
            btn.innerHTML = original;
        } finally {
            this._locks.cadastrarPasskey = false;
        }
    }

    _mostrarSucesso(credentialId) {
        this._mostrarTela('telaSucesso');
        this._atualizarStepper(0);

        const msgEl = document.getElementById('sucessoMensagem');
        if (msgEl) {
            msgEl.innerHTML = `A passkey de <strong>${this.escapeHtml(this.alunoSelecionado?.nome || '')}</strong> foi vinculada com sucesso.`;
        }

        const detalhes = document.getElementById('sucessoDetalhes');
        if (detalhes) {
            detalhes.innerHTML = `
                <h3 style="margin: 0 0 12px; color: #065f46; font-size: 1rem;">
                    <i class="fas fa-file-alt"></i> Detalhes do Vínculo
                </h3>
                <div><strong>Aluno:</strong> ${this.escapeHtml(this.alunoSelecionado?.nome || '-')}</div>
                <div><strong>Turma:</strong> ${this.escapeHtml(this.alunoSelecionado?.turma || '-')}</div>
                <div><strong>Curso:</strong> ${this.escapeHtml(this.alunoSelecionado?.curso || '-')}</div>
                <div><strong>Responsável:</strong> ${this.escapeHtml(document.getElementById('respNome')?.value || '')}</div>
                <div><strong>Credential ID:</strong> <code style="font-size: 11px; word-break: break-all;">${this.escapeHtml(credentialId || '-')}</code></div>
            `;
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ============================================
    // UTILITÁRIOS
    // ============================================
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showToast(mensagem, tipo = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast-public ${tipo}`;
        toast.textContent = mensagem;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }
}

// ============================================
// INICIALIZAÇÃO
// ============================================
const vincularBiometria = new VincularBiometria();
window.vincularBiometria = vincularBiometria;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => vincularBiometria.init());
} else {
    vincularBiometria.init();
}