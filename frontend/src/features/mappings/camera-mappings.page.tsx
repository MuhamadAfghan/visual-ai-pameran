import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, ChevronLeft, MapPin } from "lucide-react";
import { PageHeader } from "../../components/page-header";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { EmptyState } from "../../components/empty-state";
import { Skeleton } from "../../components/skeleton";
import { useMappings, useDeleteMapping, useToggleMapping } from "./use-mappings";
import { getCameraById } from "../../services/camera.service";
import { useUiStore } from "../../store/ui.store";
import { usePermission } from "../../hooks/use-permission";
import { CHECK_LABELS } from "../../types/ai-model.types";
import { useState } from "react";
import type { CameraMapping } from "../../services/mapping.service";

export function CameraMappingsPage() {
  const { id: cameraId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const addToast = useUiStore((s) => s.addToast);
  const { can, canCreate, canUpdate, canDelete } = usePermission();
  const canAdd    = canCreate("camera_mappings");
  const canEdit   = canUpdate("camera_mappings");
  const canToggle = can("camera_mappings", "toggle");
  const canRemove = canDelete("camera_mappings");

  const [deleteTarget, setDeleteTarget] = useState<CameraMapping | null>(null);

  const { data: camera } = useQuery({
    queryKey: ["camera", cameraId],
    queryFn: () => getCameraById(cameraId!),
    enabled: !!cameraId
  });

  const { data: mappings = [], isLoading } = useMappings(cameraId ?? "");
  const deleteMutation = useDeleteMapping(cameraId ?? "");
  const toggleMutation = useToggleMapping(cameraId ?? "");

  function getModelName(mapping: CameraMapping) {
    if (!mapping.modelId) return "(model dihapus)";
    if (typeof mapping.modelId === "object") return mapping.modelId.name;
    return mapping.modelId;
  }

  function getModelCode(mapping: CameraMapping) {
    if (!mapping.modelId) return "—";
    if (typeof mapping.modelId === "object") return mapping.modelId.code;
    return "";
  }

  function formatSchedule(mapping: CameraMapping) {
    const s = mapping.schedule;
    if (s.type === "always") return "Selalu aktif";
    const days = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
    const dayStr = s.daysOfWeek?.map((d) => days[d]).join(", ") ?? "—";
    const range = s.timeRanges?.[0];
    const timeStr = range ? `${range.start}–${range.end}` : "";
    return `${dayStr} · ${timeStr}`;
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <button
          onClick={() => navigate("/cameras")}
          className="flex items-center gap-1.5 text-sm text-content-secondary hover:text-content mb-3 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Kembali ke Cameras
        </button>

        <PageHeader
          title={camera ? `Mappings — ${camera.name}` : "Camera Mappings"}
          description={
            camera
              ? `${camera.code} · Kelola model deteksi dan konfigurasi red zone`
              : "Kelola model deteksi untuk kamera ini"
          }
        >
          {canAdd && (
            <button
              onClick={() => navigate(`/cameras/${cameraId}/mappings/new`)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-fg rounded-lg hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" /> Tambah Mapping
            </button>
          )}
        </PageHeader>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-surface-border p-5 space-y-2">
              <Skeleton height="1rem" width="40%" />
              <Skeleton height="0.75rem" width="70%" />
            </div>
          ))}
        </div>
      ) : mappings.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Belum ada mapping"
          description="Tambah mapping untuk mulai deteksi AI pada kamera ini"
          action={
            canAdd ? (
              <button
                onClick={() => navigate(`/cameras/${cameraId}/mappings/new`)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-fg rounded-lg hover:opacity-90"
              >
                <Plus className="w-4 h-4" /> Tambah Mapping
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {mappings.map((mapping) => (
            <div
              key={mapping._id}
              className="bg-surface-panel border border-surface-border rounded-xl p-5 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0 space-y-2">
                  {/* Header */}
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${mapping.isActive ? "bg-green-500" : "bg-surface-border"}`} />
                    <p className="text-sm font-semibold text-content">{getModelName(mapping)}</p>
                    <span className="text-[10px] font-mono text-content-muted bg-surface-elevated px-1.5 py-0.5 rounded">
                      {getModelCode(mapping)}
                    </span>
                  </div>

                  {/* Checks */}
                  {mapping.selectedChecks?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {mapping.selectedChecks.map((c) => (
                        <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                          {CHECK_LABELS[c]}
                        </span>
                      ))}
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-elevated text-content-muted border border-surface-border">
                        conf {(mapping.confidenceThreshold * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}

                  {/* Schedule & PICs */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-xs text-content-muted">{formatSchedule(mapping)}</p>
                    {mapping.picIds?.length > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-elevated text-content-muted border border-surface-border">
                        {mapping.picIds.length} PIC
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {(canEdit || canToggle || canRemove) && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {canEdit && (
                      <button
                        onClick={() => navigate(`/cameras/${cameraId}/mappings/${mapping._id}/edit`)}
                        className="p-1.5 rounded-lg text-content-muted hover:text-content hover:bg-surface-elevated transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canToggle && (
                      <button
                        onClick={() =>
                          toggleMutation.mutate(
                            { mappingId: mapping._id, isActive: !mapping.isActive },
                            {
                              onSuccess: () => addToast({ type: "success", message: `Mapping ${mapping.isActive ? "dinonaktifkan" : "diaktifkan"}` }),
                              onError: () => addToast({ type: "error", message: "Gagal mengubah status" }),
                            }
                          )
                        }
                        className="p-1.5 rounded-lg text-content-muted hover:text-content hover:bg-surface-elevated transition-colors"
                        title={mapping.isActive ? "Nonaktifkan" : "Aktifkan"}
                      >
                        {mapping.isActive
                          ? <ToggleRight className="w-4 h-4 text-green-500" />
                          : <ToggleLeft className="w-4 h-4" />}
                      </button>
                    )}
                    {canRemove && (
                      <button
                        onClick={() => setDeleteTarget(mapping)}
                        className="p-1.5 rounded-lg text-content-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        title="Hapus"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(deleteTarget._id, {
            onSuccess: () => {
              addToast({ type: "success", message: "Mapping dihapus" });
              setDeleteTarget(null);
            },
            onError: () => addToast({ type: "error", message: "Gagal menghapus mapping" })
          });
        }}
        title="Hapus Mapping"
        message={`Hapus mapping model "${deleteTarget?.modelId && typeof deleteTarget.modelId === "object" ? deleteTarget.modelId.name : ""}" dari kamera ini?`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
