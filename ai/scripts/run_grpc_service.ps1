param(
    [string]$ListenHost = $env:AI_GRPC_HOST,
    [int]$Port = $(if ($env:AI_GRPC_PORT) { [int]$env:AI_GRPC_PORT } else { 50051 })
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$VenvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
    throw "AI virtual environment not found at $VenvPython. Run scripts/setup_venv.ps1 first."
}

if (-not $ListenHost) {
    $ListenHost = "0.0.0.0"
}

$env:AI_GRPC_HOST = $ListenHost
$env:AI_GRPC_PORT = "$Port"

& $VenvPython (Join-Path $PSScriptRoot "run_grpc_service.py")
