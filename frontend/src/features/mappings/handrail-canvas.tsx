import { useRef, useEffect, useCallback, useState } from "react";
import { RotateCcw, Minus, Plus, Video } from "lucide-react";
import type { RoiPoint, HandrailLine } from "../../services/mapping.service";

type Props = {
  streamUrl: string | null;
  stairsZone: RoiPoint[];
  handrailLines: HandrailLine[];
  onChange: (next: { stairsZone: RoiPoint[]; handrailLines: HandrailLine[] }) => void;
};

type Mode = "zone" | "line";

const ZONE_FILL = "rgba(34, 197, 94, 0.18)"; // green
const ZONE_STROKE = "rgba(34, 197, 94, 0.95)";
const LINE_STROKE = "rgba(37, 99, 235, 0.95)"; // blue
const LINE_ACTIVE = "rgba(59, 130, 246, 1)";

/**
 * Editor geometri handrail: gambar SATU poligon area-tangga (hijau) + SATU/LEBIH
 * garis handrail (biru; rail bisa di banyak sisi tangga). Semua titik
 * ternormalisasi [0,1]. Mirror konsep `ai/scripts/pick_roi.py`.
 */
export function HandrailCanvas({ streamUrl, stairsZone, handrailLines, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streamError, setStreamError] = useState(false);
  const [mode, setMode] = useState<Mode>("zone");
  // index garis yang sedang digambar (null = klik berikutnya mulai garis baru)
  const [activeLine, setActiveLine] = useState<number | null>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const px = (p: RoiPoint) => ({ x: p.x * canvas.width, y: p.y * canvas.height });

    // Stairs zone polygon (green)
    if (stairsZone.length) {
      const sp = stairsZone.map(px);
      ctx.beginPath();
      ctx.moveTo(sp[0].x, sp[0].y);
      sp.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = ZONE_FILL;
      ctx.fill();
      ctx.strokeStyle = ZONE_STROKE;
      ctx.lineWidth = 2;
      ctx.stroke();
      sp.forEach((p, i) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, i === 0 ? 6 : 4, 0, Math.PI * 2);
        ctx.fillStyle = ZONE_STROKE;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }

    // Handrail lines (blue polylines)
    handrailLines.forEach((line, li) => {
      const lp = (line.points ?? []).map(px);
      if (!lp.length) return;
      ctx.beginPath();
      ctx.moveTo(lp[0].x, lp[0].y);
      lp.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = li === activeLine ? LINE_ACTIVE : LINE_STROKE;
      ctx.lineWidth = 3;
      ctx.stroke();
      lp.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = li === activeLine ? LINE_ACTIVE : LINE_STROKE;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    });
  }, [stairsZone, handrailLines, activeLine]);

  useEffect(() => {
    draw();
  }, [draw]);

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Clamp to [0,1]: AI rejects points outside range.
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    const pt = { x: parseFloat(x.toFixed(4)), y: parseFloat(y.toFixed(4)) };

    if (mode === "zone") {
      // close polygon if clicking near first point (3+ points)
      if (stairsZone.length >= 3) {
        const f = stairsZone[0];
        if (Math.sqrt((x - f.x) ** 2 + (y - f.y) ** 2) < 0.03) return;
      }
      onChange({ stairsZone: [...stairsZone, pt], handrailLines });
      return;
    }

    // line mode
    if (activeLine === null) {
      const next = [...handrailLines, { points: [pt] }];
      setActiveLine(handrailLines.length);
      onChange({ stairsZone, handrailLines: next });
    } else {
      const next = handrailLines.map((l, i) =>
        i === activeLine ? { points: [...(l.points ?? []), pt] } : l
      );
      onChange({ stairsZone, handrailLines: next });
    }
  }

  function undo() {
    if (mode === "zone") {
      onChange({ stairsZone: stairsZone.slice(0, -1), handrailLines });
      return;
    }
    if (activeLine === null) return;
    const line = handrailLines[activeLine];
    const pts = (line?.points ?? []).slice(0, -1);
    if (pts.length === 0) {
      // hapus garis kosong, kembali ke "siap mulai garis baru"
      onChange({ stairsZone, handrailLines: handrailLines.filter((_, i) => i !== activeLine) });
      setActiveLine(null);
    } else {
      onChange({
        stairsZone,
        handrailLines: handrailLines.map((l, i) => (i === activeLine ? { points: pts } : l))
      });
    }
  }

  function resetMode() {
    if (mode === "zone") {
      onChange({ stairsZone: [], handrailLines });
    } else {
      onChange({ stairsZone, handrailLines: [] });
      setActiveLine(null);
    }
  }

  const validLines = handrailLines.filter((l) => (l.points ?? []).length >= 2).length;
  const hint =
    mode === "zone"
      ? stairsZone.length === 0
        ? "Klik untuk menggambar poligon AREA TANGGA (hijau)"
        : stairsZone.length < 3
        ? `${stairsZone.length} titik — butuh minimal 3`
        : `${stairsZone.length} titik — klik titik pertama untuk tutup poligon`
      : activeLine === null
      ? "Klik untuk mulai GARIS HANDRAIL baru (biru)"
      : "Klik untuk lanjut garis ini, atau 'Garis baru' untuk rail sisi lain";

  return (
    <div className="space-y-2">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 text-xs">
        <button
          type="button"
          onClick={() => setMode("zone")}
          className={`px-3 py-1 rounded border transition-colors ${
            mode === "zone"
              ? "bg-green-500/15 border-green-500/40 text-green-600"
              : "border-surface-border hover:bg-surface-elevated"
          }`}
        >
          1. Area tangga
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("line");
            setActiveLine(null);
          }}
          className={`px-3 py-1 rounded border transition-colors ${
            mode === "line"
              ? "bg-blue-500/15 border-blue-500/40 text-blue-600"
              : "border-surface-border hover:bg-surface-elevated"
          }`}
        >
          2. Garis handrail
        </button>
      </div>

      <div
        className="relative rounded-lg overflow-hidden border border-surface-border bg-surface-elevated"
        style={{ aspectRatio: "16/9" }}
      >
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
              <p className="text-xs">Stream tidak tersedia — geometri tetap bisa digambar</p>
            </div>
          </div>
        )}
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
        <span className="flex-1">{hint}</span>
        {mode === "line" && (
          <button
            type="button"
            onClick={() => setActiveLine(null)}
            disabled={activeLine === null}
            className="flex items-center gap-1 px-2 py-1 border border-surface-border rounded hover:bg-surface-elevated disabled:opacity-30 transition-colors"
          >
            <Plus className="w-3 h-3" /> Garis baru
          </button>
        )}
        <button
          type="button"
          onClick={undo}
          className="flex items-center gap-1 px-2 py-1 border border-surface-border rounded hover:bg-surface-elevated transition-colors"
        >
          <Minus className="w-3 h-3" /> Hapus titik
        </button>
        <button
          type="button"
          onClick={resetMode}
          className="flex items-center gap-1 px-2 py-1 border border-surface-border rounded hover:bg-surface-elevated transition-colors"
        >
          <RotateCcw className="w-3 h-3" /> Reset {mode === "zone" ? "zona" : "garis"}
        </button>
      </div>

      <p className="text-[11px] text-content-muted">
        Zona tangga: {stairsZone.length} titik · Garis handrail valid: {validLines}
        {validLines === 0 || stairsZone.length < 3
          ? " — butuh zona ≥3 titik & ≥1 garis ≥2 titik agar deteksi aktif"
          : ""}
      </p>
    </div>
  );
}
