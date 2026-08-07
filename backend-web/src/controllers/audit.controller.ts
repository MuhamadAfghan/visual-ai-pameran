import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { listAuditLogs } from "../services/audit.service";
import { sendSuccess } from "../utils/apiResponse";

const querySchema = z.object({
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  action: z.string().trim().min(1).optional(),
  actorEmail: z.string().trim().min(1).optional(),
  actorUserId: z.string().trim().min(1).optional()
});

export async function listAuditLogsController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = querySchema.parse(req.query);
    const data = await listAuditLogs(query);
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

