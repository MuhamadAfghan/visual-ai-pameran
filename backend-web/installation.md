# Installation Guide — `backend-web`

Panduan instalasi end-to-end untuk menjalankan layanan `backend-web` di mesin lokal (Windows 11 + PowerShell sebagai target utama; perintah Linux/macOS dicatat seperlunya).

---

## 1. Gambaran Sistem

`backend-web` adalah service orkestrasi CCTV Detector yang terdiri dari:

- **API server** (Express + TypeScript) — entry point HTTP di port `8080`.
- **4 worker BullMQ** — proses asinkron untuk inference, snapshot, notification, cleanup.
- **MongoDB** — penyimpanan data utama (camera, area, user, detection job, dst).
- **Redis** — backing store BullMQ (queue & job state).
- **gRPC client → `ai`** — service Python eksternal yang melakukan inference YOLO. Wajib hidup di `localhost:50051` agar endpoint inference berfungsi.
- **ffmpeg** — dipakai snapshot worker untuk capture frame RTSP.

Topologi default lokal:

```
client ──HTTP──► API (:8080) ──┬──► MongoDB (:27017)
                               ├──► Redis (:6379)
                               └──► ai gRPC (:50051)
worker ──BullMQ──► Redis
worker ──ffmpeg──► RTSP camera (snapshot)
```

---

## 2. Prasyarat Sistem

- **OS**: Windows 10/11 (panduan ini), atau Linux/macOS dengan padanan perintah.
- **Hak admin**: dibutuhkan untuk install Node.js, MongoDB, Memurai (Redis), ffmpeg, dan opsional Docker Desktop.
- **Disk**: ±2 GB untuk tooling + dependency.
- **Koneksi internet**: untuk download package via winget dan `npm install`.
- **Akses ke service `ai`** (opsional saat awal — lihat §7).

---

## 3. Pilih Jalur Instalasi

| Jalur | Kapan dipilih | Software inti |
|---|---|---|
| **A. Native (rekomendasi saat Docker belum disetujui)** | Anda sudah dapat admin tapi belum bisa pasang Docker Desktop | Node, MongoDB, Memurai (Redis), ffmpeg |
| **B. Docker Compose** | Docker Desktop sudah disetujui & terpasang | Node (untuk dev workflow), Docker Desktop |

Pilih salah satu — **jangan dicampur** (port 27017/6379 akan bentrok).

---

## 4. Jalur A — Native Install

### 4.1 Pasang Tooling

Jalankan **PowerShell as Administrator**:

```powershell
winget install OpenJS.NodeJS.LTS
winget install MongoDB.Server
winget install Memurai.MemuraiDeveloper
winget install Gyan.FFmpeg
```

Catatan paket:
- `OpenJS.NodeJS.LTS` — Node 20 LTS + npm.
- `MongoDB.Server` — daftar Windows service `MongoDB` auto-start di port `27017`.
- `Memurai.MemuraiDeveloper` — Redis-compatible drop-in untuk Windows (Redis tidak resmi mendukung Windows). Daftar Windows service `Memurai` auto-start di port `6379`.
- `Gyan.FFmpeg` — ffmpeg CLI, dibutuhkan snapshot worker untuk capture RTSP.

### 4.2 Verifikasi Tooling

**Tutup & buka ulang PowerShell** agar `PATH` baru ter-load, lalu:

```powershell
node -v          # >= v20.x
npm -v
mongod --version
redis-cli ping   # harus balas "PONG"
ffmpeg -version
```

Jika `redis-cli` belum ada di PATH, Memurai menyediakan `memurai-cli` setara:
```powershell
memurai-cli ping
```

### 4.3 Pastikan Service Berjalan

```powershell
Get-Service MongoDB, Memurai
```

Status keduanya harus `Running`. Kalau ada yang `Stopped`:
```powershell
Start-Service MongoDB
Start-Service Memurai
```

Lanjut ke §6 (Konfigurasi `.env`).

---

## 5. Jalur B — Docker Compose

### 5.1 Pasang Tooling

```powershell
winget install Docker.DockerDesktop
winget install OpenJS.NodeJS.LTS
```

Restart laptop setelah Docker Desktop terpasang (perlu mengaktifkan WSL 2 / Hyper-V).

### 5.2 Verifikasi

```powershell
docker --version
docker compose version
node -v
```

### 5.3 Naikkan Stack

Dari folder backend:

```powershell
docker compose up -d
docker compose ps
```

[docker-compose.yml](docker-compose.yml) akan menyalakan:
- `mongo` (mongo:7) di `:27017`
- `redis` (redis:7-alpine) di `:6379`
- `backend-web` (build dari Dockerfile) di `:8080`
- `worker` (inference worker)

> **Catatan**: compose hanya menjalankan **1 worker** (inference). Worker snapshot/notification/cleanup tidak masuk compose — untuk dev penuh, jalankan worker lain via `npm` secara lokal (lihat §8) atau tambah service di compose.

Lanjut ke §6.

---

## 6. Konfigurasi `.env`

File `.env` sudah disiapkan otomatis dengan secret yang aman:

| Variabel | Nilai | Wajib? |
|---|---|---|
| `MONGODB_URI` | `mongodb://localhost:27017/cctv_detector` | Ya |
| `REDIS_URL` | `redis://localhost:6379` | Ya |
| `AI_GRPC_TARGET` | `localhost:50051` | Ya (validasi startup) |
| `JWT_SECRET` | 64-char hex (sudah digenerate) | Ya, min 8 char |
| `SETTINGS_ENCRYPTION_KEY` | 64-char hex AES-256 (sudah digenerate) | Untuk fitur SMTP |
| `PORT` | `8080` | Default |
| `STORAGE_BASE_PATH` | `./storage` | Default |
| `SMTP_*` | kosong | Hanya jika ingin email notifikasi |

### 6.1 (Opsional) Konfigurasi SMTP

Untuk fitur notifikasi pelanggaran via email, isi blok SMTP di `.env`. Untuk Gmail, gunakan **App Password** (bukan password akun biasa).

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=akun-anda@gmail.com
SMTP_PASS=app-password-16-karakter
SMTP_FROM=akun-anda@gmail.com
```

### 6.2 Peringatan Keamanan: `.env.docker`

File [.env.docker](.env.docker) di repo saat ini **mengandung kredensial SMTP Gmail nyata yang ter-commit**. Sebelum proyek ini di-publish atau di-share:
1. Rotate app password Gmail tersebut.
2. Tambahkan `.env.docker` ke `.gitignore`.
3. Pertimbangkan `git filter-repo` untuk membersihkan riwayatnya.

---

## 7. Service Eksternal: `ai`

`AI_GRPC_TARGET=localhost:50051` menunjuk ke service inference Python di repo terpisah.

**Tanpa `ai` hidup:**
- API REST `backend-web` **tetap start normal** (hanya validasi env, bukan koneksi gRPC).
- Endpoint `POST /api/v1/detection-jobs` akan **gagal saat worker memproses job**.
- Endpoint lain (auth, CRUD camera/area, dashboard) **tetap berfungsi**.

Aman untuk mulai development tanpa `ai` selama Anda tidak menyentuh alur inference.

---

## 8. Setup & Jalankan Proyek

### 8.1 Install Dependency

Dari folder backend:

```powershell
npm install
```

### 8.2 Seed User Dummy

```powershell
npm run seed:dummy-users
```

Output: 3 user terdaftar di MongoDB.

| Role | Email | Password |
|---|---|---|
| super_admin | superadmin@cctv.local | SuperAdmin12345! |
| admin | admin@cctv.local | Admin12345! |
| viewer | guest@cctv.local | Guest12345! |

### 8.3 Jalankan Service

Buka **5 terminal PowerShell terpisah**, semuanya posisi di folder backend, semuanya watch mode:

```powershell
# Terminal 1 — API server (port 8080)
npm run dev

# Terminal 2 — Inference worker (gRPC ke ai)
npm run worker:dev

# Terminal 3 — Snapshot worker (butuh ffmpeg)
npm run snapshot-worker:dev

# Terminal 4 — Notification worker (butuh SMTP config & SETTINGS_ENCRYPTION_KEY)
npm run notification-worker:dev

# Terminal 5 — Cleanup worker
npm run cleanup-worker:dev
```

> Jika Anda pakai Jalur B (Docker) untuk Mongo+Redis, abaikan worker yang sudah jalan di container — atau matikan service `worker` di compose untuk hindari duplikasi: `docker compose stop worker`.

---

## 9. Verifikasi Instalasi

### 9.1 Health Check

```powershell
curl http://localhost:8080/health
```

Harus balas `200 OK`.

### 9.2 Login Test

```powershell
curl -X POST http://localhost:8080/api/v1/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"superadmin@cctv.local\",\"password\":\"SuperAdmin12345!\"}'
```

Respon sukses berisi `token` JWT.

### 9.3 Postman Collection

Repo menyediakan collection siap pakai di [docs/postman/](docs/postman/):
- `backend-web.postman_collection.json` — koleksi endpoint.
- `backend-web.local.postman_environment.json` — environment untuk lokal.

Import keduanya ke Postman.

---

## 10. Operasi Umum

### 10.1 Reset Database (Native)

```powershell
mongosh
> use cctv_detector
> db.dropDatabase()
> exit
npm run seed:dummy-users
```

### 10.2 Reset Database (Docker)

```powershell
docker compose down -v   # -v menghapus volume mongo_data
docker compose up -d
npm run seed:dummy-users
```

### 10.3 Flush Antrian Redis

```powershell
redis-cli FLUSHDB
# atau memurai-cli FLUSHDB
```

### 10.4 Build Production

```powershell
npm run build           # output ke dist/
npm start               # jalankan dari dist (bukan watch)
```

### 10.5 Cek Log Service Windows

```powershell
Get-EventLog -LogName Application -Source MongoDB -Newest 20
```

---

## 11. Troubleshooting

**`node` / `npm` not recognized**
Tutup semua terminal, buka ulang. `PATH` baru hanya ter-load di terminal sesi baru.

**`Error: connect ECONNREFUSED 127.0.0.1:27017`**
MongoDB belum jalan.
- Native: `Get-Service MongoDB` → `Start-Service MongoDB`.
- Docker: `docker compose ps mongo`.

**`Error: connect ECONNREFUSED 127.0.0.1:6379`**
Redis/Memurai belum jalan.
- Native: `Start-Service Memurai`.
- Docker: `docker compose ps redis`.

**`Error: ZodError: MONGODB_URI Required`**
`.env` tidak terbaca. Pastikan file bernama persis `.env` (bukan `.env.txt`) di folder backend, dan ada 4 variabel wajib: `MONGODB_URI`, `REDIS_URL`, `AI_GRPC_TARGET`, `JWT_SECRET`.

**`grpc: failed to connect ... localhost:50051`**
Service `ai` belum hidup. Aman diabaikan kalau belum menyentuh alur inference (§7).

**`ffmpeg: command not found` saat snapshot job**
Snapshot worker membutuhkan ffmpeg di PATH. Install: `winget install Gyan.FFmpeg`, lalu restart terminal.

**`Error: SETTINGS_ENCRYPTION_KEY must be 64 characters`**
Notifikasi mengenkripsi kredensial SMTP via AES-256-GCM. Pastikan `SETTINGS_ENCRYPTION_KEY` di `.env` adalah hex 64 karakter. Generate ulang (PowerShell tanpa Node):
```powershell
-join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
```

**PowerShell execution policy menolak `npm`**
Sekali saja (tanpa admin):
```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

**Port 8080/27017/6379 sudah dipakai**
```powershell
Get-NetTCPConnection -LocalPort 8080,27017,6379 | Select-Object LocalPort, OwningProcess
Get-Process -Id <PID>
```

**Docker: "WSL 2 installation is incomplete"**
Buka PowerShell as admin: `wsl --install`, lalu restart laptop.

---

## 12. Checklist Akhir

- [ ] Node.js, MongoDB, Memurai/Redis, ffmpeg terpasang & service `Running`
- [ ] `.env` berisi 4 variabel wajib dengan nilai non-default
- [ ] `npm install` selesai tanpa error
- [ ] `npm run seed:dummy-users` selesai
- [ ] `npm run dev` — log menunjukkan "Server listening on 8080"
- [ ] `curl http://localhost:8080/health` → 200 OK
- [ ] Login dengan user dummy berhasil mendapat JWT
- [ ] (Opsional) `ai` hidup di `:50051`
- [ ] (Opsional) SMTP terkonfigurasi untuk notifikasi email
