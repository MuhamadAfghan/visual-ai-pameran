import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { getCameras } from "../../services/camera.service";
import type { EventFilters } from "../../services/event.service";

type LocalState = {
  from: string;
  to: string;
  cameraId: string;
  status: string;
  isViolation: string;
};

const DEFAULT: LocalState = { from: "", to: "", cameraId: "", status: "", isViolation: "" };

function toFilters(f: LocalState): EventFilters {
  const out: EventFilters = {};
  if (f.from) out.from = f.from;
  if (f.to) out.to = f.to;
  if (f.cameraId) out.cameraId = f.cameraId;
  if (f.status) out.status = f.status;
  if (f.isViolation === "true") out.isViolation = true;
  if (f.isViolation === "false") out.isViolation = false;
  return out;
}

type Props = { onApply: (filters: EventFilters) => void; initialCameraId?: string };

export function EventFilterBar({ onApply, initialCameraId }: Props) {
  const [f, setF] = useState<LocalState>({ ...DEFAULT, cameraId: initialCameraId ?? "" });

  const { data: cameras } = useQuery({
    queryKey: ["cameras"],
    queryFn: () => getCameras({ isActive: true })
  });

  function update(key: keyof LocalState, value: string) {
    const next = { ...f, [key]: value };
    setF(next);
    onApply(toFilters(next));
  }

  function reset() {
    setF(DEFAULT);
    onApply({});
  }

  const hasActive =
    f.from !== "" || f.to !== "" || f.cameraId !== "" || f.status !== "" || f.isViolation !== "";

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-panel border border-surface-border rounded-xl">
      {/* Date range */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-content-muted shrink-0">Dari</span>
        <input
          type="date"
          value={f.from}
          onChange={(e) => update("from", e.target.value)}
          className={sel}
        />
        <span className="text-xs text-content-muted shrink-0">s/d</span>
        <input
          type="date"
          value={f.to}
          onChange={(e) => update("to", e.target.value)}
          className={sel}
        />
      </div>

      {/* Camera — grouped by Area · Section */}
      <select value={f.cameraId} onChange={(e) => update("cameraId", e.target.value)} className={sel}>
        <option value="">Semua Kamera</option>
        {(() => {
          if (!cameras) return null;
          type Group = { areaCode: string; areaName: string; sectionCode: string; sectionName: string; items: typeof cameras };
          const groups = new Map<string, Group>();
          const ungrouped: typeof cameras = [];
          for (const c of cameras) {
            const s = typeof c.sectionId === "object" ? c.sectionId : null;
            const a = s?.areaId;
            if (!s || !a) {
              ungrouped.push(c);
              continue;
            }
            const key = `${a._id}::${s._id}`;
            const existing = groups.get(key);
            if (existing) existing.items.push(c);
            else groups.set(key, {
              areaCode: a.code,
              areaName: a.name,
              sectionCode: s.code,
              sectionName: s.name,
              items: [c],
            });
          }
          return (
            <>
              {Array.from(groups.entries()).map(([key, g]) => (
                <optgroup key={key} label={`${g.areaCode} · ${g.areaName} → ${g.sectionCode} ${g.sectionName}`}>
                  {g.items.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </optgroup>
              ))}
              {ungrouped.length > 0 && (
                <optgroup label="Tanpa section">
                  {ungrouped.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </optgroup>
              )}
            </>
          );
        })()}
      </select>

      {/* Status */}
      <select value={f.status} onChange={(e) => update("status", e.target.value)} className={sel}>
        <option value="">Semua Status</option>
        <option value="unacknowledged">Belum Diakui</option>
        <option value="acknowledged">Diakui</option>
        <option value="false_positive">False Positive</option>
      </select>

      {/* Violation type */}
      <select value={f.isViolation} onChange={(e) => update("isViolation", e.target.value)} className={sel}>
        <option value="">Semua Tipe</option>
        <option value="true">Violation</option>
        <option value="false">Non-violation</option>
      </select>

      {/* Reset — only when a filter is active */}
      {hasActive && (
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-3 py-2 text-sm text-content-secondary border border-surface-border rounded-lg hover:bg-surface-elevated transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
      )}
    </div>
  );
}

const sel =
  "px-3 py-2 text-sm bg-surface-panel border border-surface-border text-content rounded-lg focus:outline-none focus:ring-1 focus:ring-primary";
