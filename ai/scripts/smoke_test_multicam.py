"""Smoke test multi-camera gRPC inference — verify per-camera independence.

Kirim request dari beberapa `camera_id` berbeda dengan `selected_checks` yang
divariasikan, lalu verifikasi tiap response:
  1. `camera_id` di response cocok dengan yang dikirim (tidak ada cross-contamination).
  2. `check_results` berisi tepat check yang diminta — tidak kurang, tidak lebih.
  3. `model_tasks_executed` minimal mencakup model yang di-route oleh
     `CHECK_TO_MODEL` (sumber kebenaran di registry).
  4. `latency_ms` terisi dan wajar (0 < latency < 60_000).

Prasyarat: gRPC server hidup (`scripts/run_grpc_service.ps1` di terminal lain).

    .venv\\Scripts\\python.exe scripts\\smoke_test_multicam.py
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import grpc

from ai.v1 import inference_pb2, inference_pb2_grpc
from cctv_insight_ai.models.registry import CHECK_TO_MODEL

AI_DIR = Path(__file__).resolve().parents[1]
TARGET = os.getenv("AI_GRPC_TARGET", "localhost:50051")

LATENCY_MAX_MS = 60_000.0
LATENCY_WARN_MS = 5_000.0


@dataclass(frozen=True)
class CameraCase:
    camera_id: str
    image: Path
    selected_checks: list[str]


CAMERA_CASES: list[CameraCase] = [
    CameraCase(
        camera_id="cam_area1_01",
        image=AI_DIR / "contracts" / "example-1.jpg",
        selected_checks=["helmet_count", "vest_count"],
    ),
    CameraCase(
        camera_id="cam_area1_02",
        image=AI_DIR / "contracts" / "example-2.jpg",
        selected_checks=["mask_count"],
    ),
    CameraCase(
        camera_id="cam_area2_01",
        image=AI_DIR / "contracts" / "example-3.jpg",
        selected_checks=["person_count"],
    ),
    CameraCase(
        camera_id="cam_area2_02",
        image=AI_DIR / "contracts" / "example-1.jpg",
        selected_checks=["person_count", "helmet_count", "vest_count"],
    ),
]


def build_request(case: CameraCase) -> inference_pb2.InferRequest:
    return inference_pb2.InferRequest(
        camera_id=case.camera_id,
        frame_id=f"{case.camera_id}-{case.image.stem}",
        timestamp_utc=datetime.now(timezone.utc).isoformat(),
        image_uri=str(case.image),
        selected_checks=case.selected_checks,
        thresholds=inference_pb2.Thresholds(conf=0.25, iou=0.45),
    )


def verify(case: CameraCase, resp: inference_pb2.InferResponse) -> list[str]:
    """Return list of failure messages. Empty list = case passed."""
    failures: list[str] = []

    if resp.camera_id != case.camera_id:
        failures.append(
            f"camera_id mismatch: sent={case.camera_id!r} got={resp.camera_id!r}"
        )

    got_checks = {chk.check for chk in resp.check_results}
    expected_checks = set(case.selected_checks)
    missing = expected_checks - got_checks
    extra = got_checks - expected_checks
    if missing:
        failures.append(f"check_results missing checks: {sorted(missing)}")
    if extra:
        failures.append(f"check_results has unexpected checks: {sorted(extra)}")

    expected_models = {CHECK_TO_MODEL[c] for c in case.selected_checks}
    got_models = set(resp.model_tasks_executed)
    routing_missing = expected_models - got_models
    if routing_missing:
        failures.append(
            f"model routing wrong: expected_subset={sorted(expected_models)} "
            f"got={sorted(got_models)} missing={sorted(routing_missing)}"
        )

    if resp.latency_ms <= 0 or resp.latency_ms >= LATENCY_MAX_MS:
        failures.append(
            f"latency_ms unreasonable: {resp.latency_ms} "
            f"(expected 0 < x < {LATENCY_MAX_MS:.0f})"
        )

    return failures


def print_response_brief(resp: inference_pb2.InferResponse) -> None:
    print(f"    camera_id (echo)    : {resp.camera_id}")
    print(f"    latency_ms          : {resp.latency_ms:.1f}")
    print(f"    model_tasks_executed: {list(resp.model_tasks_executed)}")
    print(f"    detections          : {len(resp.detections)} item")
    print("    check_results:")
    for chk in resp.check_results:
        breakdown = dict(chk.details.breakdown)
        print(
            f"      - {chk.check:22s} value={chk.value} "
            f"avg_conf={chk.confidence:.3f} breakdown={breakdown}"
        )
    if resp.latency_ms > LATENCY_WARN_MS:
        print(
            f"    WARN: latency_ms={resp.latency_ms:.1f} "
            f"> {LATENCY_WARN_MS:.0f}ms"
        )


def main() -> int:
    print(f"connecting to {TARGET}")
    with grpc.insecure_channel(TARGET) as channel:
        stub = inference_pb2_grpc.InferenceServiceStub(channel)

        try:
            health = stub.Health(inference_pb2.HealthRequest(), timeout=5)
        except grpc.RpcError as exc:
            if exc.code() == grpc.StatusCode.UNAVAILABLE:
                print(
                    f"[error] AI service tidak menyala di {TARGET}. "
                    f"Jalankan `scripts/run_grpc_service.ps1` dulu."
                )
            else:
                print(f"[error] Health RPC failed: {exc.code()} {exc.details()}")
            return 1
        print(f"Health -> status={health.status!r}")

        results: list[tuple[CameraCase, list[str]]] = []
        for case in CAMERA_CASES:
            print(f"\n--- Camera {case.camera_id} ({case.image.name}) ---")
            print(f"    selected_checks     : {case.selected_checks}")
            if not case.image.exists():
                msg = f"image file missing: {case.image}"
                print(f"    [error] {msg}")
                results.append((case, [msg]))
                continue
            try:
                resp = stub.Infer(build_request(case), timeout=60)
            except grpc.RpcError as exc:
                msg = f"Infer RPC failed: {exc.code()} {exc.details()}"
                print(f"    [error] {msg}")
                results.append((case, [msg]))
                continue

            print_response_brief(resp)
            failures = verify(case, resp)
            results.append((case, failures))
            if failures:
                for f in failures:
                    print(f"    FAIL: {f}")
            else:
                print("    PASS")

    print("\n" + "=" * 64)
    print("MULTI-CAMERA SMOKE TEST SUMMARY")
    print("=" * 64)
    n_pass = 0
    for case, failures in results:
        status = "PASS" if not failures else "FAIL"
        print(f"  [{status}] {case.camera_id:14s} checks={case.selected_checks}")
        for f in failures:
            print(f"           - {f}")
        if not failures:
            n_pass += 1
    total = len(results)
    print("=" * 64)
    print(f"Overall: {n_pass}/{total} cameras passed")
    return 0 if n_pass == total else 1


if __name__ == "__main__":
    sys.exit(main())
