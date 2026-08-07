"""Benchmark people_counting model with ultralytics val() to capture
detection-level metrics (mAP50, etc.) and per-stage speed.

People-counting's eval_report.json records *counting* metrics (MAE,
within-1 accuracy) but no detection metrics or speed. To put it on the
accuracy-vs-speed scatter alongside the other production models, we
need its detection-level numbers.

Writes results to eval_report.json under a new top-level key
"detection_eval", leaving the existing counting "metrics" block
untouched.
"""

from __future__ import annotations

import json
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
AI_DIR = SCRIPT_DIR.parent

MODEL_KEY = "people_counting"
REPORT_PATH = AI_DIR / "research" / "artifacts" / MODEL_KEY / "eval_report.json"
WEIGHTS_PATH = (
    AI_DIR / "research" / "runs" / "detect" / "people_counting_yolo26m"
    / "weights" / "best.pt"
)
DATA_YAML = (
    AI_DIR / "research" / "datasets" / "processed"
    / "people_counting_single_class" / "data.yaml"
)

IMGSZ = 640
CONF = 0.25
SPLIT = "val"


def main() -> None:
    from ultralytics import YOLO

    assert WEIGHTS_PATH.is_file(), f"weights missing: {WEIGHTS_PATH}"
    assert DATA_YAML.is_file(), f"data.yaml missing: {DATA_YAML}"
    assert REPORT_PATH.is_file(), f"eval_report missing: {REPORT_PATH}"

    print(f"Loading model: {WEIGHTS_PATH}")
    model = YOLO(str(WEIGHTS_PATH))

    print(f"Running val on split='{SPLIT}', imgsz={IMGSZ}, conf={CONF} ...")
    results = model.val(
        data=str(DATA_YAML),
        imgsz=IMGSZ,
        conf=CONF,
        split=SPLIT,
        verbose=True,
    )

    map50 = float(results.box.map50)
    map5095 = float(results.box.map)
    precision = float(results.box.mp)
    recall = float(results.box.mr)

    speed = results.speed  # {'preprocess': ms, 'inference': ms, 'postprocess': ms}
    preprocess = float(speed.get("preprocess", 0.0))
    inference = float(speed.get("inference", 0.0))
    postprocess = float(speed.get("postprocess", 0.0))
    total = preprocess + inference + postprocess
    fps = 1000.0 / total if total > 0 else 0.0

    detection_block = {
        "eval_cfg": {"conf": CONF, "imgsz": IMGSZ, "split": SPLIT},
        "metrics": {
            "mAP50": map50,
            "mAP50-95": map5095,
            "precision": precision,
            "recall": recall,
        },
        "speed_ms": {
            "preprocess": preprocess,
            "inference": inference,
            "postprocess": postprocess,
            "total": total,
            "fps": fps,
        },
    }

    print("\n=== Detection-level results ===")
    print(json.dumps(detection_block, indent=2))

    with REPORT_PATH.open("r", encoding="utf-8") as f:
        report = json.load(f)
    report["detection_eval"] = detection_block
    with REPORT_PATH.open("w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)
    print(f"\nUpdated: {REPORT_PATH}")


if __name__ == "__main__":
    main()
