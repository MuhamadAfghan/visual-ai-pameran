export type EventStatus = "unacknowledged" | "acknowledged" | "false_positive";

export type Detection = {
  label: string;
  confidence: number;
  bbox: [number, number, number, number];
  attributes?: Record<string, string>;
};

export type CheckResult = {
  check: string;
  confidence: number;
  isViolation: boolean;
};

export type RoiPoint = { x: number; y: number };

export type RedZone = { name: string; points: RoiPoint[] };

export type DetectionEvent = {
  _id: string;
  cameraId: string;
  cameraName?: string;
  cameraCode?: string;
  sectionName?: string;
  sectionCode?: string;
  areaName?: string;
  areaCode?: string;
  modelId?: string;
  modelName?: string;
  checkResults: CheckResult[];
  isViolation: boolean;
  status: EventStatus;
  snapshotPath?: string;
  snapshotUrl?: string;
  originalSnapshotUrl?: string;
  detections?: Detection[];
  redZones?: RedZone[];
  detectedAt: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
};

/** Max confidence from violation checks, fallback to max of all checks. */
export function getEventConfidence(checkResults: CheckResult[]): number | null {
  if (!checkResults?.length) return null;
  const violations = checkResults.filter((cr) => cr.isViolation);
  const pool = violations.length ? violations : checkResults;
  return Math.max(...pool.map((cr) => cr.confidence));
}

/** Primary check label: first violation check name, fallback to first check. */
export function getEventCheckLabel(checkResults: CheckResult[]): string {
  if (!checkResults?.length) return "—";
  const violation = checkResults.find((cr) => cr.isViolation);
  const name = (violation ?? checkResults[0]).check;
  return name.replace(/_/g, " ");
}

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type PaginatedResponse<T> = {
  items: T[];
  pagination: Pagination;
};
