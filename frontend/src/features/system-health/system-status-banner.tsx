import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "../../utils/cn";
import type { SystemSnapshot } from "../../types/system-health.types";

type Props = {
  snapshot: SystemSnapshot | null;
};

type Health = "operational" | "degraded" | "down";

function deriveHealth(s: SystemSnapshot): { health: Health; downCount: number; warnCount: number } {
  const components = [s.components.mongodb.status, s.components.redis.status, s.components.aiGrpc.status];
  const downCount = components.filter((c) => c === "down").length;
  const workerWarnCount = [s.workers.infer.status, s.workers.notification.status].filter(
    (w) => w === "no_workers"
  ).length;

  const coreDown = s.components.mongodb.status === "down" || s.components.redis.status === "down";
  if (coreDown) return { health: "down", downCount, warnCount: workerWarnCount };
  if (downCount > 0 || workerWarnCount > 0) return { health: "degraded", downCount, warnCount: workerWarnCount };
  return { health: "operational", downCount: 0, warnCount: 0 };
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3_600);
  const m = Math.floor((seconds % 3_600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const config = {
  operational: {
    Icon: CheckCircle2,
    label: "All Systems Operational",
    text: "text-emerald-400",
    dot: "bg-emerald-500",
    border: "border-emerald-500/20",
    bg: "bg-gradient-to-r from-emerald-500/10 via-emerald-500/[0.03] to-transparent",
    desc: "Semua komponen berjalan normal"
  },
  degraded: {
    Icon: AlertTriangle,
    label: "Partial Degradation",
    text: "text-amber-400",
    dot: "bg-amber-500",
    border: "border-amber-500/20",
    bg: "bg-gradient-to-r from-amber-500/10 via-amber-500/[0.03] to-transparent",
    desc: "Beberapa komponen tidak optimal"
  },
  down: {
    Icon: XCircle,
    label: "Major Outage",
    text: "text-rose-400",
    dot: "bg-rose-500",
    border: "border-rose-500/20",
    bg: "bg-gradient-to-r from-rose-500/10 via-rose-500/[0.03] to-transparent",
    desc: "Komponen inti tidak tersedia"
  }
} as const;

export function SystemStatusBanner({ snapshot }: Props) {
  const { health, downCount, warnCount } = snapshot
    ? deriveHealth(snapshot)
    : { health: "down" as Health, downCount: 0, warnCount: 0 };
  const cfg = config[health];
  const { Icon } = cfg;

  return (
    <div className={cn("relative overflow-hidden border rounded-2xl p-5", cfg.border, cfg.bg)}>
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className={cn("relative flex items-center justify-center w-12 h-12 rounded-xl bg-surface-panel/60 border", cfg.border)}>
            <Icon className={cn("w-6 h-6", cfg.text)} />
            <span className={cn("absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-surface-base", cfg.dot, "animate-pulse")} />
          </div>
          <div>
            <p className={cn("text-base font-bold tracking-tight", cfg.text)}>{cfg.label}</p>
            <p className="text-xs text-content-secondary mt-0.5">
              {snapshot ? cfg.desc : "Menunggu data sistem..."}
              {snapshot && (downCount > 0 || warnCount > 0) && (
                <span className="ml-2 text-content-muted">
                  • {downCount} down · {warnCount} warn
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center divide-x divide-surface-border/60">
          <StatPill label="Uptime" value={snapshot ? formatUptime(snapshot.uptime) : "—"} />
          <StatPill
            label="Last update"
            value={snapshot ? new Date(snapshot.ts).toLocaleTimeString() : "—"}
          />
          <StatPill
            label="Tick rate"
            value="3s"
          />
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 first:pl-0 last:pr-0">
      <p className="text-[10px] uppercase tracking-wider text-content-muted">{label}</p>
      <p className="text-sm font-semibold text-content tabular-nums mt-0.5">{value}</p>
    </div>
  );
}
