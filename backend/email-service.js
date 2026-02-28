// ============================================================================
// SERVIÇO DE EMAIL UNIFICADO (Brevo + Resend) - VERSÃO FINAL
// ============================================================================

const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const mongoose = require('mongoose');

// Modelo Config
let Config;
try {
    Config = mongoose.model('Config');
} catch {
    const ConfigSchema = new mongoose.Schema({
        chave: { type: String, required: true, unique: true },
        valor: { type: mongoose.Schema.Types.Mixed, required: true },
        tipo: { type: String, enum: ['string', 'number', 'boolean', 'object', 'array'], default: 'string' },
        categoria: { type: String, enum: ['geral', 'sistema', 'seguranca', 'provas', 'email', 'backups', 'logs', 'aparencia', 'notificacoes'], default: 'geral' },
        publico: { type: Boolean, default: false },
        editavel: { type: Boolean, default: true }
    }, { timestamps: true });
    
    Config = mongoose.model('Config', ConfigSchema);
}

class EmailService {
    constructor() {
        this.transporter = null;
        this.resend = null;
        this.tipo = null;
        this.modoDev = false;
    }

    async getConfig() {
        try {
            const configDoc = await Config.findOne({ chave: 'email' });
            return configDoc ? configDoc.valor : {};
        } catch (error) {
            console.error('❌ Erro ao buscar config de email:', error);
            return {};
        }
    }

    async init() {
        const config = await this.getConfig();
        const servico = config.servico || process.env.EMAIL_SERVICE || 'resend';

        console.log('\n🔧 ===== INICIALIZANDO SERVIÇO DE EMAIL =====');
        console.log('📡 Serviço:', servico);

        if (servico === 'resend') {
            return this.initResend(config);
        } else {
            return this.initBrevo(config);
        }
    }

    initResend(config) {
        try {
            const apiKey = config.senha || process.env.RESEND_API_KEY;
            
            if (!apiKey) {
                throw new Error('RESEND_API_KEY não configurada');
            }

            this.resend = new Resend(apiKey);
            this.tipo = 'resend';
            
            console.log('✅ Resend inicializado com sucesso');
            console.log('📨 Remetente:', config.remetente || process.env.EMAIL_FROM);
            console.log('=============================================\n');
            
            return true;
        } catch (error) {
            console.error('❌ Erro ao inicializar Resend:', error.message);
            this.modoDev = true;
            return false;
        }
    }

    initBrevo(config) {
        try {
            const host = config.host || process.env.EMAIL_HOST || 'smtp-relay.brevo.com';
            const port = config.porta || parseInt(process.env.EMAIL_PORT) || 587;
            const secure = config.seguranca === 'ssl';
            const user = config.usuario || process.env.EMAIL_USER;
            const pass = config.senha || process.env.EMAIL_PASS;

            if (!user || !pass) {
                throw new Error('Credenciais SMTP não configuradas');
            }

            this.transporter = nodemailer.createTransport({
                host,
                port,
                secure,
                auth: { user, pass }
            });

            this.tipo = 'brevo';
            
            console.log('✅ Brevo inicializado com sucesso');
            console.log('📨 Host:', host);
            console.log('📨 Porta:', port);
            console.log('=============================================\n');
            
            return true;
        } catch (error) {
            console.error('❌ Erro ao inicializar Brevo:', error.message);
            this.modoDev = true;
            return false;
        }
    }
    
    async sendEmail({ to, subject, html, text }) {
        try {
            if (this.modoDev) {
                return this.simularEnvio(to, subject, html);
            }

            const config = await this.getConfig();
            let from = config.remetente || process.env.EMAIL_FROM || 'onboarding@resend.dev';
            let fromName = config.nomeRemetente || process.env.EMAIL_FROM_NAME || 'Sistema de Provas IEMA';

            console.log('\n📧 ===== ENVIANDO EMAIL =====');
            console.log('📨 Para:', to);
            console.log('📝 Assunto:', subject);
            console.log('📤 From (raw):', from);
            console.log('📤 FromName:', fromName);

            // 🔥 CORREÇÃO: Se from já estiver no formato "Nome <email>", extrair
            const nomeMatch = from.match(/^(.+?)\s+<(.+?)>$/);
            if (nomeMatch) {
                fromName = nomeMatch[1].trim();
                from = nomeMatch[2].trim();
                console.log('📤 Extraído - Nome:', fromName, 'Email:', from);
            }

            if (this.tipo === 'resend') {
                return this.enviarViaResend(to, subject, html, text, from, fromName);
            } else {
                return this.enviarViaBrevo(to, subject, html, from, fromName);
            }

        } catch (error) {
            console.error('❌ Erro ao enviar email:', error);
            return { success: false, error: error.message };
        }
    }

    async enviarViaResend(to, subject, html, text, from, fromName) {
        try {
            // 🔥 CORREÇÃO DEFINITIVA: Limpar o from de qualquer formatação
            let emailLimpo = from;
            
            // Se vier como "<email>" ou "Nome <email>", extrair apenas o email
            const emailMatch = from.match(/<(.+?)>/);
            if (emailMatch) {
                emailLimpo = emailMatch[1]; // Pega apenas o que está dentro dos <>
            }
            
            // Remover espaços e caracteres indesejados
            emailLimpo = emailLimpo.trim();
            
            // Garantir que não tem < > no email
            emailLimpo = emailLimpo.replace(/[<>]/g, '');
            
            // Formatar corretamente: "Nome <email>"
            const fromFormatado = `"${fromName}" <${emailLimpo}>`;
            
            console.log('\n📤 DEBUG ENVIO:');
            console.log('   From original:', from);
            console.log('   Email limpo:', emailLimpo);
            console.log('   From formatado:', fromFormatado);
            console.log('   Para:', to);
            console.log('   Assunto:', subject);

            const { data, error } = await this.resend.emails.send({
                from: fromFormatado,
                to: [to],
                subject: subject,
                html: html,
                text: text || html.replace(/<[^>]*>/g, '')
            });

            if (error) {
                console.error('❌ Erro Resend:', error);
                throw error;
            }
            
            console.log('✅ Email enviado! ID:', data?.id);
            return { success: true, messageId: data?.id };
            
        } catch (error) {
            console.error('❌ Erro ao enviar via Resend:', error);
            throw error;
        }
    }

    async enviarViaBrevo(to, subject, html, from, fromName) {
        const mailOptions = {
            from: `"${fromName}" <${from}>`,
            to,
            subject,
            html
        };
        const info = await this.transporter.sendMail(mailOptions);
        return { success: true, messageId: info.messageId };
    }

    simularEnvio(to, subject, html) {
        console.log('\n📧 ===== EMAIL SIMULADO =====');
        console.log('📨 Para:', to);
        console.log('📝 Assunto:', subject);
        
        const codeMatch = html.match(/\b\d{6}\b/);
        if (codeMatch) console.log('🔑 Código:', codeMatch[0]);
        
        console.log('================================\n');
        return { success: true, messageId: 'simulado-' + Date.now(), simulated: true };
    }

    // MÉTODOS ESPECÍFICOS
    async sendPasswordResetEmail(to, nome, codigo) {
        const subject = '🔐 Recuperação de Senha - Sistema de Provas';
        const html = this.getTemplateRecuperacao(nome, codigo);
        return this.sendEmail({ to, subject, html });
    }

    async sendPasswordChangedEmail(to, nome) {
        const subject = '✅ Senha Alterada com Sucesso';
        const html = this.getTemplateSenhaAlterada(nome);
        return this.sendEmail({ to, subject, html });
    }

    async sendResultadoLiberado(to, nome, provaTitulo, nota, acertos, total) {
        const subject = `📊 Resultado Liberado - ${provaTitulo}`;
        const html = this.getTemplateResultado(nome, provaTitulo, nota, acertos, total);
        return this.sendEmail({ to, subject, html });
    }

    async sendLembreteProva(to, nome, provaTitulo, horasAntes, dataInicio) {
        const subject = `⏰ Lembrete: Prova em ${horasAntes} horas`;
        const html = this.getTemplateLembrete(nome, provaTitulo, horasAntes, dataInicio);
        return this.sendEmail({ to, subject, html });
    }

    async sendWelcomeEmail(to, nome) {
        const subject = '🎉 Bem-vindo ao Sistema de Provas IEMA!';
        const html = this.getTemplateBoasVindas(nome, to);
        return this.sendEmail({ to, subject, html });
    }

    // TEMPLATES
    getTemplateRecuperacao(nome, codigo) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; }
                .code-box { background: #667eea; color: white; padding: 20px; text-align: center; border-radius: 8px; }
                .code { font-size: 32px; font-weight: bold; letter-spacing: 5px; }
            </style>
        </head>
        <body>
            <h2>Olá, ${nome}!</h2>
            <p>Seu código de recuperação é:</p>
            <div class="code-box">
                <div class="code">${codigo}</div>
                <p>Válido por 15 minutos</p>
            </div>
        </body>
        </html>
        `;
    }

    getTemplateSenhaAlterada(nome) {
        return `<h2>Olá, ${nome}!</h2><p>Sua senha foi alterada com sucesso.</p>`;
    }

    getTemplateResultado(nome, provaTitulo, nota, acertos, total) {
        return `
        <h2>Olá, ${nome}!</h2>
        <p>Resultado da prova "${provaTitulo}"</p>
        <p>Nota: ${nota} (${acertos}/${total} acertos)</p>
        `;
    }

    getTemplateLembrete(nome, provaTitulo, horasAntes, dataInicio) {
        return `
        <h2>Olá, ${nome}!</h2>
        <p>Lembrete: A prova "${provaTitulo}" começa em ${horasAntes} horas.</p>
        `;
    }

    getTemplateBoasVindas(nome, email) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #10b981, #059669); color: white; padding: 30px; text-align: center; border-radius: 10px; }
                .button { background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 30px; display: inline-block; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>🎉 Bem-vindo!</h1>
            </div>
            <h2>Olá, ${nome}!</h2>
            <p>Seu cadastro foi realizado com sucesso no Sistema de Provas IEMA 2026.</p>
            <p><strong>Email cadastrado:</strong> ${email}</p>
            <p style="text-align: center;">
                <a href="${process.env.APP_URL || 'http://localhost:3000'}" class="button">Acessar o Sistema</a>
            </p>
        </body>
        </html>
        `;
    }
}

module.exports = EmailService;