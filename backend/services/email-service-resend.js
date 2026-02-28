// ============================================================================
// SERVIÇO DE EMAIL - SISTEMA DE PROVAS IEMA 2026 (CORRIGIDO)
// ============================================================================

const nodemailer = require('nodemailer');
const mongoose = require('mongoose');

// ============ MODELO CONFIG INLINE ============
let Config;
try {
    Config = mongoose.model('Config');
    console.log('✅ Modelo Config já existe (email-service)');
} catch {
    const ConfigSchema = new mongoose.Schema({
        chave: { 
            type: String, 
            required: true, 
            unique: true, 
            trim: true 
        },
        valor: { 
            type: mongoose.Schema.Types.Mixed, 
            required: true 
        },
        tipo: { 
            type: String, 
            enum: ['string', 'number', 'boolean', 'object', 'array'], 
            default: 'string' 
        },
        descricao: { 
            type: String, 
            default: '' 
        },
        categoria: { 
            type: String, 
            enum: ['geral', 'sistema', 'seguranca', 'provas', 'email', 'backups', 'logs', 'aparencia', 'notificacoes'], 
            default: 'geral' 
        },
        publico: { 
            type: Boolean, 
            default: false 
        },
        editavel: { 
            type: Boolean, 
            default: true 
        },
        atualizadoPor: { 
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'User' 
        },
        atualizadoEm: { 
            type: Date, 
            default: Date.now 
        }
    }, { 
        timestamps: true 
    });

    ConfigSchema.index({ chave: 1 }, { unique: true });
    ConfigSchema.index({ categoria: 1 });
    ConfigSchema.index({ atualizadoEm: -1 });

    Config = mongoose.model('Config', ConfigSchema);
    console.log('✅ Modelo Config criado com sucesso no email-service!');
}

class EmailService {
    constructor() {
        this.transporter = null;
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

    async createTransporter() {
        const config = await this.getConfig();
        
        // Usar configurações do banco ou fallback para .env
        const host = config.host || process.env.EMAIL_HOST || 'smtp-relay.brevo.com';
        const port = config.porta || parseInt(process.env.EMAIL_PORT) || 587;
        const secure = config.seguranca === 'ssl';
        const user = config.usuario || process.env.EMAIL_USER;
        const pass = config.senha || process.env.EMAIL_PASS;

        if (!user || !pass) {
            console.warn('⚠️ Credenciais de email não configuradas');
            return null;
        }

        this.transporter = nodemailer.createTransport({
            host,
            port,
            secure,
            auth: { user, pass }
        });

        return this.transporter;
    }

    async sendEmail(to, subject, html) {
        try {
            const config = await this.getConfig();
            const from = config.remetente || process.env.EMAIL_FROM || 'naoresponder@iemasaoluiscentro.net';
            const fromName = config.nomeRemetente || process.env.EMAIL_FROM_NAME || 'Sistema de Provas IEMA';

            if (!this.transporter) {
                await this.createTransporter();
            }

            if (!this.transporter) {
                throw new Error('Transporter não configurado');
            }

            const mailOptions = {
                from: `"${fromName}" <${from}>`,
                to,
                subject,
                html
            };

            const info = await this.transporter.sendMail(mailOptions);
            console.log(`✅ Email enviado para ${to}: ${info.messageId}`);
            
            return { success: true, messageId: info.messageId };

        } catch (error) {
            console.error('❌ Erro ao enviar email:', error);
            return { success: false, error: error.message };
        }
    }

    async sendPasswordResetEmail(to, nome, codigo) {
        const subject = '🔐 Recuperação de Senha - Sistema de Provas';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                    <h1 style="color: white; margin: 0;">Sistema de Provas</h1>
                </div>
                
                <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                    <h2 style="color: #333;">Olá, ${nome}!</h2>
                    
                    <p style="color: #666; font-size: 16px; line-height: 1.6;">
                        Recebemos uma solicitação para redefinir sua senha no Sistema de Provas.
                    </p>
                    
                    <div style="background: white; padding: 20px; border-radius: 10px; text-align: center; margin: 25px 0;">
                        <p style="color: #666; margin-bottom: 10px;">Seu código de verificação é:</p>
                        <div style="background: #667eea; color: white; font-size: 32px; font-weight: bold; padding: 15px; border-radius: 8px; letter-spacing: 5px;">
                            ${codigo}
                        </div>
                        <p style="color: #999; font-size: 14px; margin-top: 10px;">Válido por 15 minutos</p>
                    </div>
                    
                    <p style="color: #666; font-size: 14px;">
                        Se você não solicitou esta recuperação, ignore este email.
                    </p>
                    
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 25px 0;">
                    
                    <p style="color: #999; font-size: 12px; text-align: center;">
                        © 2026 Sistema de Provas IEMA. Todos os direitos reservados.
                    </p>
                </div>
            </div>
        `;

        return await this.sendEmail(to, subject, html);
    }

    async sendPasswordChangedEmail(to, nome) {
        const subject = '✅ Senha Alterada com Sucesso';
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                    <h1 style="color: white; margin: 0;">Sistema de Provas</h1>
                </div>
                
                <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                    <h2 style="color: #333;">Olá, ${nome}!</h2>
                    
                    <p style="color: #666; font-size: 16px; line-height: 1.6;">
                        Sua senha foi alterada com sucesso!
                    </p>
                    
                    <div style="background: #d4edda; color: #155724; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        ✅ Se você realizou esta alteração, pode ignorar este email.
                    </div>
                    
                    <p style="color: #666; font-size: 14px;">
                        Caso não tenha sido você, entre em contato com o administrador imediatamente.
                    </p>
                    
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 25px 0;">
                    
                    <p style="color: #999; font-size: 12px; text-align: center;">
                        © 2026 Sistema de Provas IEMA. Todos os direitos reservados.
                    </p>
                </div>
            </div>
        `;

        return await this.sendEmail(to, subject, html);
    }

    async sendResultadoLiberado(to, nome, provaTitulo, nota, acertos, total) {
        const subject = `📊 Resultado Liberado - ${provaTitulo}`;
        const percentual = Math.round((acertos / total) * 100);
        
        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #667eea, #764ba2); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                    <h1 style="color: white; margin: 0;">Resultado Liberado</h1>
                </div>
                
                <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                    <h2 style="color: #333;">Olá, ${nome}!</h2>
                    
                    <p style="color: #666; font-size: 16px;">
                        O resultado da sua prova <strong>"${provaTitulo}"</strong> foi liberado.
                    </p>
                    
                    <div style="background: white; padding: 25px; border-radius: 10px; margin: 25px 0; text-align: center; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                        <div style="font-size: 48px; font-weight: bold; color: ${nota >= 7 ? '#10b981' : '#ef4444'};">
                            ${nota.toFixed(1)}
                        </div>
                        <div style="color: #666; margin-top: 10px;">nota final</div>
                        
                        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd;">
                            <div style="display: flex; justify-content: center; gap: 30px;">
                                <div>
                                    <div style="font-size: 24px; font-weight: bold; color: #667eea;">${acertos}/${total}</div>
                                    <div style="color: #999;">acertos</div>
                                </div>
                                <div>
                                    <div style="font-size: 24px; font-weight: bold; color: #667eea;">${percentual}%</div>
                                    <div style="color: #999;">aproveitamento</div>
                                </div>
                            </div>
                        </div>
                        
                        <div style="margin-top: 20px;">
                            <span style="background: ${nota >= 7 ? '#d4edda' : '#f8d7da'}; color: ${nota >= 7 ? '#155724' : '#721c24'}; padding: 8px 20px; border-radius: 30px; font-weight: bold;">
                                ${nota >= 7 ? '✅ APROVADO' : '❌ REPROVADO'}
                            </span>
                        </div>
                    </div>
                    
                    <p style="text-align: center;">
                        <a href="${process.env.BASE_URL || 'http://localhost:3000'}/aluno.html" 
                           style="background: #667eea; color: white; padding: 12px 30px; border-radius: 30px; text-decoration: none; display: inline-block;">
                            Ver Detalhes
                        </a>
                    </p>
                    
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 25px 0;">
                    
                    <p style="color: #999; font-size: 12px; text-align: center;">
                        © 2026 Sistema de Provas IEMA. Todos os direitos reservados.
                    </p>
                </div>
            </div>
        `;

        return await this.sendEmail(to, subject, html);
    }

    async sendLembreteProva(to, nome, provaTitulo, horasAntes, dataInicio) {
        const subject = `⏰ Lembrete: Prova em ${horasAntes} horas`;
        const dataFormatada = new Date(dataInicio).toLocaleString('pt-BR');

        const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                    <h1 style="color: white; margin: 0;">Lembrete de Prova</h1>
                </div>
                
                <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
                    <h2 style="color: #333;">Olá, ${nome}!</h2>
                    
                    <p style="color: #666; font-size: 16px; line-height: 1.6;">
                        Você tem uma prova marcada para <strong>${dataFormatada}</strong>.
                    </p>
                    
                    <div style="background: white; padding: 25px; border-radius: 10px; margin: 25px 0;">
                        <h3 style="color: #333; margin: 0 0 15px 0;">${provaTitulo}</h3>
                        
                        <div style="background: #fff3cd; color: #856404; padding: 15px; border-radius: 8px;">
                            <strong>⏰ Faltam ${horasAntes} horas para o início!</strong>
                        </div>
                    </div>
                    
                    <p style="color: #666; font-size: 14px;">
                        Prepare-se e acesse o sistema no horário agendado.
                    </p>
                    
                    <p style="text-align: center; margin-top: 25px;">
                        <a href="${process.env.BASE_URL || 'http://localhost:3000'}/aluno.html" 
                           style="background: #f59e0b; color: white; padding: 12px 30px; border-radius: 30px; text-decoration: none; display: inline-block;">
                            Acessar Agora
                        </a>
                    </p>
                    
                    <hr style="border: none; border-top: 1px solid #ddd; margin: 25px 0;">
                    
                    <p style="color: #999; font-size: 12px; text-align: center;">
                        © 2026 Sistema de Provas IEMA. Todos os direitos reservados.
                    </p>
                </div>
            </div>
        `;

        return await this.sendEmail(to, subject, html);
    }
}

module.exports = EmailService;