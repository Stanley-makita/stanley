$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCommand) {
    $pythonCommand = Get-Command py -ErrorAction SilentlyContinue
}

if (-not $pythonCommand) {
    throw "Python não foi encontrado. Instale Python 3.11+ para executar o Flask."
}

if ($pythonCommand.Name -eq "py.exe") {
    py -m pip install -r requirements.txt
    py backend/app.py
} else {
    python -m pip install -r requirements.txt
    python backend/app.py
}
