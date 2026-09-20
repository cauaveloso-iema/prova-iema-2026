// Adicione esta parte no início do seu prova.js existente

class ProvaSegura extends ProvaManager {
    constructor() {
        super();
        this.timeoutInterval = null;
        this.verificarAutenticacao();
    }
    
    verificarAutenticacao() {
        // Verificar se está em modo visitante ou autenticado
        const guestMode = localStorage.getItem('guest_mode') === 'true';
        
        if (!guestMode && !window.authService.isAuthenticated()) {
            alert('Sessão expirada. Por favor, faça login novamente.');
            window.location.href = 'login.html';
            return;
        }
        
        this.iniciarTimeoutProva();
    }
    
    iniciarTimeoutProva() {
        const timeoutMinutes = parseInt(localStorage.getItem('prova_timeout') || '120');
        const timeoutMs = timeoutMinutes * 60 * 1000;
        
        this.timeoutInterval = setInterval(() => {
            this.verificarTimeout();
        }, 60000); // Verificar a cada minuto
        
        // Verificar também no blur/focus
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.registrarAusencia();
            }
        });
    }
    
    verificarTimeout() {
        const inicioProva = localStorage.getItem('inicio_prova');
        if (!inicioProva) return;
        
        const agora = Date.now();
        const tempoDecorrido = agora - parseInt(inicioProva);
        const timeoutMs = parseInt(localStorage.getItem('prova_timeout') || '120') * 60 * 1000;
        
        if (tempoDecorrido >= timeoutMs) {
            this.finalizarPorTimeout();
        }
    }
    
    registrarAusencia() {
        // Registrar tentativa de saída
        const tentativas = parseInt(localStorage.getItem('tentativas_saida') || '0') + 1;
        localStorage.setItem('tentativas_saida', tentativas);
        
        if (tentativas >= 3) {
            this.finalizarPorViolacao();
        } else {
            alert(`⚠️ Atenção! Você saiu da página (${tentativas}/3).`);
        }
    }
    
    finalizarPorTimeout() {
        clearInterval(this.timeoutInterval);
        alert('⏰ Tempo da prova esgotado! A prova será enviada automaticamente.');
        this.finalizarProvaForcadamente();
    }
    
    finalizarPorViolacao() {
        clearInterval(this.timeoutInterval);
        alert('🚫 Prova cancelada devido a múltiplas violações das regras.');
        window.location.href = 'index.html';
    }
    
    finalizarProvaForcadamente() {
        // Enviar respostas atuais mesmo incompletas
        const btnFinalizar = document.getElementById('btnFinalizar');
        if (btnFinalizar) {
            btnFinalizar.click();
        }
    }
}

// Substituir a inicialização original
document.addEventListener('DOMContentLoaded', () => {
    window.provaManager = new ProvaSegura();
    
    // Configurar timeout da prova
    const timeout = localStorage.getItem('prova_timeout') || '120';
    localStorage.setItem('inicio_prova', Date.now());
    
    // Configurar botões
    document.getElementById('btnAnterior')?.addEventListener('click', () => {
        window.provaManager.anteriorQuestao();
    });
    
    document.getElementById('btnProximo')?.addEventListener('click', () => {
        window.provaManager.proximaQuestao();
    });
    
    document.getElementById('btnFinalizar')?.addEventListener('click', () => {
        window.provaManager.finalizarProva();
    });
});








class ProvaManager {
    constructor() {
        this.questoes = [];
        this.respostas = {};
        this.questaoAtual = 0;
        this.tempoInicio = Date.now();
        this.timerInterval = null;
        this.conteudo = '';
        this.alunoNome = '';
        
        // Vincular métodos para manter o contexto
        this.selecionarOpcao = this.selecionarOpcao.bind(this);
        this.anteriorQuestao = this.anteriorQuestao.bind(this);
        this.proximaQuestao = this.proximaQuestao.bind(this);
        this.finalizarProva = this.finalizarProva.bind(this);
        this.finalizarProvaOffline = this.finalizarProvaOffline.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        
        this.carregarProva();
        this.iniciarTimer();
        this.iniciarMonitoramento();
    }
    
    carregarProva() {
        // Carregar dados da prova
        this.alunoNome = localStorage.getItem('alunoNome') || 'Aluno';
        this.conteudo = localStorage.getItem('conteudo') || 'Conhecimentos Gerais';
        
        // Atualizar informações na tela
        const alunoInfo = document.getElementById('alunoInfo');
        const conteudoInfo = document.getElementById('conteudoInfo');
        
        if (alunoInfo) {
            alunoInfo.textContent = `Aluno: ${this.alunoNome}`;
        }
        
        if (conteudoInfo) {
            conteudoInfo.innerHTML = `<i class="fas fa-book"></i> Conteúdo: ${this.conteudo}`;
        }
        
        // Carregar questões do localStorage
        const questoesStorage = localStorage.getItem('questoes');
        const infoProva = localStorage.getItem('infoProva');
        
        if (questoesStorage) {
            try {
                this.questoes = JSON.parse(questoesStorage);
                
                // Verificar se as questões são do Gemini ou fallback
                if (infoProva) {
                    const info = JSON.parse(infoProva);
                    if (info.warning) {
                        console.warn('Usando modo fallback:', info.warning);
                    }
                }
                
                console.log(`Carregadas ${this.questoes.length} questões sobre: ${this.conteudo}`);
                this.mostrarQuestao(0);
                this.criarNavegacao();
                this.atualizarEstatisticas();
                
            } catch (error) {
                console.error('Erro ao carregar questões:', error);
                this.usarQuestoesFallback();
            }
        } else {
            console.log('Nenhuma questão no localStorage, usando fallback');
            this.usarQuestoesFallback();
        }
    }
    
    usarQuestoesFallback() {
        // Questões de fallback baseadas no conteúdo
        const conteudoLower = this.conteudo.toLowerCase();
        
        if (conteudoLower.includes('história') || conteudoLower.includes('historia')) {
            this.questoes = [
                {
                    id: 1,
                    pergunta: "Em que ano o Brasil foi descoberto?",
                    opcoes: ["A) 1492", "B) 1500", "C) 1520", "D) 1450"],
                    respostaCorreta: 1,
                    explicacao: "O Brasil foi descoberto em 22 de abril de 1500 pela expedição portuguesa comandada por Pedro Álvares Cabral."
                },
                {
                    id: 2,
                    pergunta: "Quem foi o primeiro presidente do Brasil?",
                    opcoes: ["A) Dom Pedro II", "B) Marechal Deodoro da Fonseca", "C) Getúlio Vargas", "D) Juscelino Kubitschek"],
                    respostaCorreta: 1,
                    explicacao: "Marechal Deodoro da Fonseca foi o primeiro presidente do Brasil, proclamando a República em 15 de novembro de 1889."
                },
                {
                    id: 3,
                    pergunta: "Qual foi o período da ditadura militar no Brasil?",
                    opcoes: ["A) 1950-1960", "B) 1964-1985", "C) 1970-1980", "D) 1980-1990"],
                    respostaCorreta: 1,
                    explicacao: "A ditadura militar no Brasil ocorreu de 1964 a 1985, iniciando com o golpe militar de 31 de março de 1964."
                }
            ];
        } else if (conteudoLower.includes('matemática') || conteudoLower.includes('matematica')) {
            this.questoes = [
                {
                    id: 1,
                    pergunta: "Qual é o valor de π (pi) aproximadamente?",
                    opcoes: ["A) 2.14", "B) 3.14", "C) 4.14", "D) 1.14"],
                    respostaCorreta: 1,
                    explicacao: "O valor de π é aproximadamente 3.14159, mas geralmente usamos 3.14 para cálculos simples."
                },
                {
                    id: 2,
                    pergunta: "Quanto é 5²?",
                    opcoes: ["A) 10", "B) 15", "C) 20", "D) 25"],
                    respostaCorreta: 3,
                    explicacao: "5² significa 5 × 5 = 25. O expoente 2 indica que o número deve ser multiplicado por si mesmo."
                },
                {
                    id: 3,
                    pergunta: "Qual é a raiz quadrada de 144?",
                    opcoes: ["A) 10", "B) 11", "C) 12", "D) 13"],
                    respostaCorreta: 2,
                    explicacao: "A raiz quadrada de 144 é 12, pois 12 × 12 = 144."
                }
            ];
        } else {
            // Questões gerais como fallback
            this.questoes = [
                {
                    id: 1,
                    pergunta: "Qual é a capital do Brasil?",
                    opcoes: ["A) São Paulo", "B) Rio de Janeiro", "C) Brasília", "D) Belo Horizonte"],
                    respostaCorreta: 2,
                    explicacao: "Brasília foi fundada em 21 de abril de 1960 para ser a nova capital do Brasil, substituindo o Rio de Janeiro."
                },
                {
                    id: 2,
                    pergunta: "Quanto é 15 ÷ 3 × 4?",
                    opcoes: ["A) 5", "B) 12", "C) 20", "D) 18"],
                    respostaCorreta: 2,
                    explicacao: "Primeiro dividimos 15 por 3 = 5, depois multiplicamos por 4 = 20. Na matemática, divisão e multiplicação têm a mesma precedência e são resolvidas da esquerda para a direita."
                },
                {
                    id: 3,
                    pergunta: "Qual o maior planeta do sistema solar?",
                    opcoes: ["A) Terra", "B) Marte", "C) Júpiter", "D) Saturno"],
                    respostaCorreta: 2,
                    explicacao: "Júpiter é o maior planeta do sistema solar, com diâmetro de aproximadamente 142.984 km."
                }
            ];
        }
        
        // Ajustar para o número de questões solicitado
        const quantidadeSolicitada = parseInt(localStorage.getItem('quantidadeQuestoes') || '3');
        this.questoes = this.questoes.slice(0, quantidadeSolicitada);
        
        this.mostrarQuestao(0);
        this.criarNavegacao();
        this.atualizarEstatisticas();
    }
    
    mostrarQuestao(index) {
        if (index < 0 || index >= this.questoes.length) return;
        
        this.questaoAtual = index;
        const questao = this.questoes[index];
        
        // Atualizar número da questão
        const questaoNumero = document.getElementById('questaoNumero');
        if (questaoNumero) {
            questaoNumero.textContent = `Questão ${index + 1} de ${this.questoes.length}`;
        }
        
        // Atualizar texto da questão
        const questaoTexto = document.getElementById('questaoTexto');
        if (questaoTexto) {
            questaoTexto.textContent = questao.pergunta;
        }
        
        // Atualizar opções
        const opcoesContainer = document.getElementById('opcoesContainer');
        if (opcoesContainer) {
            opcoesContainer.innerHTML = '';
            
            questao.opcoes.forEach((opcao, i) => {
                const opcaoElement = document.createElement('div');
                opcaoElement.className = `opcao-item ${this.respostas[index] === i ? 'selected' : ''}`;
                opcaoElement.onclick = () => this.selecionarOpcao(i);
                
                const letra = String.fromCharCode(65 + i);
                opcaoElement.innerHTML = `
                    <div class="opcao-letra">${letra}</div>
                    <div class="opcao-texto">${opcao}</div>
                `;
                
                opcoesContainer.appendChild(opcaoElement);
            });
        }
        
        // Atualizar navegação
        this.atualizarNavegacao();
        
        // Atualizar botões de navegação
        const btnAnterior = document.getElementById('btnAnterior');
        const btnProximo = document.getElementById('btnProximo');
        
        if (btnAnterior) {
            btnAnterior.disabled = index === 0;
        }
        
        if (btnProximo) {
            btnProximo.disabled = index === this.questoes.length - 1;
        }
    }
    
    selecionarOpcao(opcaoIndex) {
        this.respostas[this.questaoAtual] = opcaoIndex;
        
        // Atualizar visual
        const opcoes = document.querySelectorAll('.opcao-item');
        opcoes.forEach((opcao, i) => {
            opcao.classList.toggle('selected', i === opcaoIndex);
        });
        
        // Atualizar navegação e estatísticas
        this.atualizarNavegacao();
        this.atualizarEstatisticas();
    }
    
    criarNavegacao() {
        const container = document.getElementById('questaoNav');
        if (!container) return;
        
        container.innerHTML = '';
        
        this.questoes.forEach((_, i) => {
            const btn = document.createElement('button');
            btn.className = 'nav-btn';
            btn.textContent = i + 1;
            btn.onclick = () => this.mostrarQuestao(i);
            container.appendChild(btn);
        });
    }
    
    atualizarNavegacao() {
        const botoes = document.querySelectorAll('.nav-btn');
        botoes.forEach((btn, i) => {
            btn.classList.remove('active', 'answered');
            
            if (i === this.questaoAtual) {
                btn.classList.add('active');
            }
            
            if (this.respostas[i] !== undefined) {
                btn.classList.add('answered');
            }
        });
    }
    
    atualizarEstatisticas() {
        const respondidas = Object.values(this.respostas).filter(r => r !== undefined).length;
        const restantes = this.questoes.length - respondidas;
        const minutos = Math.floor((Date.now() - this.tempoInicio) / 60000);
        
        const statRespondidas = document.getElementById('statRespondidas');
        const statRestantes = document.getElementById('statRestantes');
        const statTempo = document.getElementById('statTempo');
        
        if (statRespondidas) statRespondidas.textContent = respondidas;
        if (statRestantes) statRestantes.textContent = restantes;
        if (statTempo) statTempo.textContent = `${minutos}min`;
    }
    
    iniciarTimer() {
        this.timerInterval = setInterval(() => {
            const tempoDecorrido = Date.now() - this.tempoInicio;
            const horas = Math.floor(tempoDecorrido / 3600000);
            const minutos = Math.floor((tempoDecorrido % 3600000) / 60000);
            const segundos = Math.floor((tempoDecorrido % 60000) / 1000);
            
            const timerElement = document.getElementById('timer');
            if (timerElement) {
                timerElement.textContent = 
                    `${horas.toString().padStart(2, '0')}:${minutos.toString().padStart(2, '0')}:${segundos.toString().padStart(2, '0')}`;
            }
            
            // Atualizar estatísticas a cada 30 segundos
            if (segundos % 30 === 0) {
                this.atualizarEstatisticas();
            }
        }, 1000);
    }
    
    async handleKeyDown(e) {
        // Prevenir F5
        if (e.key === 'F5') {
            e.preventDefault();
            // Trocar alert por toast
            if (typeof this.showToast === 'function') {
                this.showToast('Recarregar a página cancelará sua prova!', 'warning');
            } else {
                console.warn('Recarregar a página cancelará sua prova!');
            }
            return;
        }
        
        // Prevenir Ctrl+R
        if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            if (typeof this.showToast === 'function') {
                this.showToast('Recarregar a página cancelará sua prova!', 'warning');
            } else {
                console.warn('Recarregar a página cancelará sua prova!');
            }
            return;
        }
        
        // Prevenir Ctrl+T (nova aba)
        if (e.ctrlKey && e.key === 't') {
            e.preventDefault();
            return;
        }
        
        // Atalhos para navegação
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            this.anteriorQuestao();
            return;
        }
        
        if (e.key === 'ArrowRight') {
            e.preventDefault();
            this.proximaQuestao();
            return;
        }
        
        // Atalhos para opções (1, 2, 3, 4)
        if (e.key >= '1' && e.key <= '4') {
            e.preventDefault();
            const opcaoIndex = parseInt(e.key) - 1;
            this.selecionarOpcao(opcaoIndex);
            return;
        }
        
        // Atalho para finalizar (Esc)
        if (e.key === 'Escape') {
            e.preventDefault();
            const confirmar = await confirm('Deseja finalizar a prova?');
            if (confirmar) {
                this.finalizarProva();
            }
            return;
        }
    }
    
    iniciarMonitoramento() {
        // Prevenir saída da página
        window.onbeforeunload = (e) => {
            e.preventDefault();
            e.returnValue = '';
            return 'Se você sair da página, sua prova será cancelada.';
        };
        
        // Monitorar perda de foco
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                alert('⚠️ ATENÇÃO! Você saiu da página da prova. Esta ação está sendo monitorada.');
            }
        });
        
        // Prevenir teclas de atalho
        document.addEventListener('keydown', this.handleKeyDown);
        
        // Prevenir clique direito
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        // Prevenir arrastar
        document.addEventListener('dragstart', (e) => {
            e.preventDefault();
        });
        
        // Prevenir seleção de texto
        document.addEventListener('selectstart', (e) => {
            e.preventDefault();
        });
    }
    
    anteriorQuestao() {
        if (this.questaoAtual > 0) {
            this.mostrarQuestao(this.questaoAtual - 1);
        }
    }
    
    proximaQuestao() {
        if (this.questaoAtual < this.questoes.length - 1) {
            this.mostrarQuestao(this.questaoAtual + 1);
        }
    }
    
    async finalizarProva() {
        // Verificar se todas as questões foram respondidas
        const respondidas = Object.values(this.respostas).filter(r => r !== undefined).length;
        const total = this.questoes.length;
        
        if (respondidas < total) {
            const confirmar = await confirm(`Você respondeu apenas ${respondidas} de ${total} questões. Deseja finalizar mesmo assim?`);
            if (!confirmar) return;
        }
        
        // Desabilitar botão para evitar múltiplos cliques
        const btnFinalizar = document.getElementById('btnFinalizar');
        if (btnFinalizar) {
            btnFinalizar.disabled = true;
            btnFinalizar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
        }
        
        const tempoTotal = Math.floor((Date.now() - this.tempoInicio) / 1000);
        
        // Limpar intervalos
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        try {
            // Converter respostas para array
            const respostasArray = [];
            for (let i = 0; i < this.questoes.length; i++) {
                respostasArray.push(this.respostas[i] !== undefined ? this.respostas[i] : null);
            }
            
            const resposta = await fetch('http://localhost:3000/api/submeter-prova', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    provaId: localStorage.getItem('provaId') || 'prova_fallback',
                    respostas: respostasArray,
                    alunoNome: this.alunoNome,
                    tempoGasto: tempoTotal,
                    conteudo: this.conteudo
                })
            });
            
            if (!resposta.ok) {
                throw new Error(`Erro HTTP ${resposta.status}: ${resposta.statusText}`);
            }
            
            const resultado = await resposta.json();
            
            if (resultado.success) {
                // Limpar localStorage
                localStorage.removeItem('provaId');
                localStorage.removeItem('questoes');
                localStorage.removeItem('infoProva');
                
                // Salvar resultado e redirecionar
                localStorage.setItem('resultadoId', resultado.resultadoId);
                window.location.href = 'resultados.html';
            } else {
                throw new Error(resultado.error || 'Erro ao submeter prova');
            }
            
        } catch (error) {
            console.error('Erro ao finalizar prova:', error);
            
            // Mostrar erro e permitir tentar novamente
            if (btnFinalizar) {
                btnFinalizar.disabled = false;
                btnFinalizar.innerHTML = '<i class="fas fa-paper-plane"></i> Finalizar Prova';
            }
            
            const tentarOffline = await confirm(`❌ Erro ao enviar prova: ${error.message}\n\nDeseja calcular o resultado localmente?`);
            
            if (tentarOffline) {
                // Modo offline - calcular resultado localmente
                this.finalizarProvaOffline(tempoTotal);
            }
        }
    }
    
    finalizarProvaOffline(tempoTotal) {
        // Calcular resultado localmente
        let acertos = 0;
        const detalhes = [];
        
        this.questoes.forEach((questao, index) => {
            const respostaAluno = this.respostas[index];
            const correta = respostaAluno === questao.respostaCorreta;
            
            if (correta) acertos++;
            
            detalhes.push({
                pergunta: questao.pergunta,
                respostaAluno: respostaAluno !== undefined ? respostaAluno : -1,
                respostaCorreta: questao.respostaCorreta,
                explicacao: questao.explicacao || 'Sem explicação disponível',
                acertou: correta,
                opcoes: questao.opcoes
            });
        });
        
        const nota = (acertos / this.questoes.length) * 10;
        const resultadoId = 'result_offline_' + Date.now();
        
        // Salvar resultado offline
        const resultado = {
            alunoNome: this.alunoNome,
            nota: nota.toFixed(2),
            acertos,
            total: this.questoes.length,
            porcentagem: ((acertos / this.questoes.length) * 100).toFixed(1),
            tempoGasto: tempoTotal,
            detalhes,
            data: new Date().toISOString(),
            conteudo: this.conteudo,
            resultadoId: resultadoId,
            iaUsada: 'Modo Offline',
            warning: 'Resultado calculado localmente (servidor indisponível)'
        };
        
        localStorage.setItem('resultadoOffline', JSON.stringify(resultado));
        localStorage.setItem('resultadoId', resultadoId);
        
        // Limpar dados da prova
        localStorage.removeItem('provaId');
        localStorage.removeItem('questoes');
        localStorage.removeItem('infoProva');
        
        // Redirecionar para resultados
        window.location.href = 'resultados.html';
    }
    
    // Método para limpar recursos
    destruir() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
        
        // Remover event listeners
        document.removeEventListener('keydown', this.handleKeyDown);
        window.onbeforeunload = null;
    }
}

// Inicializar quando a página carregar
let provaManager = null;

document.addEventListener('DOMContentLoaded', () => {
    try {
        provaManager = new ProvaManager();
        
        // Configurar botões
        const btnAnterior = document.getElementById('btnAnterior');
        const btnProximo = document.getElementById('btnProximo');
        const btnFinalizar = document.getElementById('btnFinalizar');
        
        if (btnAnterior) {
            btnAnterior.addEventListener('click', () => {
                if (provaManager) provaManager.anteriorQuestao();
            });
        }
        
        if (btnProximo) {
            btnProximo.addEventListener('click', () => {
                if (provaManager) provaManager.proximaQuestao();
            });
        }
        
        if (btnFinalizar) {
            btnFinalizar.addEventListener('click', () => {
                if (provaManager) provaManager.finalizarProva();
            });
        }
        
    } catch (error) {
        console.error('Erro ao inicializar a prova:', error);
        alert('Erro ao carregar a prova. Por favor, retorne à página inicial e tente novamente.');
        
        // Redirecionar após 3 segundos
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 3000);
    }
});

// Limpar recursos ao sair da página
window.addEventListener('unload', () => {
    if (provaManager) {
        provaManager.destruir();
    }
});