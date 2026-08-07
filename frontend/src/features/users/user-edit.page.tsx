import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { UserForm } from "./user-form";
import { useUpdateUser } from "./use-users";
import { getUserById } from "../../services/user.service";
import { useUiStore } from "../../store/ui.store";
import { Skeleton } from "../../components/skeleton";
import type { UpdateUserPayload } from "../../services/user.service";

export function UserEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const addToast = useUiStore((s) => s.addToast);
  const updateMutation = useUpdateUser();

  const { data: user, isLoading, isError } = useQuery({
    queryKey: ["users", id],
    queryFn: () => getUserById(id!),
    enabled: !!id,
  });

  async function handleSubmit(data: UpdateUserPayload) {
    if (!id) return;
    try {
      await updateMutation.mutateAsync({ id, payload: data });
      addToast({ type: "success", message: "User berhasil diperbarui" });
      navigate("/users");
    } catch {
      addToast({ type: "error", message: "Gagal menyimpan user" });
    }
  }

  return (
    <div className="p-6 max-w-xl mx-auto space-y-6">
      <button
        onClick={() => navigate("/users")}
        className="flex items-center gap-2 text-sm text-content-secondary hover:text-content transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Kembali ke User Management
      </button>

      <div>
        <h1 className="text-2xl font-semibold text-content">
          {isLoading ? <Skeleton height="1.75rem" width="200px" /> : `Edit: ${user?.name ?? ""}`}
        </h1>
        <p className="text-sm text-content-secondary mt-1">Perbarui data akun pengguna</p>
      </div>

      <div className="bg-surface-panel border border-surface-border rounded-xl p-6">
        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} height="2.5rem" />
            ))}
          </div>
        )}
        {isError && (
          <p className="text-sm text-red-500">User tidak ditemukan atau gagal dimuat.</p>
        )}
        {user && (
          <UserForm
            user={user}
            onSubmit={handleSubmit as never}
            onCancel={() => navigate("/users")}
            loading={updateMutation.isPending}
          />
        )}
      </div>
    </div>
  );
}
