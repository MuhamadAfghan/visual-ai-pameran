import type { ModulePermission, PermissionAction, PermissionModule } from "../../types/auth.types";

type ModuleDef = {
  key: PermissionModule;
  label: string;
  actions: { key: PermissionAction; label: string }[];
};

const MODULE_DEFS: ModuleDef[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    actions: [{ key: "view", label: "Lihat" }],
  },
  {
    key: "cameras",
    label: "Kamera",
    actions: [
      { key: "view",      label: "Lihat" },
      { key: "create",    label: "Tambah" },
      { key: "update",    label: "Edit" },
      { key: "delete",    label: "Hapus" },
      { key: "stream",    label: "Live Stream" },
      { key: "snapshot",  label: "Snapshot" },
      { key: "scheduler", label: "Scheduler" },
    ],
  },
  {
    key: "events",
    label: "Events & Deteksi",
    actions: [
      { key: "view",           label: "Lihat" },
      { key: "export",         label: "Export" },
      { key: "acknowledge",    label: "Acknowledge" },
      { key: "false_positive", label: "False Positive" },
      { key: "delete",         label: "Hapus" },
    ],
  },
  {
    key: "areas",
    label: "Area",
    actions: [
      { key: "view",   label: "Lihat" },
      { key: "create", label: "Tambah" },
      { key: "update", label: "Edit" },
      { key: "delete", label: "Hapus" },
    ],
  },
  {
    key: "sections",
    label: "Section",
    actions: [
      { key: "view",   label: "Lihat" },
      { key: "create", label: "Tambah" },
      { key: "update", label: "Edit" },
      { key: "delete", label: "Hapus" },
    ],
  },
  {
    key: "camera_mappings",
    label: "Camera Mapping",
    actions: [
      { key: "view",   label: "Lihat" },
      { key: "create", label: "Tambah" },
      { key: "update", label: "Edit" },
      { key: "delete", label: "Hapus" },
      { key: "toggle", label: "Toggle Aktif" },
    ],
  },
  {
    key: "ai_models",
    label: "AI Models",
    actions: [
      { key: "view",   label: "Lihat" },
      { key: "create", label: "Tambah" },
      { key: "update", label: "Edit" },
      { key: "delete", label: "Hapus" },
    ],
  },
  {
    key: "pics",
    label: "PIC Management",
    actions: [
      { key: "view",   label: "Lihat" },
      { key: "create", label: "Tambah" },
      { key: "update", label: "Edit" },
      { key: "delete", label: "Hapus" },
    ],
  },
  {
    key: "detection_jobs",
    label: "Detection Jobs",
    actions: [
      { key: "view",   label: "Lihat" },
      { key: "create", label: "Jalankan" },
    ],
  },
];

type Props = {
  value: ModulePermission[];
  onChange: (next: ModulePermission[]) => void;
  disabled?: boolean;
};

function getActions(perms: ModulePermission[], module: PermissionModule): PermissionAction[] {
  return perms.find((p) => p.module === module)?.actions ?? [];
}

function hasAction(perms: ModulePermission[], module: PermissionModule, action: PermissionAction): boolean {
  return getActions(perms, module).includes(action);
}

export function RolePermissionGrid({ value, onChange, disabled }: Props) {
  function toggle(module: PermissionModule, action: PermissionAction, checked: boolean) {
    const current = getActions(value, module);
    let next: PermissionAction[];

    if (checked) {
      next = [...new Set([...current, action])] as PermissionAction[];
      // view is prerequisite for all other actions
      if (action !== "view") {
        next = [...new Set([...next, "view" as PermissionAction])];
      }
    } else {
      next = current.filter((a) => a !== action);
      // unchecking view removes everything
      if (action === "view") {
        next = [];
      }
    }

    const without = value.filter((p) => p.module !== module);
    onChange(next.length > 0 ? [...without, { module, actions: next }] : without);
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {MODULE_DEFS.map((mod) => (
        <div
          key={mod.key}
          className="rounded-xl border border-surface-border bg-surface-elevated/40 p-4"
        >
          <p className="text-xs font-semibold tracking-wider uppercase text-content-muted mb-3">
            {mod.label}
          </p>
          <div className="space-y-2">
            {mod.actions.map((act) => {
              const checked = hasAction(value, mod.key, act.key);
              return (
                <label
                  key={act.key}
                  className="flex items-center gap-2.5 cursor-pointer select-none group"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => toggle(mod.key, act.key, e.target.checked)}
                    className="h-4 w-4 rounded border-surface-border text-primary focus:ring-primary disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <span className="text-sm text-content-secondary group-hover:text-content transition-colors">
                    {mod.key}:{act.key}
                  </span>
                  <span className="text-xs text-content-muted ml-auto">{act.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
