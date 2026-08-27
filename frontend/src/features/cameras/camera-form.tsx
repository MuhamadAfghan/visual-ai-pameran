import { useEffect, useRef, useState } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { Wifi, WifiOff, Loader2, Timer, Video, MonitorSmartphone } from "lucide-react";
import { getSections } from "../../services/section.service";
import { getPics } from "../../services/pic.service";
import { suggestCameraCode, testCameraUrl } from "../../services/camera.service";
import { getSectionId } from "../../types/camera.types";
import type { Camera } from "../../types/camera.types";
import { AutoCodeInput } from "../../components/auto-code-input";
import { InfoTooltip } from "../../components/info-tooltip";

const schema = z
  .object({
    sourceType: z.enum(["rtsp", "device"]),
    code: z.string().optional(),
    name: z.string().min(1, "Nama kamera wajib diisi"),
    sectionId: z.string().min(1, "Section wajib dipilih"),
    rtspUrl: z.string().optional(),
    brand: z.string().optional(),
    minCaptureGapSeconds: z.string().optional(),
    cooldownPeriod: z.string().optional(),
    crowdThreshold: z.string().optional(),
    defaultPicIds: z.array(z.string()).min(1, "Pilih minimal 1 PIC"),
    notes: z.string().optional(),
    isActive: z.boolean()
  })
  .superRefine((data, ctx) => {
    if (data.sourceType === "rtsp" && !data.rtspUrl?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "RTSP URL wajib diisi",
        path: ["rtspUrl"]
      });
    }
  });

export type CameraFormData = z.infer<typeof schema>;

type TestState = "idle" | "loading" | "success" | "error";

type Props = {
  camera?: Camera | null;
  onSubmit: (data: CameraFormData) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
};

export function CameraForm({ camera, onSubmit, onCancel, loading }: Props) {
  const [testState, setTestState] = useState<TestState>("idle");
  const [testSnapshot, setTestSnapshot] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  const [deviceStream, setDeviceStream] = useState<MediaStream | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { data: sections = [] } = useQuery({
    queryKey: ["sections"],
    queryFn: () => getSections({ isActive: true }),
    staleTime: 60_000
  });
  const { data: pics = [] } = useQuery({
    queryKey: ["pics"],
    queryFn: getPics,
    staleTime: 60_000
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors }
  } = useForm<CameraFormData>({
    resolver: zodResolver(schema),
    defaultValues: { sourceType: "rtsp", isActive: true, defaultPicIds: [] }
  });

  const sourceTypeValue = useWatch({ control, name: "sourceType" });
  const rtspUrlValue = useWatch({ control, name: "rtspUrl" });
  const minCaptureGapValue = useWatch({ control, name: "minCaptureGapSeconds" });
  const watchedSectionId = useWatch({ control, name: "sectionId" });

  // Auto-suggest camera code from selected section (create mode only)
  const [suggestedCode, setSuggestedCode] = useState("");
  useEffect(() => {
    if (!watchedSectionId || camera) return;
    suggestCameraCode(watchedSectionId)
      .then((code) => setSuggestedCode(code))
      .catch(() => {});
  }, [watchedSectionId, camera]);

  useEffect(() => {
    setTestState("idle");
    setTestSnapshot(null);
    setTestMessage(null);
  }, [rtspUrlValue]);

  // Stop device stream when switching back to RTSP or on unmount
  useEffect(() => {
    if (sourceTypeValue === "rtsp" && deviceStream) {
      stopDevicePreview();
    }
  }, [sourceTypeValue]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      deviceStream?.getTracks().forEach((t) => t.stop());
    };
  }, [deviceStream]);

  function stopDevicePreview() {
    deviceStream?.getTracks().forEach((t) => t.stop());
    setDeviceStream(null);
    setDeviceError(null);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function startDevicePreview() {
    setDeviceError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setDeviceStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Izin kamera ditolak. Izinkan akses kamera di browser."
          : err instanceof DOMException && err.name === "NotFoundError"
            ? "Tidak ada kamera yang terdeteksi pada device ini."
            : "Gagal mengakses kamera device.";
      setDeviceError(msg);
    }
  }

  // Attach stream to video element when both are ready
  useEffect(() => {
    if (videoRef.current && deviceStream) {
      videoRef.current.srcObject = deviceStream;
    }
  }, [deviceStream]);

  async function handleTestUrl() {
    if (!rtspUrlValue) return;
    setTestState("loading");
    setTestSnapshot(null);
    setTestMessage(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
      const result = await testCameraUrl(rtspUrlValue, controller.signal);
      if (result.online && result.snapshotBase64) {
        setTestSnapshot(result.snapshotBase64);
        setTestState("success");
        setTestMessage("Koneksi berhasil");
      } else {
        setTestState("error");
        // Backend prefixes ALL capture failures with "ffmpeg:" — only a real
        // ENOENT means the binary is missing. Show the actual error otherwise.
        const msg = result.message?.includes("ENOENT")
          ? "ffmpeg tidak terinstall di server"
          : result.message || "Koneksi gagal";
        setTestMessage(msg);
      }
    } catch {
      setTestState("error");
      if (controller.signal.aborted) {
        setTestMessage("Koneksi timeout (15 detik)");
      } else {
        setTestMessage("Gagal menghubungi server");
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  useEffect(() => {
    if (camera) {
      const picIds = (camera.defaultPicIds ?? []).map((p) =>
        typeof p === "object" && p !== null ? p._id : p
      );
      reset({
        sourceType: camera.sourceType ?? "rtsp",
        code: camera.code,
        name: camera.name,
        sectionId: getSectionId(camera),
        rtspUrl: camera.rtspUrl ?? "",
        brand: camera.brand ?? "",
        minCaptureGapSeconds: camera.minCaptureGapSeconds?.toString() ?? "",
        cooldownPeriod: camera.cooldownPeriod?.toString() ?? "",
        crowdThreshold: camera.crowdThreshold != null ? camera.crowdThreshold.toString() : "",
        defaultPicIds: picIds,
        notes: camera.notes ?? "",
        isActive: camera.isActive
      });
    } else {
      reset({
        sourceType: "rtsp",
        code: "",
        name: "",
        sectionId: "",
        rtspUrl: "",
        brand: "",
        minCaptureGapSeconds: "",
        cooldownPeriod: "",
        crowdThreshold: "",
        defaultPicIds: [],
        notes: "",
        isActive: true
      });
    }
    // Reset only when switching to a different camera record (by id), not on every
    // background refetch of the same one — for device/webcam cameras the capture
    // loop invalidates this camera's query as often as every ~100ms while it's the
    // active webcam, and resetting on every refetched object reference would wipe
    // out in-progress edits mid-keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera?._id, reset]);

  const isDevice = sourceTypeValue === "device";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Camera Code */}
        <Controller
          name="code"
          control={control}
          render={({ field }) => (
            <AutoCodeInput
              label="Kode Kamera"
              value={field.value ?? ""}
              onChange={field.onChange}
              autoSuggest={suggestedCode}
              manualPlaceholder="Misal: CAM-01-PA-001"
              helperText="Digenerate otomatis saat section dipilih."
              error={errors.code?.message}
              forceManual={!!camera}
            />
          )}
        />

        {/* Name */}
        <div>
          <label className={lbl}>
            Nama Kamera <span className="text-red-500">*</span>
          </label>
          <input {...register("name")} placeholder="Kamera Lobby Utama" className={inp} />
          {errors.name && <p className={er}>{errors.name.message}</p>}
        </div>
      </div>

      {/* Section — kamera ditempatkan di section spesifik */}
      <div>
        <label className={lbl}>
          Section <span className="text-red-500">*</span>
        </label>
        <select {...register("sectionId")} className={inp}>
          <option value="">— Pilih Section —</option>
          {(() => {
            const groups = new Map<string, { code: string; name: string; items: typeof sections }>();
            for (const s of sections) {
              const a = typeof s.areaId === "object" ? s.areaId : null;
              if (!a) continue;
              const existing = groups.get(a._id);
              if (existing) {
                existing.items.push(s);
              } else {
                groups.set(a._id, { code: a.code, name: a.name, items: [s] });
              }
            }
            return Array.from(groups.entries()).map(([aid, group]) => (
              <optgroup key={aid} label={`${group.code} · ${group.name}`}>
                {group.items.map((s) => (
                  <option key={s._id} value={s._id}>
                    [{s.code}] {s.name}
                  </option>
                ))}
              </optgroup>
            ));
          })()}
        </select>
        {errors.sectionId && <p className={er}>{errors.sectionId.message}</p>}
        <p className="text-[11px] text-content-muted mt-1">
          Kamera ditempatkan di section spesifik di bawah area.
        </p>
      </div>

      {/* Source type + RTSP URL / Device Camera */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className={`${lbl} mb-0`}>
            {isDevice ? (
              "Sumber Video"
            ) : (
              <>
                RTSP URL <span className="text-red-500">*</span>
              </>
            )}
          </label>
          <button
            type="button"
            onClick={() => {
              const next = isDevice ? "rtsp" : "device";
              setValue("sourceType", next, { shouldValidate: false });
              if (next === "rtsp") stopDevicePreview();
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium border border-surface-border rounded-lg text-content-secondary hover:bg-surface-elevated transition-colors"
          >
            {isDevice ? (
              <>
                <MonitorSmartphone className="w-3 h-3" />
                Pakai RTSP
              </>
            ) : (
              <>
                <Video className="w-3 h-3" />
                Pakai Kamera Device
              </>
            )}
          </button>
        </div>

        {isDevice ? (
          /* Device camera panel */
          <div className="rounded-lg border border-surface-border bg-surface-elevated/40 overflow-hidden">
            {deviceStream ? (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full max-h-52 object-cover bg-black" 
                />
                <div className="flex items-center justify-between px-3 py-2 border-t border-surface-border">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[11px] text-green-600 dark:text-green-400 font-medium">
                      Kamera aktif
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={stopDevicePreview}
                    className="text-[11px] text-content-muted hover:text-content transition-colors"
                  >
                    Stop preview
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 px-4 py-6 text-center">
                <Video className="w-8 h-8 text-content-muted opacity-50" />
                <div>
                  <p className="text-sm font-medium text-content">Kamera Device (Browser)</p>
                  <p className="text-[11px] text-content-muted mt-0.5">
                    Capture dilakukan dari kamera browser Anda saat halaman monitoring terbuka.
                  </p>
                </div>
                {deviceError && (
                  <p className="text-[11px] text-red-500">{deviceError}</p>
                )}
                <button
                  type="button"
                  onClick={startDevicePreview}
                  className="px-3 py-1.5 text-xs font-medium border border-surface-border rounded-lg text-content-secondary hover:bg-surface-elevated transition-colors"
                >
                  Aktifkan Preview Kamera
                </button>
              </div>
            )}
          </div>
        ) : (
          /* RTSP URL input */
          <>
            <div className="flex gap-2">
              <input
                {...register("rtspUrl")}
                placeholder="rtsp://192.168.1.100:554/stream"
                className={`${inp} flex-1`}
              />
              <button
                type="button"
                onClick={handleTestUrl}
                disabled={!rtspUrlValue || testState === "loading"}
                className="flex items-center gap-1.5 px-3 py-2 text-xs border border-surface-border rounded-lg text-content-secondary hover:bg-surface-elevated disabled:opacity-40 transition-colors whitespace-nowrap"
              >
                {testState === "loading" ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Testing...
                  </>
                ) : (
                  "Test Koneksi"
                )}
              </button>
            </div>
            {errors.rtspUrl && <p className={er}>{errors.rtspUrl.message}</p>}

            {/* Test result preview */}
            {testState === "success" && testSnapshot && (
              <div className="mt-3 overflow-hidden border rounded-lg border-green-500/40 bg-green-500/5">
                <div className="flex items-center gap-2 px-3 py-2 border-b bg-green-500/10 border-green-500/20">
                  <Wifi className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-xs font-medium text-green-600 dark:text-green-400">
                    {testMessage}
                  </span>
                </div>
                <img
                  src={`data:image/jpeg;base64,${testSnapshot}`}
                  alt="Snapshot kamera"
                  className="object-cover w-full max-h-52"
                />
              </div>
            )}
            {testState === "error" && (
              <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg border border-red-500/30 bg-red-500/5">
                <WifiOff className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">Koneksi gagal</p>
                  <p className="text-[11px] text-content-muted mt-0.5">{testMessage}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Brand */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <label className={`${lbl} mb-0`}>Brand</label>
            <InfoTooltip text="Merek/produsen kamera (opsional). Berguna untuk identifikasi inventaris dan troubleshooting." />
          </div>
          <input {...register("brand")} placeholder="Hikvision" className={inp} />
        </div>
        {/* Min capture gap */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <label className={`${lbl} mb-0`}>
              {isDevice ? "Interval Capture (detik)" : "Batas Minimum Capture (detik)"}
            </label>
            <InfoTooltip
              text={
                isDevice
                  ? "Jeda waktu antar pengiriman frame dari kamera browser. Semakin kecil = lebih sering deteksi tapi beban server lebih tinggi. Boleh desimal, mis. 0.5 = tiap 500ms."
                  : "Opsional. Kamera RTSP capture realtime secara continuous — isi hanya jika perlu membatasi beban ke server AI (mis. 0.5 = maksimal 1x tiap 500ms). Kosongkan / 0 = tanpa batas."
              }
            />
          </div>
          <input
            type="number"
            {...register("minCaptureGapSeconds")}
            placeholder={isDevice ? "30" : "0"}
            min={0}
            step="any"
            className={inp}
          />
        </div>
        {/* Cooldown */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <label className={`${lbl} mb-0`}>Cooldown (detik)</label>
            <InfoTooltip text="Jeda minimum sebelum event/notifikasi yang sama bisa muncul lagi dari kamera ini. Mencegah spam alert dari pelanggaran yang sama berulang." />
          </div>
          <input
            type="number"
            {...register("cooldownPeriod")}
            placeholder="60"
            min={0}
            className={inp}
          />
        </div>
        {/* Crowd Threshold */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <label className={`${lbl} mb-0`}>Batas Kepadatan</label>
            <InfoTooltip
              text="Jumlah orang maksimum sebelum alert kepadatan dipicu. Misal 10 = alert muncul saat terdeteksi >10 orang di frame."
              align="right"
            />
          </div>
          <input
            type="number"
            {...register("crowdThreshold")}
            placeholder="10"
            min={0}
            className={inp}
          />
        </div>
      </div>

      {/* Crowd threshold — aturan violation per kamera */}
      <div>
        <label className={lbl}>Threshold Crowd (Maks Orang)</label>
        <input
          type="number"
          {...register("crowdThreshold")}
          placeholder="Kosongkan untuk nonaktifkan"
          min={0}
          className={inp}
        />
        <p className="text-[11px] text-content-muted mt-1">
          Maksimum orang yang diizinkan di frame. Lebih dari nilai ini → AI fire violation{" "}
          <code className="px-1 rounded bg-surface-elevated">crowd_exceeded</code>. Kosongkan
          untuk nonaktifkan deteksi crowd di kamera ini.{" "}
          <strong>0</strong> = zero-tolerance zone (apapun yang terdeteksi langsung trigger).
        </p>
      </div>

      {/* Default PICs — wajib min 1 */}
      <div>
        <label className={lbl}>
          PIC Penerima Notifikasi <span className="text-red-500">*</span>
        </label>
        {pics.length === 0 ? (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5">
            <WifiOff className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                Belum ada PIC terdaftar
              </p>
              <p className="text-[11px] text-content-muted mt-0.5">
                Tambah PIC dulu di halaman{" "}
                <a href="/pics" className="text-primary underline">
                  PIC Management
                </a>{" "}
                sebelum membuat kamera.
              </p>
            </div>
          </div>
        ) : (
          <Controller
            name="defaultPicIds"
            control={control}
            render={({ field }) => (
              <div className="p-2 space-y-1 overflow-y-auto border rounded-lg max-h-40 border-surface-border">
                {pics.map((pic) => (
                  <label
                    key={pic._id}
                    className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-surface-elevated"
                  >
                    <input
                      type="checkbox"
                      value={pic._id}
                      checked={field.value?.includes(pic._id) ?? false}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...(field.value ?? []), pic._id]
                          : (field.value ?? []).filter((id) => id !== pic._id);
                        field.onChange(next);
                      }}
                      className="rounded border-surface-border accent-primary"
                    />
                    <span className="text-sm text-content">{pic.name}</span>
                    <span className="ml-auto text-xs text-content-muted">{pic.email}</span>
                  </label>
                ))}
              </div>
            )}
          />
        )}
        {errors.defaultPicIds && <p className={er}>{errors.defaultPicIds.message}</p>}
        <p className="text-[11px] text-content-muted mt-1">
          PIC yang dipilih akan menerima email saat ada pelanggaran dari kamera ini.
        </p>
      </div>

      {/* Notes */}
      <div>
        <label className={lbl}>Catatan</label>
        <textarea
          {...register("notes")}
          rows={2}
          className={`${inp} resize-none`}
          placeholder="Catatan tambahan..."
        />
      </div>

      {/* Active toggle — controls scheduler */}
      <div className="flex items-center justify-between px-4 py-3 border rounded-xl border-surface-border bg-surface-elevated/50">
        <div className="flex items-start gap-3">
          <Timer className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-content">Aktifkan Scheduler</p>
            <p className="text-xs text-content-muted mt-0.5">
              {isDevice
                ? "Capture berjalan saat halaman monitoring dibuka di browser."
                : Number(minCaptureGapValue) > 0
                  ? <>
                      Kamera aktif akan otomatis capture dan menjalankan inferensi AI secara realtime,
                      dengan jeda minimum{" "}
                      <span className="font-medium text-content-secondary">
                        {minCaptureGapValue} detik
                      </span>{" "}
                      antar siklus. Nonaktifkan untuk menghentikan monitoring.
                    </>
                  : "Kamera aktif akan otomatis capture dan menjalankan inferensi AI secara realtime (continuous). Nonaktifkan untuk menghentikan monitoring."}
            </p>
          </div>
        </div>
        <label className="relative inline-flex items-center flex-shrink-0 ml-4 cursor-pointer">
          <input type="checkbox" {...register("isActive")} className="sr-only peer" />
          <div className="w-10 h-6 bg-surface-border rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
        </label>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm transition-colors border rounded-lg text-content-secondary border-surface-border hover:bg-surface-elevated"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 text-sm font-medium transition-opacity rounded-lg bg-primary text-primary-fg hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Menyimpan..." : camera ? "Simpan Perubahan" : "Tambah Kamera"}
        </button>
      </div>
    </form>
  );
}

const lbl = "block text-sm font-medium text-content-secondary mb-1.5";
const inp =
  "w-full px-3 py-2 text-sm border border-surface-border bg-surface-elevated text-content rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors placeholder:text-content-muted";
const er = "text-xs text-red-500 mt-1";
