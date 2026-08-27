import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  VideoOff,
  Eye,
  EyeOff,
  Hexagon,
  Activity,
  Timer,
} from "lucide-react";
import { getCameraById } from "../../services/camera.service";
import { getEvents } from "../../services/event.service";
import { SnapshotWithBbox } from "../../components/snapshot-bbox";
import { LiveCameraView } from "../../features/cameras/live-camera-view";
import { useLiveCameraStream } from "../../features/cameras/use-live-camera-stream";
import { GuestEventCard } from "../../features/guest/event-card";
import { useGuestTheme } from "../../layouts/guest-theme";
import { useDeviceCamera } from "../../app/device-camera-provider";
import { usePermission } from "../../hooks/use-permission";
import { getAreaName, getSectionName } from "../../types/camera.types";
import { formatRelative } from "../../utils/formatDate";
import { cn } from "../../utils/cn";
import type { Camera } from "../../types/camera.types";
import type { DetectionEvent } from "../../types/event.types";

const STATUS_PILL: Record<Camera["status"], { color: string; label: string }> = {
  online: { color: "bg-red-500 text-white", label: "LIVE" },
  offline: { color: "bg-zinc-600 text-zinc-200", label: "OFFLINE" },
  maintenance: { color: "bg-amber-500 text-amber-950", label: "MAINTENANCE" },
};

export function CameraViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isDark } = useGuestTheme();
  const devCam = useDeviceCamera();
  const { can } = usePermission();

  const [camera, setCamera] = useState<Camera | null>(null);
  const [events, setEvents] = useState<DetectionEvent[]>([]);
  const [selected, setSelected] = useState<DetectionEvent | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date>(new Date());

  const isViewingEvent = !!selected;
  const isDeviceCamera = camera?.sourceType === "device";
  const isActiveDevice = isDeviceCamera && devCam.activeCameraId === camera?._id;
  const isLiveView = !isViewingEvent && !!camera?.isActive;

  const liveState = useLiveCameraStream(id, isLiveView);

  // Guest is a legitimate capture source too (e.g. a kiosk screen with its own
  // webcam) — request/keep the local camera running for an active device
  // camera, same as the operator dashboard's camera-detail page. No-ops
  // safely if this session lacks cameras:capture (see device-camera-provider).
  useEffect(() => {
    if (!camera || !isDeviceCamera || !camera.isActive) return;
    void devCam.startCapture(camera._id, camera.minCaptureGapSeconds ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera?._id, camera?.isActive, isDeviceCamera]);

  // Live clock for fullscreen / metadata strip
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!id) return;

    async function loadInitial() {
      const [cam, { items }] = await Promise.all([
        getCameraById(id!),
        getEvents({ cameraId: id!, limit: 30 }),
      ]);
      setCamera(cam);
      setEvents(items);
      setLoading(false);
    }
    loadInitial();

    const iv = setInterval(async () => {
      const { items } = await getEvents({ cameraId: id, limit: 30 });
      setEvents(items);
    }, 10_000);
    return () => clearInterval(iv);
  }, [id]);

  if (loading || !camera) {
    return (
      <div className="flex items-center justify-center h-full text-content-muted text-sm">
        Memuat kamera...
      </div>
    );
  }

  const pill = STATUS_PILL[camera.status];
  const zoneCount = camera.redZones?.length ?? 0;

  const displayDetections =
    !showOverlay || !isViewingEvent ? [] : (selected?.detections ?? []);
  const displayRedZones =
    !showOverlay || !isViewingEvent
      ? []
      : (selected?.redZones ?? camera.redZones ?? []);
  const roiOverlayPolygons = showOverlay ? (camera.redZones ?? []).map((z) => z.points) : [];

  const overlayInfoText =
    isViewingEvent || !isLiveView ? null : `${liveState.detections.length} obj terdeteksi`;

  const liveViewNode = isLiveView && (
    isDeviceCamera ? (
      <LiveCameraView
        source="device"
        videoStream={isActiveDevice ? devCam.stream : null}
        deviceError={devCam.error}
        onRetryDevice={() => void devCam.startCapture(camera._id, camera.minCaptureGapSeconds ?? 0)}
        deviceOwnershipExpected={can("cameras", "capture")}
        mirrored
        liveState={liveState}
        cameraName={camera.name}
        showBbox={showOverlay}
        showRoi={showOverlay}
        roiPolygons={roiOverlayPolygons}
        stairsZones={[]}
        handrailPolylines={[]}
        fit="contain"
        className="w-full h-full"
      />
    ) : (
      <LiveCameraView
        source="stream"
        liveState={liveState}
        cameraName={camera.name}
        showBbox={showOverlay}
        showRoi={showOverlay}
        roiPolygons={roiOverlayPolygons}
        stairsZones={[]}
        handrailPolylines={[]}
        fit="contain"
        className="w-full h-full"
      />
    )
  );

  return (
    <div
      className={cn(
        "flex h-full",
        fullscreen && ["fixed inset-0 z-50 bg-black guest-mode", isDark ? "dark" : ""].join(" ")
      )}
    >
      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* TOP BAR */}
        {!fullscreen && (
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-surface-border flex-shrink-0 bg-surface-panel">
            <button
              onClick={() => navigate("/guest/cameras")}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-content-muted hover:text-content hover:bg-surface-elevated transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Camera Wall
            </button>

            <div className="w-px h-5 bg-surface-border" />

            <span
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold leading-none tracking-wider",
                pill.color
              )}
            >
              {camera.status === "online" && (
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              )}
              {pill.label}
            </span>

            <div>
              <p className="text-sm font-semibold text-content uppercase tracking-wide leading-none">
                {camera.name}
              </p>
              <p className="text-[10px] font-mono text-content-muted mt-1 leading-none">
                {camera.code} · {getAreaName(camera)} · {getSectionName(camera)}
              </p>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setShowOverlay((v) => !v)}
                title="Toggle ROI overlay"
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium border transition-colors",
                  showOverlay
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-surface-border text-content-muted hover:bg-surface-elevated"
                )}
              >
                {showOverlay ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                ROI
              </button>
              <button
                onClick={() => setFullscreen(true)}
                title="Fullscreen"
                className="flex items-center justify-center w-8 h-8 rounded border border-surface-border text-content-muted hover:text-content hover:bg-surface-elevated transition-colors"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* MAIN VIEW */}
        <div className="relative flex-1 bg-black overflow-hidden">
          {isViewingEvent ? (
            // Replay mode: snapshot + bbox overlay
            <SnapshotWithBbox
              src={selected?.originalSnapshotUrl ?? selected?.snapshotUrl ?? ""}
              alt={camera.name}
              detections={displayDetections}
              redZones={displayRedZones}
              fit="contain"
              className="w-full h-full"
            />
          ) : !camera.isActive ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/30">
              <VideoOff className="w-12 h-12 opacity-50" />
              <p className="text-xs">Monitoring nonaktif</p>
            </div>
          ) : (
            liveViewNode
          )}

          {/* HUD: top-left status */}
          <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
            <span
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold leading-none tracking-wider backdrop-blur-sm",
                isViewingEvent
                  ? "bg-amber-500/90 text-amber-950"
                  : pill.color + "/90"
              )}
            >
              {!isViewingEvent && camera.status === "online" && (
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              )}
              {isViewingEvent ? "REPLAY" : pill.label}
            </span>
            {overlayInfoText && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-black/50 text-white/80 backdrop-blur-sm leading-none">
                {overlayInfoText}
              </span>
            )}
            {fullscreen && (
              <span className="font-mono text-white font-bold uppercase tracking-wider text-sm drop-shadow-lg">
                {camera.name}
              </span>
            )}
          </div>

          {/* HUD: timestamp bottom-right */}
          <div className="absolute bottom-3 right-3 font-mono text-[11px] text-white/60 bg-black/40 px-2 py-1 rounded backdrop-blur-sm pointer-events-none">
            {isViewingEvent && selected
              ? new Date(selected.detectedAt).toLocaleString("id-ID")
              : now.toLocaleString("id-ID")}
          </div>

          {/* Replay banner */}
          {isViewingEvent && (
            <div className="absolute top-3 right-3 pointer-events-auto">
              <button
                onClick={() => setSelected(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-colors"
              >
                ← Kembali ke Live
              </button>
            </div>
          )}

          {/* Exit fullscreen */}
          {fullscreen && (
            <button
              onClick={() => setFullscreen(false)}
              className="absolute top-3 right-3 p-2 rounded bg-white/10 hover:bg-white/20 text-white transition-colors backdrop-blur-sm"
              title="Keluar fullscreen"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* METADATA STRIP */}
        {!fullscreen && (
          <div className="flex items-center gap-6 px-4 py-2 border-t border-surface-border bg-surface-panel text-xs flex-shrink-0">
            <MetaItem
              icon={<Timer className="w-3.5 h-3.5" />}
              label="Capture"
              value={camera.minCaptureGapSeconds ? `${camera.minCaptureGapSeconds}s` : "Realtime"}
            />
            <MetaItem
              icon={<Activity className="w-3.5 h-3.5" />}
              label="Last capture"
              value={camera.lastCaptureAt ? formatRelative(camera.lastCaptureAt) : "—"}
            />
            <MetaItem
              icon={<Hexagon className="w-3.5 h-3.5" />}
              label="Red zones"
              value={zoneCount.toString()}
              accent={zoneCount > 0 ? "text-red-400" : undefined}
            />
            <MetaItem
              icon={<Activity className="w-3.5 h-3.5" />}
              label="Events (30 terakhir)"
              value={events.length.toString()}
            />
          </div>
        )}
      </div>

      {/* RIGHT PANEL: events */}
      {!fullscreen && (
        <aside className="w-80 flex flex-col border-l border-surface-border flex-shrink-0 bg-surface-base">
          <div className="px-4 py-3 border-b border-surface-border bg-surface-panel">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold text-content">Riwayat Event</p>
            </div>
            <p className="text-[10px] text-content-muted mt-0.5 font-mono">
              30 terbaru · refresh 10 detik
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {events.length === 0 ? (
              <div className="flex flex-col items-center text-center pt-10 gap-2 text-content-muted">
                <Activity className="w-8 h-8 opacity-20" />
                <p className="text-xs">Belum ada event untuk kamera ini</p>
              </div>
            ) : (
              events.map((ev) => (
                <GuestEventCard
                  key={ev._id}
                  event={ev}
                  onClick={() => setSelected(ev)}
                  active={selected?._id === ev._id}
                />
              ))
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function MetaItem({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-content-muted">{icon}</span>
      <div className="leading-tight">
        <p className="text-[9px] text-content-muted uppercase tracking-wider font-mono">{label}</p>
        <p className={cn("text-xs font-mono font-semibold text-content", accent)}>{value}</p>
      </div>
    </div>
  );
}
