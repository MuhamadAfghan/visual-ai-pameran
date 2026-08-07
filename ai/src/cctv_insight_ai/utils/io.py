from __future__ import annotations

import base64
import urllib.request
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image, ImageFile

# Allow PIL to read JPEGs that are slightly truncated (e.g. from network capture)
ImageFile.LOAD_TRUNCATED_IMAGES = True


def ensure_dir(path: str) -> Path:
    out = Path(path)
    out.mkdir(parents=True, exist_ok=True)
    return out


def load_image(image_uri: str | None, image_base64: str | None) -> np.ndarray:
    """Decode image dari base64 / file / http URI ke BGR numpy array.

    Return BGR (bukan RGB) karena downstream-nya ultralytics YOLO yang assume
    BGR untuk numpy array (mengikuti konvensi cv2.imread). Kalau di-pass RGB
    channel R↔B ke-swap dan deteksi-nya jadi salah (mis. vest oranye dianggap
    biru lalu di-misklasifikasi sebagai no-vest).
    """
    if image_base64:
        data = base64.b64decode(image_base64)
        img = Image.open(BytesIO(data)).convert("RGB")
    elif image_uri and image_uri.startswith(("http://", "https://")):
        with urllib.request.urlopen(image_uri) as resp:  # noqa: S310
            img = Image.open(BytesIO(resp.read())).convert("RGB")
    elif image_uri:
        img = Image.open(image_uri).convert("RGB")
    else:
        raise ValueError("Either image_uri or image_base64 must be provided")
    return np.array(img)[..., ::-1]
