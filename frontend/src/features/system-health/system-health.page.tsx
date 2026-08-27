import {
  Database,
  Cpu,
  Activity,
  Camera,
  Bell,
  HardDrive,
  Radio,
  AlertTriangle
} from "lucide-react";
import { ComponentStatusCard } from "./component-status-card";
import { QueueStatCard } from "./queue-stat-card";
import { ThroughputChart } from "./throughput-chart";
import { CctvDonut } from "./cctv-donut";
import { SystemStatusBanner } from "./system-status-banner";
import { Sparkline } from "./sparkline";
import { useSystemHealth } from "./use-system-health";
import { LogPanel } from "./log-panel";
import { cn } from "../../utils/cn";

export function SystemHealthPage() {
  const { snapshot, history, logs, connected, error } = useSystemHealth();

  const processingSpark = history.map((h) => h.processingNow);
  const waitingSpark = history.map((h) => h.inferWaiting);
  const activeSpark = history.map((h) => h.inferActive);

  const totalCameras =
    (snapshot?.cameras.online ?? 0) +
    (snapshot?.cameras.offline ?? 0) +
    (snapshot?.cameras.maintenance ?? 0);
  const onlinePct = totalCameras > 0 ? Math.round(((snapshot?.cameras.online ?? 0) / totalCameras) * 100) : 0;

  return (
    <div className="min-h-screen bg-surface-base">
      {/* ─── Top bar ────────────────────────────────────────────────────── */}
      <header className="border-b border-surface-border bg-surface-panel/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1440px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10">
              <Radio className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-content tracking-tight">System Health</h1>
              <p className="text-[11px] text-content-muted">Realtime infrastructure monitor</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full",
                connected
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-rose-500/10 text-rose-400"
              )}
            >
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  connected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
                )}
              />
              {connected ? "LIVE" : "DISCONNECTED"}
            </span>
            <span className="text-[11px] text-content-muted tabular-nums">
              {snapshot ? new Date(snapshot.ts).toLocaleTimeString() : "—"}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-6 py-6 space-y-6">
        {/* ─── Status Banner ──────────────────────────────────────────── */}
        <SystemStatusBanner snapshot={snapshot} />

        {error && (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs text-amber-400">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ─── Hero: Throughput + CCTV Donut ──────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            <ThroughputChart history={history} snapshot={snapshot} />
          </div>

          <div className="bg-surface-panel border border-surface-border rounded-xl p-5 flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-content-muted font-semibold">
                  CCTV Fleet
                </p>
                <p className="text-2xl font-bold text-content tabular-nums mt-1 leading-none">
                  {totalCameras}
                  <span className="text-xs text-content-muted font-medium ml-2">cameras</span>
                </p>
              </div>
              <span className="text-[10px] font-semibold px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 tabular-nums">
                {onlinePct}% UP
              </span>
            </div>

            <div className="flex-1 flex items-center justify-center my-4">
              <CctvDonut
                segments={[
                  { label: "Online", value: snapshot?.cameras.online ?? 0, color: "#10b981" },
                  { label: "Offline", value: snapshot?.cameras.offline ?? 0, color: "#f43f5e" },
                  { label: "Maintenance", value: snapshot?.cameras.maintenance ?? 0, color: "#f59e0b" }
                ]}
                centerLabel={String(snapshot?.cameras.online ?? 0)}
                centerSubLabel="ONLINE"
              />
            </div>

            <div className="space-y-1.5">
              <LegendRow color="#10b981" label="Online" value={snapshot?.cameras.online ?? 0} />
              <LegendRow color="#f43f5e" label="Offline" value={snapshot?.cameras.offline ?? 0} />
              <LegendRow color="#f59e0b" label="Maintenance" value={snapshot?.cameras.maintenance ?? 0} />
            </div>
          </div>
        </div>

        {/* ─── Active Processing strip ────────────────────────────────── */}
        <div className="relative overflow-hidden bg-surface-panel border border-surface-border rounded-xl p-5">
          <div className="flex items-center justify-between gap-5 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-sky-500/10 ring-1 ring-sky-500/20">
                <Camera className="w-5 h-5 text-sky-400" />
                {(snapshot?.cameras.processingNow ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-sky-500 ring-2 ring-surface-panel animate-pulse" />
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-content-muted font-semibold">
                  Active Processing
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-3xl font-bold text-content tabular-nums leading-none">
                    {snapshot?.cameras.processingNow ?? 0}
                  </p>
                  <p className="text-xs text-content-muted">cameras live (last 60s)</p>
                </div>
              </div>
            </div>

            <div className="flex-1 min-w-[200px] max-w-md h-16">
              <Sparkline values={processingSpark} color="#0ea5e9" height={64} />
            </div>

            {snapshot?.events.lastEventAt && (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-content-muted">Last event</p>
                <p className="text-sm font-semibold text-content tabular-nums mt-0.5">
                  {new Date(snapshot.events.lastEventAt).toLocaleTimeString()}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ─── Components Grid ────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] uppercase tracking-widest text-content-muted font-semibold">
              Infrastructure Components
            </p>
            <span className="text-[10px] text-content-muted tabular-nums">
              {snapshot
                ? `${
                    Object.values(snapshot.components).filter((c) => c.status === "ok").length
                  } / 3 healthy`
                : "—"}
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <ComponentStatusCard
              icon={Database}
              label="MongoDB"
              status={snapshot?.components.mongodb.status ?? "down"}
              primaryValue={
                snapshot?.components.mongodb.latencyMs != null
                  ? `${snapshot.components.mongodb.latencyMs} ms`
                  : "—"
              }
              secondaryValue="ping"
            />
            <ComponentStatusCard
              icon={HardDrive}
              label="Redis"
              status={snapshot?.components.redis.status ?? "down"}
              primaryValue={
                snapshot?.components.redis.latencyMs != null
                  ? `${snapshot.components.redis.latencyMs} ms`
                  : "—"
              }
              secondaryValue="ping"
            />
            <ComponentStatusCard
              icon={Cpu}
              label="AI gRPC"
              status={snapshot?.components.aiGrpc.status ?? "down"}
              primaryValue={
                snapshot?.components.aiGrpc.latencyMs != null
                  ? `${snapshot.components.aiGrpc.latencyMs} ms`
                  : "—"
              }
              secondaryValue="inference"
            />
            <ComponentStatusCard
              icon={Activity}
              label="Inference Worker"
              status={snapshot?.workers.infer.status ?? "no_workers"}
              primaryValue={
                snapshot ? `${snapshot.workers.infer.count} active` : "—"
              }
              secondaryValue="bullmq"
              sparkValues={activeSpark}
            />
          </div>
        </section>

        {/* ─── Queue Grid ─────────────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] uppercase tracking-widest text-content-muted font-semibold">
              Queue Depth
            </p>
            <span className="text-[10px] text-content-muted tabular-nums">
              {snapshot
                ? `${snapshot.queues.infer.waiting + snapshot.queues.notification.waiting} jobs waiting`
                : "—"}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <QueueStatCard
              icon={Cpu}
              label="Inference"
              stats={snapshot?.queues.infer ?? emptyStats()}
              workerCount={snapshot?.workers.infer.count ?? 0}
              workerStatus={snapshot?.workers.infer.status ?? "no_workers"}
            />
            <QueueStatCard
              icon={Bell}
              label="Notification"
              stats={snapshot?.queues.notification ?? emptyStats()}
              workerCount={snapshot?.workers.notification.count ?? 0}
              workerStatus={snapshot?.workers.notification.status ?? "no_workers"}
            />
          </div>
        </section>

        {/* ─── Mini queue trend ───────────────────────────────────────── */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <MiniTrendCard
            label="Inference Queue Waiting"
            current={snapshot?.queues.infer.waiting ?? 0}
            values={waitingSpark}
            color="#f59e0b"
            unit="jobs"
          />
          <MiniTrendCard
            label="Inference Queue Active"
            current={snapshot?.queues.infer.active ?? 0}
            values={activeSpark}
            color="#0ea5e9"
            unit="running"
          />
        </section>

        {/* ─── System Log Panel ───────────────────────────────────── */}
        <LogPanel logs={logs} />

        <footer className="pt-2 pb-4 text-center">
          <p className="text-[10px] text-content-muted tracking-wider uppercase">
            Lumicore CCTV Detector · Backend Web Service
          </p>
        </footer>
      </main>
    </div>
  );
}

function emptyStats() {
  return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
}

function LegendRow({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
        <span className="text-content-secondary">{label}</span>
      </span>
      <span className="text-content font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function MiniTrendCard({
  label,
  current,
  values,
  color,
  unit
}: {
  label: string;
  current: number;
  values: number[];
  color: string;
  unit: string;
}) {
  return (
    <div className="bg-surface-panel border border-surface-border rounded-xl p-4">
      <div className="flex items-end justify-between mb-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-content-muted font-semibold">{label}</p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <p className="text-2xl font-bold text-content tabular-nums leading-none">{current}</p>
            <p className="text-[11px] text-content-muted">{unit}</p>
          </div>
        </div>
      </div>
      <div className="h-10">
        <Sparkline values={values} color={color} height={40} />
      </div>
    </div>
  );
}
