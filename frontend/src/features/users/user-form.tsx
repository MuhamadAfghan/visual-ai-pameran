import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { User, RoleRef } from "../../types/user.types";
import type { CreateUserPayload, UpdateUserPayload } from "../../services/user.service";
import { useRoles } from "../roles/use-roles";
import type { UserRole } from "../../types/auth.types";

const schema = z.object({
  name: z.string().min(1, "Nama wajib diisi"),
  email: z.union([z.literal(""), z.email("Format email tidak valid")]).optional(),
  password: z
    .string()
    .refine((v) => !v || v.length >= 8, "Password minimal 8 karakter")
    .optional(),
  roleId: z.string().min(1, "Role wajib dipilih"),
  isActive: z.boolean(),
});

type FormData = z.infer<typeof schema>;

// Map role name → UserRole field (untuk super_admin bypass check)
const SYSTEM_ROLE_MAP: Record<string, UserRole> = {
  super_admin: "super_admin",
  admin: "admin",
  viewer: "viewer",
};

function getCurrentRoleId(user: User): string {
  if (user.roleId) {
    if (typeof user.roleId === "object") return (user.roleId as RoleRef)._id;
    return user.roleId as string;
  }
  return "";
}

type Props = {
  user?: User | null;
  onSubmit: (data: CreateUserPayload | UpdateUserPayload) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
};

export function UserForm({ user, onSubmit, onCancel, loading }: Props) {
  const isEditing = !!user;
  const { data: roles, isLoading: rolesLoading } = useRoles();

  const systemRoles = roles?.filter((r) => r.isSystem) ?? [];
  const customRoles = roles?.filter((r) => !r.isSystem) ?? [];

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", password: "", roleId: "", isActive: true }
  });

  // Set default roleId once roles are loaded
  useEffect(() => {
    if (user) {
      // Older users (seeded before the DB-role link) have no roleId, only the
      // legacy `role` string. Fall back to the matching system role so the
      // dropdown pre-selects instead of showing blank (which forces a re-pick).
      const resolvedRoleId =
        getCurrentRoleId(user) ||
        roles?.find((r) => r.isSystem && r.name === user.role)?._id ||
        "";
      reset({
        name: user.name,
        email: user.email,
        password: "",
        roleId: resolvedRoleId,
        isActive: user.isActive,
      });
    } else if (roles && roles.length > 0) {
      const viewerRole = roles.find((r) => r.name === "viewer" && r.isSystem);
      reset({ name: "", email: "", password: "", roleId: viewerRole?._id ?? roles[0]._id });
    }
  }, [user, roles, reset]);

  async function handleFormSubmit(data: FormData) {
    const selectedRole = roles?.find((r) => r._id === data.roleId);
    // Derive the UserRole field from the role name; default to "viewer" for custom roles
    const roleField: UserRole = selectedRole
      ? (SYSTEM_ROLE_MAP[selectedRole.name] ?? "viewer")
      : "viewer";

    if (!isEditing) {
      if (!data.email) {
        setError("email", { message: "Email wajib diisi" });
        return;
      }
      if (!data.password) {
        setError("password", { message: "Password wajib diisi" });
        return;
      }
      await onSubmit({
        name: data.name,
        email: data.email,
        password: data.password,
        role: roleField,
        roleId: data.roleId,
        isActive: data.isActive,
      } as CreateUserPayload);
    } else {
      const payload: UpdateUserPayload = {
        name: data.name,
        role: roleField,
        roleId: data.roleId,
        isActive: data.isActive,
      };
      if (data.email) payload.email = data.email;
      if (data.password) payload.password = data.password;
      await onSubmit(payload);
    }
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-5">
      {/* Name */}
      <div>
        <label className={lbl}>
          Nama <span className="text-red-500">*</span>
        </label>
        <input {...register("name")} placeholder="Nama lengkap" className={inp} />
        {errors.name && <p className={err}>{errors.name.message}</p>}
      </div>

      {/* Email */}
      <div>
        <label className={lbl}>
          Email <span className="text-red-500">*</span>
        </label>
        <input
          {...register("email")}
          type="email"
          placeholder="user@example.com"
          className={inp}
        />
        {errors.email && <p className={err}>{errors.email.message}</p>}
      </div>

      {/* Password */}
      <div>
        <label className={lbl}>
          Password{" "}
          {isEditing ? (
            <span className="text-xs font-normal text-content-muted">
              (kosongkan jika tidak ingin mengubah)
            </span>
          ) : (
            <span className="text-red-500">*</span>
          )}
        </label>
        <input
          {...register("password")}
          type="password"
          placeholder={isEditing ? "Biarkan kosong untuk tidak mengubah" : "Min. 8 karakter"}
          className={inp}
          autoComplete="new-password"
        />
        {errors.password && <p className={err}>{errors.password.message}</p>}
      </div>

      {/* Role — fully dynamic from DB */}
      <div>
        <label className={lbl}>
          Role <span className="text-red-500">*</span>
        </label>
        <select {...register("roleId")} className={inp} disabled={rolesLoading}>
          {rolesLoading && <option value="">Memuat roles...</option>}
          {!rolesLoading && roles?.length === 0 && (
            <option value="">Tidak ada role — jalankan seedSystemRoles dulu</option>
          )}
          {systemRoles.length > 0 && (
            <optgroup label="System Roles">
              {systemRoles.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.name === "super_admin"
                    ? "Super Admin — akses penuh"
                    : r.name === "admin"
                      ? "Admin — kelola kamera & area"
                      : "Viewer — read-only"}
                </option>
              ))}
            </optgroup>
          )}
          {customRoles.length > 0 && (
            <optgroup label="Custom Roles">
              {customRoles.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.name}
                  {r.description ? ` — ${r.description}` : ""}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {errors.roleId && <p className={err}>{errors.roleId.message}</p>}
      </div>

      {/* Status aktif */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <input
          type="checkbox"
          {...register("isActive")}
          className="w-4 h-4 rounded border-surface-border text-primary focus:ring-primary"
        />
        <span className="text-sm text-content-secondary">
          Akun aktif
          <span className="block text-xs text-content-muted font-normal">
            User tidak aktif tidak bisa login
          </span>
        </span>
      </label>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2 border-t border-surface-border">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm transition-colors border rounded-lg text-content-secondary border-surface-border hover:bg-surface-elevated"
        >
          Batal
        </button>
        <button
          type="submit"
          disabled={loading || rolesLoading}
          className="px-5 py-2 text-sm font-medium transition-opacity rounded-lg bg-primary text-primary-fg hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "Menyimpan..." : user ? "Simpan Perubahan" : "Tambah User"}
        </button>
      </div>
    </form>
  );
}

const lbl = "block text-sm font-medium text-content-secondary mb-1.5";
const inp =
  "w-full px-3 py-2 text-sm border border-surface-border bg-surface-elevated text-content rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors placeholder:text-content-muted disabled:opacity-60 disabled:cursor-not-allowed";
const err = "text-xs text-red-500 mt-1";
