"""Per-violator track_id fan-out — checks that already identify individual
violators (PPE, red_zone) now emit one violation per person with their own
track_id, instead of a single camera-wide aggregate. `crowd_exceeded` has no
natural single violator and must stay an untracked aggregate (no regression).
"""
import itertools
from datetime import datetime, timedelta, timezone

from cctv_insight_ai.pipelines.infer import (
    _apply_ppe_violator_tracking,
    _apply_red_zone,
    _compute_check_results,
    _evaluate_violations,
)
from cctv_insight_ai.service.schemas import CameraRules, InferenceRequest, RedZonePolygon, RoiPoint

_TS = datetime(2026, 1, 1, tzinfo=timezone.utc)
_CAM_IDS = itertools.count()


def _cam() -> str:
    return f"fanout-test-{next(_CAM_IDS)}"


def _payload(cam, checks, ts=_TS):
    return InferenceRequest(
        camera_id=cam, frame_id="f", timestamp_utc=ts,
        image_base64="x", selected_checks=checks,
    )


def _det(label, bbox):
    return {"label": label, "bbox": list(bbox), "confidence": 0.9, "attributes": {}}


# --- PPE (helmet_count) -------------------------------------------------------

def test_ppe_two_violators_fire_two_violations_with_distinct_track_ids():
    cam = _cam()
    detections = [
        _det("no_helmet", [0, 0, 100, 100]),
        _det("no_helmet", [500, 0, 600, 100]),
    ]
    check_results = _compute_check_results(["helmet_count"], detections)
    _apply_ppe_violator_tracking(_payload(cam, ["helmet_count"]), check_results)
    viol = _evaluate_violations(cam, CameraRules(), check_results)

    helmet_viol = [v for v in viol if v["type"] == "no_helmet_violation"]
    assert len(helmet_viol) == 2
    track_ids = {v["track_id"] for v in helmet_viol}
    assert len(track_ids) == 2
    assert None not in track_ids


def test_ppe_same_person_across_frames_keeps_same_track_id():
    cam = _cam()
    track_ids = []
    for i in range(2):
        detections = [_det("no_helmet", [0, 0, 100, 100])]
        check_results = _compute_check_results(["helmet_count"], detections)
        _apply_ppe_violator_tracking(
            _payload(cam, ["helmet_count"], ts=_TS + timedelta(seconds=i * 0.1)), check_results
        )
        viol = _evaluate_violations(cam, CameraRules(), check_results)
        track_ids.append(next(v["track_id"] for v in viol if v["type"] == "no_helmet_violation"))
    assert track_ids[0] is not None
    assert track_ids[0] == track_ids[1]


def test_ppe_compliant_only_no_violation():
    cam = _cam()
    detections = [_det("helmet", [0, 0, 100, 100])]
    check_results = _compute_check_results(["helmet_count"], detections)
    _apply_ppe_violator_tracking(_payload(cam, ["helmet_count"]), check_results)
    viol = _evaluate_violations(cam, CameraRules(), check_results)
    assert viol == []


# --- red_zone_count -----------------------------------------------------------

_ZONE = [RedZonePolygon(name="z", points=[
    RoiPoint(x=0.0, y=0.0), RoiPoint(x=1.0, y=0.0),
    RoiPoint(x=1.0, y=1.0), RoiPoint(x=0.0, y=1.0),
])]
_FRAME = (1000, 1000, 3)


def test_red_zone_two_intruders_fire_two_violations_with_distinct_track_ids():
    cam = _cam()
    detections = [
        _det("person", [0, 0, 100, 100]),
        _det("person", [500, 500, 600, 600]),
    ]
    check_results = [{"check": "red_zone_count", "value": 0, "confidence": 0.0, "details": {}}]
    _apply_red_zone(_payload(cam, ["red_zone_count"]), detections, _ZONE, _FRAME, check_results)
    viol = _evaluate_violations(cam, CameraRules(), check_results)

    intrusions = [v for v in viol if v["type"] == "red_zone_intrusion"]
    assert len(intrusions) == 2
    track_ids = {v["track_id"] for v in intrusions}
    assert len(track_ids) == 2
    assert None not in track_ids


# --- crowd_exceeded stays a single untracked aggregate (no natural violator) --

def test_crowd_exceeded_stays_untracked_aggregate():
    cam = _cam()
    detections = [_det("person", [i * 120, 0, i * 120 + 100, 100]) for i in range(3)]
    check_results = _compute_check_results(["person_count"], detections)
    viol = _evaluate_violations(cam, CameraRules(crowd_threshold=1), check_results)

    crowd_viol = [v for v in viol if v["type"] == "crowd_exceeded"]
    assert len(crowd_viol) == 1
    assert crowd_viol[0]["track_id"] is None
