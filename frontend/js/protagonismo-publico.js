// ============================================
// PROTAGONISMO PÚBLICO - PÁGINA SEM LOGIN
// ============================================

let statusSistema = { inscricoesClubesAbertas: false, eleicaoLiderAberta: false, tutoriaVisivel: false };
let clubesDisponiveis = [];
let clubeSelecionado = null;
let vinculosCursoTurma = {};
let cursos = [];
let turmas = [];

let candidatoLiderSelecionado = null;
let candidatoViceSelecionado = null;
let votacaoData = null;

// 🆕 WhatsApp da escola (DDI + DDD + número)
const WHATSAPP_ESCOLA_PROTAGONISMO = '5598983086504';

// ============================================
// HELPERS
// ============================================
function safeGet(id) { return document.getElementById(id); }
function safeSetText(id, value) { const el = safeGet(id); if (el) el.textContent = value; }

function escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function gerarAvatarSVG(nome) {
    const inicial = (nome || '?').charAt(0).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f97316"/><stop offset="100%" stop-color="#ea580c"/></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/><text x="50" y="50" font-family="Arial,sans-serif" font-size="45" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="central">${inicial}</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

function ajustarCor(cor) {
    try {
        const hex = cor.replace('#', '');
        const r = Math.max(0, parseInt(hex.substr(0, 2), 16) - 40);
        const g = Math.max(0, parseInt(hex.substr(2, 2), 16) - 40);
        const b = Math.max(0, parseInt(hex.substr(4, 2), 16) - 40);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    } catch (e) {
        return '#ea580c';
    }
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🌟 Protagonismo Público carregado');
    
    // Carrega status e dados auxiliares
    await Promise.all([
        carregarStatus(),
        carregarCursosTurmas()
    ]);
    
    // Preenche selects
    preencherSelects();
    
    // Configura data máxima no input de nascimento
    const hoje = new Date();
    const maxDate = new Date(hoje.getFullYear() - 5, hoje.getMonth(), hoje.getDate());
    ['inscricaoDataNasc', 'votoDataNasc', 'verificarDataNasc'].forEach(id => {
        const el = safeGet(id);
        if (el) {
            el.max = maxDate.toISOString().split('T')[0];
        }
    });

    // 🆕 Configura máscara de telefone e fechar-clique-fora no modal de ajuda
    configurarAjuda();
});

// ============================================
// STATUS DO SISTEMA
// ============================================
async function carregarStatus() {
    try {
        // Busca status geral E status do acolhimento ao mesmo tempo
        const [resGeral, resAcolhimento] = await Promise.all([
            fetch('/api/protagonismo-publico/status').then(r => r.json()),
            fetch('/api/acolhimento/status-publico').then(r => r.json())
        ]);
        
        if (resGeral.success) {
            statusSistema = resGeral.status;
        }
        
        // Salva o status do acolhimento no objeto global
        if (resAcolhimento.success) {
            statusSistema.acolhimentoAberto = resAcolhimento.acolhimentoAberto;
        }
        
        atualizarStatusUI();
    } catch (error) {
        console.error('Erro ao carregar status:', error);
    }
}

function atualizarStatusUI() {
    // Status das pílulas
    const pillInscricoes = safeGet('statusInscricoes');
    const pillEleicao = safeGet('statusEleicao');
    const pillAcolhimento = safeGet('statusAcolhimentoHome'); // 🆕 Nova pílula
    
    if (pillInscricoes) {
        if (statusSistema.inscricoesClubesAbertas) {
            pillInscricoes.className = 'status-pill active';
            pillInscricoes.innerHTML = '<i class="fas fa-circle"></i> Inscrições Abertas';
        } else {
            pillInscricoes.className = 'status-pill inactive';
            pillInscricoes.innerHTML = '<i class="fas fa-circle"></i> Inscrições Fechadas';
        }
    }
    
    if (pillEleicao) {
        if (statusSistema.eleicaoLiderAberta) {
            pillEleicao.className = 'status-pill active';
            pillEleicao.innerHTML = '<i class="fas fa-circle"></i> Eleição Aberta';
        } else {
            pillEleicao.className = 'status-pill inactive';
            pillEleicao.innerHTML = '<i class="fas fa-circle"></i> Eleição Fechada';
        }
    }

    // 🆕 Atualiza a pílula do Acolhimento
    if (pillAcolhimento) {
        if (statusSistema.acolhimentoAberto) {
            pillAcolhimento.className = 'status-pill active';
            pillAcolhimento.innerHTML = '<i class="fas fa-circle"></i> Acolhimento Aberto';
        } else {
            pillAcolhimento.className = 'status-pill inactive';
            pillAcolhimento.innerHTML = '<i class="fas fa-circle"></i> Acolhimento Fechado';
        }
    }
    
    // Habilita/desabilita cards
    const cardInscricao = safeGet('cardInscricao');
    const cardEleicao = safeGet('cardEleicao');
    const cardTutores = safeGet('cardTutores');
    const cardAcolhimento = safeGet('cardAcolhimento'); // 🆕 Card do acolhimento
    
    if (cardInscricao) cardInscricao.disabled = !statusSistema.inscricoesClubesAbertas;
    if (cardEleicao) cardEleicao.disabled = !statusSistema.eleicaoLiderAberta;
    if (cardTutores) cardTutores.disabled = !statusSistema.tutoriaVisivel;
    
    // 🆕 BLOQUEIA o card de acolhimento quando fechado (igual aos outros)
    if (cardAcolhimento) {
        const fechado = !statusSistema.acolhimentoAberto;
        cardAcolhimento.disabled = fechado;
        // dica visual (cursor + tooltip nativo)
        cardAcolhimento.style.cursor = fechado ? 'not-allowed' : 'pointer';
        cardAcolhimento.title = fechado
            ? 'Acolhimento fechado no momento'
            : 'Quero ser Acolhedor';
    }
    
    // Aviso público
    if (statusSistema.avisoPublico) {
        safeGet('avisoPublicoContainer').style.display = 'block';
        safeSetText('avisoPublicoTexto', statusSistema.avisoPublico);
    }
}

// ============================================
// NAVEGAÇÃO ENTRE SEÇÕES
// ============================================
function mostrarSecao(secao) {
    // Verifica se a funcionalidade está ativa
    if (secao === 'inscricao' && !statusSistema.inscricoesClubesAbertas) {
        mostrarErro('Inscrições Fechadas', 'As inscrições em clubes ainda não foram abertas. Volte mais tarde!');
        return;
    }
    if (secao === 'eleicao' && !statusSistema.eleicaoLiderAberta) {
        mostrarErro('Eleição Fechada', 'A eleição de líderes ainda não foi aberta. Volte mais tarde!');
        return;
    }
    if (secao === 'tutores' && !statusSistema.tutoriaVisivel) {
        mostrarErro('Tutores Indisponíveis', 'A lista de tutores não está visível no momento.');
        return;
    }
    
    // Esconde todos
    document.querySelectorAll('.section-content').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.action-grid')[0].style.display = 'none';
    document.querySelector('.hero-section').style.display = 'none';
    
    // Mostra a seção escolhida
    const mapaSecoes = {
        'inscricao': 'secaoInscricao',
        'eleicao': 'secaoEleicao',
        'tutores': 'secaoTutores',
        'verificar': 'secaoVerificar',
        'acolhimento': 'secaoAcolhimento'
    };
    
    const secaoId = mapaSecoes[secao];
    if (secaoId) {
        safeGet(secaoId).classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    
    // Carrega conteúdo específico
    if (secao === 'inscricao') carregarClubes();
    if (secao === 'tutores') carregarTutores();
}

function voltarHome() {
    document.body.classList.remove('modo-acolhimento');
    document.querySelectorAll('.section-content').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.action-grid')[0].style.display = 'grid';
    document.querySelector('.hero-section').style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================
// CURSOS E TURMAS
// ============================================
async function carregarCursosTurmas() {
    try {
        const response = await fetch('/api/protagonismo-publico/cursos-turmas');
        const data = await response.json();
        
        if (data.success) {
            cursos = data.cursos || [];
            turmas = data.turmas || [];
            vinculosCursoTurma = data.vinculosCursoTurma || {};
        }
    } catch (error) {
        console.error('Erro ao carregar cursos/turmas:', error);
    }
}

function preencherSelects() {
    // Curso (inscrição)
    const inscricaoCurso = safeGet('inscricaoCurso');
    if (inscricaoCurso) {
        inscricaoCurso.innerHTML = '<option value="">Selecione seu curso...</option>';
        cursos.forEach(c => {
            inscricaoCurso.innerHTML += `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`;
        });
    }
    
    // Turma (votação)
    const votoTurma = safeGet('votoTurma');
    if (votoTurma) {
        votoTurma.innerHTML = '<option value="">Selecione sua turma...</option>';
        turmas.forEach(t => {
            votoTurma.innerHTML += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`;
        });
    }
}

function carregarTurmasPorCurso() {
    const curso = safeGet('inscricaoCurso').value;
    const turmaSelect = safeGet('inscricaoTurma');
    
    if (!curso) {
        turmaSelect.innerHTML = '<option value="">Selecione o curso primeiro</option>';
        turmaSelect.disabled = true;
        return;
    }
    
    const turmasDoCurso = vinculosCursoTurma[curso] || [];
    
    turmaSelect.innerHTML = '<option value="">Selecione sua turma...</option>';
    turmasDoCurso.forEach(t => {
        turmaSelect.innerHTML += `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`;
    });
    
    turmaSelect.disabled = false;
}

// ============================================
// CLUBES DISPONÍVEIS
// ============================================
async function carregarClubes() {
    const grid = safeGet('clubesDisponiveisGrid');
    if (!grid) return;
    
    grid.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Carregando clubes...</p></div>';
    
    try {
        const response = await fetch('/api/protagonismo-publico/clubes');
        const data = await response.json();
        
        if (!data.success) {
            grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar clubes</p></div>';
            return;
        }
        
        if (!data.inscricoesAbertas) {
            grid.innerHTML = `<div class="empty-state">
                <i class="fas fa-lock"></i>
                <p>${data.mensagem || 'As inscrições ainda não foram abertas.'}</p>
            </div>`;
            safeGet('countClubesDisponiveis').textContent = '0 clubes';
            return;
        }
        
        clubesDisponiveis = data.clubes;
        safeGet('countClubesDisponiveis').textContent = `${data.clubes.length} clube${data.clubes.length !== 1 ? 's' : ''}`;
        
        if (data.clubes.length === 0) {
            grid.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>Nenhum clube disponível no momento.</p></div>';
            return;
        }
        
        grid.innerHTML = data.clubes.map(c => {
            const ocupacao = c.vagas > 0 ? ((c.vagas - c.vagasRestantes) / c.vagas * 100) : 0;
            const esgotado = c.esgotado;
            
            return `
                <div class="clube-public-card ${esgotado ? 'esgotado' : ''}" 
                     onclick="${esgotado ? '' : `selecionarClube('${c.id}')`}">
                    <div class="clube-public-header" style="background: linear-gradient(135deg, ${c.cor}, ${ajustarCor(c.cor)});">
                        <h4>${escapeHTML(c.nome)}</h4>
                        <p>${escapeHTML(c.descricao)}</p>
                        <span class="clube-vagas-badge">
                            ${esgotado ? '❌ Lotado' : `✅ ${c.vagasRestantes} vagas`}
                        </span>
                    </div>
                    <div class="clube-public-body">
                        <div class="clube-public-info">
                            <span><i class="fas fa-crown"></i> ${escapeHTML(c.lider || '-')}</span>
                        </div>
                        <div class="clube-public-info">
                            <span><i class="fas fa-map-marker-alt"></i> ${escapeHTML(c.local || '-')}</span>
                        </div>
                        <div class="clube-public-info">
                            <span><i class="fas fa-calendar"></i> ${escapeHTML(c.diaSemana || '-')}</span>
                            <strong>${c.horario || ''}</strong>
                        </div>
                        <div class="clube-progress">
                            <div class="clube-progress-fill ${esgotado ? 'lotado' : ''}" style="width: ${ocupacao}%"></div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Erro:', error);
        grid.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar</p></div>';
    }
}

function selecionarClube(clubeId) {
    const clube = clubesDisponiveis.find(c => c.id === clubeId);
    if (!clube) return;
    
    if (clube.esgotado) {
        mostrarErro('Clube Lotado', `O clube "${clube.nome}" não tem mais vagas disponíveis.`);
        return;
    }
    
    clubeSelecionado = clube;
    
    // Marcar visualmente
    document.querySelectorAll('.clube-public-card').forEach(card => {
        card.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');
    
    // Mostrar formulário
    safeGet('formInscricaoContainer').style.display = 'block';
    safeGet('clubeEscolhidoInfo').innerHTML = `
        <i class="fas fa-check-circle"></i> Você escolheu: <strong>${escapeHTML(clube.nome)}</strong>
        (${clube.vagasRestantes} vagas disponíveis)
    `;
    
    // Scroll para o formulário
    setTimeout(() => {
        safeGet('formInscricaoContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

// ============================================
// ENVIO DE INSCRIÇÃO
// ============================================
async function enviarInscricao() {
    if (!clubeSelecionado) {
        mostrarErro('Atenção', 'Escolha um clube primeiro.');
        return;
    }
    
    const nomeCompleto = safeGet('inscricaoNome').value.trim();
    const dataNascimento = safeGet('inscricaoDataNasc').value;
    const curso = safeGet('inscricaoCurso').value;
    const turma = safeGet('inscricaoTurma').value;
    const matricula = safeGet('inscricaoMatricula').value.trim();
    
    if (!nomeCompleto || !dataNascimento || !curso || !turma) {
        mostrarErro('Campos Obrigatórios', 'Preencha todos os campos marcados com *');
        return;
    }
    
    if (nomeCompleto.length < 5) {
        mostrarErro('Nome Inválido', 'Digite seu nome completo (mínimo 5 caracteres).');
        return;
    }
    
    const btn = safeGet('btnEnviarInscricao');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    
    try {
        const response = await fetch('/api/protagonismo-publico/inscricao', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nomeCompleto,
                dataNascimento,
                curso,
                turma,
                matricula,
                clubeId: clubeSelecionado.id
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarSucesso(
                'Inscrição Confirmada!',
                'Você foi inscrito com sucesso!',
                `
                    <div class="modal-detalhes-item"><span>Nome:</span><span>${escapeHTML(nomeCompleto)}</span></div>
                    <div class="modal-detalhes-item"><span>Clube:</span><span>${escapeHTML(clubeSelecionado.nome)}</span></div>
                    <div class="modal-detalhes-item"><span>Turma:</span><span>${escapeHTML(turma)}</span></div>
                    <div class="modal-detalhes-item"><span>Data:</span><span>${new Date().toLocaleString('pt-BR')}</span></div>
                `
            );
            
            // Reset
            safeGet('formInscricao').reset();
            safeGet('formInscricaoContainer').style.display = 'none';
            clubeSelecionado = null;
            document.querySelectorAll('.clube-public-card').forEach(c => c.classList.remove('selected'));
            
            // Recarrega clubes para atualizar vagas
            await carregarClubes();
        } else {
            mostrarErro('Erro', data.error || 'Erro ao processar inscrição.');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarErro('Erro de Conexão', 'Não foi possível conectar ao servidor.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Confirmar Inscrição';
    }
}

// ============================================
// VOTAÇÃO - IDENTIFICAÇÃO
// ============================================
async function carregarCandidatosParaVotar() {
    const nome = safeGet('votoNome').value.trim();
    const dataNasc = safeGet('votoDataNasc').value;
    const turma = safeGet('votoTurma').value;
    
    if (!nome || !dataNasc || !turma) {
        mostrarErro('Campos Obrigatórios', 'Preencha todos os campos.');
        return;
    }
    
    if (nome.length < 5) {
        mostrarErro('Nome Inválido', 'Digite seu nome completo.');
        return;
    }
    
    votacaoData = { nome, dataNascimento: dataNasc, turma };
    
    // Verificar se já votou
    try {
        const responseVerif = await fetch('/api/protagonismo-publico/verificar-voto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                eleitorNome: nome,
                eleitorDataNascimento: dataNasc
            })
        });
        
        const verifData = await responseVerif.json();
        
        if (verifData.jaVotouCompleto) {
            mostrarErro('Você já votou!', 'Identificamos que você já registrou seu voto para líder e vice-líder.');
            return;
        }
        
        // Se já votou só líder ou só vice, avisa
        if (verifData.jaVotouLider && verifData.jaVotouVice) {
            mostrarErro('Voto Completo', 'Você já votou para líder e vice-líder.');
            return;
        }
    } catch (error) {
        console.error('Erro ao verificar voto:', error);
    }
    
    // Carregar candidatos
    try {
        const response = await fetch(`/api/protagonismo-publico/candidatos?turma=${encodeURIComponent(turma)}`);
        const data = await response.json();
        
        if (!data.success || !data.eleicaoAberta) {
            mostrarErro('Eleição Fechada', data.mensagem || 'A eleição não está aberta.');
            return;
        }
        
        // Encontrar a turma
        const turmaData = data.turmas.find(t => t.turma === turma);
        
        if (!turmaData) {
            mostrarErro('Sem Candidatos', `Não há candidatos cadastrados para a turma ${turma}.`);
            return;
        }
        
        exibirCandidatos(turmaData);
        safeGet('candidatosVotacaoContainer').style.display = 'block';
        safeGet('formIdentificacao').closest('.form-public').style.display = 'none';
        
        setTimeout(() => {
            safeGet('candidatosVotacaoContainer').scrollIntoView({ behavior: 'smooth' });
        }, 100);
    } catch (error) {
        console.error('Erro:', error);
        mostrarErro('Erro', 'Não foi possível carregar os candidatos.');
    }
}

function exibirCandidatos(turmaData) {
    const gridLider = safeGet('candidatosLiderGrid');
    const gridVice = safeGet('candidatosViceGrid');
    
    // Líder
    if (turmaData.lider.length === 0) {
        gridLider.innerHTML = '<p class="text-muted">Nenhum candidato a líder cadastrado.</p>';
    } else {
        gridLider.innerHTML = turmaData.lider.map(c => `
            <div class="candidato-voto-card" data-candidato-id="${c.id}" data-cargo="lider"
                 onclick="selecionarCandidato('${c.id}', 'lider', '${escapeHTML(c.nome)}')">
                <img src="${c.fotoPerfil || gerarAvatarSVG(c.nome)}" 
                     class="candidato-voto-foto"
                     onerror="this.onerror=null; this.src='${gerarAvatarSVG(c.nome)}'">
                <h4>${escapeHTML(c.nome)}</h4>
                ${c.slogan ? `<p class="candidato-voto-slogan">"${escapeHTML(c.slogan)}"</p>` : ''}
            </div>
        `).join('');
    }
    
    // Vice
    if (turmaData.vice_lider.length === 0) {
        gridVice.innerHTML = '<p class="text-muted">Nenhum candidato a vice-líder cadastrado.</p>';
    } else {
        gridVice.innerHTML = turmaData.vice_lider.map(c => `
            <div class="candidato-voto-card" data-candidato-id="${c.id}" data-cargo="vice_lider"
                 onclick="selecionarCandidato('${c.id}', 'vice_lider', '${escapeHTML(c.nome)}')">
                <img src="${c.fotoPerfil || gerarAvatarSVG(c.nome)}" 
                     class="candidato-voto-foto"
                     onerror="this.onerror=null; this.src='${gerarAvatarSVG(c.nome)}'">
                <h4>${escapeHTML(c.nome)}</h4>
                ${c.slogan ? `<p class="candidato-voto-slogan">"${escapeHTML(c.slogan)}"</p>` : ''}
            </div>
        `).join('');
    }
    
    // Reset
    candidatoLiderSelecionado = null;
    candidatoViceSelecionado = null;
    atualizarResumoVoto();
}

function selecionarCandidato(candidatoId, cargo, nome) {
    if (cargo === 'lider') {
        candidatoLiderSelecionado = { id: candidatoId, nome };
    } else {
        candidatoViceSelecionado = { id: candidatoId, nome };
    }
    
    // Marca visual
    document.querySelectorAll(`.candidato-voto-card[data-cargo="${cargo}"]`).forEach(card => {
        card.classList.remove('selected');
    });
    event.currentTarget.classList.add('selected');
    
    // Atualiza etapas
    atualizarEtapas();
    atualizarResumoVoto();
}

function atualizarEtapas() {
    const stepLider = safeGet('stepLider');
    const stepVice = safeGet('stepVice');
    
    // Líder
    if (candidatoLiderSelecionado) {
        stepLider.classList.remove('active');
        stepLider.classList.add('done');
    } else {
        stepLider.classList.add('active');
        stepLider.classList.remove('done');
    }
    
    // Vice
    if (candidatoViceSelecionado) {
        stepVice.classList.remove('active');
        stepVice.classList.add('done');
    } else if (candidatoLiderSelecionado) {
        stepVice.classList.add('active');
        stepVice.classList.remove('done');
    } else {
        stepVice.classList.remove('active', 'done');
    }
}

function atualizarResumoVoto() {
    safeSetText('resumoLider', candidatoLiderSelecionado?.nome || 'Não escolhido');
    safeSetText('resumoVice', candidatoViceSelecionado?.nome || 'Não escolhido');
    
    // Habilita botão se pelo menos um foi escolhido
    const btn = safeGet('btnConfirmarVoto');
    const podeConfirmar = candidatoLiderSelecionado || candidatoViceSelecionado;
    
    if (btn) {
        btn.disabled = !podeConfirmar;
    }
    
    if (candidatoLiderSelecionado && candidatoViceSelecionado) {
        safeGet('stepConfirmar').classList.add('active');
    }
}

// ============================================
// CONFIRMAR VOTO
// ============================================
async function confirmarVoto() {
    if (!candidatoLiderSelecionado && !candidatoViceSelecionado) {
        mostrarErro('Atenção', 'Escolha pelo menos um candidato.');
        return;
    }
    
    const confirmado = await confirm(
        '📊 Confirme seu voto:\n\n' +
        `Líder: ${candidatoLiderSelecionado?.nome || 'Não votou'}\n` +
        `Vice-Líder: ${candidatoViceSelecionado?.nome || 'Não votou'}\n\n` +
        'Esta ação NÃO pode ser desfeita. Confirmar?'
    );
    
    if (!confirmado) return;
    
    const btn = safeGet('btnConfirmarVoto');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';
    
    try {
        const response = await fetch('/api/protagonismo-publico/voto', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                eleitorNome: votacaoData.nome,
                eleitorDataNascimento: votacaoData.dataNascimento,
                eleitorTurma: votacaoData.turma,
                candidatoLiderId: candidatoLiderSelecionado?.id || null,
                candidatoViceId: candidatoViceSelecionado?.id || null
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            mostrarSucesso(
                'Voto Confirmado!',
                'Obrigado por participar da eleição!',
                `
                    <div class="modal-detalhes-item"><span>Eleitor:</span><span>${escapeHTML(votacaoData.nome)}</span></div>
                    ${candidatoLiderSelecionado ? `<div class="modal-detalhes-item"><span>Líder:</span><span>${escapeHTML(candidatoLiderSelecionado.nome)}</span></div>` : ''}
                    ${candidatoViceSelecionado ? `<div class="modal-detalhes-item"><span>Vice:</span><span>${escapeHTML(candidatoViceSelecionado.nome)}</span></div>` : ''}
                    <div class="modal-detalhes-item"><span>Data:</span><span>${new Date().toLocaleString('pt-BR')}</span></div>
                `
            );
            
            // Reset
            resetarVotacao();
        } else {
            mostrarErro('Erro no Voto', data.error || 'Erro ao registrar voto.');
        }
    } catch (error) {
        console.error('Erro:', error);
        mostrarErro('Erro de Conexão', 'Não foi possível conectar ao servidor.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check-double"></i> Confirmar Voto';
    }
}

function resetarVotacao() {
    safeGet('formIdentificacao').reset();
    safeGet('candidatosVotacaoContainer').style.display = 'none';
    safeGet('formIdentificacao').closest('.form-public').style.display = 'block';
    
    candidatoLiderSelecionado = null;
    candidatoViceSelecionado = null;
    votacaoData = null;
    
    voltarHome();
}

// ============================================
// TUTORES
// ============================================
async function carregarTutores() {
    const container = safeGet('listaTutoresPublica');
    if (!container) return;
    
    container.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Carregando tutores...</p></div>';
    
    try {
        const response = await fetch('/api/protagonismo-publico/tutores');
        const data = await response.json();
        
        if (!data.success || !data.visivel) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-lock"></i><p>A lista de tutores não está disponível no momento.</p></div>';
            return;
        }
        
        const porTurma = data.porTurma || {};
        const turmas = Object.keys(porTurma);
        
        if (turmas.length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-chalkboard-teacher"></i><p>Nenhum tutor cadastrado ainda.</p></div>';
            return;
        }
        
        let html = '';
        turmas.sort().forEach(turma => {
            const tutores = porTurma[turma];
            html += `
                <div class="tutor-public-turma">
                    <h3><i class="fas fa-users-class"></i> Turma: ${escapeHTML(turma)}</h3>
                    <div class="tutor-public-grid">
                        ${tutores.map(t => `
                            <div class="tutor-public-card">
                                <h4><i class="fas fa-user-tie"></i> ${escapeHTML(t.nome)}</h4>
                                <p><strong>Área:</strong> ${escapeHTML(t.area)}</p>
                                <p><strong>Curso:</strong> ${escapeHTML(t.curso)}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Erro:', error);
        container.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar</p></div>';
    }
}

// ============================================
// VERIFICAR INSCRIÇÃO
// ============================================
async function verificarInscricao() {
    const nomeEl = document.getElementById('verificarNome');
    const dataEl = document.getElementById('verificarDataNasc');
    const resultadoDiv = document.getElementById('resultadoVerificacao');

    if (!nomeEl || !dataEl || !resultadoDiv) return;

    const nome = nomeEl.value.trim();
    const dataNasc = dataEl.value;

    if (!nome || !dataNasc) {
        if (typeof mostrarErro === 'function') {
            mostrarErro('Atenção', 'Preencha nome e data de nascimento.');
        } else {
            alert('Preencha nome e data de nascimento.');
        }
        return;
    }

    resultadoDiv.style.display = 'block';
    resultadoDiv.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Consultando...</p></div>';

    let inscricaoClube = null;
    let inscricaoAcolhedor = null;

    // Função auxiliar para fazer fetch seguro (não quebra se der 404)
    async function fetchSeguro(url, body) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            
            // Se o servidor retornar HTML em vez de JSON (ex: 404), isso evita o erro de syntax
            const text = await response.text();
            try {
                return JSON.parse(text);
            } catch (e) {
                return { success: false, error: `Falha ao ler resposta (Status: ${response.status})` };
            }
        } catch (e) {
            return { success: false, error: 'Erro de conexão.' };
        }
    }

    // 1️⃣ Tenta consultar CLUBE
    const resClube = await fetchSeguro('/api/protagonismo/verificar-inscricao', { 
        nomeCompleto: nome, 
        dataNascimento: dataNasc 
    });
    
    if (resClube.success && resClube.inscrito) {
        inscricaoClube = resClube.inscricao;
    }

    // 2️⃣ Tenta consultar ACOLHEDOR
    const resAcolhedor = await fetchSeguro('/api/acolhimento/publico/consultar', { 
        nomeCompleto: nome, 
        dataNascimento: dataNasc 
    });

    if (resAcolhedor.success && resAcolhedor.inscrito) {
        inscricaoAcolhedor = resAcolhedor.acolhedor;
    }

    // 3️⃣ Monta o HTML baseado no que encontrou
    let htmlResultado = '';

    if (inscricaoClube) {
        htmlResultado += `
            <div class="alert-success-box" style="background: #ecfdf5; border: 1px solid #10b981; padding: 20px; border-radius: 12px; margin-bottom: 15px;">
                <h4 style="color: #047857; margin-bottom: 10px;"><i class="fas fa-users"></i> Inscrição em Clube</h4>
                <p><strong>Clube:</strong> ${inscricaoClube.clubeNome}</p>
                <p><strong>Turma:</strong> ${inscricaoClube.turma}</p>
                <p><strong>Data:</strong> ${new Date(inscricaoClube.criadoEm).toLocaleDateString('pt-BR')}</p>
            </div>
        `;
    }

    if (inscricaoAcolhedor) {
        let corStatus = '#f59e0b'; // pendente
        let iconeStatus = 'fa-clock';
        
        if (inscricaoAcolhedor.status === 'aprovado') {
            corStatus = '#10b981';
            iconeStatus = 'fa-check-circle';
        } else if (inscricaoAcolhedor.status === 'rejeitado') {
            corStatus = '#ef4444';
            iconeStatus = 'fa-times-circle';
        }

        htmlResultado += `
            <div style="background: #fff; border: 2px solid ${corStatus}; padding: 20px; border-radius: 12px; margin-bottom: 15px;">
                <h4 style="color: ${corStatus}; margin-bottom: 10px;">
                    <i class="fas ${iconeStatus}"></i> Inscrição de Acolhedor
                </h4>
                <p><strong>Nome:</strong> ${inscricaoAcolhedor.nomeCompleto}</p>
                <p><strong>Turma:</strong> ${inscricaoAcolhedor.turma} • ${inscricaoAcolhedor.curso}</p>
                <p><strong>Data da Inscrição:</strong> ${new Date(inscricaoAcolhedor.createdAt).toLocaleDateString('pt-BR')}</p>
                <p style="font-size: 1.1rem; margin-top: 15px;">
                    <strong>Status:</strong> 
                    <span style="color: ${corStatus}; font-weight: bold; text-transform: uppercase;">
                        ${inscricaoAcolhedor.statusLabel}
                    </span>
                </p>
                ${inscricaoAcolhedor.motivoRejeicao ? `<p style="color: #ef4444; font-size: 0.9rem;"><strong>Motivo da Rejeição:</strong> ${inscricaoAcolhedor.motivoRejeicao}</p>` : ''}
            </div>
        `;
    }

    if (htmlResultado === '') {
        htmlResultado = `
            <div class="alert-warning-box" style="background: #fffbeb; border: 1px solid #f59e0b; padding: 20px; border-radius: 12px;">
                <h4 style="color: #b45309; margin-bottom: 10px;"><i class="fas fa-info-circle"></i> Nenhuma inscrição encontrada</h4>
                <p>Não encontramos nenhuma inscrição em clubes ou como acolhedor com esses dados.</p>
            </div>
        `;
    }

    resultadoDiv.innerHTML = htmlResultado;
}

// ============================================
// MODAIS
// ============================================
function mostrarSucesso(titulo, mensagem, detalhesHTML = '') {
    safeSetText('modalTitulo', titulo);
    safeSetText('modalMensagem', mensagem);
    
    const detalhes = safeGet('modalDetalhes');
    if (detalhes) {
        detalhes.innerHTML = detalhesHTML;
        detalhes.style.display = detalhesHTML ? 'block' : 'none';
    }
    
    safeGet('modalSucesso').classList.add('active');
}

function fecharModalSucesso() {
    safeGet('modalSucesso').classList.remove('active');
}

function mostrarErro(titulo, mensagem) {
    safeSetText('modalErroTitulo', titulo);
    safeSetText('modalErroMensagem', mensagem);
    safeGet('modalErro').classList.add('active');
}

function fecharModalErro() {
    safeGet('modalErro').classList.remove('active');
}

// ============================================
// 🆕 AJUDA VIA WHATSAPP
// ============================================
function configurarAjuda() {
    // Máscara de telefone no modal de ajuda
    const tel = safeGet('ajudaTelefone');
    if (tel && !tel.dataset.maskApplied) {
        tel.dataset.maskApplied = 'true';
        tel.addEventListener('input', (e) => {
            let v = e.target.value.replace(/\D/g, '').slice(0, 11);
            if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
            else if (v.length > 6) v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
            else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
            e.target.value = v;
        });
    }

    // Fecha o modal ao clicar no fundo escuro
    const overlay = safeGet('modalAjudaProtagonismo');
    if (overlay && !overlay.dataset.clickBound) {
        overlay.dataset.clickBound = 'true';
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) fecharAjuda();
        });
    }
}

function abrirAjuda() {
    const modal = safeGet('modalAjudaProtagonismo');
    if (!modal) return;
    modal.classList.add('ativo');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
        safeGet('ajudaNome')?.focus();
    }, 250);
}

function fecharAjuda() {
    const modal = safeGet('modalAjudaProtagonismo');
    if (!modal) return;
    modal.classList.remove('ativo');
    document.body.style.overflow = '';
}

function showToast(mensagem, tipo = 'info') {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; top: 20px; right: 20px;
        padding: 14px 20px; border-radius: 12px;
        background: ${tipo === 'success' ? '#10b981' : tipo === 'error' ? '#ef4444' : '#3b82f6'};
        color: white; font-size: 14px; font-weight: 500;
        box-shadow: 0 8px 20px rgba(0,0,0,0.2);
        z-index: 99999; max-width: 340px;
    `;
    toast.textContent = mensagem;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function enviarAjudaWhatsApp() {
    const nome = safeGet('ajudaNome')?.value?.trim();
    const telefone = safeGet('ajudaTelefone')?.value?.trim();
    const turma = safeGet('ajudaTurma')?.value?.trim();
    const curso = safeGet('ajudaCurso')?.value?.trim();
    const problema = safeGet('ajudaProblema')?.value?.trim();

    if (!nome || nome.length < 3) return showToast('Informe seu nome', 'error');
    if (!telefone || telefone.replace(/\D/g, '').length < 10) return showToast('Informe um telefone válido', 'error');
    if (!turma) return showToast('Informe a turma', 'error');
    if (!curso) return showToast('Informe o curso', 'error');
    if (!problema || problema.length < 10) return showToast('Descreva o problema (mínimo 10 caracteres)', 'error');

    const btn = safeGet('btnEnviarWhats');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Abrindo...';
    }

    try {
        const dataHora = new Date().toLocaleString('pt-BR');

        const mensagem =
            `*🆘 Preciso de Ajuda - Protagonismo Estudantil*\n\n` +
            `*Nome:* ${nome}\n` +
            `*Telefone:* ${telefone}\n` +
            `*Turma:* ${turma}\n` +
            `*Curso:* ${curso}\n\n` +
            `*Problema Enfrentado:*\n${problema}\n\n` +
            `_Enviado em: ${dataHora}_`;

        const url = `https://wa.me/${WHATSAPP_ESCOLA_PROTAGONISMO}?text=${encodeURIComponent(mensagem)}`;

        window.open(url, '_blank');

        showToast('✅ WhatsApp aberto! Estaremos respondendo assim que possível.', 'success');

        setTimeout(() => {
            ['ajudaNome', 'ajudaTelefone', 'ajudaTurma', 'ajudaCurso', 'ajudaProblema'].forEach(id => {
                const el = safeGet(id);
                if (el) el.value = '';
            });
            fecharAjuda();
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fab fa-whatsapp"></i> Enviar pelo WhatsApp';
            }
        }, 800);

    } catch (error) {
        console.error('❌ Erro ao abrir WhatsApp:', error);
        showToast('❌ Não foi possível abrir o WhatsApp. Tente novamente.', 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fab fa-whatsapp"></i> Enviar pelo WhatsApp';
        }
    }
}

/* ============================================
   ACOLHIMENTO (ACOLHEDORES) — PÁGINA PÚBLICA
   Versão robusta: wrap de mostrarSecao + window.*
   ============================================ */
(function () {
  'use strict';

  // Estado do módulo
  let acolhedorAlunoSelecionado = null;
  let acolhedorCanvasAluno = null;
  let acolhedorCanvasResp = null;
  let acolhedorInitAssinaturas = false;
  let acolhedorAbertoCache = null;
  let acolhedorBindFeito = false;

  const $ = (id) => document.getElementById(id);

  // --------------------------------------------
  // 1) WRAP DE mostrarSecao — roda depois do original
  // --------------------------------------------
  function instalarWrapMostrarSecao() {
    const original = window.mostrarSecao;

    // Evita duplicar
    if (original && original.__wrapAcolhimento) return;

    const wrapped = function (secao) {
      // Remove o modo acolhimento por padrão
      document.body.classList.remove('modo-acolhimento');

      if (secao === 'acolhimento') {
        // Adiciona classe para esconder o hero
        document.body.classList.add('modo-acolhimento');

        // Fecha todas as seções
        document.querySelectorAll('.section-content').forEach(s => {
          s.classList.remove('ativa');
          s.style.display = 'none';
        });

        const sec = $('secaoAcolhimento');
        if (!sec) {
          console.error('[acolhimento] #secaoAcolhimento não encontrada');
          return;
        }

        sec.classList.add('ativa');
        sec.style.display = 'block';

        // Esconde o grid de cards (home)
        const grid = document.querySelector('.action-grid');
        if (grid) grid.style.display = 'none';

        // Garante conteúdo interno
        const conteudo = $('acolhimentoConteudo');
        if (conteudo) conteudo.style.display = 'block';

        // Carrega dados
        carregarAcolhimento();
        setTimeout(initAssinaturasAcolhimento, 150);

        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      // Delega para o original, se existir
      if (typeof original === 'function') {
        return original.apply(this, arguments);
      }
    };

    wrapped.__wrapAcolhimento = true;
    window.mostrarSecao = wrapped;
    console.log('[acolhimento] ✅ wrap de mostrarSecao instalado');
  }

  // --------------------------------------------
  // 2) Carregamento status + turmas/cursos
  // --------------------------------------------
  async function carregarAcolhimento() {
    try {
      const [statusRes, optsRes] = await Promise.all([
        fetch('/api/acolhimento/status-publico').then(r => r.json()),
        fetch('/api/acolhimento/publico/turmas-cursos').then(r => r.json())
      ]);

      const fechado = $('acolhimentoFechado');
      const conteudo = $('acolhimentoConteudo');
      const bannerPrazo = $('acolhimentoPrazoBanner');
      const textoPrazo = $('textoPrazoAcolhimento');

      if (statusRes.success && !statusRes.acolhimentoAberto) {
        acolhedorAbertoCache = false;
        if (fechado) fechado.style.display = 'flex';
        if (conteudo) conteudo.style.display = 'none';
        if (bannerPrazo) bannerPrazo.style.display = 'none';
        const aviso = $('avisoAcolhimentoTexto');
        if (aviso) aviso.textContent = statusRes.avisoAcolhimento || 'Acolhimento fechado no momento.';
        return;
      }

      acolhedorAbertoCache = true;
      if (fechado) fechado.style.display = 'none';
      if (conteudo) conteudo.style.display = 'block';

      // 🆕 MONTA O BANNER DE PRAZO
      if (bannerPrazo && textoPrazo) {
        let texto = '';
        if (statusRes.dataFechamento) {
          const dataFim = new Date(statusRes.dataFechamento);
          const formatada = dataFim.toLocaleString('pt-BR', { 
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
          });
          texto = `Atenção: As inscrições estão abertas até <strong>${formatada}</strong>.`;
        } else if (statusRes.dataAbertura) {
          const dataIni = new Date(statusRes.dataAbertura);
          const formatada = dataIni.toLocaleString('pt-BR', { 
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
          });
          texto = `Atenção: As inscrições abrirão em <strong>${formatada}</strong>.`;
        }

        if (texto) {
          textoPrazo.innerHTML = texto;
          bannerPrazo.style.display = 'flex';
        } else {
          bannerPrazo.style.display = 'none';
        }
      }

      if (optsRes.success) {
        const selTurma = $('acolhimentoTurma');
        const selCurso = $('acolhimentoCurso');

        if (selTurma && selTurma.options.length <= 1) {
          (optsRes.turmas || []).forEach(t => {
            const o = document.createElement('option');
            o.value = t; o.textContent = t;
            selTurma.appendChild(o);
          });
        }
        if (selCurso && selCurso.options.length <= 1) {
          (optsRes.cursos || []).forEach(c => {
            const o = document.createElement('option');
            o.value = c; o.textContent = c;
            selCurso.appendChild(o);
          });
        }
      }
    } catch (e) {
      console.warn('[acolhimento] erro ao carregar:', e);
    }
  }

  // --------------------------------------------
  // 3) Busca de alunos
  // --------------------------------------------
  async function buscarAlunosAcolhimento() {
    if (acolhedorAbertoCache === false) return;

    const turma = ($('acolhimentoTurma')?.value || '').trim();
    const curso = ($('acolhimentoCurso')?.value || '').trim();
    const busca = ($('acolhimentoBusca')?.value || '').trim();

    if (!turma && !curso && busca.length < 3) {
      if (typeof window.mostrarErro === 'function') {
        window.mostrarErro('Atenção', 'Informe a turma, o curso ou pelo menos 3 letras do seu nome.');
      } else {
        alert('Informe a turma, o curso ou pelo menos 3 letras do seu nome.');
      }
      return;
    }

    const lista = $('acolhimentoListaAlunos');
    if (!lista) return;
    lista.innerHTML = '<div class="loading-state" style="grid-column:1/-1"><div class="spinner"></div><p>Buscando...</p></div>';

    try {
      const params = new URLSearchParams();
      if (turma) params.append('turma', turma);
      if (curso) params.append('curso', curso);
      if (busca) params.append('busca', busca);

      const res = await fetch(`/api/acolhimento/publico/alunos?${params.toString()}`).then(r => r.json());

      if (!res.success || !res.alunos || res.alunos.length === 0) {
        lista.innerHTML = '<div class="alert-warning-box" style="grid-column:1/-1"><i class="fas fa-info-circle"></i><span>Nenhum aluno encontrado. Confira os filtros.</span></div>';
        return;
      }

      lista.innerHTML = '';
      res.alunos.forEach(a => {
        const card = document.createElement('div');
        card.className = 'aluno-card-acolhimento';
        const inicial = (a.nome || '?').charAt(0).toUpperCase();
        const avatar = a.fotoPerfil
          ? `<img src="${a.fotoPerfil}" alt="">`
          : `<div class="avatar-fallback">${inicial}</div>`;
        card.innerHTML = `
          ${avatar}
          <div class="info">
            <h6>${a.nome}</h6>
            <small>${a.turma || '-'} • ${a.curso || '-'}</small>
          </div>
        `;
        card.addEventListener('click', () => selecionarAlunoAcolhimento(a));
        lista.appendChild(card);
      });
    } catch (e) {
      console.warn('[acolhimento] erro na busca:', e);
      lista.innerHTML = '<div class="alert-warning-box" style="grid-column:1/-1"><i class="fas fa-exclamation-triangle"></i><span>Erro ao buscar alunos.</span></div>';
    }
  }

  // --------------------------------------------
  // 4) Seleção de aluno
  // --------------------------------------------
  function selecionarAlunoAcolhimento(aluno) {
    console.log('👉 [Acolhimento] Aluno selecionado:', aluno);
    acolhedorAlunoSelecionado = aluno;

    const e1 = document.getElementById('acolhimentoEtapa1');
    const e2 = document.getElementById('acolhimentoEtapa2');
    const e3 = document.getElementById('acolhimentoEtapa3');
    
    if (e1) e1.style.display = 'none';
    if (e2) e2.style.display = 'block';
    if (e3) e3.style.display = 'none';

    const info = document.getElementById('acolhimentoAlunoSelecionado');
    if (info) {
      info.innerHTML = `<i class="fas fa-user-check"></i> Selecionado: <strong>${aluno.nome}</strong> — ${aluno.turma || '-'} • ${aluno.curso || '-'}`;
    }

    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setVal('acNome', aluno.nome);
    setVal('acMatricula', aluno.matricula);
    setVal('acTurma', aluno.turma);
    setVal('acCurso', aluno.curso);

    setTimeout(() => {
      initAssinaturasAcolhimento();
      if (e2) e2.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  // --------------------------------------------
  // 5) Canvas de assinatura
  // --------------------------------------------
  function initAssinaturasAcolhimento() {
    if (acolhedorInitAssinaturas) return;
    acolhedorInitAssinaturas = true;

    acolhedorCanvasAluno = $('canvasAssinaturaAluno');
    acolhedorCanvasResp = $('canvasAssinaturaResp');

    if (acolhedorCanvasAluno) initCanvasSignature(acolhedorCanvasAluno);
    if (acolhedorCanvasResp) initCanvasSignature(acolhedorCanvasResp);
  }

  function initCanvasSignature(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let desenhando = false;
    let ultimoPonto = null;

    function getPos(evt) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
      const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    }
    function inicio(evt) { evt.preventDefault(); desenhando = true; ultimoPonto = getPos(evt); }
    function mover(evt) {
      if (!desenhando) return;
      evt.preventDefault();
      const p = getPos(evt);
      ctx.beginPath();
      ctx.moveTo(ultimoPonto.x, ultimoPonto.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ultimoPonto = p;
      canvas.dataset.vazia = 'false';
    }
    function fim(evt) { if (evt) evt.preventDefault(); desenhando = false; ultimoPonto = null; }

    canvas.addEventListener('mousedown', inicio);
    canvas.addEventListener('mousemove', mover);
    canvas.addEventListener('mouseup', fim);
    canvas.addEventListener('mouseleave', fim);
    canvas.addEventListener('touchstart', inicio, { passive: false });
    canvas.addEventListener('touchmove', mover, { passive: false });
    canvas.addEventListener('touchend', fim, { passive: false });

    canvas.dataset.vazia = 'true';
  }

  function limparAssinatura(quem) {
    const canvas = quem === 'aluno' ? acolhedorCanvasAluno : acolhedorCanvasResp;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    canvas.dataset.vazia = 'true';
  }

  function getAssinatura(canvas) {
    if (!canvas) return '';
    if (canvas.dataset.vazia === 'true') return '';
    return canvas.toDataURL('image/png');
  }

  // --------------------------------------------
  // 6) Reset
  // --------------------------------------------
  function resetarAcolhimento() {
    acolhedorAlunoSelecionado = null;

    const e1 = $('acolhimentoEtapa1');
    const e2 = $('acolhimentoEtapa2');
    const e3 = $('acolhimentoEtapa3');
    if (e1) e1.style.display = 'block';
    if (e2) e2.style.display = 'none';
    if (e3) e3.style.display = 'none';

    const form = $('formAcolhedor');
    if (form) form.reset();

    const msg = $('acolhedorMsg');
    if (msg) msg.innerHTML = '';

    limparAssinatura('aluno');
    limparAssinatura('resp');

    const respBox = $('acResponsavelBox');
    const sigRespBox = $('assinaturaRespBox');
    if (respBox) respBox.style.display = 'none';
    if (sigRespBox) sigRespBox.style.display = 'none';
  }

    // --------------------------------------------
  // 6.1) Voltar para a HOME (após sucesso)
  // --------------------------------------------
  function voltarHomeAcolhimento() {
    // Remove a classe que esconde o hero
    document.body.classList.remove('modo-acolhimento');
    
    // Esconde a seção de acolhimento
    const secao = document.getElementById('secaoAcolhimento');
    if (secao) {
      secao.classList.remove('ativa');
      secao.style.display = 'none';
    }

    // Mostra os cards da home novamente
    const grid = document.querySelector('.action-grid');
    if (grid) grid.style.display = 'grid'; // ou 'flex', dependendo do seu CSS original

    // Reseta o formulário internamente para a próxima vez
    acolhedorAlunoSelecionado = null;
    const form = document.getElementById('formAcolhedor');
    if (form) form.reset();
    
    const msg = document.getElementById('acolhedorMsg');
    if (msg) msg.innerHTML = '';
    
    limparAssinatura('aluno');
    limparAssinatura('resp');
    
    const e1 = document.getElementById('acolhimentoEtapa1');
    const e2 = document.getElementById('acolhimentoEtapa2');
    const e3 = document.getElementById('acolhimentoEtapa3');
    if (e1) e1.style.display = 'block';
    if (e2) e2.style.display = 'none';
    if (e3) e3.style.display = 'none';

    const respBox = document.getElementById('acResponsavelBox');
    const sigRespBox = document.getElementById('assinaturaRespBox');
    if (respBox) respBox.style.display = 'none';
    if (sigRespBox) sigRespBox.style.display = 'none';

    // Rola para o topo suavemente
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // --------------------------------------------
  // 7) Envio
  // --------------------------------------------
  async function enviarInscricaoAcolhedor(evt) {
    evt.preventDefault();

    const nome = ($('acNome')?.value || '').trim();
    const dataNasc = $('acDataNasc')?.value || '';
    const turma = ($('acTurma')?.value || '').trim();
    const curso = ($('acCurso')?.value || '').trim();

    if (!nome || !dataNasc || !turma || !curso) {
      return mostrarMsgAcolhedor('Preencha nome, data, turma e curso.', 'erro');
    }
    if (!$('acAceitaTermos')?.checked || !$('acAceitaLgpd')?.checked) {
      return mostrarMsgAcolhedor('Você precisa aceitar os termos e a LGPD.', 'erro');
    }

    const assinaturaAluno = getAssinatura(acolhedorCanvasAluno);
    if (!assinaturaAluno) {
      return mostrarMsgAcolhedor('Assine no campo de assinatura do aluno.', 'erro');
    }

    const menor = $('acMenor')?.checked || false;
    let assinaturaResp = '';
    if (menor) {
      if (!($('acRespNome')?.value || '').trim() || !($('acRespTelefone')?.value || '').trim()) {
        return mostrarMsgAcolhedor('Informe os dados do responsável.', 'erro');
      }
      assinaturaResp = getAssinatura(acolhedorCanvasResp);
      if (!assinaturaResp) {
        return mostrarMsgAcolhedor('Assinatura do responsável é obrigatória.', 'erro');
      }
    }

    const disponibilidade = [];
    ['dispManha','dispTarde','dispNoite','dispIntegral'].forEach(id => {
      const el = $(id);
      if (el && el.checked) disponibilidade.push(el.value);
    });

    const payload = {
      alunoId: acolhedorAlunoSelecionado?.id || null,
      nomeCompleto: nome,
      dataNascimento: dataNasc,
      matricula: ($('acMatricula')?.value || '').trim(),
      turma, curso,
      fotoPerfil: acolhedorAlunoSelecionado?.fotoPerfil || '',
      email: ($('acEmail')?.value || '').trim(),
      telefone: ($('acTelefone')?.value || '').trim(),
      whatsapp: ($('acWhatsapp')?.value || '').trim(),
      menorDeIdade: menor,
      responsavelNome: ($('acRespNome')?.value || '').trim(),
      responsavelTelefone: ($('acRespTelefone')?.value || '').trim(),
      responsavelParentesco: ($('acRespParentesco')?.value || '').trim(),
      porqueSerAcolhedor: ($('acPorque')?.value || '').trim(),
      disponibilidade,
      aceitaTermos: true,
      aceitaLgpd: true,
      assinaturaAluno,
      assinaturaResponsavel: assinaturaResp
    };

    const btn = $('btnEnviarAcolhedor');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    }

    try {
      const res = await fetch('/api/acolhimento/publico/inscrever', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(r => r.json());

      if (!res.success) {
        mostrarMsgAcolhedor(res.error || 'Erro ao enviar.', 'erro');
        return;
      }

      const e2 = $('acolhimentoEtapa2');
      const e3 = $('acolhimentoEtapa3');
      if (e2) e2.style.display = 'none';
      if (e3) e3.style.display = 'block';

      const resumo = $('acolhedorResumo');
      if (resumo) {
        resumo.innerHTML = `
          <strong>${res.acolhedor.nomeCompleto}</strong><br>
          ${res.acolhedor.turma} • ${res.acolhedor.curso}<br>
          <small>Status: <strong>Pendente de aprovação</strong></small>
        `;
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      console.warn('[acolhimento] erro envio:', e);
      mostrarMsgAcolhedor('Erro de conexão. Tente novamente.', 'erro');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar inscrição';
      }
    }
  }

  function mostrarMsgAcolhedor(msg, tipo) {
    const el = $('acolhedorMsg');
    if (!el) return;
    const icone = tipo === 'erro' ? 'fa-exclamation-triangle' : 'fa-check-circle';
    el.innerHTML = `<div class="alert-warning-box"><i class="fas ${icone}"></i><span>${msg}</span></div>`;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // --------------------------------------------
  // 8) Bind de eventos
  // --------------------------------------------
  function bindAcolhimento() {
    if (acolhedorBindFeito) return;
    acolhedorBindFeito = true;

    const btnBusca = $('btnBuscarAlunos');
    if (btnBusca) btnBusca.addEventListener('click', buscarAlunosAcolhimento);

    const inputBusca = $('acolhimentoBusca');
    if (inputBusca) {
      inputBusca.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); buscarAlunosAcolhimento(); }
      });
    }

    const menor = $('acMenor');
    if (menor) {
      menor.addEventListener('change', () => {
        const box = $('acResponsavelBox');
        const sigBox = $('assinaturaRespBox');
        const isMenor = menor.checked;
        if (box) box.style.display = isMenor ? 'block' : 'none';
        if (sigBox) sigBox.style.display = isMenor ? 'block' : 'none';
        if (isMenor) setTimeout(initAssinaturasAcolhimento, 50);
      });
    }

    const form = $('formAcolhedor');
    if (form) form.addEventListener('submit', enviarInscricaoAcolhedor);

    const btnVoltar = $('btnVoltarAcolhimento');
    if (btnVoltar) btnVoltar.addEventListener('click', resetarAcolhimento);

    const btnVoltarHome = $('btnVoltarHomeAcolhimento');
    if (btnVoltarHome) {
    }

    document.querySelectorAll('[data-limpar]').forEach(btn => {
      btn.addEventListener('click', () => {
        const quem = btn.getAttribute('data-limpar');
        limparAssinatura(quem);
      });
    });
  }

  // --------------------------------------------
  // 9) EXPOR EM window (para os onclick inline)
  // --------------------------------------------
  window.carregarAcolhimento = carregarAcolhimento;
  window.buscarAlunosAcolhimento = buscarAlunosAcolhimento;
  window.selecionarAlunoAcolhimento = selecionarAlunoAcolhimento;
  window.enviarInscricaoAcolhedor = enviarInscricaoAcolhedor;
  window.resetarAcolhimento = resetarAcolhimento;
  window.limparAssinatura = limparAssinatura;
  window.voltarHomeAcolhimento = voltarHomeAcolhimento;

  // --------------------------------------------
  // 10) Boot: instala o wrap DEPOIS do DOMContentLoaded
  //     (garante que o protagonismo-publico.js já definiu mostrarSecao)
  // --------------------------------------------
  function boot() {
    instalarWrapMostrarSecao();
    bindAcolhimento();
    console.log('[acolhimento] ✅ módulo pronto. Funções expostas em window.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    // Se o arquivo for carregado depois, ainda roda no próximo tick
    setTimeout(boot, 0);
  }
})();

// ============================================
// EXPORTAR FUNÇÕES GLOBAIS
// ============================================
window.mostrarSecao = mostrarSecao;
window.voltarHome = voltarHome;
window.carregarTurmasPorCurso = carregarTurmasPorCurso;
window.selecionarClube = selecionarClube;
window.enviarInscricao = enviarInscricao;
window.carregarCandidatosParaVotar = carregarCandidatosParaVotar;
window.selecionarCandidato = selecionarCandidato;
window.confirmarVoto = confirmarVoto;
window.verificarInscricao = verificarInscricao;
window.fecharModalSucesso = fecharModalSucesso;
window.fecharModalErro = fecharModalErro;

// 🆕 Ajuda via WhatsApp
window.abrirAjuda = abrirAjuda;
window.fecharAjuda = fecharAjuda;
window.enviarAjudaWhatsApp = enviarAjudaWhatsApp;