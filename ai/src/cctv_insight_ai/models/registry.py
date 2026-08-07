from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal, get_args

# Resolve paths relative to this file: src/cctv_insight_ai/models/ -> ai/
_AI_DIR = Path(__file__).parents[3]
_RUNS_DIR = _AI_DIR / "research" / "runs" / "detect"
_MODELS_DIR = _AI_DIR / "models"


@dataclass(frozen=True)
class ClassLabel:
    """Mapping satu class-id dataset YOLO ke label + atribut yang dipakai service.

    Tiap model punya namespace class-id sendiri (face_mask: 0/1/2, people_counting: 0,
    helmet_and_vest: 0..4). Kelas yang sama secara semantik (mis. 'person') bisa
    pakai class-id beda di model beda — yang konsisten lintas model adalah `label`
    dan `attributes` yang dihasilkan ke response.
    """
    label: str
    attributes: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ModelSpec:
    name: str
    version: str
    weights_path: str
    # Class IDs this spec is responsible for. Empty list = all classes.
    task_classes: list[int] = field(default_factory=list)
    # Per-model class-id → label mapping. Pipeline pakai ini buat translate
    # output YOLO ke detection unified — gantiin asumsi class-id global.
    class_labels: dict[int, ClassLabel] = field(default_factory=dict)
    description: str = ""


# ---------------------------------------------------------------------------
# Model registry
# ---------------------------------------------------------------------------
# Sections:
#   base      — pretrained backbone weights (not fine-tuned for any task)
#   task      — fine-tuned single-task models
#   multitask — models covering multiple tasks in one forward pass
# ---------------------------------------------------------------------------

MODEL_REGISTRY: dict[str, ModelSpec] = {
    # --- base ----------------------------------------------------------------
    "yolo26n": ModelSpec(
        name="yolo26n", version="2026.04.18",
        weights_path=str(_MODELS_DIR / "yolo26n.pt"),
    ),
    "yolo26s": ModelSpec(
        name="yolo26s", version="2026.04.18",
        weights_path=str(_MODELS_DIR / "yolo26s.pt"),
    ),
    "yolo26m": ModelSpec(
        name="yolo26m", version="2026.04.18",
        weights_path=str(_MODELS_DIR / "yolo26m.pt"),
    ),
    "yolo26x": ModelSpec(
        name="yolo26x", version="2026.04.18",
        weights_path=str(_MODELS_DIR / "yolo26x.pt"),
    ),

    # --- task-specific -------------------------------------------------------
    "face_mask": ModelSpec(
        name="face_mask_yolo26m",
        version="2026.04.28",
        weights_path=str(
            _RUNS_DIR
            / "face_mask_yolo26m"
            / "weights"
            / "best.pt"),
        task_classes=[0, 1, 2],
        class_labels={
            0: ClassLabel("improper_mask"),
            1: ClassLabel("mask"),
            2: ClassLabel("no_mask"),
        },
        description="Face mask detection (mask, no_mask, improper_mask)",
    ),

    "people_counting": ModelSpec(
        name="people_counting_yolo26m",
        version="2026.04.29",
        weights_path=str(
            _RUNS_DIR
            / "people_counting_yolo26m"
            / "weights"
            / "best.pt"
        ),
        task_classes=[0],
        class_labels={
            0: ClassLabel("person"),
        },
        description="People counting (person class only)",
    ),

    "helmet_and_vest": ModelSpec(
        name="helmet_and_vest_yolo26m",
        version="2026.05.03",
        weights_path=str(
            _RUNS_DIR
            / "helmet_and_vest_yolo26m"
            / "weights"
            / "best.pt"
        ),
        # Class 3 (person) sengaja di-skip — sudah di-handle dedicated model
        # `people_counting`. Kalau dipakai dua-duanya, person bakal double-count.
        task_classes=[0, 1, 2, 4],
        class_labels={
            0: ClassLabel("helmet"),
            1: ClassLabel("no_helmet"),
            2: ClassLabel("no_vest"),
            4: ClassLabel("vest"),
        },
        description="PPE detection (helmet, no-helmet, no-vest, vest); person via people_counting",
    ),

    # --- behavior (single-frame, Fase A) ------------------------------------
    # Deteksi orang dengan tangan di dalam saku. Single-frame (belum temporal);
    # aspek "sambil berjalan" menyusul di Fase B (butuh tracking + temporal).
    "hand_in_pocket": ModelSpec(
        name="hand_in_pocket_yolo26m",
        version="2026.06.19",
        weights_path=str(
            _RUNS_DIR
            / "hand_in_pocket_yolo26m"
            / "weights"
            / "best.pt"
        ),
        task_classes=[0, 1],
        class_labels={
            0: ClassLabel("hand_in_pocket"),
            1: ClassLabel("no_hand_in_pocket"),
        },
        description="Behavior: hand-in-pocket detection (hand_in_pocket, no_hand_in_pocket)",
    ),

    # Detektor objek HP. Single-class. BUKAN check sendiri — komponen pipeline
    # kompositional `holding_phone_count` (digabung dengan `green_lane` pose +
    # tracker di pipelines/infer.py). Weights dari notebook smartphone/02_train.
    "smartphone": ModelSpec(
        name="smartphone_yolo26m",
        version="2026.06.21",
        weights_path=str(
            _RUNS_DIR
            / "smartphone_yolo26m"
            / "weights"
            / "best.pt"
        ),
        task_classes=[0],
        class_labels={
            0: ClassLabel("smartphone"),
        },
        description="Smartphone object detector; component of holding_phone_count composite",
    ),

    # --- pose (green lane / red zone) ---------------------------------------
    # Person pose estimator (COCO 17-keypoint). Dipakai check `red_zone_count`:
    # titik kaki (ankle keypoint) diuji point-in-polygon terhadap ROI red zone.
    "green_lane": ModelSpec(
        name="green_lane_yolo26m_pose",
        version="2026.05.22",
        weights_path=str(_MODELS_DIR / "yolo26m-pose.pt"),
        task_classes=[0],
        class_labels={
            0: ClassLabel("person"),
        },
        description="Person pose estimation for green lane / red zone intrusion (foot-in-zone)",
    ),

    # --- multitask (PPE combined) -------------------------------------------
    # 14 kelas dari dataset Roboflow PPE Combined Model v8.
    # Training: 6 epoch yolo26m, batch=8, imgsz=640.
    "ppe_compliance": ModelSpec(
        name="ppe_compliance_yolo26m",
        version="2026.05.04",
        weights_path=str(
            _RUNS_DIR
            / "ppe_compliance_yolo26m"
            / "weights"
            / "best.pt"
        ),
        task_classes=list(range(14)),
        class_labels={
            0:  ClassLabel("fall_detected"),
            1:  ClassLabel("gloves"),
            2:  ClassLabel("goggles"),
            3:  ClassLabel("helmet"),
            4:  ClassLabel("ladder"),
            5:  ClassLabel("mask"),
            6:  ClassLabel("no_gloves"),
            7:  ClassLabel("no_goggles"),
            8:  ClassLabel("no_helmet"),
            9:  ClassLabel("no_mask"),
            10: ClassLabel("no_vest"),
            11: ClassLabel("person"),
            12: ClassLabel("safety_cone"),
            13: ClassLabel("vest"),
        },
        description="PPE combined (14 classes): hardhat, vest, mask, goggles, gloves, ladder, fall, cone",
    ),

    # --- Phase 3: shared backbone -------------------------------------------
    # Disabled sementara — mau test pipeline pakai standalone model dulu.
    # Aktifkan kembali dengan uncomment block di bawah.
    # "shared_backbone": ModelSpec(
    #     name="multitask_shared_backbone_v1",
    #     version="...",
    #     weights_path=str(
    #         _RUNS_DIR / "multitask_shared_backbone_v1" / "weights" / "best.pt"
    #     ),
    #     task_classes=[],   # all classes — routing handled by CHECK_TO_MODEL
    #     class_labels={
    #         0: ClassLabel("improper_mask"),
    #         1: ClassLabel("mask"),
    #         2: ClassLabel("no_mask"),
    #         3: ClassLabel("person"),
    #     },
    #     description="Shared backbone: improper_mask(0), mask(1), no_mask(2), person(3)",
    # ),
}

# ---------------------------------------------------------------------------
# Check definitions — single source of truth for selected_checks
# ---------------------------------------------------------------------------
# Satu check mewakili satu topik deteksi (mis. `helmet_count` mencakup baik
# orang dengan helmet maupun tanpa helmet). Tiap check punya satu atau lebih
# `CheckCategory` yang dihitung — frontend cukup pilih topiknya, breakdown
# per-kategori muncul di `details.breakdown` di response.
#
# Tambah topik baru = tambah satu entry di sini + pastikan model handler-nya
# sudah register di MODEL_REGISTRY. Schemas, routing, dan check evaluator
# semua derive dari dict ini.
# ---------------------------------------------------------------------------

CheckName = Literal[
    "person_count",
    "mask_count",
    "helmet_count",
    "vest_count",
    "goggles_count",
    "gloves_count",
    "ladder_count",
    "safety_cone_count",
    "fall_detected_count",
    "red_zone_count",
    "hand_in_pocket_count",
    "holding_phone_count",
    "handrail_count",
]

CHECK_NAMES: tuple[str, ...] = get_args(CheckName)


@dataclass(frozen=True)
class CheckCategory:
    """Sub-kategori yang dihitung dalam satu check.

    `key` = nama yang muncul di `details.breakdown`. `source_label` = label
    di `detections[]` yang dipakai sebagai kandidat. `attribute_filter`
    opsional — kalau diisi, hanya detection yang punya `attributes[k] == v`
    untuk semua (k, v) yang dihitung.
    """

    key: str
    source_label: str
    attribute_filter: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class CheckDefinition:
    """Definisi satu check yang bisa dipilih frontend via `selected_checks`.

    `value` di response = jumlah total semua category. Per-category count
    diekspos di `details.breakdown`.
    """

    name: str
    model_key: str
    categories: list[CheckCategory]
    description: str = ""
    # Model tambahan yang ikut dijalankan untuk check ini selain `model_key`.
    # Dipakai check kompositional yang butuh >1 model dalam 1 frame (mis.
    # holding_phone_count = green_lane[pose] + smartphone). `model_key` tetap
    # model "subjek" utama (person), aux di-fuse di post-processing infer.py.
    aux_models: list[str] = field(default_factory=list)


CHECK_DEFINITIONS: dict[str, CheckDefinition] = {
    "person_count": CheckDefinition(
        name="person_count",
        model_key="people_counting",
        categories=[
            CheckCategory(key="person", source_label="person"),
        ],
        description="Jumlah orang terdeteksi di frame",
    ),
    "mask_count": CheckDefinition(
        name="mask_count",
        model_key="face_mask",
        categories=[
            CheckCategory(key="mask", source_label="mask"),
            CheckCategory(key="no_mask", source_label="no_mask"),
            CheckCategory(key="improper_mask", source_label="improper_mask"),
        ],
        description="Hitung pemakaian masker (compliance, violation, improper)",
    ),
    "helmet_count": CheckDefinition(
        name="helmet_count",
        model_key="helmet_and_vest",
        categories=[
            CheckCategory(key="helmet", source_label="helmet"),
            CheckCategory(key="no_helmet", source_label="no_helmet"),
        ],
        description="Hitung pemakaian helmet (compliance dan violation)",
    ),
    "vest_count": CheckDefinition(
        name="vest_count",
        model_key="helmet_and_vest",
        categories=[
            CheckCategory(key="vest", source_label="vest"),
            CheckCategory(key="no_vest", source_label="no_vest"),
        ],
        description="Hitung pemakaian safety vest (compliance dan violation)",
    ),
    "goggles_count": CheckDefinition(
        name="goggles_count",
        model_key="ppe_compliance",
        categories=[
            CheckCategory(key="goggles", source_label="goggles"),
            CheckCategory(key="no_goggles", source_label="no_goggles"),
        ],
        description="Hitung pemakaian goggles (compliance dan violation)",
    ),
    "gloves_count": CheckDefinition(
        name="gloves_count",
        model_key="ppe_compliance",
        categories=[
            CheckCategory(key="gloves", source_label="gloves"),
            CheckCategory(key="no_gloves", source_label="no_gloves"),
        ],
        description="Hitung pemakaian sarung tangan (compliance dan violation)",
    ),
    "ladder_count": CheckDefinition(
        name="ladder_count",
        model_key="ppe_compliance",
        categories=[
            CheckCategory(key="ladder", source_label="ladder"),
        ],
        description="Hitung tangga di frame",
    ),
    "safety_cone_count": CheckDefinition(
        name="safety_cone_count",
        model_key="ppe_compliance",
        categories=[
            CheckCategory(key="safety_cone", source_label="safety_cone"),
        ],
        description="Hitung safety cone di frame",
    ),
    "fall_detected_count": CheckDefinition(
        name="fall_detected_count",
        model_key="ppe_compliance",
        categories=[
            CheckCategory(key="fall_detected", source_label="fall_detected"),
        ],
        description="Hitung kejadian fall detection",
    ),
    "red_zone_count": CheckDefinition(
        name="red_zone_count",
        model_key="green_lane",
        categories=[
            CheckCategory(key="person", source_label="person"),
        ],
        # Catatan: value default-nya hitung semua person, lalu di-override oleh
        # post-processing ROI di pipelines/infer.py menjadi jumlah orang yang
        # titik kakinya masuk red zone. Butuh `roi_polygon` di request.
        description="Hitung orang yang menginjak red zone (green lane detection)",
    ),
    "handrail_count": CheckDefinition(
        name="handrail_count",
        model_key="green_lane",
        categories=[
            CheckCategory(key="person", source_label="person"),
        ],
        # value di-override oleh post-processing di pipelines/infer.py: jumlah orang
        # yang kakinya di zona tangga tapi tangannya TIDAK dekat garis handrail.
        # Butuh `stairs_zone` (polygon) + `handrail_lines` (>=1 garis, tiap garis
        # >=2 titik; rail bisa di banyak sisi tangga) di request (top-level).
        description="Hitung orang di tangga yang tidak memegang handrail (pose + geometri)",
    ),
    "hand_in_pocket_count": CheckDefinition(
        name="hand_in_pocket_count",
        model_key="hand_in_pocket",
        categories=[
            CheckCategory(key="hand_in_pocket", source_label="hand_in_pocket"),
            CheckCategory(key="no_hand_in_pocket", source_label="no_hand_in_pocket"),
        ],
        description="Hitung orang dengan tangan di saku (violation) vs tidak",
    ),
    "holding_phone_count": CheckDefinition(
        name="holding_phone_count",
        model_key="green_lane",          # subjek: person + 17 pose keypoint
        # smartphone TIDAK di aux_models: deteksi HP full-frame mubazir untuk use
        # case ini (HP di tangan selalu di dalam crop tubuh). _apply_holding_phone
        # memanggil model smartphone langsung HANYA pada crop tiap orang (batched)
        # → hemat 1 inferensi full-frame per frame.
        categories=[
            CheckCategory(key="person", source_label="person"),
        ],
        description="Orang memegang HP sambil berjalan (pose person + smartphone di crop tubuh + motion)",
    ),
}

# Runtime invariant: pastikan CheckName Literal & CHECK_DEFINITIONS sinkron.
# Kalau gagal: berarti ada Literal tanpa definisi atau sebaliknya.
assert set(CHECK_DEFINITIONS.keys()) == set(CHECK_NAMES), (
    "CHECK_DEFINITIONS keys must match CheckName Literal args. "
    f"Missing in dict: {set(CHECK_NAMES) - set(CHECK_DEFINITIONS.keys())}; "
    f"Extra in dict: {set(CHECK_DEFINITIONS.keys()) - set(CHECK_NAMES)}"
)

# ---------------------------------------------------------------------------
# Check → model routing (derived)
# ---------------------------------------------------------------------------
# Maps a selected_check name to the registry key that handles it.
# When "shared_backbone" is registered above it will be used automatically
# for any check combination — see pipelines/infer.py.
# ---------------------------------------------------------------------------

CHECK_TO_MODEL: dict[str, str] = {
    name: spec.model_key for name, spec in CHECK_DEFINITIONS.items()
}
