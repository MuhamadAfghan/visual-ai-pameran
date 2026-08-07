import { useState } from "react";
import { Outlet } from "react-router-dom";
import { GuestTopBar } from "./guest-top-bar";
import { GuestThemeContext } from "./guest-theme";
import { ToastContainer } from "../components/toast";

const STORAGE_KEY = "cctv_guest_theme";

export function GuestLayout() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY) !== "light";
  });

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
  }

  return (
    <GuestThemeContext.Provider value={{ isDark, toggle }}>
      <div
        className={[
          "guest-mode",
          isDark ? "dark" : "",
          "flex flex-col h-screen overflow-hidden bg-surface-base",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <GuestTopBar />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
        <ToastContainer />
      </div>
    </GuestThemeContext.Provider>
  );
}
