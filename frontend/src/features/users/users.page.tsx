import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  Mail,
  ShieldCheck,
  Shield,
  Eye,
  CalendarDays
} from "lucide-react";
import { PageHeader } from "../../components/page-header";
import { FilterBar } from "../../components/filter-bar";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { EmptyState } from "../../components/empty-state";
import { Skeleton } from "../../components/skeleton";
import { useUsers, useDeleteUser, useToggleUserActivation } from "./use-users";
import { useUiStore } from "../../store/ui.store";
import { useAuth } from "../../app/auth-provider";
import { cn } from "../../utils/cn";
import type { User, RoleRef } from "../../types/user.types";

const ROLE_CONFIG: Record<string, { label: string; icon: React.ElementType; badge: string }> = {
  super_admin: {
    label: "Super Admin",
    icon: ShieldCheck,
    badge: "bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/25"
  },
  admin: {
    label: "Admin",
    icon: Shield,
    badge: "bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/25"
  },
  viewer: {
    label: "Viewer",
    icon: Eye,
    badge: "bg-surface-elevated text-content-muted ring-1 ring-surface-border"
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

function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

export function UsersPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const addToast = useUiStore((s) => s.addToast);

  const isSuperAdmin = currentUser?.role === "super_admin";
  const canToggle = isSuperAdmin || currentUser?.role === "admin";

  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const { data: users = [], isLoading } = useUsers();
  const deleteMutation = useDeleteUser();
  const toggleMutation = useToggleUserActivation();

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  }, [users, search]);

  function handleToggle(u: User) {
    toggleMutation.mutate(
      { id: u._id, isActive: !u.isActive },
      {
        onSuccess: () =>
          addToast({
            type: "success",
            message: `${u.name} ${!u.isActive ? "diaktifkan" : "dinonaktifkan"}`
          }),
        onError: () => addToast({ type: "error", message: "Gagal mengubah status user" })
      }
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="User Management" description="Kelola akun pengguna sistem" />
        {isSuperAdmin && (
          <button
            onClick={() => navigate("/users/new")}
            className="flex items-center flex-shrink-0 gap-2 px-4 py-2 text-sm font-medium transition-opacity rounded-lg bg-primary text-primary-fg hover:opacity-90"
          >
            <Plus className="w-4 h-4" /> Tambah User
          </button>
        )}
      </div>

      <FilterBar
        search={{ value: search, onChange: setSearch, placeholder: "Cari nama, email, role..." }}
      />

      {/* Table */}
      <div className="overflow-hidden border bg-surface-panel border-surface-border rounded-xl">
        <div className="grid grid-cols-[2.5rem_1fr_1.4fr_9rem_10rem_7.5rem_5rem] gap-4 px-5 py-3 bg-surface-elevated border-b border-surface-border text-xs font-semibold text-content-secondary">
          <div />
          <div>Nama</div>
          <div>Email</div>
          <div>Role</div>
          <div>Status</div>
          <div className="pr-1 text-right">Aksi</div>
        </div>

        {isLoading ? (
          <div className="divide-y divide-surface-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[2.5rem_1fr_1.4fr_9rem_10rem_7.5rem_5rem] gap-4 px-5 py-4 items-center"
              >
                <Skeleton height="2rem" className="rounded-full" />
                <Skeleton height="1rem" />
                <Skeleton height="1rem" />
                <Skeleton height="1.5rem" width="5rem" className="rounded-full" />
                <Skeleton height="1.5rem" width="4.5rem" className="rounded-full" />
                <Skeleton height="1.5rem" width="4rem" className="rounded-lg" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16">
            <EmptyState
              icon={Users}
              title={search ? "Tidak ditemukan" : "Belum ada user"}
              description={
                search ? "Coba kata kunci lain" : "Klik Tambah User untuk membuat akun pertama"
              }
              action={
                isSuperAdmin && !search ? (
                  <button
                    onClick={() => navigate("/users/new")}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium transition-opacity rounded-lg bg-primary text-primary-fg hover:opacity-90"
                  >
                    <Plus className="w-4 h-4" /> Tambah User
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-surface-border">
            {filtered.map((u) => {
              const isSelf = u._id === currentUser?.id;
              const customRoleName =
                u.roleId && typeof u.roleId === "object" ? (u.roleId as RoleRef).name : null;
              const roleCfg = ROLE_CONFIG[u.role] ?? ROLE_CONFIG.viewer;
              const RoleIcon = roleCfg.icon;
              const avatarBg = avatarColor(u.name);

              return (
                <div
                  key={u._id}
                  className="grid grid-cols-[2.5rem_1fr_1.4fr_9rem_10rem_7.5rem_5rem] gap-4 px-5 py-3.5 items-center hover:bg-surface-elevated/50 transition-colors"
                >
                  {/* Avatar */}
                  <div className="relative">
                    <div
                      className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white",
                        avatarBg
                      )}
                    >
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                  </div>

                  {/* Name */}
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold truncate text-content">{u.name}</p>
                      {isSelf && (
                        <span className="text-[10px] text-content-muted bg-surface-elevated border border-surface-border px-1.5 py-0.5 rounded flex-shrink-0">
                          Anda
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <CalendarDays className="w-3 h-3 text-content-muted" />
                      <span className="text-[11px] text-content-muted">
                        {formatDate(u.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Mail className="w-3.5 h-3.5 text-content-muted flex-shrink-0" />
                    <span className="text-sm truncate text-content-muted">{u.email}</span>
                  </div>

                  {/* Role */}
                  <div>
                    {customRoleName ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/25">
                        {customRoleName}
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full",
                          roleCfg.badge
                        )}
                      >
                        <RoleIcon className="w-3 h-3" />
                        {roleCfg.label}
                      </span>
                    )}
                  </div>

                  {/* Status toggle */}
                  <div>
                    {canToggle && !isSelf ? (
                      <button
                        onClick={() => handleToggle(u)}
                        disabled={toggleMutation.isPending}
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ring-1 transition-colors disabled:opacity-50",
                          u.isActive
                            ? "bg-green-500/15 text-green-400 ring-green-500/25 hover:bg-green-500/25"
                            : "bg-surface-elevated text-content-muted ring-surface-border hover:bg-surface-border"
                        )}
                      >
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            u.isActive ? "bg-green-400" : "bg-content-muted"
                          )}
                        />
                        {u.isActive ? "Aktif" : "Nonaktif"}
                      </button>
                    ) : (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ring-1",
                          u.isActive
                            ? "bg-green-500/15 text-green-400 ring-green-500/25"
                            : "bg-surface-elevated text-content-muted ring-surface-border"
                        )}
                      >
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            u.isActive ? "bg-green-400" : "bg-content-muted"
                          )}
                        />
                        {u.isActive ? "Aktif" : "Nonaktif"}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1">
                    {isSuperAdmin && !isSelf && (
                      <>
                        <button
                          onClick={() => navigate(`/users/${u._id}/edit`)}
                          className="p-1.5 rounded-lg text-content-muted hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(u)}
                          className="p-1.5 rounded-lg text-content-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                          title="Hapus"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate(deleteTarget._id, {
            onSuccess: () => {
              addToast({ type: "success", message: `User "${deleteTarget.name}" dihapus` });
              setDeleteTarget(null);
            },
            onError: () => addToast({ type: "error", message: "Gagal menghapus user" })
          });
        }}
        title="Hapus User"
        message={`Hapus akun "${deleteTarget?.name}" (${deleteTarget?.email})? Tindakan ini tidak dapat dibatalkan.`}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
