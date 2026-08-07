import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Users,
  Wind,
  HardHat,
  Shirt,
  Eye,
  Hand,
  Layers,
  AlertTriangle,
  AlertCircle,
  PersonStanding,
  Smartphone,
  Bell,
  BellOff
} from "lucide-react";
import { SELECTED_CHECKS } from "../../types/ai-model.types";
import { cn } from "../../utils/cn";
import type { Pic } from "../../types/pic.types";
import type { PicPayload } from "../../services/pic.service";

const schema = z.object({
  name: z.string().min(1, "Nama PIC wajib diisi"),
  email: z.email("Format email tidak valid"),
  subscribedChecks: z.array(z.string()),
  isActive: z.boolean()
});

type FormData = z.infer<typeof schema>;

type Props = {
  pic?: Pic | null;
  onSubmit: (data: PicPayload) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
};

type CheckConfig = {
  label: string;
  icon: React.ElementType;
  bg: string;
  text: string;
  activeBg: string;
  activeText: string;
  activeBorder: string;
};

const CHECK_CONFIG: Record<string, CheckConfig> = {
  person_count:        { label: "Person",        icon: Users,         bg: "bg-surface-elevated", text: "text-content-muted", activeBg: "bg-blue-500/15",   activeText: "text-blue-400",   activeBorder: "border-blue-500/30" },
  mask_count:          { label: "Mask",           icon: Wind,          bg: "bg-surface-elevated", text: "text-content-muted", activeBg: "bg-purple-500/15", activeText: "text-purple-400", activeBorder: "border-purple-500/30" },
  helmet_count:        { label: "Helmet",         icon: HardHat,       bg: "bg-surface-elevated", text: "text-content-muted", activeBg: "bg-yellow-500/15", activeText: "text-yellow-400", activeBorder: "border-yellow-500/30" },
  vest_count:          { label: "Safety Vest",    icon: Shirt,         bg: "bg-surface-elevated", text: "text-content-muted", activeBg: "bg-orange-500/15", activeText: "text-orange-400", activeBorder: "border-orange-500/30" },
  goggles_count:       { label: "Goggles",        icon: Eye,           bg: "bg-surface-elevated", text: "text-content-muted", activeBg: "bg-cyan-500/15",   activeText: "text-cyan-400",   activeBorder: "border-cyan-500/30" },
  gloves_count:        { label: "Gloves",         icon: Hand,          bg: "bg-surface-elevated", text: "text-content-muted", activeBg: "bg-green-500/15",  activeText: "text-green-400",  activeBorder: "border-green-500/30" },
  ladder_count:        { label: "Ladder",         icon: Layers,        bg: "bg-surface-elevated", text: "text-content-muted", activeBg: "bg-indigo-500/15", activeText: "text-indigo-400", activeBorder: "border-indigo-500/30" },
  safety_cone_count:   { label: "Safety Cone",    icon: AlertTriangle, bg: "bg-surface-elevated", text: "text-content-muted", activeBg: "bg-amber-500/15",  activeText: "text-amber-400",  activeBorder: "border-amber-500/30" },
  fall_detected_count: { label: "Fall Detection", icon: AlertCircle,   bg: "bg-surface-elevated", text: "text-content-muted", activeBg: "bg-red-500/15",    activeText: "text-red-400",    activeBorder: "border-red-500/30" },
  hand_in_pocket_count:{ label: "Hand in Pocket", icon: PersonStanding, bg: "bg-surface-elevated", text: "text-content-muted", activeBg: "bg-rose-500/15",   activeText: "text-rose-400",   activeBorder: "border-rose-500/30" },
  holding_phone_count: { label: "Holding Phone While Walking", icon: Smartphone, bg: "bg-surface-elevated", text: "text-content-muted", activeBg: "bg-sky-500/15",    activeText: "text-sky-400",    activeBorder: "border-sky-500/30" },
};

export function PicForm({ pic, onSubmit, onCancel, loading }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    formState: { errors }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", subscribedChecks: [], isActive: true }
  });

  const subscribedChecks = watch("subscribedChecks");
  const isActive = watch("isActive");

  useEffect(() => {
    if (pic) {
      reset({
        name: pic.name,
        email: pic.email,
        subscribedChecks: pic.subscribedChecks ?? [],
        isActive: pic.isActive
      });
    } else {
      reset({ name: "", email: "", subscribedChecks: [], isActive: true });
    }
  }, [pic, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Name + Email */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={lbl}>
            Nama <span className="text-red-500">*</span>
          </label>
          <input {...register("name")} placeholder="Nama PIC" className={inp} />
          {errors.name && <p className={err}>{errors.name.message}</p>}
        </div>
        <div>
          <label className={lbl}>
            Email <span className="text-red-500">*</span>
          </label>
          <input
            {...register("email")}
            type="email"
            placeholder="pic@example.com"
            className={inp}
          />
          {errors.email && <p className={err}>{errors.email.message}</p>}
        </div>
      </div>

      {/* Subscribed Checks */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div>
            <label className={lbl + " mb-0"}>Langganan Notifikasi</label>
            <p className="text-xs text-content-muted mt-0.5">
              Kosongkan untuk menerima semua pelanggaran
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setValue("subscribedChecks", [...SELECTED_CHECKS])}
              className="text-xs text-primary hover:underline"
            >
              Pilih semua
            </button>
            <span className="text-xs text-content-muted">·</span>
            <button
              type="button"
              onClick={() => setValue("subscribedChecks", [])}
              className="text-xs text-content-muted hover:text-content hover:underline"
            >
              Kosongkan
            </button>
          </div>
        </div>

        {/* All checks = receive everything banner */}
        {subscribedChecks.length === 0 && (
          <div className="flex items-center gap-2 px-3 py-2 mb-3 text-xs border rounded-lg bg-primary/5 border-primary/20 text-primary">
            <Bell className="w-3.5 h-3.5 flex-shrink-0" />
            Menerima notifikasi untuk semua jenis pelanggaran
          </div>
        )}

        <Controller
          control={control}
          name="subscribedChecks"
          render={({ field }) => (
            <div className="grid grid-cols-3 gap-2">
              {SELECTED_CHECKS.map((check) => {
                const cfg = CHECK_CONFIG[check];
                const Icon = cfg?.icon ?? Bell;
                const active = field.value.includes(check);
                return (
                  <button
                    key={check}
                    type="button"
                    onClick={() =>
                      field.onChange(
                        active ? field.value.filter((c) => c !== check) : [...field.value, check]
                      )
                    }
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-all",
                      active
                        ? "bg-primary-dim border-primary/40 text-primary"
                        : "bg-surface-elevated border-surface-border text-content-muted hover:border-content-muted"
                    )}
                  >
                    <Icon className="flex-shrink-0 w-4 h-4" />
                    <span className="text-xs font-medium leading-tight">{cfg?.label ?? check}</span>
                  </button>
                );
              })}
            </div>
          )}
        />
      </div>

      {/* Active toggle */}
      <div
        className={cn(
          "flex items-center justify-between px-4 py-3 rounded-xl border transition-colors",
          isActive ? "bg-green-500/10 border-green-500/30" : "bg-surface-elevated border-surface-border"
        )}
      >
        <div className="flex items-center gap-3">
          {isActive ? (
            <Bell className="w-4 h-4 text-green-400" />
          ) : (
            <BellOff className="w-4 h-4 text-content-muted" />
          )}
          <div>
            <p className={cn("text-sm font-medium", isActive ? "text-green-400" : "text-content")}>
              {isActive ? "Aktif — menerima notifikasi" : "Nonaktif — tidak menerima notifikasi"}
            </p>
          </div>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" {...register("isActive")} className="sr-only peer" />
          <div className="w-10 h-6 bg-surface-border peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:bg-green-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
        </label>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-1">
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
          {loading ? "Menyimpan..." : pic ? "Simpan Perubahan" : "Tambah PIC"}
        </button>
      </div>
    </form>
  );
}

const lbl = "block text-sm font-medium text-content-secondary mb-1.5";
const inp =
  "w-full px-3 py-2 text-sm border border-surface-border bg-surface-elevated text-content rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors placeholder:text-content-muted";
const err = "text-xs text-red-500 mt-1";
