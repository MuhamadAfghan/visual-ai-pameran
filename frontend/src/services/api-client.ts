import axios, { type AxiosResponse } from "axios";

const TOKEN_KEY = "cctv_token";
const USER_KEY = "cctv_user";

// Read from sessionStorage first (persist=false login), fallback to localStorage (persist=true)
export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser<T>(): T | null {
  const raw = sessionStorage.getItem(USER_KEY) ?? localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearStoredAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export const apiClient = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL ?? ""}/api/v1`,
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config?.url?.includes("/auth/login")) {
      clearStoredAuth();
      window.location.href = "/login";
    }
    if (err.response?.data?.message) {
      err.message = err.response.data.message;
    }
    return Promise.reject(err);
  }
);

export function unwrap<T>(res: AxiosResponse<{ success: boolean; data: T }>): T {
  return res.data.data;
}
