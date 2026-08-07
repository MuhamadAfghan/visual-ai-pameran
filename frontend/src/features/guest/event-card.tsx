import { Hexagon, Boxes } from "lucide-react";
import { cn } from "../../utils/cn";
import { formatRelative } from "../../utils/formatDate";
import { getEventConfidence } from "../../types/event.types";
import type { DetectionEvent } from "../../types/event.types";

type Props = {
  event: DetectionEvent;
  onClick: () => void;
  isNew?: boolean;
  active?: boolean;
};

export function GuestEventCard({ event, onClick, isNew = false, active = false }: Props) {
  const isViolation = event.isViolation;
  const detectionCount = event.detections?.length ?? 0;
  const zoneCount = event.redZones?.length ?? 0;
  const confidence = getEventConfidence(event.checkResults);

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-3 p-2.5 rounded-lg border text-left transition-all",
        "bg-surface-panel",
        active
          ? "border-primary/60 bg-primary/5"
          : "border-surface-border hover:border-primary/30 hover:bg-surface-elevated",
        isNew && "animate-[fadeSlideIn_0.3s_ease_forwards]",
        isViolation && !active && "border-l-2 border-l-red-500"
      )}
    >
      {/* Thumbnail */}
      <div className="w-16 h-10 rounded overflow-hidden bg-black flex-shrink-0 border border-surface-border">
        {event.snapshotUrl ? (
          <img src={event.snapshotUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-surface-elevated" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
          {isViolation && (
            <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400 uppercase tracking-wider flex-shrink-0 leading-none">
              Violation
            </span>
          )}
          <span className="text-[10px] text-content-muted uppercase tracking-wide truncate font-mono">
            {event.cameraCode ?? event.cameraName ?? "—"}
          </span>
        </div>

        <p className="text-xs text-content truncate leading-tight">
          {event.checkResults?.map((r) => r.check.replace(/_/g, " ")).join(", ") || "—"}
        </p>

        <div className="flex items-center gap-2 mt-1 text-[10px] text-content-muted font-mono">
          <span>{formatRelative(event.detectedAt)}</span>
          {detectionCount > 0 && (
            <span className="flex items-center gap-0.5" title={`${detectionCount} deteksi`}>
              <Boxes className="w-2.5 h-2.5" />
              {detectionCount}
            </span>
          )}
          {zoneCount > 0 && (
            <span
              className="flex items-center gap-0.5 text-red-400/80"
              title={`${zoneCount} red zone`}
            >
              <Hexagon className="w-2.5 h-2.5" />
              {zoneCount}
            </span>
          )}
        </div>
      </div>

      {/* Confidence */}
      {confidence !== null && (
        <span
          className={cn(
            "text-[10px] font-mono flex-shrink-0 mt-0.5 font-bold",
            isViolation ? "text-red-400" : "text-content-muted"
          )}
        >
          {Math.round(confidence * 100)}%
        </span>
      )}
    </button>
  );
}
