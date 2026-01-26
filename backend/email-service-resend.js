// email-service-resend.js - SERVIÇO COMPLETO PARA RESEND
const { Resend } = require('resend');

class EmailServiceResend {
    constructor() {
        console.log('🔧 ===== INICIALIZANDO RESEND =====');
        console.log('📧 Serviço: Resend');
        console.log('📨 Remetente:', process.env.EMAIL_FROM);
        
        try {
            // Verifica se a chave está configurada
            if (!process.env.RESEND_API_KEY) {
                throw new Error('RESEND_API_KEY não configurada');
            }
            
            // Inicializa o Resend
            this.resend = new Resend(process.env.RESEND_API_KEY);
            console.log('✅ Resend inicializado com sucesso');
            
        } catch (error) {
            console.error('❌ Erro ao inicializar Resend:', error.message);
            console.log('🔄 Usando modo de desenvolvimento...');
            this.setupDevMode();
        }
    }
    
    setupDevMode() {
        console.log('💻 Modo desenvolvimento ativado');
        this.resend = {
            emails: {
                send: async (options) => {
                    console.log('\n📧 ===== EMAIL SIMULADO =====');
                    console.log('Para:', options.to);
                    console.log('Assunto:', options.subject);
                    
                    // Extrair código do HTML
                    const codeMatch = options.html?.match(/\b\d{6}\b/);
                    if (codeMatch) {
                        console.log('🔑 Código de recuperação:', codeMatch[0]);
                    }
                    
                    console.log('================================\n');
                    
                    return {
                        data: { id: 'dev-' + Date.now() },
                        error: null
                    };
                }
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
            console.log('⚙️  Serviço: Resend');
            
            // Template HTML do email
            const htmlContent = this.getResetPasswordTemplate(userName, resetCode);
            
            // Enviar email via Resend
            const { data, error } = await this.resend.emails.send({
                from: process.env.EMAIL_FROM || 'Sistema de Provas <onboarding@resend.dev>',
                to: userEmail,
                subject: '🔐 Código de Recuperação de Senha - Sistema de Provas',
                html: htmlContent,
                text: `Olá ${userName},\n\nSeu código de recuperação é: ${resetCode}\n\nVálido por 15 minutos.\n\nAtenciosamente,\nEquipe do Sistema de Provas`
            });
            
            // Verificar erro
            if (error) {
                console.error('❌ Erro do Resend:', error);
                throw error;
            }
            
            console.log('✅ Email enviado com sucesso!');
            console.log('📊 ID do email:', data?.id);
            console.log('==============================================\n');
            
            return {
                success: true,
                messageId: data?.id,
                service: 'resend',
                response: data
            };
            
        } catch (error) {
            console.error('\n❌ ===== ERRO AO ENVIAR EMAIL =====');
            console.error('Email:', userEmail);
            console.error('Erro:', error.message);
            
            // Fallback para modo desenvolvimento
            console.log('🔄 Usando fallback...');
            return {
                success: true, // Importante: não quebrar o fluxo
                simulated: true,
                code: resetCode,
                service: 'fallback',
                message: 'Email não enviado (modo fallback)'
            };
        }
    }
    // Função para enviar email de prova cancelada
    async sendProvaCanceladaEmail(professorEmail, professorNome, alunoNome, provaTitulo, motivo, estatisticas) {
        try {
            console.log(`📧 Enviando email de prova cancelada para ${professorEmail}`);
            
            // Formatar estatísticas
            const estatisticasTexto = estatisticas ? `
                <h3>Estatísticas da Violação:</h3>
                <ul>
                    <li>Avisos: ${estatisticas.avisos || 0}</li>
                    <li>Tentativas de atalho: ${estatisticas.tentativasAtalho || 0}</li>
                    <li>Capturas de tela: ${estatisticas.capturasTela || 0}</li>
                    <li>Tempo fora da página: ${estatisticas.tempoFora || 0} segundos</li>
                </ul>
            ` : '';
            
            const emailData = {
                from: 'Sistema de Provas <sistema@seu-dominio.com>',
                to: professorEmail,
                subject: `🚫 Prova Cancelada: ${alunoNome} - ${provaTitulo}`,
                html: `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: #ef4444; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
                            .content { background: #f9fafb; padding: 25px; border-radius: 0 0 8px 8px; }
                            .alert { background: #fee2e2; border: 2px solid #ef4444; padding: 15px; border-radius: 6px; margin: 15px 0; }
                            .details { background: white; padding: 15px; border-radius: 6px; margin: 15px 0; border: 1px solid #e5e7eb; }
                            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; text-align: center; }
                            .button { display: inline-block; background: #ef4444; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="header">
                                <h1>🚫 PROVA CANCELADA</h1>
                            </div>
                            
                            <div class="content">
                                <p>Prezado(a) Professor(a) <strong>${professorNome}</strong>,</p>
                                
                                <div class="alert">
                                    <h2>⚠️ ATENÇÃO: Prova Cancelada</h2>
                                    <p>Uma prova foi cancelada automaticamente por violação das regras.</p>
                                </div>
                                
                                <div class="details">
                                    <h3>📋 Detalhes do Cancelamento</h3>
                                    <p><strong>Aluno:</strong> ${alunoNome}</p>
                                    <p><strong>Prova:</strong> ${provaTitulo}</p>
                                    <p><strong>Data/Hora:</strong> ${new Date().toLocaleString('pt-BR')}</p>
                                    <p><strong>Motivo:</strong> ${motivo}</p>
                                    <p><strong>Nota Atribuída:</strong> <span style="color: #ef4444; font-weight: bold;">0.0</span></p>
                                </div>
                                
                                ${estatisticasTexto}
                                
                                <div style="margin-top: 25px; text-align: center;">
                                    <a href="${process.env.FRONTEND_URL || 'https://seu-sistema.com'}/index.html" class="button">
                                        🔍 Ver Detalhes no Sistema
                                    </a>
                                </div>
                                
                                <div class="footer">
                                    <p>Sistema de Provas Online</p>
                                    <p>Esta é uma mensagem automática. Por favor, não responda este email.</p>
                                </div>
                            </div>
                        </div>
                    </body>
                    </html>
                `
            };
            
            // Enviar via Resend
            const response = await resend.emails.send(emailData);
            
            console.log(`✅ Email de cancelamento enviado com sucesso! ID: ${response.id}`);
            
            return {
                success: true,
                service: 'Resend',
                messageId: response.id,
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            console.error('❌ Erro ao enviar email de cancelamento:', error);
            throw error;
        }
    }
    
    getResetPasswordTemplate(name, code) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Recuperação de Senha</title>
            <style>
                body {
                    font-family: 'Arial', sans-serif;
                    line-height: 1.6;
                    color: #333;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f9fafb;
                }
                .container {
                    background-color: white;
                    border-radius: 10px;
                    padding: 30px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .header {
                    text-align: center;
                    padding-bottom: 20px;
                    border-bottom: 2px solid #4f46e5;
                }
                .code-box {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 25px;
                    border-radius: 10px;
                    text-align: center;
                    margin: 30px 0;
                }
                .code {
                    font-size: 42px;
                    font-weight: bold;
                    letter-spacing: 8px;
                    font-family: 'Courier New', monospace;
                    margin: 20px 0;
                }
                .footer {
                    margin-top: 30px;
                    padding-top: 20px;
                    border-top: 1px solid #e5e7eb;
                    color: #6b7280;
                    font-size: 14px;
                    text-align: center;
                }
                .warning {
                    background-color: #fef3c7;
                    border-left: 4px solid #f59e0b;
                    padding: 15px;
                    margin: 20px 0;
                    border-radius: 6px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="color: #4f46e5; margin: 0;">🔐 Sistema de Provas</h1>
                    <p style="color: #6b7280; margin-top: 5px;">Recuperação de Senha</p>
                </div>
                
                <h2>Olá, ${name}!</h2>
                <p>Você solicitou a recuperação da sua senha no Sistema de Provas.</p>
                <p>Use o código abaixo para continuar:</p>
                
                <div class="code-box">
                    <p style="margin: 0 0 15px 0; font-size: 18px;">Seu código de verificação:</p>
                    <div class="code">${code}</div>
                    <p style="margin: 15px 0 0 0; opacity: 0.9;">
                        ⏰ Válido por 15 minutos
                    </p>
                </div>
                
                <div class="warning">
                    <p><strong>⚠️ Importante:</strong></p>
                    <ul style="margin: 10px 0; padding-left: 20px;">
                        <li>Não compartilhe este código com ninguém</li>
                        <li>Se não foi você que solicitou, ignore este email</li>
                        <li>O código expira automaticamente</li>
                    </ul>
                </div>
                
                <p style="text-align: center;">
                    <a href="${process.env.APP_URL || 'https://prova-iema-2026.onrender.com'}/recuperar-senha.html" 
                       style="display: inline-block;
                              background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
                              color: white;
                              padding: 14px 28px;
                              text-decoration: none;
                              border-radius: 8px;
                              font-weight: bold;
                              margin: 20px 0;">
                        Continuar para Redefinição
                    </a>
                </p>
                
                <p>Atenciosamente,<br>
                <strong>Equipe do Sistema de Provas</strong></p>
                
                <div class="footer">
                    <p>© ${new Date().getFullYear()} Sistema de Provas Online</p>
                    <p>Este é um email automático, por favor não responda.</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }
}

module.exports = EmailServiceResend;