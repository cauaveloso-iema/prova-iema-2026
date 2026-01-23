// email-service-hybrid.js
const axios = require('axios');
const nodemailer = require('nodemailer');

class HybridEmailService {
    constructor() {
        console.log('🔧 Serviço de Email Híbrido (SMTP/API)');
        this.useAPI = false;
        this.init();
    }
    
    async init() {
        // Tenta detectar se está no Render
        if (process.env.RENDER === 'true') {
            console.log('🎯 Render detectado - tentando API primeiro');
            this.useAPI = await this.testBrevoAPI();
        }
        
        if (!this.useAPI) {
            console.log('🔄 Configurando SMTP normal...');
            this.setupSMTP();
        }
    }
    
    async testBrevoAPI() {
        try {
            const apiKey = process.env.SMTP_PASS;
            if (!apiKey) return false;
            
            console.log('🔍 Testando API do Brevo...');
            const response = await axios.get('https://api.brevo.com/v3/account', {
                headers: { 'api-key': apiKey },
                timeout: 5000
            });
            
            console.log('✅ API Brevo disponível!');
            console.log('👤 Conta:', response.data.email);
            return true;
            
        } catch (error) {
            console.log('❌ API não disponível, usando SMTP');
            return false;
        }
    }
    
    setupSMTP() {
        // Configuração normal do seu email-service.js
        this.transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT) || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            },
            tls: { rejectUnauthorized: false }
        });
    }
    
    async sendPasswordResetEmail(userEmail, userName, resetCode) {
        try {
            console.log('\n🚀 ENVIANDO EMAIL PARA:', userEmail);
            
            if (this.useAPI) {
                return await this.sendViaAPI(userEmail, userName, resetCode);
            } else {
                return await this.sendViaSMTP(userEmail, userName, resetCode);
            }
            
        } catch (error) {
            console.error('❌ Erro no envio:', error.message);
            
            // Fallback: tenta o outro método
            console.log('🔄 Tentando método alternativo...');
            if (this.useAPI) {
                return await this.sendViaSMTP(userEmail, userName, resetCode);
            } else {
                return await this.sendViaAPI(userEmail, userName, resetCode);
            }
        }
    }
    
    async sendViaAPI(userEmail, userName, resetCode) {
        console.log('📤 Enviando via API...');
        
        const apiKey = process.env.SMTP_PASS;
        let senderEmail = process.env.SMTP_USER;
        
        const emailData = {
            sender: {
                name: "Sistema de Provas",
                email: senderEmail
            },
            to: [{ email: userEmail, name: userName }],
            subject: "🔐 Código de Recuperação de Senha",
            htmlContent: `
                <div style="font-family: Arial; padding: 20px;">
                    <h2>Olá ${userName}!</h2>
                    <p>Seu código de recuperação:</p>
                    <h1 style="color: #4f46e5; font-size: 36px;">${resetCode}</h1>
                    <p>Válido por 15 minutos.</p>
                </div>
            `,
            textContent: `Código: ${resetCode}`
        };
        
        const response = await axios.post(
            'https://api.brevo.com/v3/smtp/email',
            emailData,
            {
                headers: {
                    'api-key': apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );
        
        return {
            success: true,
            messageId: response.data.messageId,
            service: 'brevo-api',
            method: 'api'
        };
    }
    
    async sendViaSMTP(userEmail, userName, resetCode) {
        console.log('📤 Enviando via SMTP...');
        
        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to: userEmail,
            subject: '🔐 Código de Recuperação de Senha',
            html: `<h2>Olá ${userName}!</h2>
                  <p>Código: <strong>${resetCode}</strong></p>
                  <p>Válido por 15 minutos.</p>`,
            text: `Código: ${resetCode}`
        };
        
        const result = await this.transporter.sendMail(mailOptions);
        
        return {
            success: true,
            messageId: result.messageId,
            service: 'brevo-smtp',
            method: 'smtp'
        };
    }
}

module.exports = HybridEmailService;