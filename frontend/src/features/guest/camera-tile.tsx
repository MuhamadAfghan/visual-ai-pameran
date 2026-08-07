import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Video, Hexagon, Boxes, Loader2 } from "lucide-react";
import { cn } from "../../utils/cn";
import { SnapshotWithBbox } from "../../components/snapshot-bbox";
import { useRefreshingSnapshot } from "../../hooks/use-refreshing-snapshot";
import { getAreaName, getSectionName } from "../../types/camera.types";
import { useAuth } from "../../app/auth-provider";
import { useDeviceCamera } from "../../app/device-camera-provider";
import type { Camera } from "../../types/camera.types";
import type { DetectionEvent } from "../../types/event.types";

const API_BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/v1`;

type Props = {
  camera: Camera;
  violationCount?: number;
  latestEvent?: DetectionEvent;
};

const STATUS_LABEL: Record<Camera["status"], string> = {
  online: "LIVE",
  offline: "OFFLINE",
  maintenance: "MAINT",
};

const STATUS_COLOR: Record<Camera["status"], string> = {
  online: "bg-red-500 text-white",
  offline: "bg-zinc-600 text-zinc-200",
  maintenance: "bg-amber-500 text-amber-950",
};

export function CameraTile({ camera, violationCount = 0, latestEvent }: Props) {
  const navigate = useNavigate();
  const { token } = useAuth();
  const devCam = useDeviceCamera();

  const isDeviceCamera = camera.sourceType === "device";
  const isActiveDevice = isDeviceCamera && devCam.activeCameraId === camera._id;
  const isOnline = camera.status === "online";

  const streamUrl =
    !isDeviceCamera && token && isOnline
      ? `${API_BASE}/cameras/${camera._id}/stream?token=${encodeURIComponent(token)}`
      : null;

  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [deviceVideoReady, setDeviceVideoReady] = useState(false);
  const [deviceVideoEl, setDeviceVideoEl] = useState<HTMLVideoElement | null>(null);
  const streamImgRef = useRef<HTMLImageElement | null>(null);

  const snapshotSrc = useRefreshingSnapshot(
    camera.latestSnapshotUrl,
    camera.minCaptureGapSeconds ?? 30,
    isOnline
  );

  const hasViolation = violationCount > 0;
  const zoneCount = camera.redZones?.length ?? 0;
  const detections = latestEvent?.detections ?? [];
  const detectionCount = detections.length;

  useEffect(() => {
    if (streamUrl) {
      setStreamLoading(true);
      setStreamError(false);
    }
  }, [streamUrl]);

  // MJPEG <img> onLoad isn't always reliable — poll naturalWidth as a fallback
  // "first frame decoded" signal, with a hard timeout so the loader can't get
  // stuck even if neither signal arrives.
  useEffect(() => {
    if (!streamLoading || !streamUrl || isDeviceCamera || streamError) return;

    const pollId = setInterval(() => {
      const img = streamImgRef.current;
      if (img && img.naturalWidth > 0) {
        setStreamLoading(false);
      }
    }, 250);

    const timeoutId = setTimeout(() => setStreamLoading(false), 8_000);

    return () => {
      clearInterval(pollId);
      clearTimeout(timeoutId);
    };
  }, [streamLoading, streamUrl, isDeviceCamera, streamError]);

  useEffect(() => {
    if (isActiveDevice && devCam.stream) {
      setDeviceVideoReady(false);
    }
  }, [isActiveDevice, devCam.stream]);

  useEffect(() => {
    if (!deviceVideoEl || !isActiveDevice) return;
    deviceVideoEl.srcObject = devCam.stream;
    if (devCam.stream) {
      const p = deviceVideoEl.play();
      if (p && typeof p.catch === "function") p.catch(() => undefined);
    }
    return () => {
      if (deviceVideoEl) deviceVideoEl.srcObject = null;
    };
  }, [deviceVideoEl, devCam.stream, isActiveDevice]);

  const showingLive =
    (isActiveDevice && !!devCam.stream) || (!!streamUrl && !streamError);

  const showLoader =
    (isActiveDevice && devCam.stream && !deviceVideoReady) ||
    (!!streamUrl && !streamError && streamLoading);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border cursor-pointer group transition-all duration-300",
        "bg-surface-panel",
        hasViolation
          ? "border-red-500/60 shadow-[0_0_16px_rgba(239,68,68,0.2)]"
          : "border-surface-border hover:border-primary/40"
      )}
      onClick={() => navigate(`/guest/cameras/${camera._id}`)}
    >
      {/* Video area */}
      <div className="relative aspect-video overflow-hidden bg-black">
        {/* Device camera — live video */}
        {isActiveDevice && devCam.stream ? (
          <video
            ref={setDeviceVideoEl}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: "scaleX(-1)" }}
            onCanPlay={() => setDeviceVideoReady(true)}
          />
        ) : /* RTSP MJPEG stream */ streamUrl && !streamError ? (
          <img
            ref={streamImgRef}
            src={streamUrl}
            alt={camera.name}
            className="w-full h-full object-cover"
            onLoad={() => setStreamLoading(false)}
            onError={() => { setStreamLoading(false); setStreamError(true); }}
          />
        ) : /* Snapshot fallback */ snapshotSrc && !imgError ? (
          <>
            <SnapshotWithBbox
              src={snapshotSrc}
              alt={camera.name}
              detections={detections}
              redZones={camera.redZones ?? latestEvent?.redZones ?? []}
              fit="cover"
              compact
              className="w-full h-full"
            />
            <img
              src={snapshotSrc}
              alt=""
              className="hidden"
              onError={() => setImgError(true)}
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Video className="w-7 h-7 text-content-muted opacity-30" />
          </div>
        )}

        {/* Loading overlay */}
        {showLoader && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/75 backdrop-blur-sm z-10 pointer-events-none">
            <Loader2 className="w-6 h-6 text-white/80 animate-spin" />
            <div className="flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[9px] font-mono text-white/50 uppercase tracking-wider">
                Connecting
              </span>
            </div>
          </div>
        )}

        {/* Violation pulse border */}
        {hasViolation && (
          <div className="absolute inset-0 border-2 border-red-500/70 rounded-lg animate-pulse pointer-events-none" />
        )}

        {/* TOP-LEFT: status pill */}
        <div className="absolute top-2 left-2 flex items-center gap-1">
          <span
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold leading-none tracking-wider",
              STATUS_COLOR[camera.status]
            )}
          >
            {isOnline && (
              <span className={cn("w-1.5 h-1.5 rounded-full bg-white", showingLive && !showLoader && "animate-pulse")} />
            )}
            {STATUS_LABEL[camera.status]}
          </span>
        </div>

        {/* TOP-RIGHT: violation badge */}
        {hasViolation && (
          <div className="absolute top-2 right-2">
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500 text-white leading-none animate-pulse">
              ! {violationCount}
            </span>
          </div>
        )}

        {/* BOTTOM-LEFT: zone + detection counts */}
        {(zoneCount > 0 || detectionCount > 0) && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1">
            {zoneCount > 0 && (
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-black/50 text-red-300 backdrop-blur-sm leading-none"
                title={`${zoneCount} red zone${zoneCount > 1 ? "s" : ""}`}
              >
                <Hexagon className="w-2.5 h-2.5" strokeWidth={2.5} />
                {zoneCount}
              </span>
            )}
            {detectionCount > 0 && (
              <span
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-black/50 text-emerald-300 backdrop-blur-sm leading-none"
                title={`${detectionCount} deteksi terbaru`}
              >
                <Boxes className="w-2.5 h-2.5" strokeWidth={2.5} />
                {detectionCount}
              </span>
            )}
          </div>
        )}

        {/* BOTTOM-RIGHT: camera code */}
        <div className="absolute bottom-2 right-2">
          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-black/50 text-white/80 backdrop-blur-sm leading-none">
            {camera.code}
          </span>
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
          <span className="text-white text-xs font-semibold px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-md uppercase tracking-wider">
            Buka Kamera
          </span>
        </div>
      </div>

      {/* Info bar */}
      <div className="px-3 py-2 border-t border-surface-border">
        <p className="text-xs font-semibold text-content truncate uppercase tracking-wide leading-tight">
          {camera.name}
        </p>
        <p className="text-[10px] text-content-muted truncate mt-0.5">
          {getAreaName(camera)} · {getSectionName(camera)}
        </p>
      </div>
    </div>
  );
}
