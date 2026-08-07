import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, Check, KeyRound } from "lucide-react";
import { PicForm } from "./pic-form";
import { useCreatePic } from "./use-pics";
import { useUiStore } from "../../store/ui.store";
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
            <h2 className="text-base font-semibold text-content">PIC Berhasil Dibuat</h2>
            <p className="text-xs text-content-muted">Catat password sebelum melanjutkan</p>
          </div>
        </div>

        <p className="text-sm text-content-secondary">
          Akun login untuk <span className="font-medium text-content">{name}</span> telah dibuat.
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

        <p className="text-xs text-content-muted">
          Format password: 3 huruf nama + 3 huruf email. Password dapat direset dari halaman edit PIC.
        </p>

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

export function PicNewPage() {
  const navigate = useNavigate();
  const addToast = useUiStore((s) => s.addToast);
  const createMutation = useCreatePic();
  const [passwordModal, setPasswordModal] = useState<{ name: string; password: string } | null>(null);

  async function handleSubmit(data: PicPayload) {
    try {
      const result = await createMutation.mutateAsync(data);
      if (result.plainPassword) {
        setPasswordModal({ name: result.name ?? "", password: result.plainPassword });
      } else {
        addToast({ type: "success", message: "PIC berhasil ditambahkan" });
        navigate("/pics");
      }
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

      <div>
        <h1 className="text-2xl font-semibold text-content">Tambah PIC Baru</h1>
        <p className="mt-1 text-sm text-content-secondary">
          Daftarkan penerima notifikasi pelanggaran. Akun login akan dibuat otomatis.
        </p>
      </div>

      <div className="p-6 border bg-surface-panel border-surface-border rounded-xl">
        <PicForm
          pic={null}
          onSubmit={handleSubmit}
          onCancel={() => navigate("/pics")}
          loading={createMutation.isPending}
        />
      </div>

      {passwordModal && (
        <PasswordModal
          name={passwordModal.name}
          password={passwordModal.password}
          onClose={() => {
            setPasswordModal(null);
            addToast({ type: "success", message: "PIC berhasil ditambahkan" });
            navigate("/pics");
          }}
        />
      )}
    </div>
  );
}
