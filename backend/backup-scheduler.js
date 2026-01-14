const cron = require('node-cron');
const BackupService = require('./backup-service');

// Agendar backup diário às 2h da manhã
cron.schedule('0 2 * * *', async () => {
    console.log('⏰ Executando backup agendado...');
    
    try {
        const backupService = new BackupService();
        await backupService.connectDB();
        await backupService.backupCollections();
        console.log('✅ Backup agendado concluído com sucesso');
    } catch (error) {
        console.error('❌ Erro no backup agendado:', error);
    }
});

// Agendar verificação de sincronização a cada 5 minutos
cron.schedule('*/5 * * * *', async () => {
    const backupService = new BackupService();
    await backupService.processSyncQueue();
});

console.log('⏰ Agendador de backup iniciado');