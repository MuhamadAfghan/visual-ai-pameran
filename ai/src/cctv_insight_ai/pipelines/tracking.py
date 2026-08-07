"""Lightweight per-camera tracker + motion ("walking") estimation — Fase B.

Stateful component (a deliberate, scoped exception to the otherwise stateless AI
service): to decide whether a detection is "walking" we must follow the same
person across consecutive frames. We use a simple greedy IoU tracker per camera —
no external deps, deterministic, easy to test. ByteTrack can replace it later if
occlusion handling becomes a problem.

Contract: `camera_track_store.update(camera_id, ts, detections)` mutates each
detection dict in place, setting `track_id` and `attributes["walking"]`
("true"/"false"). `ts` is capture time in float epoch seconds; frames must be fed
in capture order per camera (out-of-order frames are ignored for state).
"""
from __future__ import annotations

import math
import threading
from collections import deque
from dataclasses import dataclass, field

# --- Tunables ---------------------------------------------------------------
# These are heuristics; expect to calibrate per camera (FoV / distance) later.
_IOU_MATCH_THRESHOLD = 0.3          # min IoU to treat two boxes as the same track
_TRACK_TTL_SECONDS = 2.0           # drop a track not seen for this long
_HISTORY_MAXLEN = 30               # cap per-track position history
_MIN_OBS_FOR_MOTION = 3            # need >= N observations before judging motion
_MOTION_WINDOW_SECONDS = 1.0       # look back this far to estimate speed
# "walking" if normalized speed exceeds this. Speed unit = bbox-heights / second.
# Motion = centroid displacement (lateral) + bbox-height change (toward/away from
# camera — barely moves the centroid), both divided by bbox height (scale-
# invariant). Net displacement over the window cancels jitter, so a low threshold
# stays safe for a standing person.
_WALKING_SPEED_THRESHOLD = 0.25


def _iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0.0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0.0 else 0.0


@dataclass
class _Track:
    track_id: int
    bbox: tuple[float, float, float, float]
    last_ts: float
    # history of (cx, cy, ts, bbox_height)
    history: deque = field(default_factory=lambda: deque(maxlen=_HISTORY_MAXLEN))


@dataclass
class _CameraState:
    next_id: int = 1
    last_ts: float = float("-inf")
    tracks: dict[int, _Track] = field(default_factory=dict)
    lock: threading.Lock = field(default_factory=threading.Lock)


def _motion_speed(track: _Track, now: float) -> float | None:
    """Net motion over the recent window in bbox-heights/sec, or None if too few
    observations. Combines centroid displacement (lateral motion) and bbox-height
    change (walking toward/away from camera, which barely shifts the centroid)."""
    window = [h for h in track.history if now - h[2] <= _MOTION_WINDOW_SECONDS]
    if len(window) < _MIN_OBS_FOR_MOTION:
        return None
    x0, y0, t0, h0 = window[0]
    x1, y1, t1, h1 = window[-1]
    dt = t1 - t0
    if dt <= 0.0:
        return None
    height = (h0 + h1) / 2.0 or 1.0
    disp = (math.hypot(x1 - x0, y1 - y0) + abs(h1 - h0)) / height
    return disp / dt


class CameraTrackStore:
    """Thread-safe per-camera greedy-IoU tracker with motion estimation."""

    def __init__(self) -> None:
        self._cameras: dict[str, _CameraState] = {}
        self._store_lock = threading.Lock()

    def _state(self, camera_id: str) -> _CameraState:
        with self._store_lock:
            st = self._cameras.get(camera_id)
            if st is None:
                st = _CameraState()
                self._cameras[camera_id] = st
            return st

    @staticmethod
    def _prune(state: _CameraState, now: float) -> None:
        dead = [tid for tid, tr in state.tracks.items() if now - tr.last_ts > _TRACK_TTL_SECONDS]
        for tid in dead:
            del state.tracks[tid]

    def update(self, camera_id: str, ts: float, detections: list[dict]) -> None:
        """Assign `track_id` + `attributes['walking']` to each detection in place.

        Each detection needs `bbox` = [x1, y1, x2, y2]. Frames must arrive in
        capture order; an out-of-order frame is not folded into state (its
        detections get track_id=None, walking=false) to keep motion meaningful.
        """
        state = self._state(camera_id)
        with state.lock:
            if ts <= state.last_ts:
                for det in detections:
                    det["track_id"] = None
                    det.setdefault("attributes", {})["walking"] = "false"
                return

            self._prune(state, ts)
            matched: set[int] = set()
            for det in detections:
                bbox = tuple(float(v) for v in det["bbox"])
                best_id: int | None = None
                best_iou = _IOU_MATCH_THRESHOLD
                for tr in state.tracks.values():
                    if tr.track_id in matched:
                        continue
                    score = _iou(bbox, tr.bbox)
                    if score >= best_iou:
                        best_iou, best_id = score, tr.track_id

                if best_id is None:
                    track = _Track(track_id=state.next_id, bbox=bbox, last_ts=ts)
                    state.next_id += 1
                    state.tracks[track.track_id] = track
                else:
                    track = state.tracks[best_id]
                    track.bbox = bbox
                    track.last_ts = ts

                matched.add(track.track_id)
                cx = (bbox[0] + bbox[2]) / 2.0
                cy = (bbox[1] + bbox[3]) / 2.0
                height = max(1.0, bbox[3] - bbox[1])
                track.history.append((cx, cy, ts, height))

                speed = _motion_speed(track, ts)
                walking = speed is not None and speed >= _WALKING_SPEED_THRESHOLD
                det["track_id"] = track.track_id
                det.setdefault("attributes", {})["walking"] = "true" if walking else "false"

            state.last_ts = ts

    def reset(self) -> None:
        """Clear all camera state (test helper / service restart hook)."""
        with self._store_lock:
            self._cameras.clear()


# Module-level singleton — import this everywhere.
camera_track_store = CameraTrackStore()
