// ============================================================================
// SERVIÇO DE NOTIFICAÇÕES PUSH (WEB PUSH)
// ============================================================================

const webpush = require('web-push');
const mongoose = require('mongoose');
const PushSubscription = require('../models/PushSubscription');
const PushSettings = require('../models/PushSettings');

// Configurar VAPID keys
webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@iemasaoluiscentro.net',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

class PushService {
    
    constructor() {
        this.vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    }

    // ===== INICIALIZAR CONFIGURAÇÕES PUSH =====
    async initSettings() {
        try {
            let settings = await PushSettings.findById('global');
            
            if (!settings) {
                settings = new PushSettings({
                    _id: 'global',
                    pushAtivado: false,
                    vapidPublicKey: this.vapidPublicKey
                });
                await settings.save();
                console.log('✅ Configurações push criadas');
            }
            
            return settings;
        } catch (error) {
            console.error('❌ Erro ao inicializar push settings:', error);
            return null;
        }
    }

    // ===== OBTER CHAVE PÚBLICA =====
    getPublicKey() {
        return this.vapidPublicKey;
    }

    // ===== VERIFICAR SE PUSH ESTÁ ATIVADO GLOBALMENTE =====
    async isPushAtivado() {
        try {
            const settings = await PushSettings.findById('global');
            return settings ? settings.pushAtivado : false;
        } catch (error) {
            console.error('❌ Erro ao verificar push ativado:', error);
            return false;
        }
    }

    // ===== OBTER STATUS COMPLETO DO PUSH =====
    async getPushStatus() {
        try {
            const settings = await PushSettings.findById('global');
            return {
                pushAtivado: settings ? settings.pushAtivado : false,
                vapidPublicKey: this.vapidPublicKey,
                ultimaAlteracao: settings ? {
                    por: settings.ultimaAlteracaoPor,
                    em: settings.ultimaAlteracaoEm
                } : null
            };
        } catch (error) {
            console.error('❌ Erro ao obter status push:', error);
            return {
                pushAtivado: false,
                vapidPublicKey: this.vapidPublicKey
            };
        }
    }

    // ===== ATIVAR/DESATIVAR PUSH GLOBALMENTE (CORRIGIDO) =====
    async setPushAtivado(ativado, adminId) {
        try {
            console.log(`🔧 setPushAtivado chamado com: ${ativado ? 'ATIVAR' : 'DESATIVAR'}`);
            
            // Buscar configurações atuais
            let settings = await PushSettings.findById('global');
            
            if (!settings) {
                settings = new PushSettings({
                    _id: 'global',
                    pushAtivado: false,
                    vapidPublicKey: this.vapidPublicKey
                });
            }
            
            // Verificar se já está no estado desejado
            if (settings.pushAtivado === ativado) {
                console.log(`ℹ️ Push já está ${ativado ? 'ATIVADO' : 'DESATIVADO'}`);
                return {
                    success: true,
                    pushAtivado: settings.pushAtivado,
                    message: `Push já está ${ativado ? 'ativado' : 'desativado'}`
                };
            }
            
            // Atualizar
            settings.pushAtivado = ativado;
            settings.ultimaAlteracaoPor = adminId;
            settings.ultimaAlteracaoEm = new Date();
            
            await settings.save();
            
            console.log(`✅ Push ${ativado ? 'ATIVADO' : 'DESATIVADO'} globalmente por admin ${adminId}`);
            
            // 🔥 IMPORTANTE: Se desativou, remover todas as subscriptions ativas?
            if (!ativado) {
                console.log('🔕 Push desativado - subscriptions permanecem no banco mas não serão usadas');
                // Não remover as subscriptions, apenas marcar como inativas se quiser
                // await PushSubscription.updateMany({ ativo: true }, { ativo: false });
            }
            
            return {
                success: true,
                pushAtivado: settings.pushAtivado,
                message: `Push ${ativado ? 'ativado' : 'desativado'} com sucesso!`
            };
            
        } catch (error) {
            console.error('❌ Erro ao alterar push ativado:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== SALVAR SUBSCRIÇÃO =====
    async salvarSubscription(usuarioId, subscription, userAgent = '', deviceInfo = '') {
        try {
            // Verificar se push está ativado globalmente
            const pushAtivado = await this.isPushAtivado();
            
            if (!pushAtivado) {
                return {
                    success: false,
                    error: 'Push notifications desativadas pelo administrador',
                    pushDesativado: true
                };
            }

            // ✅ Validação
            if (!subscription || !subscription.endpoint) {
                return { success: false, error: 'Subscription inválida' };
            }

            if (!subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
                return { success: false, error: 'Keys da subscription inválidas' };
            }

            // ✅ UPSERT ATÔMICO: tudo em uma única operação no MongoDB
            // Não importa se chamarem 10 vezes em paralelo — só uma vai criar
            const sub = await PushSubscription.findOneAndUpdate(
                { endpoint: subscription.endpoint },
                {
                    $set: {
                        usuarioId: usuarioId,
                        endpoint: subscription.endpoint,
                        keys: subscription.keys,
                        userAgent: userAgent || '',
                        deviceInfo: deviceInfo || '',
                        ativo: true,
                        ultimoUso: new Date()
                    }
                },
                {
                    upsert: true,
                    new: true,
                    setDefaultsOnInsert: true
                }
            );

            console.log(`✅ Push subscription salva/atualizada para usuário ${usuarioId}`);

            return {
                success: true,
                subscription: sub,
                message: sub.createdAt && sub.updatedAt && (sub.createdAt.getTime() === sub.updatedAt.getTime())
                    ? 'Subscription criada'
                    : 'Subscription atualizada'
            };

        } catch (error) {
            console.error('❌ Erro ao salvar subscription:', error);

            // Fallback: se ainda der duplicata (raro, mas possível)
            if (error.code === 11000) {
                try {
                    const sub = await PushSubscription.findOneAndUpdate(
                        { endpoint: subscription.endpoint },
                        {
                            $set: {
                                usuarioId,
                                keys: subscription.keys,
                                userAgent: userAgent || '',
                                deviceInfo: deviceInfo || '',
                                ativo: true,
                                ultimoUso: new Date()
                            }
                        },
                        { new: true }
                    );
                    if (sub) {
                        return {
                            success: true,
                            subscription: sub,
                            message: 'Subscription atualizada (retry)'
                        };
                    }
                } catch (e) {
                    console.error('❌ Retry também falhou:', e);
                }
            }

            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== REMOVER SUBSCRIÇÃO =====
    async removerSubscription(endpoint) {
        try {
            await PushSubscription.findOneAndUpdate(
                { endpoint },
                { ativo: false }
            );
            return { success: true };
        } catch (error) {
            console.error('❌ Erro ao remover subscription:', error);
            return { success: false, error: error.message };
        }
    }

    // ===== ENVIAR NOTIFICAÇÃO PUSH =====
    async enviarParaUsuario(usuarioId, payload) {
        try {
            // Verificar se push está ativado globalmente
            const pushAtivado = await this.isPushAtivado();
            if (!pushAtivado) {
                return { success: true, ignorado: true, motivo: 'push_desativado' };
            }

            const subscriptions = await PushSubscription.find({
                usuarioId,
                ativo: true
            });

            if (subscriptions.length === 0) {
                return { success: true, enviados: 0 };
            }

            const payloadString = JSON.stringify(payload);
            let enviados = 0;
            let falhas = 0;

            for (const sub of subscriptions) {
                try {
                    await webpush.sendNotification({
                        endpoint: sub.endpoint,
                        keys: sub.keys
                    }, payloadString);

                    sub.ultimoUso = new Date();
                    await sub.save();
                    enviados++;

                } catch (error) {
                    if (error.statusCode === 410) {
                        sub.ativo = false;
                        await sub.save();
                    }
                    falhas++;
                }
            }

            return {
                success: true,
                enviados,
                falhas
            };

        } catch (error) {
            console.error('❌ Erro ao enviar push:', error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = PushService;