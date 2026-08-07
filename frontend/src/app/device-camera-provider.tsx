/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getCameras, pushFrame } from "../services/camera.service";
import type { Camera } from "../types/camera.types";
import { publishClientLog } from "../stores/client-log.store";
import { useAuth } from "./auth-provider";
import { usePermission } from "../hooks/use-permission";

type DeviceCameraContextValue = {
  stream: MediaStream | null;
  activeCameraId: string | null;
  lastCapture: Date | null;
  capturePending: boolean;
  error: string | null;
  /** All active device cameras configured in the system (refreshed periodically). */
  availableDeviceCameras: Camera[];
  startCapture: (cameraId: string, intervalSec: number) => Promise<void>;
  stopCapture: () => void;
};

const DeviceCameraContext = createContext<DeviceCameraContextValue | undefined>(undefined);

const LOG = "[DeviceCamera]";
const RETRY_WHEN_NOT_READY_MS = 2_000;
const CAMERA_LIST_REFRESH_MS = 60_000;

export function DeviceCameraProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { canUpdate } = usePermission();
  // Push-frame endpoint requires `cameras:update`. Without it the backend
  // returns 403 on every push, spamming the system log. Only admin/super_admin
  // (and custom roles with cameras:update) may operate the device-camera loop.
  const canPushFrames = canUpdate("cameras");

  /*
   * Off-screen video for canvas capture.
   * Must NOT be display:none — Chrome won't decode MediaStream frames for invisible elements,
   * keeping videoWidth=0 permanently. Off-screen + opacity:0 keeps decoding active.
   */
  const hiddenVideoRef = useRef<HTMLVideoElement>(null);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingRef = useRef(false);
  const cameraIdRef = useRef<string | null>(null);
  const intervalSecRef = useRef<number>(0);
  const tickCountRef = useRef(0);
  const skipCountRef = useRef(0);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [lastCapture, setLastCapture] = useState<Date | null>(null);
  const [capturePending, setCapturePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableDeviceCameras, setAvailableDeviceCameras] = useState<Camera[]>([]);

  // Attach stream to hidden video whenever it changes
  useEffect(() => {
    if (hiddenVideoRef.current) {
      hiddenVideoRef.current.srcObject = stream;
    }
  }, [stream]);

  // ── Timer helpers ────────────────────────────────────────────────────────────

  const clearCaptureTimer = useCallback(() => {
    if (captureTimerRef.current) {
      clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
    }
  }, []);

  const clearRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  // ── Capture loop ─────────────────────────────────────────────────────────────

  const scheduleNextCapture = useCallback(
    (delayMs: number) => {
      clearCaptureTimer();
      if (!cameraIdRef.current) return;
      captureTimerRef.current = setTimeout(() => void doCapture(), delayMs);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearCaptureTimer]
  );

  async function doCapture() {
    const cameraId = cameraIdRef.current;
    const video = hiddenVideoRef.current;
    // Soft floor (minCaptureGapSeconds), not a fixed wait: the loop re-arms
    // as soon as the previous push round-trip settles, only padding out to
    // this floor if the caller configured one. 0 (the default) means no
    // artificial delay at all — push as fast as capture+encode+upload+AI
    // round-trip allows, same self-pacing principle as the RTSP monitoring
    // hub's frame-arrival-driven loop.
    const floorMs = intervalSecRef.current * 1_000;

    if (!cameraId || !video) return;

    if (pendingRef.current) {
      console.warn(`${LOG} previous capture still pending — retrying in ${RETRY_WHEN_NOT_READY_MS}ms`);
      publishClientLog("warn", `Previous capture still pending → retry in ${RETRY_WHEN_NOT_READY_MS / 1000}s`, {
        cameraId,
        frame: tickCountRef.current
      });
      scheduleNextCapture(RETRY_WHEN_NOT_READY_MS);
      return;
    }

    // ── Pre-flight: video not ready yet → quick retry instead of waiting full interval
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      skipCountRef.current += 1;
      console.warn(
        `${LOG} video not ready (readyState=${video.readyState}, ${video.videoWidth}x${video.videoHeight}) — retry in ${RETRY_WHEN_NOT_READY_MS}ms`
      );
      publishClientLog("warn", `Video not ready → retry in ${RETRY_WHEN_NOT_READY_MS / 1000}s`, {
        cameraId,
        readyState: video.readyState,
        resolution: `${video.videoWidth}x${video.videoHeight}`,
        skipCount: skipCountRef.current
      });
      scheduleNextCapture(RETRY_WHEN_NOT_READY_MS);
      return;
    }

    tickCountRef.current += 1;
    pendingRef.current = true;
    setCapturePending(true);

    const frameNum = tickCountRef.current;
    const startedAt = performance.now();
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Flip horizontally to produce a non-mirrored frame for backend inference
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0);
    }
    const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];

    publishClientLog("info", `⟳ Sending frame #${frameNum} → cameraId=${cameraId}`, {
      frame: frameNum,
      cameraId,
      resolution: `${canvas.width}x${canvas.height}`
    });

    try {
      await pushFrame(cameraId, base64);
      const elapsed = Math.round(performance.now() - startedAt);
      setLastCapture(new Date());
      console.info(
        `${LOG} ✓ frame #${frameNum} captured (${canvas.width}x${canvas.height}, ${elapsed}ms) → cameraId=${cameraId}`
      );
      publishClientLog("info", `✓ Frame #${frameNum} OK — ${elapsed}ms → cameraId=${cameraId}`, {
        frame: frameNum,
        cameraId,
        elapsed,
        resolution: `${canvas.width}x${canvas.height}`,
        interval: `${intervalSecRef.current}s`
      });
      queryClient.invalidateQueries({ queryKey: ["events", { cameraId, limit: 10 }] });
      queryClient.invalidateQueries({ queryKey: ["cameras", cameraId] });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`${LOG} pushFrame failed:`, err);
      publishClientLog("error", `✗ Frame #${frameNum} failed — ${msg}`, {
        frame: frameNum,
        cameraId,
        reason: msg
      });
    } finally {
      pendingRef.current = false;
      setCapturePending(false);
      const elapsedSinceStart = performance.now() - startedAt;
      scheduleNextCapture(Math.max(0, floorMs - elapsedSinceStart));
    }
  }

  // ── Public actions ───────────────────────────────────────────────────────────

  async function startCapture(cameraId: string, intervalSec: number) {
    // Guard: user must have cameras:update to push frames, otherwise every tick → 403
    if (!canPushFrames) {
      console.info(`${LOG} startCapture skipped — current role lacks cameras:update permission`);
      publishClientLog(
        "warn",
        `Capture skipped → cameraId=${cameraId}: role tidak punya permission cameras:update`,
        { cameraId, reason: "missing_permission" }
      );
      return;
    }

    // Already running for this camera — just refresh interval value
    if (cameraIdRef.current === cameraId && captureTimerRef.current !== null) {
      intervalSecRef.current = intervalSec;
      console.info(`${LOG} already capturing cameraId=${cameraId} (interval=${intervalSec}s) — no-op`);
      publishClientLog("info", `Already capturing cameraId=${cameraId} interval=${intervalSec}s (no-op)`);
      return;
    }

    setError(null);
    publishClientLog("info", `Requesting camera access → cameraId=${cameraId} interval=${intervalSec}s...`);
    console.info(`${LOG} requesting getUserMedia for cameraId=${cameraId} (interval=${intervalSec}s)…`);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });

      cameraIdRef.current = cameraId;
      intervalSecRef.current = intervalSec;
      tickCountRef.current = 0;
      skipCountRef.current = 0;
      setStream(mediaStream);
      setActiveCameraId(cameraId);
      setLastCapture(null);

      const track = mediaStream.getVideoTracks()[0];
      const settings = track?.getSettings();
      const resolution = `${settings?.width ?? "?"}x${settings?.height ?? "?"}`;
      const deviceLabel = track?.label ?? "unknown";
      console.info(
        `${LOG} ▶ capture started cameraId=${cameraId} interval=${intervalSec}s device="${deviceLabel}" (${resolution})`
      );
      publishClientLog("info", `▶ Capture started — cameraId=${cameraId} interval=${intervalSec}s`, {
        cameraId,
        interval: `${intervalSec}s`,
        device: deviceLabel,
        resolution
      });

      // Kick off the loop — quick first attempt; doCapture will retry-on-not-ready
      scheduleNextCapture(RETRY_WHEN_NOT_READY_MS);
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Izin kamera ditolak. Izinkan akses kamera di browser."
          : err instanceof DOMException && err.name === "NotFoundError"
            ? "Tidak ada kamera yang terdeteksi."
            : "Gagal mengakses kamera device.";
      const reason = err instanceof DOMException ? err.name : err instanceof Error ? err.message : String(err);
      console.warn(`${LOG} getUserMedia failed:`, err);
      publishClientLog("error", `Camera access failed — ${msg}`, { cameraId, reason });
      setError(msg);
    }
  }

  function stopCapture() {
    if (cameraIdRef.current) {
      console.info(
        `${LOG} ■ capture stopped cameraId=${cameraIdRef.current} (frames=${tickCountRef.current}, skips=${skipCountRef.current})`
      );
      publishClientLog("info", `■ Capture stopped — cameraId=${cameraIdRef.current}`, {
        cameraId: cameraIdRef.current,
        frames: tickCountRef.current,
        skips: skipCountRef.current
      });
    }
    clearCaptureTimer();
    cameraIdRef.current = null;
    setStream((prev) => {
      prev?.getTracks().forEach((t) => t.stop());
      return null;
    });
    setActiveCameraId(null);
    setLastCapture(null);
    pendingRef.current = false;
    setCapturePending(false);
    setError(null);
    if (hiddenVideoRef.current) hiddenVideoRef.current.srcObject = null;
  }

  // ── Camera list polling — pick up newly-added device cameras ─────────────────

  const refreshDeviceCameraList = useCallback(async () => {
    try {
      const cameras = await getCameras({ isActive: true });
      const deviceCams = cameras.filter((c) => c.sourceType === "device");
      setAvailableDeviceCameras(deviceCams);

      const activeId = cameraIdRef.current;
      const activeLabel = activeId
        ? deviceCams.find((c) => c._id === activeId)?.name ?? activeId
        : "none";
      console.info(
        `${LOG} device cameras configured: ${deviceCams.length} | currently capturing: ${activeId ? `"${activeLabel}"` : "none"}`
      );
      publishClientLog("info", `Camera list refreshed — ${deviceCams.length} device camera(s)`, {
        count: deviceCams.length,
        capturing: activeId ? activeLabel : "none"
      });
      if (deviceCams.length > 1) {
        console.info(
          `${LOG} note: ${deviceCams.length} device cameras exist but only 1 can stream per browser tab.`
        );
        publishClientLog("warn", `${deviceCams.length} device cameras found — only 1 can stream per tab`, {
          cameras: deviceCams.map((c) => c.name).join(", ")
        });
      }

      // Auto-start first device camera if nothing is running
      if (!activeId && deviceCams.length > 0) {
        const first = deviceCams[0];
        publishClientLog("info", `Auto-starting capture → "${first.name}" (${first._id})`, {
          cameraId: first._id,
          interval: `${first.minCaptureGapSeconds ?? 0}s`
        });
        void startCapture(first._id, first.minCaptureGapSeconds ?? 0);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`${LOG} failed to fetch camera list:`, err);
      publishClientLog("error", `Failed to refresh camera list — ${msg}`);
    }
    // startCapture is a stable plain function defined inside the component — adding it
    // to deps would re-create this callback on every render; the current behavior is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-start / auto-stop based on auth + permission ────────────────────────
  // The device-camera capture loop posts to /push-frame which requires
  // `cameras:update`. Viewer / guest / pic accounts do not have it, so we must
  // never start the loop for them — otherwise every interval tick produces a 403
  // and floods the system log.

  useEffect(() => {
    if (!user || !canPushFrames) {
      stopCapture();
      clearRefreshTimer();
      setAvailableDeviceCameras([]);
      return;
    }

    void refreshDeviceCameraList();
    refreshTimerRef.current = setInterval(() => void refreshDeviceCameraList(), CAMERA_LIST_REFRESH_MS);

    return () => clearRefreshTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, canPushFrames]);

  // ── Tab visibility — log so user can correlate gaps ──────────────────────────

  useEffect(() => {
    function onVisibility() {
      if (!cameraIdRef.current) return;
      if (document.hidden) {
        console.info(`${LOG} tab hidden — browser may throttle capture interval`);
        publishClientLog("warn", `Tab hidden — capture may be throttled`, { cameraId: cameraIdRef.current });
      } else {
        console.info(`${LOG} tab visible — resuming normal capture cadence`);
        publishClientLog("info", `Tab visible — resuming capture`, { cameraId: cameraIdRef.current });
        // Force an immediate attempt when user returns to the tab
        scheduleNextCapture(0);
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [scheduleNextCapture]);

  return (
    <DeviceCameraContext.Provider
      value={{
        stream,
        activeCameraId,
        lastCapture,
        capturePending,
        error,
        availableDeviceCameras,
        startCapture,
        stopCapture
      }}
    >
      <video
        ref={hiddenVideoRef}
        autoPlay
        playsInline
        muted
        aria-hidden="true"
        style={{ position: "fixed", top: -9999, left: -9999, width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />
      {children}
    </DeviceCameraContext.Provider>
  );
}

export function useDeviceCamera(): DeviceCameraContextValue {
  const ctx = useContext(DeviceCameraContext);
  if (!ctx) throw new Error("useDeviceCamera must be used inside DeviceCameraProvider");
  return ctx;
}
