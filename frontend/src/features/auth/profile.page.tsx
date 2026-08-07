import { useState, type FormEvent } from "react";
import { User, Lock, Eye, EyeOff } from "lucide-react";
import { PageHeader } from "../../components/page-header";
import { useAuth } from "../../app/auth-provider";
import { useUiStore } from "../../store/ui.store";
import { updateProfileApi, changePasswordApi } from "../../services/auth.service";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  viewer: "Viewer"
};

function Section({
  icon: Icon,
  title,
  description,
  children
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface-panel border border-surface-border rounded-xl p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-content">{title}</h2>
          <p className="text-xs text-content-muted">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export function ProfilePage() {
  const { user, updateUser } = useAuth();
  const addToast = useUiStore((s) => s.addToast);

  // ── Edit Profile state ────────────────────────────────────────────────────────
  const [name, setName] = useState(user?.name ?? "");
  const [savingProfile, setSavingProfile] = useState(false);

  async function handleUpdateProfile(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSavingProfile(true);
    try {
      const updated = await updateProfileApi(name.trim());
      updateUser({ name: updated.name });
      addToast({ type: "success", message: "Profil berhasil diperbarui" });
    } catch {
      addToast({ type: "error", message: "Gagal memperbarui profil" });
    } finally {
      setSavingProfile(false);
    }
  }

  // ── Change Password state ─────────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword !== confirmPassword) {
      setPasswordError("Konfirmasi password tidak cocok.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Password baru minimal 8 karakter.");
      return;
    }

    setSavingPassword(true);
    try {
      await changePasswordApi(currentPassword, newPassword);
      addToast({ type: "success", message: "Password berhasil diubah" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : "Password saat ini salah."
      );
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-5">
      <PageHeader title="Profil Saya" description="Kelola informasi akun dan keamanan" />

      {/* ── Edit Profile ───────────────────────────────────────────────────────── */}
      <Section icon={User} title="Informasi Profil" description="Perbarui nama tampilan akun Anda">
        <form onSubmit={handleUpdateProfile} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Nama</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Nama lengkap"
                className={inp}
              />
            </div>
            <div>
              <label className={lbl}>Email</label>
              <input
                value={user?.email ?? ""}
                disabled
                className={`${inp} opacity-50 cursor-not-allowed`}
              />
            </div>
          </div>

          <div>
            <label className={lbl}>Role</label>
            <input
              value={ROLE_LABEL[user?.role ?? ""] ?? user?.role ?? ""}
              disabled
              className={`${inp} opacity-50 cursor-not-allowed`}
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={savingProfile || !name.trim() || name.trim() === user?.name}
              className="px-5 py-2 text-sm font-medium bg-primary text-primary-fg rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {savingProfile ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </div>
        </form>
      </Section>

      {/* ── Change Password ────────────────────────────────────────────────────── */}
      <Section icon={Lock} title="Ubah Password" description="Gunakan password yang kuat dan unik">
        <form onSubmit={handleChangePassword} className="space-y-4">
          {passwordError && (
            <div className="text-sm px-3 py-2.5 rounded-lg bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
              {passwordError}
            </div>
          )}

          <div>
            <label className={lbl}>Password Saat Ini</label>
            <div className="relative">
              <input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="Password lama"
                className={`${inp} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowCurrent((v) => !v)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content transition-colors"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Password Baru</label>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Min. 8 karakter"
                  className={`${inp} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content transition-colors"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className={lbl}>Konfirmasi Password</label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="Ulangi password baru"
                  className={`${inp} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  tabIndex={-1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-content-muted hover:text-content transition-colors"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={savingPassword}
              className="px-5 py-2 text-sm font-medium bg-primary text-primary-fg rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {savingPassword ? "Menyimpan..." : "Ubah Password"}
            </button>
          </div>
        </form>
      </Section>
    </div>
  );
}

const lbl = "block text-sm font-medium text-content-secondary mb-1.5";
const inp =
  "w-full px-3 py-2 text-sm border border-surface-border bg-surface-elevated text-content rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors placeholder:text-content-muted";
