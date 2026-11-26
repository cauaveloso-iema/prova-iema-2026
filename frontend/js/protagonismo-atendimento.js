// js/protagonismo-atendimento.js
// ============================================================
// ATENDIMENTO — PAINEL PROTAGONISMO
// ✅ Padrão 2chamada-pedagogico: Registrar / Dashboard / Relatórios
// ✅ Rascunho automático + banner de restauração
// ✅ Assinatura via QR Code + canvas inline
// ✅ Impressão em formato "documento oficial"
// ✅ Ações no histórico: Ver / Editar / Imprimir / Excluir
// ============================================================

(function () {
    'use strict';

    // ============ ESTADO ============
    const state = {
        alunosBuscados: [],
        alunoSelecionado: null,
        registros: [],
        paginacao: { pagina: 1, porPagina: 10, total: 0, totalPaginas: 0 },
        filtros: { mes: '', busca: '' },
        modoEdicao: { ativo: false, registroId: null, codigoProtocolo: null },
        sessaoAssinatura: {
            sessaoId: null,
            assinaturaCapturada: null,
            qrCodeDataUrl: null,
            intervaloMonitoramento: null,
            modalInstance: null,
            canvasInline: {
                ctx: null, canvas: null, wrapper: null, placeholder: null,
                desenhando: false, temAssinatura: false, lastX: 0, lastY: 0
            }
        },
        rascunho: { timer: null, restaurando: false, globaisVinculados: false },
        charts: { categoria: null, mes: null, turma: null },
        relatorio: {
            dados: null,
            carregando: false,
            exportavel: false
        },
        dashboardCache: { dados: null, timestamp: 0 }
    };

    // ============ HELPERS ============
    function getToken() { return localStorage.getItem('auth_token'); }

    function getDataLocalISO(dateObj) {
        const d = dateObj || new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function showToast(msg, tipo) {
        if (typeof window.mostrarToast === 'function') {
            window.mostrarToast(msg, tipo || 'info');
        } else {
            console.log('[Atendimento]', tipo || 'info', msg);
        }
    }

    function gerarUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function formatarDataHora(iso) {
        if (!iso) return '-';
        try { return new Date(iso).toLocaleString('pt-BR'); } catch (e) { return '-'; }
    }

    function labelCategoria(cat) {
        const map = {
            'pedagogico': 'Pedagógico',
            'disciplinar': 'Disciplinar',
            'orientacao': 'Orientação',
            'acolhimento': 'Acolhimento',
            'outros': 'Outros'
        };
        return map[cat] || cat || '-';
    }

    function formatarMesAno(mesAno) {
        // "2025-01" → "Jan/2025"
        if (!mesAno) return '-';
        try {
            const [ano, mes] = mesAno.split('-');
            const nomes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
            return `${nomes[parseInt(mes, 10) - 1]}/${ano}`;
        } catch (e) { return mesAno; }
    }

    // ============================================
    // RASCUNHO DO ATENDIMENTO
    // ============================================
    const RASCUNHO_VERSAO = 1;
    const RASCUNHO_INTERVALO_MS = 700;
    const RASCUNHO_VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

    function chaveRascunho() {
        let uid = 'anon';
        try {
            const u = JSON.parse(localStorage.getItem('user_data') || '{}');
            uid = u.id || u._id || u.email || u.nome || 'anon';
        } catch (e) {}
        return `protagonismo_rascunho_atendimento_${uid}`;
    }

    function coletarDadosRascunho() {
        const val = (id) => document.getElementById(id)?.value || '';
        const p = state.alunoSelecionado;
        return {
            versao: RASCUNHO_VERSAO,
            salvoEm: Date.now(),
            aluno: p ? { id: p._id || p.id, nome: p.nome, matricula: p.matricula, turma: p.turma, curso: p.curso } : null,
            data: val('atendDataAtendimento'),
            categoria: val('atendCategoria'),
            categoriaOutros: val('atendCategoriaOutros'),
            motivo: val('atendMotivoPrincipal'),
            encaminhamento: val('atendEncaminhamento'),
            observacoes: val('atendObservacoesAdicionais'),
            precisaAssinatura: document.getElementById('atendNecessitaAssinatura')?.checked || false,
            assinaturaBase64: state.sessaoAssinatura.assinaturaCapturada || null,
            modoEdicao: state.modoEdicao.ativo
                ? { registroId: state.modoEdicao.registroId, codigoProtocolo: state.modoEdicao.codigoProtocolo }
                : null
        };
    }

    function salvarRascunhoAgora() {
        if (state.rascunho.restaurando) return;
        try {
            if (!document.getElementById('atendCardDados')) return;
            if (!state.alunoSelecionado) return;
            const dados = coletarDadosRascunho();
            localStorage.setItem(chaveRascunho(), JSON.stringify(dados));
            atualizarIndicadorRascunho(true, dados.salvoEm);
        } catch (e) {
            console.warn('[RASCUNHO ATENDIMENTO]', e);
            try {
                const dados = coletarDadosRascunho();
                dados.assinaturaBase64 = null;
                localStorage.setItem(chaveRascunho(), JSON.stringify(dados));
            } catch (e2) {}
        }
    }

    function agendarSalvarRascunho() {
        if (state.rascunho.restaurando) return;
        clearTimeout(state.rascunho.timer);
        state.rascunho.timer = setTimeout(salvarRascunhoAgora, RASCUNHO_INTERVALO_MS);
    }

    function limparRascunho() {
        try { localStorage.removeItem(chaveRascunho()); } catch (e) {}
        clearTimeout(state.rascunho.timer);
        atualizarIndicadorRascunho(false);
        fecharBannerRascunho();
    }

    function obterRascunho() {
        try {
            const raw = localStorage.getItem(chaveRascunho());
            if (!raw) return null;
            const d = JSON.parse(raw);
            if (!d || d.versao !== RASCUNHO_VERSAO) return null;
            if (Date.now() - (d.salvoEm || 0) > RASCUNHO_VALIDADE_MS) {
                localStorage.removeItem(chaveRascunho());
                return null;
            }
            return d;
        } catch (e) { return null; }
    }

    function atualizarIndicadorRascunho(ativo, timestamp) {
        const el = document.getElementById('atendIndicadorRascunho');
        if (!el) return;
        if (ativo && timestamp) {
            const hora = new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            el.innerHTML = `<i class="fas fa-save"></i> Rascunho salvo às ${hora}`;
            el.style.display = 'inline-flex';
        } else {
            el.style.display = 'none';
        }
    }

    function vincularAutoSaveRascunho() {
        const container = document.getElementById('atend-registrar');
        if (container && !container.dataset.autosaveVinculado) {
            container.dataset.autosaveVinculado = '1';
            const handler = () => agendarSalvarRascunho();
            container.addEventListener('input', handler, true);
            container.addEventListener('change', handler, true);
        }
        if (!state.rascunho.globaisVinculados) {
            state.rascunho.globaisVinculados = true;
            window.addEventListener('beforeunload', salvarRascunhoAgora);
            window.addEventListener('pagehide', salvarRascunhoAgora);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') salvarRascunhoAgora();
            });
        }
    }

    // ---------------- BANNER RASCUNHO ----------------
    function mostrarBannerRascunho(dados) {
        fecharBannerRascunho();
        if (!dados) return;

        const hora = new Date(dados.salvoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const data = new Date(dados.salvoEm).toLocaleDateString('pt-BR');
        const nome = dados.aluno?.nome || 'Aluno não definido';
        const editando = dados.modoEdicao ? ` • Editando ${dados.modoEdicao.codigoProtocolo || ''}` : '';

        const banner = document.createElement('div');
        banner.id = 'atendBannerRascunho';
        banner.style.cssText = `
            position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
            z-index: 99998; max-width: 640px; width: calc(100% - 32px);
            background: linear-gradient(135deg, #4c1d95, #7e22ce);
            color: #fff; border-radius: 14px; padding: 14px 16px;
            box-shadow: 0 10px 30px rgba(76,29,149,.45);
            display: flex; align-items: center; gap: 14px;
            animation: slideDownBannerProt .35s ease;
        `;
        banner.innerHTML = `
            <div style="font-size:28px;flex-shrink:0;">📝</div>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:700;font-size:14px;margin-bottom:2px;">Você tem um atendimento em andamento${editando}</div>
                <div style="font-size:12.5px;opacity:.92;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    <strong>${escapeHtml(nome)}</strong>
                </div>
                <div style="font-size:11px;opacity:.8;margin-top:3px;">Salvo em ${data} às ${hora}</div>
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0;">
                <button id="atendBtnRestaurarRascunho" style="background:#fff;color:#4c1d95;border:none;border-radius:9px;padding:9px 14px;font-weight:700;font-size:12.5px;cursor:pointer;display:flex;align-items:center;gap:6px;white-space:nowrap;">
                    <i class="fas fa-undo"></i> Restaurar
                </button>
                <button id="atendBtnDescartarRascunho" title="Descartar" style="background:rgba(255,255,255,.18);color:#fff;border:none;border-radius:9px;padding:9px 11px;font-size:12.5px;cursor:pointer;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        document.body.appendChild(banner);

        if (!document.getElementById('protStyleBannerRascunho')) {
            const st = document.createElement('style');
            st.id = 'protStyleBannerRascunho';
            st.textContent = `@keyframes slideDownBannerProt{from{opacity:0;transform:translate(-50%,-15px)}to{opacity:1;transform:translate(-50%,0)}}`;
            document.head.appendChild(st);
        }

        document.getElementById('atendBtnRestaurarRascunho')?.addEventListener('click', () => restaurarRascunho());
        document.getElementById('atendBtnDescartarRascunho')?.addEventListener('click', async () => {
            const ok = await window.confirm('Descartar este atendimento em andamento?');
            if (ok) { limparRascunho(); showToast('Rascunho descartado.', 'info'); }
        });
    }

    function fecharBannerRascunho() {
        document.getElementById('atendBannerRascunho')?.remove();
    }

    // ---------------- RESTAURAR ----------------
    async function restaurarRascunho() {
        const dados = obterRascunho();
        if (!dados) { fecharBannerRascunho(); return; }

        state.rascunho.restaurando = true;
        fecharBannerRascunho();

        try {
            if (!dados.aluno?.id) {
                showToast('Rascunho sem aluno definido.', 'warning');
                return;
            }

            const aba = document.getElementById('atend-registrar-tab');
            if (aba) { try { new bootstrap.Tab(aba).show(); } catch (e) { aba.click(); } }

            resetarFormulario({ manterRascunho: true });

            const alunoAtual = state.alunosBuscados.find(p => (p._id || p.id) === dados.aluno.id);
            aplicarAlunoSelecionado(alunoAtual || dados.aluno);

            const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
            set('atendDataAtendimento', dados.data || getDataLocalISO());
            set('atendCategoria', dados.categoria);
            set('atendCategoriaOutros', dados.categoriaOutros);
            set('atendMotivoPrincipal', dados.motivo);
            set('atendEncaminhamento', dados.encaminhamento);
            set('atendObservacoesAdicionais', dados.observacoes);

            const divOutros = document.getElementById('atendCategoriaOutrosDiv');
            if (divOutros) divOutros.style.display = dados.categoria === 'outros' ? 'block' : 'none';

            const cardDados = document.getElementById('atendCardDados');
            if (cardDados) cardDados.style.display = 'block';

            const check = document.getElementById('atendNecessitaAssinatura');
            if (dados.assinaturaBase64) {
                state.sessaoAssinatura.assinaturaCapturada = dados.assinaturaBase64;
                if (check) check.checked = true;
                mostrarAssinaturaCapturada({
                    assinaturaBase64: dados.assinaturaBase64,
                    assinadaPorNome: 'Aluno',
                    assinadaEm: new Date(dados.salvoEm).toISOString()
                });
            } else if (dados.precisaAssinatura) {
                if (check) check.checked = false;
            }

            if (dados.modoEdicao && dados.modoEdicao.registroId) {
                ativarModoEdicao(
                    { _id: dados.modoEdicao.registroId, codigoProtocolo: dados.modoEdicao.codigoProtocolo },
                    { silent: true }
                );
            }

            atualizarIndicadorRascunho(true, dados.salvoEm);
            showToast('📝 Atendimento restaurado! Continue de onde parou.', 'success');

            setTimeout(() => {
                document.getElementById('atendCardDados')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 350);

        } catch (e) {
            console.error('[RASCUNHO ATENDIMENTO]', e);
            showToast('Não foi possível restaurar.', 'warning');
        } finally {
            state.rascunho.restaurando = false;
            agendarSalvarRascunho();
        }
    }

    // ============================================
    // 🚀 INICIALIZAÇÃO
    // ============================================
    async function init() {
        console.log('🚀 [Atendimento] init() chamado.');

        const content = document.getElementById('content');
        if (!content) {
            console.error('❌ [Atendimento] Container #content não encontrado!');
            return;
        }

        // JÁ RENDERIZADO → reativa tabs
        if (content.querySelector('.prot-container')) {
            console.log('ℹ️ [Atendimento] Já renderizado. Reativando tabs...');
            content.style.display = 'block';

            const paneReg = document.getElementById('atend-registrar');
            const paneList = document.getElementById('atend-lista');
            const paneDash = document.getElementById('atend-dashboard');
            const paneRel = document.getElementById('atend-relatorio');
            [paneReg, paneList, paneDash, paneRel].forEach(p => { if (p) p.style.display = ''; });

            ['atend-registrar-tab', 'atend-lista-tab', 'atend-dashboard-tab', 'atend-relatorio-tab'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                try {
                    const inst = bootstrap.Tab.getInstance(el);
                    if (inst) inst.dispose();
                    new bootstrap.Tab(el);
                } catch (e) { console.warn('[Atendimento] Erro re-init tab:', id, e); }
            });

            const btnRegistrar = document.getElementById('atend-registrar-tab');
            if (btnRegistrar) {
                try { new bootstrap.Tab(btnRegistrar).show(); } catch (e) {}
            }

            vincularAutoSaveRascunho();

            try {
                const rascunho = obterRascunho();
                if (rascunho) mostrarBannerRascunho(rascunho);
            } catch (e) {}

            return;
        }

        // PRIMEIRA RENDERIZAÇÃO
        state.alunoSelecionado = null;
        state.alunosBuscados = [];
        state.sessaoAssinatura.assinaturaCapturada = null;
        state.sessaoAssinatura.sessaoId = null;
        state.modoEdicao = { ativo: false, registroId: null, codigoProtocolo: null };
        clearTimeout(state.rascunho.timer);

        content.innerHTML = `
            <div style="text-align:center;padding:60px;">
                <div style="width:50px;height:50px;border:5px solid #f3f3f3;border-top:5px solid #4c1d95;border-radius:50%;margin:0 auto 20px;animation:spinProt 1s linear infinite;"></div>
                <p style="color:#6b7280;">Carregando Atendimento...</p>
            </div>
            <style>@keyframes spinProt{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}</style>
        `;

        try {
            renderizarInterface();
            console.log('✅ [Atendimento] Interface renderizada.');
        } catch (errRender) {
            console.error('❌ [Atendimento] Erro ao renderizar:', errRender);
            content.innerHTML = `<div class="alert alert-danger m-3"><strong>Erro ao renderizar a interface.</strong><br>${escapeHtml(errRender.message || '')}</div>`;
            return;
        }

        try {
            await carregarLista(1);
        } catch (errLista) {
            console.warn('⚠️ [Atendimento] Erro ao carregar lista:', errLista);
            const lista = document.getElementById('atendListaAtendimentos');
            if (lista) {
                lista.innerHTML = `<div class="text-center py-5" style="color:#ef4444;">
                    <i class="fas fa-exclamation-triangle" style="font-size:32px;margin-bottom:10px;"></i>
                    <p>Não foi possível carregar o histórico.</p>
                    <p style="font-size:13px;color:#6b7280;">${escapeHtml(errLista.message || '')}</p>
                </div>`;
            }
        }

        try {
            const rascunho = obterRascunho();
            if (rascunho) mostrarBannerRascunho(rascunho);
        } catch (errRascunho) {}

        console.log('✅ [Atendimento] init() concluído.');
    }

    // ============================================
    // 🎨 RENDERIZAR INTERFACE PRINCIPAL
    // ============================================
    function renderizarInterface() {
        const content = document.getElementById('content');
        if (!content) return;

        const hoje = getDataLocalISO();
        const mesAtual = new Date().toISOString().substring(0, 7);

        content.innerHTML = `
            <div class="prot-container">
                <div class="prot-header" style="background: linear-gradient(135deg, #4c1d95, #7e22ce);">
                    <div class="prot-header-left">
                        <div class="prot-header-icon" style="background: rgba(255,255,255,0.2);">
                            <i class="fas fa-headset"></i>
                        </div>
                        <div class="prot-header-text">
                            <h1>Atendimento Protagonismo</h1>
                            <p>Registre os atendimentos realizados com os alunos</p>
                        </div>
                    </div>
                    <div class="prot-header-actions" style="display: flex; align-items: center; gap: 12px;">
                        <span id="atendIndicadorRascunho" style="display:none;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#065f46;background:#d1fae5;border:1px solid #10b981;padding:4px 12px;border-radius:20px;"></span>
                        <button class="prot-btn-refresh" data-action="recarregar" title="Recarregar"><i class="fas fa-sync-alt"></i></button>
                    </div>
                </div>

                <ul class="nav nav-tabs mb-3" role="tablist" style="border-bottom: 2px solid #e5e7eb;">
                    <li class="nav-item">
                        <button class="nav-link active" id="atend-registrar-tab" data-bs-toggle="tab" data-bs-target="#atend-registrar" type="button" style="color: #4c1d95; font-weight: 600;">
                            <i class="fas fa-plus-circle"></i> Novo Atendimento
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" id="atend-lista-tab" data-bs-toggle="tab" data-bs-target="#atend-lista" type="button" style="color: #4b5563; font-weight: 600;">
                            <i class="fas fa-list"></i> Histórico
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" id="atend-dashboard-tab" data-bs-toggle="tab" data-bs-target="#atend-dashboard" type="button" style="color: #4b5563; font-weight: 600;">
                            <i class="fas fa-chart-line"></i> Dashboard
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link" id="atend-relatorio-tab" data-bs-toggle="tab" data-bs-target="#atend-relatorio" type="button" style="color: #4b5563; font-weight: 600;">
                            <i class="fas fa-file-alt"></i> Relatórios
                        </button>
                    </li>
                </ul>

                <div class="tab-content">
                    <!-- TAB: REGISTRAR -->
                    <div class="tab-pane fade show active" id="atend-registrar">
                        <div id="atendBannerEdicao" style="display:none; background: #fef3c7; border: 2px solid #f59e0b; border-radius: 12px; padding: 12px 16px; margin-bottom: 15px; align-items: center; gap: 12px;">
                            <i class="fas fa-pen" style="color: #92400e; font-size: 20px;"></i>
                            <div style="flex: 1;">
                                <strong style="color: #92400e; font-size: 14px;">Editando atendimento <span id="atendBannerEdicaoCodigo"></span></strong>
                                <p style="margin: 2px 0 0; font-size: 12px; color: #78350f;">Ao salvar, o registro será atualizado no histórico.</p>
                            </div>
                            <button type="button" data-action="cancelarEdicao" style="background: transparent; border: 1px solid #92400e; color: #92400e; border-radius: 8px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer;">
                                <i class="fas fa-times"></i> Cancelar edição
                            </button>
                        </div>

                        <div class="prot-card" id="atendCardAluno">
                            <div class="prot-etapa-header">
                                <div class="prot-etapa-numero" style="background: #7e22ce;">1</div>
                                <div class="prot-etapa-titulo">
                                    <h5><i class="fas fa-user-graduate me-2"></i> Selecionar Aluno</h5>
                                    <small>Filtre por turma/curso e busque o aluno que está sendo atendido</small>
                                </div>
                            </div>

                            <div id="atendAlunoSelecionado" class="prot-professor-box" style="display: none; border-color: #7e22ce; background: #faf5ff;"></div>

                            <div id="atendFiltrosAluno" class="row g-3 mt-3">
                                <div class="col-md-4">
                                    <label class="prot-label">Turma</label>
                                    <select id="atendFiltroTurma" class="form-select prot-input">
                                        <option value="">Todas as turmas</option>
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="prot-label">Curso</label>
                                    <select id="atendFiltroCurso" class="form-select prot-input">
                                        <option value="">Todos os cursos</option>
                                    </select>
                                </div>
                                <div class="col-md-4">
                                    <label class="prot-label">Buscar por nome/matrícula</label>
                                    <div class="prot-search-box">
                                        <i class="fas fa-search"></i>
                                        <input type="text" id="atendBuscaAluno" placeholder="Digite o nome..." autocomplete="off">
                                    </div>
                                </div>
                            </div>

                            <div id="atendListaAlunos" class="prot-professor-list mt-3" style="display: none;"></div>

                            <div id="atendAlunoEmptyState" class="text-center py-4" style="color:#9ca3af;">
                                <i class="fas fa-user-graduate" style="font-size:32px;margin-bottom:10px;"></i>
                                <p style="margin:0;">Selecione uma turma ou busque um aluno para começar.</p>
                            </div>
                        </div>

                        <div class="prot-card" id="atendCardDados" style="display: none;">
                            <div class="prot-etapa-header">
                                <div class="prot-etapa-numero" style="background: #7e22ce;">2</div>
                                <div class="prot-etapa-titulo">
                                    <h5><i class="fas fa-clipboard-list me-2"></i> Dados do Atendimento</h5>
                                    <small>Informe o motivo e os detalhes</small>
                                </div>
                            </div>

                            <div class="row g-3 mt-3">
                                <div class="col-md-4">
                                    <label class="prot-label">Data do Atendimento <span class="text-danger">*</span></label>
                                    <input type="date" id="atendDataAtendimento" class="form-control prot-input" value="${hoje}">
                                </div>
                                <div class="col-md-4">
                                    <label class="prot-label">Categoria <span class="text-danger">*</span></label>
                                    <select id="atendCategoria" class="form-select prot-input">
                                        <option value="">Selecione...</option>
                                        <option value="pedagogico">Pedagógico</option>
                                        <option value="disciplinar">Disciplinar</option>
                                        <option value="orientacao">Orientação</option>
                                        <option value="acolhimento">Acolhimento</option>
                                        <option value="outros">Outros</option>
                                    </select>
                                </div>
                            </div>

                            <div class="mt-3" id="atendCategoriaOutrosDiv" style="display: none;">
                                <label class="prot-label">Especifique a Categoria <span class="text-danger">*</span></label>
                                <input type="text" id="atendCategoriaOutros" class="form-control prot-input" placeholder="Ex: Reunião com responsável...">
                            </div>

                            <div class="mt-3">
                                <label class="prot-label">Motivo Principal <span class="text-danger">*</span></label>
                                <textarea id="atendMotivoPrincipal" class="form-control prot-input" rows="2" placeholder="Descreva o motivo principal..."></textarea>
                            </div>

                            <div class="mt-3">
                                <label class="prot-label">Encaminhamento</label>
                                <textarea id="atendEncaminhamento" class="form-control prot-input" rows="2" placeholder="Para onde o aluno foi encaminhado..."></textarea>
                            </div>

                            <div class="mt-3">
                                <label class="prot-label">Observações Adicionais</label>
                                <textarea id="atendObservacoesAdicionais" class="form-control prot-input" rows="2" placeholder="Informações adicionais..."></textarea>
                            </div>

                            <div class="mt-4">
                                <div class="prot-assinatura-box">
                                    <div class="form-check p-3" style="background: #f8fafc; border-radius: 10px; border: 2px solid #e2e8f0;">
                                        <input class="form-check-input" type="checkbox" id="atendNecessitaAssinatura" style="width: 20px; height: 20px; margin-top: 2px;">
                                        <label class="form-check-label" for="atendNecessitaAssinatura" style="margin-left: 8px; cursor: pointer;">
                                            <strong><i class="fas fa-signature"></i> Necessita de assinatura (Aluno/Responsável)</strong>
                                            <p style="margin: 5px 0 0; font-size: 13px; color: #64748b;">
                                                Marque para gerar um QR Code. O aluno escaneia e assina no celular dele (ou assine direto aqui na tela).
                                            </p>
                                        </label>
                                    </div>
                                    <div id="atendBlocoAssinatura" style="display: none;"></div>
                                </div>
                            </div>

                            <div class="d-flex gap-2 mt-4 justify-content-end">
                                <button class="btn btn-secondary" data-action="resetarFormulario" style="border-radius: 10px;">
                                    <i class="fas fa-times me-2"></i> Cancelar
                                </button>
                                <button class="btn btn-primary" data-action="registrarAtendimento" id="atendBtnRegistrar" style="background: #7e22ce; border: none; border-radius: 10px;">
                                    <i class="fas fa-save me-2"></i> Registrar Atendimento
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- TAB: LISTA -->
                    <div class="tab-pane fade" id="atend-lista">
                        <div class="prot-card mb-3">
                            <div class="row g-3 align-items-end">
                                <div class="col-md-3">
                                    <label class="prot-label">Mês</label>
                                    <input type="month" id="atendFiltroMes" class="form-control prot-input" value="${mesAtual}">
                                </div>
                                <div class="col-md-5">
                                    <label class="prot-label">Buscar</label>
                                    <input type="text" id="atendFiltroBusca" class="form-control prot-input" placeholder="Nome do aluno ou código...">
                                </div>
                                <div class="col-md-4 d-flex gap-2">
                                    <button class="btn btn-secondary flex-fill" data-action="limparFiltros" style="border-radius: 10px;"><i class="fas fa-eraser"></i> Limpar</button>
                                    <button class="btn btn-primary flex-fill" data-action="buscarLista" style="background: #7e22ce; border: none; border-radius: 10px;"><i class="fas fa-search"></i> Buscar</button>
                                </div>
                            </div>
                        </div>
                        <div class="prot-card">
                            <div id="atendListaAtendimentos">
                                <div class="text-center py-5">
                                    <div style="width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #7e22ce;border-radius:50%;margin:0 auto 15px;animation:spinProt 1s linear infinite;"></div>
                                    <p>Carregando histórico...</p>
                                </div>
                            </div>
                            <div id="atendPaginacao" class="mt-3"></div>
                        </div>
                    </div>

                    <!-- TAB: DASHBOARD -->
                    <div class="tab-pane fade" id="atend-dashboard">
                        <div class="row g-3 mb-4">
                            <div class="col-md-3">
                                <div class="metric-card">
                                    <i class="fas fa-calendar-day fa-2x mb-2" style="color:#4c1d95;"></i>
                                    <div class="metric-value" id="atendTotalHoje">0</div>
                                    <div class="metric-label">Hoje</div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="metric-card">
                                    <i class="fas fa-calendar-week fa-2x mb-2" style="color:#10b981;"></i>
                                    <div class="metric-value" id="atendTotalSemana">0</div>
                                    <div class="metric-label">Esta Semana</div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="metric-card">
                                    <i class="fas fa-calendar-alt fa-2x mb-2" style="color:#0284c7;"></i>
                                    <div class="metric-value" id="atendTotalMes">0</div>
                                    <div class="metric-label">Este Mês</div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="metric-card">
                                    <i class="fas fa-chart-line fa-2x mb-2" style="color:#d97706;"></i>
                                    <div class="metric-value" id="atendTotalGeral">0</div>
                                    <div class="metric-label">Total Geral</div>
                                </div>
                            </div>
                        </div>
                        <div class="row g-3">
                            <div class="col-md-6">
                                <div class="card h-100">
                                    <div class="card-body">
                                        <h6 class="card-title"><i class="fas fa-chart-pie" style="color:#4c1d95;"></i> Por Categoria</h6>
                                        <div style="height: 280px; position: relative;">
                                            <canvas id="atendChartCategoria"></canvas>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="card h-100">
                                    <div class="card-body">
                                        <h6 class="card-title"><i class="fas fa-chart-bar" style="color:#10b981;"></i> Atendimentos por Mês</h6>
                                        <div style="height: 280px; position: relative;">
                                            <canvas id="atendChartMes"></canvas>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="card h-100">
                                    <div class="card-body">
                                        <h6 class="card-title"><i class="fas fa-users" style="color:#0284c7;"></i> Por Turma</h6>
                                        <div style="height: 280px; position: relative;">
                                            <canvas id="atendChartTurma"></canvas>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-6">
                                <div class="card h-100">
                                    <div class="card-body">
                                        <h6 class="card-title"><i class="fas fa-exclamation-triangle" style="color:#d97706;"></i> Alunos Reincidentes (3+ atendimentos)</h6>
                                        <div id="atendAlunosReincidentes" class="mt-3">
                                            <div class="text-center py-3">
                                                <div style="width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #7e22ce;border-radius:50%;margin:0 auto 15px;animation:spinProt 1s linear infinite;"></div>
                                                <p class="text-muted mb-0">Carregando...</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- TAB: RELATÓRIO -->
                    <div class="tab-pane fade" id="atend-relatorio">
                        <div class="prot-card mb-3">
                            <h5 class="mb-3"><i class="fas fa-filter me-2"></i> Filtros do Relatório</h5>
                            <div class="row g-3">
                                <div class="col-md-3">
                                    <label class="prot-label">Data Início</label>
                                    <input type="date" id="atendRelDataInicio" class="form-control prot-input">
                                </div>
                                <div class="col-md-3">
                                    <label class="prot-label">Data Fim</label>
                                    <input type="date" id="atendRelDataFim" class="form-control prot-input">
                                </div>
                                <div class="col-md-3">
                                    <label class="prot-label">Categoria</label>
                                    <select id="atendRelCategoria" class="form-select prot-input">
                                        <option value="">Todas</option>
                                        <option value="pedagogico">Pedagógico</option>
                                        <option value="disciplinar">Disciplinar</option>
                                        <option value="orientacao">Orientação</option>
                                        <option value="acolhimento">Acolhimento</option>
                                        <option value="outros">Outros</option>
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="prot-label">Turma</label>
                                    <select id="atendRelTurma" class="form-select prot-input">
                                        <option value="">Todas</option>
                                    </select>
                                </div>
                                <div class="col-md-3">
                                    <label class="prot-label">Curso</label>
                                    <select id="atendRelCurso" class="form-select prot-input">
                                        <option value="">Todos</option>
                                    </select>
                                </div>
                                <div class="col-md-5">
                                    <label class="prot-label">Buscar por aluno/matrícula/código</label>
                                    <input type="text" id="atendRelBusca" class="form-control prot-input" placeholder="Digite para buscar...">
                                </div>
                                <div class="col-md-4 d-flex align-items-end gap-2">
                                    <button class="btn btn-primary flex-fill" data-action="gerarRelatorio" style="background: #7e22ce; border: none; border-radius: 10px;">
                                        <i class="fas fa-search"></i> Buscar
                                    </button>
                                    <button class="btn btn-outline-secondary" data-action="limparRelatorio" style="border-radius: 10px;" title="Limpar filtros">
                                        <i class="fas fa-eraser"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="mt-3 d-flex gap-2 flex-wrap">
                                <button class="btn btn-success" data-action="exportarCSV" id="atendBtnExportarCSV" disabled style="border-radius: 10px;">
                                    <i class="fas fa-file-csv me-1"></i> Exportar CSV
                                </button>
                                <button class="btn btn-danger" data-action="exportarPDFRelatorio" id="atendBtnExportarPDF" disabled style="border-radius: 10px;">
                                    <i class="fas fa-file-pdf me-1"></i> Exportar PDF
                                </button>
                            </div>
                        </div>

                        <div id="atendResultadoRelatorio" class="mt-4">
                            <div class="text-center py-5" style="color:#9ca3af;">
                                <i class="fas fa-chart-line fa-3x mb-3"></i>
                                <p class="text-muted">Selecione os filtros e clique em Buscar</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                .prot-container { padding: 20px; max-width: 1400px; margin: 0 auto; }
                .nav-tabs .nav-link { color: #4b5563 !important; border: none; border-bottom: 3px solid transparent; padding: 10px 15px; font-size: 14px; transition: all 0.2s; }
                .nav-tabs .nav-link:hover { color: #4c1d95 !important; background: #f8fafc; }
                .nav-tabs .nav-link.active { color: #4c1d95 !important; border-bottom: 3px solid #4c1d95; background: transparent; }

                .prot-header { border-radius: 20px; padding: 25px 30px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 10px 30px rgba(76, 29, 149, 0.3); }
                .prot-header-left { display: flex; align-items: center; gap: 20px; }
                .prot-header-icon { width: 65px; height: 65px; border-radius: 18px; display: flex; align-items: center; justify-content: center; font-size: 28px; color: white; backdrop-filter: blur(10px); }
                .prot-header-text h1 { color: white; font-size: 26px; font-weight: 700; margin: 0 0 4px; }
                .prot-header-text p { color: rgba(255,255,255,0.9); font-size: 14px; margin: 0; }
                .prot-btn-refresh { background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 12px; border-radius: 50%; cursor: pointer; font-size: 16px; width: 45px; height: 45px; display: flex; align-items: center; justify-content: center; transition: all 0.3s; }
                .prot-btn-refresh:hover { background: rgba(255,255,255,0.3); transform: rotate(180deg); }

                .prot-card { background: white; border-radius: 16px; padding: 25px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border: 1px solid #e5e7eb; }

                .prot-etapa-header { display: flex; align-items: center; gap: 15px; padding-bottom: 15px; border-bottom: 2px solid #f1f5f9; }
                .prot-etapa-numero { width: 40px; height: 40px; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; flex-shrink: 0; }
                .prot-etapa-titulo h5 { margin: 0; font-size: 16px; font-weight: 700; color: #1e293b; }
                .prot-etapa-titulo small { color: #64748b; font-size: 13px; }

                .prot-label { display: block; font-weight: 600; font-size: 13px; color: #374151; margin-bottom: 6px; }
                .prot-input { border: 2px solid #e5e7eb !important; border-radius: 10px !important; padding: 10px 14px !important; font-size: 14px !important; transition: all 0.2s; }
                .prot-input:focus { border-color: #4c1d95 !important; box-shadow: 0 0 0 3px rgba(76, 29, 149, 0.1) !important; outline: none; }

                .prot-search-box { position: relative; }
                .prot-search-box i { position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: #9ca3af; font-size: 14px; }
                .prot-search-box input { width: 100%; padding: 10px 16px 10px 42px; border: 2px solid #e5e7eb; border-radius: 10px; font-size: 14px; outline: none; transition: all 0.2s; height: 44px; }
                .prot-search-box input:focus { border-color: #4c1d95; box-shadow: 0 0 0 3px rgba(76, 29, 149, 0.1); }

                .prot-professor-list { max-height: 400px; overflow-y: auto; }
                .prot-professor-item { display: flex; align-items: center; gap: 14px; padding: 14px 18px; background: white; border: 2px solid #e5e7eb; border-radius: 12px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s; }
                .prot-professor-item:hover { border-color: #c7d2fe; background: #f8faff; transform: translateX(4px); }
                .prot-professor-item.selected { border-color: #4c1d95; background: #faf5ff; }
                .prot-prof-avatar { width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #4c1d95, #7e22ce); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; flex-shrink: 0; }
                .prot-prof-info { flex: 1; min-width: 0; }
                .prot-prof-nome { font-weight: 700; color: #1e293b; font-size: 15px; margin-bottom: 4px; }
                .prot-prof-detalhes { font-size: 12px; color: #64748b; display: flex; flex-wrap: wrap; gap: 12px; }

                .prot-professor-box { border: 2px solid #4c1d95; border-radius: 16px; padding: 18px; margin-bottom: 15px; }
                .prot-professor-box-content { display: flex; align-items: center; gap: 16px; }
                .prot-professor-box-avatar { width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, #4c1d95, #7e22ce); color: white; display: flex; align-items: center; justify-content: center; font-size: 24px; font-weight: 700; flex-shrink: 0; }
                .prot-professor-box-info { flex: 1; }
                .prot-professor-box-info h5 { margin: 0 0 4px; color: #4c1d95; font-weight: 700; }
                .prot-professor-box-info p { margin: 0; font-size: 13px; color: #4b5563; }

                .metric-card { background: white; border-radius: 14px; padding: 20px; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid #e5e7eb; transition: transform 0.2s; }
                .metric-card:hover { transform: translateY(-3px); box-shadow: 0 6px 18px rgba(0,0,0,0.1); }
                .metric-value { font-size: 32px; font-weight: 800; color: #1e293b; line-height: 1.1; margin-bottom: 4px; }
                .metric-label { font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }

                .atend-action-btn {
                    width: 34px; height: 34px; border: none; border-radius: 8px; cursor: pointer;
                    display: inline-flex; align-items: center; justify-content: center; font-size: 13px;
                    transition: all 0.2s; margin-right: 4px;
                }
                .atend-action-btn.view { background: #eff6ff; color: #2563eb; }
                .atend-action-btn.view:hover { background: #dbeafe; }
                .atend-action-btn.edit { background: #fef3c7; color: #d97706; }
                .atend-action-btn.edit:hover { background: #fde68a; }
                .atend-action-btn.print { background: #ecfdf5; color: #059669; }
                .atend-action-btn.print:hover { background: #d1fae5; }
                .atend-action-btn.delete { background: #fee2e2; color: #dc2626; }
                .atend-action-btn.delete:hover { background: #fecaca; }

                @keyframes spinProt { to { transform: rotate(360deg); } }
                @keyframes fadeInCanvasProt { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
            </style>
        `;

        setTimeout(() => {
            configurarEventos();
            vincularAutoSaveRascunho();

            ['atend-registrar-tab', 'atend-lista-tab', 'atend-dashboard-tab', 'atend-relatorio-tab'].forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                try {
                    const inst = bootstrap.Tab.getInstance(el);
                    if (inst) inst.dispose();
                    new bootstrap.Tab(el);
                } catch (e) {}
            });

            const btnReg = document.getElementById('atend-registrar-tab');
            if (btnReg) { try { new bootstrap.Tab(btnReg).show(); } catch (e) {} }

            // Listeners das abas Dashboard e Relatório
            const dashTab = document.getElementById('atend-dashboard-tab');
            if (dashTab) {
                dashTab.addEventListener('shown.bs.tab', () => carregarDashboard());
            }
            const relTab = document.getElementById('atend-relatorio-tab');
            if (relTab) {
                relTab.addEventListener('shown.bs.tab', () => {
                    carregarTurmasECursosAtendimento();
                });
            }
        }, 100);
    }

    // ============================================
    // 📚 CARREGAR TURMAS E CURSOS
    // ============================================
    async function carregarTurmasECursosAtendimento() {
        // Registrar
        const selTurma = document.getElementById('atendFiltroTurma');
        const selCurso = document.getElementById('atendFiltroCurso');
        // Relatório
        const relTurma = document.getElementById('atendRelTurma');
        const relCurso = document.getElementById('atendRelCurso');

        if (selTurma && selTurma.options.length <= 1) {
            try {
                const r = await fetch('/api/atendimento-protagonismo/turmas', {
                    headers: { 'Authorization': `Bearer ${getToken()}` }
                });
                const d = await r.json();
                if (d.success && Array.isArray(d.turmas)) {
                    const opts = '<option value="">Todas as turmas</option>' +
                        d.turmas.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
                    selTurma.innerHTML = opts;
                    if (relTurma) relTurma.innerHTML = opts;
                }
            } catch (e) { console.warn('[Atendimento] Erro ao carregar turmas:', e); }
        }

        if (selCurso && selCurso.options.length <= 1) {
            try {
                const r = await fetch('/api/atendimento-protagonismo/cursos', {
                    headers: { 'Authorization': `Bearer ${getToken()}` }
                });
                const d = await r.json();
                if (d.success && Array.isArray(d.cursos)) {
                    const opts = '<option value="">Todos os cursos</option>' +
                        d.cursos.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
                    selCurso.innerHTML = opts;
                    if (relCurso) relCurso.innerHTML = opts;
                }
            } catch (e) { console.warn('[Atendimento] Erro ao carregar cursos:', e); }
        }
    }

    // ============================================
    // 🎯 CONFIGURAR EVENTOS
    // ============================================
    function configurarEventos() {
        carregarTurmasECursosAtendimento();

        const selTurma = document.getElementById('atendFiltroTurma');
        if (selTurma && !selTurma.dataset.eventoVinculado) {
            selTurma.dataset.eventoVinculado = '1';
            selTurma.addEventListener('change', () => {
                buscarAlunos(document.getElementById('atendBuscaAluno')?.value || '');
            });
        }

        const selCurso = document.getElementById('atendFiltroCurso');
        if (selCurso && !selCurso.dataset.eventoVinculado) {
            selCurso.dataset.eventoVinculado = '1';
            selCurso.addEventListener('change', () => {
                buscarAlunos(document.getElementById('atendBuscaAluno')?.value || '');
            });
        }

        const busca = document.getElementById('atendBuscaAluno');
        if (busca && !busca.dataset.eventoVinculado) {
            busca.dataset.eventoVinculado = '1';
            let timeout;
            busca.addEventListener('input', (e) => {
                clearTimeout(timeout);
                const termo = e.target.value.trim();
                const temFiltro = (document.getElementById('atendFiltroTurma')?.value || '') !== ''
                               || (document.getElementById('atendFiltroCurso')?.value || '') !== '';
                if (termo.length < 2 && !temFiltro) {
                    const lista = document.getElementById('atendListaAlunos');
                    const empty = document.getElementById('atendAlunoEmptyState');
                    if (lista) lista.style.display = 'none';
                    if (empty) empty.style.display = 'block';
                    return;
                }
                timeout = setTimeout(() => buscarAlunos(termo), 400);
            });
        }

        const selMes = document.getElementById('atendFiltroMes');
        if (selMes && !selMes.dataset.eventoVinculado) {
            selMes.dataset.eventoVinculado = '1';
            selMes.addEventListener('change', () => carregarLista(1));
        }

        const buscaLista = document.getElementById('atendFiltroBusca');
        if (buscaLista && !buscaLista.dataset.eventoVinculado) {
            buscaLista.dataset.eventoVinculado = '1';
            let timeout;
            buscaLista.addEventListener('input', () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => carregarLista(1), 500);
            });
        }

        const chkAssinatura = document.getElementById('atendNecessitaAssinatura');
        if (chkAssinatura && !chkAssinatura.dataset.eventoVinculado) {
            chkAssinatura.dataset.eventoVinculado = '1';
            chkAssinatura.addEventListener('change', () => toggleAssinatura());
        }

        // ===== EVENT DELEGATION — #content =====
        const content = document.getElementById('content');
        if (content && !content.dataset.delegationVinculada) {
            content.dataset.delegationVinculada = '1';
            content.addEventListener('click', (ev) => {
                const acaoEl = ev.target.closest('[data-action]');
                if (acaoEl) {
                    const acao = acaoEl.getAttribute('data-action');
                    if (acaoEl.id === 'atendNecessitaAssinatura') return;
                    ev.preventDefault();
                    switch (acao) {
                        case 'recarregar': return recarregar();
                        case 'resetarFormulario': return resetarFormulario();
                        case 'registrarAtendimento': return registrarAtendimento();
                        case 'limparFiltros': return limparFiltros();
                        case 'buscarLista': return carregarLista(1);
                        case 'limparAssinatura': return limparCanvasInline();
                        case 'salvarAssinatura': return salvarAssinaturaInline();
                        case 'refazerAssinatura': return refazerAssinatura();
                        case 'fecharModalQRCode': return fecharModalQRCode();
                        case 'cancelarSessaoAssinatura': return cancelarSessaoAssinatura();
                        case 'mostrarCanvasAssinaturaInline': return mostrarCanvasAssinaturaInline();
                        case 'voltarParaQRCode': return voltarParaQRCode();
                        case 'verificarAtendimento': return verificarAtendimento(acaoEl.getAttribute('data-id'));
                        case 'editarAtendimento': return editarAtendimento(acaoEl.getAttribute('data-id'));
                        case 'excluirAtendimento': return excluirAtendimento(acaoEl.getAttribute('data-id'));
                        case 'imprimirAtendimento': return imprimirAtendimento(acaoEl.getAttribute('data-id'));
                        case 'cancelarEdicao': return cancelarEdicao();
                        case 'fecharModalDetalhes': return fecharModalDetalhes();
                        case 'imprimirDoModal': return imprimirAtendimento(acaoEl.getAttribute('data-id'));
                        // Relatório
                        case 'gerarRelatorio': return gerarRelatorio();
                        case 'limparRelatorio': return limparFiltrosRelatorio();
                        case 'exportarCSV': return exportarCSVRelatorio();
                        case 'exportarPDFRelatorio': return exportarPDFRelatorio();
                    }
                }

                const itemAluno = ev.target.closest('.prot-professor-item[data-aluno-id]');
                if (itemAluno) { ev.preventDefault(); selecionarAluno(itemAluno.getAttribute('data-aluno-id')); return; }

                const btnAluno = ev.target.closest('[data-aluno-action]');
                if (btnAluno) {
                    ev.preventDefault();
                    if (btnAluno.getAttribute('data-aluno-action') === 'limpar') limparAluno();
                    return;
                }

                const btnPag = ev.target.closest('[data-page]');
                if (btnPag) {
                    ev.preventDefault();
                    const page = parseInt(btnPag.getAttribute('data-page'));
                    if (!isNaN(page)) carregarLista(page);
                    return;
                }
            });

            content.addEventListener('change', (ev) => {
                if (ev.target && ev.target.id === 'atendCategoria') onTipoChange();
            });
        }

        // ===== EVENT DELEGATION — MODAIS (fora de #content) =====
        if (!document.body.dataset.atendModalDelegationVinculada) {
            document.body.dataset.atendModalDelegationVinculada = '1';
            document.body.addEventListener('click', (ev) => {
                const modal = ev.target.closest('#atendModalQRCode');
                if (modal) {
                    const acaoEl = ev.target.closest('[data-action]');
                    if (!acaoEl) return;
                    const acao = acaoEl.getAttribute('data-action');
                    ev.preventDefault();
                    switch (acao) {
                        case 'limparAssinatura': return limparCanvasInline();
                        case 'salvarAssinatura': return salvarAssinaturaInline();
                        case 'refazerAssinatura': return refazerAssinatura();
                        case 'fecharModalQRCode': return fecharModalQRCode();
                        case 'cancelarSessaoAssinatura': return cancelarSessaoAssinatura();
                        case 'mostrarCanvasAssinaturaInline': return mostrarCanvasAssinaturaInline();
                        case 'voltarParaQRCode': return voltarParaQRCode();
                    }
                    return;
                }

                const modalDet = ev.target.closest('#atendModalDetalhes');
                if (modalDet) {
                    const acaoEl = ev.target.closest('[data-action]');
                    if (!acaoEl) return;
                    const acao = acaoEl.getAttribute('data-action');
                    ev.preventDefault();
                    switch (acao) {
                        case 'fecharModalDetalhes': return fecharModalDetalhes();
                        case 'imprimirDoModal': return imprimirAtendimento(acaoEl.getAttribute('data-id'));
                        case 'editarDoModal': {
                            const id = acaoEl.getAttribute('data-id');
                            fecharModalDetalhes();
                            setTimeout(() => editarAtendimento(id), 250);
                            return;
                        }
                    }
                }
            });
        }
    }

    // ============================================
    // 🔍 BUSCAR ALUNOS
    // ============================================
    async function buscarAlunos(termo) {
        const lista = document.getElementById('atendListaAlunos');
        const empty = document.getElementById('atendAlunoEmptyState');
        if (!lista) return;

        const turma = document.getElementById('atendFiltroTurma')?.value || '';
        const curso = document.getElementById('atendFiltroCurso')?.value || '';

        if (!turma && !curso && (!termo || termo.trim().length < 2)) {
            lista.style.display = 'none';
            if (empty) empty.style.display = 'block';
            return;
        }

        if (empty) empty.style.display = 'none';
        lista.style.display = 'block';
        lista.innerHTML = '<div class="text-center py-3"><i class="fas fa-spinner fa-spin"></i> Buscando...</div>';

        try {
            const params = new URLSearchParams();
            if (turma) params.append('turma', turma);
            if (curso) params.append('curso', curso);
            if (termo && termo.trim().length >= 2) params.append('termo', termo.trim());

            const response = await fetch(`/api/atendimento-protagonismo/alunos-por-turma?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            if (data.success && Array.isArray(data.alunos) && data.alunos.length > 0) {
                state.alunosBuscados = data.alunos;
                lista.innerHTML = data.alunos.map(a => {
                    const id = a._id || a.id;
                    return `
                        <div class="prot-professor-item" data-aluno-id="${escapeHtml(id)}">
                            <div class="prot-prof-avatar">${(a.nome || '?').charAt(0).toUpperCase()}</div>
                            <div class="prot-prof-info">
                                <div class="prot-prof-nome">${escapeHtml(a.nome)}</div>
                                <div class="prot-prof-detalhes">
                                    ${a.matricula ? `<span><i class="fas fa-id-card"></i> ${escapeHtml(a.matricula)}</span>` : ''}
                                    ${a.turma ? `<span><i class="fas fa-users"></i> ${escapeHtml(a.turma)}</span>` : ''}
                                    ${a.curso ? `<span><i class="fas fa-graduation-cap"></i> ${escapeHtml(a.curso)}</span>` : ''}
                                </div>
                            </div>
                            <i class="fas fa-chevron-right" style="color: #9ca3af;"></i>
                        </div>
                    `;
                }).join('');
            } else {
                lista.innerHTML = `<div class="text-center py-4" style="color:#9ca3af;">
                    <i class="fas fa-user-slash" style="font-size:32px;margin-bottom:10px;"></i>
                    <p style="margin:0;">Nenhum aluno encontrado com esses filtros.</p>
                </div>`;
            }
        } catch (error) {
            console.error('[Atendimento] Erro na busca:', error);
            lista.innerHTML = '<div class="text-center py-4 text-danger">Erro ao buscar alunos.</div>';
        }
    }

    // ============================================
    // ✅ SELECIONAR ALUNO
    // ============================================
    function selecionarAluno(id) {
        const aluno = state.alunosBuscados.find(a => (a._id || a.id) === id);
        if (!aluno) { console.warn('[Atendimento] Aluno não encontrado:', id); return; }
        fecharBannerRascunho();
        aplicarAlunoSelecionado(aluno);
        agendarSalvarRascunho();
    }

    function aplicarAlunoSelecionado(aluno) {
        if (!aluno) return;
        state.alunoSelecionado = aluno;

        const box = document.getElementById('atendAlunoSelecionado');
        if (box) {
            box.style.display = 'block';
            box.innerHTML = `
                <div class="prot-professor-box-content">
                    <div class="prot-professor-box-avatar">${(aluno.nome || '?').charAt(0).toUpperCase()}</div>
                    <div class="prot-professor-box-info">
                        <h5>${escapeHtml(aluno.nome)}</h5>
                        ${aluno.matricula ? `<p><i class="fas fa-id-card"></i> Matrícula: ${escapeHtml(aluno.matricula)}</p>` : ''}
                        ${aluno.turma ? `<p><i class="fas fa-users"></i> Turma: ${escapeHtml(aluno.turma)}</p>` : ''}
                        ${aluno.curso ? `<p><i class="fas fa-graduation-cap"></i> Curso: ${escapeHtml(aluno.curso)}</p>` : ''}
                    </div>
                    <button class="btn btn-sm btn-outline-danger" data-aluno-action="limpar" style="border-radius: 10px;">
                        <i class="fas fa-times"></i> Trocar
                    </button>
                </div>
            `;
        }

        const filtros = document.getElementById('atendFiltrosAluno');
        if (filtros) filtros.style.display = 'none';
        const lista = document.getElementById('atendListaAlunos');
        if (lista) lista.style.display = 'none';
        const empty = document.getElementById('atendAlunoEmptyState');
        if (empty) empty.style.display = 'none';

        const cardDados = document.getElementById('atendCardDados');
        if (cardDados) cardDados.style.display = 'block';
    }

    function limparAluno() {
        state.alunoSelecionado = null;
        const box = document.getElementById('atendAlunoSelecionado');
        if (box) box.style.display = 'none';
        const filtros = document.getElementById('atendFiltrosAluno');
        if (filtros) filtros.style.display = '';
        const busca = document.getElementById('atendBuscaAluno');
        if (busca) busca.value = '';
        const lista = document.getElementById('atendListaAlunos');
        if (lista) { lista.style.display = 'none'; lista.innerHTML = ''; }
        const empty = document.getElementById('atendAlunoEmptyState');
        if (empty) empty.style.display = 'block';
        const cardDados = document.getElementById('atendCardDados');
        if (cardDados) cardDados.style.display = 'none';
        limparRascunho();
    }

    function onTipoChange() {
        const tipo = document.getElementById('atendCategoria')?.value;
        const div = document.getElementById('atendCategoriaOutrosDiv');
        if (div) div.style.display = tipo === 'outros' ? 'block' : 'none';
        agendarSalvarRascunho();
    }

    // ============================================
    // ✍️ ASSINATURA (QR CODE)
    // ============================================
    async function toggleAssinatura() {
        const check = document.getElementById('atendNecessitaAssinatura');
        const bloco = document.getElementById('atendBlocoAssinatura');
        if (!check || !bloco) return;

        if (check.checked) {
            if (!state.alunoSelecionado) {
                showToast('⚠️ Selecione um aluno primeiro', 'warning');
                check.checked = false;
                return;
            }

            const sessaoId = gerarUUID();
            state.sessaoAssinatura.sessaoId = sessaoId;
            state.sessaoAssinatura.assinaturaCapturada = null;

            try {
                const snapshot = montarSnapshotAtendimento();

                const response = await fetch('/api/sessoes-assinatura', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                    body: JSON.stringify({
                        sessaoId,
                        tipo: 'atendimento_protagonismo',
                        dadosAtendimento: snapshot
                    })
                });
                const data = await response.json();
                if (!data.success) throw new Error(data.error || 'Erro ao criar sessão');

                const urlAssinatura = `${window.location.origin}/protagonismo.html?assinatura=${sessaoId}`;

                try {
                    const qrResponse = await fetch('/api/qrcode/gerar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                        body: JSON.stringify({ url: urlAssinatura })
                    });
                    const qrData = await qrResponse.json();
                    if (qrData.success && qrData.qrCode) {
                        state.sessaoAssinatura.qrCodeDataUrl = qrData.qrCode;
                    } else {
                        state.sessaoAssinatura.qrCodeDataUrl =
                            `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
                    }
                } catch (e) {
                    state.sessaoAssinatura.qrCodeDataUrl =
                        `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
                }

                abrirModalQRCode(urlAssinatura);
                iniciarMonitoramentoSessao(sessaoId);
                showToast('📱 QR Code gerado! Peça para o aluno escanear ou assine na tela.', 'info');

            } catch (error) {
                console.error('❌ Erro ao criar sessão:', error);
                showToast('❌ ' + error.message, 'error');
                check.checked = false;
                state.sessaoAssinatura.sessaoId = null;
            }
        } else {
            if (state.sessaoAssinatura.sessaoId) {
                try {
                    await fetch(`/api/sessoes-assinatura/${state.sessaoAssinatura.sessaoId}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${getToken()}` }
                    });
                } catch (e) {}
            }
            state.sessaoAssinatura.sessaoId = null;
            state.sessaoAssinatura.assinaturaCapturada = null;
            state.sessaoAssinatura.qrCodeDataUrl = null;
            if (state.sessaoAssinatura.intervaloMonitoramento) {
                clearInterval(state.sessaoAssinatura.intervaloMonitoramento);
                state.sessaoAssinatura.intervaloMonitoramento = null;
            }
            bloco.style.display = 'none';
            bloco.innerHTML = '';
            fecharModalQRCode();
            agendarSalvarRascunho();
        }
    }

    function montarSnapshotAtendimento() {
        const data = document.getElementById('atendDataAtendimento')?.value;
        const categoria = document.getElementById('atendCategoria')?.value;
        const categoriaOutros = document.getElementById('atendCategoriaOutros')?.value || '';
        const motivo = document.getElementById('atendMotivoPrincipal')?.value || '';

        return {
            alunoNome: state.alunoSelecionado?.nome,
            alunoMatricula: state.alunoSelecionado?.matricula,
            alunoTurma: state.alunoSelecionado?.turma,
            alunoCurso: state.alunoSelecionado?.curso,
            data: data,
            dataFormatada: data ? new Date(data + 'T12:00:00').toLocaleDateString('pt-BR') : '',
            categoria: categoria,
            categoriaLabel: categoria === 'outros' && categoriaOutros ? `Outros (${categoriaOutros})` : labelCategoria(categoria),
            motivo: motivo
        };
    }

    function abrirModalQRCode(urlAssinatura) {
        let modal = document.getElementById('atendModalQRCode');
        if (modal) modal.remove();

        const qrUrl = state.sessaoAssinatura.qrCodeDataUrl ||
            `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;

        const modalHtml = `
            <div class="modal fade" id="atendModalQRCode" tabindex="-1" data-bs-backdrop="static">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content" style="border-radius: 20px; border: none; overflow: hidden;">
                        <div class="modal-header" style="background: linear-gradient(135deg, #4c1d95, #7e22ce); color: white; border: none; padding: 20px 25px;">
                            <h5 class="modal-title" style="display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-signature"></i> Aguardando Assinatura
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-action="fecharModalQRCode"></button>
                        </div>
                        <div class="modal-body" style="padding: 30px; text-align: center;">
                            <div id="atendQrView">
                                <div id="atendModalQRStatus" style="margin-bottom: 20px;">
                                    <div style="background: #fef3c7; border-radius: 12px; padding: 14px; display: flex; align-items: center; gap: 12px; text-align: left;">
                                        <div style="width: 40px; height: 40px; border-radius: 50%; border: 4px solid #f59e0b; border-top-color: transparent; animation: spinProt 1s linear infinite; flex-shrink: 0;"></div>
                                        <div>
                                            <strong style="color: #92400e;">Aguardando assinatura...</strong>
                                            <p style="margin: 3px 0 0; font-size: 13px; color: #78350f;">Peça para o aluno escanear o QR Code</p>
                                        </div>
                                    </div>
                                </div>
                                <div style="background: white; border: 2px solid #e2e8f0; border-radius: 16px; padding: 20px; display: inline-block;">
                                    <img src="${qrUrl}" alt="QR Code" id="atendQrCodeImage" style="width: 260px; height: 260px; display: block;">
                                    <p style="margin: 12px 0 0; font-size: 13px; color: #64748b;"><i class="fas fa-mobile-alt"></i> Aponte a câmera do celular</p>
                                </div>
                                <div style="margin-top: 20px; padding: 14px; background: #faf5ff; border-radius: 12px; font-size: 13px; color: #6b21a8; text-align: left;">
                                    <div style="display: flex; gap: 8px;">
                                        <i class="fas fa-info-circle"></i>
                                        <span>O aluno assina direto no celular dele. Assim que confirmar, você verá automaticamente.</span>
                                    </div>
                                </div>
                                <div style="margin-top: 16px;">
                                    <button type="button" onclick="AtendimentoProtagonismoModule.copiarLinkAssinatura('${urlAssinatura}')" class="btn btn-sm btn-outline-secondary" style="border-radius: 10px;">
                                        <i class="fas fa-link"></i> Copiar link
                                    </button>
                                </div>
                                <div style="margin-top: 14px; padding-top: 14px; border-top: 1px dashed #cbd5e1;">
                                    <p style="margin: 0 0 8px; font-size: 12px; color: #64748b;">Não consegue escanear?</p>
                                    <button type="button" data-action="mostrarCanvasAssinaturaInline" style="background: transparent; border: none; color: #7e22ce; font-weight: 600; font-size: 14px; cursor: pointer; text-decoration: underline; padding: 6px 10px; border-radius: 8px;">
                                        <i class="fas fa-pen-fancy"></i> Assinar aqui mesmo
                                    </button>
                                </div>
                            </div>

                            <div id="atendCanvasView" style="display: none;">
                                <div style="background: #faf5ff; border-radius: 12px; padding: 14px; margin-bottom: 16px; text-align: left;">
                                    <div style="display: flex; gap: 8px;">
                                        <i class="fas fa-info-circle" style="color: #6b21a8;"></i>
                                        <span style="font-size: 13px; color: #6b21a8;">Peça para o aluno assinar no espaço abaixo com o dedo ou mouse.</span>
                                    </div>
                                </div>
                                <div id="atendModalCanvasWrapper" style="position: relative; background: white; border: 3px dashed #cbd5e0; border-radius: 16px; overflow: hidden; height: 260px; margin-bottom: 14px; touch-action: none;">
                                    <canvas id="atendModalCanvas" style="width: 100%; height: 100%; display: block;"></canvas>
                                    <div id="atendModalPlaceholder" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #94a3b8; pointer-events: none; width: 100%;">
                                        <i class="fas fa-pen-fancy" style="font-size: 28px; display: block; margin-bottom: 5px;"></i>
                                        <span style="font-size: 13px;">Assine aqui</span>
                                    </div>
                                </div>
                                <div style="display: flex; gap: 10px;">
                                    <button type="button" data-action="limparAssinatura" style="flex: 1; padding: 12px; background: #f1f5f9; color: #475569; border: none; border-radius: 10px; font-weight: 600; font-size: 14px; cursor: pointer;">
                                        <i class="fas fa-eraser"></i> Limpar
                                    </button>
                                    <button type="button" id="atendBtnConfirmarInline" data-action="salvarAssinatura" disabled style="flex: 2; padding: 12px; background: #cbd5e0; color: white; border: none; border-radius: 10px; font-weight: 600; font-size: 14px; cursor: not-allowed;">
                                        <i class="fas fa-check"></i> Confirmar Assinatura
                                    </button>
                                </div>
                                <div style="margin-top: 14px;">
                                    <button type="button" data-action="voltarParaQRCode" style="background: transparent; border: none; color: #64748b; font-size: 13px; cursor: pointer; text-decoration: underline;">
                                        <i class="fas fa-arrow-left"></i> Voltar para o QR Code
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer" style="border-top: 1px solid #e5e7eb; padding: 15px 25px; justify-content: space-between;">
                            <button type="button" class="btn btn-outline-secondary" data-action="fecharModalQRCode" style="border-radius: 10px;">
                                <i class="fas fa-eye-slash"></i> Ocultar
                            </button>
                            <button type="button" class="btn btn-danger" data-action="cancelarSessaoAssinatura" style="border-radius: 10px;">
                                <i class="fas fa-times"></i> Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        state.sessaoAssinatura.modalInstance = new bootstrap.Modal(document.getElementById('atendModalQRCode'));
        state.sessaoAssinatura.modalInstance.show();

        setTimeout(() => {
            const img = document.getElementById('atendQrCodeImage');
            if (img && window.innerWidth < 500) {
                img.style.width = '200px';
                img.style.height = '200px';
            }
        }, 200);
    }

    function fecharModalQRCode() {
        const modal = document.getElementById('atendModalQRCode');
        if (modal) {
            const instance = bootstrap.Modal.getInstance(modal);
            if (instance) instance.hide();
            setTimeout(() => modal.remove(), 300);
        }
        state.sessaoAssinatura.modalInstance = null;
    }

    function mostrarCanvasAssinaturaInline() {
        const qrView = document.getElementById('atendQrView');
        const canvasView = document.getElementById('atendCanvasView');
        if (!qrView || !canvasView) return;
        qrView.style.display = 'none';
        canvasView.style.display = 'block';
        setTimeout(() => inicializarCanvasModal(), 50);
    }

    function voltarParaQRCode() {
        const qrView = document.getElementById('atendQrView');
        const canvasView = document.getElementById('atendCanvasView');
        if (!qrView || !canvasView) return;
        canvasView.style.display = 'none';
        qrView.style.display = 'block';
    }

    function inicializarCanvasModal() {
        const canvas = document.getElementById('atendModalCanvas');
        const wrapper = document.getElementById('atendModalCanvasWrapper');
        const placeholder = document.getElementById('atendModalPlaceholder');
        if (!canvas || !wrapper) return;

        const st = state.sessaoAssinatura.canvasInline;
        st.canvas = canvas;
        st.wrapper = wrapper;
        st.placeholder = placeholder;
        st.desenhando = false;
        st.temAssinatura = false;

        const rect = wrapper.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            setTimeout(() => inicializarCanvasModal(), 100);
            return;
        }

        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';

        const ctx = canvas.getContext('2d');
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#4c1d95';
        st.ctx = ctx;

        const btn = document.getElementById('atendBtnConfirmarInline');
        if (btn) { btn.disabled = true; btn.style.background = '#cbd5e0'; btn.style.cursor = 'not-allowed'; }

        if (placeholder) placeholder.style.opacity = '1';
        wrapper.style.borderColor = '#cbd5e0';
        wrapper.style.borderStyle = 'dashed';

        const getPos = (e) => {
            const r = canvas.getBoundingClientRect();
            let cx, cy;
            if (e.touches?.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
            else if (e.changedTouches?.length > 0) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; }
            else { cx = e.clientX; cy = e.clientY; }
            return { x: cx - r.left, y: cy - r.top };
        };

        const iniciar = (e) => {
            e.preventDefault();
            st.desenhando = true;
            st.temAssinatura = true;
            const p = getPos(e);
            st.lastX = p.x; st.lastY = p.y;
            wrapper.style.borderColor = '#4c1d95';
            wrapper.style.borderStyle = 'solid';
            if (placeholder) placeholder.style.opacity = '0';
            if (btn) { btn.disabled = false; btn.style.background = 'linear-gradient(135deg, #10b981, #059669)'; btn.style.cursor = 'pointer'; }
        };

        const desenhar = (e) => {
            if (!st.desenhando) return;
            e.preventDefault();
            const p = getPos(e);
            st.ctx.beginPath();
            st.ctx.moveTo(st.lastX, st.lastY);
            st.ctx.lineTo(p.x, p.y);
            st.ctx.stroke();
            st.lastX = p.x; st.lastY = p.y;
        };

        const parar = (e) => {
            if (e?.preventDefault) e.preventDefault();
            st.desenhando = false;
        };

        canvas.addEventListener('touchstart', iniciar, { passive: false });
        canvas.addEventListener('touchmove', desenhar, { passive: false });
        canvas.addEventListener('touchend', parar, { passive: false });
        canvas.addEventListener('touchcancel', parar, { passive: false });
        canvas.addEventListener('mousedown', iniciar);
        canvas.addEventListener('mousemove', desenhar);
        canvas.addEventListener('mouseup', parar);
        canvas.addEventListener('mouseleave', () => { if (st.desenhando) parar(); });
    }

    function limparCanvasInline() {
        const st = state.sessaoAssinatura.canvasInline;
        if (!st || !st.canvas || !st.ctx) return;
        const rect = st.canvas.getBoundingClientRect();
        st.ctx.clearRect(0, 0, rect.width, rect.height);
        st.temAssinatura = false;
        if (st.placeholder) st.placeholder.style.opacity = '1';
        if (st.wrapper) { st.wrapper.style.borderColor = '#cbd5e0'; st.wrapper.style.borderStyle = 'dashed'; }
        const btn = document.getElementById('atendBtnConfirmarInline');
        if (btn) { btn.disabled = true; btn.style.background = '#cbd5e0'; btn.style.cursor = 'not-allowed'; }
    }

    async function salvarAssinaturaInline() {
        const st = state.sessaoAssinatura.canvasInline;
        if (!st || !st.temAssinatura || !st.canvas) {
            showToast('⚠️ Assine antes de confirmar', 'warning');
            return;
        }
        const sessaoId = state.sessaoAssinatura.sessaoId;
        if (!sessaoId) { showToast('⚠️ Sessão não encontrada', 'error'); return; }

        const btn = document.getElementById('atendBtnConfirmarInline');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }

        try {
            const base64 = st.canvas.toDataURL('image/png');
            const response = await fetch(`/api/sessoes-assinatura/${sessaoId}/assinar`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ assinaturaBase64: base64, assinanteNome: 'Aluno' })
            });
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro ao salvar');

            state.sessaoAssinatura.assinaturaCapturada = base64;
            if (state.sessaoAssinatura.intervaloMonitoramento) {
                clearInterval(state.sessaoAssinatura.intervaloMonitoramento);
                state.sessaoAssinatura.intervaloMonitoramento = null;
            }

            const canvasView = document.getElementById('atendCanvasView');
            if (canvasView) {
                const agora = new Date().toLocaleString('pt-BR');
                canvasView.innerHTML = `
                    <div style="animation: fadeInCanvasProt 0.3s ease;">
                        <div style="background: linear-gradient(135deg, #10b981, #059669); border-radius: 14px; padding: 16px 20px; margin-bottom: 16px; display: flex; align-items: center; gap: 14px; color: white; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);">
                            <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,0.25); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <i class="fas fa-check" style="font-size: 22px;"></i>
                            </div>
                            <div style="flex: 1; text-align: left;">
                                <h4 style="margin: 0 0 2px; font-size: 16px; font-weight: 700;">Assinatura Registrada!</h4>
                                <p style="margin: 0; font-size: 13px; opacity: 0.95;">Confirmada em ${agora}</p>
                            </div>
                        </div>
                        <div style="text-align: left; margin-bottom: 10px;">
                            <span style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;"><i class="fas fa-signature"></i> Assinatura capturada</span>
                        </div>
                        <div style="position: relative; background: #f0fdf4; border: 3px solid #10b981; border-radius: 16px; overflow: hidden; height: 220px; display: flex; align-items: center; justify-content: center; padding: 12px; box-sizing: border-box; box-shadow: inset 0 2px 8px rgba(16, 185, 129, 0.08);">
                            <img src="${base64}" alt="Assinatura" style="max-width: 100%; max-height: 100%; object-fit: contain; display: block;">
                            <div style="position: absolute; top: 10px; right: 10px; background: #10b981; color: white; padding: 4px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; display: flex; align-items: center; gap: 4px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.4);">
                                <i class="fas fa-lock" style="font-size: 9px;"></i> VERIFICADA
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px; margin-top: 16px;">
                            <button type="button" data-action="refazerAssinatura" style="flex: 1; padding: 12px; background: #fef3c7; color: #92400e; border: 2px solid #f59e0b; border-radius: 10px; font-weight: 600; font-size: 13px; cursor: pointer;">
                                <i class="fas fa-redo"></i> Refazer
                            </button>
                            <button type="button" data-action="fecharModalQRCode" style="flex: 2; padding: 12px; background: linear-gradient(135deg, #4c1d95, #7e22ce); color: white; border: none; border-radius: 10px; font-weight: 600; font-size: 13px; cursor: pointer;">
                                <i class="fas fa-check-circle"></i> Concluir
                            </button>
                        </div>
                    </div>
                `;
            }

            mostrarAssinaturaCapturada({ assinaturaBase64: base64, assinadaPorNome: 'Aluno', assinadaEm: new Date().toISOString() });
            showToast('✅ Assinatura registrada com sucesso!', 'success');

        } catch (e) {
            console.error('❌ Erro:', e);
            showToast('❌ ' + e.message, 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Confirmar Assinatura'; }
        }
    }

    function iniciarMonitoramentoSessao(sessaoId) {
        if (state.sessaoAssinatura.intervaloMonitoramento) {
            clearInterval(state.sessaoAssinatura.intervaloMonitoramento);
        }
        const intervalId = setInterval(async () => {
            try {
                const response = await fetch(`/api/sessoes-assinatura/${sessaoId}`, {
                    headers: { 'Authorization': `Bearer ${getToken()}` }
                });
                if (!response.ok) {
                    if (response.status === 404) clearInterval(intervalId);
                    return;
                }
                const data = await response.json();
                if (!data.success) return;

                if (data.sessao.status === 'assinado') {
                    state.sessaoAssinatura.assinaturaCapturada = data.sessao.assinaturaBase64;
                    clearInterval(intervalId);
                    state.sessaoAssinatura.intervaloMonitoramento = null;
                    fecharModalQRCode();
                    mostrarAssinaturaCapturada(data.sessao);
                    showToast(`✅ Assinatura capturada por ${data.sessao.assinadaPorNome}!`, 'success');
                }
            } catch (e) {}
        }, 3000);
        state.sessaoAssinatura.intervaloMonitoramento = intervalId;
    }

    function mostrarAssinaturaCapturada(sessao) {
        const bloco = document.getElementById('atendBlocoAssinatura');
        if (!bloco) return;
        bloco.style.display = 'block';
        bloco.innerHTML = `
            <div style="margin-top: 10px; background: #f0fdf4; border: 2px solid #10b981; border-radius: 12px; padding: 14px;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                    <i class="fas fa-check-circle" style="color: #10b981; font-size: 22px;"></i>
                    <div style="flex: 1;">
                        <strong style="color: #065f46;">✓ Assinatura capturada!</strong>
                        <p style="margin: 3px 0 0; font-size: 12px; color: #047857;">
                            Assinado por <strong>${escapeHtml(sessao.assinadaPorNome || '')}</strong>
                            ${sessao.assinadaEm ? ` em ${new Date(sessao.assinadaEm).toLocaleString('pt-BR')}` : ''}
                        </p>
                    </div>
                </div>
                <div style="background: white; border-radius: 8px; padding: 8px; text-align: center;">
                    <img src="${sessao.assinaturaBase64}" style="max-width: 100%; max-height: 100px;" alt="Assinatura">
                </div>
                <button type="button" data-action="refazerAssinatura" class="btn btn-sm btn-outline-danger w-100 mt-2" style="border-radius: 8px;">
                    <i class="fas fa-redo"></i> Refazer Assinatura
                </button>
            </div>
        `;
        agendarSalvarRascunho();
    }

    async function refazerAssinatura() {
        const ok = await window.confirm('Refazer a assinatura? A atual será descartada.');
        if (!ok) return;
        const sessaoId = state.sessaoAssinatura.sessaoId;
        if (sessaoId) {
            try {
                await fetch(`/api/sessoes-assinatura/${sessaoId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${getToken()}` }
                });
            } catch (e) {}
        }
        if (state.sessaoAssinatura.intervaloMonitoramento) {
            clearInterval(state.sessaoAssinatura.intervaloMonitoramento);
            state.sessaoAssinatura.intervaloMonitoramento = null;
        }
        state.sessaoAssinatura.sessaoId = null;
        state.sessaoAssinatura.assinaturaCapturada = null;
        state.sessaoAssinatura.qrCodeDataUrl = null;
        fecharModalQRCode();
        const bloco = document.getElementById('atendBlocoAssinatura');
        if (bloco) { bloco.style.display = 'none'; bloco.innerHTML = ''; }
        const check = document.getElementById('atendNecessitaAssinatura');
        if (check) { check.checked = true; setTimeout(() => toggleAssinatura(), 350); }
    }

    async function copiarLinkAssinatura(url) {
        try {
            await navigator.clipboard.writeText(url);
            showToast('✅ Link copiado!', 'success');
        } catch (e) {
            const textarea = document.createElement('textarea');
            textarea.value = url;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('✅ Link copiado!', 'success');
        }
    }

    async function cancelarSessaoAssinatura() {
        if (state.sessaoAssinatura.sessaoId) {
            try {
                await fetch(`/api/sessoes-assinatura/${state.sessaoAssinatura.sessaoId}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${getToken()}` }
                });
            } catch (e) {}
        }
        if (state.sessaoAssinatura.intervaloMonitoramento) {
            clearInterval(state.sessaoAssinatura.intervaloMonitoramento);
            state.sessaoAssinatura.intervaloMonitoramento = null;
        }
        state.sessaoAssinatura.sessaoId = null;
        state.sessaoAssinatura.assinaturaCapturada = null;
        state.sessaoAssinatura.qrCodeDataUrl = null;
        const check = document.getElementById('atendNecessitaAssinatura');
        if (check) check.checked = false;
        const bloco = document.getElementById('atendBlocoAssinatura');
        if (bloco) { bloco.style.display = 'none'; bloco.innerHTML = ''; }
        fecharModalQRCode();
        showToast('Sessão cancelada', 'info');
        agendarSalvarRascunho();
    }

    // ============================================
    // 💾 REGISTRAR / ATUALIZAR
    // ============================================
    async function registrarAtendimento() {
        if (!state.alunoSelecionado) { showToast('⚠️ Selecione um aluno', 'warning'); return; }

        const data = document.getElementById('atendDataAtendimento')?.value;
        const categoria = document.getElementById('atendCategoria')?.value;
        const categoriaOutros = document.getElementById('atendCategoriaOutros')?.value || '';
        const motivo = document.getElementById('atendMotivoPrincipal')?.value || '';
        const encaminhamento = document.getElementById('atendEncaminhamento')?.value || '';
        const observacoes = document.getElementById('atendObservacoesAdicionais')?.value || '';
        const precisaAssinatura = document.getElementById('atendNecessitaAssinatura')?.checked;

        if (!data || !categoria || !motivo) { showToast('⚠️ Preencha a data, categoria e motivo', 'warning'); return; }
        if (categoria === 'outros' && !categoriaOutros.trim()) { showToast('⚠️ Especifique a categoria', 'warning'); return; }
        if (precisaAssinatura && !state.sessaoAssinatura.assinaturaCapturada) {
            showToast('⚠️ Aguardando assinatura', 'warning'); return;
        }

        const btn = document.getElementById('atendBtnRegistrar');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Salvando...'; }

        try {
            const body = {
                alunoId: state.alunoSelecionado._id || state.alunoSelecionado.id,
                alunoNome: state.alunoSelecionado.nome,
                alunoMatricula: state.alunoSelecionado.matricula,
                alunoTurma: state.alunoSelecionado.turma,
                alunoCurso: state.alunoSelecionado.curso,
                dataAtendimento: data,
                categoriaAtendimento: categoria,
                categoriaOutrosDescricao: categoria === 'outros' ? categoriaOutros.trim() : null,
                motivoPrincipal: motivo,
                encaminhamentoRealizado: encaminhamento.trim(),
                observacoesAdicionais: observacoes.trim(),
                assinaturaDigitalBase64: state.sessaoAssinatura.assinaturaCapturada || null,
                assinadoPorNome: 'Aluno'
            };

            const editando = state.modoEdicao.ativo && state.modoEdicao.registroId;
            const url = editando
                ? `/api/atendimento-protagonismo/${state.modoEdicao.registroId}`
                : '/api/atendimento-protagonismo/registrar';
            const method = editando ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                body: JSON.stringify(body)
            });
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Erro ao salvar');

            limparRascunho();
            state.sessaoAssinatura.assinaturaCapturada = null;

            if (state.sessaoAssinatura.sessaoId) {
                try {
                    await fetch(`/api/sessoes-assinatura/${state.sessaoAssinatura.sessaoId}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${getToken()}` }
                    });
                } catch (e) {}
            }
            if (state.sessaoAssinatura.intervaloMonitoramento) {
                clearInterval(state.sessaoAssinatura.intervaloMonitoramento);
                state.sessaoAssinatura.intervaloMonitoramento = null;
            }
            state.sessaoAssinatura.sessaoId = null;

            showToast(editando ? '✅ Atendimento atualizado com sucesso!' : '✅ ' + result.message, 'success');

            state.modoEdicao = { ativo: false, registroId: null, codigoProtocolo: null };
            esconderBannerEdicao();

            await carregarLista(1);
            resetarFormulario();

            const listaTab = document.getElementById('atend-lista-tab');
            if (listaTab) try { new bootstrap.Tab(listaTab).show(); } catch (e) {}

        } catch (error) {
            console.error('[Atendimento] Erro ao salvar:', error);
            showToast('❌ ' + error.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = state.modoEdicao.ativo
                    ? '<i class="fas fa-save me-2"></i> Salvar Alterações'
                    : '<i class="fas fa-save me-2"></i> Registrar Atendimento';
            }
        }
    }

    function resetarFormulario(opts) {
        const manterRascunho = !!(opts && opts.manterRascunho === true);

        state.alunoSelecionado = null;
        state.sessaoAssinatura.assinaturaCapturada = null;
        state.sessaoAssinatura.sessaoId = null;
        state.modoEdicao = { ativo: false, registroId: null, codigoProtocolo: null };
        esconderBannerEdicao();

        const btnReg = document.getElementById('atendBtnRegistrar');
        if (btnReg) btnReg.innerHTML = '<i class="fas fa-save me-2"></i> Registrar Atendimento';

        if (state.sessaoAssinatura.intervaloMonitoramento) {
            clearInterval(state.sessaoAssinatura.intervaloMonitoramento);
            state.sessaoAssinatura.intervaloMonitoramento = null;
        }

        const dataEl = document.getElementById('atendDataAtendimento');
        if (dataEl) dataEl.value = getDataLocalISO();

        ['atendCategoria', 'atendCategoriaOutros', 'atendMotivoPrincipal', 'atendEncaminhamento', 'atendObservacoesAdicionais'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        const check = document.getElementById('atendNecessitaAssinatura');
        if (check) check.checked = false;

        const divOutros = document.getElementById('atendCategoriaOutrosDiv');
        if (divOutros) divOutros.style.display = 'none';

        const blocoAssinatura = document.getElementById('atendBlocoAssinatura');
        if (blocoAssinatura) { blocoAssinatura.style.display = 'none'; blocoAssinatura.innerHTML = ''; }

        const cardDados = document.getElementById('atendCardDados');
        if (cardDados) cardDados.style.display = 'none';

        const box = document.getElementById('atendAlunoSelecionado');
        if (box) box.style.display = 'none';

        const filtros = document.getElementById('atendFiltrosAluno');
        if (filtros) filtros.style.display = '';

        const lista = document.getElementById('atendListaAlunos');
        if (lista) { lista.style.display = 'none'; lista.innerHTML = ''; }

        const empty = document.getElementById('atendAlunoEmptyState');
        if (empty) empty.style.display = 'block';

        const busca = document.getElementById('atendBuscaAluno');
        if (busca) busca.value = '';

        const selTurma = document.getElementById('atendFiltroTurma');
        const selCurso = document.getElementById('atendFiltroCurso');
        if (selTurma) selTurma.value = '';
        if (selCurso) selCurso.value = '';

        const paneRegistrar = document.getElementById('atend-registrar');
        const paneLista = document.getElementById('atend-lista');
        const paneDash = document.getElementById('atend-dashboard');
        const paneRel = document.getElementById('atend-relatorio');
        [paneRegistrar, paneLista, paneDash, paneRel].forEach(p => { if (p) p.style.display = ''; });

        if (manterRascunho) {
            clearTimeout(state.rascunho.timer);
            atualizarIndicadorRascunho(false);
        } else {
            limparRascunho();
        }
    }

    // ============================================
    // 📋 HISTÓRICO
    // ============================================
    async function carregarLista(pagina = 1) {
        const container = document.getElementById('atendListaAtendimentos');
        if (!container) return;

        container.innerHTML = '<div class="text-center py-5"><p>Carregando histórico...</p></div>';

        try {
            const mes = document.getElementById('atendFiltroMes')?.value || '';
            const busca = document.getElementById('atendFiltroBusca')?.value || '';

            const params = new URLSearchParams();
            params.append('paginaAtual', pagina);
            params.append('limiteRegistros', state.paginacao.porPagina);
            if (mes) params.append('mesReferencia', mes);
            if (busca) params.append('termoBusca', busca);

            const response = await fetch(`/api/atendimento-protagonismo/listar?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (!response.ok) throw new Error(`API retornou HTTP ${response.status}`);
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro na listagem');

            state.registros = data.registros || [];
            state.paginacao = {
                pagina: data.paginacao.paginaAtual,
                porPagina: data.paginacao.limiteRegistros,
                total: data.paginacao.totalRegistros,
                totalPaginas: data.paginacao.totalPaginas
            };

            renderizarLista();
            renderizarPaginacao();
        } catch (error) {
            console.error('[Atendimento] Erro ao carregar lista:', error);
            container.innerHTML = `<div class="text-center py-5" style="color: #ef4444;">
                <i class="fas fa-exclamation-triangle" style="font-size: 32px; margin-bottom: 10px;"></i>
                <p>Não foi possível carregar o histórico.</p>
                <p style="font-size: 13px; color: #6b7280;">${escapeHtml(error.message || '')}</p>
            </div>`;
            throw error;
        }
    }

    function renderizarLista() {
        const container = document.getElementById('atendListaAtendimentos');
        if (!container) return;

        if (state.registros.length === 0) {
            container.innerHTML = '<div class="text-center py-5" style="color: #9ca3af;"><i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 15px;"></i><h5>Nenhum atendimento encontrado</h5><p>Registre o primeiro atendimento ou ajuste os filtros.</p></div>';
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-hover align-middle">
                    <thead style="background: #f8fafc;">
                        <tr>
                            <th>Código</th>
                            <th>Data</th>
                            <th>Aluno</th>
                            <th>Turma</th>
                            <th>Categoria</th>
                            <th>Motivo</th>
                            <th>Assinatura</th>
                            <th style="text-align:center; width:160px;">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.registros.map(r => {
                            const id = r._id || r.id;
                            return `
                                <tr>
                                    <td><code style="background: #f1f5f9; padding: 4px 8px; border-radius: 6px; font-size: 12px;">${escapeHtml(r.codigoProtocolo || '-')}</code></td>
                                    <td><strong>${r.dataAtendimento ? new Date(r.dataAtendimento).toLocaleDateString('pt-BR') : '-'}</strong></td>
                                    <td><strong>${escapeHtml(r.alunoNome || '-')}</strong></td>
                                    <td>${escapeHtml(r.alunoTurma || '-')}</td>
                                    <td><span class="badge" style="background: #7e22ce;">${escapeHtml(labelCategoria(r.categoriaAtendimento))}</span></td>
                                    <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(r.motivoPrincipal || '')}">${escapeHtml(r.motivoPrincipal || '-')}</td>
                                    <td>
                                        ${r.assinaturaDigitalBase64
                                            ? '<span class="badge bg-success"><i class="fas fa-signature"></i> Assinado</span>'
                                            : '<span class="badge bg-secondary">Sem</span>'}
                                    </td>
                                    <td style="text-align:center; white-space:nowrap;">
                                        <button class="atend-action-btn view" title="Verificar" data-action="verificarAtendimento" data-id="${id}"><i class="fas fa-eye"></i></button>
                                        <button class="atend-action-btn edit" title="Editar" data-action="editarAtendimento" data-id="${id}"><i class="fas fa-pen"></i></button>
                                        <button class="atend-action-btn print" title="Imprimir" data-action="imprimirAtendimento" data-id="${id}"><i class="fas fa-print"></i></button>
                                        <button class="atend-action-btn delete" title="Excluir" data-action="excluirAtendimento" data-id="${id}"><i class="fas fa-trash"></i></button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function renderizarPaginacao() {
        const container = document.getElementById('atendPaginacao');
        if (!container) return;
        const { pagina, totalPaginas, total } = state.paginacao;
        if (totalPaginas <= 1) { container.innerHTML = `<small class="text-muted">${total} registro(s)</small>`; return; }

        let botoes = '';
        if (pagina > 1) {
            botoes += `<li class="page-item"><a class="page-link" href="#" data-page="1">«</a></li>`;
            botoes += `<li class="page-item"><a class="page-link" href="#" data-page="${pagina - 1}">‹</a></li>`;
        }
        const inicio = Math.max(1, pagina - 2);
        const fim = Math.min(totalPaginas, inicio + 4);
        for (let i = inicio; i <= fim; i++) {
            botoes += `<li class="page-item ${i === pagina ? 'active' : ''}"><a class="page-link" href="#" data-page="${i}">${i}</a></li>`;
        }
        if (pagina < totalPaginas) {
            botoes += `<li class="page-item"><a class="page-link" href="#" data-page="${pagina + 1}">›</a></li>`;
            botoes += `<li class="page-item"><a class="page-link" href="#" data-page="${totalPaginas}">»</a></li>`;
        }

        container.innerHTML = `<div class="d-flex justify-content-between align-items-center pt-3 border-top"><small class="text-muted">Mostrando ${state.registros.length} de ${total}</small><nav><ul class="pagination pagination-sm mb-0">${botoes}</ul></nav></div>`;
    }

    async function obterRegistro(id) {
        const local = state.registros.find(r => (r._id || r.id) === id);
        if (local) return local;
        try {
            const response = await fetch(`/api/atendimento-protagonismo/${id}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await response.json();
            if (data.success) return data.registro;
        } catch (e) {}
        return null;
    }

    // ============================================
    // 🆕 VERIFICAR (detalhes)
    // ============================================
    async function verificarAtendimento(id) {
        const registro = await obterRegistro(id);
        if (!registro) { showToast('⚠️ Registro não encontrado', 'warning'); return; }

        const catLabel = registro.categoriaAtendimento === 'outros'
            ? `Outros${registro.categoriaOutrosDescricao ? ' (' + registro.categoriaOutrosDescricao + ')' : ''}`
            : labelCategoria(registro.categoriaAtendimento);

        const modalHtml = `
            <div class="modal fade" id="atendModalDetalhes" tabindex="-1">
                <div class="modal-dialog modal-dialog-centered modal-lg">
                    <div class="modal-content" style="border-radius: 20px; border: none; overflow: hidden;">
                        <div class="modal-header" style="background: linear-gradient(135deg, #4c1d95, #7e22ce); color: white; border: none; padding: 20px 25px;">
                            <h5 class="modal-title" style="display: flex; align-items: center; gap: 10px;">
                                <i class="fas fa-file-alt"></i> Detalhes do Atendimento
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-action="fecharModalDetalhes"></button>
                        </div>
                        <div class="modal-body" style="padding: 25px;">
                            <div style="background:#faf5ff; border:1px solid #e9d5ff; border-radius:10px; padding:12px 14px; margin-bottom:18px; display:flex; justify-content:space-between; align-items:center;">
                                <div>
                                    <div style="font-size:11px; text-transform:uppercase; color:#7e22ce; font-weight:700; letter-spacing:0.5px;">Código</div>
                                    <div style="font-size:16px; font-weight:700; color:#4c1d95;">${escapeHtml(registro.codigoProtocolo || '-')}</div>
                                </div>
                                <div style="text-align:right;">
                                    <div style="font-size:11px; text-transform:uppercase; color:#7e22ce; font-weight:700; letter-spacing:0.5px;">Data</div>
                                    <div style="font-size:14px; font-weight:700; color:#4c1d95;">${registro.dataAtendimento ? new Date(registro.dataAtendimento).toLocaleDateString('pt-BR') : '-'}</div>
                                </div>
                            </div>

                            <div class="row g-3">
                                <div class="col-md-6"><div class="prot-label">Aluno</div><div style="font-weight:600; color:#1e293b;">${escapeHtml(registro.alunoNome || '-')}</div></div>
                                <div class="col-md-6"><div class="prot-label">Matrícula</div><div style="color:#475569;">${escapeHtml(registro.alunoMatricula || '-')}</div></div>
                                <div class="col-md-6"><div class="prot-label">Turma</div><div style="color:#475569;">${escapeHtml(registro.alunoTurma || '-')}</div></div>
                                <div class="col-md-6"><div class="prot-label">Curso</div><div style="color:#475569;">${escapeHtml(registro.alunoCurso || '-')}</div></div>
                                <div class="col-12"><div class="prot-label">Categoria</div><span class="badge" style="background:#7e22ce; font-size:12px;">${escapeHtml(catLabel)}</span></div>
                                <div class="col-12"><div class="prot-label">Motivo Principal</div><div style="background:#f8fafc; border:1px solid #e5e7eb; border-radius:8px; padding:10px 12px; color:#1e293b; white-space:pre-wrap;">${escapeHtml(registro.motivoPrincipal || '-')}</div></div>
                                <div class="col-12"><div class="prot-label">Encaminhamento</div><div style="background:#f8fafc; border:1px solid #e5e7eb; border-radius:8px; padding:10px 12px; color:#1e293b; white-space:pre-wrap;">${escapeHtml(registro.encaminhamentoRealizado || '-')}</div></div>
                                <div class="col-12"><div class="prot-label">Observações Adicionais</div><div style="background:#f8fafc; border:1px solid #e5e7eb; border-radius:8px; padding:10px 12px; color:#1e293b; white-space:pre-wrap;">${escapeHtml(registro.observacoesAdicionais || '-')}</div></div>
                                ${registro.assinaturaDigitalBase64 ? `
                                    <div class="col-12">
                                        <div class="prot-label">Assinatura</div>
                                        <div style="background:#f0fdf4; border:2px solid #10b981; border-radius:10px; padding:12px; text-align:center;">
                                            <img src="${registro.assinaturaDigitalBase64}" alt="Assinatura" style="max-width:100%; max-height:140px;">
                                            <div style="font-size:12px; color:#047857; margin-top:6px;">
                                                Assinado por <strong>${escapeHtml(registro.assinadoPorNome || 'Aluno')}</strong>
                                                ${registro.assinadoEm ? ` em ${formatarDataHora(registro.assinadoEm)}` : ''}
                                            </div>
                                        </div>
                                    </div>
                                ` : `
                                    <div class="col-12">
                                        <div class="prot-label">Assinatura</div>
                                        <div style="background:#f3f4f6; border:2px dashed #cbd5e1; border-radius:10px; padding:12px; text-align:center; color:#6b7280;">
                                            <i class="fas fa-signature"></i> Sem assinatura registrada
                                        </div>
                                    </div>
                                `}
                            </div>
                        </div>
                        <div class="modal-footer" style="border-top:1px solid #e5e7eb; padding:15px 25px; justify-content:space-between;">
                            <button type="button" class="btn btn-outline-secondary" data-action="fecharModalDetalhes" style="border-radius:10px;"><i class="fas fa-times"></i> Fechar</button>
                            <div style="display:flex; gap:10px;">
                                <button type="button" class="btn btn-outline-success" data-action="imprimirDoModal" data-id="${registro._id || registro.id}" style="border-radius:10px;"><i class="fas fa-print"></i> Imprimir</button>
                                <button type="button" class="btn btn-primary" data-action="editarDoModal" data-id="${registro._id || registro.id}" style="background:#7e22ce; border:none; border-radius:10px;"><i class="fas fa-pen"></i> Editar</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('atendModalDetalhes')?.remove();
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        new bootstrap.Modal(document.getElementById('atendModalDetalhes')).show();
    }

    function fecharModalDetalhes() {
        const modal = document.getElementById('atendModalDetalhes');
        if (modal) {
            const instance = bootstrap.Modal.getInstance(modal);
            if (instance) instance.hide();
            setTimeout(() => modal.remove(), 300);
        }
    }

    // ============================================
    // 🆕 EDITAR
    // ============================================
    async function editarAtendimento(id) {
        const registro = await obterRegistro(id);
        if (!registro) { showToast('⚠️ Registro não encontrado', 'warning'); return; }

        const aba = document.getElementById('atend-registrar-tab');
        if (aba) { try { new bootstrap.Tab(aba).show(); } catch (e) { aba.click(); } }

        resetarFormulario({ manterRascunho: true });

        const alunoObj = {
            _id: registro.alunoId || registro._id,
            id: registro.alunoId || registro._id,
            nome: registro.alunoNome,
            matricula: registro.alunoMatricula,
            turma: registro.alunoTurma,
            curso: registro.alunoCurso
        };
        aplicarAlunoSelecionado(alunoObj);

        const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
        set('atendDataAtendimento', registro.dataAtendimento ? getDataLocalISO(new Date(registro.dataAtendimento)) : '');
        set('atendCategoria', registro.categoriaAtendimento);
        set('atendCategoriaOutros', registro.categoriaOutrosDescricao);
        set('atendMotivoPrincipal', registro.motivoPrincipal);
        set('atendEncaminhamento', registro.encaminhamentoRealizado);
        set('atendObservacoesAdicionais', registro.observacoesAdicionais);

        const divOutros = document.getElementById('atendCategoriaOutrosDiv');
        if (divOutros) divOutros.style.display = registro.categoriaAtendimento === 'outros' ? 'block' : 'none';

        if (registro.assinaturaDigitalBase64) {
            state.sessaoAssinatura.assinaturaCapturada = registro.assinaturaDigitalBase64;
            const check = document.getElementById('atendNecessitaAssinatura');
            if (check) check.checked = true;
            mostrarAssinaturaCapturada({
                assinaturaBase64: registro.assinaturaDigitalBase64,
                assinadaPorNome: registro.assinadoPorNome || 'Aluno',
                assinadaEm: registro.assinadoEm
            });
        }

        ativarModoEdicao(registro);
        showToast('✏️ Editando atendimento. Ao salvar, o registro será atualizado.', 'info');

        setTimeout(() => {
            document.getElementById('atendCardDados')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 300);

        agendarSalvarRascunho();
    }

    function ativarModoEdicao(registro, opts) {
        const silent = !!(opts && opts.silent);
        state.modoEdicao = {
            ativo: true,
            registroId: registro._id || registro.id,
            codigoProtocolo: registro.codigoProtocolo || ''
        };
        const banner = document.getElementById('atendBannerEdicao');
        if (banner) {
            banner.style.display = 'flex';
            const span = document.getElementById('atendBannerEdicaoCodigo');
            if (span) span.textContent = registro.codigoProtocolo ? `(${registro.codigoProtocolo})` : '';
        }
        const btn = document.getElementById('atendBtnRegistrar');
        if (btn) btn.innerHTML = '<i class="fas fa-save me-2"></i> Salvar Alterações';
        if (!silent) agendarSalvarRascunho();
    }

    function esconderBannerEdicao() {
        const banner = document.getElementById('atendBannerEdicao');
        if (banner) banner.style.display = 'none';
        const span = document.getElementById('atendBannerEdicaoCodigo');
        if (span) span.textContent = '';
    }

    function cancelarEdicao() {
        if (!window.confirm('Cancelar a edição? As alterações não salvas serão perdidas.')) return;
        resetarFormulario();
        showToast('Edição cancelada.', 'info');
    }

    // ============================================
    // 🆕 EXCLUIR
    // ============================================
    async function excluirAtendimento(id) {
        const registro = state.registros.find(r => (r._id || r.id) === id);
        const codigo = registro?.codigoProtocolo || '';
        const nome = registro?.alunoNome || '';

        if (!window.confirm(`Tem certeza que deseja EXCLUIR o atendimento ${codigo ? codigo + ' ' : ''}de ${nome}?\n\nEsta ação não pode ser desfeita.`)) return;

        try {
            const response = await fetch(`/api/atendimento-protagonismo/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro ao excluir');
            showToast('🗑️ Atendimento excluído com sucesso!', 'success');
            await carregarLista(state.paginacao.pagina || 1);
        } catch (e) {
            console.error(e);
            showToast('❌ ' + e.message, 'error');
        }
    }

    // ============================================
    // 🆕 IMPRIMIR (formato "documento oficial")
    // ============================================
    async function imprimirAtendimento(id) {
        const registro = await obterRegistro(id);
        if (!registro) { showToast('⚠️ Registro não encontrado', 'warning'); return; }
        imprimirRegistro(registro);
    }

    function imprimirRegistro(registro) {
        const catLabel = registro.categoriaAtendimento === 'outros'
            ? `Outros${registro.categoriaOutrosDescricao ? ' (' + registro.categoriaOutrosDescricao + ')' : ''}`
            : labelCategoria(registro.categoriaAtendimento);

        const dataFmt = registro.dataAtendimento ? new Date(registro.dataAtendimento).toLocaleDateString('pt-BR') : '-';

        const html = `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>Atendimento ${escapeHtml(registro.codigoProtocolo || '')}</title>
                <style>
                    * { box-sizing: border-box; }
                    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0; padding: 30px; background: white; }
                    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #4c1d95; padding-bottom: 16px; margin-bottom: 22px; }
                    .header-left { display: flex; align-items: center; gap: 14px; }
                    .logo { width: 56px; height: 56px; background: #4c1d95; color: white; border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 700; }
                    .header-text h1 { margin: 0; font-size: 20px; color: #4c1d95; }
                    .header-text p { margin: 2px 0 0; font-size: 12px; color: #64748b; }
                    .codigo-box { text-align: right; }
                    .codigo-box small { display: block; font-size: 10px; text-transform: uppercase; color: #7e22ce; font-weight: 700; letter-spacing: 0.5px; }
                    .codigo-box strong { font-size: 17px; color: #4c1d95; }
                    .badge { display: inline-block; background: #ede9fe; color: #4c1d95; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
                    .section { margin-bottom: 20px; }
                    .section-title { font-size: 13px; text-transform: uppercase; color: #7e22ce; font-weight: 700; letter-spacing: 0.6px; border-bottom: 1px solid #e9d5ff; padding-bottom: 6px; margin-bottom: 12px; }
                    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; }
                    .field { font-size: 13px; }
                    .field-label { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 3px; }
                    .field-value { color: #1e293b; font-weight: 600; }
                    .box { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; font-size: 13px; color: #1e293b; white-space: pre-wrap; line-height: 1.5; }
                    .assinatura { margin-top: 30px; display: flex; justify-content: space-around; gap: 30px; }
                    .assinatura-box { flex: 1; text-align: center; }
                    .assinatura-linha { border-top: 1.5px solid #1e293b; margin-top: 60px; padding-top: 6px; font-size: 12px; color: #1e293b; }
                    .assinatura-img { max-height: 70px; max-width: 100%; margin-bottom: 4px; }
                    .footer { margin-top: 30px; padding-top: 14px; border-top: 1px dashed #cbd5e1; font-size: 10px; color: #94a3b8; text-align: center; }
                    @media print { body { padding: 15px; } .no-print { display: none; } }
                    .no-print { text-align: center; margin-bottom: 20px; }
                    .no-print button { background: #4c1d95; color: white; border: none; padding: 10px 22px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; margin: 0 6px; }
                    .no-print button.secondary { background: #e5e7eb; color: #374151; }
                </style>
            </head>
            <body>
                <div class="no-print">
                    <button onclick="window.print()">🖨️ Imprimir</button>
                    <button class="secondary" onclick="window.close()">Fechar</button>
                </div>

                <div class="header">
                    <div class="header-left">
                        <div class="logo">P</div>
                        <div class="header-text">
                            <h1>Atendimento Protagonismo</h1>
                            <p>Registro oficial de atendimento ao aluno</p>
                        </div>
                    </div>
                    <div class="codigo-box">
                        <small>Código do Atendimento</small>
                        <strong>${escapeHtml(registro.codigoProtocolo || '-')}</strong>
                    </div>
                </div>

                <div class="section">
                    <div class="section-title">Dados do Aluno</div>
                    <div class="grid">
                        <div class="field"><div class="field-label">Nome</div><div class="field-value">${escapeHtml(registro.alunoNome || '-')}</div></div>
                        <div class="field"><div class="field-label">Matrícula</div><div class="field-value">${escapeHtml(registro.alunoMatricula || '-')}</div></div>
                        <div class="field"><div class="field-label">Turma</div><div class="field-value">${escapeHtml(registro.alunoTurma || '-')}</div></div>
                        <div class="field"><div class="field-label">Curso</div><div class="field-value">${escapeHtml(registro.alunoCurso || '-')}</div></div>
                    </div>
                </div>

                <div class="section">
                    <div class="section-title">Dados do Atendimento</div>
                    <div class="grid" style="margin-bottom:12px;">
                        <div class="field"><div class="field-label">Data do Atendimento</div><div class="field-value">${dataFmt}</div></div>
                        <div class="field"><div class="field-label">Categoria</div><div class="field-value"><span class="badge">${escapeHtml(catLabel)}</span></div></div>
                    </div>
                    <div class="field" style="margin-bottom:12px;"><div class="field-label">Motivo Principal</div><div class="box">${escapeHtml(registro.motivoPrincipal || '-')}</div></div>
                    <div class="field" style="margin-bottom:12px;"><div class="field-label">Encaminhamento</div><div class="box">${escapeHtml(registro.encaminhamentoRealizado || '-')}</div></div>
                    <div class="field"><div class="field-label">Observações Adicionais</div><div class="box">${escapeHtml(registro.observacoesAdicionais || '-')}</div></div>
                </div>

                <div class="assinatura">
                    <div class="assinatura-box">
                        ${registro.assinaturaDigitalBase64
                            ? `<img src="${registro.assinaturaDigitalBase64}" class="assinatura-img" alt="Assinatura do Aluno">`
                            : '<div style="height:70px;"></div>'}
                        <div class="assinatura-linha">${registro.assinadoPorNome ? escapeHtml(registro.assinadoPorNome) : 'Assinatura do Aluno/Responsável'}</div>
                    </div>
                    <div class="assinatura-box">
                        <div style="height:70px;"></div>
                        <div class="assinatura-linha">Profissional Responsável</div>
                    </div>
                </div>

                <div class="footer">
                    Documento gerado em ${new Date().toLocaleString('pt-BR')} • Código: ${escapeHtml(registro.codigoProtocolo || '-')}
                </div>

                <script>
                    window.addEventListener('load', function() {
                        setTimeout(function() { window.print(); }, 400);
                    });
                <\/script>
            </body>
            </html>
        `;

        const win = window.open('', '_blank');
        if (!win) { showToast('⚠️ Bloqueador de pop-up ativo. Permita pop-ups para imprimir.', 'warning'); return; }
        win.document.write(html);
        win.document.close();
    }

    // ============================================
    // 📊 DASHBOARD
    // ============================================
    async function carregarDashboard() {
        try {
            // ⚠️ ROTA NOVA: GET /api/atendimento-protagonismo/dashboard
            const response = await fetch('/api/atendimento-protagonismo/dashboard', {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            if (!data.success) throw new Error(data.error || 'Erro ao carregar dashboard');

            const d = data.dashboard || {};

            document.getElementById('atendTotalHoje').textContent = d.totalHoje || 0;
            document.getElementById('atendTotalSemana').textContent = d.totalSemana || 0;
            document.getElementById('atendTotalMes').textContent = d.totalMes || 0;
            document.getElementById('atendTotalGeral').textContent = d.totalGeral || 0;

            renderizarChartCategoria(d.porCategoria || []);
            renderizarChartMes(d.porMes || []);
            renderizarChartTurma(d.porTurma || []);
            renderizarReincidentes(d.reincidentes || []);

        } catch (error) {
            console.error('[Atendimento] Erro no dashboard:', error);
            const ids = ['atendTotalHoje', 'atendTotalSemana', 'atendTotalMes', 'atendTotalGeral'];
            ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '-'; });
            const reinc = document.getElementById('atendAlunosReincidentes');
            if (reinc) {
                reinc.innerHTML = `<div class="alert alert-warning" style="font-size:13px;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Rota de dashboard não disponível no backend.</strong>
                    <p style="margin:6px 0 0;font-size:12px;">
                        Adicione <code>GET /api/atendimento-protagonismo/dashboard</code> no backend.
                    </p>
                </div>`;
            }
        }
    }

    function renderizarChartCategoria(dados) {
        const canvas = document.getElementById('atendChartCategoria');
        if (!canvas) return;
        if (state.charts.categoria) { try { state.charts.categoria.destroy(); } catch (e) {} }
        if (typeof Chart === 'undefined') return;

        const labels = dados.map(d => labelCategoria(d._id || d.categoria));
        const valores = dados.map(d => d.total || 0);

        if (labels.length === 0) {
            labels.push('Sem dados');
            valores.push(1);
        }

        state.charts.categoria = new Chart(canvas.getContext('2d'), {
            type: 'pie',
            data: {
                labels,
                datasets: [{
                    data: valores,
                    backgroundColor: ['#7e22ce', '#4c1d95', '#0284c7', '#10b981', '#f59e0b', '#ef4444']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } }
            }
        });
    }

    function renderizarChartMes(dados) {
        const canvas = document.getElementById('atendChartMes');
        if (!canvas) return;
        if (state.charts.mes) { try { state.charts.mes.destroy(); } catch (e) {} }
        if (typeof Chart === 'undefined') return;

        const labels = dados.map(d => formatarMesAno(d._id || d.mes));
        const valores = dados.map(d => d.total || 0);

        state.charts.mes = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Atendimentos',
                    data: valores,
                    backgroundColor: '#7e22ce',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });
    }

    function renderizarChartTurma(dados) {
        const canvas = document.getElementById('atendChartTurma');
        if (!canvas) return;
        if (state.charts.turma) { try { state.charts.turma.destroy(); } catch (e) {} }
        if (typeof Chart === 'undefined') return;

        const labels = dados.map(d => d._id || d.turma || 'Sem turma');
        const valores = dados.map(d => d.total || 0);

        state.charts.turma = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Atendimentos',
                    data: valores,
                    backgroundColor: '#0284c7',
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });
    }

    function renderizarReincidentes(dados) {
        const container = document.getElementById('atendAlunosReincidentes');
        if (!container) return;

        if (!dados || dados.length === 0) {
            container.innerHTML = `<div class="text-center text-muted py-3">
                <i class="fas fa-check-circle" style="font-size:28px;color:#10b981;margin-bottom:8px;display:block;"></i>
                <p class="mb-0">Nenhum aluno com 3+ atendimentos.</p>
            </div>`;
            return;
        }

        container.innerHTML = `<div class="list-group">` + dados.map(a => `
            <div class="list-group-item d-flex justify-content-between align-items-center" style="border-radius:10px;margin-bottom:6px;border:1px solid #e5e7eb;">
                <div>
                    <strong>${escapeHtml(a.alunoNome || a.nome || '-')}</strong>
                    <br><small class="text-muted">${escapeHtml(a.alunoTurma || a.turma || '')}</small>
                </div>
                <span class="badge" style="background:#ef4444;font-size:14px;padding:8px 12px;">${a.total || 0}</span>
            </div>
        `).join('') + `</div>`;
    }

    // ============================================
    // 📄 RELATÓRIO
    // ============================================
    async function gerarRelatorio() {
        const container = document.getElementById('atendResultadoRelatorio');
        if (!container) return;

        const filtros = {
            dataInicio: document.getElementById('atendRelDataInicio')?.value || '',
            dataFim: document.getElementById('atendRelDataFim')?.value || '',
            categoria: document.getElementById('atendRelCategoria')?.value || '',
            turma: document.getElementById('atendRelTurma')?.value || '',
            curso: document.getElementById('atendRelCurso')?.value || '',
            busca: document.getElementById('atendRelBusca')?.value || ''
        };

        container.innerHTML = `<div class="text-center py-5"><div style="width:40px;height:40px;border:4px solid #f3f3f3;border-top:4px solid #7e22ce;border-radius:50%;margin:0 auto 15px;animation:spinProt 1s linear infinite;"></div><p>Gerando relatório...</p></div>`;

        try {
            const params = new URLSearchParams();
            if (filtros.dataInicio) params.append('dataInicio', filtros.dataInicio);
            if (filtros.dataFim) params.append('dataFim', filtros.dataFim);
            if (filtros.categoria) params.append('categoria', filtros.categoria);
            if (filtros.turma) params.append('turma', filtros.turma);
            if (filtros.curso) params.append('curso', filtros.curso);
            if (filtros.busca) params.append('busca', filtros.busca);

            // ⚠️ ROTA NOVA: GET /api/atendimento-protagonismo/relatorio
            const response = await fetch(`/api/atendimento-protagonismo/relatorio?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (!data.success) throw new Error(data.error || 'Erro no relatório');

            state.relatorio.dados = data.registros || [];
            state.relatorio.exportavel = state.relatorio.dados.length > 0;

            renderizarResultadoRelatorio(state.relatorio.dados, filtros);

            const btnCSV = document.getElementById('atendBtnExportarCSV');
            const btnPDF = document.getElementById('atendBtnExportarPDF');
            if (btnCSV) btnCSV.disabled = !state.relatorio.exportavel;
            if (btnPDF) btnPDF.disabled = !state.relatorio.exportavel;

        } catch (error) {
            console.error('[Atendimento] Erro no relatório:', error);
            container.innerHTML = `<div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>Rota de relatório não disponível no backend.</strong>
                <p style="margin:6px 0 0;font-size:13px;">
                    Adicione <code>GET /api/atendimento-protagonismo/relatorio</code> no backend para habilitar esta funcionalidade.
                </p>
                <p style="margin:6px 0 0;font-size:12px;color:#6b7280;">Erro: ${escapeHtml(error.message)}</p>
            </div>`;
        }
    }

    function renderizarResultadoRelatorio(registros, filtros) {
        const container = document.getElementById('atendResultadoRelatorio');
        if (!container) return;

        if (registros.length === 0) {
            container.innerHTML = `<div class="text-center py-5" style="color:#9ca3af;">
                <i class="fas fa-inbox" style="font-size:48px;margin-bottom:15px;display:block;"></i>
                <h5>Nenhum atendimento encontrado</h5>
                <p>Ajuste os filtros e tente novamente.</p>
            </div>`;
            return;
        }

        // Resumo
        const totalPorCategoria = {};
        registros.forEach(r => {
            const cat = r.categoriaAtendimento || 'outros';
            totalPorCategoria[cat] = (totalPorCategoria[cat] || 0) + 1;
        });

        const totalPorTurma = {};
        registros.forEach(r => {
            const turma = r.alunoTurma || 'Sem turma';
            totalPorTurma[turma] = (totalPorTurma[turma] || 0) + 1;
        });

        container.innerHTML = `
            <div class="row g-3 mb-4">
                <div class="col-md-4">
                    <div class="metric-card" style="background:linear-gradient(135deg,#4c1d95,#7e22ce);color:white;">
                        <div class="metric-value" style="color:white;">${registros.length}</div>
                        <div class="metric-label" style="color:rgba(255,255,255,0.9);">Total de Registros</div>
                    </div>
                </div>
                <div class="col-md-8">
                    <div class="card h-100">
                        <div class="card-body">
                            <h6 class="mb-2"><i class="fas fa-chart-pie me-1"></i> Resumo por Categoria</h6>
                            <div class="d-flex flex-wrap gap-2">
                                ${Object.entries(totalPorCategoria).map(([cat, total]) => `
                                    <span class="badge" style="background:#7e22ce;padding:8px 14px;font-size:13px;">
                                        ${escapeHtml(labelCategoria(cat))}: ${total}
                                    </span>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-body">
                    <h6 class="mb-3"><i class="fas fa-list me-1"></i> Detalhamento (${registros.length})</h6>
                    <div class="table-responsive">
                        <table class="table table-sm table-hover align-middle">
                            <thead style="background:#f8fafc;">
                                <tr>
                                    <th>Código</th>
                                    <th>Data</th>
                                    <th>Aluno</th>
                                    <th>Turma</th>
                                    <th>Categoria</th>
                                    <th>Motivo</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${registros.map(r => `
                                    <tr>
                                        <td><code style="font-size:11px;">${escapeHtml(r.codigoProtocolo || '-')}</code></td>
                                        <td>${r.dataAtendimento ? new Date(r.dataAtendimento).toLocaleDateString('pt-BR') : '-'}</td>
                                        <td><strong>${escapeHtml(r.alunoNome || '-')}</strong></td>
                                        <td>${escapeHtml(r.alunoTurma || '-')}</td>
                                        <td><span class="badge" style="background:#7e22ce;font-size:11px;">${escapeHtml(labelCategoria(r.categoriaAtendimento))}</span></td>
                                        <td style="max-width:300px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(r.motivoPrincipal || '')}">${escapeHtml(r.motivoPrincipal || '-')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }

    function limparFiltrosRelatorio() {
        ['atendRelDataInicio', 'atendRelDataFim', 'atendRelBusca'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        ['atendRelCategoria', 'atendRelTurma', 'atendRelCurso'].forEach(id => {
            const el = document.getElementById(id); if (el) el.value = '';
        });
        state.relatorio.dados = null;
        state.relatorio.exportavel = false;
        const btnCSV = document.getElementById('atendBtnExportarCSV');
        const btnPDF = document.getElementById('atendBtnExportarPDF');
        if (btnCSV) btnCSV.disabled = true;
        if (btnPDF) btnPDF.disabled = true;
        const container = document.getElementById('atendResultadoRelatorio');
        if (container) {
            container.innerHTML = `<div class="text-center py-5" style="color:#9ca3af;">
                <i class="fas fa-chart-line fa-3x mb-3"></i>
                <p class="text-muted">Selecione os filtros e clique em Buscar</p>
            </div>`;
        }
    }

    function exportarCSVRelatorio() {
        if (!state.relatorio.dados || state.relatorio.dados.length === 0) {
            showToast('⚠️ Gere o relatório antes de exportar', 'warning');
            return;
        }

        const headers = ['Código', 'Data', 'Aluno', 'Matrícula', 'Turma', 'Curso', 'Categoria', 'Motivo', 'Encaminhamento', 'Observações', 'Assinatura', 'Registrado em'];
        const rows = state.relatorio.dados.map(r => [
            r.codigoProtocolo || '',
            r.dataAtendimento ? new Date(r.dataAtendimento).toLocaleDateString('pt-BR') : '',
            r.alunoNome || '',
            r.alunoMatricula || '',
            r.alunoTurma || '',
            r.alunoCurso || '',
            labelCategoria(r.categoriaAtendimento),
            (r.motivoPrincipal || '').replace(/\n/g, ' '),
            (r.encaminhamentoRealizado || '').replace(/\n/g, ' '),
            (r.observacoesAdicionais || '').replace(/\n/g, ' '),
            r.assinaturaDigitalBase64 ? 'Sim' : 'Não',
            r.criadoEm ? new Date(r.criadoEm).toLocaleString('pt-BR') : ''
        ]);

        const csv = [headers, ...rows].map(row =>
            row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')
        ).join('\r\n');

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `atendimentos_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('✅ CSV exportado!', 'success');
    }

    function exportarPDFRelatorio() {
        if (!state.relatorio.dados || state.relatorio.dados.length === 0) {
            showToast('⚠️ Gere o relatório antes de exportar', 'warning');
            return;
        }

        const registros = state.relatorio.dados;
        const totalPorCategoria = {};
        registros.forEach(r => {
            const cat = r.categoriaAtendimento || 'outros';
            totalPorCategoria[cat] = (totalPorCategoria[cat] || 0) + 1;
        });

        const html = `
            <!DOCTYPE html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <title>Relatório de Atendimentos</title>
                <style>
                    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0; padding: 30px; }
                    .header { border-bottom: 3px solid #4c1d95; padding-bottom: 16px; margin-bottom: 22px; }
                    .header h1 { margin: 0; font-size: 22px; color: #4c1d95; }
                    .header p { margin: 4px 0 0; font-size: 12px; color: #64748b; }
                    .resumo { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
                    .resumo-item { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 14px; font-size: 13px; }
                    .resumo-item strong { color: #4c1d95; }
                    table { width: 100%; border-collapse: collapse; font-size: 11px; }
                    th { background: #4c1d95; color: white; padding: 8px 6px; text-align: left; }
                    td { padding: 6px; border-bottom: 1px solid #e5e7eb; }
                    tr:nth-child(even) { background: #f8fafc; }
                    .footer { margin-top: 30px; padding-top: 14px; border-top: 1px dashed #cbd5e1; font-size: 10px; color: #94a3b8; text-align: center; }
                    @media print { body { padding: 15px; } .no-print { display: none; } }
                    .no-print { text-align: center; margin-bottom: 20px; }
                    .no-print button { background: #4c1d95; color: white; border: none; padding: 10px 22px; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 14px; margin: 0 6px; }
                    .no-print button.secondary { background: #e5e7eb; color: #374151; }
                </style>
            </head>
            <body>
                <div class="no-print">
                    <button onclick="window.print()">🖨️ Imprimir</button>
                    <button class="secondary" onclick="window.close()">Fechar</button>
                </div>
                <div class="header">
                    <h1>Relatório de Atendimentos — Protagonismo</h1>
                    <p>Gerado em ${new Date().toLocaleString('pt-BR')} • ${registros.length} registro(s)</p>
                </div>
                <div class="resumo">
                    ${Object.entries(totalPorCategoria).map(([cat, total]) =>
                        `<div class="resumo-item"><strong>${escapeHtml(labelCategoria(cat))}:</strong> ${total}</div>`
                    ).join('')}
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>Código</th>
                            <th>Data</th>
                            <th>Aluno</th>
                            <th>Turma</th>
                            <th>Categoria</th>
                            <th>Motivo</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${registros.map(r => `
                            <tr>
                                <td>${escapeHtml(r.codigoProtocolo || '-')}</td>
                                <td>${r.dataAtendimento ? new Date(r.dataAtendimento).toLocaleDateString('pt-BR') : '-'}</td>
                                <td>${escapeHtml(r.alunoNome || '-')}</td>
                                <td>${escapeHtml(r.alunoTurma || '-')}</td>
                                <td>${escapeHtml(labelCategoria(r.categoriaAtendimento))}</td>
                                <td>${escapeHtml((r.motivoPrincipal || '-').substring(0, 80))}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div class="footer">
                    Relatório gerado automaticamente pelo sistema EducaPleno
                </div>
                <script>
                    window.addEventListener('load', function() {
                        setTimeout(function() { window.print(); }, 400);
                    });
                <\/script>
            </body>
            </html>
        `;

        const win = window.open('', '_blank');
        if (!win) { showToast('⚠️ Bloqueador de pop-up ativo.', 'warning'); return; }
        win.document.write(html);
        win.document.close();
    }

    // ============================================
    // 📌 FILTROS E RECARREGAR
    // ============================================
    function limparFiltros() {
        const m = document.getElementById('atendFiltroMes');
        const b = document.getElementById('atendFiltroBusca');
        if (m) m.value = '';
        if (b) b.value = '';
        carregarLista(1);
    }

    function recarregar() {
        const content = document.getElementById('content');
        if (content) {
            document.querySelectorAll('#content .tab-pane').forEach(p => { p.style.display = ''; });
            content.innerHTML = '';
        }
        init();
    }

    // ============================================
    // 📦 EXPORTAR API GLOBAL
    // ============================================
    const API = {
        init,
        recarregar,
        selecionarAluno,
        limparAluno,
        onTipoChange,
        registrarAtendimento,
        resetarFormulario,
        carregarLista,
        limparFiltros,
        toggleAssinatura,
        limparCanvasInline,
        salvarAssinaturaInline,
        refazerAssinatura,
        fecharModalQRCode,
        cancelarSessaoAssinatura,
        mostrarCanvasAssinaturaInline,
        voltarParaQRCode,
        copiarLinkAssinatura,
        verificarAtendimento,
        editarAtendimento,
        excluirAtendimento,
        imprimirAtendimento,
        cancelarEdicao,
        fecharModalDetalhes,
        // Dashboard e Relatório
        carregarDashboard,
        gerarRelatorio,
        limparFiltrosRelatorio,
        exportarCSVRelatorio,
        exportarPDFRelatorio
    };

    window.AtendimentoProtagonismoModule = API;
    return API;
})();