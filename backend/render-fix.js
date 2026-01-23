// render-fix.js
console.log('🔧 ===== APLICANDO AJUSTES PARA RENDER =====');

// Verifica se está rodando no Render
if (process.env.RENDER === 'true') {
    console.log('🎯 Ambiente Render detectado!');
    console.log('📧 Aplicando ajustes para serviço de email...');
    
    // IMPORTANTE: Permite certificados TLS auto-assinados no Render
    if (!process.env.NODE_TLS_REJECT_UNAUTHORIZED) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        console.log('🔓 TLS: rejectUnauthorized = 0 (para Render)');
    }
    
    // Monkey patch para nodemailer
    try {
        const nodemailer = require('nodemailer');
        const originalCreateTransport = nodemailer.createTransport;
        
        nodemailer.createTransport = function(config) {
            console.log('⏱️  Configurando timeouts otimizados para Render...');
            
            // Configuração otimizada para Render
            const renderConfig = {
                ...config,
                // Timeouts maiores para Render
                connectionTimeout: 15000,  // 15 segundos
                greetingTimeout: 10000,    // 10 segundos
                socketTimeout: 15000,      // 15 segundos
                // Ajusta TLS para Render
                tls: config.tls ? {
                    ...config.tls,
                    rejectUnauthorized: false
                } : { rejectUnauthorized: false }
            };
            
            console.log('✅ Transporter configurado com:');
            console.log('   - connectionTimeout:', renderConfig.connectionTimeout);
            console.log('   - greetingTimeout:', renderConfig.greetingTimeout);
            console.log('   - socketTimeout:', renderConfig.socketTimeout);
            console.log('   - tls.rejectUnauthorized:', renderConfig.tls.rejectUnauthorized);
            
            return originalCreateTransport.call(this, renderConfig);
        };
        
        console.log('✅ Monkey patch aplicado ao nodemailer');
        
    } catch (error) {
        console.error('❌ Erro ao aplicar patch:', error.message);
    }
    
} else {
    console.log('🏠 Ambiente local, sem ajustes necessários');
}

console.log('==========================================\n');