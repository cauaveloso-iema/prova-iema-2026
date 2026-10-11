// scripts/criptografar-atendimentos.js
// ============================================
// MIGRAÇÃO: Criptografar atendimentos antigos
// Rode UMA VEZ: node scripts/criptografar-atendimentos.js
// ============================================

require('dotenv').config();
const mongoose = require('mongoose');
const { criptografar, estaCriptografado } = require('../utils/criptografia');

async function migrar() {
  console.log('🔐 Iniciando migração de criptografia...\n');
  
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado ao MongoDB\n');
    
    const collection = mongoose.connection.collection('atendimentosassistentesocials');
    const docs = await collection.find({}).toArray();
    
    console.log(`📊 Total de atendimentos: ${docs.length}\n`);
    
    if (docs.length === 0) {
      console.log('✅ Nada para migrar.');
      process.exit(0);
    }
    
    let migrados = 0;
    let jaCriptografados = 0;
    let erros = 0;
    
    const camposEntrada = ['descricao', 'observacoes', 'assinaturaBase64'];
    const camposSaida = ['resultadoTexto', 'observacoesFinais'];
    const camposDetalhes = [
      'contextoFamiliar', 'historicoAnterior', 'condicaoSocial',
      'encaminhadoPara', 'motivoEncaminhamento', 'tipoIntervencao',
      'metodosUtilizados', 'modalidadeAtendimento', 'tipoTarefaOutros',
      'providenciasTomadas', 'proximosPassos'
    ];
    const arraysDetalhes = ['profissionaisEnvolvidos', 'participantesAtendimento'];
    const camposRemarcacao = ['motivoRemarcacao', 'observacoesRemarcacao'];
    
    for (const doc of docs) {
      try {
        let mudou = false;
        
        // entrada
        if (doc.entrada) {
          camposEntrada.forEach(campo => {
            if (doc.entrada[campo] && !estaCriptografado(doc.entrada[campo])) {
              doc.entrada[campo] = criptografar(doc.entrada[campo]);
              mudou = true;
            }
          });
        }
        
        // saida
        if (doc.saida) {
          camposSaida.forEach(campo => {
            if (doc.saida[campo] && !estaCriptografado(doc.saida[campo])) {
              doc.saida[campo] = criptografar(doc.saida[campo]);
              mudou = true;
            }
          });
        }
        
        // detalhes
        if (doc.detalhes) {
          camposDetalhes.forEach(campo => {
            if (doc.detalhes[campo] && !estaCriptografado(doc.detalhes[campo])) {
              doc.detalhes[campo] = criptografar(doc.detalhes[campo]);
              mudou = true;
            }
          });
          
          arraysDetalhes.forEach(campo => {
            if (Array.isArray(doc.detalhes[campo])) {
              doc.detalhes[campo] = doc.detalhes[campo].map(item => 
                estaCriptografado(item) ? item : criptografar(item)
              );
              mudou = true;
            }
          });
        }
        
        // remarcações
        if (Array.isArray(doc.remarcacoes)) {
          doc.remarcacoes.forEach(rem => {
            camposRemarcacao.forEach(campo => {
              if (rem[campo] && !estaCriptografado(rem[campo])) {
                rem[campo] = criptografar(rem[campo]);
                mudou = true;
              }
            });
          });
        }
        
        if (mudou) {
          await collection.replaceOne({ _id: doc._id }, doc);
          migrados++;
          console.log(`  ✅ Migrado: ${doc.alunoNome}`);
        } else {
          jaCriptografados++;
        }
        
      } catch (err) {
        erros++;
        console.error(`  ❌ Erro no doc ${doc._id}:`, err.message);
      }
    }
    
    console.log('\n═══════════════════════════════════════');
    console.log(`✅ Migração concluída!`);
    console.log(`   Migrados: ${migrados}`);
    console.log(`   Já criptografados: ${jaCriptografados}`);
    console.log(`   Erros: ${erros}`);
    console.log('═══════════════════════════════════════\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  }
}

migrar();