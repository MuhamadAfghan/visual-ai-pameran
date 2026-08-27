import { useCallback, useEffect, useRef } from "react";
import { cn } from "../utils/cn";
import type { Detection, RedZone } from "../types/event.types";

// Detection labels that represent a rule violation on their own (see naming
// convention in ai/CLAUDE.md — most are `no_<noun>`, but hand_in_pocket,
// fall_detected and improper_mask are violations in their positive form).
const VIOLATION_LABELS = new Set([
  "no_mask",
  "improper_mask",
  "no_helmet",
  "no_vest",
  "no_goggles",
  "no_gloves",
  "fall_detected",
  "hand_in_pocket"
]);

const VIOLATION_COLOR = "#ef4444"; // red-500
const COMPLIANT_COLOR = "#22c55e"; // green-500

/** True when a detection is a violation — by class label, or by a composite
 *  attribute (e.g. red-zone intrusion) applied to an otherwise-neutral label. */
// eslint-disable-next-line react-refresh/only-export-components
export function isViolationDetection(det: Pick<Detection, "label" | "attributes">): boolean {
  return det.attributes?.in_red_zone === "true" || VIOLATION_LABELS.has(det.label);
}

/** Red for violations, green otherwise — used for every bbox/legend swatch. */
// eslint-disable-next-line react-refresh/only-export-components
export function detectionColor(det: Pick<Detection, "label" | "attributes">): string {
  return isViolationDetection(det) ? VIOLATION_COLOR : COMPLIANT_COLOR;
}

type Props = {
  src: string;
  alt?: string;
  detections?: Detection[];
  redZones?: RedZone[];
  className?: string;
  fit?: "cover" | "contain";
  /** Skip labels and use thinner lines — for small thumbnails */
  compact?: boolean;
  loading?: "lazy" | "eager";
};

/**
 * Renders a snapshot image with bounding-box overlays drawn on a canvas layer.
 * The wrapping div must have explicit dimensions (e.g. w-full h-full, aspect-video)
 * so the canvas can compute the correct pixel scale.
 */
export function SnapshotWithBbox({
  src,
  alt = "",
  detections = [],
  redZones = [],
  className,
  fit = "contain",
  compact = false,
  loading
}: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const paint = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !img.naturalWidth) return;

    const cw = canvas.offsetWidth;
    const ch = canvas.offsetHeight;
    if (!cw || !ch) return;

    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, cw, ch);

    const scale =
      fit === "contain"
        ? Math.min(cw / img.naturalWidth, ch / img.naturalHeight)
        : Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const ox = (cw - img.naturalWidth * scale) / 2;
    const oy = (ch - img.naturalHeight * scale) / 2;

    // ── Red zones ────────────────────────────────────────────────────────────
    if (!compact) {
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
        ctx.fillStyle = "rgba(239,68,68,0.10)";
        ctx.fill();
        ctx.strokeStyle = "rgba(239,68,68,0.85)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (zone.name) {
          ctx.font = "bold 10px ui-monospace, monospace";
          ctx.fillStyle = "rgba(239,68,68,0.9)";
          ctx.fillText(zone.name, pts[0].x + 6, pts[0].y - 5);
        }
      }
    }

    if (!detections.length) return;

    ctx.font = compact
      ? "bold 9px ui-monospace, monospace"
      : "bold 11px ui-monospace, monospace";

    // ── Bounding boxes ───────────────────────────────────────────────────────
    for (const det of detections) {
      const [x1, y1, x2, y2] = det.bbox;
      const rx = ox + x1 * scale;
      const ry = oy + y1 * scale;
      const rw = (x2 - x1) * scale;
      const rh = (y2 - y1) * scale;
      const color = detectionColor(det);

      ctx.strokeStyle = color;
      ctx.lineWidth = compact ? 1 : 1.5;
      ctx.strokeRect(rx, ry, rw, rh);

      if (!compact) {
        const pct = det.confidence != null ? Math.round(det.confidence * 100) : null;
        const lbl = pct != null ? `${det.label} ${pct}%` : det.label;
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
  }, [detections, redZones, fit, compact]);

  useEffect(() => {
    paint();
  }, [paint]);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading={loading}
        className={cn("w-full h-full", fit === "contain" ? "object-contain" : "object-cover")}
        onLoad={paint}
      />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
    </div>
  );
}
