# Backend Integration Guide

Panduan untuk dev backend (Express/Python/dll) yang konsumsi service AI.
Untuk reference field-by-field, status codes, & violation rules, lihat [api_reference.md](api_reference.md).

## Posisi service AI dalam arsitektur

```
Frontend ──REST──► Backend ──gRPC──► AI Service ──► Model
   ▲                  │
   │                  ▼
   └───────── Database (owned by backend)
```

- Frontend **tidak** bicara langsung ke AI. Hanya backend yang panggil gRPC `InferenceService`.
- AI service **stateless**: tidak punya database, tidak simpan event, tidak simpan config kamera. Backend otoritatif untuk semua state.
- Termasuk **violation rules** (mis. `crowd_threshold`) — backend simpan di DB-nya dan pass per request via `InferRequest.rules`.

## Flow runtime

1. User pilih checklist deteksi di frontend (mis. helmet & mask).
2. Backend buat detection job / camera mapping, simpan `selected_checks` + threshold di DB.
3. Per frame yang masuk dari CCTV, backend panggil `InferenceService.Infer` di AI dengan `selected_checks` user + `rules` dari DB.
4. AI return `detections` + `check_results` + `violations`.
5. Backend simpan event ke DB dan push update realtime ke frontend (websocket / SSE).

Polanya synchronous request-response per frame. Latency target < 100ms (cuda) / < 500ms (cpu) untuk 9 check sekaligus.

## Hal yang perlu disiapkan backend

### 1. gRPC client

- Import `.proto` dari [proto/ai/v1/inference.proto](../proto/ai/v1/inference.proto) (sinkron antara repo `ai/` dan `backend/`).
- Default target: `localhost:50051`. Configurable via env.
- Set deadline per call (default backend: 30s untuk Infer, 5s untuk Health).
- Channel options yang sudah terbukti baik:
  - keepalive `time_ms=30_000`, `timeout_ms=5_000`
  - `max_send_message_length` & `max_receive_message_length` = 32MB (untuk base64 frame besar)
  - retry 2x untuk `UNAVAILABLE` / `INTERNAL`

### 2. Constant `selected_checks`

Hardcode list 9 check sebagai constant untuk validasi input frontend. Daftar
otoritatif di [api_reference.md → Daftar `selected_checks`](api_reference.md#daftar-selected_checks).

```ts
export const SELECTED_CHECKS = [
  "person_count",
  "mask_count",
  "helmet_count",
  "vest_count",
  "goggles_count",
  "gloves_count",
  "ladder_count",
  "safety_cone_count",
  "fall_detected_count",
] as const;

export type SelectedCheck = (typeof SELECTED_CHECKS)[number];
```

`selected_checks` boleh dikirim kosong (`[]`) — kalau user belum pilih check apapun, AI tetap return detection mentah tanpa `check_results` / `violations`.

### 3. Image transport — `image_uri` vs `image_base64`

Pilih satu strategi:

- **`image_base64`** (default praktis untuk kebanyakan deployment) — backend kirim payload gambar langsung di gRPC request. Tidak butuh shared storage. Tradeoff: payload ~33% lebih besar dari binary, tapi gRPC sudah handle binary efisien dan channel option `max_send_message_length` sudah di-set 32MB.
- **`image_uri`** — backend & AI share filesystem (volume mount, NFS, atau S3 path yang accessible kedua sisi). Lebih cepat untuk image besar. Pakai ini hanya kalau deployment menjamin shared storage.

Untuk kasus RTSP → FFmpeg → buffer in-memory di backend, **`image_base64`** lebih praktis (tidak perlu staging file).

### 4. Pass `rules` dari DB per request

Backend menyimpan threshold per kamera (atau per camera-model mapping) di DB-nya. Per request, fetch & kirim:

```ts
import { InferRequest } from "./generated/ai/v1/inference_pb";

const req: InferRequest = {
  camera_id: camera._id.toString(),     // ObjectId hex
  frame_id: `frame-${Date.now()}`,
  timestamp_utc: new Date().toISOString(),
  image_base64: frameBuffer.toString("base64"),
  selected_checks: mapping.selectedChecks,
  thresholds: { conf: mapping.confidenceThreshold ?? 0.25, iou: 0.45 },
  rules: {
    crowd_threshold: camera.crowdThreshold ?? undefined,
  },
};
```

Kalau `crowd_threshold` tidak diset, AI skip evaluasi violation `crowd_exceeded` — `violations: []`.

### 5. Decode `details_json` & `meta_json`

Per spec proto, beberapa field di-encode sebagai JSON string supaya proto contract tetap stabil terhadap perubahan struktur detail:

```ts
import type { Violation, InferResponse } from "./generated/ai/v1/inference_pb";

type CrowdExceededDetails = {
  person_count: number;
  threshold: number;
  camera_id: string;
};

function parseViolation(v: Violation): { type: string; details: unknown } {
  return { type: v.type, details: JSON.parse(v.details_json || "{}") };
}
```

Saat ini hanya satu tipe violation (`crowd_exceeded`) — schema details lihat [api_reference.md → Daftar tipe violation](api_reference.md#daftar-tipe-violation).

### 6. Mapping violation → check

Backend perlu link violation ke check yang men-trigger-nya supaya event bisa di-attribute ke check yang tepat. Pakai mapping eksplisit, **jangan tebak dari naming**:

```ts
const VIOLATION_TO_CHECK: Record<string, SelectedCheck> = {
  crowd_exceeded: "person_count",
};

function isViolationForCheck(v: Violation, check: SelectedCheck): boolean {
  return VIOLATION_TO_CHECK[v.type] === check;
}
```

Tambah entry kalau AI tambah violation type baru (lihat [api_reference.md → Daftar tipe violation](api_reference.md#daftar-tipe-violation)).

### 7. Error handling

| Status gRPC | Strategi |
|---|---|
| `OK` | Persist event, push ke frontend. |
| `INVALID_ARGUMENT` | Bug di backend / input frontend invalid. **Jangan retry** — fix payload. Log untuk monitoring. |
| `INTERNAL` / `UNAVAILABLE` | Error transient di AI. Retry max 2x dengan backoff (mis. 200ms, 800ms). Kalau masih gagal: alarm + skip frame. |
| `DEADLINE_EXCEEDED` | Treat sebagai `INTERNAL`. Default backend deadline 30s. |
| `NOT_FOUND` | Model weights tidak tersedia. Escalate ke ops, jangan auto-retry. |

### 8. Idempotency

`Infer` deterministik untuk frame yang sama (modulo non-determinism CUDA, biasanya marjinal). Backend boleh retry dengan `frame_id` yang sama tanpa duplikasi efek samping di sisi AI — AI tidak punya state.

Untuk dedup di backend: pakai kombinasi `(camera_id, frame_id)` sebagai key idempotensi event.

## Decision yang sudah dibuat (jangan ulangi)

Beberapa pilihan desain sudah didiskusikan di chat tim — referensi di sini supaya tidak perlu diulang:

- **gRPC-only transport.** REST/HTTP endpoint sudah dihapus. Backend wajib pakai gRPC client.
- **Backend tidak menerima `class_id` atau `label_map`.** Backend cuma kirim nama check (`selected_checks`). AI yang map ke model + class internal.
- **Tidak ada CRUD master data untuk classes.** Daftar check fixed dari kode AI ([CHECK_DEFINITIONS](../src/cctv_insight_ai/models/registry.py)). Penambahan check = release AI baru, lalu backend update constant.
- **Satu check cover positif + negatif.** `helmet_count` mencakup helmet & no_helmet. Breakdown per kategori di `details.breakdown`. (Bukan check terpisah `helmet_count` & `no_helmet_count`.)
- **Backend otoritatif untuk camera config & violation rules.** AI tidak punya `camera_rules.json` lagi — rules di-pass per request via `InferRequest.rules`. Backend yang simpan threshold per kamera di DB-nya.
- **Violation linkage via explicit mapping.** Backend tidak boleh tebak link violation → check dari naming convention (mis. `startsWith`). Pakai mapping eksplisit (lihat [§6](#6-mapping-violation--check)).

## Versioning policy

Detail di [api_reference.md → Versioning](api_reference.md#versioning).

Singkatnya: enum check & breakdown bersifat tambahan (non-breaking). Penambahan field optional di proto = non-breaking. Penghapusan / perubahan struktur = bump ke `ai.v2`.

## Smoke test integrasi

Dari sisi AI (validasi pipeline):

```powershell
.venv\Scripts\python.exe scripts\smoke_test_grpc.py
```

Prasyarat: gRPC server hidup (`scripts/run_grpc_service.ps1` di terminal lain).

Dari sisi backend (validasi gRPC client + payload):
- Pakai `grpcurl` (lihat [api_reference.md → Example grpcurl](api_reference.md#example--grpcurl)) untuk one-shot call.
- Atau bikin smoke script Node yang load proto + panggil `Infer` dengan example image dari [contracts/](../contracts/).
