"""Sustained-inference stress test for the 4 production models.

Runs each model for N iterations on a fixed test image to measure
latency distribution (p50 / p95 / p99) and per-model VRAM footprint.
Also measures the total VRAM when all 4 models are loaded
simultaneously — relevant for multi-model deployment on the RTX 4060
Laptop GPU (8 GB).

This is a *model-level* stress test (Python pipeline, no HTTP service).
Service-level concurrent-client load tests would be a separate run.

Output JSON written to:
    ai/research/artifacts/system_performance/stress_test.json
"""

from __future__ import annotations

import gc
import json
import time
from pathlib import Path

import cv2
import numpy as np
import torch
from ultralytics import YOLO

SCRIPT_DIR = Path(__file__).resolve().parent
AI_DIR = SCRIPT_DIR.parent

TEST_IMAGE = AI_DIR / "contracts" / "example-1.jpg"
OUT_DIR = AI_DIR / "research" / "artifacts" / "system_performance"
OUT_PATH = OUT_DIR / "stress_test.json"

WEIGHTS: dict[str, Path] = {
    "face_mask": AI_DIR / "research/runs/detect/face_mask_yolo26m/weights/best.pt",
    "helmet_and_vest": AI_DIR / "research/runs/detect/helmet_and_vest_yolo26m/weights/best.pt",
    "ppe_compliance": AI_DIR / "research/runs/detect/ppe_compliance_yolo26m/weights/best.pt",
    "people_counting": AI_DIR / "research/runs/detect/people_counting_yolo26m/weights/best.pt",
}

N_ITERATIONS = 200
WARMUP = 10
IMGSZ = 640
CONF = 0.25


def gpu_reserved_gb() -> float:
    return torch.cuda.memory_reserved() / (1024**3)


def reset_cuda() -> None:
    gc.collect()
    torch.cuda.empty_cache()
    torch.cuda.synchronize()


def benchmark_one(model_key: str, weights: Path, img: np.ndarray) -> dict:
    print(f"\n--- {model_key} ---")
    reset_cuda()
    vram_baseline = gpu_reserved_gb()

    model = YOLO(str(weights))
    # First forward pass to load CUDA kernels / lazily allocate buffers
    _ = model.predict(img, imgsz=IMGSZ, conf=CONF, verbose=False)
    torch.cuda.synchronize()
    vram_after_load = gpu_reserved_gb()

    print(f"  VRAM reserved after load: {vram_after_load:.2f} GB "
          f"(+{vram_after_load - vram_baseline:.2f} GB vs baseline)")

    for _ in range(WARMUP):
        _ = model.predict(img, imgsz=IMGSZ, conf=CONF, verbose=False)
    torch.cuda.synchronize()

    latencies_ms: list[float] = []
    for _ in range(N_ITERATIONS):
        torch.cuda.synchronize()
        t0 = time.perf_counter()
        _ = model.predict(img, imgsz=IMGSZ, conf=CONF, verbose=False)
        torch.cuda.synchronize()
        t1 = time.perf_counter()
        latencies_ms.append((t1 - t0) * 1000.0)

    arr = np.array(latencies_ms)
    summary = {
        "n_iterations": N_ITERATIONS,
        "mean_ms": float(arr.mean()),
        "std_ms": float(arr.std()),
        "min_ms": float(arr.min()),
        "p50_ms": float(np.percentile(arr, 50)),
        "p95_ms": float(np.percentile(arr, 95)),
        "p99_ms": float(np.percentile(arr, 99)),
        "max_ms": float(arr.max()),
        "throughput_fps": float(1000.0 / arr.mean()),
        "vram_reserved_gb": float(vram_after_load - vram_baseline),
        "latency_samples_ms": latencies_ms,
    }
    print(
        f"  p50={summary['p50_ms']:.2f} ms  "
        f"p95={summary['p95_ms']:.2f} ms  "
        f"p99={summary['p99_ms']:.2f} ms  "
        f"throughput={summary['throughput_fps']:.1f} FPS"
    )

    # Release for next benchmark
    del model
    reset_cuda()
    return summary


def measure_all_loaded(img: np.ndarray) -> dict:
    """Load all 4 models simultaneously, measure total VRAM."""
    print("\n--- all 4 models loaded simultaneously ---")
    reset_cuda()
    baseline = gpu_reserved_gb()

    models = []
    for model_key, weights in WEIGHTS.items():
        m = YOLO(str(weights))
        # warm up so kernels are loaded
        _ = m.predict(img, imgsz=IMGSZ, conf=CONF, verbose=False)
        models.append((model_key, m))
        torch.cuda.synchronize()
        print(f"  after loading {model_key:<20s}: "
              f"{gpu_reserved_gb():.2f} GB reserved")

    total = gpu_reserved_gb()
    delta = total - baseline
    print(f"  TOTAL VRAM reserved: {total:.2f} GB (delta {delta:.2f} GB)")

    # cleanup
    del models
    reset_cuda()
    return {
        "models": list(WEIGHTS.keys()),
        "total_vram_reserved_gb": float(total),
        "delta_vs_baseline_gb": float(delta),
    }


def main() -> None:
    assert torch.cuda.is_available(), "CUDA not available — benchmark requires GPU"
    assert TEST_IMAGE.is_file(), f"test image missing: {TEST_IMAGE}"
    for key, w in WEIGHTS.items():
        assert w.is_file(), f"weights missing for {key}: {w}"

    img = cv2.imread(str(TEST_IMAGE))
    assert img is not None, f"cv2 failed to read {TEST_IMAGE}"

    gpu_name = torch.cuda.get_device_name(0)
    total_vram = torch.cuda.get_device_properties(0).total_memory / (1024**3)
    print(f"GPU: {gpu_name}  ({total_vram:.1f} GB total)")
    print(f"Test image: {TEST_IMAGE.name}  shape={img.shape}")
    print(f"Iterations per model: {N_ITERATIONS} (warmup {WARMUP})")

    per_model: dict[str, dict] = {}
    for model_key, weights in WEIGHTS.items():
        per_model[model_key] = benchmark_one(model_key, weights, img)

    all_loaded = measure_all_loaded(img)

    report = {
        "benchmark_cfg": {
            "n_iterations": N_ITERATIONS,
            "warmup": WARMUP,
            "imgsz": IMGSZ,
            "conf": CONF,
            "test_image": str(TEST_IMAGE.relative_to(AI_DIR)),
            "device": "cuda:0",
            "gpu_name": gpu_name,
            "total_vram_gb": float(total_vram),
        },
        "per_model": per_model,
        "all_loaded": all_loaded,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"\nSaved: {OUT_PATH}")


if __name__ == "__main__":
    main()
