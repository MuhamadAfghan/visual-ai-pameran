import { cn } from "../utils/cn";
import type { CameraStatus } from "../types/camera.types";

type Props = {
  status: CameraStatus;
  size?: "sm" | "md";
};

const colorMap: Record<CameraStatus, string> = {
  online: "bg-green-500",
  offline: "bg-red-500",
  maintenance: "bg-yellow-500"
};

export function StatusDot({ status, size = "md" }: Props) {
  return (
    <span
      className={cn(
        "inline-block rounded-full",
        colorMap[status],
        status === "online" && "animate-pulse",
        size === "sm" ? "w-2 h-2" : "w-2.5 h-2.5"
      )}
      title={status}
    />
  );
}
