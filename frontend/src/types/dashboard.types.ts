export type DashboardStats = {
  cameras: {
    total: number;
    active: number;
    online: number;
    offline: number;
  };
  events: {
    today: number;
    thisWeek: number;
    unacknowledged: number;
    violations: number;
    urgent?: number;
    acknowledgedToday?: number;
    ackRateToday?: number | null;
    urgentThresholdMinutes?: number;
  };
  topViolations: Array<{ checkName: string; count: number }>;
};

export type PicPerformance = {
  days: number;
  range: { from: string; to: string };
  totals: { events: number; acknowledged: number };
  ackRate: number | null;
  avgResponseMs: number | null;
  trend: { labels: string[]; data: number[] };
  delta: {
    ackRatePct: number | null;
    avgResponseMsPct: number | null;
    eventsPct: number | null;
  };
};

export type TrendData = {
  labels: string[];
  data: number[];
};

export type ByTypeData = Array<{ checkName: string; count: number }>;

export type ByCameraData = Array<{
  cameraId: string;
  cameraName: string;
  cameraCode: string;
  count: number;
}>;
