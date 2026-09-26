// ============================================
// frontend/js/acompanhamento-visitas.js
// Acompanhamento de Autorizações de Visitas
// ============================================

(function() {
    'use strict';

    // ============================================
    // ESTADO
    // ============================================
    const estadoAcompanhamento = {
        termos: [],
        filtrados: [],
        turmas: [],
        paginaAtual: 1,
        itensPorPagina: 10,
        filtros: {
            status: 'todos',
            turma: 'todas',
            periodo: 'todos',
            busca: ''
        },
        carregando: false
    };

    let debounceTimeout = null;

    // ============================================
    // ABRIR MODAL
    // ============================================
    window.abrirAcompanhamentoVisitas = async function() {
        console.log('🚀 Abrindo acompanhamento de visitas...');
        
        const modalEl = document.getElementById('modalAcompanhamentoVisitas');
        if (!modalEl) {
            console.error('❌ Modal não encontrado');
            return;
        }

        const modal = new bootstrap.Modal(modalEl);
        modal.show();

        await carregarAcompanhamentoVisitas();
    };

    // ============================================
    // CARREGAR DADOS
    // ============================================
    window.carregarAcompanhamentoVisitas = async function() {
        if (estadoAcompanhamento.carregando) return;
        estadoAcompanhamento.carregando = true;

        const container = document.getElementById('listaAcompanhamentoVisitas');
        if (container) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #6b7280;">
                    <div class="spinner-border text-primary" role="status" style="width: 3rem; height: 3rem;"></div>
                    <p style="margin-top: 15px;">Carregando termos...</p>
                </div>`;
        }

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/setor-pedagogico/visitas/termos?limit=100', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const data = await response.json();

            if (data.success) {
                estadoAcompanhamento.termos = data.termos || [];
                await carregarTurmasVisitas();
                aplicarFiltrosVisitas();
                console.log(`✅ ${estadoAcompanhamento.termos.length} termos carregados`);
            } else {
                throw new Error(data.error || 'Erro ao carregar');
            }
        } catch (error) {
            console.error('❌ Erro:', error);
            if (container) {
                container.innerHTML = `
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-triangle"></i>
                        Erro ao carregar: ${error.message}
                        <button class="btn btn-sm btn-outline-danger mt-2" onclick="carregarAcompanhamentoVisitas()">
                            <i class="fas fa-sync-alt"></i> Tentar novamente
                        </button>
                    </div>`;
            }
        } finally {
            estadoAcompanhamento.carregando = false;
        }
    };

    // ============================================
    // CARREGAR TURMAS
    // ============================================
    async function carregarTurmasVisitas() {
        const turmasSet = new Set();
        estadoAcompanhamento.termos.forEach(t => {
            if (t.alunoTurma && t.alunoTurma !== 'N/A') {
                turmasSet.add(t.alunoTurma);
            }
        });

        estadoAcompanhamento.turmas = Array.from(turmasSet).sort();

        const select = document.getElementById('filtroVisitasTurma');
        if (!select) return;

        const valorAtual = select.value;
        select.innerHTML = '<option value="todas">Todas as turmas</option>';
        estadoAcompanhamento.turmas.forEach(turma => {
            select.innerHTML += `<option value="${escapeHtml(turma)}">${escapeHtml(turma)}</option>`;
        });

        if (valorAtual && valorAtual !== 'todas') {
            select.value = valorAtual;
        }
    }

    // ============================================
    // APLICAR FILTROS
    // ============================================
    function aplicarFiltrosVisitas() {
        const f = estadoAcompanhamento.filtros;
        const agora = new Date();
        const em7Dias = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000);
        const em30Dias = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000);

        estadoAcompanhamento.filtrados = estadoAcompanhamento.termos.filter(t => {
            if (f.status !== 'todos' && t.status !== f.status) return false;
            if (f.turma !== 'todas' && t.alunoTurma !== f.turma) return false;

            if (f.periodo !== 'todos' && t.dataVisita) {
                const dataVisita = new Date(t.dataVisita);
                if (f.periodo === 'semana' && (dataVisita < agora || dataVisita > em7Dias)) return false;
                if (f.periodo === 'mes' && (dataVisita < agora || dataVisita > em30Dias)) return false;
                if (f.periodo === 'passado' && dataVisita > agora) return false;
            }

            if (f.busca) {
                const termoBusca = f.busca.toLowerCase();
                const busca = (
                    (t.alunoNome || '') + ' ' +
                    (t.professorNome || '') + ' ' +
                    (t.codigo || '') + ' ' +
                    (t.atividade || '')
                ).toLowerCase();
                if (!busca.includes(termoBusca)) return false;
            }

            return true;
        });

        estadoAcompanhamento.filtrados.sort((a, b) => {
            return new Date(a.dataVisita || 0) - new Date(b.dataVisita || 0);
        });

        estadoAcompanhamento.paginaAtual = 1;

        renderizarStatsVisitas();
        renderizarListaVisitas();
        renderizarPaginacaoVisitas();
    }

    // ============================================
    // UTIL
    // ============================================
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ============================================
    // ESTATÍSTICAS
    // ============================================
    function renderizarStatsVisitas() {
        const container = document.getElementById('statsAcompanhamentoVisitas');
        if (!container) return;

        const termos = estadoAcompanhamento.filtrados;
        
        const stats = {
            total: termos.length,
            pendentes: termos.filter(t => t.status === 'pendente').length,
            parciais: termos.filter(t => t.status === 'parcialmente_autorizado').length,
            autorizados: termos.filter(t => t.status === 'autorizado').length,
            recusados: termos.filter(t => t.status === 'recusado').length
        };

        const cards = [
            { label: 'Total', valor: stats.total, icon: 'fa-file-alt', cor: '#3b82f6', bg: '#eff6ff' },
            { label: 'Pendentes', valor: stats.pendentes, icon: 'fa-clock', cor: '#f59e0b', bg: '#fffbeb' },
            { label: 'Parciais', valor: stats.parciais, icon: 'fa-adjust', cor: '#8b5cf6', bg: '#f5f3ff' },
            { label: 'Autorizados', valor: stats.autorizados, icon: 'fa-check-circle', cor: '#10b981', bg: '#ecfdf5' },
            { label: 'Recusados', valor: stats.recusados, icon: 'fa-times-circle', cor: '#ef4444', bg: '#fef2f2' }
        ];

        container.innerHTML = cards.map(c => `
            <div class="col">
                <div style="background: ${c.bg}; border-radius: 10px; padding: 15px; border-left: 4px solid ${c.cor};">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i class="fas ${c.icon}" style="color: ${c.cor}; font-size: 20px;"></i>
                        <div>
                            <div style="font-size: 22px; font-weight: 700; color: ${c.cor}; line-height: 1;">${c.valor}</div>
                            <div style="font-size: 11px; color: #6b7280; margin-top: 2px;">${c.label}</div>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // ============================================
    // LISTA
    // ============================================
    function renderizarListaVisitas() {
        const container = document.getElementById('listaAcompanhamentoVisitas');
        if (!container) return;

        const f = estadoAcompanhamento.filtrados;

        if (f.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; color: #9ca3af;">
                    <i class="fas fa-inbox" style="font-size: 48px; margin-bottom: 15px; display: block;"></i>
                    <h5 style="color: #6b7280;">Nenhum termo encontrado</h5>
                    <p>Ajuste os filtros acima para ver mais resultados</p>
                </div>`;
            return;
        }

        const inicio = (estadoAcompanhamento.paginaAtual - 1) * estadoAcompanhamento.itensPorPagina;
        const fim = inicio + estadoAcompanhamento.itensPorPagina;
        const pagina = f.slice(inicio, fim);

        const statusConfig = {
            pendente: { label: '⏳ Pendente', cor: '#f59e0b', bg: '#fffbeb' },
            parcialmente_autorizado: { label: '🔶 Parcial', cor: '#8b5cf6', bg: '#f5f3ff' },
            autorizado: { label: '✅ Autorizado', cor: '#10b981', bg: '#ecfdf5' },
            recusado: { label: '❌ Recusado', cor: '#ef4444', bg: '#fef2f2' }
        };

        container.innerHTML = pagina.map(t => {
            const status = statusConfig[t.status] || statusConfig.pendente;
            const dataVisita = t.dataVisita 
                ? new Date(t.dataVisita).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : 'Não definida';
            
            const totalResp = t.totalResponsaveis || t.responsaveis?.length || 0;
            const autorizados = t.responsaveisAutorizados || t.responsaveis?.filter(r => r.status === 'autorizado').length || 0;
            const progresso = totalResp > 0 ? Math.round((autorizados / totalResp) * 100) : 0;

            return `
                <div style="background: white; border-radius: 12px; padding: 18px; margin-bottom: 12px; 
                            box-shadow: 0 2px 8px rgba(0,0,0,0.05); border-left: 4px solid ${status.cor};">
                    
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
                        
                        <div style="flex: 1; min-width: 250px;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
                                <span style="font-family: monospace; font-size: 11px; background: #f3f4f6; 
                                             padding: 3px 10px; border-radius: 6px; color: #374151;">
                                    ${escapeHtml(t.codigo || '-')}
                                </span>
                                <span style="font-size: 11px; font-weight: 600; color: ${status.cor}; 
                                             background: ${status.bg}; padding: 3px 10px; border-radius: 20px;">
                                    ${status.label}
                                </span>
                            </div>

                            <h5 style="margin: 0 0 4px; font-size: 15px; color: #111827;">
                                <i class="fas fa-user-graduate" style="color: #667eea;"></i>
                                ${escapeHtml(t.alunoNome || 'Aluno')}
                                ${t.totalAlunos > 1 ? `<span style="background: #e0e7ff; color: #3730a3; padding: 2px 8px; border-radius: 20px; font-size: 10px; margin-left: 6px;">+${t.totalAlunos - 1}</span>` : ''}
                            </h5>

                            <div style="font-size: 12px; color: #6b7280; margin-bottom: 8px;">
                                <i class="fas fa-school"></i> ${escapeHtml(t.alunoTurma || 'N/A')}
                                ${t.alunoCurso ? ` • <i class="fas fa-book"></i> ${escapeHtml(t.alunoCurso)}` : ''}
                            </div>

                            <div style="font-size: 13px; color: #374151; margin-bottom: 6px;">
                                <i class="fas fa-clipboard-list" style="color: #667eea;"></i>
                                <strong>${escapeHtml(t.atividade || 'N/A')}</strong>
                            </div>

                            <div style="font-size: 12px; color: #6b7280; display: flex; gap: 15px; flex-wrap: wrap;">
                                <span><i class="fas fa-calendar"></i> ${dataVisita}</span>
                                <span><i class="fas fa-clock"></i> ${escapeHtml(t.horario || 'N/A')}</span>
                                <span><i class="fas fa-map-marker-alt"></i> ${escapeHtml(t.local || 'N/A')}</span>
                            </div>
                        </div>

                        <div style="min-width: 200px; text-align: right;">
                            
                            <div style="background: #f8fafc; border-radius: 10px; padding: 12px; margin-bottom: 10px;">
                                <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">
                                    <i class="fas fa-users"></i> Autorizações
                                </div>
                                <div style="font-size: 18px; font-weight: 700; color: ${status.cor};">
                                    ${autorizados}/${totalResp}
                                </div>
                                <div style="background: #e5e7eb; border-radius: 10px; height: 6px; margin-top: 6px; overflow: hidden;">
                                    <div style="background: ${status.cor}; height: 100%; width: ${progresso}%; transition: width 0.3s;"></div>
                                </div>
                                <div style="font-size: 10px; color: #9ca3af; margin-top: 4px;">${progresso}% autorizado</div>
                            </div>

                            <div style="display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap;">
                                <button class="btn btn-sm btn-outline-primary" 
                                        onclick="verDetalhesAcompanhamentoVisita('${t._id || t.id}')"
                                        title="Ver detalhes"
                                        style="border-radius: 8px;">
                                    <i class="fas fa-eye"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-success" 
                                        onclick="imprimirTermoAcompanhamentoVisita('${t._id || t.id}')"
                                        title="Imprimir termo oficial"
                                        style="border-radius: 8px;">
                                    <i class="fas fa-print"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ============================================
    // PAGINAÇÃO
    // ============================================
    function renderizarPaginacaoVisitas() {
        const container = document.getElementById('paginacaoAcompanhamentoVisitas');
        if (!container) return;

        const total = estadoAcompanhamento.filtrados.length;
        const pages = Math.ceil(total / estadoAcompanhamento.itensPorPagina);

        if (pages <= 1) {
            container.innerHTML = `
                <p style="font-size: 12px; color: #9ca3af;">
                    Mostrando ${total} de ${total} termos
                </p>`;
            return;
        }

        const atual = estadoAcompanhamento.paginaAtual;
        let botoes = '';

        if (atual > 1) {
            botoes += `<button class="btn btn-sm btn-outline-primary" onclick="irParaPaginaVisitas(${atual - 1})" style="margin: 0 3px;">
                <i class="fas fa-chevron-left"></i>
            </button>`;
        }

        const inicio = Math.max(1, atual - 2);
        const fim = Math.min(pages, atual + 2);

        if (inicio > 1) {
            botoes += `<button class="btn btn-sm btn-outline-primary" onclick="irParaPaginaVisitas(1)" style="margin: 0 3px;">1</button>`;
            if (inicio > 2) botoes += `<span style="padding: 0 5px;">...</span>`;
        }

        for (let i = inicio; i <= fim; i++) {
            const ativo = i === atual ? 'btn-primary' : 'btn-outline-primary';
            botoes += `<button class="btn btn-sm ${ativo}" onclick="irParaPaginaVisitas(${i})" style="margin: 0 3px;">${i}</button>`;
        }

        if (fim < pages) {
            if (fim < pages - 1) botoes += `<span style="padding: 0 5px;">...</span>`;
            botoes += `<button class="btn btn-sm btn-outline-primary" onclick="irParaPaginaVisitas(${pages})" style="margin: 0 3px;">${pages}</button>`;
        }

        if (atual < pages) {
            botoes += `<button class="btn btn-sm btn-outline-primary" onclick="irParaPaginaVisitas(${atual + 1})" style="margin: 0 3px;">
                <i class="fas fa-chevron-right"></i>
            </button>`;
        }

        container.innerHTML = `
            <div style="margin-top: 10px;">${botoes}</div>
            <p style="font-size: 12px; color: #9ca3af; margin-top: 10px;">
                Página ${atual} de ${pages} • ${total} termos
            </p>`;
    }

    window.irParaPaginaVisitas = function(pagina) {
        estadoAcompanhamento.paginaAtual = pagina;
        renderizarListaVisitas();
        renderizarPaginacaoVisitas();
        
        document.getElementById('listaAcompanhamentoVisitas')?.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
    };

    // ============================================
    // FILTROS
    // ============================================
    window.filtrarAcompanhamentoVisitas = function() {
        estadoAcompanhamento.filtros.status = document.getElementById('filtroVisitasStatus')?.value || 'todos';
        estadoAcompanhamento.filtros.turma = document.getElementById('filtroVisitasTurma')?.value || 'todas';
        estadoAcompanhamento.filtros.periodo = document.getElementById('filtroVisitasPeriodo')?.value || 'todos';
        estadoAcompanhamento.filtros.busca = document.getElementById('filtroVisitasBusca')?.value?.trim() || '';
        
        aplicarFiltrosVisitas();
    };

    window.debounceFiltroVisitas = function() {
        if (debounceTimeout) clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(() => {
            filtrarAcompanhamentoVisitas();
        }, 400);
    };

    window.limparFiltrosVisitas = function() {
        document.getElementById('filtroVisitasStatus').value = 'todos';
        document.getElementById('filtroVisitasTurma').value = 'todas';
        document.getElementById('filtroVisitasPeriodo').value = 'todos';
        document.getElementById('filtroVisitasBusca').value = '';
        
        estadoAcompanhamento.filtros = {
            status: 'todos',
            turma: 'todas',
            periodo: 'todos',
            busca: ''
        };
        
        aplicarFiltrosVisitas();
    };

    // ============================================
    // VER DETALHES
    // ============================================
    window.verDetalhesAcompanhamentoVisita = async function(termoId) {
        if (!termoId) return;

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`/api/setor-pedagogico/visitas/termos/${termoId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();

            if (!data.success || !data.termo) {
                alert('Erro ao carregar termo');
                return;
            }

            const t = data.termo;
            const dataVisita = t.dataVisita 
                ? new Date(t.dataVisita).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
                : 'N/A';

            let modalDetalhes = document.getElementById('modalDetalhesVisitaAcompanhamento');
            if (modalDetalhes) modalDetalhes.remove();

            const html = `
                <div class="modal fade" id="modalDetalhesVisitaAcompanhamento" tabindex="-1">
                    <div class="modal-dialog modal-lg modal-dialog-scrollable">
                        <div class="modal-content">
                            <div class="modal-header" style="background: linear-gradient(135deg, #667eea, #764ba2); color: white;">
                                <h5 class="modal-title">
                                    <i class="fas fa-eye"></i> Detalhes do Termo ${escapeHtml(t.codigo)}
                                </h5>
                                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                
                                <div style="text-align: center; margin-bottom: 20px;">
                                    <span style="font-size: 14px; padding: 8px 20px; border-radius: 20px; font-weight: 600;
                                          ${t.status === 'autorizado' ? 'background: #d1fae5; color: #065f46;' : 
                                            t.status === 'parcialmente_autorizado' ? 'background: #fed7aa; color: #9a3412;' :
                                            t.status === 'recusado' ? 'background: #fee2e2; color: #991b1b;' : 
                                            'background: #fef3c7; color: #92400e;'}">
                                        ${t.status === 'autorizado' ? '✅ AUTORIZADO' : 
                                          t.status === 'parcialmente_autorizado' ? '🔶 PARCIAL' :
                                          t.status === 'recusado' ? '❌ RECUSADO' : '⏳ PENDENTE'}
                                    </span>
                                </div>

                                <div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 15px; border-radius: 12px; margin-bottom: 20px;">
                                    <div style="font-size: 11px; opacity: 0.85;">ATIVIDADE</div>
                                    <div style="font-size: 16px; font-weight: 600;">${escapeHtml(t.atividade)}</div>
                                </div>

                                <div style="background: #f8fafc; border-radius: 12px; padding: 15px; margin-bottom: 15px;">
                                    <h6 style="color: #1e293b; margin-bottom: 10px;">
                                        <i class="fas fa-user-graduate" style="color: #667eea;"></i>
                                        Alunos (${t.alunos?.length || 0})
                                    </h6>
                                    ${(t.alunos || []).map(a => `
                                        <div style="background: white; padding: 10px; border-radius: 8px; margin-bottom: 6px; border-left: 3px solid #667eea;">
                                            <div style="font-weight: 600; font-size: 13px;">${escapeHtml(a.nome || '')}</div>
                                            <div style="font-size: 11px; color: #6b7280;">
                                                ${a.matricula ? `<i class="fas fa-id-card"></i> ${a.matricula}` : ''}
                                                ${a.turma ? ` • <i class="fas fa-school"></i> ${a.turma}` : ''}
                                                ${a.curso ? ` • <i class="fas fa-book"></i> ${a.curso}` : ''}
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>

                                <div style="background: #fef3c7; border-radius: 12px; padding: 15px; margin-bottom: 15px;">
                                    <h6 style="color: #92400e; margin-bottom: 10px;">
                                        <i class="fas fa-chalkboard-teacher"></i>
                                        Professores (${t.professores?.length || 0})
                                    </h6>
                                    ${(t.professores || []).map(p => `
                                        <div style="background: white; padding: 10px; border-radius: 8px; margin-bottom: 6px; border-left: 3px solid #f59e0b;">
                                            <div style="font-weight: 600; font-size: 13px;">${escapeHtml(p.nome || '')}</div>
                                        </div>
                                    `).join('')}
                                </div>

                                <div style="background: #f8fafc; border-radius: 12px; padding: 15px; margin-bottom: 15px;">
                                    <h6 style="color: #1e293b; margin-bottom: 10px;">
                                        <i class="fas fa-info-circle"></i> Detalhes
                                    </h6>
                                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 13px;">
                                        <div><strong>Data:</strong> ${dataVisita}</div>
                                        <div><strong>Horário:</strong> ${escapeHtml(t.horario || 'N/A')}</div>
                                        <div><strong>Período:</strong> ${escapeHtml(t.periodo || 'N/A')}</div>
                                        <div><strong>Cidade:</strong> ${escapeHtml(t.cidade || 'N/A')}</div>
                                        <div style="grid-column: span 2;"><strong>Local:</strong> ${escapeHtml(t.local || 'N/A')}</div>
                                    </div>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                                    <i class="fas fa-times"></i> Fechar
                                </button>
                                <button type="button" class="btn btn-success" onclick="imprimirTermoAcompanhamentoVisita('${t._id || t.id}')">
                                    <i class="fas fa-print"></i> Imprimir Termo
                                </button>
                            </div>
                        </div>
                    </div>
                </div>`;

            document.body.insertAdjacentHTML('beforeend', html);
            new bootstrap.Modal(document.getElementById('modalDetalhesVisitaAcompanhamento')).show();
        } catch (error) {
            console.error('Erro:', error);
            alert('Erro ao carregar detalhes');
        }
    };

    // ============================================
    // IMPRIMIR TERMO (INDIVIDUAL)
    // ============================================
    window.imprimirTermoAcompanhamentoVisita = async function(termoId) {
        if (!termoId) return;
        
        try {
            const response = await fetch(`/api/visitas-publico/termo-oficial/${termoId}`);
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Erro ao gerar termo');
            }
            
            const win = window.open('', '_blank');
            win.document.open();
            win.document.write(data.html);
            win.document.close();
            
            // Garante que a impressão só ocorra após o carregamento completo de imagens e CSS
            win.onload = () => {
                setTimeout(() => {
                    win.focus();
                    win.print();
                    // win.close(); // Opcional: fecha a janela após imprimir
                }, 600);
            };
        } catch (error) {
            console.error('Erro:', error);
            alert('Erro ao imprimir: ' + error.message);
        }
    };

    // ============================================
    // IMPRIMIR TODOS OS FILTRADOS (LOTE)
    // ============================================
    window.imprimirTodosTermosFiltrados = async function() {
        const filtrados = estadoAcompanhamento.filtrados;
        
        if (filtrados.length === 0) {
            alert('Nenhum termo para imprimir');
            return;
        }

        const confirmar = confirm(`Deseja imprimir ${filtrados.length} termo(s)?\n\nOs termos serão abertos em uma nova janela.`);
        if (!confirmar) return;

        try {
            const ids = filtrados.map(t => t._id || t.id);
            const token = localStorage.getItem('auth_token');
            
            const response = await fetch('/api/visitas-publico/termos-oficiais-lote', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    termoIds: ids,
                    incluirSemAutorizacao: true 
                })
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Erro ao gerar termos');
            }
            
            const win = window.open('', '_blank');
            win.document.open();
            win.document.write(data.html);
            win.document.close();
            
            // Garante que a impressão só ocorra após o carregamento completo de imagens e CSS
            win.onload = () => {
                setTimeout(() => {
                    win.focus();
                    win.print();
                    // win.close(); // Opcional: fecha a janela após imprimir
                }, 800); // Tempo maior para lote
            };
        } catch (error) {
            console.error('Erro:', error);
            alert('Erro ao imprimir: ' + error.message);
        }
    };

    console.log('✅ acompanhamento-visitas.js carregado');
})();