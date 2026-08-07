# CLAUDE.md

Konteks proyek untuk Claude Code. Baca ini sebelum mengerjakan task di repo `ai/`.

## Tentang Proyek

CCTV Insight AI — service inference untuk analitik kamera CCTV. Saat ini fokus deteksi face mask (Mask / No Mask / Improper Mask) dan people counting. Backend memanggil service AI via gRPC `InferenceService.Infer` (port `50051`). Kontrak proto di [proto/ai/v1/inference.proto](proto/ai/v1/inference.proto); JSON Schema mirror di [contracts/](contracts/).

## Top-Level Layout

```
ai/
├── src/cctv_insight_ai/   # production code (service, pipelines, registry)
├── models/                 # base/pretrained YOLO weights (gitignored)
├── configs/                # konfigurasi training & inference
├── contracts/              # JSON schema kontrak request/response
├── docs/                   # panduan integrasi backend <-> AI
├── scripts/                # entrypoint lokal (train, infer, setup)
├── tests/                  # validasi kontrak & utility
└── research/               # R&D — terisolasi dari production
```

**Aturan**: production code di `src/`, R&D di `research/`. Notebook tidak boleh diimpor service. Kalau ada hasil R&D yang siap produksi, port kodenya ke `src/cctv_insight_ai/` dan daftarkan di [src/cctv_insight_ai/models/registry.py](src/cctv_insight_ai/models/registry.py).

## `research/` Structure

```
research/
├── notebooks/              # 1 folder per use-case (lihat di bawah)
├── datasets/               # layered: raw / interim / processed
├── runs/detect/            # output ultralytics training (gitignored)
└── artifacts/              # eval reports, CSV/JSON ringan (tracked)
```

### Notebook layout (per use-case)

```
research/notebooks/
├── <usecase>/
│   ├── 01_<stage>.ipynb    # urut sesuai workflow
│   └── 02_<stage>.ipynb
└── shared/                 # notebook lintas use-case
```

Stage standar: `data` (split/build), `train`, `eval`, `benchmark`, `infer`, `tradeoff`. Nama file **tidak menyebut model** (`yolo26m`, dst.) — model implisit, tulis di markdown intro saja. Saat tambah use-case baru: bikin folder baru, mulai dari `01_`.

Path resolution dalam notebook (notebook ada di `research/notebooks/<usecase>/`):
```python
NOTEBOOK_DIR = Path.cwd()
RESEARCH_DIR = NOTEBOOK_DIR.parents[1]   # research/
AI_DIR       = NOTEBOOK_DIR.parents[2]   # ai/
```

### Dataset layering

```
research/datasets/
├── raw/         # Roboflow/external download — IMMUTABLE
├── interim/     # transform terreproducible (split, filter)
└── processed/   # ready-for-training final (merged, relabeled)
```

**Aturan**:
- `raw/` jangan diubah. Kalau perlu rebuild, rebuild ke `interim/` atau `processed/`.
- Tiap folder dataset self-contained: punya `data.yaml` + `train/valid/test/{images,labels}/`.
- `data.yaml` pakai path **relatif** (`train: train/images`), tanpa `path:` absolut, supaya pindah-pindah aman.

### Artifact layout

`research/artifacts/<usecase>/<filename>.{json,csv}` — mirror struktur `notebooks/`. Filename tanpa prefix use-case (sudah implicit dari folder). Contoh: `artifacts/face_mask/all_variants_summary.csv`.

## Production Code

```
src/cctv_insight_ai/
├── models/registry.py      # daftar model yang dipakai service
├── pipelines/infer.py
├── service/{app,schemas}.py # FastAPI app + Pydantic schemas
└── utils/{device,io}.py
```

RPC: `InferenceService.Infer` di package `ai.v1` (gRPC). Request/response divalidasi via `service/schemas.py` (Pydantic) dan proto [proto/ai/v1/inference.proto](proto/ai/v1/inference.proto). Versioning wajib — perubahan breaking pakai `ai.v2`, jangan modifikasi `ai.v1`.

## Commands

| Tugas | Command |
|---|---|
| Setup venv (Windows) | `scripts/setup_venv.ps1` |
| Install deps | `pip install -r requirements.txt && pip install -e .` |
| Run gRPC inference service | `scripts/run_grpc_service.ps1` (atau `python scripts/run_grpc_service.py`) |
| Regenerate gRPC stubs | `python scripts/generate_grpc_stubs.py` |
| Tests | `pytest tests/` |

`AI_DEVICE=auto` default — pilih CUDA kalau ada, fallback CPU.

## Konvensi Penting

1. **Tambah model baru**: register di `models/registry.py`, jangan hardcode di endpoint.
2. **Tambah check baru**: implementasikan sebagai post-processing handler. RPC tetap `InferenceService.Infer` di package `ai.v1`, hanya capability `selected_checks` yang bertambah.
3. **Schema berubah**: bikin versi baru (`/v2/infer`), `/v1` tetap stabil.
4. **Tambah dataset**: download ke `datasets/raw/<name>/`, jangan langsung di `processed/`. Notebook yang transform → tulis ke `interim/` atau `processed/`.
5. **Run training prefix**: pakai prefix konsisten untuk `name=` di ultralytics; auto-numbered suffix dihandle via `find_latest_run(prefix)` di notebook.

## Konvensi Naming

Naming dipisah per tier supaya tetap konsisten saat menambah use case baru.
Source of truth: `CHECK_DEFINITIONS` & `MODEL_REGISTRY` di [src/cctv_insight_ai/models/registry.py](src/cctv_insight_ai/models/registry.py).

| Tier | Format | Contoh | Dipakai di |
|---|---|---|---|
| **Detection label** | `<noun>` (positif) atau `no_<noun>` (negatif), snake_case | `person`, `helmet`, `no_helmet`, `mask`, `no_mask`, `improper_mask`, `safety_cone`, `fall_detected` | `detections[].label` di response, `class_labels` di registry |
| **Breakdown key** | sama dengan detection label terkait | `helmet`, `no_helmet`, `mask`, `no_mask` | `details.breakdown` di check_results |
| **Check name** | `<topic>_count`, snake_case | `person_count`, `helmet_count`, `mask_count`, `safety_cone_count` | `selected_checks[]` di request, `check_results[].check` di response |
| **Model key** | `<usecase>`, snake_case noun phrase | `face_mask`, `people_counting`, `helmet_and_vest`, `ppe_compliance` | Key di `MODEL_REGISTRY`, dilaporkan di `model_tasks_executed[]` |
| **Use case folder** | sama dengan model key | `notebooks/face_mask/`, `artifacts/face_mask/` | `research/notebooks/`, `research/artifacts/` |
| **Run prefix** | `<model_key>_<base_weights>` | `face_mask_yolo26m`, `helmet_and_vest_yolo26m` | `research/runs/detect/<run_name>/` |
| **Dataset folder** | snake_case, descriptive (boleh suffix transformasi) | `face_mask_cctv`, `face_mask_cctv_split`, `helmet_and_vest`, `people_counting_single_class` | `research/datasets/{raw,interim,processed}/` |

**Aturan penambahan label/check baru:**
- Label negatif selalu pakai prefix `no_` (bukan `without_`, `not_`, atau attribute terpisah). Contoh: `no_mask`, bukan `face`+`{mask_status: without_mask}`.
- Tiap entry di `CHECK_DEFINITIONS` butuh entry di `CHECK_NAMES` Literal — `assert` di registry.py akan gagal kalau tidak sinkron.
- Tiap `category.source_label` harus muncul di `class_labels` model handler-nya — test `tests/test_check_definitions.py` enforce ini.
- Use case folder, model key, dan run prefix harus sama snake_case-nya supaya `find_latest_run()` di notebook bisa pick up. Pengecualian: dataset folder boleh punya suffix transformasi (`_split`, `_colabeled`, dll).

## Don'ts

- Jangan commit file di `**/images/`, `**/labels/`, `*.cache`, `*.pt`, `research/runs/` — semuanya digenerate ulang dari notebook/script.
- Jangan import dari `research/` di `src/` — boundary keras.
- Jangan modifikasi langsung dataset di `raw/` — itu sumber, baca-only.
- Jangan rebuild dataset/training tanpa flag eksplisit (`OVERWRITE_MERGED`, `RUN_TRAINING`) — operasi mahal.
- Jangan generate file Markdown summary/dokumentasi tambahan kecuali user minta.
