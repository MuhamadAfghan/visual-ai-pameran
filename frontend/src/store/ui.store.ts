import { create } from "zustand";

export type ToastType = "success" | "error" | "info";

export type Toast = {
  id: string;
  type: ToastType;
  message: string;
};

type UiState = {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Mobile off-canvas nav drawer (separate from the desktop collapse rail above).
  mobileNavOpen: boolean;
  openMobileNav: () => void;
  closeMobileNav: () => void;

  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;

  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
};

const savedTheme = localStorage.getItem("cctv_theme") as "light" | "dark" | null;
const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const initialTheme: "light" | "dark" = savedTheme ?? (systemDark ? "dark" : "light");
document.documentElement.classList.toggle("dark", initialTheme === "dark");

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  mobileNavOpen: false,
  openMobileNav: () => set({ mobileNavOpen: true }),
  closeMobileNav: () => set({ mobileNavOpen: false }),

  theme: initialTheme,
  setTheme: (theme) => {
    localStorage.setItem("cctv_theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
    set({ theme });
  },

  toasts: [],
  addToast: ({ type, message }) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, type, message }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
