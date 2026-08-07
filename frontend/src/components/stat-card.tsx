import type { LucideIcon } from "lucide-react";
import { cn } from "../utils/cn";

type Color = "blue" | "amber" | "violet" | "rose" | "emerald" | "sky";

type Props = {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  color?: Color;
  trend?: "up" | "down" | "neutral";
  onClick?: () => void;
};

const colorMap: Record<Color, { bg: string; text: string }> = {
  sky:     { bg: "bg-sky-500/15",     text: "text-sky-400" },
  blue:    { bg: "bg-blue-500/15",    text: "text-blue-400" },
  amber:   { bg: "bg-amber-500/15",   text: "text-amber-400" },
  violet:  { bg: "bg-violet-500/15",  text: "text-violet-400" },
  rose:    { bg: "bg-rose-500/15",    text: "text-rose-400" },
  emerald: { bg: "bg-emerald-500/15", text: "text-emerald-400" },
};

export function StatCard({ icon: Icon, label, value, sub, color = "sky", trend, onClick }: Props) {
  const { bg, text } = colorMap[color];

  return (
    <div
      className={cn(
        "bg-surface-panel border border-surface-border rounded-xl p-3.5 flex items-center gap-3",
        onClick && "cursor-pointer hover:border-primary/50 transition-colors"
      )}
      onClick={onClick}
    >
      <div className={cn("flex items-center justify-center w-9 h-9 rounded-lg shrink-0", bg)}>
        <Icon className={cn("w-4 h-4", text)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <p className="text-xl font-bold leading-none text-content">{value}</p>
          {trend && (
            <span
              className={cn(
                "text-xs font-medium",
                trend === "up" && "text-emerald-400",
                trend === "down" && "text-rose-400",
                trend === "neutral" && "text-content-muted"
              )}
            >
              {trend === "up" ? "↑" : trend === "down" ? "↓" : "—"}
            </span>
          )}
        </div>
        <p className="text-xs text-content-secondary truncate mt-1">
          {label}
          {sub && <span className="text-content-muted"> · {sub}</span>}
        </p>
      </div>
    </div>
  );
}
