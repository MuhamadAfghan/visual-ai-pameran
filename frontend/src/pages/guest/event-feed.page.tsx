import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  ImageOff,
  Pause,
  Play,
  Hexagon,
  Boxes,
  Clock,
  Video,
  AlertTriangle,
  CheckCircle2,
  Filter as FilterIcon,
  X,
  Check,
  Gauge,
  MapPin,
  Cpu,
  ChevronRight,
} from "lucide-react";
import { getEvents } from "../../services/event.service";
import { getCameras } from "../../services/camera.service";
import { SnapshotWithBbox, detectionColor } from "../../components/snapshot-bbox";
import { formatDate, formatRelative } from "../../utils/formatDate";
import { getEventConfidence } from "../../types/event.types";
import { cn } from "../../utils/cn";
import type { DetectionEvent, CheckResult, Detection } from "../../types/event.types";
import type { Camera } from "../../types/camera.types";

type TimeRange = "1h" | "today" | "24h" | "7d" | "all";
type Severity = "all" | "violation" | "normal";

const TIME_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "1h", label: "1 Jam" },
  { value: "today", label: "Hari ini" },
  { value: "24h", label: "24 Jam" },
  { value: "7d", label: "7 Hari" },
  { value: "all", label: "Semua" },
];

function getTimeFrom(range: TimeRange): string | undefined {
  const now = new Date();
  switch (range) {
    case "1h":
      return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    case "today": {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start.toISOString();
    }
    case "24h":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    default:
      return undefined;
  }
}

export function EventFeedPage() {
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [selected, setSelected] = useState<DetectionEvent | null>(null);
  const [initialSelected, setInitialSelected] = useState(false);

  // Filters
  const [timeRange, setTimeRange] = useState<TimeRange>("1h");
  const [cameraFilter, setCameraFilter] = useState<string>("all");
  const [severity, setSeverity] = useState<Severity>("all");

  const prevIds = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  // Fetch cameras once for filter dropdown + thumbnail enrichment
  useEffect(() => {
    getCameras().then(setCameras).catch(() => undefined);
  }, []);

  // Build poll fn
  const poll = useCallback(async () => {
    try {
      const from = getTimeFrom(timeRange);
      const { items } = await getEvents({
        limit: 100,
        ...(from ? { from } : {}),
        ...(cameraFilter !== "all" ? { cameraId: cameraFilter } : {}),
        ...(severity === "violation" ? { isViolation: true } : {}),
        ...(severity === "normal" ? { isViolation: false } : {}),
      });

      const incomingIds = new Set(items.map((e) => e._id));
      const fresh = new Set<string>();
      incomingIds.forEach((id) => {
        if (!prevIds.current.has(id)) fresh.add(id);
      });
      prevIds.current = incomingIds;
      setNewIds(fresh);
      setEvents(items);
    } finally {
      setLoading(false);
    }
  }, [timeRange, cameraFilter, severity]);

  // Poll every 5s
  useEffect(() => {
    poll();
    if (paused) return;
    const id = setInterval(poll, 5_000);
    return () => clearInterval(id);
  }, [poll, paused]);

  // Reset auto-select when filters change
  useEffect(() => {
    setInitialSelected(false);
  }, [timeRange, cameraFilter, severity]);

  // Auto-select first event on initial load / filter change
  useEffect(() => {
    if (!initialSelected && events.length > 0) {
      setSelected(events[0]);
      setInitialSelected(true);
    }
  }, [events, initialSelected]);

  // Derived stats
  const stats = useMemo(() => {
    const total = events.length;
    const violations = events.filter((e) => e.isViolation).length;
    const uniqueCameras = new Set(events.map((e) => e.cameraId)).size;
    return { total, violations, uniqueCameras };
  }, [events]);

  const hasActiveFilter =
    timeRange !== "1h" || cameraFilter !== "all" || severity !== "all";

  function resetFilters() {
    setTimeRange("1h");
    setCameraFilter("all");
    setSeverity("all");
  }

  return (
    <div className="flex flex-col h-full">
      {/* STATS STRIP */}
      <div className="flex items-center gap-4 px-5 py-2 border-b border-surface-border bg-surface-panel text-xs flex-shrink-0">
        <span className="flex items-center gap-1.5">
          {!paused ? (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] font-bold text-red-400 font-mono uppercase tracking-wider leading-none">
                LIVE
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-content-muted/10 border border-surface-border">
              <span className="w-1.5 h-1.5 rounded-full bg-content-muted" />
              <span className="text-[10px] font-bold text-content-muted font-mono uppercase tracking-wider leading-none">
                PAUSED
              </span>
            </span>
          )}
        </span>

        <div className="w-px h-3 bg-surface-border" />

        <StatItem icon={<Activity className="w-3 h-3" />} label="Events" value={stats.total} />
        <div className="w-px h-3 bg-surface-border" />
        <StatItem
          icon={<AlertTriangle className="w-3 h-3" />}
          label="Violation"
          value={stats.violations}
          accent={stats.violations > 0 ? "text-red-400" : undefined}
          pulse={stats.violations > 0}
        />
        <div className="w-px h-3 bg-surface-border" />
        <StatItem
          icon={<Video className="w-3 h-3" />}
          label="Kamera"
          value={stats.uniqueCameras}
        />

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setPaused((p) => !p)}
            title={paused ? "Lanjutkan polling" : "Hentikan polling"}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider border border-surface-border text-content-muted hover:text-content hover:bg-surface-elevated transition-colors"
          >
            {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
            {paused ? "Resume" : "Pause"}
          </button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-surface-border flex-shrink-0 flex-wrap">
        {/* Time range pills */}
        <div className="flex items-stretch h-8 rounded-lg border border-surface-border bg-surface-elevated overflow-hidden">
          <span className="flex items-center gap-1 px-2.5 text-[10px] font-mono text-content-muted uppercase tracking-wider border-r border-surface-border bg-surface-panel/50">
            <Clock className="w-3 h-3" />
            Waktu
          </span>
          {TIME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTimeRange(opt.value)}
              className={cn(
                "flex items-center px-2.5 text-[11px] font-medium transition-colors border-r border-surface-border last:border-r-0",
                timeRange === opt.value
                  ? "bg-primary/15 text-primary"
                  : "text-content-muted hover:bg-surface-base hover:text-content"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Camera filter */}
        <div className="flex items-stretch h-8 rounded-lg border border-surface-border bg-surface-elevated overflow-hidden">
          <label className="flex items-center gap-1 px-2.5 text-[10px] font-mono text-content-muted uppercase tracking-wider border-r border-surface-border bg-surface-panel/50">
            <Video className="w-3 h-3" />
            Kamera
          </label>
          <select
            value={cameraFilter}
            onChange={(e) => setCameraFilter(e.target.value)}
            className="text-xs bg-transparent text-content pl-2 pr-6 focus:outline-none cursor-pointer min-w-[140px] h-full"
          >
            <option value="all">Semua Kamera</option>
            {cameras.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Severity pills */}
        <div className="flex items-stretch h-8 rounded-lg border border-surface-border bg-surface-elevated overflow-hidden">
          <span className="flex items-center gap-1 px-2.5 text-[10px] font-mono text-content-muted uppercase tracking-wider border-r border-surface-border bg-surface-panel/50">
            <FilterIcon className="w-3 h-3" />
            Jenis
          </span>
          {(
            [
              { value: "all", label: "Semua" },
              { value: "violation", label: "Violation", danger: true },
              { value: "normal", label: "Normal" },
            ] as { value: Severity; label: string; danger?: boolean }[]
          ).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSeverity(opt.value)}
              className={cn(
                "flex items-center px-2.5 text-[11px] font-medium transition-colors border-r border-surface-border last:border-r-0",
                severity === opt.value
                  ? opt.danger
                    ? "bg-red-500/15 text-red-400"
                    : "bg-primary/15 text-primary"
                  : "text-content-muted hover:bg-surface-base hover:text-content"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {hasActiveFilter && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 h-8 px-2 text-[11px] text-content-muted hover:text-content transition-colors"
          >
            <X className="w-3 h-3" />
            Reset
          </button>
        )}
      </div>

      {/* MAIN: list + detail */}
      <div className="flex flex-1 overflow-hidden">
        {/* LIST */}
        <div className="w-80 flex flex-col border-r border-surface-border flex-shrink-0 bg-surface-base">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-surface-border bg-surface-panel">
            <span className="text-xs font-semibold text-content">Daftar Event</span>
            <span className="text-[10px] text-content-muted font-mono">
              {events.length} ditampilkan
            </span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {loading ? (
              <div className="text-xs text-content-muted text-center py-12">Memuat event...</div>
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center text-center pt-12 gap-2 text-content-muted">
                <Activity className="w-8 h-8 opacity-20" />
                <p className="text-xs">Tidak ada event</p>
                <p className="text-[10px] opacity-70 px-4">
                  Coba ubah filter waktu atau pilih kamera lain
                </p>
                {hasActiveFilter && (
                  <button
                    onClick={resetFilters}
                    className="text-xs text-primary hover:underline mt-1"
                  >
                    Reset filter
                  </button>
                )}
              </div>
            ) : (
              events.map((ev) => (
                <EventListItem
                  key={ev._id}
                  event={ev}
                  onClick={() => setSelected(ev)}
                  isNew={newIds.has(ev._id)}
                  active={selected?._id === ev._id}
                />
              ))
            )}
          </div>
        </div>

        {/* DETAIL */}
        <div className="flex-1 overflow-y-auto bg-surface-base">
          {selected ? (
            <EventDetail event={selected} onClose={() => setSelected(null)} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-content-muted">
                <Activity className="w-10 h-10 opacity-20 mx-auto mb-3" />
                <p className="text-sm font-medium">Pilih event dari daftar di sebelah kiri</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Stat item in top strip ───────────────────────────────────────── */
function StatItem({
  icon,
  label,
  value,
  accent,
  pulse,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent?: string;
  pulse?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("text-content-muted", accent)}>{icon}</span>
      <span className="text-content-muted font-mono uppercase tracking-wider text-[10px]">
        {label}
      </span>
      <span
        className={cn(
          "font-mono font-bold",
          accent ?? "text-content",
          pulse && "animate-pulse"
        )}
      >
        {value}
      </span>
    </span>
  );
}

/* ── Compact event card in list ───────────────────────────────────── */
function EventListItem({
  event,
  onClick,
  isNew,
  active,
}: {
  event: DetectionEvent;
  onClick: () => void;
  isNew: boolean;
  active: boolean;
}) {
  const isViolation = event.isViolation;
  const confidence = getEventConfidence(event.checkResults);
  const checkName = event.checkResults?.[0]?.check.replace(/_/g, " ") ?? "—";
  const detCount = event.detections?.length ?? 0;
  const zoneCount = event.redZones?.length ?? 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex gap-2.5 p-2 rounded-lg border text-left transition-all relative overflow-hidden",
        "bg-surface-panel",
        active
          ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
          : "border-surface-border hover:border-primary/30 hover:bg-surface-elevated",
        isNew && "animate-[fadeSlideIn_0.3s_ease_forwards]"
      )}
    >
      {/* Severity stripe on left edge */}
      {isViolation && (
        <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-500" />
      )}

      {/* Thumbnail */}
      <div className="w-20 h-14 rounded overflow-hidden bg-black flex-shrink-0 border border-surface-border">
        {event.snapshotUrl ? (
          <img
            src={event.snapshotUrl}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-surface-elevated" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 leading-tight">
        {/* Row 1: violation pill + relative time */}
        <div className="flex items-center justify-between gap-1.5 mb-1">
          {isViolation ? (
            <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-red-500/20 text-red-400 uppercase tracking-wider leading-none">
              Violation
            </span>
          ) : (
            <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-400 uppercase tracking-wider leading-none">
              Normal
            </span>
          )}
          <span className="text-[10px] text-content-muted font-mono">
            {formatRelative(event.detectedAt)}
          </span>
        </div>

        {/* Row 2: check name */}
        <p className="text-xs font-semibold text-content truncate capitalize">
          {checkName}
        </p>

        {/* Row 3: camera + counts */}
        <div className="flex items-center justify-between gap-1.5 mt-1">
          <span className="text-[10px] text-content-muted truncate font-mono uppercase">
            {event.cameraCode ?? event.cameraName ?? "—"}
          </span>
          <div className="flex items-center gap-1.5 text-[10px] text-content-muted font-mono flex-shrink-0">
            {detCount > 0 && (
              <span className="flex items-center gap-0.5" title={`${detCount} deteksi`}>
                <Boxes className="w-2.5 h-2.5" />
                {detCount}
              </span>
            )}
            {zoneCount > 0 && (
              <span
                className="flex items-center gap-0.5 text-red-400/80"
                title={`${zoneCount} red zone`}
              >
                <Hexagon className="w-2.5 h-2.5" />
                {zoneCount}
              </span>
            )}
            {confidence !== null && (
              <span
                className={cn(
                  "font-bold tabular-nums",
                  isViolation ? "text-red-400" : "text-content-secondary"
                )}
              >
                {Math.round(confidence * 100)}%
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

/* ── Right side detail view ───────────────────────────────────────── */
function EventDetail({
  event,
  onClose,
}: {
  event: DetectionEvent;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const detections = event.detections ?? [];
  const redZones = event.redZones ?? [];
  const confidence = getEventConfidence(event.checkResults);
  const checkName = event.checkResults?.[0]?.check.replace(/_/g, " ") ?? "—";
  const isViolation = event.isViolation;
  const violationChecks = event.checkResults?.filter((r) => r.isViolation).length ?? 0;
  const totalChecks = event.checkResults?.length ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* HERO HEADER — large status + check + close */}
      <header
        className={cn(
          "relative flex items-center gap-3 px-6 py-3.5 border-b border-surface-border flex-shrink-0 bg-surface-panel overflow-hidden"
        )}
      >
        {/* subtle severity gradient bg */}
        {isViolation && (
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/8 via-red-500/3 to-transparent pointer-events-none" />
        )}

        {/* Icon */}
        <div
          className={cn(
            "relative flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0",
            isViolation
              ? "bg-red-500/15 text-red-400 border border-red-500/30"
              : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
          )}
        >
          {isViolation ? (
            <AlertTriangle className="w-5 h-5" />
          ) : (
            <CheckCircle2 className="w-5 h-5" />
          )}
        </div>

        {/* Title block */}
        <div className="relative min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider leading-none",
                isViolation
                  ? "bg-red-500 text-white"
                  : "bg-emerald-500/20 text-emerald-400"
              )}
            >
              {isViolation ? "Violation Detected" : "Normal"}
            </span>
            <span className="text-[10px] text-content-muted font-mono tabular-nums">
              {formatRelative(event.detectedAt)}
            </span>
          </div>
          <p className="text-base font-bold text-content capitalize leading-tight truncate">
            {checkName}
          </p>
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          title="Tutup detail"
          className="relative flex items-center justify-center w-8 h-8 rounded-lg border border-surface-border text-content-muted hover:text-content hover:bg-surface-elevated transition-colors flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </header>

      {/* SCROLLABLE BODY */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6 space-y-5">
          {/* HERO SNAPSHOT */}
          <div
            className={cn(
              "relative aspect-video rounded-2xl overflow-hidden bg-black border-2 transition-shadow",
              isViolation
                ? "border-red-500/30 shadow-[0_0_50px_-12px_rgba(239,68,68,0.35)]"
                : "border-surface-border"
            )}
          >
            {event.snapshotUrl ? (
              <SnapshotWithBbox
                src={event.originalSnapshotUrl ?? event.snapshotUrl}
                alt="Event snapshot"
                detections={detections}
                redZones={redZones}
                fit="contain"
                className="w-full h-full"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-content-muted gap-2">
                <ImageOff className="w-10 h-10 opacity-30" />
                <span className="text-sm">Tidak ada snapshot</span>
              </div>
            )}

            {/* TOP-LEFT: camera code + model name */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 pointer-events-none">
              <span className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono font-bold bg-black/60 text-white backdrop-blur-sm leading-none">
                <Video className="w-2.5 h-2.5" />
                {event.cameraCode ?? "—"}
              </span>
              {event.modelName && (
                <span className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono bg-black/50 text-white/80 backdrop-blur-sm leading-none">
                  <Cpu className="w-2.5 h-2.5" />
                  {event.modelName}
                </span>
              )}
            </div>

            {/* TOP-RIGHT: confidence ring */}
            {confidence !== null && (
              <div className="absolute top-3 right-3 pointer-events-none">
                <ConfidenceRing value={confidence} danger={isViolation} />
              </div>
            )}

            {/* BOTTOM gradient with timestamp + counts */}
            <div className="absolute inset-x-0 bottom-0 pointer-events-none">
              <div className="bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pt-12 pb-3">
                <div className="flex items-end justify-between gap-3">
                  <div className="flex items-center gap-3 text-white">
                    <p className="font-mono text-xs font-bold tracking-wide">
                      {formatDate(event.detectedAt)}
                    </p>
                    {detections.length > 0 && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/10 backdrop-blur-sm">
                        <Boxes className="w-2.5 h-2.5" />
                        {detections.length} obj
                      </span>
                    )}
                    {redZones.length > 0 && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-500/30 text-red-200 backdrop-blur-sm">
                        <Hexagon className="w-2.5 h-2.5" />
                        {redZones.length} zone
                      </span>
                    )}
                  </div>
                  <p className="font-mono text-[10px] text-white/50 uppercase tracking-wider">
                    {[event.areaName, event.sectionName].filter(Boolean).join(" › ") || ""}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* QUICK METRICS — borderless, big numbers */}
          <div className="grid grid-cols-3 gap-3">
            <Metric
              icon={<Boxes className="w-3.5 h-3.5" />}
              label="Objek"
              value={detections.length}
              hint={detections.length > 0 ? "Terdeteksi" : "Tidak ada"}
            />
            <Metric
              icon={<Hexagon className="w-3.5 h-3.5" />}
              label="Red Zone"
              value={redZones.length}
              hint={redZones.length > 0 ? "Aktif" : "Tidak ada"}
              accent={redZones.length > 0 ? "red" : undefined}
            />
            <Metric
              icon={<Gauge className="w-3.5 h-3.5" />}
              label="Confidence"
              value={confidence !== null ? `${Math.round(confidence * 100)}%` : "—"}
              hint={`${violationChecks}/${totalChecks} violation`}
              accent={isViolation ? "red" : "green"}
              bar={confidence ?? undefined}
            />
          </div>

          {/* LOCATION — clickable card linking to live camera */}
          <Section title="Lokasi Kejadian">
            <button
              onClick={() => navigate(`/guest/cameras/${event.cameraId}`)}
              className="w-full group flex items-center gap-3 p-3.5 rounded-xl border border-surface-border bg-surface-panel hover:border-primary/40 hover:bg-surface-elevated transition-all text-left"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary flex-shrink-0">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-content truncate">
                  {event.cameraName ?? event.cameraCode ?? "—"}
                </p>
                <p className="text-[11px] text-content-muted font-mono mt-0.5 truncate">
                  {[event.areaName, event.sectionName].filter(Boolean).join(" › ") || "—"}
                </p>
              </div>
              <span className="text-[10px] font-mono text-content-muted uppercase tracking-wider hidden sm:block">
                Live View
              </span>
              <ChevronRight className="w-4 h-4 text-content-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </button>
          </Section>

          {/* CHECK RESULTS — full rows with progress bars */}
          {event.checkResults?.length ? (
            <Section title={`Hasil Check (${event.checkResults.length})`}>
              <div className="space-y-1.5">
                {event.checkResults.map((r, i) => (
                  <CheckRow key={i} result={r} />
                ))}
              </div>
            </Section>
          ) : null}

          {/* DETECTIONS — chips colored by label (matching bbox colors) */}
          {detections.length > 0 && (
            <Section title={`Objek Terdeteksi (${detections.length})`}>
              <div className="flex flex-wrap gap-1.5">
                {detections.map((d, i) => (
                  <DetectionChip key={i} detection={d} />
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Detail helpers ───────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2.5">
        <h3 className="text-[10px] font-mono text-content-muted uppercase tracking-wider font-semibold">
          {title}
        </h3>
        <div className="flex-1 h-px bg-surface-border" />
      </div>
      {children}
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
  hint,
  accent,
  bar,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  accent?: "red" | "green";
  bar?: number;
}) {
  const accentClass =
    accent === "red"
      ? "text-red-400"
      : accent === "green"
        ? "text-emerald-400"
        : "text-content";
  const barClass =
    accent === "red"
      ? "bg-gradient-to-r from-amber-500 to-red-500"
      : accent === "green"
        ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
        : "bg-primary";

  return (
    <div className="relative bg-surface-panel rounded-xl p-3.5 border border-surface-border overflow-hidden">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={cn("text-content-muted", accent && accentClass)}>{icon}</span>
        <p className="text-[10px] uppercase tracking-wider text-content-muted font-mono leading-none">
          {label}
        </p>
      </div>
      <p className={cn("text-2xl font-bold font-mono leading-none", accentClass)}>{value}</p>
      {hint && (
        <p className="text-[10px] text-content-muted font-mono mt-1.5 leading-none">{hint}</p>
      )}
      {bar !== undefined && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-surface-elevated">
          <div
            className={cn("h-full transition-all duration-500", barClass)}
            style={{ width: `${Math.max(0, Math.min(1, bar)) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

function CheckRow({ result }: { result: CheckResult }) {
  const pct = Math.round(result.confidence * 100);
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-2.5 rounded-lg border transition-colors",
        result.isViolation
          ? "bg-red-500/5 border-red-500/30"
          : "bg-surface-panel border-surface-border"
      )}
    >
      <span
        className={cn(
          "flex items-center justify-center w-6 h-6 rounded-full flex-shrink-0",
          result.isViolation ? "bg-red-500 text-white" : "bg-emerald-500 text-white"
        )}
      >
        {result.isViolation ? <X className="w-3 h-3" /> : <Check className="w-3 h-3" />}
      </span>
      <span className="text-xs font-semibold text-content capitalize flex-1 truncate">
        {result.check.replace(/_/g, " ")}
      </span>
      <div className="hidden sm:block w-24 h-1.5 rounded-full bg-surface-elevated overflow-hidden flex-shrink-0">
        <div
          className={cn(
            "h-full transition-all duration-500",
            result.isViolation
              ? "bg-gradient-to-r from-amber-500 to-red-500"
              : "bg-gradient-to-r from-emerald-500 to-emerald-400"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={cn(
          "text-xs font-mono font-bold w-10 text-right tabular-nums",
          result.isViolation ? "text-red-400" : "text-content"
        )}
      >
        {pct}%
      </span>
    </div>
  );
}

function DetectionChip({ detection }: { detection: Detection }) {
  const inRedZone = detection.attributes?.in_red_zone === "true";
  const color = detectionColor(detection);
  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border bg-surface-panel transition-colors"
      style={{
        borderColor: inRedZone ? "rgba(239, 68, 68, 0.5)" : `${color}55`,
      }}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-xs font-medium text-content capitalize leading-none">
        {detection.label}
      </span>
      <span className="text-[10px] font-mono text-content-muted tabular-nums leading-none">
        {Math.round(detection.confidence * 100)}%
      </span>
      {inRedZone && (
        <span className="text-[10px] text-red-400 font-bold leading-none" title="In red zone">
          ⚠
        </span>
      )}
    </div>
  );
}

/* SVG ring showing confidence as a circle */
function ConfidenceRing({ value, danger }: { value: number; danger: boolean }) {
  const radius = 16;
  const stroke = 3;
  const c = 2 * Math.PI * radius;
  const offset = c - value * c;
  const color = danger ? "#ef4444" : "#22c55e";
  return (
    <div className="relative">
      <svg width="40" height="40" viewBox="0 0 40 40" className="drop-shadow-lg">
        <circle
          cx="20"
          cy="20"
          r={radius}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={stroke}
          fill="rgba(0,0,0,0.45)"
        />
        <circle
          cx="20"
          cy="20"
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 20 20)"
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-bold text-white tabular-nums">
        {Math.round(value * 100)}
      </span>
    </div>
  );
}
