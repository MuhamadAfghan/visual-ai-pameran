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
};

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
