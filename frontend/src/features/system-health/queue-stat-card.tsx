import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/cn";
import type { QueueStats } from "../../types/system-health.types";

type Props = {
  icon: LucideIcon;
  label: string;
  stats: QueueStats;
  workerCount: number;
  workerStatus: "ok" | "no_workers";
};

export function QueueStatCard({ icon: Icon, label, stats, workerCount, workerStatus }: Props) {
  const total = stats.waiting + stats.active + stats.delayed;
  const hasFailed = stats.failed > 0;
  const backlogPressure = Math.min((stats.waiting / 50) * 100, 100);
  const activePressure = stats.active > 0 ? Math.max((stats.active / Math.max(stats.active + stats.waiting, 1)) * 100, 8) : 0;

  return (
    <div className="bg-surface-panel border border-surface-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-elevated">
            <Icon className="w-4 h-4 text-content-secondary" />
          </div>
          <div>
            <p className="text-xs text-content-muted uppercase tracking-wide">Queue</p>
            <p className="text-sm font-semibold text-content leading-tight">{label}</p>
          </div>
        </div>
        <span
          className={cn(
            "text-[10px] font-semibold px-2 py-0.5 rounded",
            workerStatus === "ok"
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-amber-500/10 text-amber-400"
          )}
        >
          {workerCount} WORKER{workerCount === 1 ? "" : "S"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Metric label="Waiting" value={stats.waiting} accent={stats.waiting > 50 ? "warn" : "neutral"} />
        <Metric label="Active" value={stats.active} accent={stats.active > 0 ? "info" : "neutral"} />
        <Metric label="Failed" value={stats.failed} accent={hasFailed ? "danger" : "neutral"} />
      </div>

      <div>
        <div className="flex items-center justify-between text-[10px] text-content-muted mb-1.5">
          <span className="uppercase tracking-wider">Pressure</span>
          <span className="tabular-nums">{total === 0 ? "idle" : `${total} pending`}</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-surface-elevated overflow-hidden flex">
          <div
            className="h-full bg-sky-500/80 transition-all duration-500"
            style={{ width: `${activePressure}%` }}
          />
          <div
            className={cn(
              "h-full transition-all duration-500",
              backlogPressure > 80 ? "bg-rose-500/70" : backlogPressure > 50 ? "bg-amber-500/70" : "bg-emerald-500/40"
            )}
            style={{ width: `${(stats.waiting / Math.max(total, 1)) * (100 - activePressure)}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-content-muted pt-2 border-t border-surface-border">
        <span>Delayed: <span className="text-content tabular-nums">{stats.delayed}</span></span>
        <span>Completed: <span className="text-content tabular-nums">{stats.completed.toLocaleString()}</span></span>
      </div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: number; accent: "neutral" | "warn" | "info" | "danger" }) {
  const accentMap = {
    neutral: "text-content",
    info: "text-sky-400",
    warn: "text-amber-400",
    danger: "text-rose-400"
  };
  return (
    <div className="bg-surface-elevated rounded-lg px-2 py-2">
      <p className="text-[9px] text-content-muted uppercase tracking-wider">{label}</p>
      <p className={cn("text-lg font-bold tabular-nums leading-tight mt-0.5", accentMap[accent])}>{value}</p>
    </div>
  );
}
