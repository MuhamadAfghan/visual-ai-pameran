import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, AlertTriangle, CheckCheck, Check } from "lucide-react";
import { getEvents, acknowledgeEvent, acknowledgeAllEvents } from "../services/event.service";
import { formatRelative } from "../utils/formatDate";
import { cn } from "../utils/cn";
import { getEventCheckLabel } from "../types/event.types";

const POLL = 30_000;

export function NotificationBell() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => getEvents({ status: "unacknowledged", isViolation: true, limit: 10 }),
    refetchInterval: POLL,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: acknowledgeEvent,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", "unread"] }),
  });

  const acknowledgeAllMutation = useMutation({
    mutationFn: acknowledgeAllEvents,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", "unread"] });
      qc.invalidateQueries({ queryKey: ["events"] });
    },
  });

  const unreadCount = data?.pagination.total ?? 0;
  const items = data?.items ?? [];

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleItemClick(eventId: string) {
    setOpen(false);
    navigate(`/events?eventId=${eventId}`);
  }

  function handleMarkRead(e: React.MouseEvent, eventId: string) {
    e.stopPropagation();
    acknowledgeMutation.mutate(eventId);
  }

  function handleMarkAllRead() {
    acknowledgeAllMutation.mutate();
  }

  function handleViewAll() {
    setOpen(false);
    navigate("/events?status=unacknowledged");
  }

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex items-center justify-center w-8 h-8 transition-colors rounded-lg text-content-secondary hover:text-content hover:bg-surface-elevated"
        title="Notifikasi"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 rounded-xl border border-surface-border bg-surface-panel shadow-lg z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
            <h3 className="text-sm font-semibold text-content">Notifikasi</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={acknowledgeAllMutation.isPending}
                className="flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
                title="Tandai semua sudah dibaca"
              >
                <CheckCheck className="w-3 h-3" />
                Tandai semua dibaca
              </button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-80">
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-content-muted">
                <CheckCheck className="w-8 h-8" />
                <p className="text-sm">Semua sudah dibaca</p>
              </div>
            ) : (
              items.map((ev) => (
                <div
                  key={ev._id}
                  className="flex items-start w-full gap-3 px-4 py-3 text-left border-b border-surface-border last:border-0 group hover:bg-surface-elevated transition-colors"
                >
                  {/* Clickable area — opens events + drawer */}
                  <button
                    onClick={() => handleItemClick(ev._id)}
                    className="flex items-start gap-3 flex-1 min-w-0 text-left"
                  >
                    {/* Thumbnail */}
                    <div className="w-12 h-8 rounded-lg bg-surface-elevated border border-surface-border flex-shrink-0 overflow-hidden mt-0.5">
                      {ev.snapshotPath ? (
                        <img
                          src={`${ev.snapshotUrl}`}
                          alt=""
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        <div className="flex items-center justify-center w-full h-full">
                          <AlertTriangle className="w-3 h-3 text-content-muted" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate text-content">
                        {ev.cameraName ?? ev.cameraId}
                      </p>
                      <p className="text-[11px] text-content-secondary truncate">
                        {getEventCheckLabel(ev.checkResults)}
                      </p>
                      <p className="text-[10px] text-content-muted mt-0.5">
                        {formatRelative(ev.detectedAt)}
                      </p>
                    </div>
                  </button>

                  {/* Mark-as-read button + unread dot */}
                  <div className="flex flex-col items-center gap-1 flex-shrink-0 mt-0.5">
                    <button
                      onClick={(e) => handleMarkRead(e, ev._id)}
                      disabled={acknowledgeMutation.isPending}
                      className={cn(
                        "flex items-center justify-center w-5 h-5 rounded-full border transition-colors disabled:opacity-50",
                        "opacity-0 group-hover:opacity-100",
                        "border-surface-border hover:border-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400",
                        "text-content-muted"
                      )}
                      title="Tandai sudah dibaca"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full flex-shrink-0",
                        ev.status === "unacknowledged" ? "bg-red-500" : "bg-transparent"
                      )}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {unreadCount > 0 && (
            <div className="px-4 py-2.5 border-t border-surface-border">
              <button
                onClick={handleViewAll}
                className="w-full text-xs text-center text-primary hover:underline"
              >
                Lihat semua ({unreadCount})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
