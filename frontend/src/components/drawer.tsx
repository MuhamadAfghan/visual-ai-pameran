import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../utils/cn";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: string;
};

export function Drawer({ open, onClose, title, children, width = "w-96" }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative ml-auto h-full flex flex-col bg-surface-panel border-l border-surface-border shadow-xl",
          width
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border flex-shrink-0">
            <h2 className="text-base font-semibold text-content">{title}</h2>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-7 h-7 rounded-md text-content-muted hover:text-content hover:bg-surface-elevated transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </div>
    </div>,
    document.body
  );
}
