# backend-web

Service orkestrasi CCTV Detector. Manage user, kamera, scheduler capture frame, kirim ke AI lewat gRPC, simpan event, kirim notifikasi.

Backend ini **bukan** yang inference — itu kerjanya `ai/`. Backend cuma orchestrator.

## Stack

- Express + TypeScript (Node 20 LTS)
- MongoDB (data utama) + Mongoose
- Redis + BullMQ (queue 4 worker)
- gRPC client ke `ai/` di `:50051` (proto: [proto/ai/v1/inference.proto](proto/ai/v1/inference.proto))
- ffmpeg untuk capture RTSP
- JWT auth, RBAC 3 tier

## Run lokal

Prasyarat: MongoDB `:27017`, Memurai/Redis `:6379`, ffmpeg di PATH. Cara install tooling: [docs/install.md](docs/install.md).

```powershell
cp .env.example .env        # isi JWT_SECRET & SETTINGS_ENCRYPTION_KEY (lihat .env.example)
npm install
npm run seed:dummy-users    # bikin 3 user default

# Cara cepat — semua proses di satu terminal:
npm run dev:all

# Cara manual — 5 terminal terpisah:
npm run dev                       # API server :8080
npm run worker:dev                # inference worker (panggil AI gRPC)
npm run snapshot-worker:dev       # capture RTSP → frame
npm run notification-worker:dev   # email PIC saat violation
npm run cleanup-worker:dev        # retention purge
```

User dummy:

| Role | Email | Password |
|---|---|---|
| super_admin | superadmin@cctv.local | SuperAdmin12345! |
| admin | admin@cctv.local | Admin12345! |
| viewer | guest@cctv.local | Guest12345! |

## Env yang wajib

```env
MONGODB_URI=mongodb://localhost:27017/cctv_detector
REDIS_URL=redis://localhost:6379
AI_GRPC_TARGET=localhost:50051
JWT_SECRET=<min 8 char>
SETTINGS_ENCRYPTION_KEY=<hex 64 char untuk AES-256-GCM>
```

`SETTINGS_ENCRYPTION_KEY` dipakai encrypt kredensial SMTP di DB. Generate:
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Semua env lengkap ada di [.env.example](.env.example).

## Tanpa AI hidup

API tetap start. Semua endpoint kecuali alur inference jalan normal. `POST /api/v1/detection-jobs` akan retry di worker sampai AI gRPC up — log `UNAVAILABLE` boleh diabaikan kalau memang belum mau test inference.

## API

Semua di `/api/v1/*`. Spec lengkap (Swagger UI): `http://localhost:8080/api-docs`.

| Domain | Endpoint | Akses |
|---|---|---|
| Auth | `POST /auth/login`, `forgot-password`, `reset-password`, `change-password`, `GET/PATCH /auth/me` | public + self |
| Users | CRUD + activation toggle | super_admin (create/delete), admin (toggle), all (read) |
| Areas | CRUD area pabrik | viewer read, admin write |
| Cameras | CRUD + `test-connection` + `scheduler/start\|stop` | viewer read, admin write, super_admin delete |
| Camera mappings | mapping kamera→area + check aktif, toggle | nested di `/cameras/:id/mappings` |
| AI models | registry capability dari AI service | viewer read, admin write |
| PICs | Person In Charge (target email notif) | admin |
| Detection jobs | `POST /detection-jobs`, `GET /:id` | admin create, viewer read |
| Events | list + filter, `:id`, acknowledge, false-positive, delete | viewer read, admin write |
| Events realtime | `GET /events/stream` (SSE) | semua role authenticated |
| Events export | `GET /events/export` (Excel via exceljs) | semua role |
| Dashboard | `/stats`, `/trend`, `/by-type`, `/by-camera` | semua role |
| Settings | get/update, `smtp/test`, `cleanup/run` | super_admin |
| Audit logs | read-only | super_admin |
| Health | `GET /health` (no auth) | public |

Header proteksi: `Authorization: Bearer <jwt>`.

Static snapshot di `/storage/*` — dilayani langsung dari `STORAGE_BASE_PATH` ([app.ts:37](src/app.ts#L37)).

## RBAC

- `super_admin` — semua, termasuk system settings & audit log.
- `admin` — semua operasional, tanpa settings/audit.
- `viewer` (guest) — read-only dashboard, event, kamera.

Detail per route ada di tabel di atas atau langsung di file `routes/*.routes.ts`.

## Worker & queue

Semua via BullMQ + Redis. Lihat [src/queues/](src/queues/) dan [src/workers/](src/workers/).

```
client ──HTTP──► API (:8080) ──┬──► MongoDB
                               ├──► Redis (BullMQ)
                               └──► ai/ gRPC (:50051)

scheduler (per kamera) ──► snapshot queue
snapshot worker ──ffmpeg──► RTSP frame ──► storage ──► infer queue
inference worker ──gRPC──► AI ──► event di MongoDB
                            └──► eventBus ──► SSE ──► frontend live
                            └──► notif queue (kalau ada violation)
notification worker ──SMTP──► email PIC (cooldown 300s default)
cleanup worker (cron) ──► purge event/snapshot/notif log lama
```

## Komunikasi ke AI

gRPC, bukan REST. Definisi: [proto/ai/v1/inference.proto](proto/ai/v1/inference.proto). Client: [src/plugins/aiGrpcClient.ts](src/plugins/aiGrpcClient.ts). Deadline default 30s.

`selected_checks` yang valid (sinkron dengan `ai/contracts/`):
`person_count`, `mask_count`, `helmet_count`, `vest_count`, `goggles_count`, `gloves_count`, `ladder_count`, `safety_cone_count`, `fall_detected_count`.

Breaking change schema → bikin `ai.v2`, jangan modifikasi `v1`.

## Operasi umum

```powershell
# Reset DB
mongosh
> use cctv_detector
> db.dropDatabase()
> exit
npm run seed:dummy-users

# Flush queue
redis-cli FLUSHDB    # atau memurai-cli FLUSHDB

# Build production
npm run build
npm start
```

## Layout

```
src/
├── app.ts                  # express setup + error handler
├── server.ts               # bootstrap API + connect Mongo
├── config/                 # env (zod) + mongo connection
├── routes/                 # route definition per domain
├── controllers/            # parse req → call service → response
├── services/               # business logic
├── models/                 # Mongoose schema
├── middleware/             # auth, RBAC, rate limit
├── plugins/                # gRPC client, mail, eventBus, storage, JWT
├── queues/                 # BullMQ queue definition
├── workers/                # 4 worker entrypoint
├── utils/                  # rtspCapture, crypto, apiResponse
├── openapi/                # swagger spec generator
└── scripts/                # seed dummy users, dst
```

Pola: `route → controller → service → model`. Validasi pakai Zod, error handler global di [src/app.ts:44](src/app.ts#L44) translate `ZodError` → 400, `HttpError` → status custom, duplicate key Mongo → 409.

## Troubleshooting cepat

| Gejala | Penyebab umum |
|---|---|
| `ECONNREFUSED 127.0.0.1:27017` | MongoDB mati. `Start-Service MongoDB`. |
| `ECONNREFUSED 127.0.0.1:6379` | Redis/Memurai mati. `Start-Service Memurai`. |
| `grpc: failed to connect ... :50051` | `ai/` belum jalan. OK kalau belum test inference. |
| `ffmpeg: command not found` | Snapshot worker butuh ffmpeg di PATH. |
| `SETTINGS_ENCRYPTION_KEY must be 64 characters` | Generate ulang (lihat section env). |
| `ZodError: MONGODB_URI Required` | `.env` tidak terbaca atau salah nama. |

Untuk masalah saat install tooling (PATH, execution policy, WSL, port conflict), lihat [docs/install.md](docs/install.md).
