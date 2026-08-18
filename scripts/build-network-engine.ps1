param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"
$OrionRoot = Split-Path -Parent $PSScriptRoot
$SourceDirectory = Join-Path $OrionRoot "native\network-engine"
$BuildDirectory = Join-Path $SourceDirectory "build"
$OutputDirectory = Join-Path $OrionRoot "frontend\src-tauri\binaries"
$OutputName = "orion-network-engine-x86_64-pc-windows-msvc.exe"
$CMakeCommand = Get-Command cmake -ErrorAction SilentlyContinue

if ($null -eq $CMakeCommand) {
    $CMakePath = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe"
    if (-not (Test-Path -LiteralPath $CMakePath)) {
        throw "CMake não encontrado. Instale as ferramentas CMake do Visual Studio Build Tools 2022."
    }
} else {
    $CMakePath = $CMakeCommand.Source
}

& $CMakePath -S $SourceDirectory -B $BuildDirectory -A x64
if ($LASTEXITCODE -ne 0) {
    throw "Não foi possível configurar o ORION Network Engine."
}

& $CMakePath --build $BuildDirectory --config $Configuration
if ($LASTEXITCODE -ne 0) {
    throw "Não foi possível compilar o ORION Network Engine."
}

& $CMakePath --build $BuildDirectory --config $Configuration --target RUN_TESTS
if ($LASTEXITCODE -ne 0) {
    throw "Os testes do ORION Network Engine falharam."
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$BuiltExecutable = Join-Path $BuildDirectory "$Configuration\orion-network-engine.exe"
Copy-Item -LiteralPath $BuiltExecutable -Destination (Join-Path $OutputDirectory $OutputName) -Force

Write-Host "ORION Network Engine criado em $OutputDirectory\$OutputName" -ForegroundColor Green
