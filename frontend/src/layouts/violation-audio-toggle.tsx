import { Volume2, VolumeX } from "lucide-react";
import { useUiStore } from "../store/ui.store";

export function ViolationAudioToggle() {
  const enabled = useUiStore((s) => s.violationAudioEnabled);
  const setEnabled = useUiStore((s) => s.setViolationAudioEnabled);

  return (
    <button
      onClick={() => setEnabled(!enabled)}
      className="relative flex items-center justify-center w-8 h-8 transition-colors rounded-lg text-content-secondary hover:text-content hover:bg-surface-elevated"
      title={enabled ? "Matikan alert suara pelanggaran" : "Aktifkan alert suara pelanggaran"}
      aria-pressed={enabled}
    >
      {enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
    </button>
  );
}
