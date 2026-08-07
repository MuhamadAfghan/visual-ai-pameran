import { useState, type FormEvent } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Video, Eye, EyeOff, ArrowLeft, CheckCircle } from "lucide-react";
import { resetPasswordApi } from "../../services/auth.service";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // No token — show error immediately
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-base px-4">
        <div className="w-full max-w-sm text-center">
          <p className="text-content-secondary text-sm mb-4">
            Link reset password tidak valid atau sudah kedaluwarsa.
          </p>
          <Link to="/forgot-password" className="text-sm text-primary hover:underline">
            Minta link baru
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password minimal 8 karakter.");
      return;
    }

    setLoading(true);
    try {
      await resetPasswordApi(token, newPassword);
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 3000);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Link tidak valid atau sudah kedaluwarsa."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-dim">
            <Video className="w-4 h-4 text-primary" />
          </div>
          <span className="text-base font-semibold text-content">CCTV AI Detector</span>
        </div>

        {done ? (
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle className="w-12 h-12 text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-content mb-2">Password Direset!</h2>
            <p className="text-sm text-content-secondary">
              Password baru Anda berhasil disimpan. Mengalihkan ke halaman login...
            </p>
          </div>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-content mb-1">Reset Password</h2>
            <p className="text-sm text-content-secondary mb-8">
              Buat password baru untuk akun Anda.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="text-sm px-3 py-2.5 rounded-lg bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">
                  Password Baru
                </label>
                <div className="relative">
                  <input
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="Min. 8 karakter"
                    className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm border border-surface-border bg-surface-panel text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
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
                <label className="block text-sm font-medium text-content-secondary mb-1.5">
                  Konfirmasi Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="Ulangi password baru"
                    className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm border border-surface-border bg-surface-panel text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
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

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold bg-primary text-primary-fg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {loading ? "Menyimpan..." : "Simpan Password Baru"}
              </button>
            </form>

            <div className="mt-6 text-center">
              <Link
                to="/login"
                className="flex items-center justify-center gap-1.5 text-sm text-content-secondary hover:text-content transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Kembali ke login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
