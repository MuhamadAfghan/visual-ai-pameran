from __future__ import annotations

import concurrent.futures
import math
import os
import time

import numpy as np

from cctv_insight_ai.models.loader import model_manager
from cctv_insight_ai.models.registry import (
    CHECK_DEFINITIONS,
    CHECK_TO_MODEL,
    MODEL_REGISTRY,
    ClassLabel,
)
from cctv_insight_ai.pipelines.tracking import camera_track_store
from cctv_insight_ai.service.schemas import CameraRules, InferenceRequest
from cctv_insight_ai.utils import pick_runtime_device
from cctv_insight_ai.utils.io import load_image


# ---------------------------------------------------------------------------
# YOLO result → unified detection dicts
# ---------------------------------------------------------------------------
# Tiap model punya namespace class-id sendiri. Mapping class-id → label/atribut
# diambil dari `class_labels` di ModelSpec (lihat models/registry.py).

_DEDUP_IOU_THRESHOLD = 0.5


def _bbox_iou(a: list[float], b: list[float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    iw = max(0.0, min(ax2, bx2) - max(ax1, bx1))
    ih = max(0.0, min(ay2, by2) - max(ay1, by1))
    inter = iw * ih
    if inter == 0:
        return 0.0
    union = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / union if union > 0 else 0.0


def _dedup_same_label(detections: list[dict]) -> list[dict]:
    """Drop detection yang overlap berat dgn yang lain (label sama, conf lebih rendah).

    Patch untuk ultralytics NMS yang kadang loloskan duplikat dari multi-scale
    head — terutama di people_counting waktu satu orang ke-detect 2x.
    """
    by_conf = sorted(detections, key=lambda d: d["confidence"], reverse=True)
    kept: list[dict] = []
    for d in by_conf:
        if any(
            d["label"] == k["label"]
            and _bbox_iou(d["bbox"], k["bbox"]) > _DEDUP_IOU_THRESHOLD
            for k in kept
        ):
            continue
        kept.append(d)
    return kept


def _parse_yolo_results(
    yolo_results,
    allowed_class_ids: set[int],
    class_labels: dict[int, ClassLabel],
) -> list[dict]:
    detections: list[dict] = []
    if not yolo_results or yolo_results[0].boxes is None:
        return detections

    # Pose model menyertakan keypoints sejajar (by-index) dengan boxes.
    # Model deteksi biasa: keypoints None → keypoints list kosong per detection.
    kpts_data = None
    kpts_obj = getattr(yolo_results[0], "keypoints", None)
    if kpts_obj is not None and getattr(kpts_obj, "data", None) is not None and len(kpts_obj.data):
        kpts_data = kpts_obj.data  # tensor [n, k, 3] → (x, y, score)

    for i, box in enumerate(yolo_results[0].boxes):
        cls_id = int(box.cls.item())
        if allowed_class_ids and cls_id not in allowed_class_ids:
            continue

        x1, y1, x2, y2 = box.xyxy[0].tolist()

        spec = class_labels.get(cls_id)
        if spec is not None:
            label = spec.label
            attributes = dict(spec.attributes)
        else:
            label = f"class_{cls_id}"
            attributes = {"class_id": cls_id}

        keypoints: list[list[float]] = []
        if kpts_data is not None and i < len(kpts_data):
            for kp in kpts_data[i].tolist():
                x, y = float(kp[0]), float(kp[1])
                score = float(kp[2]) if len(kp) > 2 else 0.0
                keypoints.append([round(x, 1), round(y, 1), round(score, 3)])

        detections.append({
            "id": 0,  # will be re-assigned after merge
            "track_id": None,
            "label": label,
            "confidence": round(float(box.conf.item()), 4),
            "bbox": [round(x1, 1), round(y1, 1), round(x2, 1), round(y2, 1)],
            "keypoints": keypoints,
            "attributes": attributes,
        })

    return _dedup_same_label(detections)


# ---------------------------------------------------------------------------
# Single-model runner (used by both sequential and parallel paths)
# ---------------------------------------------------------------------------

def _run_model(
    model_key: str,
    class_ids: set[int],
    frame: np.ndarray,
    conf: float,
    iou: float,
    device: str,
) -> tuple[str, list[dict]]:
    model = model_manager.get(model_key)
    results = model.predict(frame, conf=conf, iou=iou, device=device, verbose=False)
    class_labels = MODEL_REGISTRY[model_key].class_labels
    return model_key, _parse_yolo_results(results, class_ids, class_labels)


# ---------------------------------------------------------------------------
# Routing — which models do we need for this request?
# ---------------------------------------------------------------------------

def _required_models(selected_checks: list[str]) -> dict[str, set[int]]:
    """Return {model_key: {class_ids}} for every check in the request.

    Termasuk `aux_models` — check kompositional (mis. holding_phone_count) butuh
    model utama + model tambahan dalam satu frame.
    """
    mapping: dict[str, set[int]] = {}
    for check in selected_checks:
        cdef = CHECK_DEFINITIONS.get(check)
        if cdef is None:
            continue
        for mk in (cdef.model_key, *cdef.aux_models):
            spec = MODEL_REGISTRY[mk]
            mapping.setdefault(mk, set()).update(spec.task_classes)
    return mapping


# ---------------------------------------------------------------------------
# Detector — Phase 0-3 unified
# ---------------------------------------------------------------------------

def _run_detector(
    payload: InferenceRequest,
    frame: np.ndarray,
    device: str,
) -> tuple[list[dict], list[str]]:
    conf = payload.thresholds.conf
    iou = payload.thresholds.iou

    # ------------------------------------------------------------------
    # Phase 3: shared backbone registered → single forward pass for all checks
    # ------------------------------------------------------------------
    if "shared_backbone" in MODEL_REGISTRY:
        needed_classes: set[int] = set()
        for check in payload.selected_checks:
            mk = CHECK_TO_MODEL.get(check)
            if mk:
                needed_classes.update(MODEL_REGISTRY[mk].task_classes)
        _, detections = _run_model("shared_backbone", needed_classes, frame, conf, iou, device)
        _assign_ids(detections)
        return detections, ["shared_backbone"]

    # ------------------------------------------------------------------
    # Phase 1 / 2: separate models per task
    # ------------------------------------------------------------------
    required = _required_models(payload.selected_checks)
    if not required:
        return [], []

    all_detections: list[dict] = []
    models_used: list[str] = []

    if len(required) == 1:
        # Phase 1 — single model, no threading overhead
        model_key, class_ids = next(iter(required.items()))
        _, dets = _run_model(model_key, class_ids, frame, conf, iou, device)
        all_detections.extend(dets)
        models_used.append(model_key)
    else:
        # Phase 2 — multiple models → run in parallel on GPU
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(required)) as pool:
            futures = [
                pool.submit(_run_model, mk, cids, frame, conf, iou, device)
                for mk, cids in required.items()
            ]
            for future in concurrent.futures.as_completed(futures):
                mk, dets = future.result()
                all_detections.extend(dets)
                models_used.append(mk)

    # Dedup cross-model: model berbeda bisa detect objek yang sama
    # (misal vest dari helmet_and_vest + ppe_compliance).
    all_detections = _dedup_same_label(all_detections)
    _assign_ids(all_detections)
    return all_detections, models_used


def _assign_ids(detections: list[dict]) -> None:
    for i, d in enumerate(detections):
        d["id"] = i


# ---------------------------------------------------------------------------
# Check derivation — pure function over unified detections
# ---------------------------------------------------------------------------

def _compute_check_results(selected_checks: list[str], detections: list[dict]) -> list[dict]:
    by_label: dict[str, list[dict]] = {}
    for d in detections:
        by_label.setdefault(d["label"], []).append(d)

    def _avg_conf(items: list[dict]) -> float:
        if not items:
            return 0.0
        return round(sum(d["confidence"] for d in items) / len(items), 3)

    def _matches_filter(det: dict, attr_filter: dict[str, str]) -> bool:
        attrs = det.get("attributes", {})
        return all(attrs.get(k) == v for k, v in attr_filter.items())

    results: list[dict] = []
    for check_name in selected_checks:
        spec = CHECK_DEFINITIONS.get(check_name)
        if spec is None:
            continue

        all_matched: list[dict] = []
        breakdown: dict[str, int] = {}
        source_labels: set[str] = set()
        # Internal-only (not part of the wire response — grpc_app.py's
        # _check_result_to_proto only reads known fields): per-category detection
        # lists, so a later pass (e.g. _apply_ppe_violator_tracking) can assign
        # track_id to the individual violators instead of just a count.
        category_detections: dict[str, list[dict]] = {}
        for cat in spec.categories:
            candidates = by_label.get(cat.source_label, [])
            if cat.attribute_filter:
                matched = [d for d in candidates if _matches_filter(d, cat.attribute_filter)]
            else:
                matched = candidates
            all_matched.extend(matched)
            breakdown[cat.key] = len(matched)
            source_labels.add(cat.source_label)
            category_detections[cat.key] = matched

        results.append({
            "check": check_name,
            "value": len(all_matched),
            "confidence": _avg_conf(all_matched),
            "details": {
                "source_labels": sorted(source_labels),
                "breakdown": breakdown,
            },
            "_category_detections": category_detections,
        })

    return results


# ---------------------------------------------------------------------------
# ROI / red zone (green lane detection)
# ---------------------------------------------------------------------------
# Polygon datang ternormalisasi [0,1] dari backend, di-scale ke piksel frame.
# Titik acuan "kaki" = rata-rata ankle keypoint (COCO 15=left, 16=right) yang
# cukup yakin; fallback ke tengah-bawah bbox kalau keypoint tidak ada/low score.

_LEFT_ANKLE_IDX = 15
_RIGHT_ANKLE_IDX = 16
_ANKLE_MIN_SCORE = 0.3


def _foot_point(det: dict) -> tuple[float, float]:
    kpts = det.get("keypoints") or []
    ankles: list[tuple[float, float]] = []
    for idx in (_LEFT_ANKLE_IDX, _RIGHT_ANKLE_IDX):
        if idx < len(kpts):
            x, y, score = kpts[idx][0], kpts[idx][1], kpts[idx][2]
            if score >= _ANKLE_MIN_SCORE:
                ankles.append((x, y))
    if ankles:
        return (sum(p[0] for p in ankles) / len(ankles), sum(p[1] for p in ankles) / len(ankles))
    # Fallback: tengah-bawah bounding box (perkiraan posisi kaki)
    x1, y1, x2, y2 = det["bbox"]
    return ((x1 + x2) / 2.0, y2)


def _point_in_polygon(point: tuple[float, float], polygon: list[tuple[float, float]]) -> bool:
    """Ray-casting point-in-polygon. `polygon` minimal 3 titik (piksel)."""
    if len(polygon) < 3:
        return False
    px, py = point
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if (yi > py) != (yj > py):
            x_cross = (xj - xi) * (py - yi) / (yj - yi) + xi
            if px < x_cross:
                inside = not inside
        j = i
    return inside


def _apply_red_zone(
    payload: InferenceRequest,
    detections: list[dict],
    red_zones: list,
    frame_shape: tuple[int, ...],
    check_results: list[dict],
    roi_polygon: list | None = None,
) -> None:
    """Override `red_zone_count` dengan jumlah orang yang kakinya masuk zona manapun.

    `red_zones` adalah list of RedZonePolygon (multi-zone).
    `roi_polygon` adalah legacy fallback (single polygon).
    Memodifikasi `check_results` dan `detections[].attributes.in_red_zone` in-place.
    """
    if "red_zone_count" not in payload.selected_checks:
        return

    cr = next((c for c in check_results if c["check"] == "red_zone_count"), None)
    if cr is None:
        return

    height, width = frame_shape[0], frame_shape[1]

    # Build list of pixel-space polygons from red_zones; fallback to roi_polygon
    polygons_px: list[list[tuple[float, float]]] = []
    for zone in (red_zones or []):
        pts = [(p.x * width, p.y * height) for p in zone.points]
        if len(pts) >= 3:
            polygons_px.append(pts)

    if not polygons_px and roi_polygon:
        pts = [(p.x * width, p.y * height) for p in roi_polygon]
        if len(pts) >= 3:
            polygons_px.append(pts)

    persons = [det for det in detections if det["label"] == "person"]
    if persons:
        ts = payload.timestamp_utc.timestamp()
        camera_track_store.update(f"{payload.camera_id}::red_zone_count", ts, persons)

    intruders: list[dict] = []
    if polygons_px:
        for det in persons:
            foot = _foot_point(det)
            in_any = any(_point_in_polygon(foot, poly) for poly in polygons_px)
            det.setdefault("attributes", {})["in_red_zone"] = "true" if in_any else "false"
            if in_any:
                intruders.append(det)

    count = len(intruders)
    avg_conf = round(sum(d["confidence"] for d in intruders) / count, 3) if count else 0.0
    cr["value"] = count
    cr["confidence"] = avg_conf
    cr["details"] = {
        "source_labels": ["person"],
        "breakdown": {"in_red_zone": count},
    }
    cr["_violator_detections"] = intruders


# ---------------------------------------------------------------------------
# Handrail — orang di tangga yang tidak memegang pegangan
# ---------------------------------------------------------------------------
# Handrail itu objek DIAM → tidak perlu dideteksi; cukup didefinisikan per kamera
# sebagai satu/lebih garis (`handrail_lines`, rail bisa di banyak sisi) +
# zona tangga (`stairs_zone`), pola sama dgn red_zone. Logika: orang yang
# kakinya di zona tangga & keypoint wrist-nya JAUH dari SEMUA garis handrail =
# tidak memegang → violation. Murni pose + geometri, tanpa model objek.
# Konservatif: kalau wrist tidak terlihat, TIDAK di-flag.
_LEFT_WRIST_IDX = 9
_RIGHT_WRIST_IDX = 10
_WRIST_MIN_SCORE = 0.3
# "memegang" kalau jarak wrist->garis <= ini * tinggi-bbox-orang (scale-invariant).
_HANDRAIL_MAX_DIST = 0.20


def _wrist_points(det: dict) -> list[tuple[float, float]]:
    kpts = det.get("keypoints") or []
    out: list[tuple[float, float]] = []
    for idx in (_LEFT_WRIST_IDX, _RIGHT_WRIST_IDX):
        if idx < len(kpts):
            x, y, score = kpts[idx][0], kpts[idx][1], kpts[idx][2]
            if score >= _WRIST_MIN_SCORE:
                out.append((float(x), float(y)))
    return out


def _point_to_segment_dist(p, a, b) -> float:
    px, py = p
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    if dx == 0.0 and dy == 0.0:
        return math.hypot(px - ax, py - ay)
    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _dist_to_polyline(p, line_px: list[tuple[float, float]]) -> float:
    return min(_point_to_segment_dist(p, line_px[i], line_px[i + 1]) for i in range(len(line_px) - 1))


def _dist_to_polylines(p, lines_px: list[list[tuple[float, float]]]) -> float:
    """Jarak terdekat dari titik `p` ke salah satu polyline (rail bisa di banyak sisi)."""
    return min(_dist_to_polyline(p, line) for line in lines_px)


def _apply_handrail(
    payload: InferenceRequest,
    detections: list[dict],
    stairs_zone: list,
    handrail_lines: list,
    frame_shape: tuple[int, ...],
    check_results: list[dict],
) -> None:
    """Override `handrail_count` = jumlah orang di zona tangga yg TIDAK memegang
    handrail. Menandai `detections[].attributes` (on_stairs/holding_handrail)
    in-place. Tanpa efek kalau check tak dipilih / zona<3 titik / garis<2 titik.
    Orang tanpa keypoint wrist tidak dinilai (konservatif, hindari false positive).
    """
    if "handrail_count" not in payload.selected_checks:
        return
    cr = next((c for c in check_results if c["check"] == "handrail_count"), None)
    if cr is None:
        return

    height, width = frame_shape[0], frame_shape[1]
    zone_px = [(p.x * width, p.y * height) for p in stairs_zone]
    # banyak garis (rail bisa di kiri & kanan); buang polyline < 2 titik.
    lines_px = [[(p.x * width, p.y * height) for p in line]
                for line in handrail_lines if len(line) >= 2]

    persons = [det for det in detections if det["label"] == "person"]
    if persons:
        ts = payload.timestamp_utc.timestamp()
        camera_track_store.update(f"{payload.camera_id}::handrail_count", ts, persons)

    on_stairs = holding = not_holding = 0
    violators: list[dict] = []
    if len(zone_px) >= 3 and lines_px:
        for det in persons:
            attrs = det.setdefault("attributes", {})
            if not _point_in_polygon(_foot_point(det), zone_px):
                attrs["on_stairs"] = "false"
                continue
            on_stairs += 1
            attrs["on_stairs"] = "true"
            wrists = _wrist_points(det)
            if not wrists:
                attrs["holding_handrail"] = "unknown"  # tak bisa dinilai → tak di-flag
                continue
            x1, y1, x2, y2 = det["bbox"]
            person_h = max(1.0, y2 - y1)
            near = any(_dist_to_polylines(wr, lines_px) / person_h <= _HANDRAIL_MAX_DIST for wr in wrists)
            attrs["holding_handrail"] = "true" if near else "false"
            if near:
                holding += 1
            else:
                not_holding += 1
                violators.append(det)

    cr["value"] = not_holding
    cr["confidence"] = round(sum(d["confidence"] for d in violators) / not_holding, 3) if not_holding else 0.0
    cr["details"] = {
        "source_labels": ["person"],
        "breakdown": {"on_stairs": on_stairs, "holding": holding, "not_holding": not_holding},
    }
    cr["_violator_detections"] = violators


# ---------------------------------------------------------------------------
# Walking gate (Fase B — temporal, stateful per camera)
# ---------------------------------------------------------------------------
# Some behavior detections (hand_in_pocket, holding_phone) only matter for the
# safety rule when the person is *moving* (trip / inattention hazard while
# walking). We track that behavior's boxes across frames via camera_track_store,
# which marks each `walking`, then expose a `walking` count in the check
# breakdown. The violation fires only on walking (see _evaluate_violations).
# Requires continuous, in-order frames per camera — isolated single frames never
# accumulate motion, so `walking` stays false.
#
# State is namespaced per check (`camera_id::check_name`): a frame feeds each
# behavior's tracker once. Without this, two walking-gated checks in the same
# request would call update() twice with the same ts, and the second call would
# be rejected as out-of-order (camera_track_store treats ts <= last_ts as stale),
# wrongly marking everything walking=false.
_HAND_IN_POCKET_LABELS = ("hand_in_pocket", "no_hand_in_pocket")


def _apply_walking_gate(
    payload: InferenceRequest,
    detections: list[dict],
    check_results: list[dict],
    *,
    check_name: str,
    track_labels: tuple[str, ...],
    walking_label: str,
) -> None:
    """Track `track_labels` boxes, count those `walking`, write to breakdown.

    `walking_label` is the (positive) label whose walking instances are counted
    and gate the violation. `track_labels` may be wider than `walking_label` so a
    track survives label flips between frames (e.g. hand_in_pocket flips to
    no_hand_in_pocket and back on the same person).
    """
    if check_name not in payload.selected_checks:
        return

    ts = payload.timestamp_utc.timestamp()
    tracked = [d for d in detections if d["label"] in track_labels]
    camera_track_store.update(f"{payload.camera_id}::{check_name}", ts, tracked)

    walking_violators = [
        d for d in tracked
        if d["label"] == walking_label
        and d.get("attributes", {}).get("walking") == "true"
    ]
    for cr in check_results:
        if cr["check"] == check_name:
            cr["details"].setdefault("breakdown", {})["walking"] = len(walking_violators)
            cr["_violator_detections"] = walking_violators
            break


def _apply_hand_in_pocket_walking(
    payload: InferenceRequest,
    detections: list[dict],
    check_results: list[dict],
) -> None:
    _apply_walking_gate(
        payload, detections, check_results,
        check_name="hand_in_pocket_count",
        track_labels=_HAND_IN_POCKET_LABELS,
        walking_label="hand_in_pocket",
    )


# ---------------------------------------------------------------------------
# Holding phone — compositional (person+pose + smartphone + motion), Fase B
# ---------------------------------------------------------------------------
# Bukan single-class. Per orang:
#   1) HP di tangan  — bbox smartphone dekat keypoint pergelangan tangan (gate)
#   2) berjalan      — tracker temporal (camera_track_store) (gate)
#   3) menunduk      — proxy "melihat HP" (INFORMASI saja di breakdown, bukan gate)
# Violation = orang yang (1) ∧ (2). Heuristik 2D — kalibrasi per kamera. Butuh
# person dari `green_lane` (punya keypoint); tanpa keypoint, in-hand pakai
# fallback (pusat HP di dalam bbox orang).
#
# COCO-17 keypoint index:
_KP_NOSE = 0
_KP_L_SHOULDER, _KP_R_SHOULDER = 5, 6
_KP_L_WRIST, _KP_R_WRIST = 9, 10
_KP_L_HIP, _KP_R_HIP = 11, 12
_KP_MIN_SCORE = 0.3
# HP "di tangan" kalau pusatnya <= jarak ini dari salah satu wrist, dinormalisasi
# ke tinggi bbox orang (scale-invariant terhadap jarak ke kamera).
_PHONE_HAND_MAX_DIST = 0.45
# "menunduk" kalau gap vertikal (bahu - hidung) / tinggi torso <= ambang ini.
# Tegak hadap kamera: hidung jauh di atas bahu (gap ~0.3-0.5); menunduk → mengecil.
_HEAD_DOWN_MAX_GAP = 0.12


def _kp_xy(det: dict, idx: int) -> tuple[float, float] | None:
    """Ambil (x, y) keypoint ke-idx kalau score-nya cukup, else None."""
    kpts = det.get("keypoints") or []
    if idx >= len(kpts):
        return None
    x, y, score = kpts[idx][0], kpts[idx][1], kpts[idx][2]
    if score < _KP_MIN_SCORE:
        return None
    return (float(x), float(y))


def _kp_mid(a: tuple | None, b: tuple | None) -> tuple[float, float] | None:
    if a and b:
        return ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)
    return a or b


def _phone_in_hand(person: dict, phones: list[dict]) -> bool:
    if not phones:
        return False
    x1, y1, x2, y2 = person["bbox"]
    person_h = max(1.0, y2 - y1)
    wrists = [w for w in (_kp_xy(person, _KP_L_WRIST), _kp_xy(person, _KP_R_WRIST)) if w]
    for ph in phones:
        px1, py1, px2, py2 = ph["bbox"]
        pcx, pcy = (px1 + px2) / 2.0, (py1 + py2) / 2.0
        if wrists:
            for wx, wy in wrists:
                dist = ((pcx - wx) ** 2 + (pcy - wy) ** 2) ** 0.5
                if dist / person_h <= _PHONE_HAND_MAX_DIST:
                    return True
        elif x1 <= pcx <= x2 and y1 <= pcy <= y2:
            # Tanpa keypoint wrist: fallback pusat HP di dalam bbox orang.
            return True
    return False


def _head_down(person: dict) -> bool:
    nose = _kp_xy(person, _KP_NOSE)
    shoulder = _kp_mid(_kp_xy(person, _KP_L_SHOULDER), _kp_xy(person, _KP_R_SHOULDER))
    hip = _kp_mid(_kp_xy(person, _KP_L_HIP), _kp_xy(person, _KP_R_HIP))
    if not nose or not shoulder or not hip:
        return False  # kurang keypoint → tidak bisa dinilai, jangan fire
    torso_h = hip[1] - shoulder[1]
    if torso_h <= 0:
        return False
    gap = (shoulder[1] - nose[1]) / torso_h  # >0 = kepala di atas bahu
    return gap <= _HEAD_DOWN_MAX_GAP


# Per-track signal hold. phone-in-hand dan walking masing-masing berkedip antar
# frame (HP kecil; gerak dekat ambang). Kalau keduanya diharuskan benar di frame
# yang SAMA, violation jadi langka. Kita ingat kapan terakhir tiap sinyal benar
# per track, lalu fire kalau KEDUANYA pernah benar dalam window ini.
_HP_SIGNAL_HOLD_SECONDS = 1.5
# camera_id -> track_id -> {"phone": last_ts, "walk": last_ts}
_hp_signal_state: dict[str, dict[int, dict[str, float]]] = {}


def _hp_violation_held(
    camera_id: str, track_id: int | None, in_hand: bool, walks: bool, ts: float
) -> bool:
    """True kalau track ini punya phone-in-hand DAN walking dalam hold window.

    track_id None (tak ter-track / frame out-of-order) → fallback ke AND seketika.
    """
    if track_id is None:
        return in_hand and walks
    cam = _hp_signal_state.setdefault(camera_id, {})
    stale = [t for t, s in cam.items()
             if ts - max(s["phone"], s["walk"]) > 2 * _HP_SIGNAL_HOLD_SECONDS]
    for t in stale:
        del cam[t]
    st = cam.setdefault(track_id, {"phone": float("-inf"), "walk": float("-inf")})
    if in_hand:
        st["phone"] = ts
    if walks:
        st["walk"] = ts
    return (ts - st["phone"] <= _HP_SIGNAL_HOLD_SECONDS
            and ts - st["walk"] <= _HP_SIGNAL_HOLD_SECONDS)


# HP di jarak CCTV cuma beberapa piksel → detektor smartphone (dilatih close-up)
# jarang menangkapnya di frame penuh. Solusi: jalankan model smartphone pada CROP
# tiap orang yang di-zoom (letterbox ke imgsz model) — HP jadi besar relatif ke
# crop, cocok dgn distribusi training. Deteksi crop dipetakan balik ke koordinat
# frame penuh lalu di-merge+dedup dengan deteksi full-frame.
_MAX_CROP_PERSONS = 12       # batasi biaya per frame di scene ramai
_CROP_PAD = 0.10             # padding bbox orang sebelum crop
_CROP_PHONE_CONF = 0.35      # dinaikkan dari 0.20 — kurangi deteksi conf-rendah yg meleset


def _detect_phones_in_person_crops(
    frame: np.ndarray, persons: list[dict], iou: float, device: str
) -> list[dict]:
    """Jalankan model smartphone pada crop tiap orang; balikkan deteksi di
    koordinat frame penuh. Menaikkan recall HP kecil di jarak jauh."""
    if frame is None or not persons:
        return []
    h, w = frame.shape[0], frame.shape[1]
    crops: list[np.ndarray] = []
    offsets: list[tuple[int, int]] = []
    for p in persons[:_MAX_CROP_PERSONS]:
        x1, y1, x2, y2 = p["bbox"]
        pw, ph = x2 - x1, y2 - y1
        cx1, cy1 = max(0, int(x1 - _CROP_PAD * pw)), max(0, int(y1 - _CROP_PAD * ph))
        cx2, cy2 = min(w, int(x2 + _CROP_PAD * pw)), min(h, int(y2 + _CROP_PAD * ph))
        crop = frame[cy1:cy2, cx1:cx2]
        if crop.size == 0:
            continue
        crops.append(crop)
        offsets.append((cx1, cy1))
    if not crops:
        return []
    # SATU panggilan batched (bukan N panggilan terpisah): overhead per-call
    # (setup predictor + transfer) diamortisasi → jauh lebih cepat di scene ramai.
    results = model_manager.get("smartphone").predict(
        crops, conf=_CROP_PHONE_CONF, iou=iou, device=device, verbose=False
    )
    found: list[dict] = []
    for res, (cx1, cy1) in zip(results, offsets):
        for b in res.boxes:
            bx1, by1, bx2, by2 = b.xyxy[0].tolist()
            found.append({
                "id": 0, "track_id": None, "label": "smartphone",
                "confidence": float(b.conf[0]),
                "bbox": [bx1 + cx1, by1 + cy1, bx2 + cx1, by2 + cy1],
                "keypoints": [], "attributes": {"source": "crop"},
            })
    return found


def _apply_holding_phone(
    payload: InferenceRequest,
    detections: list[dict],
    check_results: list[dict],
    frame: np.ndarray | None = None,
    device: str = "cpu",
) -> None:
    """Override holding_phone_count = jumlah orang (HP-di-tangan ∧ berjalan).

    Memodifikasi `detections[].attributes` (phone_in_hand/head_down/walking) dan
    `check_results` in-place. Butuh continuous in-order frames untuk `walking`.
    `head_down` dihitung & diekspos di breakdown tapi tidak memengaruhi violation.
    Kalau `frame` diberikan, recall HP dinaikkan via deteksi di crop tubuh.
    """
    if "holding_phone_count" not in payload.selected_checks:
        return

    persons = [d for d in detections if d["label"] == "person"]
    phones = [d for d in detections if d["label"] == "smartphone"]

    # Tambah deteksi HP dari crop tubuh (dedup vs full-frame yang sudah ada).
    for cp in _detect_phones_in_person_crops(frame, persons, payload.thresholds.iou, device):
        if not any(_bbox_iou(cp["bbox"], ph["bbox"]) > 0.5 for ph in phones):
            phones.append(cp)
            detections.append(cp)

    # Walking: track orang. Namespaced per-check supaya tidak bentrok update frame
    # dengan walking-gate check lain (lihat _apply_walking_gate).
    ts = payload.timestamp_utc.timestamp()
    camera_track_store.update(f"{payload.camera_id}::holding_phone_count", ts, persons)

    with_phone = looking = walking = violating = 0
    violators: list[dict] = []
    for p in persons:
        in_hand = _phone_in_hand(p, phones)
        down = _head_down(p)
        walks = p.get("attributes", {}).get("walking") == "true"
        attrs = p.setdefault("attributes", {})
        attrs["phone_in_hand"] = "true" if in_hand else "false"
        attrs["head_down"] = "true" if down else "false"
        with_phone += int(in_hand)
        looking += int(down)
        walking += int(walks)
        # Violation = HP di tangan ∧ berjalan, dijembatani hold window supaya
        # kedipan kedua sinyal tidak harus bertepatan. `head_down` TIDAK memblokir
        # (proxy 2D rapuh); tetap dihitung untuk informasi di breakdown.
        if _hp_violation_held(payload.camera_id, p.get("track_id"), in_hand, walks, ts):
            violating += 1
            violators.append(p)

    for cr in check_results:
        if cr["check"] == "holding_phone_count":
            cr["value"] = violating
            cr["confidence"] = (
                round(sum(p["confidence"] for p in violators) / violating, 3)
                if violating else 0.0
            )
            cr["details"] = {
                "source_labels": ["person"],
                "breakdown": {
                    "with_phone": with_phone,
                    "looking_down": looking,
                    "walking": walking,
                    "violating": violating,
                },
            }
            cr["_violator_detections"] = violators
            break


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------

def _severity_for_crowd_exceeded(count: int, threshold: int) -> str:
    """Severity ranking untuk crowd_exceeded violation.

    threshold=0 = zero-tolerance zone (mis. restricted area). Apapun yang
    terdeteksi langsung `high`, skip ratio calc (hindari division by zero).
    threshold>=1 = pakai ratio count/threshold.
    """
    if threshold <= 0:
        return "high"
    ratio = count / threshold
    if ratio >= 2.0:
        return "high"
    if ratio >= 1.5:
        return "medium"
    return "low"


# PPE compliance violations: check name → spec violation per-APD.
# Zero-tolerance & per-PPE: tiap check PPE punya kategori negatif `no_*` di
# breakdown (lihat CHECK_DEFINITIONS). Violation di-fire begitu count `no_*` > 0.
# Tidak butuh rules field — sama seperti red_zone, kehadiran check di
# selected_checks (di-gate backend) yang jadi opt-in. `severity` fixed sesuai
# tingkat risiko cedera bila APD tidak dipakai. `breakdown_key` = key kategori
# negatif di breakdown; `count_key` = nama field jumlah di details_json.
_PPE_VIOLATIONS: dict[str, dict[str, str]] = {
    "helmet_count": {
        "type": "no_helmet_violation",
        "breakdown_key": "no_helmet",
        "count_key": "no_helmet_count",
        "severity": "high",
    },
    "mask_count": {
        "type": "no_mask_violation",
        "breakdown_key": "no_mask",
        "count_key": "no_mask_count",
        "severity": "medium",
    },
    "vest_count": {
        "type": "no_vest_violation",
        "breakdown_key": "no_vest",
        "count_key": "no_vest_count",
        "severity": "medium",
    },
    "goggles_count": {
        "type": "no_goggles_violation",
        "breakdown_key": "no_goggles",
        "count_key": "no_goggles_count",
        "severity": "medium",
    },
    "gloves_count": {
        "type": "no_gloves_violation",
        "breakdown_key": "no_gloves",
        "count_key": "no_gloves_count",
        "severity": "low",
    },
    "fall_detected_count": {
        "type": "fall_detected_violation",
        "breakdown_key": "fall_detected",
        "count_key": "fall_detected_count",
        "severity": "high",
    },
}


def _apply_ppe_violator_tracking(payload: InferenceRequest, check_results: list[dict]) -> None:
    """Assign track_id to each individual PPE-violation detection (`no_helmet`,
    `no_mask`, ...) so `_evaluate_violations` can fire one violation per person
    instead of one aggregate per check. Namespaced per check+category (same
    pattern as `_apply_walking_gate`) so an empty/absent category never
    disturbs another category's tracker state.
    """
    ts = payload.timestamp_utc.timestamp()
    for cr in check_results:
        spec = _PPE_VIOLATIONS.get(cr["check"])
        if spec is None:
            continue
        dets = cr.get("_category_detections", {}).get(spec["breakdown_key"], [])
        if dets:
            camera_track_store.update(f"{payload.camera_id}::{cr['check']}::{spec['breakdown_key']}", ts, dets)
        cr["_violator_detections"] = dets


def _fanned_out_violations(
    cr: dict,
    *,
    violation_type: str,
    severity: str,
    aggregate_details: dict,
) -> list[dict]:
    """One violation per violator detection (own track_id + bbox) when an
    earlier `_apply_*` pass captured `_violator_detections`; otherwise fall
    back to a single aggregate violation with track_id=None, exactly like
    before this per-person fan-out existed — a safety net for any check that
    never populates violator-level detail (e.g. crowd_exceeded).
    """
    violators = cr.get("_violator_detections")
    if not violators:
        return [{
            "type": violation_type,
            "severity": severity,
            "score": round(cr["confidence"], 4),
            "track_id": None,
            "details": aggregate_details,
        }]
    return [
        {
            "type": violation_type,
            "severity": severity,
            "score": round(d["confidence"], 4),
            "track_id": d.get("track_id"),
            "details": {**aggregate_details, "bbox": d["bbox"]},
        }
        for d in violators
    ]


def _evaluate_violations(
    camera_id: str,
    rules: CameraRules,
    check_results: list[dict],
) -> list[dict]:
    """Cek check_results terhadap rules yang dikirim backend, hasilkan violations."""
    violations: list[dict] = []

    for cr in check_results:
        check = cr["check"]

        # ── Crowd threshold ──────────────────────────────────────────────────
        if check == "person_count" and rules.crowd_threshold is not None:
            if cr["value"] > rules.crowd_threshold:
                count = cr["value"]
                violations.append({
                    "type": "crowd_exceeded",
                    "severity": _severity_for_crowd_exceeded(count, rules.crowd_threshold),
                    "score": round(cr["confidence"], 4),
                    "track_id": None,
                    "details": {
                        "person_count": count,
                        "threshold": rules.crowd_threshold,
                        "camera_id": camera_id,
                    },
                })

        # ── Red zone: zero-tolerance ─────────────────────────────────────────
        # Polygon-nya yang menentukan ada/tidaknya zona,
        # jadi violation fire begitu ada minimal satu orang yang kakinya masuk.
        elif check == "red_zone_count" and cr["value"] > 0:
            violations.extend(_fanned_out_violations(
                cr,
                violation_type="red_zone_intrusion",
                severity="high",
                aggregate_details={"intruder_count": cr["value"], "camera_id": camera_id},
            ))

    # Handrail: orang di tangga yang tidak memegang pegangan (value sudah dihitung
    # _apply_handrail = jumlah not_holding).
    for cr in check_results:
        if cr["check"] == "handrail_count" and cr["value"] > 0:
            violations.extend(_fanned_out_violations(
                cr,
                violation_type="handrail_violation",
                severity="medium",
                aggregate_details={"not_holding_count": cr["value"], "camera_id": camera_id},
            ))

    # Hand in pocket WHILE WALKING (Fase B): tangan di saku baru jadi bahaya
    # (tersandung) saat orangnya bergerak. `walking` dihitung tracker temporal di
    # _apply_hand_in_pocket_walking (harus jalan sebelum fungsi ini). Berdiri diam
    # dengan tangan di saku TIDAK di-fire — hanya tercatat di breakdown.
    for cr in check_results:
        if cr["check"] == "hand_in_pocket_count":
            walking = cr["details"].get("breakdown", {}).get("walking", 0)
            if walking > 0:
                violations.extend(_fanned_out_violations(
                    cr,
                    violation_type="hand_in_pocket_violation",
                    severity="high",
                    aggregate_details={"hand_in_pocket_walking_count": walking, "camera_id": camera_id},
                ))

    # Holding phone (Fase B, kompositional): violation = orang yang HP-di-tangan
    # ∧ menunduk (proxy "melihat HP") ∧ berjalan. `value` sudah di-set ke jumlah
    # orang tsb oleh _apply_holding_phone (harus jalan sebelum fungsi ini).
    for cr in check_results:
        if cr["check"] == "holding_phone_count" and cr["value"] > 0:
            violations.extend(_fanned_out_violations(
                cr,
                violation_type="holding_phone_violation",
                severity="high",
                aggregate_details={"holding_phone_count": cr["value"], "camera_id": camera_id},
            ))

    # PPE compliance (mask/helmet/vest/goggles/gloves/fall_detected): zero-tolerance
    # per-APD. `value` check PPE = total deteksi (compliant + violation), jadi kondisi
    # violation pakai count kategori negatif `no_*`/`fall_detected` di breakdown,
    # BUKAN `value`.
    for cr in check_results:
        spec = _PPE_VIOLATIONS.get(cr["check"])
        if spec is None:
            continue
        count = cr["details"].get("breakdown", {}).get(spec["breakdown_key"], 0)
        if count > 0:
            violations.extend(_fanned_out_violations(
                cr,
                violation_type=spec["type"],
                severity=spec["severity"],
                aggregate_details={spec["count_key"]: count, "camera_id": camera_id},
            ))

    return violations


def run_inference(payload: InferenceRequest) -> dict:
    start = time.perf_counter()
    device = pick_runtime_device(os.getenv("AI_DEVICE", "auto"))

    frame = load_image(payload.image_uri, payload.image_base64)
    detections, models_used = _run_detector(payload, frame, device)
    check_results = _compute_check_results(payload.selected_checks, detections)
    _apply_ppe_violator_tracking(payload, check_results)
    _apply_red_zone(
        payload, detections, payload.red_zones, frame.shape, check_results,
        roi_polygon=payload.roi_polygon,
    )
    _apply_handrail(
        payload, detections, payload.stairs_zone, payload.handrail_lines,
        frame.shape, check_results,
    )
    _apply_hand_in_pocket_walking(payload, detections, check_results)
    _apply_holding_phone(payload, detections, check_results, frame=frame, device=device)
    violations = _evaluate_violations(payload.camera_id, payload.rules, check_results)

    latency_ms = (time.perf_counter() - start) * 1000.0
    return {
        "latency_ms": round(latency_ms, 2),
        "runtime_device": device,
        "model_tasks_executed": models_used,
        "detections": detections,
        "check_results": check_results,
        "violations": violations,
    }
