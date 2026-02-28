// email-service.js (versão otimizada para Brevo)
const nodemailer = require('nodemailer');
require('dotenv').config();

class EmailService {
    constructor() {
        this.transporter = null;
        this.init();
    }
    
    init() {
        try {
            console.log('\n🔧 ===== INICIALIZANDO SERVIÇO DE EMAIL =====');
            console.log('📡 Serviço:', process.env.EMAIL_SERVICE);
            console.log('📧 Host:', process.env.SMTP_HOST);
            console.log('👤 Usuário:', process.env.SMTP_USER ? '✅ Configurado' : '❌ Não configurado');
            console.log('🔑 Senha:', process.env.SMTP_PASS ? '✅ Configurada' : '❌ Não configurada');
            console.log('📨 Remetente:', process.env.EMAIL_FROM);
            console.log('=============================================\n');
            
            // Configuração para Brevo (Sendinblue)
            if (process.env.EMAIL_SERVICE === 'brevo') {
                if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
                    throw new Error('Credenciais SMTP do Brevo não configuradas');
                }
                
                this.transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: parseInt(process.env.SMTP_PORT) || 587,
                    secure: false, // Use TLS
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS
                    },
                    tls: {
                        // Não rejeitar certificados auto-assinados
                        rejectUnauthorized: false
                    },
                    // Configurações adicionais para melhor entrega
                    socketTimeout: 10000, // 10 segundos
                    connectionTimeout: 10000, // 10 segundos
                    greetingTimeout: 10000, // 10 segundos
                    debug: process.env.NODE_ENV === 'development' // Habilitar debug em desenvolvimento
                });
                
                console.log('✅ Email Service: Configurado com Brevo (Sendinblue)');
                
                // Testar conexão automaticamente
                this.testConnection();
            }
            // Modo desenvolvimento
            else {
                console.log('⚠️  Email Service: Modo desenvolvimento (SMTP não configurado)');
                this.setupDevMode();
            }
        } catch (error) {
            console.error('❌ Erro ao configurar Email Service:', error.message);
            console.error('Stack:', error.stack);
            this.setupDevMode();
        }
    }
    
    async testConnection() {
        try {
            console.log('🔍 Testando conexão com servidor SMTP...');
            const isConnected = await this.transporter.verify();
            console.log('✅ Conexão SMTP estabelecida com sucesso!');
            return true;
        } catch (error) {
            console.error('❌ Falha na conexão SMTP:', error.message);
            console.error('💡 Verifique:');
            console.error('   1. Credenciais no .env estão corretas');
            console.error('   2. Servidor SMTP está acessível');
            console.error('   3. Porta não está bloqueada por firewall');
            return false;
        }
    }
    
    setupDevMode() {
        console.log('🔄 Configurando modo de desenvolvimento...');
        this.transporter = {
            sendMail: async (options) => {
                console.log('\n📧 ===== EMAIL SIMULADO (MODO DEV) =====');
                console.log('Para:', options.to);
                console.log('Assunto:', options.subject);
                
                // Extrair código do HTML
                const codeMatch = options.html?.match(/\b\d{6}\b/);
                if (codeMatch) {
                    console.log('🔑 Código de recuperação:', codeMatch[0]);
                }
                
                console.log('=======================================\n');
                
                return { 
                    messageId: 'dev-mode-' + Date.now(),
                    response: '250 Email simulado (modo desenvolvimento)'
                };
            }
        };
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
            
            // Enviar email
            const result = await this.transporter.sendMail(emailData);
            
            console.log('✅ Email enviado com sucesso!');
            console.log('📊 ID da mensagem:', result.messageId);
            console.log('📨 Resposta do servidor:', result.response?.substring(0, 100) || 'N/A');
            console.log('===============================================\n');
            
            return { 
                success: true, 
                messageId: result.messageId,
                service: process.env.EMAIL_SERVICE || 'dev',
                response: result.response
            };
            
        } catch (error) {
            console.error('\n❌ ===== ERRO AO ENVIAR EMAIL =====');
            console.error('Email:', userEmail);
            console.error('Erro:', error.message);
            console.error('Código:', error.code);
            console.error('Comando:', error.command);
            console.error('====================================\n');
            
            // Fallback para modo desenvolvimento
            if (process.env.NODE_ENV !== 'production') {
                console.log('🔄 Usando fallback de desenvolvimento...');
                return { 
                    success: true, 
                    messageId: 'dev-fallback-' + Date.now(),
                    service: 'fallback',
                    warning: 'Email não enviado (modo fallback)'
                };
            }
            
            return { 
                success: false, 
                error: error.message,
                code: error.code,
                command: error.command
            };
        }
    }
    
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
    
    // ... outros métodos (sendPasswordChangedEmail, sendWelcomeEmail) permanecem similares ...
}

module.exports = EmailService;