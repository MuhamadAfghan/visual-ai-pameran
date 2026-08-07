from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from cctv_insight_ai.models.registry import CheckName


class InferenceThresholds(BaseModel):
    conf: float = Field(
        default=0.25,
        ge=0.0,
        le=1.0,
        description="Confidence threshold YOLO. Detection di bawah nilai ini dibuang.",
    )
    iou: float = Field(
        default=0.45,
        ge=0.0,
        le=1.0,
        description="IoU threshold untuk Non-Maximum Suppression antar bounding box.",
    )


class RoiPoint(BaseModel):
    """Satu titik polygon dalam koordinat ternormalisasi [0,1] relatif ke frame."""

    x: float = Field(ge=0.0, le=1.0, description="Posisi horizontal (kolom/width), 0–1.")
    y: float = Field(ge=0.0, le=1.0, description="Posisi vertikal (baris/height), 0–1.")


class RedZonePolygon(BaseModel):
    """Satu zona terlarang bernama — polygon + label."""

    name: str = Field(default="", description="Label zona, mis. 'Jalur Forklift A'.")
    points: list[RoiPoint] = Field(default_factory=list)


class CameraRules(BaseModel):
    """Aturan evaluasi violation untuk satu kamera.

    Backend adalah authoritative source — AI service tidak menyimpan rules.
    Tiap field optional: kalau tidak diset, violation terkait tidak dievaluasi.
    """

    crowd_threshold: int | None = Field(
        default=None,
        ge=0,
        description=(
            "Threshold maksimum jumlah orang di frame. Kalau `person_count > "
            "crowd_threshold`, violation `crowd_exceeded` di-fire."
        ),
    )


class InferenceRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "camera_id": "cam-01",
                "frame_id": "f-000123",
                "timestamp_utc": "2026-04-18T10:20:00Z",
                "image_uri": "captures/cam1/frame_000123.jpg",
                "selected_checks": ["person_count", "helmet_count"],
                "thresholds": {"conf": 0.3, "iou": 0.45},
                "rules": {"crowd_threshold": 5},
            }
        }
    )

    camera_id: str = Field(
        description=(
            "ID kamera sumber frame, otoritatif dari backend (mis. MongoDB "
            "ObjectId hex). AI hanya echo balik ke response untuk korelasi — "
            "tidak dipakai untuk lookup config di sisi AI."
        ),
    )
    frame_id: str = Field(
        description="ID unik frame. Diteruskan apa adanya ke response untuk korelasi backend.",
    )
    timestamp_utc: datetime = Field(
        description="Waktu frame ditangkap, ISO 8601 UTC.",
    )
    image_uri: str | None = Field(
        default=None,
        description=(
            "Path absolut atau URL gambar yang accessible oleh service AI. "
            "Salah satu dari `image_uri` atau `image_base64` wajib diisi."
        ),
    )
    image_base64: str | None = Field(
        default=None,
        description=(
            "Payload gambar raw base64-encoded. Dipakai kalau backend tidak bisa "
            "share filesystem dengan service AI."
        ),
    )
    selected_checks: list[CheckName] = Field(
        default_factory=list,
        description=(
            "Daftar check yang dijalankan. Boleh kosong — kalau kosong, AI "
            "hanya return detection mentah (dan tidak ada violation). Tiap "
            "check mewakili satu topik deteksi (mis. `helmet_count` mencakup "
            "helmet + no_helmet). Lihat `docs/api_reference.md` untuk daftar."
        ),
    )
    thresholds: InferenceThresholds = Field(
        default_factory=InferenceThresholds,
        description="Override threshold conf/IoU YOLO. Default `conf=0.25`, `iou=0.45`.",
    )
    rules: CameraRules = Field(
        default_factory=CameraRules,
        description=(
            "Aturan evaluasi violation per kamera, di-supply oleh backend. "
            "Kalau tidak diset, violation tidak dievaluasi."
        ),
    )
    roi_polygon: list[RoiPoint] = Field(
        default_factory=list,
        description="Deprecated — gunakan red_zones. Dipertahankan untuk backward compat.",
    )
    red_zones: list[RedZonePolygon] = Field(
        default_factory=list,
        description=(
            "Daftar zona terlarang bernama dalam koordinat [0,1]. "
            "Kalau diisi dan `red_zone_count` dipilih, AI cek titik kaki "
            "terhadap semua zona — satu zona diinjak = violation. "
            "Kalau kosong, fallback ke `roi_polygon` jika ada."
        ),
    )
    stairs_zone: list[RoiPoint] = Field(
        default_factory=list,
        description=(
            "Polygon area tangga (ternormalisasi [0,1]). Dipakai check "
            "`handrail_count`: orang yang titik kakinya di dalam zona ini dinilai "
            "apakah memegang handrail. Kosong = check di-skip."
        ),
    )
    handrail_lines: list[list[RoiPoint]] = Field(
        default_factory=list,
        description=(
            "Daftar polyline garis handrail. Tangga bisa punya rail di beberapa "
            "sisi, jadi ini LIST of polyline; tiap polyline >=2 titik ternormalisasi "
            "[0,1]. Orang di `stairs_zone` yang pergelangan tangannya jauh dari "
            "SEMUA garis dianggap tidak memegang -> violation `handrail_violation`. "
            "Kosong = check di-skip."
        ),
    )
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Object bebas yang diteruskan ke logging — tidak mempengaruhi inference.",
    )

    @model_validator(mode="after")
    def require_image_source(self) -> "InferenceRequest":
        if not self.image_uri and not self.image_base64:
            raise ValueError("Either image_uri or image_base64 must be provided")
        return self


class Detection(BaseModel):
    id: int = Field(description="Index deteksi di array (0-based, unik per response).")
    track_id: int | None = Field(
        default=None,
        description="Tracking ID antar-frame. `null` kalau tracker belum aktif.",
    )
    label: str = Field(
        description=(
            "Label kelas terdeteksi. Pakai pola `<noun>` positif atau `no_<noun>` "
            "negatif. Contoh: `person`, `helmet`, `no_helmet`, `mask`, `no_mask`."
        ),
    )
    confidence: float = Field(
        ge=0.0, le=1.0,
        description="Skor confidence YOLO (0–1).",
    )
    bbox: list[float] = Field(
        min_length=4, max_length=4,
        description="Bounding box format `[x1, y1, x2, y2]` dalam koordinat piksel.",
    )
    keypoints: list[list[float]] = Field(
        default_factory=list,
        description="Keypoints `[x, y, score]` per joint. Kosong kalau model bukan pose estimator.",
    )
    attributes: dict[str, Any] = Field(
        default_factory=dict,
        description="Atribut tambahan yang spesifik per label (mis. tracker metadata).",
    )


class Violation(BaseModel):
    type: str = Field(
        description="Tipe pelanggaran. Contoh: `crowd_exceeded`.",
    )
    severity: str = Field(
        description="Severity: `low` | `medium` | `high`.",
    )
    score: float = Field(
        ge=0.0, le=1.0,
        description="Skor confidence atau severity-normalized (0–1).",
    )
    track_id: int | None = Field(
        default=None,
        description="Track ID objek pelanggar kalau bisa di-attribute ke individu.",
    )
    details: dict[str, Any] = Field(
        default_factory=dict,
        description="Detail per tipe pelanggaran (mis. `threshold`, `person_count` untuk crowd_exceeded).",
    )


class CheckResult(BaseModel):
    check: CheckName = Field(
        description="Nama check yang sama dengan yang ada di request `selected_checks`.",
    )
    value: int = Field(
        description=(
            "Total semua kategori dalam check ini. Untuk check multi-kategori "
            "(mis. `helmet_count`), `value = breakdown.helmet + breakdown.no_helmet`."
        ),
    )
    confidence: float = Field(
        ge=0.0, le=1.0,
        description="Rata-rata confidence semua deteksi yang masuk ke check ini.",
    )
    details: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "Berisi `source_labels` (label di detections yang dihitung) dan "
            "`breakdown` (count per kategori). Lihat `docs/api_reference.md`."
        ),
    )


class InferenceResponse(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "camera_id": "cam-01",
                "frame_id": "f-000123",
                "timestamp_utc": "2026-04-18T10:20:00Z",
                "latency_ms": 42.7,
                "model_tasks_executed": ["people_counting", "helmet_and_vest"],
                "detections": [
                    {
                        "id": 0,
                        "track_id": None,
                        "label": "person",
                        "confidence": 0.91,
                        "bbox": [120.0, 80.0, 220.0, 320.0],
                        "keypoints": [],
                        "attributes": {},
                    }
                ],
                "check_results": [
                    {
                        "check": "person_count",
                        "value": 1,
                        "confidence": 0.91,
                        "details": {
                            "source_labels": ["person"],
                            "breakdown": {"person": 1},
                        },
                    }
                ],
                "violations": [],
                "meta": {"processed_at": "2026-04-18T10:20:00.123456Z", "runtime_device": "cuda"},
            }
        }
    )

    camera_id: str = Field(description="Echoed dari request.")
    frame_id: str = Field(description="Echoed dari request.")
    timestamp_utc: datetime = Field(description="Echoed dari request.")
    latency_ms: float = Field(
        ge=0.0,
        description="Durasi inference end-to-end di service AI (decode image + forward + post-processing).",
    )
    model_tasks_executed: list[str] = Field(
        default_factory=list,
        description=(
            "Daftar `model_key` yang dijalankan untuk request ini. Berguna untuk "
            "debugging & metric, bukan untuk logic backend."
        ),
    )
    detections: list[Detection] = Field(
        default_factory=list,
        description="Semua bounding box hasil inference, sudah dideduplikasi cross-model.",
    )
    check_results: list[CheckResult] = Field(
        default_factory=list,
        description="Hasil agregasi per check. Panjang array = panjang `selected_checks` yang dikenali.",
    )
    violations: list[Violation] = Field(
        default_factory=list,
        description="Pelanggaran yang dievaluasi terhadap `rules` yang dikirim backend di request.",
    )
    meta: dict[str, Any] = Field(
        default_factory=dict,
        description="Metadata diagnostik (mis. `processed_at`, `runtime_device`).",
    )
