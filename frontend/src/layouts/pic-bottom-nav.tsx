import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, Bell, Video, BarChart3 } from "lucide-react";
import { cn } from "../utils/cn";
import { getEvents } from "../services/event.service";

type Item = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  showBadge?: boolean;
};

const ITEMS: Item[] = [
  { to: "/dashboard", label: "Beranda", icon: LayoutDashboard, end: true },
  { to: "/events", label: "Event", icon: Bell, showBadge: true },
  { to: "/cameras", label: "Kamera", icon: Video, end: true },
  { to: "/reports", label: "Riwayat", icon: BarChart3 },
];

export function PicBottomNav() {
  const { data } = useQuery({
    queryKey: ["events", "pic-unack-count"],
    queryFn: () => getEvents({ status: "unacknowledged", isViolation: true, limit: 1 }),
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
  });
  const unackCount = data?.pagination.total ?? 0;

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-50 h-16 border-t border-surface-border bg-surface-panel/95 backdrop-blur-sm flex items-stretch"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const showBadge = item.showBadge && unackCount > 0;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium relative transition-colors",
                isActive ? "text-primary" : "text-content-muted hover:text-content"
              )
            }
          >
            <div className="relative">
              <Icon className="w-5 h-5" />
              {showBadge && (
                <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-rose-500 text-white text-[9px] font-bold leading-none">
                  {unackCount > 99 ? "99+" : unackCount}
                </span>
              )}
            </div>
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
