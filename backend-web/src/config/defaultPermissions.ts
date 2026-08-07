import type { ModulePermission } from "../types/auth";

export const DEFAULT_PERMISSIONS: Record<"admin" | "viewer" | "pic", ModulePermission[]> = {
  admin: [
    { module: "dashboard",       actions: ["view"] },
    { module: "cameras",         actions: ["view", "create", "update", "stream", "snapshot", "scheduler"] },
    { module: "events",          actions: ["view", "export", "acknowledge", "false_positive", "delete"] },
    { module: "areas",           actions: ["view", "create", "update", "delete"] },
    { module: "sections",        actions: ["view", "create", "update", "delete"] },
    { module: "camera_mappings", actions: ["view", "create", "update", "delete", "toggle"] },
    { module: "ai_models",       actions: ["view", "create", "update"] },
    { module: "pics",            actions: ["view", "create", "update"] },
    { module: "detection_jobs",  actions: ["view", "create"] },
  ],
  viewer: [
    { module: "dashboard",       actions: ["view"] },
    { module: "cameras",         actions: ["view", "stream", "snapshot"] },
    { module: "events",          actions: ["view", "export"] },
    { module: "areas",           actions: ["view"] },
    { module: "sections",        actions: ["view"] },
    { module: "camera_mappings", actions: ["view"] },
    { module: "ai_models",       actions: ["view"] },
    { module: "detection_jobs",  actions: ["view"] },
  ],
  pic: [
    { module: "dashboard",       actions: ["view"] },
    { module: "cameras",         actions: ["view", "stream", "snapshot"] },
    { module: "events",          actions: ["view", "acknowledge", "false_positive"] },
    { module: "areas",           actions: ["view"] },
    { module: "sections",        actions: ["view"] },
  ],
};
