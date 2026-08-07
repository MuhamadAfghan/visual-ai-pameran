import { cn } from "../utils/cn";
import type { Camera } from "../types/camera.types";

// Single source of truth for a camera's *effective* state shown on cards.
// Priority: Nonaktif (scheduler off, user-controlled) > Offline (RTSP unreachable)
// > Maintenance > Online. `isActive` wins over `status` because a deactivated
// camera isn't being polled, so its online/offline value is stale/irrelevant.
type CameraState = "nonaktif" | "offline" | "maintenance" | "online";

function getCameraState(camera: Pick<Camera, "isActive" | "status">): CameraState {
  if (!camera.isActive) return "nonaktif";
  if (camera.status === "offline") return "offline";
  if (camera.status === "maintenance") return "maintenance";
  return "online";
}

type Variant = { label: string; dot: string; pill: string };

// All states render the same pill shape/position — only color + label differ.
// Offline/Maintenance use a colored pill to stand out; Online/Nonaktif stay on a
// subtle dark pill so they don't shout over the live frame.
const VARIANTS: Record<CameraState, Variant> = {
  // Labels chosen to be self-explanatory: "Dimatikan" = user turned it off
  // (isActive=false); "Terputus" = RTSP connection lost (status=offline). The two
  // are distinct on purpose — "aktif tapi terputus" is the alarm case.
  nonaktif:    { label: "Dimatikan",   dot: "bg-content-muted", pill: "bg-black/60 text-content-secondary" },
  offline:     { label: "Terputus",    dot: "bg-red-300",       pill: "bg-red-600/85 text-white" },
  maintenance: { label: "Maintenance", dot: "bg-yellow-200",    pill: "bg-yellow-600/85 text-white" },
  online:      { label: "Online",      dot: "bg-green-400",     pill: "bg-black/55 text-white" }
};

type Props = {
  camera: Pick<Camera, "isActive" | "status">;
  className?: string;
};

/** Unified one-per-card status indicator (replaces the old dot + overlays). */
export function CameraStatusBadge({ camera, className }: Props) {
  const state = getCameraState(camera);
  const v = VARIANTS[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full backdrop-blur-sm",
        v.pill,
        className
      )}
      title={v.label}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", v.dot, state === "online" && "animate-pulse")} />
      <span className="text-[10px] font-medium leading-none">{v.label}</span>
    </span>
  );
}
