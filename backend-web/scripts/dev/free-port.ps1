# Free a TCP port sebelum start backend (dev self-heal).
#
# Kenapa perlu: instance backend lama sering nyangkut menahan port 8080 —
# umum terjadi karena tsx watch di OneDrive tidak clean-exit, jadi proses
# node orphan menumpuk. Akibatnya `tsx watch` baru gagal dengan
# "EADDRINUSE: address already in use :::8080".
#
# Script ini cari proses yang LISTEN di port target lalu kill, supaya start
# berikutnya selalu dapat port bersih. Aman: hanya menyentuh proses yang
# benar-benar memegang port itu (bukan semua node — frontend vite & VSCode
# tidak terganggu).
#
# Dipakai eksplisit lewat `npm run free:port` (lihat package.json), bukan hook
# implicit, biar jelas kapan ia jalan.

param([int]$Port = 8080)

$conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $conns) {
    Write-Host "[free-port] Port $Port sudah bebas." -ForegroundColor DarkGray
    exit 0
}

foreach ($c in ($conns | Sort-Object OwningProcess -Unique)) {
    $procId = $c.OwningProcess
    $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
    $label = if ($p) { "$($p.ProcessName) (PID=$procId)" } else { "PID=$procId" }
    Write-Host "[free-port] Port $Port dipakai $label -> killing..." -ForegroundColor Yellow
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}

# Beri OS waktu melepas socket sebelum bind ulang.
Start-Sleep -Milliseconds 500
Write-Host "[free-port] Port $Port bebas." -ForegroundColor Green
