@echo off
setlocal
title J.A.R.V.I.S. // Iron Man Mode
cd /d "%~dp0"

rem Everything (Python, packages, Ollama, the offline AI model, settings) is installed by setup.ps1.
rem Already-installed parts are skipped, so this is fast after the first run.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
if errorlevel 2 ( pause & exit /b )
if errorlevel 1 ( echo. & echo  Setup did not finish - see the message above. & pause & exit /b 1 )

".venv\Scripts\python.exe" server.py
pause
