import { cn } from "../utils/cn";
import { formatConfidence, getConfidenceLevel } from "../utils/formatConfidence";

type Props = { value: number | null | undefined };

export function ConfidenceBadge({ value }: Props) {
  const level = getConfidenceLevel(value);
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        level === "high" && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
        level === "medium" &&
          "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
        level === "low" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      )}
    >
      {formatConfidence(value)}
    </span>
  );
}
