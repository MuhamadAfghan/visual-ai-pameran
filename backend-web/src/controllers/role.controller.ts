import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../errors/httpError";
import { logAuditEvent } from "../services/audit.service";
import { createRole, deleteRole, getRoleById, listRoles, updateRole } from "../services/role.service";
import { sendSuccess } from "../utils/apiResponse";
import { idParamSchema } from "../utils/validation";
import { PERMISSION_MODULES } from "../types/auth";

const permissionEntrySchema = z.object({
  module: z.enum(PERMISSION_MODULES),
  actions: z.array(z.enum([
    "view", "create", "update", "delete",
    "export", "stream", "snapshot", "scheduler",
    "acknowledge", "false_positive", "toggle",
  ])),
});

const createRoleSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  permissions: z.array(permissionEntrySchema),
});

const updateRoleSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  permissions: z.array(permissionEntrySchema).optional(),
});

export async function listRolesController(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await listRoles();
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function getRoleController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = await getRoleById(id);
    if (!data) throw new HttpError(404, "Role not found");
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function createRoleController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const payload = createRoleSchema.parse(req.body);
    const data = await createRole(payload);
    await logAuditEvent({
      actorUserId: req.user?.id,
      actorEmail: req.user?.email,
      action: "role.create",
      targetType: "role",
      targetId: data.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    sendSuccess(res, data, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateRoleController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const payload = updateRoleSchema.parse(req.body);
    const data = await updateRole(id, payload);
    await logAuditEvent({
      actorUserId: req.user?.id,
      actorEmail: req.user?.email,
      action: "role.update",
      targetType: "role",
      targetId: id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: payload,
    });
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function deleteRoleController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    await deleteRole(id);
    await logAuditEvent({
      actorUserId: req.user?.id,
      actorEmail: req.user?.email,
      action: "role.delete",
      targetType: "role",
      targetId: id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
    });
    sendSuccess(res, { message: "Role deleted" });
  } catch (error) {
    next(error);
  }
}
