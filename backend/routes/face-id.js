// ============================================================================
// ROUTES/FACE-ID.JS
// ============================================================================
// Descrição: Rotas NÃO-ADMIN do sistema de reconhecimento facial (Face ID)
//
// ⚠️ IMPORTANTE:
//   - As rotas administrativas (/api/admin/faces/*) continuam em routes/admin.js
//   - O modelo FaceID é importado do arquivo centralizado models/FaceID.js
//
// Autor: Equipe de Desenvolvimento
// ============================================================================

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const logger = require('../utils/logger');

// Bibliotecas de reconhecimento facial
const faceapi = require('face-api.js');
const canvas = require('canvas');

const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData });

// Modelo FaceID centralizado
const FaceID = require('../models/FaceID');

// Modelo User
const User = require('../models/User');

// ============================================================================
// CARREGAMENTO DOS MODELOS DE IA
// ============================================================================
const MODELS_PATH = path.join(__dirname, '..', '..', 'models');
let modelsLoaded = false;

/**
 * Verifica se todos os arquivos de modelo de IA estão presentes em disco.
 * @returns {string[]} Lista de arquivos ausentes
 */
function verificarArquivosModelos() {
    const arquivosNecessarios = [
        'tiny_face_detector_model-weights_manifest.json',
        'tiny_face_detector_model-shard1',
        'face_landmark_68_model-weights_manifest.json',
        'face_landmark_68_model-shard1',
        'face_recognition_model-weights_manifest.json',
        'face_recognition_model-shard1',
        'face_recognition_model-shard2'
    ];

    return arquivosNecessarios.filter(arquivo =>
        !fs.existsSync(path.join(MODELS_PATH, arquivo))
    );
}

/**
 * Carrega os modelos de reconhecimento facial na memória.
 * @returns {Promise<boolean>} true se carregados com sucesso
 */
async function loadFaceModels() {
    if (modelsLoaded) return true;

    if (!fs.existsSync(MODELS_PATH)) {
        fs.mkdirSync(MODELS_PATH, { recursive: true });
    }

    const arquivosFaltando = verificarArquivosModelos();
    if (arquivosFaltando.length > 0) {
        logger.error('❌ Arquivos de modelo ausentes:', arquivosFaltando.join(', '));
        logger.info('💡 Execute: node download-models-complete.js');
        return false;
    }

    try {
        await faceapi.nets.tinyFaceDetector.loadFromDisk(MODELS_PATH);
        await faceapi.nets.faceLandmark68Net.loadFromDisk(MODELS_PATH);
        await faceapi.nets.faceRecognitionNet.loadFromDisk(MODELS_PATH);
        modelsLoaded = true;
        logger.info('✅ Modelos de reconhecimento facial carregados');
        return true;
    } catch (error) {
        logger.error('❌ Erro ao carregar modelos faciais:', error.message);
        return false;
    }
}

/** Retorna status atual dos modelos */
function getModelStatus() {
    return {
        modelsLoaded,
        modelsPath: MODELS_PATH,
        arquivosPresentes: verificarArquivosModelos().length === 0,
        timestamp: new Date().toISOString()
    };
}

// Carrega em background no boot do módulo
loadFaceModels();

// ============================================================================
// MIDDLEWARE LOCAL DE AUTENTICAÇÃO
// ============================================================================
const authenticateTokenLocal = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            error: 'Acesso negado. Token não fornecido.'
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({
                success: false,
                error: 'Token inválido ou expirado.'
            });
        }
        req.userId = decoded.id;
        req.userRole = decoded.role;
        req.userNome = decoded.nome;
        next();
    });
};

// ============================================================================
// ROTA: CADASTRAR FACE ID
// ============================================================================
/**
 * POST /api/auth/cadastrar-face
 * Recebe uma imagem base64, detecta o rosto, gera o descriptor e salva no banco.
 */
router.post('/cadastrar-face', authenticateTokenLocal, async (req, res) => {
    try {
        const { usuarioId, imagem } = req.body;

        logger.info('='.repeat(50));
        logger.info('📸 CADASTRANDO FACE ID');
        logger.info('📌 Usuário ID:', usuarioId);
        logger.info('📦 Tamanho da imagem:', Math.round(imagem?.length / 1024 || 0), 'KB');
        logger.info('='.repeat(50));

        if (!usuarioId || !imagem) {
            return res.status(400).json({
                success: false,
                error: 'Dados incompletos para cadastro de face'
            });
        }

        // Verificar se o usuário existe
        const user = await User.findById(usuarioId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'Usuário não encontrado'
            });
        }

        // Garantir que os modelos estão carregados
        if (!modelsLoaded) {
            logger.info('⏳ Carregando modelos...');
            await loadFaceModels();
        }

        logger.info('🔍 Detectando face...');

        const imageBuffer = Buffer.from(imagem, 'base64');
        const img = await canvas.loadImage(imageBuffer);

        const options = new faceapi.TinyFaceDetectorOptions({
            inputSize: 224,
            scoreThreshold: 0.3
        });

        const detection = await faceapi.detectSingleFace(img, options);

        if (!detection) {
            return res.status(400).json({
                success: false,
                error: 'Nenhum rosto detectado na imagem'
            });
        }

        logger.info('✅ Face detectada, computando descriptor...');

        const descriptorResult = await faceapi.computeFaceDescriptor(img, detection);

        if (!descriptorResult) {
            return res.status(400).json({
                success: false,
                error: 'Não foi possível gerar o descriptor facial'
            });
        }

        const faceDescriptor = Array.from(descriptorResult);

        logger.info(`✅ Descriptor gerado: ${faceDescriptor.length} valores`);

        // Gerar hash da imagem
        const imagemHash = crypto.createHash('sha256').update(imagem).digest('hex');

        // Salvar/atualizar no banco
        const faceExistente = await FaceID.findOne({ usuarioId });

        if (faceExistente) {
            faceExistente.imagemBase64 = imagem;
            faceExistente.imagemHash = imagemHash;
            faceExistente.faceDescriptor = faceDescriptor;
            faceExistente.dataCadastro = new Date();
            await faceExistente.save();
            logger.info('✅ Registro atualizado');
        } else {
            await new FaceID({
                usuarioId,
                imagemBase64: imagem,
                imagemHash,
                faceDescriptor,
                dataCadastro: new Date()
            }).save();
            logger.info('✅ Novo registro criado');
        }

        res.json({
            success: true,
            message: 'Face ID cadastrado com sucesso',
            usuario: user.nome
        });

    } catch (error) {
        logger.error('❌ Erro no cadastro:', error);
        res.status(500).json({
            success: false,
            error: 'Erro interno: ' + error.message
        });
    }
});

// ============================================================================
// ROTA: TESTAR DETECÇÃO (SEM SALVAR)
// ============================================================================
/**
 * POST /api/auth/testar-deteccao
 * Testa diferentes configurações de detecção (útil para debug).
 */
router.post('/testar-deteccao', authenticateTokenLocal, async (req, res) => {
    try {
        const { imagem } = req.body;

        logger.info('🧪 TESTANDO DETECÇÃO FACIAL');

        if (!imagem) {
            return res.status(400).json({ error: 'Imagem não fornecida' });
        }

        if (!modelsLoaded) {
            await loadFaceModels();
        }

        const imageBuffer = Buffer.from(imagem, 'base64');
        const img = await canvas.loadImage(imageBuffer);

        const resultados = [];
        const configuracoes = [
            { inputSize: 128, threshold: 0.2 },
            { inputSize: 160, threshold: 0.3 },
            { inputSize: 224, threshold: 0.3 },
            { inputSize: 320, threshold: 0.3 }
        ];

        for (const config of configuracoes) {
            const startTime = Date.now();

            const options = new faceapi.TinyFaceDetectorOptions({
                inputSize: config.inputSize,
                scoreThreshold: config.threshold
            });

            const detection = await faceapi.detectSingleFace(img, options)
                .withFaceDescriptor();

            const time = Date.now() - startTime;

            resultados.push({
                config: `inputSize: ${config.inputSize}, threshold: ${config.threshold}`,
                tempo: time + 'ms',
                detectou: !!detection,
                descriptorLength: detection ? detection.descriptor.length : 0
            });
        }

        res.json({ success: true, resultados });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// ROTA: VERIFICAR SE USUÁRIO TEM FACE CADASTRADA
// ============================================================================
/**
 * GET /api/auth/verificar-face/:usuarioId
 */
router.get('/verificar-face/:usuarioId', authenticateTokenLocal, async (req, res) => {
    try {
        const { usuarioId } = req.params;

        const face = await FaceID.findOne({ usuarioId })
            .select('faceDescriptor dataCadastro ultimaValidacao totalValidacoes');

        res.json({
            success: true,
            temFace: !!face,
            temDescriptor: !!(face && face.faceDescriptor),
            dataCadastro: face?.dataCadastro || null,
            ultimaValidacao: face?.ultimaValidacao || null,
            totalValidacoes: face?.totalValidacoes || 0
        });

    } catch (error) {
        logger.error('❌ Erro ao verificar face:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ROTA: VALIDAR CÂMERA (BATCH - SEGURA)
// ============================================================================
/**
 * POST /api/auth/validar-camera
 * Recebe vários frames, detecta movimento e reconhece a face.
 * Requer mínimo 6 frames (2 ações × 3 frames).
 */
router.post('/validar-camera', authenticateTokenLocal, async (req, res) => {
    try {
        const { usuarioId, frames, acoes, timestamps, localizacao } = req.body;

        logger.info('='.repeat(50));
        logger.info('🔍 VALIDAÇÃO FACIAL - MODO SEGURO');
        logger.info('📌 Usuário ID:', usuarioId);
        logger.info(`📦 Frames recebidos: ${frames?.length || 0}`);
        logger.info('='.repeat(50));

        if (!usuarioId || !frames || frames.length < 6) {
            return res.status(400).json({
                success: false,
                error: 'Dados insuficientes para validação segura'
            });
        }

        if (!modelsLoaded) {
            await loadFaceModels();
        }

        const faceCadastrada = await FaceID.findOne({ usuarioId });

        if (!faceCadastrada || !faceCadastrada.faceDescriptor) {
            return res.status(404).json({
                success: false,
                error: 'Nenhum Face ID cadastrado'
            });
        }

        const descriptorSalvo = new Float32Array(faceCadastrada.faceDescriptor);

        // Processar frame individual
        const processarFrame = async (frameBase64) => {
            try {
                const imageBuffer = Buffer.from(frameBase64, 'base64');
                const img = await canvas.loadImage(imageBuffer);

                const options = new faceapi.TinyFaceDetectorOptions({
                    inputSize: 192,
                    scoreThreshold: 0.3
                });

                const detection = await faceapi.detectSingleFace(img, options);
                if (!detection) return null;

                const descriptor = await faceapi.computeFaceDescriptor(img, detection);
                if (!descriptor) return null;

                const distancia = faceapi.euclideanDistance(descriptor, descriptorSalvo);
                return { distancia, detection };

            } catch (err) {
                return null;
            }
        };

        // Processar todos os frames em paralelo
        const resultados = await Promise.all(frames.map(f => processarFrame(f)));
        const resultadosValidos = resultados.filter(r => r !== null);

        if (resultadosValidos.length < 3) {
            return res.status(400).json({
                success: false,
                error: 'Rosto não detectado em frames suficientes'
            });
        }

        const distancias = resultadosValidos.map(r => r.distancia);
        const melhorDistancia = Math.min(...distancias);
        const mediaDistancias = distancias.reduce((a, b) => a + b, 0) / distancias.length;

        // Detecção de movimento
        const variacoes = [];
        for (let i = 1; i < distancias.length; i++) {
            variacoes.push(Math.abs(distancias[i] - distancias[i - 1]));
        }
        const variabilidadeMedia = variacoes.length > 0
            ? variacoes.reduce((a, b) => a + b, 0) / variacoes.length
            : 0;

        const similaridade = Math.max(0, Math.min(100, (1 - (melhorDistancia / 0.8)) * 100));
        const threshold = 0.55;
        const reconhecido = melhorDistancia < threshold;
        const temMovimento = variabilidadeMedia > 0.015;

        logger.info(`📊 RESULTADOS:`);
        logger.info(`   Frames válidos: ${resultadosValidos.length}/${frames.length}`);
        logger.info(`   Melhor distância: ${melhorDistancia.toFixed(4)}`);
        logger.info(`   Média distâncias: ${mediaDistancias.toFixed(4)}`);
        logger.info(`   Variabilidade: ${variabilidadeMedia.toFixed(4)}`);
        logger.info(`   Similaridade: ${similaridade.toFixed(1)}%`);
        logger.info(`   Reconhecido: ${reconhecido ? '✅' : '❌'}`);
        logger.info(`   Movimento: ${temMovimento ? '✅' : '❌'}`);

        const aprovado = reconhecido && temMovimento;

        if (aprovado) {
            faceCadastrada.ultimaValidacao = new Date();
            faceCadastrada.totalValidacoes += 1;
            await faceCadastrada.save();

            res.json({
                success: true,
                reconhecido: true,
                mensagem: 'Validação facial concluída',
                similaridade: similaridade.toFixed(1),
                melhorDistancia: melhorDistancia.toFixed(4),
                framesValidados: resultadosValidos.length
            });
        } else {
            let erroMsg = '';
            if (!reconhecido) {
                erroMsg = `Face não reconhecida (${similaridade.toFixed(0)}% similaridade)`;
            } else if (!temMovimento) {
                erroMsg = '❌ SEGURANÇA: Movimento não detectado. Não use fotos ou vídeos.';
            }

            res.status(400).json({
                success: false,
                reconhecido: false,
                error: erroMsg || 'Validação falhou',
                similaridade: similaridade.toFixed(1)
            });
        }

    } catch (error) {
        logger.error('❌ Erro:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// ROTA: VALIDAÇÃO EM TEMPO REAL (STREAMING)
// ============================================================================
/**
 * POST /api/auth/validar-camera-stream
 * Validação frame-a-frame (streaming). Resposta mais rápida.
 */
router.post('/validar-camera-stream', authenticateTokenLocal, async (req, res) => {
    try {
        const { usuarioId, frame, acao, sequenciaId } = req.body;

        if (!usuarioId || !frame) {
            return res.status(400).json({ success: false, error: 'Dados incompletos' });
        }

        if (!modelsLoaded) await loadFaceModels();

        const faceCadastrada = await FaceID.findOne({ usuarioId });

        if (!faceCadastrada || !faceCadastrada.faceDescriptor) {
            return res.status(404).json({ success: false, error: 'Face não cadastrada' });
        }

        const descriptorSalvo = new Float32Array(faceCadastrada.faceDescriptor);

        const imageBuffer = Buffer.from(frame, 'base64');
        const img = await canvas.loadImage(imageBuffer);

        const options = new faceapi.TinyFaceDetectorOptions({
            inputSize: 160,
            scoreThreshold: 0.3
        });

        const detection = await faceapi.detectSingleFace(img, options);

        if (!detection) {
            return res.json({ success: false, error: 'Rosto não detectado', acao, sequenciaId });
        }

        const descriptor = await faceapi.computeFaceDescriptor(img, detection);
        if (!descriptor) {
            return res.json({ success: false, error: 'Erro no descriptor', acao, sequenciaId });
        }

        const distancia = faceapi.euclideanDistance(descriptor, descriptorSalvo);
        const similaridade = Math.max(0, Math.min(100, (1 - (distancia / 0.8)) * 100));
        const reconhecido = distancia < 0.55;

        res.json({
            success: true,
            reconhecido,
            similaridade: similaridade.toFixed(1),
            distancia: distancia.toFixed(4),
            acao,
            sequenciaId
        });

    } catch (error) {
        logger.error('❌ Erro:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// EXPORTAR ROUTER + FUNÇÕES AUXILIARES
// ============================================================================
module.exports = router;
module.exports.loadFaceModels = loadFaceModels;
module.exports.getModelStatus = getModelStatus;
module.exports.modelsLoaded = () => modelsLoaded;