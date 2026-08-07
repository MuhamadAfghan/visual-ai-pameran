import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Bell,
  MapPin,
  Cpu,
  Network,
  Users,
  BarChart3,
  UserCog,
  Settings2,
  ShieldAlert,
  Activity,
  ChevronLeft,
  ChevronRight,
  Map,
  KeyRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import toyotaLogo from "/assets/images/toyota_logo.png";
import { useUiStore } from "../store/ui.store";
import { useAuth } from "../app/auth-provider";
import { usePermission } from "../hooks/use-permission";
import { cn } from "../utils/cn";
import type { UserRole, PermissionModule } from "../types/auth.types";

type NavItem = {
  label: string;
  icon: LucideIcon;
  to: string;
  end?: boolean;
  minRole?: UserRole;
  requiredModule?: PermissionModule;
};

type NavGroup = {
  label: string;
  items: NavItem[];
  minRole?: UserRole;
};

const navGroups: NavGroup[] = [
  {
    label: "MONITORING",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, to: "/dashboard", requiredModule: "dashboard" },
      { label: "Live Events", icon: Bell, to: "/events", requiredModule: "events" },
    ],
  },
  {
    label: "MASTER DATA",
    items: [
      { label: "Areas", icon: MapPin, to: "/areas", requiredModule: "areas" },
      { label: "Cameras", icon: Video, to: "/cameras", end: true, requiredModule: "cameras" },
      { label: "Section Map", icon: Map, to: "/cameras/map", requiredModule: "cameras" },
      { label: "AI Models", icon: Cpu, to: "/models", minRole: "admin", requiredModule: "ai_models" },
    ],
  },
  {
    label: "CONFIGURATION",
    minRole: "admin",
    items: [
      { label: "Camera Mapping", icon: Network, to: "/schedules", requiredModule: "camera_mappings" },
      { label: "PIC Management", icon: Users, to: "/pics", requiredModule: "pics" },
    ],
  },
  {
    label: "REPORTS",
    items: [{ label: "Detection Reports", icon: BarChart3, to: "/reports" }],
  },
  {
    label: "SYSTEM",
    minRole: "super_admin",
    items: [
      { label: "User Management", icon: UserCog, to: "/users" },
      { label: "Role Management", icon: KeyRound, to: "/roles" },
      { label: "System Settings", icon: Settings2, to: "/settings" },
      { label: "Audit Log", icon: ShieldAlert, to: "/audit-logs" },
      { label: "Detection Jobs", icon: Activity, to: "/detection-jobs" },
    ],
  },
];

const roleRank: Record<UserRole, number> = { pic: -1, viewer: 0, admin: 1, super_admin: 2 };

function hasMinRole(userRole: UserRole, minRole?: UserRole): boolean {
  if (!minRole) return true;
  return roleRank[userRole] >= roleRank[minRole];
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggle = useUiStore((s) => s.toggleSidebar);
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const closeMobileNav = useUiStore((s) => s.closeMobileNav);
  const { user } = useAuth();
  const userRole = user?.role ?? "viewer";
  const { canView } = usePermission();

  return (
    <>
      {/* Mobile backdrop — tap to close the drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={closeMobileNav} />
      )}
      <aside
        className={cn(
          "flex flex-col h-screen bg-surface-panel border-r border-surface-border overflow-hidden",
          // Mobile: off-canvas drawer (full menu width, slides in/out).
          "fixed inset-y-0 left-0 z-50 w-60 transition-transform duration-200",
          // Desktop (lg+): static in flow, animate the collapse rail width instead.
          "lg:static lg:z-auto lg:flex-shrink-0 lg:transition-[width]",
          "-translate-x-full",
          mobileNavOpen && "translate-x-0",
          "lg:translate-x-0",
          collapsed && "lg:w-16"
        )}
      >
      {/* Brand + toggle */}
      <div className="flex items-center flex-shrink-0 px-3 border-b h-14 border-surface-border">
        <div className="flex items-center justify-center flex-shrink-0 w-8 h-8">
          <img src={toyotaLogo} alt="Toyota" className="h-7 w-auto object-contain" />
        </div>
        <span
          className={cn(
            "ml-2.5 text-sm font-extrabold text-content truncate flex-1",
            collapsed && "lg:hidden"
          )}
        >
          CCTV AI Detector
        </span>
        {/* Collapse rail toggle — desktop only (mobile uses the hamburger + backdrop) */}
        <button
          onClick={toggle}
          className={cn(
            "hidden lg:flex items-center justify-center w-7 h-7 rounded-md text-content-muted hover:text-content hover:bg-surface-elevated transition-colors flex-shrink-0",
            collapsed ? "mx-auto mt-0" : "ml-auto"
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto">
        {navGroups
          .filter((g) => hasMinRole(userRole, g.minRole))
          .map((group) => {
            const visibleItems = group.items.filter((item) => {
              if (!hasMinRole(userRole, item.minRole)) return false;
              if (item.requiredModule && userRole !== "super_admin" && !canView(item.requiredModule))
                return false;
              return true;
            });
            if (visibleItems.length === 0) return null;
            return (
              <div key={group.label}>
                <p
                  className={cn(
                    "px-2 mb-1 text-[10px] font-semibold tracking-wider text-content-muted uppercase",
                    collapsed && "lg:hidden"
                  )}
                >
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {visibleItems.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end}
                        onClick={closeMobileNav}
                        title={collapsed ? item.label : undefined}
                        className={({ isActive }) =>
                          cn(
                            "flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-colors",
                            isActive
                              ? "bg-primary-dim text-primary font-medium"
                              : "text-content-secondary hover:bg-surface-elevated hover:text-content"
                          )
                        }
                      >
                        <item.icon className="flex-shrink-0 w-5 h-5" />
                        <span className={cn("truncate", collapsed && "lg:hidden")}>{item.label}</span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
      </nav>
      </aside>
    </>
  );
}
