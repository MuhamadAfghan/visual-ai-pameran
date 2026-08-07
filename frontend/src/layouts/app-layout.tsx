import { Outlet } from "react-router-dom";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { ToastContainer } from "../components/toast";
import { SessionTimeoutGuard } from "../app/session-timeout-guard";

export function AppLayout() {
  return (
    <div className="flex h-screen bg-surface-base overflow-hidden">
      <SessionTimeoutGuard />
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
