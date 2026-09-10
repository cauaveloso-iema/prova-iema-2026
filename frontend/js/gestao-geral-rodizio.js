// ============================================
// GESTÃO GERAL - MÓDULO DE RODÍZIOS
// ============================================

let tokenRodizio = localStorage.getItem('auth_token');
let modalRodizio = null;
let rodizioEditando = null;

document.addEventListener('DOMContentLoaded', async () => {
    if (window.__rodizioInitDone) return;
    window.__rodizioInitDone = true;
    
    if (!tokenRodizio) { 
        window.location.href = '/login.html'; 
        return; 
    }
    
    const userData = JSON.parse(localStorage.getItem('user_data') || '{}');
    const allowedRoles = ['gestao_geral', 'super_admin', 'admin'];
    
    if (!allowedRoles.includes(userData.role)) {
        alert('Acesso negado.');
        window.location.href = '/login.html';
        return;
    }
    
    // Espera modal existir (Bootstrap carregar)
    setTimeout(() => {
        const modalEl = document.getElementById('modalRodizio');
        if (modalEl && typeof bootstrap !== 'undefined') {
            modalRodizio = new bootstrap.Modal(modalEl);
        }
    }, 500);
    
    // 🔥 CARREGAR RODÍZIOS AUTOMATICAMENTE
    try {
        await carregarRodizios();
        console.log('✅ Rodízios carregados automaticamente');
    } catch (error) {
        console.error('❌ Erro ao carregar rodízios:', error);
        const tbody = document.getElementById('tabelaRodizios');
        if (tbody) {
            tbody.innerHTML = `
                <tr><td colspan="6" class="text-center py-5 text-danger">
                    <i class="fas fa-exclamation-triangle"></i>
                    Erro ao carregar rodízios. Tente recarregar a página.
                </td></tr>
            `;
        }
    }
});

async function carregarRodizios() {
    try {
        const response = await fetch('/api/gestao-geral/rodizios', {
            headers: { 'Authorization': `Bearer ${tokenRodizio}` }
        });
        const data = await response.json();
        
        if (data.success) {
            window.rodiziosData = data.rodizios;
            window.todasTurmas = data.todasTurmas;
            
            const ativos = data.rodizios.filter(r => r.ativo).length;
            const inativos = data.rodizios.length - ativos;
            const turmasComRodizio = new Set(data.rodizios.map(r => r.turma));
            const turmasSem = data.todasTurmas.filter(t => !turmasComRodizio.has(t));
            
            const el1 = document.getElementById('totalRodizios');
            const el2 = document.getElementById('rodiziosAtivos');
            const el3 = document.getElementById('rodiziosInativos');
            const el4 = document.getElementById('turmasSemRodizio');
            
            if (el1) el1.textContent = data.rodizios.length;
            if (el2) el2.textContent = ativos;
            if (el3) el3.textContent = inativos;
            if (el4) el4.textContent = turmasSem.length;
            
            renderizarTabelaRodizios(data.rodizios);
        }
    } catch (error) {
        console.error('Erro:', error);
        const tbody = document.getElementById('tabelaRodizios');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar rodízios</td></tr>';
    }
}

function renderizarTabelaRodizios(rodizios) {
    const tbody = document.getElementById('tabelaRodizios');
    if (!tbody) return;
    
    if (!rodizios || rodizios.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-5">Nenhum rodízio configurado</td></tr>';
        return;
    }
    
    const diasSemanaNomes = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    
    let html = '';
    rodizios.forEach(r => {
        let diasTexto = '';
        if (r.tipoRodizio === 'semanal' || r.tipoRodizio === 'ambos') {
            diasTexto = (r.diasSemana || []).map(d => diasSemanaNomes[d]).join(', ');
        }
        if (r.tipoRodizio === 'mensal' || r.tipoRodizio === 'ambos') {
            if (diasTexto) diasTexto += ' | ';
            if (r.semanasMes && r.semanasMes.length > 0) {
                diasTexto += `Semanas: ${r.semanasMes.map(s => `${s}ª`).join(', ')}`;
            }
        }
        
        html += `
            <tr>
                <td><strong>${r.turma}</strong></td>
                <td>
                    <span class="badge ${r.tipoRodizio === 'semanal' ? 'bg-info' : r.tipoRodizio === 'mensal' ? 'bg-warning' : 'bg-primary'}">
                        ${r.tipoRodizio === 'semanal' ? '📅 Semanal' : r.tipoRodizio === 'mensal' ? '📆 Mensal' : '🔄 Ambos'}
                    </span>
                </td>
                <td style="max-width: 300px;">${diasTexto || '-'}</td>
                <td>${r.horarioInicio} - ${r.horarioFim}</td>
                <td>
                    <span class="status-badge ${r.ativo ? 'status-ativo' : 'status-inativo'}">
                        ${r.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                </td>
                <td>
                    <button class="btn-warning btn-sm" onclick="editarRodizio('${r.turma}')">
                        <i class="fas fa-edit"></i> Editar
                    </button>
                    <button class="btn-danger btn-sm ms-1" onclick="excluirRodizio('${r.turma}')">
                        <i class="fas fa-trash"></i> Excluir
                    </button>
                </td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html;
}

async function abrirModalRodizio(turma = null) {
    rodizioEditando = turma;
    
    if (!modalRodizio) {
        modalRodizio = new bootstrap.Modal(document.getElementById('modalRodizio'));
    }
    
    const selectTurma = document.getElementById('rodizioTurma');
    selectTurma.innerHTML = '<option value="">Selecione uma turma...</option>';
    
    if (window.todasTurmas) {
        window.todasTurmas.forEach(t => {
            selectTurma.innerHTML += `<option value="${t}">${t}</option>`;
        });
    }
    
    if (turma) {
        try {
            const response = await fetch(`/api/gestao-geral/rodizios/${turma}`, {
                headers: { 'Authorization': `Bearer ${tokenRodizio}` }
            });
            const data = await response.json();
            
            if (data.success && data.rodizio) {
                const r = data.rodizio;
                selectTurma.value = r.turma;
                selectTurma.disabled = true;
                document.getElementById('rodizioTipo').value = r.tipoRodizio;
                toggleTipoRodizio();
                
                if (r.diasSemana) {
                    document.getElementById('diaDomingo').checked = r.diasSemana.includes(0);
                    document.getElementById('diaSegunda').checked = r.diasSemana.includes(1);
                    document.getElementById('diaTerca').checked = r.diasSemana.includes(2);
                    document.getElementById('diaQuarta').checked = r.diasSemana.includes(3);
                    document.getElementById('diaQuinta').checked = r.diasSemana.includes(4);
                    document.getElementById('diaSexta').checked = r.diasSemana.includes(5);
                    document.getElementById('diaSabado').checked = r.diasSemana.includes(6);
                }
                
                if (r.semanasMes) {
                    document.getElementById('semana1').checked = r.semanasMes.includes(1);
                    document.getElementById('semana2').checked = r.semanasMes.includes(2);
                    document.getElementById('semana3').checked = r.semanasMes.includes(3);
                    document.getElementById('semana4').checked = r.semanasMes.includes(4);
                }
                
                document.getElementById('rodizioHorarioInicio').value = r.horarioInicio || '11:00';
                document.getElementById('rodizioHorarioFim').value = r.horarioFim || '13:00';
                document.getElementById('rodizioAtivo').checked = r.ativo;
                document.getElementById('rodizioDescricao').value = r.descricao || '';
            }
        } catch (error) {
            console.error('Erro:', error);
        }
    } else {
        selectTurma.disabled = false;
        document.getElementById('rodizioTipo').value = 'semanal';
        toggleTipoRodizio();
        document.getElementById('rodizioHorarioInicio').value = '11:00';
        document.getElementById('rodizioHorarioFim').value = '13:00';
        document.getElementById('rodizioAtivo').checked = true;
        document.getElementById('rodizioDescricao').value = '';
        
        document.querySelectorAll('#diasSemanaDiv input[type="checkbox"]').forEach(cb => cb.checked = false);
        document.querySelectorAll('#semanasMesDiv input[type="checkbox"]').forEach(cb => cb.checked = false);
    }
    
    modalRodizio.show();
}

function toggleTipoRodizio() {
    const tipo = document.getElementById('rodizioTipo').value;
    document.getElementById('diasSemanaDiv').style.display = (tipo === 'semanal' || tipo === 'ambos') ? 'block' : 'none';
    document.getElementById('semanasMesDiv').style.display = (tipo === 'mensal' || tipo === 'ambos') ? 'block' : 'none';
}

async function salvarRodizio() {
    const turma = document.getElementById('rodizioTurma').value;
    if (!turma) { alert('Selecione uma turma'); return; }
    
    const tipoRodizio = document.getElementById('rodizioTipo').value;
    
    const diasSemana = [];
    if (document.getElementById('diaDomingo').checked) diasSemana.push(0);
    if (document.getElementById('diaSegunda').checked) diasSemana.push(1);
    if (document.getElementById('diaTerca').checked) diasSemana.push(2);
    if (document.getElementById('diaQuarta').checked) diasSemana.push(3);
    if (document.getElementById('diaQuinta').checked) diasSemana.push(4);
    if (document.getElementById('diaSexta').checked) diasSemana.push(5);
    if (document.getElementById('diaSabado').checked) diasSemana.push(6);
    
    const semanasMes = [];
    if (document.getElementById('semana1').checked) semanasMes.push(1);
    if (document.getElementById('semana2').checked) semanasMes.push(2);
    if (document.getElementById('semana3').checked) semanasMes.push(3);
    if (document.getElementById('semana4').checked) semanasMes.push(4);
    
    const dados = {
        turma, tipoRodizio, diasSemana, semanasMes,
        diasMes: [],
        horarioInicio: document.getElementById('rodizioHorarioInicio').value,
        horarioFim: document.getElementById('rodizioHorarioFim').value,
        ativo: document.getElementById('rodizioAtivo').checked,
        descricao: document.getElementById('rodizioDescricao').value
    };
    
    try {
        const response = await fetch('/api/gestao-geral/rodizios', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${tokenRodizio}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(dados)
        });
        
        const data = await response.json();
        
        if (data.success) {
            alert('✅ Rodízio salvo com sucesso!');
            modalRodizio.hide();
            await carregarRodizios();
        } else {
            alert('❌ Erro: ' + data.error);
        }
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao salvar rodízio');
    }
}

function editarRodizio(turma) { abrirModalRodizio(turma); }

async function excluirRodizio(turma) {
    if (!confirm(`Excluir rodízio da turma ${turma}?`)) return;
    
    try {
        const response = await fetch(`/api/gestao-geral/rodizios/${turma}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${tokenRodizio}` }
        });
        const data = await response.json();
        
        if (data.success) {
            alert('✅ Rodízio excluído!');
            await carregarRodizios();
        } else {
            alert('❌ Erro: ' + data.error);
        }
    } catch (error) {
        console.error('Erro:', error);
        alert('Erro ao excluir rodízio');
    }
}

function filtrarRodizios(tipo) {
    if (!window.rodiziosData) return;
    let filtrados = window.rodiziosData;
    if (tipo === 'ativos') filtrados = filtrados.filter(r => r.ativo);
    if (tipo === 'inativos') filtrados = filtrados.filter(r => !r.ativo);
    renderizarTabelaRodizios(filtrados);
}

function mostrarTurmasSemRodizio() {
    if (!window.todasTurmas || !window.rodiziosData) return;
    const turmasComRodizio = new Set(window.rodiziosData.map(r => r.turma));
    const turmasSem = window.todasTurmas.filter(t => !turmasComRodizio.has(t));
    
    if (turmasSem.length === 0) {
        alert('✅ Todas as turmas já possuem rodízio configurado!');
    } else {
        alert(`📋 Turmas sem rodízio:\n\n${turmasSem.join('\n')}\n\nTotal: ${turmasSem.length} turmas`);
    }
}

window.abrirModalRodizio = abrirModalRodizio;
window.editarRodizio = editarRodizio;
window.excluirRodizio = excluirRodizio;
window.filtrarRodizios = filtrarRodizios;
window.mostrarTurmasSemRodizio = mostrarTurmasSemRodizio;
window.carregarRodizios = carregarRodizios;
window.salvarRodizio = salvarRodizio;
window.toggleTipoRodizio = toggleTipoRodizio;