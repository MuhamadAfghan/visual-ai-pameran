import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutGrid, Activity, Map, LogOut, Sun, Moon } from "lucide-react";
import { useAuth } from "../app/auth-provider";
import { useGuestTheme } from "./guest-theme";
import { cn } from "../utils/cn";

const navItems = [
  { to: "/guest/cameras", label: "Camera Wall", icon: LayoutGrid },
  { to: "/guest/events", label: "Live Events", icon: Activity },
  { to: "/guest/map", label: "Map Visual", icon: Map },
];

export function GuestTopBar() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const { isDark, toggle } = useGuestTheme();
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="flex items-center h-12 px-4 border-b border-surface-border bg-surface-panel flex-shrink-0">
      {/* Logo + product label */}
      <div className="flex items-center gap-3 mr-6">
        <img
          src="/assets/images/toyota_logo.png"
          alt="Toyota"
          className="h-5 w-auto select-none"
          draggable={false}
        />
        <div className="w-px h-6 bg-surface-border" />
        <div className="leading-none">
          <p className="text-sm font-bold text-content tracking-wide">CCTV MONITOR</p>
          <p className="text-[9px] text-content-muted font-mono uppercase tracking-wider mt-0.5">
            Surveillance · Read-only
          </p>
        </div>
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-1.5 mr-6 px-2 py-1 rounded bg-red-500/10 border border-red-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[10px] font-bold text-red-400 font-mono uppercase tracking-wider">
          LIVE
        </span>
      </div>

      {/* Nav tabs */}
      <nav className="flex items-center flex-1 gap-1">
        {navItems.map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors",
                active
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-content-secondary hover:text-content hover:bg-surface-elevated border border-transparent"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Live clock */}
        <div className="hidden md:block text-right leading-none mr-1">
          <p className="text-[9px] font-mono text-content-muted uppercase tracking-wider">
            {now.toLocaleDateString("id-ID", {
              weekday: "short",
              day: "2-digit",
              month: "short",
            })}
          </p>
          <p className="text-xs font-mono font-bold text-content mt-0.5">
            {now.toLocaleTimeString("id-ID", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </p>
        </div>

        <div className="w-px h-6 bg-surface-border" />

        {/* Theme toggle */}
        <button
          onClick={toggle}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className="flex items-center justify-center w-8 h-8 rounded border border-surface-border text-content-muted hover:text-content hover:bg-surface-elevated transition-colors"
        >
          {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>

        {/* User info */}
        <div className="text-right hidden lg:block leading-none px-2">
          <p className="text-xs font-medium text-content">{user?.name ?? "Guest"}</p>
          <p className="text-[9px] text-content-muted mt-0.5 font-mono uppercase tracking-wider">
            {user?.role ?? "viewer"}
          </p>
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          title="Keluar"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-content-muted hover:text-content-secondary hover:bg-surface-elevated transition-colors border border-surface-border"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Keluar</span>
        </button>
      </div>
    </header>
  );
}
