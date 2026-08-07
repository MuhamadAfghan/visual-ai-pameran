import bcrypt from "bcryptjs";
import crypto from "crypto";
import { env } from "../config/env";
import { UserModel } from "../models/user.model";
import { signAccessToken } from "../plugins/authToken";
import { sendPasswordResetEmail } from "../plugins/mail";
import { DEFAULT_PERMISSIONS } from "../config/defaultPermissions";
import { getRolePermissions } from "./roleCache.service";
import type { ModulePermission } from "../types/auth";

export function loginAsGuest() {
  const token = signAccessToken({
    sub: "guest",
    email: "guest@lumicore.local",
    role: "viewer"
  });
  return {
    token,
    user: { id: "guest", name: "Guest", email: "guest@lumicore.local", role: "viewer" as const }
  };
}

export async function loginUser(input: { email: string; password: string; rememberMe?: boolean }) {
  const user = await UserModel.findOne({ email: input.email });
  if (!user) {
    return null;
  }
  if (!user.isActive) {
    return null;
  }

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) {
    return null;
  }

  const expiresIn = input.rememberMe ? env.JWT_REMEMBER_ME_EXPIRES_IN : env.JWT_EXPIRES_IN;
  const picId = user.picId?.toString();
  const token = signAccessToken(
    { sub: user.id, email: user.email, role: user.role, ...(picId ? { picId } : {}) },
    expiresIn
  );

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      ...(picId ? { picId } : {})
    }
  };
}

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await UserModel.findOne({ email });
  if (!user || !user.isActive) {
    return;
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  user.passwordResetTokenHash = tokenHash;
  user.passwordResetExpiresAt = new Date(Date.now() + env.RESET_PASSWORD_TOKEN_TTL_MINUTES * 60 * 1000);
  await user.save();

  const resetUrl = `${env.APP_BASE_URL}/reset-password?token=${rawToken}`;
  await sendPasswordResetEmail(email, resetUrl);
}

export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const user = await UserModel.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetExpiresAt: { $gt: new Date() }
  });

  if (!user || !user.isActive) {
    return false;
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  await user.save();

  return true;
}

const SAFE_USER_PROJECTION = { passwordHash: 0, passwordResetTokenHash: 0, passwordResetExpiresAt: 0 };

export async function getMe(userId: string) {
  const user = await UserModel.findById(userId, SAFE_USER_PROJECTION).lean();
  if (!user) return null;

  let effectivePermissions: ModulePermission[] | "all";
  if (user.role === "super_admin") {
    effectivePermissions = "all";
  } else if (user.roleId) {
    effectivePermissions = await getRolePermissions(user.roleId.toString());
  } else {
    effectivePermissions = DEFAULT_PERMISSIONS[user.role as "admin" | "viewer" | "pic"] ?? [];
  }

  return { ...user, effectivePermissions };
}

export async function updateMe(userId: string, input: { name?: string }) {
  return UserModel.findByIdAndUpdate(userId, input, {
    new: true,
    projection: SAFE_USER_PROJECTION
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<boolean> {
  const user = await UserModel.findById(userId);
  if (!user || !user.isActive) {
    return false;
  }

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) {
    return false;
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  await user.save();
  return true;
}
