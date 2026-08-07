import { useState } from "react";
import { KeyRound, Plus, Pencil, Trash2, Lock } from "lucide-react";
import { PageHeader } from "../../components/page-header";
import { DataTable, tHead, tH, tRow, tD } from "../../components/data-table";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { EmptyState } from "../../components/empty-state";
import { Skeleton } from "../../components/skeleton";
import { Modal } from "../../components/modal";
import { useUiStore } from "../../store/ui.store";
import { useRoles, useCreateRole, useUpdateRole, useDeleteRole } from "./use-roles";
import { RoleForm } from "./role-form";
import type { Role } from "../../types/role.types";
import type { CreateRolePayload } from "../../services/role.service";

function PermissionSummary({ permissions }: { permissions: Role["permissions"] }) {
  const count = permissions.reduce((acc, p) => acc + p.actions.length, 0);
  const modules = permissions.filter((p) => p.actions.length > 0).length;
  if (count === 0) return <span className="text-xs text-content-muted">Tidak ada akses</span>;
  return (
    <span className="text-xs text-content-secondary">
      {modules} modul · {count} aksi
    </span>
  );
}

export function RolesPage() {
  const addToast = useUiStore((s) => s.addToast);
  const { data: roles, isLoading } = useRoles();
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const deleteRole = useDeleteRole();

  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Role | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  function openCreate() {
    setEditTarget(null);
    setFormOpen(true);
  }

  function openEdit(role: Role) {
    setEditTarget(role);
    setFormOpen(true);
  }

  async function handleSubmit(data: CreateRolePayload) {
    try {
      if (editTarget) {
        await updateRole.mutateAsync({ id: editTarget._id, payload: data });
        addToast({ type: "success", message: `Role "${data.name}" berhasil diperbarui` });
      } else {
        await createRole.mutateAsync(data);
        addToast({ type: "success", message: `Role "${data.name}" berhasil dibuat` });
      }
      setFormOpen(false);
    } catch (e: unknown) {
      addToast({ type: "error", message: e instanceof Error ? e.message : "Gagal menyimpan role" });
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteRole.mutateAsync(deleteTarget._id);
      addToast({ type: "success", message: `Role "${deleteTarget.name}" dihapus` });
    } catch (e: unknown) {
      addToast({ type: "error", message: e instanceof Error ? e.message : "Gagal menghapus role" });
    } finally {
      setDeleteTarget(null);
    }
  }

  const isMutating = createRole.isPending || updateRole.isPending;

  return (
    <div className="p-6 space-y-5">
      <PageHeader
        title="Role Management"
        description="Buat dan kelola role dengan permission per modul"
      >
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-opacity rounded-lg bg-primary text-primary-fg hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          Buat Role
        </button>
      </PageHeader>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : !roles?.length ? (
        <EmptyState icon={KeyRound} title="Belum ada role" description="Buat role pertama kamu" />
      ) : (
        <DataTable>
          <thead>
            <tr className={tHead}>
              <th className={tH}>Nama</th>
              <th className={tH}>Tipe</th>
              <th className={tH}>Permission</th>
              <th className={tH}>Deskripsi</th>
              <th className={tH} />
            </tr>
          </thead>
          <tbody>
              {roles.map((role) => (
                <tr key={role._id} className={tRow}>
                  <td className={tD}>
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-4 h-4 text-content-muted shrink-0" />
                      <span className="font-medium text-content">{role.name}</span>
                    </div>
                  </td>
                  <td className={tD}>
                    {role.isSystem ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-surface-elevated text-content-muted ring-1 ring-surface-border">
                        <Lock className="w-3 h-3" />
                        System
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/25">
                        Custom
                      </span>
                    )}
                  </td>
                  <td className={tD}>
                    <PermissionSummary permissions={role.permissions} />
                  </td>
                  <td className="max-w-xs px-4 py-3 text-xs truncate text-content-secondary">
                    {role.description || <span className="text-content-muted">—</span>}
                  </td>
                  <td className={tD}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(role)}
                        className="p-1.5 rounded-lg text-content-muted hover:text-content hover:bg-surface-elevated transition-colors"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {!role.isSystem && (
                        <button
                          onClick={() => setDeleteTarget(role)}
                          className="p-1.5 rounded-lg text-content-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </DataTable>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editTarget ? `Edit Role: ${editTarget.name}` : "Buat Role Baru"}
        width="xl"
      >
        <RoleForm
          role={editTarget}
          onSubmit={handleSubmit}
          onCancel={() => setFormOpen(false)}
          loading={isMutating}
        />
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Hapus Role"
        message={`Yakin ingin menghapus role "${deleteTarget?.name}"? Aksi ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus"
        loading={deleteRole.isPending}
      />
    </div>
  );
}
