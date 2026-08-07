import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell
} from "recharts";
import { Download, TrendingUp, PieChart, Video } from "lucide-react";
import { PageHeader } from "../../components/page-header";
import { Skeleton } from "../../components/skeleton";
import { getDashboardTrend, getDashboardByType, getDashboardByCamera } from "../../services/dashboard.service";
import { exportEvents } from "../../services/event.service";
import { useUiStore } from "../../store/ui.store";

const DAY_OPTIONS = [
  { label: "7 Hari", value: 7 },
  { label: "14 Hari", value: 14 },
  { label: "30 Hari", value: 30 },
  { label: "90 Hari", value: 90 }
];

const BAR_COLORS = [
  "var(--primary)",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#0ea5e9"
];

export function ReportsPage() {
  const addToast = useUiStore((s) => s.addToast);
  const [days, setDays] = useState(30);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");
  const [exporting, setExporting] = useState(false);

  const { data: trend, isLoading: trendLoading } = useQuery({
    queryKey: ["dashboard", "trend", days],
    queryFn: () => getDashboardTrend(days)
  });

  const { data: byType, isLoading: byTypeLoading } = useQuery({
    queryKey: ["dashboard", "by-type", days],
    queryFn: () => getDashboardByType(days)
  });

  const { data: byCamera, isLoading: byCameraLoading } = useQuery({
    queryKey: ["dashboard", "by-camera", days],
    queryFn: () => getDashboardByCamera(days)
  });

  const trendChartData = (trend?.labels ?? []).map((label, i) => ({
    label,
    count: trend?.data[i] ?? 0
  }));

  const byTypeChartData = (byType ?? []).map((d) => ({
    ...d,
    label: d.checkName.replace(/_/g, " ")
  }));

  const byCameraChartData = (byCamera ?? []).map((d) => ({
    ...d,
    label: d.cameraCode ? `${d.cameraCode}` : d.cameraName
  }));

  async function handleExport() {
    setExporting(true);
    try {
      await exportEvents({
        isViolation: true,
        from: exportFrom || undefined,
        to: exportTo || undefined
      });
    } catch {
      addToast({ type: "error", message: "Gagal export data" });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader title="Detection Reports" description="Analisis tren dan distribusi pelanggaran">
        {/* Days selector */}
        <div className="flex items-center gap-1 p-1 bg-surface-elevated rounded-lg border border-surface-border">
          {DAY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                days === opt.value
                  ? "bg-primary text-primary-fg font-medium"
                  : "text-content-secondary hover:text-content"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </PageHeader>

      {/* ── Trend chart ──────────────────────────────────────────────────────── */}
      <div className="bg-surface-panel border border-surface-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-content">Tren Violations ({days} Hari Terakhir)</h2>
        </div>
        {trendLoading ? (
          <Skeleton className="w-full rounded-lg" height="200px" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trendChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "var(--content-muted)" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--content-muted)" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--surface-panel)",
                  borderColor: "var(--surface-border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                  color: "var(--content)"
                }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: "var(--primary)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── By type + by camera ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* By type */}
        <div className="bg-surface-panel border border-surface-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <PieChart className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-content">Violations per Tipe</h2>
          </div>
          {byTypeLoading ? (
            <Skeleton className="w-full rounded-lg" height="200px" />
          ) : byTypeChartData.length === 0 ? (
            <p className="text-sm text-content-muted text-center py-10">Tidak ada data</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={byTypeChartData}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "var(--content-muted)" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--content-muted)" }}
                  tickLine={false}
                  axisLine={false}
                  width={110}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--surface-panel)",
                    borderColor: "var(--surface-border)",
                    borderRadius: "8px",
                    fontSize: "12px"
                  }}
                  cursor={{ fill: "var(--surface-elevated)" }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {byTypeChartData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* By camera */}
        <div className="bg-surface-panel border border-surface-border rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Video className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-content">Violations per Kamera</h2>
          </div>
          {byCameraLoading ? (
            <Skeleton className="w-full rounded-lg" height="200px" />
          ) : byCameraChartData.length === 0 ? (
            <p className="text-sm text-content-muted text-center py-10">Tidak ada data</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={byCameraChartData}
                layout="vertical"
                margin={{ top: 0, right: 20, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-border)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: "var(--content-muted)" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--content-muted)" }}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--surface-panel)",
                    borderColor: "var(--surface-border)",
                    borderRadius: "8px",
                    fontSize: "12px"
                  }}
                  cursor={{ fill: "var(--surface-elevated)" }}
                  formatter={(v, _, p) => [v, p.payload.cameraName]}
                />
                <Bar dataKey="count" fill="var(--primary)" radius={[0, 4, 4, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Export ────────────────────────────────────────────────────────────── */}
      <div className="bg-surface-panel border border-surface-border rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Download className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-content">Export Data Violations</h2>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className={lbl}>Dari Tanggal</label>
            <input
              type="date"
              className={inp}
              value={exportFrom}
              onChange={(e) => setExportFrom(e.target.value)}
            />
          </div>
          <div>
            <label className={lbl}>Sampai Tanggal</label>
            <input
              type="date"
              className={inp}
              value={exportTo}
              onChange={(e) => setExportTo(e.target.value)}
            />
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-fg rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <Download className="w-4 h-4" />
            {exporting ? "Mengexport..." : "Export Excel"}
          </button>
          <p className="text-xs text-content-muted">Kosongkan tanggal untuk export semua data</p>
        </div>
      </div>
    </div>
  );
}

const lbl = "block text-xs font-medium text-content-secondary mb-1.5";
const inp =
  "px-3 py-2 text-sm border border-surface-border bg-surface-elevated text-content rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors";
