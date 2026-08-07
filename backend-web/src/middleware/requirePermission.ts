import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../errors/httpError";
import type { PermissionAction, PermissionModule } from "../types/auth";
import { DEFAULT_PERMISSIONS } from "../config/defaultPermissions";
import { getRolePermissions } from "../services/roleCache.service";
import type { Permission } from "../constants/permissions";

function parsePermission(perm: Permission): [PermissionModule, PermissionAction] {
  const idx = perm.indexOf(":");
  return [perm.slice(0, idx) as PermissionModule, perm.slice(idx + 1) as PermissionAction];
}

async function hasPermission(
  userId: string,
  userRole: string,
  roleId: string | undefined,
  module: PermissionModule,
  action: PermissionAction
): Promise<boolean> {
  if (userRole === "super_admin") return true;

  const perms = roleId
    ? await getRolePermissions(roleId)
    : (DEFAULT_PERMISSIONS[userRole as "admin" | "viewer" | "pic"] ?? []);

  return perms.find((p) => p.module === module)?.actions.includes(action) ?? false;
}

export function requirePermission(perms: Permission | Permission[]) {
  const list = Array.isArray(perms) ? perms : [perms];

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const user = req.user;

    if (!user) {
      next(new HttpError(401, "Unauthorized"));
      return;
    }

    for (const perm of list) {
      const [module, action] = parsePermission(perm);
      const allowed = await hasPermission(user.id, user.role, user.roleId, module, action);
      if (!allowed) {
        next(new HttpError(403, "Forbidden"));
        return;
      }
    }

    next();
  };
}
