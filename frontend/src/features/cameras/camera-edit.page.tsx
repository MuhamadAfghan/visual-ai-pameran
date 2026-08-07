import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { CameraForm, type CameraFormData } from "./camera-form";
import { useUpdateCamera } from "./use-cameras";
import { getCameraById } from "../../services/camera.service";
import { useUiStore } from "../../store/ui.store";
import { Skeleton } from "../../components/skeleton";
import { MappingsSection } from "../mappings/mappings-section";

export function CameraEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const addToast = useUiStore((s) => s.addToast);
  const updateMutation = useUpdateCamera();

  const { data: camera, isLoading, isError } = useQuery({
    queryKey: ["cameras", id],
    queryFn: () => getCameraById(id!),
    enabled: !!id
  });

  async function handleSubmit(data: CameraFormData) {
    if (!id) return;
    const ct = data.crowdThreshold?.trim();
    const payload = {
      ...data,
      minCaptureGapSeconds: data.minCaptureGapSeconds ? Number(data.minCaptureGapSeconds) : undefined,
      cooldownPeriod: data.cooldownPeriod ? Number(data.cooldownPeriod) : undefined,
      // null = explicitly disabled. "0" valid → preserve. Empty string = null.
      crowdThreshold: ct === "" || ct == null ? null : Number(ct)
    };
    try {
      await updateMutation.mutateAsync({ id, payload });
      addToast({ type: "success", message: "Kamera berhasil diperbarui" });
    } catch {
      addToast({ type: "error", message: "Gagal menyimpan kamera" });
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <button
        onClick={() => navigate("/cameras")}
        className="flex items-center gap-2 text-sm text-content-secondary hover:text-content transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Kembali ke Cameras
      </button>

      <div>
        <h1 className="text-2xl font-semibold text-content">
          {isLoading ? <Skeleton height="1.75rem" width="240px" /> : `Edit: ${camera?.name ?? ""}`}
        </h1>
        <p className="text-sm text-content-secondary mt-1">Ubah detail kamera CCTV</p>
      </div>

      {/* Camera form */}
      <div className="bg-surface-panel border border-surface-border rounded-xl p-6">
        {isLoading && (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height="2.5rem" />
            ))}
          </div>
        )}
        {isError && (
          <p className="text-sm text-red-500">Kamera tidak ditemukan atau gagal dimuat.</p>
        )}
        {camera && (
          <CameraForm
            camera={camera}
            onSubmit={handleSubmit}
            onCancel={() => navigate("/cameras")}
            loading={updateMutation.isPending}
          />
        )}
      </div>

      {/* Mappings section — only shown when camera is loaded */}
      {id && camera && (
        <div className="bg-surface-panel border border-surface-border rounded-xl p-6">
          <MappingsSection cameraId={id} />
        </div>
      )}

    </div>
  );
}
