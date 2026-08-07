import { useEffect, useState } from "react";
import { Wifi, WifiOff, Loader2, RefreshCw, Video } from "lucide-react";
import { Modal } from "../../components/modal";
import { testCameraConnection } from "../../services/camera.service";
import type { Camera } from "../../types/camera.types";

type Props = {
  camera: Camera | null;
  onClose: () => void;
};

type TestState = "loading" | "success" | "error";

export function CameraTestModal({ camera, onClose }: Props) {
  const [state, setState] = useState<TestState>("loading");
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [message, setMessage] = useState<string>("");

  async function runTest(id: string) {
    setState("loading");
    setSnapshot(null);
    setMessage("");
    try {
      const result = await testCameraConnection(id);
      if (result.online && result.snapshotBase64) {
        setSnapshot(result.snapshotBase64);
        setState("success");
        setMessage("Koneksi berhasil");
      } else {
        setState("error");
        // Backend prefixes ALL capture failures with "ffmpeg:" — only a real
        // ENOENT means the binary is missing. Show the actual error otherwise.
        const msg = result.message?.includes("ENOENT")
          ? "ffmpeg tidak terinstall di server"
          : result.message || "Koneksi gagal";
        setMessage(msg);
      }
    } catch {
      setState("error");
      setMessage("Gagal menghubungi server");
    }
  }

  useEffect(() => {
    if (camera) runTest(camera._id);
    // runTest is stable (defined outside effect); camera._id is the relevant trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera?._id]);

  return (
    <Modal open={!!camera} onClose={onClose} title="Test Koneksi Kamera" width="lg">
      {camera && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-content">{camera.name}</p>
              <p className="text-xs text-content-muted font-mono">{camera.code}</p>
            </div>
            {state !== "loading" && (
              <button
                onClick={() => runTest(camera._id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-surface-border rounded-lg text-content-secondary hover:bg-surface-elevated transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Ulang Test
              </button>
            )}
          </div>

          {/* Snapshot area */}
          <div className="relative rounded-lg overflow-hidden bg-surface-elevated border border-surface-border aspect-video flex items-center justify-center">
            {state === "loading" && (
              <div className="flex flex-col items-center gap-3 text-content-muted">
                <Loader2 className="w-8 h-8 animate-spin" />
                <p className="text-sm">Menghubungkan ke kamera...</p>
              </div>
            )}

            {state === "success" && snapshot && (
              <img
                src={`data:image/jpeg;base64,${snapshot}`}
                alt={`Snapshot ${camera.name}`}
                className="w-full h-full object-cover"
              />
            )}

            {state === "error" && (
              <div className="flex flex-col items-center gap-3 text-content-muted">
                <Video className="w-10 h-10 opacity-40" />
                <p className="text-sm text-content-muted">Tidak ada gambar</p>
              </div>
            )}
          </div>

          {/* Status bar */}
          {state !== "loading" && (
            <div
              className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border ${
                state === "success"
                  ? "border-green-500/30 bg-green-500/5"
                  : "border-red-500/30 bg-red-500/5"
              }`}
            >
              {state === "success" ? (
                <Wifi className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
              )}
              <p
                className={`text-xs font-medium ${
                  state === "success"
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {message}
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-surface-border rounded-lg text-content-secondary hover:bg-surface-elevated transition-colors"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
