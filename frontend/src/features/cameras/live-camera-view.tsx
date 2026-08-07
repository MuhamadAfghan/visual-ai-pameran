import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Video, VideoOff } from "lucide-react";
import { labelColor } from "../../components/snapshot-bbox";
import { cn } from "../../utils/cn";
import type { RoiPoint } from "../../services/mapping.service";
import type { Detection } from "../../types/event.types";
import type { LiveCameraStreamState } from "./use-live-camera-stream";

// If no new SSE/poll result lands within this window, the overlay fades out
// rather than keep showing confidently-wrong boxes for a frame that's moved on.
const STALE_MS = 4_000;
// <img> onLoad isn't always reliable for MJPEG — poll naturalWidth as an
// independent "first frame decoded" signal, plus a hard timeout so the loader
// can never get stuck. Ported from the guest camera view (more robust than a
// bare onLoad/onError pair). Not needed for device mode — a <video> with
// srcObject set fires onLoadedMetadata/onCanPlay reliably.
const LOAD_POLL_MS = 250;
const LOAD_TIMEOUT_MS = 8_000;

function drawDetection(
  ctx: CanvasRenderingContext2D,
  det: Detection,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const inRedZone = det.attributes?.in_red_zone === "true";
  const color = inRedZone ? "#ef4444" : labelColor(det.label);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  const pct = det.confidence != null ? Math.round(det.confidence * 100) : null;
  const label = pct != null ? `${det.label} ${pct}%` : det.label;
  ctx.font = "bold 11px ui-sans-serif, sans-serif";
  const textW = ctx.measureText(label).width;
  const labelY = y > 18 ? y - 2 : y + h + 14;

  ctx.fillStyle = color;
  ctx.fillRect(x - 1, labelY - 13, textW + 8, 16);
  ctx.fillStyle = "#fff";
  ctx.fillText(label, x + 3, labelY);
}

function mediaNaturalSize(el: HTMLImageElement | HTMLVideoElement | null): { w: number; h: number } | null {
  if (!el) return null;
  if (el instanceof HTMLVideoElement) {
    return el.videoWidth && el.videoHeight ? { w: el.videoWidth, h: el.videoHeight } : null;
  }
  return el.naturalWidth && el.naturalHeight ? { w: el.naturalWidth, h: el.naturalHeight } : null;
}

type LiveCameraViewProps = {
  /** "stream" = RTSP MJPEG <img>. "device" = local getUserMedia MediaStream <video>. */
  source: "stream" | "device";
  streamUrl?: string | null;
  videoStream?: MediaStream | null;
  deviceError?: string | null;
  onRetryDevice?: () => void;
  /** Device cameras are displayed mirrored (selfie-style); the AI's bbox
   *  coordinates are computed on the un-mirrored capture (see
   *  device-camera-provider's flip-before-encode), so the overlay canvas gets
   *  the same CSS mirror rather than flipping coordinates by hand. */
  mirrored?: boolean;
  liveState: LiveCameraStreamState;
  cameraName: string;
  showBbox: boolean;
  showRoi: boolean;
  roiPolygons: RoiPoint[][];
  stairsZones: RoiPoint[][];
  handrailPolylines: RoiPoint[][];
  /** cover = fill/crop (grid-ish tiles), contain = letterboxed (fullscreen). Default cover. */
  fit?: "cover" | "contain";
  className?: string;
};

/**
 * Base video layer — RTSP MJPEG <img> or a device camera's local MediaStream
 * <video>, both already continuous/real-time with no JS polling for pixels —
 * with a transparent canvas overlay repainted whenever a new detection result
 * arrives via `liveState`. Video and boxes are two independently-paced
 * signals: a deliberate tradeoff (see plan) accepted so the video itself
 * never turns into an inference-paced slideshow. Mitigated by fading the
 * overlay once results go stale (STALE_MS).
 */
export function LiveCameraView({
  source,
  streamUrl = null,
  videoStream = null,
  deviceError = null,
  onRetryDevice,
  mirrored = false,
  liveState,
  cameraName,
  showBbox,
  showRoi,
  roiPolygons,
  stairsZones,
  handrailPolylines,
  fit = "cover",
  className
}: LiveCameraViewProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [videoLoading, setVideoLoading] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [, setTick] = useState(0);

  const isDevice = source === "device";
  const effectiveUrl = streamUrl
    ? retryNonce > 0
      ? `${streamUrl}&_r=${retryNonce}`
      : streamUrl
    : null;

  // RTSP: reset loading/error state on a new URL (retry).
  useEffect(() => {
    if (isDevice) return;
    setVideoLoading(true);
    setVideoError(false);
  }, [isDevice, effectiveUrl]);

  useEffect(() => {
    if (isDevice || !effectiveUrl || videoError) return;
    const pollId = setInterval(() => {
      const img = imgRef.current;
      if (img && img.naturalWidth > 0) setVideoLoading(false);
    }, LOAD_POLL_MS);
    const timeoutId = setTimeout(() => setVideoLoading(false), LOAD_TIMEOUT_MS);
    return () => {
      clearInterval(pollId);
      clearTimeout(timeoutId);
    };
  }, [isDevice, effectiveUrl, videoError]);

  // Device: attach/detach the MediaStream to whichever <video> is currently
  // mounted (inline or fullscreen — each gets its own element+effect).
  useEffect(() => {
    if (!isDevice || !videoEl) return;
    videoEl.srcObject = videoStream;
    if (videoStream) {
      const p = videoEl.play();
      if (p && typeof p.catch === "function") p.catch(() => undefined);
    }
    return () => {
      if (videoEl) videoEl.srcObject = null;
    };
  }, [isDevice, videoEl, videoStream]);

  // Re-render periodically so the staleness fade recomputes even when no new
  // result is arriving (i.e. exactly the case it needs to detect).
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  const isStale = liveState.lastUpdatedAt != null && Date.now() - liveState.lastUpdatedAt > STALE_MS;

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const mediaEl = isDevice ? videoEl : imgRef.current;
    if (!canvas || !mediaEl) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = mediaEl.getBoundingClientRect();
    const cw = Math.max(1, Math.round(rect.width));
    const ch = Math.max(1, Math.round(rect.height));
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    ctx.clearRect(0, 0, cw, ch);

    const size = mediaNaturalSize(mediaEl);
    if (!size || isStale) return;
    const { w: srcW, h: srcH } = size;

    // Matches SnapshotWithBbox's cover/contain scale math so boxes line up
    // the same way regardless of which fit mode the media element is using.
    const scale = fit === "contain" ? Math.min(cw / srcW, ch / srcH) : Math.max(cw / srcW, ch / srcH);
    const ox = (cw - srcW * scale) / 2;
    const oy = (ch - srcH * scale) / 2;

    if (showRoi) {
      for (const poly of roiPolygons) {
        if (poly.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(ox + poly[0].x * srcW * scale, oy + poly[0].y * srcH * scale);
        for (const p of poly.slice(1)) ctx.lineTo(ox + p.x * srcW * scale, oy + p.y * srcH * scale);
        ctx.closePath();
        ctx.fillStyle = "rgba(99, 102, 241, 0.18)";
        ctx.fill();
        ctx.strokeStyle = "rgba(99, 102, 241, 0.9)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      for (const poly of stairsZones) {
        if (poly.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(ox + poly[0].x * srcW * scale, oy + poly[0].y * srcH * scale);
        for (const p of poly.slice(1)) ctx.lineTo(ox + p.x * srcW * scale, oy + p.y * srcH * scale);
        ctx.closePath();
        ctx.fillStyle = "rgba(34, 197, 94, 0.18)";
        ctx.fill();
        ctx.strokeStyle = "rgba(34, 197, 94, 0.95)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      for (const line of handrailPolylines) {
        if (line.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(ox + line[0].x * srcW * scale, oy + line[0].y * srcH * scale);
        for (const p of line.slice(1)) ctx.lineTo(ox + p.x * srcW * scale, oy + p.y * srcH * scale);
        ctx.strokeStyle = "rgba(37, 99, 235, 0.95)";
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }

    if (!showBbox) return;
    for (const det of liveState.detections) {
      const [x1, y1, x2, y2] = det.bbox;
      drawDetection(
        ctx,
        det,
        ox + x1 * scale,
        oy + y1 * scale,
        (x2 - x1) * scale,
        (y2 - y1) * scale
      );
    }
  }, [
    isDevice,
    videoEl,
    liveState.detections,
    isStale,
    showBbox,
    showRoi,
    roiPolygons,
    stairsZones,
    handrailPolylines,
    fit
  ]);

  useEffect(() => {
    repaint();
    window.addEventListener("resize", repaint);
    return () => window.removeEventListener("resize", repaint);
  }, [repaint]);

  // Device video itself has no separate "loading" concept once a stream
  // exists — <video srcObject> starts almost immediately.
  useEffect(() => {
    if (isDevice) setVideoLoading(!videoStream);
  }, [isDevice, videoStream]);

  const showLive = isDevice ? !!videoStream : !!effectiveUrl && !videoError;
  const isLive = liveState.status === "live" && !isStale;
  const fitClass = fit === "contain" ? "object-contain" : "object-cover";

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {showLive ? (
        isDevice ? (
          <video
            ref={setVideoEl}
            autoPlay
            playsInline
            muted
            className={cn("w-full h-full", fitClass)}
            style={mirrored ? { transform: "scaleX(-1)" } : undefined}
            onLoadedMetadata={() => setVideoLoading(false)}
          />
        ) : (
          <img
            ref={imgRef}
            src={effectiveUrl ?? undefined}
            alt={cameraName}
            className={cn("w-full h-full", fitClass)}
            onLoad={() => setVideoLoading(false)}
            onError={() => {
              setVideoLoading(false);
              setVideoError(true);
            }}
          />
        )
      ) : (
        <div className="flex items-center justify-center w-full h-full text-content-muted">
          <VideoOff className="w-10 h-10 opacity-30" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={mirrored ? { transform: "scaleX(-1)" } : undefined}
      />

      {showLive && videoLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm z-10">
          <Loader2 className="w-9 h-9 text-white/90 animate-spin" aria-hidden="true" />
          <p className="text-xs text-white/75 font-medium tracking-wide">
            {isDevice ? "Memulai kamera device..." : "Memuat stream RTSP..."}
          </p>
        </div>
      )}

      {isDevice
        ? !videoStream && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-10 p-6">
              <div className="max-w-sm w-full bg-surface-panel border border-red-500/30 rounded-xl p-5 shadow-xl">
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <p className="text-sm font-semibold text-content leading-tight pt-1.5">
                    {deviceError ?? "Memulai kamera device..."}
                  </p>
                </div>
                {deviceError && onRetryDevice && (
                  <button
                    onClick={onRetryDevice}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-fg hover:opacity-90 transition-opacity"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Coba lagi
                  </button>
                )}
              </div>
            </div>
          )
        : (!streamUrl || videoError) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-10 p-6">
              <div className="max-w-sm w-full bg-surface-panel border border-red-500/30 rounded-xl p-5 shadow-xl">
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <p className="text-sm font-semibold text-content leading-tight pt-1.5">
                    Gagal memuat live stream
                  </p>
                </div>
                <button
                  onClick={() => setRetryNonce((n) => n + 1)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-fg hover:opacity-90 transition-opacity"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Coba lagi
                </button>
              </div>
            </div>
          )}

      {liveState.status === "not_monitored" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 backdrop-blur-sm z-10 text-white/70">
          <Video className="w-8 h-8 opacity-40" />
          <p className="text-xs">Monitoring nonaktif</p>
        </div>
      )}

      {isLive && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/90 backdrop-blur-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          <span className="text-[11px] font-semibold text-white tracking-wide">LIVE</span>
        </div>
      )}
      {liveState.status === "reconnecting" && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/90 backdrop-blur-sm">
          <Loader2 className="w-3 h-3 text-white animate-spin" />
          <span className="text-[11px] font-semibold text-white tracking-wide">Reconnecting</span>
        </div>
      )}
      {liveState.status === "live" && isStale && (
        <div className="absolute top-3 left-3 px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm">
          <span className="text-[11px] font-medium text-white/70">Data pelanggaran mungkin tidak terkini</span>
        </div>
      )}
    </div>
  );
}
