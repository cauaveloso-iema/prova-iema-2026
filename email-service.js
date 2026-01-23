// email-service.js
const nodemailer = require('nodemailer');
const { Resend } = require('resend');
require('dotenv').config();

class EmailService {
    constructor() {
        this.transporter = null;
        this.resendClient = null;
        this.init();
    }
    
    init() {
        try {
            console.log('🔧 Inicializando Email Service...');
            console.log('🔑 EMAIL_SERVICE:', process.env.EMAIL_SERVICE);
            console.log('📧 EMAIL_FROM:', process.env.EMAIL_FROM);
            
            // Configuração para Resend
            if (process.env.EMAIL_SERVICE === 'resend') {
                if (!process.env.RESEND_API_KEY) {
                    throw new Error('RESEND_API_KEY não configurada no .env');
                }
                
                this.resendClient = new Resend(process.env.RESEND_API_KEY);
                console.log('✅ Email Service: Configurado com Resend');
                console.log('🔐 Resend API Key:', process.env.RESEND_API_KEY ? '✅ Configurada' : '❌ Não configurada');
                
                // Teste rápido da conexão
                this.testResendConnection();
            }
            // ... outras configurações permanecem iguais
            else {
                console.log('⚠️  Email Service: Modo desenvolvimento (emails não serão enviados)');
                this.transporter = {
                    sendMail: async (options) => {
                        console.log('📧 [DEV] Email simulado:', {
                            to: options.to,
                            subject: options.subject,
                            code: options.html?.match(/\d{6}/)?.[0] || 'N/A'
                        });
                        return { messageId: 'dev-mode' };
                    }
                };
            }
        } catch (error) {
            console.error('❌ Erro ao configurar Email Service:', error.message);
            this.transporter = null;
            this.resendClient = null;
        }
    }
    
    async testResendConnection() {
        try {
            console.log('🔍 Testando conexão com Resend...');
            // Teste simples - tentar obter a conta
            const response = await this.resendClient.domains.list();
            console.log('✅ Conexão com Resend: OK');
        } catch (error) {
            console.warn('⚠️  Não foi possível testar conexão Resend:', error.message);
            // Não falhar, apenas logar aviso
        }
    }
    
    async sendPasswordResetEmail(userEmail, userName, resetCode) {
        try {
            // IMPORTANTE: No Resend, o "from" deve ser um email válido verificado
            // Use o domínio resend.dev para testes OU seu domínio verificado
            let fromEmail;
            
            if (process.env.EMAIL_FROM) {
                // Extrai email do formato "Nome <email>"
                const match = process.env.EMAIL_FROM.match(/<(.+?)>/);
                fromEmail = match ? match[1] : process.env.EMAIL_FROM;
            } else {
                // Fallback para domínio de teste do Resend
                fromEmail = 'onboarding@resend.dev';
            }
            
            console.log(`📤 Enviando email para: ${userEmail}`);
            console.log(`👤 Nome: ${userName}`);
            console.log(`🔑 Código: ${resetCode}`);
            console.log(`📨 Remetente: ${fromEmail}`);
            
            const emailData = {
                from: fromEmail,
                to: userEmail,
                subject: '🔐 Código de Recuperação de Senha - Sistema de Provas',
                html: this.getResetPasswordTemplate(userName, resetCode),
                headers: {
                    'X-Entity-Ref-ID': 'password-reset-' + Date.now(),
                    'X-Priority': '1',
                    'X-MSMail-Priority': 'High'
                }
            };
            
            let result;
            
            if (this.resendClient) {
                console.log('🚀 Enviando via Resend API...');
                result = await this.resendClient.emails.send(emailData);
                
                if (result.error) {
                    throw new Error(result.error.message || 'Erro desconhecido do Resend');
                }
                
                console.log(`✅ Email enviado via Resend! ID: ${result.data?.id}`);
                return { 
                    success: true, 
                    messageId: result.data?.id,
                    service: 'resend'
                };
            } 
            else if (this.transporter) {
                console.log('🚀 Enviando via SMTP...');
                result = await this.transporter.sendMail(emailData);
                console.log(`✅ Email enviado via SMTP! ID: ${result.messageId}`);
                return { 
                    success: true, 
                    messageId: result.messageId,
                    service: 'smtp'
                };
            } else {
                throw new Error('Serviço de email não configurado');
            }
            
        } catch (error) {
            console.error('❌ Erro detalhado ao enviar email:', error);
            console.error('Stack:', error.stack);
            
            // Tentativa de fallback para modo desenvolvimento
            if (process.env.NODE_ENV !== 'production') {
                console.log('🔄 Tentando fallback para modo desenvolvimento...');
                console.log('📧 [FALLBACK] Email simulado:', {
                    to: userEmail,
                    subject: 'Recuperação de Senha',
                    code: resetCode
                });
                return { 
                    success: true, 
                    messageId: 'fallback-dev-mode',
                    service: 'fallback',
                    warning: 'Email não enviado (modo fallback)'
                };
            }
            
            return { 
                success: false, 
                error: error.message,
                stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
            };
        }
    }
    
    // ... outros métodos sendPasswordChangedEmail e sendWelcomeEmail permanecem similares
    
    getResetPasswordTemplate(name, code) {
        // Template mais simples e compatível
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Recuperação de Senha</title>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background: #f5f5f5; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 0 20px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 30px; text-align: center; }
                .content { padding: 30px; }
                .code-box { background: #f8f9fa; border: 2px dashed #4f46e5; padding: 25px; text-align: center; margin: 20px 0; border-radius: 8px; font-family: monospace; }
                .code { font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #4f46e5; }
                .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; font-size: 12px; border-top: 1px solid #dee2e6; }
                .btn { display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 15px 0; }
                .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔐 Recuperação de Senha</h1>
                    <p>Sistema de Provas Online</p>
                </div>
                
                <div class="content">
                    <h2>Olá, ${name}!</h2>
                    <p>Você solicitou a recuperação da sua senha. Use o código abaixo para continuar:</p>
                    
                    <div class="code-box">
                        <p><strong>Seu código de verificação:</strong></p>
                        <div class="code">${code}</div>
                        <p style="color: #6c757d; margin-top: 10px; font-size: 14px;">
                            ⏰ Válido por 15 minutos
                        </p>
                    </div>
                    
                    <div class="warning">
                        <p><strong>⚠️ Importante:</strong></p>
                        <p>• Não compartilhe este código com ninguém</p>
                        <p>• Se não foi você que solicitou, ignore este email</p>
                    </div>
                    
                    <p style="text-align: center;">
                        <a href="${process.env.APP_URL || 'https://prova-iema-2026.onrender.com'}/recuperar-senha.html" class="btn">
                            Redefinir Minha Senha
                        </a>
                    </p>
                    
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