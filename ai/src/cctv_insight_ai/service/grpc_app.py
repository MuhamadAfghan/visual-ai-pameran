"""gRPC server untuk InferenceService.

Wrap pipeline yang sama dengan FastAPI app (`run_inference`) — kontrak Pydantic
adalah single source of truth, lalu di-marshal ke protobuf messages.

Stubs di-generate via `scripts/generate_grpc_stubs.py` (output: `ai/src/ai/v1/`).
"""

from __future__ import annotations

import json
import logging
from concurrent import futures
from datetime import datetime, timezone
from typing import Any

import grpc
from pydantic import ValidationError

from ai.v1 import inference_pb2, inference_pb2_grpc
from cctv_insight_ai.pipelines.infer import run_inference
from cctv_insight_ai.service.schemas import (
    CameraRules,
    Detection,
    InferenceRequest,
    InferenceThresholds,
    RedZonePolygon,
    RoiPoint,
)

logger = logging.getLogger(__name__)


def _proto_request_to_pydantic(req: inference_pb2.InferRequest) -> InferenceRequest:
    """Convert protobuf InferRequest -> Pydantic InferenceRequest."""
    thresholds = InferenceThresholds()
    if req.HasField("thresholds"):
        thresholds = InferenceThresholds(
            conf=req.thresholds.conf,
            iou=req.thresholds.iou,
        )

    rules = CameraRules()
    if req.HasField("rules"):
        rules = CameraRules(
            crowd_threshold=(
                req.rules.crowd_threshold
                if req.rules.HasField("crowd_threshold")
                else None
            ),
        )

    metadata: dict[str, Any] = {}
    if req.metadata_json:
        try:
            metadata = json.loads(req.metadata_json)
        except json.JSONDecodeError as exc:
            raise ValueError(f"metadata_json is not valid JSON: {exc}") from exc

    roi_polygon = [RoiPoint(x=p.x, y=p.y) for p in req.roi_polygon]
    red_zones = [
        RedZonePolygon(
            name=z.name,
            points=[RoiPoint(x=p.x, y=p.y) for p in z.points],
        )
        for z in req.red_zones
    ]
    stairs_zone = [RoiPoint(x=p.x, y=p.y) for p in req.stairs_zone]
    handrail_lines = [
        [RoiPoint(x=p.x, y=p.y) for p in line.points] for line in req.handrail_lines
    ]

    return InferenceRequest(
        camera_id=req.camera_id,
        frame_id=req.frame_id,
        timestamp_utc=req.timestamp_utc,
        image_uri=req.image_uri or None,
        image_base64=req.image_base64 or None,
        selected_checks=list(req.selected_checks),
        thresholds=thresholds,
        rules=rules,
        roi_polygon=roi_polygon,
        red_zones=red_zones,
        stairs_zone=stairs_zone,
        handrail_lines=handrail_lines,
        metadata=metadata,
    )


def _detection_to_proto(det: dict[str, Any] | Detection) -> inference_pb2.Detection:
    d = det.model_dump() if isinstance(det, Detection) else det
    msg = inference_pb2.Detection(
        id=int(d["id"]),
        label=str(d["label"]),
        confidence=float(d["confidence"]),
        bbox=[float(x) for x in d.get("bbox", [])],
    )
    track_id = d.get("track_id")
    if track_id is not None:
        msg.track_id = int(track_id)
    for kp in d.get("keypoints", []):
        if not kp:
            continue
        x, y = float(kp[0]), float(kp[1])
        score = float(kp[2]) if len(kp) > 2 else 0.0
        msg.keypoints.append(inference_pb2.Keypoint(x=x, y=y, score=score))
    for k, v in (d.get("attributes") or {}).items():
        msg.attributes[str(k)] = str(v) if not isinstance(v, str) else v
    return msg


def _check_result_to_proto(cr: dict[str, Any]) -> inference_pb2.CheckResult:
    details_in = cr.get("details") or {}
    details_msg = inference_pb2.CheckDetails(
        source_labels=[str(s) for s in details_in.get("source_labels", [])],
    )
    for k, v in (details_in.get("breakdown") or {}).items():
        details_msg.breakdown[str(k)] = int(v)
    return inference_pb2.CheckResult(
        check=str(cr["check"]),
        value=int(cr["value"]),
        confidence=float(cr["confidence"]),
        details=details_msg,
    )


def _violation_to_proto(v: dict[str, Any]) -> inference_pb2.Violation:
    msg = inference_pb2.Violation(
        type=str(v["type"]),
        severity=str(v["severity"]),
        score=float(v["score"]),
        details_json=json.dumps(v.get("details") or {}, default=str),
    )
    track_id = v.get("track_id")
    if track_id is not None:
        msg.track_id = int(track_id)
    return msg


def _build_response(
    payload: InferenceRequest,
    result: dict[str, Any],
) -> inference_pb2.InferResponse:
    meta = {
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "runtime_device": result.get("runtime_device", "cpu"),
    }
    response = inference_pb2.InferResponse(
        camera_id=payload.camera_id,
        frame_id=payload.frame_id,
        timestamp_utc=payload.timestamp_utc.isoformat(),
        latency_ms=float(result["latency_ms"]),
        model_tasks_executed=[str(x) for x in result.get("model_tasks_executed", [])],
        meta_json=json.dumps(meta, default=str),
    )
    response.detections.extend(_detection_to_proto(d) for d in result.get("detections", []))
    response.check_results.extend(_check_result_to_proto(c) for c in result.get("check_results", []))
    response.violations.extend(_violation_to_proto(v) for v in result.get("violations", []))
    return response


class InferenceServicer(inference_pb2_grpc.InferenceServiceServicer):
    def Health(
        self,
        request: inference_pb2.HealthRequest,
        context: grpc.ServicerContext,
    ) -> inference_pb2.HealthResponse:
        return inference_pb2.HealthResponse(status="ok")

    def Infer(
        self,
        request: inference_pb2.InferRequest,
        context: grpc.ServicerContext,
    ) -> inference_pb2.InferResponse:
        try:
            payload = _proto_request_to_pydantic(request)
        except (ValidationError, ValueError) as exc:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(exc))
            raise  # unreachable, satisfies type checker

        zones = payload.red_zones or (
            [type("Z", (), {"name": "legacy", "points": payload.roi_polygon})()] if payload.roi_polygon else []
        )
        logger.info(
            "infer request  camera=%s frame=%s checks=%s zones=%d%s",
            payload.camera_id,
            payload.frame_id,
            payload.selected_checks,
            len(zones),
            " " + str([
                {"name": z.name, "pts": len(z.points)} for z in zones
            ]) if zones else "",
        )

        try:
            result = run_inference(payload)
        except FileNotFoundError as exc:
            context.abort(grpc.StatusCode.NOT_FOUND, str(exc))
            raise
        except Exception as exc:
            logger.exception("inference failed for camera=%s frame=%s", payload.camera_id, payload.frame_id)
            context.abort(grpc.StatusCode.INTERNAL, f"inference failed: {exc}")
            raise

        logger.info(
            "infer done     camera=%s frame=%s latency=%.1fms violations=%d",
            payload.camera_id,
            payload.frame_id,
            result.get("latency_ms", 0),
            len(result.get("violations", [])),
        )
        # logger.info("full inference result: %s", result)
        return _build_response(payload, result)


_32MB = 32 * 1024 * 1024


def serve(host: str = "0.0.0.0", port: int = 50051, max_workers: int = 8) -> None:
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=max_workers),
        options=[
            ("grpc.max_receive_message_length", _32MB),
            ("grpc.max_send_message_length", _32MB),
        ],
    )
    inference_pb2_grpc.add_InferenceServiceServicer_to_server(InferenceServicer(), server)
    bind = f"{host}:{port}"
    server.add_insecure_port(bind)
    server.start()
    logger.info("InferenceService gRPC server listening on %s", bind)
    server.wait_for_termination()
