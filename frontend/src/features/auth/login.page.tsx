import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Video } from "lucide-react";
import { useAuth } from "../../app/auth-provider";
import { loginApi, loginAsGuestApi } from "../../services/auth.service";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);

  async function handleGuestLogin() {
    setGuestLoading(true);
    try {
      const { user, token } = await loginAsGuestApi();
      login(user, token, false); // guest never persists
      navigate("/guest", { replace: true });
    } catch {
      setError("Gagal masuk sebagai guest. Coba lagi.");
    } finally {
      setGuestLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user, token } = await loginApi(email, password, keepSignedIn);
      login(user, token, keepSignedIn);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen px-4 bg-surface-base">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-dim">
            <Video className="w-4 h-4 text-primary" />
          </div>
          <span className="text-base font-semibold text-content">CCTV AI Detector</span>
        </div>

        <h2 className="mb-1 text-2xl font-bold text-content">Sign In</h2>
        <p className="mb-8 text-sm text-content-secondary">
          Masukkan kredensial akun Anda untuk melanjutkan
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm px-3 py-2.5 rounded-lg bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full px-3 py-2.5 rounded-lg text-sm border border-surface-border bg-surface-panel text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-content-secondary">Password</label>
              <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                Lupa password?
              </Link>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full px-3 py-2.5 pr-10 rounded-lg text-sm border border-surface-border bg-surface-panel text-content placeholder:text-content-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                className="absolute transition-colors -translate-y-1/2 right-3 top-1/2 text-content-muted hover:text-content"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Keep me signed in */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={keepSignedIn}
              onChange={(e) => setKeepSignedIn(e.target.checked)}
              className="w-4 h-4 rounded cursor-pointer border-surface-border text-primary focus:ring-primary"
            />
            <span className="text-sm text-content-secondary">Keep me signed in</span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 mt-2 rounded-lg text-sm font-semibold bg-primary text-primary-fg hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-surface-border" />
          </div>
          <div className="relative flex justify-center">
            <span className="px-3 text-xs text-content-muted bg-surface-base">atau</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGuestLogin}
          disabled={guestLoading}
          className="w-full py-2.5 px-4 rounded-lg text-sm font-medium border border-surface-border text-content-secondary hover:bg-surface-elevated disabled:opacity-50 transition-colors cursor-pointer"
        >
          {guestLoading ? "Masuk..." : "Masuk sebagai Guest"}
        </button>
      </div>
    </div>
  );
}
