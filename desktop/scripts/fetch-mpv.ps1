#requires -Version 7.0
$ErrorActionPreference = 'Stop'
$desktopRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$manifestPath = Join-Path $desktopRoot 'mpv-source.json'
$manifest = Get-Content -LiteralPath $manifestPath -Encoding utf8 -Raw | ConvertFrom-Json
$vendorDir = Join-Path $desktopRoot 'vendor/mpv'
New-Item -ItemType Directory -Path $vendorDir -Force | Out-Null
$archivePath = Join-Path $desktopRoot 'vendor/mpv-download.7z'
if (-not (Test-Path -LiteralPath $archivePath)) {
    Invoke-WebRequest -Uri $manifest.source -OutFile $archivePath
}
if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.archiveSha256) {
    throw 'mpv 下载校验失败，请移除 vendor/mpv-download.7z 后重试。'
}
$extractor = Join-Path $desktopRoot 'node_modules/electron-winstaller/vendor/7z.exe'
if (-not (Test-Path -LiteralPath $extractor)) { throw '请先在 desktop 目录安装构建依赖。' }
& $extractor x $archivePath '-y' "-o$vendorDir" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'mpv 解压失败。' }
if ((Get-FileHash -LiteralPath (Join-Path $vendorDir 'mpv.exe') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.executableSha256) {
    throw 'mpv 程序校验失败。'
}
$licenses = @{
    'COPYRIGHT-mpv.txt' = 'https://raw.githubusercontent.com/mpv-player/mpv/accb7b2821/Copyright'
    'LICENSE-GPL-mpv.txt' = 'https://raw.githubusercontent.com/mpv-player/mpv/accb7b2821/LICENSE.GPL'
    'LICENSE-GPLv3-FFmpeg.txt' = 'https://raw.githubusercontent.com/FFmpeg/FFmpeg/8d8c75f2b/COPYING.GPLv3'
}
foreach ($entry in $licenses.GetEnumerator()) {
    Invoke-WebRequest -Uri $entry.Value -OutFile (Join-Path $vendorDir $entry.Key)
}
Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $vendorDir 'manifest.json')
Write-Output 'mpv 来源与 SHA-256 校验完成。'
