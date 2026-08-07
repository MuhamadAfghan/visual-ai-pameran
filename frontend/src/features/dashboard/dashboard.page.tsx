import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Video, AlertTriangle, Eye, BellDot, RefreshCw } from "lucide-react";
import { StatCard } from "../../components/stat-card";
import { CameraGrid } from "./camera-grid";
import { LiveViolationsFeed } from "./live-violations-feed";
import { ViolationChart } from "./violation-chart";
import { EventDrawer } from "../events/event-drawer";
import { useDashboardStats, useCameraList, useDashboardTrend } from "./use-dashboard";
import { useAuth } from "../../app/auth-provider";
import type { DetectionEvent } from "../../types/event.types";

export function DashboardPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [drawerEvent, setDrawerEvent] = useState<DetectionEvent | null>(null);
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    refetch: refetchStats
  } = useDashboardStats();
  const {
    data: cameras,
    isLoading: camsLoading,
    isError: camsError,
    refetch: refetchCameras
  } = useCameraList();
  const {
    data: trend,
    isLoading: trendLoading,
    isError: trendError,
    refetch: refetchTrend
  } = useDashboardTrend(7);

  const hasError = statsError || camsError || trendError;

  function handleRetry() {
    if (statsError) refetchStats();
    if (camsError) refetchCameras();
    if (trendError) refetchTrend();
  }

  return (
    <div className="p-6 space-y-4">
      {/* ── Error banner ────────────────────────────────────── */}
      {hasError && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-red-500/30 bg-red-500/5 text-sm">
          <div className="flex items-center gap-2 text-red-500">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Gagal memuat data dashboard. Periksa koneksi atau coba lagi.</span>
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

      {/* ── Stat Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard
          icon={Video}
          color="sky"
          label="Kamera Online"
          value={statsLoading ? "—" : statsError ? "Error" : `${stats?.cameras.online ?? 0} / ${stats?.cameras.total ?? 0}`}
          sub="aktif / total"
          onClick={() => navigate("/cameras")}
        />
        <StatCard
          icon={AlertTriangle}
          color="amber"
          label="Violations Hari Ini"
          value={statsLoading ? "—" : statsError ? "Error" : (stats?.events.violations ?? 0)}
          sub="total hari ini"
          onClick={() => navigate("/events")}
        />
        <StatCard
          icon={Eye}
          color="violet"
          label="Deteksi Minggu Ini"
          value={statsLoading ? "—" : statsError ? "Error" : (stats?.events.thisWeek ?? 0)}
          sub="7 hari terakhir"
        />
        <StatCard
          icon={BellDot}
          color="rose"
          label="Belum Diakui"
          value={statsLoading ? "—" : statsError ? "Error" : (stats?.events.unacknowledged ?? 0)}
          sub="perlu tindakan"
          onClick={() => navigate("/events")}
        />
      </div>

      {/* ── Main content ────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
        {/* Left: camera grid + trend chart */}
        <div className="flex-1 min-w-0 space-y-5">
          <div className="bg-surface-panel border border-surface-border rounded-xl p-5">
            <CameraGrid cameras={cameras ?? []} loading={camsLoading} />
          </div>
          <ViolationChart data={trend} loading={trendLoading} />
        </div>

        {/* Right: live violations feed — stacks under the grid on small screens */}
        <div className="w-full lg:w-72 xl:w-80 lg:flex-shrink-0">
          <div className="bg-surface-panel border border-surface-border rounded-xl p-5 lg:sticky lg:top-20 h-[480px] lg:h-[calc(100vh-10rem)]">
            <LiveViolationsFeed cameras={cameras ?? []} onSelect={setDrawerEvent} />
          </div>
        </div>
      </div>

      <EventDrawer
        event={drawerEvent}
        token={token}
        onClose={() => setDrawerEvent(null)}
      />
    </div>
  );
}
