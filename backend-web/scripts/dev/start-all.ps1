# Start the CCTV Insight dev stack — LEAN and idempotent.
#
# Beda dengan "npm run dev:full":
#   - Membersihkan stack lama dulu (backend/MediaMTX/ffmpeg) -> tidak menumpuk
#     (penyebab lag: dev:full dijalankan berkali-kali tanpa stop bersih).
#   - Hanya start pusher yang DIPAKAI: road/plant/stairs (file) + C920 webcam.
#     Stream tak terpakai (office/street/stairs-people) & webcam laptop dilewati.
#   - Webcam C920 TIDAK fail-fast: kalau tidak ada, lanjut tanpa mematikan stream lain.
#   - Backend jalan TANPA "tsx watch" (watch rusak di OneDrive).
#   - AI (gRPC :50051) & Vite (:5173) hanya distart kalau belum jalan.
#
# Pakai (dari folder backend):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\dev\start-all.ps1
#   ... -NoFrontend   (jangan start Vite)
#   ... -NoAI         (jangan start AI service)
#
# Matikan dengan: scripts\dev\stop-all.ps1

param(
    [switch]$NoFrontend,
    [switch]$NoAI
)

$ErrorActionPreference = "Continue"

$ScriptDir   = $PSScriptRoot
$BackendDir  = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$RepoDir     = Split-Path -Parent $BackendDir
$FrontendDir = Join-Path $RepoDir "frontend"
$AIDir       = Join-Path $RepoDir "ai"
$AIScript    = Join-Path $AIDir "scripts\run_grpc_service.ps1"
$ConfigPath  = Join-Path $ScriptDir "mediamtx-fake.yml"
$TempDir     = Join-Path $BackendDir "temp"
$T           = $env:TEMP

function Test-Port([int]$Port) {
    [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}
function Find-MediaMTX {
    if ($env:MEDIAMTX_PATH -and (Test-Path $env:MEDIAMTX_PATH)) { return $env:MEDIAMTX_PATH }
    $d = Join-Path $env:USERPROFILE "Tools\mediamtx\mediamtx.exe"
    if (Test-Path $d) { return $d }
    $c = Get-Command mediamtx.exe -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    return $null
}

Write-Host "=== Start CCTV Insight dev stack (lean) ===" -ForegroundColor Cyan

# ── 0. Bersihkan stack lama (cegah menumpuk). AI & Vite TIDAK disentuh. ─────────
Write-Host "[0] Membersihkan stack lama (backend/MediaMTX/ffmpeg)..." -ForegroundColor Cyan
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -and ($_.CommandLine -match 'dev:full' -or $_.CommandLine -match 'concurrently' -or $_.CommandLine -match 'run rtsp')
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -and $_.CommandLine -notmatch '\\frontend\\' -and $_.CommandLine -notmatch '\\vite\\' -and ($_.CommandLine -match 'server\.ts' -or $_.CommandLine -match 'tsx.*watch')
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-Process -Name mediamtx -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
$r = @(Get-Process -Name ffmpeg -ErrorAction SilentlyContinue).Count
for ($i = 1; $i -le 4 -and $r -gt 0; $i++) {
    Get-Process -Name ffmpeg -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $r = @(Get-Process -Name ffmpeg -ErrorAction SilentlyContinue).Count
}
Write-Host ("  bersih (ffmpeg sisa: {0})" -f $r)

# ── 1. AI gRPC service (:50051) — hanya kalau belum jalan ──────────────────────
if (-not $NoAI) {
    if (Test-Port 50051) {
        Write-Host "[1] AI service sudah jalan (:50051) - dilewati." -ForegroundColor DarkGray
    }
    elseif (Test-Path $AIScript) {
        Write-Host "[1] Start AI service (:50051)..." -ForegroundColor Cyan
        $aiArgs = @{
            FilePath         = "powershell.exe"
            ArgumentList     = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $AIScript)
            WorkingDirectory = $AIDir
            WindowStyle      = "Minimized"
        }
        Start-Process @aiArgs | Out-Null
        Write-Host "  (AI butuh beberapa detik untuk load model)"
    }
    else {
        Write-Host "[1] AI script tidak ditemukan: $AIScript" -ForegroundColor Yellow
    }
}

# ── 2. MediaMTX (:8554) ────────────────────────────────────────────────────────
Write-Host "[2] Start MediaMTX (:8554)..." -ForegroundColor Cyan
$MediaMTX = Find-MediaMTX
if (-not $MediaMTX) { Write-Host "  [FAIL] MediaMTX tidak ditemukan (set MEDIAMTX_PATH)" -ForegroundColor Red; exit 1 }
$mtxArgs = @{
    FilePath               = $MediaMTX
    ArgumentList           = $ConfigPath
    RedirectStandardOutput = (Join-Path $T "mtx.out.log")
    RedirectStandardError  = (Join-Path $T "mtx.err.log")
    PassThru               = $true
    WindowStyle            = "Hidden"
}
$m = Start-Process @mtxArgs
Start-Sleep -Seconds 2
if ($m.HasExited) { Write-Host "  [FAIL] MediaMTX exit" -ForegroundColor Red; Get-Content (Join-Path $T "mtx.err.log") -Tail 8; exit 1 }
Write-Host ("  [OK] MediaMTX PID={0}" -f $m.Id)

# ── 3. Pusher: 3 file aktif + C920 (webcam tolerant) ───────────────────────────
Write-Host "[3] Start pusher (road/plant/stairs + C920)..." -ForegroundColor Cyan
$files = @(
    @{ p = "road-cam";   f = "road.mp4" },
    @{ p = "plant-cam";  f = "plant.mp4" },
    @{ p = "stairs-cam"; f = "stairs.mp4" }
)
foreach ($s in $files) {
    $src = Join-Path $TempDir $s.f
    if (-not (Test-Path $src)) { Write-Host ("  [skip] {0}: file tidak ada" -f $s.p) -ForegroundColor Yellow; continue }
    $pushArgs = @{
        FilePath               = "ffmpeg"
        ArgumentList           = @("-loglevel", "warning", "-stream_loop", "-1", "-re", "-i", ('"' + $src + '"'), "-an", "-vf", "scale=640:-2", "-r", "10", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-tune", "zerolatency", "-g", "10", "-keyint_min", "10", "-preset", "ultrafast", "-f", "rtsp", ("rtsp://localhost:8554/" + $s.p))
        RedirectStandardError  = (Join-Path $T ("ffpush-" + $s.p + ".err.log"))
        RedirectStandardOutput = (Join-Path $T ("ffpush-" + $s.p + ".out.log"))
        PassThru               = $true
        WindowStyle            = "Hidden"
    }
    $pp = Start-Process @pushArgs
    Write-Host ("  [OK] {0,-12} PID={1}" -f $s.p, $pp.Id)
}

# C920 webcam — tolerant: kalau device tak ada / gagal, lanjut saja.
$cam = (& cmd /c "ffmpeg -hide_banner -list_devices true -f dshow -i dummy 2>&1") -join "`n"
if ($cam -match "HD Pro Webcam C920") {
    $webArgs = @{
        FilePath               = "ffmpeg"
        ArgumentList           = @("-loglevel", "warning", "-f", "dshow", "-rtbufsize", "100M", "-pixel_format", "yuyv422", "-video_size", "1280x720", "-framerate", "10", "-i", 'video="HD Pro Webcam C920"', "-an", "-vf", "scale=640:-2", "-r", "10", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-tune", "zerolatency", "-g", "10", "-keyint_min", "10", "-preset", "ultrafast", "-f", "rtsp", "rtsp://localhost:8554/webcam-external")
        RedirectStandardError  = (Join-Path $T "ffpush-webcam-external.err.log")
        RedirectStandardOutput = (Join-Path $T "ffpush-webcam-external.out.log")
        PassThru               = $true
        WindowStyle            = "Hidden"
    }
    $wp = Start-Process @webArgs
    Write-Host ("  [OK] webcam-external (C920) PID={0}" -f $wp.Id)
}
else {
    Write-Host "  [skip] C920 tidak terdeteksi - lanjut tanpa webcam." -ForegroundColor DarkYellow
}
Start-Sleep -Seconds 5

# ── 4. Backend (:8080) TANPA tsx watch ─────────────────────────────────────────
Write-Host "[4] Start backend (:8080, tanpa watch)..." -ForegroundColor Cyan
$beArgs = @{
    FilePath               = "cmd.exe"
    ArgumentList           = @("/c", "npx tsx src/server.ts")
    WorkingDirectory       = $BackendDir
    RedirectStandardOutput = (Join-Path $T "backend.out.log")
    RedirectStandardError  = (Join-Path $T "backend.err.log")
    WindowStyle            = "Hidden"
}
Start-Process @beArgs | Out-Null
Write-Host ("  backend dinyalakan (log: {0}\backend.err.log)" -f $T)

# ── 5. Frontend Vite (:5173) — hanya kalau belum jalan ─────────────────────────
if (-not $NoFrontend) {
    if (Test-Port 5173) {
        Write-Host "[5] Frontend sudah jalan (:5173) - dilewati." -ForegroundColor DarkGray
    }
    else {
        Write-Host "[5] Start frontend Vite (:5173)..." -ForegroundColor Cyan
        $feArgs = @{
            FilePath         = "cmd.exe"
            ArgumentList     = @("/c", "npm run dev")
            WorkingDirectory = $FrontendDir
            WindowStyle      = "Minimized"
        }
        Start-Process @feArgs | Out-Null
        Write-Host "  Vite dinyalakan."
    }
}

# ── Ringkasan ──────────────────────────────────────────────────────────────────
Start-Sleep -Seconds 6
Write-Host ""
Write-Host "=== Status (tunggu ~30s untuk kamera online) ===" -ForegroundColor Cyan
Write-Host ("  AI    :50051 : {0}" -f $(if (Test-Port 50051) { "up" } else { "down" }))
Write-Host ("  MTX   :8554  : {0}" -f $(if (Test-Port 8554) { "up" } else { "down" }))
Write-Host ("  back  :8080  : {0}" -f $(if (Test-Port 8080) { "up" } else { "(boot...)" }))
Write-Host ("  front :5173  : {0}" -f $(if (Test-Port 5173) { "up" } else { "down" }))
Write-Host ("  ffmpeg pusher: {0}" -f @(Get-Process -Name ffmpeg -ErrorAction SilentlyContinue).Count)
Write-Host ""
Write-Host "Buka http://localhost:5173 - kamera online dalam ~30 detik." -ForegroundColor Green
