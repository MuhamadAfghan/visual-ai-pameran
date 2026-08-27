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
  | "toggle"
  | "capture";

export const PERMISSION_MODULES = [
  "cameras",
  "events",
  "areas",
  "sections",
  "detection_jobs",
  "camera_mappings",
  "ai_models",
  "pics",
  "dashboard",
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];

export type ModulePermission = {
  module: PermissionModule;
  actions: PermissionAction[];
};
