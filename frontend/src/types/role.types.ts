import type { ModulePermission } from "./auth.types";

export type Role = {
  _id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  permissions: ModulePermission[];
  createdAt?: string;
  updatedAt?: string;
};
