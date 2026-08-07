from __future__ import annotations


def pick_runtime_device(preferred: str = "auto") -> str:
    """Pick runtime device with CUDA priority and CPU fallback."""
    choice = (preferred or "auto").strip().lower()

    try:
        import torch
    except Exception:
        return "cpu"

    if choice == "auto":
        if torch.cuda.is_available():
            return "cuda"
        return "cpu"

    if choice == "cuda":
        if torch.cuda.is_available():
            return "cuda"
        return "cpu"

    if choice == "cpu":
        return "cpu"

    return "cpu"
