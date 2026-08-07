import { useState } from "react";
import { Plus, Pencil, Trash2, BrainCircuit, ToggleLeft, ToggleRight } from "lucide-react";
import { PageHeader } from "../../components/page-header";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { EmptyState } from "../../components/empty-state";
import { Skeleton } from "../../components/skeleton";
import { Drawer } from "../../components/drawer";
import { ModelForm, type ModelFormData } from "./model-form";
import { useAiModels, useCreateAiModel, useUpdateAiModel, useDeleteAiModel } from "./use-models";
import { useUiStore } from "../../store/ui.store";
import { usePermission } from "../../hooks/use-permission";
import { CHECK_LABELS } from "../../types/ai-model.types";
import type { AiModel } from "../../types/ai-model.types";

type PanelState = "closed" | "new" | AiModel;

export function ModelsPage() {
  const { canCreate, canUpdate, canDelete } = usePermission();
  const addToast = useUiStore((s) => s.addToast);

  const canAdd    = canCreate("ai_models");
  const canEdit   = canUpdate("ai_models");
  const canRemove = canDelete("ai_models");

  const [panel, setPanel] = useState<PanelState>("closed");
  const [deleteTarget, setDeleteTarget] = useState<AiModel | null>(null);

  const { data: models = [], isLoading } = useAiModels();
  const createMutation = useCreateAiModel();
  const updateMutation = useUpdateAiModel();
  const deleteMutation = useDeleteAiModel();

  const editingModel = typeof panel === "object" ? panel : null;

  async function handleSubmit(data: ModelFormData) {
    try {
      if (editingModel) {
        await updateMutation.mutateAsync({ id: editingModel._id, payload: data });
        addToast({ type: "success", message: "Model berhasil diupdate" });
      } else {
        await createMutation.mutateAsync(data);
        addToast({ type: "success", message: "Model berhasil ditambahkan" });
      }
      setPanel("closed");
    } catch {
      addToast({ type: "error", message: "Gagal menyimpan model" });
    }
  }

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-6 space-y-5">
      <PageHeader title="AI Models" description="Kelola konfigurasi model deteksi AI">
        {canAdd && (
          <button
            onClick={() => setPanel("new")}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-fg rounded-lg hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" /> Tambah Model
          </button>
        )}
      </PageHeader>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-surface-border p-5 space-y-2">
              <Skeleton height="1rem" width="30%" />
              <Skeleton height="0.75rem" width="60%" />
            </div>
          ))}
        </div>
      ) : models.length === 0 ? (
        <EmptyState
          icon={BrainCircuit}
          title="Belum ada model"
          description="Tambah model AI pertama untuk mulai membuat mapping kamera"
          action={
            canAdd ? (
              <button
                onClick={() => setPanel("new")}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary text-primary-fg rounded-lg hover:opacity-90"
              >
                <Plus className="w-4 h-4" /> Tambah Model
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {models.map((model) => (
            <div
              key={model._id}
              className="bg-surface-panel border border-surface-border rounded-xl p-5 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                        model.isActive ? "bg-green-500" : "bg-surface-border"
                      }`}
                    />
                    <p className="text-sm font-semibold text-content">{model.name}</p>
                    <span className="text-[10px] font-mono text-content-muted bg-surface-elevated px-1.5 py-0.5 rounded flex-shrink-0">
                      {model.code}
                    </span>
                    <span className="text-[10px] text-content-muted">v{model.version}</span>
                  </div>
                  {model.description && (
                    <p className="text-xs text-content-secondary mb-2 truncate">{model.description}</p>
                  )}
                  {model.defaultChecks.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {model.defaultChecks.map((c) => (
                        <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                          {CHECK_LABELS[c]}
                        </span>
                      ))}
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-elevated text-content-muted border border-surface-border">
                        conf {(model.defaultConfThreshold * 100).toFixed(0)}%
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-content-muted italic">Tidak ada default checks</span>
                  )}
                </div>

                {(canEdit || canRemove) && (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {canEdit && (
                      <>
                        <button
                          onClick={() => setPanel(model)}
                          className="p-1.5 rounded-lg text-content-muted hover:text-content hover:bg-surface-elevated transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() =>
                            updateMutation.mutate(
                              { id: model._id, payload: { isActive: !model.isActive } },
                              {
                                onSuccess: () =>
                                  addToast({ type: "success", message: `Model ${model.isActive ? "dinonaktifkan" : "diaktifkan"}` }),
                                onError: () => addToast({ type: "error", message: "Gagal mengubah status" }),
                              }
                            )
                          }
                          className="p-1.5 rounded-lg text-content-muted hover:text-content hover:bg-surface-elevated transition-colors"
                          title={model.isActive ? "Nonaktifkan" : "Aktifkan"}
                        >
                          {model.isActive ? (
                            <ToggleRight className="w-4 h-4 text-green-500" />
                          ) : (
                            <ToggleLeft className="w-4 h-4" />
                          )}
                        </button>
                      </>
                    )}
                    {canRemove && (
                      <button
                        onClick={() => setDeleteTarget(model)}
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

      <Drawer
        open={panel !== "closed"}
        onClose={() => setPanel("closed")}
        title={editingModel ? `Edit Model: ${editingModel.name}` : "Tambah Model AI"}
      >
        <ModelForm
          model={editingModel}
          onSubmit={handleSubmit}
          onCancel={() => setPanel("closed")}
          loading={isSubmitting}
        />
      </Drawer>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(deleteTarget._id, {
            onSuccess: () => {
              addToast({ type: "success", message: `Model "${deleteTarget.name}" dihapus` });
              setDeleteTarget(null);
            },
            onError: () => addToast({ type: "error", message: "Gagal menghapus model" }),
          });
        }}
        title="Hapus Model"
        message={`Hapus model "${deleteTarget?.name}"? Semua mapping yang menggunakan model ini akan terpengaruh.`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
