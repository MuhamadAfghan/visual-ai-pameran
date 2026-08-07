import type { LucideIcon } from "lucide-react";

type Props = {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-surface-elevated mb-4">
        <Icon className="w-7 h-7 text-content-muted" />
      </div>
      <h3 className="text-base font-semibold text-content">{title}</h3>
      {description && <p className="text-sm text-content-secondary mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
