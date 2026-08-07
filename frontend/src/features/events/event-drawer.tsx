import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Eye, EyeOff, AlertTriangle, Maximize2 } from "lucide-react";
import { FullscreenViewer } from "../cameras/camera-detail-parts";
import { cn } from "../../utils/cn";
import { labelColor } from "../../components/snapshot-bbox";
import { ConfidenceBadge } from "../../components/confidence-badge";
import { formatDate, formatRelative } from "../../utils/formatDate";
import {
  getEventConfidence,
  getEventCheckLabel,
  type DetectionEvent,
  type Detection,
  type RedZone,
  type EventStatus
} from "../../types/event.types";

const API_BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/v1`;

const statusConfig: Record<EventStatus, { label: string; className: string }> = {
  unacknowledged: { label: "Belum Diakui", className: "text-orange-500" },
  acknowledged: { label: "Diakui", className: "text-green-500" },
  false_positive: { label: "False Positive", className: "text-content-muted" }
};

function paintOverlay(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  detections: Detection[],
  showBbox: boolean,
  redZones: RedZone[],
  showRoi: boolean
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const cw = canvas.offsetWidth;
  const ch = canvas.offsetHeight;
  if (!cw || !ch) return;

  canvas.width = cw;
  canvas.height = ch;
  ctx.clearRect(0, 0, cw, ch);

  if (!img.naturalWidth) return;

  const scale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight);
  const ox = (cw - img.naturalWidth * scale) / 2;
  const oy = (ch - img.naturalHeight * scale) / 2;

  // ── Red zones ─────────────────────────────────────────────────────────────
  if (showRoi) {
    for (const zone of redZones) {
      if (zone.points.length < 3) continue;
      const pts = zone.points.map((p) => ({
        x: ox + p.x * img.naturalWidth * scale,
        y: oy + p.y * img.naturalHeight * scale
      }));
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = "rgba(239,68,68,0.12)";
      ctx.fill();
      ctx.strokeStyle = "rgba(239,68,68,0.85)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      pts.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "#ef4444";
        ctx.fill();
      });
      ctx.font = "bold 10px ui-monospace, monospace";
      ctx.fillStyle = "rgba(239,68,68,0.9)";
      ctx.fillText(zone.name || "RED ZONE", pts[0].x + 6, pts[0].y - 6);
    }
  }

  // ── Bounding boxes ───────────────────────────────────────────────────────
  if (!showBbox || !detections.length) return;

  ctx.font = "bold 11px ui-monospace, monospace";

  for (const det of detections) {
    const [x1, y1, x2, y2] = det.bbox;
    const rx = ox + x1 * scale;
    const ry = oy + y1 * scale;
    const rw = (x2 - x1) * scale;
    const rh = (y2 - y1) * scale;
    const color = labelColor(det.label);
    const pct = det.confidence != null ? Math.round(det.confidence * 100) : null;
    const lbl = pct != null ? `${det.label} ${pct}%` : det.label;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx, ry, rw, rh);

    const tw = ctx.measureText(lbl).width + 8;
    const lh = 16;
    const ly = ry >= lh ? ry - lh : ry + rh;

    ctx.globalAlpha = 0.85;
    ctx.fillStyle = color;
    ctx.fillRect(rx, ly, tw, lh);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#fff";
    ctx.fillText(lbl, rx + 4, ly + 12);
  }
}

type Props = {
  event: DetectionEvent | null;
  token: string | null;
  onClose: () => void;
};

export function EventDrawer({ event, token, onClose }: Props) {
  const [showBbox, setShowBbox] = useState(true);
  const [showRoi, setShowRoi] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const detections = useMemo(() => event?.detections ?? [], [event?.detections]);
  const redZones = useMemo(() => event?.redZones ?? [], [event?.redZones]);

  const snapshotSrc = event?.snapshotUrl
    ? `${API_BASE}/events/${event._id}/snapshot?token=${encodeURIComponent(token ?? "")}`
    : null;

  const repaint = useCallback(() => {
    if (imgRef.current && canvasRef.current) {
      paintOverlay(canvasRef.current, imgRef.current, detections, showBbox, redZones, showRoi);
    }
  }, [detections, showBbox, redZones, showRoi]);

  useEffect(() => {
    repaint();
  }, [repaint]);

  // Escape to close
  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [event, onClose]);

  const isOpen = !!event;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "fixed top-0 right-0 z-[70] h-full w-[460px] max-w-[95vw] flex flex-col",
          "bg-surface-panel border-l border-surface-border shadow-2xl",
          "transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        {event && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-border shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-content truncate">
                  {getEventCheckLabel(event.checkResults)}
                </p>
                <p className="text-xs text-content-muted mt-0.5 truncate">
                  {event.cameraName ?? event.cameraId}
                  {event.cameraCode && (
                    <span className="font-mono ml-1.5 text-content-muted">· {event.cameraCode}</span>
                  )}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Tutup"
                className="ml-3 shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-content-muted hover:text-content hover:bg-surface-elevated transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto">

              {/* Snapshot + canvas — double-click to fullscreen */}
              <div
                className="relative bg-black aspect-video"
                onDoubleClick={() => snapshotSrc && setFullscreen(true)}
                style={{ cursor: snapshotSrc ? "zoom-in" : undefined }}
              >
                {snapshotSrc ? (
                  <>
                    <img
                      ref={imgRef}
                      src={snapshotSrc}
                      alt="snapshot"
                      className="w-full h-full object-contain"
                      onLoad={repaint}
                    />
                    <canvas
                      ref={canvasRef}
                      className="absolute inset-0 w-full h-full pointer-events-none"
                    />
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/30">
                    <AlertTriangle className="w-10 h-10" />
                    <p className="text-sm">Snapshot tidak tersedia</p>
                  </div>
                )}

                {event.isViolation && (
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-red-500/90 text-white text-[10px] font-semibold">
                    PELANGGARAN
                  </div>
                )}

                {/* Expand button */}
                <button
                  onClick={() => setFullscreen(true)}
                  className="absolute top-2 right-2 p-1.5 rounded-md bg-black/50 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/70 transition-colors"
                  title="Perbesar"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>

                <div className="absolute bottom-2 right-2 px-2 py-1 rounded-md bg-black/50 backdrop-blur-sm">
                  <span className="text-[10px] text-white/80">{formatRelative(event.detectedAt)}</span>
                </div>
              </div>

              <div className="p-4 space-y-3">

                {/* Overlay toggles */}
                <div className="border border-surface-border rounded-xl bg-surface-panel divide-y divide-surface-border">
                  {/* BBox toggle */}
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {showBbox
                        ? <Eye className="w-4 h-4 text-primary" />
                        : <EyeOff className="w-4 h-4 text-content-muted" />
                      }
                      <span className="text-sm text-content">Bounding Box</span>
                      {detections.length === 0 && (
                        <span className="text-xs text-content-muted">(tidak ada)</span>
                      )}
                    </div>
                    <label
                      className={cn(
                        "relative inline-flex items-center cursor-pointer",
                        detections.length === 0 && "opacity-40 pointer-events-none"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={showBbox}
                        onChange={(e) => setShowBbox(e.target.checked)}
                        disabled={detections.length === 0}
                      />
                      <div className="w-10 h-6 bg-surface-border rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
                    </label>
                  </div>

                  {/* ROI toggle */}
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {showRoi
                        ? <Eye className="w-4 h-4 text-red-500" />
                        : <EyeOff className="w-4 h-4 text-content-muted" />
                      }
                      <span className="text-sm text-content">ROI / Red Zone</span>
                      {redZones.length === 0 && (
                        <span className="text-xs text-content-muted">(tidak ada)</span>
                      )}
                    </div>
                    <label
                      className={cn(
                        "relative inline-flex items-center cursor-pointer",
                        redZones.length === 0 && "opacity-40 pointer-events-none"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={showRoi}
                        onChange={(e) => setShowRoi(e.target.checked)}
                        disabled={redZones.length === 0}
                      />
                      <div className="w-10 h-6 bg-surface-border rounded-full peer peer-checked:bg-red-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
                    </label>
                  </div>
                </div>

                {/* Hasil Analisa */}
                <div className="border border-surface-border rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-surface-border">
                    <p className="text-sm font-medium text-content">
                      Hasil Analisa
                      <span className="ml-2 text-xs font-normal text-content-muted">
                        · {formatRelative(event.detectedAt)}
                      </span>
                    </p>
                  </div>
                  {detections.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-content-muted">Tidak ada deteksi objek</p>
                  ) : (
                    <div className="divide-y divide-surface-border">
                      {detections.map((det, i) => {
                        const color = labelColor(det.label);
                        const pct =
                          det.confidence != null && !isNaN(det.confidence)
                            ? Math.round(det.confidence * 100)
                            : null;
                        return (
                          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span className="flex-1 text-sm text-content">{det.label}</span>
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: pct != null ? `${pct}%` : "0%",
                                    backgroundColor: color
                                  }}
                                />
                              </div>
                              <span className="w-8 text-xs text-right tabular-nums text-content-muted">
                                {pct != null ? `${pct}%` : "—"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Meta rows */}
                <div className="border border-surface-border rounded-xl overflow-hidden divide-y divide-surface-border text-sm">
                  {/* Checks */}
                  {event.checkResults.length > 0 && (
                    <div className="px-4 py-2.5 flex items-start gap-3">
                      <span className="text-xs text-content-muted w-20 shrink-0 pt-0.5">Checks</span>
                      <div className="flex flex-wrap gap-1">
                        {event.checkResults.map((cr) => (
                          <span
                            key={cr.check}
                            className={cn(
                              "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border",
                              cr.isViolation
                                ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800"
                                : "bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600"
                            )}
                          >
                            {cr.check.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Model */}
                  {event.modelName && (
                    <div className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-xs text-content-muted w-20 shrink-0">Model</span>
                      <span className="text-sm text-content truncate">{event.modelName}</span>
                    </div>
                  )}

                  {/* Status */}
                  <div className="px-4 py-2.5 flex items-center gap-3">
                    <span className="text-xs text-content-muted w-20 shrink-0">Status</span>
                    <span className={cn("text-sm font-medium", statusConfig[event.status].className)}>
                      {statusConfig[event.status].label}
                    </span>
                  </div>

                  {/* Confidence */}
                  <div className="px-4 py-2.5 flex items-center gap-3">
                    <span className="text-xs text-content-muted w-20 shrink-0">Confidence</span>
                    <ConfidenceBadge value={getEventConfidence(event.checkResults)} />
                  </div>

                  {/* Time */}
                  <div className="px-4 py-2.5 flex items-center gap-3">
                    <span className="text-xs text-content-muted w-20 shrink-0">Waktu</span>
                    <span className="text-sm text-content">{formatDate(event.detectedAt)}</span>
                  </div>
                </div>

              </div>
            </div>
          </>
        )}
      </div>

      {/* Fullscreen overlay — rendered outside the drawer panel */}
      <FullscreenViewer
        open={fullscreen}
        onClose={() => setFullscreen(false)}
        cameraName={event?.cameraName ?? event?.cameraId ?? ""}
        cameraCode={event?.cameraCode ?? ""}
        snapshotSrc={snapshotSrc}
        detections={detections}
        redZones={redZones}
      />
    </>,
    document.body
  );
}
