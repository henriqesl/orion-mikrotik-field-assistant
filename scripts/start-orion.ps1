param(
    [ValidateRange(1024, 65535)]
    [int]$Port = 8765,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$OrionRoot = Split-Path -Parent $PSScriptRoot
$BackendDirectory = Join-Path $OrionRoot "backend"
$FrontendDirectory = Join-Path $OrionRoot "frontend"
$VirtualEnvironmentPython = Join-Path $BackendDirectory ".venv\Scripts\python.exe"
$OrionUrl = "http://127.0.0.1:$Port"

function Write-Step([string]$Message) {
    Write-Host "[ORION] $Message" -ForegroundColor Cyan
}

function Stop-WithMessage([string]$Message) {
    Write-Host "[ORION] $Message" -ForegroundColor Red
    Read-Host "Pressione Enter para fechar"
    exit 1
}

$ListeningConnection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($ListeningConnection) {
    Stop-WithMessage "A porta $Port ja esta em uso. Feche o programa que esta usando essa porta ou execute .\scripts\start-orion.ps1 -Port OUTRA_PORTA."
}

if (-not (Test-Path -LiteralPath $VirtualEnvironmentPython)) {
    Write-Step "Preparando o ambiente Python pela primeira vez..."
    if (Get-Command py -ErrorAction SilentlyContinue) {
        & py -3 -m venv (Join-Path $BackendDirectory ".venv")
    }
    elseif (Get-Command python -ErrorAction SilentlyContinue) {
        & python -m venv (Join-Path $BackendDirectory ".venv")
    }
    else {
        Stop-WithMessage "Python 3.11 ou superior nao foi encontrado."
    }
}

& $VirtualEnvironmentPython -c "import fastapi, routeros, uvicorn" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Step "Instalando as dependencias do backend..."
    Push-Location $BackendDirectory
    try {
        & $VirtualEnvironmentPython -m pip install -e .
        if ($LASTEXITCODE -ne 0) {
            Stop-WithMessage "Nao foi possivel instalar as dependencias do backend."
        }
    }
    finally {
        Pop-Location
    }
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Stop-WithMessage "Node.js e npm nao foram encontrados."
}

Push-Location $FrontendDirectory
try {
    if (-not (Test-Path -LiteralPath (Join-Path $FrontendDirectory "node_modules"))) {
        Write-Step "Instalando as dependencias do frontend..."
        & npm ci
        if ($LASTEXITCODE -ne 0) {
            Stop-WithMessage "Nao foi possivel instalar as dependencias do frontend."
        }
    }

    Write-Step "Preparando a interface..."
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        Stop-WithMessage "O frontend nao foi compilado."
    }
}
finally {
    Pop-Location
}

Write-Step "Iniciando em $OrionUrl"
$ServerOptions = @{
    FilePath = $VirtualEnvironmentPython
    ArgumentList = @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", $Port)
    WorkingDirectory = $BackendDirectory
    NoNewWindow = $true
    PassThru = $true
}
$ServerProcess = Start-Process @ServerOptions

try {
    $Ready = $false
    for ($Attempt = 0; $Attempt -lt 40; $Attempt++) {
        Start-Sleep -Milliseconds 250
        if ($ServerProcess.HasExited) {
            Stop-WithMessage "O servidor encerrou durante a inicializacao."
        }
        try {
            $Health = Invoke-RestMethod -Uri "$OrionUrl/api/health" -TimeoutSec 1
            if ($Health.status -eq "ok") {
                $Ready = $true
                break
            }
        }
        catch {
            # The server may still be starting.
        }
    }

    if (-not $Ready) {
        Stop-WithMessage "O ORION nao respondeu dentro do tempo esperado."
    }

    Write-Host "[ORION] Pronto. Feche esta janela para encerrar." -ForegroundColor Green
    if (-not $NoBrowser) {
        Start-Process $OrionUrl
    }
    Wait-Process -Id $ServerProcess.Id
}
finally {
    if ($ServerProcess -and -not $ServerProcess.HasExited) {
        Stop-Process -Id $ServerProcess.Id -Force
    }
}
