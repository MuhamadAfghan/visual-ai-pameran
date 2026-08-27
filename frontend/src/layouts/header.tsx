import { useState, useEffect, useRef } from "react";
import { Sun, Moon, LogOut, User, UserCircle, Menu } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../app/auth-provider";
import { useUiStore } from "../store/ui.store";
import { cn } from "../utils/cn";
import { NotificationBell } from "./notification-bell";
import { ViolationAudioToggle } from "./violation-audio-toggle";

const roleLabel: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  viewer: "Viewer",
  pic: "PIC",
};

export function Header() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useUiStore();
  const openMobileNav = useUiStore((s) => s.openMobileNav);
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
    <header className="h-14 flex-shrink-0 flex items-center justify-between px-4 border-b border-surface-border bg-surface-panel/80 backdrop-blur-sm z-50 sticky top-0">
      {/* Left — hamburger (mobile only); breadcrumb slot otherwise */}
      <button
        onClick={openMobileNav}
        className="flex items-center justify-center w-9 h-9 -ml-1 rounded-lg text-content-secondary hover:text-content hover:bg-surface-elevated transition-colors lg:hidden"
        title="Buka menu"
        aria-label="Buka menu navigasi"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Right controls */}
      <div className="flex items-center gap-2 ml-auto">
        {/* Notification bell */}
        <NotificationBell />

        {/* Violation audio alert mute toggle */}
        <ViolationAudioToggle />

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-content-secondary hover:text-content hover:bg-surface-elevated transition-colors"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Avatar / user menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-surface-elevated transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-primary-dim flex items-center justify-center text-primary text-xs font-semibold">
              {initials ?? <User className="w-4 h-4" />}
            </div>
            {user && (
              <div className="text-left hidden sm:block">
                <p className="text-xs font-medium text-content leading-tight">{user.name}</p>
                <p className="text-[10px] text-content-muted leading-tight">
                  {roleLabel[user.role] ?? user.role}
                </p>
              </div>
            )}
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div
              className={cn(
                "absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-surface-border bg-surface-panel shadow-lg z-50 py-1.5 overflow-hidden"
              )}
            >
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
