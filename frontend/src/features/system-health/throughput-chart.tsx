import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import type { SnapshotLite, SystemSnapshot } from "../../types/system-health.types";

type Props = {
  history: SnapshotLite[];
  snapshot: SystemSnapshot | null;
};

export function ThroughputChart({ history, snapshot }: Props) {
  const data = history.map((h) => ({
    time: new Date(h.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    Events: h.processed1m,
    Violations: h.violations1m,
    Processing: h.processingNow
  }));

  const currentRate = snapshot?.events.last1m.processed ?? 0;
  const currentViolations = snapshot?.events.last1m.violations ?? 0;
  const total5m = snapshot?.events.last5m.processed ?? 0;
  const violations5m = snapshot?.events.last5m.violations ?? 0;
  const avgPerMinute = total5m > 0 ? (total5m / 5).toFixed(1) : "0";
  const violationRate = total5m > 0 ? ((violations5m / total5m) * 100).toFixed(1) : "0";

  return (
    <div className="bg-surface-panel border border-surface-border rounded-xl overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-start justify-between flex-wrap gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-content-muted font-semibold">Inference Throughput</p>
          <div className="flex items-baseline gap-2 mt-1.5">
            <p className="text-4xl font-bold text-content tabular-nums leading-none">{currentRate}</p>
            <p className="text-xs text-content-muted">events / min</p>
          </div>
          <p className="text-[11px] text-content-muted mt-1.5">
            <span className="text-rose-400 font-semibold tabular-nums">{currentViolations}</span> violations in last minute
          </p>
        </div>

        <div className="grid grid-cols-3 gap-x-5 gap-y-0">
          <Stat label="Avg / min (5m)" value={avgPerMinute} />
          <Stat label="Total events (5m)" value={total5m.toLocaleString()} />
          <Stat label="Violation rate" value={`${violationRate}%`} accent={parseFloat(violationRate) > 10 ? "warn" : "neutral"} />
        </div>
      </div>

      <div className="px-3 pb-3 pt-1">
        {data.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-xs text-content-muted">
            <div className="flex flex-col items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-content-muted animate-pulse" />
              <span>Collecting data...</span>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data} margin={{ top: 4, right: 12, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="gEvents" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gViolations" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--surface-border)" strokeOpacity={0.5} vertical={false} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "var(--content-muted)" }}
                tickLine={false}
                axisLine={false}
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--content-muted)" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--surface-panel)",
                  border: "1px solid var(--surface-border)",
                  borderRadius: "8px",
                  fontSize: "11px",
                  color: "var(--content)",
                  boxShadow: "0 8px 24px rgba(0,0,0,0.18)"
                }}
                labelStyle={{ color: "var(--content-secondary)", fontSize: "10px", marginBottom: 4 }}
                cursor={{ stroke: "var(--surface-border)", strokeWidth: 1, strokeDasharray: "3 3" }}
              />
              <Area
                type="monotone"
                dataKey="Events"
                stroke="#10b981"
                fill="url(#gEvents)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
              <Area
                type="monotone"
                dataKey="Violations"
                stroke="#f43f5e"
                fill="url(#gViolations)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="border-t border-surface-border px-5 py-2.5 flex items-center gap-5 text-[11px]">
        <LegendDot color="#10b981" label="Events/min" />
        <LegendDot color="#f43f5e" label="Violations/min" />
        <span className="text-content-muted ml-auto">3 min rolling window</span>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "warn" | "neutral" }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-content-muted">{label}</p>
      <p className={`text-sm font-semibold tabular-nums mt-0.5 ${accent === "warn" ? "text-amber-400" : "text-content"}`}>
        {value}
      </p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-content-muted">
      <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
