"""Unit tests for handrail check (foot-in-stairs-zone + wrist-near-handrail-line)."""
import itertools
from datetime import datetime, timedelta, timezone

from cctv_insight_ai.pipelines.infer import _apply_handrail, _evaluate_violations
from cctv_insight_ai.service.schemas import CameraRules, InferenceRequest, RoiPoint

# Frame 1000x1000 → normalized coords map 1:1 to /1000 px.
# stairs_zone = left half; handrail line = vertical line at x=0.1 (=100px).
_ZONE = [RoiPoint(x=0.0, y=0.0), RoiPoint(x=0.5, y=0.0),
         RoiPoint(x=0.5, y=1.0), RoiPoint(x=0.0, y=1.0)]
_LINE = [RoiPoint(x=0.1, y=0.0), RoiPoint(x=0.1, y=1.0)]
_FRAME = (1000, 1000, 3)
_TS = datetime(2026, 1, 1, tzinfo=timezone.utc)
# Each _run() call uses its own camera_id so the shared camera_track_store
# singleton never carries tracker state (or out-of-order ts) between tests.
_CAM_IDS = itertools.count()


def _person(bbox, wrist=None):
    k = [[0.0, 0.0, 0.0] for _ in range(17)]  # ankles score 0 → foot uses bbox bottom
    if wrist:
        k[9] = [wrist[0], wrist[1], 0.9]
        k[10] = [wrist[0], wrist[1], 0.9]
    return {"label": "person", "bbox": list(bbox), "confidence": 0.9, "keypoints": k, "attributes": {}}


def _run(persons, stairs_zone=_ZONE, handrail_lines=None, camera_id=None):
    if handrail_lines is None:
        handrail_lines = [_LINE]
    if camera_id is None:
        camera_id = f"handrail-test-{next(_CAM_IDS)}"
    cr = [{"check": "handrail_count", "value": 0, "confidence": 0.0, "details": {}}]
    payload = InferenceRequest(
        camera_id=camera_id, frame_id="f", timestamp_utc=_TS,
        image_base64="x", selected_checks=["handrail_count"],
    )
    _apply_handrail(payload, persons, stairs_zone, handrail_lines, _FRAME, cr)
    viol = _evaluate_violations("cam", CameraRules(), cr)
    return cr[0]["details"].get("breakdown", {}), viol


def test_on_stairs_holding_no_violation():
    # person in left-half zone, wrist near the x=100 line
    bd, viol = _run([_person([100, 100, 300, 900], wrist=(110, 500))])
    assert bd == {"on_stairs": 1, "holding": 1, "not_holding": 0}
    assert viol == []


def test_on_stairs_not_holding_fires_violation():
    # same person but wrist far from the line (x=290, dist 190px / 800h = 0.24 > 0.20)
    bd, viol = _run([_person([100, 100, 300, 900], wrist=(290, 500))])
    assert bd == {"on_stairs": 1, "holding": 0, "not_holding": 1}
    assert any(v["type"] == "handrail_violation" and v["severity"] == "medium" for v in viol)


def test_off_stairs_no_violation():
    # person in right half (outside stairs zone), not holding
    bd, viol = _run([_person([600, 100, 800, 900], wrist=(700, 500))])
    assert bd == {"on_stairs": 0, "holding": 0, "not_holding": 0}
    assert viol == []


def test_no_wrist_not_flagged():
    # on stairs but wrists not visible → conservative: not counted as violation
    persons = [_person([100, 100, 300, 900], wrist=None)]
    bd, viol = _run(persons)
    assert bd == {"on_stairs": 1, "holding": 0, "not_holding": 0}
    assert persons[0]["attributes"]["holding_handrail"] == "unknown"
    assert viol == []


def test_no_config_no_violation():
    bd, viol = _run([_person([100, 100, 300, 900], wrist=(290, 500))],
                    stairs_zone=[], handrail_lines=[])
    assert viol == []


def test_multiple_handrail_lines_holding_either_side():
    # rail di dua sisi: kiri x=0.1 (=100px) & kanan x=0.45 (=450px).
    rails = [
        [RoiPoint(x=0.1, y=0.0), RoiPoint(x=0.1, y=1.0)],
        [RoiPoint(x=0.45, y=0.0), RoiPoint(x=0.45, y=1.0)],
    ]
    # wrist dekat rail KANAN (x=460, dist 10px ke garis x=450) → memegang, walau jauh dari rail kiri
    bd, viol = _run([_person([200, 100, 480, 900], wrist=(460, 500))], handrail_lines=rails)
    assert bd == {"on_stairs": 1, "holding": 1, "not_holding": 0}
    assert viol == []


def test_multiple_handrail_lines_far_from_all_fires():
    rails = [
        [RoiPoint(x=0.1, y=0.0), RoiPoint(x=0.1, y=1.0)],
        [RoiPoint(x=0.45, y=0.0), RoiPoint(x=0.45, y=1.0)],
    ]
    # wrist di tengah (x=275): dist ke kiri=175, ke kanan=175; 175/800=0.22 > 0.20 → tidak pegang
    bd, viol = _run([_person([100, 100, 450, 900], wrist=(275, 500))], handrail_lines=rails)
    assert bd == {"on_stairs": 1, "holding": 0, "not_holding": 1}
    assert any(v["type"] == "handrail_violation" for v in viol)


# --- per-violator track_id fan-out -------------------------------------------

def test_two_violators_fire_two_violations_with_distinct_track_ids():
    persons = [
        _person([100, 100, 300, 900], wrist=(290, 500)),   # not holding
        _person([320, 100, 480, 900], wrist=(320, 500)),   # far from any rail → not holding
    ]
    bd, viol = _run(persons)
    assert bd == {"on_stairs": 2, "holding": 0, "not_holding": 2}
    handrail_viol = [v for v in viol if v["type"] == "handrail_violation"]
    assert len(handrail_viol) == 2
    track_ids = {v["track_id"] for v in handrail_viol}
    assert len(track_ids) == 2
    assert None not in track_ids


def test_same_person_across_frames_keeps_same_track_id():
    cam = f"handrail-continuity-{next(_CAM_IDS)}"
    cr = [{"check": "handrail_count", "value": 0, "confidence": 0.0, "details": {}}]
    track_ids = []
    for i in range(2):
        persons = [_person([100, 100, 300, 900], wrist=(290, 500))]
        payload = InferenceRequest(
            camera_id=cam, frame_id="f", timestamp_utc=_TS + timedelta(seconds=i * 0.1),
            image_base64="x", selected_checks=["handrail_count"],
        )
        _apply_handrail(payload, persons, _ZONE, [_LINE], _FRAME, cr)
        viol = _evaluate_violations("cam", CameraRules(), cr)
        track_ids.append(next(v["track_id"] for v in viol if v["type"] == "handrail_violation"))
    assert track_ids[0] is not None
    assert track_ids[0] == track_ids[1]
