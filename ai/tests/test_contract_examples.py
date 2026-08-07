from datetime import datetime, timezone

from cctv_insight_ai.pipelines.infer import _severity_for_crowd_exceeded
from cctv_insight_ai.service.schemas import CameraRules, InferenceRequest


def test_inference_request_requires_image_source() -> None:
    try:
        InferenceRequest(
            camera_id="cam1",
            frame_id="f1",
            timestamp_utc=datetime.now(timezone.utc),
        )
        assert False, "Validation should fail when image source is missing"
    except Exception:
        assert True


def test_inference_request_accepts_uri() -> None:
    payload = InferenceRequest(
        camera_id="cam1",
        frame_id="f2",
        timestamp_utc=datetime.now(timezone.utc),
        image_uri="captures/cam1/frame_0001.jpg",
    )
    assert payload.image_uri is not None


def test_inference_request_default_selected_checks_is_empty() -> None:
    payload = InferenceRequest(
        camera_id="cam1",
        frame_id="f3",
        timestamp_utc=datetime.now(timezone.utc),
        image_uri="captures/cam1/frame_0003.jpg",
    )
    assert payload.selected_checks == []


def test_inference_request_accepts_empty_selected_checks() -> None:
    payload = InferenceRequest(
        camera_id="cam1",
        frame_id="f4",
        timestamp_utc=datetime.now(timezone.utc),
        image_uri="captures/cam1/frame_0004.jpg",
        selected_checks=[],
    )
    assert payload.selected_checks == []


def test_inference_request_default_rules_empty() -> None:
    payload = InferenceRequest(
        camera_id="cam1",
        frame_id="f5",
        timestamp_utc=datetime.now(timezone.utc),
        image_uri="captures/cam1/frame_0005.jpg",
    )
    assert payload.rules.crowd_threshold is None


def test_inference_request_accepts_crowd_threshold() -> None:
    payload = InferenceRequest(
        camera_id="cam1",
        frame_id="f6",
        timestamp_utc=datetime.now(timezone.utc),
        image_uri="captures/cam1/frame_0006.jpg",
        rules=CameraRules(crowd_threshold=5),
    )
    assert payload.rules.crowd_threshold == 5


def test_inference_request_accepts_zero_crowd_threshold() -> None:
    # threshold=0 = zero-tolerance zone, harus diterima (bukan ge=1).
    payload = InferenceRequest(
        camera_id="cam1",
        frame_id="f7",
        timestamp_utc=datetime.now(timezone.utc),
        image_uri="captures/cam1/frame_0007.jpg",
        rules=CameraRules(crowd_threshold=0),
    )
    assert payload.rules.crowd_threshold == 0


def test_severity_zero_threshold_does_not_crash() -> None:
    # Regression: dulu `count / 0` raise ZeroDivisionError.
    assert _severity_for_crowd_exceeded(count=1, threshold=0) == "high"
    assert _severity_for_crowd_exceeded(count=100, threshold=0) == "high"


def test_severity_ratio_buckets() -> None:
    assert _severity_for_crowd_exceeded(count=10, threshold=5) == "high"     # ratio=2.0
    assert _severity_for_crowd_exceeded(count=11, threshold=5) == "high"     # ratio=2.2
    assert _severity_for_crowd_exceeded(count=8, threshold=5) == "medium"    # ratio=1.6
    assert _severity_for_crowd_exceeded(count=6, threshold=5) == "low"       # ratio=1.2
