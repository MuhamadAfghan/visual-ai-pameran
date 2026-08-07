# Stop fake RTSP stream (MediaMTX + FFmpeg push) yang di-start oleh start-fake-rtsp.ps1.

$ErrorActionPreference = "Stop"

$pidFile = Join-Path $env:TEMP "fake-rtsp.pids"

if (Test-Path $pidFile) {
    $pids = Get-Content $pidFile
    foreach ($p in $pids) {
        if ([string]::IsNullOrWhiteSpace($p)) { continue }
        $proc = Get-Process -Id ([int]$p) -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "Stopping $($proc.Name) (PID=$($proc.Id))..." -ForegroundColor Yellow
            Stop-Process -Id $proc.Id -Force
        }
    }
    Remove-Item $pidFile -Force
} else {
    Write-Host "PID file tidak ada. Kill mediamtx by name (ffmpeg dilewat - mungkin ada instance lain)..." -ForegroundColor Yellow
}

# Fallback: kill leftover mediamtx by name. Ffmpeg jangan dipukul rata, user mungkin punya instance lain.
$leftover = Get-Process mediamtx -ErrorAction SilentlyContinue
if ($leftover) {
    $leftover | Stop-Process -Force
    Write-Host "Stopped leftover MediaMTX." -ForegroundColor Yellow
}

Write-Host "[OK] Done." -ForegroundColor Green
