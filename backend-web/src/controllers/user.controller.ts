import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../errors/httpError";
import { logAuditEvent } from "../services/audit.service";
import { createUser, deleteUser, getUserById, listUsers, setUserActivation, updateUser } from "../services/user.service";
import { sendSuccess } from "../utils/apiResponse";
import { idParamSchema } from "../utils/validation";

const createUserSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  role: z.enum(["super_admin", "admin", "viewer"]),
  isActive: z.boolean().optional(),
  roleId: z.string().optional(),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(["super_admin", "admin", "viewer"]).optional(),
  isActive: z.boolean().optional(),
  roleId: z.string().nullable().optional(),
});

const activationSchema = z.object({
  isActive: z.boolean()
});

export async function getUserByIdController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = await getUserById(id);
    if (!data) throw new HttpError(404, "User not found");
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function listUsersController(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await listUsers();
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function createUserController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = createUserSchema.parse(req.body);
    const data = await createUser(payload);
    if (!data) throw new HttpError(500, "Failed to create user");
    await logAuditEvent({
      actorUserId: req.user?.id,
      actorEmail: req.user?.email,
      action: "user.create",
      targetType: "user",
      targetId: data.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });
    sendSuccess(res, data, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateUserController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const payload = updateUserSchema.parse(req.body);
    const data = await updateUser(id, payload);
    if (!data) {
      throw new HttpError(404, "User not found");
    }
    await logAuditEvent({
      actorUserId: req.user?.id,
      actorEmail: req.user?.email,
      action: "user.update",
      targetType: "user",
      targetId: id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: payload
    });
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function deleteUserController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const data = await deleteUser(id);
    if (!data) {
      throw new HttpError(404, "User not found");
    }
    await logAuditEvent({
      actorUserId: req.user?.id,
      actorEmail: req.user?.email,
      action: "user.delete",
      targetType: "user",
      targetId: id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });
    sendSuccess(res, { message: "User deleted" });
  } catch (error) {
    next(error);
  }
}

export async function setUserActivationController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = idParamSchema.parse(req.params);
    const payload = activationSchema.parse(req.body);
    const data = await setUserActivation(id, payload.isActive);
    if (!data) {
      throw new HttpError(404, "User not found");
    }
    await logAuditEvent({
      actorUserId: req.user?.id,
      actorEmail: req.user?.email,
      action: "user.set_activation",
      targetType: "user",
      targetId: id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: payload
    });
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}
