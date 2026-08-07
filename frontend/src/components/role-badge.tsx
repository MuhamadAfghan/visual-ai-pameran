import { cn } from "../utils/cn";
import type { UserRole } from "../types/auth.types";

type Props = {
  role: UserRole;
  roleName?: string;
};

const config: Record<UserRole, { label: string; className: string }> = {
  super_admin: {
    label: "Super Admin",
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  },
  admin: {
    label: "Admin",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  viewer: {
    label: "Viewer",
    className: "bg-surface-elevated text-content-secondary",
  },
  pic: {
    label: "PIC",
    className: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  },
};

export function RoleBadge({ role, roleName }: Props) {
  if (roleName) {
    return (
      <span
        className={cn(
          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
          "bg-orange-500/15 text-orange-400 ring-1 ring-orange-500/25"
        )}
      >
        {roleName}
      </span>
    );
  }

  const { label, className } = config[role];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        className
      )}
    >
      {label}
    </span>
  );
}
