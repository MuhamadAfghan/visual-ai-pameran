import { useEffect, useState } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { X, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { getAiModels } from "../../services/ai-model.service";
import { getMappingById, createMapping, updateMapping } from "../../services/mapping.service";
import { RoiCanvas } from "./roi-canvas";
import { HandrailCanvas } from "./handrail-canvas";
import { useUiStore } from "../../store/ui.store";
import { useAuth } from "../../app/auth-provider";
import { SELECTED_CHECKS, CHECK_LABELS } from "../../types/ai-model.types";
import { useQueryClient } from "@tanstack/react-query";
import type { SelectedCheck } from "../../types/ai-model.types";
import type { RoiPoint, HandrailLine, CameraMapping } from "../../services/mapping.service";

const API_BASE = `${import.meta.env.VITE_API_URL ?? ""}/api/v1`;

const DAYS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const schema = z.object({
  modelId: z.string().min(1, "Model wajib dipilih"),
  selectedChecks: z.array(z.enum(SELECTED_CHECKS)).min(1, "Pilih minimal 1 check"),
  confidenceThreshold: z.number().min(0).max(1),
  scheduleType: z.enum(["always", "time_range"]),
  daysOfWeek: z.array(z.number()),
  timeStart: z.string(),
  timeEnd: z.string(),
  isActive: z.boolean()
});

type FormData = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onClose: () => void;
  cameraId: string;
  // null = new mapping, string = edit existing
  mappingId: string | null;
};

export function MappingFormDrawer({ open, onClose, cameraId, mappingId }: Props) {
  const addToast = useUiStore((s) => s.addToast);
  const qc = useQueryClient();
  const { token } = useAuth();

  const [roiPoints, setRoiPoints] = useState<RoiPoint[]>([]);
  const [stairsZone, setStairsZone] = useState<RoiPoint[]>([]);
  const [handrailLines, setHandrailLines] = useState<HandrailLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const streamUrl =
    token && cameraId
      ? `${API_BASE}/cameras/${cameraId}/stream?token=${encodeURIComponent(token)}`
      : null;

  const { data: models = [] } = useQuery({
    queryKey: ["ai-models"],
    queryFn: getAiModels,
    staleTime: 30_000
  });

  const { data: existingMapping, isLoading: loadingMapping } = useQuery({
    queryKey: ["mapping", cameraId, mappingId],
    queryFn: () => getMappingById(cameraId, mappingId!),
    enabled: !!mappingId && open
  });

  const { register, handleSubmit, control, reset, setValue, formState: { errors } } =
    useForm<FormData>({
      resolver: zodResolver(schema),
      defaultValues: {
        modelId: "",
        selectedChecks: [],
        confidenceThreshold: 0.5,
        scheduleType: "always",
        daysOfWeek: [1, 2, 3, 4, 5],
        timeStart: "08:00",
        timeEnd: "17:00",
        isActive: true,

      }
    });

  const selectedModelId = useWatch({ control, name: "modelId" });
  const scheduleType = useWatch({ control, name: "scheduleType" });
  const watchedChecks = useWatch({ control, name: "selectedChecks" });
  const redZoneSelected = (watchedChecks ?? []).includes("red_zone_count");
  const handrailSelected = (watchedChecks ?? []).includes("handrail_count");

  // Reset form when drawer opens/closes
  useEffect(() => {
    if (!open) {
      reset();
      setRoiPoints([]);
      setStairsZone([]);
      setHandrailLines([]);
    }
  }, [open, reset]);

  // Auto-fill checks from model defaults when model changes (new mode only)
  useEffect(() => {
    if (!selectedModelId || mappingId) return;
    const model = models.find((m) => m._id === selectedModelId);
    if (model?.defaultChecks?.length) {
      setValue("selectedChecks", model.defaultChecks as SelectedCheck[]);
      setValue("confidenceThreshold", model.defaultConfThreshold);
    }
  }, [selectedModelId, models, mappingId, setValue]);

  // Load existing mapping data for edit mode
  useEffect(() => {
    if (!existingMapping) return;
    const m = existingMapping as CameraMapping;
    const modelId = typeof m.modelId === "object" ? m.modelId._id : m.modelId;
    const sched = m.schedule;
    setRoiPoints(m.roiPolygon ?? []);
    setStairsZone(m.stairsZone ?? []);
    setHandrailLines(m.handrailLines ?? []);
    reset({
      modelId,
      selectedChecks: (m.selectedChecks ?? []) as SelectedCheck[],
      confidenceThreshold: m.confidenceThreshold,
      scheduleType: sched.type,
      daysOfWeek: sched.daysOfWeek ?? [1, 2, 3, 4, 5],
      timeStart: sched.timeRanges?.[0]?.start ?? "08:00",
      timeEnd: sched.timeRanges?.[0]?.end ?? "17:00",
      isActive: m.isActive,
    });
  }, [existingMapping, reset]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    try {
      const payload = {
        modelId: data.modelId,
        isActive: data.isActive,
        selectedChecks: data.selectedChecks,
        confidenceThreshold: data.confidenceThreshold,
        // roiPolygon = red zone; AI hanya pakai kalau red_zone_count dipilih.
        roiPolygon: redZoneSelected ? roiPoints : [],
        // hanya kirim geometri handrail kalau check-nya dipilih; buang garis <2 titik.
        stairsZone: handrailSelected ? stairsZone : [],
        handrailLines: handrailSelected
          ? handrailLines.filter((l) => (l.points ?? []).length >= 2)
          : [],
        schedule: {
          type: data.scheduleType,
          daysOfWeek: data.scheduleType === "time_range" ? data.daysOfWeek : [],
          timeRanges:
            data.scheduleType === "time_range"
              ? [{ start: data.timeStart, end: data.timeEnd }]
              : []
        }
      };

      if (mappingId) {
        await updateMapping(cameraId, mappingId, payload);
        addToast({ type: "success", message: "Mapping berhasil diupdate" });
      } else {
        await createMapping(cameraId, payload);
        addToast({ type: "success", message: "Mapping berhasil ditambahkan" });
      }
      qc.invalidateQueries({ queryKey: ["mappings", cameraId] });
      onClose();
    } catch {
      addToast({ type: "error", message: "Gagal menyimpan mapping" });
    } finally {
      setSubmitting(false);
    }
  }


  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto h-full flex flex-col bg-surface-panel border-l border-surface-border shadow-xl w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border flex-shrink-0">
          <h2 className="text-base font-semibold text-content">
            {mappingId ? "Edit Mapping" : "Tambah Mapping"}
          </h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-content-muted hover:text-content hover:bg-surface-elevated transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {mappingId && loadingMapping ? (
            <div className="flex items-center gap-2 p-6 text-content-secondary text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Memuat mapping...
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
              {/* Model + checks + confidence */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wide">Model AI</h3>

                <div>
                  <label className={lbl}>Model <span className="text-red-500">*</span></label>
                  <select {...register("modelId")} className={inp}>
                    <option value="">— Pilih Model —</option>
                    {models.filter((m) => m.isActive).map((m) => (
                      <option key={m._id} value={m._id}>[{m.code}] {m.name}</option>
                    ))}
                  </select>
                  {errors.modelId && <p className={er}>{errors.modelId.message}</p>}
                </div>

                <div>
                  <label className={lbl}>Detection Checks <span className="text-red-500">*</span></label>
                  <p className="text-[11px] text-content-muted mb-2">Default terisi dari model, bisa diubah per mapping.</p>
                  <Controller
                    name="selectedChecks"
                    control={control}
                    render={({ field }) => (
                      <div className="grid grid-cols-3 gap-1.5 p-3 border border-surface-border rounded-lg bg-surface-elevated">
                        {SELECTED_CHECKS.map((check) => (
                          <label key={check} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-panel cursor-pointer">
                            <input
                              type="checkbox"
                              checked={field.value.includes(check)}
                              onChange={(e) => {
                                const next = e.target.checked
                                  ? [...field.value, check]
                                  : field.value.filter((c) => c !== check);
                                field.onChange(next);
                              }}
                              className="rounded border-surface-border accent-primary"
                            />
                            <span className="text-xs text-content">{CHECK_LABELS[check]}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  />
                  {errors.selectedChecks && <p className={er}>{errors.selectedChecks.message}</p>}
                </div>

                <div>
                  <label className={lbl}>Confidence Threshold</label>
                  <Controller
                    name="confidenceThreshold"
                    control={control}
                    render={({ field }) => (
                      <div className="flex items-center gap-3">
                        <input
                          type="range" min={0} max={1} step={0.05}
                          value={field.value}
                          onChange={(e) => field.onChange(parseFloat(e.target.value))}
                          className="flex-1 accent-primary"
                        />
                        <span className="text-sm font-mono text-content w-12 text-right">
                          {(field.value * 100).toFixed(0)}%
                        </span>
                      </div>
                    )}
                  />
                </div>
              </div>

              {/* ROI + Zone */}
              <div className="space-y-3">
                <div>
                  <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wide">Area Deteksi (ROI / Zone)</h3>
                  <p className="text-[11px] text-content-muted mt-1">
                    Editor area muncul sesuai check yang dipilih — Red Zone & Handrail punya
                    geometri masing-masing.
                  </p>
                </div>

                {redZoneSelected && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wide">
                      Red Zone (Area Terlarang)
                    </h3>
                    <p className="text-[11px] text-content-muted">
                      Orang yang titik kakinya masuk zona memicu pelanggaran. Kosong = check di-skip.
                    </p>
                    <RoiCanvas streamUrl={streamUrl} points={roiPoints} onChange={setRoiPoints} />
                  </div>
                )}

                {handrailSelected && (
                  <div className={`space-y-2${redZoneSelected ? " pt-2 border-t border-surface-border" : ""}`}>
                    <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wide">
                      Geometri Handrail (Tangga)
                    </h3>
                    <p className="text-[11px] text-content-muted">
                      Gambar area tangga (hijau) lalu garis pegangan/handrail (biru). Rail bisa di
                      beberapa sisi — pakai "Garis baru".
                    </p>
                    <HandrailCanvas
                      streamUrl={streamUrl}
                      stairsZone={stairsZone}
                      handrailLines={handrailLines}
                      onChange={({ stairsZone: sz, handrailLines: hl }) => {
                        setStairsZone(sz);
                        setHandrailLines(hl);
                      }}
                    />
                  </div>
                )}

                {!redZoneSelected && !handrailSelected && (
                  <p className="text-[11px] text-content-muted italic">
                    Pilih check <span className="font-medium">Green Lane / Red Zone</span> atau{" "}
                    <span className="font-medium">Handrail (Tangga)</span> untuk mengatur area. Check
                    lain berjalan pada seluruh frame.
                  </p>
                )}
              </div>

              {/* Schedule */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold text-content-secondary uppercase tracking-wide">Jadwal Aktif</h3>

                <div className="flex gap-4">
                  {(["always", "time_range"] as const).map((t) => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" value={t} {...register("scheduleType")} className="accent-primary" />
                      <span className="text-sm text-content">
                        {t === "always" ? "Selalu aktif" : "Atur waktu"}
                      </span>
                    </label>
                  ))}
                </div>

                {scheduleType === "time_range" && (
                  <div className="space-y-3 pl-1">
                    <div>
                      <label className={lbl}>Hari aktif</label>
                      <Controller
                        name="daysOfWeek"
                        control={control}
                        render={({ field }) => (
                          <div className="flex gap-2 flex-wrap">
                            {DAYS.map((day, idx) => (
                              <label key={idx} className="cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={field.value.includes(idx)}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                      ? [...field.value, idx]
                                      : field.value.filter((d) => d !== idx);
                                    field.onChange(next.sort());
                                  }}
                                  className="sr-only peer"
                                />
                                <span className="inline-block px-3 py-1 text-xs border border-surface-border rounded-full peer-checked:bg-primary peer-checked:text-primary-fg peer-checked:border-primary transition-colors cursor-pointer">
                                  {day}
                                </span>
                              </label>
                            ))}
                          </div>
                        )}
                      />
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1">
                        <label className={lbl}>Mulai</label>
                        <input type="time" {...register("timeStart")} className={inp} />
                      </div>
                      <div className="flex-1">
                        <label className={lbl}>Selesai</label>
                        <input type="time" {...register("timeEnd")} className={inp} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between py-3 px-4 border border-surface-border rounded-xl bg-surface-elevated">
                <p className="text-sm font-medium text-content">Status Aktif</p>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" {...register("isActive")} className="sr-only peer" />
                  <div className="w-10 h-6 bg-surface-border rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
                </label>
              </div>

              {/* Footer actions */}
              <div className="flex items-center gap-3 pt-2 border-t border-surface-border">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-content-secondary border border-surface-border rounded-lg hover:bg-surface-elevated transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm font-medium bg-primary text-primary-fg rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {submitting ? "Menyimpan..." : mappingId ? "Simpan Perubahan" : "Tambah Mapping"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

const lbl = "block text-sm font-medium text-content-secondary mb-1.5";
const inp = "w-full px-3 py-2 text-sm border border-surface-border bg-surface-elevated text-content rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors";
const er = "text-xs text-red-500 mt-1";
