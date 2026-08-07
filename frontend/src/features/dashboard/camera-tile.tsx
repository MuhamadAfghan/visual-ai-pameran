import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Video, Loader2 } from "lucide-react";
import { CameraStatusBadge } from "../../components/camera-status-badge";
import { cn } from "../../utils/cn";
import { useAuth } from "../../app/auth-provider";
import { getSectionName } from "../../types/camera.types";
import { useDeviceCamera } from "../../app/device-camera-provider";
import type { Camera } from "../../types/camera.types";

const API_BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/v1`;

type Props = { camera: Camera };

export function CameraTile({ camera }: Props) {
  const navigate = useNavigate();
  const { token } = useAuth();
  const devCam = useDeviceCamera();

  const isDeviceCamera = camera.sourceType === "device";
  const isActiveDevice = isDeviceCamera && devCam.activeCameraId === camera._id;

  const [deviceVideoReady, setDeviceVideoReady] = useState(false);
  const [deviceVideoEl, setDeviceVideoEl] = useState<HTMLVideoElement | null>(null);

  const [imgError, setImgError] = useState(false);
  // Dashboard grid polls the SNAPSHOT endpoint fast (~1s), NOT a live MJPEG. A
  // live <img src=.../stream> per tile holds a persistent HTTP connection; with
  // many cameras the browser's ~6-per-host cap is exhausted and all API calls
  // stall (dashboard skeletons never resolve). These polls are short-lived
  // requests served from the shared per-camera decoder (no detection), so the
  // grid looks live without that risk.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
      setImgError(false); // retry cameras that had no snapshot yet
    }, 1_000);
    return () => clearInterval(interval);
  }, []);
  const snapshotUrl =
    !isDeviceCamera && token
      ? `${API_BASE}/cameras/${camera._id}/snapshot?token=${encodeURIComponent(token)}&_=${tick}`
      : null;

  // Reset device-ready flag whenever a new stream arrives
  useEffect(() => {
    if (isActiveDevice && devCam.stream) {
      setDeviceVideoReady(false);
    }
  }, [isActiveDevice, devCam.stream]);

  // Mirror the active device stream to the video element
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

  const showingLive = isActiveDevice && !!devCam.stream;
  const showLoader = isActiveDevice && !!devCam.stream && !deviceVideoReady;

  return (
    <div
      className={cn(
        "rounded-xl overflow-hidden border border-surface-border bg-surface-elevated cursor-pointer group",
        "hover:border-primary transition-colors"
      )}
      onClick={() => navigate(`/cameras/${camera._id}/detail`)}
    >
      {/* Video area */}
      <div className="aspect-video relative bg-surface-elevated flex items-center justify-center overflow-hidden">
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
        ) : /* Snapshot polling (RTSP cameras) */ snapshotUrl && !imgError ? (
          <img
            src={snapshotUrl}
            alt={camera.name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <Video className="w-8 h-8 text-content-muted" />
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

        {/* LIVE badge */}
        {showingLive && !showLoader && (
          <div className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/90 backdrop-blur-sm pointer-events-none">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-[9px] font-bold text-white tracking-wide uppercase">Live</span>
          </div>
        )}

        {/* Single unified status badge (Nonaktif → Offline → Maintenance → Online) */}
        <div className="absolute top-2 right-2">
          <CameraStatusBadge camera={camera} />
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <span className="text-white text-xs font-medium px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm">
            View Detail
          </span>
        </div>
      </div>

      {/* Name + area + mapping badge */}
      <div className="px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-content truncate">{camera.name}</p>
          <p className="text-[10px] text-content-muted truncate mt-0.5">
            {getSectionName(camera)}
          </p>
        </div>
        {(camera.activeMappingCount ?? 0) > 0 && (
          <span className="flex-shrink-0 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full whitespace-nowrap">
            {camera.activeMappingCount} model
          </span>
        )}
      </div>
    </div>
  );
}
