# =============================================================================
#  J.A.R.V.I.S. setup  (called by start.bat - you don't run this yourself)
#  Installs, only if missing:  Python 3.12  ->  Jarvis's packages  ->  settings
#  Then asks for ONE free AI key (first time only) and checks that it works.
# =============================================================================
# 'Continue' on purpose: native tools (pip, winget) print progress on stderr, which must not abort us.
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
trap {
    Write-Host ""
    Write-Host "  SETUP ERROR: $_" -ForegroundColor Red
    Write-Host "  Fix the problem above and double-click start.bat again (finished steps are skipped)." -ForegroundColor Yellow
    exit 1
}
Set-Location -LiteralPath $PSScriptRoot
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

function Say($text, $color = 'Gray') { Write-Host "  $text" -ForegroundColor $color }
function Step($n, $text) { Write-Host ""; Write-Host "  [$n/3] $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "        OK  $text" -ForegroundColor Green }
function Warn($text) { Write-Host "        !!  $text" -ForegroundColor Yellow }

# ---- .env helpers -----------------------------------------------------------
$EnvFile = Join-Path $PSScriptRoot '.env'
function Get-EnvValue($key) {
    if (-not (Test-Path $EnvFile)) { return $null }
    $line = Get-Content $EnvFile | Where-Object { $_ -match "^\s*$key\s*=" } | Select-Object -First 1
    if ($line) { $v = ($line -split '=', 2)[1].Trim(); if ($v) { return $v } }
    return $null
}
function Set-EnvValue($key, $value) {
    $lines = @(); if (Test-Path $EnvFile) { $lines = @(Get-Content $EnvFile) }
    $found = $false
    $lines = @($lines | ForEach-Object { if ($_ -match "^\s*#?\s*$key\s*=") { if (-not $found) { $found = $true; "$key=$value" } } else { $_ } })
    if (-not $found) { $lines += "$key=$value" }
    Set-Content -Path $EnvFile -Value $lines -Encoding ASCII
}

# ---- Python helpers (always a real python.exe - never the 'py' launcher) ------
function Test-Python($p) {
    try {
        $v = & $p -c "import sys; print(sys.version_info[0]*100+sys.version_info[1])" 2>$null
        return ([int]("$v".Trim()) -ge 310)
    } catch { return $false }
}
function Find-Python {
    $c = @()
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -notlike '*WindowsApps*') { $c += $cmd.Source }
    $c += @(Get-ChildItem "$env:LOCALAPPDATA\Programs\Python\Python3*\python.exe", "$env:LOCALAPPDATA\Python\pythoncore-3*\python.exe",
            "$env:ProgramFiles\Python3*\python.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | ForEach-Object { $_.FullName })
    foreach ($p in $c) { if ($p -and (Test-Python $p)) { return $p } }
    return $null
}

# ---- API key helpers ----------------------------------------------------------
$KeyNames = @('GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'MISTRAL_API_KEY', 'GITHUB_TOKEN')
function Key-Provider($k) {
    if ($k -like 'gsk_*') { return 'GROQ_API_KEY' }
    if ($k -like 'sk-or-*') { return 'OPENROUTER_API_KEY' }
    if ($k -like 'ghp_*' -or $k -like 'github_pat_*') { return 'GITHUB_TOKEN' }
    return 'GEMINI_API_KEY'          # Gemini keys start with AIza... or AQ.
}
function Test-Key($envName, $k) {
    # returns 'ok', 'bad' or 'unknown' (no internet / service hiccup -> we accept the key)
    try {
        switch ($envName) {
            'GEMINI_API_KEY' { Invoke-WebRequest "https://generativelanguage.googleapis.com/v1beta/models?key=$k" -UseBasicParsing -TimeoutSec 15 | Out-Null }
            'GROQ_API_KEY' { Invoke-WebRequest 'https://api.groq.com/openai/v1/models' -Headers @{ Authorization = "Bearer $k" } -UseBasicParsing -TimeoutSec 15 | Out-Null }
            'OPENROUTER_API_KEY' { Invoke-WebRequest 'https://openrouter.ai/api/v1/key' -Headers @{ Authorization = "Bearer $k" } -UseBasicParsing -TimeoutSec 15 | Out-Null }
            default { return 'unknown' }
        }
        return 'ok'
    } catch {
        $code = 0
        try { $code = [int]$_.Exception.Response.StatusCode } catch {}
        if ($code -eq 400 -or $code -eq 401 -or $code -eq 403) { return 'bad' }
        return 'unknown'
    }
}

Write-Host ""
Write-Host "  =============================================================" -ForegroundColor DarkCyan
Write-Host "     J.A.R.V.I.S.  //  checking and installing everything" -ForegroundColor Cyan
Write-Host "  =============================================================" -ForegroundColor DarkCyan

# =============================================================================
# 1. Python 3.10+
# =============================================================================
Step 1 'Python'
$py = Find-Python
if (-not $py) {
    Say 'Python not found - installing Python 3.12 (one time, about 1-2 minutes)...' White
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install -e --id Python.Python.3.12 --scope user --silent --accept-package-agreements --accept-source-agreements | Out-Host
    }
    $py = Find-Python
    if (-not $py) {
        $exe = Join-Path $env:TEMP 'python-3.12-installer.exe'
        & curl.exe -L --fail --progress-bar -o $exe 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe'
        if (Test-Path $exe) {
            Start-Process -FilePath $exe -ArgumentList '/quiet', 'InstallAllUsers=0', 'PrependPath=1', 'Include_launcher=0', 'Include_test=0' -Wait
        }
        $py = Find-Python
    }
    if (-not $py) { throw 'Python installation failed. Install Python 3.12 from https://www.python.org/downloads/ (tick "Add python.exe to PATH") and run start.bat again.' }
}
Ok "Python ready"

# =============================================================================
# 2. Private environment + all requirements
# =============================================================================
Step 2 'Jarvis packages'
$venvPy = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPy)) {
    Say 'Creating a private Python environment...'
    & $py -m venv .venv
    if (-not (Test-Path $venvPy)) { throw 'Could not create the Python environment (.venv).' }
}
$reqHash = (Get-FileHash requirements.txt -Algorithm SHA1).Hash
$stamp = Join-Path $PSScriptRoot '.venv\.requirements.sha1'
if (-not (Test-Path $stamp) -or (Get-Content $stamp) -ne $reqHash) {
    Say 'Installing everything Jarvis needs (about 1 minute the first time)...'
    & $venvPy -m pip install --disable-pip-version-check -q --upgrade pip
    & $venvPy -m pip install --disable-pip-version-check -q -r requirements.txt
    if ($LASTEXITCODE -ne 0) { throw 'Package installation failed - check your internet connection and run start.bat again.' }
    Set-Content $stamp $reqHash
}
Ok 'Packages ready'

# =============================================================================
# 3. Settings + your free AI key
# =============================================================================
Step 3 'Your AI key'
if (-not (Test-Path $EnvFile)) { Copy-Item '.env.example' $EnvFile }
$have = @($KeyNames | Where-Object { Get-EnvValue $_ })
if ($have.Count -gt 0) {
    Ok "Key found ($($have -join ', '))"
} else {
    Write-Host ""
    Say 'Jarvis needs ONE free AI key (takes 1 minute, no credit card):' White
    Say '   Gemini:  https://aistudio.google.com/apikey   (sign in with Google -> "Create API key")' White
    Say '   Groq:    https://console.groq.com/keys        (another free option)' White
    Write-Host ""
    for ($try = 1; $try -le 5; $try++) {
        $k = Read-Host '  Paste your key here and press Enter'
        if (-not $k -or -not $k.Trim()) { Warn 'Nothing pasted. Copy your key, then right-click in this window to paste it.'; continue }
        $k = $k.Trim().Trim('"').Trim("'")
        $name = Key-Provider $k
        Say 'Checking the key...'
        $r = Test-Key $name $k
        if ($r -eq 'bad') { Warn 'That key was rejected. Make sure you copied the whole key, then try again.'; continue }
        Set-EnvValue $name $k
        if ($r -eq 'ok') { Ok 'Key works and is saved' } else { Ok 'Key saved (could not verify it right now - that is usually fine)' }
        $have = @($name)
        break
    }
    if ($have.Count -eq 0) {
        Warn 'No working key yet. Opening the settings file: paste your key after GEMINI_API_KEY= , save, and run start.bat again.'
        Start-Process notepad $EnvFile
        exit 2
    }
}

Write-Host ""
Write-Host "  All systems ready. Launching J.A.R.V.I.S. ..." -ForegroundColor Green
exit 0
