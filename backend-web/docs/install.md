# Install Guide

Panduan install tooling Windows 11 + PowerShell. Setelah selesai, lanjut ke section "Run lokal" di [../README.md](../README.md).

Untuk ringkasan stack, env, dan cara run setelah tooling siap, baca README.

## Pilih jalur

| Jalur | Kapan |
|---|---|
| **Native** | Belum bisa pasang Docker Desktop. Install Node + MongoDB + Memurai + ffmpeg langsung di host. |
| **Docker Compose** | Docker Desktop sudah disetujui. Mongo + Redis + API jalan dalam container. |

Jangan dicampur — port 27017/6379 bakal bentrok.

## Jalur A — Native

PowerShell **as Administrator**:

```powershell
winget install OpenJS.NodeJS.LTS         # Node 20 LTS + npm
winget install MongoDB.Server            # service MongoDB :27017 auto-start
winget install Memurai.MemuraiDeveloper  # Redis-compatible :6379 (Redis ga support Windows)
winget install Gyan.FFmpeg               # ffmpeg untuk capture RTSP
```

Tutup & buka ulang PowerShell biar PATH baru ter-load, lalu verifikasi:

```powershell
node -v          # >= v20
npm -v
mongod --version
memurai-cli ping # harus "PONG" (atau redis-cli ping kalau ada)
ffmpeg -version
```

Pastikan service `Running`:

```powershell
Get-Service MongoDB, Memurai
# Kalau Stopped:
Start-Service MongoDB
Start-Service Memurai
```

## Jalur B — Docker Compose

```powershell
winget install Docker.DockerDesktop
winget install OpenJS.NodeJS.LTS
```

Restart laptop setelah Docker Desktop terpasang (perlu WSL 2). Lalu dari folder `backend/`:

```powershell
docker compose up -d
docker compose ps
```

[../docker-compose.yml](../docker-compose.yml) menyalakan: `mongo:7`, `redis:7-alpine`, `backend-web` (build dari Dockerfile), dan **1 worker (inference)**. Worker snapshot/notification/cleanup tidak ada di compose — kalau butuh, jalankan lokal pakai `npm run snapshot-worker:dev` dst.

Kalau Mongo+Redis sudah dari container tapi mau jalankan worker lokal, matikan worker container biar tidak duplikat:
```powershell
docker compose stop worker
```

## SMTP (opsional, untuk email notif)

Untuk Gmail wajib pakai **App Password**, bukan password akun.

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=akun-anda@gmail.com
SMTP_PASS=app-password-16-karakter
SMTP_FROM=akun-anda@gmail.com
```

Test dari API setelah server hidup:
```
POST /api/v1/settings/smtp/test    (super_admin)
```

## Service eksternal `ai/`

`AI_GRPC_TARGET=localhost:50051` menunjuk ke service inference Python di folder `ai/`.

Tanpa AI hidup, REST API tetap start, tapi `POST /api/v1/detection-jobs` akan gagal/retry di worker. Endpoint lain (auth, CRUD camera/area, dashboard) tetap jalan. Aman untuk start dev tanpa AI selama belum sentuh alur inference.

## Troubleshooting install

**`node` / `npm` not recognized**
PATH baru hanya ter-load di terminal sesi baru. Tutup semua, buka ulang.

**PowerShell execution policy menolak `npm`**
Sekali saja (tanpa admin):
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**Port 8080/27017/6379 sudah dipakai**
```powershell
Get-NetTCPConnection -LocalPort 8080,27017,6379 | Select LocalPort, OwningProcess
Get-Process -Id <PID>
```

**Docker: "WSL 2 installation is incomplete"**
PowerShell as admin: `wsl --install`, restart laptop.

**`SETTINGS_ENCRYPTION_KEY must be 64 characters`**
Generate ulang:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Untuk error runtime (Mongo/Redis/gRPC connection refused, ffmpeg not found, dll), lihat tabel troubleshooting di [../README.md](../README.md).
