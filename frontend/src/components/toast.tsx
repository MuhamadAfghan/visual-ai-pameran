import { CheckCircle, XCircle, Info, X } from "lucide-react";
import { useUiStore, type Toast } from "../store/ui.store";
import { cn } from "../utils/cn";

const config = {
  success: { icon: CheckCircle, className: "border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 text-green-700 dark:text-green-400" },
  error: { icon: XCircle, className: "border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 text-red-700 dark:text-red-400" },
  info: { icon: Info, className: "border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-800 text-blue-700 dark:text-blue-400" }
};

function ToastItem({ toast }: { toast: Toast }) {
  const removeToast = useUiStore((s) => s.removeToast);
  const { icon: Icon, className } = config[toast.type];

  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      aria-live={toast.type === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      className={cn("flex items-start gap-3 px-4 py-3 rounded-xl border shadow-md min-w-72 max-w-sm", className)}
    >
      <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
      <p className="text-sm flex-1">{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        aria-label="Tutup notifikasi"
        className="flex-shrink-0 opacity-60 hover:opacity-100"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useUiStore((s) => s.toasts);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
