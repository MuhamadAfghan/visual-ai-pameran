<#
.SYNOPSIS
  Kirim working tree visual-ai-pameran ke node aiGeni (GB10) lewat SSH.

.DESCRIPTION
  Bikin tarball dari repo (tanpa node_modules/dist/venv/.git), scp ke server,
  lalu extract di sana. File .env dan backend-web/temp/*.mp4 IKUT dikirim
  walaupun gitignored, karena keduanya dibutuhkan buat demo.

.EXAMPLE
  .\deploy-aigeni.ps1 -User altos
  .\deploy-aigeni.ps1 -User altos -Dest /home/altos/apps/visual-ai-pameran
  .\deploy-aigeni.ps1 -User altos -DryRun
#>
param(
  [Parameter(Mandatory = $true)][string]$User,
  [string]$Server = "192.140.225.174",
  [string]$Dest   = "/home/altos/visual-ai-pameran",
  [int]$Port      = 22,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot
$Bundle   = Join-Path $env:TEMP "visual-ai-pameran.tar.gz"

$excludes = @(
  "--exclude=./.git"
  "--exclude=node_modules"
  "--exclude=dist"
  "--exclude=.venv"
  "--exclude=venv"
  "--exclude=__pycache__"
  "--exclude=*.egg-info"
  "--exclude=.pytest_cache"
  "--exclude=.mypy_cache"
  "--exclude=.ruff_cache"
  "--exclude=tsconfig.tsbuildinfo"
  "--exclude=*.log"
)

Write-Host "==> Packing $RepoRoot -> $Bundle" -ForegroundColor Cyan
Push-Location $RepoRoot
try {
  if (Test-Path $Bundle) { Remove-Item $Bundle -Force }
  & tar -czf $Bundle @excludes .
  if ($LASTEXITCODE -ne 0) { throw "tar gagal (exit $LASTEXITCODE)" }
} finally {
  Pop-Location
}
$sizeMb = [math]::Round((Get-Item $Bundle).Length / 1MB, 1)
Write-Host "    bundle: $sizeMb MB" -ForegroundColor Green

if ($DryRun) {
  Write-Host "==> DryRun: berhenti di sini. Bundle ada di $Bundle" -ForegroundColor Yellow
  exit 0
}

$target = "$User@$Server"

Write-Host "==> Bikin folder tujuan di server: $Dest" -ForegroundColor Cyan
& ssh -p $Port $target "mkdir -p '$Dest'"
if ($LASTEXITCODE -ne 0) { throw "ssh mkdir gagal" }

Write-Host "==> Upload bundle" -ForegroundColor Cyan
& scp -P $Port $Bundle "${target}:/tmp/visual-ai-pameran.tar.gz"
if ($LASTEXITCODE -ne 0) { throw "scp gagal" }

Write-Host "==> Extract di server" -ForegroundColor Cyan
& ssh -p $Port $target "tar -xzf /tmp/visual-ai-pameran.tar.gz -C '$Dest' && rm -f /tmp/visual-ai-pameran.tar.gz && ls -la '$Dest'"
if ($LASTEXITCODE -ne 0) { throw "extract gagal" }

Write-Host ""
Write-Host "==> Selesai. Kode ada di ${target}:$Dest" -ForegroundColor Green
Write-Host "    Cek dulu runtime-nya sebelum build:" -ForegroundColor Yellow
Write-Host "      ssh $target 'uname -m; docker version; nvidia-smi'"
