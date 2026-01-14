const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function migrateToAtlas() {
    console.log('🚀 Iniciando migração para MongoDB Atlas...\n');
    
    // URLs de conexão
    const localURI = process.env.MONGODB_LOCAL_URI || 'mongodb://localhost:27017/provas_online';
    const atlasURI = process.env.MONGODB_ATLAS_URI || 'mongodb+srv://cauaveloso_db_server:SaxSophone155!@provaonlinenew.3pwi6zm.mongodb.net/provas_online';
    
    console.log('📡 Conexão local:', localURI);
    console.log('🌐 Conexão Atlas:', atlasURI.replace(/\/\/[^@]+@/, '//***@')); // Esconde senha
    
    try {
        // Conectar ao MongoDB local
        console.log('\n📡 Conectando ao MongoDB local...');
        const localConn = await mongoose.createConnection(localURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        }).asPromise();
        
        console.log('✅ Conectado ao MongoDB local');
        
        // Listar coleções
        const collections = await localConn.db.listCollections().toArray();
        console.log(`\n📊 Encontradas ${collections.length} coleções no local:`);
        
        collections.forEach((col, index) => {
            console.log(`  ${index + 1}. ${col.name}`);
        });
        
        // Criar backup em JSON
        const backupDir = './backup-migration-' + Date.now();
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
            console.log(`\n💾 Criando backup em: ${backupDir}`);
        }
        
        console.log('\n📥 Exportando dados do MongoDB local...');
        
        const collectionStats = [];
        
        for (const collection of collections) {
            try {
                const data = await localConn.db.collection(collection.name).find({}).toArray();
                
                if (data.length > 0) {
                    const backupFile = path.join(backupDir, `${collection.name}.json`);
                    fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
                    collectionStats.push({
                        name: collection.name,
                        count: data.length,
                        file: backupFile
                    });
                    console.log(`  ✅ ${collection.name}: ${data.length} documentos`);
                } else {
                    console.log(`  ⚠️  ${collection.name}: 0 documentos (vazia)`);
                }
            } catch (error) {
                console.log(`  ❌ ${collection.name}: Erro - ${error.message}`);
            }
        }
        
        // Conectar ao MongoDB Atlas
        console.log('\n🌐 Conectando ao MongoDB Atlas...');
        const atlasConn = await mongoose.createConnection(atlasURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 10000
        }).asPromise();
        
        console.log('✅ Conectado ao MongoDB Atlas');
        
        // Limpar coleções no Atlas (opcional)
        console.log('\n🧹 Limpando coleções existentes no Atlas...');
        const atlasCollections = await atlasConn.db.listCollections().toArray();
        
        for (const col of atlasCollections) {
            try {
                await atlasConn.db.collection(col.name).deleteMany({});
                console.log(`  🧽 ${col.name}: limpa`);
            } catch (error) {
                console.log(`  ⚠️  ${col.name}: não foi possível limpar`);
            }
        }
        
        // Migrar dados
        console.log('\n🚚 Migrando dados para o Atlas...');
        
        let totalMigrated = 0;
        
        for (const stat of collectionStats) {
            try {
                const data = JSON.parse(fs.readFileSync(stat.file, 'utf8'));
                
                if (data.length > 0) {
                    // Remover _id se existir para evitar conflitos
                    const cleanData = data.map(doc => {
                        const { _id, ...rest } = doc;
                        return rest;
                    });
                    
                    const result = await atlasConn.db.collection(stat.name).insertMany(cleanData);
                    console.log(`  ✅ ${stat.name}: ${result.insertedCount}/${stat.count} documentos migrados`);
                    totalMigrated += result.insertedCount;
                }
            } catch (error) {
                console.log(`  ❌ ${stat.name}: Erro na migração - ${error.message}`);
            }
        }
        
        // Verificar migração
        console.log('\n🔍 Verificando migração...');
        const atlasStats = [];
        
        for (const stat of collectionStats) {
            try {
                const count = await atlasConn.db.collection(stat.name).countDocuments();
                atlasStats.push({ name: stat.name, count });
                console.log(`  📊 ${stat.name}: ${count} documentos no Atlas`);
            } catch (error) {
                console.log(`  ⚠️  ${stat.name}: não encontrada no Atlas`);
            }
        }
        
        // Fechar conexões
        await localConn.close();
        await atlasConn.close();
        
        console.log('\n🎉 Migração concluída com sucesso!');
        console.log(`📊 Total migrado: ${totalMigrated} documentos`);
        console.log(`📁 Backup salvo em: ${path.resolve(backupDir)}`);
        
        console.log('\n⚠️  Próximos passos:');
        console.log('   1. Atualize o arquivo .env do backend:');
        console.log('      MONGODB_URI=mongodb+srv://cauaveloso_db_server:SaxSophone155!@provaonlinenew.3pwi6zm.mongodb.net/provas_online');
        console.log('   2. Reinicie o servidor:');
        console.log('      npm start');
        console.log('   3. Teste a aplicação em: http://localhost:3000');
        
    } catch (error) {
        console.error('\n❌ Erro durante a migração:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

// Criar arquivo .env temporário se não existir
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
    console.log('📝 Criando arquivo .env temporário...');
    const envContent = `MONGODB_LOCAL_URI=mongodb://localhost:27017/provas_online
MONGODB_ATLAS_URI=mongodb+srv://cauaveloso_db_server:SaxSophone155!@provaonlinenew.3pwi6zm.mongodb.net/provas_online`;
    
    fs.writeFileSync(envPath, envContent);
    console.log('✅ .env criado com URIs de conexão');
}

// Executar migração
migrateToAtlas().catch(console.error);