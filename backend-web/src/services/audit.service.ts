import { AuditLogModel } from "../models/auditLog.model";

type AuditInput = {
  actorUserId?: string;
  actorEmail?: string;
  action: string;
  targetType: string;
  targetId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: unknown;
};

export async function logAuditEvent(input: AuditInput): Promise<void> {
  await AuditLogModel.create(input);
}

type ListAuditLogsFilter = {
  startDate?: Date;
  endDate?: Date;
  action?: string;
  actorEmail?: string;
  actorUserId?: string;
};

export async function listAuditLogs(filter: ListAuditLogsFilter) {
  const query: Record<string, unknown> = {};

  if (filter.action) query.action = filter.action;
  if (filter.actorEmail) query.actorEmail = { $regex: filter.actorEmail, $options: "i" };
  if (filter.actorUserId) query.actorUserId = filter.actorUserId;
  if (filter.startDate || filter.endDate) {
    query.createdAt = {};
    if (filter.startDate) (query.createdAt as Record<string, unknown>).$gte = filter.startDate;
    if (filter.endDate) (query.createdAt as Record<string, unknown>).$lte = filter.endDate;
  }

  return AuditLogModel.find(query).sort({ createdAt: -1 }).limit(500);
}
