import { apiClient, unwrap } from "./api-client";

export type SystemSettings = {
  smtp: {
    host: string;
    port: number;
    user: string;
    pass: string; // "••••" when masked
    from: string;
    tls: boolean;
  };
  retention: {
    dataDays: number;
    snapshotDays: number;
  };
  capture: {
    defaultInterval: number;
    defaultCooldown: number;
  };
  notification: {
    maxEmailsPerHour: number;
    cooldownMinutes: number;
  };
  storage?: {
    maxSizeGB: number;
  };
  violationAlert: {
    audioStyle: "beep" | "beep_speech";
    repeatMode: "cooldown" | "continuous";
    repeatIntervalSeconds: number;
  };
};

export type ViolationAlertConfig = SystemSettings["violationAlert"];

export type StorageStats = {
  usedBytes: number;
  usedGB: number;
  maxSizeGB: number;
  percentUsed: number;
};

export type SettingsPayload = Partial<{
  smtp: Partial<SystemSettings["smtp"]>;
  retention: Partial<SystemSettings["retention"]>;
  capture: Partial<SystemSettings["capture"]>;
  notification: Partial<SystemSettings["notification"]>;
  storage: Partial<NonNullable<SystemSettings["storage"]>>;
  violationAlert: Partial<SystemSettings["violationAlert"]>;
}>;

export async function getSettings(): Promise<SystemSettings> {
  const res = await apiClient.get<{ success: boolean; data: SystemSettings }>("/settings");
  return unwrap(res);
}

export async function updateSettings(payload: SettingsPayload): Promise<SystemSettings> {
  const res = await apiClient.put<{ success: boolean; data: SystemSettings }>("/settings", payload);
  return unwrap(res);
}

export async function testSmtp(to: string): Promise<{ message: string }> {
  const res = await apiClient.post<{ success: boolean; data: { message: string } }>(
    "/settings/smtp/test",
    { to }
  );
  return unwrap(res);
}

export async function runCleanup(): Promise<{ message: string; deleted: number }> {
  const res = await apiClient.post<{
    success: boolean;
    data: { message: string; deleted: number };
  }>("/settings/cleanup/run");
  return unwrap(res);
}

export async function getStorageStats(): Promise<StorageStats> {
  const res = await apiClient.get<{ success: boolean; data: StorageStats }>("/settings/storage/stats");
  return unwrap(res);
}

// Accessible to every authenticated role (not just super_admin) — the audio-alert
// feature runs app-wide, so it can't ride on the super_admin-only GET /settings.
export async function getViolationAlertConfig(): Promise<ViolationAlertConfig> {
  const res = await apiClient.get<{ success: boolean; data: ViolationAlertConfig }>(
    "/settings/violation-alert"
  );
  return unwrap(res);
}
