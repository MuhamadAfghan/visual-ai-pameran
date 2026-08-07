import { useEffect } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MapPin, X } from "lucide-react";
import { createPortal } from "react-dom";
import type { Area } from "../../types/area.types";
import type { Section } from "../../types/section.types";
import { AutoCodeInput } from "../../components/auto-code-input";
import { suggestCode } from "../../utils/suggest-code";
import { CoordinatePicker } from "../../components/coordinate-picker";

const schema = z.object({
  code: z.string().min(1, "Kode wajib diisi"),
  name: z.string().min(1, "Nama wajib diisi"),
  description: z.string().optional(),
  location: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
  isActive: z.boolean()
});

export type AreaFormData = z.infer<typeof schema>;

export type DrawerMode =
  | { type: "newArea" }
  | { type: "newSection"; parent: Area }
  | { type: "editArea"; area: Area }
  | { type: "editSection"; section: Section };

type Props = {
  open: boolean;
  mode: DrawerMode | null;
  onClose: () => void;
  onSubmit: (data: AreaFormData) => Promise<void>;
  loading: boolean;
};

export function AreaFormDrawer({ open, mode, onClose, onSubmit, loading }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors }
  } = useForm<AreaFormData>({
    resolver: zodResolver(schema),
    defaultValues: { isActive: true, location: null }
  });

  const watchedName = useWatch({ control, name: "name" });
  const suggestedCode = suggestCode(watchedName ?? "");

  useEffect(() => {
    if (!open || !mode) return;
    if (mode.type === "editArea") {
      const a = mode.area;
      reset({ code: a.code, name: a.name, description: a.description ?? "", location: a.location ?? null, isActive: a.isActive });
    } else if (mode.type === "editSection") {
      const s = mode.section;
      reset({ code: s.code, name: s.name, description: s.description ?? "", location: s.location ?? null, isActive: s.isActive });
    } else {
      reset({ code: "", name: "", description: "", location: null, isActive: true });
    }
  }, [open, mode, reset]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open || !mode) return null;

  const isSection = mode.type === "newSection" || mode.type === "editSection";
  const isEditing = mode.type === "editArea" || mode.type === "editSection";

  const title =
    mode.type === "editArea"
      ? `Edit: ${mode.area.name}`
      : mode.type === "editSection"
      ? `Edit: ${mode.section.name}`
      : mode.type === "newSection"
      ? `Tambah Section di ${mode.parent.name}`
      : "Tambah Area Baru";

  return createPortal(
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto h-full flex flex-col bg-surface-panel border-l border-surface-border shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border flex-shrink-0">
          <h2 className="text-base font-semibold text-content">{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-content-muted hover:text-content hover:bg-surface-elevated transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto p-6 space-y-5">
          <Controller
            name="code"
            control={control}
            render={({ field }) => (
              <AutoCodeInput
                label={
                  <>
                    Kode {isSection ? "Section" : "Area"} <span className="text-red-500">*</span>
                  </>
                }
                value={field.value ?? ""}
                onChange={field.onChange}
                autoSuggest={suggestedCode}
                manualPlaceholder={isSection ? "contoh: PA-S1" : "contoh: PA"}
                helperText="Kode digenerate otomatis dari nama."
                error={errors.code?.message}
                forceManual={isEditing}
              />
            )}
          />

          <div>
            <label className={lbl}>
              Nama <span className="text-red-500">*</span>
            </label>
            <input
              {...register("name")}
              placeholder={isSection ? "contoh: Section 1 - Assembly" : "contoh: Pabrik A"}
              className={inp}
            />
            {errors.name && <p className={er}>{errors.name.message}</p>}
          </div>

          <div>
            <label className={lbl}>Deskripsi</label>
            <textarea
              {...register("description")}
              rows={3}
              placeholder="Keterangan tambahan (opsional)"
              className={`${inp} resize-none`}
            />
          </div>

          {/* Koordinat — Area: nilai default awal koordinat kamera baru di area ini
              (tetap bisa diubah per kamera). Section: lokasi section itu sendiri. */}
          <div>
            <label className={lbl}>
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {isSection ? "Lokasi Section" : "Koordinat Default Area"}
              </span>
            </label>
            <Controller
              name="location"
              control={control}
              render={({ field }) => (
                <CoordinatePicker
                  value={field.value ?? null}
                  onChange={field.onChange}
                  hint={
                    isSection
                      ? "Koordinat lokasi section ini."
                      : "Koordinat ini akan otomatis terisi pada kamera baru di area ini. Setiap kamera tetap bisa digeser sendiri."
                  }
                />
              )}
            />
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium text-content">Status Aktif</p>
              <p className="text-xs text-content-muted mt-0.5">
                {isSection ? "Section aktif jadi opsi di kamera" : "Area aktif jadi induk section"}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" {...register("isActive")} className="sr-only peer" />
              <div className="w-10 h-6 bg-surface-border rounded-full peer peer-checked:bg-primary transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
            </label>
          </div>

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
              disabled={loading}
              className="px-5 py-2 text-sm font-medium bg-primary text-primary-fg rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {loading ? "Menyimpan..." : isEditing ? "Simpan Perubahan" : "Tambah"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

const lbl = "block text-sm font-medium text-content-secondary mb-1.5";
const inp =
  "w-full px-3 py-2 text-sm border border-surface-border bg-surface-elevated text-content rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors placeholder:text-content-muted disabled:opacity-60";
const er = "text-xs text-red-500 mt-1";
