// backend/email-service.js (VERSÃO COMPLETA ATUALIZADA)
const nodemailer = require('nodemailer');
require('dotenv').config();

class EmailService {
    constructor() {
        this.transporter = null;
        this.lastGeneratedCode = null;
        this.lastGeneratedEmail = null;
        this.lastGeneratedTime = null;
        this.init();
    }
    
    init() {
        try {
            console.log('\n🔧 ===== INICIALIZANDO SERVIÇO DE EMAIL =====');
            console.log('📡 Serviço:', process.env.EMAIL_SERVICE);
            console.log('🌐 Ambiente:', process.env.NODE_ENV);
            console.log('🔄 Render?', process.env.RENDER ? '✅ Sim' : '❌ Não');
            console.log('📧 Host:', process.env.SMTP_HOST);
            console.log('👤 Usuário:', process.env.SMTP_USER ? '✅ Configurado' : '❌ Não configurado');
            console.log('📨 Remetente:', process.env.EMAIL_FROM);
            console.log('=============================================\n');
            
            // Verificar se estamos no Render
            const isRender = process.env.RENDER === 'true' || 
                           process.env.NODE_ENV === 'production';
            
            // Configuração para Brevo (Sendinblue)
            if (process.env.EMAIL_SERVICE === 'brevo' && !isRender) {
                if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
                    console.warn('⚠️  Credenciais SMTP incompletas, usando modo desenvolvimento');
                    this.setupDevMode();
                    return;
                }
                
                console.log('🔄 Configurando Brevo SMTP...');
                this.transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: parseInt(process.env.SMTP_PORT) || 587,
                    secure: false,
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS
                    },
                    tls: {
                        rejectUnauthorized: false
                    },
                    // Configurações otimizadas
                    connectionTimeout: 30000, // 30 segundos
                    greetingTimeout: 30000,   // 30 segundos
                    socketTimeout: 45000,     // 45 segundos
                    debug: process.env.NODE_ENV === 'development'
                });
                
                console.log('✅ Brevo SMTP configurado para ambiente local');
                
                // Testar conexão apenas em desenvolvimento
                if (process.env.NODE_ENV === 'development') {
                    this.testConnection();
                }
                
            } else if (isRender) {
                // No Render, usar modo fallback automático
                console.log('🚨 RENDER DETECTADO: Usando modo fallback para emails');
                console.log('💡 Emails serão simulados, códigos aparecerão nos logs');
                this.setupRenderMode();
                
            } else {
                // Modo desenvolvimento padrão
                console.log('⚠️  Modo desenvolvimento: emails simulados');
                this.setupDevMode();
            }
        } catch (error) {
            console.error('❌ Erro ao configurar Email Service:', error.message);
            this.setupDevMode(); // Fallback seguro
        }
    }
    
    setupRenderMode() {
        this.transporter = {
            sendMail: async (options) => {
                console.log('\n📧 ===== EMAIL SIMULADO (RENDER) =====');
                console.log('📨 Para:', options.to);
                console.log('📝 Assunto:', options.subject);
                
                // Extrair código do HTML
                const codeMatch = options.html?.match(/\b\d{6}\b/);
                const code = codeMatch ? codeMatch[0] : 'N/A';
                
                // Salvar para possível recuperação
                this.lastGeneratedCode = code;
                this.lastGeneratedEmail = options.to;
                this.lastGeneratedTime = new Date();
                
                console.log('🔑 Código de recuperação:', code);
                console.log('⏰ Gerado em:', this.lastGeneratedTime.toLocaleString('pt-BR'));
                
                // Criar URL de teste
                const testUrl = `${process.env.APP_URL}/recuperar-senha.html?test_mode=1&code=${code}&email=${encodeURIComponent(options.to)}`;
                console.log('🔗 URL de teste:', testUrl);
                
                console.log('\n💡 INSTRUÇÕES:');
                console.log('1. Use o código acima na página de recuperação');
                console.log('2. Ou acesse a URL de teste');
                console.log('3. Código válido por 15 minutos');
                console.log('===========================================\n');
                
                return { 
                    messageId: 'render-simulated-' + Date.now(),
                    response: '250 Email simulado no Render'
                };
            }
        };
    }
    
    setupDevMode() {
        console.log('🔄 Configurando modo de desenvolvimento...');
        this.transporter = {
            sendMail: async (options) => {
                console.log('\n📧 ===== EMAIL SIMULADO (DEV) =====');
                console.log('📨 Para:', options.to);
                console.log('📝 Assunto:', options.subject);
                
                // Extrair código
                const codeMatch = options.html?.match(/\b\d{6}\b/);
                const code = codeMatch ? codeMatch[0] : 'N/A';
                
                console.log('🔑 Código:', code);
                console.log('💡 Use este código na página de recuperação');
                console.log('===========================================\n');
                
                return { 
                    messageId: 'dev-simulated-' + Date.now(),
                    response: '250 Email simulado'
                };
            }
        };
    }
    
    async testConnection() {
        try {
            console.log('🔍 Testando conexão SMTP...');
            await this.transporter.verify();
            console.log('✅ Conexão SMTP estabelecida com sucesso!');
            return true;
        } catch (error) {
            console.error('❌ Falha na conexão SMTP:', error.message);
            console.log('🔄 Mudando para modo desenvolvimento...');
            this.setupDevMode();
            return false;
        }
    }
    
    async sendPasswordResetEmail(userEmail, userName, resetCode) {
        try {
            console.log('\n🚀 ===== ENVIANDO EMAIL DE RECUPERAÇÃO =====');
            console.log('📨 Para:', userEmail);
            console.log('👤 Nome:', userName);
            console.log('🔢 Código:', resetCode);
            console.log('🕒 Hora:', new Date().toLocaleString('pt-BR'));
            
            // Determinar email do remetente
            let fromEmail = process.env.EMAIL_FROM;
            
            // Se EMAIL_FROM estiver no formato "Nome <email>", extrair apenas o email
            const emailMatch = fromEmail?.match(/<(.+?)>/);
            if (emailMatch) {
                fromEmail = emailMatch[1];
            }
            
            const emailData = {
                from: fromEmail || 'naoresponda@sistema-provas.com',
                to: userEmail,
                subject: '🔐 Código de Recuperação de Senha - Sistema de Provas',
                html: this.getResetPasswordTemplate(userName, resetCode),
                // Texto alternativo para clientes que não suportam HTML
                text: `Olá ${userName},\n\nSeu código de recuperação é: ${resetCode}\n\nEste código é válido por 15 minutos.\n\nAtenciosamente,\nEquipe do Sistema de Provas`,
                headers: {
                    'X-Priority': '1',
                    'X-MSMail-Priority': 'High',
                    'Importance': 'high',
                    'X-Mailer': 'Sistema de Provas 1.0'
                }
            };
            
            console.log('📤 Remetente:', emailData.from);
            console.log('⚙️  Serviço:', process.env.EMAIL_SERVICE);
            console.log('🌐 Ambiente:', process.env.NODE_ENV);
            
            // Enviar email
            const result = await this.transporter.sendMail(emailData);
            
            console.log('✅ Email processado com sucesso!');
            console.log('📊 ID da mensagem:', result.messageId);
            console.log('📨 Resposta:', result.response?.substring(0, 100) || 'N/A');
            
            // Se estiver no Render ou modo dev, mostrar informações extras
            const isRenderOrDev = process.env.RENDER === 'true' || 
                                 process.env.NODE_ENV !== 'production';
            
            if (isRenderOrDev && result.messageId.includes('simulated')) {
                console.log('\n💡 INFORMAÇÕES PARA TESTE:');
                console.log('🔑 Código:', resetCode);
                console.log('📧 Email:', userEmail);
                console.log('⏰ Validade: 15 minutos');
                console.log('🌐 Acesse:', `${process.env.APP_URL}/recuperar-senha.html`);
            }
            
            console.log('===============================================\n');
            
            return { 
                success: true, 
                messageId: result.messageId,
                service: process.env.EMAIL_SERVICE || 'simulated',
                response: result.response,
                simulated: result.messageId.includes('simulated')
            };
            
        } catch (error) {
            console.error('\n❌ ===== ERRO AO PROCESSAR EMAIL =====');
            console.error('Email:', userEmail);
            console.error('Erro:', error.message);
            console.error('Código:', error.code);
            console.error('====================================\n');
            
            // Fallback seguro: sempre retornar sucesso em desenvolvimento
            if (process.env.NODE_ENV !== 'production') {
                console.log('🔄 Usando fallback de desenvolvimento...');
                return { 
                    success: true, 
                    messageId: 'fallback-' + Date.now(),
                    service: 'fallback',
                    simulated: true,
                    warning: 'Email não enviado (modo fallback)',
                    code: resetCode // Incluir código para testes
                };
            }
            
            return { 
                success: false, 
                error: error.message,
                code: error.code
            };
        }
    }
    
    async sendPasswordChangedEmail(userEmail, userName) {
        try {
            console.log('\n✅ ===== ENVIANDO EMAIL DE CONFIRMAÇÃO =====');
            console.log('📨 Para:', userEmail);
            console.log('👤 Nome:', userName);
            
            let fromEmail = process.env.EMAIL_FROM;
            const emailMatch = fromEmail?.match(/<(.+?)>/);
            if (emailMatch) {
                fromEmail = emailMatch[1];
            }
            
            const emailData = {
                from: fromEmail || 'naoresponda@sistema-provas.com',
                to: userEmail,
                subject: '✅ Senha Alterada com Sucesso - Sistema de Provas',
                html: this.getPasswordChangedTemplate(userName),
                text: `Olá ${userName},\n\nSua senha foi alterada com sucesso em ${new Date().toLocaleString('pt-BR')}.\n\nAtenciosamente,\nEquipe do Sistema de Provas`
            };
            
            const result = await this.transporter.sendMail(emailData);
            
            console.log('✅ Email de confirmação processado!');
            console.log('📊 ID:', result.messageId);
            console.log('===============================================\n');
            
            return { 
                success: true, 
                messageId: result.messageId 
            };
            
        } catch (error) {
            console.error('❌ Erro ao enviar email de confirmação:', error.message);
            // Não falhar o processo principal
            return { success: false, error: error.message };
        }
    }
    
    async sendWelcomeEmail(userEmail, userName) {
        try {
            console.log('\n🎉 ===== ENVIANDO EMAIL DE BOAS-VINDAS =====');
            console.log('📨 Para:', userEmail);
            console.log('👤 Nome:', userName);
            
            let fromEmail = process.env.EMAIL_FROM;
            const emailMatch = fromEmail?.match(/<(.+?)>/);
            if (emailMatch) {
                fromEmail = emailMatch[1];
            }
            
            const emailData = {
                from: fromEmail || 'naoresponda@sistema-provas.com',
                to: userEmail,
                subject: '🎉 Bem-vindo ao Sistema de Provas!',
                html: this.getWelcomeTemplate(userName),
                text: `Olá ${userName},\n\nBem-vindo ao Sistema de Provas Online!\n\nAtenciosamente,\nEquipe do Sistema de Provas`
            };
            
            const result = await this.transporter.sendMail(emailData);
            
            console.log('✅ Email de boas-vindas processado!');
            console.log('📊 ID:', result.messageId);
            console.log('===============================================\n');
            
            return { 
                success: true, 
                messageId: result.messageId 
            };
            
        } catch (error) {
            console.error('❌ Erro ao enviar email de boas-vindas:', error.message);
            return { success: false, error: error.message };
        }
    }
    
    // Método para obter último código gerado (útil para testes)
    getLastCode() {
        return {
            code: this.lastGeneratedCode,
            email: this.lastGeneratedEmail,
            time: this.lastGeneratedTime,
            isValid: this.lastGeneratedTime && 
                    (Date.now() - this.lastGeneratedTime) < (15 * 60 * 1000)
        };
    }
    
    // Templates HTML (mantenha os que já temos)
    getResetPasswordTemplate(name, code) {
        // Template SIMPLES e compatível
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Recuperação de Senha</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }
                .header {
                    text-align: center;
                    padding: 20px;
                    background-color: #4f46e5;
                    color: white;
                    border-radius: 8px 8px 0 0;
                }
                .content {
                    padding: 30px;
                    background-color: #f9fafb;
                    border: 1px solid #e5e7eb;
                }
                .code-box {
                    text-align: center;
                    margin: 30px 0;
                    padding: 20px;
                    background-color: white;
                    border: 2px solid #4f46e5;
                    border-radius: 8px;
                    font-family: monospace;
                }
                .code {
                    font-size: 32px;
                    font-weight: bold;
                    letter-spacing: 5px;
                    color: #4f46e5;
                    margin: 10px 0;
                }
                .footer {
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #e5e7eb;
                    color: #6b7280;
                    font-size: 12px;
                    text-align: center;
                }
                .warning {
                    background-color: #fef3c7;
                    border-left: 4px solid #f59e0b;
                    padding: 15px;
                    margin: 20px 0;
                }
                .button {
                    display: inline-block;
                    background-color: #4f46e5;
                    color: white;
                    padding: 12px 24px;
                    text-decoration: none;
                    border-radius: 6px;
                    margin: 15px 0;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🔐 Recuperação de Senha</h1>
                <p>Sistema de Provas Online</p>
            </div>
            
            <div class="content">
                <h2>Olá, ${name}!</h2>
                <p>Você solicitou a recuperação da sua senha no Sistema de Provas.</p>
                
                <div class="code-box">
                    <p><strong>Seu código de verificação:</strong></p>
                    <div class="code">${code}</div>
                    <p style="color: #6b7280; font-size: 14px;">
                        ⏰ Válido por 15 minutos
                    </p>
                </div>
                
                <div class="warning">
                    <p><strong>⚠️ Importante:</strong></p>
                    <p>• Não compartilhe este código com ninguém</p>
                    <p>• Se não foi você que solicitou, ignore este email</p>
                    <p>• O código expira em 15 minutos</p>
                </div>
                
                <p style="text-align: center;">
                    <a href="${process.env.APP_URL || 'https://prova-iema-2026.onrender.com'}/recuperar-senha.html" class="button">
                        Redefinir Minha Senha
                    </a>
                </p>
                
                <p>Se você tiver problemas com o código, solicite um novo na página de recuperação.</p>
                
                <p>Atenciosamente,<br>
                <strong>Equipe do Sistema de Provas</strong></p>
            </div>
            
            <div class="footer">
                <p>© ${new Date().getFullYear()} Sistema de Provas Online. Todos os direitos reservados.</p>
                <p>Este é um email automático, por favor não responda.</p>
            </div>
        </body>
        </html>
        `;
    }
    
    getPasswordChangedTemplate(name) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Senha Alterada</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; text-align: center; }
                .content { padding: 30px; }
                .success-box { background: #d1fae5; border: 2px solid #10b981; padding: 20px; border-radius: 8px; margin: 20px 0; }
                .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 12px; border-top: 1px solid #dee2e6; }
                .btn { display: inline-block; background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 15px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✅ Senha Alterada</h1>
                    <p>Sistema de Provas Online</p>
                </div>
                
                <div class="content">
                    <h2>Olá, ${name}!</h2>
                    
                    <div class="success-box">
                        <p><strong>✔️ Sua senha foi alterada com sucesso!</strong></p>
                        <p>📅 Data da alteração: ${new Date().toLocaleString('pt-BR')}</p>
                    </div>
                    
                    <p style="text-align: center;">
                        <a href="${process.env.APP_URL || 'https://prova-iema-2026.onrender.com'}/login.html" class="btn">
                            Fazer Login
                        </a>
                    </p>
                    
                    <p><strong>Dúvidas ou problemas?</strong><br>
                    Entre em contato com nosso suporte.</p>
                    
                    <p>Atenciosamente,<br>
                    <strong>Equipe do Sistema de Provas</strong></p>
                </div>
                
                <div class="footer">
                    <p>© ${new Date().getFullYear()} Sistema de Provas Online. Todos os direitos reservados.</p>
                    <p>Este é um email automático, por favor não responda.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }
    
    getWelcomeTemplate(name) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Bem-vindo!</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; padding: 40px; text-align: center; }
                .content { padding: 30px; }
                .features { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin: 25px 0; }
                .feature { background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; border: 1px solid #dee2e6; }
                .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 12px; border-top: 1px solid #dee2e6; }
                .btn { display: inline-block; background: #8b5cf6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 15px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Bem-vindo ao Sistema de Provas!</h1>
                    <p>Sua conta foi criada com sucesso</p>
                </div>
                
                <div class="content">
                    <h2>Olá, ${name}!</h2>
                    <p>Estamos muito felizes em ter você conosco! Agora você tem acesso a:</p>
                    
                    <div class="features">
                        <div class="feature">
                            <div style="font-size: 24px;">📝</div>
                            <strong>Realizar Provas</strong>
                        </div>
                        <div class="feature">
                            <div style="font-size: 24px;">📊</div>
                            <strong>Ver Resultados</strong>
                        </div>
                        <div class="feature">
                            <div style="font-size: 24px;">👨‍🏫</div>
                            <strong>Acessar Turmas</strong>
                        </div>
                        <div class="feature">
                            <div style="font-size: 24px;">🤖</div>
                            <strong>Chatbot de Ajuda</strong>
                        </div>
                    </div>
                    
                    <p style="text-align: center;">
                        <a href="${process.env.APP_URL || 'https://prova-iema-2026.onrender.com'}/login.html" class="btn">
                            Acessar Minha Conta
                        </a>
                    </p>
                    
                    <p><strong>Dicas de segurança:</strong></p>
                    <ul>
                        <li>Mantenha sua senha segura</li>
                        <li>Não compartilhe sua conta</li>
                        <li>Use senhas fortes</li>
                    </ul>
                    
                    <p>Atenciosamente,<br>
                    <strong>Equipe do Sistema de Provas</strong></p>
                </div>
                
                <div class="footer">
                    <p>© ${new Date().getFullYear()} Sistema de Provas Online. Todos os direitos reservados.</p>
                    <p>Este é um email automático, por favor não responda.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }
}

module.exports = EmailService;