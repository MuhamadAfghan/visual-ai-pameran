import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useDeviceCamera } from "../../app/device-camera-provider";
import {
  ArrowLeft,
  Pencil,
  VideoOff,
  Eye,
  EyeOff,
  Network,
  Bell,
  Clock,
  MapPin,
  Wifi,
  Timer,
  TimerOff,
  ChevronRight,
  Maximize2,
  Info,
  RefreshCw,
  Cpu,
  CheckSquare,
  Activity,
  Mail,
  UserCheck,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  Hexagon
} from "lucide-react";
import { Modal } from "../../components/modal";
import { FullscreenViewer, SnapshotGrid } from "./camera-detail-parts";
import { LiveCameraView } from "./live-camera-view";
import { useLiveCameraStream } from "./use-live-camera-stream";
import { getCameraById } from "../../services/camera.service";
import { getMappings, type RoiPoint, type HandrailLine } from "../../services/mapping.service";
import { getEvents } from "../../services/event.service";
import { SnapshotWithBbox, detectionColor } from "../../components/snapshot-bbox";
import { StatusDot } from "../../components/status-dot";
import { Skeleton } from "../../components/skeleton";
import { getAreaName, getSectionName } from "../../types/camera.types";
import { formatRelative } from "../../utils/formatDate";
import { useAuth } from "../../app/auth-provider";
import { usePermission } from "../../hooks/use-permission";
import { cn } from "../../utils/cn";
import type { Detection, DetectionEvent } from "../../types/event.types";
import type { CameraPic } from "../../types/camera.types";
import { getEventConfidence } from "../../types/event.types";

const API_BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/v1`;

export function CameraDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { canUpdate, can } = usePermission();

  const [showBbox, setShowBbox] = useState(true);
  const [showRoi, setShowRoi] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [pinnedSnapshot, setPinnedSnapshot] = useState<DetectionEvent | null>(null);

  const devCam = useDeviceCamera();

  const { data: camera, isLoading } = useQuery({
    queryKey: ["cameras", id],
    queryFn: () => getCameraById(id!),
    enabled: !!id
  });

  const isDeviceCamera = camera?.sourceType === "device";
  const isPinned = !!pinnedSnapshot;
  const isLiveView = !isPinned && !!camera?.isActive;

  // Realtime detection channel — SSE (poll fallback for RTSP if it can't
  // connect; device cameras have no poll fallback, SSE-only).
  const liveState = useLiveCameraStream(id, isLiveView);

  const { data: latestEvents } = useQuery({
    queryKey: ["events", { cameraId: id, limit: 10 }],
    queryFn: () => getEvents({ cameraId: id!, limit: 10 }),
    enabled: !!id,
    staleTime: 30_000,
    refetchInterval: 30_000
  });

  // Ensure capture is running when viewing an active device camera. Does NOT
  // stop on unmount — the global auto-start in DeviceCameraProvider owns the
  // lifecycle. minCaptureGapSeconds defaults to 0 (push as fast as the
  // browser + AI round-trip allows) — see device-camera-provider.tsx.
  useEffect(() => {
    if (!camera || !isDeviceCamera || !camera.isActive) return;
    void devCam.startCapture(camera._id, camera.minCaptureGapSeconds ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera?._id, camera?.isActive, isDeviceCamera]);

  // Active mappings → ROI polygons to overlay on the live frame. Matches the
  // polygons inference actually uses (active + ≥3 points).
  const { data: mappings } = useQuery({
    queryKey: ["cameras", id, "mappings"],
    queryFn: () => getMappings(id!),
    enabled: !!id,
    staleTime: 30_000
  });

  const roiPolygons: RoiPoint[][] = useMemo(
    () =>
      (mappings ?? [])
        .filter((m) => m.isActive && Array.isArray(m.roiPolygon) && m.roiPolygon.length >= 3)
        .map((m) => m.roiPolygon),
    [mappings]
  );

  const stairsZones: RoiPoint[][] = useMemo(
    () =>
      (mappings ?? [])
        .filter((m) => m.isActive && Array.isArray(m.stairsZone) && m.stairsZone.length >= 3)
        .map((m) => m.stairsZone),
    [mappings]
  );

  const handrailPolylines: RoiPoint[][] = useMemo(
    () =>
      (mappings ?? [])
        .filter((m) => m.isActive && Array.isArray(m.handrailLines))
        .flatMap((m) => m.handrailLines)
        .map((l: HandrailLine) => l.points ?? [])
        .filter((pts) => pts.length >= 2),
    [mappings]
  );

  const roiEditTo = useMemo(() => {
    const list = mappings ?? [];
    const target =
      list.find((m) => m.isActive && Array.isArray(m.roiPolygon) && m.roiPolygon.length >= 3) ??
      list.find((m) => m.isActive) ??
      list[0];
    return target
      ? `/cameras/${id}/mappings/${target._id}/edit`
      : `/cameras/${id}/mappings/new`;
  }, [mappings, id]);

  // Pinned historical event replay — the only non-live moment now, for both
  // source types (device cameras get real live overlay too, same as RTSP).
  const historicalEvent = pinnedSnapshot;
  const historicalDetections: Detection[] = useMemo(
    () => historicalEvent?.detections ?? [],
    [historicalEvent]
  );
  const historicalRedZones = useMemo(() => historicalEvent?.redZones ?? [], [historicalEvent]);

  const pinnedSrc = pinnedSnapshot?.snapshotUrl
    ? `${API_BASE}/events/${pinnedSnapshot._id}/snapshot?variant=original&token=${encodeURIComponent(token ?? "")}`
    : null;

  const displayDetections = isLiveView ? liveState.detections : historicalDetections;

  function renderLiveView(fit: "cover" | "contain", className: string): React.ReactNode {
    if (!camera || !isLiveView) return null;
    const shared = {
      liveState,
      cameraName: camera.name,
      showBbox,
      showRoi,
      roiPolygons,
      stairsZones,
      handrailPolylines,
      fit,
      className
    };
    return isDeviceCamera ? (
      <LiveCameraView
        source="device"
        videoStream={devCam.stream}
        deviceError={devCam.error}
        onRetryDevice={() => void devCam.startCapture(camera._id, camera.minCaptureGapSeconds ?? 0)}
        deviceOwnershipExpected={can("cameras", "capture")}
        mirrored
        {...shared}
      />
    ) : (
      <LiveCameraView source="stream" {...shared} />
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-5xl p-6 mx-auto space-y-4">
        <Skeleton height="1.25rem" width="120px" />
        <Skeleton height="2rem" width="280px" />
        <Skeleton height="360px" />
      </div>
    );
  }

  if (!camera) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-500">Kamera tidak ditemukan.</p>
        <button
          onClick={() => navigate("/cameras")}
          className="mt-2 text-sm text-primary hover:underline"
        >
          Kembali
        </button>
      </div>
    );
  }

  const quickActions = (
    <div className="overflow-hidden border divide-y bg-surface-panel border-surface-border rounded-xl divide-surface-border">
      <p className="px-4 py-2.5 text-xs font-semibold text-content-muted uppercase tracking-wider">
        Aksi Cepat
      </p>
      <QuickButton icon={Info} label="Info Kamera" onClick={() => setShowInfoModal(true)} />
      <QuickLink to={`/cameras/${camera._id}/mappings`} icon={Network} label="Kelola Mappings" />
      <QuickLink to={`/events?cameraId=${camera._id}`} icon={Bell} label="Lihat Events" />
      {canUpdate("cameras") && (
        <QuickLink to={`/cameras/${camera._id}/edit`} icon={Pencil} label="Edit Kamera" />
      )}
    </div>
  );

  // Realtime analysis panel (violation status + check aggregates + detected
  // objects), driven by the SSE/poll hook. Shown only for RTSP-live.
  const liveAnalysis = (
    <div className="space-y-3">
      {liveState.violations.length > 0 ? (
        <div className="overflow-hidden border rounded-lg border-red-500/30 bg-red-500/5">
          <div className="px-3 py-1.5 border-b border-red-500/20 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            <p className="text-xs font-semibold text-red-500">Pelanggaran Terdeteksi</p>
            <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-500">
              {liveState.violations.length}
            </span>
          </div>
          <div className="divide-y divide-red-500/10">
            {liveState.violations.map((v, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                <span className="flex-1 text-xs text-content">{v.type.replace(/_/g, " ")}</span>
                {v.severity && (
                  <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded border border-red-500/30 text-red-500">
                    {v.severity}
                  </span>
                )}
                <span className="w-9 text-[11px] text-right text-content-muted">
                  {Math.round(v.score * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : liveState.status === "live" ? (
        <div className="flex items-center gap-2 px-4 py-2.5 border border-surface-border rounded-xl bg-surface-panel">
          <ShieldCheck className="w-4 h-4 text-green-500 shrink-0" />
          <span className="text-sm text-content-secondary">Tidak ada pelanggaran terdeteksi</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-2.5 border border-surface-border rounded-xl bg-surface-panel">
          {liveState.status === "error" ? (
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 text-content-muted shrink-0 animate-spin" />
          )}
          <span className="text-sm text-content-secondary">
            {liveState.error ?? "Menyiapkan live…"}
          </span>
        </div>
      )}

      {liveState.checkResults.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 border border-surface-border rounded-xl bg-surface-panel text-sm flex-wrap">
          <CheckSquare className="w-3.5 h-3.5 text-content-muted shrink-0" />
          <span className="text-content-muted text-xs">Checks</span>
          <div className="flex flex-wrap gap-1">
            {liveState.checkResults.map((cr) => (
              <span
                key={cr.check}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap border bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600"
              >
                {cr.check.replace(/_/g, " ")}
                <span className="font-bold text-content">{cr.value}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <DetectionList detections={liveState.detections} title="Objek Terdeteksi" />
    </div>
  );

  return (
    <div className="p-6 mx-auto space-y-5 ">
      <button
        onClick={() => navigate("/cameras")}
        className="flex items-center gap-2 text-sm transition-colors text-content-secondary hover:text-content"
      >
        <ArrowLeft className="w-4 h-4" />
        Kembali ke Cameras
      </button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <h1 className="text-2xl font-semibold text-content">{camera.name}</h1>
            <StatusDot status={camera.status} />
          </div>
          <p className="font-mono text-sm text-content-muted">{camera.code}</p>
        </div>
        {canUpdate("cameras") && (
          <Link
            to={`/cameras/${camera._id}/edit`}
            className="flex items-center gap-1.5 px-4 py-2 text-sm border border-surface-border rounded-lg text-content-secondary hover:bg-surface-elevated transition-colors shrink-0"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        {/* Main — video area */}
        <div className="space-y-3 lg:col-span-3">
          <div className="relative flex items-center justify-center overflow-hidden border aspect-video bg-surface-elevated border-surface-border rounded-xl">
            {!fullscreen && (
              <>
                {pinnedSnapshot ? (
                  <SnapshotWithBbox
                    src={pinnedSrc ?? ""}
                    alt={camera.name}
                    detections={showBbox ? historicalDetections : []}
                    redZones={showRoi ? historicalRedZones : []}
                    fit="cover"
                    className="w-full h-full"
                  />
                ) : !camera.isActive ? (
                  <Placeholder icon={VideoOff} text="Monitoring nonaktif" />
                ) : (
                  renderLiveView("cover", "w-full h-full")
                )}

                {/* Capture indicator (device camera) */}
                {isDeviceCamera && devCam.stream && (
                  <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-black/50 backdrop-blur-sm">
                    <span className="text-[10px] text-white/80">
                      {devCam.capturePending
                        ? "Mengirim..."
                        : devCam.lastCapture
                          ? `Capture: ${formatRelative(devCam.lastCapture.toISOString())}`
                          : "Menunggu..."}
                    </span>
                  </div>
                )}

                <button
                  onClick={() => setFullscreen(true)}
                  className="absolute top-2 right-2 p-1.5 rounded-md bg-black/50 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/70 transition-colors"
                  title="Perbesar"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>

          <FullscreenViewer
            open={fullscreen}
            onClose={() => setFullscreen(false)}
            cameraName={camera.name}
            cameraCode={camera.code}
            snapshotSrc={pinnedSnapshot ? pinnedSrc : null}
            detections={historicalDetections}
            redZones={historicalRedZones}
            liveView={renderLiveView("contain", "w-[92vw] h-[85vh] rounded-xl")}
          />

          {/* Overlay toggles — apply to whichever view is active */}
          <div className="space-y-3">
            <div className="border border-surface-border rounded-xl bg-surface-panel divide-y divide-surface-border">
              <div className="flex items-center justify-between px-4 py-2.5 gap-3">
                <div className="flex items-center min-w-0 gap-2">
                  {showBbox ? (
                    <Eye className="w-4 h-4 text-primary shrink-0" />
                  ) : (
                    <EyeOff className="w-4 h-4 text-content-muted shrink-0" />
                  )}
                  <span className="text-sm truncate text-content">Bounding Box</span>
                  {displayDetections.length === 0 && (
                    <span className="text-xs text-content-muted shrink-0">(belum ada)</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {pinnedSnapshot && (
                    <button
                      onClick={() => setPinnedSnapshot(null)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Live
                    </button>
                  )}
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={showBbox}
                      onChange={(e) => setShowBbox(e.target.checked)}
                    />
                    <div className="w-10 h-6 bg-surface-border rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between px-4 py-2.5 gap-3">
                <div className="flex items-center min-w-0 gap-2">
                  <Hexagon
                    className={cn(
                      "w-4 h-4 shrink-0",
                      showRoi && roiPolygons.length > 0 ? "text-indigo-400" : "text-content-muted"
                    )}
                  />
                  <span className="text-sm truncate text-content">Area ROI</span>
                  <span className="text-xs text-content-muted shrink-0">
                    {roiPolygons.length > 0 ? `(${roiPolygons.length})` : "(belum ada)"}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    to={roiEditTo}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border border-surface-border text-content-secondary hover:bg-surface-elevated hover:text-content transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit ROI
                  </Link>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={showRoi}
                      onChange={(e) => setShowRoi(e.target.checked)}
                    />
                    <div className="w-10 h-6 bg-surface-border rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
                  </label>
                </div>
              </div>
            </div>

            {/* Model / check / confidence info — pinned/device history only */}
            {historicalEvent && (historicalEvent.modelName || historicalEvent.checkResults?.length > 0) && (
              <div className="flex items-center gap-3 px-4 py-2.5 border border-surface-border rounded-xl bg-surface-panel text-sm flex-wrap">
                {historicalEvent.modelName && (
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Cpu className="w-3.5 h-3.5 text-content-muted shrink-0" />
                    <span className="text-content-muted text-xs">Model</span>
                    <span className="text-content font-medium truncate">{historicalEvent.modelName}</span>
                  </div>
                )}
                {historicalEvent.checkResults?.length > 0 && (
                  <>
                    {historicalEvent.modelName && <span className="text-surface-border select-none">·</span>}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <CheckSquare className="w-3.5 h-3.5 text-content-muted shrink-0" />
                      <span className="text-content-muted text-xs">Checks</span>
                      <div className="flex flex-wrap gap-1">
                        {historicalEvent.checkResults.map((cr) => (
                          <span
                            key={cr.check}
                            className={cn(
                              "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap border",
                              cr.isViolation
                                ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-400 dark:border-red-800"
                                : "bg-zinc-100 text-zinc-600 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-600"
                            )}
                          >
                            {cr.check.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                {getEventConfidence(historicalEvent.checkResults) != null && (
                  <>
                    <span className="text-surface-border select-none">·</span>
                    <div className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5 text-content-muted shrink-0" />
                      <span className="text-content-muted text-xs">Confidence</span>
                      <span className="text-content font-medium">
                        {Math.round(getEventConfidence(historicalEvent.checkResults)! * 100)}%
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {historicalEvent && (
              <DetectionList
                detections={historicalDetections}
                title="Hasil Analisa"
                detectedAt={historicalEvent.detectedAt}
                isViolation={historicalEvent.isViolation}
              />
            )}

            {isLiveView && quickActions}
          </div>
        </div>

        {/* Right — realtime analysis (live) OR snapshots + quick links */}
        <div className="space-y-4">
          {isLiveView ? (
            liveAnalysis
          ) : (
            <>
              <div className="overflow-hidden border bg-surface-panel border-surface-border rounded-xl">
                <p className="px-4 py-2.5 text-xs font-semibold text-content-muted uppercase tracking-wider border-b border-surface-border">
                  10 Snapshot Terbaru
                </p>
                <SnapshotGrid
                  events={latestEvents?.items ?? []}
                  apiBase={API_BASE}
                  token={token}
                  selectedId={pinnedSnapshot?._id ?? null}
                  onSelect={(ev) => {
                    const isFirst = ev._id === latestEvents?.items[0]?._id;
                    setPinnedSnapshot(isFirst ? null : ev);
                  }}
                />
              </div>

              <CameraPicsCard pics={camera.defaultPicIds} />

              {quickActions}
            </>
          )}
        </div>
      </div>

      <Modal open={showInfoModal} onClose={() => setShowInfoModal(false)} title="Info Kamera">
        <div className="space-y-3">
          <InfoRow icon={MapPin} label="Area" value={getAreaName(camera)} />
          <InfoRow icon={Network} label="Section" value={getSectionName(camera)} />
          <InfoRow icon={Wifi} label="Brand" value={camera.brand || "—"} />
          <InfoRow
            icon={camera.isActive ? Timer : TimerOff}
            label="Monitoring"
            value={camera.isActive ? "Aktif · realtime" : "Nonaktif"}
            valueClass={camera.isActive ? "text-green-500" : "text-content-muted"}
          />
          <InfoRow
            icon={Clock}
            label="Capture terakhir"
            value={camera.lastCaptureAt ? formatRelative(camera.lastCaptureAt) : "—"}
          />
          {(camera.activeMappingCount ?? 0) > 0 && (
            <InfoRow
              icon={Network}
              label="Model aktif"
              value={`${camera.activeMappingCount} mapping`}
            />
          )}
          <InfoRow
            icon={UserCheck}
            label="PIC"
            value={
              camera.defaultPicIds && camera.defaultPicIds.length > 0
                ? `${camera.defaultPicIds.length} orang`
                : "Belum di-assign"
            }
            valueClass={
              !camera.defaultPicIds || camera.defaultPicIds.length === 0
                ? "text-content-muted"
                : undefined
            }
          />
          {camera.notes && (
            <div className="pt-3 border-t border-surface-border">
              <p className="text-xs text-content-muted mb-0.5">Catatan</p>
              <p className="text-sm text-content">{camera.notes}</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const PIC_AVATAR_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-cyan-500",
  "bg-pink-500"
];

function picAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PIC_AVATAR_COLORS[Math.abs(hash) % PIC_AVATAR_COLORS.length];
}

function CameraPicsCard({ pics }: { pics?: Array<CameraPic | string> }) {
  const populated = (pics ?? []).filter(
    (p): p is CameraPic => typeof p === "object" && p !== null && "name" in p
  );

  return (
    <div className="overflow-hidden border bg-surface-panel border-surface-border rounded-xl">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-border">
        <p className="text-xs font-semibold text-content-muted uppercase tracking-wider">
          PIC
        </p>
        {populated.length > 0 && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-surface-elevated text-content-muted">
            {populated.length}
          </span>
        )}
      </div>
      {populated.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 px-4 py-6 text-content-muted">
          <UserCheck className="w-6 h-6 opacity-40" />
          <p className="text-xs">Belum ada PIC ter-assign</p>
        </div>
      ) : (
        <ul className="divide-y divide-surface-border">
          {populated.map((p) => (
            <li
              key={p._id}
              className="flex items-center gap-3 px-4 py-2.5"
            >
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0",
                  picAvatarColor(p.name)
                )}
              >
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-content truncate leading-tight">
                  {p.name}
                </p>
                <a
                  href={`mailto:${p.email}`}
                  className="flex items-center gap-1 text-[11px] text-content-muted hover:text-primary transition-colors truncate mt-0.5"
                  title={p.email}
                >
                  <Mail className="w-2.5 h-2.5 flex-shrink-0" />
                  <span className="truncate">{p.email}</span>
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Placeholder({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 text-content-muted">
      <Icon className="w-10 h-10 opacity-30" />
      <p className="text-xs">{text}</p>
    </div>
  );
}

// Per-object detection list (label + confidence bar). Shared by historical
// ("Hasil Analisa") and live ("Objek Terdeteksi"). Renders nothing when empty.
function DetectionList({
  detections,
  title,
  detectedAt,
  isViolation
}: {
  detections: Detection[];
  title: string;
  detectedAt?: string;
  isViolation?: boolean;
}) {
  if (detections.length === 0) return null;
  return (
    <div className="overflow-hidden border border-surface-border rounded-xl bg-surface-panel">
      <div className="px-4 py-2.5 border-b border-surface-border flex items-center justify-between">
        <p className="text-sm font-medium text-content">
          {title}
          {detectedAt && (
            <span className="ml-2 text-xs font-normal text-content-muted">
              · {formatRelative(detectedAt)}
            </span>
          )}
        </p>
        {isViolation && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-500">
            PELANGGARAN
          </span>
        )}
      </div>
      <div className="divide-y divide-surface-border">
        {detections.map((det, i) => {
          const color = detectionColor(det);
          const pct =
            det.confidence != null && !isNaN(det.confidence)
              ? Math.round(det.confidence * 100)
              : null;
          return (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="flex-1 text-sm text-content">{det.label}</span>
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: pct != null ? `${pct}%` : "0%", backgroundColor: color }}
                  />
                </div>
                <span className="w-8 text-xs text-right text-content-muted">
                  {pct != null ? `${pct}%` : "—"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  valueClass
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-3.5 h-3.5 text-content-muted mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-content-muted">{label}</p>
        <p className={cn("text-sm text-content truncate", valueClass)}>{value}</p>
      </div>
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  label
}: {
  to: string;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-2.5 text-sm text-content-secondary hover:bg-surface-elevated hover:text-content transition-colors"
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">{label}</span>
      <ChevronRight className="w-3.5 h-3.5 text-content-muted" />
    </Link>
  );
}

function QuickButton({
  icon: Icon,
  label,
  onClick
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-content-secondary hover:bg-surface-elevated hover:text-content transition-colors"
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      <ChevronRight className="w-3.5 h-3.5 text-content-muted" />
    </button>
  );
}
