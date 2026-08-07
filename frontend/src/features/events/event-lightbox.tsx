import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { ConfidenceBadge } from "../../components/confidence-badge";
import { formatDate } from "../../utils/formatDate";
import { cn } from "../../utils/cn";
import { getEventConfidence, getEventCheckLabel, type DetectionEvent, type Detection, type RedZone, type EventStatus } from "../../types/event.types";

type Props = {
  events: DetectionEvent[];
  index: number | null;
  onClose: () => void;
  onChange: (index: number) => void;
};

const statusConfig: Record<EventStatus, { label: string; className: string }> = {
  unacknowledged: { label: "Belum Diakui", className: "text-orange-500" },
  acknowledged: { label: "Diakui", className: "text-green-500" },
  false_positive: { label: "False Positive", className: "text-content-muted" }
};

function isViolationLabel(label: string): boolean {
  return label.startsWith("no_") || label === "fall_detected";
}

function drawDetections(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  detections: Detection[],
  redZones: RedZone[]
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const cw = canvas.width;
  const ch = canvas.height;

  const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
  const drawW = img.naturalWidth * scale;
  const drawH = img.naturalHeight * scale;
  const ox = (cw - drawW) / 2;
  const oy = (ch - drawH) / 2;

  ctx.clearRect(0, 0, cw, ch);
  ctx.drawImage(img, ox, oy, drawW, drawH);

  // ── Red zones ─────────────────────────────────────────────────────────────
  for (const zone of redZones) {
    if (zone.points.length < 3) continue;
    const pts = zone.points.map((p) => ({
      x: ox + p.x * img.naturalWidth * scale,
      y: oy + p.y * img.naturalHeight * scale
    }));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    pts.slice(1).forEach((p: { x: number; y: number }) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = "rgba(239,68,68,0.12)";
    ctx.fill();
    ctx.strokeStyle = "rgba(239,68,68,0.85)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    pts.forEach((p: { x: number; y: number }) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#ef4444";
      ctx.fill();
    });
    ctx.font = "bold 11px monospace";
    ctx.fillStyle = "rgba(239,68,68,0.9)";
    ctx.fillText(zone.name || "RED ZONE", pts[0].x + 6, pts[0].y - 6);
  }

  // ── Bounding boxes ───────────────────────────────────────────────────────
  ctx.font = "bold 12px monospace";

  for (const det of detections) {
    const [x1, y1, x2, y2] = det.bbox;
    const rx = ox + x1 * scale;
    const ry = oy + y1 * scale;
    const rw = (x2 - x1) * scale;
    const rh = (y2 - y1) * scale;
    const inRedZone = det.attributes?.in_red_zone === "true";
    const color = inRedZone || isViolationLabel(det.label) ? "#ef4444" : "#22c55e";
    const label = `${det.label} ${Math.round(det.confidence * 100)}%`;

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);

    const textW = ctx.measureText(label).width + 8;
    const labelH = 18;
    const labelY = ry >= labelH ? ry - labelH : ry + rh;

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(rx, labelY, textW, labelH);
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, rx + 4, labelY + 13);
  }
}

export function EventLightbox({ events, index, onClose, onChange }: Props) {
  const event = index !== null ? events[index] : null;
  const hasPrev = index !== null && index > 0;
  const hasNext = index !== null && index < events.length - 1;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (index === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onChange(index! - 1);
      if (e.key === "ArrowRight" && hasNext) onChange(index! + 1);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [index, hasPrev, hasNext, onClose, onChange]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !event?.snapshotUrl) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      drawDetections(canvas, img, event.detections ?? [], event.redZones ?? []);
    };
    img.src = event.snapshotUrl;
  }, [event?.snapshotUrl, event?.detections, event?.redZones]);

  if (!event || index === null) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-3xl overflow-hidden border shadow-2xl bg-surface-panel border-surface-border rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-border">
          <p className="text-sm font-semibold truncate text-content">
            {getEventCheckLabel(event.checkResults)} — {event.cameraName ?? event.cameraId}
          </p>
          <button
            onClick={onClose}
            className="flex items-center justify-center flex-shrink-0 ml-3 transition-colors rounded-md w-7 h-7 text-content-muted hover:text-content hover:bg-surface-elevated"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Image */}
        <div className="relative flex items-center justify-center bg-black aspect-video">
          {event.snapshotUrl ? (
            <canvas ref={canvasRef} className="w-full h-full" />
          ) : (
            <div className="text-center">
              <AlertTriangle className="w-10 h-10 mx-auto mb-2 text-content-muted" />
              <p className="text-sm text-content-muted">Snapshot tidak tersedia</p>
            </div>
          )}

          {hasPrev && (
            <button
              onClick={() => onChange(index - 1)}
              className="absolute flex items-center justify-center text-white transition-colors -translate-y-1/2 rounded-full left-3 top-1/2 w-9 h-9 bg-black/50 hover:bg-black/70"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          {hasNext && (
            <button
              onClick={() => onChange(index + 1)}
              className="absolute flex items-center justify-center text-white transition-colors -translate-y-1/2 rounded-full right-3 top-1/2 w-9 h-9 bg-black/50 hover:bg-black/70"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-2 px-5 py-4 text-sm border-t gap-x-8 gap-y-3 border-surface-border">
          <div>
            <p className="text-xs text-content-muted mb-0.5">Kamera</p>
            <p className="text-content">{event.cameraName ?? event.cameraId}</p>
          </div>
          <div>
            <p className="text-xs text-content-muted mb-0.5">Check</p>
            <p className="text-content">{getEventCheckLabel(event.checkResults)}</p>
          </div>
          <div>
            <p className="text-xs text-content-muted mb-0.5">Confidence</p>
            <div className="mt-0.5">
              <ConfidenceBadge value={getEventConfidence(event.checkResults)} />
            </div>
          </div>
          <div>
            <p className="text-xs text-content-muted mb-0.5">Status</p>
            <p className={cn("font-medium mt-0.5", statusConfig[event.status].className)}>
              {statusConfig[event.status].label}
            </p>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-content-muted mb-0.5">Waktu Deteksi</p>
            <p className="text-content">{formatDate(event.detectedAt)}</p>
          </div>
        </div>

        {/* Counter */}
        <div className="py-2 text-center border-t border-surface-border">
          <p className="text-xs text-content-muted">
            {index + 1} / {events.length}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
