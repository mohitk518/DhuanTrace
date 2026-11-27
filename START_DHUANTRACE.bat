@echo off
title DhuanTrace
cd /d "%~dp0"
where node
if errorlevel 1 goto nonode
if not exist .env copy .env.example .env
echo.
echo Starting DhuanTrace... the app opens in your browser at http://localhost:8080
echo Keep this window open while you use the app. Close it to stop.
start "" /min cmd /c "timeout /t 3 /nobreak & start http://localhost:8080"
node server.js
pause
exit /b
:nonode
echo.
echo Node.js is not installed on this computer.
echo Opening nodejs.org. Download and install the LTS version, then double-click this file again.
start "" https://nodejs.org/en/download
pause
