import { cn } from "../utils/cn";

type Props = { className?: string };

export function LoadingSpinner({ className }: Props) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div className="w-6 h-6 border-2 border-surface-border border-t-primary rounded-full animate-spin" />
    </div>
  );
}
