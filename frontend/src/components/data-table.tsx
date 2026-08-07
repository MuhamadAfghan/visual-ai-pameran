import { type ReactNode } from "react";

type Props = {
  children: ReactNode;
  footer?: ReactNode;
};

export function DataTable({ children, footer }: Props) {
  return (
    <div className="bg-surface-panel border border-surface-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
      {footer}
    </div>
  );
}

export const tHead = "border-b border-surface-border bg-surface-elevated";
export const tH    = "px-4 py-3 text-left text-xs font-semibold text-content-secondary";
export const tRow  = "border-b border-surface-border last:border-0 hover:bg-surface-elevated/50 transition-colors";
export const tD    = "px-4 py-3";
export const tDTop = "px-4 py-3 align-top";
