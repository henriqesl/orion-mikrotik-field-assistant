param(
    [string]$CertificateSubject = "CN=BIONIC ORION Internal Code Signing"
)

$ErrorActionPreference = "Stop"
$OrionRoot = Split-Path -Parent $PSScriptRoot
$FrontendDirectory = Join-Path $OrionRoot "frontend"
$TauriCommand = Join-Path $FrontendDirectory "node_modules\.bin\tauri.cmd"
$UpdaterSigningDirectory = Join-Path (
    [Environment]::GetFolderPath("LocalApplicationData")
) "BIONIC\ORION Field\signing"
$UpdaterPrivateKey = Join-Path $UpdaterSigningDirectory "orion-updater.key"
$UpdaterProtectedPassword = Join-Path $UpdaterSigningDirectory "orion-updater-password.dpapi"
$Certificate = Get-ChildItem Cert:\CurrentUser\My |
    Where-Object {
        $_.Subject -eq $CertificateSubject -and
        $_.HasPrivateKey -and
        $_.NotAfter -gt (Get-Date)
    } |
    Sort-Object NotAfter -Descending |
    Select-Object -First 1

if ($null -eq $Certificate) {
    throw "Certificado interno BIONIC com chave privada não encontrado."
}
if (-not (Test-Path -LiteralPath $TauriCommand)) {
    throw "Tauri CLI não encontrado. Execute npm install no frontend."
}
if (-not (Test-Path -LiteralPath $UpdaterPrivateKey) -or
    -not (Test-Path -LiteralPath $UpdaterProtectedPassword)) {
    throw "Chave privada do atualizador não encontrada. Consulte docs/RELEASE.md."
}

$SecureUpdaterPassword = Get-Content -LiteralPath $UpdaterProtectedPassword |
    ConvertTo-SecureString
$UpdaterPassword = [System.Net.NetworkCredential]::new(
    "",
    $SecureUpdaterPassword
).Password

$env:ORION_SIGNING_CERT_THUMBPRINT = $Certificate.Thumbprint
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -LiteralPath $UpdaterPrivateKey -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $UpdaterPassword
$SigningConfiguration = @{
    bundle = @{
        windows = @{
            certificateThumbprint = $Certificate.Thumbprint
            digestAlgorithm = "sha256"
            timestampUrl = "http://timestamp.digicert.com"
        }
    }
} | ConvertTo-Json -Depth 4 -Compress
$TemporaryConfiguration = [System.IO.Path]::ChangeExtension(
    [System.IO.Path]::GetTempFileName(),
    ".json"
)
[System.IO.File]::WriteAllText(
    $TemporaryConfiguration,
    $SigningConfiguration,
    [System.Text.UTF8Encoding]::new($false)
)

Push-Location $FrontendDirectory
try {
    & $TauriCommand build --config $TemporaryConfiguration
    if ($LASTEXITCODE -ne 0) {
        throw "Não foi possível gerar o instalador assinado do ORION Field."
    }
    & (Join-Path $PSScriptRoot "create-update-manifest.ps1")
}
finally {
    Remove-Item -LiteralPath $TemporaryConfiguration -Force -ErrorAction SilentlyContinue
    Remove-Item Env:\ORION_SIGNING_CERT_THUMBPRINT -ErrorAction SilentlyContinue
    Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:\TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
    Pop-Location
}
