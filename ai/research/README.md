# Research Workspace

Folder ini tempat eksperimen AI — training, evaluasi, perbandingan model. Terpisah dari production code di [../src/cctv_insight_ai/](../src/cctv_insight_ai/) supaya hasil coba-coba tidak nyampur ke service.

Dokumen lain yang relevan:
- [README repo](../README.md) — setup, kontrak API, runtime flow, testing.
- [CLAUDE.md](../CLAUDE.md) — konvensi proyek (untuk dev & Claude Code).
- [docs/backend_integration.md](../docs/backend_integration.md) — kontrak backend ↔ AI.

## Isi Folder

```
research/
├── notebooks/      # eksperimen per use-case
├── datasets/       # data lokal (raw / interim / processed)
├── runs/           # output training ultralytics (gitignored)
└── artifacts/      # hasil eval ringan (CSV, JSON) — tracked
```

## Use-Case Yang Sudah Ada

Use case di sini = nama folder di `notebooks/`, `artifacts/`, dan key di
`MODEL_REGISTRY` (lihat [src/cctv_insight_ai/models/registry.py](../src/cctv_insight_ai/models/registry.py)).
Tiga harus konsisten satu sama lain.

- [notebooks/face_mask/](notebooks/face_mask/) — deteksi mask / no_mask / improper_mask.
- [notebooks/people_counting/](notebooks/people_counting/) — hitung jumlah orang di frame.
- [notebooks/helmet_and_vest/](notebooks/helmet_and_vest/) — deteksi helmet dan safety vest.
- [notebooks/ppe_compliance/](notebooks/ppe_compliance/) — PPE combined (helmet, vest, mask, goggles, gloves, ladder, fall, cone).
- [notebooks/multitask/](notebooks/multitask/) — eksperimen gabungan face_mask + person dalam satu model (bukan production model — eksplorasi shared backbone).
- [notebooks/shared/](notebooks/shared/) — notebook lintas use-case (misal perbandingan variant).

Tiap folder mulai dari `01_<stage>.ipynb`. Stage standar: `data`, `train`, `eval`, `benchmark`, `infer`, `tradeoff`. Nama file tidak menyebut model — model implisit, ditulis di markdown intro saja.

Untuk konvensi naming lengkap (label, check name, model key, run prefix, dll), lihat seksi "Konvensi Naming" di [../CLAUDE.md](../CLAUDE.md).

## Cara Menambah Use-Case Baru

1. Bikin folder baru di `notebooks/<usecase>/`.
2. Mulai dari `01_train.ipynb` (atau `01_data.ipynb` kalau perlu prep dataset dulu).
3. Bikin folder mirror di `artifacts/<usecase>/` untuk simpan hasil eval.
4. Kalau butuh dataset baru, taruh di `datasets/raw/<nama>/` — jangan langsung di `processed/`.

## Dataset

Tiga lapis:

- `datasets/raw/` — hasil download dari Roboflow atau sumber lain. **Read-only.** Jangan diubah. Folder pakai nama project Roboflow (mis. `ppe/`, `face_mask_cctv/`) — boleh beda dari nama use case di registry/notebook karena raw harus mirror sumber persis.
- `datasets/interim/` — hasil transform yang masih bisa direproduksi (split, filter, relabel parsial). Folder boleh punya suffix transformasi (`_split`, dll).
- `datasets/processed/` — versi final siap training (sudah merged, relabeled, divalidasi). Idealnya folder match use case (`helmet_and_vest/`); kalau merged dari multi-source pakai nama deskriptif (`face_mask_person_multitask/`).

Tiap folder dataset harus self-contained: punya `data.yaml` + `train/valid/test/{images,labels}/`. `data.yaml` pakai path relatif (`train: train/images`), bukan absolut, biar aman dipindah-pindah.

### Download Dataset Roboflow

Set API key di environment dulu, jangan hardcode di file. Token bisa diambil dari akun Roboflow masing-masing.

```powershell
$env:ROBOFLOW_API_KEY = "<isi-token-anda>"
```

Lalu download via notebook (cell di `01_data.ipynb` atau setara). Polanya:

```python
from roboflow import Roboflow
rf = Roboflow(api_key=os.environ["ROBOFLOW_API_KEY"])
project = rf.workspace("<workspace>").project("<project-slug>")
dataset = project.version(<n>).download("yolov8", location="research/datasets/raw/<nama>")
```

## Artifacts

Hasil eval ringan (metric, perbandingan variant, latency benchmark) disimpan di `artifacts/<usecase>/`. Bentuk file: CSV atau JSON, di-track git.

Contoh:
```
artifacts/face_mask/all_variants_summary.csv
artifacts/face_mask/per_class_metrics.json
```

Filename tidak perlu prefix use-case — sudah implisit dari folder.

## Model Weights

Weights base/pretrained ada di [../models/](../models/) (di luar folder ini, di-gitignore). Hasil training masuk ke `runs/detect/<nama-run>/` — juga gitignored karena ukurannya besar.

Kalau ada weight hasil training yang siap dipakai service:
1. Copy `best.pt` ke `../models/` dengan nama yang jelas (atau biarkan di `runs/`).
2. Daftarkan di [../src/cctv_insight_ai/models/registry.py](../src/cctv_insight_ai/models/registry.py).
3. Verifikasi cepat dengan smoke test:
   ```powershell
   # Terminal 1 — start gRPC server
   ..\scripts\run_grpc_service.ps1
   # Terminal 2 — kirim Infer RPC pakai gambar di ../contracts/
   ..\.venv\Scripts\python.exe ..\scripts\smoke_test_grpc.py
   ```
   Script kedua panggil `InferenceService.Infer` pakai gambar di [../contracts/](../contracts/) — pas untuk cek apakah model baru menghasilkan deteksi sesuai ekspektasi setelah didaftarkan.

## Aturan Yang Penting Diingat

- **Notebook tidak boleh diimport dari `src/`.** Boundary keras. Kalau ada logic yang reusable, port ke `src/cctv_insight_ai/`.
- **Jangan modifikasi `datasets/raw/`.** Itu sumber, baca-only. Kalau perlu rebuild, output ke `interim/` atau `processed/`.
- **Operasi mahal pakai flag eksplisit.** Notebook training/rebuild dataset jangan jalan otomatis — pakai flag seperti `RUN_TRAINING = True` atau `OVERWRITE_MERGED = True`.
- **Jangan commit file di `**/images/`, `**/labels/`, `*.cache`, `*.pt`, `runs/`** — semua bisa digenerate ulang.

## Path Resolver Di Notebook

Notebook ada di `research/notebooks/<usecase>/`, jadi:

```python
from pathlib import Path

NOTEBOOK_DIR = Path.cwd()
RESEARCH_DIR = NOTEBOOK_DIR.parents[1]   # research/
AI_DIR       = NOTEBOOK_DIR.parents[2]   # ai/
```

Pakai variabel ini untuk reference dataset, artifact, atau models — jangan hardcode path absolut.
