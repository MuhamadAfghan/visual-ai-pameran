import { useEffect } from "react";
import { useForm, Controller, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { SELECTED_CHECKS, CHECK_LABELS, type AiModel } from "../../types/ai-model.types";
import { AutoCodeInput } from "../../components/auto-code-input";
import { suggestCode } from "../../utils/suggest-code";

const schema = z.object({
  code: z.string().min(1, "Kode wajib diisi"),
  name: z.string().min(1, "Nama wajib diisi"),
  description: z.string().optional(),
  defaultChecks: z.array(z.enum(SELECTED_CHECKS)),
  defaultConfThreshold: z.number().min(0).max(1),
  version: z.string().optional(),
  isActive: z.boolean()
});

export type ModelFormData = z.infer<typeof schema>;

type Props = {
  model?: AiModel | null;
  onSubmit: (data: ModelFormData) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
};

export function ModelForm({ model, onSubmit, onCancel, loading }: Props) {
  const { register, handleSubmit, reset, control, formState: { errors } } = useForm<ModelFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      code: "",
      name: "",
      description: "",
      defaultChecks: [],
      defaultConfThreshold: 0.25,
      version: "1.0.0",
      isActive: true
    }
  });

  useEffect(() => {
    if (model) {
      reset({
        code: model.code,
        name: model.name,
        description: model.description ?? "",
        defaultChecks: model.defaultChecks,
        defaultConfThreshold: model.defaultConfThreshold,
        version: model.version,
        isActive: model.isActive
      });
    } else {
      reset({ code: "", name: "", description: "", defaultChecks: [], defaultConfThreshold: 0.25, version: "1.0.0", isActive: true });
    }
  }, [model, reset]);

  const watchedName = useWatch({ control, name: "name" });
  const suggestedCode = suggestCode(watchedName ?? "");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Controller
          name="code"
          control={control}
          render={({ field }) => (
            <AutoCodeInput
              label={
                <>
                  Kode <span className="text-red-500">*</span>
                </>
              }
              value={field.value ?? ""}
              onChange={field.onChange}
              autoSuggest={suggestedCode}
              manualPlaceholder="PPE_V1"
              helperText="Kode digenerate otomatis dari nama."
              error={errors.code?.message}
              forceManual={!!model}
            />
          )}
        />
        <div>
          <label className={lbl}>Versi</label>
          <input {...register("version")} placeholder="1.0.0" className={inp} />
        </div>
      </div>

      <div>
        <label className={lbl}>Nama <span className="text-red-500">*</span></label>
        <input {...register("name")} placeholder="Paket PPE Lengkap" className={inp} />
        {errors.name && <p className={er}>{errors.name.message}</p>}
      </div>

      <div>
        <label className={lbl}>Deskripsi</label>
        <textarea {...register("description")} rows={2} className={`${inp} resize-none`} placeholder="Keterangan model..." />
      </div>

      {/* Default Checks */}
      <div>
        <label className={lbl}>Default Checks</label>
        <p className="text-[11px] text-content-muted mb-2">Pilihan ini bisa diubah saat membuat mapping.</p>
        <Controller
          name="defaultChecks"
          control={control}
          render={({ field }) => (
            <div className="grid grid-cols-2 gap-1.5 p-3 border border-surface-border rounded-lg bg-surface-elevated max-h-48 overflow-y-auto">
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
      </div>

      {/* Confidence threshold */}
      <div>
        <label className={lbl}>Default Confidence Threshold</label>
        <Controller
          name="defaultConfThreshold"
          control={control}
          render={({ field }) => (
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
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

      {/* Active toggle */}
      <div className="flex items-center justify-between py-2 border-t border-surface-border">
        <p className="text-sm font-medium text-content">Status Aktif</p>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" {...register("isActive")} className="sr-only peer" />
          <div className="w-10 h-6 bg-surface-border rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
        </label>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-content-secondary border border-surface-border rounded-lg hover:bg-surface-elevated transition-colors">
          Batal
        </button>
        <button type="submit" disabled={loading} className="px-5 py-2 text-sm font-medium bg-primary text-primary-fg rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity">
          {loading ? "Menyimpan..." : model ? "Simpan Perubahan" : "Tambah Model"}
        </button>
      </div>
    </form>
  );
}

const lbl = "block text-sm font-medium text-content-secondary mb-1.5";
const inp = "w-full px-3 py-2 text-sm border border-surface-border bg-surface-elevated text-content rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors placeholder:text-content-muted";
const er = "text-xs text-red-500 mt-1";
