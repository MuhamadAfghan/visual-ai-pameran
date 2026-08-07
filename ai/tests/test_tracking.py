"""Unit tests for the per-camera greedy-IoU tracker + walking estimation (Fase B)."""
from cctv_insight_ai.pipelines.tracking import CameraTrackStore


def _det(bbox):
    return {"bbox": list(bbox), "label": "hand_in_pocket", "attributes": {}}


def _feed(store, cam, bbox, ts):
    d = _det(bbox)
    store.update(cam, ts, [d])
    return d


def test_stationary_box_not_walking():
    store = CameraTrackStore()
    box = (0, 0, 100, 100)  # height 100
    last = None
    for i in range(6):
        last = _feed(store, "cam", box, ts=i * 0.1)
    assert last["attributes"]["walking"] == "false"


def test_moving_box_is_walking():
    store = CameraTrackStore()
    last = None
    for i in range(6):
        # shift 20px/frame to the right, box height 100, dt 0.1s -> fast
        last = _feed(store, "cam", (i * 20, 0, i * 20 + 100, 100), ts=i * 0.1)
    assert last["attributes"]["walking"] == "true"


def test_tiny_jitter_not_walking():
    store = CameraTrackStore()
    last = None
    for i in range(6):
        last = _feed(store, "cam", (i * 1, 0, i * 1 + 100, 100), ts=i * 0.1)
    assert last["attributes"]["walking"] == "false"


def test_cold_start_below_min_obs_not_walking():
    store = CameraTrackStore()
    # only 2 observations < _MIN_OBS_FOR_MOTION (3) even though moving fast
    _feed(store, "cam", (0, 0, 100, 100), ts=0.0)
    d = _feed(store, "cam", (40, 0, 140, 100), ts=0.1)
    assert d["attributes"]["walking"] == "false"


def test_track_id_continuity_for_overlapping_boxes():
    store = CameraTrackStore()
    d0 = _feed(store, "cam", (0, 0, 100, 100), ts=0.0)
    d1 = _feed(store, "cam", (10, 0, 110, 100), ts=0.1)  # high IoU -> same id
    assert d0["track_id"] == d1["track_id"]


def test_far_jump_gets_new_id():
    store = CameraTrackStore()
    d0 = _feed(store, "cam", (0, 0, 100, 100), ts=0.0)
    d1 = _feed(store, "cam", (500, 0, 600, 100), ts=0.1)  # no overlap -> new id
    assert d0["track_id"] != d1["track_id"]


def test_two_boxes_distinct_ids():
    store = CameraTrackStore()
    a = _det((0, 0, 100, 100))
    b = _det((300, 0, 400, 100))
    store.update("cam", 0.0, [a, b])
    assert a["track_id"] != b["track_id"]


def test_out_of_order_frame_ignored():
    store = CameraTrackStore()
    _feed(store, "cam", (0, 0, 100, 100), ts=1.0)
    stale = _feed(store, "cam", (40, 0, 140, 100), ts=0.5)  # earlier than last
    assert stale["track_id"] is None
    assert stale["attributes"]["walking"] == "false"


def test_cameras_are_independent():
    store = CameraTrackStore()
    a = _feed(store, "cam-A", (0, 0, 100, 100), ts=0.0)
    b = _feed(store, "cam-B", (0, 0, 100, 100), ts=0.0)
    # both first track on their own camera -> same id namespace, no cross-talk
    assert a["track_id"] == 1 and b["track_id"] == 1


# --- integration: walking gate -> violation (infer.py glue) -----------------
from datetime import datetime, timedelta, timezone

from cctv_insight_ai.pipelines.infer import (
    _apply_hand_in_pocket_walking,
    _apply_holding_phone,
    _evaluate_violations,
)
from cctv_insight_ai.service.schemas import CameraRules, InferenceRequest

_BASE_TS = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _run_frame(cam, bbox, ts_dt, label="hand_in_pocket"):
    det = {"label": label, "bbox": list(bbox), "confidence": 0.9, "attributes": {}}
    check_results = [{
        "check": "hand_in_pocket_count", "value": 1, "confidence": 0.9,
        "details": {"source_labels": ["hand_in_pocket"],
                    "breakdown": {"hand_in_pocket": 1, "no_hand_in_pocket": 0}},
    }]
    payload = InferenceRequest(
        camera_id=cam, frame_id="f", timestamp_utc=ts_dt,
        image_base64="x", selected_checks=["hand_in_pocket_count"],
    )
    _apply_hand_in_pocket_walking(payload, [det], check_results)
    violations = _evaluate_violations(cam, CameraRules(), check_results)
    return check_results[0]["details"]["breakdown"], violations


def test_walking_hand_in_pocket_fires_high_violation():
    bd = viol = None
    for i in range(6):
        bd, viol = _run_frame("cam-walk", (i * 20, 0, i * 20 + 100, 100),
                              _BASE_TS + timedelta(seconds=i * 0.1))
    assert bd["walking"] == 1
    assert any(v["type"] == "hand_in_pocket_violation" and v["severity"] == "high"
               for v in viol)


def test_standing_hand_in_pocket_no_violation():
    bd = viol = None
    for i in range(6):
        bd, viol = _run_frame("cam-stand", (0, 0, 100, 100),
                              _BASE_TS + timedelta(seconds=i * 0.1))
    assert bd["walking"] == 0
    assert viol == []


# --- holding_phone: compositional (person+pose + smartphone + motion) -------
# Person height 100; shoulders y=25, hips y=60 (torso 35), wrists y=45.
# head-down proxy fires when nose near shoulder line: gap=(25-nose_y)/35 <= 0.12
# -> nose_y >= ~20.8. Use nose_y=23 (down) vs nose_y=5 (up).

def _person(cx, nose_y):
    k = [[0.0, 0.0, 0.0] for _ in range(17)]
    k[0] = [float(cx), float(nose_y), 0.9]      # nose
    k[5] = [cx - 20, 25, 0.9]; k[6] = [cx + 20, 25, 0.9]   # shoulders
    k[9] = [float(cx), 45, 0.9]; k[10] = [float(cx), 45, 0.9]  # wrists
    k[11] = [cx - 15, 60, 0.9]; k[12] = [cx + 15, 60, 0.9]  # hips
    return {"label": "person", "bbox": [cx - 25, 0, cx + 25, 100],
            "confidence": 0.9, "keypoints": k, "attributes": {}}


def _phone(cx, y=45):
    return {"label": "smartphone", "bbox": [cx - 5, y - 5, cx + 5, y + 5],
            "confidence": 0.8, "keypoints": [], "attributes": {}}


def _run_holding(cam, frames):
    """frames: list of (cx, nose_y, has_phone). Returns (breakdown, violations)."""
    bd = viol = None
    for i, (cx, nose_y, has_phone) in enumerate(frames):
        dets = [_person(cx, nose_y)]
        if has_phone:
            dets.append(_phone(cx))
        cr = [{"check": "holding_phone_count", "value": 0, "confidence": 0.0, "details": {}}]
        payload = InferenceRequest(
            camera_id=cam, frame_id="f", timestamp_utc=_BASE_TS + timedelta(seconds=i * 0.1),
            image_base64="x", selected_checks=["holding_phone_count"],
        )
        _apply_holding_phone(payload, dets, cr)
        viol = _evaluate_violations(cam, CameraRules(), cr)
        bd = cr[0]["details"]["breakdown"]
    return bd, viol


def test_holding_phone_walking_lookdown_fires():
    bd, viol = _run_holding("cam-hp-walk", [(i * 20, 23, True) for i in range(6)])
    assert bd["with_phone"] == 1 and bd["looking_down"] == 1 and bd["walking"] == 1
    assert bd["violating"] == 1
    assert any(v["type"] == "holding_phone_violation" and v["severity"] == "high"
               for v in viol)


def test_holding_phone_standing_no_violation():
    bd, viol = _run_holding("cam-hp-stand", [(50, 23, True) for _ in range(6)])
    assert bd["with_phone"] == 1 and bd["looking_down"] == 1
    assert bd["walking"] == 0 and bd["violating"] == 0
    assert viol == []


def test_holding_phone_head_up_still_fires():
    # head_down is informational only now — walking + phone fires regardless of gaze
    bd, viol = _run_holding("cam-hp-up", [(i * 20, 5, True) for i in range(6)])
    assert bd["walking"] == 1 and bd["with_phone"] == 1
    assert bd["looking_down"] == 0  # not looking down...
    assert bd["violating"] == 1     # ...but still a violation (phone + walking)
    assert any(v["type"] == "holding_phone_violation" for v in viol)


def test_holding_phone_no_phone_no_violation():
    bd, viol = _run_holding("cam-hp-nophone", [(i * 20, 23, False) for i in range(6)])
    assert bd["walking"] == 1 and bd["looking_down"] == 1
    assert bd["with_phone"] == 0 and bd["violating"] == 0
    assert viol == []


def test_hp_signal_hold_bridges_flicker():
    # phone & walking NEVER true in the same frame, but both within the hold window
    from cctv_insight_ai.pipelines.infer import _hp_violation_held
    cam, tid = "cam-hold", 1
    assert _hp_violation_held(cam, tid, in_hand=False, walks=True, ts=0.0) is False
    # 0.2s later: phone (not walking) — both seen recently -> fire
    assert _hp_violation_held(cam, tid, in_hand=True, walks=False, ts=0.2) is True
    # much later: phone only, walking now stale -> no fire
    assert _hp_violation_held(cam, tid, in_hand=True, walks=False, ts=9.0) is False


def test_both_gates_independent_in_one_request():
    """hand_in_pocket + holding_phone selected together: each keeps its own
    per-camera tracker state (namespaced key), so one feeding a frame doesn't make
    the other reject it as out-of-order."""
    cam = "cam-both"
    cr = [
        {"check": "hand_in_pocket_count", "value": 1, "confidence": 0.9,
         "details": {"breakdown": {"hand_in_pocket": 1}}},
        {"check": "holding_phone_count", "value": 0, "confidence": 0.0, "details": {}},
    ]
    bd_hip = bd_phone = None
    for i in range(6):
        ts = _BASE_TS + timedelta(seconds=i * 0.1)
        hip = {"label": "hand_in_pocket", "bbox": [i * 20, 0, i * 20 + 100, 100],
               "confidence": 0.9, "attributes": {}}
        dets = [hip, _person(i * 20 + 50, 23), _phone(i * 20 + 50)]
        payload = InferenceRequest(
            camera_id=cam, frame_id="f", timestamp_utc=ts, image_base64="x",
            selected_checks=["hand_in_pocket_count", "holding_phone_count"],
        )
        _apply_hand_in_pocket_walking(payload, dets, cr)
        _apply_holding_phone(payload, dets, cr)
        bd_hip = cr[0]["details"]["breakdown"]
        bd_phone = cr[1]["details"]["breakdown"]
    # Both gates independently see walking — neither starved the other's frame.
    assert bd_hip["walking"] == 1
    assert bd_phone["violating"] == 1
