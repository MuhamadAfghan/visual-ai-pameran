import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { ConfidenceBadge } from "../../components/confidence-badge";
import { Skeleton } from "../../components/skeleton";
import { EmptyState } from "../../components/empty-state";
import { EventLightbox } from "../events/event-lightbox";
import { formatRelative } from "../../utils/formatDate";
import { getEventConfidence, getEventCheckLabel, type DetectionEvent } from "../../types/event.types";

type Props = {
  events: DetectionEvent[];
  loading: boolean;
  title?: string;
  cameraId?: string | null;
};

export function RecentAlerts({ events, loading, title = "Recent Alerts", cameraId }: Props) {
  const navigate = useNavigate();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  function handleViewAll() {
    const path = cameraId ? `/events?cameraId=${cameraId}` : "/events";
    navigate(path);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between flex-shrink-0 mb-3">
        <h2 className="text-sm font-semibold text-content">{title}</h2>
        <button
          onClick={handleViewAll}
          className="text-xs text-primary hover:underline"
        >
          View All
        </button>
      </div>

      <div className="flex-1 min-h-0 space-y-1 overflow-y-auto">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 px-1 py-2">
              <Skeleton className="flex-shrink-0 w-16 h-10 rounded-lg" />
              <div className="flex-1 space-y-1.5 pt-0.5">
                <Skeleton height="0.7rem" width="65%" />
                <Skeleton height="0.7rem" width="45%" />
              </div>
            </div>
          ))
        ) : events.length === 0 ? (
          <EmptyState icon={AlertTriangle} title="Tidak ada alert" description="Semua aman" />
        ) : (
          events.map((ev, i) => (
            <div
              key={ev._id}
              onClick={() => setLightboxIndex(i)}
              className="flex items-start gap-3 px-2 py-2 transition-colors rounded-lg cursor-pointer hover:bg-surface-elevated"
            >
              {/* Thumbnail */}
              <div className="flex-shrink-0 w-16 h-10 overflow-hidden border rounded-lg bg-surface-elevated border-surface-border">
                {ev.snapshotPath ? (
                  <img src={`${ev.snapshotUrl}`} alt="" className="object-cover w-full h-full" />
                ) : (
                  <div className="flex items-center justify-center w-full h-full">
                    <AlertTriangle className="w-4 h-4 text-content-muted" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate text-content">
                  {ev.cameraName ?? ev.cameraId}
                </p>
                <p className="text-[10px] text-content-secondary truncate">
                  {getEventCheckLabel(ev.checkResults)}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <ConfidenceBadge value={getEventConfidence(ev.checkResults)} />
                  <span className="text-[10px] text-content-muted">
                    {formatRelative(ev.detectedAt)}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <EventLightbox
        events={events}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onChange={setLightboxIndex}
      />
    </div>
  );
}
