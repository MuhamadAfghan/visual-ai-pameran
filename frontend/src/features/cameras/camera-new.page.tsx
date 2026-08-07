import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { CameraForm, type CameraFormData } from "./camera-form";
import { useCreateCamera } from "./use-cameras";
import { useUiStore } from "../../store/ui.store";
import { MappingsSection } from "../mappings/mappings-section";
import { getSections } from "../../services/section.service";
import { getPics } from "../../services/pic.service";

type MissingPrereq = {
  label: string;
  description: string;
  path: string;
};

export function CameraNewPage() {
  const navigate = useNavigate();
  const addToast = useUiStore((s) => s.addToast);
  const createMutation = useCreateCamera();
  const [createdCamera, setCreatedCamera] = useState<{ _id: string; name: string } | null>(null);

  const { data: sections = [], isLoading: sectionsLoading } = useQuery({
    queryKey: ["sections"],
    queryFn: () => getSections({ isActive: true }),
    staleTime: 60_000
  });

  const { data: pics = [], isLoading: picsLoading } = useQuery({
    queryKey: ["pics"],
    queryFn: getPics,
    staleTime: 60_000
  });

  const prereqLoading = sectionsLoading || picsLoading;

  const missing: MissingPrereq[] = [];
  if (!prereqLoading) {
    if (sections.length === 0)
      missing.push({
        label: "Area & Section",
        description: "Belum ada section aktif. Kamera harus ditempatkan di sebuah section.",
        path: "/areas"
      });
    if (pics.length === 0)
      missing.push({
        label: "PIC Management",
        description: "Belum ada PIC. Kamera membutuhkan minimal 1 penanggung jawab notifikasi.",
        path: "/pics"
      });
  }

  const showPrereqBlock = !prereqLoading && missing.length > 0;

  async function handleSubmit(data: CameraFormData) {
    const ct = data.crowdThreshold?.trim();
    const payload = {
      ...data,
      minCaptureGapSeconds: data.minCaptureGapSeconds ? Number(data.minCaptureGapSeconds) : undefined,
      cooldownPeriod: data.cooldownPeriod ? Number(data.cooldownPeriod) : undefined,
      // null = explicitly disabled. "0" valid → preserve. Empty string = null.
      crowdThreshold: ct === "" || ct == null ? null : Number(ct)
    };
    try {
      const camera = await createMutation.mutateAsync(payload);
      addToast({ type: "success", message: "Kamera berhasil ditambahkan" });
      setCreatedCamera({ _id: camera._id, name: camera.name });
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
        <h1 className="text-2xl font-semibold text-content">Tambah Kamera Baru</h1>
        <p className="text-sm text-content-secondary mt-1">
          Isi detail kamera CCTV yang akan ditambahkan
        </p>
      </div>

      {/* Prerequisite block */}
      {showPrereqBlock && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="flex items-start gap-3 px-5 py-4 border-b border-amber-500/20">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-content">Data belum lengkap</p>
              <p className="text-xs text-content-muted mt-0.5">
                Lengkapi data berikut sebelum menambahkan kamera.
              </p>
            </div>
          </div>
          <div className="divide-y divide-amber-500/10">
            {missing.map((item) => (
              <div key={item.path} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium text-content">{item.label}</p>
                  <p className="text-xs text-content-muted mt-0.5">{item.description}</p>
                </div>
                <Link
                  to={item.path}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors shrink-0"
                >
                  Lengkapi
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Camera form — only shown when prerequisites are met */}
      {!showPrereqBlock && !createdCamera && !prereqLoading && (
        <div className="bg-surface-panel border border-surface-border rounded-xl p-6">
          <CameraForm
            onSubmit={handleSubmit}
            onCancel={() => navigate("/cameras")}
            loading={createMutation.isPending}
          />
        </div>
      )}

      {createdCamera && (
        <>
          {/* Camera saved confirmation */}
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-green-500/30 bg-green-500/5">
            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-content">
                Kamera <span className="font-semibold">{createdCamera.name}</span> berhasil dibuat
              </p>
              <p className="text-xs text-content-muted mt-0.5">
                Tambah model deteksi di bawah, atau klik Selesai untuk kembali.
              </p>
            </div>
            <button
              onClick={() => navigate("/cameras")}
              className="px-3 py-1.5 text-xs border border-surface-border rounded-lg text-content-secondary hover:bg-surface-elevated transition-colors shrink-0"
            >
              Selesai
            </button>
          </div>

          {/* Mappings section inline */}
          <div className="bg-surface-panel border border-surface-border rounded-xl p-6">
            <MappingsSection cameraId={createdCamera._id} />
          </div>
        </>
      )}
    </div>
  );
}
