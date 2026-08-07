# API Reference — CCTV Insight AI Service

Reference lengkap RPC AI service. Untuk integration flow & versioning policy
dari sudut backend, lihat [backend_integration.md](backend_integration.md).

## Transport

**gRPC** di port `50051` (configurable via `AI_GRPC_PORT`). Tidak ada REST/HTTP endpoint — backend wajib pakai gRPC client.

Default target: `localhost:50051`.

Schema otoritatif (single source of truth):
- Proto: [proto/ai/v1/inference.proto](../proto/ai/v1/inference.proto)
- JSON Schema (untuk validasi/dokumentasi konsumen): [contracts/inference_request.schema.json](../contracts/inference_request.schema.json), [contracts/inference_response.schema.json](../contracts/inference_response.schema.json)
- Pydantic models: [src/cctv_insight_ai/service/schemas.py](../src/cctv_insight_ai/service/schemas.py)

## Daftar RPC

| RPC | Tujuan |
|---|---|
| [`InferenceService.Health`](#health) | Liveness probe |
| [`InferenceService.Infer`](#infer) | Inference per frame |

---

## `Health`

Liveness probe. Tidak butuh autentikasi, tidak menyentuh model — selalu murah.

**Request:** `HealthRequest{}` (kosong)

**Response:** `HealthResponse{ status: string }` — selalu `"ok"` selama proses hidup.

---

## `Infer`

Jalankan inference + post-processing check & violation untuk satu frame.

### `InferRequest`

| Field | Tipe proto | Wajib | Default | Deskripsi |
|---|---|---|---|---|
| `camera_id` | `string` | ✓ | — | ID kamera otoritatif dari backend (mis. MongoDB ObjectId hex). AI hanya echo balik — tidak dipakai untuk lookup config di sisi AI. |
| `frame_id` | `string` | ✓ | — | ID unik frame. Diteruskan apa adanya ke response untuk korelasi. |
| `timestamp_utc` | `string` (ISO 8601) | ✓ | — | Waktu frame ditangkap, UTC. |
| `image_uri` | `string` | conditional | `""` | Path absolut atau URL gambar yang accessible oleh service AI. |
| `image_base64` | `string` | conditional | `""` | Payload gambar raw base64-encoded. |
| `selected_checks` | `repeated string` | ✗ | `[]` | Daftar check yang dijalankan. Lihat [Daftar `selected_checks`](#daftar-selected_checks). Boleh kosong — kalau kosong, AI hanya return detection mentah (tanpa `check_results` & `violations`). |
| `thresholds.conf` | `double [0,1]` | ✗ | `0.25` | Confidence threshold YOLO. |
| `thresholds.iou` | `double [0,1]` | ✗ | `0.45` | IoU threshold untuk Non-Maximum Suppression. |
| `rules.crowd_threshold` | `optional int32` | ✗ | unset | Threshold violation `crowd_exceeded`. Backend otoritatif — kalau tidak diset, AI skip evaluasi violation ini. Lihat [Aturan violation](#aturan-violation). |
| `metadata_json` | `string` (JSON-encoded) | ✗ | `""` | Object bebas dalam string JSON, hanya diteruskan ke logging. |

**Aturan validasi:**
- Salah satu dari `image_uri` atau `image_base64` **wajib** diisi (string non-kosong). Kalau dua-duanya diisi, `image_uri` yang dipakai.
- Tiap nilai di `selected_checks` harus match enum di [Daftar `selected_checks`](#daftar-selected_checks).
- Validasi gagal → AI return `INVALID_ARGUMENT` (gRPC).

### `InferResponse`

| Field | Tipe proto | Deskripsi |
|---|---|---|
| `camera_id` | `string` | Echo dari request. |
| `frame_id` | `string` | Echo dari request. |
| `timestamp_utc` | `string` | Echo dari request. |
| `latency_ms` | `double` | Durasi inference end-to-end di service AI. |
| `model_tasks_executed` | `repeated string` | Daftar `model_key` yang dijalankan (debugging/metric). |
| `detections` | [`repeated Detection`](#detection) | Semua bounding box hasil inference, sudah dideduplikasi cross-model. |
| `check_results` | [`repeated CheckResult`](#checkresult) | Hasil agregasi per check. Kosong kalau `selected_checks` kosong. |
| `violations` | [`repeated Violation`](#violation) | Pelanggaran terhadap `rules` yang dikirim backend. |
| `meta_json` | `string` (JSON-encoded) | Metadata diagnostik (`processed_at`, `runtime_device`) dalam string JSON — backend harus `JSON.parse`. |

#### `Detection`

| Field | Tipe proto | Deskripsi |
|---|---|---|
| `id` | `int32` | Index deteksi di array (0-based, unik per response). |
| `track_id` | `optional int32` | Tracking ID antar-frame. Saat ini selalu unset — tracker belum diimplementasi. |
| `label` | `string` | Label kelas terdeteksi. Pola `<noun>` positif atau `no_<noun>` negatif. Lihat [Daftar label deteksi](#daftar-label-deteksi). |
| `confidence` | `double [0,1]` | Skor confidence YOLO. |
| `bbox` | `repeated double` (length 4) | Bounding box `[x1, y1, x2, y2]` dalam koordinat piksel. |
| `keypoints` | `repeated Keypoint` | Keypoints `{x, y, score}` per joint. Kosong kalau model bukan pose estimator. |
| `attributes` | `map<string, string>` | Atribut tambahan spesifik per label. Saat ini selalu kosong. |

#### `CheckResult`

| Field | Tipe proto | Deskripsi |
|---|---|---|
| `check` | `string` | Nama check yang sama dengan request `selected_checks`. |
| `value` | `int32` | **Total** semua kategori dalam check. Mewakili jumlah objek yang dinilai (compliance + violation gabungan). Untuk `helmet_count`: `value = breakdown.helmet + breakdown.no_helmet`. |
| `confidence` | `double [0,1]` | Rata-rata confidence semua deteksi yang masuk ke check. |
| `details.source_labels` | `repeated string` | Daftar label di `detections[]` yang dihitung untuk check ini. |
| `details.breakdown` | `map<string, int32>` | Count per kategori. Key match [Breakdown keys](#daftar-selected_checks). Untuk hitung violation saja, baca breakdown key dengan prefix `no_*`. |

#### `Violation`

| Field | Tipe proto | Deskripsi |
|---|---|---|
| `type` | `string` | Tipe pelanggaran. Lihat [Daftar tipe violation](#daftar-tipe-violation). |
| `severity` | `string` | `"low"` \| `"medium"` \| `"high"`. |
| `score` | `double [0,1]` | Skor confidence atau severity-normalized. |
| `track_id` | `optional int32` | Track ID objek pelanggar. Saat ini selalu unset. |
| `details_json` | `string` (JSON-encoded) | Detail spesifik per tipe dalam string JSON — backend harus `JSON.parse`. Field di dalamnya bergantung pada `type` (lihat [Daftar tipe violation](#daftar-tipe-violation)). |

### Status codes (gRPC)

| Status | Penyebab umum | Tindakan backend |
|---|---|---|
| `OK` | Sukses. | Persist event. |
| `INVALID_ARGUMENT` | `selected_checks` di luar enum; `image_uri`/`image_base64` dua-duanya kosong; `thresholds.conf` di luar [0,1]; `timestamp_utc` bukan ISO 8601; `metadata_json` bukan JSON valid. | Fix payload. **Jangan retry** (deterministik). |
| `NOT_FOUND` | Model weights tidak tersedia di sisi AI. | Tidak retry — escalate ke ops, model registry kemungkinan rusak. |
| `INTERNAL` | Decode image gagal, CUDA OOM, atau error tak terduga. | Retry max 2x dengan exponential backoff. Kalau persisten, alarm + skip frame. |
| `UNAVAILABLE` | AI service belum start / restart / network. | Retry dengan backoff. Backend gRPC client sudah handle 2x retry default. |
| `DEADLINE_EXCEEDED` | Inference > deadline. Default backend deadline = 30s. | Retry sekali; kalau masih → alarm. |

### Example — request dengan violation aktif

```json
// JSON projection dari InferRequest proto (untuk dokumentasi).
{
  "camera_id": "65f8e2a1c4d2b3e4a5f60718",
  "frame_id": "frame-1747000000000",
  "timestamp_utc": "2026-04-18T10:20:00Z",
  "image_base64": "<base64-data>",
  "selected_checks": ["person_count", "helmet_count"],
  "thresholds": { "conf": 0.3, "iou": 0.45 },
  "rules": { "crowd_threshold": 5 }
}
```

### Example response — dengan violation aktif

```json
{
  "camera_id": "65f8e2a1c4d2b3e4a5f60718",
  "frame_id": "frame-1747000000000",
  "timestamp_utc": "2026-04-18T10:20:00Z",
  "latency_ms": 58.3,
  "model_tasks_executed": ["people_counting", "helmet_and_vest"],
  "detections": [
    { "id": 0, "label": "person", "confidence": 0.94, "bbox": [120, 80, 220, 320], "keypoints": [], "attributes": {} },
    { "id": 1, "label": "person", "confidence": 0.91, "bbox": [240, 90, 330, 330], "keypoints": [], "attributes": {} },
    { "id": 2, "label": "person", "confidence": 0.88, "bbox": [360, 85, 460, 325], "keypoints": [], "attributes": {} },
    { "id": 3, "label": "person", "confidence": 0.86, "bbox": [480, 100, 570, 340], "keypoints": [], "attributes": {} },
    { "id": 4, "label": "person", "confidence": 0.83, "bbox": [600, 95, 690, 335], "keypoints": [], "attributes": {} },
    { "id": 5, "label": "person", "confidence": 0.81, "bbox": [720, 105, 810, 345], "keypoints": [], "attributes": {} },
    { "id": 6, "label": "person", "confidence": 0.79, "bbox": [840, 90, 930, 330], "keypoints": [], "attributes": {} },
    { "id": 7, "label": "helmet", "confidence": 0.86, "bbox": [140, 80, 200, 130], "keypoints": [], "attributes": {} },
    { "id": 8, "label": "no_helmet", "confidence": 0.82, "bbox": [380, 90, 440, 140], "keypoints": [], "attributes": {} }
  ],
  "check_results": [
    {
      "check": "person_count",
      "value": 7,
      "confidence": 0.86,
      "details": { "source_labels": ["person"], "breakdown": { "person": 7 } }
    },
    {
      "check": "helmet_count",
      "value": 2,
      "confidence": 0.84,
      "details": { "source_labels": ["helmet", "no_helmet"], "breakdown": { "helmet": 1, "no_helmet": 1 } }
    }
  ],
  "violations": [
    {
      "type": "crowd_exceeded",
      "severity": "medium",
      "score": 0.86,
      "details_json": "{\"person_count\": 7, \"threshold\": 5, \"camera_id\": \"65f8e2a1c4d2b3e4a5f60718\"}"
    }
  ],
  "meta_json": "{\"processed_at\": \"2026-04-18T10:20:00.123456Z\", \"runtime_device\": \"cuda\"}"
}
```

> **Catatan transport**: `violations[].details_json` dan `meta_json` adalah JSON-encoded string (per spec proto). Backend harus `JSON.parse` di sisi konsumen. Lihat [backend_integration.md](backend_integration.md) untuk pola decode.

### Example — `grpcurl`

```bash
grpcurl -plaintext \
  -import-path ./proto -proto ai/v1/inference.proto \
  -d '{
    "camera_id": "cam-01",
    "frame_id": "f-1",
    "timestamp_utc": "2026-04-18T10:20:00Z",
    "image_uri": "/captures/cam1/frame_1.jpg",
    "selected_checks": ["person_count"],
    "rules": {"crowd_threshold": 5}
  }' \
  localhost:50051 ai.v1.InferenceService/Infer
```

---

## Daftar `selected_checks`

Tiap check mewakili **satu topik deteksi**. Sub-kategori (mis. compliance vs
violation) muncul sebagai `details.breakdown` di response, bukan check terpisah.

| Check | Breakdown keys | Model handler | Keterangan |
|---|---|---|---|
| `person_count` | `person` | `people_counting` | Jumlah orang terdeteksi di frame |
| `mask_count` | `mask`, `no_mask`, `improper_mask` | `face_mask` | Hitung pemakaian masker (compliance, violation, improper) |
| `helmet_count` | `helmet`, `no_helmet` | `helmet_and_vest` | Hitung pemakaian helmet (compliance dan violation) |
| `vest_count` | `vest`, `no_vest` | `helmet_and_vest` | Hitung pemakaian safety vest (compliance dan violation) |
| `goggles_count` | `goggles`, `no_goggles` | `ppe_compliance` | Hitung pemakaian goggles (compliance dan violation) |
| `gloves_count` | `gloves`, `no_gloves` | `ppe_compliance` | Hitung pemakaian sarung tangan (compliance dan violation) |
| `ladder_count` | `ladder` | `ppe_compliance` | Hitung tangga di frame |
| `safety_cone_count` | `safety_cone` | `ppe_compliance` | Hitung safety cone di frame |
| `fall_detected_count` | `fall_detected` | `ppe_compliance` | Hitung kejadian fall detection |

Sumber otoritatif: `CHECK_DEFINITIONS` di [src/cctv_insight_ai/models/registry.py](../src/cctv_insight_ai/models/registry.py).

### Constant TypeScript (untuk mirror di backend)

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

## Daftar label deteksi

Muncul di `detections[].label`. Pola: `<noun>` (positif) atau `no_<noun>` (negatif).

`person`, `mask`, `no_mask`, `improper_mask`, `helmet`, `no_helmet`, `vest`, `no_vest`, `goggles`, `no_goggles`, `gloves`, `no_gloves`, `ladder`, `safety_cone`, `fall_detected`

## Daftar tipe violation

| `type` | Trigger | Rules field yang wajib | Field di `details_json` |
|---|---|---|---|
| `crowd_exceeded` | `person_count.value > rules.crowd_threshold` | `rules.crowd_threshold` | `person_count`, `threshold`, `camera_id` |
| `red_zone_intrusion` | `red_zone_count.value > 0` | — (butuh `roi_polygon`) | `intruder_count`, `camera_id` |
| `handrail_violation` | `handrail_count.value > 0` | — (butuh `stairs_zone` + `handrail_lines`) | `not_holding_count`, `camera_id` |
| `hand_in_pocket_violation` | `hand_in_pocket_count` breakdown `walking > 0` | — | `hand_in_pocket_walking_count`, `camera_id` |
| `holding_phone_violation` | `holding_phone_count.value > 0` | — | `holding_phone_count`, `camera_id` |
| `no_mask_violation` | `mask_count` breakdown `no_mask > 0` | — | `no_mask_count`, `camera_id` |
| `no_helmet_violation` | `helmet_count` breakdown `no_helmet > 0` | — | `no_helmet_count`, `camera_id` |
| `no_vest_violation` | `vest_count` breakdown `no_vest > 0` | — | `no_vest_count`, `camera_id` |
| `no_goggles_violation` | `goggles_count` breakdown `no_goggles > 0` | — | `no_goggles_count`, `camera_id` |
| `no_gloves_violation` | `gloves_count` breakdown `no_gloves > 0` | — | `no_gloves_count`, `camera_id` |

> PPE compliance (`no_*_violation`) zero-tolerance & per-APD: violation fire begitu ada minimal satu deteksi kategori negatif (`no_helmet`, dst.) di breakdown. Tidak butuh rules field — opt-in via kehadiran check di `selected_checks`. Severity fixed by risk: `no_helmet` = `high`; `no_mask`/`no_vest`/`no_goggles` = `medium`; `no_gloves` = `low`.

## Aturan violation

- Backend otoritatif untuk semua rules. AI tidak menyimpan config kamera — rules di-pass per request.
- Kalau field rule yang relevan tidak diset (mis. `rules.crowd_threshold` kosong), violation type yang terkait **tidak di-evaluasi**.
- `crowd_threshold = 0` valid — artinya **zero-tolerance zone**: setiap orang yang terdeteksi langsung fire violation dengan severity `high`. Cocok untuk area terbatas yang tidak boleh ada orang sama sekali. (Untuk **disable** violation, kirim `null` / jangan set field, bukan 0.)
- Severity untuk `crowd_exceeded`:
  - `threshold == 0` → `high` (zero-tolerance)
  - `threshold >= 1` → pakai `ratio = person_count / threshold`:
    - `ratio >= 2.0` → `high`
    - `ratio >= 1.5` → `medium`
    - selain itu → `low`

## Versioning

- RPC pakai package `ai.v1`.
- Penambahan check baru ke enum **tidak** breaking — backend lama tinggal abaikan.
- Penambahan kategori baru ke check yang sudah ada (mis. `mask_count` dapat kategori `cloth_mask`) **tidak** breaking — `breakdown` punya key baru saja.
- Penambahan field optional baru ke proto message (rules baru, dll) **tidak** breaking — proto3 default value.
- Penghapusan / rename check / kategori / RPC = breaking → naikkan ke `ai.v2`.
- Perubahan struktur field di `Detection` / `CheckResult` / `Violation` = breaking.
