/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type { AuthUser } from "../types/auth.types";
import { apiClient, clearStoredAuth, getStoredToken, getStoredUser } from "../services/api-client";

const TOKEN_KEY = "cctv_token";
const USER_KEY = "cctv_user";

// Poll every 30 seconds to pick up permission changes made by super_admin
const PERMISSIONS_POLL_INTERVAL_MS = 30_000;

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  login: (user: AuthUser, token: string, persist?: boolean) => void;
  logout: () => void;
  updateUser: (updates: Partial<AuthUser>) => void;
  refreshPermissions: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Which storage holds the current session?
function activeStorage(): Storage {
  return sessionStorage.getItem(TOKEN_KEY) ? sessionStorage : localStorage;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser<AuthUser>());
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const applyPermissions = useCallback((effectivePermissions: AuthUser["effectivePermissions"]) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, effectivePermissions };
      activeStorage().setItem(USER_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const refreshPermissions = useCallback(async (): Promise<void> => {
    if (!tokenRef.current) return;
    try {
      const res = await apiClient.get<{
        success: boolean;
        data: AuthUser & { effectivePermissions?: AuthUser["effectivePermissions"] };
      }>("/auth/me");
      if (res.data?.success && res.data.data) {
        applyPermissions(res.data.data.effectivePermissions);
      }
    } catch {
      // silent — token may have expired; session guard handles logout
    }
  }, [applyPermissions]);

  // Refresh on mount
  useEffect(() => {
    if (token) refreshPermissions();
  }, [token, refreshPermissions]);

  // Poll every 30s so permission changes by super_admin propagate without requiring re-login
  useEffect(() => {
    if (!token) return;
    const id = setInterval(refreshPermissions, PERMISSIONS_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [token, refreshPermissions]);

  // Refresh immediately when user returns to the tab
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible" && tokenRef.current) {
        refreshPermissions();
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshPermissions]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      login: (nextUser, nextToken, persist = true) => {
        const store = persist ? localStorage : sessionStorage;
        const other = persist ? sessionStorage : localStorage;
        // clear the other storage to avoid stale data
        other.removeItem(TOKEN_KEY);
        other.removeItem(USER_KEY);
        setUser(nextUser);
        setToken(nextToken);
        store.setItem(USER_KEY, JSON.stringify(nextUser));
        store.setItem(TOKEN_KEY, nextToken);
      },
      logout: () => {
        setUser(null);
        setToken(null);
        clearStoredAuth();
      },
      updateUser: (updates) => {
        setUser((prev) => {
          if (!prev) return prev;
          const next = { ...prev, ...updates };
          activeStorage().setItem(USER_KEY, JSON.stringify(next));
          return next;
        });
      },
      refreshPermissions,
    }),
    [user, token, refreshPermissions]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
