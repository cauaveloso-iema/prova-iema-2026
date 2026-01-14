document.addEventListener('DOMContentLoaded', async function() {
    await carregarResultado();
});

async function carregarResultado() {
    const resultadoId = localStorage.getItem('resultadoId');
    const container = document.getElementById('resultadoContainer') || document.getElementById('resultadoConteudo');
    
    if (!container) {
        console.error('Container de resultados não encontrado');
        return;
    }
    
    if (!resultadoId) {
        container.innerHTML = `
            <div class="card">
                <div class="card-body text-center">
                    <i class="fas fa-exclamation-triangle fa-3x" style="color: #f59e0b; margin-bottom: 20px;"></i>
                    <h2>Resultado não encontrado</h2>
                    <p>Nenhum resultado disponível para exibição.</p>
                    <a href="index.html" class="btn-voltar-inicio">
                        <i class="fas fa-home"></i> Voltar ao Início
                    </a>
                </div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="loading">
            <i class="fas fa-spinner fa-spin"></i> Carregando resultado...
        </div>
    `;
    
    try {
        const response = await fetch(`http://localhost:3000/api/resultado/${resultadoId}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const resultado = await response.json();
        
        if (resultado.error) {
            throw new Error(resultado.error);
        }
        
        // Usar a função corrigida
        container.innerHTML = gerarHTMLResultado(resultado);
        
    } catch (error) {
        console.error('Erro ao carregar resultado:', error);
        
        // Mostrar resultado de fallback com botão
        container.innerHTML = gerarHTMLResultadoFallback(error);
    }
}

function gerarHTMLResultado(resultado) {
    // Formatar tempo
    const tempoGasto = resultado.tempoGasto || 0;
    const horas = Math.floor(tempoGasto / 3600);
    const minutos = Math.floor((tempoGasto % 3600) / 60);
    const segundos = tempoGasto % 60;
    const tempoFormatado = `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
    
    // Calcular nota e porcentagem
    const acertos = resultado.acertos || 0;
    const total = resultado.total || 1;
    const nota = resultado.nota || (acertos / total * 10).toFixed(2);
    const porcentagem = resultado.porcentagem || (acertos / total * 100).toFixed(1);
    
    // Determinar cor da nota
    let notaColor = '#dc2626'; // vermelho
    if (nota >= 7) notaColor = '#10b981'; // verde
    else if (nota >= 5) notaColor = '#f59e0b'; // amarelo
    
    // Formatar data
    const data = resultado.data ? new Date(resultado.data).toLocaleDateString('pt-BR') : 'Data não disponível';
    
    let html = `
        <div class="card">
            <div class="card-header">
                <h2><i class="fas fa-user-graduate"></i> Resultado de ${resultado.alunoNome || 'Aluno'}</h2>
                <p>Conteúdo: ${resultado.conteudo || 'Não especificado'} | Data: ${data}</p>
                ${resultado.iaUsada ? `<p><small>IA utilizada: ${resultado.iaUsada}</small></p>` : ''}
            </div>
            
            <div class="card-body">
                <div class="nota-final">
                    <div class="nota-label">NOTA FINAL</div>
                    <div class="nota-valor" style="color: ${notaColor}">${nota}</div>
                    <div class="nota-detalhes">
                        <p>${acertos} de ${total} questões corretas</p>
                        <p>${porcentagem}% de aproveitamento</p>
                        <p>Tempo gasto: ${tempoFormatado}</p>
                    </div>
                </div>
    `;
    
    // Adicionar detalhes das questões se existirem
    if (resultado.detalhes && resultado.detalhes.length > 0) {
        html += `
            <div class="resultado-detalhes">
                <h3><i class="fas fa-list-check"></i> Detalhamento por Questão</h3>
        `;
        
        resultado.detalhes.forEach((questao, index) => {
            const acertou = questao.acertou || false;
            const respostaAluno = questao.respostaAluno !== undefined && questao.respostaAluno !== null ? questao.respostaAluno : -1;
            const respostaCorreta = questao.respostaCorreta !== undefined ? questao.respostaCorreta : -1;
            
            html += `
                <div class="detalhe-item ${acertou ? 'correto' : 'incorreto'}">
                    <div class="detalhe-pergunta">
                        <strong>Questão ${index + 1}:</strong> ${questao.pergunta || 'Pergunta não disponível'}
                    </div>
                    
                    <div class="detalhe-resposta">
                        <div class="resposta-label">Sua resposta:</div>
                        <div class="${acertou ? 'resposta-correta' : 'resposta-incorreta'}">
                            ${respostaAluno >= 0 ? String.fromCharCode(65 + respostaAluno) : 'Não respondida'} - 
                            ${acertou ? '✅ Correta' : '❌ Incorreta'}
                        </div>
                    </div>
            `;
            
            if (!acertou && respostaCorreta >= 0) {
                html += `
                    <div class="detalhe-resposta">
                        <div class="resposta-label">Resposta correta:</div>
                        <div class="resposta-correta">
                            ${String.fromCharCode(65 + respostaCorreta)}
                        </div>
                    </div>
                `;
            }
            
            if (questao.explicacao) {
                html += `
                    <div class="explicacao">
                        <strong>Explicação:</strong> ${questao.explicacao}
                    </div>
                `;
            }
            
            html += `</div>`;
        });
        
        html += `</div>`;
    } else {
        html += `
            <div class="alert alert-info">
                <i class="fas fa-info-circle"></i>
                Detalhes das questões não disponíveis
            </div>
        `;
    }
    
    // BOTÃO DE VOLTAR AO INÍCIO - ADICIONADO AQUI
    html += `
                <div class="botoes-acao" style="margin-top: 40px; display: flex; gap: 15px; justify-content: center;">
                    <a href="index.html" class="btn-voltar-inicio">
                        <i class="fas fa-home"></i> Voltar ao Início
                    </a>
                    <button onclick="window.print()" class="btn-imprimir">
                        <i class="fas fa-print"></i> Imprimir Resultado
                    </button>
                </div>
            </div>
        </div>
    `;
    
    return html;
}

// Função de fallback em caso de erro
function gerarHTMLResultadoFallback(error) {
    return `
        <div class="card">
            <div class="card-header" style="background: linear-gradient(135deg, #dc2626, #b91c1c);">
                <h2 style="color: white;"><i class="fas fa-exclamation-triangle"></i> Erro ao Carregar Resultado</h2>
            </div>
            
            <div class="card-body text-center">
                <div style="font-size: 4rem; color: #dc2626; margin: 20px 0;">
                    <i class="fas fa-times-circle"></i>
                </div>
                
                <h3>Ocorreu um erro</h3>
                <p style="color: #6b7280; margin: 15px 0;">
                    ${error.message || 'Não foi possível carregar o resultado da prova.'}
                </p>
                
                <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; text-align: left;">
                    <p><strong>Possíveis soluções:</strong></p>
                    <ul style="margin-left: 20px;">
                        <li>Verifique sua conexão com a internet</li>
                        <li>O servidor pode estar temporariamente indisponível</li>
                        <li>O resultado pode ter expirado</li>
                        <li>Tente fazer uma nova prova</li>
                    </ul>
                </div>
                
                <div style="display: flex; gap: 10px; justify-content: center; margin-top: 30px;">
                    <a href="index.html" class="btn-voltar-inicio">
                        <i class="fas fa-home"></i> Voltar ao Início
                    </a>
                    
                    <button onclick="location.reload()" class="btn-tentar-novamente">
                        <i class="fas fa-redo"></i> Tentar Novamente
                    </button>
                </div>
            </div>
        </div>
    `;
}