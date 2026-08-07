"""Validasi deteksi perilaku (holding_phone / hand_in_pocket) pada file VIDEO.

Menjalankan pipeline AI frame-by-frame dengan timestamp realistis (dari fps video)
sehingga gate "berjalan" (camera_track_store) bekerja seperti di live. Berguna untuk
membuktikan & mengkalibrasi tanpa kamera sungguhan.

Pakai:
    .venv\\Scripts\\python.exe scripts\\validate_behavior_video.py <video.mp4> \\
        [--check holding_phone_count] [--sample-fps 6] [--device auto] [--max-frames N]

Output: ringkasan per-frame (person/phone/walking/violating) + verdict akhir
(kapan violation pertama menyala, berapa frame walking/phone/violating).
"""
from __future__ import annotations

import argparse
import base64
import json
import sys
from datetime import datetime, timedelta, timezone

import cv2

from cctv_insight_ai.pipelines.infer import run_inference
from cctv_insight_ai.service.schemas import InferenceRequest

_BASE = datetime(2026, 1, 1, tzinfo=timezone.utc)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("video", help="path ke file video (mp4/avi/mov/...)")
    ap.add_argument("--check", default="holding_phone_count")
    ap.add_argument("--sample-fps", type=float, default=6.0,
                    help="berapa frame/detik diproses (mendekati cadence live ~5-8)")
    ap.add_argument("--device", default="auto")
    ap.add_argument("--max-frames", type=int, default=0, help="0 = semua")
    ap.add_argument("--roi", default=None,
                    help="JSON dari pick_roi.py (stairs_zone + handrail_lines) untuk handrail_count")
    args = ap.parse_args()

    import os
    os.environ["AI_DEVICE"] = args.device

    # ROI geometri (handrail), field top-level InferenceRequest. Tanpa ini,
    # handrail_count selalu 0 (check di-skip).
    stairs_zone: list = []
    handrail_lines: list = []
    if args.roi:
        with open(args.roi, encoding="utf-8") as f:
            roi = json.load(f)
        handrail_lines = roi.get("handrail_lines") or []
        if not handrail_lines and roi.get("handrail_line"):  # kompat format lama (1 garis)
            handrail_lines = [roi["handrail_line"]]
        stairs_zone = roi.get("stairs_zone", [])
        print(f"roi: stairs_zone={len(stairs_zone)} titik | handrail_lines={len(handrail_lines)} garis")
    elif args.check == "handrail_count":
        print("[!] --check handrail_count tanpa --roi: stairs_zone/handrail_lines kosong -> check di-skip (semua 0)")

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        print(f"[error] tidak bisa buka video: {args.video}")
        return 1
    vid_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    step = max(1, round(vid_fps / args.sample_fps))
    print(f"video fps={vid_fps:.1f} | proses tiap {step} frame (~{vid_fps/step:.1f} fps) | check={args.check}")

    idx = processed = 0
    n_person = n_phone = n_walk = n_violate = 0
    first_violation_t = None
    _BREAKDOWN_KEY = {
        "holding_phone_count": "with_phone",
        "hand_in_pocket_count": "hand_in_pocket",
        "handrail_count": "not_holding",
    }
    breakdown_key = _BREAKDOWN_KEY.get(args.check, args.check)
    is_handrail = args.check == "handrail_count"

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % step != 0:
            idx += 1
            continue
        t = idx / vid_fps
        ok2, buf = cv2.imencode(".jpg", frame)
        req = InferenceRequest(
            camera_id="video-test", frame_id=f"f{idx}",
            timestamp_utc=_BASE + timedelta(seconds=t),
            image_base64=base64.b64encode(buf).decode(),
            selected_checks=[args.check],
            stairs_zone=stairs_zone,
            handrail_lines=handrail_lines,
        )
        r = run_inference(req)
        cr = next((c for c in r["check_results"] if c["check"] == args.check), None)
        bd = (cr or {}).get("details", {}).get("breakdown", {}) if cr else {}
        persons = sum(1 for d in r["detections"] if d["label"] == "person")
        phones = sum(1 for d in r["detections"] if d["label"] == "smartphone")
        walking = bd.get("walking", 0)
        with_sig = bd.get(breakdown_key, 0)
        violating = bool(r["violations"])
        n_person += int(persons > 0); n_phone += int(phones > 0)
        n_walk += int(walking > 0); n_violate += int(violating)
        if violating and first_violation_t is None:
            first_violation_t = t
        flag = "  <-- VIOLATION" if violating else ""
        if is_handrail:
            # untuk handrail kolom yg relevan: di-zona vs pegang vs tidak-pegang
            print(f"  t={t:5.1f}s person={persons} on_stairs={bd.get('on_stairs', 0)} "
                  f"holding={bd.get('holding', 0)} not_holding={with_sig}{flag}")
        else:
            print(f"  t={t:5.1f}s person={persons} phone={phones} "
                  f"{breakdown_key}={with_sig} walking={walking}{flag}")
        processed += 1
        idx += 1
        if args.max_frames and processed >= args.max_frames:
            break
    cap.release()

    print("\n=== VERDICT ===")
    print(f"frame diproses        : {processed}")
    print(f"ada person            : {n_person}")
    print(f"ada smartphone        : {n_phone}")
    print(f"terdeteksi 'walking'  : {n_walk}")
    print(f"VIOLATION             : {n_violate} frame"
          + (f", pertama di t={first_violation_t:.1f}s" if first_violation_t is not None else ""))
    if processed and n_violate == 0:
        print("\n[diagnosis] tidak ada violation. Lihat kolom mana yang selalu 0:")
        if is_handrail:
            print("  person=0     -> pose tidak deteksi orang (terlalu jauh/kecil)")
            print("  on_stairs=0  -> stairs_zone salah/terlalu kecil, kaki orang di luar zona")
            print("  not_holding=0 & holding>0 -> bagus: orang memang pegang handrail")
            print("  not_holding=0 & holding=0 -> handrail_line jauh dari pergelangan; "
                  "cek _HANDRAIL_MAX_DIST atau geometri garis")
        else:
            print("  person=0   -> pose tidak deteksi orang (terlalu jauh/kecil)")
            print("  phone=0    -> detektor HP gagal (objek terlalu kecil di jarak ini)")
            print("  walking=0  -> gerak di bawah ambang / track terputus")
    return 0


if __name__ == "__main__":
    sys.exit(main())
