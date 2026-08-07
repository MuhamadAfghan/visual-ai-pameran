import type { UserRole } from "./auth.types";

export type RoleRef = { _id: string; name: string };

export type User = {
  _id: string;
  name: string;
  email: string;
  username?: string;
  role: UserRole;
  roleId?: RoleRef | string | null;
  isActive: boolean;
  lastLoginAt?: string;
  createdAt?: string;
};
