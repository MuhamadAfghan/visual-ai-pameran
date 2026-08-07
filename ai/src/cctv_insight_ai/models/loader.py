from __future__ import annotations

import os
import threading

import numpy as np
from ultralytics import YOLO

from cctv_insight_ai.models.registry import MODEL_REGISTRY
from cctv_insight_ai.utils.device import pick_runtime_device


class ModelManager:
    """Thread-safe singleton that lazy-loads and caches YOLO models."""

    _instance: ModelManager | None = None
    _class_lock = threading.Lock()

    def __new__(cls) -> ModelManager:
        if cls._instance is None:
            with cls._class_lock:
                if cls._instance is None:
                    inst = super().__new__(cls)
                    inst._models: dict[str, YOLO] = {}
                    inst._load_lock = threading.Lock()
                    cls._instance = inst
        return cls._instance

    def get(self, key: str) -> YOLO:
        """Return a loaded YOLO model for the given registry key.

        Loads from disk on first access; subsequent calls return the cached
        instance. Thread-safe — concurrent callers for the same key will
        block until the first load completes rather than loading twice.

        The first `predict()` on a YOLO model fuses Conv+BatchNorm layers, and
        that fuse is NOT thread-safe (check-then-`delattr` on `bn`). If several
        concurrent requests hit a cold model at once they race and crash with
        `'Conv' object has no attribute 'bn'`. We therefore warm up (fuse) the
        model once here under the load lock, single-threaded, before publishing
        it to the cache — so it's already fused before any parallel use.
        """
        if key not in self._models:
            with self._load_lock:
                if key not in self._models:
                    spec = MODEL_REGISTRY[key]
                    model = YOLO(spec.weights_path)
                    self._warmup(model)
                    self._models[key] = model
        return self._models[key]

    @staticmethod
    def _warmup(model: YOLO) -> None:
        """Run one dummy predict so the (non-thread-safe) fuse happens once."""
        device = pick_runtime_device(os.getenv("AI_DEVICE", "auto"))
        dummy = np.zeros((640, 640, 3), dtype=np.uint8)
        model.predict(dummy, device=device, verbose=False)

    def warmup(self, keys: list[str]) -> None:
        """Pre-load a list of models at service startup to avoid cold-start latency."""
        for key in keys:
            self.get(key)

    @property
    def loaded_keys(self) -> list[str]:
        return list(self._models.keys())


# Module-level singleton — import this everywhere instead of instantiating directly.
model_manager = ModelManager()
