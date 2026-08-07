import { redis } from "../config/redis";
import { RoleModel } from "../models/role.model";
import { UserModel } from "../models/user.model";
import type { ModulePermission } from "../types/auth";

const ROLE_PERM_TTL = 300; // 5 minutes
const USER_ROLE_TTL = 3600; // 1 hour

export const rolePermKey = (roleId: string) => `role:${roleId}`;
export const userRoleKey = (userId: string) => `user_role:${userId}`;

export async function getRolePermissions(roleId: string): Promise<ModulePermission[]> {
  const cached = await redis.get(rolePermKey(roleId));
  if (cached) return JSON.parse(cached) as ModulePermission[];

  const role = await RoleModel.findById(roleId).lean();
  if (!role) return [];

  const perms = role.permissions as ModulePermission[];
  await redis.setex(rolePermKey(roleId), ROLE_PERM_TTL, JSON.stringify(perms));
  return perms;
}

export async function invalidateRolePermCache(roleId: string): Promise<void> {
  await redis.del(rolePermKey(roleId));
}

export async function getUserRoleId(userId: string): Promise<string | null> {
  const cached = await redis.get(userRoleKey(userId));
  if (cached !== null) return cached === "" ? null : cached;

  const user = await UserModel.findById(userId, { roleId: 1 }).lean();
  const roleId = user?.roleId?.toString() ?? null;

  await redis.setex(userRoleKey(userId), USER_ROLE_TTL, roleId ?? "");
  return roleId;
}

export async function setUserRoleCache(userId: string, roleId: string | null): Promise<void> {
  await redis.setex(userRoleKey(userId), USER_ROLE_TTL, roleId ?? "");
}

export async function invalidateUserRoleCache(userId: string): Promise<void> {
  await redis.del(userRoleKey(userId));
}
