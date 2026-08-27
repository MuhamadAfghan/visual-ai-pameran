# Start fake RTSP streams untuk testing tanpa kamera asli.
#
# Workflow:
#   1. MediaMTX listen di :8554 (RTSP server)
#   2. FFmpeg push tiap source ke path RTSP sendiri (loop)
#   3. Backend connect ke rtsp://localhost:8554/<path>
#
# Streams:
#   temp/office.mp4              -> rtsp://localhost:8554/office-cam               (file, di $Streams)
#   temp/plant.mp4               -> rtsp://localhost:8554/plant-cam                (file, di $Streams)
#   temp/construction_workers.mp4 -> rtsp://localhost:8554/construction-workers-cam (file, di $Streams)
#   temp/construction_site.mp4    -> rtsp://localhost:8554/construction-site-cam    (file, di $Streams)
#   temp/construction_ppe.mp4     -> rtsp://localhost:8554/construction-ppe-cam     (file, di $Streams)
#   webcam C920 (eksternal) -> rtsp://localhost:8554/webcam-external  (by-name)
#
# Webcam: device dipilih by NAMA (lihat $WebcamMap di blok "Auto-detect kamera"),
# bukan by urutan deteksi. Webcam laptop built-in sengaja TIDAK dipush. Nama PATH
# HARUS cocok dengan rtspUrl kamera di DB backend. Backend yang authoritative atas
# config kamera — kalau ubah path di sini, ubah juga rtspUrl kamera di DB.
#
# File stream ditambah manual di $Streams: @{ Path = "..."; Source = "<file>" }
# Cek device manual: ffmpeg -list_devices true -f dshow -i dummy
#
# MediaMTX binary resolution:
#   $env:MEDIAMTX_PATH > ~\Tools\mediamtx\mediamtx.exe > mediamtx.exe di PATH
#
# Stop dengan: scripts\dev\stop-fake-rtsp.ps1

$ErrorActionPreference = "Stop"

# Resolve paths

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$RepoDir = Split-Path -Parent $BackendDir
$ConfigPath = Join-Path $ScriptDir "mediamtx-fake.yml"

# Stream definitions: tiap entry = 1 RTSP path dengan source-nya.
# File-based streams di-list eksplisit di sini. Webcam TIDAK di-hardcode lagi:
# semua kamera dshow yang terdeteksi diisi otomatis ke path stabil
# webcam-1, webcam-2, ... (lihat blok "Auto-detect kamera" di bawah).
$Streams = @(
    @{ Path = "office-cam";              Source = (Join-Path $BackendDir "temp\office.mp4") }
    @{ Path = "plant-cam";               Source = (Join-Path $BackendDir "temp\plant.mp4") }
    @{ Path = "road-cam";                Source = (Join-Path $BackendDir "temp\road.mp4") }
    @{ Path = "street-cam";              Source = (Join-Path $BackendDir "temp\street.mp4") }
    @{ Path = "stairs-cam";              Source = (Join-Path $BackendDir "temp\stairs.mp4") }
    @{ Path = "stairs-people-cam";       Source = (Join-Path $BackendDir "temp\stairs_people.mp4") }
    @{ Path = "use-phone-4-cam";         Source = (Join-Path $BackendDir "temp\use_phone_4.MOV") }
    @{ Path = "construction-workers-cam"; Source = (Join-Path $BackendDir "temp\construction_workers.mp4") }
    @{ Path = "construction-site-cam";    Source = (Join-Path $BackendDir "temp\construction_site.mp4") }
    @{ Path = "construction-ppe-cam";     Source = (Join-Path $BackendDir "temp\construction_ppe.mp4") }
)

$videoExts = @(".mp4", ".mov", ".mkv", ".webm", ".avi", ".ts", ".flv")

# Build ffmpeg push args based on source type (video loop vs image loop).
function Get-FfmpegPushArgs {
    param([string]$SourcePath, [string]$RtspUrl)

    $ext = [System.IO.Path]::GetExtension($SourcePath).ToLower()
    $isVideo = $videoExts -contains $ext

    if ($isVideo) {
        # Loop video infinitely; re-encode untuk smooth loop + lepas audio.
        # DEV: downscale ke 640px lebar + cap 10fps + preset ultrafast supaya 1 mesin
        # bisa meng-encode banyak stream sekaligus tanpa CPU mentok. Deteksi YOLO
        # jalan di ~640px jadi tidak ada kualitas yang hilang. -g 10 @10fps =
        # keyframe tiap ~1s supaya captureRtspFrame cepat dapat frame.
        return @(
            "-loglevel", "warning",
            "-stream_loop", "-1",
            "-re",
            "-i", "`"$SourcePath`"",
            "-an",
            "-vf", "scale=640:-2",
            "-r", "10",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-tune", "zerolatency",
            "-g", "10",
            "-keyint_min", "10",
            "-preset", "ultrafast",
            "-f", "rtsp",
            $RtspUrl
        )
    }
    else {
        return @(
            "-loglevel", "warning",
            "-loop", "1",
            "-re",
            "-i", "`"$SourcePath`"",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-r", "5",
            "-g", "10",
            "-tune", "zerolatency",
            "-f", "rtsp",
            $RtspUrl
        )
    }
}

# Build ffmpeg push args untuk kamera asli via DirectShow (live, no loop/-re).
# -rtbufsize biar frame webcam tidak di-drop saat encode; -g 6 supaya
# captureRtspFrame cepat dapat keyframe (sama seperti branch video).
function Get-FfmpegDshowArgs {
    param([string]$DeviceName, [string]$RtspUrl)

    return @(
        "-loglevel", "warning",
        "-f", "dshow",
        "-rtbufsize", "100M",
        "-i", "video=`"$DeviceName`"",
        "-an",
        "-vf", "scale=640:-2",
        "-r", "10",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-tune", "zerolatency",
        "-g", "10",
        "-keyint_min", "10",
        "-preset", "ultrafast",
        "-f", "rtsp",
        $RtspUrl
    )
}

# Enumerate kamera dshow yang tersedia di sistem.
# ffmpeg menulis daftar device ke stderr lalu exit non-zero (by design). Kita
# jalankan lewat `cmd /c "... 2>&1"` supaya stderr digabung ke stdout di level
# cmd — menghindari wrapping ErrorRecord PowerShell 5.1 (yang dengan
# $ErrorActionPreference=Stop bisa throw, dan dengan SilentlyContinue malah
# menelan output jadi kosong). Regex menangkap nama di antara kutip yang
# diakhiri "(video)" — cocok untuk format lama "[dshow @ ...]" maupun
# baru "[in#0 @ ...]".
function Get-DshowVideoDevices {
    $raw = cmd /c "ffmpeg -hide_banner -list_devices true -f dshow -i dummy 2>&1"
    $names = @()
    foreach ($line in ($raw -split "`r?`n")) {
        if ($line -match '"([^"]+)"\s+\(video\)') {
            $names += $Matches[1]
        }
    }
    return , $names
}

# Validate sources exist

foreach ($s in $Streams) {
    if ($s.Device) { continue }  # device live, tidak ada file untuk dicek
    if (-not (Test-Path $s.Source)) {
        Write-Error "Source tidak ditemukan: $($s.Source)"
        exit 1
    }
}

# MediaMTX binary lookup

function Find-MediaMTX {
    if ($env:MEDIAMTX_PATH -and (Test-Path $env:MEDIAMTX_PATH)) {
        return $env:MEDIAMTX_PATH
    }
    $defaultPath = Join-Path $env:USERPROFILE "Tools\mediamtx\mediamtx.exe"
    if (Test-Path $defaultPath) {
        return $defaultPath
    }
    $inPath = Get-Command mediamtx.exe -ErrorAction SilentlyContinue
    if ($inPath) {
        return $inPath.Source
    }
    return $null
}

$MediaMTXPath = Find-MediaMTX
if (-not $MediaMTXPath) {
    Write-Error @"
MediaMTX tidak ditemukan. Install dulu:
  1. Download dari https://github.com/bluenviron/mediamtx/releases/latest
  2. Extract ke `$env:USERPROFILE\Tools\mediamtx\`
  3. Atau set `$env:MEDIAMTX_PATH ke path mediamtx.exe Anda
"@
    exit 1
}

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    Write-Error "ffmpeg tidak ada di PATH. Install FFmpeg dulu."
    exit 1
}

# Auto-detect kamera: cocokkan NAMA device dshow ke path webcam yang DIHARAPKAN
# backend (lihat $WebcamMap). Pemetaan by-name -- urutan deteksi tidak relevan.
# Nama PATH harus tetap cocok dengan rtspUrl kamera di DB backend -- itu kontrak
# eksplisit antara fake-RTSP dan backend. JANGAN ubah daftar ini tanpa ikut
# mengubah rtspUrl kamera di DB (backend yang authoritative atas config kamera).
#
# Cek nilai di DB: GET /api/v1/cameras -> field rtspUrl (mis. ".../webcam-external").
# Map pola NAMA device -> path RTSP stabil. Pemetaan by-NAME (bukan by urutan
# deteksi) supaya device yang benar selalu masuk ke path yang benar, berapa pun
# urutan dshow meng-enumerate. HANYA device yang cocok yang di-push: webcam
# laptop built-in (mis. "HP Wide Vision") sengaja TIDAK didaftarkan -- kita pakai
# webcam eksternal saja. Path HARUS cocok dengan rtspUrl kamera di DB
# (webcam-01 "Webcam C920 (external)" -> .../webcam-external). Backend
# authoritative atas config kamera -- kalau ubah path di sini, ubah juga di DB.
$WebcamMap = @(
    @{ Match = "C920"; Path = "webcam-external" }
)

Write-Host "Detecting dshow video devices..." -ForegroundColor Cyan
$cameras = Get-DshowVideoDevices
if ($cameras.Count -eq 0) {
    Write-Host "  (tidak ada kamera terdeteksi; lanjut dengan file streams saja)" -ForegroundColor DarkYellow
}
else {
    $usedDevices = @()
    foreach ($m in $WebcamMap) {
        $dev = $cameras | Where-Object { $_ -like "*$($m.Match)*" } | Select-Object -First 1
        if ($dev) {
            $Streams += @{ Path = $m.Path; Device = $dev }
            $usedDevices += $dev
            Write-Host ("  {0,-28} -> rtsp://localhost:8554/{1}" -f $dev, $m.Path)
        }
        else {
            Write-Host "  (device cocok '$($m.Match)' tidak ditemukan; path '$($m.Path)' jadi kamera offline)" -ForegroundColor DarkYellow
        }
    }
    $unused = $cameras | Where-Object { $usedDevices -notcontains $_ }
    if ($unused) {
        Write-Host "  (device tidak dipakai: $($unused -join ', '))" -ForegroundColor DarkYellow
    }
}

# Stop any leftover processes

$existing = Get-Process mediamtx, ffmpeg -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Killing existing mediamtx/ffmpeg processes ($($existing.Count))..." -ForegroundColor Yellow
    $existing | Stop-Process -Force
    Start-Sleep -Seconds 1
}

# Start MediaMTX

Write-Host "[1/2] Starting MediaMTX..." -ForegroundColor Cyan
Write-Host "  binary : $MediaMTXPath"
Write-Host "  config : $ConfigPath"

$mediamtxLog = Join-Path $env:TEMP "mediamtx-fake.log"
$mediamtxErr = Join-Path $env:TEMP "mediamtx-fake.err.log"
$mediamtxProc = Start-Process -FilePath $MediaMTXPath -ArgumentList "`"$ConfigPath`"" `
    -RedirectStandardOutput $mediamtxLog -RedirectStandardError $mediamtxErr `
    -PassThru -WindowStyle Hidden

Start-Sleep -Seconds 2

if ($mediamtxProc.HasExited) {
    Write-Host "  [FAIL] MediaMTX exit. Logs:" -ForegroundColor Red
    if (Test-Path $mediamtxLog) { Get-Content $mediamtxLog }
    if (Test-Path $mediamtxErr) { Get-Content $mediamtxErr }
    exit 1
}
Write-Host "  [OK] MediaMTX PID=$($mediamtxProc.Id), RTSP listening on :8554"

# Start FFmpeg push per stream

Write-Host ""
Write-Host "[2/2] Starting FFmpeg push ($($Streams.Count) streams)..." -ForegroundColor Cyan

$pids = @($mediamtxProc.Id)
$started = @()

foreach ($s in $Streams) {
    $rtspUrl = "rtsp://localhost:8554/$($s.Path)"
    if ($s.Device) {
        $ffmpegArgs = Get-FfmpegDshowArgs -DeviceName $s.Device -RtspUrl $rtspUrl
        $sourceLabel = "dshow:$($s.Device)"
    }
    else {
        $ffmpegArgs = Get-FfmpegPushArgs -SourcePath $s.Source -RtspUrl $rtspUrl
        $sourceLabel = $s.Source
    }

    $safe = $s.Path -replace '[^a-zA-Z0-9_-]', '_'
    $ffmpegLog = Join-Path $env:TEMP "ffmpeg-fake-$safe.log"
    $ffmpegErr = Join-Path $env:TEMP "ffmpeg-fake-$safe.err.log"

    $ffmpegProc = Start-Process -FilePath "ffmpeg" -ArgumentList $ffmpegArgs `
        -RedirectStandardOutput $ffmpegLog -RedirectStandardError $ffmpegErr `
        -PassThru -WindowStyle Hidden

    Start-Sleep -Seconds 3

    if ($ffmpegProc.HasExited) {
        Write-Host "  [FAIL] push $($s.Path) exit. Logs:" -ForegroundColor Red
        if (Test-Path $ffmpegErr) { Get-Content $ffmpegErr -Tail 20 }
        # Kill everything started so far
        foreach ($id in $pids) { Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
        exit 1
    }

    Write-Host "  [OK] $rtspUrl  <-  $sourceLabel  (PID=$($ffmpegProc.Id))"
    $pids += $ffmpegProc.Id
    $started += $rtspUrl
}

# Save PIDs for stop script

$pidFile = Join-Path $env:TEMP "fake-rtsp.pids"
($pids -join "`n") | Set-Content $pidFile

# Done

Write-Host ""
Write-Host "Fake RTSP streams are live." -ForegroundColor Green
foreach ($url in $started) { Write-Host "  $url" }
Write-Host "  PIDs : $($pids -join ', ')"
Write-Host ""
Write-Host "Stop:"
Write-Host "  scripts\dev\stop-fake-rtsp.ps1"
