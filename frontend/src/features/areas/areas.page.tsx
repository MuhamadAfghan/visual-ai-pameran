import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Building2 } from "lucide-react";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { EmptyState } from "../../components/empty-state";
import { Skeleton } from "../../components/skeleton";
import { PageHeader } from "../../components/page-header";
import { AreaCard } from "./area-card";
import { AreaFormDrawer, type DrawerMode, type AreaFormData } from "./area-form-drawer";
import { useAreas, useCreateArea, useUpdateArea, useDeleteArea } from "./use-areas";
import {
  getSections,
  createSection,
  updateSection,
  deleteSection
} from "../../services/section.service";
import { useUiStore } from "../../store/ui.store";
import { usePermission } from "../../hooks/use-permission";
import type { Area } from "../../types/area.types";
import type { Section } from "../../types/section.types";

export function AreasPage() {
  const { canCreate, canUpdate, canDelete } = usePermission();
  const addToast = useUiStore((s) => s.addToast);
  const qc = useQueryClient();

  const canCreateArea    = canCreate("areas");
  const canUpdateArea    = canUpdate("areas");
  const canDeleteArea    = canDelete("areas");
  const canCreateSection = canCreate("sections");
  const canUpdateSection = canUpdate("sections");
  const canDeleteSection = canDelete("sections");

  const [drawer, setDrawer] = useState<DrawerMode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    { kind: "area"; area: Area } | { kind: "section"; section: Section } | null
  >(null);

  const { data: areas = [], isLoading: areasLoading } = useAreas();
  const { data: sections = [], isLoading: sectionsLoading } = useQuery({
    queryKey: ["sections"],
    queryFn: () => getSections(),
    staleTime: 60_000
  });

  const createAreaMutation = useCreateArea();
  const updateAreaMutation = useUpdateArea();
  const deleteAreaMutation = useDeleteArea();

  const createSectionMutation = useMutation({
    mutationFn: createSection,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sections"] });
      qc.invalidateQueries({ queryKey: ["areas"] });
    }
  });
  const updateSectionMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateSection>[1] }) =>
      updateSection(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sections"] })
  });
  const deleteSectionMutation = useMutation({
    mutationFn: deleteSection,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sections"] });
      qc.invalidateQueries({ queryKey: ["areas"] });
      qc.invalidateQueries({ queryKey: ["cameras"] });
    }
  });

  const sectionsByAreaId = useMemo(() => {
    const map: Record<string, Section[]> = {};
    for (const s of sections) {
      const aid = typeof s.areaId === "object" ? s.areaId._id : s.areaId;
      if (!map[aid]) map[aid] = [];
      map[aid].push(s);
    }
    return map;
  }, [sections]);

  async function handleSubmit(data: AreaFormData) {
    if (!drawer) return;
    try {
      if (drawer.type === "newArea") {
        await createAreaMutation.mutateAsync(data);
        addToast({ type: "success", message: "Area ditambahkan" });
      } else if (drawer.type === "newSection") {
        await createSectionMutation.mutateAsync({ ...data, areaId: drawer.parent._id });
        addToast({ type: "success", message: "Section ditambahkan" });
      } else if (drawer.type === "editArea") {
        await updateAreaMutation.mutateAsync({ id: drawer.area._id, payload: data });
        addToast({ type: "success", message: "Area diperbarui" });
      } else {
        await updateSectionMutation.mutateAsync({ id: drawer.section._id, payload: data });
        addToast({ type: "success", message: "Section diperbarui" });
      }
      setDrawer(null);
    } catch {
      addToast({ type: "error", message: "Gagal menyimpan" });
    }
  }

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "area") {
      deleteAreaMutation.mutate(deleteTarget.area._id, {
        onSuccess: () => {
          addToast({ type: "success", message: `Area "${deleteTarget.area.name}" dihapus` });
          setDeleteTarget(null);
        },
        onError: () => addToast({ type: "error", message: "Gagal menghapus area" })
      });
    } else {
      deleteSectionMutation.mutate(deleteTarget.section._id, {
        onSuccess: () => {
          addToast({ type: "success", message: `Section "${deleteTarget.section.name}" dihapus` });
          setDeleteTarget(null);
        },
        onError: () => addToast({ type: "error", message: "Gagal menghapus section" })
      });
    }
  }

  const isLoading = areasLoading || sectionsLoading;
  const isSaving =
    createAreaMutation.isPending ||
    updateAreaMutation.isPending ||
    createSectionMutation.isPending ||
    updateSectionMutation.isPending;

  return (
    <div className="p-6 space-y-5">
      <PageHeader title="Area" description="Kelola area dan section untuk mengorganisir kamera CCTV">
        {canCreateArea && (
          <button
            onClick={() => setDrawer({ type: "newArea" })}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-opacity rounded-lg bg-primary text-primary-fg hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> Add Area
          </button>
        )}
      </PageHeader>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height="220px" />
          ))}
        </div>
      ) : areas.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Belum ada area"
          description={canCreateArea ? "Klik Add Area untuk membuat area pertama" : "Hubungi admin untuk menambahkan area"}
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {areas.map((area) => (
            <AreaCard
              key={area._id}
              area={area}
              sections={sectionsByAreaId[area._id] ?? []}
              canEdit={canUpdateArea}
              canDelete={canDeleteArea}
              canAddSection={canCreateSection}
              onEditArea={() => setDrawer({ type: "editArea", area })}
              onDeleteArea={() => setDeleteTarget({ kind: "area", area })}
              onAddSection={() => setDrawer({ type: "newSection", parent: area })}
              onEditSection={(section) => canUpdateSection && setDrawer({ type: "editSection", section })}
              onDeleteSection={(section) => canDeleteSection && setDeleteTarget({ kind: "section", section })}
            />
          ))}
        </div>
      )}

      <AreaFormDrawer
        open={drawer !== null}
        mode={drawer}
        onClose={() => setDrawer(null)}
        onSubmit={handleSubmit}
        loading={isSaving}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={deleteTarget?.kind === "area" ? "Hapus Area" : "Hapus Section"}
        message={
          deleteTarget?.kind === "area"
            ? `Hapus area "${deleteTarget.area.name}"? Semua section dan kamera di bawahnya akan ikut terhapus.`
            : `Hapus section "${deleteTarget?.section.name}"? Semua kamera di section ini akan ikut terhapus.`
        }
        loading={deleteAreaMutation.isPending || deleteSectionMutation.isPending}
      />
    </div>
  );
}
