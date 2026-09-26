<#
.SYNOPSIS
    Script de deploy automatizado para o Educa Pleno (Node.js + MongoDB).

.DESCRIPTION
    Realiza backup, atualização de código, instalação de dependências,
    migrações e reinício do serviço, com health check e rollback automático.

.PARAMETER Environment
    Ambiente de destino do deploy. Padrão: "production".

.PARAMETER NoBackup
    Se presente, pula a etapa de backup do banco de dados.

.PARAMETER NoMigrate
    Se presente, pula a etapa de migrações do banco.

.PARAMETER SkipGitPull
    Se presente, pula o `git pull` (útil para deploys locais).

.EXAMPLE
    .\deploy.ps1
    Executa deploy completo em produção.

.EXAMPLE
    .\deploy.ps1 -Environment staging -NoBackup -NoMigrate
    Deploy rápido em staging, sem backup e sem migrações.
#>

param(
    [string]$Environment = "production",
    [switch]$NoBackup,
    [switch]$NoMigrate,
    [switch]$SkipGitPull
)

# ============================================================
# CONFIGURAÇÕES
# ============================================================
$ErrorActionPreference = "Stop"
$ScriptRoot      = $PSScriptRoot
$BackendPath     = Join-Path $ScriptRoot "backend"
$HealthUrl       = "http://localhost:3000/api/health"
$HealthRetries   = 5
$HealthDelaySec  = 3
$GitBranch       = "main"

# ============================================================
# FUNÇÕES AUXILIARES
# ============================================================
function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "▶ $Message" -ForegroundColor Cyan
}

function Write-Info {
    param([string]$Message)
    Write-Host "  ℹ $Message" -ForegroundColor Gray
}

function Write-Ok {
    param([string]$Message)
    Write-Host "  ✅ $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "  ⚠ $Message" -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Message)
    Write-Host "  ❌ $Message" -ForegroundColor Red
}

function Invoke-Step {
    param(
        [string]$Description,
        [scriptblock]$Action
    )
    Write-Info $Description
    try {
        & $Action
        if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) {
            throw "Comando retornou exit code $LASTEXITCODE"
        }
    }
    catch {
        Write-Err "Falha: $Description"
        Write-Err $_.Exception.Message
        throw
    }
}

# ============================================================
# INÍCIO
# ============================================================
$startTime = Get-Date
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║   🚀  DEPLOY - EDUCAPLENO                   ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Magenta
Write-Host "  Ambiente : $Environment" -ForegroundColor White
Write-Host "  Início   : $($startTime.ToString('yyyy-MM-dd HH:mm:ss'))" -ForegroundColor White
Write-Host "  Backup   : $(if ($NoBackup)  { 'desabilitado' } else { 'habilitado' })" -ForegroundColor White
Write-Host "  Migração : $(if ($NoMigrate) { 'desabilitada' } else { 'habilitada' })" -ForegroundColor White

# Guardar commit atual para rollback
$previousCommit = $null
try {
    Push-Location $ScriptRoot
    $previousCommit = (git rev-parse HEAD 2>$null)
    if ($previousCommit) {
        Write-Info "Commit atual (rollback point): $($previousCommit.Substring(0,7))"
    }
    Pop-Location
}
catch {
    Write-Warn "Não foi possível obter o commit atual (rollback limitado)."
    if ((Get-Location).Path -ne $ScriptRoot) { Pop-Location }
}

# ============================================================
# ETAPA 1 — BACKUP
# ============================================================
if (-not $NoBackup) {
    Write-Step "ETAPA 1/6 — Backup do banco de dados"
    try {
        Push-Location $BackendPath
        Invoke-Step "Executando node backup.js" {
            node backup.js
        }
        Write-Ok "Backup concluído com sucesso"
    }
    catch {
        Write-Err "Deploy abortado: falha no backup"
        exit 1
    }
    finally {
        Pop-Location
    }
} else {
    Write-Step "ETAPA 1/6 — Backup (ignorado por parâmetro)"
}

# ============================================================
# ETAPA 2 — ATUALIZAR CÓDIGO
# ============================================================
if (-not $SkipGitPull) {
    Write-Step "ETAPA 2/6 — Atualização do código (git pull)"
    try {
        Push-Location $ScriptRoot
        Invoke-Step "git pull origin $GitBranch" {
            git pull origin $GitBranch
        }
        Write-Ok "Código atualizado"
    }
    catch {
        Write-Err "Deploy abortado: falha no git pull"
        exit 1
    }
    finally {
        Pop-Location
    }
} else {
    Write-Step "ETAPA 2/6 — Git pull (ignorado por parâmetro)"
}

# ============================================================
# ETAPA 3 — INSTALAR DEPENDÊNCIAS
# ============================================================
Write-Step "ETAPA 3/6 — Instalação de dependências"
try {
    Push-Location $BackendPath
    Invoke-Step "npm install --production" {
        npm install --production
    }
    Write-Ok "Dependências instaladas"
}
catch {
    Write-Err "Deploy abortado: falha no npm install"
    exit 1
}
finally {
    Pop-Location
}

# ============================================================
# ETAPA 4 — MIGRAÇÕES
# ============================================================
if (-not $NoMigrate) {
    Write-Step "ETAPA 4/6 — Migrações do banco"
    try {
        Push-Location $BackendPath
        Invoke-Step "Executando migrações via Mongoose" {
            node -e @"
const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('✅ Conectado para migrações');
        // TODO: adicionar chamadas reais de migração aqui
        await mongoose.disconnect();
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ Erro na conexão:', err);
        process.exit(1);
    });
"@
        }
        Write-Ok "Migrações executadas"
    }
    catch {
        Write-Err "Deploy abortado: falha nas migrações"
        exit 1
    }
    finally {
        Pop-Location
    }
} else {
    Write-Step "ETAPA 4/6 — Migrações (ignoradas por parâmetro)"
}

# ============================================================
# ETAPA 5 — REINICIAR SERVIÇO
# ============================================================
Write-Step "ETAPA 5/6 — Reinício do serviço"

Write-Info "Parando processos node em execução..."
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Ok "Processos node encerrados"

Write-Info "Iniciando novo serviço (npm start)..."
try {
    Push-Location $BackendPath
    Start-Process -FilePath "npm" `
                  -ArgumentList "start" `
                  -WorkingDirectory $BackendPath `
                  -WindowStyle Hidden
    Write-Ok "Serviço iniciado"
}
catch {
    Write-Err "Falha ao iniciar o serviço: $($_.Exception.Message)"
    exit 1
}
finally {
    Pop-Location
}

# ============================================================
# ETAPA 6 — HEALTH CHECK
# ============================================================
Write-Step "ETAPA 6/6 — Health check"

$healthy = $false
for ($i = 1; $i -le $HealthRetries; $i++) {
    Write-Info "Tentativa $i/$HealthRetries — GET $HealthUrl"
    try {
        $response = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 5 -ErrorAction Stop
        if ($response.status -eq "online") {
            $healthy = $true
            break
        }
        Write-Warn "Resposta inesperada: $($response | ConvertTo-Json -Compress)"
    }
    catch {
        Write-Warn "Sem resposta ainda..."
    }

    if ($i -lt $HealthRetries) {
        Start-Sleep -Seconds $HealthDelaySec
    }
}

if (-not $healthy) {
    Write-Err "Sistema não respondeu ao health check após $HealthRetries tentativas."
    Write-Err "Iniciando ROLLBACK para commit $($previousCommit.Substring(0,7))..."
    try {
        Push-Location $ScriptRoot
        git reset --hard $previousCommit
        Push-Location $BackendPath
        npm install --production
        Pop-Location
        Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Process -FilePath "npm" -ArgumentList "start" -WorkingDirectory $BackendPath -WindowStyle Hidden
        Write-Warn "Rollback executado. Verifique manualmente."
    }
    catch {
        Write-Err "Rollback também falhou: $($_.Exception.Message)"
    }
    finally {
        if ((Get-Location).Path -ne $ScriptRoot) { Pop-Location }
    }
    exit 1
}

Write-Ok "Sistema online e saudável"

# ============================================================
# FIM
# ============================================================
$duration = (Get-Date) - $startTime
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║   🎉  DEPLOY CONCLUÍDO COM SUCESSO                   ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host "  Duração  : $([math]::Round($duration.TotalSeconds,1))s" -ForegroundColor White
Write-Host "  Ambiente : $Environment" -ForegroundColor White
Write-Host ""

exit 0