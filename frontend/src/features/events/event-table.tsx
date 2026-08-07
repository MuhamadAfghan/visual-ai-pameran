import { Trash2, AlertTriangle, Eye, ChevronDown } from "lucide-react";
import { ConfidenceBadge } from "../../components/confidence-badge";
import { Skeleton } from "../../components/skeleton";
import { EmptyState } from "../../components/empty-state";
import { formatDate } from "../../utils/formatDate";
import { cn } from "../../utils/cn";
import { getEventConfidence, type DetectionEvent, type EventStatus } from "../../types/event.types";

type Props = {
  events: DetectionEvent[];
  loading: boolean;
  selectedIds: Set<string>;
  onSelectToggle: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onView: (ev: DetectionEvent) => void;
  onDelete?: (id: string) => void;
  onStatusChange?: (id: string, newStatus: EventStatus) => void;
  page: number;
  limit: number;
};

const statusConfig: Record<EventStatus, { label: string; dot: string }> = {
  unacknowledged: { label: "Belum Diakui", dot: "bg-orange-500" },
  acknowledged: { label: "Diakui", dot: "bg-emerald-500" },
  false_positive: { label: "False Positive", dot: "bg-content-muted" }
};

const COL_COUNT = 10;

export function EventTable({
  events,
  loading,
  selectedIds,
  onSelectToggle,
  onSelectAll,
  onDeselectAll,
  onView,
  onDelete,
  onStatusChange,
  page,
  limit
}: Props) {
  const allSelected = events.length > 0 && events.every((e) => selectedIds.has(e._id));

  return (
    <div className="bg-surface-panel border border-surface-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-border bg-surface-elevated">
            <th className="w-10 px-3 py-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => (allSelected ? onDeselectAll() : onSelectAll())}
                className="rounded border-surface-border"
              />
            </th>
            <th className="w-10 px-3 py-3 text-xs font-semibold text-left text-content-secondary">#</th>
            <th className="w-20 px-3 py-3 text-xs font-semibold text-left text-content-secondary">Snapshot</th>
            <th className="px-3 py-3 text-xs font-semibold text-left text-content-secondary">Kamera</th>
            <th className="px-3 py-3 text-xs font-semibold text-left text-content-secondary">Model</th>
            <th className="px-3 py-3 text-xs font-semibold text-left text-content-secondary">Checks</th>
            <th className="px-3 py-3 text-xs font-semibold text-left text-content-secondary">Confidence</th>
            <th className="px-3 py-3 text-xs font-semibold text-left text-content-secondary">Status</th>
            <th className="px-3 py-3 text-xs font-semibold text-left text-content-secondary">Waktu</th>
            <th className="px-3 py-3 text-xs font-semibold text-right text-content-secondary">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b border-surface-border">
                {Array.from({ length: COL_COUNT }).map((_, j) => (
                  <td key={j} className="px-3 py-3">
                    <Skeleton height="1rem" />
                  </td>
                ))}
              </tr>
            ))
          ) : events.length === 0 ? (
            <tr>
              <td colSpan={COL_COUNT}>
                <EmptyState
                  icon={AlertTriangle}
                  title="Tidak ada event"
                  description="Coba ubah filter pencarian"
                />
              </td>
            </tr>
          ) : (
            events.map((ev, i) => (
              <tr
                key={ev._id}
                onClick={() => onView(ev)}
                className={cn(
                  "border-b border-surface-border last:border-0 transition-colors cursor-pointer",
                  selectedIds.has(ev._id) ? "bg-primary-dim/40" : "hover:bg-surface-elevated"
                )}
              >
                {/* Checkbox — stop row click from firing */}
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(ev._id)}
                    onChange={() => onSelectToggle(ev._id)}
                    className="rounded border-surface-border"
                  />
                </td>

                {/* Row number */}
                <td className="px-3 py-3 text-xs text-content-muted">
                  {(page - 1) * limit + i + 1}
                </td>

                {/* Snapshot thumbnail */}
                <td className="px-3 py-3">
                  <div
                    className="flex-shrink-0 w-16 h-10 overflow-hidden border rounded-lg bg-surface-elevated border-surface-border"
                  >
                    {ev.snapshotPath ? (
                      <img src={ev.snapshotUrl} alt="" className="object-cover w-full h-full" />
                    ) : (
                      <div className="flex items-center justify-center w-full h-full">
                        <AlertTriangle className="w-3.5 h-3.5 text-content-muted" />
                      </div>
                    )}
                  </div>
                </td>

                {/* Camera */}
                <td className="px-3 py-3 text-content max-w-[160px]">
                  <p className="truncate">{ev.cameraName ?? ev.cameraId}</p>
                  {ev.cameraCode && (
                    <p className="text-[10px] font-mono text-content-muted truncate">{ev.cameraCode}</p>
                  )}
                  {(ev.areaCode || ev.areaName) && (
                    <p className="text-[10px] text-content-muted truncate mt-0.5">
                      {ev.areaCode && <span className="font-mono">[{ev.areaCode}]</span>}
                      {ev.areaName && <span> · {ev.areaName}</span>}
                      {ev.sectionName && <span> / {ev.sectionName}</span>}
                    </p>
                  )}
                </td>

                {/* Model */}
                <td className="px-3 py-3 max-w-[120px]">
                  {ev.modelName ? (
                    <p className="text-xs text-content truncate" title={ev.modelName}>
                      {ev.modelName}
                    </p>
                  ) : (
                    <span className="text-xs text-content-muted">—</span>
                  )}
                </td>

                {/* Checks — all as badges */}
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {ev.checkResults.length > 0 ? (
                      ev.checkResults.map((cr) => (
                        <span
                          key={cr.check}
                          className={cn(
                            "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap border",
                            cr.isViolation
                              ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800"
                              : "bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600"
                          )}
                        >
                          {cr.check.replace(/_/g, " ")}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-content-muted">—</span>
                    )}
                  </div>
                </td>

                {/* Confidence */}
                <td className="px-3 py-3">
                  <ConfidenceBadge value={getEventConfidence(ev.checkResults)} />
                </td>

                {/* Status */}
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  {onStatusChange ? (
                    <div className="relative inline-flex items-center">
                      <span
                        className={cn(
                          "absolute left-2.5 w-1.5 h-1.5 rounded-full pointer-events-none",
                          statusConfig[ev.status].dot
                        )}
                      />
                      <select
                        value={ev.status}
                        onChange={(e) => onStatusChange(ev._id, e.target.value as EventStatus)}
                        className="text-xs font-medium pl-6 pr-7 py-1 rounded-md border border-surface-border bg-surface-panel text-content cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
                        style={{ backgroundImage: "none" }}
                      >
                        <option value="unacknowledged">Belum Diakui</option>
                        <option value="acknowledged">Diakui</option>
                        <option value="false_positive">False Positive</option>
                      </select>
                      <ChevronDown className="absolute right-2 w-3 h-3 text-content-muted pointer-events-none" />
                    </div>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-content">
                      <span className={cn("w-1.5 h-1.5 rounded-full", statusConfig[ev.status].dot)} />
                      {statusConfig[ev.status].label}
                    </span>
                  )}
                </td>

                {/* Time */}
                <td className="px-3 py-3 text-xs text-content-secondary whitespace-nowrap">
                  {formatDate(ev.detectedAt)}
                </td>

                {/* Actions — stop row click from firing */}
                <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onView(ev)}
                      title="Lihat detail"
                      className="p-1.5 rounded-md text-content-muted hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {onDelete && (
                      <button
                        onClick={() => onDelete(ev._id)}
                        title="Hapus"
                        className="p-1.5 rounded-md text-content-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
