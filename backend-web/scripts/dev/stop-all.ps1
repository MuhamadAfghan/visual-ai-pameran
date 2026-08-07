# Stop the CCTV Insight dev stack — SAFELY and in the right order.
#
# Kenapa ada skrip ini: Ctrl+C tidak cukup. MediaMTX + pusher ffmpeg + backend
# sering dijalankan detached (Start-Process / background), jadi tidak dimiliki
# terminal mana pun — Ctrl+C tidak menyentuhnya. Selain itu di Windows Ctrl+C
# sering tidak merambat ke seluruh pohon proses → menyisakan ffmpeg orphan yang
# menumpuk (capture flood). Skrip ini mematikan dalam urutan yang benar.
#
# URUTAN (penting!):
#   1. Backend dulu  -> berhenti men-spawn capture ffmpeg & scheduler.
#   2. MediaMTX       -> putuskan socket RTSP (melepas ffmpeg yang nyangkut).
#   3. Semua ffmpeg   -> pusher + capture + zombie.
#   Kalau dibalik (MediaMTX mati sementara backend hidup), backend menghantam
#   sumber mati -> ffmpeg numpuk -> flood lagi saat shutdown.
#
# TIDAK disentuh: MongoDB, Memurai (Redis), Vite/frontend, AI service (python).
#   - MongoDB & Memurai = service background, biarkan hidup.
#   - Pakai -IncludeFrontend untuk ikut mematikan Vite.
#
# Pakai:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev\stop-all.ps1
#   ... -IncludeFrontend   (ikut matikan Vite/frontend)

param(
    [switch]$IncludeFrontend
)

$ErrorActionPreference = "Continue"

function Get-PortOwners {
    param([int]$Port)
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
}

function Kill-Pid {
    param([int]$ProcessId, [string]$Label)
    try {
        $p = Get-Process -Id $ProcessId -ErrorAction Stop
        Stop-Process -Id $ProcessId -Force -ErrorAction Stop
        Write-Host ("  [killed] {0} (PID {1}, {2})" -f $Label, $ProcessId, $p.ProcessName) -ForegroundColor Green
    } catch {
        Write-Host ("  [skip ] {0} (PID {1}) - {2}" -f $Label, $ProcessId, $_.Exception.Message) -ForegroundColor DarkYellow
    }
}

Write-Host "=== Stop CCTV Insight dev stack ===" -ForegroundColor Cyan

# ── 1. Backend dulu ───────────────────────────────────────────────────────────
Write-Host "[1/3] Stop backend..." -ForegroundColor Cyan

# a) proses yang listen di :8080
foreach ($procId in (Get-PortOwners -Port 8080)) { Kill-Pid -ProcessId $procId -Label "backend :8080" }

# b) proses node milik BACKEND (server.ts / tsx watch / concurrently / dev:full / rtsp)
#    Dipilih lewat command line; frontend (path \frontend\ / vite) sengaja dilewati.
$nodeProcs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
foreach ($n in $nodeProcs) {
    $cmd = $n.CommandLine
    if (-not $cmd) { continue }
    if ($cmd -match '\\frontend\\' -or $cmd -match '\\vite\\') { continue }  # jaga frontend
    if ($cmd -match 'server\.ts' -or
        $cmd -match 'tsx.*watch' -or
        $cmd -match 'concurrently' -or
        $cmd -match 'run dev:full' -or
        $cmd -match 'run rtsp' -or
        $cmd -match '\\cctv-insight\\backend\\') {
        Kill-Pid -ProcessId $n.ProcessId -Label "backend node"
    }
}

# ── 2. MediaMTX (putuskan socket RTSP) ────────────────────────────────────────
Write-Host "[2/3] Stop MediaMTX..." -ForegroundColor Cyan
foreach ($procId in (Get-PortOwners -Port 8554)) { Kill-Pid -ProcessId $procId -Label "MediaMTX :8554" }
Get-Process -Name mediamtx -ErrorAction SilentlyContinue | ForEach-Object { Kill-Pid -ProcessId $_.Id -Label "mediamtx" }
Start-Sleep -Seconds 2  # beri waktu socket putus supaya ffmpeg yang nyangkut lepas

# ── 3. Semua ffmpeg (pusher + capture + zombie) ───────────────────────────────
Write-Host "[3/3] Stop semua ffmpeg..." -ForegroundColor Cyan
$before = @(Get-Process -Name ffmpeg -ErrorAction SilentlyContinue).Count
Write-Host ("  ffmpeg awal: {0}" -f $before)

$remaining = $before
for ($round = 1; $round -le 5 -and $remaining -gt 0; $round++) {
    Get-Process -Name ffmpeg -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $remaining = @(Get-Process -Name ffmpeg -ErrorAction SilentlyContinue).Count
    Write-Host ("  putaran {0}: ffmpeg tersisa = {1}" -f $round, $remaining)
}

# ── Opsional: frontend ────────────────────────────────────────────────────────
if ($IncludeFrontend) {
    Write-Host "[opsional] Stop frontend/Vite..." -ForegroundColor Cyan
    foreach ($procId in (Get-PortOwners -Port 5173)) { Kill-Pid -ProcessId $procId -Label "Vite :5173" }
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match '\\vite\\' -or $_.CommandLine -match '\\frontend\\' } |
        ForEach-Object { Kill-Pid -ProcessId $_.ProcessId -Label "frontend node" }
}

# ── Ringkasan ─────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "=== Ringkasan ===" -ForegroundColor Cyan
$ff = @(Get-Process -Name ffmpeg -ErrorAction SilentlyContinue).Count
$mtx = @(Get-Process -Name mediamtx -ErrorAction SilentlyContinue).Count
$be = @(Get-PortOwners -Port 8080).Count
Write-Host ("  ffmpeg   : {0}" -f $ff)
Write-Host ("  mediamtx : {0}" -f $mtx)
Write-Host ("  :8080    : {0}" -f $(if ($be -gt 0) { "MASIH ada" } else { "bebas" }))

if ($ff -eq 0 -and $mtx -eq 0 -and $be -eq 0) {
    Write-Host "OK: stack berhenti bersih." -ForegroundColor Green
} else {
    Write-Host "PERHATIAN: masih ada sisa." -ForegroundColor Yellow
    if ($ff -gt 0) {
        Write-Host ("  {0} ffmpeg kebal kill (wedged di kernel I/O). Ini sisa bug 'tidak ke-reap'." -f $ff) -ForegroundColor Yellow
        Write-Host "  Biasanya menetes habis sendiri dalam beberapa menit; kalau mengganggu, reboot." -ForegroundColor Yellow
    }
}
Write-Host ""
Write-Host "Catatan: MongoDB & Memurai (Redis) sengaja dibiarkan hidup (service background)." -ForegroundColor DarkGray
