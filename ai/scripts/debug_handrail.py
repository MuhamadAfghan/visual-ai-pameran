"""Visualisasi debug handrail: render video beranotasi supaya kelihatan KENAPA
seseorang dinilai memegang / tidak memegang handrail.

Menggambar di tiap frame:
  - stairs_zone   (poligon HIJAU)
  - handrail_lines (satu/lebih garis BIRU tebal)
  - tiap person   : bbox berwarna sesuai verdict
        hijau  = holding (pegang)      merah = not_holding (tidak pegang)
        abu    = unknown (wrist tak terlihat)   tipis = di luar zona tangga
  - titik pergelangan tangan (KUNING) + rasio jarak ke garis (dist/tinggi-badan).
    Ambang "pegang" = _HANDRAIL_MAX_DIST (default 0.20). Rasio <= ambang -> pegang.

Pakai:
    .venv\\Scripts\\python.exe scripts\\debug_handrail.py ..\\backend\\temp\\stairs.mp4 \\
        --roi stairs_roi.json -o debug_handrail.mp4 [--sample-fps 6] [--max-frames N]

Output: file video MP4 beranotasi (default debug_handrail.mp4 di folder ai/) +
ringkasan teks ke stdout (redirect ke file dgn `> report.txt` kalau perlu).
"""
from __future__ import annotations

import argparse
import base64
import json
import sys
from datetime import datetime, timedelta, timezone

import cv2
import numpy as np

from cctv_insight_ai.pipelines.infer import (
    _HANDRAIL_MAX_DIST,
    _dist_to_polylines,
    _wrist_points,
    run_inference,
)
from cctv_insight_ai.service.schemas import InferenceRequest

_BASE = datetime(2026, 1, 1, tzinfo=timezone.utc)
_GREEN = (0, 200, 0)
_RED = (0, 0, 255)
_GRAY = (150, 150, 150)
_BLUE = (255, 140, 0)
_YELLOW = (0, 230, 230)
_VERDICT_COLOR = {"true": _GREEN, "false": _RED, "unknown": _GRAY}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--roi", required=True, help="JSON dari pick_roi.py (stairs_zone + handrail_lines)")
    ap.add_argument("-o", "--out", default="debug_handrail.mp4")
    ap.add_argument("--sample-fps", type=float, default=6.0)
    ap.add_argument("--device", default="auto")
    ap.add_argument("--max-frames", type=int, default=0)
    args = ap.parse_args()

    import os
    os.environ["AI_DEVICE"] = args.device

    with open(args.roi, encoding="utf-8") as f:
        roi = json.load(f)
    handrail_lines = roi.get("handrail_lines") or []
    if not handrail_lines and roi.get("handrail_line"):  # kompat format lama (1 garis)
        handrail_lines = [roi["handrail_line"]]
    stairs_zone = roi.get("stairs_zone", [])
    print(f"roi: stairs_zone={len(stairs_zone)} | handrail_lines={len(handrail_lines)} garis | "
          f"ambang pegang (dist/tinggi) = {_HANDRAIL_MAX_DIST}")

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        print(f"[error] tidak bisa buka video: {args.video}")
        return 1
    vid_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    step = max(1, round(vid_fps / args.sample_fps))
    writer = cv2.VideoWriter(args.out, cv2.VideoWriter_fourcc(*"mp4v"), args.sample_fps, (w, h))

    zone_px = [(int(p["x"] * w), int(p["y"] * h)) for p in stairs_zone]
    # banyak garis handrail (rail bisa di banyak sisi)
    lines_px = [[(p["x"] * w, p["y"] * h) for p in line] for line in handrail_lines if len(line) >= 2]

    idx = processed = 0
    n_on = n_hold = n_not = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % step != 0:
            idx += 1
            continue
        t = idx / vid_fps
        _, buf = cv2.imencode(".jpg", frame)
        req = InferenceRequest(
            camera_id="dbg", frame_id=f"f{idx}", timestamp_utc=_BASE + timedelta(seconds=t),
            image_base64=base64.b64encode(buf).decode(),
            selected_checks=["handrail_count"],
            stairs_zone=stairs_zone, handrail_lines=handrail_lines,
        )
        r = run_inference(req)

        disp = frame.copy()
        # zona + garis
        if len(zone_px) >= 3:
            cv2.polylines(disp, [np.array(zone_px, dtype=np.int32)], True, _GREEN, 2)
        for line in lines_px:
            cv2.polylines(disp, [np.array(line, dtype=np.int32)], False, _BLUE, 3)

        for det in r["detections"]:
            if det["label"] != "person":
                continue
            attrs = det.get("attributes", {})
            on_stairs = attrs.get("on_stairs") == "true"
            verdict = attrs.get("holding_handrail", "")
            x1, y1, x2, y2 = (int(v) for v in det["bbox"])
            color = _VERDICT_COLOR.get(verdict, _GRAY) if on_stairs else _GRAY
            thick = 3 if on_stairs else 1
            cv2.rectangle(disp, (x1, y1), (x2, y2), color, thick)
            label = verdict if on_stairs else "off-stairs"
            cv2.putText(disp, label, (x1, max(14, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
            # gambar pergelangan tangan + rasio jarak ke garis TERDEKAT
            if on_stairs and lines_px:
                person_h = max(1.0, det["bbox"][3] - det["bbox"][1])
                for wx, wy in _wrist_points(det):
                    cv2.circle(disp, (int(wx), int(wy)), 5, _YELLOW, -1)
                    ratio = _dist_to_polylines((wx, wy), lines_px) / person_h
                    cv2.putText(disp, f"{ratio:.2f}", (int(wx) + 6, int(wy)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, _YELLOW, 1)
            if on_stairs:
                n_on += 1
                n_hold += int(verdict == "true")
                n_not += int(verdict == "false")

        cv2.putText(disp, f"t={t:.1f}s  ambang={_HANDRAIL_MAX_DIST}", (10, 26),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, _YELLOW, 2)
        writer.write(disp)
        processed += 1
        idx += 1
        if args.max_frames and processed >= args.max_frames:
            break

    cap.release()
    writer.release()
    print(f"\n=== RINGKASAN ({processed} frame) ===")
    print(f"deteksi di-zona (akumulasi person-frame): {n_on}")
    print(f"  dinilai PEGANG     : {n_hold}")
    print(f"  dinilai TIDAK pegang: {n_not}")
    print(f"\nvideo beranotasi -> {args.out}")
    print("Buka video itu: lihat angka KUNING (rasio jarak). Kalau saat tangan jelas")
    print(f"di rail rasionya > {_HANDRAIL_MAX_DIST}, naikkan _HANDRAIL_MAX_DIST. Kalau titik")
    print("kuning (wrist) sendiri meleset dari tangan, itu batas pose model di sudut ini.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
