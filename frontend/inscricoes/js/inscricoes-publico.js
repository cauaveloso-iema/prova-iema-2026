/* ============================================================================
   inscricoes-publico.js — Formulário público de inscrição socioeconômica
   ============================================================================ */
'use strict';

const API_BASE = '/api/inscricoes';
const TOTAL_PASSOS = 6;

const UFS = [
    'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
    'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
];

const ESCOLARIDADES = [
    'Ensino Fundamental Incompleto',
    'Ensino Fundamental Completo',
    'Ensino Médio Incompleto',
    'Ensino Médio Completo',
    'Ensino Superior Incompleto',
    'Ensino Superior Completo',
    'Não Alfabetizado'
];

const GRAUS_PARENTESCO = [
    'Pai', 'Mãe', 'Padrasto/Madrasta', 'Avô/Avó',
    'Irmãos', 'Tios', 'Primos', 'Filhos', 'Outros'
];

const FAIXAS_RENDA = [
    'Até 1 salário mínimo',
    'De 1 a 2 salários mínimos',
    'De 2 a 3 salários mínimos',
    'Acima de 3 salários mínimos'
];

const PROGRAMAS_SOCIAIS = ['Bolsa Família', 'Auxílio Brasil', 'Nenhum', 'Outro'];

const state = {
    config: null,
    passo: 1,
    enviando: false,
    lgpdAceito: false
};

// ============================================================================
// HELPERS
// ============================================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toast(msg, tipo = 'info', duracao = 4200) {
    const wrap = document.getElementById('ins-toast-wrap');
    if (!wrap) return;

    const el = document.createElement('div');
    el.className = `ins-toast ins-toast-${tipo}`;
    const icones = { info: 'fa-circle-info', success: 'fa-circle-check', error: 'fa-circle-exclamation', warning: 'fa-triangle-exclamation' };
    el.innerHTML = `<i class="fas ${icones[tipo] || icones.info}"></i><span>${escapeHtml(msg)}</span>`;
    wrap.appendChild(el);

    const remover = () => {
        el.classList.add('saindo');
        setTimeout(() => el.remove(), 220);
    };
    setTimeout(remover, duracao);
    el.addEventListener('click', remover);
}

function setPath(obj, path, valor) {
    const partes = path.split('.');
    let atual = obj;
    for (let i = 0; i < partes.length - 1; i++) {
        if (!atual[partes[i]] || typeof atual[partes[i]] !== 'object') atual[partes[i]] = {};
        atual = atual[partes[i]];
    }
    atual[partes[partes.length - 1]] = valor;
}

function pushArray(obj, path, valor) {
    const partes = path.split('.');
    let atual = obj;
    for (let i = 0; i < partes.length - 1; i++) {
        if (!atual[partes[i]] || typeof atual[partes[i]] !== 'object') atual[partes[i]] = {};
        atual = atual[partes[i]];
    }
    const chave = partes[partes.length - 1];
    if (!Array.isArray(atual[chave])) atual[chave] = [];
    if (!atual[chave].includes(valor)) atual[chave].push(valor);
}

function formatarData(d) {
    if (!d) return '—';
    const data = new Date(d);
    if (isNaN(data)) return '—';
    return data.toLocaleDateString('pt-BR');
}

function formatarDataHora(d) {
    if (!d) return '—';
    const data = new Date(d);
    if (isNaN(data)) return '—';
    return data.toLocaleString('pt-BR');
}

// ============================================================================
// MÁSCARAS
// ============================================================================
function mascaraCPF(v) {
    return v.replace(/\D/g, '').slice(0, 11)
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function mascaraTelefone(v) {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 10) {
        return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
    }
    return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

function mascaraCEP(v) {
    return v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
}

function aplicarMascaras() {
    document.querySelectorAll('[data-mascara]').forEach(input => {
        const tipo = input.dataset.mascara;
        const fn = tipo === 'cpf' ? mascaraCPF : tipo === 'tel' ? mascaraTelefone : mascaraCEP;

        input.addEventListener('input', () => {
            input.value = fn(input.value);
            limparErro(input);
        });
    });

    document.querySelectorAll('input, select, textarea').forEach(el => {
        el.addEventListener('input', () => limparErro(el));
        el.addEventListener('change', () => limparErro(el));
    });
}

// ============================================================================
// ERROS DE CAMPO
// ============================================================================
function marcarErro(el, msg) {
    const field = el.closest('.ins-field') || el;
    field.classList.add('invalido');
    const err = field.querySelector('.ins-err');
    if (err) err.textContent = msg;
}

function limparErro(el) {
    const field = el.closest ? el.closest('.ins-field') : null;
    if (!field) return;
    field.classList.remove('invalido');
    const err = field.querySelector('.ins-err');
    if (err) err.textContent = '';
}

// ============================================================================
// OPÇÕES DINÂMICAS
// ============================================================================
function renderOpcoes() {
    const uf = document.getElementById('end-estado');
    if (uf) {
        uf.innerHTML = '<option value="">UF</option>' +
            UFS.map(u => `<option value="${u}">${u}</option>`).join('');
    }

    const pai = document.getElementById('opcoes-escolaridade-pai');
    if (pai) {
        pai.innerHTML = ESCOLARIDADES.map((e, i) => `
            <label class="ins-radio">
                <input type="radio" name="composicaoFamiliar.escolaridadePai" value="${escapeHtml(e)}" id="esc-pai-${i}">
                <span>${escapeHtml(e)}</span>
            </label>
        `).join('');
    }

    const mae = document.getElementById('opcoes-escolaridade-mae');
    if (mae) {
        mae.innerHTML = ESCOLARIDADES.map((e, i) => `
            <label class="ins-radio">
                <input type="radio" name="composicaoFamiliar.escolaridadeMae" value="${escapeHtml(e)}" id="esc-mae-${i}">
                <span>${escapeHtml(e)}</span>
            </label>
        `).join('');
    }

    const graus = document.getElementById('opcoes-graus-parentesco');
    if (graus) {
        graus.innerHTML = GRAUS_PARENTESCO.map((g, i) => `
            <label class="ins-check">
                <input type="checkbox" name="composicaoFamiliar.grausParentesco" data-tipo="array"
                       value="${escapeHtml(g)}" id="grau-${i}">
                <span>${escapeHtml(g)}</span>
            </label>
        `).join('');
    }

    const renda = document.getElementById('opcoes-faixa-renda');
    if (renda) {
        renda.innerHTML = FAIXAS_RENDA.map((f, i) => `
            <label class="ins-radio">
                <input type="radio" name="rendaFamiliar.faixaRenda" value="${escapeHtml(f)}" id="renda-${i}">
                <span>${escapeHtml(f)}</span>
            </label>
        `).join('');
    }

    const programas = document.getElementById('opcoes-programas-sociais');
    if (programas) {
        programas.innerHTML = PROGRAMAS_SOCIAIS.map((p, i) => `
            <label class="ins-radio">
                <input type="radio" name="rendaFamiliar.programasSociais" data-tipo="array"
                       value="${escapeHtml(p)}" id="prog-${i}">
                <span>${escapeHtml(p)}</span>
            </label>
        `).join('');
    }

    // Reaplica listeners de limpar erro nos elementos recém-criados
    document.querySelectorAll('input, select, textarea').forEach(el => {
        el.addEventListener('input', () => limparErro(el));
        el.addEventListener('change', () => limparErro(el));
    });
}

// ============================================================================
// CONDICIONAIS
// ============================================================================
function configurarCondicionais() {
    const toggle = (gatilho, alvo, mostrarQuando) => {
        if (!gatilho || !alvo) return;
        const atualizar = () => {
            const mostrar = mostrarQuando(gatilho);
            alvo.classList.toggle('ins-hidden', !mostrar);
            if (!mostrar) {
                const input = alvo.querySelector('input, select, textarea');
                if (input) input.value = '';
            }
        };
        gatilho.addEventListener('change', atualizar);
        atualizar();
    };

    // CadÚnico → NIS
    toggle(
        document.getElementById('aluno-cadunico'),
        document.getElementById('aluno-nis-field'),
        (el) => el.value === 'true'
    );
    toggle(
        document.getElementById('resp-cadunico'),
        document.getElementById('resp-nis-field'),
        (el) => el.value === 'true'
    );

    // Deficiência → qual
    const radiosDef = document.querySelectorAll('input[name="informacoesAdicionais.possuiDeficiencia"]');
    const campoDef = document.getElementById('info-deficiencia-field');
    const atualizarDef = () => {
        const marcado = document.querySelector('input[name="informacoesAdicionais.possuiDeficiencia"]:checked');
        const mostrar = marcado && marcado.value === 'true';
        campoDef.classList.toggle('ins-hidden', !mostrar);
        if (!mostrar) document.getElementById('info-deficiencia').value = '';
    };
    radiosDef.forEach(r => r.addEventListener('change', atualizarDef));
    atualizarDef();

    // Programa social "Outro" → campo texto
    const radiosProg = document.querySelectorAll('input[name="rendaFamiliar.programasSociais"]');
    const campoOutro = document.getElementById('renda-outro-field');
    const atualizarOutro = () => {
        const marcado = document.querySelector('input[name="rendaFamiliar.programasSociais"]:checked');
        const mostrar = marcado && marcado.value === 'Outro';
        campoOutro.classList.toggle('ins-hidden', !mostrar);
        if (!mostrar) document.getElementById('renda-outro').value = '';
    };
    radiosProg.forEach(r => r.addEventListener('change', atualizarOutro));
    atualizarOutro();
}

// ============================================================================
// NAVEGAÇÃO ENTRE PASSOS
// ============================================================================
function atualizarStepper() {
    $$('.ins-step').forEach(step => {
        const n = Number(step.dataset.passo);
        step.classList.toggle('ativo', n === state.passo);
        step.classList.toggle('concluido', n < state.passo);
    });

    const barra = document.getElementById('ins-progress-bar');
    if (barra) barra.style.width = `${(state.passo / TOTAL_PASSOS) * 100}%`;

    const btnVoltar = document.getElementById('btn-voltar');
    const btnProximo = document.getElementById('btn-proximo');
    const btnEnviar = document.getElementById('btn-enviar');

    if (btnVoltar) btnVoltar.classList.toggle('ins-hidden', state.passo === 1);
    if (btnProximo) btnProximo.classList.toggle('ins-hidden', state.passo === TOTAL_PASSOS);
    if (btnEnviar) btnEnviar.classList.toggle('ins-hidden', state.passo !== TOTAL_PASSOS);
}

function irParaPasso(n) {
    if (n < 1 || n > TOTAL_PASSOS) return;
    state.passo = n;
    $$('.ins-passo').forEach(p => {
        p.classList.toggle('ativo', Number(p.dataset.passo) === n);
    });
    atualizarStepper();

    const alvo = document.querySelector('.ins-steps');
    if (alvo) {
        const topo = alvo.getBoundingClientRect().top + window.scrollY - 20;
        window.scrollTo({ top: topo, behavior: 'smooth' });
    }
}

function validarPasso(n) {
    const passo = document.querySelector(`.ins-passo[data-passo="${n}"]`);
    if (!passo) return true;

    let ok = true;
    let primeiro = null;

    passo.querySelectorAll('[data-obrigatorio]').forEach(el => {
        // Ignora elementos escondidos (condicionais)
        if (el.offsetParent === null) return;

        if (el.dataset.obrigatorio === 'grupo') {
            const marcado = el.querySelector('input[type="radio"]:checked')
                || el.querySelector('input[type="checkbox"]:checked');
            if (!marcado) {
                marcarErro(el, 'Selecione uma opção.');
                ok = false;
                primeiro = primeiro || el;
            } else {
                limparErro(el);
            }
            return;
        }

        const valor = (el.value || '').trim();
        if (!valor) {
            marcarErro(el, 'Campo obrigatório.');
            ok = false;
            primeiro = primeiro || el;
        } else {
            limparErro(el);
        }
    });

    // Validações extras de formato
    if (n === 1) {
        const cpf = document.getElementById('aluno-cpf');
        if (cpf && cpf.value && !validarCPF(cpf.value)) {
            marcarErro(cpf, 'CPF inválido.');
            ok = false;
            primeiro = primeiro || cpf;
        }
        const nasc = document.getElementById('aluno-nascimento');
        if (nasc && nasc.value) {
            const d = new Date(nasc.value);
            if (d > new Date()) {
                marcarErro(nasc, 'A data de nascimento não pode ser no futuro.');
                ok = false;
                primeiro = primeiro || nasc;
            }
        }
    }

    if (n === 2) {
        const cpf = document.getElementById('resp-cpf');
        if (cpf && cpf.value && !validarCPF(cpf.value)) {
            marcarErro(cpf, 'CPF inválido.');
            ok = false;
            primeiro = primeiro || cpf;
        }
    }

    if (n === 6) {
        const aceite = document.getElementById('lgpd-aceite');
        if (aceite && !aceite.checked) {
            marcarErro(aceite, 'É necessário aceitar o termo para enviar.');
            ok = false;
            primeiro = primeiro || aceite;
        }
    }

    if (primeiro) {
        const alvo = primeiro.closest('.ins-field') || primeiro;
        alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
        toast('Verifique os campos destacados.', 'warning');
    }

    return ok;
}

function validarCPF(cpf) {
    const d = String(cpf || '').replace(/\D/g, '');
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;

    let soma = 0;
    for (let i = 0; i < 9; i++) soma += Number(d[i]) * (10 - i);
    let dv1 = (soma * 10) % 11;
    if (dv1 === 10) dv1 = 0;
    if (dv1 !== Number(d[9])) return false;

    soma = 0;
    for (let i = 0; i < 10; i++) soma += Number(d[i]) * (11 - i);
    let dv2 = (soma * 10) % 11;
    if (dv2 === 10) dv2 = 0;
    return dv2 === Number(d[10]);
}

function configurarNavegacao() {
    const btnProximo = document.getElementById('btn-proximo');
    const btnVoltar = document.getElementById('btn-voltar');

    if (btnProximo) {
        btnProximo.addEventListener('click', () => {
            if (!validarPasso(state.passo)) return;
            irParaPasso(state.passo + 1);
        });
    }

    if (btnVoltar) {
        btnVoltar.addEventListener('click', () => irParaPasso(state.passo - 1));
    }

    $$('.ins-step').forEach(step => {
        step.addEventListener('click', () => {
            const n = Number(step.dataset.passo);
            if (n <= state.passo) return irParaPasso(n);

            // Avançar só se todos os passos anteriores forem válidos
            for (let i = state.passo; i < n; i++) {
                if (!validarPasso(i)) {
                    irParaPasso(i);
                    return;
                }
            }
            irParaPasso(n);
        });
    });
}

// ============================================================================
// CEP
// ============================================================================
function configurarCEP() {
    const cep = document.getElementById('end-cep');
    const status = document.getElementById('cep-status');
    if (!cep) return;

    let ultimoBuscado = '';

    const buscar = async () => {
        const digitos = cep.value.replace(/\D/g, '');
        if (digitos.length !== 8 || digitos === ultimoBuscado) return;
        ultimoBuscado = digitos;

        if (status) status.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

        try {
            const resp = await fetch(`${API_BASE}/publica/cep/${digitos}`);
            const data = await resp.json();

            if (!data.success) throw new Error(data.error || 'CEP não encontrado.');

            const e = data.endereco;
            const set = (id, valor) => {
                const el = document.getElementById(id);
                if (el && valor) el.value = valor;
            };

            set('end-logradouro', e.logradouro);
            set('end-bairro', e.bairro);
            set('end-cidade', e.cidade);

            const uf = document.getElementById('end-estado');
            if (uf && e.estado) uf.value = e.estado;

            if (status) status.innerHTML = '<i class="fas fa-circle-check" style="color:#16a34a"></i>';

            const numero = document.getElementById('end-numero');
            if (numero && !numero.value) numero.focus();
        } catch (err) {
            if (status) status.innerHTML = '<i class="fas fa-circle-exclamation" style="color:#dc2626"></i>';
            toast(err.message, 'warning');
        }
    };

    cep.addEventListener('blur', buscar);
    cep.addEventListener('input', () => {
        if (cep.value.replace(/\D/g, '').length === 8) buscar();
    });
}

// ============================================================================
// COLETA DOS DADOS
// ============================================================================
function coletar() {
    const form = document.getElementById('form-inscricao');
    const dados = {};

    form.querySelectorAll('input[name], select[name], textarea[name]').forEach(el => {
        const nome = el.name;
        const tipo = el.dataset.tipo || '';

        if (el.type === 'radio') {
            if (!el.checked) return;
            if (tipo === 'array') pushArray(dados, nome, el.value);
            else if (tipo === 'bool') setPath(dados, nome, el.value === 'true');
            else setPath(dados, nome, el.value);
            return;
        }

        if (el.type === 'checkbox') {
            if (tipo === 'array') {
                if (el.checked) pushArray(dados, nome, el.value);
                return;
            }
            setPath(dados, nome, el.checked);
            return;
        }

        if (tipo === 'bool') {
            setPath(dados, nome, el.value === 'true');
            return;
        }

        if (tipo === 'num') {
            setPath(dados, nome, el.value === '' ? 0 : Number(el.value));
            return;
        }

        setPath(dados, nome, (el.value || '').trim());
    });

    // Garante estruturas mínimas
    if (!dados.composicaoFamiliar) dados.composicaoFamiliar = {};
    if (!Array.isArray(dados.composicaoFamiliar.grausParentesco)) dados.composicaoFamiliar.grausParentesco = [];
    if (!dados.rendaFamiliar) dados.rendaFamiliar = {};
    if (!Array.isArray(dados.rendaFamiliar.programasSociais)) dados.rendaFamiliar.programasSociais = [];
    if (!dados.condicaoMoradia) dados.condicaoMoradia = {};

    dados.lgpd = {
        aceito: !!(document.getElementById('lgpd-aceite') || {}).checked,
        versaoTermo: (state.config && state.config.versaoTermo) || '1.0'
    };

    return dados;
}

// ============================================================================
// LGPD
// ============================================================================
function configurarLGPD() {
    const modal = document.getElementById('modal-lgpd');
    const iframe = document.getElementById('iframe-lgpd');
    const abrir = document.getElementById('btn-abrir-lgpd');
    const fechar1 = document.getElementById('btn-fechar-lgpd');
    const fechar2 = document.getElementById('btn-fechar-lgpd-2');

    const abrirModal = () => {
        if (!modal) return;
        modal.classList.remove('ins-hidden');
        document.body.style.overflow = 'hidden';
    };

    const fecharModal = () => {
        if (!modal) return;
        modal.classList.add('ins-hidden');
        document.body.style.overflow = '';
    };

    if (abrir) abrir.addEventListener('click', abrirModal);
    if (fechar1) fechar1.addEventListener('click', fecharModal);
    if (fechar2) fechar2.addEventListener('click', fecharModal);
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) fecharModal();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') fecharModal();
    });

    // Mensagem do iframe
    window.addEventListener('message', (event) => {
        const data = event.data || {};
        if (data.tipo !== 'lgpd-inscricoes') return;

        if (data.aceito) {
            state.lgpdAceito = true;
            const chk = document.getElementById('lgpd-aceite');
            if (chk) {
                chk.checked = true;
                limparErro(chk);
            }
            const versao = document.getElementById('lgpd-versao');
            if (versao && data.versao) versao.textContent = `Versão do termo: ${data.versao}`;
            toast('Termo LGPD aceito.', 'success');
        }

        if (data.fechar) fecharModal();
    });

    if (iframe) {
        iframe.addEventListener('load', () => {
            // Fallback: se o termo não carregar, permite aceitar direto no checkbox
            try {
                const doc = iframe.contentDocument;
                if (doc && !doc.body.innerHTML.trim()) {
                    iframe.src = 'lgpd-inscricoes.html';
                }
            } catch (_) { /* cross-origin — ignora */ }
        });
    }
}

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================
async function carregarConfig() {
    try {
        const resp = await fetch(`${API_BASE}/publica/config`);
        const data = await resp.json();

        if (!data.success) throw new Error(data.error || 'Erro ao carregar configuração.');

        state.config = data.config;

        const cfg = data.config;

        const set = (id, txt) => {
            const el = document.getElementById(id);
            if (el && txt) el.textContent = txt;
        };

        set('cfg-titulo', cfg.titulo);
        set('cfg-serie', cfg.subtitulo || cfg.serie);
        set('cfg-objetivo', cfg.objetivo);

        // Período
        const badge = document.getElementById('cfg-badge-periodo');
        if (badge) {
            if (cfg.aberto) {
                badge.className = 'ins-hero-badge aberto';
                badge.innerHTML = '<i class="fas fa-circle-check"></i> Inscrições abertas';
            } else {
                badge.className = 'ins-hero-badge fechado';
                badge.innerHTML = '<i class="fas fa-lock"></i> Inscrições encerradas';
            }
        }

        const prazo = document.getElementById('cfg-prazo');
        if (prazo) {
            const ini = formatarData(cfg.dataInicio);
            const fim = formatarData(cfg.dataFim);
            prazo.textContent = `${ini} a ${fim}`;
        }

        const versao = document.getElementById('lgpd-versao');
        if (versao) versao.textContent = `Versão do termo: ${cfg.versaoTermo || '1.0'}`;

        // Bloqueio de envio
        if (!cfg.aberto) {
            const aviso = document.getElementById('ins-aviso-fechado');
            const texto = document.getElementById('ins-aviso-texto');
            if (aviso) aviso.classList.remove('ins-hidden');
            if (texto) {
                texto.textContent = cfg.vagasRestantes === 0
                    ? 'As vagas para este processo foram esgotadas.'
                    : (cfg.mensagemEncerrado || 'As inscrições estão encerradas no momento.');
            }

            const btn = document.getElementById('btn-enviar');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-lock"></i> Inscrições encerradas';
            }
        }

        // Contador de vagas no chip
        if (cfg.vagas > 0) {
            const chips = document.querySelector('.ins-chips');
            if (chips) {
                const chip = document.createElement('span');
                chip.className = 'ins-chip';
                chip.innerHTML = `<i class="fas fa-users"></i> ${cfg.vagasRestantes} vaga(s) restante(s)`;
                chips.appendChild(chip);
            }
        }
    } catch (err) {
        console.error(err);
        toast('Não foi possível carregar a configuração da inscrição.', 'error');
    }
}

// ============================================================================
// ENVIO
// ============================================================================
function configurarEnvio() {
    const form = document.getElementById('form-inscricao');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (state.enviando) return;

        // Valida todos os passos
        for (let i = 1; i <= TOTAL_PASSOS; i++) {
            if (!validarPasso(i)) {
                irParaPasso(i);
                return;
            }
        }

        const btn = document.getElementById('btn-enviar');
        const conteudoOriginal = btn ? btn.innerHTML : '';

        state.enviando = true;
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Enviando...';
        }

        try {
            const payload = coletar();

            const resp = await fetch(`${API_BASE}/publica`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await resp.json();

            if (!resp.ok || !data.success) {
                throw new Error(data.error || 'Não foi possível enviar a inscrição.');
            }

            mostrarSucesso(data.protocolo);
        } catch (err) {
            console.error(err);
            toast(err.message, 'error', 7000);
            // Se for erro de validação do backend, volta ao passo 1
            if (/CPF|obrigat|inválid|Informe|Selecione/i.test(err.message)) {
                irParaPasso(1);
            }
        } finally {
            state.enviando = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = conteudoOriginal;
            }
        }
    });
}

function mostrarSucesso(protocolo) {
    const form = document.getElementById('form-inscricao');
    const steps = document.getElementById('ins-steps');
    const progress = document.querySelector('.ins-progress');
    const sucesso = document.getElementById('ins-sucesso');

    if (form) form.classList.add('ins-hidden');
    if (steps) steps.classList.add('ins-hidden');
    if (progress) progress.classList.add('ins-hidden');
    if (sucesso) sucesso.classList.remove('ins-hidden');

    const valor = document.getElementById('ins-protocolo-valor');
    if (valor) valor.textContent = protocolo;

    const consultaProtocolo = document.getElementById('consulta-protocolo');
    if (consultaProtocolo) consultaProtocolo.value = protocolo;

    const cpf = document.getElementById('aluno-cpf');
    const consultaCpf = document.getElementById('consulta-cpf');
    if (cpf && consultaCpf) consultaCpf.value = cpf.value;

    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast('Inscrição registrada com sucesso!', 'success', 6000);
}

function configurarSucesso() {
    const copiar = document.getElementById('btn-copiar-protocolo');
    if (copiar) {
        copiar.addEventListener('click', async () => {
            const valor = document.getElementById('ins-protocolo-valor');
            if (!valor) return;
            try {
                await navigator.clipboard.writeText(valor.textContent.trim());
                toast('Protocolo copiado!', 'success');
            } catch (_) {
                toast('Não foi possível copiar. Anote o protocolo.', 'warning');
            }
        });
    }

    const nova = document.getElementById('btn-nova-inscricao');
    if (nova) {
        nova.addEventListener('click', () => {
            const form = document.getElementById('form-inscricao');
            const steps = document.getElementById('ins-steps');
            const progress = document.querySelector('.ins-progress');
            const sucesso = document.getElementById('ins-sucesso');

            if (form) {
                form.reset();
                form.classList.remove('ins-hidden');
            }
            if (steps) steps.classList.remove('ins-hidden');
            if (progress) progress.classList.remove('ins-hidden');
            if (sucesso) sucesso.classList.add('ins-hidden');

            state.lgpdAceito = false;
            document.querySelectorAll('.ins-field').forEach(f => f.classList.remove('invalido'));
            document.querySelectorAll('.ins-err').forEach(e => e.textContent = '');

            irParaPasso(1);
        });
    }
}

// ============================================================================
// CONSULTA
// ============================================================================
function configurarConsulta() {
    const form = document.getElementById('form-consulta');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const protocolo = (document.getElementById('consulta-protocolo').value || '').trim().toUpperCase();
        const cpf = (document.getElementById('consulta-cpf').value || '').replace(/\D/g, '');
        const resultado = document.getElementById('consulta-resultado');

        if (!protocolo) return toast('Informe o protocolo.', 'warning');
        if (cpf.length !== 11) return toast('Informe o CPF do aluno (11 dígitos).', 'warning');

        resultado.innerHTML = '<div class="ins-alert ins-alert-info"><i class="fas fa-circle-notch fa-spin"></i><div>Consultando...</div></div>';

        try {
            const resp = await fetch(`${API_BASE}/publica/consulta/${encodeURIComponent(protocolo)}?cpf=${cpf}`);
            const data = await resp.json();

            if (!resp.ok || !data.success) throw new Error(data.error || 'Não foi possível consultar.');

            const i = data.inscricao;
            const statusClasse = `ins-status-${String(i.status).toLowerCase().replace(/\s+/g, '-').normalize('NFD').replace(/[\u0300-\u036f]/g, '')}`;

            const historico = (i.historico || []).map(h => `
                <li>
                    <strong>${escapeHtml(h.status)}</strong>
                    ${formatarDataHora(h.em)}${h.observacao ? ' — ' + escapeHtml(h.observacao) : ''}
                </li>
            `).join('');

            resultado.innerHTML = `
                <div class="ins-consulta-resultado">
                    <h3>
                        ${escapeHtml(i.aluno)}
                        <span class="ins-status-badge ${statusClasse}">${escapeHtml(i.status)}</span>
                    </h3>
                    <p style="margin:0;font-size:13px;color:#64748b">
                        Protocolo <span class="ins-protocolo-mini">${escapeHtml(i.protocolo)}</span>
                        · ${escapeHtml(String(i.anoLetivo))} · ${escapeHtml(i.serie || '')}
                    </p>
                    <p style="margin:6px 0 0;font-size:13px;color:#64748b">
                        Responsável: <strong>${escapeHtml(i.responsavel || '—')}</strong>
                        · Inscrição em ${formatarDataHora(i.createdAt)}
                    </p>
                    ${historico ? `<ul class="ins-timeline">${historico}</ul>` : ''}
                </div>
            `;
        } catch (err) {
            resultado.innerHTML = `<div class="ins-alert ins-alert-error"><i class="fas fa-circle-exclamation"></i><div>${escapeHtml(err.message)}</div></div>`;
        }
    });
}

// ============================================================================
// INIT
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
    renderOpcoes();
    aplicarMascaras();
    configurarCondicionais();
    configurarNavegacao();
    configurarCEP();
    configurarLGPD();
    configurarEnvio();
    configurarSucesso();
    configurarConsulta();
    atualizarStepper();
    carregarConfig();
});