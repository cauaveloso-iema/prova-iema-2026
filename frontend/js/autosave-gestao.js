// ============================================
// GESTÃO GERAL — AUTO-SAVE (RASCUNHO)
// Inclui: salvamento de todos os campos, restauração do aluno no Atendimento,
//         persistência de assinaturas em TODOS os módulos,
//         acesso seguro a window.atendimentoState,
//         captura mesmo com form oculto, restauração por id global.
// ============================================

(function() {
    'use strict';

    const CHAVE_RASCUNHO = 'gestao_geral_rascunhos_v3';
    const INTERVALO_AUTOSAVE = 2000;
    const VALIDADE_RASCUNHO_MS = 48 * 60 * 60 * 1000;

    const ABAS = {
        'tab-atrasos': 'atraso',
        'tab-autorizacao': 'autorizacao',
        'tab-justificativa': 'justificativa',
        'tab-segunda-chamada': 'segundaChamada',
        'tab-uniforme': 'uniforme',
        'tab-atendimentos': 'atendimento'
    };

    const LABELS = {
        atraso: 'Atrasos',
        autorizacao: 'Autorização',
        justificativa: 'Justificativa de Faltas',
        segundaChamada: '2ª Chamada',
        uniforme: 'Uniforme',
        atendimento: 'Atendimentos'
    };

    const FORM_SELETOR = {
        atraso: '#formRegistro',
        autorizacao: '#formAutorizacao',
        justificativa: '#formJustificativa',
        segundaChamada: '#formSegundaChamada',
        uniforme: '#formUniforme',
        atendimento: '#formAtendimento'
    };

    const ALUNO_INFO_SELETOR = {
        atraso: '#alunoInfo',
        autorizacao: '#alunoInfoAutorizacao',
        justificativa: '#alunoInfoJustificativa',
        segundaChamada: '#alunoInfoSegundaChamada',
        uniforme: '#alunoInfoUniforme',
        atendimento: '#atendimentoAlunoInfo'
    };

    const FUNCAO_SELECIONAR = {
        atraso: 'selecionarMotivo',
        autorizacao: 'selecionarMotivoAutorizacao',
        justificativa: 'selecionarMotivoJustificativa',
        segundaChamada: 'selecionarMotivoSegundaChamada',
        uniforme: 'selecionarMotivoUniforme',
        atendimento: 'selecionarProvidenciaAtendimento'
    };

    const FUNCOES_EXTRAS = {
        segundaChamada: {
            tipoProva: 'selecionarTipoProvaPerdida',
            periodo: 'selecionarPeriodoProva'
        }
    };

    // 🆕 Mapa: módulo → sufixo dos IDs dos blocos de assinatura e dos checkboxes
    const MAPA_ASSINATURA_IDS = {
        atraso: {
            checkResp: 'atrasoNecessitaAssinatura',
            blocoResp: 'atrasoBlocoAssinaturaInfo',
            checkAluno: 'atrasoNecessitaAssinaturaAluno',
            blocoAluno: 'atrasoBlocoAssinaturaAlunoInfo'
        },
        autorizacao: {
            checkResp: 'autorizacaoNecessitaAssinatura',
            blocoResp: 'autorizacaoBlocoAssinaturaInfo',
            checkAluno: 'autorizacaoNecessitaAssinaturaAluno',
            blocoAluno: 'autorizacaoBlocoAssinaturaAlunoInfo'
        },
        justificativa: {
            checkResp: 'justificativaNecessitaAssinatura',
            blocoResp: 'justificativaBlocoAssinaturaInfo',
            checkAluno: 'justificativaNecessitaAssinaturaAluno',
            blocoAluno: 'justificativaBlocoAssinaturaAlunoInfo'
        },
        segundaChamada: {
            checkResp: 'segundaChamadaNecessitaAssinatura',
            blocoResp: 'segundaChamadaBlocoAssinaturaInfo',
            checkAluno: 'segundaChamadaNecessitaAssinaturaAluno',
            blocoAluno: 'segundaChamadaBlocoAssinaturaAlunoInfo'
        },
        uniforme: {
            checkResp: 'uniformeNecessitaAssinatura',
            blocoResp: 'uniformeBlocoAssinaturaInfo',
            checkAluno: 'uniformeNecessitaAssinaturaAluno',
            blocoAluno: 'uniformeBlocoAssinaturaAlunoInfo'
        },
        atendimento: {
            checkResp: 'atendimentoNecessitaAssinatura',
            blocoResp: 'atendimentoBlocoAssinaturaInfo',
            checkAluno: 'atendimentoNecessitaAssinaturaAluno',
            blocoAluno: 'atendimentoBlocoAssinaturaAlunoInfo'
        }
    };

    const CLASSES_SELECIONADO = [
        'selected', 'selecionado', 'is-selected', 'is-active',
        'checked', 'escolhido', 'btn-selected'
    ];

    const ATRIBUTOS_TIPO = [
        'data-tipo', 'data-prova', 'data-periodo', 'data-opcao',
        'data-motivo', 'data-justificativa', 'data-valor', 'data-value',
        'data-id', 'data-key', 'data-card', 'data-providencia'
    ];

    const PLACEHOLDERS_INVALIDOS = ['não informada', 'nao informada', '-', '', 'n/a', 'null', 'undefined'];

    let __interval = null;
    let __sujo = false;
    let __inicializado = false;
    let __restaurando = false;

    // ═══════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════
    function obterRascunhos() {
        try {
            const raw = localStorage.getItem(CHAVE_RASCUNHO);
            return raw ? JSON.parse(raw) : {};
        } catch (e) { return {}; }
    }

    function gravarRascunhos(r) {
        try { localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(r)); }
        catch (e) { console.warn('[AutoSave] Erro ao gravar:', e); }
    }

    function getAbaAtiva() {
        const tab = document.querySelector('.nav-link.active[data-bs-toggle="tab"]');
        const target = tab?.getAttribute('data-bs-target') || '';
        return target.replace('#', '');
    }

    function getModuloAtual() {
        return ABAS[getAbaAtiva()] || null;
    }

    function formatarDataHora(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        return d.toLocaleDateString('pt-BR') + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    function isSelecionado(el) {
        if (!el || !el.classList) return false;
        if (el.getAttribute('aria-pressed') === 'true') return true;
        if (el.getAttribute('aria-checked') === 'true') return true;
        return CLASSES_SELECIONADO.some(c => el.classList.contains(c));
    }

    function getTipoDoCard(el) {
        for (const attr of ATRIBUTOS_TIPO) {
            const v = el.getAttribute(attr);
            if (v) return { attr, valor: v };
        }
        if (el.id) return { attr: 'id', valor: el.id };
        const txt = (el.textContent || '').trim().slice(0, 60);
        if (txt) return { attr: 'texto', valor: txt };
        return null;
    }

    function isPlaceholderInvalido(valor) {
        if (!valor) return true;
        const v = String(valor).trim().toLowerCase();
        return PLACEHOLDERS_INVALIDOS.includes(v);
    }

    function getAtendimentoState() {
        return (typeof window.atendimentoState === 'object' && window.atendimentoState) ? window.atendimentoState : null;
    }

    function capturarSelecionaveis(container) {
        const selecionados = [];
        const vistos = new Set();

        const candidatos = container.querySelectorAll(
            CLASSES_SELECIONADO.map(c => '.' + c).join(',') +
            ', [aria-pressed="true"], [aria-checked="true"]'
        );

        candidatos.forEach(el => {
            if (el.closest('.nav-tabs, .nav-link, .navbar, .pagination')) return;
            if (el.matches('form')) return;
            if (!el.closest('button, [role="button"], .card, .opcao, .tipo-card, .providencia-card, li, label, .motivo, .justificativa-item')) return;

            const tipo = getTipoDoCard(el);
            if (!tipo) return;
            const key = tipo.attr + ':' + tipo.valor;
            if (vistos.has(key)) return;
            vistos.add(key);
            selecionados.push(tipo);
        });

        return selecionados;
    }

    // ═══════════════════════════════════════════════════════════
    // 🆕 CAPTURA DE ASSINATURA PARA QUALQUER MÓDULO
    // ═══════════════════════════════════════════════════════════
    function capturarAssinaturasModulo(modulo, extra) {
        // 1. Tenta nas estruturas globais conhecidas
        const fontes = [];

        if (typeof window.estadoSessaoAssinatura !== 'undefined' && window.estadoSessaoAssinatura[modulo]) {
            fontes.push(window.estadoSessaoAssinatura[modulo]);
        }
        if (typeof window.estadoSessaoAssinaturaAluno !== 'undefined' && window.estadoSessaoAssinaturaAluno[modulo]) {
            fontes.push(window.estadoSessaoAssinaturaAluno[modulo]);
        }
        if (typeof window.estados !== 'undefined' && window.estados[modulo]) {
            const e = window.estados[modulo];
            if (e.sessaoAssinatura) fontes.push(e.sessaoAssinatura);
            if (e.sessaoAssinaturaResponsavel) fontes.push(e.sessaoAssinaturaResponsavel);
            if (e.sessaoAssinaturaAluno) fontes.push(e.sessaoAssinaturaAluno);
        }
        if (typeof window.sessoesAssinatura !== 'undefined' && window.sessoesAssinatura[modulo]) {
            const s = window.sessoesAssinatura[modulo];
            if (s.responsavel) fontes.push(s.responsavel);
            if (s.aluno) fontes.push(s.aluno);
        }
        if (modulo === 'atendimento') {
            const st = getAtendimentoState();
            if (st?.sessaoAssinaturaResponsavel) fontes.push(st.sessaoAssinaturaResponsavel);
            if (st?.sessaoAssinaturaAluno) fontes.push(st.sessaoAssinaturaAluno);
        }

        // 2. Percorre fontes e classifica por tipo (responsável vs aluno)
        fontes.forEach(f => {
            if (!f) return;
            const temDados = f.sessaoId || f.assinaturaCapturada || f.qrCodeDataUrl;
            if (!temDados) return;

            const ehAluno = f.tipoAssinante === 'aluno' ||
                            f.tipo === 'aluno' ||
                            f.assinanteTipo === 'aluno' ||
                            (f.assinanteNome && /aluno/i.test(f.assinanteNome));

            const alvo = ehAluno ? 'assinaturaAluno' : 'assinaturaResponsavel';
            if (!extra[alvo]) {
                extra[alvo] = {
                    sessaoId: f.sessaoId || null,
                    assinaturaCapturada: f.assinaturaCapturada || null,
                    qrCodeDataUrl: f.qrCodeDataUrl || null,
                    assinadaPorNome: f.assinadaPorNome || null,
                    assinadaEm: f.assinadaEm || null
                };
            }
        });

        // 3. Fallback: procura imagens de assinatura já renderizadas no DOM
        if (!extra.assinaturaResponsavel) {
            const blocoResp = document.getElementById(MAPA_ASSINATURA_IDS[modulo]?.blocoResp);
            if (blocoResp) {
                const img = blocoResp.querySelector('img');
                if (img && img.src && img.src.startsWith('data:image')) {
                    extra.assinaturaResponsavel = {
                        sessaoId: null,
                        assinaturaCapturada: img.src,
                        qrCodeDataUrl: null,
                        assinadaPorNome: null,
                        assinadaEm: null
                    };
                }
            }
        }
        if (!extra.assinaturaAluno) {
            const blocoAluno = document.getElementById(MAPA_ASSINATURA_IDS[modulo]?.blocoAluno);
            if (blocoAluno) {
                const img = blocoAluno.querySelector('img');
                if (img && img.src && img.src.startsWith('data:image')) {
                    extra.assinaturaAluno = {
                        sessaoId: null,
                        assinaturaCapturada: img.src,
                        qrCodeDataUrl: null,
                        assinadaPorNome: null,
                        assinadaEm: null
                    };
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // CAPTURA DE ESTADO EM MEMÓRIA
    // ═══════════════════════════════════════════════════════════
    function capturarEstadoExtra(modulo) {
        const extra = {};
        try {
            // Estado geral do módulo (window.estados)
            if (typeof window.estados !== 'undefined' && window.estados[modulo]) {
                const e = window.estados[modulo];
                if (e.motivoSelecionado !== undefined) extra.motivoSelecionado = e.motivoSelecionado;
                if (Array.isArray(e.motivosSelecionados)) extra.motivosSelecionados = [...e.motivosSelecionados];
                if (e.tipoProvaPerdida !== undefined) extra.tipoProvaPerdida = e.tipoProvaPerdida;
                if (e.periodoProva !== undefined) extra.periodoProva = e.periodoProva;
                if (Array.isArray(e.providenciasSelecionadas)) extra.providenciasSelecionadas = [...e.providenciasSelecionadas];
                if (e.providenciaSelecionada !== undefined) extra.providenciaSelecionada = e.providenciaSelecionada;
            }

            if (modulo === 'atraso') {
                if (typeof window.__motivosSelecionados !== 'undefined' && Array.isArray(window.__motivosSelecionados)) {
                    extra.motivosSelecionados = [...window.__motivosSelecionados];
                }
                if (typeof window.motivoSelecionado !== 'undefined') {
                    extra.motivoSelecionado = window.motivoSelecionado;
                }
            }

            // 🆕 Captura assinaturas para QUALQUER módulo
            capturarAssinaturasModulo(modulo, extra);

            // Estado específico do atendimento
            if (modulo === 'atendimento') {
                const st = getAtendimentoState();
                if (st) {
                    if (Array.isArray(st.motivosSelecionados) && st.motivosSelecionados.length) {
                        extra.motivosSelecionados = [...st.motivosSelecionados];
                    }
                    if (Array.isArray(st.providenciasSelecionadas) && st.providenciasSelecionadas.length) {
                        extra.providenciasSelecionadas = [...st.providenciasSelecionadas];
                    }
                    if (st.tipoAtendimento) extra.tipoAtendimento = st.tipoAtendimento;
                    if (st.alunoAtual) {
                        extra.alunoAtual = {
                            id: st.alunoAtual.id,
                            nome: st.alunoAtual.nome,
                            matricula: st.alunoAtual.matricula,
                            turma: st.alunoAtual.turma,
                            curso: st.alunoAtual.curso,
                            fotoPerfil: st.alunoAtual.fotoPerfil
                        };
                    }
                }
            }
        } catch (e) {
            console.warn('[AutoSave] Erro capturando estadoExtra:', e);
        }
        return extra;
    }

    // ═══════════════════════════════════════════════════════════
    // CAPTURAR
    // ═══════════════════════════════════════════════════════════
    function capturarModulo(modulo) {
        try {
            const formEl = document.querySelector(FORM_SELETOR[modulo]);
            if (!formEl) return null;

            const alunoInfoEl = document.querySelector(ALUNO_INFO_SELETOR[modulo]);
            const alunoVisivel = alunoInfoEl && alunoInfoEl.style.display !== 'none';

            const formVisivel = formEl.offsetParent !== null && formEl.style.display !== 'none';
            const deveCapturar = formVisivel || alunoVisivel;

            if (!deveCapturar) return null;

            const campos = {};
            let temValor = false;

            const abaAtiva = getAbaAtiva();
            const abaPane = abaAtiva ? document.getElementById(abaAtiva) : null;
            const containersCampos = [formEl];
            if (abaPane && abaPane !== formEl && !abaPane.contains(formEl)) {
                containersCampos.push(abaPane);
            }

            const idsVistos = new Set();
            containersCampos.forEach(cont => {
                cont.querySelectorAll('input, select, textarea').forEach(el => {
                    if (!el.id || idsVistos.has(el.id)) return;
                    if (el.type === 'file' || el.type === 'submit' || el.type === 'button') return;
                    if (el.id.startsWith('filtro') || el.id.startsWith('busca')) return;

                    idsVistos.add(el.id);

                    if (el.type === 'checkbox') {
                        campos[el.id] = { tipo: 'checkbox', valor: el.checked };
                        if (el.checked) temValor = true;
                    } else if (el.type === 'radio') {
                        if (el.checked) {
                            campos[el.name || el.id] = { tipo: 'radio', valor: el.value, id: el.id };
                            temValor = true;
                        }
                    } else if (el.tagName === 'SELECT' && el.multiple) {
                        const vals = Array.from(el.selectedOptions).map(o => o.value);
                        if (vals.length) {
                            campos[el.id] = { tipo: 'multiselect', valor: vals };
                            temValor = true;
                        }
                    } else if (el.type === 'hidden') {
                        if (el.value) { campos[el.id] = { tipo: 'valor', valor: el.value }; temValor = true; }
                    } else {
                        if (el.value && el.value.trim()) {
                            campos[el.id] = { tipo: 'valor', valor: el.value };
                            temValor = true;
                        }
                    }
                });
            });

            const containers = [formEl];
            if (abaPane && abaPane !== formEl) containers.push(abaPane);

            const cardsSelecionados = [];
            const vistos = new Set();

            containers.forEach(cont => {
                cont.querySelectorAll('.tipo-card, .providencia-card').forEach(c => {
                    if (!isSelecionado(c)) return;
                    const t = getTipoDoCard(c);
                    if (!t) return;
                    const key = t.attr + ':' + t.valor;
                    if (vistos.has(key)) return;
                    vistos.add(key);
                    cardsSelecionados.push(t);
                    temValor = true;
                });

                capturarSelecionaveis(cont).forEach(t => {
                    const key = t.attr + ':' + t.valor;
                    if (vistos.has(key)) return;
                    vistos.add(key);
                    cardsSelecionados.push(t);
                    temValor = true;
                });
            });

            if (abaPane) {
                const radiosFora = abaPane.querySelectorAll('input[type="radio"]:checked');
                radiosFora.forEach(el => {
                    if (formEl.contains(el)) return;
                    if (!el.name) return;
                    if (campos[el.name]) return;
                    campos[el.name] = { tipo: 'radio', valor: el.value, id: el.id };
                    temValor = true;
                });
            }

            const estadoExtra = capturarEstadoExtra(modulo);
            if (estadoExtra && Object.keys(estadoExtra).length > 0) temValor = true;

            // ── Captura do Aluno ──
            let alunoSalvo = null;
            if (alunoVisivel) {
                const mapa = {
                    atraso:        { nome: 'alunoNome',        mat: 'alunoMatricula',        turma: 'alunoTurma',        curso: 'alunoCurso',        foto: 'alunoFoto' },
                    autorizacao:   { nome: 'alunoNomeAutorizacao',   mat: 'alunoMatriculaAutorizacao',   turma: 'alunoTurmaAutorizacao',   curso: 'alunoCursoAutorizacao',   foto: 'alunoFotoAutorizacao' },
                    justificativa: { nome: 'alunoNomeJustificativa', mat: 'alunoMatriculaJustificativa', turma: 'alunoTurmaJustificativa', curso: 'alunoCursoJustificativa', foto: 'alunoFotoJustificativa' },
                    segundaChamada:{ nome: 'alunoNomeSegundaChamada',mat: 'alunoMatriculaSegundaChamada',turma:'alunoTurmaSegundaChamada', curso:'alunoCursoSegundaChamada', foto:'alunoFotoSegundaChamada' },
                    uniforme:      { nome: 'alunoNomeUniforme',      mat: 'alunoMatriculaUniforme',      turma: 'alunoTurmaUniforme',      curso: 'alunoCursoUniforme',      foto: 'alunoFotoUniforme' },
                    atendimento:   { nome: 'atendimentoAlunoNome',   mat: 'atendimentoAlunoMatricula',   turma: 'atendimentoAlunoTurma',   curso: 'atendimentoAlunoCurso',   foto: 'atendimentoAlunoFoto' }
                };
                const ids = mapa[modulo];
                if (ids) {
                    const nome = document.getElementById(ids.nome)?.textContent?.trim();
                    const matricula = document.getElementById(ids.mat)?.textContent?.trim();

                    let matriculaReal = matricula;
                    if (isPlaceholderInvalido(matriculaReal)) {
                        const alunoEl = document.getElementById(ids.nome);
                        if (alunoEl) {
                            matriculaReal = alunoEl.getAttribute('data-matricula') ||
                                           alunoEl.dataset.matricula ||
                                           alunoEl.closest('[data-matricula]')?.getAttribute('data-matricula');
                        }
                        if (isPlaceholderInvalido(matriculaReal) && window.alunoAtendimento?.matricula) {
                            matriculaReal = window.alunoAtendimento.matricula;
                        }
                        const st = getAtendimentoState();
                        if (isPlaceholderInvalido(matriculaReal) && st?.alunoAtual?.matricula) {
                            matriculaReal = st.alunoAtual.matricula;
                        }
                    }

                    let idAluno = null;
                    if (modulo === 'atendimento') {
                        const st = getAtendimentoState();
                        if (st?.alunoAtual?.id) idAluno = st.alunoAtual.id;
                    }

                    if (nome && !isPlaceholderInvalido(nome)) {
                        alunoSalvo = {
                            id: idAluno,
                            nome: nome,
                            matricula: !isPlaceholderInvalido(matriculaReal) ? matriculaReal : null,
                            turma: document.getElementById(ids.turma)?.textContent?.trim(),
                            curso: document.getElementById(ids.curso)?.textContent?.trim(),
                            foto: document.getElementById(ids.foto)?.src,
                            htmlCompleto: alunoInfoEl.innerHTML
                        };
                    }
                }
            }

            if (!temValor && !alunoSalvo) return null;

            return {
                modulo,
                abaAlvo: Object.keys(ABAS).find(k => ABAS[k] === modulo) || '',
                aluno: alunoSalvo,
                campos,
                cardsSelecionados,
                estadoExtra,
                timestamp: Date.now()
            };
        } catch (e) {
            console.warn(`[AutoSave] Erro capturando ${modulo}:`, e);
            return null;
        }
    }

    function salvarTudo() {
        try {
            const rascunhos = obterRascunhos();
            let temAlgo = false;

            Object.values(ABAS).forEach(mod => {
                try {
                    const r = capturarModulo(mod);
                    if (r) { rascunhos[mod] = r; temAlgo = true; }
                    else delete rascunhos[mod];
                } catch (e) {
                    console.warn(`[AutoSave] Erro capturando ${mod}:`, e);
                }
            });

            gravarRascunhos(rascunhos);
            __sujo = false;

            if (temAlgo) {
                mostrarSelo();
                console.log('💾 [AutoSave] Salvo:', Object.keys(rascunhos));
            }
        } catch (e) {
            console.error('[AutoSave] Erro em salvarTudo:', e);
        }
    }

    function limparModulo(modulo) {
        const r = obterRascunhos();
        if (r[modulo]) {
            delete r[modulo];
            gravarRascunhos(r);
            console.log(`🧹 [AutoSave] Rascunho de ${modulo} removido`);
            atualizarBanner();
        }
    }

    function limparExpirados() {
        const r = obterRascunhos();
        let mudou = false;
        const agora = Date.now();
        Object.keys(r).forEach(mod => {
            if (!r[mod]?.timestamp || (agora - r[mod].timestamp) > VALIDADE_RASCUNHO_MS) {
                delete r[mod]; mudou = true;
            }
        });
        if (mudou) gravarRascunhos(r);
    }

    // ═══════════════════════════════════════════════════════════
    // SELO E BANNER
    // ═══════════════════════════════════════════════════════════
    function mostrarSelo() {
        let el = document.getElementById('autosaveSelo');
        if (!el) {
            el = document.createElement('div');
            el.id = 'autosaveSelo';
            el.style.cssText = `position:fixed;bottom:20px;right:20px;background:#10b981;color:#fff;
                padding:8px 14px;border-radius:10px;font-size:13px;font-weight:600;
                box-shadow:0 6px 16px rgba(0,0,0,.2);z-index:99999;opacity:0;
                transition:opacity .3s;pointer-events:none;display:flex;align-items:center;gap:6px;`;
            el.innerHTML = '<i class="fas fa-check-circle"></i> Rascunho salvo';
            document.body.appendChild(el);
        }
        el.style.opacity = '1';
        clearTimeout(el._t);
        el._t = setTimeout(() => { el.style.opacity = '0'; }, 1600);
    }

    function criarBanner() {
        if (document.getElementById('autosaveBanner')) return document.getElementById('autosaveBanner');
        const b = document.createElement('div');
        b.id = 'autosaveBanner';
        b.style.cssText = `
            position:fixed; top:0; left:0; right:0;
            background:linear-gradient(135deg,#1e3c72 0%,#2a5298 100%);
            color:#fff; padding:12px 20px; box-shadow:0 4px 12px rgba(0,0,0,.25);
            z-index:99998; display:none; align-items:center; justify-content:space-between;
            gap:16px; font-size:14px; transform:translateY(-100%);
            transition:transform .3s ease;
        `;
        b.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
                <i class="fas fa-clipboard-list" style="font-size:20px;flex-shrink:0;"></i>
                <div style="min-width:0;">
                    <div style="font-weight:700;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" id="autosaveBannerTitulo"></div>
                    <div style="font-size:12px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" id="autosaveBannerDetalhe"></div>
                </div>
            </div>
            <div style="display:flex;gap:8px;flex-shrink:0;">
                <button id="autosaveBtnRestaurar" style="background:#10b981;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;">
                    <i class="fas fa-undo"></i> Restaurar
                </button>
                <button id="autosaveBtnDescartar" style="background:rgba(255,255,255,.15);color:#fff;border:1px solid rgba(255,255,255,.3);padding:8px 16px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;">
                    <i class="fas fa-trash"></i> Descartar
                </button>
                <button id="autosaveBtnFechar" style="background:transparent;color:#fff;border:none;padding:8px;cursor:pointer;font-size:16px;opacity:.7;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        document.body.appendChild(b);

        document.getElementById('autosaveBtnRestaurar').addEventListener('click', () => {
            const mod = b.dataset.modulo;
            if (mod) restaurarModulo(mod).then(ok => {
                if (ok) { esconderBanner(); notificar('✅ Rascunho restaurado!'); }
                else notificar('❌ Não foi possível restaurar', 'error');
            });
        });
        document.getElementById('autosaveBtnDescartar').addEventListener('click', () => {
            const mod = b.dataset.modulo;
            if (mod) { limparModulo(mod); notificar('Rascunho descartado'); }
            esconderBanner();
        });
        document.getElementById('autosaveBtnFechar').addEventListener('click', esconderBanner);

        return b;
    }

    function mostrarBanner(modulo, rascunho) {
        const b = criarBanner();
        b.dataset.modulo = modulo;
        const alunoNome = rascunho.aluno?.nome || '(aluno não selecionado)';
        document.getElementById('autosaveBannerTitulo').textContent =
            `📋 Rascunho salvo em "${LABELS[modulo]}" — não enviado`;
        document.getElementById('autosaveBannerDetalhe').textContent =
            `Aluno: ${alunoNome} • ${formatarDataHora(rascunho.timestamp)}`;
        b.style.display = 'flex';
        requestAnimationFrame(() => {
            b.style.transform = 'translateY(0)';
            document.body.style.paddingTop = b.offsetHeight + 'px';
        });
    }

    function esconderBanner() {
        const b = document.getElementById('autosaveBanner');
        if (!b) return;
        b.style.transform = 'translateY(-100%)';
        document.body.style.paddingTop = '0';
        setTimeout(() => { b.style.display = 'none'; b.dataset.modulo = ''; }, 300);
    }

    function atualizarBanner() {
        const r = obterRascunhos();
        const mods = Object.keys(r).filter(m => r[m]);
        if (mods.length === 0) { esconderBanner(); return; }
        const modAtivo = getModuloAtual();
        const mod = (modAtivo && r[modAtivo]) ? modAtivo : mods[0];
        mostrarBanner(mod, r[mod]);
    }

    // ═══════════════════════════════════════════════════════════
    // 🆕 RESTAURAR ASSINATURA PARA QUALQUER MÓDULO
    // ═══════════════════════════════════════════════════════════
    function restaurarAssinaturasModulo(modulo, extra) {
        const mapa = MAPA_ASSINATURA_IDS[modulo];
        if (!mapa) return;

        const stResp = extra.assinaturaResponsavel;
        const stAluno = extra.assinaturaAluno;

        // ── Responsável ──
        if (stResp) {
            // Atualiza estrutura global estadoSessaoAssinatura[modulo]
            if (typeof window.estadoSessaoAssinatura === 'undefined') window.estadoSessaoAssinatura = {};
            if (!window.estadoSessaoAssinatura[modulo]) {
                window.estadoSessaoAssinatura[modulo] = { sessaoId: null, assinaturaCapturada: null, qrCodeDataUrl: null };
            }
            Object.assign(window.estadoSessaoAssinatura[modulo], stResp);

            // Atualiza atendimentoState se for o caso
            if (modulo === 'atendimento') {
                const st = getAtendimentoState();
                if (st) Object.assign(st.sessaoAssinaturaResponsavel, stResp);
            }

            // Marca o checkbox
            const check = document.getElementById(mapa.checkResp);
            if (check) check.checked = true;

            // Reconstrói o bloco visual
            const bloco = document.getElementById(mapa.blocoResp);
            if (bloco) {
                bloco.style.display = 'block';
                if (stResp.assinaturaCapturada) {
                    bloco.innerHTML = `
                        <div style="margin-top:10px;background:#f0fdf4;border:2px solid #10b981;border-radius:12px;padding:14px;">
                            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                                <i class="fas fa-check-circle" style="color:#10b981;font-size:22px;"></i>
                                <div style="flex:1;">
                                    <strong style="color:#065f46;">✓ Assinatura do responsável capturada!</strong>
                                    <p style="margin:3px 0 0;font-size:12px;color:#047857;">
                                        ${stResp.assinadaPorNome ? stResp.assinadaPorNome + ' • ' : ''}
                                        ${stResp.assinadaEm ? new Date(stResp.assinadaEm).toLocaleString('pt-BR') : ''}
                                    </p>
                                </div>
                            </div>
                            <div style="background:white;border-radius:8px;padding:8px;text-align:center;">
                                <img src="${stResp.assinaturaCapturada}" style="max-width:100%;max-height:100px;" alt="Assinatura do responsável">
                            </div>
                        </div>`;
                } else {
                    bloco.innerHTML = `
                        <div class="alert alert-warning" style="font-size:13px;border-radius:10px;border-left:4px solid #f59e0b;margin-top:10px;">
                            <div style="display:flex;align-items:center;gap:10px;">
                                <i class="fas fa-clock"></i>
                                <div style="flex:1;">
                                    <strong>Aguardando assinatura do responsável...</strong>
                                    <p style="margin:3px 0 0;font-size:12px;">Sessão ativa: ${stResp.sessaoId || 'N/A'}</p>
                                </div>
                            </div>
                        </div>`;
                }
            }
        }

        // ── Aluno ──
        if (stAluno) {
            if (typeof window.estadoSessaoAssinaturaAluno === 'undefined') window.estadoSessaoAssinaturaAluno = {};
            if (!window.estadoSessaoAssinaturaAluno[modulo]) {
                window.estadoSessaoAssinaturaAluno[modulo] = { sessaoId: null, assinaturaCapturada: null, qrCodeDataUrl: null };
            }
            Object.assign(window.estadoSessaoAssinaturaAluno[modulo], stAluno);

            if (modulo === 'atendimento') {
                const st = getAtendimentoState();
                if (st) Object.assign(st.sessaoAssinaturaAluno, stAluno);
            }

            const check = document.getElementById(mapa.checkAluno);
            if (check) check.checked = true;

            const bloco = document.getElementById(mapa.blocoAluno);
            if (bloco) {
                bloco.style.display = 'block';
                if (stAluno.assinaturaCapturada) {
                    bloco.innerHTML = `
                        <div style="margin-top:10px;background:#f0fdf4;border:2px solid #10b981;border-radius:12px;padding:14px;">
                            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
                                <i class="fas fa-check-circle" style="color:#10b981;font-size:22px;"></i>
                                <div style="flex:1;">
                                    <strong style="color:#065f46;">✓ Assinatura do aluno capturada!</strong>
                                    <p style="margin:3px 0 0;font-size:12px;color:#047857;">
                                        ${stAluno.assinadaPorNome ? stAluno.assinadaPorNome + ' • ' : ''}
                                        ${stAluno.assinadaEm ? new Date(stAluno.assinadaEm).toLocaleString('pt-BR') : ''}
                                    </p>
                                </div>
                            </div>
                            <div style="background:white;border-radius:8px;padding:8px;text-align:center;">
                                <img src="${stAluno.assinaturaCapturada}" style="max-width:100%;max-height:100px;" alt="Assinatura do aluno">
                            </div>
                        </div>`;
                } else {
                    bloco.innerHTML = `
                        <div class="alert alert-warning" style="font-size:13px;border-radius:10px;border-left:4px solid #f59e0b;margin-top:10px;">
                            <div style="display:flex;align-items:center;gap:10px;">
                                <i class="fas fa-clock"></i>
                                <div style="flex:1;">
                                    <strong>Aguardando assinatura do aluno...</strong>
                                    <p style="margin:3px 0 0;font-size:12px;">Sessão ativa: ${stAluno.sessaoId || 'N/A'}</p>
                                </div>
                            </div>
                        </div>`;
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // RESTAURAR
    // ═══════════════════════════════════════════════════════════
    async function restaurarModulo(modulo) {
        const r = obterRascunhos()[modulo];
        if (!r) return false;
        if ((Date.now() - (r.timestamp || 0)) > VALIDADE_RASCUNHO_MS) {
            limparModulo(modulo); return false;
        }

        __restaurando = true;
        try {
            // 1. Troca para a aba correta
            const abaId = r.abaAlvo || Object.keys(ABAS).find(k => ABAS[k] === modulo);
            if (abaId) {
                const tabBtn = document.querySelector(`[data-bs-target="#${abaId}"]`);
                if (tabBtn) {
                    const tab = bootstrap.Tab.getOrCreateInstance(tabBtn);
                    tab.show();
                    await new Promise(res => setTimeout(res, 600));
                }
            }

            // 2. Reconstrói o painel do aluno
            if (r.aluno) {
                const alunoInfoEl = document.querySelector(ALUNO_INFO_SELETOR[modulo]);
                if (alunoInfoEl) {
                    if (r.aluno.htmlCompleto) {
                        alunoInfoEl.innerHTML = r.aluno.htmlCompleto;
                    } else {
                        const mapa = {
                            atraso: { nome: 'alunoNome', mat: 'alunoMatricula', turma: 'alunoTurma', curso: 'alunoCurso', foto: 'alunoFoto' },
                            autorizacao: { nome: 'alunoNomeAutorizacao', mat: 'alunoMatriculaAutorizacao', turma: 'alunoTurmaAutorizacao', curso: 'alunoCursoAutorizacao', foto: 'alunoFotoAutorizacao' },
                            justificativa: { nome: 'alunoNomeJustificativa', mat: 'alunoMatriculaJustificativa', turma: 'alunoTurmaJustificativa', curso: 'alunoCursoJustificativa', foto: 'alunoFotoJustificativa' },
                            segundaChamada: { nome: 'alunoNomeSegundaChamada', mat: 'alunoMatriculaSegundaChamada', turma: 'alunoTurmaSegundaChamada', curso: 'alunoCursoSegundaChamada', foto: 'alunoFotoSegundaChamada' },
                            uniforme: { nome: 'alunoNomeUniforme', mat: 'alunoMatriculaUniforme', turma: 'alunoTurmaUniforme', curso: 'alunoCursoUniforme', foto: 'alunoFotoUniforme' },
                            atendimento: { nome: 'atendimentoAlunoNome', mat: 'atendimentoAlunoMatricula', turma: 'atendimentoAlunoTurma', curso: 'atendimentoAlunoCurso', foto: 'atendimentoAlunoFoto' }
                        };
                        const ids = mapa[modulo];
                        if (ids) {
                            const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || '-'; };
                            setTxt(ids.nome, r.aluno.nome);
                            setTxt(ids.mat, r.aluno.matricula);
                            setTxt(ids.turma, r.aluno.turma);
                            setTxt(ids.curso, r.aluno.curso);
                            const fotoEl = document.getElementById(ids.foto);
                            if (fotoEl && r.aluno.foto) fotoEl.src = r.aluno.foto;
                        }
                    }
                    alunoInfoEl.style.display = 'block';
                    const fotoEl = alunoInfoEl.querySelector('img');
                    if (fotoEl && r.aluno.foto) fotoEl.src = r.aluno.foto;
                }
            }

            // 3. Garante que o form está visível
            const formEl = document.querySelector(FORM_SELETOR[modulo]);
            if (formEl) formEl.style.display = 'block';

            // 4. Preenche os campos simples (busca por id global)
            let preencheu = 0;
            const idsCheckboxAssinatura = ['atrasoNecessitaAssinatura', 'atrasoNecessitaAssinaturaAluno',
                'autorizacaoNecessitaAssinatura', 'justificativaNecessitaAssinatura',
                'segundaChamadaNecessitaAssinatura', 'uniformeNecessitaAssinatura',
                'atendimentoNecessitaAssinatura', 'atendimentoNecessitaAssinaturaAluno'];

            Object.entries(r.campos || {}).forEach(([id, dados]) => {
                let el = document.getElementById(id);
                if (!el && dados.id) el = document.getElementById(dados.id);
                if (!el) {
                    const radios = document.querySelectorAll(`input[name="${CSS.escape(id)}"]`);
                    if (radios.length) {
                        radios.forEach(radio => {
                            if (radio.value === dados.valor && !radio.checked) {
                                radio.checked = true;
                                radio.dispatchEvent(new Event('change', { bubbles: false }));
                                preencheu++;
                            }
                        });
                        return;
                    }
                }
                if (!el) return;

                if (dados.tipo === 'checkbox') {
                    if (el.checked !== !!dados.valor) {
                        el.checked = !!dados.valor;
                        if (!idsCheckboxAssinatura.includes(id)) {
                            el.dispatchEvent(new Event('change', { bubbles: false }));
                        }
                        preencheu++;
                    }
                } else if (dados.tipo === 'radio') {
                    if (el.value === dados.valor && !el.checked) {
                        el.checked = true;
                        el.dispatchEvent(new Event('change', { bubbles: false }));
                        preencheu++;
                    }
                } else if (dados.tipo === 'multiselect') {
                    const atual = Array.from(el.selectedOptions).map(o => o.value);
                    const igual = atual.length === dados.valor.length &&
                                  atual.every(v => dados.valor.includes(v));
                    if (!igual) {
                        Array.from(el.options).forEach(o => {
                            o.selected = dados.valor.includes(o.value);
                        });
                        el.dispatchEvent(new Event('change', { bubbles: false }));
                        preencheu++;
                    }
                } else {
                    if (el.value !== dados.valor) {
                        el.value = dados.valor;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        preencheu++;
                    }
                }
            });

            // 5. RE-EXECUTA funções selecionar*
            const extra = r.estadoExtra || {};
            const fnSel = FUNCAO_SELECIONAR[modulo];

            const multiSelectModules = ['atraso', 'atendimento'];
            if (multiSelectModules.includes(modulo) && Array.isArray(extra.motivosSelecionados)) {
                if (modulo === 'atraso') {
                    if (typeof window.__motivosSelecionados !== 'undefined') window.__motivosSelecionados = [];
                    if (typeof window.motivoSelecionado !== 'undefined') window.motivoSelecionado = null;
                }
                if (typeof window[fnSel] === 'function') {
                    extra.motivosSelecionados.forEach(m => {
                        try { window[fnSel](m); preencheu++; } catch(e) { console.warn(e); }
                    });
                }
            }

            if (modulo === 'atendimento' && Array.isArray(extra.providenciasSelecionadas)) {
                if (typeof window.selecionarProvidenciaAtendimento === 'function') {
                    extra.providenciasSelecionadas.forEach(p => {
                        try { window.selecionarProvidenciaAtendimento(p); preencheu++; } catch(e) { console.warn(e); }
                    });
                }
            }
            else if (extra.motivoSelecionado && typeof window[fnSel] === 'function') {
                try { window[fnSel](extra.motivoSelecionado); preencheu++; } catch(e) { console.warn(e); }
            }
            else if (typeof window[fnSel] === 'function' && Array.isArray(r.cardsSelecionados)) {
                r.cardsSelecionados.forEach(c => {
                    if (['data-tipo', 'data-motivo', 'data-opcao', 'data-providencia'].includes(c.attr)) {
                        try { window[fnSel](c.valor); preencheu++; } catch(e) {}
                    }
                });
            }

            // 5b. 2ª Chamada
            if (modulo === 'segundaChamada') {
                const fe = FUNCOES_EXTRAS.segundaChamada;
                const tipoProva = extra.tipoProvaPerdida ||
                    (r.cardsSelecionados || []).find(c => c.attr === 'data-prova')?.valor;
                const periodo = extra.periodoProva ||
                    (r.cardsSelecionados || []).find(c => c.attr === 'data-periodo')?.valor;
                if (tipoProva && typeof window[fe.tipoProva] === 'function') {
                    try { window[fe.tipoProva](tipoProva); preencheu++; } catch(e){}
                }
                if (periodo && typeof window[fe.periodo] === 'function') {
                    try { window[fe.periodo](periodo); preencheu++; } catch(e){}
                }
            }

            // 6. Fallback: marca classe .selected nos cards
            if (Array.isArray(r.cardsSelecionados) && r.cardsSelecionados.length) {
                const abaAtiva = getAbaAtiva();
                const abaPane = abaAtiva ? document.getElementById(abaAtiva) : null;
                const containers = [formEl].filter(Boolean);
                if (abaPane) containers.push(abaPane);

                r.cardsSelecionados.forEach(item => {
                    const attr  = (typeof item === 'string') ? null : item.attr;
                    const valor = (typeof item === 'string') ? item       : item.valor;
                    let el = null;
                    if (attr && attr !== 'texto') {
                        containers.forEach(c => {
                            if (el) return;
                            try { el = c.querySelector(`[${attr}="${CSS.escape(valor)}"]`); } catch(e) {}
                        });
                    }
                    if (!el) return;
                    CLASSES_SELECIONADO.forEach(c => el.classList.add(c));
                    el.setAttribute('aria-pressed', 'true');
                    el.setAttribute('aria-checked', 'true');
                });
            }

            // 7. 🆕 Restaura assinaturas para QUALQUER módulo
            restaurarAssinaturasModulo(modulo, extra);
            if (extra.assinaturaResponsavel || extra.assinaturaAluno) preencheu++;

            // 8. RESTAURA O ALUNO NO ATENDIMENTO
            if (modulo === 'atendimento' && r.aluno) {
                const alunoFonte = extra.alunoAtual || r.aluno;

                const alunoObj = {
                    id: alunoFonte.id || alunoFonte.matricula || 'temp-' + Date.now(),
                    nome: alunoFonte.nome,
                    matricula: alunoFonte.matricula || 'N/A',
                    turma: alunoFonte.turma || '',
                    curso: alunoFonte.curso || '',
                    fotoPerfil: alunoFonte.fotoPerfil || alunoFonte.foto || ''
                };

                const st = getAtendimentoState();
                if (st) {
                    st.alunoAtual = alunoObj;
                    if (extra.tipoAtendimento) {
                        st.tipoAtendimento = extra.tipoAtendimento;
                        const radioAluno = document.getElementById('tipoAtendimentoAlunoRadio');
                        const radioResp  = document.getElementById('tipoAtendimentoResponsavelRadio');
                        if (extra.tipoAtendimento === 'aluno' && radioAluno) radioAluno.checked = true;
                        if (extra.tipoAtendimento === 'responsavel' && radioResp) radioResp.checked = true;
                        if (typeof window.atualizarUIPorTipoAtendimento === 'function') {
                            try { window.atualizarUIPorTipoAtendimento(); } catch(e) {}
                        }
                    }
                    if (Array.isArray(extra.motivosSelecionados)) st.motivosSelecionados = [...extra.motivosSelecionados];
                    if (Array.isArray(extra.providenciasSelecionadas)) st.providenciasSelecionadas = [...extra.providenciasSelecionadas];
                }

                if (typeof window.exibirAlunoAtendimento === 'function') {
                    try {
                        window.exibirAlunoAtendimento({
                            aluno: alunoObj,
                            historicoRecente: [],
                            estatisticas: { totalAtendimentos: 0 },
                            ultimoResponsavel: null
                        });
                        preencheu++;
                    } catch(e) { console.warn('[AutoSave] Erro exibirAlunoAtendimento:', e); }
                }

                const painelAluno = document.getElementById('atendimentoAlunoInfo');
                if (painelAluno) painelAluno.style.display = 'block';

                if (typeof window.mostrarFormAtendimento === 'function') {
                    try { window.mostrarFormAtendimento(); } catch(e) {}
                } else {
                    const formAtend = document.getElementById('formAtendimento');
                    if (formAtend) formAtend.style.display = 'block';
                }

                setTimeout(() => {
                    if (Array.isArray(extra.motivosSelecionados)) {
                        document.querySelectorAll('#campoMotivoAtendimento .tipo-card').forEach(c => {
                            const v = c.getAttribute('data-motivo');
                            if (extra.motivosSelecionados.includes(v)) c.classList.add('selected');
                            else c.classList.remove('selected');
                        });
                    }
                    if (Array.isArray(extra.providenciasSelecionadas)) {
                        document.querySelectorAll('#campoProvidenciasAtendimento .tipo-card').forEach(c => {
                            const v = c.getAttribute('data-providencia');
                            if (extra.providenciasSelecionadas.includes(v)) c.classList.add('selected');
                            else c.classList.remove('selected');
                        });
                    }
                }, 200);

                window.alunoAtendimento = alunoObj;
                window.alunoSelecionado = alunoObj;
                window.alunoAtual = alunoObj;
                window.currentAluno = alunoObj;

                setTimeout(() => {
                    Object.entries(r.campos || {}).forEach(([id, dados]) => {
                        if (dados.tipo !== 'valor') return;
                        const el = document.getElementById(id);
                        if (el && el.value !== dados.valor) {
                            el.value = dados.valor;
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    });
                }, 300);
            }
            else if (r.aluno && r.aluno.nome && r.aluno.matricula && !isPlaceholderInvalido(r.aluno.matricula)) {
                const funcoesAluno = {
                    atraso: ['selecionarAlunoAtraso', 'carregarAlunoAtraso'],
                    autorizacao: ['selecionarAlunoAutorizacao', 'carregarAlunoAutorizacao'],
                    justificativa: ['selecionarAlunoJustificativa', 'carregarAlunoJustificativa'],
                    segundaChamada: ['selecionarAlunoSegundaChamada', 'carregarAlunoSegundaChamada'],
                    uniforme: ['selecionarAlunoUniforme', 'carregarAlunoUniforme']
                };

                const fns = funcoesAluno[modulo] || [];
                for (const fn of fns) {
                    if (typeof window[fn] === 'function') {
                        try {
                            window[fn](r.aluno.matricula);
                            preencheu++;
                            break;
                        } catch(e) { console.warn(`[AutoSave] Erro ao executar ${fn}:`, e); }
                    }
                }
            }

            console.log(`♻️ [AutoSave] Restaurado ${modulo}: Aluno + ${preencheu} itens`);
            __restaurando = false;
            return preencheu > 0 || !!r.aluno;
        } catch (e) {
            console.error('[AutoSave] Erro ao restaurar:', e);
            __restaurando = false;
            return false;
        }
    }

    function notificar(msg, tipo) {
        if (typeof window.notificar === 'function') return window.notificar(msg, tipo);
        console.log('[AutoSave]', msg);
    }

    // ═══════════════════════════════════════════════════════════
    // LISTENERS
    // ═══════════════════════════════════════════════════════════
    function marcarSujo() {
        if (__restaurando) return;
        __sujo = true;
    }

    function vincularListeners() {
        document.body.addEventListener('input', (e) => {
            if (e.target.matches('input, select, textarea')) marcarSujo();
        }, true);
        document.body.addEventListener('change', (e) => {
            if (e.target.matches('input, select, textarea')) marcarSujo();
        }, true);
        document.body.addEventListener('click', (e) => {
            if (e.target.closest('.tipo-card, .providencia-card, [data-tipo], [data-opcao], [data-motivo], [data-providencia], [data-prova], [data-periodo], [aria-pressed], button')) {
                marcarSujo();
            }
        }, true);
    }

    // ═══════════════════════════════════════════════════════════
    // HOOKS
    // ═══════════════════════════════════════════════════════════
    function hookFuncoesSelecionar() {
        const nomes = [
            'selecionarMotivo',
            'selecionarMotivoAutorizacao',
            'selecionarMotivoJustificativa',
            'selecionarMotivoSegundaChamada',
            'selecionarMotivoUniforme',
            'selecionarTipoProvaPerdida',
            'selecionarPeriodoProva',
            'selecionarMotivoAtendimento',
            'selecionarProvidenciaAtendimento',
            'selecionarAluno',
            'exibirAlunoAtendimento',
            'selecionarAlunoManualAtendimento',
            'buscarAlunoAtendimento',
            // 🆕 Funções de assinatura — força save após concluir
            'salvarAssinaturaResponsavelInline',
            'salvarAssinaturaAlunoInline',
            'atualizarStatusAssinadoResponsavelAtendimento',
            'atualizarStatusAssinadoAtendimento'
        ];
        nomes.forEach(nome => {
            if (typeof window[nome] === 'function' && !window[nome].__autosaveHooked) {
                const orig = window[nome];
                window[nome] = function(...args) {
                    const r = orig.apply(this, args);
                    marcarSujo();
                    const deveSalvarJa =
                        nome.includes('Aluno') ||
                        nome.includes('QRCode') ||
                        nome.includes('Scan') ||
                        nome === 'selecionarAluno' ||
                        nome.startsWith('exibirAluno') ||
                        nome.includes('Assinatura') ||
                        nome.includes('Assinado');
                    if (deveSalvarJa) {
                        setTimeout(() => { try { salvarTudo(); } catch(e){} }, 150);
                    }
                    return r;
                };
                window[nome].__autosaveHooked = true;
                console.log(`🪝 Hook: ${nome}`);
            }
        });
    }

    function hookRegistrar() {
        const fns = [
            { fn: 'registrarAtraso', mod: 'atraso' },
            { fn: 'registrarModulo', mod: null },
            { fn: 'registrarAutorizacao', mod: 'autorizacao' },
            { fn: 'registrarJustificativa', mod: 'justificativa' },
            { fn: 'registrarSegundaChamada', mod: 'segundaChamada' },
            { fn: 'registrarUniforme', mod: 'uniforme' },
            { fn: 'registrarAtendimento', mod: 'atendimento' }
        ];
        fns.forEach(({fn, mod}) => {
            if (typeof window[fn] === 'function' && !window[fn].__autosaveHooked) {
                const orig = window[fn];
                window[fn] = async function(...args) {
                    const r = await orig.apply(this, args);
                    if (r !== false) {
                        if (mod) limparModulo(mod);
                        else if (args[0]) limparModulo(String(args[0]).toLowerCase());
                    }
                    return r;
                };
                window[fn].__autosaveHooked = true;
                console.log(`🪝 Hook: ${fn}`);
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    // LOOP E INICIALIZAÇÃO
    // ═══════════════════════════════════════════════════════════
    function iniciarLoop() {
        if (__interval) clearInterval(__interval);
        __interval = setInterval(() => { if (__sujo) salvarTudo(); }, INTERVALO_AUTOSAVE);
    }

    window.AutoSaveGG = {
        obterRascunhos,
        capturarModulo,
        salvarTudo,
        limparModulo,
        restaurarModulo,
        atualizarBanner,
        mostrarBanner,
        esconderBanner,
        marcarSujo,
        _debug: () => ({
            sujo: __sujo,
            intervalAtivo: !!__interval,
            inicializado: __inicializado,
            restaurando: __restaurando,
            atendimentoStateExiste: !!getAtendimentoState(),
            alunoAtualNoState: getAtendimentoState()?.alunoAtual || null,
            camposSalvos: Object.fromEntries(
                Object.entries(obterRascunhos()).map(([mod, r]) => [
                    mod, r?.campos ? Object.keys(r.campos) : []
                ])
            ),
            assinaturasSalvas: Object.fromEntries(
                Object.entries(obterRascunhos()).map(([mod, r]) => [
                    mod, {
                        responsavel: !!r?.estadoExtra?.assinaturaResponsavel,
                        aluno: !!r?.estadoExtra?.assinaturaAluno
                    }
                ])
            ),
            rascunhos: obterRascunhos()
        })
    };

    function iniciar() {
        if (__inicializado) return;
        if (window.__MODO_ASSINATURA__) return;
        if (!localStorage.getItem('auth_token')) return;
        __inicializado = true;

        limparExpirados();
        vincularListeners();
        iniciarLoop();

        let tentativas = 0;
        const aguardar = setInterval(() => {
            hookFuncoesSelecionar();
            hookRegistrar();
            if (tentativas++ > 40) clearInterval(aguardar);
        }, 250);

        setTimeout(() => {
            atualizarBanner();
            console.log('✅ [AutoSave] Inicializado');
        }, 1200);

        document.querySelectorAll('[data-bs-toggle="tab"]').forEach(tab => {
            tab.addEventListener('hidden.bs.tab', () => { if (__sujo) salvarTudo(); });
        });

        window.addEventListener('beforeunload', () => {
            if (__sujo) { try { salvarTudo(); } catch(e){} }
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && __sujo) salvarTudo();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();