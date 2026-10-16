// ============================================================
// 🛠️ CORRETOR AUTOMÁTICO DO admin-simples.js (v2 - SEGURO)
// - Remove métodos duplicados por nome
// - Substitui abrirModal() antigo por bloco unificado
// - Corrige onclick dos modais que ainda usam atribuição direta
// - Valida sintaxe ao final (chaves balanceadas)
// - Faz backup automático
// ============================================================
// Uso: node corrigir-admin-simples.js
// ============================================================

const fs = require('fs');
const path = require('path');

const CAMINHO = path.join(__dirname, 'frontend', 'js', 'admin-simples.js');

console.log('\n' + '═'.repeat(70));
console.log('🛠️  CORRETOR AUTOMÁTICO DO admin-simples.js (v2)');
console.log('═'.repeat(70) + '\n');

// ============================================================
// 1. Verificações iniciais
// ============================================================
if (!fs.existsSync(CAMINHO)) {
    console.error('❌ Arquivo não encontrado:', CAMINHO);
    console.error('   Rode o script da RAIZ do projeto.\n');
    process.exit(1);
}

let conteudo = fs.readFileSync(CAMINHO, 'utf8');
const linhasOriginais = conteudo.split('\n').length;

console.log(`📄 Arquivo: ${CAMINHO}`);
console.log(`📊 Linhas originais: ${linhasOriginais.toLocaleString('pt-BR')}\n`);

// ============================================================
// 2. Backup
// ============================================================
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupPath = CAMINHO + '.backup-' + timestamp;
fs.writeFileSync(backupPath, conteudo, 'utf8');
console.log(`💾 Backup criado: ${path.basename(backupPath)}\n`);

// ============================================================
// 3. Helpers
// ============================================================

/**
 * Remove um método da classe pelo nome (remove a N-ésima ocorrência).
 * Localiza pelo padrão `    nomeMetodo(...) {` (4 espaços de indentação)
 * e remove até a chave de fechamento balanceada.
 */
function removerMetodo(texto, nomeMetodo, indiceOcorrencia = 0) {
    const regex = new RegExp(
        `^    (?:async\\s+)?${nomeMetodo}\\s*\\([^)]*\\)\\s*\\{`,
        'gm'
    );
    const posicoes = [];
    let m;
    while ((m = regex.exec(texto)) !== null) {
        posicoes.push(m.index);
    }

    if (posicoes.length <= indiceOcorrencia) {
        return { texto, removido: false, linha: -1 };
    }

    const inicio = posicoes[indiceOcorrencia];
    const linhaInicio = texto.substring(0, inicio).split('\n').length;

    const posAbreChave = texto.indexOf('{', inicio);
    if (posAbreChave === -1) return { texto, removido: false, linha: linhaInicio };

    let nivel = 0;
    let posFim = -1;
    let dentroString = false;
    let charString = '';

    for (let i = posAbreChave; i < texto.length; i++) {
        const c = texto[i];
        const anterior = texto[i - 1];

        if (!dentroString && (c === '"' || c === "'" || c === '`')) {
            let numBarrasAntes = 0;
            let j = i - 1;
            while (j >= 0 && texto[j] === '\\') { numBarrasAntes++; j--; }
            if (numBarrasAntes % 2 === 0) {
                dentroString = true;
                charString = c;
                continue;
            }
        }

        if (dentroString) {
            if (c === charString && anterior !== '\\') {
                dentroString = false;
                charString = '';
            }
            continue;
        }

        if (c === '/' && texto[i + 1] === '/') {
            const fimLinha = texto.indexOf('\n', i);
            i = fimLinha === -1 ? texto.length : fimLinha;
            continue;
        }

        if (c === '/' && texto[i + 1] === '*') {
            const fimBloco = texto.indexOf('*/', i + 2);
            i = fimBloco === -1 ? texto.length : fimBloco + 1;
            continue;
        }

        if (c === '{') nivel++;
        else if (c === '}') {
            nivel--;
            if (nivel === 0) { posFim = i; break; }
        }
    }

    if (posFim === -1) return { texto, removido: false, linha: linhaInicio };

    let posFinal = posFim + 1;
    while (posFinal < texto.length && texto[posFinal] !== '\n') posFinal++;
    posFinal++;

    const novotexto = texto.substring(0, inicio) + texto.substring(posFinal);
    return { texto: novotexto, removido: true, linha: linhaInicio };
}

/**
 * Valida se chaves, parênteses e colchetes estão balanceados.
 */
function validarSintaxe(texto) {
    let chaves = 0, parens = 0, colchetes = 0;
    let dentroString = false;
    let charString = '';

    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        const anterior = texto[i - 1];

        if (!dentroString && (c === '"' || c === "'" || c === '`')) {
            let numBarrasAntes = 0;
            let j = i - 1;
            while (j >= 0 && texto[j] === '\\') { numBarrasAntes++; j--; }
            if (numBarrasAntes % 2 === 0) {
                dentroString = true;
                charString = c;
                continue;
            }
        }

        if (dentroString) {
            if (c === charString && anterior !== '\\') {
                dentroString = false;
                charString = '';
            }
            continue;
        }

        if (c === '/' && texto[i + 1] === '/') {
            const fimLinha = texto.indexOf('\n', i);
            i = fimLinha === -1 ? texto.length : fimLinha;
            continue;
        }

        if (c === '/' && texto[i + 1] === '*') {
            const fimBloco = texto.indexOf('*/', i + 2);
            i = fimBloco === -1 ? texto.length : fimBloco + 1;
            continue;
        }

        if (c === '{') chaves++;
        else if (c === '}') chaves--;
        else if (c === '(') parens++;
        else if (c === ')') parens--;
        else if (c === '[') colchetes++;
        else if (c === ']') colchetes--;
    }

    return { chaves, parens, colchetes };
}

// ============================================================
// 4. CORREÇÃO 1: Remover métodos duplicados de modal
// ============================================================
console.log('━'.repeat(70));
console.log('🛠️  CORREÇÃO 1: Remover cópias duplicadas de métodos de modal');
console.log('━'.repeat(70));

// Remover TODAS as cópias de fecharModal, openModal, abrirModal, configurarModal
// (vamos reinjetar 1 versão unificada de cada)
const metodosParaLimpar = ['fecharModal', 'openModal', 'abrirModal', 'configurarModal'];

metodosParaLimpar.forEach(nome => {
    let removidos = 0;
    while (true) {
        const r = removerMetodo(conteudo, nome, 0);
        if (!r.removido) break;
        conteudo = r.texto;
        removidos++;
    }
    console.log(`   ✅ ${nome}: ${removidos} cópia(s) removida(s)`);
});

// ============================================================
// 5. CORREÇÃO 2: Injetar bloco unificado de modais no final da classe
// ============================================================
console.log('\n' + '━'.repeat(70));
console.log('🛠️  CORREÇÃO 2: Injetar bloco unificado de modais');
console.log('━'.repeat(70));

const BLOCO_MODAIS = `
    // ============================================================
    // 🎛️ SISTEMA CENTRALIZADO DE MODAIS (v2)
    // REGRA DE OURO:
    //   1. SEMPRE use configurarModal() ANTES de openModal()
    //   2. NUNCA escreva modalSaveBtn.onclick = ... diretamente
    // ============================================================

    configurarModal(opts = {}) {
        const {
            title,
            saveText = 'Salvar',
            onSave = null,
            hideSave = false,
            wide = false
        } = opts;

        const modalTitle   = document.getElementById('modalTitle');
        const modalSaveBtn = document.getElementById('modalSaveBtn');
        const modalContent = document.querySelector('#modal .modal-content');

        if (modalTitle && title !== undefined) {
            modalTitle.innerHTML = title;
        }

        if (modalSaveBtn) {
            modalSaveBtn.onclick       = null;
            modalSaveBtn.onmousedown   = null;
            modalSaveBtn.onmouseup     = null;
            modalSaveBtn.textContent   = saveText;
            modalSaveBtn.innerHTML     = saveText;
            modalSaveBtn.disabled      = false;
            modalSaveBtn.type          = 'button';
            modalSaveBtn.className     = 'btn-primary';
            modalSaveBtn.style.display = hideSave ? 'none' : 'inline-block';

            if (!hideSave && typeof onSave === 'function') {
                modalSaveBtn.onclick = (event) => {
                    if (event) {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                    onSave(event);
                };
            }
        }

        if (modalContent) {
            modalContent.classList.remove('modal-content-wide');
            if (wide) modalContent.classList.add('modal-content-wide');
        }
    }

    openModal() {
        const modal = document.getElementById('modal');
        if (modal) {
            modal.style.display = 'flex';
            modal.classList.add('active');
        } else {
            console.error('❌ Modal não encontrado no DOM');
        }
    }

    abrirModal(titulo, conteudo, salvar = true) {
        const modalBody = document.getElementById('modalBody');
        if (modalBody) {
            modalBody.innerHTML = conteudo || '<p style="padding: 20px; text-align: center;">Nenhum conteúdo disponível</p>';
        }
        this.configurarModal({
            title: titulo,
            hideSave: !salvar
        });
        this.openModal();
    }

    fecharModal() {
        console.log('🔚 Fechando modal');

        const modal = document.getElementById('modal');
        if (modal) {
            modal.style.display = 'none';
            modal.classList.remove('active');
        }

        const modalSaveBtn = document.getElementById('modalSaveBtn');
        if (modalSaveBtn) {
            modalSaveBtn.onclick       = null;
            modalSaveBtn.onmousedown   = null;
            modalSaveBtn.onmouseup     = null;
            modalSaveBtn.textContent   = 'Salvar';
            modalSaveBtn.innerHTML     = 'Salvar';
            modalSaveBtn.disabled      = false;
            modalSaveBtn.style.display = 'inline-block';
            modalSaveBtn.className     = 'btn-primary';
        }

        const modalTitle = document.getElementById('modalTitle');
        if (modalTitle) modalTitle.innerHTML = '';

        const modalBody = document.getElementById('modalBody');
        if (modalBody) modalBody.innerHTML = '';

        const modalContent = document.querySelector('#modal .modal-content');
        if (modalContent) modalContent.classList.remove('modal-content-wide');
    }
`;

// Injetar antes do fechamento da classe AdminSimples
const marcadorInstancia = 'const adminSimples = new AdminSimples();';
const posMarcador = conteudo.indexOf(marcadorInstancia);

if (posMarcador !== -1) {
    const posFimClasse = conteudo.lastIndexOf('}', posMarcador);

    if (posFimClasse !== -1) {
        const inicioLinha = conteudo.lastIndexOf('\n', posFimClasse);
        conteudo = conteudo.substring(0, inicioLinha) + BLOCO_MODAIS + conteudo.substring(inicioLinha);
        console.log('   ✅ Bloco de modais injetado no final da classe');
    } else {
        console.log('   ⚠️  Não foi possível localizar o fim da classe');
    }
} else {
    console.log('   ⚠️  Marcador não encontrado, tentando fallback...');
    const posFim = conteudo.lastIndexOf('\n}');
    if (posFim !== -1) {
        conteudo = conteudo.substring(0, posFim) + BLOCO_MODAIS + conteudo.substring(posFim);
        console.log('   ✅ Bloco injetado (fallback)');
    }
}

// ============================================================
// 6. CORREÇÃO 3: Corrigir chamadas de abrirModal em métodos específicos
//    (substituição SEGURA por texto exato, não regex guloso)
// ============================================================
console.log('\n' + '━'.repeat(70));
console.log('🛠️  CORREÇÃO 3: Corrigir onclick dos modais problemáticos');
console.log('━'.repeat(70));

// ---------- 3.1 abrirModalUsuario ----------
// Substituição por texto EXATO (mais seguro que regex)

const trechoUsuarioAntes = `        this.abrirModal(titulo, conteudoHTML, true);

        document.getElementById('modalSaveBtn').onclick = () => this.salvarUsuario(id);`;

const trechoUsuarioDepois = `        this.configurarModal({
            title: usuario 
                ? '<i class="fas fa-edit"></i> Editar Usuário' 
                : '<i class="fas fa-user-plus"></i> Novo Usuário',
            saveText: usuario ? '💾 Salvar Alterações' : '➕ Criar Usuário',
            onSave: () => this.salvarUsuario(id)
        });

        const modalBodyEl = document.getElementById('modalBody');
        modalBodyEl.innerHTML = conteudoHTML;

        this.openModal();`;

if (conteudo.includes(trechoUsuarioAntes)) {
    conteudo = conteudo.split(trechoUsuarioAntes).join(trechoUsuarioDepois);
    console.log('   ✅ abrirModalUsuario() → configurarModal()');
} else {
    console.log('   ⚠️  abrirModalUsuario() não encontrado (já pode estar corrigido)');
}

// ---------- 3.2 abrirModalEnvioNotificacao ----------
const trechoNotifAntes = `        modalSaveBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Notificação';
        modalSaveBtn.onclick = () => this.enviarNotificacaoEmMassa();
        modalSaveBtn.style.display = 'inline-block';`;

const trechoNotifDepois = `        this.configurarModal({
            title: '<i class="fas fa-paper-plane"></i> Enviar Notificação',
            saveText: '<i class="fas fa-paper-plane"></i> Enviar Notificação',
            onSave: () => this.enviarNotificacaoEmMassa()
        });
        this.openModal();`;

if (conteudo.includes(trechoNotifAntes)) {
    conteudo = conteudo.split(trechoNotifAntes).join(trechoNotifDepois);
    console.log('   ✅ abrirModalEnvioNotificacao() → configurarModal()');
} else {
    console.log('   ⚠️  abrirModalEnvioNotificacao() não encontrado (já pode estar corrigido)');
}

// ---------- 3.3 abrirModalUploadAdaptarDocumento ----------
const trechoAdaptarAntes = `        setTimeout(() => {
            const btn = document.getElementById('modalSaveBtn');
            if (btn) {
                console.log('🔧 Reconfigurando botão do modal de adaptação...');
                btn.removeAttribute('onclick');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-magic"></i> Aplicar Adaptações';
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🔘 Botão de adaptação clicado!');
                    this.aplicarAdaptacoesComGoogle();
                };
                console.log('✅ Botão reconfigurado com sucesso!');
            }
        }, 100);`;

const trechoAdaptarDepois = `        this.configurarModal({
            title: '<i class="fas fa-universal-access"></i> Adaptar Documento',
            saveText: '<i class="fas fa-magic"></i> Aplicar Adaptações',
            onSave: () => this.aplicarAdaptacoesComGoogle()
        });

        const modalBodyEl = document.getElementById('modalBody');
        modalBodyEl.innerHTML = conteudoHTMLAdaptar;

        this.openModal();`;

if (conteudo.includes(trechoAdaptarAntes)) {
    conteudo = conteudo.split(trechoAdaptarAntes).join(trechoAdaptarDepois);
    console.log('   ✅ abrirModalUploadAdaptarDocumento() → configurarModal()');
} else {
    console.log('   ⚠️  abrirModalUploadAdaptarDocumento() não encontrado (já pode estar corrigido)');
}

// ============================================================
// 7. Validação de sintaxe
// ============================================================
console.log('\n' + '━'.repeat(70));
console.log('🔍 VALIDAÇÃO DE SINTAXE');
console.log('━'.repeat(70));

const balanceamento = validarSintaxe(conteudo);

console.log(`   Chaves {  }:    ${balanceamento.chaves}`);
console.log(`   Parênteses (  ): ${balanceamento.parens}`);
console.log(`   Colchetes [  ]:  ${balanceamento.colchetes}`);

let tudoOk = true;
if (balanceamento.chaves !== 0) {
    console.error(`   ❌ DESBALANCEADO: chaves com diferença de ${balanceamento.chaves}`);
    tudoOk = false;
}
if (balanceamento.parens !== 0) {
    console.error(`   ❌ DESBALANCEADO: parênteses com diferença de ${balanceamento.parens}`);
    tudoOk = false;
}
if (balanceamento.colchetes !== 0) {
    console.error(`   ❌ DESBALANCEADO: colchetes com diferença de ${balanceamento.colchetes}`);
    tudoOk = false;
}

if (!tudoOk) {
    console.error('\n⚠️  O arquivo resultante tem problemas de balanceamento!');
    console.error('   NÃO FOI SALVO. Restaurando backup automaticamente...\n');

    // Restaurar o original
    conteudo = fs.readFileSync(backupPath, 'utf8');
    fs.writeFileSync(CAMINHO, conteudo, 'utf8');

    console.error(`   ✅ Backup restaurado: ${path.basename(backupPath)} → admin-simples.js`);
    console.error('   Corrija manualmente e tente novamente.\n');
    process.exit(1);
}

console.log('   ✅ Sintaxe balanceada, salvando...\n');

// ============================================================
// 8. Salvar
// ============================================================
fs.writeFileSync(CAMINHO, conteudo, 'utf8');

const linhasFinais = conteudo.split('\n').length;

console.log('═'.repeat(70));
console.log('✅ CORREÇÃO CONCLUÍDA');
console.log('═'.repeat(70));
console.log(`📄 Linhas originais:  ${linhasOriginais.toLocaleString('pt-BR')}`);
console.log(`📄 Linhas finais:     ${linhasFinais.toLocaleString('pt-BR')}`);
console.log(`📊 Variação:          ${(linhasFinais - linhasOriginais).toLocaleString('pt-BR')} linhas`);
console.log(`💾 Backup salvo em:   ${path.basename(backupPath)}`);

console.log('\n' + '═'.repeat(70));
console.log('📌 PRÓXIMOS PASSOS:');
console.log('═'.repeat(70));
console.log('   1. Recarregue /admin-simples.html (Ctrl+Shift+R)');
console.log('   2. Abra "Editar Usuário" → botão deve dizer "Salvar Alterações"');
console.log('   3. Feche e abra "Nova Turma" → botão deve dizer "Criar Turma"');
console.log('   4. Se algo der errado, restaure:');
console.log(`      cp "${backupPath}" "${CAMINHO}"`);
console.log('═'.repeat(70) + '\n');