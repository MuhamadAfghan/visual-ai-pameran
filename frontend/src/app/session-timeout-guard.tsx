import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./auth-provider";
import { useUiStore } from "../store/ui.store";

const CHECK_INTERVAL_MS = 60_000;   // check every minute
const WARN_BEFORE_MS    = 5 * 60_000; // warn 5 minutes before expiry

function decodeExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp * 1_000 : null;
  } catch {
    return null;
  }
}

export function SessionTimeoutGuard() {
  const { token, logout } = useAuth();
  const addToast = useUiStore((s) => s.addToast);
  const navigate = useNavigate();
  const warnedRef = useRef(false);

  useEffect(() => {
    if (!token) return;

    const expMs = decodeExp(token);
    if (!expMs) return;

    warnedRef.current = false;

    // Check immediately on mount / token change
    const check = () => {
      const msLeft = expMs - Date.now();

      if (msLeft <= 0) {
        addToast({ type: "info", message: "Sesi telah berakhir. Silakan login kembali." });
        logout();
        navigate("/login", { replace: true });
        return;
      }

      if (msLeft <= WARN_BEFORE_MS && !warnedRef.current) {
        warnedRef.current = true;
        const remaining = Math.max(1, Math.ceil(msLeft / 60_000));
        addToast({
          type: "info",
          message: `Sesi Anda akan berakhir dalam ${remaining} menit. Silakan login ulang.`,
        });
      }
    };

    check();

    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
