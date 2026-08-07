from __future__ import annotations

from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable
import json
import math

from ultralytics import YOLO

from cctv_insight_ai.models.registry import MODEL_REGISTRY


@dataclass(frozen=True)
class PeopleCountingSample:
    image_path: Path
    label_path: Path
    ground_truth_count: int
    predicted_count: int


@dataclass(frozen=True)
class PeopleCountingMetrics:
    samples: int
    mae: float
    rmse: float
    exact_match_accuracy: float
    within_1_count_accuracy: float
    bias: float


class PeopleCountingEvaluator:
    def __init__(self, weights_path: str, device: str = "cpu", confidence: float = 0.25):
        self.model = YOLO(weights_path)
        self.device = device
        self.confidence = confidence

    @staticmethod
    def _count_people_from_label_file(label_path: Path) -> int:
        if not label_path.exists():
            return 0
        count = 0
        for line in label_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            class_id = line.split()[0]
            if class_id == "0":
                count += 1
        return count

    def _predict_people_count(self, image_path: Path) -> int:
        results = self.model.predict(
            source=str(image_path),
            conf=self.confidence,
            device=self.device,
            verbose=False,
        )
        if not results:
            return 0
        return sum(1 for box in results[0].boxes if int(box.cls.item()) == 0)

    @staticmethod
    def _collect_images(root: Path) -> Iterable[Path]:
        for split in ("train", "valid", "val", "test"):
            image_dir = root / split / "images"
            if image_dir.exists():
                yield from sorted(image_dir.rglob("*.jpg"))
                yield from sorted(image_dir.rglob("*.jpeg"))
                yield from sorted(image_dir.rglob("*.png"))

    def evaluate(self, dataset_root: str) -> tuple[PeopleCountingMetrics, list[PeopleCountingSample]]:
        root = Path(dataset_root)
        images = list(self._collect_images(root))
        if not images:
            raise FileNotFoundError(f"No images found in dataset root: {root}")

        samples: list[PeopleCountingSample] = []
        errors: list[float] = []
        absolute_errors: list[float] = []
        exact_match_hits = 0
        within_1_hits = 0

        for image_path in images:
            label_path = image_path.parent.parent / "labels" / f"{image_path.stem}.txt"
            gt_count = self._count_people_from_label_file(label_path)
            pred_count = self._predict_people_count(image_path)
            error = pred_count - gt_count
            abs_error = abs(error)

            samples.append(
                PeopleCountingSample(
                    image_path=image_path,
                    label_path=label_path,
                    ground_truth_count=gt_count,
                    predicted_count=pred_count,
                )
            )
            errors.append(float(error))
            absolute_errors.append(float(abs_error))

            if error == 0:
                exact_match_hits += 1
            if abs_error <= 1:
                within_1_hits += 1

        sample_count = len(samples)
        mae = sum(absolute_errors) / sample_count
        rmse = math.sqrt(sum(error * error for error in errors) / sample_count)
        bias = sum(errors) / sample_count
        metrics = PeopleCountingMetrics(
            samples=sample_count,
            mae=mae,
            rmse=rmse,
            exact_match_accuracy=exact_match_hits / sample_count,
            within_1_count_accuracy=within_1_hits / sample_count,
            bias=bias,
        )
        return metrics, samples

    @staticmethod
    def dump_report(metrics: PeopleCountingMetrics, samples: list[PeopleCountingSample], output_path: str) -> None:
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "metrics": asdict(metrics),
            "samples": [
                {
                    "image_path": str(sample.image_path),
                    "label_path": str(sample.label_path),
                    "ground_truth_count": sample.ground_truth_count,
                    "predicted_count": sample.predicted_count,
                }
                for sample in samples
            ],
        }
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def get_research_model_spec(model_name: str = "yolo26x"):
    if model_name not in MODEL_REGISTRY:
        raise KeyError(f"Model not found in registry: {model_name}")
    return MODEL_REGISTRY[model_name]
