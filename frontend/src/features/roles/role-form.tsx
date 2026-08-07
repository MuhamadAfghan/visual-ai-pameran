import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { RolePermissionGrid } from "./role-permission-grid";
import type { Role } from "../../types/role.types";
import type { CreateRolePayload } from "../../services/role.service";

const schema = z.object({
  name: z.string().min(1, "Nama role wajib diisi"),
  description: z.string().optional(),
  permissions: z.array(
    z.object({
      module: z.string(),
      actions: z.array(z.string()),
    })
  ),
});

type FormData = z.infer<typeof schema>;

type Props = {
  role?: Role | null;
  onSubmit: (data: CreateRolePayload) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
};

export function RoleForm({ role, onSubmit, onCancel, loading }: Props) {
  const isEditing = !!role;
  const isSystem = !!role?.isSystem;

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", permissions: [] },
  });

  useEffect(() => {
    if (role) {
      reset({ name: role.name, description: role.description ?? "", permissions: role.permissions });
    } else {
      reset({ name: "", description: "", permissions: [] });
    }
  }, [role, reset]);

  async function handleFormSubmit(data: FormData) {
    await onSubmit({
      name: data.name,
      description: data.description,
      permissions: data.permissions as CreateRolePayload["permissions"],
    });
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
      <div>
        <label className={lbl}>
          Nama Role <span className="text-red-500">*</span>
        </label>
        <input
          {...register("name")}
          placeholder="cth: Operator, Analyst"
          className={inp}
          disabled={isSystem}
        />
        {errors.name && <p className={err}>{errors.name.message}</p>}
        {isSystem && (
          <p className="text-xs text-content-muted mt-1">Nama system role tidak dapat diubah.</p>
        )}
      </div>

      <div>
        <label className={lbl}>Deskripsi</label>
        <textarea
          {...register("description")}
          placeholder="Opsional — deskripsi singkat role ini"
          rows={2}
          className={inp}
        />
      </div>

      <div>
        <label className={lbl}>Permission per Modul</label>
        <Controller
          control={control}
          name="permissions"
          render={({ field }) => (
            <RolePermissionGrid
              value={field.value as CreateRolePayload["permissions"]}
              onChange={field.onChange}
            />
          )}
        />
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-surface-border">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-content-secondary border border-surface-border rounded-lg hover:bg-surface-elevated transition-colors"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2 text-sm font-medium bg-primary text-primary-fg rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? "Menyimpan..." : isEditing ? "Simpan Perubahan" : "Buat Role"}
        </button>
      </div>
    </form>
  );
}

const lbl = "block text-sm font-medium text-content-secondary mb-1.5";
const inp =
  "w-full px-3 py-2 text-sm border border-surface-border bg-surface-elevated text-content rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors placeholder:text-content-muted disabled:opacity-60 disabled:cursor-not-allowed";
const err = "text-xs text-red-500 mt-1";
