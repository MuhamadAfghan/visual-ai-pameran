import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../utils/cn";

type Props = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onChange: (page: number) => void;
};

function getPages(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "...")[] = [1];

  if (current > 3) pages.push("...");

  const lo = Math.max(2, current - 1);
  const hi = Math.min(total - 1, current + 1);
  for (let p = lo; p <= hi; p++) pages.push(p);

  if (current < total - 2) pages.push("...");
  pages.push(total);

  return pages;
}

export function Pagination({ page, limit, total, totalPages, onChange }: Props) {
  if (total === 0 || totalPages <= 1) return null;

  const from = (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const pages = getPages(page, totalPages);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border">
      <p className="text-xs text-content-muted">
        Showing{" "}
        <span className="font-medium text-content">{from}</span>
        {" "}to{" "}
        <span className="font-medium text-content">{to}</span>
        {" "}of{" "}
        <span className="font-medium text-content">{total}</span>
        {" "}entries
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="p-1.5 rounded-md text-content-muted hover:text-content hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`e${i}`} className="w-7 text-center text-xs text-content-muted select-none">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p as number)}
              className={cn(
                "min-w-[28px] h-7 px-1.5 text-xs rounded-md font-medium transition-colors",
                p === page
                  ? "bg-primary text-primary-fg"
                  : "text-content-secondary hover:bg-surface-elevated"
              )}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className="p-1.5 rounded-md text-content-muted hover:text-content hover:bg-surface-elevated disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          aria-label="Halaman berikutnya"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
