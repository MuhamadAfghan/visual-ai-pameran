import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Wifi, WifiOff, Loader2 } from "lucide-react";
import { ConfidenceBadge } from "../../components/confidence-badge";
import { Skeleton } from "../../components/skeleton";
import { EmptyState } from "../../components/empty-state";
import { formatRelative } from "../../utils/formatDate";
import { useLiveViolations, type LiveViolation } from "./use-live-violations";
import { useRecentAlerts } from "./use-dashboard";
import { cn } from "../../utils/cn";
import { getEventConfidence, getEventCheckLabel, type DetectionEvent } from "../../types/event.types";
import { getEventById } from "../../services/event.service";
import type { Camera } from "../../types/camera.types";

type Props = {
  cameras: Camera[];
  onSelect: (ev: DetectionEvent) => void;
};

type FeedItem =
  | { source: "live"; data: LiveViolation }
  | { source: "polled"; data: DetectionEvent };

export function LiveViolationsFeed({ cameras, onSelect }: Props) {
  const navigate = useNavigate();
  const { events: liveEvents, status } = useLiveViolations();
  const { data: polledData, isLoading } = useRecentAlerts();

  const cameraMap = useMemo(
    () => new Map(cameras.map((c) => [c._id, c])),
    [cameras]
  );

  const feed = useMemo<FeedItem[]>(() => {
    const liveIds = new Set(liveEvents.map((e) => e.id));
    const polledFiltered = (polledData?.items ?? []).filter((e) => !liveIds.has(e._id));
    return [
      ...liveEvents.map((e): FeedItem => ({ source: "live", data: e })),
      ...polledFiltered.map((e): FeedItem => ({ source: "polled", data: e }))
    ].slice(0, 20);
  }, [liveEvents, polledData]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0 mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-content">Live Violations</h2>
          <StatusBadge status={status} />
        </div>
        <button
          onClick={() => navigate("/events")}
          className="text-xs text-primary hover:underline"
        >
          View All
        </button>
      </div>

      {/* Feed */}
      <div className="flex-1 min-h-0 space-y-1 overflow-y-auto">
        {isLoading && liveEvents.length === 0 ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 px-1 py-2">
              <Skeleton className="flex-shrink-0 w-16 h-10 rounded-lg" />
              <div className="flex-1 space-y-1.5 pt-0.5">
                <Skeleton height="0.7rem" width="65%" />
                <Skeleton height="0.7rem" width="45%" />
              </div>
            </div>
          ))
        ) : feed.length === 0 ? (
          <EmptyState icon={AlertTriangle} title="Tidak ada alert" description="Semua aman" />
        ) : (
          feed.map((item, idx) => (
            <FeedRow key={idx} item={item} cameraMap={cameraMap} onSelect={onSelect} />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Feed row ─────────────────────────────────────────────────────────────────

function FeedRow({
  item,
  cameraMap,
  onSelect
}: {
  item: FeedItem;
  cameraMap: Map<string, Camera>;
  onSelect: (ev: DetectionEvent) => void;
}) {
  const [loading, setLoading] = useState(false);
  const isLive = item.source === "live";

  const cameraId = item.data.cameraId;
  const cameraName =
    (isLive ? cameraMap.get(cameraId)?.name : (item.data as DetectionEvent).cameraName) ??
    cameraId;

  const checkName = isLive
    ? (item.data.violations[0]?.check ?? "Detection").replace(/_/g, " ")
    : getEventCheckLabel((item.data as DetectionEvent).checkResults);

  const confidence = isLive
    ? (item.data.violations[0]?.confidence ?? null)
    : getEventConfidence((item.data as DetectionEvent).checkResults);

  const detectedAt = item.data.detectedAt;

  const snapshotUrl = isLive
    ? item.data.snapshotUrl
    : (item.data as DetectionEvent).snapshotPath
      ? (item.data as DetectionEvent).snapshotUrl
      : null;

  async function handleClick() {
    if (loading) return;
    if (item.source === "polled") {
      onSelect(item.data);
      return;
    }
    // Live item: fetch full event to get detections + checkResults
    setLoading(true);
    try {
      const full = await getEventById(item.data.id);
      onSelect(full);
    } catch {
      // fallback: open with partial data
      const partial: DetectionEvent = {
        _id: item.data.id,
        cameraId: item.data.cameraId,
        cameraName: cameraMap.get(item.data.cameraId)?.name,
        checkResults: item.data.violations.map((v) => ({
          check: v.check,
          confidence: v.confidence,
          isViolation: true
        })),
        isViolation: true,
        status: "unacknowledged",
        snapshotUrl: item.data.snapshotUrl ?? undefined,
        detectedAt: item.data.detectedAt
      };
      onSelect(partial);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        "flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-surface-elevated transition-colors cursor-pointer relative",
        isLive && "border-l-2 border-primary/50",
        loading && "opacity-60 pointer-events-none"
      )}
    >
      {/* Thumbnail */}
      <div className="flex-shrink-0 w-16 h-10 overflow-hidden border rounded-lg bg-surface-elevated border-surface-border relative">
        {snapshotUrl ? (
          <img src={snapshotUrl} alt="" className="object-cover w-full h-full" />
        ) : (
          <div className="flex items-center justify-center w-full h-full">
            <AlertTriangle className="w-4 h-4 text-content-muted" />
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="w-4 h-4 text-white animate-spin" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <p className="text-xs font-medium truncate text-content">{cameraName}</p>
          {isLive && (
            <span className="text-[9px] font-bold text-primary bg-primary/10 px-1 rounded shrink-0">
              NEW
            </span>
          )}
        </div>
        <p className="text-[10px] text-content-secondary truncate">{checkName}</p>
        <div className="flex items-center gap-2 mt-1">
          <ConfidenceBadge value={confidence} />
          <span className="text-[10px] text-content-muted">{formatRelative(detectedAt)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "connecting" | "connected" | "disconnected" }) {
  if (status === "connected") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-green-500 font-medium">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex w-full h-full bg-green-500 rounded-full opacity-75 animate-ping" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
        </span>
        LIVE
      </span>
    );
  }
  if (status === "disconnected") {
    return (
      <span className="flex items-center gap-1 text-[10px] text-red-400">
        <WifiOff className="w-3 h-3" /> Reconnecting...
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-[10px] text-content-muted">
      <Wifi className="w-3 h-3" /> Connecting...
    </span>
  );
}
