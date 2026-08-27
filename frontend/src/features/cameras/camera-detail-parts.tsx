import type { ReactNode } from "react";
import { Video, Image } from "lucide-react";
import { X } from "lucide-react";
import { formatRelative } from "../../utils/formatDate";
import { SnapshotWithBbox } from "../../components/snapshot-bbox";
import { cn } from "../../utils/cn";
import type { DetectionEvent, Detection, RedZone } from "../../types/event.types";

// ─── FullscreenViewer ────────────────────────────────────────────────────────

type FullscreenViewerProps = {
  open: boolean;
  onClose: () => void;
  cameraName: string;
  cameraCode: string;
  /** Historical/replay snapshot — takes priority over `liveView` when present. */
  snapshotSrc: string | null;
  detections?: Detection[];
  redZones?: RedZone[];
  /** Live view element (e.g. <LiveCameraView/>) to render when not viewing a
   *  pinned snapshot. Rendered here (not also inline behind the modal) so
   *  entering fullscreen never double-opens a second /stream connection. */
  liveView?: ReactNode;
};

export function FullscreenViewer({
  open,
  onClose,
  cameraName,
  cameraCode,
  snapshotSrc,
  detections = [],
  redZones = [],
  liveView
}: FullscreenViewerProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/95 backdrop-blur-sm !mt-0"
      role="dialog"
      aria-modal="true"
      aria-label={`Fullscreen — ${cameraName}`}
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between w-full max-w-[92vw] mb-3 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-medium text-white/80">
          {cameraName} <span className="ml-1 font-mono text-xs text-white/40">{cameraCode}</span>
        </p>
        <button
          className="p-2 text-white transition-colors rounded-full bg-white/10 hover:bg-white/20"
          onClick={onClose}
          aria-label="Tutup fullscreen"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div
        className="relative w-[92vw] h-[85vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {snapshotSrc ? (
          <SnapshotWithBbox
            src={snapshotSrc}
            alt={cameraName}
            detections={detections}
            redZones={redZones}
            fit="contain"
            className="w-full h-full rounded-xl"
          />
        ) : liveView ? (
          liveView
        ) : (
          <div className="flex flex-col items-center gap-3 text-white/30">
            <Video className="w-16 h-16" aria-hidden="true" />
            <p className="text-sm">Belum ada snapshot</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SnapshotGrid ────────────────────────────────────────────────────────────

type SnapshotGridProps = {
  events: DetectionEvent[];
  apiBase: string;
  token: string | null;
  selectedId: string | null;
  onSelect: (ev: DetectionEvent) => void;
};

export function SnapshotGrid({ events, apiBase, token, selectedId, onSelect }: SnapshotGridProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-content-muted">
        <Image className="w-8 h-8 opacity-30" aria-hidden="true" />
        <p className="text-xs">Belum ada snapshot</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-1 p-1">
      {events.map((ev) => {
        const src = ev.snapshotUrl
          ? `${apiBase}/events/${ev._id}/snapshot?variant=original&token=${encodeURIComponent(token ?? "")}`
          : null;
        const isSelected = ev._id === selectedId;
        return (
          <button
            key={ev._id}
            onClick={() => onSelect(ev)}
            className={cn(
              "relative aspect-video overflow-hidden rounded-lg bg-surface-elevated cursor-pointer text-left transition-all",
              isSelected
                ? "ring-2 ring-primary ring-offset-1 ring-offset-surface-panel"
                : "hover:ring-1 hover:ring-surface-border"
            )}
            aria-label={`Snapshot ${formatRelative(ev.detectedAt)}${ev.isViolation ? " — pelanggaran" : ""}`}
            aria-pressed={isSelected}
          >
            {src ? (
              <SnapshotWithBbox
                src={src}
                alt={formatRelative(ev.detectedAt)}
                detections={ev.detections ?? []}
                fit="cover"
                compact
                loading="lazy"
                className="w-full h-full"
              />
            ) : (
              <div className="flex items-center justify-center w-full h-full">
                <Video className="w-5 h-5 opacity-20" aria-hidden="true" />
              </div>
            )}
            <div className="absolute bottom-0 inset-x-0 px-1.5 py-1 bg-black/50 backdrop-blur-sm flex items-center justify-between gap-1">
              <span className="text-[9px] text-white/80 truncate">
                {formatRelative(ev.detectedAt)}
              </span>
              {ev.isViolation && (
                <span className="text-[8px] font-bold text-red-400 shrink-0" aria-hidden="true">
                  !
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
