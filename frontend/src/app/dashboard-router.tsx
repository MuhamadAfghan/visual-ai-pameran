import { useAuth } from "./auth-provider";
import { DashboardPage } from "../features/dashboard/dashboard.page";
import { PicDashboardPage } from "../features/pic-dashboard/pic-dashboard.page";

export function DashboardRouter() {
  const { user } = useAuth();
  if (user?.role === "pic") return <PicDashboardPage />;
  return <DashboardPage />;
}
