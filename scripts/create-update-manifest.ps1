param(
    [string]$ReleaseNotes = "Atualização do ORION Field."
)

$ErrorActionPreference = "Stop"
$OrionRoot = Split-Path -Parent $PSScriptRoot
$TauriConfigurationPath = Join-Path $OrionRoot "frontend\src-tauri\tauri.conf.json"
$BundleDirectory = Join-Path $OrionRoot "frontend\src-tauri\target\release\bundle\nsis"
$Configuration = Get-Content -LiteralPath $TauriConfigurationPath -Raw |
    ConvertFrom-Json
$Version = $Configuration.version
$Installer = Get-ChildItem -LiteralPath $BundleDirectory -File |
    Where-Object { $_.Name -eq "ORION Field_${Version}_x64-setup.exe" } |
    Select-Object -First 1

if ($null -eq $Installer) {
    throw "Instalador da versão $Version não encontrado em $BundleDirectory."
}

$SignaturePath = "$($Installer.FullName).sig"
if (-not (Test-Path -LiteralPath $SignaturePath)) {
    throw "Assinatura do atualizador não encontrada: $SignaturePath"
}

$EncodedAssetName = [Uri]::EscapeDataString($Installer.Name)
$Manifest = [ordered]@{
    version = $Version
    notes = $ReleaseNotes
    pub_date = (Get-Date).ToUniversalTime().ToString("o")
    platforms = [ordered]@{
        "windows-x86_64" = [ordered]@{
            signature = (Get-Content -LiteralPath $SignaturePath -Raw).Trim()
            url = "https://github.com/henriqesl/orion-mikrotik-field-assistant/releases/download/v$Version/$EncodedAssetName"
        }
    }
}

$ManifestPath = Join-Path $BundleDirectory "latest.json"
$ManifestJson = $Manifest | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText(
    $ManifestPath,
    $ManifestJson,
    [System.Text.UTF8Encoding]::new($false)
)
Write-Output "Manifesto criado: $ManifestPath"
