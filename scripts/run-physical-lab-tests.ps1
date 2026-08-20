param(
    [Parameter(Mandatory = $true)]
    [string]$ConfigPath,
    [switch]$EnableWrites
)

$ErrorActionPreference = "Stop"
$OrionRoot = Split-Path -Parent $PSScriptRoot
$BackendDirectory = Join-Path $OrionRoot "backend"
$PythonExecutable = Join-Path $BackendDirectory ".venv\Scripts\python.exe"
$ResolvedConfig = (Resolve-Path -LiteralPath $ConfigPath).Path

if (-not (Test-Path -LiteralPath $PythonExecutable)) {
    throw "Ambiente Python do backend não encontrado."
}

$PreviousConfig = $env:ORION_PHYSICAL_LAB_FILE
$PreviousWrites = $env:ORION_ALLOW_PHYSICAL_WRITES
$env:ORION_PHYSICAL_LAB_FILE = $ResolvedConfig
if ($EnableWrites) {
    $env:ORION_ALLOW_PHYSICAL_WRITES = "APLICAR"
}
else {
    Remove-Item Env:\ORION_ALLOW_PHYSICAL_WRITES -ErrorAction SilentlyContinue
}

Push-Location $BackendDirectory
try {
    & $PythonExecutable -m pytest tests\physical\test_router_lab.py -m physical -vv
    if ($LASTEXITCODE -ne 0) {
        throw "A validação da bancada física encontrou falhas."
    }
}
finally {
    if ($null -eq $PreviousConfig) {
        Remove-Item Env:\ORION_PHYSICAL_LAB_FILE -ErrorAction SilentlyContinue
    }
    else {
        $env:ORION_PHYSICAL_LAB_FILE = $PreviousConfig
    }
    if ($null -eq $PreviousWrites) {
        Remove-Item Env:\ORION_ALLOW_PHYSICAL_WRITES -ErrorAction SilentlyContinue
    }
    else {
        $env:ORION_ALLOW_PHYSICAL_WRITES = $PreviousWrites
    }
    Pop-Location
}
