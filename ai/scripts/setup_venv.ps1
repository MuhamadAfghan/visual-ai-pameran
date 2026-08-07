param(
    [string]$PythonCommand = "python",
    [switch]$SkipTorchReinstall
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$VenvPath = Join-Path $ProjectRoot ".venv"
$VenvPython = Join-Path $VenvPath "Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "[ai] Creating virtual environment at $VenvPath"
    & $PythonCommand -m venv $VenvPath
}

Write-Host "[ai] Upgrading pip"
& $VenvPython -m pip install --upgrade pip

Write-Host "[ai] Installing base dependencies"
& $VenvPython -m pip install -r (Join-Path $ProjectRoot "requirements.txt")

if (-not $SkipTorchReinstall) {
    Write-Host "[ai] Removing existing torch packages"
    & $VenvPython -m pip uninstall -y torch torchvision torchaudio

    Write-Host "[ai] Installing torch + torchvision from CUDA 13.0 index"
    & $VenvPython -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu130
}

Write-Host "[ai] Installing AI package in editable mode"
& $VenvPython -m pip install -e $ProjectRoot

Write-Host "[ai] Virtual environment is ready: $VenvPath"