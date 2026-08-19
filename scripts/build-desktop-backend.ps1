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
$DistributionDirectory = Join-Path $BuildDirectory "distribution"
$PackagedDirectory = Join-Path $DistributionDirectory $BinaryName
$RuntimeDirectoryName = "orion-backend-runtime"
$RuntimeOutputDirectory = Join-Path $OutputDirectory $RuntimeDirectoryName

if (-not (Test-Path -LiteralPath $PythonExecutable)) {
    throw "Ambiente Python não encontrado em $PythonExecutable."
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $BuildDirectory | Out-Null

Push-Location $BackendDirectory
try {
    & $PythonExecutable -m PyInstaller `
        --noconfirm `
        --onedir `
        --contents-directory $RuntimeDirectoryName `
        --windowed `
        --collect-all uvicorn `
        --name $BinaryName `
        --distpath $DistributionDirectory `
        --workpath $BuildDirectory `
        --specpath $BuildDirectory `
        app\desktop.py

    if ($LASTEXITCODE -ne 0) {
        throw "Não foi possível empacotar o backend desktop."
    }

    $PackagedExecutable = Join-Path $PackagedDirectory "$BinaryName.exe"
    $OutputExecutable = Join-Path $OutputDirectory "$BinaryName.exe"
    Copy-Item -LiteralPath $PackagedExecutable -Destination $OutputExecutable -Force

    if (Test-Path -LiteralPath $RuntimeOutputDirectory) {
        $ResolvedRuntime = [System.IO.Path]::GetFullPath($RuntimeOutputDirectory)
        $ResolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
        if (-not $ResolvedRuntime.StartsWith($ResolvedOutput, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Diretório de runtime fora da pasta de binários esperada."
        }
        Remove-Item -LiteralPath $ResolvedRuntime -Recurse -Force
    }
    Copy-Item `
        -LiteralPath (Join-Path $PackagedDirectory $RuntimeDirectoryName) `
        -Destination $RuntimeOutputDirectory `
        -Recurse `
        -Force

    & (Join-Path $PSScriptRoot "sign-windows-binary.ps1") `
        -Path $OutputExecutable
}
finally {
    Pop-Location
}

Write-Host "Backend desktop criado em $OutputDirectory\$BinaryName.exe" -ForegroundColor Green
