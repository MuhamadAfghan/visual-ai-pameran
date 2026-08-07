import { cn } from "../utils/cn";

type Props = {
  className?: string;
  height?: string;
  width?: string;
};

export function Skeleton({ className, height, width }: Props) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-surface-elevated", className)}
      style={{ height, width }}
    />
  );
}
