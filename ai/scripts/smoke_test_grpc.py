"""Smoke test gRPC InferenceService — call Health + Infer pakai example image.

Prasyarat: gRPC server hidup (`scripts/run_grpc_service.ps1` di terminal lain).

    .venv\\Scripts\\python.exe scripts\\smoke_test_grpc.py [--crowd-threshold N]

Pass `--crowd-threshold` untuk verifikasi violation `crowd_exceeded` ter-fire
saat person_count melewati threshold (set kecil mis. 1 supaya pasti trigger
di example image yang punya beberapa orang).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import grpc

from ai.v1 import inference_pb2, inference_pb2_grpc

AI_DIR = Path(__file__).resolve().parents[1]
EXAMPLES = [
    AI_DIR / "contracts" / "example-1.jpg",
    AI_DIR / "contracts" / "example-2.jpg",
]
ALL_CHECKS = [
    "person_count",
    "mask_count",
    "helmet_count",
    "vest_count",
    "goggles_count",
    "gloves_count",
]
TARGET = os.getenv("AI_GRPC_TARGET", "localhost:50051")


def build_request(
    image_path: Path,
    crowd_threshold: int | None = None,
) -> inference_pb2.InferRequest:
    req = inference_pb2.InferRequest(
        camera_id="cam-smoke",
        frame_id=image_path.stem,
        timestamp_utc=datetime.now(timezone.utc).isoformat(),
        image_uri=str(image_path),
        selected_checks=ALL_CHECKS,
        thresholds=inference_pb2.Thresholds(conf=0.25, iou=0.45),
    )
    if crowd_threshold is not None:
        req.rules.crowd_threshold = crowd_threshold
    return req


def print_response(resp: inference_pb2.InferResponse) -> None:
    print(f"  latency_ms       : {resp.latency_ms}")
    print(f"  model_tasks_used : {list(resp.model_tasks_executed)}")
    print(f"  detections       : {len(resp.detections)} item")
    for det in resp.detections:
        track = det.track_id if det.HasField("track_id") else None
        attrs = dict(det.attributes)
        print(
            f"    - {det.label:6s} conf={det.confidence:.2f} "
            f"track={track} attrs={attrs}"
        )
    print("  check_results:")
    for chk in resp.check_results:
        breakdown = dict(chk.details.breakdown)
        print(
            f"    - {chk.check:22s} value={chk.value} "
            f"avg_conf={chk.confidence:.3f} breakdown={breakdown}"
        )
    if resp.violations:
        print("  violations:")
        for v in resp.violations:
            print(
                f"    - {v.type} severity={v.severity} score={v.score:.2f} "
                f"details={v.details_json}"
            )
    if resp.meta_json:
        try:
            meta = json.loads(resp.meta_json)
        except json.JSONDecodeError:
            meta = resp.meta_json
        print(f"  meta             : {meta}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--crowd-threshold",
        type=int,
        default=None,
        help="Trigger violation crowd_exceeded kalau person_count > N. Default: tidak kirim rules.",
    )
    args = parser.parse_args()

    print(f"connecting to {TARGET}")
    if args.crowd_threshold is not None:
        print(f"rules.crowd_threshold = {args.crowd_threshold}")

    with grpc.insecure_channel(TARGET) as channel:
        stub = inference_pb2_grpc.InferenceServiceStub(channel)

        try:
            health = stub.Health(inference_pb2.HealthRequest(), timeout=5)
            print(f"Health -> status={health.status!r}")
        except grpc.RpcError as exc:
            print(f"[error] Health RPC failed: {exc.code()} {exc.details()}")
            return 1

        for img in EXAMPLES:
            if not img.exists():
                print(f"SKIP {img.name} (file not found)")
                continue
            print(f"\n--- Infer({img.name}) ---")
            try:
                resp = stub.Infer(
                    build_request(img, crowd_threshold=args.crowd_threshold),
                    timeout=60,
                )
            except grpc.RpcError as exc:
                print(f"[error] Infer RPC failed: {exc.code()} {exc.details()}")
                return 1
            print_response(resp)

    return 0


if __name__ == "__main__":
    sys.exit(main())
