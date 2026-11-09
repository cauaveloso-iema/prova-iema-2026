/* ==========================================================================
   INSCRIÇÃO PÚBLICA — FRONTEND (professor) - Wizard Step-by-Step
   ==========================================================================
   - Wizard com passo 1 (professor/projeto) e passo 2 (alunos)
   - Assinatura via QR Code + canvas inline
   - LGPD via modal inline (sem persistência, sem pré-marcar)
   - Respeita permiteMultiplasInscricoes do evento
   - Se já inscrito (e não permite múltiplas), mostra tela de protocolo
   ========================================================================== */

const INSC_API = {
    evento: (slug) => `/api/eventos/publico/${slug}`,
    cadastro: '/api/eventos/publico/cadastro',
    login: '/api/eventos/publico/login',
    inscrever: (slug) => `/api/eventos/publico/${slug}/inscrever`,
    criarSessao: '/api/eventos/publico/sessoes-assinatura',
    sessao: (id) => `/api/eventos/publico/sessoes-assinatura/${id}`,
    uploadAnexo: (slug) => `/api/eventos/publico/${slug}/anexo-participante`,
    minhasInscricoes: '/api/eventos/publico/minhas-inscricoes'
};

const CHAVE_TOKEN = 'participante_eventos_token';
const CHAVE_USER = 'participante_eventos_user';
const CAMINHO_PAGINA_LGPD = 'lgpd-eventos.html';

const TIPOS_ANEXO_LABEL = { edital: 'Edital', formulario: 'Formulário', termo_lgpd: 'Termo LGPD', termo_imagem: 'Termo de Imagem', outro: 'Outro' };
const TIPOS_ANEXO_ICON = { edital: 'fa-file-alt', formulario: 'fa-file-signature', termo_lgpd: 'fa-shield-alt', termo_imagem: 'fa-camera', outro: 'fa-paperclip' };

const OPCOES_SERIE_ESTUDANTE = [
    '1º ano do Ensino Médio',
    '2º ano do Ensino Médio',
    '3º ano do Ensino Médio'
];

const CAMPOS_RESPONSAVEL = [
    'nome do responsavel', 'responsavel', 'nome responsavel',
    'naturalidade', 'estado civil', 'rg', 'cpf',
    'endereco (rua/avenida)', 'endereco (av/rua)', 'endereco', 'rua',
    'numero', 'nº', 'bairro', 'cep', 'municipio', 'municipio de', 'cidade',
    'estado', 'uf',
    'relacao (pai, mae ou representante legal)', '(pai, mae ou representante legal)',
    'qualidade (pai, mae ou representante legal)', 'data'
];

let eventoAtual = null;
let anexosAtuais = [];
let perfilParticipante = null;
let estadoRepeticoes = {};
let assinaturasCapturadas = {};
let anexosParticipanteState = {};
let passoAtual = 1;
let totalPassos = 1;
let dadosSalvos = {};
let sessoesAssinatura = {};
let __inscricaoEmAndamento = false;
let __lgpdAceitoNestaSessao = false;

// ---------- Utilitários ----------
function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function norm(s) {
    return String(s == null ? '' : s)
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function getSlug() { return new URLSearchParams(location.search).get('slug'); }
function getToken() { return localStorage.getItem(CHAVE_TOKEN); }
function setToken(t) { localStorage.setItem(CHAVE_TOKEN, t); }
function limparSessao() {
    localStorage.removeItem(CHAVE_TOKEN);
    localStorage.removeItem(CHAVE_USER);
}

async function api(url, options = {}, auth = false) {
    const isFormData = options.body instanceof FormData;
    const headers = {
        ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
    };
    if (auth && getToken()) headers['Authorization'] = 'Bearer ' + getToken();
    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.error || `Erro ${res.status}`);
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

function mostrarAlerta(id, msg, tipo = 'info') {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = `<div class="ev-alert ev-alert-${tipo}">${msg}</div>`;
    if (tipo !== 'error') setTimeout(() => { el.innerHTML = ''; }, 5000);
}

function mostrarToastGlobal(mensagem, tipo = 'success') {
    const antigo = document.getElementById('toastGlobal');
    if (antigo) antigo.remove();
    const cores = { success: '#10b981', error: '#dc2626', warning: '#f59e0b', info: '#0ea5e9' };
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    const toast = document.createElement('div');
    toast.id = 'toastGlobal';
    toast.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: ${cores[tipo] || cores.info}; color: white;
        padding: 14px 24px; border-radius: 12px; font-weight: 700; font-size: 15px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.25); z-index: 999999;
        display: flex; align-items: center; gap: 10px;
        animation: slideDown 0.3s ease-out; max-width: 90vw; text-align: center;
    `;
    toast.innerHTML = `<i class="fas ${icons[tipo] || icons.info}"></i> <span>${mensagem}</span>`;
    document.body.appendChild(toast);
    if (!document.getElementById('toastGlobalStyle')) {
        const style = document.createElement('style');
        style.id = 'toastGlobalStyle';
        style.textContent = `@keyframes slideDown { from { opacity: 0; transform: translate(-50%, -20px); } to { opacity: 1; transform: translate(-50%, 0); } }`;
        document.head.appendChild(style);
    }
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.transition = 'opacity 0.3s';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }
    }, 3000);
}
window.mostrarToastGlobal = mostrarToastGlobal;

function labelDoAnexo(anexo) {
    if (anexo.labelCustom && anexo.labelCustom.trim()) return anexo.labelCustom.trim();
    return TIPOS_ANEXO_LABEL[anexo.tipo] || 'Anexo';
}

function ehCampoResponsavel(label) {
    const l = norm(label);
    return CAMPOS_RESPONSAVEL.some(c => l === norm(c) || l.includes(norm(c)));
}

function gerarUUID() {
    return 'insc-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 15);
}

function dataHojeISO() {
    const hoje = new Date();
    const offset = hoje.getTimezoneOffset();
    const dataLocal = new Date(hoje.getTime() - (offset * 60 * 1000));
    return dataLocal.toISOString().split('T')[0];
}

// ---------- Validações ----------
function validarCPF(cpf) {
    const limpo = String(cpf || '').replace(/\D/g, '');
    if (limpo.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(limpo)) return false;
    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(limpo.charAt(i)) * (10 - i);
    let resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(limpo.charAt(9))) return false;
    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(limpo.charAt(i)) * (11 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(limpo.charAt(10))) return false;
    return true;
}

function formatarCPF(valor) {
    const limpo = String(valor || '').replace(/\D/g, '').slice(0, 11);
    if (limpo.length <= 3) return limpo;
    if (limpo.length <= 6) return `${limpo.slice(0,3)}.${limpo.slice(3)}`;
    if (limpo.length <= 9) return `${limpo.slice(0,3)}.${limpo.slice(3,6)}.${limpo.slice(6)}`;
    return `${limpo.slice(0,3)}.${limpo.slice(3,6)}.${limpo.slice(6,9)}-${limpo.slice(9)}`;
}

function formatarCEP(valor) {
    const limpo = String(valor || '').replace(/\D/g, '').slice(0, 8);
    if (limpo.length <= 5) return limpo;
    return `${limpo.slice(0,5)}-${limpo.slice(5)}`;
}

async function buscarCEP(cep) {
    const limpo = String(cep || '').replace(/\D/g, '');
    if (limpo.length !== 8) return null;
    try {
        const r = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
        const data = await r.json();
        if (data.erro) return null;
        return data;
    } catch (e) { return null; }
}

// ---------- Classificação ----------
function ehAvaliativo(anexo) { return anexo.isAvaliativo === true; }
function ehEstudante(anexo) { return anexo.tipoDadosTermo === 'estudante'; }
function ehRepetivel(anexo) { return anexo.repetivel === true; }

function ehAnexoProfessor(anexo) {
    if (ehAvaliativo(anexo)) return false;
    if (ehEstudante(anexo)) return false;
    if (ehRepetivel(anexo)) return false;
    return ((anexo.campos || []).length > 0) || anexo.solicitaAnexo;
}

function ehAnexoPasso2(anexo) {
    if (ehAvaliativo(anexo)) return false;
    return ehEstudante(anexo) || ehRepetivel(anexo);
}

function camposPorAluno(anexo) {
    if ((anexo.camposRepetiveis || []).length > 0) return anexo.camposRepetiveis;
    return anexo.campos || [];
}

function camposCabecalho(anexo) {
    const temCampos = (anexo.campos || []).length > 0;
    const temRepetiveis = (anexo.camposRepetiveis || []).length > 0;
    if (temCampos && temRepetiveis) return anexo.campos;
    return [];
}

function aplicarMascarasCadastro() {
    const inputCpf = document.getElementById('cad-cpf');
    const inputTel = document.getElementById('cad-telefone');
    if (inputCpf) inputCpf.addEventListener('input', function() { this.value = this.value.replace(/[^0-9]/g, ''); });
    if (inputTel) inputTel.addEventListener('input', function() { this.value = this.value.replace(/[^0-9]/g, ''); });
    const inputFuncao = document.getElementById('cad-funcao');
    if (inputFuncao) {
        inputFuncao.setAttribute('type', 'text');
        inputFuncao.setAttribute('inputmode', 'text');
        inputFuncao.removeAttribute('pattern');
        inputFuncao.classList.remove('mascara-numeros');
    }
}

// ============================================================
// CONTROLE DE TELAS (login / logado / protocolo)
// ============================================================
function esconderTodosOsBlocos() {
    ['bloco-nao-logado', 'bloco-logado', 'bloco-protocolo'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('ev-hidden');
            el.style.display = ''; // limpa display inline se houver
        }
    });
}

function mostrarBloco(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.remove('ev-hidden');
        el.style.display = 'block';
    }
}

function mostrarTelaProtocolo(protocolo, status) {
    esconderTodosOsBlocos();
    mostrarBloco('bloco-protocolo');

    const elCodigo = document.getElementById('protocolo-codigo');
    const elStatus = document.getElementById('protocolo-status');
    if (elCodigo) elCodigo.textContent = protocolo || '—';
    if (elStatus) elStatus.textContent = status || 'Pendente';

    const btnFazerNova = document.querySelector('#bloco-protocolo button[onclick*="reload"]');
    if (btnFazerNova) {
        btnFazerNova.style.display = eventoAtual?.permiteMultiplasInscricoes ? 'inline-block' : 'none';
    }
}

function mostrarTelaLogin() {
    esconderTodosOsBlocos();
    mostrarBloco('bloco-nao-logado');
}

function mostrarTelaLogado() {
    esconderTodosOsBlocos();
    mostrarBloco('bloco-logado');
}

// ============================================================
// LGPD — Modal inline (sem persistência)
// ============================================================
function aceitarLgpdPrincipal() {
    const chk = document.getElementById('insc-lgpd-confirmo');
    if (!chk) return;
    chk.checked = true;
    __lgpdAceitoNestaSessao = true;
}

function bindCheckboxLgpd() {
    const chk = document.getElementById('insc-lgpd-confirmo');
    if (!chk) return;
    if (chk.dataset.lgpdBound === '1') return;
    chk.dataset.lgpdBound = '1';
    chk.addEventListener('click', (e) => { e.preventDefault(); abrirModalLgpd(); });
    chk.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); abrirModalLgpd(); }
    });
}

function bindLinkPaginaLgpd() {
    const chk = document.getElementById('insc-lgpd-confirmo');
    if (!chk) return;
    if (chk.dataset.lgpdLinkBound === '1') return;
    const label = chk.closest('label') || chk.parentElement;
    if (!label) return;
    const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT, null);
    let alvoTextNode = null, node;
    while ((node = walker.nextNode())) {
        const t = (node.nodeValue || '').toLowerCase();
        if (t.includes('termos de privacidade') || t.includes('lgpd')) { alvoTextNode = node; break; }
    }
    if (!alvoTextNode) return;
    const textoOriginal = alvoTextNode.nodeValue;
    const lower = textoOriginal.toLowerCase();
    const idxTermos = lower.indexOf('termos de privacidade');
    const idxLgpd = lower.indexOf('(lgpd)');
    let inicioLink = -1, fimLink = -1;
    if (idxTermos !== -1) {
        inicioLink = idxTermos;
        fimLink = idxLgpd !== -1 ? idxLgpd + '(lgpd)'.length : idxTermos + 'termos de privacidade'.length;
    } else if (idxLgpd !== -1) {
        inicioLink = idxLgpd; fimLink = idxLgpd + '(lgpd)'.length;
    }
    if (inicioLink === -1) return;
    const antes = textoOriginal.slice(0, inicioLink);
    const trecho = textoOriginal.slice(inicioLink, fimLink);
    const depois = textoOriginal.slice(fimLink);
    const frag = document.createDocumentFragment();
    if (antes) frag.appendChild(document.createTextNode(antes));
    const link = document.createElement('a');
    link.href = '#'; link.textContent = trecho;
    link.style.cssText = 'color:#0ea5e9;font-weight:700;text-decoration:underline;cursor:pointer;';
    link.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); abrirModalLgpd(); });
    frag.appendChild(link);
    if (depois) frag.appendChild(document.createTextNode(depois));
    alvoTextNode.parentNode.replaceChild(frag, alvoTextNode);
    chk.dataset.lgpdLinkBound = '1';
}

function bindLgpd() {
    bindCheckboxLgpd();
    bindLinkPaginaLgpd();
}

function abrirModalLgpd() {
    const antigo = document.getElementById('modalLgpdInline');
    if (antigo) antigo.remove();

    const html = `
        <div id="modalLgpdInline" style="position:fixed;inset:0;z-index:999998;background:rgba(15,23,42,0.75);display:flex;align-items:center;justify-content:center;padding:16px;">
            <div style="background:white;border-radius:16px;max-width:920px;width:100%;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 25px 50px -12px rgba(0,0,0,0.4);">
                <div style="background:linear-gradient(135deg,#0ea5e9,#0284c7);color:white;padding:16px 22px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                    <h3 style="margin:0;font-size:17px;font-weight:700;display:flex;align-items:center;gap:10px;">
                        <i class="fas fa-shield-alt"></i> Termo de Privacidade (LGPD)
                    </h3>
                    <button type="button" id="btnFecharModalLgpd" style="background:rgba(255,255,255,0.2);border:none;color:white;width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:18px;">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div style="flex:1;overflow:auto;background:#f8fafc;min-height:300px;">
                    <iframe id="lgpdIframe" src="${CAMINHO_PAGINA_LGPD}?modal=1" style="width:100%;height:100%;min-height:400px;border:none;display:block;" title="Termo LGPD"></iframe>
                </div>
                <div style="padding:16px 22px;background:white;border-top:1px solid #e2e8f0;display:flex;flex-direction:column;gap:12px;flex-shrink:0;">
                    <div style="height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;">
                        <div id="lgpdProgressoBar" style="height:100%;width:0%;background:linear-gradient(90deg,#0ea5e9,#10b981);transition:width 0.15s;"></div>
                    </div>
                    <label id="lgpdCheckLabel" style="display:flex;align-items:flex-start;gap:12px;cursor:not-allowed;opacity:0.5;">
                        <input type="checkbox" id="lgpdCheckLiAceito" disabled style="width:22px;height:22px;margin-top:2px;cursor:not-allowed;flex-shrink:0;">
                        <span style="font-size:14px;color:#334155;line-height:1.4;">
                            <strong>Li todo o termo e aceito os termos de privacidade e proteção de dados (LGPD).</strong>
                        </span>
                    </label>
                    <div style="display:flex;gap:10px;justify-content:flex-end;">
                        <button type="button" id="btnCancelarModalLgpd" class="ev-btn ev-btn-secondary" style="padding:12px 22px;">Cancelar</button>
                        <button type="button" id="btnConfirmarModalLgpd" class="ev-btn ev-btn-primary" disabled style="padding:12px 22px;background:#cbd5e0;cursor:not-allowed;min-width:180px;">
                            <i class="fas fa-check"></i> Aceitar e continuar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);

    const modal = document.getElementById('modalLgpdInline');
    const iframe = document.getElementById('lgpdIframe');
    const wrapper = iframe.parentElement;
    const checkLi = document.getElementById('lgpdCheckLiAceito');
    const checkLabel = document.getElementById('lgpdCheckLabel');
    const btnConfirmar = document.getElementById('btnConfirmarModalLgpd');
    const barra = document.getElementById('lgpdProgressoBar');
    let liberado = false, fechado = false;

    const liberarAceite = () => {
        if (liberado) return;
        liberado = true;
        checkLi.disabled = false;
        checkLi.style.cursor = 'pointer';
        checkLabel.style.cursor = 'pointer';
        checkLabel.style.opacity = '1';
        barra.style.width = '100%';
    };

    const atualizarProgresso = (fracao) => {
        const pct = Math.max(0, Math.min(100, Math.round(fracao * 100)));
        barra.style.width = pct + '%';
    };

    const onMessageLgpd = (ev) => {
        const tipo = ev?.data?.tipo;
        if (tipo === 'lgpd_aceita') {
            aceitarLgpdPrincipal();
            fechar();
            mostrarToastGlobal('Termos LGPD aceitos!', 'success');
        } else if (tipo === 'lgpd_fechar') {
            fechar();
        }
    };
    window.addEventListener('message', onMessageLgpd);

    const tentarVincular = (tentativa = 1) => {
        if (fechado) return;
        try {
            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!doc || !doc.body) {
                if (tentativa < 20) return setTimeout(() => tentarVincular(tentativa + 1), 150);
                return ativarFallback();
            }
            const candidatos = [
                doc.scrollingElement, doc.documentElement, doc.body,
                ...Array.from(doc.querySelectorAll('.container, .content, main, article, #conteudoLGPD, #conteudo, #main'))
            ].filter(Boolean);

            const medir = () => {
                let scrollTop = 0, clientH = 0, scrollH = 0;
                for (const el of candidatos) {
                    const st = el.scrollTop || 0, sh = el.scrollHeight || 0, ch = el.clientHeight || 0;
                    if (sh - ch > scrollH - clientH) { scrollTop = st; clientH = ch; scrollH = sh; }
                }
                const denom = scrollH - clientH;
                const fracao = denom > 0 ? (scrollTop / denom) : 1;
                atualizarProgresso(fracao);
                if (denom <= 0 || fracao >= 0.98) liberarAceite();
            };
            medir();
            candidatos.forEach(el => el.addEventListener('scroll', medir, { passive: true }));
            setInterval(() => { if (!fechado) medir(); }, 500);
        } catch (e) {
            ativarFallback();
        }
    };

    const ativarFallback = () => {
        if (fechado) return;
        checkLi.disabled = false;
        checkLi.style.cursor = 'pointer';
        checkLabel.style.cursor = 'pointer';
        checkLabel.style.opacity = '1';
        barra.style.width = '100%';
    };

    iframe.addEventListener('load', () => setTimeout(tentarVincular, 200));
    setTimeout(() => { if (!liberado) ativarFallback(); }, 5000);

    checkLi.addEventListener('change', () => {
        if (checkLi.checked) {
            btnConfirmar.disabled = false;
            btnConfirmar.style.background = '#10b981';
            btnConfirmar.style.cursor = 'pointer';
        } else {
            btnConfirmar.disabled = true;
            btnConfirmar.style.background = '#cbd5e0';
            btnConfirmar.style.cursor = 'not-allowed';
        }
    });

    const fechar = () => {
        if (fechado) return;
        fechado = true;
        window.removeEventListener('message', onMessageLgpd);
        if (modal && modal.parentNode) modal.remove();
    };

    document.getElementById('btnFecharModalLgpd').addEventListener('click', fechar);
    document.getElementById('btnCancelarModalLgpd').addEventListener('click', fechar);
    btnConfirmar.addEventListener('click', () => {
        if (!checkLi.checked) return;
        aceitarLgpdPrincipal();
        fechar();
        mostrarToastGlobal('Termos LGPD aceitos!', 'success');
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) fechar(); });
}

// ============================================================
// TELA DE ASSINATURA (MODO ?assinatura=UUID)
// ============================================================
async function carregarTelaAssinatura(sessaoId) {
    document.body.innerHTML = '';
    document.body.style.cssText = 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f0f9ff;min-height:100vh;padding:10px;box-sizing:border-box;margin:0;';
    const container = document.createElement('div');
    container.style.cssText = 'max-width:800px;width:100%;margin:0 auto;display:flex;flex-direction:column;min-height:calc(100vh - 20px);';
    container.innerHTML = `
        <div style="background:linear-gradient(135deg,#0ea5e9,#0284c7);color:white;padding:14px 20px;border-radius:16px 16px 0 0;text-align:center;">
            <h1 style="font-size:18px;margin:0;"><i class="fas fa-signature"></i> Assinatura Digital</h1>
        </div>
        <div id="infoAssinatura" style="background:white;padding:16px;border-left:4px solid #0ea5e9;max-height:40vh;overflow-y:auto;">
            <div style="text-align:center;padding:20px;">
                <div style="width:30px;height:30px;border:4px solid #e2e8f0;border-top-color:#0ea5e9;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 10px;"></div>
                <p style="color:#64748b;margin:0;">Carregando...</p>
            </div>
        </div>
        <div id="areaAssinatura" style="background:white;padding:15px;border-radius:0 0 16px 16px;flex:1;display:none;flex-direction:column;">
            <div id="canvasWrapperTela" style="position:relative;background:white;border:3px dashed #cbd5e0;border-radius:16px;overflow:hidden;flex:1;min-height:180px;margin-bottom:12px;touch-action:none;">
                <canvas id="canvasTela" style="width:100%;height:100%;display:block;"></canvas>
                <div id="placeholderTela" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#94a3b8;pointer-events:none;width:100%;">
                    <i class="fas fa-pen-fancy" style="font-size:32px;display:block;margin-bottom:5px;"></i>
                    <span>Assine aqui com o dedo</span>
                </div>
            </div>
            <div style="display:flex;gap:10px;">
                <button type="button" onclick="limparAssinaturaTela()" style="flex:1;padding:12px;background:#f1f5f9;color:#475569;border:none;border-radius:12px;font-weight:600;font-size:14px;cursor:pointer;">
                    <i class="fas fa-eraser"></i> Limpar
                </button>
                <button type="button" id="btnConfirmarTela" onclick="salvarAssinaturaTela()" disabled style="flex:2;padding:12px;background:#cbd5e0;color:white;border:none;border-radius:12px;font-weight:600;font-size:14px;cursor:not-allowed;">
                    <i class="fas fa-check"></i> Confirmar Assinatura
                </button>
            </div>
        </div>
        <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
    `;
    document.body.appendChild(container);

    try {
        const res = await fetch(`${INSC_API.sessao(sessaoId)}`);
        const data = await res.json();
        if (!data.success) {
            document.getElementById('infoAssinatura').innerHTML = `<div style="text-align:center;padding:40px 20px;"><i class="fas fa-exclamation-triangle" style="font-size:56px;color:#ef4444;margin-bottom:15px;display:block;"></i><h2 style="color:#ef4444;margin:0 0 8px;">Sessão inválida</h2><p style="color:#64748b;margin:0;">${data.error || 'Sessão expirada.'}</p></div>`;
            return;
        }
        if (data.sessao.status === 'assinado') {
            document.getElementById('infoAssinatura').innerHTML = `<div style="text-align:center;padding:40px 20px;"><i class="fas fa-check-circle" style="font-size:56px;color:#10b981;margin-bottom:15px;display:block;"></i><h2 style="color:#10b981;margin:0 0 8px;">Sessão já assinada</h2></div>`;
            return;
        }
        if (data.sessao.status === 'cancelado') {
            document.getElementById('infoAssinatura').innerHTML = `<div style="text-align:center;padding:40px 20px;"><i class="fas fa-times-circle" style="font-size:56px;color:#ef4444;margin-bottom:15px;display:block;"></i><h2 style="color:#ef4444;margin:0 0 8px;">Sessão cancelada</h2></div>`;
            return;
        }
        const d = data.sessao.dadosAtendimento || {};
        const projeto = d.dadosExibidos?.projeto || {};
        const aluno = d.dadosExibidos?.aluno || {};
        const responsavel = d.dadosExibidos?.responsavel || {};
        let html = `<div style="border-left:4px solid #0ea5e9;padding-left:10px;margin-bottom:10px;"><h2 style="font-size:16px;color:#075985;margin:0;">${escapeHtml(d.eventoNome || 'Evento')}</h2><p style="color:#64748b;font-size:12px;margin-top:4px;">${escapeHtml(d.anexoLabel || '')}</p></div>`;
        html += `<div style="font-size:13px;color:#1e293b;"><strong>Aluno:</strong> ${escapeHtml(d.alunoNome || '-')}</div>`;
        if (Object.keys(projeto).length) html += `<div style="margin-top:8px;padding:8px;background:#f8fafc;border-radius:8px;font-size:12px;">${Object.entries(projeto).map(([k,v])=>`<div><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v||'-'))}</div>`).join('')}</div>`;
        if (Object.keys(aluno).length) html += `<div style="margin-top:8px;padding:8px;background:#f0fdf4;border-radius:8px;font-size:12px;">${Object.entries(aluno).map(([k,v])=>`<div><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v||'-'))}</div>`).join('')}</div>`;
        if (Object.keys(responsavel).length) html += `<div style="margin-top:8px;padding:8px;background:#fef3c7;border-radius:8px;font-size:12px;">${Object.entries(responsavel).map(([k,v])=>`<div><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v||'-'))}</div>`).join('')}</div>`;
        document.getElementById('infoAssinatura').innerHTML = html;
        document.getElementById('areaAssinatura').style.display = 'flex';
        setTimeout(() => inicializarCanvasTela(sessaoId), 100);
    } catch (e) {
        document.getElementById('infoAssinatura').innerHTML = `<div style="text-align:center;padding:40px 20px;"><h2 style="color:#ef4444;">Erro: ${e.message}</h2></div>`;
    }
}

let __telaCanvas = { ctx: null, canvas: null, wrapper: null, placeholder: null, desenhando: false, temAssinatura: false, lastX: 0, lastY: 0, sessaoId: null };

function inicializarCanvasTela(sessaoId) {
    const canvas = document.getElementById('canvasTela');
    const wrapper = document.getElementById('canvasWrapperTela');
    const placeholder = document.getElementById('placeholderTela');
    if (!canvas || !wrapper) return;
    __telaCanvas.canvas = canvas; __telaCanvas.wrapper = wrapper; __telaCanvas.placeholder = placeholder; __telaCanvas.sessaoId = sessaoId;
    const rect = wrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px'; canvas.style.height = rect.height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr,dpr);
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0ea5e9';
    __telaCanvas.ctx = ctx;
    const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        let cx, cy;
        if (e.touches?.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
        else if (e.changedTouches?.length > 0) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; }
        else { cx = e.clientX; cy = e.clientY; }
        return { x: cx - r.left, y: cy - r.top };
    };
    const iniciar = (e) => {
        e.preventDefault(); __telaCanvas.desenhando = true; __telaCanvas.temAssinatura = true;
        const p = getPos(e); __telaCanvas.lastX = p.x; __telaCanvas.lastY = p.y;
        wrapper.style.borderColor = '#0ea5e9'; wrapper.style.borderStyle = 'solid'; placeholder.style.opacity = '0';
        const btn = document.getElementById('btnConfirmarTela');
        if (btn) { btn.disabled = false; btn.style.background = '#10b981'; btn.style.cursor = 'pointer'; }
    };
    const desenhar = (e) => {
        if (!__telaCanvas.desenhando) return;
        e.preventDefault();
        const p = getPos(e);
        ctx.beginPath(); ctx.moveTo(__telaCanvas.lastX, __telaCanvas.lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
        __telaCanvas.lastX = p.x; __telaCanvas.lastY = p.y;
    };
    const parar = (e) => { if (e?.preventDefault) e.preventDefault(); __telaCanvas.desenhando = false; };
    canvas.addEventListener('touchstart', iniciar, { passive: false });
    canvas.addEventListener('touchmove', desenhar, { passive: false });
    canvas.addEventListener('touchend', parar, { passive: false });
    canvas.addEventListener('mousedown', iniciar);
    canvas.addEventListener('mousemove', desenhar);
    canvas.addEventListener('mouseup', parar);
    canvas.addEventListener('mouseleave', parar);
}

function limparAssinaturaTela() {
    const canvas = __telaCanvas.canvas, ctx = __telaCanvas.ctx;
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    __telaCanvas.temAssinatura = false;
    __telaCanvas.placeholder.style.opacity = '1';
    __telaCanvas.wrapper.style.borderColor = '#cbd5e0';
    __telaCanvas.wrapper.style.borderStyle = 'dashed';
    const btn = document.getElementById('btnConfirmarTela');
    if (btn) { btn.disabled = true; btn.style.background = '#cbd5e0'; btn.style.cursor = 'not-allowed'; }
}

async function salvarAssinaturaTela() {
    if (!__telaCanvas.temAssinatura || !__telaCanvas.canvas) return;
    const sessaoId = __telaCanvas.sessaoId;
    if (!sessaoId) return;
    const btn = document.getElementById('btnConfirmarTela');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }
    try {
        const base64 = __telaCanvas.canvas.toDataURL('image/png');
        const res = await fetch(`${INSC_API.sessao(sessaoId)}/assinar`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assinaturaBase64: base64, assinanteNome: 'Responsável' })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Erro ao salvar');
        document.getElementById('infoAssinatura').innerHTML = `<div style="text-align:center;padding:40px 20px;"><i class="fas fa-check-circle" style="font-size:56px;color:#10b981;margin-bottom:15px;display:block;"></i><h2 style="color:#10b981;margin:0 0 8px;">Assinatura Confirmada!</h2><button onclick="window.close()" style="padding:10px 24px;background:#0ea5e9;color:white;border:none;border-radius:10px;font-weight:600;cursor:pointer;">Fechar</button></div>`;
        document.getElementById('areaAssinatura').style.display = 'none';
    } catch (e) {
        alert('Erro: ' + e.message);
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Confirmar'; btn.style.background = '#10b981'; }
    }
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(location.search);
    const sessaoParam = params.get('assinatura');
    if (sessaoParam) { await carregarTelaAssinatura(sessaoParam); return; }
    aplicarMascarasCadastro();
    bindLgpd();
    carregarEvento();
});

// ============================================================
// CARREGA EVENTO — 🔥 CORRIGIDO: esconde blocos ANTES de tudo
// ============================================================
async function carregarEvento() {
    const slug = getSlug();
    if (!slug) {
        const erro = document.getElementById('erro-slug');
        if (erro) erro.classList.remove('ev-hidden');
        return;
    }

    // 🔥 1) ESCONDE OS 3 BLOCOS NO INÍCIO (independente do HTML)
    esconderTodosOsBlocos();

    try {
        const headers = {};
        if (getToken()) headers['Authorization'] = 'Bearer ' + getToken();
        const res = await fetch(INSC_API.evento(slug), { headers });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro ao carregar');

        eventoAtual = data.evento;
        anexosAtuais = (data.anexos || []).filter(a => a.isAvaliativo !== true);
        perfilParticipante = data.perfilParticipante || null;
        if (data.jaInscritoInfo) eventoAtual._jaInscritoInfo = data.jaInscritoInfo;

        anexosAtuais.forEach((a, i) => {
            if (ehEstudante(a) || ehRepetivel(a)) {
                estadoRepeticoes[i] = { quantidade: Math.max(1, a.quantidadePadrao || 1) };
            }
        });

        const temPasso2 = anexosAtuais.some(a => ehEstudante(a) || ehRepetivel(a));
        totalPassos = temPasso2 ? 2 : 1;

        // Preenche o hero
        document.getElementById('insc-hero').classList.remove('ev-hidden');
        document.getElementById('insc-titulo').textContent = eventoAtual.titulo;
        document.getElementById('insc-descricao').textContent = eventoAtual.descricaoPublica || '';
        document.getElementById('insc-local').textContent = eventoAtual.local || 'A definir';
        document.getElementById('insc-vagas').textContent = eventoAtual.vagas
            ? `${eventoAtual.totalParticipantes} / ${eventoAtual.vagas} vagas`
            : `${eventoAtual.totalParticipantes} inscrito(s)`;

        const ini = eventoAtual.dataInicioInscricao ? new Date(eventoAtual.dataInicioInscricao).toLocaleDateString('pt-BR') : '—';
        const fim = eventoAtual.dataFimInscricao ? new Date(eventoAtual.dataFimInscricao).toLocaleDateString('pt-BR') : '—';
        document.getElementById('insc-periodo').textContent = `Inscrições: ${ini} até ${fim}`;

        if (anexosAtuais.length > 0) {
            document.getElementById('insc-anexos').innerHTML = anexosAtuais
                .filter(a => a.arquivo)
                .map(a => `<a class="insc-anexo" href="${escapeHtml(a.arquivo)}" target="_blank"><i class="fas ${TIPOS_ANEXO_ICON[a.tipo] || 'fa-paperclip'}"></i> ${escapeHtml(labelDoAnexo(a))}</a>`)
                .join('');
        }

        const badge = document.getElementById('insc-status-badge');
        if (eventoAtual.inscricaoAberta) {
            badge.innerHTML = '<span class="insc-status-aberto"><i class="fas fa-check-circle"></i> Inscrições Abertas</span>';
        } else {
            badge.innerHTML = '<span class="insc-status-fechado"><i class="fas fa-lock"></i> Inscrições Fechadas</span>';
        }

        // 🔥 2) Revela o container principal
        document.getElementById('insc-conteudo').classList.remove('ev-hidden');

        // 🔥 3) DECISÃO DE TELA (uma única escolha)
        let telaDefinida = false;

        if (getToken() && !eventoAtual.permiteMultiplasInscricoes) {
            const jaInscrito = await verificarInscricaoExistente();
            if (jaInscrito) telaDefinida = true;
        }

        if (!telaDefinida) {
            if (getToken()) {
                renderizarTelaLogado();
            } else {
                mostrarTelaLogin();
            }
        }

        bindLgpd();
    } catch (err) {
        const erro = document.getElementById('erro-slug');
        if (erro) { erro.classList.remove('ev-hidden'); erro.textContent = '⚠️ ' + err.message; }
    }
}

async function verificarInscricaoExistente() {
    if (!getToken() || !eventoAtual) return false;
    if (eventoAtual.permiteMultiplasInscricoes) return false;

    if (eventoAtual._jaInscritoInfo?.jaInscrito) {
        mostrarTelaProtocolo(eventoAtual._jaInscritoInfo.protocolo, eventoAtual._jaInscritoInfo.status);
        return true;
    }

    try {
        const data = await api(INSC_API.minhasInscricoes, { method: 'GET' }, true);
        const lista = data.inscricoes || [];
        const inscricao = lista.find(i => i.evento?.slug === eventoAtual.slug);
        if (inscricao) {
            mostrarTelaProtocolo(inscricao.protocolo, inscricao.status);
            return true;
        }
    } catch (e) { console.warn('Erro verificando inscrição:', e.message); }
    return false;
}

function renderizarTelaLogado() {
    mostrarTelaLogado();
    if (perfilParticipante) {
        document.getElementById('perfil-nome').textContent = perfilParticipante.nomeCompleto || 'Professor';
        document.getElementById('perfil-instituicao').textContent = perfilParticipante.instituicao || 'Instituição não informada';
        document.getElementById('perfil-funcao').textContent = perfilParticipante.funcao || '—';
    }
    if (!eventoAtual.inscricaoAberta) {
        document.getElementById('campos-inscricao').innerHTML = `<div class="ev-alert ev-alert-error" style="margin-top:12px;">🚫 Inscrições encerradas ou vagas esgotadas.</div>`;
        document.getElementById('btn-inscrever').disabled = true;
        return;
    }
    document.getElementById('btn-inscrever').disabled = false;
    passoAtual = 1;
    dadosSalvos = {};
    renderizarWizard();
    bindLgpd();
}

// ============================================================
// WIZARD
// ============================================================
function renderizarWizard() {
    const container = document.getElementById('campos-inscricao');
    container.innerHTML = '';

    if (totalPassos > 1) {
        let barras = '<div class="ev-progress-bar">';
        for (let i = 1; i <= totalPassos; i++) {
            barras += `<div style="background:${passoAtual >= i ? 'var(--ev-primary)' : '#e2e8f0'};"></div>`;
        }
        barras += '</div>';
        container.insertAdjacentHTML('beforeend', barras);
    }

    const tituloEtapa = passoAtual === 1 ? 'Passo 1: Dados do Professor' : 'Passo 2: Estudantes e Autorizações';
    container.insertAdjacentHTML('beforeend', `<h3 style="margin-bottom:16px;color:#1e293b;font-size:18px;">${tituloEtapa}</h3>`);

    const divConteudo = document.createElement('div');
    container.appendChild(divConteudo);

    if (passoAtual === 1) {
        renderizarPasso1(divConteudo);
        if (totalPassos === 1) renderizarAssinaturasFinais(divConteudo);
    } else {
        renderizarPasso2(divConteudo);
    }

    const divBotoes = document.createElement('div');
    divBotoes.style.cssText = 'margin-top:24px;display:flex;justify-content:space-between;align-items:center;';

    if (passoAtual > 1) {
        divBotoes.innerHTML += `<button type="button" class="ev-btn ev-btn-secondary" id="btn-voltar-passo"><i class="fas fa-arrow-left"></i> Voltar</button>`;
    } else {
        divBotoes.innerHTML += `<div></div>`;
    }

    const blocoLgpd = document.getElementById('insc-lgpd-confirmo')?.closest('.ev-form-group');
    const btnInscrever = document.getElementById('btn-inscrever');

    if (passoAtual < totalPassos) {
        divBotoes.innerHTML += `<button type="button" class="ev-btn ev-btn-primary" id="btn-avancar-passo">Avançar <i class="fas fa-arrow-right"></i></button>`;
        if (blocoLgpd) blocoLgpd.style.display = 'none';
        if (btnInscrever) btnInscrever.style.display = 'none';
    } else {
        divBotoes.innerHTML += `<div></div>`;
        if (blocoLgpd) blocoLgpd.style.display = 'flex';
        if (btnInscrever) btnInscrever.style.display = 'inline-block';
    }

    container.appendChild(divBotoes);

    document.getElementById('btn-avancar-passo')?.addEventListener('click', () => {
        let valido = true;
        divConteudo.querySelectorAll('input[required], select[required]').forEach(el => {
            if (!el.value.trim()) { valido = false; el.style.borderColor = 'red'; }
            else { el.style.borderColor = '#cbd5e1'; }
        });
        if (!valido) return alert('Preencha todos os campos obrigatórios do passo atual.');

        for (let i = 0; i < anexosAtuais.length; i++) {
            const a = anexosAtuais[i];
            if (a.solicitaAnexo && a.anexoSolicitacaoObrigatorio) {
                const noPassoAtual = passoAtual === 1 ? ehAnexoProfessor(a) : ehAnexoPasso2(a);
                if (noPassoAtual && (!anexosParticipanteState[i] || !anexosParticipanteState[i].arquivo)) {
                    return alert(`Anexo obrigatório não enviado: ${a.labelSolicitacaoAnexo || labelDoAnexo(a)}`);
                }
            }
        }
        salvarDadosAtuais();
        passoAtual++;
        renderizarWizard();
        bindLgpd();
    });

    document.getElementById('btn-voltar-passo')?.addEventListener('click', () => {
        salvarDadosAtuais();
        passoAtual--;
        renderizarWizard();
        bindLgpd();
    });

    configurarAutoPreenchimentoCEP();
    aplicarMascaras();
    configurarRelacaoSelect();
    bindLgpd();
}

function salvarDadosAtuais() {
    document.querySelectorAll('.campo-insc').forEach(el => {
        const label = el.dataset.label;
        if (!label) return;
        if (el.tagName === 'DIV' && el.classList.contains('serie-checkboxes-container')) {
            const checkboxes = el.querySelectorAll('input[type="checkbox"]:checked');
            dadosSalvos[label] = Array.from(checkboxes).map(cb => cb.value).join(', ');
        } else {
            dadosSalvos[label] = el.value;
        }
    });
    document.querySelectorAll('[data-extra-relacao]').forEach(el => {
        const label = el.dataset.extraRelacao;
        if (label) dadosSalvos[`${label}__nome`] = el.value;
    });
}

function renderizarPasso1(container) {
    const anexosProfessor = anexosAtuais.filter(ehAnexoProfessor);
    if (anexosProfessor.length === 0) {
        container.innerHTML = '<p class="ev-alert ev-alert-info">Nenhum dado do professor a ser preenchido no modelo.</p>';
        return;
    }
    anexosProfessor.forEach((anexo) => {
        const originalIdx = anexosAtuais.indexOf(anexo);
        container.appendChild(renderizarCardAnexoProfessor(anexo, originalIdx));
    });
}

function renderizarCardAnexoProfessor(anexo, originalIdx) {
    const titulo = labelDoAnexo(anexo);
    const icone = TIPOS_ANEXO_ICON[anexo.tipo] || 'fa-paperclip';
    const card = document.createElement('div');
    card.style.cssText = 'background:white;padding:24px;border-radius:12px;border:1px solid var(--ev-border);box-shadow:0 2px 8px rgba(0,0,0,0.03);margin-bottom:20px;';
    card.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #f1f5f9;">
            <div style="background:#eff6ff;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--ev-primary);"><i class="fas ${icone}"></i></div>
            <div><h4 style="margin:0;font-size:18px;color:#1e293b;">${escapeHtml(titulo)}</h4><p style="margin:2px 0 0;font-size:13px;color:#64748b;">Preencha os dados do professor e do projeto.</p></div>
        </div>
    `;

    let perfilSalvo = {};
    try { perfilSalvo = JSON.parse(localStorage.getItem(CHAVE_USER) || '{}'); } catch(e) {}

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px 16px;margin-bottom:24px;';

    const criarCampo = (campo, valorAuto, isFirst) => {
        const div = document.createElement('div');
        div.className = 'ev-form-group';
        div.style.marginBottom = '0';
        const lLower = norm(campo.label);
        if (isFirst || campo.tipo === 'textarea' || lLower.includes('e-mail') || lLower.includes('email') || lLower.includes('instituicao') || lLower.includes('endereco')) {
            div.style.gridColumn = '1 / -1';
        }
        let inputHtml = gerarInput(campo, valorAuto, false);
        if (campo.obrigatorio) {
            inputHtml = inputHtml.replace('<input ', '<input required ');
            inputHtml = inputHtml.replace('<select ', '<select required ');
        }
        div.innerHTML = `<label style="font-size:13px;font-weight:600;color:#334155;margin-bottom:6px;display:block;">${escapeHtml(campo.label)}${campo.obrigatorio ? ' <span style="color:#ef4444;">*</span>' : ''}</label>${inputHtml}`;
        return div;
    };

    const getAutoValor = (labelLower) => {
        if (labelLower.includes('nascimento')) return null;
        if (labelLower.includes('nome') && perfilSalvo.nomeCompleto) return perfilSalvo.nomeCompleto;
        if (labelLower.includes('cpf') && perfilSalvo.cpf) return perfilSalvo.cpf;
        if (labelLower.includes('rg') && perfilSalvo.rg) return perfilSalvo.rg;
        if (labelLower.includes('telefone') && perfilSalvo.telefone) return perfilSalvo.telefone;
        if ((labelLower.includes('e-mail') || labelLower.includes('email')) && perfilSalvo.email) return perfilSalvo.email;
        if (labelLower.includes('instituicao') && perfilSalvo.instituicao) return perfilSalvo.instituicao;
        if ((labelLower.includes('funcao') || labelLower.includes('cargo')) && perfilSalvo.funcao) return perfilSalvo.funcao;
        if (labelLower.includes('serie') && perfilSalvo.serieEstudantes) return perfilSalvo.serieEstudantes;
        return null;
    };

    const campos = anexo.campos || [];
    const camposProfessor = [];
    const camposProjeto = [];
    campos.forEach(campo => {
        const l = norm(campo.label);
        if (campo.tipo === 'date' && (l.includes('data da assinatura') || l === 'data')) return;
        if (l.includes('titulo do projeto') || l.includes('descricao do projeto') || l === 'titulo' || l === 'descricao') {
            camposProjeto.push(campo);
        } else {
            camposProfessor.push(campo);
        }
    });

    camposProfessor.forEach((campo, idx) => {
        const l = norm(campo.label);
        const ehNascimento = l.includes('nascimento');
        const valorAuto = ehNascimento ? null : (dadosSalvos[campo.label] || getAutoValor(l));
        grid.appendChild(criarCampo(campo, valorAuto, idx === 0));
    });
    card.appendChild(grid);

    if (camposProjeto.length > 0) {
        const sep = document.createElement('div');
        sep.style.cssText = 'margin-top:16px;margin-bottom:16px;border-top:2px dashed #e2e8f0;';
        sep.innerHTML = `<h5 style="margin:-10px auto 16px;background:white;width:fit-content;padding:0 10px;color:#64748b;font-size:13px;font-weight:600;">Informações do Projeto</h5>`;
        card.appendChild(sep);
        const gridProj = document.createElement('div');
        gridProj.style.cssText = 'display:flex;flex-direction:column;gap:16px;margin-bottom:24px;';
        camposProjeto.forEach(campo => gridProj.appendChild(criarCampo(campo, dadosSalvos[campo.label] || null, false)));
        card.appendChild(gridProj);
    }

    if (anexo.solicitaAnexo) {
        const sep = document.createElement('div');
        sep.style.cssText = 'margin-top:16px;margin-bottom:16px;border-top:2px dashed #e2e8f0;';
        sep.innerHTML = `<h5 style="margin:-10px auto 16px;background:white;width:fit-content;padding:0 10px;color:#64748b;font-size:13px;font-weight:600;">Documentos</h5>`;
        card.appendChild(sep);
        card.appendChild(renderizarBlocoAnexoParticipante(anexo, originalIdx));
    }
    return card;
}

function renderizarAssinaturasFinais(container) {
    const anexosComAss = anexosAtuais.filter(a => !ehAvaliativo(a) && !ehEstudante(a) && a.exigeAssinatura);
    if (anexosComAss.length === 0) return;
    const div = document.createElement('div');
    div.style.cssText = 'margin-top:32px;padding:24px;background:#fffbeb;border:1px solid #fde68a;border-radius:12px;';
    let html = `<h4 style="margin:0 0 16px;font-size:16px;color:#92400e;"><i class="fas fa-signature"></i> Assinaturas Obrigatórias do Professor</h4>`;
    anexosComAss.forEach((anexo) => {
        const originalIdx = anexosAtuais.indexOf(anexo);
        html += `<div style="margin-bottom:20px;background:white;padding:16px;border-radius:8px;border:1px solid #fcd34d;"><h5 style="margin:0 0 12px;font-size:14px;color:#1e293b;">${escapeHtml(labelDoAnexo(anexo))}</h5><div id="container-assinatura-final-${originalIdx}"></div></div>`;
    });
    div.innerHTML = html;
    container.appendChild(div);
    anexosComAss.forEach((anexo) => {
        const originalIdx = anexosAtuais.indexOf(anexo);
        const c = document.getElementById(`container-assinatura-final-${originalIdx}`);
        if (c) c.appendChild(renderizarBlocoAssinatura(anexo, originalIdx));
    });
}

function renderizarPasso2(container) {
    const anexosPasso2 = anexosAtuais.filter(ehAnexoPasso2);
    if (anexosPasso2.length === 0) {
        container.innerHTML = '<p class="ev-alert ev-alert-info">Nenhuma autorização ou dado de estudante pendente.</p>';
        return;
    }
    anexosPasso2.forEach((anexo) => {
        const originalIdx = anexosAtuais.indexOf(anexo);
        const titulo = labelDoAnexo(anexo);
        const icone = TIPOS_ANEXO_ICON[anexo.tipo] || 'fa-paperclip';
        const card = document.createElement('div');
        card.style.cssText = 'margin-bottom:32px;border:1px solid var(--ev-border);border-radius:12px;overflow:hidden;background:white;box-shadow:0 4px 12px rgba(0,0,0,0.05);';
        card.innerHTML = `<div style="padding:16px;background:#f8fafc;"><h4 style="margin:0;font-size:15px;color:var(--ev-primary);"><i class="fas ${icone}"></i> ${escapeHtml(titulo)}</h4></div>`;
        const body = document.createElement('div');
        body.style.padding = '20px';
        const cabecalho = camposCabecalho(anexo);
        const porAluno = camposPorAluno(anexo);
        const max = anexo.maxRepeticoes || 10;
        const isEstudante = ehEstudante(anexo);

        if (cabecalho.length > 0) {
            const divCab = document.createElement('div');
            divCab.style.cssText = 'margin-bottom:24px;padding-bottom:16px;border-bottom:2px dashed #e2e8f0;';
            const gridCab = document.createElement('div');
            gridCab.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;';
            cabecalho.forEach(campo => {
                const lLower = norm(campo.label);
                const valorSalvo = dadosSalvos[campo.label] || null;
                let inputHtml = gerarInput(campo, valorSalvo, false);
                if (campo.obrigatorio) inputHtml = inputHtml.replace('<input ', '<input required ');
                const div = document.createElement('div');
                div.className = 'ev-form-group'; div.style.marginBottom = '0';
                if (campo.tipo === 'textarea' || lLower.includes('endereco')) div.style.gridColumn = '1 / -1';
                div.innerHTML = `<label style="font-size:13px;font-weight:600;color:#334155;">${escapeHtml(campo.label)}${campo.obrigatorio ? ' *' : ''}</label>${inputHtml}`;
                gridCab.appendChild(div);
            });
            divCab.appendChild(gridCab);
            body.appendChild(divCab);
        }

        const wrap = document.createElement('div');
        wrap.style.cssText = 'background:#f8fafc;padding:16px;border-radius:10px;border:1px dashed #cbd5e1;';

        const renderizarItens = () => {
            const itensHtml = [];
            const total = estadoRepeticoes[originalIdx].quantidade;
            for (let i = 0; i < total; i++) {
                let camposHtml = '';
                if (isEstudante) {
                    camposHtml = porAluno.map((c, cIdx) => {
                        const labelResp = `${c.label}_Aluno_${i}`;
                        const lLowerC = norm(c.label);
                        const ehNasc = lLowerC.includes('nascimento');
                        const valorSalvo = ehNasc ? null : (dadosSalvos[labelResp] || null);
                        const inputHtml = gerarInput(c, valorSalvo, false).replace(`data-label="${escapeHtml(c.label)}"`, `data-label="${escapeHtml(labelResp)}"`);
                        let colSpan = 'span 1';
                        if (cIdx === 0 || c.tipo === 'textarea' || lLowerC.includes('endereco') || lLowerC.includes('rua') || lLowerC.includes('nome')) colSpan = '1 / -1';
                        return `<div class="ev-form-group" style="margin-bottom:0;grid-column:${colSpan};"><label style="font-size:12px;font-weight:600;color:#475569;">${escapeHtml(c.label)}${c.obrigatorio ? ' *' : ''}</label>${inputHtml}</div>`;
                    }).join('');
                } else {
                    camposHtml = porAluno.map(c => {
                        const key = `Estudante[${i}].${c.label}`;
                        const lLowerC = norm(c.label);
                        const ehNasc = lLowerC.includes('nascimento');
                        const valorSalvo = ehNasc ? null : (dadosSalvos[key] || null);
                        return `<div class="ev-form-group" style="margin-bottom:0;"><label style="font-size:12px;font-weight:600;color:#1e293b;">${escapeHtml(c.label)}${c.obrigatorio ? ' *' : ''}</label>${gerarInputComGrupo(c, 'Estudante', i, valorSalvo)}</div>`;
                    }).join('');
                }
                let blocoAss = '';
                if (anexo.exigeAssinatura) {
                    const wrapAss = document.createElement('div');
                    wrapAss.appendChild(renderizarBlocoAssinaturaPorAluno(anexo, originalIdx, i));
                    blocoAss = wrapAss.innerHTML;
                }
                itensHtml.push(`
                    <div class="item-repetivel" data-idx="${i}" style="background:white;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:16px;overflow:hidden;">
                        <div class="header-aluno" style="padding:16px;background:#f1f5f9;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
                            <div style="font-size:15px;font-weight:700;color:#0ea5e9;"><i class="fas fa-user-shield"></i> ${isEstudante ? 'Responsável pelo Aluno' : 'Estudante'} ${i + 1}</div>
                            <i class="fas fa-chevron-down" style="color:#64748b;transition:transform 0.2s;"></i>
                        </div>
                        <div class="body-aluno" style="display:none;padding:20px;">
                            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:16px;">${camposHtml}</div>
                            ${blocoAss}
                        </div>
                    </div>
                `);
            }
            wrap.innerHTML = `
                ${porAluno.length > 0 && !cabecalho.length ? `<div style="display:flex;justify-content:space-between;margin-bottom:16px;"><strong>${isEstudante ? 'Alunos' : 'Itens'}</strong><div><button type="button" class="ev-btn ev-btn-secondary ev-btn-sm" data-add-rep>+ Adicionar</button><button type="button" class="ev-btn ev-btn-danger ev-btn-sm" data-rem-rep>- Remover</button></div></div>` : ''}
                <div class="itens-repetiveis">${itensHtml.join('')}</div>
            `;
            wrap.querySelectorAll('.header-aluno').forEach(h => {
                h.addEventListener('click', () => {
                    const b = h.nextElementSibling;
                    const ic = h.querySelector('.fa-chevron-down');
                    if (b.style.display === 'none' || !b.style.display) { b.style.display = 'block'; if (ic) ic.style.transform = 'rotate(180deg)'; }
                    else { b.style.display = 'none'; if (ic) ic.style.transform = 'rotate(0deg)'; }
                });
            });
            wrap.querySelector('[data-add-rep]')?.addEventListener('click', () => {
                if (estadoRepeticoes[originalIdx].quantidade < max) { estadoRepeticoes[originalIdx].quantidade++; renderizarItens(); }
            });
            wrap.querySelector('[data-rem-rep]')?.addEventListener('click', () => {
                if (estadoRepeticoes[originalIdx].quantidade > 1) { estadoRepeticoes[originalIdx].quantidade--; renderizarItens(); }
            });
            configurarAutoPreenchimentoCEP(); aplicarMascaras(); configurarRelacaoSelect();
        };
        renderizarItens();
        body.appendChild(wrap);
        if (anexo.solicitaAnexo) body.appendChild(renderizarBlocoAnexoParticipante(anexo, originalIdx));
        card.appendChild(body);
        container.appendChild(card);
    });
    renderizarAssinaturasFinais(container);
}

function configurarRelacaoSelect() {
    document.querySelectorAll('select[data-relacao-select]').forEach(select => {
        select.onchange = null;
        select.addEventListener('change', function () {
            const nome = this.dataset.relacaoSelect;
            const extras = document.querySelectorAll(`[data-extra-relacao="${nome}"]`);
            const isResp = this.value === 'RESPONSÁVEL LEGAL';
            extras.forEach(el => { el.style.display = isResp ? 'block' : 'none'; if (!isResp) el.value = ''; });
        });
        if (select.value === 'RESPONSÁVEL LEGAL') {
            const nome = select.dataset.relacaoSelect;
            document.querySelectorAll(`[data-extra-relacao="${nome}"]`).forEach(el => el.style.display = 'block');
        }
    });
}

// ============================================================
// INPUTS
// ============================================================
function gerarInput(campo, valorAuto, readonly) {
    const cls = 'campo-insc';
    const ro = readonly ? 'readonly style="background:#f3f4f6;cursor:not-allowed;"' : '';
    let val = valorAuto || '';
    const placeholder = escapeHtml(campo.placeholder || '');
    const label = escapeHtml(campo.label);
    const labelLower = norm(campo.label);
    if (campo.tipo === 'date') { if (!val && !labelLower.includes('nascimento')) val = dataHojeISO(); }
    if (labelLower.includes('relacao') && labelLower.includes('representante')) {
        const opcoes = ['PAI', 'MÃE', 'RESPONSÁVEL LEGAL'];
        const optsHtml = opcoes.map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('');
        const valorExtra = dadosSalvos[`${campo.label}__nome`] || '';
        return `<div class="relacao-wrapper"><select class="${cls}" data-label="${label}" data-relacao-select="${escapeHtml(campo.label)}" ${ro}><option value="">Selecione...</option>${optsHtml}</select><input type="text" class="extra-relacao-nome ${cls}" data-extra-relacao="${escapeHtml(campo.label)}" data-label="${label} (Nome)" placeholder="Nome do responsável" value="${escapeHtml(valorExtra)}" style="display:none;margin-top:8px;width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;" ${ro}></div>`;
    }
    if (labelLower.includes('funcao') || labelLower.includes('cargo')) return `<input type="text" class="${cls}" data-label="${label}" value="${escapeHtml(val)}" placeholder="Ex: Professor(a) de Biologia" ${ro}>`;
    if (campo.tipo === 'textarea') return `<textarea class="${cls}" data-label="${label}" placeholder="${placeholder}" ${ro}>${escapeHtml(val)}</textarea>`;
    if (campo.tipo === 'date') return `<input type="date" class="${cls}" data-label="${label}" value="${escapeHtml(val)}" ${ro}>`;
    if (campo.tipo === 'number') return `<input type="number" class="${cls} mascara-numeros" data-label="${label}" value="${escapeHtml(val)}" placeholder="${placeholder}" ${ro}>`;
    if (campo.tipo === 'email') return `<input type="email" class="${cls}" data-label="${label}" value="${escapeHtml(val)}" placeholder="${placeholder}" ${ro}>`;
    if (campo.tipo === 'tel') return `<input type="tel" class="${cls} mascara-numeros" data-label="${label}" value="${escapeHtml(val)}" placeholder="${placeholder}" ${ro}>`;
    if (campo.tipo === 'cpf' || labelLower.includes('cpf')) return `<input type="text" maxlength="14" class="${cls} mascara-cpf" data-label="${label}" value="${escapeHtml(val)}" placeholder="000.000.000-00" ${ro}>`;
    if (campo.tipo === 'rg' || labelLower.includes('rg') || labelLower.includes('identidade')) return `<input type="text" class="${cls} mascara-numeros" data-label="${label}" value="${escapeHtml(val)}" placeholder="Apenas números" ${ro}>`;
    if (labelLower === 'estado civil') {
        const opcoes = ['Solteiro(a)', 'Casado(a)', 'Divorciado(a)', 'Viúvo(a)', 'Separado(a)', 'União Estável'];
        const optsHtml = opcoes.map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('');
        return `<select class="${cls}" data-label="${label}" ${ro}><option value="">Selecione...</option>${optsHtml}</select>`;
    }
    if (labelLower.includes('serie') || labelLower.includes('ano escolar') || labelLower.includes('ano do ensino') || labelLower.includes('escolaridade')) {
        return `<div class="${cls} serie-checkboxes-container" data-label="${label}" style="display:flex;gap:12px;flex-wrap:wrap;padding:10px;background:white;border:1px solid #cbd5e1;border-radius:6px;">${OPCOES_SERIE_ESTUDANTE.map(o => `<label style="display:flex;align-items:center;gap:4px;font-size:13px;font-weight:normal;cursor:pointer;"><input type="checkbox" class="serie-checkbox" value="${escapeHtml(o)}" ${val && val.includes(o) ? 'checked' : ''} ${ro}> ${escapeHtml(o)}</label>`).join('')}</div>`;
    }
    if (labelLower.includes('cep')) return `<input type="text" maxlength="9" class="${cls} mascara-cep input-cep" data-label="${label}" value="${escapeHtml(val)}" placeholder="00000-000" ${ro}>`;
    if (labelLower.includes('numero') || labelLower.includes('nº')) return `<input type="text" class="${cls} mascara-numeros" data-label="${label}" value="${escapeHtml(val)}" placeholder="Apenas números" ${ro}>`;
    if (campo.tipo === 'select') {
        const opts = (campo.opcoes || []).map(o => `<option value="${escapeHtml(o)}" ${val === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('');
        return `<select class="${cls}" data-label="${label}" ${ro}><option value="">Selecione...</option>${opts}</select>`;
    }
    return `<input type="text" class="${cls}" data-label="${label}" value="${escapeHtml(val)}" placeholder="${placeholder}" ${ro}>`;
}

function gerarInputComGrupo(campo, grupo, idx, valorSalvo) {
    const key = `${grupo}[${idx}].${campo.label}`;
    const dataAttr = `data-label="${escapeHtml(key)}"`;
    const cls = 'campo-insc campo-repetivel';
    const label = escapeHtml(campo.label);
    const labelLower = norm(campo.label);
    let val = valorSalvo || '';
    if (labelLower.includes('relacao') && labelLower.includes('representante')) {
        const opcoes = ['PAI', 'MÃE', 'RESPONSÁVEL LEGAL'];
        const optsHtml = opcoes.map(o => `<option value="${o}" ${val === o ? 'selected' : ''}>${o}</option>`).join('');
        return `<div class="relacao-wrapper"><select class="${cls}" ${dataAttr} data-relacao-select="${key}"><option value="">Selecione...</option>${optsHtml}</select><input type="text" class="extra-relacao-nome ${cls}" data-extra-relacao="${key}" data-label="${key} (Nome)" placeholder="Nome do responsável" style="display:none;margin-top:8px;width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:6px;"></div>`;
    }
    if (campo.tipo === 'date') { if (!val && !labelLower.includes('nascimento')) val = dataHojeISO(); return `<input type="date" class="${cls}" ${dataAttr} value="${escapeHtml(val)}">`; }
    if (campo.tipo === 'number') return `<input type="number" class="${cls} mascara-numeros" ${dataAttr} value="${escapeHtml(val)}">`;
    if (campo.tipo === 'email') return `<input type="email" class="${cls}" ${dataAttr} value="${escapeHtml(val)}">`;
    if (campo.tipo === 'tel') return `<input type="tel" class="${cls} mascara-numeros" ${dataAttr} value="${escapeHtml(val)}">`;
    if (campo.tipo === 'cpf' || labelLower.includes('cpf')) return `<input type="text" maxlength="14" class="${cls} mascara-cpf" ${dataAttr} value="${escapeHtml(val)}" placeholder="000.000.000-00">`;
    if (campo.tipo === 'rg') return `<input type="text" class="${cls} mascara-numeros" ${dataAttr} value="${escapeHtml(val)}">`;
    if (labelLower.includes('serie') || labelLower.includes('ano escolar') || labelLower.includes('ano do ensino')) {
        return `<div class="${cls} serie-checkboxes-container" ${dataAttr} style="display:flex;gap:12px;flex-wrap:wrap;padding:10px;background:white;border:1px solid #cbd5e1;border-radius:6px;">${OPCOES_SERIE_ESTUDANTE.map(o => `<label style="display:flex;align-items:center;gap:4px;font-size:13px;font-weight:normal;cursor:pointer;"><input type="checkbox" class="serie-checkbox" value="${escapeHtml(o)}" ${val.includes(o) ? 'checked' : ''}> ${escapeHtml(o)}</label>`).join('')}</div>`;
    }
    if (labelLower.includes('cep')) return `<input type="text" maxlength="9" class="${cls} mascara-cep input-cep" ${dataAttr} value="${escapeHtml(val)}" placeholder="00000-000">`;
    if (campo.tipo === 'select') {
        const opts = (campo.opcoes || []).map(o => `<option value="${escapeHtml(o)}" ${val === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('');
        return `<select class="${cls}" ${dataAttr}><option value="">Selecione...</option>${opts}</select>`;
    }
    return `<input type="text" class="${cls}" ${dataAttr} value="${escapeHtml(val)}" placeholder="Digite o ${label}">`;
}

function aplicarMascaras() {
    document.querySelectorAll('.mascara-numeros').forEach(input => {
        input.oninput = null;
        input.addEventListener('input', function() { this.value = this.value.replace(/[^0-9.,\/-]/g, ''); });
    });
    document.querySelectorAll('.mascara-cpf').forEach(input => {
        input.oninput = null;
        input.addEventListener('input', function() {
            this.value = formatarCPF(this.value);
            const valido = validarCPF(this.value);
            this.style.borderColor = this.value.replace(/\D/g,'').length === 11 ? (valido ? '#10b981' : '#dc2626') : '#cbd5e1';
        });
    });
    document.querySelectorAll('.mascara-cep').forEach(input => {
        input.oninput = null;
        input.addEventListener('input', function() {
            this.value = formatarCEP(this.value);
            const digitos = this.value.replace(/\D/g,'');
            this.style.borderColor = digitos.length === 8 ? '#10b981' : '#cbd5e1';
        });
    });
}

function configurarAutoPreenchimentoCEP() {
    document.querySelectorAll('.input-cep').forEach(inputCep => {
        inputCep.onblur = null;
        inputCep.addEventListener('blur', async function() {
            const cep = this.value.replace(/\D/g, '');
            if (cep.length !== 8) return;
            this.value = formatarCEP(cep);
            const data = await buscarCEP(cep);
            if (!data) { this.style.borderColor = '#dc2626'; return; }
            this.style.borderColor = '#10b981';
            const preencher = (pred, valor) => {
                if (!valor) return;
                document.querySelectorAll('.campo-insc').forEach(el => {
                    const label = norm(el.dataset.label || '');
                    if (pred(label) && el.tagName !== 'SELECT') {
                        el.value = valor;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                });
            };
            preencher(l => l.includes('rua') || l.includes('logradouro') || (l.includes('endereco') && !l.includes('numero')), data.logradouro);
            preencher(l => l.includes('bairro'), data.bairro);
            preencher(l => l.includes('cidade') || l.includes('municipio'), data.localidade);
            preencher(l => (l.includes('estado') && !l.includes('civil')) || l === 'uf', data.uf);
        });
    });
}

// ============================================================
// BLOCO ASSINATURA
// ============================================================
function renderizarBlocoAssinatura(anexo, aIdx) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:12px;background:#fef3c7;border:2px solid #f59e0b;border-radius:10px;margin-top:16px;';
    wrap.id = `bloco-assinatura-${aIdx}`;
    const atual = assinaturasCapturadas[`assinatura-${aIdx}`];
    if (atual && atual.base64) {
        wrap.innerHTML = `<div style="display:flex;align-items:center;gap:8px;color:#065f46;"><i class="fas fa-check-circle" style="font-size:20px;"></i><strong style="font-size:13px;">Assinatura capturada!</strong></div><div style="background:white;border-radius:8px;padding:10px;margin-top:10px;text-align:center;"><img src="${atual.base64}" alt="Assinatura" style="max-height:80px;max-width:100%;"></div><button type="button" class="ev-btn ev-btn-secondary ev-btn-sm" style="margin-top:10px;" onclick="refazerAssinaturaAnexo(${aIdx})"><i class="fas fa-redo"></i> Refazer</button>`;
        return wrap;
    }
    const titulo = labelDoAnexo(anexo);
    wrap.innerHTML = `<div style="display:flex;align-items:center;gap:8px;color:#78350f;"><i class="fas fa-signature" style="font-size:18px;"></i><div><strong style="font-size:13px;">Assinatura obrigatória</strong><p style="margin:2px 0 0;font-size:11px;">Assine "${escapeHtml(titulo)}"</p></div></div><div style="margin-top:12px;"><button type="button" class="ev-btn ev-btn-primary ev-btn-sm" onclick="abrirModalAssinaturaQR(${aIdx}, null)"><i class="fas fa-qrcode"></i> Ler e assinar</button></div>`;
    return wrap;
}

function renderizarBlocoAssinaturaPorAluno(anexo, aIdx, alunoIdx) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:12px;background:#fef3c7;border:2px solid #f59e0b;border-radius:10px;margin-top:16px;';
    wrap.id = `bloco-assinatura-${aIdx}-${alunoIdx}`;
    const atual = assinaturasCapturadas[`assinatura-${aIdx}-${alunoIdx}`];
    if (atual && atual.base64) {
        wrap.innerHTML = `<div style="display:flex;align-items:center;gap:8px;color:#065f46;"><i class="fas fa-check-circle" style="font-size:20px;"></i><strong style="font-size:13px;">Assinatura capturada!</strong></div><div style="background:white;border-radius:8px;padding:10px;margin-top:10px;text-align:center;"><img src="${atual.base64}" alt="Assinatura" style="max-height:80px;max-width:100%;"></div><button type="button" class="ev-btn ev-btn-secondary ev-btn-sm" style="margin-top:10px;" onclick="refazerAssinaturaAnexoAluno(${aIdx}, ${alunoIdx})"><i class="fas fa-redo"></i> Refazer</button>`;
        return wrap;
    }
    const titulo = labelDoAnexo(anexo);
    wrap.innerHTML = `<div style="display:flex;align-items:center;gap:8px;color:#78350f;"><i class="fas fa-signature" style="font-size:18px;"></i><div><strong style="font-size:13px;">Assinatura (Aluno ${alunoIdx + 1})</strong><p style="margin:2px 0 0;font-size:11px;">Assine "${escapeHtml(titulo)}"</p></div></div><div style="margin-top:12px;"><button type="button" class="ev-btn ev-btn-primary ev-btn-sm" onclick="abrirModalAssinaturaQR(${aIdx}, ${alunoIdx})"><i class="fas fa-qrcode"></i> Ler e assinar</button></div>`;
    return wrap;
}

function copiarLinkAssinatura(url) {
    const mostrar = (m, t = 'success') => mostrarToastGlobal(m, t);
    const fallback = () => {
        const ta = document.createElement('textarea'); ta.value = url;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); mostrar('Link copiado!'); }
        catch (e) { mostrar('Não foi possível copiar.', 'warning'); prompt('Copie:', url); }
        document.body.removeChild(ta);
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(url).then(() => mostrar('Link copiado!')).catch(fallback);
    else fallback();
}

// ============================================================
// MODAL DE ASSINATURA
// ============================================================
async function abrirModalAssinaturaQR(aIdx, alunoIdx) {
    salvarDadosAtuais();
    const anexo = anexosAtuais[aIdx];
    const titulo = alunoIdx !== null ? `${labelDoAnexo(anexo)} — Aluno ${alunoIdx + 1}` : labelDoAnexo(anexo);
    let camposProjeto = [], camposAluno = [], camposResponsavel = [];

    if (alunoIdx !== null) {
        camposProjeto = juntarCamposProjeto();
        camposAluno = juntarCamposAlunoComTermo(anexo, alunoIdx);
        camposResponsavel = juntarCamposResponsavel(anexo, alunoIdx);
    } else {
        const dados = obterDadosConsolidados();
        const indice = dadosDoProfessor(dados);
        const { aluno, responsavel } = camposDoAlunoEResponsavel(anexo, indice);
        camposAluno = aluno.concat(responsavel);
    }

    let tabelasHTML = '';
    if (alunoIdx !== null) {
        if (camposProjeto.length) tabelasHTML += tabelaCampos(camposProjeto, 'Dados do Projeto', 'fa-clipboard-list', '#8b5cf6');
        if (camposAluno.length) tabelasHTML += tabelaCampos(camposAluno, `Dados do Aluno ${alunoIdx + 1}`, 'fa-user-graduate', '#10b981');
        if (camposResponsavel.length) tabelasHTML += tabelaCampos(camposResponsavel, 'Dados do Responsável', 'fa-user-shield', '#f59e0b');
    } else {
        tabelasHTML += tabelaCampos(camposAluno, 'Dados do Professor / Projeto', 'fa-user-tie', '#0ea5e9');
    }

    const chaveSessao = alunoIdx !== null ? `${aIdx}-${alunoIdx}` : `${aIdx}`;
    const sessaoId = gerarUUID();
    sessoesAssinatura[chaveSessao] = { sessaoId, assinaturaBase64: null, qrCodeDataUrl: null };

    try {
        const dados = obterDadosConsolidados();
        const indice = alunoIdx !== null ? dadosDoAluno(dados, alunoIdx) : dadosDoProfessor(dados);
        const snapshot = {
            eventoNome: eventoAtual?.titulo || '',
            anexoLabel: titulo,
            alunoNome: alunoIdx !== null ? (indice['nome completo'] || indice['nome do estudante'] || '') : (dados['nome completo'] || ''),
            alunoTurma: indice['turma'] || '',
            descricao: 'Assinatura de termo de inscrição',
            participantes: [],
            dadosExibidos: {
                projeto: camposProjeto.reduce((acc, c) => ({ ...acc, [c.label]: c.valor }), {}),
                aluno: camposAluno.reduce((acc, c) => ({ ...acc, [c.label]: c.valor }), {}),
                responsavel: camposResponsavel.reduce((acc, c) => ({ ...acc, [c.label]: c.valor }), {})
            }
        };
        const resp = await api(INSC_API.criarSessao, { method: 'POST', body: JSON.stringify({ sessaoId, tipo: 'evento_termo', dadosAtendimento: snapshot }) }, false);
        if (!resp.success) throw new Error(resp.error || 'Erro ao criar sessão');

        const slug = getSlug();
        const urlAssinatura = `${window.location.origin}${window.location.pathname}?slug=${encodeURIComponent(slug)}&assinatura=${sessaoId}`;
        let qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(urlAssinatura)}`;
        try {
            const qrResp = await api('/api/qrcode/gerar', { method: 'POST', body: JSON.stringify({ url: urlAssinatura }) }, true);
            if (qrResp.success && qrResp.qrCode) qrCodeUrl = qrResp.qrCode;
        } catch (e) {}
        sessoesAssinatura[chaveSessao].qrCodeDataUrl = qrCodeUrl;
        abrirModalAssinaturaQRVisual(aIdx, alunoIdx, titulo, tabelasHTML, urlAssinatura, qrCodeUrl, anexo);
        iniciarPollingSessao(chaveSessao, sessaoId, aIdx, alunoIdx);
    } catch (e) {
        console.error('Erro ao criar sessão:', e);
        mostrarAlerta('inscricao-alert', '❌ ' + e.message, 'error');
    }
}

function abrirModalAssinaturaQRVisual(aIdx, alunoIdx, titulo, tabelasHTML, urlAssinatura, qrCodeUrl, anexo) {
    const antigo = document.getElementById('modalAssinaturaQR');
    if (antigo) antigo.remove();
    const textoTermo = (anexo?.textoArquivo || '(Sem texto legível)').replace(/\n/g, '<br>');
    const chaveQr = `qrView-${aIdx}-${alunoIdx}`;
    const chaveCanvas = `canvasView-${aIdx}-${alunoIdx}`;

    const html = `
        <div class="modal fade" id="modalAssinaturaQR" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content" style="border-radius:16px;border:none;overflow:hidden;">
                    <div class="modal-header" style="background:linear-gradient(135deg,#0ea5e9,#0284c7);color:white;border:none;padding:16px 24px;">
                        <h5 class="modal-title"><i class="fas fa-signature"></i> ${escapeHtml(titulo)}</h5>
                        <button type="button" class="btn-close btn-close-white" onclick="fecharModalAssinaturaQR()"></button>
                    </div>
                    <div class="modal-body" style="padding:20px;max-height:70vh;overflow-y:auto;">
                        <div style="background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:12px;margin-bottom:16px;font-size:12px;color:#0369a1;"><i class="fas fa-info-circle"></i> Leia o termo até o final. Depois marque "Li e aceito" para liberar a assinatura.</div>
                        ${tabelasHTML}
                        <h6 style="color:#1e293b;font-weight:700;margin:16px 0 8px 0;"><i class="fas fa-file-alt"></i> Termo</h6>
                        <div id="termoScroll" style="background:white;padding:16px;border:1px solid #e2e8f0;border-radius:8px;text-align:justify;font-family:'Times New Roman',serif;font-size:14px;line-height:1.6;max-height:200px;overflow-y:auto;margin-bottom:16px;">${textoTermo}</div>
                        <div style="background:#fffbeb;border:2px solid #fde68a;border-radius:12px;padding:16px;margin-bottom:16px;">
                            <label style="display:flex;align-items:flex-start;gap:12px;cursor:pointer;margin:0;">
                                <input type="checkbox" id="checkLiAceito" onchange="toggleAceiteTermo(this)" style="width:22px;height:22px;margin-top:2px;cursor:pointer;flex-shrink:0;">
                                <span style="font-size:14px;color:#78350f;line-height:1.4;"><strong>Li e aceito os termos acima.</strong><br><small id="avisoRole" style="color:#92400e;">Role o termo até o final para habilitar esta opção.</small></span>
                            </label>
                        </div>
                        <div id="${chaveQr}" style="text-align:center;display:none;">
                            <div style="background:#fef3c7;border-radius:12px;padding:14px;display:flex;align-items:center;gap:12px;text-align:left;margin-bottom:16px;"><div style="width:40px;height:40px;border-radius:50%;border:4px solid #f59e0b;border-top-color:transparent;animation:spin 1s linear infinite;flex-shrink:0;"></div><div><strong style="color:#92400e;">Aguardando assinatura...</strong><p style="margin:3px 0 0;font-size:13px;color:#78350f;">Peça para o responsável escanear o QR Code</p></div></div>
                            <div style="background:white;border:2px solid #e2e8f0;border-radius:16px;padding:20px;display:inline-block;"><img src="${qrCodeUrl}" alt="QR Code" style="width:240px;height:240px;display:block;"><p style="margin:12px 0 0;font-size:13px;color:#64748b;"><i class="fas fa-mobile-alt"></i> Aponte a câmera do celular</p></div>
                            <div style="margin-top:16px;"><button type="button" onclick="copiarLinkAssinatura('${urlAssinatura}')" class="ev-btn ev-btn-primary ev-btn-sm" style="width:100%;padding:12px;"><i class="fas fa-copy"></i> Copiar link de assinatura</button></div>
                            <div style="margin-top:14px;padding-top:14px;border-top:1px dashed #cbd5e1;"><p style="margin:0 0 8px;font-size:12px;color:#64748b;">Não consegue escanear?</p><button type="button" onclick="mostrarCanvasInline(${aIdx}, ${alunoIdx})" style="background:transparent;border:none;color:#0ea5e9;font-weight:600;font-size:14px;cursor:pointer;text-decoration:underline;padding:6px 10px;"><i class="fas fa-pen-fancy"></i> Assinar aqui mesmo</button></div>
                        </div>
                        <div id="${chaveCanvas}" style="display:none;">
                            <div style="background:#f0f9ff;border-radius:12px;padding:14px;margin-bottom:16px;text-align:left;"><div style="display:flex;gap:8px;"><i class="fas fa-info-circle" style="color:#0369a1;"></i><span style="font-size:13px;color:#0369a1;">Assine abaixo com o dedo ou mouse.</span></div></div>
                            <div id="canvasWrapperInline" style="position:relative;background:white;border:3px dashed #cbd5e0;border-radius:16px;overflow:hidden;height:260px;margin-bottom:14px;touch-action:none;"><canvas id="canvasInline" style="width:100%;height:100%;display:block;"></canvas><div id="placeholderInline" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:#94a3b8;pointer-events:none;width:100%;"><i class="fas fa-pen-fancy" style="font-size:28px;display:block;margin-bottom:5px;"></i><span style="font-size:13px;">Assine aqui</span></div></div>
                            <div style="display:flex;gap:10px;"><button type="button" onclick="limparCanvasInlineAssinatura()" class="ev-btn ev-btn-secondary" style="flex:1;padding:12px;border-radius:10px;"><i class="fas fa-eraser"></i> Limpar</button><button type="button" id="btnConfirmarInline" onclick="salvarAssinaturaInline(${aIdx}, ${alunoIdx})" disabled class="ev-btn ev-btn-primary" style="flex:2;padding:12px;border-radius:10px;background:#cbd5e0;cursor:not-allowed;"><i class="fas fa-check"></i> Confirmar</button></div>
                            <div style="margin-top:14px;"><button type="button" onclick="voltarParaQRCode(${aIdx}, ${alunoIdx})" style="background:transparent;border:none;color:#64748b;font-size:13px;cursor:pointer;text-decoration:underline;"><i class="fas fa-arrow-left"></i> Voltar para o QR Code</button></div>
                        </div>
                    </div>
                    <div class="modal-footer" style="display:flex;justify-content:space-between;">
                        <button type="button" class="btn btn-secondary" onclick="fecharModalAssinaturaQR()"><i class="fas fa-eye-slash"></i> Ocultar</button>
                        <button type="button" class="btn btn-danger" onclick="cancelarSessaoAssinatura(${aIdx}, ${alunoIdx})"><i class="fas fa-times"></i> Cancelar</button>
                    </div>
                </div>
            </div>
        </div>
        <style>@keyframes spin{to{transform:rotate(360deg);}}</style>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    new bootstrap.Modal(document.getElementById('modalAssinaturaQR')).show();
    setTimeout(() => {
        const termoScroll = document.getElementById('termoScroll');
        const checkLi = document.getElementById('checkLiAceito');
        const aviso = document.getElementById('avisoRole');
        if (!termoScroll || !checkLi) return;
        if (termoScroll.scrollHeight <= termoScroll.clientHeight + 10) {
            checkLi.disabled = false;
            if (aviso) aviso.textContent = 'Agora marque a caixa.';
            return;
        }
        checkLi.disabled = true;
        const check = () => {
            if (termoScroll.scrollTop + termoScroll.clientHeight >= termoScroll.scrollHeight - 10) {
                checkLi.disabled = false;
                if (aviso) aviso.textContent = 'Agora marque a caixa.';
                termoScroll.removeEventListener('scroll', check);
            }
        };
        termoScroll.addEventListener('scroll', check);
        setTimeout(() => { if (checkLi.disabled) { checkLi.disabled = false; if (aviso) aviso.textContent = 'Agora marque a caixa.'; } }, 3000);
    }, 100);
}

function toggleAceiteTermo(checkbox) {
    const qrViews = document.querySelectorAll('[id^="qrView-"]');
    const canvasViews = document.querySelectorAll('[id^="canvasView-"]');
    if (checkbox.checked) qrViews.forEach(v => v.style.display = 'block');
    else { qrViews.forEach(v => v.style.display = 'none'); canvasViews.forEach(v => v.style.display = 'none'); }
}

function fecharModalAssinaturaQR() {
    const modalEl = document.getElementById('modalAssinaturaQR');
    if (modalEl) { const m = bootstrap.Modal.getInstance(modalEl); if (m) m.hide(); setTimeout(() => modalEl.remove(), 300); }
}

let __inlineCanvasState = { ctx: null, canvas: null, wrapper: null, placeholder: null, desenhando: false, temAssinatura: false, lastX: 0, lastY: 0 };

function mostrarCanvasInline(aIdx, alunoIdx) {
    const qrView = document.getElementById(`qrView-${aIdx}-${alunoIdx}`);
    const canvasView = document.getElementById(`canvasView-${aIdx}-${alunoIdx}`);
    if (qrView) qrView.style.display = 'none';
    if (canvasView) canvasView.style.display = 'block';
    setTimeout(() => inicializarCanvasInline(), 50);
}

function voltarParaQRCode(aIdx, alunoIdx) {
    const qrView = document.getElementById(`qrView-${aIdx}-${alunoIdx}`);
    const canvasView = document.getElementById(`canvasView-${aIdx}-${alunoIdx}`);
    if (qrView) qrView.style.display = 'block';
    if (canvasView) canvasView.style.display = 'none';
}

function inicializarCanvasInline() {
    const canvas = document.getElementById('canvasInline');
    const wrapper = document.getElementById('canvasWrapperInline');
    const placeholder = document.getElementById('placeholderInline');
    if (!canvas || !wrapper) return;
    __inlineCanvasState.canvas = canvas; __inlineCanvasState.wrapper = wrapper; __inlineCanvasState.placeholder = placeholder;
    __inlineCanvasState.desenhando = false; __inlineCanvasState.temAssinatura = false;
    const rect = wrapper.getBoundingClientRect();
    if (rect.width === 0) { setTimeout(inicializarCanvasInline, 100); return; }
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px'; canvas.style.height = rect.height + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr,dpr);
    ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0ea5e9';
    __inlineCanvasState.ctx = ctx;
    const btn = document.getElementById('btnConfirmarInline');
    if (btn) { btn.disabled = true; btn.style.background = '#cbd5e0'; btn.style.cursor = 'not-allowed'; }
    const getPos = (e) => {
        const r = canvas.getBoundingClientRect();
        let cx, cy;
        if (e.touches?.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
        else if (e.changedTouches?.length > 0) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; }
        else { cx = e.clientX; cy = e.clientY; }
        return { x: cx - r.left, y: cy - r.top };
    };
    const iniciar = (e) => {
        e.preventDefault(); __inlineCanvasState.desenhando = true; __inlineCanvasState.temAssinatura = true;
        const p = getPos(e); __inlineCanvasState.lastX = p.x; __inlineCanvasState.lastY = p.y;
        if (wrapper) { wrapper.style.borderColor = '#0ea5e9'; wrapper.style.borderStyle = 'solid'; }
        if (placeholder) placeholder.style.opacity = '0';
        if (btn) { btn.disabled = false; btn.style.background = '#10b981'; btn.style.cursor = 'pointer'; }
    };
    const desenhar = (e) => {
        if (!__inlineCanvasState.desenhando) return;
        e.preventDefault();
        const p = getPos(e);
        ctx.beginPath(); ctx.moveTo(__inlineCanvasState.lastX, __inlineCanvasState.lastY); ctx.lineTo(p.x, p.y); ctx.stroke();
        __inlineCanvasState.lastX = p.x; __inlineCanvasState.lastY = p.y;
    };
    const parar = (e) => { if (e?.preventDefault) e.preventDefault(); __inlineCanvasState.desenhando = false; };
    canvas.addEventListener('touchstart', iniciar, { passive: false });
    canvas.addEventListener('touchmove', desenhar, { passive: false });
    canvas.addEventListener('touchend', parar, { passive: false });
    canvas.addEventListener('touchcancel', parar, { passive: false });
    canvas.addEventListener('mousedown', iniciar);
    canvas.addEventListener('mousemove', desenhar);
    canvas.addEventListener('mouseup', parar);
    canvas.addEventListener('mouseleave', parar);
}

function limparCanvasInlineAssinatura() {
    const canvas = __inlineCanvasState.canvas, ctx = __inlineCanvasState.ctx;
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    __inlineCanvasState.temAssinatura = false;
    if (__inlineCanvasState.placeholder) __inlineCanvasState.placeholder.style.opacity = '1';
    if (__inlineCanvasState.wrapper) { __inlineCanvasState.wrapper.style.borderColor = '#cbd5e0'; __inlineCanvasState.wrapper.style.borderStyle = 'dashed'; }
    const btn = document.getElementById('btnConfirmarInline');
    if (btn) { btn.disabled = true; btn.style.background = '#cbd5e0'; btn.style.cursor = 'not-allowed'; }
}

async function salvarAssinaturaInline(aIdx, alunoIdx) {
    if (!__inlineCanvasState.temAssinatura || !__inlineCanvasState.canvas) { mostrarAlerta('inscricao-alert', '⚠️ Assine antes de confirmar', 'error'); return; }
    const chave = alunoIdx !== null ? `${aIdx}-${alunoIdx}` : `${aIdx}`;
    const sess = sessoesAssinatura[chave];
    if (!sess || !sess.sessaoId) { mostrarAlerta('inscricao-alert', '⚠️ Sessão não encontrada', 'error'); return; }
    const btn = document.getElementById('btnConfirmarInline');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }
    try {
        const base64 = __inlineCanvasState.canvas.toDataURL('image/png');
        const resp = await api(`${INSC_API.sessao(sess.sessaoId)}/assinar`, { method: 'PUT', body: JSON.stringify({ assinaturaBase64: base64, assinanteNome: 'Responsável' }) }, false);
        if (!resp.success) throw new Error(resp.error || 'Erro ao salvar');
        assinaturasCapturadas[`assinatura-${chave}`] = { base64 };
        sess.assinaturaBase64 = base64;
        if (alunoIdx !== null) {
            const bloco = document.getElementById(`bloco-assinatura-${aIdx}-${alunoIdx}`);
            if (bloco) bloco.outerHTML = renderizarBlocoAssinaturaPorAluno(anexosAtuais[aIdx], aIdx, alunoIdx).outerHTML;
        } else {
            const bloco = document.getElementById(`bloco-assinatura-${aIdx}`);
            if (bloco) bloco.outerHTML = renderizarBlocoAssinatura(anexosAtuais[aIdx], aIdx).outerHTML;
        }
        const canvasView = document.getElementById(`canvasView-${aIdx}-${alunoIdx}`);
        if (canvasView) canvasView.innerHTML = `<div style="background:#10b981;border-radius:14px;padding:20px;text-align:center;color:white;"><i class="fas fa-check-circle" style="font-size:48px;margin-bottom:12px;display:block;"></i><h4 style="margin:0 0 6px;">Assinatura Confirmada!</h4><button type="button" onclick="fecharModalAssinaturaQR()" class="btn btn-light" style="border-radius:10px;font-weight:600;padding:10px 24px;"><i class="fas fa-check"></i> Concluir</button></div>`;
        if (sess.polling) clearInterval(sess.polling);
    } catch (e) {
        console.error(e);
        mostrarAlerta('inscricao-alert', '❌ ' + e.message, 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Confirmar'; btn.style.background = '#10b981'; }
    }
}

function iniciarPollingSessao(chave, sessaoId, aIdx, alunoIdx) {
    const sess = sessoesAssinatura[chave];
    if (!sess) return;
    if (sess.polling) clearInterval(sess.polling);
    sess.polling = setInterval(async () => {
        try {
            const r = await fetch(INSC_API.sessao(sessaoId));
            if (!r.ok) return;
            const data = await r.json();
            if (!data.success || !data.sessao) return;
            if (data.sessao.status === 'assinado') {
                clearInterval(sess.polling); sess.polling = null;
                sess.assinaturaBase64 = data.sessao.assinaturaBase64;
                assinaturasCapturadas[`assinatura-${chave}`] = { base64: data.sessao.assinaturaBase64 };
                if (alunoIdx !== null) {
                    const b = document.getElementById(`bloco-assinatura-${aIdx}-${alunoIdx}`);
                    if (b) b.outerHTML = renderizarBlocoAssinaturaPorAluno(anexosAtuais[aIdx], aIdx, alunoIdx).outerHTML;
                } else {
                    const b = document.getElementById(`bloco-assinatura-${aIdx}`);
                    if (b) b.outerHTML = renderizarBlocoAssinatura(anexosAtuais[aIdx], aIdx).outerHTML;
                }
                fecharModalAssinaturaQR();
                mostrarToastGlobal('Assinatura recebida!', 'success');
            } else if (data.sessao.status === 'cancelado') {
                clearInterval(sess.polling); sess.polling = null;
            }
        } catch (e) {}
    }, 3000);
}

async function cancelarSessaoAssinatura(aIdx, alunoIdx) {
    const chave = alunoIdx !== null ? `${aIdx}-${alunoIdx}` : `${aIdx}`;
    const sess = sessoesAssinatura[chave];
    if (sess?.sessaoId) {
        try { await api(`${INSC_API.sessao(sess.sessaoId)}`, { method: 'DELETE' }, false); } catch (e) {}
        if (sess.polling) clearInterval(sess.polling);
        delete sessoesAssinatura[chave];
    }
    fecharModalAssinaturaQR();
    mostrarToastGlobal('Sessão cancelada', 'info');
}

function refazerAssinaturaAnexo(aIdx) {
    delete assinaturasCapturadas[`assinatura-${aIdx}`];
    const b = document.getElementById(`bloco-assinatura-${aIdx}`);
    if (b) b.outerHTML = renderizarBlocoAssinatura(anexosAtuais[aIdx], aIdx).outerHTML;
}

function refazerAssinaturaAnexoAluno(aIdx, alunoIdx) {
    delete assinaturasCapturadas[`assinatura-${aIdx}-${alunoIdx}`];
    const b = document.getElementById(`bloco-assinatura-${aIdx}-${alunoIdx}`);
    if (b) b.outerHTML = renderizarBlocoAssinaturaPorAluno(anexosAtuais[aIdx], aIdx, alunoIdx).outerHTML;
}

// ============================================================
// UPLOAD DE ANEXO
// ============================================================
function renderizarBlocoAnexoParticipante(anexo, aIdx) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:12px;background:#eff6ff;border:2px solid #3b82f6;border-radius:10px;margin-top:16px;';
    wrap.id = `bloco-anexo-participante-${aIdx}`;
    const titulo = anexo.labelSolicitacaoAnexo || labelDoAnexo(anexo);
    const obrig = !!anexo.anexoSolicitacaoObrigatorio;
    const atual = anexosParticipanteState[aIdx];
    if (atual && atual.arquivo) {
        wrap.innerHTML = `<div style="display:flex;align-items:center;gap:8px;color:#065f46;"><i class="fas fa-check-circle" style="font-size:20px;"></i><strong style="font-size:13px;">Anexo enviado!</strong></div><div style="background:white;border-radius:8px;padding:10px;margin-top:10px;font-size:12px;">📎 <a href="${escapeHtml(atual.arquivo)}" target="_blank" style="color:var(--ev-primary);">${escapeHtml(atual.nomeOriginal || 'Ver arquivo')}</a><div style="color:#64748b;font-size:11px;margin-top:4px;">${(atual.tamanho/1024).toFixed(0)} KB</div></div><button type="button" class="ev-btn ev-btn-secondary ev-btn-sm" style="margin-top:10px;" onclick="refazerAnexoParticipante(${aIdx})"><i class="fas fa-redo"></i> Reenviar</button>`;
        return wrap;
    }
    wrap.innerHTML = `<div style="display:flex;align-items:center;gap:8px;color:#1e40af;"><i class="fas fa-paperclip" style="font-size:18px;"></i><div><strong style="font-size:13px;">Anexo ${obrig ? 'obrigatório' : 'opcional'}</strong><p style="margin:2px 0 0;font-size:11px;">Envie: <strong>${escapeHtml(titulo)}</strong></p></div></div><div style="margin-top:12px;"><input type="file" id="input-anexo-participante-${aIdx}" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" style="display:block;width:100%;padding:8px;border:1px solid #93c5fd;border-radius:8px;background:white;font-size:12px;"><button type="button" class="ev-btn ev-btn-primary ev-btn-sm" style="margin-top:8px;" onclick="enviarAnexoParticipante(${aIdx})"><i class="fas fa-upload"></i> Enviar arquivo</button><div id="status-anexo-${aIdx}" style="font-size:12px;margin-top:6px;"></div></div>`;
    return wrap;
}

async function enviarAnexoParticipante(aIdx) {
    const input = document.getElementById(`input-anexo-participante-${aIdx}`);
    const status = document.getElementById(`status-anexo-${aIdx}`);
    if (!input || !input.files || input.files.length === 0) { status.innerHTML = '<span style="color:#dc2626;">Selecione um arquivo.</span>'; return; }
    const file = input.files[0];
    const fd = new FormData();
    fd.append('anexo', file);
    status.innerHTML = '<span style="color:#0284c7;">⏳ Enviando...</span>';
    try {
        const data = await api(INSC_API.uploadAnexo(eventoAtual.slug), { method: 'POST', body: fd }, true);
        anexosParticipanteState[aIdx] = { arquivo: data.arquivo, nomeOriginal: data.nomeOriginal || file.name, mimetype: data.mimetype || file.type, tamanho: data.tamanho || file.size };
        const bloco = document.getElementById(`bloco-anexo-participante-${aIdx}`);
        if (bloco) bloco.outerHTML = renderizarBlocoAnexoParticipante(anexosAtuais[aIdx], aIdx).outerHTML;
    } catch (err) {
        status.innerHTML = `<span style="color:#dc2626;">❌ ${escapeHtml(err.message)}</span>`;
    }
}

function refazerAnexoParticipante(aIdx) {
    delete anexosParticipanteState[aIdx];
    const bloco = document.getElementById(`bloco-anexo-participante-${aIdx}`);
    if (bloco) bloco.outerHTML = renderizarBlocoAnexoParticipante(anexosAtuais[aIdx], aIdx).outerHTML;
}

// ============================================================
// DADOS CONSOLIDADOS
// ============================================================
function obterDadosConsolidados() {
    const todos = {};
    const userLocal = localStorage.getItem(CHAVE_USER);
    if (userLocal) {
        try {
            const u = JSON.parse(userLocal);
            const push = (k, v) => { if (v) todos[norm(k)] = String(v); };
            push('nome completo', u.nomeCompleto);
            push('e-mail', u.email); push('email', u.email);
            push('cpf', u.cpf); push('rg', u.rg);
            push('telefone', u.telefone);
            push('instituicao onde atua', u.instituicao); push('instituicao', u.instituicao);
            push('funcao/cargo', u.funcao); push('funcao', u.funcao);
            push('serie dos estudantes', u.serieEstudantes); push('serie', u.serieEstudantes);
            if (u.dataNascimento) {
                const dt = new Date(u.dataNascimento);
                if (!isNaN(dt)) push('data de nascimento', `${String(dt.getUTCDate()).padStart(2,'0')}/${String(dt.getUTCMonth()+1).padStart(2,'0')}/${dt.getUTCFullYear()}`);
            }
        } catch (e) {}
    }
    for (const [k, v] of Object.entries(dadosSalvos)) {
        if (v === undefined || v === null) continue;
        todos[norm(k)] = String(v);
    }
    document.querySelectorAll('.campo-insc').forEach(el => {
        const label = el.dataset.label;
        if (!label) return;
        if (el.tagName === 'DIV' && el.classList.contains('serie-checkboxes-container')) {
            const marcados = Array.from(el.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value).join(', ');
            if (marcados) todos[norm(label)] = marcados;
            return;
        }
        let val = el.value ? el.value.trim() : '';
        if (el.type === 'date' && val) {
            const [y, m, d] = val.split('-');
            val = `${d}/${m}/${y}`;
        }
        if (val) todos[norm(label)] = val;
    });
    document.querySelectorAll('[data-extra-relacao]').forEach(el => {
        const label = el.dataset.extraRelacao;
        if (label && el.value) todos[norm(`${label} (Nome)`)] = el.value;
    });
    return todos;
}

function dadosDoAluno(dados, alunoIdx) {
    const resultado = {};
    const sufixo = `_aluno_${alunoIdx}`;
    const prefixoEst = `estudante[${alunoIdx}].`;
    for (const [dk, dv] of Object.entries(dados)) {
        if (!dv) continue;
        let chaveBase = null;
        if (dk.endsWith(sufixo)) chaveBase = dk.substring(0, dk.length - sufixo.length);
        else if (dk.startsWith(prefixoEst)) chaveBase = dk.substring(prefixoEst.length);
        if (chaveBase) resultado[chaveBase] = dv;
    }
    return resultado;
}

function dadosDoProfessor(dados) {
    const resultado = {};
    for (const [dk, dv] of Object.entries(dados)) {
        if (!dv) continue;
        if (dk.includes('_aluno_')) continue;
        if (dk.includes('estudante[')) continue;
        resultado[dk] = dv;
    }
    return resultado;
}

function camposDoAlunoEResponsavel(anexo, indiceDeDados) {
    const camposModelo = [...(anexo.campos || []), ...(anexo.camposRepetiveis || [])];
    const vistos = new Set();
    const aluno = [], responsavel = [];
    for (const c of camposModelo) {
        const k = norm(c.label);
        if (!k || vistos.has(k)) continue;
        vistos.add(k);
        const valor = indiceDeDados[k] || '';
        const item = { label: c.label, valor };
        if (ehCampoResponsavel(c.label)) responsavel.push(item); else aluno.push(item);
    }
    return { aluno, responsavel };
}

function tabelaCampos(campos, titulo, icone, corBorda) {
    if (!campos.length) return `<h6 style="color:#1e293b;font-weight:700;margin:16px 0 8px 0;"><i class="fas ${icone}"></i> ${titulo}</h6><div style="padding:12px;color:#94a3b8;font-style:italic;background:white;border:1px solid #e2e8f0;border-radius:8px;">Nenhum campo.</div>`;
    const linhas = campos.map(c => `<tr><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600;color:#334155;font-size:13px;width:40%;vertical-align:top;">${escapeHtml(c.label)}</td><td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#1e293b;font-size:14px;">${c.valor ? `<strong>${escapeHtml(c.valor)}</strong>` : '<span style="color:#94a3b8;font-style:italic;">(não preenchido)</span>'}</td></tr>`).join('');
    return `<h6 style="color:#1e293b;font-weight:700;margin:16px 0 8px 0;"><i class="fas ${icone}"></i> ${titulo}</h6><table style="width:100%;border-collapse:collapse;background:white;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;border-top:3px solid ${corBorda};"><tbody>${linhas}</tbody></table>`;
}

function juntarCamposProjeto() {
    const dados = obterDadosConsolidados();
    const indiceProfessor = dadosDoProfessor(dados);
    const resultado = []; const vistos = new Set();
    for (const outroAnexo of anexosAtuais) {
        if (ehAvaliativo(outroAnexo)) continue;
        if (!ehAnexoPasso2(outroAnexo) && !ehEstudante(outroAnexo)) continue;
        if (ehAnexoProfessor(outroAnexo)) continue;
        const campos = outroAnexo.campos || [];
        for (const c of campos) {
            const k = norm(c.label);
            if (!k || vistos.has(k)) continue;
            if (ehCampoResponsavel(c.label)) continue;
            vistos.add(k);
            resultado.push({ label: c.label, valor: indiceProfessor[k] || dados[k] || '', origem: labelDoAnexo(outroAnexo) });
        }
    }
    return resultado;
}

function juntarCamposAlunoComTermo(anexo, alunoIdx) {
    const dados = obterDadosConsolidados();
    const indiceAluno = dadosDoAluno(dados, alunoIdx);
    const resultado = []; const vistos = new Set();
    for (const c of (anexo.camposRepetiveis || [])) {
        const k = norm(c.label);
        if (!k || vistos.has(k)) continue;
        if (ehCampoResponsavel(c.label)) continue;
        vistos.add(k);
        resultado.push({ label: c.label, valor: indiceAluno[k] || '', origem: labelDoAnexo(anexo) });
    }
    for (const outroAnexo of anexosAtuais) {
        if (outroAnexo === anexo) continue;
        if (ehAvaliativo(outroAnexo)) continue;
        if (!ehAnexoPasso2(outroAnexo) && !ehEstudante(outroAnexo)) continue;
        for (const c of (outroAnexo.camposRepetiveis || [])) {
            const k = norm(c.label);
            if (!k || vistos.has(k)) continue;
            if (ehCampoResponsavel(c.label)) continue;
            vistos.add(k);
            resultado.push({ label: c.label, valor: indiceAluno[k] || '', origem: labelDoAnexo(outroAnexo) });
        }
    }
    return resultado;
}

function juntarCamposResponsavel(anexo, alunoIdx) {
    const dados = obterDadosConsolidados();
    const indiceAluno = alunoIdx !== null ? dadosDoAluno(dados, alunoIdx) : dadosDoProfessor(dados);
    const { responsavel } = camposDoAlunoEResponsavel(anexo, indiceAluno);
    return responsavel;
}

// ============================================================
// LOGIN / CADASTRO / SUBMIT
// ============================================================
document.querySelectorAll('.insc-auth-tab').forEach(t => {
    t.addEventListener('click', () => {
        const alvo = t.dataset.auth;
        document.querySelectorAll('.insc-auth-tab').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.insc-auth-panel').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        document.getElementById(`auth-${alvo}`).classList.add('active');
    });
});

document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;
    if (!email || !senha) return mostrarAlerta('login-alert', 'Preencha e-mail e senha.', 'error');
    try {
        const data = await api(INSC_API.login, { method: 'POST', body: JSON.stringify({ email, senha }) });
        setToken(data.token);
        localStorage.setItem(CHAVE_USER, JSON.stringify(data.participante));
        carregarEvento();
    } catch (err) { mostrarAlerta('login-alert', '❌ ' + err.message, 'error'); }
});

document.getElementById('btn-cadastro').addEventListener('click', async () => {
    const nome = document.getElementById('cad-nome').value.trim();
    const email = document.getElementById('cad-email').value.trim();
    const senha = document.getElementById('cad-senha').value;
    const lgpd = document.getElementById('cad-lgpd').checked;
    if (!nome || !email || !senha) return mostrarAlerta('cadastro-alert', 'Preencha todos os campos.', 'error');
    if (!lgpd) return mostrarAlerta('cadastro-alert', 'Aceite os termos LGPD.', 'error');
    const funcaoValue = (document.getElementById('cad-funcao').value || '').trim();
    const seriesMarcadas = Array.from(document.querySelectorAll('input[name="serie"]:checked')).map(cb => cb.value);
    const payload = {
        nomeCompleto: nome, email, senha,
        cpf: document.getElementById('cad-cpf').value || null,
        telefone: document.getElementById('cad-telefone').value || null,
        instituicao: document.getElementById('cad-instituicao').value.trim() || null,
        funcao: funcaoValue || null,
        serieEstudantes: seriesMarcadas.join(', ') || null,
        dataNascimento: document.getElementById('cad-nascimento').value || null,
        lgpd: { aceito: true, versaoTermo: '1.0' }
    };
    try {
        const data = await api(INSC_API.cadastro, { method: 'POST', body: JSON.stringify(payload) });
        setToken(data.token);
        localStorage.setItem(CHAVE_USER, JSON.stringify(data.participante));
        carregarEvento();
    } catch (err) { mostrarAlerta('cadastro-alert', '❌ ' + err.message, 'error'); }
});

document.getElementById('btn-sair').addEventListener('click', () => {
    limparSessao();
    window.location.reload();
});

document.getElementById('btn-inscrever').addEventListener('click', async () => {
    if (__inscricaoEmAndamento) return;

    const btn = document.getElementById('btn-inscrever');
    const chkLgpd = document.getElementById('insc-lgpd-confirmo');
    if (!chkLgpd || !chkLgpd.checked) {
        return mostrarAlerta('inscricao-alert', 'Você precisa aceitar os termos LGPD (clique em "termos de privacidade").', 'error');
    }
    salvarDadosAtuais();

    let cpfInvalido = null;
    document.querySelectorAll('.mascara-cpf').forEach(el => {
        const v = el.value.replace(/\D/g, '');
        if (v.length > 0 && !validarCPF(v)) cpfInvalido = el.dataset.label;
    });
    if (cpfInvalido) return mostrarAlerta('inscricao-alert', `CPF inválido: ${cpfInvalido}`, 'error');

    const dados = {};
    document.querySelectorAll('.campo-insc').forEach(el => {
        const label = el.dataset.label;
        if (!label) return;
        if (el.tagName === 'DIV' && el.classList.contains('serie-checkboxes-container')) {
            const marcados = Array.from(el.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value).join(', ');
            if (marcados) dados[label] = marcados;
        } else {
            dados[label] = el.value;
        }
    });
    const dadosFinais = { ...dadosSalvos, ...dados };
    document.querySelectorAll('[data-extra-relacao]').forEach(el => {
        if (el.value) dadosFinais[`${el.dataset.extraRelacao} (Nome)`] = el.value;
    });

    for (let i = 0; i < anexosAtuais.length; i++) {
        const a = anexosAtuais[i];
        if (a.solicitaAnexo && a.anexoSolicitacaoObrigatorio) {
            if (!anexosParticipanteState[i] || !anexosParticipanteState[i].arquivo) {
                return mostrarAlerta('inscricao-alert', `Envie o anexo: ${a.labelSolicitacaoAnexo || labelDoAnexo(a)}.`, 'error');
            }
        }
        if (a.exigeAssinatura) {
            if (ehEstudante(a) || ehRepetivel(a)) {
                const qtd = estadoRepeticoes[i]?.quantidade || a.quantidadePadrao || 1;
                for (let j = 0; j < qtd; j++) {
                    if (!assinaturasCapturadas[`assinatura-${i}-${j}`]?.base64) {
                        return mostrarAlerta('inscricao-alert', `Assine "${labelDoAnexo(a)}" para o Aluno ${j + 1}.`, 'error');
                    }
                }
            } else {
                if (!assinaturasCapturadas[`assinatura-${i}`]?.base64) {
                    return mostrarAlerta('inscricao-alert', `Assine "${labelDoAnexo(a)}".`, 'error');
                }
            }
        }
    }

    const assinaturasPorAnexo = {};
    Object.entries(assinaturasCapturadas).forEach(([chave, v]) => {
        if (!v || !v.base64) return;
        if (chave.startsWith('assinatura-')) {
            const sub = chave.replace('assinatura-', '');
            if (sub.includes('-')) {
                const [aIdx, alunoIdx] = sub.split('-');
                const anexo = anexosAtuais[parseInt(aIdx)];
                const nomeAnexo = anexo ? (anexo.labelCustom || anexo.tipo) : `anexo_${aIdx}`;
                assinaturasPorAnexo[`${nomeAnexo} (Aluno ${parseInt(alunoIdx) + 1})`] = v.base64;
            } else {
                const anexo = anexosAtuais[parseInt(sub)];
                const nomeAnexo = anexo ? (anexo.labelCustom || anexo.tipo) : `anexo_${sub}`;
                assinaturasPorAnexo[nomeAnexo] = v.base64;
            }
        }
    });
    const primeiraAssinatura = Object.values(assinaturasPorAnexo)[0] || null;

    const anexosParticipante = {};
    Object.entries(anexosParticipanteState).forEach(([idx, v]) => {
        if (v && v.arquivo) {
            const anexo = anexosAtuais[parseInt(idx)];
            const chave = anexo ? (anexo.labelSolicitacaoAnexo || anexo.labelCustom || anexo.nomeOriginal) : `anexo_${idx}`;
            anexosParticipante[chave] = v.arquivo;
        }
    });

    __inscricaoEmAndamento = true;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    try {
        const data = await api(INSC_API.inscrever(eventoAtual.slug), {
            method: 'POST',
            body: JSON.stringify({
                dadosPreenchidos: dadosFinais,
                assinaturaBase64: primeiraAssinatura,
                assinaturasPorAnexo,
                anexosParticipante
            })
        }, true);

        mostrarTelaProtocolo(data.inscricao.protocolo, data.inscricao.status);
        mostrarToastGlobal('Inscrição realizada com sucesso!', 'success');
    } catch (err) {
        if (err.status === 409 && err.data?.protocolo && !eventoAtual.permiteMultiplasInscricoes) {
            mostrarTelaProtocolo(err.data.protocolo, 'Pendente');
            mostrarToastGlobal('Você já está inscrito.', 'info');
        } else {
            mostrarAlerta('inscricao-alert', '❌ ' + err.message, 'error');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check"></i> Confirmar Inscrição';
        }
    } finally {
        __inscricaoEmAndamento = false;
    }
});