"""Gambar geometri ROI (stairs_zone + handrail_lines) di atas 1 frame video.

Dipakai untuk MENGATUR handrail tanpa UI (validasi/kalibrasi). Klik titik di
jendela gambar, simpan ke JSON ternormalisasi [0,1] yang langsung dipakai
`validate_behavior_video.py --roi <file>`.

Handrail bisa ada di BANYAK sisi tangga → bisa menggambar >1 garis.

Pakai:
    .venv\\Scripts\\python.exe scripts\\pick_roi.py <video.mp4> -o stairs_roi.json [--frame 0]

Alur klik (urut):
    1) FASE "stairs_zone": klik kiri = tambah titik poligon area tangga.
       Tekan SPASI / klik kanan untuk selesai fase ini (butuh >= 3 titik).
    2) FASE "handrail_lines": klik kiri = tambah titik garis handrail (urut).
       Tekan N untuk menyelesaikan garis ini & MULAI garis baru (rail sisi lain).
       Tekan SPASI / klik kanan untuk selesai semua garis.
    3) Tekan S untuk simpan, U undo titik terakhir, R reset garis aktif/zona,
       Q/ESC batal.

Output JSON: {"stairs_zone":   [{"x":..,"y":..}, ...],
              "handrail_lines": [ [{"x":..,"y":..}, ...], ... ]}  (semua [0,1])
"""
from __future__ import annotations

import argparse
import json
import sys

import cv2

_GREEN = (0, 200, 0)
_BLUE = (255, 140, 0)
_YELLOW = (0, 230, 230)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("video", help="path ke file video")
    ap.add_argument("-o", "--out", required=True, help="path output JSON")
    ap.add_argument("--frame", type=int, default=0, help="index frame yang dipakai sebagai latar")
    args = ap.parse_args()

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        print(f"[error] tidak bisa buka video: {args.video}")
        return 1
    if args.frame > 0:
        cap.set(cv2.CAP_PROP_POS_FRAMES, args.frame)
    ok, frame = cap.read()
    cap.release()
    if not ok:
        print(f"[error] tidak bisa baca frame {args.frame}")
        return 1

    h, w = frame.shape[:2]
    # State: fase 0 = stairs_zone, fase 1 = handrail_lines (banyak garis).
    # zone = poligon zona; lines = garis yang sudah selesai; current = garis aktif.
    state = {"phase": 0, "zone": [], "lines": [], "current": []}

    def cur_pts():
        return state["zone"] if state["phase"] == 0 else state["current"]

    def on_mouse(event, x, y, flags, _):
        if event == cv2.EVENT_LBUTTONDOWN:
            cur_pts().append((x, y))
        elif event == cv2.EVENT_RBUTTONDOWN:
            _advance()

    def _commit_line() -> bool:
        if len(state["current"]) < 2:
            if state["current"]:
                print("[!] garis butuh >= 2 titik (diabaikan)")
            return False
        state["lines"].append(list(state["current"]))
        state["current"].clear()
        return True

    def _advance():
        if state["phase"] == 0:
            if len(state["zone"]) < 3:
                print("[!] stairs_zone butuh >= 3 titik")
                return
            state["phase"] = 1
            print("[ok] stairs_zone selesai. Klik garis handrail (N=garis baru, SPASI=selesai).")
        else:
            _commit_line()

    def _norm(pts):
        return [{"x": round(x / w, 5), "y": round(y / h, 5)} for x, y in pts]

    win = "pick ROI  (kiri=tambah  N=garis-baru  kanan/SPASI=lanjut  U=undo  R=reset  S=simpan  Q=batal)"
    cv2.namedWindow(win, cv2.WINDOW_NORMAL)
    cv2.setMouseCallback(win, on_mouse)

    while True:
        disp = frame.copy()
        # stairs_zone (hijau, poligon)
        for i, p in enumerate(state["zone"]):
            cv2.circle(disp, p, 4, _GREEN, -1)
            if i > 0:
                cv2.line(disp, state["zone"][i - 1], p, _GREEN, 2)
        if len(state["zone"]) >= 3 and state["phase"] > 0:
            cv2.line(disp, state["zone"][-1], state["zone"][0], _GREEN, 2)
        # handrail_lines (biru): garis selesai + garis aktif
        for line in state["lines"] + [state["current"]]:
            for i, p in enumerate(line):
                cv2.circle(disp, p, 4, _BLUE, -1)
                if i > 0:
                    cv2.line(disp, line[i - 1], p, _BLUE, 2)

        phase_name = "stairs_zone (HIJAU)" if state["phase"] == 0 else "handrail_lines (BIRU)"
        cv2.putText(disp, f"Fase: {phase_name}  zona={len(state['zone'])}  "
                    f"garis_selesai={len(state['lines'])}  garis_aktif={len(state['current'])}",
                    (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.65, _YELLOW, 2)
        cv2.imshow(win, disp)

        key = cv2.waitKey(20) & 0xFF
        if key in (ord("q"), 27):  # Q / ESC
            print("[batal] tidak menyimpan.")
            cv2.destroyAllWindows()
            return 1
        if key == ord(" "):
            _advance()
        if key == ord("n") and state["phase"] == 1:
            if _commit_line():
                print(f"[ok] garis #{len(state['lines'])} disimpan, mulai garis baru.")
        if key == ord("u"):
            if cur_pts():
                cur_pts().pop()
            elif state["phase"] == 1 and state["lines"]:
                state["current"][:] = state["lines"].pop()  # ambil kembali garis terakhir utk edit
        if key == ord("r"):
            cur_pts().clear()
        if key == ord("s"):
            if len(state["zone"]) < 3:
                print("[!] stairs_zone belum >= 3 titik")
                continue
            lines = list(state["lines"])
            if len(state["current"]) >= 2:
                lines.append(list(state["current"]))
            if not lines:
                print("[!] belum ada garis handrail (>= 1 garis, masing-masing >= 2 titik)")
                continue
            out = {
                "stairs_zone": _norm(state["zone"]),
                "handrail_lines": [_norm(line) for line in lines],
            }
            with open(args.out, "w", encoding="utf-8") as f:
                json.dump(out, f, indent=2)
            print(f"[ok] tersimpan -> {args.out}")
            print(f"     stairs_zone={len(out['stairs_zone'])} titik, "
                  f"handrail_lines={len(out['handrail_lines'])} garis")
            cv2.destroyAllWindows()
            return 0


if __name__ == "__main__":
    sys.exit(main())
