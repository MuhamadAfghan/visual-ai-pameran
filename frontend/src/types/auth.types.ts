export type UserRole = "super_admin" | "admin" | "viewer" | "pic";

export type PermissionAction =
  | "view"
  | "create"
  | "update"
  | "delete"
  | "export"
  | "stream"
  | "snapshot"
  | "scheduler"
  | "acknowledge"
  | "false_positive"
  | "toggle";

export type PermissionModule =
  | "cameras"
  | "events"
  | "areas"
  | "sections"
  | "detection_jobs"
  | "camera_mappings"
  | "ai_models"
  | "pics"
  | "dashboard";

export type ModulePermission = {
  module: PermissionModule;
  actions: PermissionAction[];
};

export type AuthUser = {
  id: string;
  username?: string;
  name: string;
  email: string;
  role: UserRole;
  picId?: string;
  effectivePermissions?: ModulePermission[] | "all";
};
