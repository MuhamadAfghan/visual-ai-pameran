# CCTV Insight AI

Service inference + R&D untuk analitik kamera CCTV. Fokus saat ini: PPE compliance (helm, rompi, kacamata, sarung tangan, masker), people counting, dan fall detection.

Backend tidak memanggil model langsung — backend panggil RPC `InferenceService.Infer` via gRPC (port `50051`), service AI yang load model dan jalankan check sesuai `selected_checks`. R&D dipisah dari production di [research/](research/) supaya eksperimen tidak ganggu service.

## Struktur

```
ai/
├── src/cctv_insight_ai/    # production code (service, pipelines, registry)
├── models/                 # base/pretrained YOLO weights (gitignored)
├── configs/                # training & inference config
├── contracts/              # JSON schema request/response
├── docs/                   # panduan integrasi backend <-> AI
├── scripts/                # entrypoint lokal (train, infer, setup)
├── tests/                  # validasi kontrak & utility
├── research/               # R&D (notebook, dataset, runs, artifact)
└── CLAUDE.md               # konvensi proyek (untuk dev & Claude Code)
```

Boundary keras: production code (`src/`) **tidak boleh** import dari `research/`. Hasil R&D yang sudah siap produksi → port ke `src/cctv_insight_ai/` dan daftarkan di [src/cctv_insight_ai/models/registry.py](src/cctv_insight_ai/models/registry.py).

## Setup

1. Bootstrap venv (Windows):
   ```powershell
   scripts/setup_venv.ps1
   ```
2. Install dependency:
   ```bash
   pip install -r requirements.txt
   pip install -e .
   ```
3. Run gRPC inference service:
   ```bash
   scripts/run_grpc_service.ps1
   ```
4. Backend kirim request ke `InferenceService.Infer` via gRPC (`localhost:50051`).

Catatan:
- venv AI hidup di `ai/.venv`, terpisah dari backend.
- `AI_DEVICE=auto` default — pilih CUDA kalau tersedia, fallback CPU.
- `scripts/setup_venv.ps1` akan reinstall torch dengan: `pip install torch torchvision --index-url https://download.pytorch.org/whl/cu130`.
- `requirements-dev.txt` berisi tooling testing tambahan.

## Kontrak API

### Frontend → Backend (public API backend)

Frontend tidak bicara langsung ke AI. Endpoint backend yang relevan:
- `POST /api/v1/detection-jobs` — start job analitik (body: `camera_id`, `selected_checks[]`).
- `PATCH /api/v1/detection-jobs/{job_id}/checks` — update checklist runtime.
- `GET /api/v1/detection-jobs/{job_id}/latest` — hasil terbaru.
- `GET /api/v1/events?camera_id=...&from=...&to=...` — event historis.

### Backend → AI (internal service API)

Transport: **gRPC** (`InferenceService` di port `50051`). Tidak ada REST/HTTP.

- `InferenceService.Infer(InferRequest) → InferResponse`
  - Request: `camera_id`, `frame_id`, `timestamp_utc`, `image_uri|image_base64`, `selected_checks[]`, `thresholds?`, `rules?`, `metadata_json?`.
  - Response: `detections[]`, `check_results[]`, `violations[]`, `model_tasks_executed[]`, `latency_ms`, `meta_json`.
- `InferenceService.Health(HealthRequest) → HealthResponse` — liveness probe.

Proto contract: [proto/ai/v1/inference.proto](proto/ai/v1/inference.proto) (sinkron antara `ai/` dan `backend/`).

Dokumentasi lengkap:
- [docs/api_reference.md](docs/api_reference.md) — RPC, field-by-field, status codes, daftar check, daftar label, daftar tipe violation.
- [docs/backend_integration.md](docs/backend_integration.md) — flow runtime, decisions, smoke test.
- Schema JSON (untuk konsumen non-proto): [contracts/](contracts/).

**Versioning wajib**: perubahan breaking → bump ke `ai.v2`, jangan modifikasi `ai.v1`.

## Flow Runtime

1. User pilih checklist di frontend.
2. Backend validasi vs capability AI, buat job, panggil `InferenceService.Infer` dengan frame + rules dari DB.
3. AI jalankan shared detector + hitung hanya check yang diminta.
4. AI return `check_results` + `detections` + `violations`.
5. Backend simpan event dan push update realtime ke frontend.

Polanya synchronous request-response. Kalau throughput naik, bisa migrasi bertahap ke async queue tanpa ubah payload kontrak.

## Testing

Tiga lapis test, dari yang paling cepat ke yang paling end-to-end:

1. **Schema / kontrak** — validasi Pydantic tanpa hidupin server.
   ```bash
   pytest tests/
   ```
2. **Smoke test gRPC** — start server di terminal terpisah, panggil `Infer` pakai gambar contoh di [contracts/](contracts/).
   ```powershell
   # Terminal 1
   scripts\run_grpc_service.ps1
   # Terminal 2
   .venv\Scripts\python.exe scripts\smoke_test_grpc.py
   ```
3. **Manual via `grpcurl`** — lihat [docs/api_reference.md](docs/api_reference.md#example--grpcurl) untuk contoh command.

Detail field, status codes, dan contoh payload ada di [docs/api_reference.md](docs/api_reference.md). Flow integrasi & decisions di [docs/backend_integration.md](docs/backend_integration.md).

## R&D — `research/`

R&D dipisah dari production: notebook training, dataset, artifact eval. Boundary keras — `src/` tidak boleh import dari `research/`.

Panduan lengkap (struktur, konvensi notebook, dataset layering): [research/README.md](research/README.md). Konvensi yang lebih ketat (untuk dev & Claude Code): [CLAUDE.md](CLAUDE.md).

## Tambah Model atau Check Baru

1. Daftarkan model di [src/cctv_insight_ai/models/registry.py](src/cctv_insight_ai/models/registry.py).
2. Tambah check baru di `CHECK_DEFINITIONS` + `CheckName` Literal (jangan hardcode di RPC handler).
3. Package RPC tetap `ai.v1` — hanya capability `selected_checks` yang bertambah.
4. Breaking change pada request/response → bikin `ai.v2`, jangan ubah `ai.v1`.
5. Unit test dipisah: parser payload, model adapter, check calculator.

Untuk skala throughput tinggi: tambah worker queue + batch inference. gRPC server pakai ThreadPoolExecutor — naikkan `AI_GRPC_MAX_WORKERS` kalau perlu.
