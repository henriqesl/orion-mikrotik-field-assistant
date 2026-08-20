$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$OrionRoot = Split-Path -Parent $PSScriptRoot
$IconPath = Join-Path $OrionRoot "frontend\src-tauri\icons\icon.png"
$OutputDirectory = Join-Path $OrionRoot "frontend\src-tauri\installer"
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

function New-OrionCanvas {
    param([int]$Width, [int]$Height)
    $Bitmap = [System.Drawing.Bitmap]::new(
        $Width,
        $Height,
        [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
    )
    $Graphics = [System.Drawing.Graphics]::FromImage($Bitmap)
    $Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $Graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
    $Graphics.Clear([System.Drawing.ColorTranslator]::FromHtml("#08111F"))
    return @{ Bitmap = $Bitmap; Graphics = $Graphics }
}

function Save-OrionCanvas {
    param($Canvas, [string]$Path)
    $Canvas.Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Bmp)
    $Canvas.Graphics.Dispose()
    $Canvas.Bitmap.Dispose()
}

$Icon = [System.Drawing.Image]::FromFile($IconPath)
$White = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#F4F7FB"))
$Muted = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#A7B6CA"))
$Blue = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml("#2F7DF6"))
$LinePen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml("#24415F"), 1)
$OrbitPen = [System.Drawing.Pen]::new([System.Drawing.ColorTranslator]::FromHtml("#173454"), 2)

try {
    $Sidebar = New-OrionCanvas -Width 164 -Height 314
    $Sidebar.Graphics.DrawArc($OrbitPen, -54, 172, 230, 230, 198, 122)
    $Sidebar.Graphics.DrawArc($OrbitPen, 66, -42, 150, 150, 84, 168)
    $Sidebar.Graphics.DrawImage($Icon, 42, 35, 80, 80)
    $Sidebar.Graphics.FillRectangle($Blue, 22, 137, 28, 3)
    $Sidebar.Graphics.DrawString("ORION", [System.Drawing.Font]::new("Segoe UI", 20, [System.Drawing.FontStyle]::Bold), $White, 20, 150)
    $Sidebar.Graphics.DrawString("F I E L D", [System.Drawing.Font]::new("Segoe UI", 8, [System.Drawing.FontStyle]::Bold), $Muted, 22, 183)
    $Sidebar.Graphics.DrawLine($LinePen, 22, 215, 142, 215)
    $Sidebar.Graphics.DrawString("MikroTik", [System.Drawing.Font]::new("Segoe UI", 9, [System.Drawing.FontStyle]::Regular), $White, 20, 226)
    $Sidebar.Graphics.DrawString("Field Assistant", [System.Drawing.Font]::new("Segoe UI", 9, [System.Drawing.FontStyle]::Regular), $Muted, 20, 243)
    $Sidebar.Graphics.DrawString("BIONIC", [System.Drawing.Font]::new("Segoe UI", 7, [System.Drawing.FontStyle]::Bold), $Muted, 20, 287)
    Save-OrionCanvas -Canvas $Sidebar -Path (Join-Path $OutputDirectory "sidebar.bmp")

    $Header = New-OrionCanvas -Width 150 -Height 57
    $Header.Graphics.DrawArc($OrbitPen, 102, -34, 84, 84, 96, 190)
    $Header.Graphics.DrawImage($Icon, 9, 9, 38, 38)
    $Header.Graphics.DrawString("ORION FIELD", [System.Drawing.Font]::new("Segoe UI", 10, [System.Drawing.FontStyle]::Bold), $White, 54, 11)
    $Header.Graphics.DrawString("BIONIC", [System.Drawing.Font]::new("Segoe UI", 7, [System.Drawing.FontStyle]::Regular), $Muted, 55, 31)
    Save-OrionCanvas -Canvas $Header -Path (Join-Path $OutputDirectory "header.bmp")
}
finally {
    $Icon.Dispose()
    $White.Dispose()
    $Muted.Dispose()
    $Blue.Dispose()
    $LinePen.Dispose()
    $OrbitPen.Dispose()
}

Write-Host "Ativos do instalador gerados em $OutputDirectory" -ForegroundColor Green
