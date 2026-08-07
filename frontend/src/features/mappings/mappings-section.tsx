import { useState } from "react";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, MapPin, ScanLine } from "lucide-react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { Skeleton } from "../../components/skeleton";
import { MappingFormDrawer } from "./mapping-form-drawer";
import { useMappings, useDeleteMapping, useToggleMapping } from "./use-mappings";
import { useUiStore } from "../../store/ui.store";
import { usePermission } from "../../hooks/use-permission";
import { CHECK_LABELS } from "../../types/ai-model.types";
import type { CameraMapping } from "../../services/mapping.service";

type Props = {
  cameraId: string;
};

export function MappingsSection({ cameraId }: Props) {
  const addToast = useUiStore((s) => s.addToast);
  const { can, canCreate, canUpdate, canDelete } = usePermission();

  const canAdd    = canCreate("camera_mappings");
  const canEdit   = canUpdate("camera_mappings");
  const canToggle = can("camera_mappings", "toggle");
  const canRemove = canDelete("camera_mappings");

  const [drawerMappingId, setDrawerMappingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CameraMapping | null>(null);

  const { data: mappings = [], isLoading } = useMappings(cameraId);
  const deleteMutation = useDeleteMapping(cameraId);
  const toggleMutation = useToggleMapping(cameraId);

  function getModelName(m: CameraMapping) {
    if (!m.modelId) return "(model dihapus)";
    return typeof m.modelId === "object" ? m.modelId.name : m.modelId;
  }

  function getModelCode(m: CameraMapping) {
    if (!m.modelId) return "—";
    return typeof m.modelId === "object" ? m.modelId.code : "";
  }

  function formatSchedule(m: CameraMapping) {
    const s = m.schedule;
    if (s.type === "always") return "Selalu aktif";
    const days = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
    const dayStr = s.daysOfWeek?.map((d) => days[d]).join(", ") ?? "—";
    const range = s.timeRanges?.[0];
    return `${dayStr}${range ? ` · ${range.start}–${range.end}` : ""}`;
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanLine className="w-4 h-4 text-content-secondary" />
            <h2 className="text-sm font-semibold text-content">Model Deteksi (Mappings)</h2>
            {mappings.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {mappings.length}
              </span>
            )}
          </div>
          {canAdd && (
            <button
              type="button"
              onClick={() => setDrawerMappingId("")}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-fg rounded-lg hover:opacity-90 transition-opacity"
            >
              <Plus className="w-3.5 h-3.5" /> Tambah
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} height="4rem" />)}
          </div>
        ) : mappings.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-surface-border text-content-muted">
            <MapPin className="w-4 h-4 shrink-0 opacity-50" />
            <p className="text-xs">
              Belum ada mapping.{" "}
              {canAdd && (
                <button
                  type="button"
                  onClick={() => setDrawerMappingId("")}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Tambah sekarang
                </button>
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {mappings.map((mapping) => (
              <div
                key={mapping._id}
                className="flex items-start gap-3 px-4 py-3 rounded-lg border border-surface-border bg-surface-elevated hover:border-primary/30 transition-colors"
              >
                <span className={`mt-1 inline-block w-2 h-2 rounded-full shrink-0 ${mapping.isActive ? "bg-green-500" : "bg-surface-border"}`} />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold text-content">{getModelName(mapping)}</span>
                    <span className="text-[10px] font-mono text-content-muted bg-surface-panel px-1.5 py-0.5 rounded">
                      {getModelCode(mapping)}
                    </span>
                  </div>
                  {mapping.selectedChecks?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {mapping.selectedChecks.map((c) => (
                        <span key={c} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                          {CHECK_LABELS[c]}
                        </span>
                      ))}
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-panel text-content-muted border border-surface-border">
                        conf {(mapping.confidenceThreshold * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}
                  <p className="text-[10px] text-content-muted">{formatSchedule(mapping)}</p>
                </div>

                {(canEdit || canToggle || canRemove) && (
                  <div className="flex items-center gap-1 shrink-0">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setDrawerMappingId(mapping._id)}
                        className="p-1.5 rounded text-content-muted hover:text-content hover:bg-surface-panel transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canToggle && (
                      <button
                        type="button"
                        onClick={() =>
                          toggleMutation.mutate(
                            { mappingId: mapping._id, isActive: !mapping.isActive },
                            {
                              onSuccess: () => addToast({ type: "success", message: `Mapping ${mapping.isActive ? "dinonaktifkan" : "diaktifkan"}` }),
                              onError: () => addToast({ type: "error", message: "Gagal mengubah status" }),
                            }
                          )
                        }
                        className="p-1.5 rounded text-content-muted hover:text-content hover:bg-surface-panel transition-colors"
                      >
                        {mapping.isActive
                          ? <ToggleRight className="w-4 h-4 text-green-500" />
                          : <ToggleLeft className="w-4 h-4" />}
                      </button>
                    )}
                    {canRemove && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(mapping)}
                        className="p-1.5 rounded text-content-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <MappingFormDrawer
        open={drawerMappingId !== null}
        onClose={() => setDrawerMappingId(null)}
        cameraId={cameraId}
        mappingId={drawerMappingId || null}
      />

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
            onError: () => addToast({ type: "error", message: "Gagal menghapus mapping" }),
          });
        }}
        title="Hapus Mapping"
        message={`Hapus mapping "${deleteTarget?.modelId && typeof deleteTarget.modelId === "object" ? deleteTarget.modelId.name : ""}"?`}
        loading={deleteMutation.isPending}
      />
    </>
  );
}
