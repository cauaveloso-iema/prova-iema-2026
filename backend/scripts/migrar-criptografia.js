// backend/scripts/migrar-criptografia.js
// 🔄 Migração de dados legados para formato criptografado LGPD
// ⚠️ RODE APENAS UMA VEZ após configurar o crypto-utils

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const TermoVisita = require('../models/TermoVisita');
const { encrypt, isEncrypted, hash } = require('../utils/crypto-utils');

async function migrar() {
  console.log('🚀 Iniciando migração de criptografia...\n');
  
  try {
    // Conectar ao MongoDB
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGODB_LOCAL_URI);
    console.log('✅ Conectado ao MongoDB\n');
    
    // Buscar todos os termos
    const termos = await TermoVisita.find({});
    console.log(`📊 Encontrados ${termos.length} termo(s) para verificar\n`);
    
    let jaCriptografados = 0;
    let migrados = 0;
    let erros = 0;
    let semDados = 0;
    
    for (const termo of termos) {
      let modificado = false;
      
      // Migrar responsáveis
      for (const r of (termo.responsaveis || [])) {
        // CPF
        if (r.cpf && !isEncrypted(r.cpf)) {
          try {
            r.cpf = encrypt(r.cpf);
            if (!r.cpfHash) {
              r.cpfHash = hash(String(r.cpf).replace(/\D/g, ''));
            }
            modificado = true;
          } catch (err) {
            console.error(`  ❌ Erro CPF em ${termo.codigo}:`, err.message);
            erros++;
          }
        }
        
        // RG
        if (r.rg && !isEncrypted(r.rg)) {
          try {
            r.rg = encrypt(r.rg);
            modificado = true;
          } catch (err) {
            console.error(`  ❌ Erro RG em ${termo.codigo}:`, err.message);
            erros++;
          }
        }
        
        // Telefone
        if (r.telefone && !isEncrypted(r.telefone)) {
          try {
            r.telefone = encrypt(r.telefone);
            modificado = true;
          } catch (err) {
            console.error(`  ❌ Erro telefone em ${termo.codigo}:`, err.message);
            erros++;
          }
        }
        
        // Assinatura
        if (r.assinaturaBase64 && !isEncrypted(r.assinaturaBase64)) {
          try {
            r.assinaturaBase64 = encrypt(r.assinaturaBase64);
            modificado = true;
          } catch (err) {
            console.error(`  ❌ Erro assinatura em ${termo.codigo}:`, err.message);
            erros++;
          }
        }
        
        // Remover endereço completo (LGPD - minimização)
        if (r.localizacaoAssinatura?.endereco) {
          delete r.localizacaoAssinatura.endereco;
          delete r.localizacaoAssinatura.accuracy;
          modificado = true;
        }
      }
      
      // Assinatura do gestor
      if (termo.assinaturaGestor?.base64 && !isEncrypted(termo.assinaturaGestor.base64)) {
        try {
          termo.assinaturaGestor.base64 = encrypt(termo.assinaturaGestor.base64);
          modificado = true;
        } catch (err) {
          console.error(`  ❌ Erro assinatura gestor em ${termo.codigo}:`, err.message);
          erros++;
        }
      }
      
      // Adicionar expiraEm se não existir
      if (!termo.expiraEm) {
        const anos = parseInt(process.env.RETENCAO_VISITAS_ANOS || '2');
        const d = new Date(termo.createdAt || Date.now());
        d.setFullYear(d.getFullYear() + anos);
        termo.expiraEm = d;
        modificado = true;
      }
      
      if (modificado) {
        try {
          await termo.save();
          migrados++;
          console.log(`  ✅ Migrado: ${termo.codigo}`);
        } catch (err) {
          console.error(`  ❌ Erro ao salvar ${termo.codigo}:`, err.message);
          erros++;
        }
      } else {
        // Verificar se já está tudo criptografado
        const temDados = (termo.responsaveis || []).some(r => r.cpf || r.rg);
        if (temDados) {
          jaCriptografados++;
        } else {
          semDados++;
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DA MIGRAÇÃO');
    console.log('='.repeat(60));
    console.log(`✅ Migrados:            ${migrados}`);
    console.log(`🔒 Já criptografados:  ${jaCriptografados}`);
    console.log(`📭 Sem dados pessoais: ${semDados}`);
    console.log(`❌ Erros:              ${erros}`);
    console.log(`📊 Total:              ${termos.length}`);
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Erro fatal na migração:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Desconectado do MongoDB');
    process.exit(0);
  }
}

migrar();