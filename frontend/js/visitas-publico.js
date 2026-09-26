// frontend/js/visitas-publico.js
// Autorização de Visitas - Página Pública (CÓDIGO DO FRONTEND)

class VisitasPublico {
    constructor() {
        this.apiBase = '/api/visitas-publico';
        this.turmas = [];
        this.cursos = [];
        this.alunos = [];
        this.termos = [];
        
        this.alunoSelecionado = null;
        this.termoAtual = null;
        
        // Estado do formulário
        this.responsavel = {
            nome: '',
            rg: '',
            cpf: '',
            telefone: '',
            email: ''
        };
        
        // LGPD
        this.lgpdAceito = false;
        
        // TOTP
        this.totpSecret = null;
        
        // Assinatura
        this.assinatura = {
            canvas: null,
            ctx: null,
            desenhando: false,
            temAssinatura: false,
            lastX: 0,
            lastY: 0
        };
        
        // Localização
        this.localizacao = null;
    }

    // ============================================
    // INICIALIZAÇÃO
    // ============================================
    async init() {
        console.log('🚀 Iniciando página pública de visitas...');
        
        try {
            const statusRes = await fetch(`${this.apiBase}/status`);
            const statusData = await statusRes.json();
            
            const statusPill = document.getElementById('statusPill');
            
            if (!statusData.success || !statusData.status.visitasAbertas) {
                if (statusPill) {
                    statusPill.className = 'status-pill';
                    statusPill.innerHTML = '<i class="fas fa-circle" style="font-size: 8px;"></i> Autorizações Fechadas';
                }
                this.mostrarIndisponivel(statusData.status?.avisoPublico);
                return;
            }
            
            if (statusPill) {
                statusPill.className = 'status-pill ativo';
                statusPill.innerHTML = '<i class="fas fa-circle" style="font-size: 8px;"></i> Autorizações Abertas';
            }
            
            if (statusData.status.avisoPublico) {
                const avisoContainer = document.getElementById('avisoPublicoContainer');
                const avisoTexto = document.getElementById('avisoPublicoTexto');
                if (avisoContainer && avisoTexto) {
                    avisoTexto.textContent = statusData.status.avisoPublico;
                    avisoContainer.style.display = 'block';
                }
            }
            
            await this.carregarTurmasECursos();
            this.configurarEventos();
            this.capturarLocalizacao();
            
            console.log('✅ Página pública inicializada');
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('Erro ao carregar página', 'error');
        }
    }

    mostrarIndisponivel(aviso) {
        const container = document.querySelector('.container-public');
        if (!container) return;
        
        container.innerHTML = `
            <div class="hero-section">
                <div class="hero-icon" style="background: linear-gradient(135deg, #ef4444, #dc2626);">
                    <i class="fas fa-lock"></i>
                </div>
                <h1>Autorizações Fechadas</h1>
                <p>${aviso || 'As autorizações de visitas não estão abertas no momento.'}</p>
                <p style="font-size: 13px; color: #9ca3af; margin-top: 15px;">
                    <i class="fas fa-info-circle"></i> Volte mais tarde ou entre em contato com a escola.
                </p>
            </div>
        `;
    }

    async carregarTurmasECursos() {
        try {
            const [turmasRes, cursosRes] = await Promise.all([
                fetch(`${this.apiBase}/turmas`),
                fetch(`${this.apiBase}/cursos`)
            ]);
            
            const turmasData = await turmasRes.json();
            const cursosData = await cursosRes.json();
            
            if (turmasData.success && turmasData.turmas) {
                this.turmas = turmasData.turmas;
                this.preencherSelectTurmas();
            }
            
            if (cursosData.success && cursosData.cursos) {
                this.cursos = cursosData.cursos;
                this.preencherSelectCursos();
            }
        } catch (error) {
            console.error('❌ Erro ao carregar dados:', error);
        }
    }

    preencherSelectTurmas() {
        const select = document.getElementById('filtroTurmaPublico');
        if (!select) return;
        
        select.innerHTML = '<option value="">Todas as turmas</option>' +
            this.turmas.map(t => {
                const nome = t.nome || t;
                return `<option value="${nome}">${nome}</option>`;
            }).join('');
    }

    preencherSelectCursos() {
        const select = document.getElementById('filtroCursoPublico');
        if (!select) return;
        
        select.innerHTML = '<option value="">Todos os cursos</option>' +
            this.cursos.map(c => `<option value="${c}">${c}</option>`).join('');
    }

    configurarEventos() {
        const buscaInput = document.getElementById('buscaAlunoPublico');
        if (buscaInput) {
            let timeout;
            buscaInput.addEventListener('input', (e) => {
                clearTimeout(timeout);
                timeout = setTimeout(() => this.buscarAlunos(), 400);
            });
        }
        
        // Máscara CPF
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
        
        // Máscara Telefone
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
        
        // Enter no TOTP verifica
        const totpInput = document.getElementById('totpCodigo');
        if (totpInput) {
            totpInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.verificarTOTP();
                }
            });
        }
    }

    // ============================================
    // PASSO 1: BUSCAR E SELECIONAR ALUNO
    // ============================================
    async buscarAlunos() {
        const turma = document.getElementById('filtroTurmaPublico')?.value;
        const curso = document.getElementById('filtroCursoPublico')?.value;
        const nome = document.getElementById('buscaAlunoPublico')?.value;
        
        if (!turma && !curso && !nome) {
            return;
        }
        
        try {
            const params = new URLSearchParams();
            if (turma) params.append('turma', turma);
            if (curso) params.append('curso', curso);
            if (nome) params.append('nome', nome);
            
            const response = await fetch(`${this.apiBase}/alunos?${params}`);
            const data = await response.json();
            
            if (data.success) {
                this.alunos = data.alunos || [];
                this.renderizarAlunos();
            }
        } catch (error) {
            console.error('❌ Erro:', error);
        }
    }

    renderizarAlunos() {
        const container = document.getElementById('listaAlunosPublico');
        if (!container) return;
        
        if (this.alunos.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 30px; color: #9ca3af;">
                    <i class="fas fa-search" style="font-size: 32px; margin-bottom: 10px; display: block;"></i>
                    <p style="margin: 0;">Nenhum aluno encontrado</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.alunos.map(a => `
            <div class="termo-publico-card" onclick="visitasPublico.selecionarAluno('${a.id}')">
                <h4>${this.escapeHtml(a.nome)}</h4>
                <div class="info"><i class="fas fa-id-card"></i> ${a.matricula || 'N/A'}</div>
                <div class="info"><i class="fas fa-school"></i> ${a.turma || 'N/A'}</div>
                <div class="info"><i class="fas fa-book"></i> ${a.curso || 'N/A'}</div>
                <div style="margin-top: 12px; text-align: right;">
                    <span style="color: #667eea; font-weight: 600; font-size: 13px;">
                        Selecionar <i class="fas fa-arrow-right"></i>
                    </span>
                </div>
            </div>
        `).join('');
    }

    async selecionarAluno(alunoId) {
        const aluno = this.alunos.find(a => a.id === alunoId);
        if (!aluno) return;
        
        this.alunoSelecionado = aluno;
        
        try {
            const response = await fetch(`${this.apiBase}/termos/${alunoId}`);
            const data = await response.json();
            
            if (data.success && data.termos.length > 0) {
                this.termos = data.termos;
                this.mostrarTermos();
            } else {
                this.showToast('Nenhum termo pendente para este aluno', 'info');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('Erro ao buscar termos', 'error');
        }
    }

    mostrarTermos() {
        const container = document.getElementById('listaTermosPublico');
        if (!container) return;
        
        container.innerHTML = this.termos.map(t => `
            <div class="termo-publico-card" onclick="visitasPublico.abrirTermo('${t.id}')">
                <h4>${this.escapeHtml(t.atividade)}</h4>
                <div class="info"><i class="fas fa-chalkboard-teacher"></i> ${this.escapeHtml(t.professor)}</div>
                <div class="info"><i class="fas fa-calendar-alt"></i> ${new Date(t.dataVisita).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
                <div class="info"><i class="fas fa-clock"></i> ${t.horario}</div>
                <div class="info"><i class="fas fa-map-marker-alt"></i> ${this.escapeHtml(t.local)}</div>
                <div style="margin-top: 12px; text-align: right;">
                    <span style="color: #667eea; font-weight: 600; font-size: 13px;">
                        Ver e autorizar <i class="fas fa-arrow-right"></i>
                    </span>
                </div>
            </div>
        `).join('');
        
        document.getElementById('passoBusca').style.display = 'none';
        document.getElementById('secaoTermos').style.display = 'block';
        document.getElementById('secaoDetalhes').style.display = 'none';
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    voltarBusca() {
        document.getElementById('passoBusca').style.display = 'block';
        document.getElementById('secaoTermos').style.display = 'none';
        document.getElementById('secaoDetalhes').style.display = 'none';
    }

    voltarTermos() {
        document.getElementById('passoBusca').style.display = 'none';
        document.getElementById('secaoTermos').style.display = 'block';
        document.getElementById('secaoDetalhes').style.display = 'none';
    }

    // ============================================
    // PASSO 2: ABRIR TERMO
    // ============================================
    async abrirTermo(termoId) {
        try {
            const response = await fetch(`${this.apiBase}/termo/${termoId}`);
            const data = await response.json();
            
            if (!data.success) throw new Error('Termo não encontrado');
            
            this.termoAtual = data.termo;
            this.lgpdAceito = false;
            this.totpSecret = null;
            
            const container = document.getElementById('detalhesTermo');
            if (container) {
                container.innerHTML = `
                    <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; border-radius: 16px; padding: 20px; margin-bottom: 20px;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                            <i class="fas fa-file-alt" style="font-size: 24px;"></i>
                            <h3 style="margin: 0; font-size: 18px;">${this.escapeHtml(this.termoAtual.atividade)}</h3>
                        </div>
                        <div style="background: rgba(255,255,255,0.15); padding: 12px; border-radius: 10px; font-size: 13px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                            <div><strong>Aluno:</strong> ${this.escapeHtml(this.termoAtual.alunoNome)}</div>
                            <div><strong>Turma:</strong> ${this.termoAtual.alunoTurma || 'N/A'}</div>
                            <div><strong>Curso:</strong> ${this.termoAtual.alunoCurso || 'N/A'}</div>
                            <div><strong>Professor:</strong> ${this.escapeHtml(this.termoAtual.professorNome)}</div>
                            <div><strong>Data:</strong> ${new Date(this.termoAtual.dataVisita).toLocaleDateString('pt-BR')}</div>
                            <div><strong>Horário:</strong> ${this.termoAtual.horario}</div>
                            <div style="grid-column: span 2;"><strong>Local:</strong> ${this.escapeHtml(this.termoAtual.local)}</div>
                            ${this.termoAtual.localizacao?.enderecoCompleto ? `
                                <div style="grid-column: span 2; font-size: 12px; opacity: 0.9;">
                                    <i class="fas fa-map-pin"></i> ${this.escapeHtml(this.termoAtual.localizacao.enderecoCompleto)}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            }
            
            document.getElementById('etapaLGPD').style.display = 'block';
            document.getElementById('etapaTOTP').style.display = 'none';
            document.getElementById('etapaDados').style.display = 'none';
            document.getElementById('lgpdCheckbox').checked = false;
            document.getElementById('btnProsseguirLGPD').disabled = true;
            document.getElementById('totpCodigo').value = '';
            
            document.getElementById('passoBusca').style.display = 'none';
            document.getElementById('secaoTermos').style.display = 'none';
            document.getElementById('secaoDetalhes').style.display = 'block';
            
            window.scrollTo({ top: 0, behavior: 'smooth' });
            
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('Erro ao abrir termo', 'error');
        }
    }

    // ============================================
    // ETAPA 1: LGPD
    // ============================================
    toggleBotaoLGPD(checked) {
        const btn = document.getElementById('btnProsseguirLGPD');
        if (btn) btn.disabled = !checked;
    }

    prosseguirParaAutenticacao() {
        const lgpdAceito = document.getElementById('lgpdCheckbox')?.checked;
        
        if (!lgpdAceito) {
            return this.showToast('Você precisa aceitar os termos da LGPD', 'error');
        }
        
        this.lgpdAceito = true;
        
        document.getElementById('etapaLGPD').style.display = 'none';
        document.getElementById('etapaTOTP').style.display = 'block';
        
        this.gerarQRCodeTOTP();
        
        window.scrollTo({ top: 200, behavior: 'smooth' });
    }

    // ============================================
    // ETAPA 2: TOTP
    // ============================================
    async gerarQRCodeTOTP() {
        try {
            document.getElementById('totpLoading').style.display = 'flex';
            document.getElementById('totpQRCodeBox').style.display = 'none';
            
            const response = await fetch(`${this.apiBase}/gerar-qrcode-totp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    termoId: this.termoAtual.id
                })
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Erro ao gerar QR Code');
            }
            
            if (data.jaVerificado) {
                this.irParaEtapaDados();
                return;
            }
            
            document.getElementById('totpLoading').style.display = 'none';
            document.getElementById('totpQRCodeBox').style.display = 'block';
            document.getElementById('totpQRCodeImg').src = data.qrCode;
            
            this.totpSecret = data.secret;
            
            console.log('✅ QR Code TOTP pronto');
            
            setTimeout(() => {
                document.getElementById('totpCodigo')?.focus();
            }, 300);
            
        } catch (error) {
            console.error('❌ Erro:', error);
            document.getElementById('totpLoading').innerHTML = `
                <i class="fas fa-exclamation-triangle" style="color: #ef4444; font-size: 42px;"></i>
                <span style="color: #ef4444;">Erro ao gerar QR Code</span>
                <button class="btn-filter" onclick="visitasPublico.gerarQRCodeTOTP()" style="margin-top: 10px;">
                    <i class="fas fa-sync-alt"></i> Tentar novamente
                </button>
            `;
        }
    }

    async verificarTOTP() {
        const codigo = document.getElementById('totpCodigo')?.value;
        
        if (!codigo || codigo.length !== 6) {
            return this.showToast('Digite o código de 6 dígitos do Google Authenticator', 'error');
        }
        
        const btn = event?.target?.closest('button');
        
        try {
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';
            }
            
            const response = await fetch(`${this.apiBase}/verificar-totp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    termoId: this.termoAtual.id,
                    codigo
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showToast('✅ Autenticado com sucesso!', 'success');
                this.irParaEtapaDados();
            } else {
                throw new Error(data.error || 'Código inválido');
            }
            
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
            
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-check-circle"></i> Verificar Código';
            }
            
            document.getElementById('totpCodigo').value = '';
            document.getElementById('totpCodigo').focus();
        }
    }

    // ============================================
    // ETAPA 3: DADOS + ASSINATURA
    // ============================================
    irParaEtapaDados() {
        document.getElementById('etapaLGPD').style.display = 'none';
        document.getElementById('etapaTOTP').style.display = 'none';
        document.getElementById('etapaDados').style.display = 'block';
        
        setTimeout(() => this.inicializarAssinatura(), 200);
        
        window.scrollTo({ top: 200, behavior: 'smooth' });
    }

    // ============================================
    // ASSINATURA
    // ============================================
    inicializarAssinatura() {
        const canvas = document.getElementById('assinaturaCanvasPublic');
        if (!canvas) return;
        if (canvas.dataset.init === 'true') return;
        canvas.dataset.init = 'true';
        
        const container = canvas.parentElement;
        const placeholder = document.getElementById('assinaturaPlaceholderPublic');
        
        const ajustarCanvas = () => {
            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0) {
                setTimeout(ajustarCanvas, 200);
                return;
            }
            const dpr = window.devicePixelRatio || 1;
            canvas.width = rect.width * dpr;
            canvas.height = 180 * dpr;
            canvas.style.height = '180px';
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#667eea';
            this.assinatura.canvas = canvas;
            this.assinatura.ctx = ctx;
        };
        
        ajustarCanvas();
        
        const getPos = (e) => {
            const rect = canvas.getBoundingClientRect();
            let clientX, clientY;
            if (e.touches) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }
            return { x: clientX - rect.left, y: clientY - rect.top };
        };
        
        const iniciar = (e) => {
            e.preventDefault();
            this.assinatura.desenhando = true;
            const pos = getPos(e);
            this.assinatura.lastX = pos.x;
            this.assinatura.lastY = pos.y;
            this.assinatura.temAssinatura = true;
            if (container) container.classList.add('ativa');
            if (placeholder) placeholder.classList.add('escondido');
        };
        
        const desenhar = (e) => {
            if (!this.assinatura.desenhando) return;
            e.preventDefault();
            const pos = getPos(e);
            this.assinatura.ctx.beginPath();
            this.assinatura.ctx.moveTo(this.assinatura.lastX, this.assinatura.lastY);
            this.assinatura.ctx.lineTo(pos.x, pos.y);
            this.assinatura.ctx.stroke();
            this.assinatura.lastX = pos.x;
            this.assinatura.lastY = pos.y;
        };
        
        const parar = (e) => {
            if (e && e.preventDefault) e.preventDefault();
            this.assinatura.desenhando = false;
            if (container) container.classList.remove('ativa');
        };
        
        canvas.addEventListener('mousedown', iniciar);
        canvas.addEventListener('mousemove', desenhar);
        canvas.addEventListener('mouseup', parar);
        canvas.addEventListener('mouseleave', () => {
            if (this.assinatura.desenhando) parar();
        });
        canvas.addEventListener('touchstart', iniciar, { passive: false });
        canvas.addEventListener('touchmove', desenhar, { passive: false });
        canvas.addEventListener('touchend', parar, { passive: false });
    }

    limparAssinatura() {
        if (!this.assinatura.canvas || !this.assinatura.ctx) return;
        const rect = this.assinatura.canvas.getBoundingClientRect();
        this.assinatura.ctx.clearRect(0, 0, rect.width, rect.height);
        this.assinatura.temAssinatura = false;
        const placeholder = document.getElementById('assinaturaPlaceholderPublic');
        if (placeholder) placeholder.classList.remove('escondido');
    }

    capturarLocalizacao() {
        if (!navigator.geolocation) {
            console.warn('⚠️ Geolocalização não suportada');
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                
                try {
                    const response = await fetch(`${this.apiBase}/geocoding-reverso`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ latitude, longitude })
                    });
                    
                    const data = await response.json();
                    
                    this.localizacao = {
                        latitude,
                        longitude,
                        accuracy,
                        endereco: data.success ? data.endereco : ''
                    };
                    
                    console.log('📍 Localização capturada:', this.localizacao);
                } catch (e) {
                    this.localizacao = { latitude, longitude, accuracy };
                }
            },
            (error) => {
                console.warn('⚠️ Erro ao obter localização:', error.message);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }

    // ============================================
    // AUTORIZAR
    // ============================================
    async autorizar() {
        const nome = document.getElementById('respNome')?.value?.trim();
        const rg = document.getElementById('respRG')?.value?.trim();
        const cpf = document.getElementById('respCPF')?.value?.trim();
        const telefone = document.getElementById('respTelefone')?.value?.trim();
        const email = document.getElementById('respEmail')?.value?.trim();
        
        if (!nome || nome.length < 5) return this.showToast('Informe seu nome completo', 'error');
        if (!rg || rg.length < 5) return this.showToast('Informe o RG', 'error');
        if (!cpf || cpf.replace(/\D/g, '').length !== 11) return this.showToast('CPF inválido', 'error');
        if (!telefone || telefone.replace(/\D/g, '').length < 10) return this.showToast('Telefone inválido', 'error');
        
        if (!this.assinatura.temAssinatura) {
            return this.showToast('Assine o documento antes de continuar', 'error');
        }
        
        const assinaturaBase64 = this.assinatura.canvas.toDataURL('image/png');
        
        try {
            this.showToast('📝 Salvando autorização...', 'info');
            
            const response = await fetch(`${this.apiBase}/autorizar/${this.termoAtual.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome,
                    rg,
                    cpf: cpf.replace(/\D/g, ''),
                    telefone: telefone.replace(/\D/g, ''),
                    email: email || '',
                    lgpdAceito: true,
                    assinaturaBase64,
                    localizacao: this.localizacao
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.responsavel = { nome, rg, cpf, telefone, email };
                this.mostrarSucesso(data.termo);
            } else {
                throw new Error(data.error || 'Erro ao autorizar');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    async recusar() {
        const motivo = prompt('Por favor, informe o motivo da recusa (opcional):');
        
        if (motivo === null) return;
        
        const confirmar = confirm('Tem certeza que deseja RECUSAR a participação?');
        if (!confirmar) return;
        
        try {
            const response = await fetch(`${this.apiBase}/recusar/${this.termoAtual.id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    motivo: motivo || 'Não informado',
                    nome: 'Responsável'
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showToast('Recusa registrada. O professor será notificado.', 'info');
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
    }

    // ============================================
    // SUCESSO
    // ============================================
    mostrarSucesso(termo) {
        const container = document.querySelector('.container-public');
        
        container.innerHTML = `
            <div class="hero-section">
                <div class="sucesso-icon">
                    <i class="fas fa-check"></i>
                </div>
                <h1 style="color: #065f46;">Autorização Confirmada!</h1>
                <p style="color: #6b7280;">
                    Você autorizou a visita de <strong>${this.escapeHtml(termo.alunoNome)}</strong>.
                </p>
                
                <div style="background: #f0fdf4; border-radius: 16px; padding: 20px; margin: 25px 0; text-align: left; border-left: 4px solid #10b981;">
                    <h3 style="margin: 0 0 15px; color: #065f46; font-size: 1rem;">
                        <i class="fas fa-file-alt"></i> Detalhes da Autorização
                    </h3>
                    <div style="font-size: 13px; line-height: 1.8;">
                        <div><strong>Código:</strong> <code style="background: #e5e7eb; padding: 2px 8px; border-radius: 4px;">${termo.codigo}</code></div>
                        <div><strong>Aluno:</strong> ${this.escapeHtml(termo.alunoNome)}</div>
                        <div><strong>Atividade:</strong> ${this.escapeHtml(termo.atividade)}</div>
                        <div><strong>Data:</strong> ${new Date(termo.dataVisita).toLocaleDateString('pt-BR')}</div>
                        <div><strong>Local:</strong> ${this.escapeHtml(termo.local)}</div>
                        <div><strong>Responsável:</strong> ${this.escapeHtml(this.responsavel.nome)}</div>
                    </div>
                </div>
                
                <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; margin-top: 20px;">
                    <button class="btn-autorizar-grande" onclick="visitasPublico.imprimirTermoOficial('${termo.id}')" 
                            style="max-width: 320px; padding: 15px 30px;">
                        <i class="fas fa-file-pdf"></i> Imprimir Termo Assinado
                    </button>
                </div>
                
                <p style="margin-top: 25px; font-size: 12px; color: #9ca3af;">
                    <i class="fas fa-shield-alt"></i> 
                    Documento com assinaturas do responsável e do gestor.
                </p>
            </div>
        `;
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ============================================
    // 📄 IMPRIMIR TERMO OFICIAL (endpoint do backend)
    // ============================================
    async imprimirTermoOficial(termoId) {
        try {
            this.showToast('📄 Gerando termo oficial...', 'info');
            
            const response = await fetch(`${this.apiBase}/termo-oficial/${termoId}`);
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Erro ao gerar termo');
            }
            
            // Abrir em nova janela para impressão
            const win = window.open('', '_blank');
            win.document.write(data.html);
            win.document.close();
            
            win.onload = () => {
                setTimeout(() => {
                    win.print();
                }, 800);
            };
            
        } catch (error) {
            console.error('❌ Erro:', error);
            this.showToast('❌ ' + error.message, 'error');
        }
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
        toast.style.cssText = `
            position: fixed; top: 20px; right: 20px;
            padding: 14px 20px; border-radius: 12px;
            background: ${tipo === 'success' ? '#10b981' : tipo === 'error' ? '#ef4444' : '#3b82f6'};
            color: white; font-size: 14px; font-weight: 500;
            box-shadow: 0 8px 20px rgba(0,0,0,0.2);
            z-index: 99999; max-width: 340px;
            animation: slideIn 0.3s ease;
        `;
        toast.textContent = mensagem;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    fecharModalErro() {
        document.getElementById('modalErro')?.classList.remove('active');
    }

    fecharModalSucesso() {
        document.getElementById('modalSucesso')?.classList.remove('active');
    }
}

// ============================================
// INICIALIZAÇÃO
// ============================================
const visitasPublico = new VisitasPublico();
window.visitasPublico = visitasPublico;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => visitasPublico.init());
} else {
    visitasPublico.init();
}

console.log('✅ visitas-publico.js (frontend) carregado');