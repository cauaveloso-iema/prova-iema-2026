// chatbot.js - Backend do Chatbot
const Groq = require('groq-sdk');

class ChatbotBackend {
    constructor() {
        // Usar chave específica do chatbot OU a chave geral da Groq
        const apiKey = process.env.CHATBOT_API_KEY || process.env.GROQ_API_KEY;
        
        if (!apiKey) {
            console.warn('⚠️  Chatbot: API key não configurada');
            this.groq = null;
        } else {
            this.groq = new Groq({ apiKey });
            console.log('✅ Chatbot: Configurado com Groq');
        }
        
        this.model = process.env.CHATBOT_MODEL || 'llama-3.1-8b-instant';
        this.maxTokens = parseInt(process.env.CHATBOT_MAX_TOKENS) || 500;
        this.temperature = parseFloat(process.env.CHATBOT_TEMPERATURE) || 0.7;
        
        // Contextos predefinidos
        this.contexts = {
            professor: `Você é um assistente virtual especializado em sistema de provas online para professores.
Contexto: Professor usando o painel administrativo.
Você pode ajudar com:
1. Criar e gerenciar provas
2. Gerenciar turmas e alunos
3. Corrigir provas e liberar notas
4. Analisar resultados estatísticos
5. Configurar parâmetros do sistema

Seja conciso, útil e forneça exemplos práticos.
Responda em português brasileiro.`,

            aluno: `Você é um assistente virtual especializado em sistema de provas online para alunos.
Contexto: Aluno realizando provas e acompanhando resultados.
Você pode ajudar com:
1. Como fazer provas
2. Ver notas e resultados
3. Entrar em turmas
4. Dúvidas sobre questões
5. Gerenciar tempo de prova
6. Problemas técnicos

Seja amigável, encorajador e claro.
Responda em português brasileiro.`,

            login: `Você é um assistente virtual na página de login/cadastro do sistema de provas.
Contexto: Usuário tentando acessar o sistema.
Você pode ajudar com:
1. Problemas de login
2. Cadastro de nova conta
3. Recuperação de senha
4. Dúvidas sobre tipos de conta
5. Requisitos do sistema

Seja paciente e forneça soluções passo a passo.
Responda em português brasileiro.`
        };
    }

    // Detectar contexto baseado na rota
    detectContext(route) {
        if (route.includes('/professor') || route.includes('/index.html')) {
            return this.contexts.professor;
        } else if (route.includes('/aluno') || route.includes('/aluno.html')) {
            return this.contexts.aluno;
        } else if (route.includes('/login') || route.includes('/register')) {
            return this.contexts.login;
        } else {
            return `Você é um assistente virtual do sistema de provas online.
Data: ${new Date().toLocaleDateString('pt-BR')}
Responda de forma geral sobre o sistema.
Seja útil e amigável.
Responda em português brasileiro.`;
        }
    }

    // Gerar resposta usando Groq
    async generateResponse(userMessage, context, conversationHistory = []) {
        if (!this.groq) {
            throw new Error('Chatbot não configurado');
        }

        try {
            // Preparar mensagens para a API
            const messages = [
                {
                    role: "system",
                    content: context
                },
                ...conversationHistory.slice(-5).map(msg => ({
                    role: msg.sender === 'user' ? 'user' : 'assistant',
                    content: msg.content
                })),
                {
                    role: "user",
                    content: userMessage
                }
            ];

            console.log('🤖 Chatbot: Processando mensagem...');
            
            const completion = await this.groq.chat.completions.create({
                model: this.model,
                messages: messages,
                temperature: this.temperature,
                max_tokens: this.maxTokens,
                stream: false
            });

            const response = completion.choices[0]?.message?.content;
            
            if (!response) {
                throw new Error('Resposta vazia da IA');
            }

            console.log('✅ Chatbot: Resposta gerada com sucesso');
            return response;

        } catch (error) {
            console.error('❌ Chatbot: Erro ao gerar resposta:', error.message);
            
            // Fallback responses
            const fallbacks = [
                "Desculpe, estou com dificuldades técnicas no momento. 😅",
                "Você pode tentar novamente ou reformular sua pergunta?",
                "Enquanto isso, posso sugerir que você:",
                "• Recarregue a página",
                "• Verifique sua conexão com a internet",
                "• Entre em contato com o suporte técnico"
            ];
            
            return fallbacks.join('\n');
        }
    }

    // Processar mensagem completa
    async processMessage(data) {
        const { message, route, conversationHistory = [], userId = null } = data;
        
        if (!message || typeof message !== 'string') {
            throw new Error('Mensagem inválida');
        }

        // Detectar contexto
        const context = this.detectContext(route);
        
        // Gerar resposta
        const response = await this.generateResponse(message, context, conversationHistory);
        
        // Log da interação (opcional)
        if (userId) {
            console.log(`📝 Chatbot: Interação registrada - Usuário: ${userId}`);
        }

        return {
            success: true,
            response: response,
            timestamp: new Date().toISOString(),
            model: this.model
        };
    }

    // Health check do chatbot
    async healthCheck() {
        if (!this.groq) {
            return {
                status: 'disabled',
                message: 'Chatbot não configurado'
            };
        }

        try {
            // Teste simples da API
            await this.groq.chat.completions.create({
                model: this.model,
                messages: [{ role: "user", content: "Teste" }],
                max_tokens: 1
            });

            return {
                status: 'healthy',
                message: 'Chatbot operacional',
                model: this.model,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            return {
                status: 'unhealthy',
                message: `Erro na API: ${error.message}`,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = ChatbotBackend;