import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  UserCheck,
  Plus,
  Pencil,
  Trash2,
  Mail,
  Bell,
  BellOff,
  Users,
  Wind,
  HardHat,
  Shirt,
  Eye,
  Hand,
  Layers,
  AlertTriangle,
  AlertCircle,
  Video,
  Wifi,
  WifiOff,
  ExternalLink,
  Inbox,
  PersonStanding,
  Smartphone
} from "lucide-react";
import { PageHeader } from "../../components/page-header";
import { FilterBar } from "../../components/filter-bar";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { EmptyState } from "../../components/empty-state";
import { Skeleton } from "../../components/skeleton";
import { Modal } from "../../components/modal";
import { usePics, useDeletePic } from "./use-pics";
import { useUiStore } from "../../store/ui.store";
import { usePermission } from "../../hooks/use-permission";
import { getCameras } from "../../services/camera.service";
import { cn } from "../../utils/cn";
import { useQuery } from "@tanstack/react-query";
import type { Pic } from "../../types/pic.types";
import type { Camera } from "../../types/camera.types";

type ViewModal =
  | { type: "checks"; pic: Pic }
  | { type: "cameras"; pic: Pic }
  | null;

const CHECK_CONFIG: Record<string, { label: string; icon: React.ElementType; chip: string }> = {
  person_count: {
    label: "Person",
    icon: Users,
    chip: "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/25"
  },
  mask_count: {
    label: "Mask",
    icon: Wind,
    chip: "bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/25"
  },
  helmet_count: {
    label: "Helmet",
    icon: HardHat,
    chip: "bg-yellow-500/15 text-yellow-400 ring-1 ring-yellow-500/25"
  },
  vest_count: {
    label: "Safety Vest",
    icon: Shirt,
    chip: "bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/25"
  },
  goggles_count: {
    label: "Goggles",
    icon: Eye,
    chip: "bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/25"
  },
  gloves_count: {
    label: "Gloves",
    icon: Hand,
    chip: "bg-green-500/15 text-green-400 ring-1 ring-green-500/25"
  },
  ladder_count: {
    label: "Ladder",
    icon: Layers,
    chip: "bg-indigo-500/15 text-indigo-400 ring-1 ring-indigo-500/25"
  },
  safety_cone_count: {
    label: "Safety Cone",
    icon: AlertTriangle,
    chip: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25"
  },
  fall_detected_count: {
    label: "Fall Detection",
    icon: AlertCircle,
    chip: "bg-red-500/15 text-red-400 ring-1 ring-red-500/25"
  },
  hand_in_pocket_count: {
    label: "Hand in Pocket",
    icon: PersonStanding,
    chip: "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/25"
  },
  holding_phone_count: {
    label: "Holding Phone While Walking",
    icon: Smartphone,
    chip: "bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/25"
  }
};

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-cyan-500",
  "bg-pink-500"
];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function CheckChip({ check }: { check: string }) {
  const cfg = CHECK_CONFIG[check];
  const Icon = cfg?.icon;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-medium bg-surface-elevated text-content-secondary border border-surface-border">
      {Icon && <Icon className="w-3 h-3" />}
      {cfg?.label ?? check}
    </span>
  );
}

export function PicsPage() {
  const navigate = useNavigate();
  const { canCreate, canUpdate, canDelete } = usePermission();
  const addToast = useUiStore((s) => s.addToast);

  const canManage = canCreate("pics") || canUpdate("pics");
  const canRemove = canDelete("pics");

  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Pic | null>(null);
  const [viewModal, setViewModal] = useState<ViewModal>(null);

  const { data: pics = [], isLoading } = usePics();
  const deleteMutation = useDeletePic();

  // Fetch full cameras only when the camera modal opens — to enrich with live status
  const { data: allCameras = [] } = useQuery({
    queryKey: ["cameras", "all-for-pic-modal"],
    queryFn: () => getCameras(),
    enabled: viewModal?.type === "cameras",
    staleTime: 30_000
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return pics.filter(
      (p) => p.name.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
    );
  }, [pics, search]);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title="PIC Management"
          description="Person in Charge — penerima notifikasi pelanggaran"
        />
        {canManage && (
          <button
            onClick={() => navigate("/pics/new")}
            className="flex items-center flex-shrink-0 gap-2 px-4 py-2 text-sm font-medium transition-opacity rounded-lg bg-primary text-primary-fg hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> Tambah PIC
          </button>
        )}
      </div>

      <FilterBar
        search={{ value: search, onChange: setSearch, placeholder: "Cari nama atau email..." }}
      />

      {/* Table */}
      <div className="overflow-hidden border bg-surface-panel border-surface-border rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-elevated border-b border-surface-border text-xs font-semibold text-content-secondary text-left">
              <th className="px-5 py-3 w-[280px]">PIC</th>
              <th className="px-5 py-3">Email</th>
              <th className="px-5 py-3 w-[120px]">Status</th>
              <th className="px-5 py-3 w-[280px]">Langganan Notifikasi</th>
              <th className="px-5 py-3 w-[140px]">Kamera</th>
              <th className="px-5 py-3 w-[80px] text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-surface-border last:border-0">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Skeleton height="2.25rem" width="2.25rem" className="rounded-full" />
                      <Skeleton height="1rem" width="8rem" />
                    </div>
                  </td>
                  <td className="px-5 py-4"><Skeleton height="1rem" /></td>
                  <td className="px-5 py-4"><Skeleton height="1.25rem" width="4rem" className="rounded-full" /></td>
                  <td className="px-5 py-4"><Skeleton height="1rem" /></td>
                  <td className="px-5 py-4"><Skeleton height="1rem" width="3rem" /></td>
                  <td className="px-5 py-4"><Skeleton height="1.5rem" width="4rem" className="rounded-lg ml-auto" /></td>
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16">
                  <EmptyState
                    icon={UserCheck}
                    title={search ? "Tidak ditemukan" : "Belum ada PIC"}
                    description={
                      search
                        ? "Coba kata kunci lain"
                        : "Klik Tambah PIC untuk mendaftarkan penerima notifikasi"
                    }
                    action={
                      canManage && !search ? (
                        <button
                          onClick={() => navigate("/pics/new")}
                          className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-opacity rounded-lg bg-primary text-primary-fg hover:opacity-90"
                        >
                          <Plus className="w-4 h-4" /> Tambah PIC
                        </button>
                      ) : undefined
                    }
                  />
                </td>
              </tr>
            ) : (
              filtered.map((pic) => {
                const checks = pic.subscribedChecks ?? [];
                const cameras = pic.cameras ?? [];
                const avatarBg = avatarColor(pic.name);

                return (
                  <tr
                    key={pic._id}
                    className="border-b border-surface-border last:border-0 hover:bg-surface-elevated/40 transition-colors"
                  >
                    {/* Name + avatar */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0",
                            avatarBg
                          )}
                        >
                          {pic.name.charAt(0).toUpperCase()}
                        </div>
                        <p className="text-sm font-semibold text-content truncate">{pic.name}</p>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Mail className="w-3.5 h-3.5 text-content-muted flex-shrink-0" />
                        <span className="text-sm truncate text-content-secondary">{pic.email}</span>
                      </div>
                    </td>

                    {/* Status pill */}
                    <td className="px-5 py-3.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border",
                          pic.isActive
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                            : "bg-surface-elevated text-content-muted border-surface-border"
                        )}
                      >
                        {pic.isActive ? (
                          <Bell className="w-3 h-3" />
                        ) : (
                          <BellOff className="w-3 h-3" />
                        )}
                        {pic.isActive ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>

                    {/* Subscribed checks */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {checks.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md font-medium bg-primary-dim text-primary border border-primary/30">
                            <Bell className="w-3 h-3" /> Semua pelanggaran
                          </span>
                        ) : (
                          <>
                            {checks.slice(0, 2).map((c) => (
                              <CheckChip key={c} check={c} />
                            ))}
                            {checks.length > 2 && (
                              <button
                                onClick={() => setViewModal({ type: "checks", pic })}
                                className="text-[11px] font-medium text-primary hover:underline px-1"
                              >
                                +{checks.length - 2} lainnya
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>

                    {/* Cameras count */}
                    <td className="px-5 py-3.5">
                      {cameras.length === 0 ? (
                        <span className="text-xs text-content-muted">—</span>
                      ) : (
                        <button
                          onClick={() => setViewModal({ type: "cameras", pic })}
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-surface-elevated border border-surface-border text-content-secondary hover:border-primary/40 hover:text-primary transition-colors"
                        >
                          <Video className="w-3.5 h-3.5" />
                          {cameras.length} kamera
                        </button>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        {canManage && (
                          <button
                            onClick={() => navigate(`/pics/${pic._id}/edit`)}
                            className="p-1.5 rounded-lg text-content-muted hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                        {canRemove && (
                          <button
                            onClick={() => setDeleteTarget(pic)}
                            className="p-1.5 rounded-lg text-content-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                            title="Hapus"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Subscribed Checks Modal */}
      <Modal
        open={viewModal?.type === "checks"}
        onClose={() => setViewModal(null)}
        title={
          viewModal?.type === "checks"
            ? `Langganan Notifikasi — ${viewModal.pic.name}`
            : undefined
        }
        width="md"
      >
        {viewModal?.type === "checks" && (
          <div>
            <p className="text-xs text-content-muted mb-3">
              {viewModal.pic.subscribedChecks?.length ?? 0} jenis pelanggaran
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(viewModal.pic.subscribedChecks ?? []).map((c) => {
                const cfg = CHECK_CONFIG[c];
                const Icon = cfg?.icon ?? Bell;
                return (
                  <div
                    key={c}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-surface-elevated border border-surface-border"
                  >
                    <Icon className="w-4 h-4 text-content-muted flex-shrink-0" />
                    <span className="text-sm text-content truncate">
                      {cfg?.label ?? c}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Modal>

      {/* Cameras Modal — enriched with live status */}
      <CamerasModal
        open={viewModal?.type === "cameras"}
        pic={viewModal?.type === "cameras" ? viewModal.pic : null}
        allCameras={allCameras}
        onClose={() => setViewModal(null)}
        onNavigateDetail={(id) => {
          setViewModal(null);
          navigate(`/cameras/${id}/detail`);
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(deleteTarget._id, {
            onSuccess: () => {
              addToast({ type: "success", message: `PIC "${deleteTarget.name}" dihapus` });
              setDeleteTarget(null);
            },
            onError: () => addToast({ type: "error", message: "Gagal menghapus PIC" })
          });
        }}
        title="Hapus PIC"
        message={`Hapus PIC "${deleteTarget?.name}" (${deleteTarget?.email})? PIC yang dihapus tidak akan menerima notifikasi apapun.`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

function CamerasModal({
  open,
  pic,
  allCameras,
  onClose,
  onNavigateDetail
}: {
  open: boolean;
  pic: Pic | null;
  allCameras: Camera[];
  onClose: () => void;
  onNavigateDetail: (id: string) => void;
}) {
  // Enrich: match against full camera data to get live status + section
  const enriched = useMemo(() => {
    const picCameras = pic?.cameras ?? [];
    const cameraMap = new Map(allCameras.map((c) => [c._id, c]));
    return picCameras.map((c) => {
      const full = cameraMap.get(c._id);
      return {
        _id: c._id,
        code: c.code,
        name: c.name,
        status: full?.status,
        isActive: full?.isActive,
        section:
          full && typeof full.sectionId === "object"
            ? full.sectionId
            : undefined
      };
    });
  }, [pic?.cameras, allCameras]);

  const onlineCount = enriched.filter((c) => c.status === "online").length;
  const offlineCount = enriched.filter((c) => c.status === "offline").length;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={pic ? `Kamera — ${pic.name}` : undefined}
      width="lg"
    >
      {pic && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-elevated border border-surface-border text-content-secondary">
              <Video className="w-3.5 h-3.5" />
              {enriched.length} kamera
            </span>
            {onlineCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-500">
                <Wifi className="w-3.5 h-3.5" />
                {onlineCount} online
              </span>
            )}
            {offlineCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-500">
                <WifiOff className="w-3.5 h-3.5" />
                {offlineCount} offline
              </span>
            )}
          </div>

          {/* Camera list */}
          {enriched.length === 0 ? (
            <div className="py-10">
              <EmptyState
                icon={Inbox}
                title="Belum ada kamera"
                description="PIC ini belum di-assign ke kamera manapun"
              />
            </div>
          ) : (
            <ul className="divide-y divide-surface-border border border-surface-border rounded-xl overflow-hidden">
              {enriched.map((cam) => {
                const isOnline = cam.status === "online";
                const isOffline = cam.status === "offline";
                return (
                  <li
                    key={cam._id}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-elevated/50 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-surface-elevated border border-surface-border flex items-center justify-center flex-shrink-0">
                      <Video className="w-4 h-4 text-content-muted" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-content truncate">
                          {cam.code}
                        </p>
                        {cam.status && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border",
                              isOnline &&
                                "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
                              isOffline &&
                                "bg-rose-500/10 text-rose-500 border-rose-500/30",
                              !isOnline &&
                                !isOffline &&
                                "bg-surface-elevated text-content-muted border-surface-border"
                            )}
                          >
                            {isOnline ? (
                              <Wifi className="w-2.5 h-2.5" />
                            ) : isOffline ? (
                              <WifiOff className="w-2.5 h-2.5" />
                            ) : null}
                            {cam.status}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-content-muted truncate mt-0.5">
                        {cam.name}
                        {cam.section && ` · ${cam.section.code}`}
                      </p>
                    </div>
                    <button
                      onClick={() => onNavigateDetail(cam._id)}
                      className="p-1.5 rounded-lg text-content-muted hover:text-primary hover:bg-primary/10 transition-colors flex-shrink-0"
                      title="Lihat detail kamera"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
