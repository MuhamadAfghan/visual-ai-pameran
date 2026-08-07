import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/cn";
import { Sparkline } from "./sparkline";

type Props = {
  icon: LucideIcon;
  label: string;
  status: "ok" | "down" | "no_workers";
  primaryValue: string;
  secondaryValue?: string;
  sparkValues?: number[];
};

const statusConfig: Record<Props["status"], { dot: string; color: string; label: string; chipBg: string }> = {
  ok: { dot: "bg-emerald-500", color: "#10b981", label: "Healthy", chipBg: "bg-emerald-500/10 text-emerald-400" },
  down: { dot: "bg-rose-500", color: "#f43f5e", label: "Down", chipBg: "bg-rose-500/10 text-rose-400" },
  no_workers: { dot: "bg-amber-500", color: "#f59e0b", label: "Warning", chipBg: "bg-amber-500/10 text-amber-400" }
};

export function ComponentStatusCard({ icon: Icon, label, status, primaryValue, secondaryValue, sparkValues }: Props) {
  const cfg = statusConfig[status];

  return (
    <div className="relative bg-surface-panel border border-surface-border rounded-xl p-4 flex flex-col gap-3 overflow-hidden">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-surface-elevated">
            <Icon className="w-4 h-4 text-content-secondary" />
          </div>
          <div>
            <p className="text-xs font-medium text-content-muted uppercase tracking-wide">{label}</p>
            <p className="text-base font-bold text-content tabular-nums leading-tight mt-0.5">{primaryValue}</p>
          </div>
        </div>
        <span className={cn("flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded", cfg.chipBg)}>
          <span className={cn("w-1 h-1 rounded-full", cfg.dot, status === "ok" && "animate-pulse")} />
          {cfg.label}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3 mt-auto">
        <div className="flex-1 min-w-0 h-7">
          {sparkValues && sparkValues.length > 0 ? (
            <Sparkline values={sparkValues} color={cfg.color} height={28} />
          ) : (
            <div className="h-7 w-full flex items-center">
              <div className="h-px w-full bg-surface-border/60" />
            </div>
          )}
        </div>
        {secondaryValue && (
          <p className="text-[10px] text-content-muted shrink-0 tabular-nums">{secondaryValue}</p>
        )}
      </div>
    </div>
  );
}
