// download-models-complete.js
const fs = require('fs');
const path = require('path');
const https = require('https');

const models = [
    // TinyFaceDetector
    'tiny_face_detector_model-weights_manifest.json',
    'tiny_face_detector_model-shard1',
    
    // FaceLandmark68
    'face_landmark_68_model-weights_manifest.json',
    'face_landmark_68_model-shard1',
    
    // FaceRecognitionNet (NECESSÁRIO!)
    'face_recognition_model-weights_manifest.json',
    'face_recognition_model-shard1',
    'face_recognition_model-shard2'
];

const BASE_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';
const MODELS_DIR = path.join(__dirname, '..', 'models');

// Criar diretório se não existir
if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
    console.log('📁 Diretório criado:', MODELS_DIR);
}

console.log('📥 Baixando todos os modelos de reconhecimento facial...');
console.log('📂 Diretório de destino:', MODELS_DIR);
console.log('');

let downloaded = 0;

models.forEach(model => {
    const filePath = path.join(MODELS_DIR, model);
    const file = fs.createWriteStream(filePath);
    
    https.get(`${BASE_URL}${model}`, response => {
        if (response.statusCode !== 200) {
            console.error(`❌ Erro ao baixar ${model}: HTTP ${response.statusCode}`);
            return;
        }
        
        response.pipe(file);
        
        file.on('finish', () => {
            file.close();
            downloaded++;
            console.log(`✅ Baixado: ${model} (${downloaded}/${models.length})`);
            
            if (downloaded === models.length) {
                console.log('\n🎉 Todos os modelos baixados com sucesso!');
                console.log('📁 Localização:', MODELS_DIR);
            }
        });
    }).on('error', err => {
        fs.unlink(filePath, () => {});
        console.error(`❌ Erro ao baixar ${model}:`, err.message);
    });
});