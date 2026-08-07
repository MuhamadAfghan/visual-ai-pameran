import { type ReactNode } from "react";
import { Search, RefreshCw } from "lucide-react";
import { cn } from "../utils/cn";

type Props = {
  /** Search input shown on the left */
  search?: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
  };
  /** Filter controls (selects, etc.) shown on the right */
  children?: ReactNode;
  /** Optional refresh button on the far right */
  onRefresh?: () => void;
  refreshing?: boolean;
};

export function FilterBar({ search, children, onRefresh, refreshing }: Props) {
  const hasRight = children != null || onRefresh != null;

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-surface-panel border border-surface-border rounded-xl">
      {/* Left — search input */}
      {search && (
        <div className="relative min-w-48 flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted pointer-events-none" />
          <input
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder ?? "Search..."}
            className={cn(inputCls, "pl-9")}
          />
        </div>
      )}

      {/* Right — filter controls + refresh */}
      {hasRight && (
        <div className={cn("flex items-center gap-2", search && "ml-auto")}>
          {children}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary border border-primary/30 bg-primary/5 rounded-lg hover:bg-primary/10 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
              Refresh
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Consistent class for select / date / text inputs inside FilterBar */
export const filterInputCls =
  "px-3 py-2 text-sm bg-surface-panel border border-surface-border text-content rounded-lg focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-content-muted";

const inputCls =
  "w-full pr-3 py-2 text-sm bg-surface-panel border border-surface-border rounded-lg text-content placeholder:text-content-muted focus:outline-none focus:ring-1 focus:ring-primary";
