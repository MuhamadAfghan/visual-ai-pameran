import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  Pencil,
  Trash2,
  Wifi,
  Video,
  ScanLine,
  Bell,
  Timer,
  TimerOff,
  MoreVertical,
  GripVertical,
  type LucideIcon
} from "lucide-react";
import { CameraStatusBadge } from "../../components/camera-status-badge";
import { formatRelative } from "../../utils/formatDate";
import { cn } from "../../utils/cn";
import { useAuth } from "../../app/auth-provider";
import { useUiStore } from "../../store/ui.store";
import { useUpdateCamera } from "./use-cameras";
import { getAreaName, getSectionName } from "../../types/camera.types";
import type { Camera } from "../../types/camera.types";

const API_BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/v1`;

type Props = {
  camera: Camera;
  onEdit: (camera: Camera) => void;
  onTest: (id: string) => void;
  onDelete?: (camera: Camera) => void;
  testing: boolean;
  /** Arrange (drag-to-reorder) mode: disables click-to-detail + action menu. */
  arrangeMode?: boolean;
};

export function CameraCard({ camera, onEdit, onTest, onDelete, testing, arrangeMode }: Props) {
  const navigate = useNavigate();
  const { token } = useAuth();
  const addToast = useUiStore((s) => s.addToast);
  const updateMutation = useUpdateCamera();
  const [imgError, setImgError] = useState(false);

  // Action menu (collapses Edit/Mappings/Events/Test/Delete into one button so the
  // card is mostly live preview). Close on outside click or Escape.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: globalThis.MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Quick scheduler on/off straight from the card. Persists via PUT /cameras/:id
  // (isActive), which the backend uses to start/stop the capture schedule — no
  // need to open the Edit form. Live preview is independent of this toggle.
  function toggleActive(e: MouseEvent): void {
    e.stopPropagation();
    if (updateMutation.isPending) return;
    const next = !camera.isActive;
    updateMutation.mutate(
      { id: camera._id, payload: { isActive: next } },
      {
        onSuccess: () =>
          addToast({
            type: "success",
            message: next
              ? `Scheduler "${camera.name}" diaktifkan`
              : `Scheduler "${camera.name}" dinonaktifkan`
          }),
        onError: () => addToast({ type: "error", message: "Gagal mengubah status kamera" })
      }
    );
  }
  // Grid polls the SNAPSHOT endpoint fast (~1s) instead of holding a live MJPEG
  // stream. MJPEG keeps a persistent HTTP connection per card; with many cameras
  // the browser's ~6-connections-per-host cap is exhausted and all API calls
  // stall. These polls are short-lived requests (the backend serves the latest
  // frame from the shared per-camera decoder, no detection), so the grid looks
  // live without that risk. `tick` busts the cache so each poll fetches a new frame.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
      setImgError(false); // retry cameras that had no snapshot yet
    }, 1_000);
    return () => clearInterval(interval);
  }, []);
  const snapshotUrl = token
    ? `${API_BASE}/cameras/${camera._id}/snapshot?token=${encodeURIComponent(token)}&_=${tick}`
    : null;

  return (
    <div
      className={cn(
        "relative transition-colors border bg-surface-panel border-surface-border rounded-xl hover:border-primary/40 group",
        menuOpen ? "z-30" : "z-0"
      )}
    >
      {/* Latest snapshot — click to open detail (disabled while arranging) */}
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden aspect-video bg-surface-elevated rounded-t-xl",
          arrangeMode ? "cursor-move" : "cursor-pointer"
        )}
        onClick={arrangeMode ? undefined : () => navigate(`/cameras/${camera._id}/detail`)}
      >
        {snapshotUrl && !imgError ? (
          <img
            src={snapshotUrl}
            alt={camera.name}
            className="object-cover w-full h-full"
            onError={() => setImgError(true)}
          />
        ) : (
          <Video className="w-8 h-8 text-content-muted" />
        )}
        {/* Single unified status badge (Nonaktif → Offline → Maintenance → Online) */}
        <div className="absolute top-2 right-2">
          <CameraStatusBadge camera={camera} />
        </div>
        {/* Hover overlay — drag hint while arranging, else "View Detail" */}
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center transition-opacity bg-black/50",
            arrangeMode ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          <span className="flex items-center gap-1.5 text-white text-xs font-medium px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm">
            {arrangeMode ? (
              <>
                <GripVertical className="w-3.5 h-3.5" /> Seret untuk susun
              </>
            ) : (
              "View Detail"
            )}
          </span>
        </div>
      </div>

      {/* Action menu — collapses Edit/Mappings/Events/Test/Delete into one button.
          Hidden while arranging so dragging never conflicts with the menu. */}
      {!arrangeMode && (
      <div className="absolute top-2 left-2" ref={menuRef}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((o) => !o);
          }}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="Aksi"
          className="flex items-center justify-center w-8 h-8 text-white rounded-lg bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute left-0 z-30 py-1 mt-1 border shadow-lg w-44 rounded-lg border-surface-border bg-surface-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <MenuItem icon={Pencil} label="Edit" onClick={() => { setMenuOpen(false); onEdit(camera); }} />
            <MenuItem
              icon={ScanLine}
              label="Mappings"
              badge={camera.activeMappingCount}
              onClick={() => { setMenuOpen(false); navigate(`/cameras/${camera._id}/mappings`); }}
            />
            <MenuItem
              icon={Bell}
              label="Events"
              onClick={() => { setMenuOpen(false); navigate(`/events?cameraId=${camera._id}`); }}
            />
            <MenuItem
              icon={Wifi}
              label={testing ? "Testing..." : "Test"}
              disabled={testing}
              onClick={() => { setMenuOpen(false); onTest(camera._id); }}
            />
            {onDelete && (
              <>
                <div className="my-1 border-t border-surface-border" />
                <MenuItem
                  icon={Trash2}
                  label="Hapus"
                  danger
                  onClick={() => { setMenuOpen(false); onDelete(camera); }}
                />
              </>
            )}
          </div>
        )}
      </div>
      )}

      {/* Info */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-sm font-semibold leading-tight text-content">{camera.name}</p>
          <span className="text-[10px] font-mono text-content-muted bg-surface-elevated px-1.5 py-0.5 rounded flex-shrink-0">
            {camera.code}
          </span>
        </div>
        <p className="text-xs truncate text-content-secondary">
          {getAreaName(camera)} · {getSectionName(camera)}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {camera.isActive ? (
              <span className="flex items-center gap-1 text-[10px] text-green-500">
                <Timer className="w-3 h-3" />
                Monitoring aktif · realtime
              </span>
            ) : (
              <span className="flex items-center gap-1 text-[10px] text-content-muted">
                <TimerOff className="w-3 h-3" />
                Monitoring nonaktif
              </span>
            )}
            {camera.lastCaptureAt && (
              <span className="text-[10px] text-content-muted">
                · {formatRelative(camera.lastCaptureAt)}
              </span>
            )}
          </div>
          {/* Quick on/off — toggles isActive (scheduler) without opening Edit */}
          <button
            type="button"
            role="switch"
            aria-checked={camera.isActive}
            disabled={updateMutation.isPending || arrangeMode}
            onClick={toggleActive}
            title={camera.isActive ? "Nonaktifkan scheduler" : "Aktifkan scheduler"}
            className={cn(
              "relative inline-flex flex-shrink-0 items-center h-5 w-9 ml-auto rounded-full transition-colors",
              camera.isActive ? "bg-primary" : "bg-surface-border",
              updateMutation.isPending && "opacity-50 cursor-not-allowed"
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 rounded-full bg-white transition-transform",
                camera.isActive ? "translate-x-4" : "translate-x-0.5"
              )}
            />
          </button>
        </div>
      </div>

    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
  badge
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  badge?: number;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 w-full px-3 py-2 text-xs text-left transition-colors",
        disabled && "opacity-50 cursor-not-allowed",
        danger
          ? "text-red-500 hover:bg-red-500/10"
          : "text-content-secondary hover:bg-surface-elevated hover:text-content"
      )}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-primary text-primary-fg text-[9px] font-bold">
          {badge}
        </span>
      )}
    </button>
  );
}
