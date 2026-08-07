import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../utils/cn";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
};

const widthMap = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl"
};

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(", ");

export function Modal({ open, onClose, title, children, width = "md" }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Save element that had focus before modal opened
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Move focus into modal on open
    const first = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)[0];
    first?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key !== "Tab") return;

      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Restore focus to the element that triggered the modal
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        className={cn(
          "relative w-full flex flex-col max-h-[90vh] rounded-2xl border border-surface-border bg-surface-panel shadow-xl",
          widthMap[width]
        )}
      >
        {title && (
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-surface-border">
            <h2 id="modal-title" className="text-base font-semibold text-content">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Tutup"
              className="flex items-center justify-center w-7 h-7 rounded-md text-content-muted hover:text-content hover:bg-surface-elevated transition-colors"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
    </div>,
    document.body
  );
}
