import { Outlet } from "react-router-dom";
import { PicTopBar } from "./pic-top-bar";
import { PicBottomNav } from "./pic-bottom-nav";
import { ToastContainer } from "../components/toast";
import { SessionTimeoutGuard } from "../app/session-timeout-guard";

export function PicAppLayout() {
  return (
    <div className="flex flex-col h-screen bg-surface-base overflow-hidden">
      <SessionTimeoutGuard />
      <PicTopBar />
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <Outlet />
      </main>
      <PicBottomNav />
      <ToastContainer />
    </div>
  );
}
