param(
    [Parameter(Mandatory = $true)]
    [string]$Path
)

$ErrorActionPreference = "Stop"
$Thumbprint = $env:ORION_SIGNING_CERT_THUMBPRINT

if ([string]::IsNullOrWhiteSpace($Thumbprint)) {
    Write-Host "Assinatura interna não solicitada; binário mantido sem assinatura."
    exit 0
}

$Certificate = Get-ChildItem "Cert:\CurrentUser\My\$Thumbprint" -ErrorAction SilentlyContinue
if ($null -eq $Certificate -or -not $Certificate.HasPrivateKey) {
    throw "Certificado de assinatura ORION não encontrado na conta atual."
}

$SignTool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" `
    -Recurse `
    -Filter signtool.exe `
    -ErrorAction SilentlyContinue |
    Where-Object FullName -Match "\\x64\\signtool.exe$" |
    Sort-Object FullName -Descending |
    Select-Object -First 1

if ($null -eq $SignTool) {
    throw "SignTool x64 não encontrado no Windows SDK."
}

& $SignTool.FullName sign `
    /sha1 $Thumbprint `
    /fd SHA256 `
    /tr "http://timestamp.digicert.com" `
    /td SHA256 `
    /d "ORION Field" `
    $Path

if ($LASTEXITCODE -ne 0) {
    throw "Não foi possível assinar $Path."
}

& $SignTool.FullName verify /pa /all $Path
if ($LASTEXITCODE -ne 0) {
    throw "A assinatura de $Path não passou na verificação Authenticode."
}

