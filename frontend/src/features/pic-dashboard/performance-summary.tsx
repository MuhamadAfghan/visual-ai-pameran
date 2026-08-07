import { Clock, CheckCircle2, TrendingUp, TrendingDown } from "lucide-react";
import { Sparkline } from "./sparkline";
import { cn } from "../../utils/cn";
import type { PicPerformance } from "../../types/dashboard.types";

type Props = {
  data: PicPerformance | undefined;
  isLoading: boolean;
};

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}d`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m < 60) return `${m}m ${s}d`;
  const h = Math.floor(m / 60);
  return `${h}j ${m % 60}m`;
}

function DeltaPill({ pct, inverse }: { pct: number | null; inverse?: boolean }) {
  // Hide entirely when there's no comparison data — keeps the layout clean
  if (pct == null || pct === 0) return null;
  // inverse = true means "lower is better" (e.g. response time)
  const isGood = inverse ? pct < 0 : pct > 0;
  const tone = isGood ? "text-emerald-400" : "text-rose-400";
  const Icon = pct > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-medium", tone)}>
      <Icon className="w-3 h-3" />
      {Math.abs(pct)}%
    </span>
  );
}

export function PerformanceSummary({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="bg-surface-panel border border-surface-border rounded-xl p-5 h-40 animate-pulse" />
    );
  }
  if (!data) {
    return (
      <div className="bg-surface-panel border border-surface-border rounded-xl p-5">
        <p className="text-sm text-content-muted">Belum ada data performance</p>
      </div>
    );
  }

  const ackRatePct = data.ackRate != null ? Math.round(data.ackRate * 100) : null;

  return (
    <div className="bg-surface-panel border border-surface-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-content">Performance Saya</h3>
          <p className="text-xs text-content-muted mt-0.5">{data.days} hari terakhir</p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-elevated text-content-muted">
          {data.totals.events} event
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-content-muted text-xs">
            <Clock className="w-3.5 h-3.5" />
            Avg response time
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-content">{formatDuration(data.avgResponseMs)}</span>
            <DeltaPill pct={data.delta.avgResponseMsPct} inverse />
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 text-content-muted text-xs">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Acknowledge rate
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-content">
              {ackRatePct != null ? `${ackRatePct}%` : "—"}
            </span>
            <DeltaPill pct={data.delta.ackRatePct} />
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[10px] text-content-muted mb-1">
          <span>Tren event harian</span>
          <span>{data.trend.data.reduce((a, b) => a + b, 0)} total</span>
        </div>
        <Sparkline
          data={data.trend.data}
          width={400}
          height={48}
          className="w-full text-primary"
        />
      </div>
    </div>
  );
}
