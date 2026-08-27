# Visual AI Pameran — CCTV Detector

Sistem deteksi & monitoring CCTV berbasis AI. Tiga service:

```
Frontend (React + Vite + Tailwind)
    │  REST JSON
    ▼
Backend Web (Express + MongoDB + Redis/BullMQ)
    │  gRPC (proto/ai/v1/inference.proto)
    ▼
AI Service (Python + gRPC + YOLO)
```

`backend-web` menjalankan API server, inference worker, notification worker, dan cleanup schedule **dalam satu proses** (lihat `backend-web/src/server.ts`) — tidak ada proses worker terpisah yang perlu dijalankan manual.

| Folder | Peran | Port default |
|---|---|---|
| `frontend/` | React SPA | `8080` (docker) / `5173` (dev) |
| `backend-web/` | Express REST API + gRPC client | `8090` (docker) / `8080` (dev) |
| `ai/` | gRPC inference service (YOLO) | `50051` |

---

## Opsi 1 — Docker Compose (paling cepat, jalankan ketiganya sekaligus)

### Prasyarat
- Docker Desktop (dengan WSL2/Hyper-V aktif)

### Langkah

1. Siapkan file `.env` untuk `backend-web` dan `ai` dari template:

   ```powershell
   Copy-Item backend-web/.env.example backend-web/.env
   Copy-Item ai/.env.example ai/.env
   ```

   Minimal wajib diisi di `backend-web/.env`:
   - `JWT_SECRET` — minimal 8 karakter. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `SETTINGS_ENCRYPTION_KEY` — hex 64 karakter (wajib hanya jika ingin memakai fitur notifikasi email SMTP). Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

   `MONGODB_URI`, `REDIS_URL`, dan `AI_GRPC_TARGET` **tidak perlu** diisi manual — sudah di-override otomatis oleh `docker-compose.yml` agar mengarah ke container `mongodb`, `redis`, dan `ai`.

2. Build & jalankan semua service:

   ```powershell
   docker compose up -d --build
   docker compose ps
   ```

   Ini menyalakan: `mongodb` (:27017), `redis` (:6379), `ai` (:50051), `backend-web` (:8090), `frontend` (:8080).

3. Seed user dummy (sekali saja, setelah `backend-web` sehat):

   ```powershell
   docker compose exec backend-web node dist/scripts/seedDummyUsers.js
   ```

   Opsional — kamera RTSP dummy untuk testing (video sample di `backend-web/temp/`, loop lewat
   MediaMTX; detail di [backend-web/scripts/dev/README.md](backend-web/scripts/dev/README.md)):

   ```powershell
   docker compose --profile fake-rtsp up -d --build
   docker compose exec -e RTSP_FAKE_HOST=mediamtx backend-web node dist/scripts/seedDevCameras.js
   ```

4. Buka aplikasi: **http://localhost:8080**

5. Matikan:

   ```powershell
   docker compose down        # tetap simpan data (volume)
   docker compose down -v     # reset total, hapus semua data
   ```

> Catatan: `ai/models/` (model weights) dan dataset besar tidak ikut ter-commit di repo ini (lihat `.gitignore`). Pastikan model weights tersedia di `ai/models/` sebelum build image `ai`, atau mount lewat volume terpisah.

---

## Opsi 2 — Jalankan manual per service (development)

### Prasyarat umum
- Node.js 20+ dan npm
- Python 3.10+
- MongoDB (lokal atau container) di `:27017`
- Redis (lokal, container, atau Memurai di Windows) di `:6379`
- ffmpeg (untuk capture snapshot RTSP di `backend-web`)

### 1. `backend-web`

```powershell
cd backend-web
npm install
Copy-Item .env.example .env
# isi JWT_SECRET, MONGODB_URI, REDIS_URL, AI_GRPC_TARGET di .env
npm run seed:dummy-users
npm run dev
```

Satu proses ini sudah mencakup API server + inference worker + notification worker + cleanup schedule. Server listening di `:8080`.

### 2. `ai`

```powershell
cd ai
scripts/setup_venv.ps1
pip install -r requirements.txt
pip install -e .
Copy-Item .env.example .env
scripts/run_grpc_service.ps1
```

gRPC server listening di `:50051` (env: `AI_GRPC_HOST`, `AI_GRPC_PORT`, `AI_GRPC_MAX_WORKERS`).

`backend-web` tetap bisa start tanpa `ai` hidup — hanya endpoint yang memicu inference (`POST /api/v1/detection-jobs`) yang akan gagal saat diproses. Endpoint lain (auth, CRUD camera/area, dashboard) tetap berfungsi.

### 3. `frontend`

```powershell
cd frontend
npm install
Copy-Item .env.example .env
npm run dev
```

Buka `http://localhost:5173`. `VITE_API_URL` dibiarkan kosong agar Vite dev proxy meneruskan `/api` ke `backend-web:8080` (lihat `vite.config.ts`).

---

## Default Login (setelah `seed:dummy-users`)

| Role | Email | Password |
|---|---|---|
| super_admin | superadmin@cctv.local | SuperAdmin12345! |
| admin | admin@cctv.local | Admin12345! |
| viewer | guest@cctv.local | Guest12345! |
| pic | pic@cctv.local | Budpic |

---

## Environment Variables

Referensi lengkap ada di masing-masing `.env.example`:
- [backend-web/.env.example](backend-web/.env.example)
- [ai/.env.example](ai/.env.example)
- [frontend/.env.example](frontend/.env.example)

Variabel `backend-web` yang **wajib diisi tanpa default**: `MONGODB_URI`, `AI_GRPC_TARGET`, `JWT_SECRET`.

---

## Verifikasi

`backend-web` ada di port `8090` lewat Docker Compose (Opsi 1), atau `8080` kalau dijalankan manual (Opsi 2) — sesuaikan port di bawah dengan cara yang dipakai.

```powershell
curl http://localhost:8090/health

curl -X POST http://localhost:8090/api/v1/auth/login `
  -H "Content-Type: application/json" `
  -d '{\"email\":\"superadmin@cctv.local\",\"password\":\"SuperAdmin12345!\"}'
```

Login sukses mengembalikan JWT token.

---

## Troubleshooting

**`Error: connect ECONNREFUSED 127.0.0.1:27017`** — MongoDB belum jalan.

**`Error: connect ECONNREFUSED 127.0.0.1:6379`** — Redis/Memurai belum jalan.

**`grpc: failed to connect ... localhost:50051`** — Service `ai` belum hidup. Aman diabaikan selama tidak menyentuh alur inference.

**`ffmpeg: command not found`** — Snapshot/live-stream butuh ffmpeg di PATH (`winget install Gyan.FFmpeg` di Windows).

**Port 8080/8090/27017/6379/50051 sudah dipakai** —
```powershell
Get-NetTCPConnection -LocalPort 8090 | Select-Object LocalPort, OwningProcess
```

**Docker: "WSL 2 installation is incomplete"** — Jalankan `wsl --install` sebagai admin, lalu restart.

---

## Kontrak & Sinkronisasi Proto

`ai/proto/inference.proto` adalah source of truth. Setelah mengubah proto:

```powershell
.\sync-proto.ps1                    # sync ke backend-web/proto/ai/v1/
ai/scripts/gen_proto.ps1            # regenerate Python stubs
```

JSON Schema untuk REST kontrak AI service ada di `ai/contracts/`.
