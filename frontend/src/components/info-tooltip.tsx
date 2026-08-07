import { Info } from "lucide-react";
import { cn } from "../utils/cn";

type Props = {
  text: string;
  className?: string;
  align?: "left" | "center" | "right";
};

const alignClass: Record<NonNullable<Props["align"]>, string> = {
  left: "left-0",
  center: "left-1/2 -translate-x-1/2",
  right: "right-0"
};

/**
 * Hover/focus-triggered info tooltip. CSS-only (no JS state).
 * Wrap with a parent that has `position: relative` if you need precise anchoring.
 */
export function InfoTooltip({ text, className, align = "center" }: Props) {
  return (
    <span
      tabIndex={0}
      role="button"
      aria-label="Info"
      className={cn(
        "group relative inline-flex items-center text-content-muted hover:text-primary focus:text-primary focus:outline-none transition-colors",
        className
      )}
    >
      <Info className="w-3.5 h-3.5" />
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute top-full mt-1.5 z-30 w-56 px-2.5 py-1.5 rounded-md",
          "bg-surface-panel border border-surface-border shadow-lg",
          "text-[11px] font-normal text-content leading-snug whitespace-normal text-left",
          "opacity-0 invisible translate-y-0.5 transition-all duration-150",
          "group-hover:opacity-100 group-hover:visible group-hover:translate-y-0",
          "group-focus:opacity-100 group-focus:visible group-focus:translate-y-0",
          alignClass[align]
        )}
      >
        {text}
      </span>
    </span>
  );
}
