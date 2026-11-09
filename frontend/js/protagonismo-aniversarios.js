// frontend/js/protagonismo-aniversarios.js
// ============================================
// MÓDULO DE ANIVERSÁRIOS - PROTAGONISMO
// ============================================

const API_ANIV = '/api/protagonismo';

function getTokenAniv() {
    return localStorage.getItem('auth_token');
}

function headersAniv() {
    return {
        'Authorization': `Bearer ${getTokenAniv()}`,
        'Content-Type': 'application/json'
    };
}

function mostrarAlertaAniv(msg, tipo = 'info') {
    if (typeof window.mostrarAlerta === 'function') {
        window.mostrarAlerta(msg, tipo);
        return;
    }
    if (typeof Swal !== 'undefined') {
        Swal.fire({ icon: tipo, title: msg, timer: 2500, showConfirmButton: false });
        return;
    }
    console.log(`[${tipo}] ${msg}`);
}

// ============================================
// VARIÁVEIS GLOBAIS
// ============================================
let _usuariosAnivCache = {};
let _pickerConfigurado = false;
let _pickerTimeout = null;

// ============================================
// NAVEGAÇÃO
// ============================================
function irParaAniversarios(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const dd = document.getElementById('userDropdown');
    if (dd) dd.classList.remove('show');
    const trig = document.getElementById('userTrigger');
    if (trig) trig.classList.remove('active');

    const btn = document.getElementById('aba-aniversarios');
    if (btn && typeof bootstrap !== 'undefined') {
        const tab = new bootstrap.Tab(btn);
        tab.show();
    }

    carregarAniversarios();
    carregarProximosAniversarios();
}
window.irParaAniversarios = irParaAniversarios;

// ============================================
// CARREGAR LISTA POR MÊS
// ============================================
async function carregarAniversarios() {
    const container = document.getElementById('listaAniversariosPorMes');
    if (!container) return;

    const busca = document.getElementById('buscaAniversario')?.value || '';
    const mes = document.getElementById('filtroMesAniversario')?.value || '';

    const params = new URLSearchParams();
    if (busca) params.append('busca', busca);
    if (mes) params.append('mes', mes);

    try {
        const resp = await fetch(`${API_ANIV}/aniversarios?${params}`, { headers: headersAniv() });
        const data = await resp.json();

        if (!data.success) {
            container.innerHTML = `<p class="text-danger">Erro: ${data.error}</p>`;
            return;
        }

        const meses = data.mes ? [data.mes] : data.porMes;

        if (!meses || meses.length === 0) {
            container.innerHTML = `<p class="text-muted text-center py-4">
                <i class="fas fa-birthday-cake fa-2x mb-2" style="color:#ec4899;opacity:0.3;"></i><br>
                Nenhum aniversário cadastrado ainda. Clique em "Sincronizar do Banco" ou "Novo Aniversário".
            </p>`;
            return;
        }

        let html = '';
        meses.forEach(m => {
            if (!mes && m.total === 0) return;

            const total = m.total;
            const badge = total > 0
                ? `<span class="badge" style="background:white;color:#be185d;font-size:12px;">${total}</span>`
                : `<span class="badge" style="background:rgba(255,255,255,0.3);font-size:12px;">0</span>`;

            html += `
                <div class="mes-header" onclick="toggleMesAniv(${m.mes})">
                    <div>
                        <i class="fas fa-calendar-alt me-2"></i> ${m.nomeMes}
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        ${badge}
                        <i class="fas fa-chevron-down" id="chevronMes${m.mes}"></i>
                    </div>
                </div>
                <div class="mes-body" id="mesBody${m.mes}">
                    ${m.aniversariantes.length === 0
                        ? `<p class="text-muted small mb-0"><i class="fas fa-info-circle"></i> Nenhum aniversariante em ${m.nomeMes}</p>`
                        : m.aniversariantes.map(a => renderAniversarioCard(a, m.mes)).join('')
                    }
                </div>
            `;
        });

        if (!html) {
            html = `<p class="text-muted text-center py-4">Nenhum resultado para os filtros aplicados.</p>`;
        }

        container.innerHTML = html;
    } catch (err) {
        console.error('Erro ao carregar aniversários:', err);
        container.innerHTML = `<p class="text-danger">Erro ao carregar aniversários.</p>`;
    }
}
window.carregarAniversarios = carregarAniversarios;

function renderAniversarioCard(a, mes) {
    const hoje = new Date();
    const isHoje = (hoje.getMonth() + 1) === mes && hoje.getDate() === a.dia;

    const avatar = a.fotoPerfil
        ? `<img src="${a.fotoPerfil.startsWith('/') ? window.location.origin + a.fotoPerfil : a.fotoPerfil}" alt="${a.nome}">`
        : a.nome.charAt(0).toUpperCase();

    const origemBadge = a.origem === 'manual'
        ? `<span class="badge-manual">Manual</span>`
        : `<span class="badge-auto">Auto</span>`;

    const hojeBadge = isHoje ? `<span class="badge-hoje">🎉 HOJE!</span>` : '';

    const roleLabel = a.role && a.role !== 'aluno' && a.role !== 'manual'
        ? `<span class="badge bg-secondary ms-1" style="font-size:9px;text-transform:uppercase;">${a.role}</span>`
        : '';

    return `
        <div class="aniversario-card">
            <div class="aniversario-avatar">${avatar}</div>
            <div class="aniversario-info">
                <div class="aniversario-nome">
                    ${a.nome} ${hojeBadge} ${roleLabel}
                </div>
                <div class="aniversario-detalhes">
                    ${a.turma ? `<i class="fas fa-users"></i> ${a.turma}` : ''}
                    ${a.curso ? ` • ${a.curso}` : ''}
                    ${origemBadge}
                </div>
            </div>
            <div class="d-flex align-items-center gap-2">
                <div class="aniversario-dia">Dia ${a.dia}</div>
                <button class="btn btn-sm btn-outline-secondary" onclick="editarAniversario('${a.id}')" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-outline-info" onclick="testarNotificacaoAniversario('${a.id}')" title="Testar notificação">
                    <i class="fas fa-paper-plane"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="excluirAniversario('${a.id}', '${a.nome.replace(/'/g, "\\'")}')" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `;
}

function toggleMesAniv(mes) {
    const body = document.getElementById(`mesBody${mes}`);
    const chev = document.getElementById(`chevronMes${mes}`);
    if (!body) return;
    const aberto = body.style.display !== 'none';
    body.style.display = aberto ? 'none' : 'block';
    if (chev) {
        chev.style.transform = aberto ? 'rotate(-90deg)' : 'rotate(0deg)';
        chev.style.transition = 'transform 0.2s';
    }
}
window.toggleMesAniv = toggleMesAniv;

// ============================================
// PRÓXIMOS ANIVERSÁRIOS
// ============================================
async function carregarProximosAniversarios() {
    const container = document.getElementById('listaProximosAniversarios');
    if (!container) return;

    try {
        const resp = await fetch(`${API_ANIV}/aniversarios/proximos`, { headers: headersAniv() });
        const data = await resp.json();

        if (!data.success || !data.proximos || data.proximos.length === 0) {
            container.innerHTML = `<p class="text-muted mb-0"><i class="fas fa-info-circle"></i> Nenhum aniversário nos próximos 60 dias.</p>`;
            return;
        }

        container.innerHTML = `
            <div class="row g-3">
                ${data.proximos.map(p => {
                    const dias = p.diasFaltando;
                    const label = dias === 0 ? 'HOJE' : dias === 1 ? 'AMANHÃ' : `${dias}`;
                    const sublabel = dias === 0 ? '' : dias === 1 ? '' : 'dias';

                    return `
                        <div class="col-md-3 col-6">
                            <div class="proximo-aniversario-card">
                                <div class="dias">${label}</div>
                                <div class="dias-label">${sublabel}</div>
                                <div class="nome">${p.nome}</div>
                                <div class="data">
                                    ${p.dia}/${String(p.mes).padStart(2, '0')}
                                    ${p.turma ? ` • ${p.turma}` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } catch (err) {
        console.error('Erro ao carregar próximos:', err);
        container.innerHTML = `<p class="text-danger mb-0">Erro ao carregar.</p>`;
    }
}
window.carregarProximosAniversarios = carregarProximosAniversarios;

// ============================================
// SINCRONIZAR
// ============================================
async function sincronizarAniversarios() {
    if (!confirm('Buscar datas de nascimento de TODOS os usuários ativos no banco de dados?\n\nAniversários "auto" serão atualizados. Aniversários "manuais" serão preservados.')) return;

    try {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                title: 'Sincronizando...',
                html: 'Buscando usuários com data de nascimento...',
                didOpen: () => Swal.showLoading(),
                allowOutsideClick: false
            });
        }

        const resp = await fetch(`${API_ANIV}/aniversarios/sincronizar`, {
            method: 'POST',
            headers: headersAniv()
        });
        const data = await resp.json();

        if (typeof Swal !== 'undefined') Swal.close();

        if (data.success) {
            mostrarAlertaAniv(data.message, 'success');
            carregarAniversarios();
            carregarProximosAniversarios();
        } else {
            mostrarAlertaAniv('Erro: ' + data.error, 'error');
        }
    } catch (err) {
        if (typeof Swal !== 'undefined') Swal.close();
        console.error('Erro na sincronização:', err);
        mostrarAlertaAniv('Erro ao sincronizar.', 'error');
    }
}
window.sincronizarAniversarios = sincronizarAniversarios;

// ============================================
// MODAL - NOVO / EDITAR
// ============================================
function abrirModalAniversario() {
    document.getElementById('aniversarioId').value = '';
    document.getElementById('aniversarioUsuarioId').value = '';
    document.getElementById('aniversarioNome').value = '';
    document.getElementById('aniversarioData').value = '';
    document.getElementById('aniversarioEmail').value = '';
    document.getElementById('aniversarioTelefone').value = '';
    document.getElementById('aniversarioTurma').value = '';
    document.getElementById('aniversarioCurso').value = '';
    document.getElementById('modalAniversarioTitulo').textContent = 'Novo Aniversário';

    const campoTurma = document.getElementById('aniversarioTurma');
    const campoCurso = document.getElementById('aniversarioCurso');
    if (campoTurma) campoTurma.disabled = false;
    if (campoCurso) campoCurso.disabled = false;

    const select = document.getElementById('selectUsuarioAniversario');
    if (select) select.value = '';
    const busca = document.getElementById('buscaUsuarioAniversario');
    if (busca) busca.value = '';
    const resultados = document.getElementById('resultadosBuscaUsuario');
    if (resultados) {
        resultados.style.display = 'none';
        resultados.innerHTML = '';
    }

    configurarPickerUsuarios();
    carregarSelectUsuarios();

    const modal = new bootstrap.Modal(document.getElementById('modalAniversario'));
    modal.show();
}
window.abrirModalAniversario = abrirModalAniversario;

// ============================================
// SELECT DE USUÁRIOS E AUTOCOMPLETE
// ============================================
function configurarPickerUsuarios() {
    if (_pickerConfigurado) return;
    _pickerConfigurado = true;

    const input = document.getElementById('buscaUsuarioAniversario');
    if (input) {
        input.addEventListener('input', function () {
            const q = this.value.trim();
            const container = document.getElementById('resultadosBuscaUsuario');

            if (q.length < 2) {
                container.style.display = 'none';
                container.innerHTML = '';
                return;
            }

            clearTimeout(_pickerTimeout);
            _pickerTimeout = setTimeout(() => buscarPerfisAniversario(q), 300);
        });
    }

    document.addEventListener('click', function (e) {
        const container = document.getElementById('resultadosBuscaUsuario');
        const input = document.getElementById('buscaUsuarioAniversario');
        if (container && input && !container.contains(e.target) && e.target !== input) {
            container.style.display = 'none';
        }
    });
}

async function carregarSelectUsuarios() {
    const select = document.getElementById('selectUsuarioAniversario');
    if (!select) return;

    select.innerHTML = '<option value="">Carregando perfis...</option>';

    try {
        const resp = await fetch(`${API_ANIV}/aniversarios/buscar-perfis?q=&limit=1000`, {
            headers: headersAniv()
        });
        const data = await resp.json();

        if (!data.success || !data.usuarios || data.usuarios.length === 0) {
            select.innerHTML = '<option value="">Nenhum perfil encontrado</option>';
            return;
        }

        _usuariosAnivCache = {};
        data.usuarios.forEach(u => { _usuariosAnivCache[u.id] = u; });

        const ordenados = [...data.usuarios].sort((a, b) => a.nome.localeCompare(b.nome));

        let html = '<option value="">Selecione um perfil...</option>';
        
        const alunos = ordenados.filter(u => u.role === 'aluno');
        if (alunos.length > 0) {
            html += '<optgroup label="Alunos">';
            alunos.forEach(u => {
                html += `<option value="${u.id}">${u.nome}${u.turma ? ' — ' + u.turma : ''}</option>`;
            });
            html += '</optgroup>';
        }

        const outrosRoles = ordenados.filter(u => u.role !== 'aluno');
        if (outrosRoles.length > 0) {
            html += '<optgroup label="Outros Perfis">';
            outrosRoles.forEach(u => {
                const roleLabel = (u.role || '').replace('_', ' ');
                html += `<option value="${u.id}">${u.nome} (${roleLabel})</option>`;
            });
            html += '</optgroup>';
        }

        select.innerHTML = html;
    } catch (err) {
        console.error('Erro ao carregar select de perfis:', err);
        select.innerHTML = '<option value="">Erro ao carregar perfis</option>';
    }
}
window.carregarSelectUsuarios = carregarSelectUsuarios;

async function buscarPerfisAniversario(q) {
    const container = document.getElementById('resultadosBuscaUsuario');
    if (!container) return;

    container.style.display = 'block';
    container.innerHTML = '<div class="list-group-item text-muted"><i class="fas fa-spinner fa-spin me-2"></i>Buscando...</div>';

    try {
        const resp = await fetch(`${API_ANIV}/aniversarios/buscar-perfis?q=${encodeURIComponent(q)}`, {
            headers: headersAniv()
        });
        const data = await resp.json();

        if (!data.success) {
            container.innerHTML = `<div class="list-group-item text-danger">Erro: ${data.error}</div>`;
            return;
        }

        if (!data.usuarios || data.usuarios.length === 0) {
            container.innerHTML = '<div class="list-group-item text-muted"><i class="fas fa-info-circle me-2"></i>Nenhum usuário encontrado.</div>';
            return;
        }

        data.usuarios.forEach(u => { _usuariosAnivCache[u.id] = u; });

        container.innerHTML = data.usuarios.map(u => {
            const roleLabel = u.role && u.role !== 'aluno'
                ? `<span class="badge bg-secondary ms-1" style="font-size:9px;text-transform:uppercase;">${u.role}</span>`
                : '';

            return `
                <a href="#" class="list-group-item list-group-item-action" onclick="selecionarPerfilAniversario('${u.id}'); return false;">
                    <div class="d-flex justify-content-between align-items-center gap-2">
                        <div>
                            <strong>${u.nome}</strong> ${roleLabel}
                            <br>
                            <small class="text-muted">
                                ${u.matricula ? `Mat: ${u.matricula}` : ''}
                                ${u.email ? ` • ${u.email}` : ''}
                                ${u.turma ? ` • ${u.turma}` : ''}
                            </small>
                        </div>
                        <div class="text-end">
                            <small class="text-muted">${u.dataNascimento ? new Date(u.dataNascimento + 'T12:00:00').toLocaleDateString('pt-BR') : 'Sem data'}</small>
                        </div>
                    </div>
                </a>
            `;
        }).join('');
    } catch (err) {
        console.error('Erro ao buscar perfis:', err);
        container.innerHTML = '<div class="list-group-item text-danger">Erro ao buscar. Verifique a conexão.</div>';
    }
}

function selecionarPerfilPorSelect(usuarioId) {
    if (!usuarioId) {
        document.getElementById('aniversarioUsuarioId').value = '';
        return;
    }
    const u = _usuariosAnivCache[usuarioId];
    if (!u) return;

    preencherCamposComPerfil(u);
    
    const busca = document.getElementById('buscaUsuarioAniversario');
    if (busca) busca.value = '';
    const resultados = document.getElementById('resultadosBuscaUsuario');
    if (resultados) resultados.style.display = 'none';
}
window.selecionarPerfilPorSelect = selecionarPerfilPorSelect;

function selecionarPerfilAniversario(usuarioId) {
    const u = _usuariosAnivCache[usuarioId];
    if (!u) return;

    preencherCamposComPerfil(u);

    const select = document.getElementById('selectUsuarioAniversario');
    if (select) select.value = usuarioId;

    document.getElementById('buscaUsuarioAniversario').value = u.nome;
    document.getElementById('resultadosBuscaUsuario').style.display = 'none';

    mostrarAlertaAniv(`Perfil de ${u.nome} selecionado`, 'info');
}
window.selecionarPerfilAniversario = selecionarPerfilAniversario;

function preencherCamposComPerfil(u) {
    document.getElementById('aniversarioUsuarioId').value = u.id;
    document.getElementById('aniversarioNome').value = u.nome || '';
    document.getElementById('aniversarioEmail').value = u.email || '';
    document.getElementById('aniversarioTelefone').value = u.telefone || '';

    // Se tiver data de nascimento no banco, preenche. Se não, limpa para o admin digitar.
    document.getElementById('aniversarioData').value = u.dataNascimento || '';

    const campoTurma = document.getElementById('aniversarioTurma');
    const campoCurso = document.getElementById('aniversarioCurso');
    
    // Só preenche turma/curso se for aluno ou tiver dados específicos
    if (u.role === 'aluno' || u.turma || u.curso) {
        campoTurma.value = u.turma || '';
        campoCurso.value = u.curso || '';
        campoTurma.disabled = false;
        campoCurso.disabled = false;
    } else {
        // Outros perfis (professor, admin, etc.): limpa e desabilita
        campoTurma.value = '';
        campoCurso.value = '';
        campoTurma.disabled = true;
        campoCurso.disabled = true;
    }
}
window.preencherCamposComPerfil = preencherCamposComPerfil;

// ============================================
// EDITAR E SALVAR
// ============================================
async function editarAniversario(id) {
    try {
        const resp = await fetch(`${API_ANIV}/aniversarios`, { headers: headersAniv() });
        const data = await resp.json();

        let encontrado = null;
        if (data.success && data.porMes) {
            for (const m of data.porMes) {
                encontrado = m.aniversariantes.find(a => a.id === id);
                if (encontrado) break;
            }
        }

        if (!encontrado) {
            mostrarAlertaAniv('Aniversário não encontrado.', 'error');
            return;
        }

        document.getElementById('aniversarioId').value = encontrado.id;
        document.getElementById('aniversarioUsuarioId').value = encontrado.usuarioId || '';
        document.getElementById('aniversarioNome').value = encontrado.nome;
        document.getElementById('aniversarioData').value = encontrado.dataNascimento
            ? new Date(encontrado.dataNascimento).toISOString().split('T')[0]
            : '';
        document.getElementById('aniversarioEmail').value = encontrado.email || '';
        document.getElementById('aniversarioTelefone').value = encontrado.telefone || '';
        
        const campoTurma = document.getElementById('aniversarioTurma');
        const campoCurso = document.getElementById('aniversarioCurso');
        campoTurma.value = encontrado.turma || '';
        campoCurso.value = encontrado.curso || '';
        
        if (!encontrado.turma && !encontrado.curso && encontrado.role !== 'aluno') {
            campoTurma.disabled = true;
            campoCurso.disabled = true;
        } else {
            campoTurma.disabled = false;
            campoCurso.disabled = false;
        }

        document.getElementById('modalAniversarioTitulo').textContent = 'Editar Aniversário';

        configurarPickerUsuarios();
        carregarSelectUsuarios();
        
        if (encontrado.usuarioId) {
            const select = document.getElementById('selectUsuarioAniversario');
            if (select) select.value = encontrado.usuarioId;
            const busca = document.getElementById('buscaUsuarioAniversario');
            if (busca) busca.value = encontrado.nome;
        }

        const modal = new bootstrap.Modal(document.getElementById('modalAniversario'));
        modal.show();
    } catch (err) {
        console.error(err);
        mostrarAlertaAniv('Erro ao abrir edição.', 'error');
    }
}
window.editarAniversario = editarAniversario;

async function salvarAniversario() {
    const id = document.getElementById('aniversarioId').value;
    const usuarioId = document.getElementById('aniversarioUsuarioId').value;
    const nome = document.getElementById('aniversarioNome').value.trim();
    const dataNascimento = document.getElementById('aniversarioData').value;
    const email = document.getElementById('aniversarioEmail').value.trim();
    const telefone = document.getElementById('aniversarioTelefone').value.trim();
    const turma = document.getElementById('aniversarioTurma').value.trim();
    const curso = document.getElementById('aniversarioCurso').value.trim();

    if (!nome || !dataNascimento) {
        mostrarAlertaAniv('Nome e data de nascimento são obrigatórios.', 'warning');
        return;
    }

    const body = { nome, dataNascimento, email, telefone, turma, curso };
    if (usuarioId) body.usuarioId = usuarioId;

    const url = id ? `${API_ANIV}/aniversarios/${id}` : `${API_ANIV}/aniversarios`;
    const method = id ? 'PUT' : 'POST';

    try {
        const resp = await fetch(url, {
            method,
            headers: headersAniv(),
            body: JSON.stringify(body)
        });
        const data = await resp.json();

        if (data.success) {
            mostrarAlertaAniv(id ? 'Aniversário atualizado!' : 'Aniversário cadastrado!', 'success');
            const modalEl = document.getElementById('modalAniversario');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            carregarAniversarios();
            carregarProximosAniversarios();
        } else {
            mostrarAlertaAniv('Erro: ' + data.error, 'error');
        }
    } catch (err) {
        console.error(err);
        mostrarAlertaAniv('Erro ao salvar.', 'error');
    }
}
window.salvarAniversario = salvarAniversario;

// ============================================
// EXCLUIR E TESTAR
// ============================================
async function excluirAniversario(id, nome) {
    if (!confirm(`Excluir o aniversário de "${nome}"?`)) return;

    try {
        const resp = await fetch(`${API_ANIV}/aniversarios/${id}`, {
            method: 'DELETE',
            headers: headersAniv()
        });
        const data = await resp.json();

        if (data.success) {
            mostrarAlertaAniv('Aniversário removido.', 'success');
            carregarAniversarios();
            carregarProximosAniversarios();
        } else {
            mostrarAlertaAniv('Erro: ' + data.error, 'error');
        }
    } catch (err) {
        console.error(err);
        mostrarAlertaAniv('Erro ao excluir.', 'error');
    }
}
window.excluirAniversario = excluirAniversario;

async function testarNotificacaoAniversario(id) {
    if (!confirm('Enviar notificação de teste para este aniversariante e para os protagonistas?')) return;

    try {
        const resp = await fetch(`${API_ANIV}/aniversarios/testar`, {
            method: 'POST',
            headers: headersAniv(),
            body: JSON.stringify({ aniversarioId: id })
        });
        const data = await resp.json();

        if (data.success) {
            mostrarAlertaAniv(data.message, 'success');
        } else {
            mostrarAlertaAniv('Erro: ' + data.error, 'error');
        }
    } catch (err) {
        console.error(err);
        mostrarAlertaAniv('Erro ao testar.', 'error');
    }
}
window.testarNotificacaoAniversario = testarNotificacaoAniversario;

// ============================================
// CONFIGURAÇÕES
// ============================================
async function abrirConfigAniversarios() {
    try {
        const resp = await fetch(`${API_ANIV}/aniversarios/configuracao`, { headers: headersAniv() });
        const data = await resp.json();

        if (!data.success) {
            mostrarAlertaAniv('Erro ao carregar configurações.', 'error');
            return;
        }

        const cfg = data.aniversarios || {};
        document.getElementById('cfgAnivAvisarNoDia').checked = cfg.avisarNoDia !== false;
        document.getElementById('cfgAnivHorario').value = cfg.horarioEnvioNoDia || '08:00';
        document.getElementById('cfgAnivAvisarAntecedencia').checked = cfg.avisarAntecedencia === true;
        document.getElementById('cfgAnivMinutos').value = cfg.minutosAntecedencia || 60;
        document.getElementById('cfgAnivNotifAniversariante').checked = cfg.notificarAniversariante !== false;
        document.getElementById('cfgAnivNotifProtagonistas').checked = cfg.notificarProtagonistas !== false;
        document.getElementById('cfgAnivNotifAdmins').checked = cfg.notificarAdmins === true;
        document.getElementById('cfgAnivEnviarEmail').checked = cfg.enviarEmail === true;
        document.getElementById('cfgAnivMensagem').value = cfg.mensagemPadrao || '🎉 Feliz aniversário, {nome}! Que seu dia seja especial e cheio de alegrias!';

        const modal = new bootstrap.Modal(document.getElementById('modalConfigAniversarios'));
        modal.show();
    } catch (err) {
        console.error(err);
        mostrarAlertaAniv('Erro ao abrir configurações.', 'error');
    }
}
window.abrirConfigAniversarios = abrirConfigAniversarios;

async function salvarConfigAniversarios() {
    const body = {
        avisarNoDia: document.getElementById('cfgAnivAvisarNoDia').checked,
        horarioEnvioNoDia: document.getElementById('cfgAnivHorario').value || '08:00',
        avisarAntecedencia: document.getElementById('cfgAnivAvisarAntecedencia').checked,
        minutosAntecedencia: parseInt(document.getElementById('cfgAnivMinutos').value) || 60,
        notificarAniversariante: document.getElementById('cfgAnivNotifAniversariante').checked,
        notificarProtagonistas: document.getElementById('cfgAnivNotifProtagonistas').checked,
        notificarAdmins: document.getElementById('cfgAnivNotifAdmins').checked,
        enviarEmail: document.getElementById('cfgAnivEnviarEmail').checked,
        mensagemPadrao: document.getElementById('cfgAnivMensagem').value.trim()
    };

    try {
        const resp = await fetch(`${API_ANIV}/aniversarios/configuracao`, {
            method: 'PUT',
            headers: headersAniv(),
            body: JSON.stringify(body)
        });
        const data = await resp.json();

        if (data.success) {
            mostrarAlertaAniv('Configurações salvas!', 'success');
            const modalEl = document.getElementById('modalConfigAniversarios');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        } else {
            mostrarAlertaAniv('Erro: ' + data.error, 'error');
        }
    } catch (err) {
        console.error(err);
        mostrarAlertaAniv('Erro ao salvar configurações.', 'error');
    }
}
window.salvarConfigAniversarios = salvarConfigAniversarios;

// ============================================
// AUTO-LOAD
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    const btnAbaAniv = document.getElementById('aba-aniversarios');
    if (btnAbaAniv) {
        btnAbaAniv.addEventListener('shown.bs.tab', () => {
            carregarAniversarios();
            carregarProximosAniversarios();
        });
    }
});