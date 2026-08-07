import { useRef, useEffect, useCallback, useState } from "react";
import { RotateCcw, Minus, Maximize2, Video } from "lucide-react";
import type { RoiPoint } from "../../services/mapping.service";

type Props = {
  streamUrl: string | null;
  points: RoiPoint[];
  onChange: (points: RoiPoint[]) => void;
};

export function RoiCanvas({ streamUrl, points, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [streamError, setStreamError] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (points.length === 0) return;

    const px = (p: RoiPoint) => ({ x: p.x * canvas.width, y: p.y * canvas.height });
    const screenPoints = points.map(px);

    // Polygon fill
    ctx.beginPath();
    ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
    screenPoints.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = "rgba(99, 102, 241, 0.20)";
    ctx.fill();

    // Polygon stroke
    ctx.strokeStyle = "rgba(99, 102, 241, 0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Vertices
    screenPoints.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, i === 0 ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? "#6366f1" : "#a5b4fc";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }, [points]);

  useEffect(() => {
    draw();
  }, [draw]);

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Clamp to [0,1]: a click at the very edge can land a hair out of range,
    // and the AI rejects ROI points outside [0,1] (fails every inference).
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));

    // Close polygon if clicking near first point (3+ points)
    if (points.length >= 3) {
      const first = points[0];
      if (Math.sqrt((x - first.x) ** 2 + (y - first.y) ** 2) < 0.03) return;
    }

    const cx = Math.max(0, Math.min(1, x));
    const cy = Math.max(0, Math.min(1, y));
    onChange([...points, { x: parseFloat(cx.toFixed(4)), y: parseFloat(cy.toFixed(4)) }]);
  }

  return (
    <div className="space-y-2">
      {/* Stacked: stream img behind, transparent canvas on top */}
      <div
        ref={containerRef}
        className="relative rounded-lg overflow-hidden border border-surface-border bg-surface-elevated"
        style={{ aspectRatio: "16/9" }}
      >
        {/* Live stream as background */}
        {streamUrl && !streamError ? (
          <img
            src={streamUrl}
            alt="Camera stream"
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setStreamError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-elevated">
            <div className="text-center text-content-muted">
              <Video className="w-8 h-8 mx-auto mb-1 opacity-40" />
              <p className="text-xs">Stream tidak tersedia — polygon red zone tetap bisa digambar</p>
            </div>
          </div>
        )}

        {/* Transparent SVG overlay for polygon drawing */}
        <canvas
          ref={canvasRef}
          width={640}
          height={360}
          onClick={handleClick}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          style={{ background: "transparent" }}
        />
      </div>

      <div className="flex items-center gap-2 text-xs text-content-muted">
        <span className="flex-1">
          {points.length === 0
            ? "Klik pada gambar untuk tambah titik polygon"
            : points.length < 3
            ? `${points.length} titik — butuh minimal 3`
            : `${points.length} titik — klik titik pertama untuk tutup polygon`}
        </span>
        <button
          type="button"
          onClick={() => onChange(points.slice(0, -1))}
          disabled={points.length === 0}
          className="flex items-center gap-1 px-2 py-1 border border-surface-border rounded hover:bg-surface-elevated disabled:opacity-30 transition-colors"
        >
          <Minus className="w-3 h-3" /> Hapus titik
        </button>
        <button
          type="button"
          onClick={() => onChange([])}
          disabled={points.length === 0}
          className="flex items-center gap-1 px-2 py-1 border border-surface-border rounded hover:bg-surface-elevated disabled:opacity-30 transition-colors"
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
        <button
          type="button"
          onClick={() =>
            onChange([
              { x: 0, y: 0 }, { x: 1, y: 0 },
              { x: 1, y: 1 }, { x: 0, y: 1 }
            ])
          }
          className="flex items-center gap-1 px-2 py-1 border border-surface-border rounded hover:bg-surface-elevated transition-colors"
        >
          <Maximize2 className="w-3 h-3" /> Full frame
        </button>
      </div>
    </div>
  );
}
