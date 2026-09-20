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
});

// ============================================
// STATUS DO SISTEMA
// ============================================
async function carregarStatus() {
    try {
        const response = await fetch('/api/protagonismo-publico/status');
        const data = await response.json();
        
        if (data.success) {
            statusSistema = data.status;
            atualizarStatusUI();
        }
    } catch (error) {
        console.error('Erro ao carregar status:', error);
    }
}

function atualizarStatusUI() {
    // Status das pílulas
    const pillInscricoes = safeGet('statusInscricoes');
    const pillEleicao = safeGet('statusEleicao');
    
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
    
    // Habilita/desabilita cards
    const cardInscricao = safeGet('cardInscricao');
    const cardEleicao = safeGet('cardEleicao');
    const cardTutores = safeGet('cardTutores');
    
    if (cardInscricao) cardInscricao.disabled = !statusSistema.inscricoesClubesAbertas;
    if (cardEleicao) cardEleicao.disabled = !statusSistema.eleicaoLiderAberta;
    if (cardTutores) cardTutores.disabled = !statusSistema.tutoriaVisivel;
    
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
        'verificar': 'secaoVerificar'
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
    const nome = safeGet('verificarNome').value.trim();
    const dataNasc = safeGet('verificarDataNasc').value;
    
    if (!nome || !dataNasc) {
        mostrarErro('Atenção', 'Preencha todos os campos.');
        return;
    }
    
    const resultadoDiv = safeGet('resultadoVerificacao');
    resultadoDiv.style.display = 'block';
    resultadoDiv.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Consultando...</p></div>';
    
    try {
        const response = await fetch('/api/protagonismo-publico/verificar-inscricao', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nomeCompleto: nome, dataNascimento: dataNasc })
        });
        
        const data = await response.json();
        
        if (data.success && data.inscrito) {
            resultadoDiv.innerHTML = `
                <div class="form-public" style="border-left: 5px solid var(--accent-green);">
                    <div style="text-align: center;">
                        <div class="modal-icon sucesso" style="width: 70px; height: 70px; font-size: 32px;">
                            <i class="fas fa-check-circle"></i>
                        </div>
                        <h3 style="color: #065f46; margin-bottom: 8px;">Inscrição Confirmada!</h3>
                        <p class="text-muted">Você está inscrito no clube:</p>
                        <h2 style="color: var(--primary); margin: 16px 0;">${escapeHTML(data.inscricao.clubeNome)}</h2>
                        <div style="text-align: left; max-width: 400px; margin: 20px auto; padding: 16px; background: #f9fafb; border-radius: 12px;">
                            <div class="modal-detalhes-item"><span>Turma:</span><span>${escapeHTML(data.inscricao.turma)}</span></div>
                            <div class="modal-detalhes-item"><span>Data:</span><span>${new Date(data.inscricao.criadoEm).toLocaleDateString('pt-BR')}</span></div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            resultadoDiv.innerHTML = `
                <div class="form-public" style="border-left: 5px solid var(--accent-yellow);">
                    <div style="text-align: center;">
                        <div class="modal-icon" style="background: linear-gradient(135deg, #f59e0b, #d97706); width: 70px; height: 70px; font-size: 32px;">
                            <i class="fas fa-info-circle"></i>
                        </div>
                        <h3 style="color: #92400e; margin-bottom: 8px;">Nenhuma Inscrição Encontrada</h3>
                        <p class="text-muted">Você ainda não se inscreveu em nenhum clube.</p>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Erro:', error);
        resultadoDiv.innerHTML = '<div class="empty-state"><p>Erro ao verificar. Tente novamente.</p></div>';
    }
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