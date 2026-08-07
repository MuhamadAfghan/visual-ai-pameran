import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Video,
  Bell,
  CheckCheck,
  Wifi,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Eye,
} from "lucide-react";
import { StatCard } from "../../components/stat-card";
import { ConfirmDialog } from "../../components/confirm-dialog";
import {
  usePicDashboardStats,
  usePicCameras,
  usePicRecentEvents,
  usePicPerformance,
} from "./use-pic-dashboard";
import { UrgentBanner } from "./urgent-banner";
import { PerformanceSummary } from "./performance-summary";
import { acknowledgeEvent, markFalsePositive } from "../../services/event.service";
import { EventDrawer } from "../events/event-drawer";
import type { Camera } from "../../types/camera.types";
import type { DetectionEvent, EventStatus } from "../../types/event.types";
import { useAuth } from "../../app/auth-provider";
import { useUiStore } from "../../store/ui.store";
import { cn } from "../../utils/cn";

const statusConfig: Record<EventStatus, { label: string; dot: string }> = {
  unacknowledged: { label: "Belum Diakui", dot: "bg-orange-500" },
  acknowledged: { label: "Diakui", dot: "bg-emerald-500" },
  false_positive: { label: "False Positive", dot: "bg-content-muted" }
};

function CameraCard({ camera, onClick }: { camera: Camera; onClick: () => void }) {
  const isOnline = camera.status === "online";
  return (
    <button
      onClick={onClick}
      className="text-left bg-surface-panel border border-surface-border rounded-xl overflow-hidden hover:border-primary/40 transition-colors group"
    >
      <div className="relative aspect-video bg-surface-elevated flex items-center justify-center">
        {camera.latestSnapshotUrl ? (
          <img
            src={camera.latestSnapshotUrl}
            alt={camera.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <Video className="w-8 h-8 text-content-muted" />
        )}
        <span
          className={cn(
            "absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
            isOnline
              ? "bg-emerald-500/20 text-emerald-400"
              : "bg-rose-500/20 text-rose-400"
          )}
        >
          {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {isOnline ? "Online" : "Offline"}
        </span>
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-content truncate">{camera.name}</p>
        <p className="text-xs text-content-muted mt-0.5">{camera.code}</p>
      </div>
    </button>
  );
}

export function PicDashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, token } = useAuth();
  const addToast = useUiStore((s) => s.addToast);
  const [drawerEvent, setDrawerEvent] = useState<DetectionEvent | null>(null);
  const [statusChangeTarget, setStatusChangeTarget] = useState<{ id: string; newStatus: EventStatus } | null>(null);

  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = usePicDashboardStats();
  const { data: cameras, isLoading: camsLoading, isError: camsError, refetch: refetchCams } = usePicCameras();
  const { data: eventsPage, isLoading: eventsLoading, isError: eventsError, refetch: refetchEvents } = usePicRecentEvents();
  const { data: performance, isLoading: perfLoading } = usePicPerformance(7);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["events", "pic-recent"] });
    queryClient.invalidateQueries({ queryKey: ["events", "pic-unack-count"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", "stats"] });
  }

  const ackMutation = useMutation({ mutationFn: acknowledgeEvent, onSettled: invalidateAll });
  const fpMutation = useMutation({ mutationFn: markFalsePositive, onSettled: invalidateAll });

  const hasError = statsError || camsError || eventsError;

  function handleRetry() {
    if (statsError) refetchStats();
    if (camsError) refetchCams();
    if (eventsError) refetchEvents();
  }

  const events = eventsPage?.items ?? [];
  const cameraList = cameras ?? [];
  const urgent = stats?.events.urgent ?? 0;
  const urgentThreshold = stats?.events.urgentThresholdMinutes ?? 30;
  const ackRateToday = stats?.events.ackRateToday;
  const today = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-content">
          Selamat datang, {user?.name?.split(" ")[0] ?? "PIC"} 👋
        </h1>
        <p className="text-sm text-content-muted mt-0.5">
          {today} · {stats?.cameras.total ?? 0} kamera Anda
        </p>
      </div>

      {/* Error banner */}
      {hasError && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/5 text-sm">
          <div className="flex items-center gap-2 text-red-500">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Gagal memuat data. Periksa koneksi atau coba lagi.</span>
          </div>
          <button
            onClick={handleRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Coba Lagi
          </button>
        </div>
      )}

      {/* Urgent banner */}
      <UrgentBanner count={urgent} thresholdMinutes={urgentThreshold} />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Video}
          label="Kamera Saya"
          value={statsLoading ? "—" : (stats?.cameras.total ?? 0)}
          sub={`${stats?.cameras.online ?? 0} online · ${stats?.cameras.offline ?? 0} offline`}
          color="sky"
        />
        <StatCard
          icon={Bell}
          label="Event Hari Ini"
          value={statsLoading ? "—" : (stats?.events.today ?? 0)}
          sub={
            ackRateToday != null
              ? `${stats?.events.acknowledgedToday ?? 0} ditanggapi`
              : "Belum ada data"
          }
          color="amber"
        />
        <StatCard
          icon={AlertTriangle}
          label="Belum Di-acknowledge"
          value={statsLoading ? "—" : (stats?.events.unacknowledged ?? 0)}
          sub={urgent > 0 ? `${urgent} urgent (>${urgentThreshold}m)` : "Aman"}
          color="rose"
          onClick={() => navigate("/events?status=unacknowledged")}
        />
        <StatCard
          icon={CheckCheck}
          label="Ack Rate Hari Ini"
          value={statsLoading ? "—" : ackRateToday != null ? `${ackRateToday}%` : "—"}
          sub="Target: 95%"
          color="emerald"
        />
      </div>

      {/* Two-column: events + performance */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent unacknowledged events */}
        <section className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-content">Antrian Tanggapi</h2>
            <button
              onClick={() => navigate("/events")}
              className="text-xs text-primary hover:underline"
            >
              Lihat semua
            </button>
          </div>
          <div className="bg-surface-panel border border-surface-border rounded-xl overflow-hidden">
            {eventsLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-lg bg-surface-elevated animate-pulse" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-content-muted">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                <p className="text-sm">Semua event sudah di-acknowledge</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border text-xs text-content-muted">
                    <th className="text-left px-4 py-2.5 font-medium">Kamera</th>
                    <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Waktu</th>
                    <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Pelanggaran</th>
                    <th className="text-left px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((ev) => {
                    const violations = ev.checkResults.filter((c) => c.isViolation);
                    return (
                      <tr
                        key={ev._id}
                        className="border-b border-surface-border last:border-0 hover:bg-surface-elevated/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium text-content">{ev.cameraName ?? ev.cameraId}</p>
                          <p className="text-xs text-content-muted">{ev.cameraCode}</p>
                        </td>
                        <td className="px-4 py-3 text-content-secondary hidden sm:table-cell whitespace-nowrap">
                          {new Date(ev.detectedAt).toLocaleString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="flex flex-wrap gap-1">
                            {violations.slice(0, 3).map((v) => (
                              <span
                                key={v.check}
                                className="px-1.5 py-0.5 rounded text-[10px] bg-rose-500/10 text-rose-400"
                              >
                                {v.check}
                              </span>
                            ))}
                            {violations.length > 3 && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-surface-elevated text-content-muted">
                                +{violations.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="relative inline-flex items-center">
                            <span
                              className={cn(
                                "absolute left-2.5 w-1.5 h-1.5 rounded-full pointer-events-none",
                                statusConfig[ev.status].dot
                              )}
                            />
                            <select
                              value={ev.status}
                              onChange={(e) =>
                                setStatusChangeTarget({
                                  id: ev._id,
                                  newStatus: e.target.value as EventStatus
                                })
                              }
                              className="text-xs font-medium pl-6 pr-7 py-1 rounded-md border border-surface-border bg-surface-panel text-content cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
                              style={{ backgroundImage: "none" }}
                            >
                              <option value="unacknowledged">Belum Diakui</option>
                              <option value="acknowledged">Diakui</option>
                              <option value="false_positive">False Positive</option>
                            </select>
                            <ChevronDown className="absolute right-2 w-3 h-3 text-content-muted pointer-events-none" />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setDrawerEvent(ev)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-content-secondary border border-surface-border hover:text-primary hover:border-primary/40 transition-colors"
                            title="Lihat detail"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Detail</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Performance summary */}
        <section className="lg:col-span-1">
          <PerformanceSummary data={performance} isLoading={perfLoading} />
        </section>
      </div>

      {/* Camera grid */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-content">Kamera Saya</h2>
          <button
            onClick={() => navigate("/cameras")}
            className="text-xs text-primary hover:underline"
          >
            Lihat semua
          </button>
        </div>
        {camsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="aspect-video rounded-xl bg-surface-elevated animate-pulse"
              />
            ))}
          </div>
        ) : cameraList.length === 0 ? (
          <p className="text-sm text-content-muted py-4 text-center">
            Belum ada kamera yang di-assign ke Anda
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {cameraList.slice(0, 8).map((cam) => (
              <CameraCard
                key={cam._id}
                camera={cam}
                onClick={() => navigate(`/cameras/${cam._id}/detail`)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Event detail drawer */}
      <EventDrawer
        event={drawerEvent}
        token={token}
        onClose={() => setDrawerEvent(null)}
      />

      {/* Status change confirm */}
      <ConfirmDialog
        open={!!statusChangeTarget}
        onClose={() => setStatusChangeTarget(null)}
        onConfirm={() => {
          if (!statusChangeTarget) return;
          const { id, newStatus } = statusChangeTarget;
          const mutation = newStatus === "acknowledged" ? ackMutation : fpMutation;
          mutation.mutate(id, {
            onSuccess: () => {
              const label = newStatus === "acknowledged" ? "diakui" : "ditandai false positive";
              addToast({ type: "success", message: `Event berhasil ${label}` });
              setStatusChangeTarget(null);
            },
            onError: () => addToast({ type: "error", message: "Gagal mengubah status event" })
          });
        }}
        title="Ubah Status Event"
        message={
          statusChangeTarget?.newStatus === "acknowledged"
            ? "Tandai event ini sebagai Diakui?"
            : statusChangeTarget?.newStatus === "false_positive"
              ? "Tandai event ini sebagai False Positive?"
              : ""
        }
        confirmLabel="Ya, Ubah"
        variant="primary"
        loading={ackMutation.isPending || fpMutation.isPending}
      />
    </div>
  );
}
