import { useEffect, useRef, useState, type ReactNode } from "react";
import { Sparkles, Pencil } from "lucide-react";
import { cn } from "../utils/cn";

type Props = {
  value: string;
  onChange: (v: string) => void;
  autoSuggest?: string;
  manualPlaceholder?: string;
  helperText?: string;
  error?: string;
  label: ReactNode;
  /** Edit mode — skip toggle UI, render as a plain editable input. */
  forceManual?: boolean;
  /** Override the disabled-mode placeholder. Default: "diisi otomatis". */
  autoPlaceholder?: string;
};

const LBL = "block text-sm font-medium text-content-secondary mb-1.5";
const INP_BASE =
  "w-full px-3 py-2 text-sm border border-surface-border bg-surface-elevated text-content rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors placeholder:text-content-muted";
const ERR = "text-xs text-red-500 mt-1";

export function AutoCodeInput({
  value,
  onChange,
  autoSuggest = "",
  manualPlaceholder,
  helperText,
  error,
  label,
  forceManual = false,
  autoPlaceholder = "diisi otomatis"
}: Props) {
  const [mode, setMode] = useState<"auto" | "manual">(forceManual ? "manual" : "auto");
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync value with autoSuggest while in auto mode
  useEffect(() => {
    if (mode === "auto" && !forceManual && value !== autoSuggest) {
      onChange(autoSuggest);
    }
  }, [autoSuggest, mode, forceManual, value, onChange]);

  // Edit mode: bypass entirely — plain input
  if (forceManual) {
    return (
      <div>
        <label className={LBL}>{label}</label>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={manualPlaceholder}
          className={INP_BASE}
        />
        {error && <p className={ERR}>{error}</p>}
      </div>
    );
  }

  function switchToManual() {
    setMode("manual");
    // Focus input on next tick so the disabled→enabled transition takes effect first
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function switchToAuto() {
    const userTyped = value.trim() !== "" && value !== autoSuggest;
    if (userTyped) {
      const ok = window.confirm(
        "Ganti kode dengan auto-generate? Yang Anda ketik akan hilang."
      );
      if (!ok) return;
    }
    setMode("auto");
    onChange(autoSuggest);
  }

  const isAuto = mode === "auto";
  const showAutoEmptyHint = isAuto && !autoSuggest;

  return (
    <div>
      <label className={LBL}>{label}</label>
      <div className="relative">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={isAuto}
          placeholder={isAuto ? autoPlaceholder : manualPlaceholder}
          className={cn(
            INP_BASE,
            "pr-28",
            isAuto && "cursor-not-allowed opacity-70"
          )}
        />
        <button
          type="button"
          onClick={isAuto ? switchToManual : switchToAuto}
          className={cn(
            "absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors",
            isAuto
              ? "bg-surface-panel border-surface-border text-content-secondary hover:text-primary hover:border-primary/40"
              : "bg-primary-dim border-primary/30 text-primary hover:bg-primary/20"
          )}
          title={isAuto ? "Isi manual" : "Kembali ke mode otomatis"}
        >
          {isAuto ? (
            <>
              <Pencil className="w-3 h-3" />
              Isi Manual
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3" />
              Auto
            </>
          )}
        </button>
      </div>
      {showAutoEmptyHint ? (
        <p className="text-[11px] text-content-muted mt-1">
          Lengkapi nama/section dulu untuk generate kode.
        </p>
      ) : isAuto && helperText ? (
        <p className="text-[11px] text-content-muted mt-1">{helperText}</p>
      ) : null}
      {error && <p className={ERR}>{error}</p>}
    </div>
  );
}
