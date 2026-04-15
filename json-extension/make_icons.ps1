Add-Type -AssemblyName System.Drawing

$iconSrc = 'C:\Users\wulz\.gemini\antigravity\brain\aaf46c5c-8df6-467b-8426-4ebc7ad92d1e\icon128_1776225190525.png'
$iconDir = 'd:\awebsite_projects\tools\json-extension\icons'

New-Item -ItemType Directory -Force -Path $iconDir | Out-Null

$img = [System.Drawing.Image]::FromFile($iconSrc)

$sizes = @(16, 48, 128)
foreach ($sz in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap($sz, $sz)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $sz, $sz)
    $g.Dispose()
    $outPath = [System.IO.Path]::Combine($iconDir, "icon$sz.png")
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Saved $outPath"
}

$img.Dispose()
Write-Host "Done."
