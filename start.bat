@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem Start all services without opening backend terminal windows.
rem Runtime output is appended to server\logs\*.log for troubleshooting.
if not exist "%~dp0server\logs" mkdir "%~dp0server\logs" >nul 2>&1
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

netstat -ano | findstr /r ":4000" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
  start "" /b "%PS%" -NoLogo -NoProfile -WindowStyle Hidden -Command "$env:PORT='4000'; Set-Location -LiteralPath '%~dp0netease-api'; node node_modules\NeteaseCloudMusicApi\app.js >> '%~dp0server\logs\netease-api.log' 2>&1"
  timeout /t 3 /nobreak >nul
)

netstat -ano | findstr /r ":3400" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
  start "" /b "%PS%" -NoLogo -NoProfile -WindowStyle Hidden -Command "$env:PORT='3400'; Set-Location -LiteralPath '%~dp0QQMusicApi'; node bin\www >> '%~dp0server\logs\qqmusic-api.log' 2>&1"
  timeout /t 3 /nobreak >nul
)

netstat -ano | findstr /r ":8080" | findstr "LISTENING" >nul 2>&1
if errorlevel 1 (
  start "" /b "%PS%" -NoLogo -NoProfile -WindowStyle Hidden -Command "Set-Location -LiteralPath '%~dp0server'; node index.js >> '%~dp0server\logs\main-server.log' 2>&1"
)

echo LAN Jukebox services started in the background.
echo Logs: %~dp0server\logs\
endlocal
exit /b 0
