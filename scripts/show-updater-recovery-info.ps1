param(
    [switch]$ConfirmExposure
)

$ErrorActionPreference = "Stop"
if (-not $ConfirmExposure) {
    throw "Esta operação revela a senha da chave. Execute novamente com -ConfirmExposure em ambiente privado."
}

$SigningDirectory = Join-Path (
    [Environment]::GetFolderPath("LocalApplicationData")
) "BIONIC\ORION Field\signing"
$PrivateKey = Join-Path $SigningDirectory "orion-updater.key"
$ProtectedPassword = Join-Path $SigningDirectory "orion-updater-password.dpapi"

if (-not (Test-Path -LiteralPath $PrivateKey) -or
    -not (Test-Path -LiteralPath $ProtectedPassword)) {
    throw "Material de assinatura do updater não encontrado nesta conta do Windows."
}

$SecurePassword = Get-Content -LiteralPath $ProtectedPassword |
    ConvertTo-SecureString
$Password = [System.Net.NetworkCredential]::new("", $SecurePassword).Password

Write-Warning "Não envie estes dados por e-mail, chat ou junto com o instalador."
Write-Output "Chave privada: $PrivateKey"
Write-Output "Senha da chave: $Password"
