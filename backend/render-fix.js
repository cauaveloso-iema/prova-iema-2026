// render-fix.js - VERSÃO DEFINITIVA PARA BREVO + RENDER
console.log('🔧 ===== CONFIGURAÇÃO RENDER + BREVO =====');

if (process.env.RENDER === 'true') {
    console.log('🎯 RENDER detectado: Aplicando configurações Brevo otimizadas');
    
    // 1. Configuração OBRIGATÓRIA para Render
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    
    // 2. Usar porta 465 (SSL) no Render
    if (!process.env.SMTP_PORT || process.env.SMTP_PORT === '587') {
        process.env.SMTP_PORT = '465';
        process.env.SMTP_SECURE = 'true';
        console.log('🔄 Porta alterada para 465 (SSL)');
    }
    
    // 3. Monkey patch específico para Brevo
    const nodemailer = require('nodemailer');
    const originalCreateTransport = nodemailer.createTransport;
    
    nodemailer.createTransport = function(config) {
        console.log('⚙️  Aplicando configuração Brevo para Render...');
        
        // Configuração otimizada para Brevo no Render
        const brevoConfig = {
            ...config,
            // FORÇAR configurações Brevo
            host: 'smtp-relay.brevo.com',
            port: 465,  // ← PORT 465 FIX
            secure: true,  // ← SSL habilitado
            // Timeouts generosos
            connectionTimeout: 30000,
            greetingTimeout: 20000,
            socketTimeout: 30000,
            // TLS config específica
            tls: {
                rejectUnauthorized: false,
                ciphers: 'SSLv3',
                minVersion: 'TLSv1.2'
            },
            // Debug
            debug: true,
            logger: true
        };
        
        console.log('✅ Brevo configurado para Render:');
        console.log('   Host:', brevoConfig.host);
        console.log('   Porta:', brevoConfig.port, '(SSL)');
        console.log('   Secure:', brevoConfig.secure);
        console.log('   Timeout:', brevoConfig.connectionTimeout + 'ms');
        
        return originalCreateTransport.call(this, brevoConfig);
    };
    
    console.log('✨ Configuração aplicada com sucesso!');
    
} else {
    console.log('🏠 Ambiente local - Usando configuração normal (porta 587)');
}

console.log('==========================================\n');