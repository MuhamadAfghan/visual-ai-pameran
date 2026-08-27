import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, Bell, Video, BarChart3, Sun, Moon, LogOut, UserCircle, User } from "lucide-react";
import toyotaLogo from "/assets/images/lumi_logo.png";
import { useAuth } from "../app/auth-provider";
import { useUiStore } from "../store/ui.store";
import { cn } from "../utils/cn";
import { NotificationBell } from "./notification-bell";
import { ViolationAudioToggle } from "./violation-audio-toggle";
import { getEvents } from "../services/event.service";

type NavLinkSpec = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  showBadge?: boolean;
};

const NAV: NavLinkSpec[] = [
  { to: "/dashboard", label: "Beranda", icon: LayoutDashboard, end: true },
  { to: "/events", label: "Event Saya", icon: Bell, showBadge: true },
  { to: "/cameras", label: "Kamera Saya", icon: Video, end: true },
  { to: "/reports", label: "Riwayat", icon: BarChart3 },
];

function useUnackCount(): number {
  const { data } = useQuery({
    queryKey: ["events", "pic-unack-count"],
    queryFn: () => getEvents({ status: "unacknowledged", isViolation: true, limit: 1 }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });
  return data?.pagination.total ?? 0;
}

export function PicTopBar() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useUiStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const unackCount = useUnackCount();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const initials = user?.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <header className="h-14 flex-shrink-0 flex items-center px-4 border-b border-surface-border bg-surface-panel/80 backdrop-blur-sm z-50 sticky top-0">
      {/* Brand */}
      <button
        onClick={() => navigate("/dashboard")}
        className="flex items-center gap-2.5 mr-6 flex-shrink-0"
      >
        <img src={toyotaLogo} alt="Toyota" className="h-7 w-auto object-contain" />
        <span className="text-sm font-semibold text-content hidden sm:inline">CCTV Detector</span>
        <span className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          PIC
        </span>
      </button>

      {/* Center nav (desktop only) */}
      <nav className="hidden md:flex items-center gap-1 flex-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const showBadge = item.showBadge && unackCount > 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive
                    ? "text-primary font-semibold bg-primary-dim"
                    : "text-content-secondary hover:text-content hover:bg-surface-elevated"
                )
              }
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
              {showBadge && (
                <span className="ml-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold leading-none">
                  {unackCount > 99 ? "99+" : unackCount}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Right controls */}
      <div className="flex items-center gap-2 ml-auto">
        <NotificationBell />

        <ViolationAudioToggle />

        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-content-secondary hover:text-content hover:bg-surface-elevated transition-colors"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-surface-elevated transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-primary-dim flex items-center justify-center text-primary text-xs font-semibold">
              {initials ?? <User className="w-4 h-4" />}
            </div>
            {user && (
              <div className="text-left hidden lg:block">
                <p className="text-xs font-medium text-content leading-tight">{user.name}</p>
                <p className="text-[10px] text-content-muted leading-tight">PIC</p>
              </div>
            )}
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-56 rounded-xl border border-surface-border bg-surface-panel shadow-lg z-50 py-1.5 overflow-hidden">
              {user && (
                <div className="px-3 py-2 border-b border-surface-border">
                  <p className="text-sm font-medium text-content truncate">{user.name}</p>
                  <p className="text-xs text-content-muted truncate">{user.email}</p>
                </div>
              )}
              <button
                onClick={() => { setMenuOpen(false); navigate("/profile"); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-content-secondary hover:bg-surface-elevated hover:text-content transition-colors"
              >
                <UserCircle className="w-4 h-4" />
                Profil &amp; Password
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-content-secondary hover:bg-surface-elevated hover:text-content transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
