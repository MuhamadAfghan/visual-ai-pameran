import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { UserForm } from "./user-form";
import { useCreateUser } from "./use-users";
import { useUiStore } from "../../store/ui.store";
import type { CreateUserPayload } from "../../services/user.service";

export function UserNewPage() {
  const navigate = useNavigate();
  const addToast = useUiStore((s) => s.addToast);
  const createMutation = useCreateUser();

  async function handleSubmit(data: CreateUserPayload) {
    try {
      await createMutation.mutateAsync(data);
      addToast({ type: "success", message: "User berhasil ditambahkan" });
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
        <h1 className="text-2xl font-semibold text-content">Tambah User Baru</h1>
        <p className="text-sm text-content-secondary mt-1">Buat akun pengguna sistem baru</p>
      </div>

      <div className="bg-surface-panel border border-surface-border rounded-xl p-6">
        <UserForm
          user={null}
          onSubmit={handleSubmit as never}
          onCancel={() => navigate("/users")}
          loading={createMutation.isPending}
        />
      </div>
    </div>
  );
}
