@echo off
setlocal
title J.A.R.V.I.S. // Iron Man Mode
cd /d "%~dp0"

rem ---- find Python 3.10+ (python on PATH, or the py launcher)
set "PY="
where python >nul 2>nul && python -c "import sys; sys.exit(0 if sys.version_info>=(3,10) else 1)" >nul 2>nul && set "PY=python"
if not defined PY (
  where py >nul 2>nul && py -3 -c "import sys; sys.exit(0 if sys.version_info>=(3,10) else 1)" >nul 2>nul && set "PY=py -3"
)
if not defined PY goto :nopython

rem ---- first run: private environment + dependencies
if not exist ".venv\Scripts\python.exe" (
  echo.
  echo  [1/2] Creating a private Python environment...
  %PY% -m venv .venv || goto :venvfail
  echo  [2/2] Installing Jarvis ^(about 1 minute^)...
  ".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q --upgrade pip
  ".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q -r requirements.txt || goto :pipfail
)

rem ---- first run: API keys
if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo.
  echo  =====================================================================
  echo    Almost there! Notepad is opening your settings file ^(.env^).
  echo    Paste at least ONE free AI key ^(Gemini or Groq recommended^),
  echo    save, close Notepad, then double-click start.bat again.
  echo    Where to get free keys: see README.md
  echo  =====================================================================
  start "" notepad ".env"
  pause
  exit /b
)

rem ---- keep dependencies in sync after a git pull, then launch
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q -r requirements.txt
".venv\Scripts\python.exe" server.py
pause
exit /b

:nopython
echo.
echo  Python 3.10 or newer is required.
echo  Download it from https://www.python.org/downloads/
echo  IMPORTANT: tick "Add python.exe to PATH" during installation, then run start.bat again.
start "" https://www.python.org/downloads/
pause
exit /b 1

:venvfail
echo  Could not create the Python environment. Try running start.bat again.
pause
exit /b 1

:pipfail
echo  Installing dependencies failed. Check your internet connection and run start.bat again.
rmdir /s /q .venv
pause
exit /b 1
