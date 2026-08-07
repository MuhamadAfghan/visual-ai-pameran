import { apiClient, unwrap } from "./api-client";

export type AuditLog = {
  _id: string;
  actorUserId?: string;
  actorEmail?: string;
  action: string;
  targetType: string;
  targetId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
};

export type AuditFilters = {
  startDate?: string;
  endDate?: string;
  action?: string;
  actorEmail?: string;
};

export async function getAuditLogs(filters?: AuditFilters): Promise<AuditLog[]> {
  const q = new URLSearchParams();
  if (filters?.startDate) q.set("startDate", filters.startDate);
  if (filters?.endDate) q.set("endDate", filters.endDate);
  if (filters?.action) q.set("action", filters.action);
  if (filters?.actorEmail) q.set("actorEmail", filters.actorEmail);
  const res = await apiClient.get<{ success: boolean; data: AuditLog[] }>(
    `/audit-logs?${q}`
  );
  return unwrap(res);
}
