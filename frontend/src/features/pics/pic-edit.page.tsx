import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, KeyRound, Copy, Check, RefreshCw } from "lucide-react";
import { PicForm } from "./pic-form";
import { useUpdatePic } from "./use-pics";
import { getPicById, resetPicPassword } from "../../services/pic.service";
import { useUiStore } from "../../store/ui.store";
import { Skeleton } from "../../components/skeleton";
import type { PicPayload } from "../../services/pic.service";

function PasswordModal({ name, password, onClose }: { name: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(password).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface-panel border border-surface-border rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-teal-500/15">
            <KeyRound className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-content">Password Berhasil Direset</h2>
            <p className="text-xs text-content-muted">Catat password baru sebelum melanjutkan</p>
          </div>
        </div>

        <p className="text-sm text-content-secondary">
          Password baru untuk <span className="font-medium text-content">{name}</span>.
          Password hanya ditampilkan sekali ini.
        </p>

        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-surface-elevated border border-surface-border">
          <code className="flex-1 text-base font-mono font-semibold text-teal-400 tracking-widest">
            {password}
          </code>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs bg-surface-panel border border-surface-border text-content-secondary hover:text-content transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Disalin" : "Salin"}
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Saya sudah mencatat password ini
        </button>
      </div>
    </div>
  );
}

export function PicEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const addToast = useUiStore((s) => s.addToast);
  const updateMutation = useUpdatePic();
  const [passwordModal, setPasswordModal] = useState<{ name: string; password: string } | null>(null);

  const { data: pic, isLoading, isError } = useQuery({
    queryKey: ["pics", id],
    queryFn: () => getPicById(id!),
    enabled: !!id,
  });

  const resetMutation = useMutation({
    mutationFn: () => resetPicPassword(id!),
    onSuccess: (data) => {
      setPasswordModal({ name: pic?.name ?? "", password: data.plainPassword });
    },
    onError: () => {
      addToast({ type: "error", message: "Gagal mereset password" });
    },
  });

  async function handleSubmit(data: PicPayload) {
    if (!id) return;
    try {
      await updateMutation.mutateAsync({ id, payload: data });
      addToast({ type: "success", message: "PIC berhasil diperbarui" });
      navigate("/pics");
    } catch {
      addToast({ type: "error", message: "Gagal menyimpan PIC" });
    }
  }

  return (
    <div className="p-6 mx-auto space-y-6">
      <button
        onClick={() => navigate("/pics")}
        className="flex items-center gap-2 text-sm transition-colors text-content-secondary hover:text-content"
      >
        <ArrowLeft className="w-4 h-4" />
        Kembali ke PIC Management
      </button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-content">
            {isLoading ? <Skeleton height="1.75rem" width="200px" /> : `Edit: ${pic?.name ?? ""}`}
          </h1>
          <p className="mt-1 text-sm text-content-secondary">
            Perbarui data dan langganan notifikasi
          </p>
        </div>
        {pic && (
          <button
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border border-surface-border text-content-secondary hover:text-content hover:border-primary/40 transition-colors disabled:opacity-50 shrink-0"
          >
            {resetMutation.isPending
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <KeyRound className="w-4 h-4" />
            }
            Reset Password
          </button>
        )}
      </div>

      <div className="p-6 border bg-surface-panel border-surface-border rounded-xl">
        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} height="2.5rem" />
            ))}
          </div>
        )}
        {isError && <p className="text-sm text-red-500">PIC tidak ditemukan atau gagal dimuat.</p>}
        {pic && (
          <PicForm
            pic={pic}
            onSubmit={handleSubmit}
            onCancel={() => navigate("/pics")}
            loading={updateMutation.isPending}
          />
        )}
      </div>

      {passwordModal && (
        <PasswordModal
          name={passwordModal.name}
          password={passwordModal.password}
          onClose={() => setPasswordModal(null)}
        />
      )}
    </div>
  );
}
