import { useAuth } from "../app/auth-provider";
import type { PermissionAction, PermissionModule } from "../types/auth.types";

export function usePermission() {
  const { user } = useAuth();

  if (user?.role === "super_admin" || user?.effectivePermissions === "all") {
    return {
      can: () => true,
      canView:   () => true,
      canCreate: () => true,
      canUpdate: () => true,
      canDelete: () => true,
    };
  }

  const perms = Array.isArray(user?.effectivePermissions) ? user.effectivePermissions : [];

  function can(module: PermissionModule, action: PermissionAction): boolean {
    const entry = perms.find((p) => p.module === module);
    return entry?.actions.includes(action) ?? false;
  }

  return {
    can,
    canView:   (m: PermissionModule) => can(m, "view"),
    canCreate: (m: PermissionModule) => can(m, "create"),
    canUpdate: (m: PermissionModule) => can(m, "update"),
    canDelete: (m: PermissionModule) => can(m, "delete"),
  };
}
