import { Modal } from "./modal";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmLabel?: string;
  variant?: "danger" | "primary";
  loading?: boolean;
};

const variantClass = {
  danger: "bg-red-600 hover:bg-red-700",
  primary: "bg-primary hover:opacity-90"
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "Konfirmasi",
  message,
  confirmLabel = "Hapus",
  variant = "danger",
  loading
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="sm">
      <p className="text-sm text-content-secondary mb-6">{message}</p>
      <div className="flex items-center gap-3 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm rounded-lg border border-surface-border text-content-secondary hover:bg-surface-elevated transition-colors"
        >
          Batal
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className={`px-4 py-2 text-sm rounded-lg text-white disabled:opacity-50 transition-colors ${variantClass[variant]}`}
        >
          {loading ? "Memproses..." : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
