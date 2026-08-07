import { useEffect, useRef, useState } from "react";
import { Terminal, Pin, PinOff, Trash2 } from "lucide-react";
import { cn } from "../../utils/cn";
import type { LogEntry, LogLevel } from "../../types/system-health.types";

type LevelFilter = "all" | "warn" | "error";
type SourceFilter = "all" | "system" | "http" | "capture";

const levelCfg: Record<LogLevel, { label: string; badge: string }> = {
  info: { label: "INFO", badge: "bg-emerald-500/10 text-emerald-400" },
  warn: { label: "WARN", badge: "bg-amber-500/10 text-amber-400" },
  error: { label: "ERROR", badge: "bg-rose-500/10 text-rose-400" }
};

const sourceCfg: Record<LogEntry["source"], { label: string; color: string }> = {
  system: { label: "SYS", color: "text-sky-400" },
  http: { label: "HTTP", color: "text-violet-400" },
  capture: { label: "CAP", color: "text-emerald-400" }
};

function matchesFilters(entry: LogEntry, level: LevelFilter, source: SourceFilter): boolean {
  if (source !== "all" && entry.source !== source) return false;
  if (level === "warn" && entry.level === "info") return false;
  if (level === "error" && entry.level !== "error") return false;
  return true;
}

type Props = {
  logs: LogEntry[];
};

export function LogPanel({ logs }: Props) {
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [locked, setLocked] = useState(false);
  const [cleared, setCleared] = useState<string | null>(null); // ID of last entry before clear
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  const displayed = logs
    .filter((e) => {
      if (cleared !== null) {
        // Only show entries after the clear point
        if (Number(e.id) <= Number(cleared)) return false;
      }
      return matchesFilters(e, levelFilter, sourceFilter);
    });

  // Auto-scroll to bottom unless locked
  useEffect(() => {
    if (locked || userScrolledRef.current) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [displayed, locked]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32;
    userScrolledRef.current = !atBottom;
  }

  function handleClear() {
    const last = logs[logs.length - 1];
    setCleared(last?.id ?? "0");
    userScrolledRef.current = false;
  }

  function handleLockToggle() {
    setLocked((v) => {
      if (v) {
        // resuming auto-scroll → jump to bottom
        userScrolledRef.current = false;
        setTimeout(() => {
          const el = scrollRef.current;
          if (el) el.scrollTop = el.scrollHeight;
        }, 0);
      }
      return !v;
    });
  }

  const totalVisible = displayed.length;

  return (
    <div className="bg-[#0b0c0f] border border-surface-border rounded-xl overflow-hidden flex flex-col">
      {/* Header toolbar — bg is always dark, use slate colors throughout */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02] flex-wrap">
        <div className="flex items-center gap-2.5">
          <Terminal className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-widest">System Log</span>
          {totalVisible > 0 && (
            <span className="text-[10px] tabular-nums text-slate-400 bg-white/[0.06] px-1.5 py-0.5 rounded">
              {totalVisible}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Level filter */}
          <div className="flex items-center gap-1">
            {(["all", "warn", "error"] as LevelFilter[]).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setLevelFilter(lvl)}
                className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide transition-colors",
                  levelFilter === lvl
                    ? "bg-white/10 text-slate-200"
                    : "text-slate-500 hover:text-slate-300"
                )}
              >
                {lvl === "all" ? "ALL" : lvl === "warn" ? "WARN+" : "ERROR"}
              </button>
            ))}
          </div>

          <div className="w-px h-3.5 bg-white/10" />

          {/* Source filter */}
          <div className="flex items-center gap-1">
            {(["all", "system", "http", "capture"] as SourceFilter[]).map((src) => (
              <button
                key={src}
                onClick={() => setSourceFilter(src)}
                className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wide transition-colors",
                  sourceFilter === src
                    ? src === "system"
                      ? "bg-sky-500/15 text-sky-400"
                      : src === "http"
                        ? "bg-violet-500/15 text-violet-400"
                        : src === "capture"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-white/10 text-slate-200"
                    : "text-slate-500 hover:text-slate-300"
                )}
              >
                {src === "capture" ? "CAP" : src}
              </button>
            ))}
          </div>

          <div className="w-px h-3.5 bg-white/10" />

          {/* Scroll lock */}
          <button
            onClick={handleLockToggle}
            title={locked ? "Resume auto-scroll" : "Lock scroll position"}
            className={cn(
              "flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-colors",
              locked
                ? "bg-amber-500/10 text-amber-400"
                : "text-slate-500 hover:text-slate-300"
            )}
          >
            {locked ? <PinOff className="w-3 h-3" /> : <Pin className="w-3 h-3" />}
            <span className="uppercase tracking-wide font-semibold">{locked ? "Unlock" : "Lock"}</span>
          </button>

          {/* Clear */}
          <button
            onClick={handleClear}
            title="Clear log display"
            className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded text-slate-500 hover:text-rose-400 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span className="uppercase tracking-wide font-semibold">Clear</span>
          </button>
        </div>
      </div>

      {/* Log rows */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="overflow-y-auto h-72 font-mono text-[11px] leading-none"
        style={{ scrollbarWidth: "thin", scrollbarColor: "var(--surface-border) transparent" }}
      >
        {displayed.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2 text-slate-500">
              <span className="animate-pulse text-emerald-500">▊</span>
              <span>Watching for events...</span>
            </div>
          </div>
        ) : (
          <table className="w-full border-collapse">
            <tbody>
              {displayed.map((entry, i) => {
                const lCfg = levelCfg[entry.level];
                const sCfg = sourceCfg[entry.source];
                const isEven = i % 2 === 0;
                return (
                  <tr
                    key={entry.id}
                    className={cn(
                      "border-b border-surface-border/20 align-middle group",
                      isEven ? "bg-transparent" : "bg-white/[0.015]"
                    )}
                  >
                    {/* Timestamp — hardcoded light color: panel is always dark */}
                    <td className="pl-3 pr-4 py-1.5 text-slate-500 tabular-nums whitespace-nowrap w-20 shrink-0">
                      {new Date(entry.ts).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit"
                      })}
                    </td>

                    {/* Level */}
                    <td className="pr-3 py-1.5 whitespace-nowrap w-16 shrink-0">
                      <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold tracking-widest", lCfg.badge)}>
                        {lCfg.label}
                      </span>
                    </td>

                    {/* Source */}
                    <td className="pr-3 py-1.5 whitespace-nowrap w-12 shrink-0">
                      <span className={cn("text-[9px] font-bold tracking-widest uppercase", sCfg.color)}>
                        {sCfg.label}
                      </span>
                    </td>

                    {/* Message — hardcoded light color for dark panel */}
                    <td className="pr-3 py-1.5 text-slate-200 w-full">
                      <span>{entry.msg}</span>
                      {entry.meta && Object.keys(entry.meta).length > 0 && (
                        <span className="ml-2 text-slate-500 text-[10px]">
                          {Object.entries(entry.meta)
                            .filter(([, v]) => v !== undefined && v !== null)
                            .map(([k, v]) => `${k}=${String(v)}`)
                            .join(" ")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer: live indicator */}
      <div className="px-4 py-1.5 border-t border-white/[0.06] flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
        <span className="text-[10px] text-slate-500">Live · state transitions · HTTP errors · capture · email notifications</span>
      </div>
    </div>
  );
}
