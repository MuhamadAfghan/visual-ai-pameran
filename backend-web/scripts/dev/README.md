# Dev Tools

Skrip dan config untuk lokal development tanpa hardware/service eksternal yang sulit didapat.

## Fake RTSP Stream

`backend/src/utils/rtspCapture.ts` panggil FFmpeg connect ke kamera CCTV via RTSP. Untuk testing tanpa kamera asli, kita pakai **MediaMTX** sebagai RTSP server lokal + **FFmpeg** push gambar contoh sebagai stream.

### Kenapa MediaMTX (bukan Docker)?

- Single binary (~25MB), no install, no admin
- Cross-platform (Windows/Linux/Mac)
- Tidak butuh Docker / WSL2 / Hyper-V
- Listen RTSP/RTMP/HLS/WebRTC sekaligus
- Active project: <https://github.com/bluenviron/mediamtx>

### Setup Sekali (per dev)

1. **Download MediaMTX**:
   - <https://github.com/bluenviron/mediamtx/releases/latest>
   - Pilih `mediamtx_vX.X.X_windows_amd64.zip` (untuk Windows)
2. **Extract** ke salah satu lokasi:
   - **Default** (rekomendasi): `%USERPROFILE%\Tools\mediamtx\`
   - Atau set env var `$env:MEDIAMTX_PATH` ke path `mediamtx.exe` Anda
3. **Verifikasi FFmpeg ada di PATH**:
   ```powershell
   ffmpeg -version
   ```
   Kalau belum: <https://www.gyan.dev/ffmpeg/builds/> → `ffmpeg-release-full.7z` → extract + add `bin/` ke PATH.

### Pakai

**Opsi A — RTSP + backend sekaligus (rekomendasi):**

```powershell
cd backend
npm run dev:full
```

Ini jalankan `start-fake-rtsp.ps1` (MediaMTX + FFmpeg) lalu `tsx watch` backend dalam satu terminal via `concurrently`. AI gRPC & MongoDB tetap dijalankan terpisah (lihat tabel di bawah).

**Opsi B — RTSP saja** (di terminal tersendiri, biarkan jalan):

```powershell
cd backend
scripts\dev\start-fake-rtsp.ps1
```

> **Kamera webcam auto-detect.** Nama _device_ tidak di-hardcode: script meng-enumerate
> kamera DirectShow yang terpasang dan mengisinya ke path RTSP yang **sudah ditentukan
> backend** (`$WebcamPaths` di script: `webcam-laptop`, `webcam-internal`) sesuai urutan
> deteksi. Mapping `device -> path` dicetak saat start. Kalau tidak ada kamera, script
> tetap jalan dengan file streams saja.
>
> ⚠️ **Kontrak path ↔ DB.** Nama path di `$WebcamPaths` HARUS sama dengan `rtspUrl` kamera
> di database (backend authoritative). Kalau tidak cocok, backend dapat **404 Not Found**
> dan kamera `offline` (stream hub loop start/stop). Cek nilai DB:
> `GET /api/v1/cameras` → field `rtspUrl`. Ubah salah satu, ubah keduanya.

Output ekspektasi:
```
✓ MediaMTX PID=12345, RTSP listening on :8554
✓ FFmpeg PID=67890, pushing to rtsp://localhost:8554/fake-cam

✅ Fake RTSP stream live:
   URL    : rtsp://localhost:8554/fake-cam
```

**Run integration test** (di terminal lain):

```powershell
cd backend
npx ts-node src\scripts\smokeRtspIntegration.ts --crowd-threshold 0
```

Ini akan trigger flow lengkap:
- BullMQ enqueue snapshot job
- Worker pickup → captureRtspFrame() → connect ke MediaMTX
- FFmpeg pipe out frame → backend dapat Buffer
- Backend kirim ke AI gRPC dengan rules.crowd_threshold=0
- AI return `crowd_exceeded` violation
- DetectionEvent ditulis ke MongoDB dengan `isViolation: true`

Expected ending:
```
✅ PASS — full RTSP→AI→Mongo pipeline via BullMQ worker bekerja.
```

**Stop fake RTSP**:

```powershell
scripts\dev\stop-fake-rtsp.ps1
```

### Opsi C — Docker Compose (kalau stack sudah jalan via `docker compose up`)

Kalau backend-web jalan sebagai container (bukan `npm run dev` native), `rtsp://localhost:8554/...`
**tidak bisa** dipakai — dari dalam container, `localhost` merujuk ke container itu sendiri, bukan
host MediaMTX. Repo ini sudah sediakan service `mediamtx` + `fake-rtsp-feed` di `docker-compose.yml`
root, di belakang Compose profile `fake-rtsp` (tidak ikut nyala di `docker compose up` biasa):

```powershell
# Nyalakan MediaMTX + ffmpeg loop pusher (baca video dari backend-web/temp/)
docker compose --profile fake-rtsp up -d --build

# Seed Camera records — RTSP_FAKE_HOST=mediamtx wajib (bukan default "localhost")
docker compose exec -e RTSP_FAKE_HOST=mediamtx backend-web node dist/scripts/seedDevCameras.js
```

> **Kalau backend-web sudah lama jalan saat seed ini dijalankan**, kamera baru akan tampil
> `isActive: true` di DB tapi **live view-nya tetap "Monitoring nonaktif"**. Sebabnya:
> `initCaptureHubs()` (`src/plugins/cameraStreamHub.ts`) cuma jalan **sekali saat boot**
> (`server.ts`) untuk start monitoring hub semua kamera aktif — kamera yang baru di-insert
> langsung ke Mongo lewat script (bukan lewat `POST /cameras`) tidak ikut ke-pickup. Field
> `status`/`Online` di tile bisa tetap kelihatan "online" kalau kamu pernah test-connection
> manual — itu field terpisah, bukan sinyal hub yang sebenarnya. Fix tanpa restart:
> ```powershell
> curl -X POST http://localhost:8090/api/v1/cameras/<id>/scheduler/start -H "Authorization: Bearer <token>"
> ```
> untuk tiap kamera baru (endpoint yang sama dipakai toggle "Aktifkan Scheduler" di form kamera),
> atau restart `backend-web` supaya `initCaptureHubs()` jalan ulang dari awal.

`fake-rtsp-feed` cuma push file yang benar-benar ada di `backend-web/temp/` (skip dengan warning
kalau tidak ada, tidak fail) — cek `docker compose logs fake-rtsp-feed` untuk lihat stream mana
yang hidup. Verifikasi manual dari dalam network Docker:

```powershell
docker compose exec backend-web sh -c "ffmpeg -rtsp_transport tcp -i rtsp://mediamtx:8554/<path> -vframes 1 -y /tmp/test.jpg"
```

Matikan: `docker compose --profile fake-rtsp down`.

### Prasyarat Service Lain

`smokeRtspIntegration.ts` butuh service-service ini jalan **sebelum** test:

| Service | Default port | Cek status |
|---|---|---|
| MongoDB | 27017 | `Get-Service MongoDB` → Running |
| Memurai (Redis) | 6379 | `Get-Service Memurai` → Running |
| AI gRPC | 50051 | `cd ai && scripts\run_grpc_service.ps1` (terminal terpisah) |
| MediaMTX | 8554 | `start-fake-rtsp.ps1` (terminal terpisah) |

Service order untuk full stack lokal:
1. MongoDB + Memurai (otomatis sebagai Windows service)
2. AI gRPC server — terminal #1
3. MediaMTX + FFmpeg push — terminal #2 via `start-fake-rtsp.ps1`
4. Test script — terminal #3

### Troubleshooting

**"MediaMTX tidak ditemukan"** — set `$env:MEDIAMTX_PATH`:
```powershell
$env:MEDIAMTX_PATH = "D:\my-tools\mediamtx\mediamtx.exe"
scripts\dev\start-fake-rtsp.ps1
```

**"path 'fake-cam' is not configured"** — config file tidak terbaca. Cek `scripts\dev\mediamtx-fake.yml` ada dan readable.

**FFmpeg "Server returned 400 Bad Request"** — biasanya config MediaMTX salah / belum di-load. Restart pakai start script (yang load config dengan benar).

**Stream tidak ter-detect oleh backend** — verify manual:
```powershell
ffmpeg -rtsp_transport tcp -i rtsp://localhost:8554/fake-cam -frames:v 1 -y test.jpg
```
Kalau test.jpg muncul, stream OK. Kalau gagal, ada masalah di MediaMTX/FFmpeg push.

**Ganti gambar source** — edit `start-fake-rtsp.ps1` ganti `$SourceImage`, atau pakai video file (`.mp4`) dengan FFmpeg flag yang sedikit beda (`-stream_loop -1 -i video.mp4`).

### Catatan Keamanan

`mediamtx-fake.yml` mengizinkan publish ke path apapun **tanpa auth**. JANGAN pakai config ini di production. Untuk production, define explicit paths + auth di config sesuai docs MediaMTX.
