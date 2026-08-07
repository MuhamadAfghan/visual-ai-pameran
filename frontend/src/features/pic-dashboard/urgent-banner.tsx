import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";

type Props = {
  count: number;
  thresholdMinutes: number;
};

export function UrgentBanner({ count, thresholdMinutes }: Props) {
  const navigate = useNavigate();
  if (count <= 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-rose-500/40 bg-rose-500/10 animate-pulse-slow">
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-rose-500/20 text-rose-400 shrink-0">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-rose-300">
          {count} event belum di-acknowledge lebih dari {thresholdMinutes} menit
        </p>
        <p className="text-xs text-rose-300/70 mt-0.5">
          Segera tanggapi atau eskalasi ke atasan jika perlu
        </p>
      </div>
      <button
        onClick={() => navigate("/events?status=unacknowledged")}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-rose-500 text-white hover:bg-rose-600 transition-colors shrink-0"
      >
        Tanggapi
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
