import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Video, VideoOff } from "lucide-react";
import { detectionColor } from "../../components/snapshot-bbox";
import { cn } from "../../utils/cn";
import type { RoiPoint } from "../../services/mapping.service";
import type { Detection } from "../../types/event.types";
import type { LiveCameraStreamState } from "./use-live-camera-stream";

// If no new SSE/poll result lands within this window, the overlay fades out
// rather than keep showing confidently-wrong boxes for a frame that's moved on.
const STALE_MS = 4_000;

function drawDetection(
  ctx: CanvasRenderingContext2D,
  det: Detection,
  x: number,
  y: number,
  w: number,
  h: number,
  mirrored: boolean
): void {
  const color = detectionColor(det);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);

  const pct = det.confidence != null ? Math.round(det.confidence * 100) : null;
  const label = pct != null ? `${det.label} ${pct}%` : det.label;
  ctx.font = "bold 11px ui-sans-serif, sans-serif";
  const textW = ctx.measureText(label).width;
  const labelY = y > 18 ? y - 2 : y + h + 14;
  const pillX = x - 1;
  const pillW = textW + 8;

  ctx.fillStyle = color;
  ctx.fillRect(pillX, labelY - 13, pillW, 16);

  // The canvas itself gets a CSS scaleX(-1) when `mirrored` (see caller), which
  // would otherwise draw the label mirror-written. Counter-flip just the text
  // around the pill's own center so the two flips cancel out for the glyphs
  // while the (symmetric) pill background stays exactly where it was.
  ctx.save();
  if (mirrored) {
    const pillCenterX = pillX + pillW / 2;
    ctx.translate(pillCenterX, 0);
    ctx.scale(-1, 1);
    ctx.translate(-pillCenterX, 0);
  }
  ctx.fillStyle = "#fff";
  ctx.fillText(label, x + 3, labelY);
  ctx.restore();
}

type LiveCameraViewProps = {
  /** "stream" = RTSP camera. "device" = local getUserMedia camera. Only used
   *  to gate the device permission-error card — both sources otherwise render
   *  identically (the exact analyzed frame + boxes from `liveState`, never a
   *  separately-paced live feed). */
  source: "stream" | "device";
  videoStream?: MediaStream | null;
  deviceError?: string | null;
  onRetryDevice?: () => void;
  /** Set by any caller whose session actually has cameras:capture (operator
   *  dashboard, or a guest/kiosk session that's meant to supply its own
   *  webcam) — see device-camera-provider's canPushFrames. A session without
   *  it never owns a MediaStream; for them `videoStream` is always null even
   *  while the SSE channel (`liveState`) is delivering live frames pushed by
   *  whichever browser does own the capture. Without this gate the "starting
   *  device camera" card would permanently cover an otherwise-live feed for
   *  every such passive viewer. Defaults to false. */
  deviceOwnershipExpected?: boolean;
  /** Device cameras are displayed mirrored (selfie-style); the AI's bbox
   *  coordinates are computed on the un-mirrored capture (see
   *  device-camera-provider's flip-before-encode), so the displayed frame and
   *  the overlay canvas both get the same CSS mirror rather than flipping
   *  coordinates by hand. */
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
 * Base layer is the exact frame the AI analyzed (`liveState.frame`, base64
 * JPEG) UNLESS this browser owns the device camera's local `videoStream`, in
 * which case that stream is rendered directly — full camera FPS, no
 * server round trip — while the detection boxes still come from `liveState`
 * and can lag the picture by about one push interval. Any other viewer (no
 * local stream: a remote dashboard tile, or an RTSP `source="stream"`
 * camera) has no faster source than `liveState.frame`, so picture and boxes
 * stay in lockstep for them same as before.
 */
export function LiveCameraView({
  source,
  videoStream = null,
  deviceError = null,
  onRetryDevice,
  deviceOwnershipExpected = false,
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
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [, setTick] = useState(0);

  const isDevice = source === "device";
  const hasFrame = liveState.frame != null;
  // This browser owns the device camera (videoStream is its own getUserMedia
  // MediaStream) — render it directly instead of round-tripping through the
  // server, for real camera FPS instead of inference cadence.
  const showLocalVideo = isDevice && videoStream != null;

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = videoStream ?? null;
  }, [videoStream]);

  // Re-render periodically so the staleness fade recomputes even when no new
  // result is arriving (i.e. exactly the case it needs to detect).
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  const isStale = liveState.lastUpdatedAt != null && Date.now() - liveState.lastUpdatedAt > STALE_MS;

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // The canvas is `absolute inset-0` inside the same container the image
    // fills, so its own rect already matches the displayed image's box —
    // no separate media-element ref needed to size it.
    const rect = canvas.getBoundingClientRect();
    const cw = Math.max(1, Math.round(rect.width));
    const ch = Math.max(1, Math.round(rect.height));
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    ctx.clearRect(0, 0, cw, ch);

    const srcW = liveState.width;
    const srcH = liveState.height;
    if (!srcW || !srcH || isStale) return;

    // Matches SnapshotWithBbox's cover/contain scale math so boxes line up
    // the same way regardless of which fit mode the image is using.
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
        (y2 - y1) * scale,
        mirrored
      );
    }
  }, [
    liveState.width,
    liveState.height,
    liveState.detections,
    isStale,
    showBbox,
    showRoi,
    roiPolygons,
    stairsZones,
    handrailPolylines,
    fit,
    mirrored
  ]);

  useEffect(() => {
    repaint();
    window.addEventListener("resize", repaint);
    return () => window.removeEventListener("resize", repaint);
  }, [repaint]);

  const isLive = showLocalVideo || (liveState.status === "live" && !isStale);
  const fitClass = fit === "contain" ? "object-contain" : "object-cover";

  // Device permission/hardware failure takes priority over the generic
  // "waiting for first frame" spinner — no point saying "loading" over a
  // camera that never started. Gated on deviceOwnershipExpected: only the
  // browser that's actually supposed to own the local webcam capture should
  // ever see this — see the prop's doc comment.
  const showDeviceError = isDevice && deviceOwnershipExpected && !videoStream;
  const showLoading =
    !hasFrame &&
    !showLocalVideo &&
    !showDeviceError &&
    liveState.status !== "not_monitored" &&
    liveState.status !== "error";

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {showLocalVideo ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={cn("w-full h-full", fitClass)}
          style={mirrored ? { transform: "scaleX(-1)" } : undefined}
        />
      ) : hasFrame ? (
        <img
          src={`data:image/jpeg;base64,${liveState.frame}`}
          alt={cameraName}
          className={cn("w-full h-full", fitClass)}
          style={mirrored ? { transform: "scaleX(-1)" } : undefined}
        />
      ) : (
        <div className="flex items-center justify-center w-full h-full text-content-muted">
          <VideoOff className="w-10 h-10 opacity-30" />
        </div>
      )}
      <canvas
        ref={canvasRef}
        // w-full/h-full are load-bearing, not decorative: canvas is a
        // replaced element, so `absolute inset-0` alone doesn't stretch it
        // (it falls back to the intrinsic 300x150 default) the way it would
        // for a plain div — it needs explicit width/height too.
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={mirrored ? { transform: "scaleX(-1)" } : undefined}
      />

      {showLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-sm z-10">
          <Loader2 className="w-9 h-9 text-white/90 animate-spin" aria-hidden="true" />
          <p className="text-xs text-white/75 font-medium tracking-wide">Menunggu frame pertama...</p>
        </div>
      )}

      {showDeviceError && (
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
      )}

      {liveState.status === "not_monitored" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 backdrop-blur-sm z-10 text-white/70">
          <Video className="w-8 h-8 opacity-40" />
          <p className="text-xs">Monitoring nonaktif</p>
        </div>
      )}

      {liveState.status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-10 p-6">
          <div className="max-w-sm w-full bg-surface-panel border border-red-500/30 rounded-xl p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <p className="text-sm font-semibold text-content leading-tight pt-1.5">
                {liveState.error ?? "Gagal memuat live stream"}
              </p>
            </div>
          </div>
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
