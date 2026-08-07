import { z } from "zod";
import type { Request, Response, NextFunction } from "express";
import { HttpError } from "../errors/httpError";
import { changePassword, getMe, loginAsGuest, loginUser, requestPasswordReset, resetPassword, updateMe } from "../services/auth.service";
import { DEFAULT_PERMISSIONS } from "../config/defaultPermissions";
import { logAuditEvent } from "../services/audit.service";
import { sendSuccess } from "../utils/apiResponse";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional().default(false),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email()
});

const resetPasswordSchema = z.object({
  token: z.string().min(16),
  newPassword: z.string().min(8)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

const updateMeSchema = z.object({
  name: z.string().trim().min(1).optional()
});

export async function loginAsGuestController(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    sendSuccess(res, loginAsGuest());
  } catch (error) {
    next(error);
  }
}

export async function loginController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password, rememberMe } = loginSchema.parse(req.body);
    const result = await loginUser({ email, password, rememberMe });

    if (!result) {
      throw new HttpError(401, "Invalid credentials");
    }

    sendSuccess(res, result);
  } catch (error) {
    next(error);
  }
}

export async function forgotPasswordController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = forgotPasswordSchema.parse(req.body);
    await requestPasswordReset(payload.email);

    sendSuccess(res, {
      message: "If the account exists, a reset link has been sent."
    });
  } catch (error) {
    next(error);
  }
}

export async function resetPasswordController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = resetPasswordSchema.parse(req.body);
    const ok = await resetPassword(payload.token, payload.newPassword);

    if (!ok) {
      throw new HttpError(400, "Invalid or expired reset token");
    }

    await logAuditEvent({
      action: "auth.reset_password",
      targetType: "auth",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });

    sendSuccess(res, { message: "Password has been reset successfully." });
  } catch (error) {
    next(error);
  }
}

export async function getMeController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new HttpError(401, "Unauthorized");

    if (userId === "guest") {
      sendSuccess(res, {
        id: "guest",
        name: "Guest",
        email: "guest@lumicore.local",
        role: "viewer",
        effectivePermissions: DEFAULT_PERMISSIONS.viewer,
      });
      return;
    }

    const data = await getMe(userId);
    if (!data) throw new HttpError(404, "User not found");
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function updateMeController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) throw new HttpError(401, "Unauthorized");
    const payload = updateMeSchema.parse(req.body);
    const data = await updateMe(userId, payload);
    if (!data) throw new HttpError(404, "User not found");
    sendSuccess(res, data);
  } catch (error) {
    next(error);
  }
}

export async function changePasswordController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = changePasswordSchema.parse(req.body);
    const userId = req.user?.id;
    if (!userId) {
      throw new HttpError(401, "Unauthorized");
    }

    const ok = await changePassword(userId, payload.currentPassword, payload.newPassword);
    if (!ok) {
      throw new HttpError(400, "Current password is invalid");
    }

    await logAuditEvent({
      actorUserId: req.user?.id,
      actorEmail: req.user?.email,
      action: "auth.change_password",
      targetType: "user",
      targetId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"]
    });

    sendSuccess(res, { message: "Password changed successfully." });
  } catch (error) {
    next(error);
  }
}
