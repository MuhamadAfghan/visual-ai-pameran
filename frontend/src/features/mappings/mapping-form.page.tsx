import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ChevronLeft, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getAiModels } from "../../services/ai-model.service";
import { getMappingById, createMapping, updateMapping } from "../../services/mapping.service";
import { getCameraById } from "../../services/camera.service";
import { getPics } from "../../services/pic.service";
import { RoiCanvas } from "./roi-canvas";
import { HandrailCanvas } from "./handrail-canvas";
import { useUiStore } from "../../store/ui.store";
import { useAuth } from "../../app/auth-provider";
import { SELECTED_CHECKS, CHECK_LABELS } from "../../types/ai-model.types";
import type { SelectedCheck } from "../../types/ai-model.types";
import type { RoiPoint, HandrailLine } from "../../services/mapping.service";

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
  isActive: z.boolean(),
  picIds: z.array(z.string())
});

type FormData = z.infer<typeof schema>;

type Props = { mode: "new" | "edit" };

export function MappingFormPage({ mode }: Props) {
  const { id: cameraId, mappingId } = useParams<{ id: string; mappingId: string }>();
  const navigate = useNavigate();
  const addToast = useUiStore((s) => s.addToast);
  const { token } = useAuth();

  const [roiPoints, setRoiPoints] = useState<RoiPoint[]>([]);
  const [stairsZone, setStairsZone] = useState<RoiPoint[]>([]);
  const [handrailLines, setHandrailLines] = useState<HandrailLine[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const streamUrl =
    token && cameraId
      ? `${API_BASE}/cameras/${cameraId}/stream?token=${encodeURIComponent(token)}`
      : null;

  const { data: camera } = useQuery({
    queryKey: ["camera", cameraId],
    queryFn: () => getCameraById(cameraId!),
    enabled: !!cameraId
  });

  const { data: models = [] } = useQuery({
    queryKey: ["ai-models"],
    queryFn: getAiModels,
    staleTime: 30_000
  });

  const { data: pics = [] } = useQuery({
    queryKey: ["pics"],
    queryFn: getPics,
    staleTime: 60_000
  });

  const { data: existingMapping, isLoading: loadingMapping } = useQuery({
    queryKey: ["mapping", cameraId, mappingId],
    queryFn: () => getMappingById(cameraId!, mappingId!),
    enabled: mode === "edit" && !!cameraId && !!mappingId
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
        picIds: [],

      }
    });

  const selectedModelId = useWatch({ control, name: "modelId" });
  const scheduleType = useWatch({ control, name: "scheduleType" });
  const watchedChecks = useWatch({ control, name: "selectedChecks" });
  const redZoneSelected = (watchedChecks ?? []).includes("red_zone_count");
  const handrailSelected = (watchedChecks ?? []).includes("handrail_count");
  const selectedModel = models.find((m) => m._id === selectedModelId);
  const isCustomModel = !!selectedModel?.isCustom;

  // Load existing mapping data for edit mode
  useEffect(() => {
    if (!existingMapping) return;
    const m = existingMapping;
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
      picIds: (m.picIds ?? []).map((p) => (typeof p === "object" ? p._id : p)),
    });
  }, [existingMapping, reset]);

  async function onSubmit(data: FormData) {
    if (!cameraId) return;
    setSubmitting(true);
    try {
      // Non-custom models can't have a customized checklist — always send the
      // model's own defaultChecks regardless of stale/tampered client state.
      const selectedChecks = isCustomModel
        ? data.selectedChecks
        : ((selectedModel?.defaultChecks as SelectedCheck[] | undefined) ?? data.selectedChecks);
      const payload = {
        modelId: data.modelId,
        isActive: data.isActive,
        selectedChecks,
        confidenceThreshold: data.confidenceThreshold,
        // roiPolygon = red zone; AI hanya pakai kalau red_zone_count dipilih.
        roiPolygon: redZoneSelected ? roiPoints : [],
        stairsZone: handrailSelected ? stairsZone : [],
        handrailLines: handrailSelected
          ? handrailLines.filter((l) => (l.points ?? []).length >= 2)
          : [],
        picIds: data.picIds,
        schedule: {
          type: data.scheduleType,
          daysOfWeek: data.scheduleType === "time_range" ? data.daysOfWeek : [],
          timeRanges:
            data.scheduleType === "time_range"
              ? [{ start: data.timeStart, end: data.timeEnd }]
              : []
        }
      };

      if (mode === "edit" && mappingId) {
        await updateMapping(cameraId, mappingId, payload);
        addToast({ type: "success", message: "Mapping berhasil diupdate" });
      } else {
        await createMapping(cameraId, payload);
        addToast({ type: "success", message: "Mapping berhasil ditambahkan" });
      }
      navigate(`/cameras/${cameraId}/mappings`);
    } catch {
      addToast({ type: "error", message: "Gagal menyimpan mapping" });
    } finally {
      setSubmitting(false);
    }
  }


  if (mode === "edit" && loadingMapping) {
    return (
      <div className="p-6 flex items-center gap-2 text-content-secondary text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Memuat mapping...
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <button
          onClick={() => navigate(`/cameras/${cameraId}/mappings`)}
          className="flex items-center gap-1.5 text-sm text-content-secondary hover:text-content mb-4 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Kembali ke Mappings
        </button>
        <h1 className="text-xl font-semibold text-content">
          {mode === "edit" ? "Edit Mapping" : "Tambah Mapping Baru"}
        </h1>
        {camera && (
          <p className="text-sm text-content-secondary mt-0.5">
            Kamera: <span className="font-medium text-content">{camera.name}</span>{" "}
            <span className="font-mono text-xs text-content-muted">({camera.code})</span>
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Model selection */}
        <div className="bg-surface-panel border border-surface-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-content">Model AI</h2>
          <div>
            <label className={lbl}>Model <span className="text-red-500">*</span></label>
            <Controller
              name="modelId"
              control={control}
              render={({ field }) => (
                <select
                  value={field.value}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    field.onChange(nextId);
                    const model = models.find((m) => m._id === nextId);
                    if (model && !model.isCustom) {
                      setValue("selectedChecks", model.defaultChecks as SelectedCheck[]);
                      setValue("confidenceThreshold", model.defaultConfThreshold);
                    }
                  }}
                  className={inp}
                >
                  <option value="">— Pilih Model —</option>
                  {models.filter((m) => m.isActive).map((m) => (
                    <option key={m._id} value={m._id}>[{m.code}] {m.name}</option>
                  ))}
                </select>
              )}
            />
            {errors.modelId && <p className={er}>{errors.modelId.message}</p>}
          </div>

          {/* Selected checks */}
          <div>
            <label className={lbl}>Detection Checks <span className="text-red-500">*</span></label>
            <p className="text-[11px] text-content-muted mb-2">
              {isCustomModel
                ? "Model Custom — checklist deteksi bisa dipilih bebas."
                : "Mengikuti default model yang dipilih. Pilih model Custom untuk checklist bebas."}
            </p>
            <Controller
              name="selectedChecks"
              control={control}
              render={({ field }) => (
                <div
                  className={`grid grid-cols-3 gap-1.5 p-3 border border-surface-border rounded-lg bg-surface-elevated ${
                    isCustomModel ? "" : "opacity-60"
                  }`}
                >
                  {SELECTED_CHECKS.map((check) => (
                    <label
                      key={check}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded ${
                        isCustomModel ? "hover:bg-surface-panel cursor-pointer" : "cursor-not-allowed"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={field.value.includes(check)}
                        disabled={!isCustomModel}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...field.value, check]
                            : field.value.filter((c) => c !== check);
                          field.onChange(next);
                        }}
                        className="rounded border-surface-border accent-primary disabled:cursor-not-allowed"
                      />
                      <span className="text-xs text-content">{CHECK_LABELS[check]}</span>
                    </label>
                  ))}
                </div>
              )}
            />
            {errors.selectedChecks && <p className={er}>{errors.selectedChecks.message}</p>}
          </div>

          {/* Confidence threshold */}
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
        <div className="bg-surface-panel border border-surface-border rounded-xl p-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-content">Area Deteksi (ROI / Zone)</h2>
            <p className="text-xs text-content-muted mt-0.5">
              Editor area muncul sesuai check yang dipilih di atas — Red Zone dan Handrail
              punya geometri masing-masing.
            </p>
          </div>

          {redZoneSelected && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-content">Red Zone (Area Terlarang)</h2>
              <p className="text-xs text-content-muted">
                Gambar polygon zona terlarang. Orang yang titik kakinya masuk zona memicu
                pelanggaran. Kosong = check di-skip (full frame tanpa zona).
              </p>
              <RoiCanvas streamUrl={streamUrl} points={roiPoints} onChange={setRoiPoints} />
            </div>
          )}

          {handrailSelected && (
            <div className={`space-y-2${redZoneSelected ? " pt-3 border-t border-surface-border" : ""}`}>
              <h2 className="text-sm font-semibold text-content">Geometri Handrail (Tangga)</h2>
              <p className="text-xs text-content-muted">
                Gambar area tangga (hijau) lalu garis pegangan/handrail (biru). Rail bisa di beberapa
                sisi — pakai "Garis baru".
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
            <p className="text-xs text-content-muted italic">
              Pilih check <span className="font-medium">Green Lane / Red Zone</span> atau{" "}
              <span className="font-medium">Handrail (Tangga)</span> di atas untuk mengatur area
              deteksi. Check lain berjalan pada seluruh frame.
            </p>
          )}
        </div>

        {/* Schedule */}
        <div className="bg-surface-panel border border-surface-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-content">Jadwal Aktif</h2>

          <div className="flex gap-4">
            {(["always", "time_range"] as const).map((t) => (
              <label key={t} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value={t}
                  {...register("scheduleType")}
                  className="accent-primary"
                />
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

        {/* PIC Selector */}
        {pics.filter((p) => p.isActive).length > 0 && (
          <div className="bg-surface-panel border border-surface-border rounded-xl p-5 space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-content">PIC Notifikasi</h2>
              <p className="text-xs text-content-muted mt-0.5">
                Pilih siapa yang dikirim notifikasi saat ada pelanggaran dari mapping ini.
                Kosongkan untuk pakai PIC default kamera.
              </p>
            </div>
            <Controller
              name="picIds"
              control={control}
              render={({ field }) => (
                <div className="border border-surface-border rounded-lg divide-y divide-surface-border max-h-48 overflow-y-auto">
                  {pics.filter((p) => p.isActive).map((pic) => {
                    const checked = field.value.includes(pic._id);
                    return (
                      <label
                        key={pic._id}
                        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-surface-elevated transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            field.onChange(
                              checked
                                ? field.value.filter((id) => id !== pic._id)
                                : [...field.value, pic._id]
                            )
                          }
                          className="w-4 h-4 rounded border-surface-border accent-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-content">{pic.name}</p>
                          <p className="text-xs text-content-muted truncate">{pic.email}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            />
          </div>
        )}

        {/* Active toggle */}
        <div className="flex items-center justify-between py-3 px-5 bg-surface-panel border border-surface-border rounded-xl">
          <p className="text-sm font-medium text-content">Status Aktif</p>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" {...register("isActive")} className="sr-only peer" />
            <div className="w-10 h-6 bg-surface-border rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/cameras/${cameraId}/mappings`)}
            className="px-4 py-2 text-sm text-content-secondary border border-surface-border rounded-lg hover:bg-surface-elevated transition-colors"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 text-sm font-medium bg-primary text-primary-fg rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting ? "Menyimpan..." : mode === "edit" ? "Simpan Perubahan" : "Tambah Mapping"}
          </button>
        </div>
      </form>
    </div>
  );
}

const lbl = "block text-sm font-medium text-content-secondary mb-1.5";
const inp = "w-full px-3 py-2 text-sm border border-surface-border bg-surface-elevated text-content rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors placeholder:text-content-muted";
const er = "text-xs text-red-500 mt-1";
