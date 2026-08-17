param(
    [string]$TargetTriple = "x86_64-pc-windows-msvc"
)

$ErrorActionPreference = "Stop"
$OrionRoot = Split-Path -Parent $PSScriptRoot
$BackendDirectory = Join-Path $OrionRoot "backend"
$PythonExecutable = Join-Path $BackendDirectory ".venv\Scripts\python.exe"
$OutputDirectory = Join-Path $OrionRoot "frontend\src-tauri\binaries"
$BuildDirectory = Join-Path $BackendDirectory "build\desktop"
$BinaryName = "orion-backend-$TargetTriple"

if (-not (Test-Path -LiteralPath $PythonExecutable)) {
    throw "Ambiente Python não encontrado em $PythonExecutable."
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $BuildDirectory | Out-Null

Push-Location $BackendDirectory
try {
    & $PythonExecutable -m PyInstaller `
        --noconfirm `
        --clean `
        --onefile `
        --windowed `
        --collect-all uvicorn `
        --name $BinaryName `
        --distpath $OutputDirectory `
        --workpath $BuildDirectory `
        --specpath $BuildDirectory `
        app\desktop.py

    if ($LASTEXITCODE -ne 0) {
        throw "Não foi possível empacotar o backend desktop."
    }
}
finally {
    Pop-Location
}

Write-Host "Backend desktop criado em $OutputDirectory\$BinaryName.exe" -ForegroundColor Green
