import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Video, Mail, ArrowLeft, CheckCircle } from "lucide-react";
import { forgotPasswordApi } from "../../services/auth.service";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await forgotPasswordApi(email);
      setSent(true);
    } catch {
      setError("Terjadi kesalahan. Coba lagi beberapa saat.");
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

        {sent ? (
          /* ── Success state ── */
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle className="w-12 h-12 text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-content mb-2">Email Terkirim</h2>
            <p className="text-sm text-content-secondary mb-6">
              Jika akun dengan email <span className="font-medium text-content">{email}</span> terdaftar,
              link reset password telah dikirim. Periksa inbox dan folder spam Anda.
            </p>
            <Link
              to="/login"
              className="flex items-center justify-center gap-2 text-sm text-primary hover:underline"
            >
              <ArrowLeft className="w-4 h-4" /> Kembali ke halaman login
            </Link>
          </div>
        ) : (
          /* ── Form state ── */
          <>
            <h2 className="text-2xl font-bold text-content mb-1">Lupa Password?</h2>
            <p className="text-sm text-content-secondary mb-8">
              Masukkan email akun Anda. Kami akan mengirim link untuk mereset password.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="text-sm px-3 py-2.5 rounded-lg bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-content-secondary mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-muted" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm border border-surface-border bg-surface-panel text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg text-sm font-semibold bg-primary text-primary-fg hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {loading ? "Mengirim..." : "Kirim Link Reset"}
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
