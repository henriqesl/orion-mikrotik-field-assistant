param(
    [string]$CertificateSubject = "CN=BIONIC ORION Internal Code Signing"
)

$ErrorActionPreference = "Stop"
$OrionRoot = Split-Path -Parent $PSScriptRoot
$FrontendDirectory = Join-Path $OrionRoot "frontend"
$TauriCommand = Join-Path $FrontendDirectory "node_modules\.bin\tauri.cmd"
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

$env:ORION_SIGNING_CERT_THUMBPRINT = $Certificate.Thumbprint
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
}
finally {
    Remove-Item -LiteralPath $TemporaryConfiguration -Force -ErrorAction SilentlyContinue
    Remove-Item Env:\ORION_SIGNING_CERT_THUMBPRINT -ErrorAction SilentlyContinue
    Pop-Location
}
