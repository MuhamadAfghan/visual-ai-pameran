export function formatConfidence(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
}

export type ConfidenceLevel = "high" | "medium" | "low";

export function getConfidenceLevel(value: number | null | undefined): ConfidenceLevel {
  if (value == null || isNaN(value)) return "low";
  if (value >= 0.8) return "high";
  if (value >= 0.6) return "medium";
  return "low";
}
