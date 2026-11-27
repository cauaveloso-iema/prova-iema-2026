// ============ backend/services/image-moderation.js ============
const fs = require('fs');
const path = require('path');

// ── OpenAI (lazy + protegido) ──────────────────────────────────────────
let _openai = null;
let _openaiInitFailed = false;

function getOpenAIClient() {
  if (_openai) return _openai;
  if (_openaiInitFailed) return null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ OPENAI_API_KEY não configurada. Moderação OpenAI DESATIVADA.');
    _openaiInitFailed = true;
    return null;
  }

  try {
    const OpenAI = require('openai');
    _openai = new OpenAI({ apiKey, timeout: 15000 });
    console.log('✅ Cliente OpenAI inicializado.');
    return _openai;
  } catch (err) {
    console.error('❌ Falha ao inicializar OpenAI:', err.message);
    _openaiInitFailed = true;
    return null;
  }
}

/**
 * Verifica a imagem usando a API de Moderação da OpenAI com regras rigorosas.
 */
async function moderateImageFile(filePath) {
  let fileBuffer;
  try {
    fileBuffer = await fs.promises.readFile(filePath);
  } catch (err) {
    console.error('❌ Erro ao ler arquivo para moderação:', err.message);
    return { safe: false, reason: 'Erro ao processar a imagem. Tente novamente.' };
  }

  if (fileBuffer.length > 20 * 1024 * 1024) {
    return { safe: false, reason: 'A imagem é muito grande. O tamanho máximo permitido é 20MB.' };
  }

  const base64 = fileBuffer.toString('base64');
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  const dataUrl = `data:${mime};base64,${base64}`;

  const openai = getOpenAIClient();
  if (!openai) {
    return { safe: false, reason: 'O serviço de verificação de imagem está indisponível no momento. Tente novamente mais tarde.' };
  }

  try {
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout na verificação da OpenAI')), 15000)
    );

    const response = await Promise.race([
      openai.moderations.create({
        model: 'omni-moderation-latest',
        input: [{ type: 'image_url', image_url: { url: dataUrl } }],
      }),
      timeoutPromise,
    ]);

    const result = response.results[0];
    const scores = result.category_scores || {};
    
    // 🚨 REGRAS RÍGIDAS PARA AMBIENTE ESCOLAR 🚨
    const isSuspeito = 
      result.flagged || 
      (scores.sexual && scores.sexual > 0.1) || 
      (scores['sexual/minors'] && scores['sexual/minors'] > 0.01) || 
      (scores.violence && scores.violence > 0.3) ||
      (scores['violence/graphic'] && scores['violence/graphic'] > 0.1) ||
      (scores.harassment && scores.harassment > 0.2);

    if (isSuspeito) {
      console.log(`🚫 [OpenAI] Imagem rejeitada. Scores:`, {
        sexual: scores.sexual,
        violence: scores.violence,
        harassment: scores.harassment
      });
      
      return {
        safe: false,
        // Mensagem explícita e educativa:
        reason: 'Sua foto não foi aceita. Para garantir a segurança de todos no ambiente escolar, a foto de perfil deve ser uma imagem clara e adequada do seu rosto (estilo 3x4). Não são permitidas: fotos do corpo (sem camisa, deitado, etc.), roupas de banho, imagens com teor violento, sugestivo ou de terceiros. Por favor, escolha uma foto adequada e tente novamente.',
        details: { source: 'openai-rigoroso', scores: scores },
      };
    }

    console.log(`✅ [OpenAI] Imagem aprovada. (sexual:${scores.sexual || 0} violence:${scores.violence || 0})`);
    return { safe: true };

  } catch (err) {
    console.error('❌ Erro na moderação OpenAI:', err.message);
    return {
      safe: false,
      reason: 'Não foi possível verificar a imagem agora. Por favor, tente novamente em alguns instantes.',
    };
  }
}

module.exports = { moderateImageFile };