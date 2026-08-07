import { createContext, useContext } from "react";

export type GuestThemeCtx = { isDark: boolean; toggle: () => void };

export const GuestThemeContext = createContext<GuestThemeCtx>({
  isDark: true,
  toggle: () => {},
});

export const useGuestTheme = () => useContext(GuestThemeContext);
