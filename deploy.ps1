# Script de Deploy para Windows
param(
    [string]$Environment = "production",
    [switch]$Backup = $true,
    [switch]$Migrate = $true
)

Write-Host "🚀 Iniciando deploy do Sistema de Provas" -ForegroundColor Green
Write-Host "Ambiente: $Environment" -ForegroundColor Cyan

# 1. Backup do banco de dados
if ($Backup) {
    Write-Host "📦 Criando backup do banco de dados..." -ForegroundColor Yellow
    cd backend
    node backup.js
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Falha no backup" -ForegroundColor Red
        exit 1
    }
    cd ..
}

# 2. Atualizar código
Write-Host "🔄 Atualizando código do Git..." -ForegroundColor Yellow
git pull origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Falha ao atualizar código" -ForegroundColor Red
    exit 1
}

# 3. Instalar dependências
Write-Host "📦 Instalando dependências..." -ForegroundColor Yellow
cd backend
npm install --production
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Falha na instalação de dependências" -ForegroundColor Red
    exit 1
}
cd ..

# 4. Migrações do banco (se necessário)
if ($Migrate) {
    Write-Host "🗄️  Executando migrações..." -ForegroundColor Yellow
    cd backend
    node -e "
        const mongoose = require('mongoose');
        require('dotenv').config();
        
        mongoose.connect(process.env.MONGODB_URI)
            .then(() => console.log('✅ Conectado para migrações'))
            .catch(err => {
                console.error('❌ Erro na conexão:', err);
                process.exit(1);
            });
    "
    cd ..
}

# 5. Reiniciar serviços
Write-Host "🔄 Reiniciando serviços..." -ForegroundColor Yellow

# Parar serviço atual
Write-Host "⏹️  Parando serviço atual..." -ForegroundColor Yellow
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue

# Iniciar novo serviço
Write-Host "▶️  Iniciando novo serviço..." -ForegroundColor Yellow
cd backend
Start-Process -NoNewWindow -FilePath "npm" -ArgumentList "start"

# 6. Verificar saúde
Write-Host "🏥 Verificando saúde do sistema..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

$health = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -ErrorAction SilentlyContinue
if ($health.status -eq "online") {
    Write-Host "✅ Sistema online e funcionando!" -ForegroundColor Green
} else {
    Write-Host "❌ Sistema não responde corretamente" -ForegroundColor Red
    exit 1
}

Write-Host "🎉 Deploy concluído com sucesso!" -ForegroundColor Green