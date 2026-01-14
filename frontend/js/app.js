document.addEventListener('DOMContentLoaded', function() {
    const formProva = document.getElementById('formProva');
    const btnGerar = formProva ? formProva.querySelector('button[type="submit"]') : null;
    
    // Verificar elementos
    if (!formProva) {
        console.error('Formulário não encontrado! Verifique o HTML');
        return;
    }
    
    // Testar conexão inicial
    testarConexaoAPI();
    
    // Configurar evento do formulário
    formProva.addEventListener('submit', async function(e) {
        e.preventDefault();
        console.log('📝 Formulário submetido');
        
        // Coletar dados
        const alunoNome = document.getElementById('alunoNome')?.value.trim() || '';
        const conteudo = document.getElementById('conteudo')?.value.trim() || '';
        const quantidadeQuestoes = document.getElementById('quantidadeQuestoes')?.value || '5';
        const dificuldade = document.getElementById('dificuldade')?.value || 'media';
        
        // Validar
        if (!alunoNome || !conteudo) {
            alert('⚠️ Por favor, preencha seu nome e o conteúdo da prova.');
            return;
        }
        
        if (conteudo.length < 3) {
            alert('⚠️ Descreva melhor o conteúdo (mínimo 3 caracteres).');
            return;
        }
        
        console.log(`🎯 Dados: ${alunoNome}, ${conteudo}, ${quantidadeQuestoes} questões, ${dificuldade}`);
        
        // Salvar dados básicos
        localStorage.setItem('alunoNome', alunoNome);
        localStorage.setItem('conteudo', conteudo);
        localStorage.setItem('quantidadeQuestoes', quantidadeQuestoes);
        localStorage.setItem('dificuldade', dificuldade);
        
        // Desabilitar botão e mostrar loading
        if (btnGerar) {
            const originalText = btnGerar.innerHTML;
            btnGerar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> IA está criando sua prova...';
            btnGerar.disabled = true;
            
            try {
                await gerarProvaComIA(alunoNome, conteudo, quantidadeQuestoes, dificuldade);
            } catch (error) {
                console.error('Erro ao gerar prova:', error);
                btnGerar.innerHTML = originalText;
                btnGerar.disabled = false;
            }
        } else {
            // Se não tiver botão específico, usar função direta
            await gerarProvaComIA(alunoNome, conteudo, quantidadeQuestoes, dificuldade);
        }
    });
});

async function testarConexaoAPI() {
    try {
        const response = await fetch('http://localhost:3000/api/teste');
        const data = await response.json();
        
        const statusElement = document.getElementById('status');
        if (statusElement) {
            statusElement.innerHTML = `
                <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 10px 0;">
                    <p><strong>✅ Sistema Online</strong></p>
                    <p>${data.message}</p>
                    <p>IA: ${data.ia || 'OpenRouter'}</p>
                </div>
            `;
        }
        
        console.log('✅ Conexão API OK:', data);
    } catch (error) {
        console.warn('⚠️ Não consegui testar a API:', error);
    }
}

async function gerarProvaComIA(alunoNome, conteudo, quantidadeQuestoes, dificuldade) {
    console.log(`🤖 Iniciando geração IA: ${conteudo}`);
    
    const status = document.getElementById('status') || criarElementoStatus();
    
    // Mostrar status de processamento
    status.innerHTML = `
        <div class="status-processando">
            <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                <i class="fas fa-robot fa-2x" style="color: #4f46e5;"></i>
                <div>
                    <h3 style="margin: 0; color: #4f46e5;">IA Trabalhando...</h3>
                    <p style="margin: 5px 0 0 0; color: #6b7280;">Criando prova sobre: <strong>${conteudo}</strong></p>
                </div>
            </div>
            
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <p><strong>📊 Detalhes:</strong></p>
                <ul style="margin: 10px 0 10px 20px;">
                    <li><strong>Aluno:</strong> ${alunoNome}</li>
                    <li><strong>Conteúdo:</strong> ${conteudo}</li>
                    <li><strong>Questões:</strong> ${quantidadeQuestoes}</li>
                    <li><strong>Dificuldade:</strong> ${dificuldade}</li>
                </ul>
            </div>
            
            <div class="progresso-ia">
                <div class="barra-progresso">
                    <div class="progresso-interno" id="barraProgresso"></div>
                </div>
                <p style="text-align: center; margin-top: 10px; color: #6b7280;">
                    <i class="fas fa-sync-alt fa-spin"></i> Aguarde, a IA está gerando questões únicas...
                </p>
            </div>
            
            <p style="font-size: 0.9rem; color: #9ca3af; margin-top: 15px; text-align: center;">
                <i class="fas fa-info-circle"></i> Isso pode levar 15-30 segundos dependendo do tema.
            </p>
        </div>
    `;
    
    // Animar barra de progresso
    animarBarraProgresso();
    
    try {
        console.log('📤 Enviando requisição para API...');
        
        const response = await fetch('http://localhost:3000/api/gerar-prova', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                conteudo: conteudo,
                quantidadeQuestoes: parseInt(quantidadeQuestoes),
                dificuldade: dificuldade
            })
        });
        
        console.log('📥 Resposta recebida, status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Erro HTTP:', response.status, errorText);
            throw new Error(`Erro do servidor: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('📦 Dados recebidos:', data);
        
        if (data.success) {
            // Armazenar dados da prova
            localStorage.setItem('provaId', data.provaId);
            localStorage.setItem('questoes', JSON.stringify(data.questoes));
            localStorage.setItem('infoProva', JSON.stringify(data.info));
            
            console.log('✅ Prova gerada com sucesso! ID:', data.provaId);
            console.log('📚 Questões:', data.questoes.length);
            
            // Mostrar sucesso
            status.innerHTML = `
                <div style="background: #f0fdf4; padding: 20px; border-radius: 10px; margin: 20px 0;">
                    <div style="text-align: center; margin-bottom: 15px;">
                        <i class="fas fa-check-circle fa-3x" style="color: #10b981;"></i>
                    </div>
                    <h3 style="text-align: center; color: #059669; margin-bottom: 15px;">
                        Prova Gerada com Sucesso!
                    </h3>
                    
                    <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0;">
                        <p><strong>🎯 Tema:</strong> ${conteudo}</p>
                        <p><strong>📊 Questões:</strong> ${data.questoes.length} geradas</p>
                        <p><strong>🤖 IA Utilizada:</strong> ${data.info?.ia || 'OpenRouter'}</p>
                        <p><strong>⏰ Gerado em:</strong> ${new Date().toLocaleTimeString()}</p>
                    </div>
                    
                    <div style="text-align: center; margin-top: 20px;">
                        <p style="color: #059669;">
                            <i class="fas fa-rocket"></i> Redirecionando para a prova em 2 segundos...
                        </p>
                        <div class="contador-redirecionamento">
                            <span id="contador">2</span> segundos
                        </div>
                    </div>
                </div>
            `;
            
            // Contador regressivo
            let contador = 2;
            const contadorElement = document.getElementById('contador');
            const intervalo = setInterval(() => {
                contador--;
                if (contadorElement) contadorElement.textContent = contador;
                
                if (contador <= 0) {
                    clearInterval(intervalo);
                    window.location.href = 'prova.html';
                }
            }, 1000);
            
            // Fallback: redirecionar após 3 segundos mesmo se o contador falhar
            setTimeout(() => {
                window.location.href = 'prova.html';
            }, 3000);
            
        } else {
            // IA retornou erro
            throw new Error(data.error || 'Erro desconhecido na IA');
        }
        
    } catch (error) {
        console.error('💥 Erro crítico:', error);
        
        // Mostrar erro detalhado
        status.innerHTML = `
            <div style="background: #fef2f2; padding: 20px; border-radius: 10px; margin: 20px 0;">
                <div style="text-align: center; margin-bottom: 15px;">
                    <i class="fas fa-exclamation-triangle fa-3x" style="color: #dc2626;"></i>
                </div>
                <h3 style="text-align: center; color: #dc2626; margin-bottom: 15px;">
                    Erro ao Gerar Prova
                </h3>
                
                <div style="background: #fee2e2; padding: 15px; border-radius: 8px; margin: 15px 0;">
                    <p><strong>🔍 Detalhes do erro:</strong></p>
                    <p style="color: #991b1b;">${error.message}</p>
                </div>
                
                <div style="margin-top: 20px;">
                    <p><strong>🛠️ O que fazer:</strong></p>
                    <ul style="margin-left: 20px; margin-bottom: 20px;">
                        <li>Verifique se o servidor está rodando</li>
                        <li>Tente um conteúdo mais específico</li>
                        <li>Reduza o número de questões</li>
                        <li>Verifique sua conexão com a internet</li>
                    </ul>
                    
                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button onclick="location.reload()" class="btn-tentar-novamente">
                            <i class="fas fa-redo"></i> Tentar Novamente
                        </button>
                        <button onclick="window.location.href='index.html'" class="btn-voltar">
                            <i class="fas fa-home"></i> Voltar ao Início
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        throw error;
    }
}

function criarElementoStatus() {
    let status = document.getElementById('status');
    if (!status) {
        status = document.createElement('div');
        status.id = 'status';
        const container = document.querySelector('.container') || document.body;
        container.appendChild(status);
    }
    return status;
}

function animarBarraProgresso() {
    const barra = document.getElementById('barraProgresso');
    if (!barra) return;
    
    let progresso = 0;
    const intervalo = setInterval(() => {
        progresso += Math.random() * 15;
        if (progresso > 95) progresso = 95;
        barra.style.width = progresso + '%';
    }, 300);
    
    // Parar após 30 segundos (timeout de segurança)
    setTimeout(() => {
        clearInterval(intervalo);
        if (barra) barra.style.width = '100%';
    }, 30000);
}

// Adicionar estilos dinâmicos
function adicionarEstilosDinamicos() {
    const style = document.createElement('style');
    style.textContent = `
        .status-processando {
            animation: fadeIn 0.5s ease-in;
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
        
        .barra-progresso {
            width: 100%;
            height: 8px;
            background: #e5e7eb;
            border-radius: 4px;
            overflow: hidden;
            margin: 15px 0;
        }
        
        .progresso-interno {
            height: 100%;
            background: linear-gradient(90deg, #4f46e5, #7c3aed);
            width: 0%;
            transition: width 0.3s ease;
            border-radius: 4px;
        }
        
        .progresso-ia {
            animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
            0% { opacity: 1; }
            50% { opacity: 0.8; }
            100% { opacity: 1; }
        }
        
        .contador-redirecionamento {
            font-size: 1.5rem;
            font-weight: bold;
            color: #4f46e5;
            margin: 10px 0;
        }
        
        .btn-tentar-novamente, .btn-voltar {
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: transform 0.2s;
        }
        
        .btn-tentar-novamente:hover, .btn-voltar:hover {
            transform: translateY(-2px);
        }
        
        .btn-tentar-novamente {
            background: #4f46e5;
            color: white;
        }
        
        .btn-voltar {
            background: #6b7280;
            color: white;
        }
    `;
    document.head.appendChild(style);
}

// Inicializar estilos quando a página carregar
document.addEventListener('DOMContentLoaded', adicionarEstilosDinamicos);

// Função para preencher exemplo (se houver botões de exemplo)
window.preencherExemplo = function(conteudo) {
    const campoConteudo = document.getElementById('conteudo');
    if (campoConteudo) {
        campoConteudo.value = conteudo;
        campoConteudo.focus();
    }
};